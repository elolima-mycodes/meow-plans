document.addEventListener('DOMContentLoaded', () => {
  let calendar = null;
  let allTasks = [];
  let allCategories = [];
  let currentSubtasks = [];

  // Elementos do DOM
  const modalTarefa = new bootstrap.Modal(document.getElementById('modalTarefa'));
  const modalCategoria = new bootstrap.Modal(document.getElementById('modalCategoria'));
  const modalAuth = new bootstrap.Modal(document.getElementById('modalAuth'));
  const modalLixeira = new bootstrap.Modal(document.getElementById('modalLixeira'));

  // Inicializar PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('SW Error:', err));
  }

  // --- INICIALIZAÇÃO DA APLICAÇÃO ---
  initApp();

  async function initApp() {
    updateAuthUI();
    if (PBService.isAuthenticated()) {
      await loadCategories();
      initCalendar();
      await loadTasks();
    } else {
      initCalendar(); // Inicializa vazio
      modalAuth.show();
    }
    setupEventListeners();
  }

  function updateAuthUI() {
    const authContainer = document.getElementById('auth-actions');
    const user = PBService.getCurrentUser();
    if (user) {
      authContainer.innerHTML = `
        <span class="fw-semibold me-2">Olá, ${user.name || user.email}</span>
        <button class="btn btn-outline-danger btn-sm" id="btn-logout"><i class="bi bi-box-arrow-right"></i></button>
      `;
      document.getElementById('btn-logout').onclick = () => {
        PBService.logout();
        location.reload();
      };
    }
  }

  // --- CONFIGURAÇÃO DO FULLCALENDAR ---
  function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: 'dayGridMonth',
      locale: 'pt-br',
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'dayGridMonth,timeGridWeek,timeGridDay'
      },
      editable: true, // Habilita drag-and-drop
      droppable: true, // Aceita itens da gaveta lateral
      buttonText: { today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia' },

      // Bloqueio e Regras de Arrastar e Soltar (RN01, RN03)
      eventAllow: function(dropInfo, draggedEvent) {
        // RN03: Apenas cards de "Para Fazer" podem ser arrastados
        if (draggedEvent.extendedProps.type === 'deadline') {
          showToast('Data de Entrega não pode ser arrastada!', 'bg-warning');
          return false;
        }
        return true;
      },

      // Reagendamento no Calendário (UC04 / RN01)
      eventDrop: async function(info) {
        const taskId = info.event.id;
        const newExecDate = info.event.startStr.split('T')[0];
        const task = allTasks.find(t => t.id === taskId);

        if (task) {
          // RN01: Execução <= Entrega
          if (task.data_entrega && newExecDate > task.data_entrega) {
            showToast('A data de execução não pode ser posterior ao prazo final!', 'bg-danger');
            info.revert();
            return;
          }

          try {
            await PBService.updateTask(taskId, { data_execucao: newExecDate });
            task.data_execucao = newExecDate;
            showToast('Tarefa reagendada com sucesso!', 'bg-success');
          } catch (err) {
            info.revert();
            showToast('Erro ao atualizar tarefa.', 'bg-danger');
          }
        }
      },

      // Arrasto da Gaveta Lateral para o Calendário (UC01)
      eventReceive: async function(info) {
        const taskId = info.event.id;
        const newExecDate = info.event.startStr.split('T')[0];
        const task = allTasks.find(t => t.id === taskId);

        if (task) {
          if (task.data_entrega && newExecDate > task.data_entrega) {
            showToast('A data de execução não pode ultrapassar o deadline!', 'bg-danger');
            info.event.remove();
            renderDrawer();
            return;
          }

          try {
            await PBService.updateTask(taskId, { data_execucao: newExecDate });
            await loadTasks(); // Recarrega para atualizar exibições
            showToast('Tarefa agendada!', 'bg-success');
          } catch (err) {
            info.event.remove();
            showToast('Erro ao agendar.', 'bg-danger');
          }
        }
      },

      // Clique em um evento (Detalhes / Editar)
      eventClick: function(info) {
        const task = allTasks.find(t => t.id === info.event.id);
        if (task) openTaskModal(task);
      }
    });

    calendar.render();

    // Habilitar Drag da Gaveta Lateral (UC01)
    const containerEl = document.getElementById('external-events');
    new FullCalendar.Interaction.Draggable(containerEl, {
      itemSelector: '.drawer-item',
      eventData: function(eventEl) {
        return {
          id: eventEl.dataset.id,
          title: eventEl.dataset.title,
          backgroundColor: eventEl.dataset.color
        };
      }
    });
  }

  // --- CARREGAMENTO DE DADOS E RENDERIZAÇÃO ---
  async function loadTasks() {
    allTasks = await PBService.getTarefas();
    checkAutomaticAtrasadas();
    renderCalendarEvents();
    renderDrawer();
  }

  // Transição para Status "Atrasada" automática (RN02)
  function checkAutomaticAtrasadas() {
    const today = new Date().toISOString().split('T')[0];
    allTasks.forEach(t => {
      if (t.data_execucao && t.data_execucao < today && t.status !== 'concluida' && t.status !== 'atrasada') {
        t.status = 'atrasada';
        PBService.updateTask(t.id, { status: 'atrasada' });
      }
    });
  }

  function renderCalendarEvents() {
    calendar.removeAllEvents();
    const search = document.getElementById('filter-search').value.toLowerCase();
    const catFilter = document.getElementById('filter-categoria').value;
    const urgFilter = document.getElementById('filter-urgencia').value;
    const statusFilter = document.getElementById('filter-status').value;

    const filtered = allTasks.filter(t => {
      const matchSearch = t.titulo.toLowerCase().includes(search);
      const matchCat = !catFilter || t.categoria === catFilter;
      const matchUrg = !urgFilter || t.urgencia === urgFilter;
      const matchStatus = !statusFilter || t.status === statusFilter;
      return matchSearch && matchCat && matchUrg && matchStatus;
    });

    filtered.forEach(t => {
      const catColor = t.expand?.categoria?.cor || '#C2BEF6';

      // 1. Evento de Execução ("Para Fazer")
      if (t.data_execucao) {
        let classNames = [];
        if (t.status === 'concluida') classNames.push('event-concluida');
        if (t.urgencia === 'urgente' && t.status !== 'concluida') classNames.push('event-urgente');

        calendar.addEvent({
          id: t.id,
          title: t.titulo,
          start: t.data_execucao,
          backgroundColor: catColor,
          textColor: '#2D3748',
          classNames: classNames,
          extendedProps: { type: 'execucao', status: t.status }
        });
      }

      // 2. Card de Entrega (Deadline) - Estático (RN03)
      if (t.data_entrega && t.data_entrega !== t.data_execucao) {
        calendar.addEvent({
          id: `${t.id}-deadline`,
          title: `🏁 ${t.titulo}`,
          start: t.data_entrega,
          backgroundColor: '#f8f9fa',
          textColor: '#dc3545',
          classNames: ['event-deadline'],
          editable: false, // Bloqueado para drag
          extendedProps: { type: 'deadline', parentId: t.id }
        });
      }
    });
  }

  function renderDrawer() {
    const drawerEl = document.getElementById('external-events');
    drawerEl.innerHTML = '';

    const unscheduled = allTasks.filter(t => !t.data_execucao && t.status !== 'concluida');
    document.getElementById('badge-drawer-count').textContent = unscheduled.length;

    unscheduled.forEach(t => {
      const catColor = t.expand?.categoria?.cor || '#C2BEF6';
      const item = document.createElement('div');
      item.className = 'card p-2 mb-2 drawer-item bg-white shadow-sm';
      item.style.borderLeftColor = catColor;
      item.dataset.id = t.id;
      item.dataset.title = t.titulo;
      item.dataset.color = catColor;

      item.innerHTML = `
        <div class="fw-bold small text-truncate">${t.titulo}</div>
        <div class="d-flex justify-content-between align-items-center mt-1">
          <span class="badge bg-light text-dark border">${t.urgencia}</span>
          ${t.data_entrega ? `<small class="text-danger">Prazo: ${t.data_entrega}</small>` : ''}
        </div>
      `;

      item.onclick = () => openTaskModal(t);
      drawerEl.appendChild(item);
    });
  }

  // --- MODAL DE TAREFA E SUBTAREFAS ---
  function openTaskModal(task = null) {
    currentSubtasks = [];
    document.getElementById('form-tarefa').reset();
    document.getElementById('subtarefas-list').innerHTML = '';

    if (task) {
      document.getElementById('modalTarefaTitle').textContent = 'Editar Tarefa';
      document.getElementById('tarefa-id').value = task.id;
      document.getElementById('tarefa-titulo').value = task.titulo;
      document.getElementById('tarefa-descricao').value = task.descricao || '';
      document.getElementById('tarefa-execucao').value = task.data_execucao || '';
      document.getElementById('tarefa-entrega').value = task.data_entrega || '';
      document.getElementById('tarefa-categoria').value = task.categoria || '';
      document.getElementById('tarefa-urgencia').value = task.urgencia;
      document.getElementById('tarefa-status').value = task.status;
      document.getElementById('tarefa-recorrente').checked = task.is_recurring || false;
      
      document.getElementById('btn-excluir-tarefa').classList.remove('d-none');
      loadSubtasks(task.id);
    } else {
      document.getElementById('modalTarefaTitle').textContent = 'Nova Tarefa';
      document.getElementById('tarefa-id').value = '';
      document.getElementById('btn-excluir-tarefa').classList.add('d-none');
    }

    toggleFrequenciaContainer();
    modalTarefa.show();
  }

  async function loadSubtasks(tarefaId) {
    currentSubtasks = await PBService.getSubtarefas(tarefaId);
    renderSubtasks();
  }

  function renderSubtasks() {
    const listEl = document.getElementById('subtarefas-list');
    listEl.innerHTML = '';

    currentSubtasks.forEach((sub, index) => {
      const row = document.createElement('div');
      row.className = 'd-flex align-items-center gap-2';
      row.innerHTML = `
        <input type="checkbox" class="form-check-input" ${sub.completed ? 'checked' : ''} onchange="toggleSub(${index}, this.checked)">
        <span class="flex-grow-1 ${sub.completed ? 'text-decoration-line-through text-muted' : ''}">${sub.titulo}</span>
        <button type="button" class="btn btn-sm text-danger" onclick="removeSub(${index})"><i class="bi bi-x-lg"></i></button>
      `;
      listEl.appendChild(row);
    });
  }

  window.toggleSub = async (index, checked) => {
    currentSubtasks[index].completed = checked;
    if (currentSubtasks[index].id) {
      await PBService.toggleSubtarefa(currentSubtasks[index].id, checked);
    }
    renderSubtasks();
  };

  window.removeSub = async (index) => {
    const sub = currentSubtasks[index];
    if (sub.id) await PBService.deleteSubtarefa(sub.id);
    currentSubtasks.splice(index, 1);
    renderSubtasks();
  };

  // --- CATEGORIAS ---
  async function loadCategories() {
    allCategories = await PBService.getCategorias();
    const selectTask = document.getElementById('tarefa-categoria');
    const selectFilter = document.getElementById('filter-categoria');
    const listCat = document.getElementById('lista-categorias');

    selectTask.innerHTML = '<option value="">Sem Categoria</option>';
    selectFilter.innerHTML = '<option value="">Todas as Categorias</option>';
    listCat.innerHTML = '';

    allCategories.forEach(c => {
      selectTask.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
      selectFilter.innerHTML += `<option value="${c.id}">${c.nome}</option>`;
      listCat.innerHTML += `
        <li class="list-group-item d-flex justify-content-between align-items-center">
          <div><span class="badge rounded-circle p-2 me-2" style="background-color: ${c.cor}"> </span>${c.nome}</div>
          <button class="btn btn-sm text-danger" onclick="deleteCat('${c.id}')"><i class="bi bi-trash"></i></button>
        </li>
      `;
    });
  }

  window.deleteCat = async (id) => {
    await PBService.deleteCategoria(id);
    await loadCategories();
    await loadTasks();
  };

  // --- EVENT LISTENERS & FORM SUBMITS ---
  function setupEventListeners() {
    document.getElementById('btn-nova-tarefa').onclick = () => openTaskModal();

    document.getElementById('tarefa-recorrente').onchange = toggleFrequenciaContainer;

    document.getElementById('btn-add-subtarefa').onclick = () => {
      const title = prompt('Título da subtarefa:');
      if (title) {
        currentSubtasks.push({ titulo: title, completed: false });
        renderSubtasks();
      }
    };

    // Submit Tarefa (Com Validação RN01)
    document.getElementById('form-tarefa').onsubmit = async (e) => {
      e.preventDefault();
      const id = document.getElementById('tarefa-id').value;
      const dataExec = document.getElementById('tarefa-execucao').value || null;
      const dataEntr = document.getElementById('tarefa-entrega').value || null;

      // RN01: Execução <= Entrega
      if (dataExec && dataEntr && dataExec > dataEntr) {
        showToast('A data de execução não pode ser posterior ao prazo final!', 'bg-danger');
        return;
      }

      const taskData = {
        titulo: document.getElementById('tarefa-titulo').value,
        descricao: document.getElementById('tarefa-descricao').value,
        data_execucao: dataExec,
        data_entrega: dataEntr,
        categoria: document.getElementById('tarefa-categoria').value || null,
        urgencia: document.getElementById('tarefa-urgencia').value,
        status: document.getElementById('tarefa-status').value,
        is_recurring: document.getElementById('tarefa-recorrente').checked,
        recurrence_freq: document.getElementById('tarefa-recorrente').checked ? document.getElementById('tarefa-frequencia').value : null
      };

      try {
        let savedTask;
        if (id) {
          savedTask = await PBService.updateTask(id, taskData);
        } else {
          savedTask = await PBService.createTask(taskData);
        }

        // Salvar novas subtarefas vinculadas
        for (const sub of currentSubtasks) {
          if (!sub.id) await PBService.createSubtarefa(savedTask.id, sub.titulo);
        }

        modalTarefa.hide();
        await loadTasks();
        showToast('Tarefa salva com sucesso!', 'bg-success');
      } catch (err) {
        showToast('Erro ao salvar tarefa.', 'bg-danger');
      }
    };

    // Submit Categoria
    document.getElementById('form-categoria').onsubmit = async (e) => {
      e.preventDefault();
      const nome = document.getElementById('cat-nome').value;
      const cor = document.getElementById('cat-cor').value;
      await PBService.createCategoria(nome, cor);
      document.getElementById('cat-nome').value = '';
      await loadCategories();
      showToast('Categoria criada!', 'bg-success');
    };

    // Soft Delete (RN05)
    document.getElementById('btn-excluir-tarefa').onclick = async () => {
      const id = document.getElementById('tarefa-id').value;
      if (id && confirm('Mover esta tarefa para a lixeira?')) {
        await PBService.softDeleteTask(id);
        modalTarefa.hide();
        await loadTasks();
        showToast('Tarefa movida para a lixeira.', 'bg-warning');
      }
    };

    // Auth Forms
    document.getElementById('form-login').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await PBService.login(
          document.getElementById('login-email').value,
          document.getElementById('login-senha').value
        );
        modalAuth.hide();
        initApp();
      } catch (err) { showToast('Credenciais inválidas.', 'bg-danger'); }
    };

    document.getElementById('form-register').onsubmit = async (e) => {
      e.preventDefault();
      try {
        await PBService.register(
          document.getElementById('reg-email').value,
          document.getElementById('reg-senha').value,
          document.getElementById('reg-nome').value
        );
        modalAuth.hide();
        initApp();
      } catch (err) { showToast('Erro no cadastro.', 'bg-danger'); }
    };

    // Filtros em tempo real
    ['filter-search', 'filter-categoria', 'filter-urgencia', 'filter-status'].forEach(id => {
      document.getElementById(id).oninput = renderCalendarEvents;
    });

    // Exportação PDF e CSV (RF07)
    document.getElementById('btn-export-csv').onclick = exportCSV;
    document.getElementById('btn-export-pdf').onclick = exportPDF;
  }

  function toggleFrequenciaContainer() {
    const isRec = document.getElementById('tarefa-recorrente').checked;
    document.getElementById('container-frequencia').classList.toggle('d-none', !isRec);
  }

  // Toast Helper
  function showToast(message, bgClass = 'bg-primary') {
    const toastEl = document.getElementById('app-toast');
    toastEl.className = `toast align-items-center text-white border-0 ${bgClass}`;
    document.getElementById('toast-message').textContent = message;
    new bootstrap.Toast(toastEl).show();
  }

  // Exportação CSV
  function exportCSV() {
    let csv = 'Titulo;Data Execucao;Data Entrega;Urgencia;Status\n';
    allTasks.forEach(t => {
      csv += `"${t.titulo}";"${t.data_execucao || ''}";"${t.data_entrega || ''}";"${t.urgencia}";"${t.status}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'meowplans_tarefas.csv';
    link.click();
  }

  // Exportação PDF
  function exportPDF() {
    const element = document.getElementById('calendar');
    html2pdf().from(element).save('meowplans_calendario.pdf');
  }
});