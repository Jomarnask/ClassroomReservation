-- ============================================================================
-- PUP-CRS: Schedule Manager migration
-- Run ONCE in the Supabase SQL Editor (safe to run again).
--
-- 1. room_schedules gets program_course / year_level / section (the class the
--    slot belongs to), created_by and updated_at.
-- 2. Schedules and reservations are Monday-Saturday only (Sunday excluded).
-- 3. A class cannot overlap another active class in the same room and day.
-- 4. Faculty can only read class schedules tagged to their own account (RLS).
-- 5. create_student_reservation(): blocks slots owned by another
--    program/year/section and auto-approves the student's own class slot.
-- 6. Students can no longer insert an already-approved reservation directly.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.room_schedules
    ADD COLUMN IF NOT EXISTS program_course TEXT,
    ADD COLUMN IF NOT EXISTS year_level SMALLINT,
    ADD COLUMN IF NOT EXISTS section SMALLINT,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill from the old free-text column, e.g. "BSIT 2-2" -> BSIT / 2 / 2.
-- Rows that do not match the pattern stay untagged until an admin edits them.
UPDATE public.room_schedules
SET program_course = btrim((parsed.m)[1]),
    year_level = (parsed.m)[2]::SMALLINT,
    section = (parsed.m)[3]::SMALLINT
FROM (
    SELECT schedule_id,
           regexp_match(course_section, '^\s*(.+?)\s+(\d+)\s*-\s*(\d+)\s*$') AS m
    FROM public.room_schedules
    WHERE program_course IS NULL
) parsed
WHERE public.room_schedules.schedule_id = parsed.schedule_id
  AND parsed.m IS NOT NULL;

-- Students store the program as the signup dropdown text, e.g.
-- "BS of Information Technology (BSIT)". Programs are compared by the short
-- code in brackets (BSIT); text without brackets is compared as written.
CREATE OR REPLACE FUNCTION public.program_key(p_program TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT LOWER(BTRIM(COALESCE(substring(p_program from '\(([^)]+)\)\s*$'), p_program)));
$$;

-- ---------------------------------------------------------------------------
-- 2. Monday-Saturday only
-- ---------------------------------------------------------------------------
-- Old Sunday classes are switched off (not deleted); the constraint only
-- checks new and changed rows (NOT VALID), so existing data never blocks it.
UPDATE public.room_schedules SET is_active = FALSE WHERE LOWER(day_of_week) = 'sunday';

ALTER TABLE public.room_schedules DROP CONSTRAINT IF EXISTS chk_schedule_mon_sat;
ALTER TABLE public.room_schedules
    ADD CONSTRAINT chk_schedule_mon_sat
    CHECK (LOWER(day_of_week) IN ('monday','tuesday','wednesday','thursday','friday','saturday'))
    NOT VALID;

ALTER TABLE public.room_reservations DROP CONSTRAINT IF EXISTS chk_reservation_mon_sat;
ALTER TABLE public.room_reservations
    ADD CONSTRAINT chk_reservation_mon_sat
    CHECK (status IN ('cancelled', 'rejected') OR EXTRACT(ISODOW FROM reservation_date) <> 7)
    NOT VALID;

-- ---------------------------------------------------------------------------
-- 3. No overlapping active classes in the same room + day
-- ---------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'exclude_schedule_overlap') THEN
        ALTER TABLE public.room_schedules
        ADD CONSTRAINT exclude_schedule_overlap
        EXCLUDE USING gist (
            room_id WITH =,
            (LOWER(day_of_week)) WITH =,
            tsrange(
                ('2000-01-01'::date + start_time),
                ('2000-01-01'::date + end_time)
            ) WITH &&
        )
        WHERE (is_active);
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'exclude_schedule_overlap NOT created (existing classes overlap?): %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_schedules_faculty ON public.room_schedules(faculty_id);
CREATE INDEX IF NOT EXISTS idx_schedules_class ON public.room_schedules(program_course, year_level, section);

-- ---------------------------------------------------------------------------
-- 4. Faculty only see class schedules tagged to them (RLS)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT role::TEXT FROM public.users WHERE user_id = auth.uid();
$$;

DROP POLICY IF EXISTS "Anyone authenticated can view room schedules" ON public.room_schedules;
CREATE POLICY "Anyone authenticated can view room schedules"
    ON public.room_schedules FOR SELECT
    TO authenticated
    USING (
        is_active = true
        AND (
            public.current_user_role() IS DISTINCT FROM 'faculty'
            OR faculty_id = auth.uid()
        )
    );

-- ---------------------------------------------------------------------------
-- 6. Students can only insert PENDING rows directly (no self-approval)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Active students can submit reservations" ON public.room_reservations;
CREATE POLICY "Active students can submit reservations"
    ON public.room_reservations FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = student_id
        AND status = 'pending'
        AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.user_id = auth.uid() AND u.account_status = 'active'
        )
    );

-- ---------------------------------------------------------------------------
-- 5. Reservation creation with class matching
--    * slot overlaps a class of ANOTHER program/year/section -> error (409)
--    * request lies completely inside the student's OWN class time
--                                                            -> auto-approved
--    * request is free, or only partly inside the own class  -> pending (admin)
--    The student always has to reserve manually: a class never creates a
--    reservation by itself, so a cancelled class leaves no booking behind.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_student_reservation(
    p_room_id INTEGER,
    p_faculty_id UUID,
    p_subject VARCHAR,
    p_date DATE,
    p_start TIME WITHOUT TIME ZONE,
    p_end TIME WITHOUT TIME ZONE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_me RECORD;
    v_class RECORD;
    v_day TEXT;
    v_covered_until TIME := p_start;
    v_within BOOLEAN := FALSE;
    v_class_faculty UUID;
    v_status reservation_status_type := 'pending';
    v_id INTEGER;
    v_rejected INTEGER := 0;
BEGIN
    SELECT role::TEXT AS role, account_status::TEXT AS account_status,
           program_course, year_level, section
    INTO v_me
    FROM public.users
    WHERE user_id = v_uid;

    IF NOT FOUND OR v_me.role <> 'student' OR v_me.account_status <> 'active' THEN
        RAISE EXCEPTION 'Only active students can submit reservation requests.';
    END IF;

    IF EXTRACT(ISODOW FROM p_date) = 7 THEN
        RAISE EXCEPTION 'Reservations are available Monday to Saturday only.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE room_id = p_room_id AND is_active) THEN
        RAISE EXCEPTION 'This room is not available for reservations.';
    END IF;

    v_day := (ARRAY['monday','tuesday','wednesday','thursday','friday','saturday'])
             [EXTRACT(ISODOW FROM p_date)::INT];

    FOR v_class IN
        SELECT s.program_course, s.year_level, s.section, s.subject_title,
               s.start_time, s.end_time, s.faculty_id,
               COALESCE(
                   public.program_key(s.program_course) = public.program_key(v_me.program_course)
                   AND s.year_level = v_me.year_level
                   AND s.section = v_me.section,
                   FALSE
               ) AS is_match
        FROM public.room_schedules s
        WHERE s.room_id = p_room_id
          AND s.is_active
          AND LOWER(s.day_of_week) = v_day
          AND s.start_time < p_end
          AND s.end_time > p_start
        ORDER BY s.start_time
    LOOP
        IF NOT v_class.is_match THEN
            RAISE EXCEPTION 'Class schedule conflict: this slot is assigned to % (%) from % to %. Only that class can reserve it.',
                COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', v_class.program_course,
                    CASE WHEN v_class.year_level IS NOT NULL
                         THEN v_class.year_level::TEXT || '-' || COALESCE(v_class.section::TEXT, '?') END)), ''),
                    'another class'),
                v_class.subject_title,
                to_char(v_class.start_time, 'HH24:MI'),
                to_char(v_class.end_time, 'HH24:MI');
        END IF;
        -- Own classes are read in time order: how far do they cover the request?
        IF v_class.start_time <= v_covered_until THEN
            v_covered_until := GREATEST(v_covered_until, v_class.end_time);
        END IF;

        -- The teacher the admin assigned to the first own class that overlaps the request
        IF v_class_faculty IS NULL AND v_class.faculty_id IS NOT NULL THEN
            v_class_faculty := v_class.faculty_id;
        END IF;
    END LOOP;

    v_within := v_covered_until >= p_end;

    -- Reserving in your own class time: the class teacher is tagged automatically and
    -- the student cannot change it (whatever faculty was sent is replaced).
    IF v_class_faculty IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.users
        WHERE user_id = v_class_faculty AND role = 'faculty' AND account_status = 'active'
    ) THEN
        p_faculty_id := v_class_faculty;
    END IF;

    IF v_within THEN
        v_status := 'approved';

        IF EXISTS (
            SELECT 1 FROM public.room_reservations
            WHERE room_id = p_room_id
              AND reservation_date = p_date
              AND status = 'approved'
              AND start_time < p_end AND end_time > p_start
        ) THEN
            RAISE EXCEPTION 'This time overlaps an approved reservation.';
        END IF;
    END IF;

    INSERT INTO public.room_reservations (
        room_id, student_id, faculty_id, subject,
        reservation_date, start_time, end_time,
        status, responded_at, admin_remarks
    ) VALUES (
        p_room_id, v_uid, p_faculty_id, p_subject,
        p_date, p_start, p_end,
        v_status,
        CASE WHEN v_within THEN now() END,
        CASE WHEN v_within THEN 'Auto-approved: reserved inside the student''s own class schedule.' END
    )
    RETURNING reservation_id INTO v_id;

    -- Same housekeeping decide_reservation() does when an admin approves
    IF v_within THEN
        WITH competing AS (
            UPDATE public.room_reservations
            SET status = 'rejected',
                responded_at = now(),
                admin_remarks = 'Auto-rejected: Slot booked by another approved reservation.'
            WHERE room_id = p_room_id
              AND reservation_date = p_date
              AND status = 'pending'
              AND reservation_id <> v_id
              AND start_time < p_end AND end_time > p_start
            RETURNING reservation_id
        )
        SELECT COUNT(*) INTO v_rejected FROM competing;
    END IF;

    RETURN jsonb_build_object(
        'reservation_id', v_id,
        'status', v_status::TEXT,
        'auto_approved', v_within,
        'auto_rejected_competing_count', v_rejected
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_student_reservation(INTEGER, UUID, VARCHAR, DATE, TIME, TIME) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_student_reservation(INTEGER, UUID, VARCHAR, DATE, TIME, TIME) TO authenticated;