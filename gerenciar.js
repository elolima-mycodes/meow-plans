/**
 * MEOW PLANS - GERENCIADOR CENTRAL
 * Módulo JavaScript vanilla para integração PocketBase, regras de negócio e reatividade do Frontend.
 * Depende de ui.js (modais, card de tarefa, tema e utilitários).
 */

// 1. INICIALIZAÇÃO DO POCKETBASE SDK
const POCKETBASE_URL = 'http://127.0.0.1:8090';
const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false);

// 2. ESTADO GLOBAL
let currentUser = null;
let categoriesCache = [];
let tasksCache = [];
let deletedCategoriesCache = [];
let routineCompletionsList = [];
let activeTab = 'tasks'; // 'tasks' | 'categories'
let isTrashMode = false;

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

  // Modal Categoria
  categoryModalOverlay: document.getElementById('category-modal-overlay'),
  categoryModalTitle: document.getElementById('category-modal-title'),
  btnCloseCategoryModal: document.getElementById('btn-close-category-modal'),
  categoryForm: document.getElementById('category-form'),
  categoryIdInput: document.getElementById('category-id'),
  categoryNameInput: document.getElementById('category-name-input'),
  categoryColorSelect: document.getElementById('category-color-select'),
  btnSaveCategory: document.getElementById('btn-save-category')
};

// ==========================================
// 3. INICIALIZAÇÃO E AUTENTICAÇÃO
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  initThemeTracker();
  if (!checkAuthentication()) return;

  TaskModal.init({
    getUser: () => currentUser,
    getCategories: () => categoriesCache,
    getTask: (id) => tasksCache.find(t => t.id === id),
    onChange: refreshData
  });
  setupEventListeners();
  await refreshData();
});

function checkAuthentication() {
  const maxInactivityMs = 120 * 60 * 1000; // 120 minutos
  const lastActivity = localStorage.getItem('last_activity');
  const now = Date.now();

  // Se o token for inválido OU se passou do tempo limite sem interação
  if (!pb.authStore.isValid || !pb.authStore.model || (lastActivity && (now - parseInt(lastActivity, 10) > maxInactivityMs))) {
    pb.authStore.clear();
    localStorage.removeItem('last_activity');
    window.location.href = 'login.html';
    return false;
  }

  // Atualiza o timestamp de atividade atual e define o usuário logado
  localStorage.setItem('last_activity', now.toString());
  currentUser = pb.authStore.model;

  renderUserAvatar();
  return true;
}

// ==========================================
// 4. MÉTODOS DE DADOS DO POCKETBASE
// ==========================================

// Executa a operação em 'Categorias' e, se falhar, tenta 'categorias'
async function withCategoryCollection(operation) {
  try {
    return await operation(pb.collection('Categorias'));
  } catch (err) {
    return await operation(pb.collection('categorias'));
  }
}

async function loadCategories() {
  try {
    // As categorias ativas são sempre carregadas (usadas nos cards, filtros e modal)
    categoriesCache = await withCategoryCollection(col => col.getFullList({
      filter: `user = "${currentUser.id}" && (deleted = false || deleted = null)`,
      sort: 'nome'
    }));
    populateCategoryFilter();

    if (isTrashMode && activeTab === 'categories') {
      deletedCategoriesCache = await withCategoryCollection(col => col.getFullList({
        filter: `user = "${currentUser.id}" && deleted = true`,
        sort: 'nome'
      }));
    }

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
      descricao: data.descricao || '',
      user: currentUser.id,
      deleted: false
    };

    await withCategoryCollection(col => data.id ? col.update(data.id, payload) : col.create(payload));

    closeModals();
    await refreshData();
  } catch (err) {
    console.error('Erro ao salvar categoria:', err);
    MeowUI.alert('Não foi possível salvar a categoria.', { title: 'Erro' });
  }
}

// Remove a referência da categoria em todas as tarefas (ativas e na lixeira)
async function unlinkCategoryFromTasks(categoryId) {
  const linkedTasks = await pb.collection('tarefas').getFullList({
    filter: `user = "${currentUser.id}" && categoria = "${categoryId}"`
  });

  for (const task of linkedTasks) {
    await pb.collection('tarefas').update(task.id, { categoria: '' });
  }
}

async function deleteCategory(id) {
  const confirmed = await MeowUI.confirm(
    'Deseja mover esta categoria para a lixeira? As tarefas vinculadas ficarão "Sem categoria".',
    { title: 'Enviar para a lixeira', confirmText: 'Enviar' }
  );
  if (!confirmed) return;

  try {
    await unlinkCategoryFromTasks(id);
    await withCategoryCollection(col => col.update(id, { deleted: true }));
    await refreshData();
  } catch (err) {
    console.error('Erro ao mover categoria para lixeira:', err);
    MeowUI.alert('Não foi possível excluir a categoria.', { title: 'Erro' });
  }
}

async function deleteCategoryPermanently(id) {
  const confirmed = await MeowUI.confirm(
    'Esta categoria será apagada para sempre. Essa ação não pode ser desfeita.',
    { title: 'Excluir permanentemente', confirmText: 'Excluir' }
  );
  if (!confirmed) return;

  try {
    // Desvincula antes de apagar: a relação poderia bloquear a exclusão ou apagar tarefas em cascata
    await unlinkCategoryFromTasks(id);
    await withCategoryCollection(col => col.delete(id));
    await refreshData();
  } catch (err) {
    console.error('Erro ao excluir categoria permanentemente:', err);
    MeowUI.alert('Não foi possível excluir a categoria. Verifique a regra "Delete" da coleção no PocketBase.', { title: 'Erro' });
  }
}

// Busca registros dependentes; coleção ausente (404) não impede a exclusão
async function listTaskDependencies(collectionName, taskId) {
  try {
    return await pb.collection(collectionName).getFullList({ filter: `tarefa = "${taskId}"` });
  } catch (err) {
    if (err.status === 404) return [];
    throw err;
  }
}

async function deleteTaskPermanently(id) {
  const confirmed = await MeowUI.confirm(
    'Esta tarefa e suas subtarefas serão apagadas para sempre. Essa ação não pode ser desfeita.',
    { title: 'Excluir permanentemente', confirmText: 'Excluir' }
  );
  if (!confirmed) return;

  try {
    // Registros que apontam para a tarefa precisam sair primeiro
    for (const collectionName of ['subtarefas', 'conclusoes_rotina']) {
      for (const record of await listTaskDependencies(collectionName, id)) {
        await pb.collection(collectionName).delete(record.id);
      }
    }
    await pb.collection('tarefas').delete(id);
    await refreshData();
  } catch (err) {
    console.error('Erro ao excluir tarefa permanentemente:', err);
    MeowUI.alert('Não foi possível excluir a tarefa. Verifique a regra "Delete" das coleções no PocketBase.', { title: 'Erro' });
  }
}

async function loadTasks() {
  try {
    const filterQuery = (isTrashMode && activeTab === 'tasks')
      ? `user = "${currentUser.id}" && deleted = true`
      : `user = "${currentUser.id}" && (deleted = false || deleted = null)`;

    const records = await pb.collection('tarefas').getFullList({
      filter: filterQuery,
      expand: 'categoria',
      sort: '-created'
    });

    try {
      routineCompletionsList = await pb.collection('conclusoes_rotina').getFullList({
        filter: `user = "${currentUser.id}"`
      });
    } catch (err) {
      routineCompletionsList = [];
    }

    const todayStr = getLocalDateStr();

    tasksCache = await Promise.all(records.map(async (task) => {
      let taskDeliveryStr = task.data_entrega ? task.data_entrega.split(' ')[0] : null;

      if (!task.deleted && !task.is_recurring && taskDeliveryStr && taskDeliveryStr < todayStr && task.status !== 'concluida' && task.status !== 'cancelada' && task.status !== 'atrasada') {
        try {
          await pb.collection('tarefas').update(task.id, { status: 'atrasada' });
          return { ...task, status: 'atrasada' };
        } catch (e) {
          console.error(`Erro ao atualizar atraso da tarefa ${task.id}:`, e);
        }
      }
      return task;
    }));

    renderTasks();
  } catch (err) {
    console.error('Erro ao carregar tarefas:', err);
  }
}

async function restoreItem(id, type) {
  try {
    if (type === 'task') {
      await pb.collection('tarefas').update(id, { deleted: false });
    } else {
      await withCategoryCollection(col => col.update(id, { deleted: false }));
    }
    await refreshData();
  } catch (err) {
    console.error('Erro ao restaurar item:', err);
    MeowUI.alert('Não foi possível restaurar o item.', { title: 'Erro' });
  }
}

// ==========================================
// 5. RENDERIZAÇÃO DE INTERFACE
// ==========================================

function populateCategoryFilter() {
  const selected = elements.categoryFilterSelect.value;
  elements.categoryFilterSelect.innerHTML = '<option value="">Categoria: Todas</option>';
  categoriesCache.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.nome;
    elements.categoryFilterSelect.appendChild(opt);
  });

  // Mantém o filtro escolhido após recarregar os dados
  elements.categoryFilterSelect.value = categoriesCache.some(c => c.id === selected) ? selected : '';
}

// Mesmo card do Calendário (buildTaskCard em ui.js)
function renderTaskCardHTML(task) {
  const targetDateStr = getLocalDateStr();
  const isCompleted = task.is_recurring
    ? routineCompletionsList.some(c => c.tarefa === task.id && c.data === targetDateStr)
    : task.status === 'concluida';

  const execFormatted = task.data_execucao ? formatDateBR(task.data_execucao) : '---';
  const deliveryFormatted = task.data_entrega ? formatDateBR(task.data_entrega) : '---';

  const freqMap = { diario: 'Diário', semanal: 'Semanal', mensal: 'Mensal', anual: 'Anual' };
  const freqLabel = freqMap[task.recurrence_freq] || 'Rotina';

  return buildTaskCard(task, {
    isCompleted,
    categoryName: getCategoryName(task, categoriesCache),
    openOnClick: `TaskModal.open('${task.id}')`,
    toggleOnClick: `toggleTaskStatusFromManager(event, '${task.id}', '${task.status}', '${targetDateStr}', ${task.is_recurring})`,
    footerHtml: task.is_recurring
      ? `<span><i class="bi bi-arrow-repeat"></i> Repetir até: ${task.data_entrega ? formatDateBR(task.data_entrega) : 'Sem limite'} (${freqLabel})</span>`
      : `<span>Fazer: ${execFormatted}</span><span>Para: ${deliveryFormatted}</span>`
  });
}

// Alterna status da tarefa ao clicar no ícone do card na tela Gerenciar
window.toggleTaskStatusFromManager = async function (event, taskId, currentStatus, targetDateStr, isRecurring) {
  event.stopPropagation();

  const dateStr = targetDateStr || getLocalDateStr();

  try {
    if (isRecurring) {
      const existing = routineCompletionsList.find(c => c.tarefa === taskId && c.data === dateStr);
      if (existing) {
        await pb.collection('conclusoes_rotina').delete(existing.id);
      } else {
        await pb.collection('conclusoes_rotina').create({
          tarefa: taskId,
          data: dateStr,
          user: currentUser.id
        });
        recompensarConclusaoTarefa(`${taskId}_${dateStr}`, 10);
      }
    } else {
      const newStatus = currentStatus === 'concluida' ? 'a_fazer' : 'concluida';
      await pb.collection('tarefas').update(taskId, { status: newStatus });

      if (newStatus === 'concluida') {
        recompensarConclusaoTarefa(taskId, 10);
      }
    }

    await refreshData();
  } catch (err) {
    console.error('Erro ao alternar status no gerenciador:', err);
    MeowUI.alert('Erro ao atualizar o status da tarefa.', { title: 'Erro' });
  }
};

// Filtros combinados: valem para a lista principal e para a Lixeira
function applyTaskFilters(tasks) {
  const searchText = elements.searchTextFilter.value.trim().toLowerCase();
  const selectedCat = elements.categoryFilterSelect.value;
  const selectedUrg = elements.urgencyFilterSelect.value;
  const selectedStat = elements.statusFilterSelect.value;

  return tasks.filter(t => {
    const matchesText = !searchText ||
      (t.titulo && t.titulo.toLowerCase().includes(searchText)) ||
      (t.descricao && t.descricao.toLowerCase().includes(searchText));

    return matchesText &&
      (!selectedCat || t.categoria === selectedCat) &&
      (!selectedUrg || t.urgencia === selectedUrg) &&
      (!selectedStat || t.status === selectedStat);
  });
}

function renderTasks() {
  if (activeTab !== 'tasks') return;

  const filtered = applyTaskFilters(tasksCache);
  const container = isTrashMode ? elements.trashListContainer : elements.tasksListContainer;
  container.innerHTML = '';

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-center text-muted" style="padding: 2rem;">
      <i class="bi bi-search"></i> Nenhuma tarefa encontrada ${isTrashMode ? 'na lixeira' : ''}.
    </div>`;
    return;
  }

  if (!isTrashMode) {
    container.innerHTML = filtered.map(renderTaskCardHTML).join('');
    return;
  }

  filtered.forEach(task => {
    const execDateFormatted = task.data_execucao ? formatDateBR(task.data_execucao) : '--/--/----';
    const dueDateFormatted = task.data_entrega ? formatDateBR(task.data_entrega) : '--/--/----';

    const card = document.createElement('div');
    card.className = 'task-item-card card-deleted';
    card.innerHTML = `
      <div class="task-item-info">
        <span class="task-item-title">${escapeHtml(task.titulo)}</span>
        <div class="task-item-dates">
          <span><i class="bi bi-tag"></i> ${escapeHtml(getCategoryName(task, categoriesCache))}</span>
          <span>Fazer: ${execDateFormatted}</span>
          <span>Para: ${dueDateFormatted}</span>
        </div>
      </div>
      <div class="trash-actions">
        <button type="button" class="btn btn-accent" onclick="restoreItem('${task.id}', 'task')">
          <i class="bi bi-arrow-counterclockwise"></i> Restaurar
        </button>
        <button type="button" class="btn btn-danger" onclick="deleteTaskPermanently('${task.id}')">
          <i class="bi bi-trash3-fill"></i> Excluir
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderCategories() {
  if (activeTab !== 'categories') return;

  const listToRender = isTrashMode ? deletedCategoriesCache : categoriesCache;
  const container = isTrashMode ? elements.trashListContainer : elements.categoriesListContainer;
  container.innerHTML = '';

  if (listToRender.length === 0) {
    container.innerHTML = `<div class="text-center text-muted" style="padding: 2rem;">
      <i class="bi bi-tag"></i> Nenhuma categoria encontrada ${isTrashMode ? 'na lixeira' : ''}.
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
          <span class="category-item-name">${escapeHtml(cat.nome)}</span>
        </div>
        <div class="trash-actions">
          <button type="button" class="btn btn-accent" onclick="restoreItem('${cat.id}', 'category')">
            <i class="bi bi-arrow-counterclockwise"></i> Restaurar
          </button>
          <button type="button" class="btn btn-danger" onclick="deleteCategoryPermanently('${cat.id}')">
            <i class="bi bi-trash3-fill"></i> Excluir
          </button>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="category-item-content" onclick="openEditCategoryModal('${cat.id}')" style="cursor: pointer; flex: 1;">
          <div class="category-color-badge" style="background-color: ${cat.cor || '#C2BEF6'};"></div>
          <span class="category-item-name">${escapeHtml(cat.nome)}</span>
        </div>
        <button type="button" class="card-trash-btn" onclick="deleteCategory('${cat.id}')" title="Enviar para a lixeira" aria-label="Enviar para a lixeira">
          <i class="bi bi-trash3"></i>
        </button>
      `;
    }

    container.appendChild(card);
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
      TaskModal.open();
    } else {
      openAddCategoryModal();
    }
  });

  // Redireciona para a página de perfil ao clicar no avatar
  const avatarEl = document.getElementById('userAvatar');
  if (avatarEl) {
    avatarEl.style.cursor = 'pointer';
    avatarEl.addEventListener('click', () => {
      window.location.href = 'usuario.html';
    });
  }

  elements.btnCloseCategoryModal.addEventListener('click', closeModals);

  elements.btnOpenTrash.addEventListener('click', openTrashView);
  elements.btnCloseTrash.addEventListener('click', closeTrashView);

  elements.logoutBtn.addEventListener('click', () => {
    pb.authStore.clear();
    window.location.href = 'login.html';
  });

  elements.searchTextFilter.addEventListener('input', renderTasks);
  elements.categoryFilterSelect.addEventListener('change', renderTasks);
  elements.urgencyFilterSelect.addEventListener('change', renderTasks);
  elements.statusFilterSelect.addEventListener('change', renderTasks);

  elements.categoryForm.addEventListener('submit', (e) => {
    e.preventDefault();
    saveCategory({
      id: elements.categoryIdInput.value,
      nome: elements.categoryNameInput.value.trim(),
      cor: elements.categoryColorSelect.value
    });
  });

  // Listener para mudar a cor da bolinha dinamicamente ao escolher uma opção
  elements.categoryColorSelect.addEventListener('change', (e) => {
    updateCategoryColorPreview(e.target.value);
  });
}

function switchTab(tab) {
  activeTab = tab;
  isTrashMode = false;
  elements.trashHeader.classList.add('hidden');
  elements.btnOpenTrash.classList.remove('hidden'); // <-- Garante que o botão fique visível ao trocar de aba

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

async function refreshData() {
  await loadCategories();
  if (activeTab === 'tasks' || !isTrashMode) {
    await loadTasks();
  }
}

// ==========================================
// 7. CONTROLE DOS MODAIS E LIXEIRA
// ==========================================

function openAddCategoryModal() {
  elements.categoryForm.reset();
  elements.categoryIdInput.value = '';
  elements.categoryModalTitle.textContent = 'Nova Categoria';
  elements.btnSaveCategory.textContent = 'Adicionar Categoria';

  // Sincroniza a cor inicial da bolinha com o valor padrão do select
  updateCategoryColorPreview(elements.categoryColorSelect.value || '#C2BEF6');

  elements.categoryModalOverlay.classList.add('is-active');
}

function openEditCategoryModal(id) {
  const category = categoriesCache.find(c => c.id === id);
  if (!category) return;

  elements.categoryIdInput.value = category.id;
  elements.categoryNameInput.value = category.nome || '';
  elements.categoryColorSelect.value = category.cor || '#C2BEF6';

  // Atualiza a cor da bolinha com a cor da categoria carregada
  updateCategoryColorPreview(category.cor || '#C2BEF6');

  elements.categoryModalTitle.textContent = 'Editar Categoria';
  elements.btnSaveCategory.textContent = 'Salvar Alterações';
  elements.categoryModalOverlay.classList.add('is-active');
}

function closeModals() {
  TaskModal.close();
  elements.categoryModalOverlay.classList.remove('is-active');
}

function openTrashView() {
  isTrashMode = true;
  elements.trashHeader.classList.remove('hidden');
  elements.tasksListContainer.classList.add('hidden');
  elements.categoriesListContainer.classList.add('hidden');
  elements.trashListContainer.classList.remove('hidden');
  elements.trashListContainer.innerHTML = '';
  elements.btnOpenTrash.classList.add('hidden'); // <-- Oculta o botão da lixeira ao abrir a lixeira

  elements.trashTitleLabel.textContent = activeTab === 'categories' ? 'Lixeira de Categorias' : 'Lixeira de Tarefas';
  tasksCache = [];
  refreshData();
}

function closeTrashView() {
  isTrashMode = false;
  elements.trashHeader.classList.add('hidden');
  elements.trashListContainer.classList.add('hidden');
  elements.btnOpenTrash.classList.remove('hidden'); // <-- Exibe o botão da lixeira ao fechar
  tasksCache = [];
  elements.tasksListContainer.innerHTML = '';
  switchTab(activeTab);
}

// Atualiza a cor da bolinha indicadora do modal de categoria
function updateCategoryColorPreview(hexColor) {
  const previewEl = document.getElementById('category-color-preview');
  if (previewEl && hexColor) {
    previewEl.style.backgroundColor = hexColor;
  }
}

// Gerenciador de inatividade (Sessão de 120 minutos)
function initInactivityTracker() {
  const updateActivity = () => {
    if (pb.authStore.isValid) {
      localStorage.setItem('last_activity', Date.now().toString());
    }
  };

  // Eventos de interação do usuário
  ['click', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(eventType => {
    window.addEventListener(eventType, updateActivity, { passive: true });
  });

  // Checagem periódica a cada 1 minuto caso a aba fique aberta e parada
  setInterval(() => {
    const lastActivity = localStorage.getItem('last_activity');
    const maxInactivityMs = 120 * 60 * 1000;
    if (lastActivity && (Date.now() - parseInt(lastActivity, 10) > maxInactivityMs)) {
      pb.authStore.clear();
      localStorage.removeItem('last_activity');
      window.location.href = 'login.html';
    }
  }, 60000);
}

// Inicia o rastreador de inatividade ao carregar
initInactivityTracker();

function renderUserAvatar() {
  const avatarEl = document.getElementById('userAvatar');
  if (!avatarEl) return;

  if (currentUser && currentUser.avatar) {
    const avatarUrl = pb.files.getUrl(currentUser, currentUser.avatar);
    avatarEl.innerHTML = `<img src="${avatarUrl}" alt="${escapeHtml(currentUser.name || 'User')}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
  } else if (currentUser && (currentUser.name || currentUser.username)) {
    const displayName = currentUser.name || currentUser.username;
    avatarEl.innerHTML = `<span>${escapeHtml(displayName.charAt(0).toUpperCase())}</span>`;
  } else {
    avatarEl.innerHTML = '<i class="bi bi-person-fill"></i>';
  }
}

// Registro do Service Worker (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('PWA: Service Worker registrado com sucesso!'))
      .catch((err) => console.error('PWA: Erro ao registrar Service Worker:', err));
  });
}