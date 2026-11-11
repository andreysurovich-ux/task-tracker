// Подключение к базе Supabase. Здесь только адрес проекта и публичный ключ —
// он рассчитан на то, чтобы лежать в коде страницы. Секретный ключ сюда не класть.
const SUPABASE_URL = 'https://ozhrtdbbhdxyizienbei.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qpxWCYApOy2Oy_YAVPuPOA_W02vPtT2';
const TASKS_URL = SUPABASE_URL + '/rest/v1/tasks';

// Ключ, под которым задачи раньше хранились в браузере (нужен для переноса в базу)
const OLD_STORAGE_KEY = 'task-tracker.tasks';

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

let tasks = [];
let loaded = false;
let statusFilter = 'all';
let priorityFilter = 'all';

// Запрос к базе. Возвращает данные или выбрасывает ошибку.
async function api(query, options = {}) {
  const response = await fetch(TASKS_URL + query, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
  });
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

render();
loadTasks();
