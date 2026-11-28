-- ============================================================================
-- reservation_email_changes.sql
--
-- Why: when the database itself rejects or cancels a student's reservation
-- (auto-cancel 1 hour before start, a competing request that is auto-rejected,
-- or an approved reservation overridden by an admin booking), the PHP API needs
-- to know WHO to email. A student may not read other students' emails, so this
-- function (SECURITY DEFINER, backend login only) returns them.
--
-- How it finds the rows: every function above stamps responded_at with now(),
-- which is the start time of the transaction. PHP passes that exact time in.
-- Students who cancelled their own reservation are left out.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_reservation_email_changes(p_stamp TIMESTAMPTZ)
RETURNS TABLE (
    reservation_id INTEGER,
    status TEXT,
    admin_remarks TEXT,
    student_name TEXT,
    student_webmail TEXT,
    room_number TEXT,
    room_name TEXT,
    subject TEXT,
    reservation_date DATE,
    start_time TIME WITHOUT TIME ZONE,
    end_time TIME WITHOUT TIME ZONE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        r.reservation_id,
        r.status::text,
        r.admin_remarks::text,
        u.full_name::text,
        u.pup_webmail::text,
        rm.room_number::text,
        rm.room_name::text,
        r.subject::text,
        r.reservation_date,
        r.start_time,
        r.end_time
    FROM public.room_reservations r
    JOIN public.users u ON u.user_id = r.student_id AND u.role = 'student'
    LEFT JOIN public.rooms rm ON rm.room_id = r.room_id
    WHERE r.responded_at = p_stamp
      AND r.status IN ('rejected', 'cancelled')
      AND COALESCE(r.admin_remarks, '') <> 'Cancelled by applicant.'
    ORDER BY r.reservation_id;
$$;

REVOKE ALL ON FUNCTION public.get_reservation_email_changes(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crs_backend_user') THEN
        GRANT EXECUTE ON FUNCTION public.get_reservation_email_changes(TIMESTAMPTZ) TO crs_backend_user;
    END IF;
END $$;