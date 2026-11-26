-- ============================================================================
-- PUP-CRS: Admin booking for a class (program + year level + section)
-- Run ONCE in the Supabase SQL Editor, AFTER admin_booking.sql (safe to run again).
--
-- What it does
--   1. room_reservations gets program_course, year_level and section, so an
--      admin booking can be assigned to a class (students are matched by the
--      same program + year + section as Schedule Manager).
--   2. Students of that class can READ (not change) the reservation.
--   3. admin_create_reservation() now requires the class.
--   4. The audit log and the notifications mention the class, and every active
--      student of the class is notified.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columns (all three set together, or all three empty)
-- ---------------------------------------------------------------------------
ALTER TABLE public.room_reservations
    ADD COLUMN IF NOT EXISTS program_course TEXT,
    ADD COLUMN IF NOT EXISTS year_level SMALLINT,
    ADD COLUMN IF NOT EXISTS section SMALLINT;

ALTER TABLE public.room_reservations DROP CONSTRAINT IF EXISTS chk_reservation_class;
ALTER TABLE public.room_reservations
    ADD CONSTRAINT chk_reservation_class CHECK (
        (program_course IS NULL AND year_level IS NULL AND section IS NULL)
        OR (program_course IS NOT NULL AND year_level IS NOT NULL AND section IS NOT NULL)
    );

-- Earlier admin bookings carried a remark that students would see as a "reason"
UPDATE public.room_reservations
SET admin_remarks = NULL
WHERE admin_remarks = 'Booked directly by an administrator';

-- ---------------------------------------------------------------------------
-- 2. Students of the class can read the reservation (read-only)
--    A helper function keeps the policy simple and avoids RLS loops.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_in_class(p_program TEXT, p_year SMALLINT, p_section SMALLINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT p_program IS NOT NULL AND p_year IS NOT NULL AND p_section IS NOT NULL
       AND EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.user_id = auth.uid()
              AND u.role = 'student'
              AND u.account_status = 'active'
              AND u.year_level = p_year
              AND u.section = p_section
              AND public.program_key(u.program_course) = public.program_key(p_program)
       );
$$;

REVOKE ALL ON FUNCTION public.student_in_class(TEXT, SMALLINT, SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_in_class(TEXT, SMALLINT, SMALLINT) TO authenticated;

DROP POLICY IF EXISTS "Students can view reservations booked for their class" ON public.room_reservations;
CREATE POLICY "Students can view reservations booked for their class"
    ON public.room_reservations
    FOR SELECT
    TO authenticated
    USING (public.student_in_class(program_course, year_level, section));

-- ---------------------------------------------------------------------------
-- 3. admin_create_reservation() with the class (replaces the 6-argument version)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_create_reservation(INTEGER, UUID, VARCHAR, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE);

CREATE OR REPLACE FUNCTION public.admin_create_reservation(
    p_room_id INTEGER,
    p_faculty_id UUID,
    p_subject VARCHAR,
    p_date DATE,
    p_start TIME WITHOUT TIME ZONE,
    p_end TIME WITHOUT TIME ZONE,
    p_program TEXT,
    p_year SMALLINT,
    p_section SMALLINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin UUID := auth.uid();
    v_now TIMESTAMP := date_trunc('minute', now() AT TIME ZONE 'Asia/Manila');
    v_subject TEXT := BTRIM(COALESCE(p_subject, ''));
    v_program TEXT := BTRIM(COALESCE(p_program, ''));
    v_id INTEGER;
    v_rejected INTEGER := 0;
    v_overridden INTEGER := 0;
BEGIN
    IF v_admin IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE user_id = v_admin AND role = 'admin' AND account_status = 'active'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: only active administrators can book rooms directly.';
    END IF;

    IF v_subject = '' OR char_length(v_subject) > 150 THEN
        RAISE EXCEPTION 'Subject is required and must not exceed 150 characters.';
    END IF;

    IF v_program = '' OR char_length(v_program) > 50 THEN
        RAISE EXCEPTION 'The student program is required (max 50 characters).';
    END IF;

    IF p_year IS NULL OR p_year < 1 OR p_year > 6 THEN
        RAISE EXCEPTION 'The year level must be a number from 1 to 6.';
    END IF;

    IF p_section IS NULL OR p_section < 1 OR p_section > 99 THEN
        RAISE EXCEPTION 'The section must be a number from 1 to 99.';
    END IF;

    IF EXTRACT(ISODOW FROM p_date) = 7 THEN
        RAISE EXCEPTION 'Reservations are available Monday to Saturday only.';
    END IF;

    IF p_start >= p_end THEN
        RAISE EXCEPTION 'Start time must be earlier than end time.';
    END IF;

    IF p_start < TIME '07:00' OR p_end > TIME '21:00' THEN
        RAISE EXCEPTION 'Reservations are only allowed between 07:00 and 21:00.';
    END IF;

    IF (p_date + p_start) < v_now THEN
        RAISE EXCEPTION 'The start time has already passed.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE room_id = p_room_id AND is_active) THEN
        RAISE EXCEPTION 'This room is not available for reservations.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.users
        WHERE user_id = p_faculty_id AND role = 'faculty' AND account_status = 'active'
    ) THEN
        RAISE EXCEPTION 'The selected faculty member is not available.';
    END IF;

    -- Block only if the overlapping approved booking belongs to another administrator
    IF EXISTS (
        SELECT 1 FROM public.room_reservations r
        JOIN public.users u ON u.user_id = r.student_id
        WHERE r.room_id = p_room_id
          AND r.reservation_date = p_date
          AND r.status = 'approved'
          AND u.role = 'admin'
          AND p_start < r.end_time AND p_end > r.start_time
    ) THEN
        RAISE EXCEPTION 'Cannot book: this time overlaps an already approved administrator booking.';
    END IF;

    -- 1. OVERRIDE approved student reservations FIRST so that the table's
    -- exclusion constraint (exclude_approved_reservation_overlap) is not violated
    UPDATE public.room_reservations r
    SET status = 'rejected',
        admin_id = v_admin,
        responded_at = now(),
        admin_remarks = 'Overridden by Administrator booking (' || v_subject || ').'
    FROM public.users u
    WHERE r.student_id = u.user_id
      AND u.role = 'student'
      AND r.room_id = p_room_id
      AND r.reservation_date = p_date
      AND r.status = 'approved'
      AND p_start < r.end_time AND p_end > r.start_time;

    GET DIAGNOSTICS v_overridden = ROW_COUNT;

    -- 2. Insert the new approved admin reservation
    INSERT INTO public.room_reservations (
        room_id, student_id, faculty_id, subject,
        reservation_date, start_time, end_time,
        status, admin_id, responded_at,
        program_course, year_level, section
    ) VALUES (
        p_room_id, v_admin, p_faculty_id, v_subject,
        p_date, p_start, p_end,
        'approved', v_admin, now(),
        v_program, p_year, p_section
    )
    RETURNING reservation_id INTO v_id;

    -- 3. Competing pending student requests for the same room and time are rejected
    UPDATE public.room_reservations
    SET status = 'rejected',
        admin_id = v_admin,
        responded_at = now(),
        admin_remarks = 'Auto-rejected: Slot booked by an approved administrator reservation.'
    WHERE room_id = p_room_id
      AND reservation_date = p_date
      AND status = 'pending'
      AND reservation_id <> v_id
      AND p_start < end_time AND p_end > start_time;

    GET DIAGNOSTICS v_rejected = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'reservation_id', v_id,
        'status', 'approved',
        'auto_rejected_competing_count', v_rejected,
        'overridden_approved_count', v_overridden
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_reservation(INTEGER, UUID, VARCHAR, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT, SMALLINT, SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_reservation(INTEGER, UUID, VARCHAR, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE, TEXT, SMALLINT, SMALLINT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4a. Audit log: "Admin booked reservation #41 ... for BSIT 3-1 with Prof. X"
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_on_reservation_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student RECORD;
    v_faculty TEXT;
    v_class TEXT;
    v_by_admin BOOLEAN;
    v_when TEXT;
BEGIN
    BEGIN
        v_by_admin := NEW.admin_id IS NOT NULL AND NEW.admin_id = NEW.student_id;

        v_when := to_char(NEW.reservation_date, 'Mon DD, YYYY') || ', '
                  || to_char(NEW.start_time, 'HH12:MI AM') || ' - ' || to_char(NEW.end_time, 'HH12:MI AM');

        IF v_by_admin THEN
            SELECT full_name INTO v_faculty FROM public.users WHERE user_id = NEW.faculty_id;
            v_class := public.class_label(NEW.program_course, NEW.year_level, NEW.section);

            PERFORM public.write_audit_log(
                'RESERVATION', 'RESERVATION_ADMIN_BOOKED', public.room_label(NEW.room_id),
                'Admin booked reservation #' || NEW.reservation_id || ' (' || NEW.subject || ') for ' || v_when
                    || COALESCE(' for class ' || v_class, '')
                    || COALESCE(' with ' || v_faculty, '')
                    || '. It was approved immediately because an administrator created it.',
                'APPROVED',
                v_faculty,
                COALESCE(v_class, CASE WHEN v_faculty IS NOT NULL THEN 'Faculty' END)
            );
        ELSE
            SELECT full_name, program_course, year_level, section INTO v_student
            FROM public.users WHERE user_id = NEW.student_id;

            PERFORM public.write_audit_log(
                'RESERVATION', 'RESERVATION_AUTO_APPROVED', public.room_label(NEW.room_id),
                'Auto-approved reservation #' || NEW.reservation_id || ' (' || NEW.subject || ') for ' || v_when
                    || '. It is inside the student''s own class schedule, so no admin approval was needed.',
                'APPROVED',
                v_student.full_name,
                public.class_label(v_student.program_course, v_student.year_level, v_student.section)
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'audit_on_reservation_created failed: %', SQLERRM;
        PERFORM public.audit_log_failure('RESERVATION', 'RESERVATION_CREATED', SQLERRM);
    END;
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4b. Notifications: tagged faculty, other admins, and every active student of the class
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_reservation_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student TEXT;
    v_room TEXT;
    v_when TEXT;
    v_by_admin BOOLEAN;
    v_class TEXT;
    v_classmate RECORD;
BEGIN
    BEGIN
        v_by_admin := NEW.admin_id IS NOT NULL AND NEW.admin_id = NEW.student_id;

        SELECT full_name INTO v_student FROM public.users WHERE user_id = NEW.student_id;
        SELECT 'Room ' || room_number INTO v_room FROM public.rooms WHERE room_id = NEW.room_id;

        v_student := COALESCE(v_student, 'A student');
        v_room := COALESCE(v_room, 'a room');
        v_when := to_char(NEW.reservation_date, 'Mon DD, YYYY') || ', '
                  || to_char(NEW.start_time, 'HH12:MI AM') || ' - ' || to_char(NEW.end_time, 'HH12:MI AM');

        PERFORM public.notify_admins(
            'reservation_created',
            'New room reservation',
            v_student || ' reserved ' || v_room || ' on ' || v_when || ' (' || NEW.subject || ').'
                || CASE WHEN NEW.status = 'approved'
                        THEN CASE WHEN v_by_admin
                                  THEN ' Booked directly by an administrator.'
                                  ELSE ' Auto-approved: it is inside their class schedule.' END
                        ELSE '' END,
            'all-reservations.html',
            NEW.reservation_id,
            CASE WHEN v_by_admin THEN NEW.admin_id ELSE NULL END
        );

        IF NEW.faculty_id IS NOT NULL THEN
            PERFORM public.push_notification(
                NEW.faculty_id,
                'faculty_tagged',
                'You were tagged in a reservation',
                v_student || ' tagged you in a reservation for ' || v_room || ' on ' || v_when || ' (' || NEW.subject || ').',
                'schedule.html',
                NEW.reservation_id
            );
        END IF;

        -- A room was booked for a class: tell the students of that class
        IF v_by_admin AND NEW.program_course IS NOT NULL THEN
            v_class := public.class_label(NEW.program_course, NEW.year_level, NEW.section);

            FOR v_classmate IN
                SELECT user_id FROM public.users
                WHERE role = 'student'
                  AND account_status = 'active'
                  AND year_level = NEW.year_level
                  AND section = NEW.section
                  AND public.program_key(program_course) = public.program_key(NEW.program_course)
            LOOP
                PERFORM public.push_notification(
                    v_classmate.user_id,
                    'class_reservation',
                    'Room booked for your class',
                    v_room || ' was booked for ' || COALESCE(v_class, 'your class') || ' on ' || v_when || ' (' || NEW.subject || ').',
                    'my-reservations.html',
                    NEW.reservation_id
                );
            END LOOP;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_on_reservation_created failed: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Faculty schedule: show the booked class (same columns as before)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_faculty_schedule_reservations()
RETURNS TABLE (
    reservation_id INTEGER,
    room_id INTEGER,
    room_number TEXT,
    room_name TEXT,
    student_id UUID,
    student_name TEXT,
    program_course TEXT,
    year_level SMALLINT,
    section SMALLINT,
    subject VARCHAR(150),
    reservation_date DATE,
    start_time TIME WITHOUT TIME ZONE,
    end_time TIME WITHOUT TIME ZONE,
    status reservation_status_type,
    admin_remarks TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.users me
        WHERE me.user_id = auth.uid()
          AND me.role = 'faculty'
          AND me.account_status = 'active'
    ) THEN
        RAISE EXCEPTION 'Only active faculty can view the tagged schedule.';
    END IF;

    RETURN QUERY
    SELECT
        r.reservation_id,
        r.room_id,
        rm.room_number,
        rm.room_name,
        r.student_id,
        COALESCE(s.full_name, 'Student'),
        COALESCE(r.program_course, s.program_course),
        COALESCE(r.year_level, s.year_level),
        COALESCE(r.section, s.section),
        r.subject,
        r.reservation_date,
        r.start_time,
        r.end_time,
        r.status,
        r.admin_remarks,
        r.created_at
    FROM public.room_reservations r
    LEFT JOIN public.rooms rm ON rm.room_id = r.room_id
    LEFT JOIN public.users s ON s.user_id = r.student_id
    WHERE r.faculty_id = auth.uid()
    ORDER BY r.reservation_date ASC, r.start_time ASC, r.reservation_id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_faculty_schedule_reservations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_faculty_schedule_reservations() TO authenticated;