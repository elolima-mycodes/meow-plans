// Conexão com a pasta local backend/pocketbase
const pb = new PocketBase('http://127.0.0.1:8090');

const PBService = {
  // Guard de autenticação para páginas restritas
  requireAuth() {
    if (!pb.authStore.isValid) {
      window.location.href = 'index.html';
    }
  },

  // Redireciona se já estiver autenticado
  redirectIfAuth() {
    if (pb.authStore.isValid) {
      window.location.href = 'calendario.html';
    }
  },

  // --- AUTENTICAÇÃO ---
  async login(email, password) {
    return await pb.collection('users').authWithPassword(email, password);
  },

  async register(email, password, name) {
    await pb.collection('users').create({
      email,
      password,
      passwordConfirm: password,
      name
    });
    return await this.login(email, password);
  },

  logout() {
    pb.authStore.clear();
    window.location.href = 'index.html';
  },

  getCurrentUser() {
    return pb.authStore.model;
  },

  // --- CATEGORIAS ---
  async getCategorias() {
    return await pb.collection('categorias').getFullList({
      filter: 'deleted = false',
      sort: 'nome'
    });
  },

  async createCategoria(nome, cor) {
    return await pb.collection('categorias').create({
      nome,
      cor,
      user: this.getCurrentUser().id,
      deleted: false
    });
  },

  async deleteCategoria(id) {
    return await pb.collection('categorias').update(id, { deleted: true });
  },

  // --- TAREFAS ---
  async getTarefas() {
    return await pb.collection('tarefas').getFullList({
      filter: 'deleted = false',
      expand: 'categoria',
      sort: '-created'
    });
  },

  async getLixeira() {
    return await pb.collection('tarefas').getFullList({
      filter: 'deleted = true',
      expand: 'categoria'
    });
  },

  async createTask(data) {
    return await pb.collection('tarefas').create({
      ...data,
      user: this.getCurrentUser().id,
      deleted: false
    });
  },

  async updateTask(id, data) {
    return await pb.collection('tarefas').update(id, data);
  },

  async softDeleteTask(id) {
    return await pb.collection('tarefas').update(id, { deleted: true });
  },

  async restoreTask(id) {
    return await pb.collection('tarefas').update(id, { deleted: false });
  },

  // --- SUBTAREFAS ---
  async getSubtarefas(tarefaId) {
    return await pb.collection('subtarefas').getFullList({
      filter: `tarefa = "${tarefaId}"`
    });
  },

  async createSubtarefa(tarefaId, titulo) {
    return await pb.collection('subtarefas').create({
      tarefa: tarefaId,
      titulo,
      completed: false,
      user: this.getCurrentUser().id
    });
  },

  async toggleSubtarefa(id, completed) {
    return await pb.collection('subtarefas').update(id, { completed });
  },

  async deleteSubtarefa(id) {
    return await pb.collection('subtarefas').delete(id);
  }
};