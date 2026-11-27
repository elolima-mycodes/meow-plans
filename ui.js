/* ==========================================================================
   MEOW PLANS - UI COMPARTILHADA (Calendário + Gerenciador)
   Utilitários, modais de aviso/confirmação, tema, card e modal de tarefa.
   Deve ser carregado ANTES de calendario.js / gerenciar.js.
   Usa a instância global `pb` criada pelo script de cada página.
   ========================================================================== */

// --------------------------------------------------------------------------
// 1. UTILITÁRIOS
// --------------------------------------------------------------------------
function getLocalDateStr(dateObj = new Date()) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateBR(dateString) {
  if (!dateString) return '';
  const dateOnly = dateString.split(' ')[0];
  const parts = dateOnly.split('-');
  if (parts.length !== 3) return dateString;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Nome da categoria da tarefa; "Sem categoria" se vazia ou se a categoria foi excluída
function getCategoryName(task, categories) {
  const cat = categories.find(c => c.id === task.categoria);
  return cat ? cat.nome : 'Sem categoria';
}

// --------------------------------------------------------------------------
// 2. MODAIS DE AVISO E CONFIRMAÇÃO (substituem alert/confirm nativos)
// --------------------------------------------------------------------------
const MeowUI = (() => {
  const ICONS = {
    warning: 'bi-exclamation-triangle-fill',
    danger: 'bi-trash3-fill',
    info: 'bi-info-circle-fill',
    success: 'bi-check-circle-fill'
  };

  function openDialog({ title, message, type, confirmText, cancelText }) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay meow-dialog-overlay';
      overlay.innerHTML = `
        <div class="modal-card modal-cute-container meow-modal meow-dialog" role="alertdialog" aria-modal="true">
          <i class="bi ${ICONS[type] || ICONS.info} meow-dialog-icon meow-dialog-icon-${type}"></i>
          <h3 class="meow-dialog-title"></h3>
          <p class="meow-dialog-message"></p>
          <div class="meow-modal-actions">
            ${cancelText ? '<button type="button" class="btn btn-outline" data-action="cancel"></button>' : ''}
            <button type="button" class="btn ${type === 'danger' ? 'btn-danger' : 'btn-secondary'}" data-action="confirm"></button>
          </div>
        </div>
      `;

      // textContent evita injeção de HTML por nomes de tarefas/categorias
      overlay.querySelector('.meow-dialog-title').textContent = title;
      overlay.querySelector('.meow-dialog-message').textContent = message;
      const confirmBtn = overlay.querySelector('[data-action="confirm"]');
      const cancelBtn = overlay.querySelector('[data-action="cancel"]');
      confirmBtn.textContent = confirmText;
      if (cancelBtn) cancelBtn.textContent = cancelText;

      const onKey = (e) => {
        if (e.key === 'Escape') close(false);
      };

      function close(result) {
        document.removeEventListener('keydown', onKey);
        overlay.remove(); // Sai da tela imediatamente
        resolve(result);
      }

      confirmBtn.addEventListener('click', () => close(true));
      if (cancelBtn) cancelBtn.addEventListener('click', () => close(false));
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });
      document.addEventListener('keydown', onKey);

      document.body.appendChild(overlay);
      overlay.classList.add('is-active');
      (cancelBtn || confirmBtn).focus();
    });
  }

  return {
    alert(message, { title = 'Atenção', type = 'warning' } = {}) {
      return openDialog({ title, message, type, confirmText: 'Entendi' });
    },
    confirm(message, { title = 'Confirmar ação', type = 'danger', confirmText = 'Confirmar' } = {}) {
      return openDialog({ title, message, type, confirmText, cancelText: 'Cancelar' });
    }
  };
})();

// --------------------------------------------------------------------------
// 3. TEMA (CLARO / ESCURO)
// --------------------------------------------------------------------------
function initThemeTracker() {
  const isSavedDark = (localStorage.getItem('app_theme') || 'dark') === 'dark';
  document.body.classList.toggle('dark-theme', isSavedDark);

  const themeBtn = document.getElementById('themeToggleBtn');
  if (!themeBtn) return;

  const paint = (isDark) => {
    themeBtn.innerHTML = `<i class="bi ${isDark ? 'bi-sun-fill' : 'bi-moon-fill'}"></i>`;
  };
  paint(isSavedDark);

  // onclick (e não addEventListener) para nunca duplicar o evento
  themeBtn.onclick = () => {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('app_theme', isDark ? 'dark' : 'light');
    paint(isDark);
  };
}

// --------------------------------------------------------------------------
// 4. CARD DE TAREFA (mesmo layout nas duas telas)
// --------------------------------------------------------------------------
const URGENCY_STYLES = {
  baixa: { color: '#C2E0FF', label: 'Baixa' },
  normal: { color: '#A8F5B4', label: 'Normal' },
  alta: { color: '#FFD8A8', label: 'Alta' },
  urgente: { color: '#FFA8A8', label: 'Urgente' }
};

function buildTaskCard(task, { isCompleted, categoryName, toggleOnClick, openOnClick, footerHtml, dragAttrs = '' }) {
  let status = { icon: 'bi-circle', css: 'status-todo', title: 'Marcar como Concluída' };

  if (isCompleted) {
    status = { icon: 'bi-check-circle-fill', css: 'status-done', title: 'Reabrir tarefa' };
  } else if (task.status === 'em_progresso') {
    status = { icon: 'bi-hourglass-split', css: 'status-doing', title: 'Em Progresso - Clique para alternar' };
  } else if (task.status === 'atrasada') {
    status = { icon: 'bi-exclamation-triangle-fill', css: 'status-overdue', title: 'Atrasada - Clique para concluir' };
  } else if (task.status === 'cancelada') {
    status = { icon: 'bi-x-circle-fill', css: 'status-cancelled', title: 'Cancelada' };
  }

  const urgency = URGENCY_STYLES[task.urgencia] || URGENCY_STYLES.normal;

  return `
    <div class="meow-card ${dragAttrs ? 'card-draggable' : ''} ${isCompleted ? 'card-completed' : ''}"
         onclick="${openOnClick}" ${dragAttrs}>
      <div class="meow-card-header">
        <div class="meow-card-title-group">
          <i class="bi ${status.icon} status-icon ${status.css} status-icon-btn" title="${status.title}" onclick="${toggleOnClick}"></i>
          <span class="meow-card-title ${isCompleted ? 'text-strikethrough' : ''}">${escapeHtml(task.titulo)}</span>
        </div>
        <div class="meow-card-actions">
          <span class="flag-icon" title="Urgência: ${urgency.label}">
            <i class="bi bi-flag-fill" style="color: ${urgency.color}; -webkit-text-stroke: 1px #2D3748; font-size: 1.1rem; vertical-align: middle;"></i>
          </span>
          <button type="button" class="card-trash-btn" title="Enviar para a lixeira" aria-label="Enviar para a lixeira"
                  onclick="event.stopPropagation(); TaskModal.requestDelete('${task.id}')">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      </div>
      <div class="meow-card-category"><i class="bi bi-tag"></i> ${escapeHtml(categoryName)}</div>
      <div class="meow-card-footer">${footerHtml}</div>
    </div>
  `;
}

// --------------------------------------------------------------------------
// 5. MODAL DE CRIAR / EDITAR TAREFA (único para o sistema inteiro)
// --------------------------------------------------------------------------
const TASK_MODAL_HTML = `
  <div class="modal-overlay" id="taskModalOverlay">
    <div class="modal-card modal-cute-container meow-modal">
      <div class="meow-modal-header">
        <div class="flex-row" style="align-items: center; gap: 0.4rem;">
          <span id="taskCategoryColorPreview" class="meow-color-dot" style="display: none;"></span>
          <select id="taskCategorySelect" class="select-control meow-category-select" aria-label="Categoria">
            <option value="">Sem categoria</option>
          </select>
        </div>
        <button type="button" class="meow-modal-close" id="closeTaskModalBtn" aria-label="Fechar"><i class="bi bi-x-lg"></i></button>
      </div>

      <form id="taskForm">
        <input type="hidden" id="taskIdInput" />

        <div class="form-group">
          <input type="text" id="taskTitleInput" class="input-control meow-title-input"
            placeholder="Título da Tarefa (ex: Biologia Exercícios)" required />
        </div>

        <div class="flex-row mb-1" style="gap: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
            <i id="urgencyFlagIcon" class="bi bi-flag-fill" style="font-size: 1.25rem; -webkit-text-stroke: 1px #2D3748;"></i>
            <select id="taskUrgencySelect" class="select-control" style="flex: 1;" aria-label="Urgência">
              <option value="baixa">Baixa</option>
              <option value="normal" selected>Normal</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <select id="taskStatusSelect" class="select-control" style="flex: 1;" aria-label="Status">
            <option value="a_fazer">A Fazer</option>
            <option value="em_progresso">Em Progresso</option>
            <option value="concluida">Concluída</option>
            <option value="atrasada">Atrasada</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label" id="taskDeliveryDateLabel" for="taskDeliveryDate"></label>
          <input type="date" id="taskDeliveryDate" class="input-control" />
        </div>

        <div class="form-group" id="taskExecDateGroup">
          <label class="form-label" for="taskExecDate"><i class="bi bi-pin-angle-fill"></i> Data de Execução (Quando Fazer):</label>
          <input type="date" id="taskExecDate" class="input-control" />
        </div>

        <div class="form-group">
          <label class="custom-checkbox">
            <input type="checkbox" id="taskRecurringCheck" />
            <span class="checkmark"></span>
            <span>É uma Rotina / Tarefa Recorrente?</span>
          </label>
        </div>

        <div class="form-group hidden" id="recurrenceFreqGroup">
          <label class="form-label" for="taskRecurrenceFreq"><i class="bi bi-arrow-repeat"></i> Frequência de Recorrência:</label>
          <select id="taskRecurrenceFreq" class="select-control">
            <option value="diario">Diário</option>
            <option value="semanal" selected>Semanal</option>
            <option value="mensal">Mensal</option>
            <option value="anual">Anual</option>
          </select>
        </div>

        <div class="form-group">
          <textarea id="taskDescInput" class="textarea-control" placeholder="Exercícios, observações ou notas..."></textarea>
        </div>

        <div class="form-group meow-subtasks-box" style="background: rgba(255,255,255,0.6);">
          <label class="form-label"><i class="bi bi-list-check"></i> Subtarefas</label>
          <div id="subtasksList" style="display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 0.5rem;"></div>
          <button type="button" class="btn btn-outline btn-block" id="btnAddSubtaskBtn" style="min-height: 36px; font-size: 0.85rem;">
            <i class="bi bi-plus-lg"></i> Adicionar Subtarefa
          </button>
        </div>

        <div class="meow-modal-actions">
          <button type="button" class="btn btn-danger" id="btnDeleteTask">
            <i class="bi bi-trash3"></i> Excluir Tarefa
          </button>
          <button type="submit" class="btn btn-secondary" id="btnSaveTask">Adicionar Tarefa</button>
        </div>
      </form>
    </div>
  </div>
`;

const TaskModal = (() => {
  let config = null; // { getUser, getCategories, getTask, onChange }
  let deletedSubtaskIds = [];
  let originalDates = { exec: '', entrega: '' };
  let deliveryTouched = false;

  const $ = (id) => document.getElementById(id);

  function init(options) {
    config = options;
    document.body.insertAdjacentHTML('beforeend', TASK_MODAL_HTML);

    $('closeTaskModalBtn').addEventListener('click', close);
    $('taskForm').addEventListener('submit', save);
    $('btnDeleteTask').addEventListener('click', () => requestDelete($('taskIdInput').value));
    $('btnAddSubtaskBtn').addEventListener('click', () => addSubtaskRow());
    $('taskCategorySelect').addEventListener('change', (e) => updateColorPreview(e.target.value));
    $('taskUrgencySelect').addEventListener('change', (e) => updateUrgencyFlag(e.target.value));
    $('taskDeliveryDate').addEventListener('input', () => { deliveryTouched = true; });
    $('taskRecurringCheck').addEventListener('change', (e) => {
      toggleRecurringFields(e.target.checked);

      // Em tarefa nova, a data preenchida automaticamente não deve limitar a rotina
      if (!$('taskIdInput').value && !deliveryTouched) {
        $('taskDeliveryDate').value = e.target.checked ? '' : ($('taskExecDate').value || getLocalDateStr());
      }
    });
  }

  function populateCategories(selectedId) {
    const select = $('taskCategorySelect');
    select.innerHTML = '<option value="">Sem categoria</option>';
    config.getCategories().forEach(cat => {
      const option = document.createElement('option');
      option.value = cat.id;
      option.textContent = cat.nome;
      select.appendChild(option);
    });

    const exists = config.getCategories().some(c => c.id === selectedId);
    select.value = exists ? selectedId : '';
    updateColorPreview(select.value);
  }

  function updateColorPreview(categoryId) {
    const preview = $('taskCategoryColorPreview');
    const cat = config.getCategories().find(c => c.id === categoryId);
    if (cat && cat.cor) {
      preview.style.backgroundColor = cat.cor;
      preview.style.display = 'inline-block';
    } else {
      preview.style.display = 'none';
    }
  }

  function updateUrgencyFlag(urgency) {
    $('urgencyFlagIcon').style.color = (URGENCY_STYLES[urgency] || URGENCY_STYLES.normal).color;
  }

  function toggleRecurringFields(isRecurring) {
    $('recurrenceFreqGroup').classList.toggle('hidden', !isRecurring);
    $('taskExecDateGroup').classList.toggle('hidden', isRecurring);
    $('taskDeliveryDateLabel').innerHTML = isRecurring
      ? '<i class="bi bi-arrow-repeat"></i> Repetir até (Data Limite):'
      : '<i class="bi bi-calendar-event"></i> Data de Entrega (Prazo Final):';
  }

  function addSubtaskRow(subtask = { id: '', titulo: '', completa: false }) {
    const row = document.createElement('div');
    row.className = 'subtask-row flex-between';
    row.dataset.subid = subtask.id || '';
    row.style.gap = '0.5rem';
    row.innerHTML = `
      <input type="checkbox" class="subtask-check" ${subtask.completa ? 'checked' : ''} />
      <input type="text" class="input-control subtask-input" value="${escapeHtml(subtask.titulo)}" placeholder="Título da subtarefa..." style="min-height:32px; padding:0.25rem 0.5rem; font-size:0.85rem;" />
      <button type="button" class="btn-link subtask-remove" style="color:var(--color-danger);" aria-label="Remover subtarefa"><i class="bi bi-x-lg"></i></button>
    `;
    row.querySelector('.subtask-remove').addEventListener('click', () => {
      if (row.dataset.subid) deletedSubtaskIds.push(row.dataset.subid);
      row.remove();
    });
    $('subtasksList').appendChild(row);
  }

  // taskId = null abre em modo de criação
  async function open(taskId = null, { defaultDate = null } = {}) {
    const task = taskId ? config.getTask(taskId) : null;
    if (taskId && !task) return;

    deletedSubtaskIds = [];
    deliveryTouched = false;
    $('taskForm').reset();
    $('subtasksList').innerHTML = '';

    const today = getLocalDateStr();
    const initialDate = defaultDate && defaultDate > today ? defaultDate : today;
    const execDate = task ? (task.data_execucao || '').split(' ')[0] : initialDate;
    const deliveryDate = task ? (task.data_entrega || '').split(' ')[0] : initialDate;
    originalDates = { exec: task ? execDate : '', entrega: task ? deliveryDate : '' };

    // `min` só na criação: em edição o navegador bloquearia o envio de tarefas atrasadas
    [$('taskDeliveryDate'), $('taskExecDate')].forEach(input => {
      if (task) input.removeAttribute('min');
      else input.min = today;
    });

    $('taskIdInput').value = task ? task.id : '';
    $('taskTitleInput').value = task ? task.titulo || '' : '';
    $('taskUrgencySelect').value = (task && task.urgencia) || 'normal';
    $('taskStatusSelect').value = (task && task.status) || 'a_fazer';
    $('taskDeliveryDate').value = deliveryDate;
    $('taskExecDate').value = execDate;
    $('taskDescInput').value = (task && task.descricao) || '';
    $('taskRecurringCheck').checked = Boolean(task && task.is_recurring);
    $('taskRecurrenceFreq').value = (task && task.recurrence_freq) || 'semanal';

    populateCategories(task ? task.categoria : '');
    updateUrgencyFlag($('taskUrgencySelect').value);
    toggleRecurringFields($('taskRecurringCheck').checked);

    $('btnDeleteTask').classList.toggle('hidden', !task);
    $('btnSaveTask').textContent = task ? 'Salvar Alterações' : 'Adicionar Tarefa';
    $('btnSaveTask').disabled = false;

    if (task) {
      try {
        const subs = await pb.collection('subtarefas').getFullList({
          filter: `tarefa = "${task.id}" && user = "${config.getUser().id}"`
        });
        subs.forEach(s => addSubtaskRow(s));
      } catch (err) {
        console.error('Erro ao carregar subtarefas:', err);
      }
    }

    $('taskModalOverlay').classList.add('is-active');
  }

  function close() {
    $('taskModalOverlay').classList.remove('is-active');
  }

  // Regras de negócio. Datas passadas já salvas podem ser mantidas na edição.
  function validateDates(exec, entrega, isRecurring) {
    const today = getLocalDateStr();

    if (entrega && entrega < today && entrega !== originalDates.entrega) {
      return 'A Data de Entrega/Limite não pode ser anterior ao dia de hoje!';
    }
    if (!isRecurring && exec && exec < today && exec !== originalDates.exec) {
      return 'A Data de Execução não pode ser anterior ao dia de hoje!';
    }
    if (!isRecurring && exec && entrega && exec > entrega) {
      return 'A Data de Execução NUNCA pode ser posterior à Data de Entrega!';
    }
    return null;
  }

  async function save(e) {
    e.preventDefault();

    const id = $('taskIdInput').value;
    const titulo = $('taskTitleInput').value.trim();
    const isRecurring = $('taskRecurringCheck').checked;
    const status = $('taskStatusSelect').value;
    let exec = isRecurring ? '' : $('taskExecDate').value;
    let entrega = $('taskDeliveryDate').value;

    // Tarefa nova sem datas: assume a data atual
    if (!id && !isRecurring) {
      const today = getLocalDateStr();
      if (!exec) exec = today;
      if (!entrega) entrega = exec > today ? exec : today;
    }

    if (!titulo) {
      await MeowUI.alert('Informe um título para a tarefa.');
      return;
    }

    const error = validateDates(exec, entrega, isRecurring);
    if (error) {
      await MeowUI.alert(error, { title: 'Regra de Negócio' });
      return;
    }

    const user = config.getUser();
    const payload = {
      titulo,
      categoria: $('taskCategorySelect').value || null,
      urgencia: $('taskUrgencySelect').value,
      status,
      data_entrega: entrega ? `${entrega} 12:00:00.000Z` : null,
      data_execucao: exec ? `${exec} 12:00:00.000Z` : null,
      is_recurring: isRecurring,
      recurrence_freq: isRecurring ? $('taskRecurrenceFreq').value : null,
      descricao: $('taskDescInput').value.trim(),
      user: user.id,
      deleted: false
    };

    $('btnSaveTask').disabled = true; // Evita cadastro duplicado por clique duplo

    try {
      const saved = id
        ? await pb.collection('tarefas').update(id, payload)
        : await pb.collection('tarefas').create(payload);
      $('taskIdInput').value = saved.id;

      if (!isRecurring && status === 'concluida') {
        recompensarConclusaoTarefa(saved.id, 10);
      }

      await saveSubtasks(saved.id);
      close();
      await config.onChange();
    } catch (err) {
      console.error('Erro ao salvar tarefa no PocketBase:', err);
      await MeowUI.alert('Erro ao salvar a tarefa. Verifique os campos.', { title: 'Erro' });
    } finally {
      $('btnSaveTask').disabled = false;
    }
  }

  async function saveSubtasks(taskId) {
    for (const subId of deletedSubtaskIds) {
      try {
        await pb.collection('subtarefas').delete(subId);
      } catch (err) {
        console.error(`Erro ao apagar subtarefa ${subId}:`, err);
      }
    }
    deletedSubtaskIds = [];

    for (const row of document.querySelectorAll('#subtasksList .subtask-row')) {
      const subId = row.dataset.subid;
      const titulo = row.querySelector('.subtask-input').value.trim();
      const completa = row.querySelector('.subtask-check').checked;

      if (!titulo) {
        if (subId) await pb.collection('subtarefas').delete(subId);
        continue;
      }

      if (subId) {
        await pb.collection('subtarefas').update(subId, { titulo, completa });
      } else {
        const created = await pb.collection('subtarefas').create({
          titulo,
          completa,
          tarefa: taskId,
          user: config.getUser().id
        });
        row.dataset.subid = created.id;
      }
    }
  }

  // Envio para a lixeira (usado pelo modal e pelos cards das duas telas)
  async function requestDelete(taskId) {
    if (!taskId) return;

    const confirmed = await MeowUI.confirm('Deseja enviar esta tarefa para a lixeira?', {
      title: 'Enviar para a lixeira',
      confirmText: 'Enviar'
    });
    if (!confirmed) return;

    close(); // Fecha o modal de detalhes junto com o de confirmação

    try {
      await pb.collection('tarefas').update(taskId, { deleted: true });
      await config.onChange();
    } catch (err) {
      console.error('Erro ao excluir tarefa (soft delete):', err);
      await MeowUI.alert('Erro ao excluir a tarefa.', { title: 'Erro' });
    }
  }

  return { init, open, close, requestDelete };
})();

// --------------------------------------------------------------------------
// 6. RECOMPENSA EM MOEDAS (conexão com o Pet)
// --------------------------------------------------------------------------
async function recompensarConclusaoTarefa(taskRewardKey, valor = 10) {
  if (!pb.authStore.isValid || !pb.authStore.model) return;
  const userId = pb.authStore.model.id;
  const storageKey = `meow_plans_pet_${userId}`;

  try {
    const res = await pb.collection('pets').getList(1, 1, {
      filter: `user = "${userId}"`
    });

    if (res.items.length === 0) return; // Usuário ainda não adotou um pet

    const pet = res.items[0];
    const jaPagas = Array.isArray(pet.tarefas_recompensadas) ? pet.tarefas_recompensadas : [];

    // Trava no banco: evita ganhar moedas duas vezes pela mesma tarefa em qualquer dispositivo
    if (jaPagas.includes(taskRewardKey)) return;

    const novoSaldo = (pet.moedas || 0) + valor;
    const novasPagas = [...jaPagas, taskRewardKey];

    await pb.collection('pets').update(pet.id, {
      moedas: novoSaldo,
      tarefas_recompensadas: novasPagas
    });

    // Atualiza o cache local isolado do usuário (dispara atualização ao vivo se pet.html estiver aberto)
    const localRaw = localStorage.getItem(storageKey);
    if (localRaw) {
      const parsed = JSON.parse(localRaw);
      parsed.moedas = novoSaldo;
      parsed.tarefas_recompensadas = novasPagas;
      localStorage.setItem(storageKey, JSON.stringify(parsed));
    }
  } catch (err) {
    console.error('Erro ao creditar moedas no PocketBase:', err);
  }
}