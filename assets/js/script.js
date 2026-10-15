// ===== PUP Canlalay Campus CRS Application Scripts =====

document.addEventListener('DOMContentLoaded', () => {

  /* ==========================================================================
     1. SHARED: Password Visibility Toggle (.toggle-password)
     ========================================================================== */
  const toggleButtons = document.querySelectorAll('.toggle-password');
  toggleButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      // Visual feedback
      btn.style.opacity = isPassword ? '1' : '0.6';
    });
  });

  /* ==========================================================================
     2. SIGN-UP PAGE SPECIFIC SCRIPTS (unchanged)
     ========================================================================== */
  const signupForm = document.getElementById('signupForm');
  if (signupForm) {
    const signupRoleButtons = document.querySelectorAll('#roleSelector .role-btn');
    const studentNumberField = document.getElementById('studentNumberField');
    const studentAcademicFields = document.getElementById('studentAcademicFields');
    const signupInfoText = document.getElementById('infoText');

    if (signupRoleButtons.length > 0) {
      const signupRoleConfigs = {
        student: {
          info: `Use your official <strong>@iskolarngbayan.pup.edu.ph</strong> webmail for registration.`
        },
        faculty: {
          info: `Faculty accounts must use their official <strong>@pup.edu.ph</strong> webmail for registration.`
        },
        admin: {
          info: `Admin accounts require approval from the PUP Canlalay Campus Administration. Use your official <strong>@pup.edu.ph</strong> webmail.`
        }
      };

      signupRoleButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          signupRoleButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          const role = btn.dataset.role;
          const hideStudent = role !== 'student';

          if (studentNumberField) studentNumberField.classList.toggle('hidden', hideStudent);
          if (studentAcademicFields) studentAcademicFields.classList.toggle('hidden', hideStudent);

          if (signupInfoText && signupRoleConfigs[role]) {
            signupInfoText.innerHTML = signupRoleConfigs[role].info;
          }
        });
      });
    }

    // Password strength meter
    const passwordInput = document.getElementById('password');
    const strengthBar = document.getElementById('strengthBar');
    const strengthLabel = document.getElementById('strengthLabel');

    if (passwordInput && strengthBar && strengthLabel) {
      passwordInput.addEventListener('input', () => {
        const value = passwordInput.value;
        const strength = calculateStrength(value);

        strengthBar.classList.remove('strength-weak', 'strength-medium', 'strength-strong');

        if (value.length === 0) {
          strengthBar.style.width = '0%';
          strengthLabel.textContent = 'Strong Entropy';
          strengthLabel.className = 'text-xs text-gray-400';
          return;
        }

        if (strength.score <= 2) {
          strengthBar.style.width = '33%';
          strengthBar.classList.add('strength-weak');
          strengthLabel.textContent = 'Weak Entropy';
          strengthLabel.className = 'text-xs text-red-500';
        } else if (strength.score <= 4) {
          strengthBar.style.width = '66%';
          strengthBar.classList.add('strength-medium');
          strengthLabel.textContent = 'Moderate Entropy';
          strengthLabel.className = 'text-xs text-yellow-600';
        } else {
          strengthBar.style.width = '100%';
          strengthBar.classList.add('strength-strong');
          strengthLabel.textContent = 'Strong Entropy';
          strengthLabel.className = 'text-xs text-green-600';
        }
      });

      function calculateStrength(pwd) {
        let score = 0;
        if (pwd.length >= 8) score++;
        if (pwd.length >= 12) score++;
        if (/[a-z]/.test(pwd)) score++;
        if (/[A-Z]/.test(pwd)) score++;
        if (/\d/.test(pwd)) score++;
        if (/[^A-Za-z0-9]/.test(pwd)) score++;
        return { score };
      }
    }

    // Form submission with Supabase Auth Integration
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const fullName = document.getElementById('fullName')?.value.trim();
      const studentNumber = document.getElementById('studentNumber')?.value.trim();
      const email = document.getElementById('email')?.value.trim();
      const password = document.getElementById('password')?.value;
      const confirmPassword = document.getElementById('confirmPassword')?.value;
      const program = document.getElementById('program')?.value;
      const rawYearLevel = document.getElementById('yearLevel')?.value;
      const rawSection = document.getElementById('section')?.value;
      const terms = document.getElementById('terms')?.checked;

      const activeBtn = document.querySelector('#roleSelector .role-btn.active');
      const role = activeBtn?.dataset?.role || 'student';

      if (password !== confirmPassword) {
        alert('Passwords do not match.');
        return;
      }

      if (!terms) {
        alert('Please agree to the Terms of Service and Privacy Policy.');
        return;
      }

      // Parse year level and section into smallint digits
      const yearLevel = role === 'student' ? parseInt(rawYearLevel, 10) || null : null;
      const section = role === 'student' ? parseInt(rawSection, 10) || null : null;

      try {
        const { data, error } = await supabaseClient.auth.signUp({
          email: email,
          password: password,
          options: {
            data: {
              full_name: fullName,
              student_number: role === 'student' ? studentNumber : 'N/A',
              role: role,
              program: role === 'student' ? program : null,
              year_level: yearLevel,
              section: section,
            }
          }
        });

        if (error) {
          alert(`Registration Error: ${error.message}`);
          return;
        }

        alert('Account created successfully! Redirecting to login page...');
        window.location.href = 'login.html';

      } catch (err) {
        console.error('Unexpected Signup Error:', err);
        alert(`An error occurred during registration: ${err.message || err}`);
      }
    });
  }

  /* ==========================================================================
     3. LOGIN PAGE SPECIFIC SCRIPTS
     ========================================================================== */
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    const loginRoleButtons = document.querySelectorAll('#roleSelector .role-btn, #roleSelector .role-tab');
    const loginInfoText = document.getElementById('infoText');
    const loginIdLabel = document.getElementById('loginIdLabel') || document.querySelector('label[for="pupWebmail"]');
    const loginIdInput = document.getElementById('pupWebmail');

    const roleConfigs = {
      student: {
        label: 'PUP Webmail',
        placeholder: 'e.g. student@iskolarngbayan.pup.edu.ph',
        info: 'Use your registered <strong>PUP Webmail</strong> to sign in.'
      },
      faculty: {
        label: 'PUP Faculty Webmail',
        placeholder: 'e.g. faculty.canlalay@pup.edu.ph',
        info: 'Faculty accounts authenticate via PUP webmail <strong>@pup.edu.ph</strong>.'
      },
      admin: {
        label: 'PUP Administrator Webmail',
        placeholder: 'e.g. admin.canlalay@pup.edu.ph',
        info: 'Authorized Administrators & IT Staff portal access.'
      }
    };

    if (loginRoleButtons.length > 0) {
      loginRoleButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          loginRoleButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          const role = btn.dataset.role;
          const config = roleConfigs[role];

          if (config) {
            if (loginInfoText) loginInfoText.innerHTML = config.info;
            if (loginIdLabel) loginIdLabel.textContent = config.label;
            if (loginIdInput) loginIdInput.placeholder = config.placeholder;
          }
        });
      });
    }

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const userInput = loginIdInput?.value?.trim();
      const pwdVal = document.getElementById('password')?.value;

      if (!userInput || !pwdVal) {
        alert('Please enter your credentials.');
        return;
      }

      let authEmail = userInput;

      // If user typed a Student Number instead of an Email, resolve it from public.users
      if (!userInput.includes('@')) {
        const { data: userRecord, error: dbError } = await supabaseClient
          .from('users')
          .select('pup_webmail')
          .eq('student_number', userInput)
          .maybeSingle();

        if (dbError || !userRecord) {
          alert('No account found matching that Student Number.');
          return;
        }

        authEmail = userRecord.pup_webmail;
      }

      try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email: authEmail,
          password: pwdVal,
        });

        if (error) {
          console.error('Login error:', error.status, error.code, error.message);
          alert(`Login Failed: ${error.message}`);
          return;
        }

        // Read the REAL role from the database (not from the button, not from metadata)
        const { data: profile, error: profileError } = await supabaseClient
          .from('users')
          .select('role, account_status')
          .eq('user_id', data.user.id)
          .maybeSingle();

        if (profileError || !profile) {
          console.error('Profile lookup failed:', profileError);
          await supabaseClient.auth.signOut();
          alert('No profile found for this account. Please contact the administrator.');
          return;
        }

        if (String(profile.account_status).toLowerCase() !== 'active') {
          await supabaseClient.auth.signOut();
          alert('Your account is not active yet.');
          return;
        }

        // The role button the user clicked must match the real role
        const activeBtn = document.querySelector('#roleSelector .role-btn.active, #roleSelector .role-tab.active');
        const selectedRole = activeBtn?.dataset?.role;
        const realRole = String(profile.role).toLowerCase();

        if (selectedRole && selectedRole !== realRole) {
          await supabaseClient.auth.signOut();
          alert(`This account is registered as ${realRole}, not ${selectedRole}. Please select the correct role.`);
          return;
        }

        // Clear any stale values from the old version; the dashboard no longer uses them
        localStorage.removeItem('user_role');
        localStorage.removeItem('pup_user');
        localStorage.removeItem('demoRole');

        alert('Login Successful! Redirecting to dashboard...');
        window.location.replace('dashboard.html');

      } catch (err) {
        console.error('Unexpected Login Error:', err);
        alert('An error occurred during login. Please try again.');
      }
    });
  }

  // Mobile Navigation Toggle
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');

  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
    });
  }

});