-- ============================================================================
-- PUP-CRS: Admin booking (direct, approved at once)
-- Run ONCE in the Supabase SQL Editor (safe to run again).
-- Run after schema.sql, schedule_manager.sql, notifications.sql and
-- audit_logs.sql (it updates two of their trigger functions).
--
--   1. admin_create_reservation()  - the function the dashboard's "+ Admin
--      Booking" calls through POST /api/admin/reservations. It was missing from
--      the database, so admin bookings always failed.
--   2. list_active_faculty() and get_taken_slots() - these two already exist in
--      the live database; the same code is saved here so a new database has them.
--   3. Audit log + notification wording for admin bookings.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. admin_create_reservation()
--    - only an ACTIVE ADMIN may call it
--    - the booking is stored as approved, requested by the admin, tagged to the
--      chosen faculty member
--    - pending student requests that overlap it are rejected automatically
--      (the same way decide_reservation() does when an admin approves one)
--    - there is no 2-hour lead time for admins, but the past is blocked
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_reservation(
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
    v_admin UUID := auth.uid();
    v_now TIMESTAMP := date_trunc('minute', now() AT TIME ZONE 'Asia/Manila');
    v_subject TEXT := BTRIM(COALESCE(p_subject, ''));
    v_id INTEGER;
    v_rejected INTEGER := 0;
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

    IF EXISTS (
        SELECT 1 FROM public.room_reservations
        WHERE room_id = p_room_id
          AND reservation_date = p_date
          AND status = 'approved'
          AND p_start < end_time AND p_end > start_time
    ) THEN
        RAISE EXCEPTION 'Cannot book: this time overlaps an already approved reservation.';
    END IF;

    INSERT INTO public.room_reservations (
        room_id, student_id, faculty_id, subject,
        reservation_date, start_time, end_time,
        status, admin_id, responded_at, admin_remarks
    ) VALUES (
        p_room_id, v_admin, p_faculty_id, v_subject,
        p_date, p_start, p_end,
        'approved', v_admin, now(), 'Booked directly by an administrator'
    )
    RETURNING reservation_id INTO v_id;

    -- Competing pending requests for the same room and time are rejected
    UPDATE public.room_reservations
    SET status = 'rejected',
        admin_id = v_admin,
        responded_at = now(),
        admin_remarks = 'Auto-rejected: Slot booked by another approved reservation.'
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
        'auto_rejected_competing_count', v_rejected
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_reservation(INTEGER, UUID, VARCHAR, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_reservation(INTEGER, UUID, VARCHAR, DATE, TIME WITHOUT TIME ZONE, TIME WITHOUT TIME ZONE) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helper functions that already exist in the live database (same code)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_taken_slots(p_room_id integer, p_from date, p_to date)
 RETURNS TABLE(reservation_date date, start_time time without time zone, end_time time without time zone, status reservation_status_type)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT r.reservation_date, r.start_time, r.end_time, r.status
    FROM public.room_reservations r
    WHERE r.room_id = p_room_id
      AND r.reservation_date >= p_from
      AND r.reservation_date <= p_to
      AND r.status IN ('pending', 'approved')
    ORDER BY r.reservation_date ASC, r.start_time ASC;
$function$;

CREATE OR REPLACE FUNCTION public.list_active_faculty()
 RETURNS TABLE(user_id uuid, full_name text, pup_webmail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
    SELECT u.user_id, u.full_name, u.pup_webmail
    FROM public.users u
    WHERE u.role = 'faculty'
      AND u.account_status = 'active'
    ORDER BY u.full_name ASC;
$function$;

-- ---------------------------------------------------------------------------
-- 3a. Audit log: an admin booking is logged as "Admin Booking" (not as a
--     student's own-class auto-approval), with the tagged faculty as the subject
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
    v_by_admin BOOLEAN;
    v_when TEXT;
BEGIN
    BEGIN
        v_by_admin := NEW.admin_id IS NOT NULL AND NEW.admin_id = NEW.student_id;

        v_when := to_char(NEW.reservation_date, 'Mon DD, YYYY') || ', '
                  || to_char(NEW.start_time, 'HH12:MI AM') || ' - ' || to_char(NEW.end_time, 'HH12:MI AM');

        IF v_by_admin THEN
            SELECT full_name INTO v_faculty FROM public.users WHERE user_id = NEW.faculty_id;

            PERFORM public.write_audit_log(
                'RESERVATION', 'RESERVATION_ADMIN_BOOKED', public.room_label(NEW.room_id),
                'Admin booked reservation #' || NEW.reservation_id || ' (' || NEW.subject || ') for ' || v_when
                    || COALESCE(' with ' || v_faculty, '')
                    || '. It was approved immediately because an administrator created it.',
                'APPROVED',
                v_faculty,
                CASE WHEN v_faculty IS NOT NULL THEN 'Faculty' END
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
-- 3b. Notifications: an admin booking no longer says "inside their class
--     schedule", and the admin who made it is not notified about it
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
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'notify_on_reservation_created failed: %', SQLERRM;
    END;
    RETURN NULL;
END;
$$;