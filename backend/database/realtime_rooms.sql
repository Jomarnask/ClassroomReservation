-- ============================================================================
-- Enable Realtime for Classroom Reservations (Rooms, Schedules, Reservations, Notifications)
-- ============================================================================
-- Adds public.rooms, public.room_reservations, public.room_schedules, and
-- public.notifications to the Supabase Realtime publication idempotently.
-- This ensures room status toggles, schedule updates, reservation overrides,
-- and notifications are pushed to connected clients within ~1-2 seconds.

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['rooms', 'room_reservations', 'room_schedules', 'notifications']
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = tbl
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
        END IF;
    END LOOP;
END $$;
