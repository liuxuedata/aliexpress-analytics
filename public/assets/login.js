const loginStates = {
  LOGGED_OUT: 'logged_out',
  LOGGING_IN: 'logging_in',
  LOGGED_IN: 'logged_in',
  LOGIN_ERROR: 'login_error'
};

let currentLoginState = loginStates.LOGGED_OUT;

function setLoginState(state, userData) {
  currentLoginState = state;
  updateLoginUI(state, userData);
}

function updateLoginUI(state, userData = {}) {
  const submitBtn = document.getElementById('loginSubmit');
  const overlay = document.getElementById('loginOverlay');
  switch (state) {
    case loginStates.LOGGING_IN:
      submitBtn.classList.add('button-loading');
      break;
    case loginStates.LOGGED_IN:
      localStorage.setItem('user', JSON.stringify(userData));
      submitBtn.classList.remove('button-loading');
      if (window.location.pathname.endsWith('login.html')) {
        window.location.href = 'index.html';
      } else if (overlay) {
        overlay.style.display = 'none';
        window.dispatchEvent(new Event('user-login'));
      }
      break;
    case loginStates.LOGIN_ERROR:
      submitBtn.classList.remove('button-loading');
      break;
    default:
      submitBtn && submitBtn.classList.remove('button-loading');
  }
}

function showLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'block';
}

function hideLoginOverlay() {
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!validateEmail(email) || !validatePassword(password)) {
    showNotification('邮箱或密码格式错误', 'error');
    return;
  }
  setLoginState(loginStates.LOGGING_IN);
  setTimeout(() => {
    if (email === 'demo@example.com' && password === 'demo123') {
      const userData = { email, name: '演示用户', role: 'demo' };
      showNotification('登录成功！', 'success');
      setLoginState(loginStates.LOGGED_IN, userData);
    } else {
      showNotification('邮箱或密码错误', 'error');
      setLoginState(loginStates.LOGIN_ERROR);
    }
  }, 800);
}

const validationRules = {
  email: {
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  password: {
    required: true,
    minLength: 6
  }
};

function validateEmail(value) {
  const rule = validationRules.email;
  return rule.pattern.test(value);
}
function validatePassword(value) {
  return value.length >= validationRules.password.minLength;
}

function showNotification(message, type = 'info', duration = 3000) {
  const config = {
    success: { bg: 'var(--success-color)' },
    error: { bg: 'var(--error-color)' },
    info: { bg: 'var(--info-color)' },
    warning: { bg: 'var(--warning-color)' }
  }[type];
  const note = document.createElement('div');
  note.textContent = message;
  note.style.position = 'fixed';
  note.style.right = '1rem';
  note.style.top = '1rem';
  note.style.padding = '0.75rem 1rem';
  note.style.borderRadius = '0.5rem';
  note.style.color = '#fff';
  note.style.background = config.bg;
  note.style.zIndex = '100';
  document.body.appendChild(note);
  setTimeout(() => { note.remove(); }, duration);
}

function togglePasswordVisibility() {
  const pwd = document.getElementById('password');
  pwd.type = pwd.type === 'password' ? 'text' : 'password';
}

function setupForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;
  form.addEventListener('submit', handleLogin);
  fillDemoAccount();
  document.getElementById('password-toggle').addEventListener('click', togglePasswordVisibility);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (window.location.pathname.endsWith('login.html')) {
        window.location.href = 'index.html';
      } else {
        hideLoginOverlay();
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', setupForm);
function fillDemoAccount(){
  document.getElementById('email').value='demo@example.com';
  document.getElementById('password').value='demo123';
}
