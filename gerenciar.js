/* ==========================================================================
   MEOW PLANS - GERENCIADOR CENTRALIZADO (LOGIC & POCKETBASE SDK)
   ========================================================================== */

// Inicialização do PocketBase SDK
const pb = new PocketBase(window.location.origin.includes('localhost') ? 'http://127.0.0.1:8090' : window.location.origin);

// Estado Global da Aplicação
let categoriesList = [];
let tasksList = [];
let subtasksMap = {}; // taskId -> Array de subtarefas
let tempSubtasks = []; // Subtarefas em edição no modal
let modalTaskInstance = null;
let modalCategoryInstance = null;
let modalTrashInstance = null;

// ==========================================================================
// INICIALIZAÇÃO E CICLO DE VIDA
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Verificação simples de autenticação
  if (!pb.authStore.isValid) {
    console.warn("Usuário não autenticado. Redirecionando ou ativando sessão padrão.");
  } else {
    setupUserInfo();
  }

  // Instanciar Modais do Bootstrap
  modalTaskInstance = new bootstrap.Modal(document.getElementById('modalTask'));
  modalCategoryInstance = new bootstrap.Modal(document.getElementById('modalCategory'));
  modalTrashInstance = new bootstrap.Modal(document.getElementById('modalTrash'));

  // Event listener para Logout
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    pb.authStore.clear();
    window.location.href = 'index.html';
  });

  // Carga inicial dos dados
  await loadCategories();
  await loadTasks();
});

function setupUserInfo() {
  const user = pb.authStore.record;
  if (user) {
    const avatarEl = document.getElementById('user-avatar-initial');
    if (user.avatar && avatarEl) {
      const avatarUrl = pb.files.getUrl(user, user.avatar);
      avatarEl.innerHTML = `<img src="${avatarUrl}" class="rounded-circle" style="width:100%;height:100%;object-fit:cover;" />`;
    } else if (avatarEl && user.name) {
      avatarEl.textContent = user.name.charAt(0).toUpperCase();
    }
  }
}

// Alternar entre as abas 'Tarefas' e 'Categorias'
function switchTab(tabName) {
  const tabTasks = document.getElementById('tab-btn-tasks');
  const tabCategories = document.getElementById('tab-btn-categories');
  const viewTasks = document.getElementById('view-tasks');
  const viewCategories = document.getElementById('view-categories');

  if (tabName === 'tasks') {
    tabTasks.classList.add('active');
    tabCategories.classList.remove('active');
    viewTasks.classList.remove('hidden');
    viewCategories.classList.add('hidden');
  } else {
    tabCategories.classList.add('active');
    tabTasks.classList.remove('active');
    viewCategories.classList.remove('hidden');
    viewTasks.classList.add('hidden');
  }
}

// ==========================================================================
// CATEGORIAS (FUNÇÕES PRINCIPAIS)
// ==========================================================================

/**
 * Carrega categorias do usuário logado e atualiza a UI e Selects
 */
async function loadCategories() {
  try {
    const userId = pb.authStore.record?.id;
    categoriesList = await pb.collection('Categorias').getFullList({
      filter: `deleted = false ${userId ? `&& user = "${userId}"` : ''}`,
      sort: '-created'
    });

    renderCategories();
    populateCategorySelects();
  } catch (error) {
    console.error("Erro ao carregar categorias:", error);
  }
}

/**
 * Renderiza a lista visual de Categorias
 */
function renderCategories() {
  const container = document.getElementById('categories-list-container');
  if (!container) return;

  if (categoriesList.length === 0) {
    container.innerHTML = `<div class="text-center text-muted py-4">Nenhuma categoria cadastrada. 🐾</div>`;
    return;
  }

  container.innerHTML = categoriesList.map(cat => `
    <div class="meow-item-card" style="border-left: 8px solid ${cat.cor || '#C2BEF6'}">
      <div class="meow-card-left">
        <div>
          <div class="meow-card-title">${escapeHtml(cat.nome)}</div>
        </div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <button class="btn btn-sm btn-outline-primary border-0" onclick="editCategory('${cat.id}')">✏️</button>
        <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteCategory('${cat.id}')">🗑️</button>
      </div>
    </div>
  `).join('');
}

/**
 * Preenche os selects de categorias nos formulários e no filtro
 */
function populateCategorySelects() {
  const taskSelect = document.getElementById('task-categoria');
  const filterSelect = document.getElementById('filter-category-task');

  const options = categoriesList.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}</option>`).join('');

  if (taskSelect) {
    taskSelect.innerHTML = `<option value="">■ Categoria</option>` + options;
  }
  if (filterSelect) {
    filterSelect.innerHTML = `<option value="">Filtro: Todas</option>` + options;
  }
}

/**
 * Salva ou Atualiza uma Categoria no PocketBase
 */
async function saveCategory(categoryData) {
  try {
    const userId = pb.authStore.record?.id;
    const payload = { ...categoryData, user: userId, deleted: false };

    if (categoryData.id) {
      await pb.collection('Categorias').update(categoryData.id, payload);
    } else {
      await pb.collection('Categorias').create(payload);
    }

    await loadCategories();
    modalCategoryInstance.hide();
  } catch (error) {
    console.error("Erro ao salvar categoria:", error);
    alert("Não foi possível salvar a categoria.");
  }
}

/**
 * RN05: Soft Delete de Categoria (deleted = true)
 */
async function deleteCategory(id) {
  if (!confirm("Deseja mover esta categoria para a lixeira?")) return;
  try {
    await pb.collection('Categorias').update(id, { deleted: true });
    await loadCategories();
  } catch (error) {
    console.error("Erro ao excluir categoria:", error);
  }
}

// ==========================================================================
// TAREFAS (FUNÇÕES PRINCIPAIS E REGRAS DE NEGÓCIO)
// ==========================================================================

/**
 * Carrega tarefas ativas e aplica RN02 (Soft Transition para Atrasada)
 */
async function loadTasks() {
  try {
    const userId = pb.authStore.record?.id;
    tasksList = await pb.collection('tarefas').getFullList({
      filter: `deleted = false ${userId ? `&& user = "${userId}"` : ''}`,
      expand: 'categoria',
      sort: '-created'
    });

    // RN02: Atualização automática de tarefas atrasadas
    const todayStr = new Date().toISOString().split('T')[0];
    for (let task of tasksList) {
      if (task.data_execucao && task.data_execucao < todayStr && (task.status === 'a_fazer' || task.status === 'em_progresso')) {
        task.status = 'atrasada';
        // Atualiza em segundo plano no PocketBase
        pb.collection('tarefas').update(task.id, { status: 'atrasada' }).catch(console.error);
      }
    }

    // Carregar subtarefas para cada tarefa
    await loadSubtasksForTasks();

    renderTasks();
  } catch (error) {
    console.error("Erro ao carregar tarefas:", error);
  }
}

/**
 * Carrega subtarefas vinculadas às tarefas ativas
 */
async function loadSubtasksForTasks() {
  try {
    const userId = pb.authStore.record?.id;
    const allSubtasks = await pb.collection('subtarefas').getFullList({
      filter: `${userId ? `user = "${userId}"` : ''}`
    });

    subtasksMap = {};
    allSubtasks.forEach(sub => {
      if (!subtasksMap[sub.tarefa]) {
        subtasksMap[sub.tarefa] = [];
      }
      subtasksMap[sub.tarefa].push(sub);
    });
  } catch (error) {
    console.error("Erro ao carregar subtarefas:", error);
  }
}

/**
 * Renderiza os cards das tarefas de acordo com o filtro selecionado
 */
function renderTasks() {
  const container = document.getElementById('tasks-list-container');
  const filterCatId = document.getElementById('filter-category-task')?.value;

  if (!container) return;

  let filtered = tasksList;
  if (filterCatId) {
    filtered = tasksList.filter(t => t.categoria === filterCatId);
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-center text-muted py-4">Nenhuma tarefa encontrada. 🐾</div>`;
    return;
  }

  container.innerHTML = filtered.map(task => {
    const catName = task.expand?.categoria?.nome || 'Geral';
    const catColor = task.expand?.categoria?.cor || '#C2BEF6';
    const subtasks = subtasksMap[task.id] || [];
    const completedSubs = subtasks.filter(s => s.completa).length;
    const progressText = subtasks.length > 0 ? `(${completedSubs}/${subtasks.length})` : '';

    return `
      <div class="meow-item-card" style="border-left: 8px solid ${catColor}">
        <div class="meow-card-left">
          <div class="meow-icon-badge">⏰</div>
          <div>
            <div class="meow-card-title">
              ${escapeHtml(task.titulo)} <span class="text-muted fs-6">${progressText}</span>
            </div>
            <div class="meow-card-dates">
              Fazer: ${formatDate(task.data_execucao)} | Para: ${formatDate(task.data_entrega)}
            </div>
          </div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <span class="flag-urgency" title="Urgência: ${task.urgencia}">${getUrgencyFlag(task.urgencia)}</span>
          <button class="btn btn-sm btn-outline-primary border-0" onclick="editTask('${task.id}')">✏️</button>
          <button class="btn btn-sm btn-outline-danger border-0" onclick="deleteTask('${task.id}')">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * RN01 e Salvamento: Valida prazos e persiste Tarefa com suas Subtarefas
 */
async function saveTaskWithSubtasks(taskData, subtasksList) {
  // RN01: Validação de Prazos (data_execucao NUNCA pode ser posterior à data_entrega)
  if (taskData.data_execucao && taskData.data_entrega) {
    if (taskData.data_execucao > taskData.data_entrega) {
      alert("⚠️ Alerta de Prazo: A Data de Execução JAMAIS pode ser posterior à Data de Entrega!");
      return false;
    }
  }

  try {
    const userId = pb.authStore.record?.id;
    const payload = {
      ...taskData,
      user: userId,
      deleted: false
    };

    let parentTask;
    if (taskData.id) {
      parentTask = await pb.collection('tarefas').update(taskData.id, payload);
    } else {
      parentTask = await pb.collection('tarefas').create(payload);
    }

    // Processamento de subtarefas (RN04)
    for (let sub of subtasksList) {
      if (sub.id) {
        await pb.collection('subtarefas').update(sub.id, {
          titulo: sub.titulo,
          completa: sub.completa
        });
      } else {
        await pb.collection('subtarefas').create({
          titulo: sub.titulo,
          completa: false,
          tarefa: parentTask.id,
          user: userId
        });
      }
    }

    await loadTasks();
    modalTaskInstance.hide();
    return true;
  } catch (error) {
    console.error("Erro ao salvar tarefa:", error);
    alert("Falha ao salvar a tarefa. Verifique os dados.");
    return false;
  }
}

/**
 * RN05: Soft Delete de Tarefa (deleted = true)
 */
async function deleteTask(id) {
  if (!confirm("Enviar esta tarefa para a Lixeira?")) return;
  try {
    await pb.collection('tarefas').update(id, { deleted: true });
    await loadTasks();
  } catch (error) {
    console.error("Erro ao deletar tarefa:", error);
  }
}

// ==========================================================================
// GERENCIAMENTO DA LIXEIRA (RESTAURAÇÃO DE SOFT DELETE)
// ==========================================================================

async function openTrashModal() {
  try {
    const userId = pb.authStore.record?.id;
    
    // Buscar tarefas e categorias deletadas
    const deletedTasks = await pb.collection('tarefas').getFullList({
      filter: `deleted = true ${userId ? `&& user = "${userId}"` : ''}`
    });

    const deletedCats = await pb.collection('Categorias').getFullList({
      filter: `deleted = true ${userId ? `&& user = "${userId}"` : ''}`
    });

    const container = document.getElementById('trash-list-container');
    const items = [...deletedTasks.map(t => ({...t, type: 'tarefa'})), ...deletedCats.map(c => ({...c, type: 'categoria'}))];

    if (items.length === 0) {
      container.innerHTML = `<div class="text-center text-muted py-3">A lixeira está vazia! 🐱</div>`;
    } else {
      container.innerHTML = items.map(item => `
        <div class="meow-item-card is-deleted">
          <div>
            <span class="badge bg-secondary me-1">${item.type.toUpperCase()}</span>
            <strong class="text-dark">${escapeHtml(item.titulo || item.nome)}</strong>
          </div>
          <button class="btn btn-sm btn-accent rounded-pill font-bold" onclick="restoreItem('${item.id}', '${item.type}')">
            Restaurar ↩️
          </button>
        </div>
      `).join('');
    }

    modalTrashInstance.show();
  } catch (error) {
    console.error("Erro ao abrir lixeira:", error);
  }
}

async function restoreItem(id, type) {
  try {
    const collectionName = type === 'tarefa' ? 'tarefas' : 'Categorias';
    await pb.collection(collectionName).update(id, { deleted: false });
    
    await loadCategories();
    await loadTasks();
    openTrashModal(); // Recarrega o modal da lixeira
  } catch (error) {
    console.error("Erro ao restaurar item:", error);
  }
}

// ==========================================================================
// FORMULÁRIOS & MANIPULAÇÃO DO MODAL
// ==========================================================================

function openCategoryModal() {
  document.getElementById('form-category').reset();
  document.getElementById('category-id').value = '';
  modalCategoryInstance.show();
}

function editCategory(id) {
  const cat = categoriesList.find(c => c.id === id);
  if (!cat) return;

  document.getElementById('category-id').value = cat.id;
  document.getElementById('category-nome').value = cat.nome;
  document.getElementById('category-cor').value = cat.cor || '#C2BEF6';
  document.getElementById('category-descricao').value = cat.descricao || '';

  modalCategoryInstance.show();
}

function handleCategorySubmit(event) {
  event.preventDefault();
  const data = {
    id: document.getElementById('category-id').value,
    nome: document.getElementById('category-nome').value,
    cor: document.getElementById('category-cor').value,
    descricao: document.getElementById('category-descricao').value
  };
  saveCategory(data);
}

function openTaskModal() {
  document.getElementById('form-task').reset();
  document.getElementById('task-id').value = '';
  tempSubtasks = [];
  renderSubtaskInputs();
  toggleRecurrenceFreq(false);
  modalTaskInstance.show();
}

function editTask(id) {
  const task = tasksList.find(t => t.id === id);
  if (!task) return;

  document.getElementById('task-id').value = task.id;
  document.getElementById('task-titulo').value = task.titulo;
  document.getElementById('task-categoria').value = task.categoria || '';
  document.getElementById('task-urgencia').value = task.urgencia || 'normal';
  document.getElementById('task-status').value = task.status || 'a_fazer';
  document.getElementById('task-data-execucao').value = task.data_execucao ? task.data_execucao.split('T')[0] : '';
  document.getElementById('task-data-entrega').value = task.data_entrega ? task.data_entrega.split('T')[0] : '';
  document.getElementById('task-descricao').value = task.descricao || '';
  document.getElementById('task-is-recurring').checked = !!task.is_recurring;
  
  toggleRecurrenceFreq(!!task.is_recurring);
  if (task.is_recurring) {
    document.getElementById('task-recurrence-freq').value = task.recurrence_freq || 'diario';
  }

  tempSubtasks = (subtasksMap[task.id] || []).map(s => ({ ...s }));
  renderSubtaskInputs();

  modalTaskInstance.show();
}

function handleTaskSubmit(event) {
  event.preventDefault();

  const taskData = {
    id: document.getElementById('task-id').value,
    titulo: document.getElementById('task-titulo').value,
    categoria: document.getElementById('task-categoria').value,
    urgencia: document.getElementById('task-urgencia').value,
    status: document.getElementById('task-status').value,
    data_execucao: document.getElementById('task-data-execucao').value,
    data_entrega: document.getElementById('task-data-entrega').value,
    descricao: document.getElementById('task-descricao').value,
    is_recurring: document.getElementById('task-is-recurring').checked,
    recurrence_freq: document.getElementById('task-is-recurring').checked ? document.getElementById('task-recurrence-freq').value : null
  };

  saveTaskWithSubtasks(taskData, tempSubtasks);
}

// Manipulação visual do checklist de subtarefas no modal
function addSubtaskInput() {
  tempSubtasks.push({ titulo: '', completa: false });
  renderSubtaskInputs();
}

function updateSubtaskTitle(index, value) {
  tempSubtasks[index].titulo = value;
}

function toggleSubtaskStatus(index, completed) {
  tempSubtasks[index].completa = completed;
}

function removeSubtaskInput(index) {
  tempSubtasks.splice(index, 1);
  renderSubtaskInputs();
}

function renderSubtaskInputs() {
  const container = document.getElementById('subtasks-container');
  if (!container) return;

  container.innerHTML = tempSubtasks.map((sub, idx) => `
    <div class="d-flex align-items-center gap-2">
      <input type="checkbox" ${sub.completa ? 'checked' : ''} onchange="toggleSubtaskStatus(${idx}, this.checked)">
      <input type="text" class="meow-form-input py-1" value="${escapeHtml(sub.titulo || '')}" placeholder="Item do checklist..." onchange="updateSubtaskTitle(${idx}, this.value)">
      <button type="button" class="btn btn-sm btn-outline-danger border-0" onclick="removeSubtaskInput(${idx})">✕</button>
    </div>
  `).join('');
}

function toggleRecurrenceFreq(show) {
  const container = document.getElementById('container-recurrence-freq');
  if (container) {
    if (show) container.classList.remove('hidden');
    else container.classList.add('hidden');
  }
}

// ==========================================================================
// FUNÇÕES AUXILIARES E UTILITÁRIAS
// ==========================================================================

function getUrgencyFlag(urgency) {
  switch (urgency) {
    case 'baixa': return '🟢';
    case 'normal': return '🟡';
    case 'alta': return '🟠';
    case 'urgente': return '🔴';
    default: return '🚩';
  }
}

function formatDate(dateString) {
  if (!dateString) return '--/--/----';
  const cleanDate = dateString.split('T')[0];
  const [year, month, day] = cleanDate.split('-');
  return `${day}/${month}/${year}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}