// Ключ, под которым задачи хранятся в браузере
const STORAGE_KEY = 'task-tracker.tasks';

const PRIORITIES = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };
const STATUSES = { new: 'Новая', progress: 'В работе', done: 'Готово' };

const SAMPLE_TASKS = [
  { title: 'Подготовить отчёт по операционным показателям', priority: 'high', status: 'progress' },
  { title: 'Согласовать график отпусков команды', priority: 'medium', status: 'new' },
  { title: 'Разобрать входящую почту', priority: 'low', status: 'done' },
];

const form = document.getElementById('task-form');
const titleInput = document.getElementById('task-title');
const priorityInput = document.getElementById('task-priority');
const formError = document.getElementById('form-error');
const list = document.getElementById('task-list');
const counter = document.getElementById('counter');
const empty = document.getElementById('empty');
const statusFilters = document.getElementById('status-filters');
const priorityFilters = document.getElementById('priority-filters');

let tasks = loadTasks();
let statusFilter = 'all';
let priorityFilter = 'all';

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadTasks() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    // Хранилище недоступно — работаем без сохранения
  }

  // Первый запуск: в хранилище ещё ничего нет — добавляем примеры
  if (saved === null) {
    return SAMPLE_TASKS.map((t) => ({ ...t, id: makeId() }));
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (e) {
    // Не удалось сохранить — задачи останутся до перезагрузки
  }
}

function render() {
  const visible = tasks.filter(
    (t) =>
      (statusFilter === 'all' || t.status === statusFilter) &&
      (priorityFilter === 'all' || t.priority === priorityFilter)
  );

  list.innerHTML = '';
  visible.forEach((task) => list.appendChild(renderTask(task)));

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
  status.addEventListener('change', () => {
    task.status = status.value;
    saveTasks();
    render();
  });

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn-delete';
  del.title = 'Удалить задачу';
  del.setAttribute('aria-label', 'Удалить задачу');
  del.textContent = '✕';
  del.addEventListener('click', () => {
    tasks = tasks.filter((t) => t.id !== task.id);
    saveTasks();
    render();
  });

  li.append(main, status, del);
  return li;
}

// Добавление задачи (кнопка «Добавить» и клавиша Enter)
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = titleInput.value.trim();

  if (!title) {
    formError.hidden = false;
    titleInput.focus();
    return;
  }

  tasks.unshift({ id: makeId(), title, priority: priorityInput.value, status: 'new' });
  saveTasks();
  titleInput.value = '';
  formError.hidden = true;
  titleInput.focus();
  render();
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

saveTasks();
render();
