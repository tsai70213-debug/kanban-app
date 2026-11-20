/**
 * 極簡暖色看板待辦清單 (Kanban Todo List)
 * 支援功能：新增任務、負責人標籤、工作/生活分類篩選、To-do / Process / Done 三欄自由拖曳、LocalStorage 本地儲存
 */

const STORAGE_KEY = 'minimal_todos_v1';

const CATEGORY_MAP = {
  work: { label: '工作', badgeClass: 'badge-work' },
  life: { label: '生活', badgeClass: 'badge-life' }
};

const PRIORITY_MAP = {
  high: { label: 'High', badgeClass: 'badge-prio-high', weight: 3 },
  medium: { label: 'Medium', badgeClass: 'badge-prio-medium', weight: 2 },
  low: { label: 'Low', badgeClass: 'badge-prio-low', weight: 1 }
};

const VALID_STATUSES = ['todo', 'process', 'done'];
const VALID_PRIORITIES = ['high', 'medium', 'low'];

// 應用程式狀態
let todos = [];
let currentFilter = 'all'; // 'all' | 'work' | 'life'
let draggedTodoId = null;

// DOM 元素參照
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoAssigneeInput = document.getElementById('todo-assignee');
const appFooter = document.getElementById('app-footer');
const remainingCountEl = document.getElementById('remaining-count');
const clearCompletedBtn = document.getElementById('clear-completed-btn');
const statsSummaryEl = document.getElementById('stats-summary');
const currentDateEl = document.getElementById('current-date');
const filterTabs = document.querySelectorAll('.filter-tab');
const countAllEl = document.getElementById('count-all');
const countWorkEl = document.getElementById('count-work');
const countLifeEl = document.getElementById('count-life');

// 三欄容器與計數器
const columnLists = {
  todo: document.getElementById('list-todo'),
  process: document.getElementById('list-process'),
  done: document.getElementById('list-done')
};

const columnCounts = {
  todo: document.getElementById('count-status-todo'),
  process: document.getElementById('count-status-process'),
  done: document.getElementById('count-status-done')
};

const boardColumns = document.querySelectorAll('.board-column');

/**
 * 初始化應用程式
 */
function init() {
  renderCurrentDate();
  loadTodos();
  bindEvents();
  render();
}

/**
 * 顯示今日日期 (例如：11月12日 星期四)
 */
function renderCurrentDate() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('zh-TW', {
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  });
  currentDateEl.textContent = formatter.format(now);
}

/**
 * 依優先程度 (High -> Medium -> Low) 穩定排序任務清單
 */
function sortTodosByPriority() {
  todos.sort((a, b) => {
    const weightA = PRIORITY_MAP[a.priority]?.weight || PRIORITY_MAP.medium.weight;
    const weightB = PRIORITY_MAP[b.priority]?.weight || PRIORITY_MAP.medium.weight;
    return weightB - weightA;
  });
}

/**
 * 從 LocalStorage 讀取任務資料 (向下相容舊版 completed 與 priority 欄位)
 */
function loadTodos() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      todos = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      todos = parsed
        .filter(
          (item) =>
            item &&
            typeof item.id === 'string' &&
            typeof item.text === 'string' &&
            (item.category === 'work' || item.category === 'life')
        )
        .map((item) => {
          const status = VALID_STATUSES.includes(item.status)
            ? item.status
            : item.completed
              ? 'done'
              : 'todo';
          const priority = VALID_PRIORITIES.includes(item.priority)
            ? item.priority
            : 'medium';
          return {
            ...item,
            assignee: typeof item.assignee === 'string' ? item.assignee : '',
            priority,
            status,
            completed: status === 'done'
          };
        });
      sortTodosByPriority();
    }
  } catch (err) {
    console.error('無法讀取本地儲存的待辦事項：', err);
    todos = [];
  }
}

/**
 * 將任務資料寫入 LocalStorage
 */
function saveTodos() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch (err) {
    console.error('無法儲存待辦事項至 LocalStorage：', err);
  }
}

/**
 * 新增待辦事項 (預設進入 To-do 欄位，並依優先程度排序)
 * @param {string} text 任務內容
 * @param {'work' | 'life'} category 任務分類
 * @param {string} assignee 負責人名稱
 * @param {'high' | 'medium' | 'low'} priority 優先程度
 */
function addTodo(text, category, assignee = '', priority = 'medium') {
  const trimmed = text.trim();
  if (!trimmed) return;

  const validCategory = category === 'life' ? 'life' : 'work';
  const validPriority = VALID_PRIORITIES.includes(priority) ? priority : 'medium';
  const trimmedAssignee = assignee.trim();
  const newTodo = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text: trimmed,
    category: validCategory,
    assignee: trimmedAssignee,
    priority: validPriority,
    status: 'todo',
    completed: false,
    createdAt: Date.now()
  };

  todos.unshift(newTodo);
  sortTodosByPriority();
  saveTodos();
  render();
}

/**
 * 更新任務狀態與排序位置 (支援跨欄拖曳，並在各欄內維持 High -> Medium -> Low 優先度排序)
 * @param {string} id 被拖曳的任務 ID
 * @param {'todo' | 'process' | 'done'} newStatus 目標欄位狀態
 * @param {string | null} beforeId 插入在哪一張卡片之前 (null 代表放到該欄最後)
 */
function moveTodo(id, newStatus, beforeId = null) {
  if (!VALID_STATUSES.includes(newStatus)) return;

  const index = todos.findIndex((item) => item.id === id);
  if (index === -1) return;

  const [movedItem] = todos.splice(index, 1);
  movedItem.status = newStatus;
  movedItem.completed = newStatus === 'done';

  if (beforeId && beforeId !== id) {
    const targetIndex = todos.findIndex((item) => item.id === beforeId);
    if (targetIndex !== -1) {
      todos.splice(targetIndex, 0, movedItem);
    } else {
      todos.push(movedItem);
    }
  } else {
    todos.push(movedItem);
  }

  sortTodosByPriority();
  saveTodos();
  render();
}

/**
 * 刪除單一任務
 * @param {string} id 任務 ID
 */
function deleteTodo(id) {
  todos = todos.filter((item) => item.id !== id);
  saveTodos();
  render();
}

/**
 * 清除所有 Done 欄位的任務
 */
function clearCompleted() {
  todos = todos.filter((item) => item.status !== 'done');
  saveTodos();
  render();
}

/**
 * 設定分類篩選器
 * @param {'all' | 'work' | 'life'} filter
 */
function setFilter(filter) {
  currentFilter = filter;
  filterTabs.forEach((tab) => {
    const isActive = tab.dataset.filter === filter;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  render();
}

/**
 * 建立單一可拖曳任務卡片 DOM 節點
 * @param {Object} todo
 * @returns {HTMLDivElement}
 */
function createTodoCard(todo) {
  const card = document.createElement('div');
  card.className = `todo-card status-${todo.status}`;
  card.dataset.id = todo.id;
  card.draggable = true;

  // 卡片頂部列：分類徽章 + 負責人標籤 + 刪除按鈕
  const topRow = document.createElement('div');
  topRow.className = 'card-top-row';

  const badgesGroup = document.createElement('div');
  badgesGroup.className = 'card-badges';

  // 優先程度徽章 (High / Medium / Low)
  const priorityInfo = PRIORITY_MAP[todo.priority] || PRIORITY_MAP.medium;
  const prioBadge = document.createElement('span');
  prioBadge.className = `priority-badge ${priorityInfo.badgeClass}`;
  prioBadge.title = `優先程度：${priorityInfo.label}`;
  prioBadge.textContent = priorityInfo.label;
  badgesGroup.appendChild(prioBadge);

  // 分類標籤徽章
  const categoryInfo = CATEGORY_MAP[todo.category] || CATEGORY_MAP.work;
  const badge = document.createElement('span');
  badge.className = `category-badge ${categoryInfo.badgeClass}`;
  badge.textContent = categoryInfo.label;
  badgesGroup.appendChild(badge);

  // 負責人標籤 (若有填寫則顯示)
  if (typeof todo.assignee === 'string' && todo.assignee.trim() !== '') {
    const assigneeBadge = document.createElement('span');
    assigneeBadge.className = 'assignee-badge';
    assigneeBadge.title = `負責人：${todo.assignee.trim()}`;
    assigneeBadge.textContent = `@${todo.assignee.trim()}`;
    badgesGroup.appendChild(assigneeBadge);
  }

  // 刪除按鈕
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-btn';
  deleteBtn.setAttribute('aria-label', `刪除「${todo.text}」`);
  deleteBtn.title = '刪除任務';
  deleteBtn.textContent = '×';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTodo(todo.id);
  });

  topRow.appendChild(badgesGroup);
  topRow.appendChild(deleteBtn);

  // 任務內容文字
  const textDiv = document.createElement('div');
  textDiv.className = 'todo-text';
  textDiv.textContent = todo.text;

  card.appendChild(topRow);
  card.appendChild(textDiv);

  // 綁定卡片拖曳事件
  card.addEventListener('dragstart', (e) => {
    draggedTodoId = todo.id;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', todo.id);
  });

  card.addEventListener('dragend', () => {
    draggedTodoId = null;
    card.classList.remove('dragging');
    boardColumns.forEach((col) => col.classList.remove('drag-over'));
  });

  return card;
}

/**
 * 計算拖曳游標在目標欄位中對應的下一個卡片元素 (用於支援欄內上下插入排序)
 * @param {HTMLElement} container 欄位 dropzone
 * @param {number} y 滑鼠垂直座標
 * @returns {HTMLElement | null}
 */
function getDragAfterElement(container, y) {
  const draggableCards = [...container.querySelectorAll('.todo-card:not(.dragging)')];

  return draggableCards.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

/**
 * 渲染三欄看板畫面與更新統計數據
 */
function render() {
  const totalCount = todos.length;
  const workCount = todos.filter((t) => t.category === 'work').length;
  const lifeCount = todos.filter((t) => t.category === 'life').length;
  const doneCount = todos.filter((t) => t.status === 'done').length;
  const remainingCount = totalCount - doneCount;

  countAllEl.textContent = totalCount;
  countWorkEl.textContent = workCount;
  countLifeEl.textContent = lifeCount;

  statsSummaryEl.textContent =
    totalCount === 0
      ? '0 項待辦'
      : `${remainingCount} 進行與待辦 / 共 ${totalCount} 項`;

  // 根據當前分類篩選條件過濾任務
  const filteredTodos =
    currentFilter === 'all'
      ? todos
      : todos.filter((t) => t.category === currentFilter);

  const emptyPlaceholders = {
    todo: '將任務拖曳至此或新增待辦',
    process: '將執行中的任務拖曳至此',
    done: '將已完成的任務拖曳至此'
  };

  // 分別渲染 To-do, Process, Done 三個欄位
  VALID_STATUSES.forEach((status) => {
    const listEl = columnLists[status];
    const countEl = columnCounts[status];
    const itemsInColumn = filteredTodos.filter((t) => t.status === status);

    countEl.textContent = itemsInColumn.length;
    listEl.innerHTML = '';

    if (itemsInColumn.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'column-empty';
      emptyDiv.textContent = emptyPlaceholders[status];
      listEl.appendChild(emptyDiv);
    } else {
      const fragment = document.createDocumentFragment();
      itemsInColumn.forEach((todo) => {
        fragment.appendChild(createTodoCard(todo));
      });
      listEl.appendChild(fragment);
    }
  });

  // 頁尾統計與清除按鈕狀態控制
  if (totalCount > 0) {
    appFooter.classList.remove('hidden');
    remainingCountEl.textContent = `未完成 ${remainingCount} 項`;
    clearCompletedBtn.disabled = doneCount === 0;
  } else {
    appFooter.classList.add('hidden');
  }
}

/**
 * 綁定表單、篩選器與三欄拖放區事件
 */
function bindEvents() {
  todoForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const selectedCategory = document.querySelector('input[name="category"]:checked')?.value || 'work';
    const selectedPriority = document.querySelector('input[name="priority"]:checked')?.value || 'medium';
    addTodo(todoInput.value, selectedCategory, todoAssigneeInput.value, selectedPriority);
    todoInput.value = '';
    todoAssigneeInput.value = '';
    todoInput.focus();
  });

  filterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const filter = tab.dataset.filter;
      if (filter) setFilter(filter);
    });
  });

  clearCompletedBtn.addEventListener('click', clearCompleted);

  // 為三個看板欄位綁定拖放事件
  boardColumns.forEach((column) => {
    const targetStatus = column.dataset.status;
    const dropzone = column.querySelector('.column-dropzone');

    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      column.classList.add('drag-over');
    });

    column.addEventListener('dragenter', (e) => {
      e.preventDefault();
      column.classList.add('drag-over');
    });

    column.addEventListener('dragleave', (e) => {
      // 僅在滑鼠真正離開該欄位容器時移除高亮
      if (!column.contains(e.relatedTarget)) {
        column.classList.remove('drag-over');
      }
    });

    column.addEventListener('drop', (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');

      const todoId = draggedTodoId || e.dataTransfer.getData('text/plain');
      if (!todoId || !targetStatus) return;

      const afterElement = getDragAfterElement(dropzone, e.clientY);
      const beforeId = afterElement ? afterElement.dataset.id : null;

      moveTodo(todoId, targetStatus, beforeId);
    });
  });
}

// 啟動應用
document.addEventListener('DOMContentLoaded', init);
