document.addEventListener('DOMContentLoaded', async () => {
  PBService.requireAuth();

  let calendar = null;
  let allTasks = [];

  const user = PBService.getCurrentUser();
  if (user) document.getElementById('user-display').textContent = `Olá, ${user.name || user.email}`;
  document.getElementById('btn-logout').onclick = () => PBService.logout();

  initCalendar();
  await loadTasks();

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
      editable: true,
      droppable: true,
      buttonText: { today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia' },

      // RN03: Restrição de Arraste (Prazos Finais são estáticos)
      eventAllow: function(dropInfo, draggedEvent) {
        if (draggedEvent.extendedProps.type === 'deadline') {
          alert('Data de entrega não pode ser arrastada!');
          return false;
        }
        return true;
      },

      // Reagendamento via Calendário (RN01)
      eventDrop: async function(info) {
        const taskId = info.event.id;
        const newExecDate = info.event.startStr.split('T')[0];
        const task = allTasks.find(t => t.id === taskId);

        if (task && task.data_entrega && newExecDate > task.data_entrega) {
          alert('Data de execução não pode ultrapassar a data de entrega!');
          info.revert();
          return;
        }

        try {
          await PBService.updateTask(taskId, { data_execucao: newExecDate });
          task.data_execucao = newExecDate;
        } catch (err) {
          info.revert();
        }
      },

      // Arraste da Gaveta para o Calendário (UC01 / RN01)
      eventReceive: async function(info) {
        const taskId = info.event.id;
        const newExecDate = info.event.startStr.split('T')[0];
        const task = allTasks.find(t => t.id === taskId);

        if (task && task.data_entrega && newExecDate > task.data_entrega) {
          alert('Data de execução não pode ser maior que o prazo final!');
          info.event.remove();
          renderDrawer();
          return;
        }

        await PBService.updateTask(taskId, { data_execucao: newExecDate });
        await loadTasks();
      }
    });

    calendar.render();

    // Habilitar Drag da Gaveta Lateral
    new FullCalendar.Interaction.Draggable(document.getElementById('external-events'), {
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

  async function loadTasks() {
    allTasks = await PBService.getTarefas();
    renderCalendar();
    renderDrawer();
  }

  function renderCalendar() {
    calendar.removeAllEvents();
    allTasks.forEach(t => {
      const catColor = t.expand?.categoria?.cor || '#C2BEF6';

      // 1. Evento de Execução (Para Fazer)
      if (t.data_execucao) {
        let classes = [];
        if (t.status === 'concluida') classes.push('event-concluida');
        if (t.urgencia === 'urgente' && t.status !== 'concluida') classes.push('event-urgente');

        calendar.addEvent({
          id: t.id,
          title: t.titulo,
          start: t.data_execucao,
          backgroundColor: catColor,
          textColor: '#2D3748',
          classNames: classes,
          extendedProps: { type: 'execucao' }
        });
      }

      // 2. Card Estático de Entrega (Deadline - RN03)
      if (t.data_entrega && t.data_entrega !== t.data_execucao) {
        calendar.addEvent({
          id: `${t.id}-deadline`,
          title: `🏁 ${t.titulo}`,
          start: t.data_entrega,
          backgroundColor: '#ffffff',
          textColor: '#dc3545',
          classNames: ['event-deadline'],
          editable: false,
          extendedProps: { type: 'deadline' }
        });
      }
    });
  }

  function renderDrawer() {
    const drawerEl = document.getElementById('external-events');
    drawerEl.innerHTML = '';

    const unscheduled = allTasks.filter(t => !t.data_execucao && t.status !== 'concluida');
    document.getElementById('drawer-count').textContent = unscheduled.length;

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
      drawerEl.appendChild(item);
    });
  }
});