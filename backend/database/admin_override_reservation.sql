-- ============================================================================
-- PUP-CRS: Admin reservation override for student reservations
-- ============================================================================
-- Allows an Administrator to book a room through the Admin Dashboard
-- even if an approved student reservation already exists in the same slot.
-- Overlapping student reservations (both approved and pending) are overridden
-- and automatically set to 'rejected' with notification remarks.
-- Overlapping administrator bookings will still prevent booking to avoid
-- accidental collisions between admins.
-- ============================================================================

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
