-- ============================================================================
-- Enable Realtime for Classroom Reservations (Rooms table)
-- ============================================================================
-- Adds the public.rooms table to Supabase Realtime publication.
-- This ensures that when an Administrator updates room details or toggles
-- room availability in room-management.html, Supabase broadcasts the change
-- via WebSockets immediately to students and faculty browsing rooms.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'rooms'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
    END IF;
END $$;
