document.addEventListener('DOMContentLoaded', async () => {
  PBService.requireAuth();

  const modalTarefa = new bootstrap.Modal(document.getElementById('modalTarefa'));
  let allTasks = [];
  let allCategories = [];
  let currentSubtasks = [];

  // Exibir usuário logado
  const user = PBService.getCurrentUser();
  if (user) document.getElementById('user-display').textContent = `Olá, ${user.name || user.email}`;

  document.getElementById('btn-logout').onclick = () => PBService.logout();

  await loadCategories();
  await loadTasks();
  setupEvents();

  async function loadCategories() {
    allCategories = await PBService.getCategorias();
    const selectTask = document.getElementById('tarefa-categoria');
    const selectFilter = document.getElementById('filter-categoria');
    const listCat = document.getElementById('lista-categorias');

    selectTask.innerHTML = '<option value="">Sem Categoria</option>';
    selectFilter.innerHTML = '<option value="">Todas Categorias</option>';
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

  async function loadTasks() {
    allTasks = await PBService.getTarefas();
    renderTasks();
  }

  function renderTasks() {
    const tbody = document.getElementById('lista-tarefas');
    tbody.innerHTML = '';

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
      const catColor = t.expand?.categoria?.cor || '#e0e0e0';
      const catNome = t.expand?.categoria?.nome || 'Sem categoria';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="fw-semibold">${t.titulo}</td>
        <td><span class="badge" style="background-color: ${catColor}; color: #333;">${catNome}</span></td>
        <td>${t.data_execucao || '<span class="text-muted">Gaveta</span>'}</td>
        <td>${t.data_entrega || '-'}</td>
        <td><span class="badge bg-light text-dark border">${t.urgencia}</span></td>
        <td><span class="badge bg-secondary">${t.status}</span></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1" onclick="openEdit('${t.id}')"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger" onclick="softDelete('${t.id}')"><i class="bi bi-trash"></i></button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  window.openEdit = (id) => {
    const task = allTasks.find(t => t.id === id);
    if (task) openModal(task);
  };

  window.softDelete = async (id) => {
    if (confirm('Mover para a lixeira?')) {
      await PBService.softDeleteTask(id);
      await loadTasks();
    }
  };

  function openModal(task = null) {
    document.getElementById('form-tarefa').reset();
    document.getElementById('subtarefas-list').innerHTML = '';
    currentSubtasks = [];

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
      document.getElementById('btn-excluir-tarefa').classList.remove('d-none');
      loadSubtasks(task.id);
    } else {
      document.getElementById('modalTarefaTitle').textContent = 'Nova Tarefa';
      document.getElementById('tarefa-id').value = '';
      document.getElementById('btn-excluir-tarefa').classList.add('d-none');
    }
    modalTarefa.show();
  }

  async function loadSubtasks(taskId) {
    currentSubtasks = await PBService.getSubtarefas(taskId);
    renderSubtasks();
  }

  function renderSubtasks() {
    const list = document.getElementById('subtarefas-list');
    list.innerHTML = '';
    currentSubtasks.forEach((sub, idx) => {
      const d = document.createElement('div');
      d.className = 'd-flex align-items-center gap-2';
      d.innerHTML = `
        <input type="checkbox" class="form-check-input" ${sub.completed ? 'checked' : ''} onchange="toggleSub(${idx}, this.checked)">
        <span class="flex-grow-1 ${sub.completed ? 'text-decoration-line-through text-muted' : ''}">${sub.titulo}</span>
        <button type="button" class="btn btn-sm text-danger" onclick="removeSub(${idx})"><i class="bi bi-x-lg"></i></button>
      `;
      list.appendChild(d);
    });
  }

  window.toggleSub = async (idx, checked) => {
    currentSubtasks[idx].completed = checked;
    if (currentSubtasks[idx].id) await PBService.toggleSubtarefa(currentSubtasks[idx].id, checked);
    renderSubtasks();
  };

  window.removeSub = async (idx) => {
    if (currentSubtasks[idx].id) await PBService.deleteSubtarefa(currentSubtasks[idx].id);
    currentSubtasks.splice(idx, 1);
    renderSubtasks();
  };

  function setupEvents() {
    document.getElementById('btn-nova-tarefa').onclick = () => openModal();

    document.getElementById('btn-add-subtarefa').onclick = () => {
      const title = prompt('Título do item:');
      if (title) {
        currentSubtasks.push({ titulo: title, completed: false });
        renderSubtasks();
      }
    };

    // Submissão com Validação RN01
    document.getElementById('form-tarefa').onsubmit = async (e) => {
      e.preventDefault();
      const id = document.getElementById('tarefa-id').value;
      const dataExec = document.getElementById('tarefa-execucao').value || null;
      const dataEntr = document.getElementById('tarefa-entrega').value || null;

      // RN01: Execução <= Entrega
      if (dataExec && dataEntr && dataExec > dataEntr) {
        alert('A data de execução não pode ser posterior à data de entrega!');
        return;
      }

      const taskData = {
        titulo: document.getElementById('tarefa-titulo').value,
        descricao: document.getElementById('tarefa-descricao').value,
        data_execucao: dataExec,
        data_entrega: dataEntr,
        categoria: document.getElementById('tarefa-categoria').value || null,
        urgencia: document.getElementById('tarefa-urgencia').value,
        status: document.getElementById('tarefa-status').value
      };

      let saved;
      if (id) saved = await PBService.updateTask(id, taskData);
      else saved = await PBService.createTask(taskData);

      for (const sub of currentSubtasks) {
        if (!sub.id) await PBService.createSubtarefa(saved.id, sub.titulo);
      }

      modalTarefa.hide();
      await loadTasks();
    };

    document.getElementById('form-categoria').onsubmit = async (e) => {
      e.preventDefault();
      await PBService.createCategoria(
        document.getElementById('cat-nome').value,
        document.getElementById('cat-cor').value
      );
      document.getElementById('cat-nome').value = '';
      await loadCategories();
      await loadTasks();
    };

    ['filter-search', 'filter-categoria', 'filter-urgencia', 'filter-status'].forEach(id => {
      document.getElementById(id).oninput = renderTasks;
    });
  }
});