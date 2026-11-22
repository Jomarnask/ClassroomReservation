-- ============================================================================
-- PUP-CRS: Faculty Schedule function
-- Run ONCE in the Supabase SQL Editor (safe to run again).
--
-- Returns every reservation that tags the logged-in faculty member, together
-- with the student's name / program / year / section and the room details.
-- It is SECURITY DEFINER because Row Level Security stops a faculty account
-- from reading student rows in public.users directly.
-- Only an ACTIVE FACULTY account can use it.
-- ============================================================================

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
        s.program_course,
        s.year_level,
        s.section,
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