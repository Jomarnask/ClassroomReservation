-- ============================================================================
-- PUP-CRS: Create Initial Administrator Account
-- Run this in your Supabase SQL Editor
-- ============================================================================

DO $$
DECLARE
    v_admin_email TEXT := 'admin@pup.edu.ph';        -- Change if desired
    v_admin_password TEXT := 'Admin123!';            -- Change to your desired password
    v_admin_name TEXT := 'PUP System Administrator';
    v_user_id UUID;
BEGIN
    -- 1. Check if the user already exists in auth.users
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = v_admin_email;

    -- 2. If user does not exist, insert directly into auth.users with confirmed email
    IF v_user_id IS NULL THEN
        v_user_id := gen_random_uuid();

        INSERT INTO auth.users (
            instance_id,
            id,
            aud,
            role,
            email,
            encrypted_password,
            email_confirmed_at,
            raw_app_meta_data,
            raw_user_meta_data,
            created_at,
            updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000',
            v_user_id,
            'authenticated',
            'authenticated',
            v_admin_email,
            extensions.crypt(v_admin_password, extensions.gen_salt('bf')),
            now(),
            '{"provider":"email","providers":["email"]}'::jsonb,
            jsonb_build_object(
                'full_name', v_admin_name,
                'role', 'admin',
                'student_number', 'N/A'
            ),
            now(),
            now()
        );

        -- Also create identity record required by Supabase Auth for email/password sign-in
        INSERT INTO auth.identities (
            id,
            user_id,
            identity_data,
            provider,
            provider_id,
            last_sign_in_at,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_user_id,
            json_build_object('sub', v_user_id::text, 'email', v_admin_email)::jsonb,
            'email',
            v_user_id::text,
            now(),
            now(),
            now()
        );
    ELSE
        -- If already in auth.users, update password
        UPDATE auth.users
        SET encrypted_password = extensions.crypt(v_admin_password, extensions.gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            raw_user_meta_data = jsonb_build_object(
                'full_name', v_admin_name,
                'role', 'admin',
                'student_number', 'N/A'
            ),
            updated_at = now()
        WHERE id = v_user_id;
    END IF;

    -- 3. Ensure the public.users profile exists and is ACTIVE ADMIN
    INSERT INTO public.users (
        user_id,
        full_name,
        pup_webmail,
        role,
        account_status,
        student_number
    ) VALUES (
        v_user_id,
        v_admin_name,
        v_admin_email,
        'admin'::user_role,
        'active'::account_status_type,
        'N/A'
    )
    ON CONFLICT (user_id) DO UPDATE SET
        role = 'admin'::user_role,
        account_status = 'active'::account_status_type,
        full_name = EXCLUDED.full_name,
        pup_webmail = EXCLUDED.pup_webmail,
        updated_at = now();

    RAISE NOTICE 'Admin user created successfully with email: %', v_admin_email;
END $$;
