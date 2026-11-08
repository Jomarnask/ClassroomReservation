-- ============================================================================
-- PUP-CRS Backend Database Role Setup
-- Run in Supabase SQL Editor as 'postgres' superuser / project owner
-- ============================================================================

-- 1. Create a dedicated database login for the PHP backend (replace password with a strong secret)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crs_backend_user') THEN
        CREATE ROLE crs_backend_user WITH LOGIN PASSWORD 'REPLACE_WITH_STRONG_PASSWORD';
    END IF;
END $$;

-- 2. Grant connection and usage permissions
GRANT CONNECT ON DATABASE postgres TO crs_backend_user;
GRANT USAGE ON SCHEMA public TO crs_backend_user;

-- 3. Grant table and sequence permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO crs_backend_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO crs_backend_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO crs_backend_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO crs_backend_user;

-- 4. Grant membership in 'authenticated' role
-- This allows the PHP backend connection to execute: SET LOCAL ROLE authenticated;
-- which activates Supabase Row Level Security (RLS) under the caller's JWT claims context
GRANT authenticated TO crs_backend_user;

-- ============================================================================
-- Note: In your backend/.env and Render environment settings, configure:
-- DB_USER=crs_backend_user
-- DB_PASSWORD=REPLACE_WITH_STRONG_PASSWORD
-- ============================================================================
