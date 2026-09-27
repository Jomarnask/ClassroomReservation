// ===== PUP-CITE CCIS Shared Application Scripts =====

document.addEventListener('DOMContentLoaded', () => {

  /* ==========================================================================
     1. SIGN-UP PAGE: Role Switcher (.role-btn)
     ========================================================================== */
  const roleButtons = document.querySelectorAll('.role-btn');
  const studentNumberField = document.getElementById('studentNumberField');
  const studentAcademicFields = document.getElementById('studentAcademicFields');
  const infoText = document.getElementById('infoText');

  if (roleButtons.length > 0) {
    roleButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        roleButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const role = btn.dataset.role;

        if (role === 'student') {
          if (studentNumberField) studentNumberField.classList.remove('hidden');
          if (studentAcademicFields) studentAcademicFields.classList.remove('hidden');
          if (infoText) {
            infoText.innerHTML = `Use your official <strong>@iskolarngbayan.pup.edu.ph</strong> email for automated directory validation.`;
          }
        } else if (role === 'faculty') {
          if (studentNumberField) studentNumberField.classList.add('hidden');
          if (studentAcademicFields) studentAcademicFields.classList.add('hidden');
          if (infoText) {
            infoText.innerHTML = `Faculty accounts authenticate via PUP webmail <strong>@pup.edu.ph</strong>. Position and specialization are automatically mapped to CCIS instructional scheduling.`;
          }
        }
      });
    });
  }

  /* ==========================================================================
     2. LOGIN PAGE: Role Switcher (.role-tab)
     ========================================================================== */
  const roleTabs = document.querySelectorAll('.role-tab');
  const webmailInput = document.getElementById('webmail');

  if (roleTabs.length > 0) {
    const loginRoleConfigs = {
      student: {
        info: 'Use your assigned Student Webmail (<strong>@iskolarngbayan.pup.edu.ph</strong>) for lab slot access.',
        placeholder: 'e.g. d.santos@iskolarngbayan.pup.edu.ph'
      },
      faculty: {
        info: 'Use your Faculty Webmail (<strong>@pup.edu.ph</strong>) for classroom reservation control.',
        placeholder: 'e.g. j.casalla@pup.edu.ph'
      },
      admin: {
        info: 'Authorized CCIS Administrators & IT Staff portal access.',
        placeholder: 'e.g. admin.ccis@pup.edu.ph'
      }
    };

    roleTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        roleTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const role = tab.getAttribute('data-role');
        if (loginRoleConfigs[role]) {
          if (infoText) infoText.innerHTML = loginRoleConfigs[role].info;
          if (webmailInput) webmailInput.placeholder = loginRoleConfigs[role].placeholder;
        }
      });
    });
  }

  /* ==========================================================================
     3. SHARED: Password Visibility Toggle (.toggle-password)
     ========================================================================== */
  const toggleButtons = document.querySelectorAll('.toggle-password');
  toggleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
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
     4. SIGN-UP PAGE: Password Strength Meter
     ========================================================================== */
  const passwordInput = document.getElementById('password');
  const strengthBar = document.getElementById('strengthBar');
  const strengthLabel = document.getElementById('strengthLabel');

  // Only attach if password input AND strength bar exist (Sign-Up page)
  if (passwordInput && strengthBar && strengthLabel) {
    passwordInput.addEventListener('input', () => {
      const value = passwordInput.value;
      const strength = calculateStrength(value);

      // Reset strength classes
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

  /* ==========================================================================
     5. SIGN-UP PAGE: Form Submission & Validation
     ========================================================================== */
  const signupForm = document.getElementById('signupForm');
  const passwordError = document.getElementById('passwordError');

  if (signupForm) {
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
     6. LOGIN PAGE: Form Submission Handling
     ========================================================================== */
  const loginForm = document.getElementById('loginForm');

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const email = document.getElementById('webmail')?.value;
      if (!email) {
        alert('Please enter your institutional webmail ID.');
        return;
      }

      // Simulate login
      alert(`Logging in as ${email}... Directing to PUP-CITE CCIS Dashboard.`);
    });
  }

});