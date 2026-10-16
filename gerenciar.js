/**
 * MEOW PLANS - GERENCIADOR CENTRAL
 * Módulo JavaScript vanilla para integração PocketBase, regras de negócio e reatividade do Frontend.
 */

// 1. INICIALIZAÇÃO DO POCKETBASE SDK
const POCKETBASE_URL = 'http://127.0.0.1:8090';
const pb = new PocketBase(POCKETBASE_URL);
// 2. ESTADO GLOBAL
let currentUser = null;
let categoriesCache = [];
let tasksCache = [];
let deletedCategoriesCache = [];
let activeTab = 'tasks'; // 'tasks' | 'categories'
let isTrashMode = false;
let currentSubtasks = [];

// DOM Elements
const elements = {
  tabTasksBtn: document.getElementById('tab-tasks-btn'),
  tabCategoriesBtn: document.getElementById('tab-categories-btn'),
  tasksFiltersWrapper: document.getElementById('tasks-filters-wrapper'),
  searchTextFilter: document.getElementById('search-text-filter'),
  categoryFilterSelect: document.getElementById('category-filter-select'),
  urgencyFilterSelect: document.getElementById('urgency-filter-select'),
  statusFilterSelect: document.getElementById('status-filter-select'),
  tabSectionTitle: document.getElementById('tab-section-title'),
  btnAddAction: document.getElementById('btn-open-add-modal'),
  addBtnLabel: document.getElementById('add-btn-label'),
  tasksListContainer: document.getElementById('tasks-list-container'),
  categoriesListContainer: document.getElementById('categories-list-container'),
  trashListContainer: document.getElementById('trash-list-container'),
  trashHeader: document.getElementById('trash-header'),
  trashTitleLabel: document.getElementById('trash-title-label'),
  btnOpenTrash: document.getElementById('btn-open-trash'),
  btnCloseTrash: document.getElementById('btn-close-trash'),
  logoutBtn: document.getElementById('logout-btn'),

  // Modal Tarefa
  taskModalOverlay: document.getElementById('task-modal-overlay'),
  btnCloseTaskModal: document.getElementById('btn-close-task-modal'),
  taskForm: document.getElementById('task-form'),
  taskIdInput: document.getElementById('task-id'),
  taskCategorySelect: document.getElementById('task-category-select'),
  taskTitleInput: document.getElementById('task-title-input'),
  taskUrgencySelect: document.getElementById('task-urgency-select'),
  taskRoutineToggle: document.getElementById('task-routine-toggle'),
  taskStatusSelect: document.getElementById('task-status-select'),
  recurrenceFreqGroup: document.getElementById('recurrence-freq-group'),
  taskRecurrenceFreq: document.getElementById('task-recurrence-freq'),
  taskExecutionDate: document.getElementById('task-execution-date'),
  taskDueDate: document.getElementById('task-due-date'),
  taskDescriptionInput: document.getElementById('task-description-input'),
  btnAddSubtaskRow: document.getElementById('btn-add-subtask-row'),
  subtaskItemsContainer: document.getElementById('subtask-items-container'),
  btnSaveTask: document.getElementById('btn-save-task'),

  // Modal Categoria
  categoryModalOverlay: document.getElementById('category-modal-overlay'),
  btnCloseCategoryModal: document.getElementById('btn-close-category-modal'),
  categoryForm: document.getElementById('category-form'),
  categoryIdInput: document.getElementById('category-id'),
  categoryNameInput: document.getElementById('category-name-input'),
  categoryColorSelect: document.getElementById('category-color-select'),
  categoryDescriptionInput: document.getElementById('category-description-input'),
  btnSaveCategory: document.getElementById('btn-save-category')
};

// ==========================================
// 3. INICIALIZAÇÃO E AUTENTICAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  checkAuthentication();
  setupEventListeners();
  await refreshData();
});

function checkAuthentication() {
  if (!pb.authStore.isValid || !pb.authStore.model) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = pb.authStore.model;
}

// ==========================================
// 4. MÉTODOS DE DADOS DO POCKETBASE
// ==========================================

async function loadCategories() {
  try {
    if (isTrashMode && activeTab === 'categories') {
      deletedCategoriesCache = await pb.collection('categorias').getFullList({
        filter: `user = "${currentUser.id}" && deleted = true`,
        sort: 'nome'
      });
      renderCategories();
      return;
    }

    const records = await pb.collection('categorias').getFullList({
      filter: `user = "${currentUser.id}" && deleted = false`,
      sort: 'nome'
    });
    categoriesCache = records;
    populateCategorySelects();
    renderCategories();
  } catch (err) {
    console.error('Erro ao carregar categorias:', err);
  }
}

async function saveCategory(data) {
  try {
    const payload = {
      nome: data.nome,
      cor: data.cor,
      user: currentUser.id,
      deleted: false
    };

    if (data.id) {
      await pb.collection('categorias').update(data.id, payload);
    } else {
      await pb.collection('categorias').create(payload);
    }

    closeModals();
    await refreshData();
  } catch (err) {
    console.error('Erro ao salvar categoria:', err);
    alert('Não foi possível salvar a categoria. 🐾');
  }
}

/**
 * Soft Delete de Categoria
 */

async function deleteCategory(id) {
  if (!confirm('Deseja mover esta categoria para a lixeira?')) return;
  try {
    await pb.collection('categorias').update(id, { deleted: true });
    // Recarrega apenas os dados mantendo o contexto da aba/lixeira atual
    await refreshData();
  } catch (err) {
    console.error('Erro ao mover categoria para lixeira:', err);
  }
}

async function loadTasks() {
  try {
    const filterQuery = (isTrashMode && activeTab === 'tasks')
      ? `user = "${currentUser.id}" && deleted = true`
      : `user = "${currentUser.id}" && deleted = false`;

    const records = await pb.collection('tarefas').getFullList({
      filter: filterQuery,
      expand: 'categoria',
      sort: '-created'
    });

    const todayStr = new Date().toISOString().split('T')[0];

    for (let task of records) {
      if (!task.deleted && task.data_execucao) {
        const execDateStr = new Date(task.data_execucao).toISOString().split('T')[0];
        if (execDateStr < todayStr && (task.status === 'a_fazer' || task.status === 'em_progresso')) {
          task.status = 'atrasada';
          pb.collection('tarefas').update(task.id, { status: 'atrasada' }).catch(console.error);
        }
      }
    }

    tasksCache = records;
    renderTasks();
  } catch (err) {
    console.error('Erro ao carregar tarefas:', err);
  }
}

async function saveTaskWithSubtasks(taskData, subtasksList) {
  if (taskData.data_execucao && taskData.data_entrega) {
    const execDate = new Date(taskData.data_execucao);
    const dueDate = new Date(taskData.data_entrega);

    if (execDate > dueDate) {
      alert('Atenção: A Data de Execução NUNCA pode ser posterior à Data de Entrega! 🐾');
      return;
    }
  }

  try {
    const taskPayload = {
      titulo: taskData.titulo,
      descricao: taskData.descricao,
      categoria: taskData.categoria,
      data_execucao: taskData.data_execucao ? new Date(taskData.data_execucao).toISOString() : null,
      data_entrega: taskData.data_entrega ? new Date(taskData.data_entrega).toISOString() : null,
      is_recurring: taskData.is_recurring,
      recurrence_freq: taskData.recurrence_freq || 'diario',
      urgencia: taskData.urgencia,
      status: taskData.status,
      user: currentUser.id,
      deleted: false
    };

    let savedTask = null;
    if (taskData.id) {
      savedTask = await pb.collection('tarefas').update(taskData.id, taskPayload);
    } else {
      savedTask = await pb.collection('tarefas').create(taskPayload);
    }

    if (savedTask && subtasksList) {
      const existingSubtasks = taskData.id
        ? await pb.collection('subtarefas').getFullList({ filter: `tarefa = "${savedTask.id}"` })
        : [];

      const currentSubtaskIds = subtasksList.filter(s => s.id).map(s => s.id);

      for (let existing of existingSubtasks) {
        if (!currentSubtaskIds.includes(existing.id)) {
          await pb.collection('subtarefas').delete(existing.id);
        }
      }

      for (let sub of subtasksList) {
        if (sub.id) {
          await pb.collection('subtarefas').update(sub.id, {
            titulo: sub.titulo,
            completa: sub.completa
          });
        } else {
          await pb.collection('subtarefas').create({
            titulo: sub.titulo,
            completa: sub.completa || false,
            tarefa: savedTask.id,
            user: currentUser.id
          });
        }
      }
    }

    closeModals();
    await refreshData();
  } catch (err) {
    console.error('Erro ao salvar tarefa:', err);
    alert('Erro ao salvar tarefa. Verifique os campos. 🐾');
  }
}

async function deleteTask(id) {
  if (!confirm('Deseja mover esta tarefa para a lixeira?')) return;
  try {
    await pb.collection('tarefas').update(id, { deleted: true });
    await refreshData();
  } catch (err) {
    console.error('Erro ao excluir tarefa:', err);
  }
}

/**
 * RESTAURAR ITEM DA LIXEIRA (Soft Delete Undo)
 */
async function restoreItem(id, type) {
  try {
    const collectionName = type === 'task' ? 'tarefas' : 'categorias';
    await pb.collection(collectionName).update(id, { deleted: false });

    // Se estiver no modo Lixeira, recarrega os dados sem fechar ou trocar de aba
    if (isTrashMode) {
      if (type === 'category') {
        await loadCategories();
      } else {
        await loadTasks();
      }
    } else {
      await refreshData();
    }
  } catch (err) {
    console.error('Erro ao restaurar item:', err);
  }
}

// ==========================================
// 5. RENDERIZAÇÃO DE INTERFACE
// ==========================================

function populateCategorySelects() {
  elements.categoryFilterSelect.innerHTML = '<option value="">Categoria: Todas</option>';
  categoriesCache.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.nome;
    elements.categoryFilterSelect.appendChild(opt);
  });

  elements.taskCategorySelect.innerHTML = '<option value="" disabled selected>■ Categoria</option>';
  categoriesCache.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = `■ ${cat.nome}`;
    elements.taskCategorySelect.appendChild(opt);
  });
}

/**
 * Renderiza tarefas com suporte a busca de texto + múltiplos filtros combinados
 */
function renderTasks() {
  if (activeTab !== 'tasks' && !isTrashMode) return;

  const searchText = elements.searchTextFilter.value.trim().toLowerCase();
  const selectedCat = elements.categoryFilterSelect.value;
  const selectedUrg = elements.urgencyFilterSelect.value;
  const selectedStat = elements.statusFilterSelect.value;

  let filtered = tasksCache;

  // Filtros Combinados
  if (!isTrashMode) {
    if (searchText) {
      filtered = filtered.filter(t => 
        (t.titulo && t.titulo.toLowerCase().includes(searchText)) ||
        (t.descricao && t.descricao.toLowerCase().includes(searchText))
      );
    }

    if (selectedCat) {
      filtered = filtered.filter(t => t.categoria === selectedCat);
    }

    if (selectedUrg) {
      filtered = filtered.filter(t => t.urgencia === selectedUrg);
    }

    if (selectedStat) {
      filtered = filtered.filter(t => t.status === selectedStat);
    }
  }

  const container = isTrashMode ? elements.trashListContainer : elements.tasksListContainer;
  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-center text-muted" style="padding: 2rem;">
      Nenhuma tarefa encontrada ${isTrashMode ? 'na lixeira' : ''}. 🐾
    </div>`;
    return;
  }

  filtered.forEach(task => {
    const categoryObj = task.expand?.categoria || {};
    const categoryColor = categoryObj.cor || '#C2BEF6';

    const execDateFormatted = task.data_execucao
      ? new Date(task.data_execucao).toLocaleDateString('pt-BR')
      : '--/--/----';
    const dueDateFormatted = task.data_entrega
      ? new Date(task.data_entrega).toLocaleDateString('pt-BR')
      : '--/--/----';

    const card = document.createElement('div');
    card.className = `task-item-card ${task.deleted ? 'card-deleted' : ''}`;
    card.style.borderLeftColor = categoryColor;

    if (isTrashMode) {
      card.innerHTML = `
        <div class="task-item-info">
          <span class="task-item-title">${escapeHtml(task.titulo)}</span>
          <div class="task-item-dates">
            <span>Fazer: ${execDateFormatted}</span>
            <span>Para: ${dueDateFormatted}</span>
          </div>
        </div>
        <div>
          <button class="btn btn-accent" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="restoreItem('${task.id}', 'task')">
            Restaurar
          </button>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="task-item-info" onclick="openEditTaskModal('${task.id}')" style="cursor: pointer;">
          <div class="flex-row" style="gap: 0.5rem; align-items: center;">
            <span style="font-size: 0.9rem;">🕒</span>
            <span class="task-item-title">${escapeHtml(task.titulo)}</span>
          </div>
          <div class="task-item-dates">
            <span>Fazer: ${execDateFormatted}</span>
            <span>Para: ${dueDateFormatted}</span>
          </div>
        </div>
        <div class="task-item-meta">
          <span class="badge ${getUrgencyBadgeClass(task.urgencia)}">${task.urgencia || 'normal'}</span>
          <button class="btn-link" style="color: var(--color-danger); font-size: 0.85rem;" onclick="deleteTask('${task.id}')" title="Excluir">
            🗑️
          </button>
        </div>
      `;
    }

    container.appendChild(card);
  });
}

function renderCategories() {
  if (activeTab !== 'categories' && !isTrashMode) return;

  const listToRender = isTrashMode ? deletedCategoriesCache : categoriesCache;
  const container = isTrashMode ? elements.trashListContainer : elements.categoriesListContainer;
  container.innerHTML = '';

  if (listToRender.length === 0) {
    container.innerHTML = `<div class="text-center text-muted" style="padding: 2rem;">
      Nenhuma categoria encontrada ${isTrashMode ? 'na lixeira' : ''}. 🐾
    </div>`;
    return;
  }

  listToRender.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'category-item-card';

    if (isTrashMode) {
      card.innerHTML = `
        <div class="category-item-content">
          <div class="category-color-badge" style="background-color: ${cat.cor || '#C2BEF6'};"></div>
          <span style="font-weight: 700;">${escapeHtml(cat.nome)}</span>
        </div>
        <button class="btn btn-accent" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;" onclick="restoreItem('${cat.id}', 'category')">
          Restaurar
        </button>
      `;
    } else {
      card.innerHTML = `
        <div class="category-item-content" onclick="openEditCategoryModal('${cat.id}')" style="cursor: pointer; flex: 1;">
          <div class="category-color-badge" style="background-color: ${cat.cor || '#C2BEF6'};"></div>
          <span style="font-weight: 700; color: var(--color-text-dark);">${escapeHtml(cat.nome)}</span>
        </div>
        <div>
          <button class="btn-link" style="color: var(--color-danger);" onclick="deleteCategory('${cat.id}')" title="Excluir">
            🗑️
          </button>
        </div>
      `;
    }

    container.appendChild(card);
  });
}

function renderSubtaskModalRows() {
  elements.subtaskItemsContainer.innerHTML = '';

  currentSubtasks.forEach((sub, index) => {
    const row = document.createElement('div');
    row.className = 'subtask-item-row';
    row.innerHTML = `
      <div class="flex-row" style="gap: 0.5rem; flex: 1;">
        <input type="checkbox" ${sub.completa ? 'checked' : ''} onchange="toggleSubtaskStatus(${index}, this.checked)">
        <input type="text" class="input-control" value="${escapeHtml(sub.titulo)}" style="min-height: 30px; padding: 0.2rem 0.5rem; font-size: 0.85rem;" onchange="updateSubtaskTitle(${index}, this.value)" placeholder="Título da subtarefa">
      </div>
      <button type="button" class="btn-link" style="color: var(--color-danger); margin-left: 0.5rem;" onclick="removeSubtaskRow(${index})">✕</button>
    `;
    elements.subtaskItemsContainer.appendChild(row);
  });
}

// ==========================================
// 6. EVENT LISTENERS E NAVEGAÇÃO
// ==========================================

function setupEventListeners() {
  elements.tabTasksBtn.addEventListener('click', () => switchTab('tasks'));
  elements.tabCategoriesBtn.addEventListener('click', () => switchTab('categories'));

  elements.btnAddAction.addEventListener('click', () => {
    if (activeTab === 'tasks') {
      openAddTaskModal();
    } else {
      openAddCategoryModal();
    }
  });

  elements.btnCloseTaskModal.addEventListener('click', closeModals);
  elements.btnCloseCategoryModal.addEventListener('click', closeModals);

  elements.btnOpenTrash.addEventListener('click', openTrashView);
  elements.btnCloseTrash.addEventListener('click', closeTrashView);

  elements.logoutBtn.addEventListener('click', () => {
    pb.authStore.clear();
    window.location.href = 'login.html';
  });

  // Listeners para os Filtros Combinados da Aba de Tarefas
  elements.searchTextFilter.addEventListener('input', renderTasks);
  elements.categoryFilterSelect.addEventListener('change', renderTasks);
  elements.urgencyFilterSelect.addEventListener('change', renderTasks);
  elements.statusFilterSelect.addEventListener('change', renderTasks);

  elements.categoryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveCategory({
      id: elements.categoryIdInput.value,
      nome: elements.categoryNameInput.value.trim(),
      cor: elements.categoryColorSelect.value,
      descricao: elements.categoryDescriptionInput.value.trim()
    });
  });

  elements.taskForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const taskData = {
      id: elements.taskIdInput.value,
      categoria: elements.taskCategorySelect.value,
      titulo: elements.taskTitleInput.value.trim(),
      urgencia: elements.taskUrgencySelect.value,
      is_recurring: elements.taskRoutineToggle.checked,
      recurrence_freq: elements.taskRecurrenceFreq.value,
      status: elements.taskStatusSelect.value,
      data_execucao: elements.taskExecutionDate.value,
      data_entrega: elements.taskDueDate.value,
      descricao: elements.taskDescriptionInput.value.trim()
    };

    saveTaskWithSubtasks(taskData, currentSubtasks);
  });

  elements.taskRoutineToggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      elements.recurrenceFreqGroup.classList.remove('hidden');
    } else {
      elements.recurrenceFreqGroup.classList.add('hidden');
    }
  });

  elements.btnAddSubtaskRow.addEventListener('click', () => {
    currentSubtasks.push({ id: null, titulo: '', completa: false });
    renderSubtaskModalRows();
  });
}

function switchTab(tab) {
  activeTab = tab;
  isTrashMode = false;
  elements.trashHeader.classList.add('hidden');

  if (tab === 'tasks') {
    elements.tabTasksBtn.classList.add('active');
    elements.tabCategoriesBtn.classList.remove('active');
    elements.tasksListContainer.classList.remove('hidden');
    elements.categoriesListContainer.classList.add('hidden');
    elements.trashListContainer.classList.add('hidden');
    elements.tasksFiltersWrapper.style.display = 'flex';
    elements.tabSectionTitle.textContent = 'Minhas Tarefas';
    elements.addBtnLabel.textContent = 'Adicionar Tarefa';
  } else {
    elements.tabCategoriesBtn.classList.add('active');
    elements.tabTasksBtn.classList.remove('active');
    elements.categoriesListContainer.classList.remove('hidden');
    elements.tasksListContainer.classList.add('hidden');
    elements.trashListContainer.classList.add('hidden');
    elements.tasksFiltersWrapper.style.display = 'none';
    elements.tabSectionTitle.textContent = 'Minhas Categorias';
    elements.addBtnLabel.textContent = 'Adicionar Categoria';
  }

  refreshData();
}

/**
 * Atualiza os dados da tela respeitando a aba ativa e o estado da lixeira
 */

async function refreshData() {
  if (isTrashMode) {
    if (activeTab === 'categories') {
      await loadCategories();
    } else {
      await loadTasks();
    }
  } else {
    await loadCategories();
    await loadTasks();
  }
}

// ==========================================
// 7. CONTROLE DOS MODAIS E LIXEIRA
// ==========================================

function openAddTaskModal() {
  elements.taskForm.reset();
  elements.taskIdInput.value = '';
  elements.btnSaveTask.textContent = 'Adicionar Tarefa';
  elements.recurrenceFreqGroup.classList.add('hidden');
  currentSubtasks = [];
  renderSubtaskModalRows();
  elements.taskModalOverlay.classList.add('is-active');
}

async function openEditTaskModal(id) {
  const task = tasksCache.find(t => t.id === id);
  if (!task) return;

  elements.taskForm.reset();
  elements.taskIdInput.value = task.id;
  elements.taskCategorySelect.value = task.categoria || '';
  elements.taskTitleInput.value = task.titulo || '';
  elements.taskUrgencySelect.value = task.urgencia || 'normal';
  elements.taskRoutineToggle.checked = task.is_recurring || false;
  elements.taskStatusSelect.value = task.status || 'a_fazer';
  elements.taskRecurrenceFreq.value = task.recurrence_freq || 'diario';
  elements.taskDescriptionInput.value = task.descricao || '';

  if (task.is_recurring) {
    elements.recurrenceFreqGroup.classList.remove('hidden');
  } else {
    elements.recurrenceFreqGroup.classList.add('hidden');
  }

  if (task.data_execucao) {
    elements.taskExecutionDate.value = new Date(task.data_execucao).toISOString().split('T')[0];
  }
  if (task.data_entrega) {
    elements.taskDueDate.value = new Date(task.data_entrega).toISOString().split('T')[0];
  }

  elements.btnSaveTask.textContent = 'Atualizar Tarefa';

  try {
    currentSubtasks = await pb.collection('subtarefas').getFullList({
      filter: `tarefa = "${task.id}"`
    });
  } catch (err) {
    currentSubtasks = [];
  }

  renderSubtaskModalRows();
  elements.taskModalOverlay.classList.add('is-active');
}

function openAddCategoryModal() {
  elements.categoryForm.reset();
  elements.categoryIdInput.value = '';
  elements.btnSaveCategory.textContent = 'Adicionar Categoria';
  elements.categoryModalOverlay.classList.add('is-active');
}

function openEditCategoryModal(id) {
  const category = categoriesCache.find(c => c.id === id);
  if (!category) return;

  elements.categoryIdInput.value = category.id;
  elements.categoryNameInput.value = category.nome || '';
  elements.categoryColorSelect.value = category.cor || '#C2BEF6';
  elements.categoryDescriptionInput.value = category.descricao || '';

  elements.btnSaveCategory.textContent = 'Atualizar Categoria';
  elements.categoryModalOverlay.classList.add('is-active');
}

function closeModals() {
  elements.taskModalOverlay.classList.remove('is-active');
  elements.categoryModalOverlay.classList.remove('is-active');
}

function openTrashView() {
  isTrashMode = true;
  elements.trashHeader.classList.remove('hidden');
  elements.tasksListContainer.classList.add('hidden');
  elements.categoriesListContainer.classList.add('hidden');
  elements.trashListContainer.classList.remove('hidden');

  if (activeTab === 'categories') {
    elements.trashTitleLabel.textContent = 'Lixeira de Categorias';
    loadCategories();
  } else {
    elements.trashTitleLabel.textContent = 'Lixeira de Tarefas';
    loadTasks();
  }
}

function closeTrashView() {
  isTrashMode = false;
  elements.trashHeader.classList.add('hidden');
  elements.trashListContainer.classList.add('hidden');
  switchTab(activeTab);
}

// Helpers para Subtarefas
window.toggleSubtaskStatus = function(index, checked) {
  if (currentSubtasks[index]) {
    currentSubtasks[index].completa = checked;
  }
};

window.updateSubtaskTitle = function(index, value) {
  if (currentSubtasks[index]) {
    currentSubtasks[index].titulo = value;
  }
};

window.removeSubtaskRow = function(index) {
  currentSubtasks.splice(index, 1);
  renderSubtaskModalRows();
};

function getUrgencyBadgeClass(urgency) {
  switch (urgency) {
    case 'baixa': return 'badge-urgency-low';
    case 'normal': return 'badge-urgency-normal';
    case 'alta': return 'badge-urgency-high';
    case 'urgente': return 'badge-urgency-urgent';
    default: return 'badge-urgency-normal';
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}