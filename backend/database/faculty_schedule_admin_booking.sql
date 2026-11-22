-- ============================================================================
-- faculty_schedule_admin_booking.sql
-- Follow-up to admin_booking_class.sql. Run ONCE in the Supabase SQL Editor.
-- (Safe to re-run.)
--
-- What it does:
--   The faculty Schedule page used to show the admin's NAME with the class
--   (e.g. BSIT 3-2) underneath. This function now also returns two flags so
--   the page can show "Admin" as the requester and the class as the Section:
--     admin_booking : TRUE when the reservation was made by an admin
--     class_booking : TRUE when the reservation has a class assigned
-- ============================================================================

-- The return columns change, so the old function must be dropped first.
DROP FUNCTION IF EXISTS public.get_faculty_schedule_reservations();

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
    created_at TIMESTAMPTZ,
    class_booking BOOLEAN,
    admin_booking BOOLEAN
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
        CASE WHEN s.role::text = 'admin' THEN 'Admin'
             ELSE COALESCE(s.full_name, 'Student') END,
        COALESCE(r.program_course, s.program_course),
        COALESCE(r.year_level, s.year_level),
        COALESCE(r.section, s.section),
        r.subject,
        r.reservation_date,
        r.start_time,
        r.end_time,
        r.status,
        r.admin_remarks,
        r.created_at,
        (r.program_course IS NOT NULL),
        COALESCE(s.role::text = 'admin', FALSE)
    FROM public.room_reservations r
    LEFT JOIN public.rooms rm ON rm.room_id = r.room_id
    LEFT JOIN public.users s ON s.user_id = r.student_id
    WHERE r.faculty_id = auth.uid()
    ORDER BY r.reservation_date ASC, r.start_time ASC, r.reservation_id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_faculty_schedule_reservations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_faculty_schedule_reservations() TO authenticated;