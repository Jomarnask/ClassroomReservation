-- ============================================================================
-- PUP Canlalay Campus - Classroom & Facility Reservation System (PUP-CRS)
-- Complete Database Reconstruction Script
-- Compatible with Supabase PostgreSQL (Postgres 15+)
-- ============================================================================

-- Step 1: Enable Necessary PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Step 2: Custom Enum Types
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('student', 'faculty', 'admin');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status_type') THEN
        CREATE TYPE account_status_type AS ENUM ('pending', 'active', 'inactive', 'rejected');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status_type') THEN
        CREATE TYPE reservation_status_type AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
    END IF;
END $$;

-- ============================================================================
-- Step 3: Tables Definition
-- ============================================================================

-- 3.1 Users Profile Table (Extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    pup_webmail TEXT UNIQUE NOT NULL,
    role user_role NOT NULL DEFAULT 'student',
    account_status account_status_type NOT NULL DEFAULT 'pending',
    student_number TEXT DEFAULT 'N/A',
    program_course TEXT,
    year_level SMALLINT,
    section SMALLINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.2 Rooms Table
CREATE TABLE IF NOT EXISTS public.rooms (
    room_id SERIAL PRIMARY KEY,
    room_number TEXT UNIQUE NOT NULL,
    room_name TEXT,
    floor SMALLINT NOT NULL DEFAULT 1,
    room_type TEXT NOT NULL DEFAULT 'Lecture',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3.3 Room Reservations Table
CREATE TABLE IF NOT EXISTS public.room_reservations (
    reservation_id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES public.rooms(room_id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    faculty_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
    subject VARCHAR(150) NOT NULL,
    reservation_date DATE NOT NULL,
    start_time TIME WITHOUT TIME ZONE NOT NULL,
    end_time TIME WITHOUT TIME ZONE NOT NULL,
    status reservation_status_type NOT NULL DEFAULT 'pending',
    admin_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
    responded_at TIMESTAMPTZ,
    admin_remarks TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_time_order CHECK (start_time < end_time)
);

-- 3.4 Room Weekly Schedules Table
CREATE TABLE IF NOT EXISTS public.room_schedules (
    schedule_id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES public.rooms(room_id) ON DELETE CASCADE,
    faculty_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
    day_of_week TEXT NOT NULL, -- 'Monday', 'Tuesday', 'Wednesday', etc.
    start_time TIME WITHOUT TIME ZONE NOT NULL,
    end_time TIME WITHOUT TIME ZONE NOT NULL,
    subject_code TEXT,
    subject_title TEXT NOT NULL,
    course_section TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_schedule_time_order CHECK (start_time < end_time)
);

-- 3.5 System Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    log_id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
    user_name TEXT,
    action_type TEXT NOT NULL, -- 'APPROVAL', 'REJECTION', 'CANCELLATION', 'CONFIG', etc.
    room_name TEXT,
    details TEXT NOT NULL,
    ip_address TEXT,
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- Step 4: Indexes for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_users_role_status ON public.users(role, account_status);
CREATE INDEX IF NOT EXISTS idx_users_pup_webmail ON public.users(pup_webmail);
CREATE INDEX IF NOT EXISTS idx_rooms_floor ON public.rooms(floor);
CREATE INDEX IF NOT EXISTS idx_rooms_active ON public.rooms(is_active);
CREATE INDEX IF NOT EXISTS idx_reservations_room_date ON public.room_reservations(room_id, reservation_date);
CREATE INDEX IF NOT EXISTS idx_reservations_student ON public.room_reservations(student_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.room_reservations(status);
CREATE INDEX IF NOT EXISTS idx_schedules_room ON public.room_schedules(room_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Exclusion constraint to guarantee NO OVERLAPPING APPROVED bookings for the same room & date
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'exclude_approved_reservation_overlap'
    ) THEN
        ALTER TABLE public.room_reservations
        ADD CONSTRAINT exclude_approved_reservation_overlap
        EXCLUDE USING gist (
            room_id WITH =,
            reservation_date WITH =,
            tsrange(
                (reservation_date + start_time),
                (reservation_date + end_time)
            ) WITH &&
        )
        WHERE (status = 'approved');
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Exclusion constraint notice: %', SQLERRM;
END $$;

-- ============================================================================
-- Step 5: Triggers and Business Logic Protection
-- ============================================================================

-- 5.1 Auto-create public.users profile on Supabase Auth signup
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_raw_role TEXT;
    v_role user_role;
    v_email TEXT;
BEGIN
    v_email := LOWER(COALESCE(NEW.email, ''));
    v_raw_role := LOWER(COALESCE(NEW.raw_user_meta_data->>'role', 'student'));

    IF v_raw_role = 'admin' THEN
        v_role := 'admin'::user_role;
        IF NOT v_email LIKE '%@pup.edu.ph' THEN
            RAISE EXCEPTION 'Admin accounts must use official @pup.edu.ph email.';
        END IF;
    ELSIF v_raw_role = 'faculty' THEN
        v_role := 'faculty'::user_role;
        IF NOT v_email LIKE '%@pup.edu.ph' THEN
            RAISE EXCEPTION 'Faculty accounts must use official @pup.edu.ph email.';
        END IF;
    ELSE
        v_role := 'student'::user_role;
        IF NOT v_email LIKE '%@iskolarngbayan.pup.edu.ph' THEN
            RAISE EXCEPTION 'Student accounts must use official @iskolarngbayan.pup.edu.ph email.';
        END IF;
    END IF;

    -- Automatically confirm the email so users are never blocked by email verification links
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = NEW.id;

    INSERT INTO public.users (
        user_id,
        full_name,
        pup_webmail,
        role,
        account_status,
        student_number,
        program_course,
        year_level,
        section
    ) VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Unnamed User'),
        v_email,
        v_role,
        'pending'::account_status_type,
        COALESCE(NEW.raw_user_meta_data->>'student_number', 'N/A'),
        NEW.raw_user_meta_data->>'program',
        NULLIF(NEW.raw_user_meta_data->>'year_level', '')::SMALLINT,
        NULLIF(NEW.raw_user_meta_data->>'section', '')::SMALLINT
    )
    ON CONFLICT (user_id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        pup_webmail = EXCLUDED.pup_webmail,
        updated_at = now();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 5.2 Protect User Privileges Trigger (prevents non-admins from changing role/account_status)
CREATE OR REPLACE FUNCTION public.protect_user_privileges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_user_id UUID;
    v_current_user_role TEXT;
BEGIN
    v_current_user_id := auth.uid();

    -- Allow Supabase Service Role and Auth trigger to bypass
    IF auth.role() = 'service_role' OR v_current_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Query role of executing user
    SELECT role::TEXT INTO v_current_user_role
    FROM public.users
    WHERE user_id = v_current_user_id;

    -- If role or account status is changed by a non-admin, block it
    IF (OLD.role IS DISTINCT FROM NEW.role OR OLD.account_status IS DISTINCT FROM NEW.account_status) THEN
        IF v_current_user_role IS DISTINCT FROM 'admin' THEN
            RAISE EXCEPTION 'Unauthorized: Only an active administrator can modify user roles or account status.';
        END IF;
    END IF;

    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_user_privileges_trg ON public.users;
CREATE TRIGGER protect_user_privileges_trg
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.protect_user_privileges();

-- 5.3 Validate Reservation Trigger
CREATE OR REPLACE FUNCTION public.validate_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student_status TEXT;
    v_student_role TEXT;
BEGIN
    -- Check that student is active
    SELECT role::TEXT, account_status::TEXT
    INTO v_student_role, v_student_status
    FROM public.users
    WHERE user_id = NEW.student_id;

    IF v_student_status IS DISTINCT FROM 'active' THEN
        RAISE EXCEPTION 'Only active students can book a reservation.';
    END IF;

    IF NEW.start_time >= NEW.end_time THEN
        RAISE EXCEPTION 'Start time must be strictly earlier than end time.';
    END IF;

    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_reservation ON public.room_reservations;
CREATE TRIGGER trg_validate_reservation
    BEFORE INSERT OR UPDATE ON public.room_reservations
    FOR EACH ROW EXECUTE FUNCTION public.validate_reservation();

-- ============================================================================
-- Step 6: Frontend RPC Functions
-- ============================================================================

-- 6.1 List Active Faculty
CREATE OR REPLACE FUNCTION public.list_active_faculty()
RETURNS TABLE (
    user_id UUID,
    full_name TEXT,
    pup_webmail TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT u.user_id, u.full_name, u.pup_webmail
    FROM public.users u
    WHERE u.role = 'faculty'
      AND u.account_status = 'active'
    ORDER BY u.full_name ASC;
$$;

-- 6.2 Get Taken Slots (Approved & Pending in date range)
CREATE OR REPLACE FUNCTION public.get_taken_slots(
    p_room_id INTEGER,
    p_from DATE,
    p_to DATE
)
RETURNS TABLE (
    reservation_date DATE,
    start_time TIME WITHOUT TIME ZONE,
    end_time TIME WITHOUT TIME ZONE,
    status reservation_status_type
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT r.reservation_date, r.start_time, r.end_time, r.status
    FROM public.room_reservations r
    WHERE r.room_id = p_room_id
      AND r.reservation_date >= p_from
      AND r.reservation_date <= p_to
      AND r.status IN ('pending', 'approved')
    ORDER BY r.reservation_date ASC, r.start_time ASC;
$$;

-- 6.3 Get Faculty Tagged Reservations
CREATE OR REPLACE FUNCTION public.get_my_tagged_reservations()
RETURNS TABLE (
    reservation_id INTEGER,
    room_id INTEGER,
    student_id UUID,
    subject VARCHAR(150),
    reservation_date DATE,
    start_time TIME WITHOUT TIME ZONE,
    end_time TIME WITHOUT TIME ZONE,
    status reservation_status_type,
    created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT r.reservation_id, r.room_id, r.student_id, r.subject,
           r.reservation_date, r.start_time, r.end_time, r.status, r.created_at
    FROM public.room_reservations r
    WHERE r.faculty_id = auth.uid()
    ORDER BY r.reservation_date ASC, r.start_time ASC;
$$;

-- 6.4 Get Room Timetable For Faculty (Room schedule for tagged faculty with student details)
CREATE OR REPLACE FUNCTION public.get_room_timetable_for_faculty(
    p_room_id INTEGER,
    p_from DATE,
    p_to DATE,
    p_faculty_id UUID DEFAULT NULL
)
RETURNS TABLE (
    reservation_id INTEGER,
    room_id INTEGER,
    student_id UUID,
    faculty_id UUID,
    subject VARCHAR(150),
    reservation_date DATE,
    start_time TIME WITHOUT TIME ZONE,
    end_time TIME WITHOUT TIME ZONE,
    status reservation_status_type,
    student_name TEXT,
    program_course TEXT,
    year_level SMALLINT,
    section SMALLINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT
        r.reservation_id,
        r.room_id,
        r.student_id,
        r.faculty_id,
        r.subject,
        r.reservation_date,
        r.start_time,
        r.end_time,
        r.status,
        COALESCE(u.full_name, 'Student') AS student_name,
        u.program_course,
        u.year_level,
        u.section
    FROM public.room_reservations r
    LEFT JOIN public.users u ON u.user_id = r.student_id
    WHERE r.room_id = p_room_id
      AND r.reservation_date >= p_from
      AND r.reservation_date <= p_to
      AND r.status IN ('pending', 'approved')
      AND r.faculty_id = COALESCE(auth.uid(), p_faculty_id)
    ORDER BY r.reservation_date ASC, r.start_time ASC;
$$;

-- 6.4b Get Faculty Schedule Reservations (tagged reservations with student details)
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

-- 6.5 Decide Reservation (Admin Approve or Reject with auto-rejection of competing pendings)
CREATE OR REPLACE FUNCTION public.decide_reservation(
    p_id INTEGER,
    p_approve BOOLEAN,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_admin_role TEXT;
    v_target RECORD;
    v_rejected_count INT := 0;
BEGIN
    -- Verify caller is admin
    SELECT role::TEXT INTO v_admin_role FROM public.users WHERE user_id = v_admin_id;
    IF v_admin_role IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only administrators can decide reservations.';
    END IF;

    -- Lock the target row
    SELECT * INTO v_target
    FROM public.room_reservations
    WHERE reservation_id = p_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation with ID % not found.', p_id;
    END IF;

    IF v_target.status != 'pending' THEN
        RAISE EXCEPTION 'Reservation is already decided (current status: %).', v_target.status;
    END IF;

    IF p_approve THEN
        -- 1. Check for overlapping approved reservations
        IF EXISTS (
            SELECT 1 FROM public.room_reservations
            WHERE room_id = v_target.room_id
              AND reservation_date = v_target.reservation_date
              AND status = 'approved'
              AND reservation_id <> p_id
              AND (v_target.start_time < end_time AND v_target.end_time > start_time)
        ) THEN
            RAISE EXCEPTION 'Cannot approve: Overlaps an already approved reservation.';
        END IF;

        -- 2. Approve target
        UPDATE public.room_reservations
        SET status = 'approved',
            admin_id = v_admin_id,
            responded_at = now(),
            admin_remarks = COALESCE(p_reason, 'Approved by Administrator')
        WHERE reservation_id = p_id;

        -- 3. Auto-reject overlapping pending requests for the same room & date
        WITH competing AS (
            UPDATE public.room_reservations
            SET status = 'rejected',
                admin_id = v_admin_id,
                responded_at = now(),
                admin_remarks = 'Auto-rejected: Slot booked by another approved reservation.'
            WHERE room_id = v_target.room_id
              AND reservation_date = v_target.reservation_date
              AND status = 'pending'
              AND reservation_id <> p_id
              AND (v_target.start_time < end_time AND v_target.end_time > start_time)
            RETURNING reservation_id
        )
        SELECT COUNT(*) INTO v_rejected_count FROM competing;

        RETURN jsonb_build_object(
            'success', true,
            'decision', 'approved',
            'auto_rejected_competing_count', v_rejected_count
        );
    ELSE
        -- Decline request
        UPDATE public.room_reservations
        SET status = 'rejected',
            admin_id = v_admin_id,
            responded_at = now(),
            admin_remarks = COALESCE(p_reason, 'Declined by Administrator')
        WHERE reservation_id = p_id;

        RETURN jsonb_build_object(
            'success', true,
            'decision', 'rejected'
        );
    END IF;
END;
$$;

-- 6.5b Auto-cancel pending reservations (1 hour before start time)
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

-- 6.5 Cancel Reservation (Student cancels own pending reservation)
CREATE OR REPLACE FUNCTION public.cancel_reservation(
    p_id INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_user_role TEXT;
    v_target RECORD;
BEGIN
    SELECT role::TEXT INTO v_user_role FROM public.users WHERE user_id = v_user_id;

    SELECT * INTO v_target
    FROM public.room_reservations
    WHERE reservation_id = p_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation not found.';
    END IF;

    -- Must be the owner or an admin
    IF v_target.student_id <> v_user_id AND v_user_role <> 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: You can only cancel your own reservation.';
    END IF;

    IF v_target.status NOT IN ('pending', 'approved') THEN
        RAISE EXCEPTION 'Cannot cancel reservation in status "%".', v_target.status;
    END IF;

    UPDATE public.room_reservations
    SET status = 'cancelled',
        responded_at = now(),
        admin_remarks = 'Cancelled by applicant.'
    WHERE reservation_id = p_id;

    RETURN jsonb_build_object('success', true, 'status', 'cancelled');
END;
$$;

-- ============================================================================
-- Step 7: Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper: Check if current user is active admin without RLS recursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.users
        WHERE user_id = auth.uid() AND role = 'admin' AND account_status = 'active'
    );
$$;

-- 7.1 Users Policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.users;
CREATE POLICY "Users can read own profile"
    ON public.users FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins have full access to users" ON public.users;
CREATE POLICY "Admins have full access to users"
    ON public.users FOR ALL
    TO authenticated
    USING (public.is_admin());

DROP POLICY IF EXISTS "Users can update own academic fields" ON public.users;
CREATE POLICY "Users can update own academic fields"
    ON public.users FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 7.2 Rooms Policies
DROP POLICY IF EXISTS "Anyone authenticated can view rooms" ON public.rooms;
CREATE POLICY "Anyone authenticated can view rooms"
    ON public.rooms FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins can manage rooms" ON public.rooms;
CREATE POLICY "Admins can manage rooms"
    ON public.rooms FOR ALL
    TO authenticated
    USING (public.is_admin());

-- 7.3 Room Reservations Policies
DROP POLICY IF EXISTS "Users can view their own reservations" ON public.room_reservations;
CREATE POLICY "Users can view their own reservations"
    ON public.room_reservations FOR SELECT
    TO authenticated
    USING (auth.uid() = student_id OR auth.uid() = faculty_id);

DROP POLICY IF EXISTS "Active students can submit reservations" ON public.room_reservations;
CREATE POLICY "Active students can submit reservations"
    ON public.room_reservations FOR INSERT
    TO authenticated
    WITH CHECK (
        auth.uid() = student_id AND
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.user_id = auth.uid() AND u.account_status = 'active'
        )
    );

DROP POLICY IF EXISTS "Admins can manage all reservations" ON public.room_reservations;
CREATE POLICY "Admins can manage all reservations"
    ON public.room_reservations FOR ALL
    TO authenticated
    USING (public.is_admin());

-- 7.4 Room Schedules Policies
DROP POLICY IF EXISTS "Anyone authenticated can view room schedules" ON public.room_schedules;
CREATE POLICY "Anyone authenticated can view room schedules"
    ON public.room_schedules FOR SELECT
    TO authenticated
    USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage schedules" ON public.room_schedules;
CREATE POLICY "Admins can manage schedules"
    ON public.room_schedules FOR ALL
    TO authenticated
    USING (public.is_admin());

-- 7.5 Audit Logs Policies
DROP POLICY IF EXISTS "Admins can view and insert audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view and insert audit logs"
    ON public.audit_logs FOR ALL
    TO authenticated
    USING (public.is_admin());

-- ============================================================================
-- Step 8: Initial Seed Data for Rooms
-- ============================================================================

INSERT INTO public.rooms (room_number, room_name, floor, room_type, is_active) VALUES
    ('101', 'General Lecture Hall 1', 1, 'Lecture', true),
    ('102', 'General Lecture Hall 2', 1, 'Lecture', true),
    ('201', 'Multi-Purpose Seminar Hall', 2, 'Seminar', true),
    ('202', 'IT Lecture & Collaboration Room', 2, 'Lecture', true),
    ('301', 'Advanced Networking Laboratory', 3, 'Laboratory', true),
    ('302', 'Computer Hardware & Servicing Lab', 3, 'Laboratory', true),
    ('305', 'Software Engineering Laboratory', 3, 'Laboratory', true),
    ('401', 'Multimedia & Graphics Design Studio', 4, 'Laboratory', true),
    ('402', 'Senior Capstone Lecture Hall', 4, 'Lecture', true)
ON CONFLICT (room_number) DO UPDATE SET
    room_name = EXCLUDED.room_name,
    floor = EXCLUDED.floor,
    room_type = EXCLUDED.room_type,
    is_active = EXCLUDED.is_active;

-- ============================================================================
-- End of Database Reconstruction Script
-- ============================================================================