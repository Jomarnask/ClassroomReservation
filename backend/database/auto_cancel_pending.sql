-- ============================================================================
-- PUP-CRS: Auto-cancel pending reservations
-- Run ONCE in the Supabase SQL Editor (safe to run again).
--
-- Rule: a reservation that is still PENDING when it reaches 1 hour before its
-- start time is cancelled automatically (nobody decided in time).
-- Times are compared in Philippine time (Asia/Manila).
--
-- The PHP API calls this function at the start of the main requests, so
-- statuses are always up to date when someone opens a page.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.expire_stale_pending_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row RECORD;
    v_count INTEGER := 0;
    v_now TIMESTAMP := (now() AT TIME ZONE 'Asia/Manila');
BEGIN
    FOR v_row IN
        SELECT r.reservation_id
        FROM public.room_reservations r
        WHERE r.status = 'pending'
          AND (r.reservation_date + r.start_time) - INTERVAL '1 hour' <= v_now
        ORDER BY r.reservation_id
        FOR UPDATE SKIP LOCKED
    LOOP
        BEGIN
            UPDATE public.room_reservations
            SET status = 'cancelled',
                responded_at = now(),
                admin_remarks = 'Automatically cancelled: no admin decision was made at least 1 hour before the start time.'
            WHERE reservation_id = v_row.reservation_id
              AND status = 'pending';

            IF FOUND THEN
                v_count := v_count + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- One bad row must never stop the others from being cancelled.
            RAISE WARNING 'Could not auto-cancel reservation %: %', v_row.reservation_id, SQLERRM;
        END;
    END LOOP;

    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_stale_pending_reservations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_reservations() TO authenticated;

-- ----------------------------------------------------------------------------
-- OPTIONAL: also run it automatically every 5 minutes, even when nobody is
-- using the website. First enable the "pg_cron" extension in
-- Database > Extensions, then run the line below (remove the leading "-- ").
-- ----------------------------------------------------------------------------
-- SELECT cron.schedule('expire-stale-pending', '*/5 * * * *', $$SELECT public.expire_stale_pending_reservations()$$);