/* ==========================================================================
   MEOW PLANS - CALENDÁRIO LOGIC (PocketBase SDK Integration)
   ========================================================================== */

// 1. INICIALIZAÇÃO DO POCKETBASE SDK
const pb = new PocketBase(window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1') 
  ? 'http://127.0.0.1:8090' 
  : window.location.origin);

// Estado Global da Aplicação
let currentUser = null;
let currentView = 'mes'; // 'mes' | 'semana' | 'dia' | 'tarefas'
let selectedDate = new Date();
let tasksList = [];
let categoriesList = [];
let draggingTaskId = null;

// Nomes dos Meses e Dias em Português
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'
];

// 2. VERIFICAÇÃO DE AUTENTICAÇÃO E INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', async () => {
  if (!pb.authStore.isValid) {
    // Redireciona para tela de login caso não esteja autenticado
    window.location.href = 'login.html';
    return;
  }

  currentUser = pb.authStore.model;
  renderUserAvatar();

  // Registrar Event Listeners
  setupEventListeners();

  // Carregar Dados e Renderizar Tela
  await loadCategories();
  await loadAndProcessTasks();
  renderCurrentView();
});

function renderUserAvatar() {
  const avatarEl = document.getElementById('userAvatar');
  if (currentUser && currentUser.avatar) {
    const avatarUrl = pb.files.getUrl(currentUser, currentUser.avatar);
    avatarEl.innerHTML = `<img src="${avatarUrl}" alt="${currentUser.name || 'User'}" />`;
  } else if (currentUser && currentUser.name) {
    avatarEl.innerHTML = `<span>${currentUser.name.charAt(0).toUpperCase()}</span>`;
  }
}

// 3. REGISTRO DE EVENTOS E NAVEGAÇÃO DE INTERFACE
function setupEventListeners() {
  // Troca de Visão (Abas)
  document.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentView = e.target.getAttribute('data-view');
      renderCurrentView();
    });
  });

  // Botões de Navegação Anterior / Próximo
  document.getElementById('prevPeriodBtn').addEventListener('click', () => {
    navigatePeriod(-1);
  });

  document.getElementById('nextPeriodBtn').addEventListener('click', () => {
    navigatePeriod(1);
  });

  // Logout
  document.getElementById('btnSair').addEventListener('click', () => {
    pb.authStore.clear();
    window.location.href = 'login.html';
  });

  // Modal de Nova / Editar Tarefa
  document.getElementById('btnNovaTarefa').addEventListener('click', () => openTaskModal());
  document.getElementById('closeTaskModalBtn').addEventListener('click', closeTaskModal);

  // Toggle da frequência de recorrência
  document.getElementById('taskRecurringCheck').addEventListener('change', (e) => {
    const freqGroup = document.getElementById('recurrenceFreqGroup');
    if (e.target.checked) {
      freqGroup.classList.remove('hidden');
    } else {
      freqGroup.classList.add('hidden');
    }
  });

  // Submeter formulário de tarefa
  document.getElementById('taskForm').addEventListener('submit', handleSaveTask);

  // Botão de Excluir Tarefa (Soft Delete)
  document.getElementById('btnDeleteTask').addEventListener('click', handleDeleteTask);

  // Botão de Adicionar Subtarefa
  document.getElementById('btnAddSubtaskBtn').addEventListener('click', () => addSubtaskRow());
}

function navigatePeriod(direction) {
  if (currentView === 'mes') {
    selectedDate.setMonth(selectedDate.getMonth() + direction);
  } else if (currentView === 'semana') {
    selectedDate.setDate(selectedDate.getDate() + (direction * 7));
  } else if (currentView === 'dia') {
    selectedDate.setDate(selectedDate.getDate() + direction);
  }
  renderCurrentView();
}

// 4. OPERAÇÕES DE DADOS COM POCKETBASE (CRUD, SOFT DELETE & AUTO OVERDUE)
async function loadCategories() {
  try {
    categoriesList = await pb.collection('categorias').getFullList({
      filter: `user = "${currentUser.id}" && deleted = false`,
      sort: 'nome'
    });

    const categorySelect = document.getElementById('taskCategorySelect');
    categorySelect.innerHTML = '<option value="">Sem Categoria</option>';
    categoriesList.forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.nome;
      categorySelect.appendChild(option);
    });
  } catch (err) {
    console.error('Erro ao carregar categorias:', err);
  }
}

async function loadAndProcessTasks() {
  try {
    // Buscar tarefas ativas (deleted = false) do usuário logado
    const rawTasks = await pb.collection('tarefas').getFullList({
      filter: `user = "${currentUser.id}" && deleted = false`,
      expand: 'categoria'
    });

    const todayStr = new Date().toISOString().split('T')[0];

    // Verificar tarefas atrasadas automaticamente e atualizar no PocketBase
    tasksList = await Promise.all(rawTasks.map(async (task) => {
      let taskDeliveryStr = task.data_entrega ? task.data_entrega.split(' ')[0] : null;

      // Regra de Negócio: Se a data de entrega passou e não foi concluída/cancelada -> Marcar Atrasada
      if (taskDeliveryStr && taskDeliveryStr < todayStr && task.status !== 'concluida' && task.status !== 'cancelada' && task.status !== 'atrasada') {
        try {
          const updated = await pb.collection('tarefas').update(task.id, { status: 'atrasada' });
          return { ...task, status: 'atrasada' };
        } catch (e) {
          console.error(`Erro ao atualizar status de atraso para a tarefa ${task.id}:`, e);
        }
      }
      return task;
    }));

  } catch (err) {
    console.error('Erro ao carregar tarefas do PocketBase:', err);
  }
}

// 5. REGRAS DE NEGÓCIO E VALIDAÇÃO DE PRAZOS
function validateTaskDates(dataExec, dataEntrega) {
  if (dataExec && dataEntrega) {
    const execDate = new Date(dataExec);
    const deliveryDate = new Date(dataEntrega);
    if (execDate > deliveryDate) {
      alert('⚠️ Regra de Negócio: A Data de Execução NUNCA pode ser posterior à Data de Entrega!');
      return false;
    }
  }
  return true;
}

async function handleSaveTask(e) {
  e.preventDefault();

  const id = document.getElementById('taskIdInput').value;
  const titulo = document.getElementById('taskTitleInput').value.trim();
  const categoria = document.getElementById('taskCategorySelect').value || null;
  const urgencia = document.getElementById('taskUrgencySelect').value;
  const status = document.getElementById('taskStatusSelect').value;
  const data_entrega = document.getElementById('taskDeliveryDate').value;
  const data_execucao = document.getElementById('taskExecDate').value || null;
  const is_recurring = document.getElementById('taskRecurringCheck').checked;
  const recurrence_freq = is_recurring ? document.getElementById('taskRecurrenceFreq').value : null;
  const descricao = document.getElementById('taskDescInput').value.trim();

  // Validação Obrigatória de Prazos
  if (!validateTaskDates(data_execucao, data_entrega)) {
    return;
  }

  const taskPayload = {
    titulo,
    categoria,
    urgencia,
    status,
    data_entrega: data_entrega ? `${data_entrega} 00:00:00.000Z` : null,
    data_execucao: data_execucao ? `${data_execucao} 00:00:00.000Z` : null,
    is_recurring,
    recurrence_freq,
    descricao,
    user: currentUser.id,
    deleted: false
  };

  try {
    let savedTask;
    if (id) {
      // Atualizar Tarefa Existente
      savedTask = await pb.collection('tarefas').update(id, taskPayload);
    } else {
      // Criar Nova Tarefa
      savedTask = await pb.collection('tarefas').create(taskPayload);
    }

    // Salvar Subtarefas
    await saveSubtasks(savedTask.id);

    closeTaskModal();
    await loadAndProcessTasks();
    renderCurrentView();
  } catch (err) {
    console.error('Erro ao salvar tarefa no PocketBase:', err);
    alert('Ocorreu um erro ao salvar a tarefa.');
  }
}

// SOFT DELETE: Envia para a Lixeira (campo deleted = true)
async function handleDeleteTask() {
  const id = document.getElementById('taskIdInput').value;
  if (!id) return;

  if (confirm('Tem certeza que deseja enviar esta tarefa para a lixeira?')) {
    try {
      await pb.collection('tarefas').update(id, { deleted: true });
      closeTaskModal();
      await loadAndProcessTasks();
      renderCurrentView();
    } catch (err) {
      console.error('Erro ao excluir tarefa (soft delete):', err);
      alert('Erro ao excluir a tarefa.');
    }
  }
}

// SUBTAREFAS
async function saveSubtasks(taskId) {
  const rows = document.querySelectorAll('.subtask-row');
  for (const row of rows) {
    const subid = row.dataset.subid;
    const input = row.querySelector('.subtask-input');
    const checkbox = row.querySelector('.subtask-check');
    const titulo = input.value.trim();

    if (!titulo && subid) {
      // Excluir se o título ficou em branco
      await pb.collection('subtarefas').delete(subid);
      continue;
    }

    if (titulo) {
      if (subid) {
        await pb.collection('subtarefas').update(subid, {
          titulo,
          completa: checkbox.checked
        });
      } else {
        await pb.collection('subtarefas').create({
          titulo,
          completa: checkbox.checked,
          tarefa: taskId,
          user: currentUser.id
        });
      }
    }
  }
}

function addSubtaskRow(subtask = { id: '', titulo: '', completa: false }) {
  const container = document.getElementById('subtasksList');
  const row = document.createElement('div');
  row.className = 'subtask-row flex-between';
  row.dataset.subid = subtask.id;
  row.style.gap = '0.5rem';

  row.innerHTML = `
    <input type="checkbox" class="subtask-check" ${subtask.completa ? 'checked' : ''} />
    <input type="text" class="input-control subtask-input" value="${subtask.titulo}" placeholder="Título da subtarefa..." style="min-height:32px; padding:0.25rem 0.5rem; font-size:0.85rem;" />
    <button type="button" class="btn-link" style="color:var(--color-danger); text-decoration:none;" onclick="this.parentElement.remove()">&times;</button>
  `;
  container.appendChild(row);
}

// 6. RENDERIZAÇÃO DAS VISUALIZAÇÕES DO CALENDÁRIO
function renderCurrentView() {
  const mainContent = document.getElementById('calendarMainContent');
  const label = document.getElementById('currentPeriodLabel');

  if (currentView === 'mes') {
    label.textContent = `${MONTH_NAMES[selectedDate.getMonth()]} de ${selectedDate.getFullYear()}`;
    renderMonthView(mainContent);
  } else if (currentView === 'semana') {
    label.textContent = `Semana - ${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;
    renderWeekView(mainContent);
  } else if (currentView === 'dia') {
    const formattedDateStr = `${WEEKDAY_NAMES[selectedDate.getDay()]}, ${selectedDate.getDate()} de ${MONTH_NAMES[selectedDate.getMonth()]}`;
    label.textContent = formattedDateStr;
    renderDayView(mainContent, selectedDate);
  } else if (currentView === 'tarefas') {
    label.textContent = 'Todas as Tarefas';
    renderAllTasksView(mainContent);
  }
}

// VISÃO DE MÊS
function renderMonthView(container) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();

  let daysHtml = '';

  // Dias do mês anterior
  for (let x = firstDayIndex; x > 0; x--) {
    daysHtml += `<div class="day-cell other-month">${prevMonthTotalDays - x + 1}</div>`;
  }

  // Dias do mês atual
  const today = new Date();
  for (let i = 1; i <= totalDays; i++) {
    const isSelected = selectedDate.getDate() === i;
    const isToday = today.getDate() === i && today.getMonth() === month && today.getFullYear() === year;

    daysHtml += `
      <div class="day-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}" onclick="selectMonthDay(${i})">
        ${i}
      </div>
    `;
  }

  container.innerHTML = `
    <div class="month-grid-container">
      <div class="weekdays-header">
        <span>D</span><span>S</span><span>T</span><span>Q</span><span>Q</span><span>S</span><span>S</span>
      </div>
      <div class="days-grid">
        ${daysHtml}
      </div>
    </div>
    <div class="day-details-panel" id="monthSelectedDayDetails">
      <!-- Painel do Dia Selecionado -->
    </div>
  `;

  renderDayPanel(document.getElementById('monthSelectedDayDetails'), selectedDate);
}

function selectMonthDay(dayNumber) {
  selectedDate.setDate(dayNumber);
  renderCurrentView();
}

// RENDERIZAÇÃO PAINEL DO DIA COM 3 SEÇÕES (Para Entregar, Para Fazer, Rotineiros)
function renderDayPanel(targetElement, dateObj) {
  const dateStr = dateObj.toISOString().split('T')[0];
  const dayTitleStr = `${WEEKDAY_NAMES[dateObj.getDay()]}, ${dateObj.getDate()} de ${MONTH_NAMES[dateObj.getMonth()]}`;

  // Filtrar tarefas
  const deliveryTasks = tasksList.filter(t => !t.is_recurring && t.data_entrega && t.data_entrega.startsWith(dateStr));
  const execTasks = tasksList.filter(t => !t.is_recurring && t.data_execucao && t.data_execucao.startsWith(dateStr));
  const routineTasks = tasksList.filter(t => t.is_recurring);

  targetElement.innerHTML = `
    <div class="day-panel-header">
      <button class="day-panel-close-btn">&times;</button>
      <span>${dayTitleStr}</span>
    </div>

    <!-- SEÇÃO 1: PARA ENTREGAR HOJE (Rosa - Estático) -->
    <div class="task-section-box section-pink">
      <div class="section-title">Para Entregar</div>
      <div class="section-cards-container">
        ${deliveryTasks.map(t => renderTaskCard(t, false)).join('') || '<p class="text-center text-muted" style="font-size:0.75rem;">Nenhuma entrega para hoje ✨</p>'}
      </div>
    </div>

    <!-- SEÇÃO 2: PARA FAZER HOJE (Mint - Suporta Drag and Drop!) -->
    <div class="task-section-box section-mint drop-zone" data-dropdate="${dateStr}" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)">
      <div class="section-title">Para Fazer</div>
      <div class="section-cards-container">
        ${execTasks.map(t => renderTaskCard(t, true)).join('') || '<p class="text-center text-muted" style="font-size:0.75rem;">Nada agendado para fazer ✨</p>'}
      </div>
    </div>

    <!-- SEÇÃO 3: ROTINEIROS (Verde - Estático) -->
    <div class="task-section-box section-green">
      <div class="section-title">Rotineiros</div>
      <div class="section-cards-container">
        ${routineTasks.map(t => renderTaskCard(t, false)).join('') || '<p class="text-center text-muted" style="font-size:0.75rem;">Sem rotinas para hoje 🐾</p>'}
      </div>
    </div>
  `;
}

// VISÃO DE DIA
function renderDayView(container, dateObj) {
  container.innerHTML = `
    <div class="day-details-panel" style="border-radius: 0; min-height: calc(100vh - 120px);">
      <div id="singleDayPanel"></div>
    </div>
  `;
  renderDayPanel(document.getElementById('singleDayPanel'), dateObj);
}

// VISÃO DE SEMANA
function renderWeekView(container) {
  const startOfWeek = new Date(selectedDate);
  startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay()); // Domingo

  let weekDaysHtml = '';

  for (let i = 0; i < 7; i++) {
    const currentDay = new Date(startOfWeek);
    currentDay.setDate(startOfWeek.getDate() + i);
    const dateStr = currentDay.toISOString().split('T')[0];

    const deliveryTasks = tasksList.filter(t => !t.is_recurring && t.data_entrega && t.data_entrega.startsWith(dateStr));
    const execTasks = tasksList.filter(t => !t.is_recurring && t.data_execucao && t.data_execucao.startsWith(dateStr));
    const routineTasks = tasksList.filter(t => t.is_recurring);

    weekDaysHtml += `
      <div class="week-day-column mb-1" style="background:#232B38; padding:0.75rem; border-radius:var(--radius-lg);">
        <div class="text-center font-bold" style="color:#FFF; font-size:0.9rem; margin-bottom:0.5rem;">
          ${WEEKDAY_NAMES[currentDay.getDay()]} <span style="font-weight:400; font-size:0.8rem; color:#A0AEC0;">${currentDay.getDate()}</span>
        </div>

        <!-- Section Para Entregar -->
        <div class="task-section-box section-pink" style="padding:0.5rem;">
          <div class="section-title" style="font-size:0.75rem;">Para Entregar</div>
          ${deliveryTasks.map(t => renderTaskCard(t, false)).join('')}
        </div>

        <!-- Section Para Fazer (Draggable Target) -->
        <div class="task-section-box section-mint drop-zone" data-dropdate="${dateStr}" style="padding:0.5rem;" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)">
          <div class="section-title" style="font-size:0.75rem;">Para Fazer</div>
          ${execTasks.map(t => renderTaskCard(t, true)).join('')}
        </div>

        <!-- Section Rotineiros -->
        <div class="task-section-box section-green" style="padding:0.5rem;">
          <div class="section-title" style="font-size:0.75rem;">Rotineiros</div>
          ${routineTasks.map(t => renderTaskCard(t, false)).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div style="padding: 1rem;">
      <div class="week-columns-grid">
        ${weekDaysHtml}
      </div>
    </div>
  `;
}

// VISÃO DE TODAS AS TAREFAS (LISTA)
function renderAllTasksView(container) {
  container.innerHTML = `
    <div style="padding: 1rem; width: 100%;">
      <div class="task-section-box section-mint" style="max-width: 800px; margin: 0 auto;">
        <div class="section-title">Todas as Suas Tarefas 🐾</div>
        <div class="section-cards-container" style="display: flex; flex-direction: column; gap: 0.75rem;">
          ${tasksList.map(t => renderTaskCard(t, false)).join('') || '<p class="text-center text-muted">Nenhuma tarefa encontrada.</p>'}
        </div>
      </div>
    </div>
  `;
}

// 7. COMPONENTE CARD DE TAREFA E SUPORTE A DRAG-AND-DROP
function renderTaskCard(task, isDraggable = false) {
  const isCompleted = task.status === 'concluida';
  const execFormatted = task.data_execucao ? formatDateBR(task.data_execucao) : '---';
  const deliveryFormatted = task.data_entrega ? formatDateBR(task.data_entrega) : '---';

  let flagColor = '#718096';
  if (task.urgencia === 'urgente') flagColor = 'var(--color-danger)';
  if (task.urgencia === 'alta') flagColor = '#C65911';
  if (task.urgencia === 'normal') flagColor = '#7F6000';

  return `
    <div class="meow-card ${isDraggable ? 'card-draggable' : ''}" 
         onclick="openTaskModal('${task.id}')"
         ${isDraggable ? `draggable="true" ondragstart="handleDragStart(event, '${task.id}')"` : ''}>
      <div class="meow-card-header">
        <div class="meow-card-title-group">
          <div class="status-check-circle ${isCompleted ? 'completed' : ''}">
            ${isCompleted ? '✓' : 'O'}
          </div>
          <span class="meow-card-title">${escapeHtml(task.titulo)}</span>
        </div>
        <span class="flag-icon" style="color: ${flagColor};" title="Urgência: ${task.urgencia}">🚩</span>
      </div>
      <div class="meow-card-footer">
        <span>Fazer: ${execFormatted}</span>
        <span>Para: ${deliveryFormatted}</span>
      </div>
    </div>
  `;
}

// HANDLERS DE DRAG AND DROP (APENAS EM CARDS DE "PARA FAZER")
function handleDragStart(e, taskId) {
  draggingTaskId = taskId;
  e.dataTransfer.setData('text/plain', taskId);
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const targetZone = e.currentTarget;
  targetZone.classList.add('drop-zone-active');
}

function handleDragLeave(e) {
  const targetZone = e.currentTarget;
  targetZone.classList.remove('drop-zone-active');
}

async function handleDrop(e) {
  e.preventDefault();
  const targetZone = e.currentTarget;
  targetZone.classList.remove('drop-zone-active');

  const newExecDateStr = targetZone.dataset.dropdate;
  if (!draggingTaskId || !newExecDateStr) return;

  const task = tasksList.find(t => t.id === draggingTaskId);
  if (!task) return;

  // Validação: Data de Execução NUNCA pode ser posterior à Data de Entrega
  if (task.data_entrega) {
    const deliveryDateStr = task.data_entrega.split(' ')[0];
    if (newExecDateStr > deliveryDateStr) {
      alert('⚠️ Regra de Negócio: Não é possível mover a Data de Execução para depois da Data de Entrega!');
      draggingTaskId = null;
      return;
    }
  }

  try {
    // Atualiza a data_execucao no PocketBase ao soltar o card na nova zona
    await pb.collection('tarefas').update(draggingTaskId, {
      data_execucao: `${newExecDateStr} 00:00:00.000Z`
    });

    draggingTaskId = null;
    await loadAndProcessTasks();
    renderCurrentView();
  } catch (err) {
    console.error('Erro ao atualizar data de execução via Drag-and-Drop:', err);
    alert('Erro ao mover a tarefa.');
  }
}

// 8. GERENCIAMENTO DO MODAL DE EDICAO DE TAREFA
async function openTaskModal(taskId = null) {
  const modalOverlay = document.getElementById('taskModalOverlay');
  const form = document.getElementById('taskForm');
  const subtasksList = document.getElementById('subtasksList');
  subtasksList.innerHTML = '';

  if (taskId) {
    const task = tasksList.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('taskIdInput').value = task.id;
    document.getElementById('taskTitleInput').value = task.titulo;
    document.getElementById('taskCategorySelect').value = task.categoria || '';
    document.getElementById('taskUrgencySelect').value = task.urgencia || 'normal';
    document.getElementById('taskStatusSelect').value = task.status || 'a_fazer';
    document.getElementById('taskDeliveryDate').value = task.data_entrega ? task.data_entrega.split(' ')[0] : '';
    document.getElementById('taskExecDate').value = task.data_execucao ? task.data_execucao.split(' ')[0] : '';
    document.getElementById('taskRecurringCheck').checked = task.is_recurring || false;
    
    if (task.is_recurring) {
      document.getElementById('recurrenceFreqGroup').classList.remove('hidden');
      document.getElementById('taskRecurrenceFreq').value = task.recurrence_freq || 'semanal';
    } else {
      document.getElementById('recurrenceFreqGroup').classList.add('hidden');
    }

    document.getElementById('taskDescInput').value = task.descricao || '';
    document.getElementById('btnDeleteTask').classList.remove('hidden');

    // Carregar subtarefas do PocketBase
    try {
      const subs = await pb.collection('subtarefas').getFullList({
        filter: `tarefa = "${task.id}" && user = "${currentUser.id}"`
      });
      subs.forEach(s => addSubtaskRow(s));
    } catch (e) {
      console.error('Erro ao carregar subtarefas:', e);
    }

  } else {
    // Nova Tarefa
    form.reset();
    document.getElementById('taskIdInput').value = '';
    document.getElementById('taskDeliveryDate').value = selectedDate.toISOString().split('T')[0];
    document.getElementById('taskExecDate').value = selectedDate.toISOString().split('T')[0];
    document.getElementById('recurrenceFreqGroup').classList.add('hidden');
    document.getElementById('btnDeleteTask').classList.add('hidden');
  }

  modalOverlay.classList.add('is-active');
}

function closeTaskModal() {
  document.getElementById('taskModalOverlay').classList.remove('is-active');
}

// UTILITÁRIOS HELPERS
function formatDateBR(dateString) {
  if (!dateString) return '';
  const dateOnly = dateString.split(' ')[0];
  const parts = dateOnly.split('-');
  if (parts.length !== 3) return dateString;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}