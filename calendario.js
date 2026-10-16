/* ==========================================================================
   MEOW PLANS - CALENDÁRIO LOGIC (PocketBase SDK Integration)
   ========================================================================== */

// 1. INICIALIZAÇÃO DO POCKETBASE SDK
const POCKETBASE_URL = 'http://127.0.0.1:8090';
const pb = new PocketBase(POCKETBASE_URL);

// Estado Global da Aplicação
let currentUser = null;
let currentView = 'mes'; // 'mes' | 'semana' | 'dia' | 'tarefas'
let selectedDate = new Date();
let tasksList = [];
let categoriesList = [];
let draggingTaskId = null;

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'
];

// 2. INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', async () => {
  if (!pb.authStore.isValid) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = pb.authStore.model;
  renderUserAvatar();
  setupEventListeners();

  // Carregar Categorias e Tarefas na ordem correta
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

// 3. EVENTOS
function setupEventListeners() {
  document.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentView = e.target.getAttribute('data-view');
      renderCurrentView();
    });
  });

  document.getElementById('prevPeriodBtn').addEventListener('click', () => navigatePeriod(-1));
  document.getElementById('nextPeriodBtn').addEventListener('click', () => navigatePeriod(1));

  document.getElementById('btnSair').addEventListener('click', () => {
    pb.authStore.clear();
    window.location.href = 'login.html';
  });

  document.getElementById('btnNovaTarefa').addEventListener('click', () => openTaskModal());
  document.getElementById('closeTaskModalBtn').addEventListener('click', closeTaskModal);

  // Toggle do formulário ao marcar Recorrente/Rotina
  document.getElementById('taskRecurringCheck').addEventListener('change', (e) => {
    toggleRecurringFields(e.target.checked);
  });

  document.getElementById('taskForm').addEventListener('submit', handleSaveTask);
  document.getElementById('btnDeleteTask').addEventListener('click', handleDeleteTask);
  document.getElementById('btnAddSubtaskBtn').addEventListener('click', () => addSubtaskRow());
}

function toggleRecurringFields(isRecurring) {
  const freqGroup = document.getElementById('recurrenceFreqGroup');
  const execGroup = document.getElementById('taskExecDateGroup');
  const deliveryLabel = document.getElementById('taskDeliveryDateLabel');
  
  if (isRecurring) {
    freqGroup.classList.remove('hidden');
    if (execGroup) execGroup.classList.add('hidden');
    if (deliveryLabel) deliveryLabel.textContent = '🔁 Repetir até (Data Limite):';
  } else {
    freqGroup.classList.add('hidden');
    if (execGroup) execGroup.classList.remove('hidden');
    if (deliveryLabel) deliveryLabel.textContent = '📅 Data de Entrega (Prazo Final):';
  }
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

// 4. OPERAÇÕES DE DADOS (POCKETBASE)
async function loadCategories() {
  try {
    // Filtro simplificado e seguro para categorias do usuário ativo
    categoriesList = await pb.collection('Categorias').getFullList({
      filter: `user = "${currentUser.id}" && (deleted = false || deleted = null)`,
      sort: 'nome'
    });

    populateCategoryOptions();
  } catch (err) {
    // Tenta fallback com a coleção em minúsculo caso o PocketBase aceite 'categorias'
    try {
      categoriesList = await pb.collection('categorias').getFullList({
        filter: `user = "${currentUser.id}" && (deleted = false || deleted = null)`,
        sort: 'nome'
      });
      populateCategoryOptions();
    } catch (fallbackErr) {
      console.error('Erro ao carregar categorias do PocketBase:', err, fallbackErr);
    }
  }
}

function populateCategoryOptions(selectedCategoryId = '') {
  const categorySelect = document.getElementById('taskCategorySelect');
  if (!categorySelect) return;

  categorySelect.innerHTML = '<option value="">Sem Categoria</option>';
  categoriesList.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat.id;
    option.textContent = cat.nome;
    if (selectedCategoryId && cat.id === selectedCategoryId) {
      option.selected = true;
    }
    categorySelect.appendChild(option);
  });
}

async function loadAndProcessTasks() {
  try {
    const rawTasks = await pb.collection('tarefas').getFullList({
      filter: `user = "${currentUser.id}" && (deleted = false || deleted = null)`,
      expand: 'categoria'
    });

    const todayStr = new Date().toISOString().split('T')[0];

    tasksList = await Promise.all(rawTasks.map(async (task) => {
      let taskDeliveryStr = task.data_entrega ? task.data_entrega.split(' ')[0] : null;

      // Auto-marcar como Atrasada se a data de entrega passou
      if (!task.is_recurring && taskDeliveryStr && taskDeliveryStr < todayStr && task.status !== 'concluida' && task.status !== 'cancelada' && task.status !== 'atrasada') {
        try {
          await pb.collection('tarefas').update(task.id, { status: 'atrasada' });
          return { ...task, status: 'atrasada' };
        } catch (e) {
          console.error(`Erro ao atualizar atraso da tarefa ${task.id}:`, e);
        }
      }
      return task;
    }));

  } catch (err) {
    console.error('Erro ao carregar tarefas:', err);
  }
}

// 5. REGRA DE REPETIÇÃO E RECORRÊNCIA
function isRoutineForDate(task, targetDateObj) {
  if (!task.is_recurring) return false;

  const targetDate = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), targetDateObj.getDate());
  const createdDateRaw = new Date(task.created);
  const startDate = new Date(createdDateRaw.getFullYear(), createdDateRaw.getMonth(), createdDateRaw.getDate());

  if (targetDate < startDate) return false;

  if (task.data_entrega) {
    const limitDateRaw = new Date(task.data_entrega);
    const limitDate = new Date(limitDateRaw.getFullYear(), limitDateRaw.getMonth(), limitDateRaw.getDate());
    if (targetDate > limitDate) return false;
  }

  const freq = task.recurrence_freq || 'diario';

  if (freq === 'diario') {
    return true;
  } else if (freq === 'semanal') {
    return targetDate.getDay() === startDate.getDay();
  } else if (freq === 'mensal') {
    return targetDate.getDate() === startDate.getDate();
  } else if (freq === 'anual') {
    return targetDate.getDate() === startDate.getDate() && targetDate.getMonth() === startDate.getMonth();
  }

  return false;
}

// 6. VALIDAÇÃO E SALVAMENTO DE TAREFAS
function validateTaskDates(dataExec, dataEntrega, isRecurring) {
  if (!isRecurring && dataExec && dataEntrega) {
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
  const is_recurring = document.getElementById('taskRecurringCheck').checked;
  const recurrence_freq = is_recurring ? document.getElementById('taskRecurrenceFreq').value : null;
  const descricao = document.getElementById('taskDescInput').value.trim();

  const data_execucao = is_recurring ? null : document.getElementById('taskExecDate').value;
  const data_entrega = document.getElementById('taskDeliveryDate').value;

  if (!validateTaskDates(data_execucao, data_entrega, is_recurring)) {
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
      savedTask = await pb.collection('tarefas').update(id, taskPayload);
    } else {
      savedTask = await pb.collection('tarefas').create(taskPayload);
    }

    await saveSubtasks(savedTask.id);
    closeTaskModal();
    await loadAndProcessTasks();
    renderCurrentView();
  } catch (err) {
    console.error('Erro ao salvar tarefa no PocketBase:', err);
    alert('Ocorreu um erro ao salvar a tarefa.');
  }
}

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

async function saveSubtasks(taskId) {
  const rows = document.querySelectorAll('.subtask-row');
  for (const row of rows) {
    const subid = row.dataset.subid;
    const input = row.querySelector('.subtask-input');
    const checkbox = row.querySelector('.subtask-check');
    const titulo = input.value.trim();

    if (!titulo && subid) {
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

// 7. RENDERIZAÇÃO DAS VISUALIZAÇÕES
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
    label.textContent = `${WEEKDAY_NAMES[selectedDate.getDay()]}, ${selectedDate.getDate()} de ${MONTH_NAMES[selectedDate.getMonth()]}`;
    renderDayView(mainContent, selectedDate);
  } else if (currentView === 'tarefas') {
    label.textContent = 'Todas as Tarefas';
    renderAllTasksView(mainContent);
  }
}

function renderMonthView(container) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();

  let daysHtml = '';

  for (let x = firstDayIndex; x > 0; x--) {
    daysHtml += `<div class="day-cell other-month">${prevMonthTotalDays - x + 1}</div>`;
  }

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
    <div class="day-details-panel" id="monthSelectedDayDetails"></div>
  `;

  renderDayPanel(document.getElementById('monthSelectedDayDetails'), selectedDate);
}

function selectMonthDay(dayNumber) {
  selectedDate.setDate(dayNumber);
  renderCurrentView();
}

function renderDayPanel(targetElement, dateObj) {
  const dateStr = dateObj.toISOString().split('T')[0];
  const dayTitleStr = `${WEEKDAY_NAMES[dateObj.getDay()]}, ${dateObj.getDate()} de ${MONTH_NAMES[dateObj.getMonth()]}`;

  const deliveryTasks = tasksList.filter(t => !t.is_recurring && t.data_entrega && t.data_entrega.startsWith(dateStr));
  const execTasks = tasksList.filter(t => !t.is_recurring && t.data_execucao && t.data_execucao.startsWith(dateStr));
  const routineTasks = tasksList.filter(t => isRoutineForDate(t, dateObj));

  targetElement.innerHTML = `
    <div class="day-panel-header">
      <button class="day-panel-close-btn">&times;</button>
      <span>${dayTitleStr}</span>
    </div>

    <!-- PARA ENTREGAR HOJE -->
    <div class="task-section-box section-pink">
      <div class="section-title">Para Entregar</div>
      <div class="section-cards-container">
        ${deliveryTasks.map(t => renderTaskCard(t, false)).join('') || '<p class="text-center text-muted" style="font-size:0.75rem;">Nenhuma entrega para hoje ✨</p>'}
      </div>
    </div>

    <!-- PARA FAZER HOJE (DRAG AND DROP HABILITADO) -->
    <div class="task-section-box section-mint drop-zone" data-dropdate="${dateStr}" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)">
      <div class="section-title">Para Fazer</div>
      <div class="section-cards-container">
        ${execTasks.map(t => renderTaskCard(t, true)).join('') || '<p class="text-center text-muted" style="font-size:0.75rem;">Nada agendado para fazer ✨</p>'}
      </div>
    </div>

    <!-- ROTINEIROS -->
    <div class="task-section-box section-green">
      <div class="section-title">Rotineiros</div>
      <div class="section-cards-container">
        ${routineTasks.map(t => renderTaskCard(t, false)).join('') || '<p class="text-center text-muted" style="font-size:0.75rem;">Sem rotinas para hoje 🐾</p>'}
      </div>
    </div>
  `;
}

function renderDayView(container, dateObj) {
  container.innerHTML = `
    <div class="day-details-panel" style="border-radius: 0; min-height: calc(100vh - 120px);">
      <div id="singleDayPanel"></div>
    </div>
  `;
  renderDayPanel(document.getElementById('singleDayPanel'), dateObj);
}

function renderWeekView(container) {
  const startOfWeek = new Date(selectedDate);
  startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());

  let weekDaysHtml = '';

  for (let i = 0; i < 7; i++) {
    const currentDay = new Date(startOfWeek);
    currentDay.setDate(startOfWeek.getDate() + i);
    const dateStr = currentDay.toISOString().split('T')[0];

    const deliveryTasks = tasksList.filter(t => !t.is_recurring && t.data_entrega && t.data_entrega.startsWith(dateStr));
    const execTasks = tasksList.filter(t => !t.is_recurring && t.data_execucao && t.data_execucao.startsWith(dateStr));
    const routineTasks = tasksList.filter(t => isRoutineForDate(t, currentDay));

    weekDaysHtml += `
      <div class="week-day-column mb-1" style="background:#232B38; padding:0.75rem; border-radius:var(--radius-lg);">
        <div class="text-center font-bold" style="color:#FFF; font-size:0.9rem; margin-bottom:0.5rem;">
          ${WEEKDAY_NAMES[currentDay.getDay()]} <span style="font-weight:400; font-size:0.8rem; color:#A0AEC0;">${currentDay.getDate()}</span>
        </div>

        <div class="task-section-box section-pink" style="padding:0.5rem;">
          <div class="section-title" style="font-size:0.75rem;">Para Entregar</div>
          ${deliveryTasks.map(t => renderTaskCard(t, false)).join('')}
        </div>

        <div class="task-section-box section-mint drop-zone" data-dropdate="${dateStr}" style="padding:0.5rem;" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)">
          <div class="section-title" style="font-size:0.75rem;">Para Fazer</div>
          ${execTasks.map(t => renderTaskCard(t, true)).join('')}
        </div>

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

// 8. CARD DE TAREFA E DRAG & DROP
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
        ${task.is_recurring 
          ? `<span>🔄 ${task.recurrence_freq || 'Rotina'}</span>` 
          : `<span>Fazer: ${execFormatted}</span><span>Para:${deliveryFormatted}</span>`}
      </div>
    </div>
  `;
}

function handleDragStart(e, taskId) {
  draggingTaskId = taskId;
  e.dataTransfer.setData('text/plain', taskId);
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  e.currentTarget.classList.add('drop-zone-active');
}

function handleDragLeave(e) {
  e.currentTarget.classList.remove('drop-zone-active');
}

async function handleDrop(e) {
  e.preventDefault();
  const targetZone = e.currentTarget;
  targetZone.classList.remove('drop-zone-active');

  const newExecDateStr = targetZone.dataset.dropdate;
  if (!draggingTaskId || !newExecDateStr) return;

  const task = tasksList.find(t => t.id === draggingTaskId);
  if (!task || task.is_recurring) return;

  if (task.data_entrega) {
    const deliveryDateStr = task.data_entrega.split(' ')[0];
    if (newExecDateStr > deliveryDateStr) {
      alert('⚠️ Regra de Negócio: Não é possível mover a Data de Execução para depois da Data de Entrega!');
      draggingTaskId = null;
      return;
    }
  }

  try {
    await pb.collection('tarefas').update(draggingTaskId, {
      data_execucao: `${newExecDateStr} 00:00:00.000Z`
    });

    draggingTaskId = null;
    await loadAndProcessTasks();
    renderCurrentView();
  } catch (err) {
    console.error('Erro ao mover a tarefa:', err);
    alert('Erro ao mover a tarefa.');
  }
}

// 9. MODAL DE EDIÇÃO
async function openTaskModal(taskId = null) {
  const modalOverlay = document.getElementById('taskModalOverlay');
  const form = document.getElementById('taskForm');
  const subtasksList = document.getElementById('subtasksList');
  subtasksList.innerHTML = '';

  if (taskId) {
    const task = tasksList.find(t => t.id === taskId);
    if (!task) return;

    // Popula o select e deixa selecionada a categoria salva
    populateCategoryOptions(task.categoria || '');

    document.getElementById('taskIdInput').value = task.id;
    document.getElementById('taskTitleInput').value = task.titulo;
    document.getElementById('taskUrgencySelect').value = task.urgencia || 'normal';
    document.getElementById('taskStatusSelect').value = task.status || 'a_fazer';
    document.getElementById('taskDeliveryDate').value = task.data_entrega ? task.data_entrega.split(' ')[0] : '';
    document.getElementById('taskExecDate').value = task.data_execucao ? task.data_execucao.split(' ')[0] : '';
    
    const isRecurring = task.is_recurring || false;
    document.getElementById('taskRecurringCheck').checked = isRecurring;
    toggleRecurringFields(isRecurring);

    if (isRecurring) {
      document.getElementById('taskRecurrenceFreq').value = task.recurrence_freq || 'semanal';
    }

    document.getElementById('taskDescInput').value = task.descricao || '';
    document.getElementById('btnDeleteTask').classList.remove('hidden');

    try {
      const subs = await pb.collection('subtarefas').getFullList({
        filter: `tarefa = "${task.id}" && user = "${currentUser.id}"`
      });
      subs.forEach(s => addSubtaskRow(s));
    } catch (e) {
      console.error('Erro ao carregar subtarefas:', e);
    }

  } else {
    form.reset();
    populateCategoryOptions(''); // Re-popula após o reset para restaurar os options
    document.getElementById('taskIdInput').value = '';
    document.getElementById('taskDeliveryDate').value = selectedDate.toISOString().split('T')[0];
    document.getElementById('taskExecDate').value = selectedDate.toISOString().split('T')[0];
    toggleRecurringFields(false);
    document.getElementById('btnDeleteTask').classList.add('hidden');
  }

  modalOverlay.classList.add('is-active');
}

function closeTaskModal() {
  document.getElementById('taskModalOverlay').classList.remove('is-active');
}

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