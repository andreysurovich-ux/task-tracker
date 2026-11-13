// Подключение к базе Supabase. Здесь только адрес проекта и публичный ключ —
// он рассчитан на то, чтобы лежать в коде страницы. Секретный ключ сюда не класть.
const SUPABASE_URL = 'https://ozhrtdbbhdxyizienbei.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qpxWCYApOy2Oy_YAVPuPOA_W02vPtT2';
const TASKS_URL = SUPABASE_URL + '/rest/v1/tasks';
const AUTH_URL = SUPABASE_URL + '/auth/v1/';

// Ключ, под которым задачи раньше хранились в браузере (нужен для переноса в базу)
const OLD_STORAGE_KEY = 'task-tracker.tasks';
// Ключ, под которым браузер запоминает вход
const SESSION_KEY = 'task-tracker.session';

const PRIORITIES = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };
const STATUSES = { new: 'Новая', progress: 'В работе', done: 'Готово' };

const form = document.getElementById('task-form');
const titleInput = document.getElementById('task-title');
const priorityInput = document.getElementById('task-priority');
const addButton = form.querySelector('button[type="submit"]');
const formError = document.getElementById('form-error');
const message = document.getElementById('message');
const list = document.getElementById('task-list');
const counter = document.getElementById('counter');
const empty = document.getElementById('empty');
const statusFilters = document.getElementById('status-filters');
const priorityFilters = document.getElementById('priority-filters');
const appView = document.getElementById('app-view');
const logoutButton = document.getElementById('logout');
const loginForm = document.getElementById('login-form');
const loginEmail = document.getElementById('login-email');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const passwordForm = document.getElementById('password-form');
const newPassword = document.getElementById('new-password');
const newPasswordRepeat = document.getElementById('new-password-repeat');
const passwordError = document.getElementById('password-error');

let tasks = [];
let loaded = false;
let statusFilter = 'all';
let priorityFilter = 'all';
let session = readSession();

// ---------- Вход ----------

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY));
  } catch (e) {
    return null;
  }
}

function saveSession(data) {
  session = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600),
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    // Не запомним вход — придётся входить заново после перезагрузки
  }
}

function clearSession() {
  session = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    // Нечего очищать
  }
}

// Запрос к сервису входа Supabase
async function authRequest(path, { method = 'POST', body, token } = {}) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(AUTH_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.msg || data.error_description || 'Ошибка входа');
    error.code = data.error_code || data.error;
    throw error;
  }
  return data;
}

// Свежий пропуск для запросов к базе (обновляется сам, когда истекает)
async function getAccessToken() {
  if (!session) throw new Error('Нет входа');
  if (session.expires_at - 60 < Date.now() / 1000) {
    try {
      saveSession(await authRequest('token?grant_type=refresh_token', {
        body: { refresh_token: session.refresh_token },
      }));
    } catch (e) {
      signedOut('Время входа истекло. Войдите снова.');
      throw e;
    }
  }
  return session.access_token;
}

function showView(name) {
  loginForm.hidden = name !== 'login';
  passwordForm.hidden = name !== 'password';
  appView.hidden = name !== 'app';
  logoutButton.hidden = name !== 'app';
}

function showLogin(text) {
  showView('login');
  loginError.textContent = text || '';
  loginError.hidden = !text;
  loginPassword.value = '';
  (loginEmail.value ? loginPassword : loginEmail).focus();
}

function signedOut(text) {
  clearSession();
  tasks = [];
  loaded = false;
  hideMessage();
  render();
  showLogin(text);
}

function showApp() {
  showView('app');
  render();
  loadTasks();
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  loginError.hidden = true;
  try {
    saveSession(await authRequest('token?grant_type=password', {
      body: { email: loginEmail.value.trim(), password: loginPassword.value },
    }));
    loginPassword.value = '';
    showApp();
  } catch (e) {
    loginError.textContent =
      e.code === 'invalid_credentials'
        ? 'Неверная почта или пароль.'
        : 'Не удалось войти. Проверьте интернет и попробуйте ещё раз.';
    loginError.hidden = false;
  }
  button.disabled = false;
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  passwordError.hidden = true;
  if (newPassword.value.length < 8) {
    passwordError.textContent = 'Пароль должен быть не короче 8 символов.';
    passwordError.hidden = false;
    return;
  }
  if (newPassword.value !== newPasswordRepeat.value) {
    passwordError.textContent = 'Пароли не совпадают.';
    passwordError.hidden = false;
    return;
  }

  const button = passwordForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await authRequest('user', {
      method: 'PUT',
      body: { password: newPassword.value },
      token: await getAccessToken(),
    });
    newPassword.value = '';
    newPasswordRepeat.value = '';
    showApp();
  } catch (e) {
    passwordError.textContent =
      e.code === 'same_password'
        ? 'Этот пароль уже установлен. Придумайте другой.'
        : e.code === 'weak_password'
          ? 'Слишком простой пароль. Придумайте посложнее.'
          : 'Не удалось сохранить пароль. Попробуйте ещё раз.';
    passwordError.hidden = false;
  }
  button.disabled = false;
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await authRequest('logout', { token: session && session.access_token });
  } catch (e) {
    // Даже если сервис не ответил, в этом браузере вход забываем
  }
  logoutButton.disabled = false;
  signedOut();
});

// ---------- Задачи ----------

// Запрос к базе. Возвращает данные или выбрасывает ошибку.
async function api(query, options = {}) {
  const response = await fetch(TASKS_URL + query, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + (await getAccessToken()),
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
  });
  if (response.status === 401) {
    signedOut('Время входа истекло. Войдите снова.');
    throw new Error('Нет входа');
  }
  if (!response.ok) {
    throw new Error('Ошибка базы: ' + response.status);
  }
  return response.status === 204 ? null : response.json();
}

function showMessage(text) {
  message.textContent = text;
  message.hidden = false;
}

function hideMessage() {
  message.hidden = true;
}

function fetchTasks() {
  return api('?select=id,title,status,priority,created_at&order=created_at.desc');
}

// Однократный перенос задач, которые раньше хранились в этом браузере
async function migrateLocalTasks(existing) {
  let saved = null;
  try {
    saved = localStorage.getItem(OLD_STORAGE_KEY);
  } catch (e) {
    return false;
  }
  if (saved === null) return false;

  let old = [];
  try {
    old = JSON.parse(saved);
  } catch (e) {
    // Повреждённые данные переносить не из чего
  }

  // Задачи с такими же названиями уже есть в базе (например, примерные) — их пропускаем
  const known = new Set(existing.map((t) => t.title));
  const toMove = (Array.isArray(old) ? old : [])
    .filter((t) => t && typeof t.title === 'string' && t.title.trim() && !known.has(t.title))
    .map((t) => ({
      title: t.title.trim().slice(0, 200),
      priority: PRIORITIES[t.priority] ? t.priority : 'medium',
      status: STATUSES[t.status] ? t.status : 'new',
    }));

  if (toMove.length > 0) {
    await api('', { method: 'POST', body: JSON.stringify(toMove) });
  }
  try {
    localStorage.removeItem(OLD_STORAGE_KEY);
  } catch (e) {
    // Не страшно: повторный перенос пропустит уже перенесённые задачи
  }
  return toMove.length > 0;
}

async function loadTasks() {
  try {
    tasks = await fetchTasks();
    if (await migrateLocalTasks(tasks)) {
      tasks = await fetchTasks();
    }
    loaded = true;
    hideMessage();
  } catch (e) {
    if (!session) return;
    showMessage('Не удалось загрузить задачи. Проверьте интернет и обновите страницу.');
  }
  render();
}

function render() {
  const visible = tasks.filter(
    (t) =>
      (statusFilter === 'all' || t.status === statusFilter) &&
      (priorityFilter === 'all' || t.priority === priorityFilter)
  );

  list.innerHTML = '';
  visible.forEach((task) => list.appendChild(renderTask(task)));

  if (!loaded) {
    counter.textContent = message.hidden ? 'Загрузка задач…' : '';
    empty.hidden = true;
    return;
  }

  counter.textContent =
    visible.length === tasks.length
      ? `Задач в списке: ${tasks.length}`
      : `Показано ${visible.length} из ${tasks.length}`;

  if (tasks.length === 0) {
    empty.textContent = 'Задач пока нет';
    empty.hidden = false;
  } else if (visible.length === 0) {
    empty.textContent = 'Нет задач под выбранные фильтры';
    empty.hidden = false;
  } else {
    empty.hidden = true;
  }
}

function renderTask(task) {
  const li = document.createElement('li');
  li.className = 'card task' + (task.status === 'done' ? ' done' : '');

  const main = document.createElement('div');
  main.className = 'task-main';

  const title = document.createElement('p');
  title.className = 'task-title';
  title.textContent = task.title;

  const badge = document.createElement('span');
  badge.className = 'badge ' + task.priority;
  badge.textContent = PRIORITIES[task.priority];

  main.append(title, badge);

  const status = document.createElement('select');
  status.className = 'task-status';
  status.setAttribute('aria-label', 'Статус задачи');
  Object.entries(STATUSES).forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.selected = value === task.status;
    status.appendChild(option);
  });
  status.addEventListener('change', async () => {
    const previous = task.status;
    task.status = status.value;
    render();
    try {
      await api('?id=eq.' + task.id, {
        method: 'PATCH',
        body: JSON.stringify({ status: task.status }),
      });
      hideMessage();
    } catch (e) {
      task.status = previous;
      showMessage('Не удалось изменить статус. Попробуйте ещё раз.');
      render();
    }
  });

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn-delete';
  del.title = 'Удалить задачу';
  del.setAttribute('aria-label', 'Удалить задачу');
  del.textContent = '✕';
  del.addEventListener('click', async () => {
    del.disabled = true;
    try {
      await api('?id=eq.' + task.id, { method: 'DELETE' });
      tasks = tasks.filter((t) => t.id !== task.id);
      hideMessage();
    } catch (e) {
      del.disabled = false;
      showMessage('Не удалось удалить задачу. Попробуйте ещё раз.');
    }
    render();
  });

  li.append(main, status, del);
  return li;
}

// Добавление задачи (кнопка «Добавить» и клавиша Enter)
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();

  if (!title) {
    formError.hidden = false;
    titleInput.focus();
    return;
  }

  addButton.disabled = true;
  try {
    const [created] = await api('', {
      method: 'POST',
      body: JSON.stringify({ title, priority: priorityInput.value, status: 'new' }),
    });
    tasks.unshift(created);
    titleInput.value = '';
    formError.hidden = true;
    hideMessage();
    render();
  } catch (e) {
    showMessage('Не удалось добавить задачу. Попробуйте ещё раз.');
  }
  addButton.disabled = false;
  titleInput.focus();
});

titleInput.addEventListener('input', () => {
  formError.hidden = true;
});

function setupFilter(group, onChange) {
  group.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;
    group.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
    onChange(chip.dataset.value);
    render();
  });
}

setupFilter(statusFilters, (value) => (statusFilter = value));
setupFilter(priorityFilters, (value) => (priorityFilter = value));

// ---------- Запуск ----------

function start() {
  // Сюда возвращает ссылка из письма Supabase: пропуск приходит в адресе страницы
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has('access_token') || params.has('error')) {
    history.replaceState(null, '', location.pathname + location.search);
  }

  if (params.has('access_token')) {
    saveSession({
      access_token: params.get('access_token'),
      refresh_token: params.get('refresh_token'),
      expires_in: params.get('expires_in'),
    });
    const type = params.get('type');
    if (type === 'invite' || type === 'recovery') {
      showView('password');
      newPassword.focus();
      return;
    }
    showApp();
    return;
  }

  if (params.has('error')) {
    showLogin('Ссылка из письма устарела или уже использована.');
    return;
  }

  if (session) {
    showApp();
  } else {
    showLogin();
  }
}

render();
start();
