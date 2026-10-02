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
     2. SIGN-UP PAGE SPECIFIC SCRIPTS
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
          // Update active state
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

    // Password strength meter (Sign-up only)
    const passwordInput = document.getElementById('password');
    const strengthBar = document.getElementById('strengthBar');
    const strengthLabel = document.getElementById('strengthLabel');

    if (passwordInput && strengthBar && strengthLabel) {
      passwordInput.addEventListener('input', () => {
        const value = passwordInput.value;
        const strength = calculateStrength(value);

        // Reset classes
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

    // Form submission validation (Sign-up)
    const passwordError = document.getElementById('passwordError');

    signupForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const password = document.getElementById('password')?.value;
      const confirmPassword = document.getElementById('confirmPassword')?.value;
      const terms = document.getElementById('terms')?.checked;

      // Reset error
      if (passwordError) passwordError.classList.add('hidden');

      // Validate passwords match
      if (password !== confirmPassword) {
        if (passwordError) passwordError.classList.remove('hidden');
        return;
      }

      // Validate terms
      if (!terms) {
        alert('Please agree to the Terms of Service and Privacy Policy.');
        return;
      }

      // Simulate successful submission
      alert('Account created! Please check your email to verify your account.');
    });
  }

  /* ==========================================================================
     3. LOGIN PAGE SPECIFIC SCRIPTS
     ========================================================================== */
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    const loginRoleButtons = document.querySelectorAll('#roleSelector .role-btn, #roleSelector .role-tab');
    const loginInfoText = document.getElementById('infoText');
    const loginIdLabel = document.getElementById('loginIdLabel') || document.querySelector('label[for="studentNumber"]');
    const loginIdInput = document.getElementById('studentNumber');

    const roleConfigs = {
      student: {
        label: 'PUP Student Number',
        placeholder: 'e.g. 2000-00000-BN-0',
        info: 'Use your assigned <strong>Student Number</strong> for lab slot access.'
      },
      faculty: {
        label: 'PUP Faculty Webmail / Employee ID',
        placeholder: 'e.g. faculty.canlalay@pup.edu.ph',
        info: 'Faculty accounts authenticate via PUP webmail <strong>@pup.edu.ph</strong> for classroom reservation control.'
      },
      admin: {
        label: 'PUP Administrator Webmail / ID',
        placeholder: 'e.g. admin.canlalay@pup.edu.ph',
        info: 'Authorized Canlalay Campus Administrators & IT Staff portal access. Use your official <strong>@pup.edu.ph</strong> webmail.'
      }
    };

    if (loginRoleButtons.length > 0) {
      loginRoleButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          // Update active state
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

    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();

      const idVal = loginIdInput?.value?.trim();
      const pwdVal = document.getElementById('password')?.value;

      if (!idVal) {
        alert('Please enter your institutional ID / Webmail.');
        return;
      }
      if (!pwdVal) {
        alert('Please enter your portal password.');
        return;
      }

      const activeBtn = document.querySelector('#roleSelector .role-btn.active, #roleSelector .role-tab.active');
      const activeRole = activeBtn?.dataset?.role || 'student';

      alert(`Logging in as ${idVal} (${activeRole.toUpperCase()})... Directing to dashboard.`);

      if (activeRole === 'admin') {
        window.location.href = 'admin-dashboard.html';
      } else {
        window.location.href = 'student-dashboard.html';
      }
    });
  }

});