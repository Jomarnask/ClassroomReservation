-- ============================================================================
-- PUP-CRS: Audit Logs (System Audit Trail)
-- Run ONCE in the Supabase SQL Editor (safe to run again).
-- Run schedule_manager.sql first (it adds the program / year level / section
-- columns of room_schedules that the schedule log lines use). public.is_admin()
-- comes from schema.sql.
--
-- The database writes the log by itself with triggers, so every change is
-- recorded no matter which page, API call or SQL caused it:
--
--   RESERVATION     approved, auto-approved (own class), declined, cancelled
--   USER_APPROVAL   account approved, rejected, deactivated
--   ROOM            room created, updated, deleted
--   SCHEDULE        class schedule added, updated, deleted
--
-- Admins can only READ the log. Nobody can insert, edit or delete rows from the
-- browser, which keeps the trail immutable. A failing log write never blocks the
-- real action (each trigger catches its own errors).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columns (audit_logs already exists in schema.sql)
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS event_category TEXT,   -- RESERVATION | USER_APPROVAL | ROOM | SCHEDULE
    ADD COLUMN IF NOT EXISTS user_role TEXT,        -- role of who did it (admin, faculty, student, system)
    ADD COLUMN IF NOT EXISTS subject_name TEXT,     -- the person the event is about (who reserved / who was approved)
    ADD COLUMN IF NOT EXISTS subject_class TEXT;    -- their program + year-section, or a schedule's class

CREATE INDEX IF NOT EXISTS idx_audit_logs_category
    ON public.audit_logs (event_category, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Row Level Security: admins may read, nobody may write from the browser
-- ---------------------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view and insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (public.is_admin());

REVOKE ALL ON public.audit_logs FROM anon, authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Helpers (not callable by users)
-- ---------------------------------------------------------------------------
-- 'BS of Information Technology (BSIT)', 3, 1  ->  'BSIT 3-1'
CREATE OR REPLACE FUNCTION public.class_label(p_program TEXT, p_year SMALLINT, p_section SMALLINT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT NULLIF(BTRIM(
        COALESCE(substring(p_program from '\(([^)]+)\)\s*$'), p_program, '')
        || CASE WHEN p_year IS NOT NULL
                THEN ' ' || p_year::TEXT || '-' || COALESCE(p_section::TEXT, '?')
                ELSE '' END
    ), '');
$$;

-- 'Room 202 - Seminar Hall'
CREATE OR REPLACE FUNCTION public.room_label(p_room_id INTEGER)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT 'Room ' || room_number || COALESCE(' - ' || NULLIF(room_name, ''), '')
    FROM public.rooms WHERE room_id = p_room_id;
$$;

-- Writes one log row. "Initiated by" is whoever is signed in (auth.uid());
-- with nobody signed in (SQL editor, system routine) it is recorded as System.
CREATE OR REPLACE FUNCTION public.write_audit_log(
    p_category TEXT,
    p_action_type TEXT,
    p_room_name TEXT,
    p_details TEXT,
    p_status TEXT,
    p_subject_name TEXT DEFAULT NULL,
    p_subject_class TEXT DEFAULT NULL,
    p_force_system BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_name TEXT;
    v_role TEXT;
BEGIN
    IF NOT p_force_system AND v_uid IS NOT NULL THEN
        SELECT full_name, role::TEXT INTO v_name, v_role
        FROM public.users WHERE user_id = v_uid;
    END IF;

    INSERT INTO public.audit_logs (
        user_id, user_name, user_role, event_category, action_type,
        room_name, details, status, subject_name, subject_class
    ) VALUES (
        CASE WHEN v_name IS NULL THEN NULL ELSE v_uid END,
        COALESCE(v_name, 'System'),
        COALESCE(v_role, 'system'),
        p_category,
        COALESCE(p_action_type, 'UNKNOWN'),
        p_room_name,
        COALESCE(p_details, 'No details recorded.'),
        COALESCE(p_status, 'SUCCESS'),
        p_subject_name, p_subject_class
    );
END;
$$;

-- When a trigger cannot write its normal log line, this records WHY (status ERROR),
-- so the problem is visible on the Audit Logs page and not lost in the Postgres log.
CREATE OR REPLACE FUNCTION public.audit_log_failure(p_category TEXT, p_action_type TEXT, p_error TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.audit_logs (user_name, user_role, event_category, action_type, details, status)
    VALUES ('System', 'system', p_category, p_action_type,
            'The log entry for this event could not be written: ' || COALESCE(p_error, 'unknown error'),
            'ERROR');
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'audit_log_failure failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_log(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_log_failure(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.room_label(INTEGER) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Reservation decisions
-- ---------------------------------------------------------------------------
-- 4a. A student books inside their own class time -> approved on the spot
CREATE OR REPLACE FUNCTION public.audit_on_reservation_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student RECORD;
BEGIN
    BEGIN
        SELECT full_name, program_course, year_level, section INTO v_student
        FROM public.users WHERE user_id = NEW.student_id;

        PERFORM public.write_audit_log(
            'RESERVATION', 'RESERVATION_AUTO_APPROVED', public.room_label(NEW.room_id),
            'Auto-approved reservation #' || NEW.reservation_id || ' (' || NEW.subject || ') for '
                || to_char(NEW.reservation_date, 'Mon DD, YYYY') || ', '
                || to_char(NEW.start_time, 'HH12:MI AM') || ' - ' || to_char(NEW.end_time, 'HH12:MI AM')
                || '. It is inside the student''s own class schedule, so no admin approval was needed.',
            'APPROVED',
            v_student.full_name,
            public.class_label(v_student.program_course, v_student.year_level, v_student.section)
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'audit_on_reservation_created failed: %', SQLERRM;
        PERFORM public.audit_log_failure('RESERVATION', 'RESERVATION_AUTO_APPROVED', SQLERRM);
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_reservation_created ON public.room_reservations;
CREATE TRIGGER audit_reservation_created
    AFTER INSERT ON public.room_reservations
    FOR EACH ROW
    WHEN (NEW.status = 'approved')
    EXECUTE FUNCTION public.audit_on_reservation_created();

-- 4b. Approved / declined / cancelled
CREATE OR REPLACE FUNCTION public.audit_on_reservation_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student RECORD;
    v_action TEXT;
    v_result TEXT;
    v_verb TEXT;
    v_auto BOOLEAN;
BEGIN
    BEGIN
        SELECT full_name, program_course, year_level, section INTO v_student
        FROM public.users WHERE user_id = NEW.student_id;

        CASE NEW.status::TEXT
            WHEN 'approved' THEN v_action := 'RESERVATION_APPROVED'; v_result := 'APPROVED';  v_verb := 'Approved';
            WHEN 'rejected' THEN v_action := 'RESERVATION_DECLINED'; v_result := 'DECLINED';  v_verb := 'Declined';
            ELSE                 v_action := 'RESERVATION_CANCELLED'; v_result := 'CANCELLED'; v_verb := 'Cancelled';
        END CASE;

        -- Requests that decide_reservation() rejects by itself are logged as System
        v_auto := NEW.status = 'rejected' AND COALESCE(NEW.admin_remarks, '') LIKE 'Auto-rejected%';

        PERFORM public.write_audit_log(
            'RESERVATION', v_action, public.room_label(NEW.room_id),
            v_verb || ' reservation #' || NEW.reservation_id || ' (' || NEW.subject || ') for '
                || to_char(NEW.reservation_date, 'Mon DD, YYYY') || ', '
                || to_char(NEW.start_time, 'HH12:MI AM') || ' - ' || to_char(NEW.end_time, 'HH12:MI AM') || '.'
                || CASE WHEN COALESCE(NEW.admin_remarks, '') <> '' AND NEW.status <> 'approved'
                        THEN ' Reason: ' || NEW.admin_remarks ELSE '' END,
            v_result,
            v_student.full_name,
            public.class_label(v_student.program_course, v_student.year_level, v_student.section),
            v_auto
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'audit_on_reservation_status failed: %', SQLERRM;
        PERFORM public.audit_log_failure('RESERVATION', 'RESERVATION_STATUS', SQLERRM);
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_reservation_status ON public.room_reservations;
CREATE TRIGGER audit_reservation_status
    AFTER UPDATE OF status ON public.room_reservations
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status
          AND NEW.status IN ('approved', 'rejected', 'cancelled'))
    EXECUTE FUNCTION public.audit_on_reservation_status();

-- ---------------------------------------------------------------------------
-- 5. User approval: account approved / rejected / deactivated
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_on_user_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_action TEXT;
    v_result TEXT;
    v_text TEXT;
BEGIN
    BEGIN
        CASE NEW.account_status::TEXT
            WHEN 'active' THEN
                v_action := 'USER_APPROVED'; v_result := 'APPROVED';
                v_text := CASE WHEN OLD.account_status::TEXT = 'pending' THEN 'Approved' ELSE 'Reactivated' END;
            WHEN 'rejected' THEN
                v_action := 'USER_REJECTED'; v_result := 'REJECTED'; v_text := 'Rejected';
            ELSE
                v_action := 'USER_DEACTIVATED'; v_result := 'DEACTIVATED'; v_text := 'Deactivated';
        END CASE;

        PERFORM public.write_audit_log(
            'USER_APPROVAL', v_action, NULL,
            v_text || ' the ' || NEW.role::TEXT || ' account of ' || NEW.full_name
                || ' (' || NEW.pup_webmail || '). Status: ' || OLD.account_status::TEXT || ' -> ' || NEW.account_status::TEXT || '.',
            v_result,
            NEW.full_name,
            COALESCE(public.class_label(NEW.program_course, NEW.year_level, NEW.section), INITCAP(NEW.role::TEXT))
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'audit_on_user_status failed: %', SQLERRM;
        PERFORM public.audit_log_failure('USER_APPROVAL', 'USER_STATUS', SQLERRM);
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_user_status ON public.users;
CREATE TRIGGER audit_user_status
    AFTER UPDATE OF account_status ON public.users
    FOR EACH ROW
    WHEN (OLD.account_status IS DISTINCT FROM NEW.account_status
          AND NEW.account_status IN ('active', 'rejected', 'inactive'))
    EXECUTE FUNCTION public.audit_on_user_status();

-- ---------------------------------------------------------------------------
-- 6. Room management: created / updated / deleted
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_on_room_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_changes TEXT[] := ARRAY[]::TEXT[];
BEGIN
    BEGIN
        IF TG_OP = 'INSERT' THEN
            PERFORM public.write_audit_log(
                'ROOM', 'ROOM_CREATED', public.room_label(NEW.room_id),
                'Created Room ' || NEW.room_number || COALESCE(' - ' || NULLIF(NEW.room_name, ''), '')
                    || ' (Floor ' || NEW.floor || ', ' || NEW.room_type || ').',
                'SUCCESS'
            );

        ELSIF TG_OP = 'DELETE' THEN
            PERFORM public.write_audit_log(
                'ROOM', 'ROOM_DELETED',
                'Room ' || OLD.room_number || COALESCE(' - ' || NULLIF(OLD.room_name, ''), ''),
                'Deleted Room ' || OLD.room_number || COALESCE(' - ' || NULLIF(OLD.room_name, ''), '') || '.',
                'SUCCESS'
            );

        ELSE -- UPDATE
            IF OLD.room_number IS DISTINCT FROM NEW.room_number THEN
                v_changes := array_append(v_changes, ('room number ' || OLD.room_number || ' -> ' || NEW.room_number)::TEXT);
            END IF;
            IF OLD.room_name IS DISTINCT FROM NEW.room_name THEN
                v_changes := array_append(v_changes, ('name "' || COALESCE(OLD.room_name, '') || '" -> "' || COALESCE(NEW.room_name, '') || '"')::TEXT);
            END IF;
            IF OLD.floor IS DISTINCT FROM NEW.floor THEN
                v_changes := array_append(v_changes, ('floor ' || OLD.floor || ' -> ' || NEW.floor)::TEXT);
            END IF;
            IF OLD.room_type IS DISTINCT FROM NEW.room_type THEN
                v_changes := array_append(v_changes, ('type ' || OLD.room_type || ' -> ' || NEW.room_type)::TEXT);
            END IF;
            IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
                v_changes := array_append(v_changes, ('status ' || CASE WHEN OLD.is_active THEN 'Active' ELSE 'Inactive' END
                                           || ' -> ' || CASE WHEN NEW.is_active THEN 'Active' ELSE 'Inactive' END)::TEXT);
            END IF;

            IF array_length(v_changes, 1) IS NULL THEN
                RETURN NULL; -- only updated_at changed
            END IF;

            PERFORM public.write_audit_log(
                'ROOM', 'ROOM_UPDATED', public.room_label(NEW.room_id),
                'Updated Room ' || NEW.room_number || ': ' || array_to_string(v_changes, '; ') || '.',
                'SUCCESS'
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'audit_on_room_change failed: %', SQLERRM;
        PERFORM public.audit_log_failure('ROOM', 'ROOM_CHANGE', SQLERRM);
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_room_change ON public.rooms;
CREATE TRIGGER audit_room_change
    AFTER INSERT OR UPDATE OR DELETE ON public.rooms
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_on_room_change();

-- ---------------------------------------------------------------------------
-- 7. Schedule management: class schedule added / updated / deleted
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_schedule_text(p public.room_schedules)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT concat(
        p.subject_title,
        COALESCE(' (' || NULLIF(p.subject_code, '') || ')', ''),
        ', ', p.day_of_week, ' ',
        to_char(p.start_time, 'HH12:MI AM'), ' - ', to_char(p.end_time, 'HH12:MI AM'),
        ' in ', COALESCE(public.room_label(p.room_id), 'a room'),
        COALESCE(', Prof. ' || (SELECT full_name FROM public.users WHERE user_id = p.faculty_id), '')
    );
$$;

CREATE OR REPLACE FUNCTION public.audit_on_schedule_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_changes TEXT[] := ARRAY[]::TEXT[];
BEGIN
    BEGIN
        IF TG_OP = 'INSERT' THEN
            IF NEW.is_active THEN
                PERFORM public.write_audit_log(
                    'SCHEDULE', 'SCHEDULE_ADDED', public.room_label(NEW.room_id),
                    'Added class schedule: ' || public.audit_schedule_text(NEW) || '.',
                    'SUCCESS', NULL,
                    public.class_label(NEW.program_course, NEW.year_level, NEW.section)
                );
            END IF;

        ELSIF TG_OP = 'DELETE' THEN
            IF OLD.is_active THEN
                PERFORM public.write_audit_log(
                    'SCHEDULE', 'SCHEDULE_DELETED', public.room_label(OLD.room_id),
                    'Deleted class schedule: ' || public.audit_schedule_text(OLD) || '.',
                    'SUCCESS', NULL,
                    public.class_label(OLD.program_course, OLD.year_level, OLD.section)
                );
            END IF;

        ELSE -- UPDATE
            IF OLD.is_active AND NOT NEW.is_active THEN
                PERFORM public.write_audit_log(
                    'SCHEDULE', 'SCHEDULE_DELETED', public.room_label(OLD.room_id),
                    'Deleted class schedule: ' || public.audit_schedule_text(OLD) || '.',
                    'SUCCESS', NULL,
                    public.class_label(OLD.program_course, OLD.year_level, OLD.section)
                );

            ELSIF NEW.is_active AND NOT OLD.is_active THEN
                PERFORM public.write_audit_log(
                    'SCHEDULE', 'SCHEDULE_ADDED', public.room_label(NEW.room_id),
                    'Added class schedule: ' || public.audit_schedule_text(NEW) || '.',
                    'SUCCESS', NULL,
                    public.class_label(NEW.program_course, NEW.year_level, NEW.section)
                );

            ELSIF NEW.is_active THEN
                IF OLD.room_id IS DISTINCT FROM NEW.room_id THEN v_changes := array_append(v_changes, 'room'::TEXT); END IF;
                IF OLD.day_of_week IS DISTINCT FROM NEW.day_of_week THEN v_changes := array_append(v_changes, 'day'::TEXT); END IF;
                IF OLD.start_time IS DISTINCT FROM NEW.start_time OR OLD.end_time IS DISTINCT FROM NEW.end_time THEN
                    v_changes := array_append(v_changes, 'time'::TEXT);
                END IF;
                IF OLD.subject_title IS DISTINCT FROM NEW.subject_title OR OLD.subject_code IS DISTINCT FROM NEW.subject_code THEN
                    v_changes := array_append(v_changes, 'subject'::TEXT);
                END IF;
                IF OLD.program_course IS DISTINCT FROM NEW.program_course
                   OR OLD.year_level IS DISTINCT FROM NEW.year_level
                   OR OLD.section IS DISTINCT FROM NEW.section THEN
                    v_changes := array_append(v_changes, 'class'::TEXT);
                END IF;
                IF OLD.faculty_id IS DISTINCT FROM NEW.faculty_id THEN v_changes := array_append(v_changes, 'faculty'::TEXT); END IF;

                IF array_length(v_changes, 1) IS NULL THEN
                    RETURN NULL; -- nothing a person would care about changed
                END IF;

                PERFORM public.write_audit_log(
                    'SCHEDULE', 'SCHEDULE_UPDATED', public.room_label(NEW.room_id),
                    'Updated class schedule (changed: ' || array_to_string(v_changes, ', ') || '). Now: '
                        || public.audit_schedule_text(NEW) || '.',
                    'SUCCESS', NULL,
                    public.class_label(NEW.program_course, NEW.year_level, NEW.section)
                );
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'audit_on_schedule_change failed: %', SQLERRM;
        PERFORM public.audit_log_failure('SCHEDULE', 'SCHEDULE_CHANGE', SQLERRM);
    END;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_schedule_change ON public.room_schedules;
CREATE TRIGGER audit_schedule_change
    AFTER INSERT OR UPDATE OR DELETE ON public.room_schedules
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_on_schedule_change();

REVOKE ALL ON FUNCTION public.audit_schedule_text(public.room_schedules) FROM PUBLIC, anon, authenticated;