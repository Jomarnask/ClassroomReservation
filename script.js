// ===== PUP-CITE CCIS Sign-Up Page Scripts =====

document.addEventListener('DOMContentLoaded', () => {

  /* ---------- Element References ---------- */
  const roleButtons = document.querySelectorAll('.role-btn');
  const studentNumberField = document.getElementById('studentNumberField');
  const studentAcademicFields = document.getElementById('studentAcademicFields');
  const infoText = document.getElementById('infoText');

  /* ---------- Role Switching ---------- */
  roleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active state
      roleButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const role = btn.dataset.role;

      if (role === 'student') {
        // Show student-only fields
        studentNumberField.classList.remove('hidden');
        studentAcademicFields.classList.remove('hidden');

        // Update info banner
        infoText.innerHTML = `Use your official <strong>@iskolarngbayan.pup.edu.ph</strong> email for automated directory validation.`;
      } else if (role === 'faculty') {
        // Hide student-only fields
        studentNumberField.classList.add('hidden');
        studentAcademicFields.classList.add('hidden');

        // Update info banner
        infoText.innerHTML = `Faculty accounts authenticate via PUP webmail <strong>@pup.edu.ph</strong>. Position and specialization are automatically mapped to CCIS instructional scheduling.`;
      }
    });
  });

  /* ---------- Show / Hide Password ---------- */
  const toggleButtons = document.querySelectorAll('.toggle-password');
  toggleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;

      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';

      // Optional: swap icon opacity for feedback
      btn.style.opacity = isPassword ? '1' : '0.6';
    });
  });

  /* ---------- Password Strength Meter ---------- */
  const passwordInput = document.getElementById('password');
  const strengthBar = document.getElementById('strengthBar');
  const strengthLabel = document.getElementById('strengthLabel');

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

  /* ---------- Form Validation ---------- */
  const form = document.getElementById('signupForm');
  const passwordError = document.getElementById('passwordError');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const terms = document.getElementById('terms').checked;

    // Reset error
    passwordError.classList.add('hidden');

    // Validate passwords match
    if (password !== confirmPassword) {
      passwordError.classList.remove('hidden');
      return;
    }

    // Validate terms
    if (!terms) {
      alert('Please agree to the Terms of Service and Privacy Policy.');
      return;
    }

    // Simulate successful submission
    alert('Account created! Please check your email to verify your account.');
    // In real app: form.submit() or fetch() to backend
  });
});