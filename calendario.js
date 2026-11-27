/* ==========================================================================
   MEOW PLANS - CALENDÁRIO LOGIC (PocketBase SDK Integration)
   Depende de ui.js (modais, card de tarefa, tema e utilitários)
   ========================================================================== */

// 1. INICIALIZAÇÃO DO POCKETBASE SDK
const POCKETBASE_URL = 'http://127.0.0.1:8090';
const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false);

// Estado Global da Aplicação
let currentUser = null;
let currentView = 'mes'; // 'mes' | 'semana' | 'dia' | 'tarefas'
let selectedDate = new Date();
let tasksList = [];
let categoriesList = [];
let routineCompletionsList = [];
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

  TaskModal.init({
    getUser: () => currentUser,
    getCategories: () => categoriesList,
    getTask: (id) => tasksList.find(t => t.id === id),
    onChange: async () => {
      await loadAndProcessTasks();
      renderCurrentView();
    }
  });
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
    avatarEl.innerHTML = `<img src="${avatarUrl}" alt="${escapeHtml(currentUser.name || 'User')}" />`;
  } else if (currentUser && currentUser.name) {
    avatarEl.innerHTML = `<span>${escapeHtml(currentUser.name.charAt(0).toUpperCase())}</span>`;
  } else {
    avatarEl.innerHTML = '<i class="bi bi-person-fill"></i>';
  }
}

// 3. EVENTOS
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
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.getAttribute('data-view');
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

  const btnExportCSV = document.getElementById('btnExportWeekCSV');
  if (btnExportCSV) btnExportCSV.addEventListener('click', exportWeekToCSV);

  const btnExportPDF = document.getElementById('btnExportWeekPDF');
  if (btnExportPDF) btnExportPDF.addEventListener('click', exportWeekToPDF);
}

// Abre o modal compartilhado (sem ID = nova tarefa no dia selecionado)
function openTaskModal(taskId = null) {
  TaskModal.open(taskId, { defaultDate: getLocalDateStr(selectedDate) });
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
  } catch (err) {
    // Tenta fallback com a coleção em minúsculo caso o PocketBase aceite 'categorias'
    try {
      categoriesList = await pb.collection('categorias').getFullList({
        filter: `user = "${currentUser.id}" && (deleted = false || deleted = null)`,
        sort: 'nome'
      });
    } catch (fallbackErr) {
      console.error('Erro ao carregar categorias do PocketBase:', err, fallbackErr);
    }
  }
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

    // Data local (toISOString adiantaria um dia após as 21h no horário de Brasília)
    const todayStr = getLocalDateStr();

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

// 6. RENDERIZAÇÃO DAS VISUALIZAÇÕES
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
        ${deliveryTasks.map(t => renderTaskCard(t, false, dateStr)).join('') || '<p class="text-center text-muted" style="font-size:0.75rem;">Nenhuma entrega para hoje <i class="bi bi-stars"></i></p>'}
      </div>
    </div>

    <!-- PARA FAZER HOJE -->
    <div class="task-section-box section-mint drop-zone" data-dropdate="${dateStr}" style="margin-bottom: 0.5rem;" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)">
      <div class="section-title">Para Fazer</div>
      <div class="section-cards-container">
        ${execTasks.map(t => renderTaskCard(t, true, dateStr)).join('') || '<p class="text-center text-muted" style="font-size:0.75rem;">Nada agendado para fazer <i class="bi bi-stars"></i></p>'}
      </div>
    </div>

    <!-- ROTINEIROS -->
    <div class="task-section-box section-green">
      <div class="section-title">Rotineiros</div>
      <div class="section-cards-container">
        ${routineTasks.map(t => renderTaskCard(t, false, dateStr)).join('') || '<p class="text-center text-muted" style="font-size:0.75rem;">Sem rotinas para hoje <i class="bi bi-arrow-repeat"></i></p>'}
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
    const dateStr = getLocalDateStr(currentDay);

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
            ${deliveryTasks.map(t => renderTaskCard(t, false, dateStr)).join('') || '<p class="text-center text-muted" style="font-size:0.7rem; margin:0.25rem 0;">Sem entregas <i class="bi bi-stars"></i></p>'}
          </div>
        </div>

        <!-- PARA FAZER -->
        <div class="task-section-box section-mint drop-zone" data-dropdate="${dateStr}" style="padding: 0.5rem; margin-bottom: 0.5rem;" ondragover="handleDragOver(event)" ondragleave="handleDragLeave(event)" ondrop="handleDrop(event)">
          <div class="section-title" style="font-size:0.75rem;">Para Fazer</div>
          <div class="section-cards-container">
            ${execTasks.map(t => renderTaskCard(t, true, dateStr)).join('') || '<p class="text-center text-muted" style="font-size:0.7rem; margin:0.25rem 0;">Nada a fazer <i class="bi bi-stars"></i></p>'}
          </div>
        </div>

        <!-- ROTINEIROS -->
        <div class="task-section-box section-green" style="padding: 0.5rem;">
          <div class="section-title" style="font-size:0.75rem;">Rotineiros</div>
          <div class="section-cards-container">
            ${routineTasks.map(t => renderTaskCard(t, false, dateStr)).join('') || '<p class="text-center text-muted" style="font-size:0.7rem; margin:0.25rem 0;">Sem rotinas <i class="bi bi-arrow-repeat"></i></p>'}
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
        <div class="section-title">Todas as Suas Tarefas <i class="bi bi-list-check"></i></div>
        <div class="section-cards-container" style="display: flex; flex-direction: column; gap: 0.75rem;">
          ${tasksList.map(t => renderTaskCard(t, false)).join('') || '<p class="text-center text-muted">Nenhuma tarefa encontrada.</p>'}
        </div>
      </div>
    </div>
  `;
}

// 7. CARD DE TAREFA E DRAG & DROP (RF02.3 & RF05.4)
function renderTaskCard(task, isDraggable = false, currentDateStr = null) {
  // Pega a data do dia em que o card está sendo renderizado (ex: '2026-11-04')
  const targetDateStr = currentDateStr || getLocalDateStr(selectedDate);

  // Rotinas: concluída se houver registro na data. Normais: status do banco.
  const isCompleted = task.is_recurring
    ? routineCompletionsList.some(c => c.tarefa === task.id && c.data === targetDateStr)
    : task.status === 'concluida';

  const execFormatted = task.data_execucao ? formatDateBR(task.data_execucao) : '---';
  const deliveryFormatted = task.data_entrega ? formatDateBR(task.data_entrega) : '---';

  return buildTaskCard(task, {
    isCompleted,
    categoryName: getCategoryName(task, categoriesList),
    openOnClick: `openTaskModal('${task.id}')`,
    toggleOnClick: `toggleTaskStatus(event, '${task.id}', '${task.status}', '${targetDateStr}', ${task.is_recurring})`,
    dragAttrs: isDraggable ? `draggable="true" ondragstart="handleDragStart(event, '${task.id}')"` : '',
    footerHtml: task.is_recurring
      ? `<span><i class="bi bi-arrow-repeat"></i> ${task.recurrence_freq || 'Rotina'}</span>`
      : `<span>Fazer: ${execFormatted}</span><span>Para: ${deliveryFormatted}</span>`
  });
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
        recompensarConclusaoTarefa(`${taskId}_${dateStr}`, 10);
      }
    } else {
      // Para tarefas normais: altera o status direto na coleção tarefas
      const newStatus = currentStatus === 'concluida' ? 'a_fazer' : 'concluida';
      await pb.collection('tarefas').update(taskId, { status: newStatus });

      if (newStatus === 'concluida') {
        recompensarConclusaoTarefa(taskId, 10);
      }
    }

    await loadAndProcessTasks();
    renderCurrentView();
  } catch (err) {
    console.error('Erro ao alternar status da tarefa:', err);
    MeowUI.alert('Erro ao atualizar o status da tarefa.', { title: 'Erro' });
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
    draggingTaskId = null;
    MeowUI.alert('Não é possível mover a Data de Execução para um dia que já passou!', { title: 'Regra de Negócio' });
    return;
  }

  const task = tasksList.find(t => t.id === draggingTaskId);
  if (!task || task.is_recurring) return;

  if (task.data_entrega) {
    const deliveryDateStr = task.data_entrega.split(' ')[0];
    if (newExecDateStr > deliveryDateStr) {
      draggingTaskId = null;
      MeowUI.alert('Não é possível mover a Data de Execução para depois da Data de Entrega!', { title: 'Regra de Negócio' });
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
    MeowUI.alert('Erro ao mover a tarefa.', { title: 'Erro' });
  }
}

// Gerenciador de inatividade no Calendário (Sessão de 120 minutos)
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

// ==========================================================================
// 8. EXPORTAÇÃO DA VISUALIZAÇÃO SEMANAL (CSV & PDF - RF07.2)
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
      const catName = getCategoryName(task, categoriesList);
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
    MeowUI.alert('Não há tarefas cadastradas nesta semana para exportar.', { title: 'Nada para exportar', type: 'info' });
    return;
  }

  // Cabeçalho com BOM (﻿) para acentuação correta no Excel
  const headers = ['Dia da Semana', 'Seção', 'Tarefa', 'Categoria', 'Urgência', 'Status'];
  const csvLines = [
    headers.join(';'),
    ...rows.map(r => [
      `"${r.dia}"`,
      `"${r.secao}"`,
      `"${r.titulo.replace(/"/g, '""')}"`,
      `"${r.categoria.replace(/"/g, '""')}"`,
      `"${r.urgencia}"`,
      `"${r.status}"`
    ].join(';'))
  ];

  const blob = new Blob(['﻿' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
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
    MeowUI.alert('Não há tarefas cadastradas nesta semana para exportar.', { title: 'Nada para exportar', type: 'info' });
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