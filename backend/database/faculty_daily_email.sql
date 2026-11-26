-- ============================================================================
-- PUP-CRS: Faculty Daily Morning Email Automation (4:00 AM PH Time)
-- Run ONCE in the Supabase SQL Editor (safe to re-run).
--
-- What this sets up:
--   1. public.faculty_daily_email_logs: prevents duplicate emails on the same day.
--   2. public.get_daily_faculty_reservations(p_date): returns today's approved
--      and pending reservations for active faculty (sorted sooner to later).
--   3. public.get_daily_faculty_unreserved_schedules(p_date): returns today's
--      active weekly class schedules that do NOT yet have a matching approved
--      or pending reservation for that faculty, room, and time slot.
--   4. Security: functions are SECURITY DEFINER so the backend service can
--      read across RLS, while PUBLIC/anon/authenticated are revoked.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Idempotency log table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.faculty_daily_email_logs (
    log_id BIGSERIAL PRIMARY KEY,
    faculty_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    sent_date DATE NOT NULL,
    reserved_count INTEGER NOT NULL DEFAULT 0,
    schedule_count INTEGER NOT NULL DEFAULT 0,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_faculty_daily_email UNIQUE (faculty_id, sent_date)
);

CREATE INDEX IF NOT EXISTS idx_faculty_daily_email_logs_date
    ON public.faculty_daily_email_logs (sent_date);

ALTER TABLE public.faculty_daily_email_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.faculty_daily_email_logs FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crs_backend_user') THEN
        GRANT SELECT, INSERT, DELETE ON TABLE public.faculty_daily_email_logs TO crs_backend_user;
        GRANT USAGE, SELECT ON SEQUENCE public.faculty_daily_email_logs_log_id_seq TO crs_backend_user;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Today's reserved classes (approved + pending) for active faculty
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_daily_faculty_reservations(
    p_date DATE DEFAULT (now() AT TIME ZONE 'Asia/Manila')::DATE
)
RETURNS TABLE (
    faculty_id UUID,
    faculty_name TEXT,
    faculty_email TEXT,
    reservation_id INTEGER,
    room_id INTEGER,
    room_number TEXT,
    room_name TEXT,
    start_time TIME WITHOUT TIME ZONE,
    end_time TIME WITHOUT TIME ZONE,
    program_course TEXT,
    year_level SMALLINT,
    section SMALLINT,
    subject VARCHAR(150),
    status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        f.user_id AS faculty_id,
        f.full_name AS faculty_name,
        f.pup_webmail AS faculty_email,
        r.reservation_id,
        r.room_id,
        rm.room_number,
        rm.room_name,
        r.start_time,
        r.end_time,
        COALESCE(r.program_course, s.program_course) AS program_course,
        COALESCE(r.year_level, s.year_level) AS year_level,
        COALESCE(r.section, s.section) AS section,
        r.subject,
        r.status::TEXT AS status
    FROM public.room_reservations r
    INNER JOIN public.users f
        ON f.user_id = r.faculty_id
       AND f.role = 'faculty'
       AND f.account_status = 'active'
    LEFT JOIN public.rooms rm
        ON rm.room_id = r.room_id
    LEFT JOIN public.users s
        ON s.user_id = r.student_id
    WHERE r.reservation_date = p_date
      AND r.status IN ('approved', 'pending')
    ORDER BY f.user_id ASC, r.start_time ASC, r.end_time ASC, r.reservation_id ASC;
$$;

REVOKE ALL ON FUNCTION public.get_daily_faculty_reservations(DATE) FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crs_backend_user') THEN
        GRANT EXECUTE ON FUNCTION public.get_daily_faculty_reservations(DATE) TO crs_backend_user;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Today's unreserved weekly class schedules for active faculty
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_daily_faculty_unreserved_schedules(
    p_date DATE DEFAULT (now() AT TIME ZONE 'Asia/Manila')::DATE
)
RETURNS TABLE (
    faculty_id UUID,
    faculty_name TEXT,
    faculty_email TEXT,
    schedule_id INTEGER,
    room_id INTEGER,
    room_number TEXT,
    room_name TEXT,
    start_time TIME WITHOUT TIME ZONE,
    end_time TIME WITHOUT TIME ZONE,
    program_course TEXT,
    year_level SMALLINT,
    section SMALLINT,
    course_section TEXT,
    subject_code TEXT,
    subject_title TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        f.user_id AS faculty_id,
        f.full_name AS faculty_name,
        f.pup_webmail AS faculty_email,
        s.schedule_id,
        s.room_id,
        rm.room_number,
        rm.room_name,
        s.start_time,
        s.end_time,
        s.program_course,
        s.year_level,
        s.section,
        s.course_section,
        s.subject_code,
        s.subject_title
    FROM public.room_schedules s
    INNER JOIN public.users f
        ON f.user_id = s.faculty_id
       AND f.role = 'faculty'
       AND f.account_status = 'active'
    LEFT JOIN public.rooms rm
        ON rm.room_id = s.room_id
    WHERE s.is_active = TRUE
      AND LOWER(s.day_of_week) = LOWER(TO_CHAR(p_date, 'FMDay'))
      AND NOT EXISTS (
          SELECT 1
          FROM public.room_reservations r
          WHERE r.faculty_id = s.faculty_id
            AND r.room_id = s.room_id
            AND r.reservation_date = p_date
            AND r.status IN ('approved', 'pending')
            AND r.start_time < s.end_time
            AND r.end_time > s.start_time
      )
    ORDER BY f.user_id ASC, s.start_time ASC, s.end_time ASC, s.schedule_id ASC;
$$;

REVOKE ALL ON FUNCTION public.get_daily_faculty_unreserved_schedules(DATE) FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crs_backend_user') THEN
        GRANT EXECUTE ON FUNCTION public.get_daily_faculty_unreserved_schedules(DATE) TO crs_backend_user;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Helper functions for reading/writing email logs safely across RLS
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_sent_faculty_daily_email_ids(
    p_date DATE
)
RETURNS TABLE (faculty_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT l.faculty_id
    FROM public.faculty_daily_email_logs l
    WHERE l.sent_date = p_date;
$$;

REVOKE ALL ON FUNCTION public.get_sent_faculty_daily_email_ids(DATE) FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crs_backend_user') THEN
        GRANT EXECUTE ON FUNCTION public.get_sent_faculty_daily_email_ids(DATE) TO crs_backend_user;
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.record_faculty_daily_email_log(
    p_faculty_id UUID,
    p_date DATE,
    p_reserved_count INTEGER,
    p_schedule_count INTEGER
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO public.faculty_daily_email_logs (
        faculty_id, sent_date, reserved_count, schedule_count, sent_at
    )
    VALUES (
        p_faculty_id, p_date, p_reserved_count, p_schedule_count, now()
    )
    ON CONFLICT (faculty_id, sent_date) DO UPDATE
        SET reserved_count = EXCLUDED.reserved_count,
            schedule_count = EXCLUDED.schedule_count,
            sent_at = now();
$$;

REVOKE ALL ON FUNCTION public.record_faculty_daily_email_log(UUID, DATE, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crs_backend_user') THEN
        GRANT EXECUTE ON FUNCTION public.record_faculty_daily_email_log(UUID, DATE, INTEGER, INTEGER) TO crs_backend_user;
    END IF;
END $$;
