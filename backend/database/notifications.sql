-- ============================================================================
-- PUP-CRS: Notification bell
-- Run ONCE in the Supabase SQL Editor (safe to run again).
-- Run schedule_manager.sql first (this file reuses its program_key()).
--
-- The database creates every notification by itself with triggers, so it works
-- no matter which screen or API call caused the change:
--
--   Student  reservation approved / declined / cancelled      -> my-reservations.html
--            admin adds / updates / deletes their class        -> my-reservations.html
--   Faculty  tagged by a student in a reservation              -> schedule.html
--            tagged reservation approved / declined / cancelled-> schedule.html
--            admin adds / updates / deletes their class        -> schedule.html
--   Admin    new account waiting for approval                  -> user-approvals.html
--            a student reserves a room                         -> all-reservations.html
--
-- A failing notification never blocks the real action (every trigger catches
-- its own errors and only writes a warning to the Postgres log).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    notification_id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'general',
    title TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    link_url TEXT,
    reservation_id INTEGER,   -- no foreign keys: a notice must outlive a deleted row
    schedule_id INTEGER,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- In case a notifications table already existed with fewer columns
ALTER TABLE public.notifications
    ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS link_url TEXT,
    ADD COLUMN IF NOT EXISTS reservation_id INTEGER,
    ADD COLUMN IF NOT EXISTS schedule_id INTEGER,
    ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON public.notifications (user_id, is_read, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Row Level Security: everybody sees and updates only their own notices
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users mark own notifications read" ON public.notifications;
CREATE POLICY "Users mark own notifications read"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- There is no INSERT policy on purpose: only the triggers below create notices.
-- Users may read them and flip is_read / read_at, nothing else.
REVOKE ALL ON public.notifications FROM anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (is_read, read_at) ON public.notifications TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Helpers (not callable by users)
-- ---------------------------------------------------------------------------
-- Same rule as schedule_manager.sql: compare programs by the short code in brackets.
CREATE OR REPLACE FUNCTION public.program_key(p_program TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT LOWER(BTRIM(COALESCE(substring(p_program from '\(([^)]+)\)\s*$'), p_program)));
$$;

CREATE OR REPLACE FUNCTION public.push_notification(
    p_user_id UUID,
    p_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_link TEXT,
    p_reservation_id INTEGER DEFAULT NULL,
    p_schedule_id INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO public.notifications (user_id, type, title, message, link_url, reservation_id, schedule_id)
    VALUES (p_user_id, p_type, p_title, p_message, p_link, p_reservation_id, p_schedule_id);
$$;

CREATE OR REPLACE FUNCTION public.notify_admins(
    p_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_link TEXT,
    p_reservation_id INTEGER DEFAULT NULL,
    p_exclude UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin RECORD;
BEGIN
    FOR v_admin IN
        SELECT user_id FROM public.users
        WHERE role = 'admin' AND account_status = 'active'
          AND (p_exclude IS NULL OR user_id <> p_exclude)
    LOOP
        PERFORM public.push_notification(v_admin.user_id, p_type, p_title, p_message, p_link, p_reservation_id, NULL);
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.push_notification(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_admins(TEXT, TEXT, TEXT, TEXT, INTEGER, UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Admin: a new account needs approval  ->  user-approvals.html
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    BEGIN
        PERFORM public.notify_admins(
            'new_user',
            'New account awaiting approval',
            NEW.full_name || ' (' || NEW.role::TEXT || ') registered with ' || NEW.pup_webmail || ' and needs approval.',
            'user-approvals.html',
            NULL,
            NEW.user_id
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_on_new_user failed: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_new_user ON public.users;
CREATE TRIGGER notify_new_user
    AFTER INSERT ON public.users
    FOR EACH ROW
    WHEN (NEW.account_status = 'pending')
    EXECUTE FUNCTION public.notify_on_new_user();

-- ---------------------------------------------------------------------------
-- 5. A student reserves a room
--      Admin   -> all-reservations.html
--      Faculty -> schedule.html (only when tagged)
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
BEGIN
    BEGIN
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
                        THEN ' Auto-approved: it is inside their class schedule.' ELSE '' END,
            'all-reservations.html',
            NEW.reservation_id,
            NULL
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
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_on_reservation_created failed: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_reservation_created ON public.room_reservations;
CREATE TRIGGER notify_reservation_created
    AFTER INSERT ON public.room_reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_on_reservation_created();

-- ---------------------------------------------------------------------------
-- 6. A reservation is approved / declined / cancelled
--      Student -> my-reservations.html (not when the student cancelled it themself)
--      Faculty -> schedule.html (only the tagged faculty)
--    Competing requests that decide_reservation() auto-rejects are covered too.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_reservation_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student TEXT;
    v_room TEXT;
    v_when TEXT;
    v_label TEXT;
    v_reason TEXT := '';
BEGIN
    BEGIN
        v_label := CASE NEW.status::TEXT
                       WHEN 'approved' THEN 'approved'
                       WHEN 'rejected' THEN 'declined'
                       ELSE 'cancelled'
                   END;

        SELECT full_name INTO v_student FROM public.users WHERE user_id = NEW.student_id;
        SELECT 'Room ' || room_number INTO v_room FROM public.rooms WHERE room_id = NEW.room_id;

        v_student := COALESCE(v_student, 'A student');
        v_room := COALESCE(v_room, 'a room');
        v_when := to_char(NEW.reservation_date, 'Mon DD, YYYY') || ', '
                  || to_char(NEW.start_time, 'HH12:MI AM') || ' - ' || to_char(NEW.end_time, 'HH12:MI AM');

        IF NEW.status = 'rejected' AND COALESCE(NEW.admin_remarks, '') <> '' THEN
            v_reason := ' Reason: ' || NEW.admin_remarks;
        END IF;

        -- The student does not need a notice about a cancellation they just made
        IF NOT (NEW.status = 'cancelled' AND auth.uid() IS NOT DISTINCT FROM NEW.student_id) THEN
            PERFORM public.push_notification(
                NEW.student_id,
                'reservation_' || v_label,
                'Reservation ' || v_label,
                'Your reservation for ' || v_room || ' on ' || v_when || ' (' || NEW.subject || ') was ' || v_label || '.' || v_reason,
                'my-reservations.html',
                NEW.reservation_id
            );
        END IF;

        IF NEW.faculty_id IS NOT NULL THEN
            PERFORM public.push_notification(
                NEW.faculty_id,
                'faculty_reservation_' || v_label,
                'Tagged reservation ' || v_label,
                v_student || '''s reservation for ' || v_room || ' on ' || v_when || ' (' || NEW.subject || ') was ' || v_label || '.',
                'schedule.html',
                NEW.reservation_id
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_on_reservation_status failed: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_reservation_status ON public.room_reservations;
CREATE TRIGGER notify_reservation_status
    AFTER UPDATE OF status ON public.room_reservations
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status
          AND NEW.status IN ('approved', 'rejected', 'cancelled'))
    EXECUTE FUNCTION public.notify_on_reservation_status();

-- ---------------------------------------------------------------------------
-- 7. The admin adds / updates / deletes a class schedule
--      Students of that program + year + section -> my-reservations.html
--      The tagged faculty                         -> schedule.html
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_schedule_students(p public.room_schedules, p_action TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room TEXT;
    v_text TEXT;
    v_student RECORD;
BEGIN
    IF p.program_course IS NULL OR p.year_level IS NULL OR p.section IS NULL THEN
        RETURN; -- untagged class: nobody can be matched to it
    END IF;

    SELECT 'Room ' || room_number INTO v_room FROM public.rooms WHERE room_id = p.room_id;

    v_text := 'Your class schedule was ' || p_action || ': ' || p.subject_title || ', '
              || p.day_of_week || ' ' || to_char(p.start_time, 'HH12:MI AM') || ' - '
              || to_char(p.end_time, 'HH12:MI AM') || ' in ' || COALESCE(v_room, 'a room') || '.';

    FOR v_student IN
        SELECT user_id FROM public.users
        WHERE role = 'student'
          AND account_status = 'active'
          AND year_level = p.year_level
          AND section = p.section
          AND public.program_key(program_course) = public.program_key(p.program_course)
    LOOP
        PERFORM public.push_notification(
            v_student.user_id, 'schedule_' || p_action, 'Room schedule ' || p_action,
            v_text, 'my-reservations.html', NULL, p.schedule_id
        );
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_schedule_faculty(p public.room_schedules, p_action TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room TEXT;
    v_text TEXT;
BEGIN
    IF p.faculty_id IS NULL THEN
        RETURN;
    END IF;

    SELECT 'Room ' || room_number INTO v_room FROM public.rooms WHERE room_id = p.room_id;

    v_text := 'Your class schedule was ' || p_action || ': ' || p.subject_title
              || COALESCE(' (' || NULLIF(p.course_section, '') || ')', '') || ', '
              || p.day_of_week || ' ' || to_char(p.start_time, 'HH12:MI AM') || ' - '
              || to_char(p.end_time, 'HH12:MI AM') || ' in ' || COALESCE(v_room, 'a room') || '.';

    PERFORM public.push_notification(
        p.faculty_id, 'schedule_' || p_action, 'Room schedule ' || p_action,
        v_text, 'schedule.html', NULL, p.schedule_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_schedule_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_changed BOOLEAN;
    v_faculty_changed BOOLEAN;
BEGIN
    BEGIN
        IF TG_OP = 'INSERT' THEN
            IF NEW.is_active THEN
                PERFORM public.notify_schedule_students(NEW, 'added');
                PERFORM public.notify_schedule_faculty(NEW, 'added');
            END IF;

        ELSIF TG_OP = 'DELETE' THEN
            IF OLD.is_active THEN
                PERFORM public.notify_schedule_students(OLD, 'removed');
                PERFORM public.notify_schedule_faculty(OLD, 'removed');
            END IF;

        ELSE -- UPDATE
            IF OLD.is_active AND NOT NEW.is_active THEN
                PERFORM public.notify_schedule_students(OLD, 'removed');
                PERFORM public.notify_schedule_faculty(OLD, 'removed');

            ELSIF NEW.is_active AND NOT OLD.is_active THEN
                PERFORM public.notify_schedule_students(NEW, 'added');
                PERFORM public.notify_schedule_faculty(NEW, 'added');

            ELSIF NEW.is_active THEN
                -- Nothing a person would care about changed (for example only updated_at)
                IF (OLD.room_id, OLD.day_of_week, OLD.start_time, OLD.end_time, OLD.subject_code, OLD.subject_title,
                    OLD.program_course, OLD.year_level, OLD.section, OLD.faculty_id)
                   IS NOT DISTINCT FROM
                   (NEW.room_id, NEW.day_of_week, NEW.start_time, NEW.end_time, NEW.subject_code, NEW.subject_title,
                    NEW.program_course, NEW.year_level, NEW.section, NEW.faculty_id) THEN
                    RETURN NULL;
                END IF;

                v_class_changed :=
                    public.program_key(OLD.program_course) IS DISTINCT FROM public.program_key(NEW.program_course)
                    OR OLD.year_level IS DISTINCT FROM NEW.year_level
                    OR OLD.section IS DISTINCT FROM NEW.section;
                v_faculty_changed := OLD.faculty_id IS DISTINCT FROM NEW.faculty_id;

                IF v_class_changed THEN
                    PERFORM public.notify_schedule_students(OLD, 'removed'); -- the class it was taken from
                    PERFORM public.notify_schedule_students(NEW, 'added');   -- the class it was given to
                ELSE
                    PERFORM public.notify_schedule_students(NEW, 'updated');
                END IF;

                IF v_faculty_changed THEN
                    PERFORM public.notify_schedule_faculty(OLD, 'removed');
                    PERFORM public.notify_schedule_faculty(NEW, 'added');
                ELSE
                    PERFORM public.notify_schedule_faculty(NEW, 'updated');
                END IF;
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_on_schedule_change failed: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS notify_schedule_change ON public.room_schedules;
CREATE TRIGGER notify_schedule_change
    AFTER INSERT OR UPDATE OR DELETE ON public.room_schedules
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_on_schedule_change();

REVOKE ALL ON FUNCTION public.notify_schedule_students(public.room_schedules, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_schedule_faculty(public.room_schedules, TEXT) FROM PUBLIC, anon, authenticated;