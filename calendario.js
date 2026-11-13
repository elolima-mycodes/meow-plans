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
let routineCompletionsList = [];
let draggingTaskId = null;
let deletedSubtaskIds = []; // Guarda os IDs das subtarefas para excluir no banco

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAY_NAMES = [
  'Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'
];

// 2. INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', async () => {
  const maxInactivityMs = 120 * 60 * 1000; // 120 minutos
  const lastActivity = localStorage.getItem('last_activity');
  const now = Date.now();

  if (!pb.authStore.isValid || (lastActivity && (now - parseInt(lastActivity, 10) > maxInactivityMs))) {
    pb.authStore.clear();
    localStorage.removeItem('last_activity');
    window.location.href = 'login.html';
    return;
  }

  localStorage.setItem('last_activity', now.toString());
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

// 3. EVENTOS DEFENSIVOS (Funciona tanto em calendario.html quanto gerenciar.html)
function setupEventListeners() {

  // Inicializa o botão de alternar tema
  initThemeTracker();

  // Redireciona para a página de perfil ao clicar no avatar
  const avatarEl = document.getElementById('userAvatar');
  if (avatarEl) {
    avatarEl.style.cursor = 'pointer';
    avatarEl.addEventListener('click', () => {
      window.location.href = 'usuario.html';
    });
  }

  document.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentView = e.target.getAttribute('data-view');
      renderCurrentView();
    });
  });

  const prevBtn = document.getElementById('prevPeriodBtn');
  if (prevBtn) prevBtn.addEventListener('click', () => navigatePeriod(-1));

  const nextBtn = document.getElementById('nextPeriodBtn');
  if (nextBtn) nextBtn.addEventListener('click', () => navigatePeriod(1));

  const btnSair = document.getElementById('btnSair');
  if (btnSair) {
    btnSair.addEventListener('click', () => {
      pb.authStore.clear();
      window.location.href = 'login.html';
    });
  }

  const btnNovaTarefa = document.getElementById('btnNovaTarefa');
  if (btnNovaTarefa) btnNovaTarefa.addEventListener('click', () => openTaskModal());

  const closeTaskModalBtn = document.getElementById('closeTaskModalBtn');
  if (closeTaskModalBtn) closeTaskModalBtn.addEventListener('click', closeTaskModal);

  const taskRecurringCheck = document.getElementById('taskRecurringCheck');
  if (taskRecurringCheck) {
    taskRecurringCheck.addEventListener('change', (e) => {
      toggleRecurringFields(e.target.checked);
    });
  }

  const taskForm = document.getElementById('taskForm');
  if (taskForm) taskForm.addEventListener('submit', handleSaveTask);

  const btnDeleteTask = document.getElementById('btnDeleteTask');
  if (btnDeleteTask) btnDeleteTask.addEventListener('click', handleDeleteTask);

  const btnAddSubtaskBtn = document.getElementById('btnAddSubtaskBtn');
  if (btnAddSubtaskBtn) btnAddSubtaskBtn.addEventListener('click', () => addSubtaskRow());

  const taskCategorySelect = document.getElementById('taskCategorySelect');
  if (taskCategorySelect) {
    taskCategorySelect.addEventListener('change', (e) => {
      updateTaskCategoryColorPreview(e.target.value);
    });
  }

  const btnExportCSV = document.getElementById('btnExportWeekCSV');
  if (btnExportCSV) btnExportCSV.addEventListener('click', exportWeekToCSV);

  const btnExportPDF = document.getElementById('btnExportWeekPDF');
  if (btnExportPDF) btnExportPDF.addEventListener('click', exportWeekToPDF);
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

  categorySelect.innerHTML = '<option value="">Sem categoria</option>';
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

    // Carrega o histórico de rotinas concluídas por dia
    try {
      routineCompletionsList = await pb.collection('conclusoes_rotina').getFullList({
        filter: `user = "${currentUser.id}"`
      });
    } catch (err) {
      console.warn('Coleção conclusoes_rotina ainda sem registros ou erro ao carregar:', err);
      routineCompletionsList = [];
    }

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

  // Data exibida no calendário (YYYY-MM-DD)
  const targetStr = getLocalDateStr(targetDateObj);

  // Data inicial da rotina: prioriza data_execucao; se não houver, usa a data de criação
  const baseDateStr = task.data_execucao
    ? task.data_execucao.split(' ')[0]
    : task.created.split(' ')[0];

  // Regra 1: Não exibe em dias anteriores ao início da rotina
  if (targetStr < baseDateStr) return false;

  // Regra 2: Se houver "Repetir até" (data_entrega), bloqueia se a data atual passou do limite
  if (task.data_entrega) {
    const limitDateStr = task.data_entrega.split(' ')[0];
    if (targetStr > limitDateStr) {
      return false;
    }
  }

  // Regras de Frequência de Repetição
  const baseParts = baseDateStr.split('-');
  const startDate = new Date(parseInt(baseParts[0]), parseInt(baseParts[1]) - 1, parseInt(baseParts[2]));
  const targetDate = new Date(targetDateObj.getFullYear(), targetDateObj.getMonth(), targetDateObj.getDate());

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

  // Pega a data de hoje formatada no padrão YYYY-MM-DD
  const todayStr = getLocalDateStr();

  // Validação 1: Bloquear criação/edição com datas passadas
  if (dataEntrega && dataEntrega < todayStr) {
    alert('⚠️ Regra de Negócio: A Data de Entrega/Limite não pode ser anterior ao dia de hoje!');
    return false;
  }

  if (!isRecurring && dataExec && dataExec < todayStr) {
    alert('⚠️ Regra de Negócio: A Data de Execução não pode ser anterior ao dia de hoje!');
    return false;
  }

  // Validação 2: Data de execução nunca pode ser posterior à data de entrega
  if (!isRecurring && dataExec && dataEntrega) {
    if (dataExec > dataEntrega) {
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
    data_entrega: data_entrega ? `${data_entrega} 12:00:00.000Z` : null,
    data_execucao: data_execucao ? `${data_execucao} 12:00:00.000Z` : null,
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
  // 1. Exclui no PocketBase todas as subtarefas marcadas para remoção
  for (const subid of deletedSubtaskIds) {
    try {
      await pb.collection('subtarefas').delete(subid);
    } catch (err) {
      console.error(`Erro ao apagar subtarefa ${subid}:`, err);
    }
  }

  // 2. Cria ou atualiza as subtarefas que continuam na tela
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
    <input type="text" class="input-control subtask-input" value="${escapeHtml(subtask.titulo)}" placeholder="Título da subtarefa..." style="min-height:32px; padding:0.25rem 0.5rem; font-size:0.85rem;" />
    <button type="button" class="btn-link" style="color:var(--color-danger); text-decoration:none;" onclick="removeSubtaskRow(this, '${subtask.id}')">&times;</button>
  `;
  container.appendChild(row);
}

// Remove o elemento da tela e registra o ID para exclusão no PocketBase
function removeSubtaskRow(btnElement, subtaskId) {
  if (subtaskId) {
    deletedSubtaskIds.push(subtaskId);
  }
  btnElement.parentElement.remove();
}

// 7. RENDERIZAÇÃO DAS VISUALIZAÇÕES
function renderCurrentView() {
  const mainContent = document.getElementById('calendarMainContent');
  const label = document.getElementById('currentPeriodLabel');
  const exportGroup = document.getElementById('weekExportButtons');

  // Exibe os botões de exportação apenas na visualização semanal
  if (exportGroup) {
    if (currentView === 'semana') {
      exportGroup.classList.remove('hidden');
      exportGroup.style.display = 'inline-flex';
    } else {
      exportGroup.classList.add('hidden');
      exportGroup.style.display = 'none';
    }
  }

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
  const dateStr = getLocalDateStr(dateObj);
  const dayTitleStr = `${WEEKDAY_NAMES[dateObj.getDay()]}, ${dateObj.getDate()} de ${MONTH_NAMES[dateObj.getMonth()]}`;

  const deliveryTasks = tasksList.filter(t => !t.is_recurring && t.data_entrega && t.data_entrega.startsWith(dateStr));
  const execTasks = tasksList.filter(t => !t.is_recurring && t.data_execucao && t.data_execucao.startsWith(dateStr));
  const routineTasks = tasksList.filter(t => isRoutineForDate(t, dateObj));

  targetElement.innerHTML = `
    <div class="day-panel-header" style="margin-bottom: 0.5rem;">
      <span>${dayTitleStr}</span>
    </div>

    <!-- PARA ENTREGAR HOJE -->
    <div class="task-section-box section-pink" style="margin-bottom: 0.5rem;">
      <div class="section-title">Para Entregar</div>
      <div class="section-cards-container">
        ${deliveryTasks.map(t => renderTaskCard(t, false, dateStr)).join('') || '<p class="text-center text-muted" style="font-size:0.75rem;">Nenhuma entrega para hoje ✨</p>'}
      </div>
    </div>

    <!-- PARA FAZER HOJE -->
    <div class="task-section-box section-mint drop-zone" data-dropdate="${dateStr}" style="margin-bottom: 0.5rem;" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)">
      <div class="section-title">Para Fazer</div>
      <div class="section-cards-container">
        ${execTasks.map(t => renderTaskCard(t, true, dateStr)).join('') || '<p class="text-center text-muted" style="font-size:0.75rem;">Nada agendado para fazer ✨</p>'}
      </div>
    </div>

    <!-- ROTINEIROS -->
    <div class="task-section-box section-green">
      <div class="section-title">Rotineiros</div>
      <div class="section-cards-container">
        ${routineTasks.map(t => renderTaskCard(t, false, dateStr)).join('') || '<p class="text-center text-muted" style="font-size:0.75rem;">Sem rotinas para hoje 🐾</p>'}
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
      <div class="week-day-column mb-1" style="background: var(--bg-card, #232B38); padding:0.75rem; border-radius:var(--radius-lg);">
      <div class="text-center font-bold" style="color: var(--text-main, #FFF); font-size:0.9rem; margin-bottom:0.5rem;">
          ${WEEKDAY_NAMES[currentDay.getDay()]} <span style="font-weight:400; font-size:0.8rem; color:#A0AEC0;">${currentDay.getDate()}</span>
        </div>

        <!-- PARA ENTREGAR -->
        <div class="task-section-box section-pink" style="padding: 0.5rem; margin-bottom: 0.5rem;">
          <div class="section-title" style="font-size:0.75rem;">Para Entregar</div>
          <div class="section-cards-container">
            ${deliveryTasks.map(t => renderTaskCard(t, false, dateStr)).join('') || '<p class="text-center text-muted" style="font-size:0.7rem; margin:0.25rem 0;">Sem entregas ✨</p>'}
          </div>
        </div>

        <!-- PARA FAZER -->
        <div class="task-section-box section-mint drop-zone" data-dropdate="${dateStr}" style="padding: 0.5rem; margin-bottom: 0.5rem;" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)">
          <div class="section-title" style="font-size:0.75rem;">Para Fazer</div>
          <div class="section-cards-container">
            ${execTasks.map(t => renderTaskCard(t, true, dateStr)).join('') || '<p class="text-center text-muted" style="font-size:0.7rem; margin:0.25rem 0;">Nada a fazer ✨</p>'}
          </div>
        </div>

        <!-- ROTINEIROS -->
        <div class="task-section-box section-green" style="padding: 0.5rem;">
          <div class="section-title" style="font-size:0.75rem;">Rotineiros</div>
          <div class="section-cards-container">
            ${routineTasks.map(t => renderTaskCard(t, false, dateStr)).join('') || '<p class="text-center text-muted" style="font-size:0.7rem; margin:0.25rem 0;">Sem rotinas 🐾</p>'}
          </div>
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

// 8. CARD DE TAREFA E DRAG & DROP (RF02.3 & RF05.4)
function renderTaskCard(task, isDraggable = false, currentDateStr = null) {
  // Pega a data do dia em que o card está sendo renderizado (ex: '2026-11-04')
  const targetDateStr = currentDateStr || getLocalDateStr(selectedDate);

  // 1. Determina se esta tarefa está concluída HOJE
  let isCompleted = false;

  if (task.is_recurring) {
    // Para rotinas: verifica se existe registro na tabela conclusoes_rotina para esta data
    const hasCompletion = routineCompletionsList.some(
      c => c.tarefa === task.id && c.data === targetDateStr
    );
    isCompleted = hasCompletion;
  } else {
    // Para tarefas normais: verifica o status direto do banco
    isCompleted = task.status === 'concluida';
  }

  // 2. Formatadores de data para a rodapé do card
  const execFormatted = task.data_execucao ? formatDateBR(task.data_execucao) : '---';
  const deliveryFormatted = task.data_entrega ? formatDateBR(task.data_entrega) : '---';

  // 3. Monta a chamada do clique passando a data e se é rotina
  const toggleOnClick = `toggleTaskStatus(event, '${task.id}', '${task.status}', '${targetDateStr}', ${task.is_recurring})`;

  // 4. Monta o Ícone de Status dinâmico
  let statusIconHtml = '';

  if (isCompleted) {
    // Ícone verde de concluído
    statusIconHtml = `<i class="bi bi-check-circle-fill status-icon status-done status-icon-btn" 
                        title="Reabrir tarefa" 
                        style="cursor:pointer;" 
                        onclick="${toggleOnClick}"></i>`;
  } else if (task.status === 'em_progresso') {
    statusIconHtml = `<i class="bi bi-hourglass-split status-icon status-doing status-icon-btn" 
                        title="Em Progresso - Clique para alternar" 
                        style="cursor:pointer;" 
                        onclick="${toggleOnClick}"></i>`;
  } else if (task.status === 'atrasada') {
    statusIconHtml = `<i class="bi bi-exclamation-triangle-fill status-icon status-overdue status-icon-btn" 
                        title="Atrasada - Clique para concluir" 
                        style="cursor:pointer;" 
                        onclick="${toggleOnClick}"></i>`;
  } else if (task.status === 'cancelada') {
    statusIconHtml = `<i class="bi bi-x-circle-fill status-icon status-cancelled status-icon-btn" 
                        title="Cancelada" 
                        style="cursor:pointer;" 
                        onclick="${toggleOnClick}"></i>`;
  } else {
    // Padrão: A Fazer (círculo vazio)
    statusIconHtml = `<i class="bi bi-circle status-icon status-todo status-icon-btn" 
                        title="Marcar como Concluída" 
                        style="cursor:pointer;" 
                        onclick="${toggleOnClick}"></i>`;
  }

  // 5. Cores das bandeiras de urgência
  let flagColor = '#A8F5B4';
  let urgencyLabel = 'Normal';

  if (task.urgencia === 'baixa') {
    flagColor = '#C2E0FF';
    urgencyLabel = 'Baixa';
  } else if (task.urgencia === 'normal') {
    flagColor = '#A8F5B4';
    urgencyLabel = 'Normal';
  } else if (task.urgencia === 'alta') {
    flagColor = '#FFD8A8';
    urgencyLabel = 'Alta';
  } else if (task.urgencia === 'urgente') {
    flagColor = '#FFA8A8';
    urgencyLabel = 'Urgente';
  }

  const flagIcon = `<i class="bi bi-flag-fill" style="color: ${flagColor}; -webkit-text-stroke: 1px #2D3748; font-size: 1.1rem; vertical-align: middle;"></i>`;

  // 6. Retorna o HTML do Card montado
  return `
    <div class="meow-card ${isDraggable ? 'card-draggable' : ''} ${isCompleted ? 'card-completed' : ''}" 
         onclick="openTaskModal('${task.id}')"
         ${isDraggable ? `draggable="true" ondragstart="handleDragStart(event, '${task.id}')"` : ''}>
      <div class="meow-card-header">
        <div class="meow-card-title-group">
          ${statusIconHtml}
          <span class="meow-card-title ${isCompleted ? 'text-strikethrough' : ''}">${escapeHtml(task.titulo)}</span>
        </div>
        <span class="flag-icon" title="Urgência: ${urgencyLabel}">
          ${flagIcon}
        </span>
      </div>
      <div class="meow-card-footer">
        ${task.is_recurring
      ? `<span>🔄 ${task.recurrence_freq || 'Rotina'}</span>`
      : `<span>Fazer: ${execFormatted}</span><span>Para: ${deliveryFormatted}</span>`}
      </div>
    </div>
  `;
}

// Alterna rapidamente o status da tarefa entre 'concluida' e 'a_fazer' (RF02.3 / RF05.4)
async function toggleTaskStatus(event, taskId, currentStatus, targetDateStr = null, isRecurring = false) {
  event.stopPropagation(); // Impede a abertura do modal ao clicar no ícone de status

  // Garante uma data válida caso não seja informada
  const dateStr = targetDateStr || getLocalDateStr(selectedDate);

  try {
    if (isRecurring) {
      // Procura se já existe uma conclusão gravada para esta rotina nesta data
      const existing = routineCompletionsList.find(c => c.tarefa === taskId && c.data === dateStr);

      if (existing) {
        // Se já foi concluída hoje, desmarca (remove da coleção conclusoes_rotina)
        await pb.collection('conclusoes_rotina').delete(existing.id);
      } else {
        // Se não foi concluída hoje, cria o registro na coleção conclusoes_rotina
        await pb.collection('conclusoes_rotina').create({
          tarefa: taskId,
          data: dateStr,
          user: currentUser.id
        });
      }
    } else {
      // Para tarefas normais: altera o status direto na coleção tarefas
      const newStatus = currentStatus === 'concluida' ? 'a_fazer' : 'concluida';
      await pb.collection('tarefas').update(taskId, { status: newStatus });
    }

    await loadAndProcessTasks();
    renderCurrentView();
  } catch (err) {
    console.error('Erro ao alternar status da tarefa:', err);
    alert('Erro ao atualizar o status da tarefa.');
  }
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

  const todayStr = getLocalDateStr();

  // Bloqueia se tentar soltar em um dia que já passou
  if (newExecDateStr < todayStr) {
    alert('⚠️ Regra de Negócio: Não é possível mover a Data de Execução para um dia que já passou!');
    draggingTaskId = null;
    return;
  }

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

// Utilitário para pegar a data atual/local sem problemas de fuso horário UTC
function getLocalDateStr(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 9. MODAL DE EDIÇÃO
async function openTaskModal(taskId = null) {
  deletedSubtaskIds = []; // <-- Reseta a lista de subtarefas a serem excluídas
  const modalOverlay = document.getElementById('taskModalOverlay');
  const form = document.getElementById('taskForm');
  const subtasksList = document.getElementById('subtasksList');
  subtasksList.innerHTML = '';

  // Atualiza dinamicamente a data mínima permitida nos campos do formulário para HOJE
  const todayStr = getLocalDateStr();
  const deliveryInput = document.getElementById('taskDeliveryDate');
  const execInput = document.getElementById('taskExecDate');

  if (deliveryInput) deliveryInput.min = todayStr;
  if (execInput) execInput.min = todayStr;

  if (taskId) {
    const task = tasksList.find(t => t.id === taskId);
    if (!task) return;

    populateCategoryOptions(task.categoria || '');
    updateTaskCategoryColorPreview(task.categoria || ''); // <-- Atualiza a cor do círculo no modal

    document.getElementById('taskIdInput').value = task.id;
    document.getElementById('taskTitleInput').value = task.titulo;
    const urgencyValue = task.urgencia || 'normal';
    document.getElementById('taskUrgencySelect').value = urgencyValue;
    updateModalUrgencyFlag(urgencyValue); // <-- Atualiza a cor do ícone no modal
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
    populateCategoryOptions('');
    updateTaskCategoryColorPreview('');

    // Se o dia selecionado no calendário for anterior a hoje, força a data para HOJE
    const selectedDateStr = getLocalDateStr(selectedDate);
    const initialDateStr = selectedDateStr < todayStr ? todayStr : selectedDateStr;

    document.getElementById('taskIdInput').value = '';
    document.getElementById('taskDeliveryDate').value = initialDateStr;
    document.getElementById('taskExecDate').value = initialDateStr;
    document.getElementById('taskUrgencySelect').value = 'normal';
    updateModalUrgencyFlag('normal'); // <-- Garante a cor verde para nova tarefa

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

// Atualiza apenas a cor do ícone da bandeira do Bootstrap Icons no Modal
function updateModalUrgencyFlag(urgency) {
  const flagIcon = document.getElementById('urgencyFlagIcon');
  if (!flagIcon) return;

  const colors = {
    baixa: '#C2E0FF',   // Azul pastel
    normal: '#A8F5B4',  // Verde pastel
    alta: '#FFD8A8',    // Laranja pastel
    urgente: '#FFA8A8'  // Vermelho/Coral pastel
  };

  flagIcon.style.color = colors[urgency] || colors.normal;
}

// Atualiza a bolinha indicadora de cor da categoria no modal do calendário
function updateTaskCategoryColorPreview(categoryId) {
  const previewEl = document.getElementById('taskCategoryColorPreview');
  if (!previewEl) return;

  if (!categoryId) {
    // Tarefa sem categoria: oculta o círculo de cor
    previewEl.style.display = 'none';
    return;
  }

  const catObj = categoriesList.find(c => c.id === categoryId);
  if (catObj && catObj.cor) {
    previewEl.style.backgroundColor = catObj.cor;
    previewEl.style.display = 'inline-block';
  } else {
    previewEl.style.display = 'none';
  }
}

// Gerenciador de inatividade no Calendário (Sessão de 30 minutos)
function initInactivityTracker() {
  const updateActivity = () => {
    if (pb.authStore.isValid) {
      localStorage.setItem('last_activity', Date.now().toString());
    }
  };

  ['click', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(eventType => {
    window.addEventListener(eventType, updateActivity, { passive: true });
  });

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

initInactivityTracker();

// ==========================================
// CONTROLE DE TEMA (CLARO / ESCURO)
// ==========================================
function initThemeTracker() {
  const savedTheme = localStorage.getItem('app_theme') || 'dark'; // Padrão escuro ou claro

  if (savedTheme === 'dark') {
    document.body.classList.add('dark-theme');
  } else {
    document.body.classList.remove('dark-theme');
  }

  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

    // Garante que não duplica o evento de clique
    themeBtn.onclick = () => {
      const isDark = document.body.classList.toggle('dark-theme');
      const newTheme = isDark ? 'dark' : 'light';

      localStorage.setItem('app_theme', newTheme);
      themeBtn.textContent = isDark ? '☀️' : '🌙';
    };
  }
}

// ==========================================================================
// 10. EXPORTAÇÃO DA VISUALIZAÇÃO SEMANAL (CSV & PDF - RF07.2)
// ==========================================================================

function getCurrentWeekExportData() {
  const startOfWeek = new Date(selectedDate);
  startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());

  const rows = [];

  for (let i = 0; i < 7; i++) {
    const currentDay = new Date(startOfWeek);
    currentDay.setDate(startOfWeek.getDate() + i);
    const dateStr = getLocalDateStr(currentDay);
    const dayLabel = `${WEEKDAY_NAMES[currentDay.getDay()]} (${formatDateBR(dateStr)})`;

    const deliveryTasks = tasksList.filter(t => !t.is_recurring && t.data_entrega && t.data_entrega.startsWith(dateStr));
    const execTasks = tasksList.filter(t => !t.is_recurring && t.data_execucao && t.data_execucao.startsWith(dateStr));
    const routineTasks = tasksList.filter(t => isRoutineForDate(t, currentDay));

    const pushTask = (task, secao) => {
      const catName = task.expand?.categoria?.nome || 'Sem categoria';
      const isDone = task.is_recurring
        ? routineCompletionsList.some(c => c.tarefa === task.id && c.data === dateStr)
        : task.status === 'concluida';

      rows.push({
        dia: dayLabel,
        secao,
        titulo: task.titulo,
        categoria: catName,
        urgencia: (task.urgencia || 'normal').toUpperCase(),
        status: isDone ? 'Concluída' : (task.status || 'A Fazer').replace('_', ' ')
      });
    };

    deliveryTasks.forEach(t => pushTask(t, 'Para Entregar'));
    execTasks.forEach(t => pushTask(t, 'Para Fazer'));
    routineTasks.forEach(t => pushTask(t, 'Rotineiros'));
  }

  return { startOfWeek, rows };
}

function exportWeekToCSV() {
  const { startOfWeek, rows } = getCurrentWeekExportData();

  if (rows.length === 0) {
    alert('Não há tarefas cadastradas nesta semana para exportar. 🐾');
    return;
  }

  // Cabeçalho com BOM (\uFEFF) para acentuação correta no Excel
  const headers = ['Dia da Semana', 'Seção', 'Tarefa', 'Categoria', 'Urgência', 'Status'];
  const csvLines = [
    headers.join(';'),
    ...rows.map(r => [
      `"${r.dia}"`,
      `"${r.secao}"`,
      `"${r.titulo.replace(/"/g, '""')}"`,
      `"${r.categoria}"`,
      `"${r.urgencia}"`,
      `"${r.status}"`
    ].join(';'))
  ];

  const blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `meow-plans-semana-${getLocalDateStr(startOfWeek)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportWeekToPDF() {
  const { startOfWeek, rows } = getCurrentWeekExportData();

  if (rows.length === 0) {
    alert('Não há tarefas cadastradas nesta semana para exportar. 🐾');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);

  // Título do Documento
  doc.setFontSize(16);
  doc.setTextColor(45, 55, 72);
  doc.text('Meow Plans - Planejamento Semanal', 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Período: ${formatDateBR(getLocalDateStr(startOfWeek))} a ${formatDateBR(getLocalDateStr(endOfWeek))}`,
    14,
    25
  );

  // Tabela formatada
  doc.autoTable({
    startY: 32,
    head: [['Dia', 'Seção', 'Tarefa', 'Categoria', 'Urgência', 'Status']],
    body: rows.map(r => [r.dia, r.secao, r.titulo, r.categoria, r.urgencia, r.status]),
    headStyles: { fillColor: [140, 130, 242], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    styles: { fontSize: 8.5, cellPadding: 3 }
  });

  doc.save(`meow-plans-semana-${getLocalDateStr(startOfWeek)}.pdf`);
}

// Registro do Service Worker (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('PWA: Service Worker registrado com sucesso!'))
      .catch((err) => console.error('PWA: Erro ao registrar Service Worker:', err));
  });
}