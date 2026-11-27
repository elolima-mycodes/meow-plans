const POCKETBASE_URL = 'http://127.0.0.1:8090';
const pb = new PocketBase(POCKETBASE_URL);

let currentUser = null;
let onFeedbackCloseCallback = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!pb.authStore.isValid || !pb.authStore.model) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = pb.authStore.model;
  initThemeTracker();
  loadUserProfile();
  initModals();

  document.getElementById('profileForm').addEventListener('submit', handleUpdateProfile);
  document.getElementById('btnDeleteAccount').addEventListener('click', openDeleteModal);
  document.getElementById('avatarInput').addEventListener('change', handleAvatarPreview);
});

function initModals() {
  const feedbackModal = document.getElementById('feedbackModal');
  const btnCloseFeedback = document.getElementById('btnCloseFeedbackModal');

  const closeFeedback = () => {
    feedbackModal.classList.remove('is-active');
    if (typeof onFeedbackCloseCallback === 'function') {
      const cb = onFeedbackCloseCallback;
      onFeedbackCloseCallback = null;
      cb();
    }
  };

  btnCloseFeedback.addEventListener('click', closeFeedback);
  feedbackModal.addEventListener('click', (e) => {
    if (e.target === feedbackModal) closeFeedback();
  });

  const deleteModal = document.getElementById('deleteAccountModal');
  document.getElementById('btnCancelDeleteModal').addEventListener('click', () => {
    deleteModal.classList.remove('is-active');
  });
  deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) deleteModal.classList.remove('is-active');
  });
  document.getElementById('btnConfirmDeleteModal').addEventListener('click', handleDeleteAccount);
}

function showFeedbackModal(title, message, type = 'success', onClose = null) {
  const modal = document.getElementById('feedbackModal');
  document.getElementById('feedbackModalIcon').className = type === 'error'
    ? 'bi bi-exclamation-triangle-fill meow-dialog-icon meow-dialog-icon-warning'
    : 'bi bi-check-circle-fill meow-dialog-icon meow-dialog-icon-success';
  document.getElementById('feedbackModalTitle').textContent = title;
  document.getElementById('feedbackModalMessage').textContent = message;
  onFeedbackCloseCallback = onClose;

  modal.classList.add('is-active');
}

function openDeleteModal() {
  const input = document.getElementById('deleteConfirmInput');
  input.value = '';
  document.getElementById('deleteConfirmError').classList.add('hidden');
  document.getElementById('deleteAccountModal').classList.add('is-active');
  setTimeout(() => input.focus(), 50);
}

// Preenche o formulário com os dados do PocketBase
function loadUserProfile() {
  document.getElementById('userNameInput').value = currentUser.name || currentUser.username || '';
  document.getElementById('userEmailInput').value = currentUser.email || '';

  const avatarPreview = document.getElementById('profileAvatarPreview');
  if (currentUser.avatar) {
    const avatarUrl = pb.files.getUrl(currentUser, currentUser.avatar);
    avatarPreview.innerHTML = `<img src="${avatarUrl}" alt="User Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
  } else {
    const initial = (currentUser.name || currentUser.username || 'P').charAt(0).toUpperCase();
    avatarPreview.innerHTML = '<span></span>';
    avatarPreview.firstChild.textContent = initial;
  }
}

// Preview da foto selecionada antes de salvar
function handleAvatarPreview(e) {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      document.getElementById('profileAvatarPreview').innerHTML =
        `<img src="${event.target.result}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;" />`;
    };
    reader.readAsDataURL(file);
  }
}

// Salva as alterações de Nome, E-mail, Foto e Senha
async function handleUpdateProfile(e) {
  e.preventDefault();

  const name = document.getElementById('userNameInput').value.trim();
  const email = document.getElementById('userEmailInput').value.trim();
  const newPassword = document.getElementById('newPasswordInput').value;
  const confirmPassword = document.getElementById('confirmPasswordInput').value;
  const avatarFile = document.getElementById('avatarInput').files[0];

  if (newPassword && newPassword !== confirmPassword) {
    showFeedbackModal('Atenção', 'As senhas digitadas não coincidem!', 'error');
    return;
  }

  // Usa FormData para enviar arquivos (avatar) junto com campos de texto
  const formData = new FormData();
  formData.append('name', name);
  formData.append('email', email);

  if (avatarFile) {
    formData.append('avatar', avatarFile);
  }

  if (newPassword) {
    formData.append('password', newPassword);
    formData.append('passwordConfirm', confirmPassword);
  }

  try {
    const updatedUser = await pb.collection('users').update(currentUser.id, formData);
    showFeedbackModal('Tudo certo!', 'Alterações feitas com sucesso!', 'success');

    // Atualiza a sessão ativa no SDK
    currentUser = updatedUser;
    loadUserProfile();

    // Limpa os campos de senha
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';
  } catch (err) {
    console.error('Erro ao atualizar perfil:', err);
    showFeedbackModal(
    'Erro ao salvar',
    'Não foi possível atualizar o perfil. Verifique se o e-mail já está em uso.',
    'error'
  );
  }
}

// Exclui permanentemente a conta do usuário
async function handleDeleteAccount() {
  const confirmText = document.getElementById('deleteConfirmInput').value.trim();
  const errorMsg = document.getElementById('deleteConfirmError');

  if (confirmText !== 'EXCLUIR') {
    errorMsg.classList.remove('hidden');
    return;
  }

  errorMsg.classList.add('hidden');
  const confirmBtn = document.getElementById('btnConfirmDeleteModal');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Excluindo...';

  try {
    await pb.collection('users').delete(currentUser.id);
    pb.authStore.clear();
    document.getElementById('deleteAccountModal').classList.remove('is-active');

    showFeedbackModal(
      'Conta Excluída',
      'Sua conta foi excluída permanentemente com sucesso.',
      'success',
      () => {
        window.location.href = 'login.html';
      }
    );
  } catch (err) {
    console.error('Erro ao excluir conta:', err);
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Excluir Conta';
    document.getElementById('deleteAccountModal').classList.remove('is-active');
    showFeedbackModal('Erro', 'Não foi possível excluir a conta. Tente novamente.', 'error');
  }
}

// Alternador de Tema
function initThemeTracker() {
  const savedTheme = localStorage.getItem('app_theme') || 'dark';
  if (savedTheme === 'dark') document.body.classList.add('dark-theme');

  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    const paint = (isDark) => {
      themeBtn.innerHTML = `<i class="bi ${isDark ? 'bi-sun-fill' : 'bi-moon-fill'}"></i>`;
    };
    paint(savedTheme === 'dark');
    themeBtn.onclick = () => {
      const isDark = document.body.classList.toggle('dark-theme');
      localStorage.setItem('app_theme', isDark ? 'dark' : 'light');
      paint(isDark);
    };
  }
}

// Registro do Service Worker (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('PWA: Service Worker registrado com sucesso!'))
      .catch((err) => console.error('PWA: Erro ao registrar Service Worker:', err));
  });
}

// Salva a página de origem na sessão assim que a tela abre (antes de qualquer F5)
(function registrarOrigem() {
  if (document.referrer && document.referrer.includes(window.location.host)) {
    const origem = new URL(document.referrer);
    if (!origem.pathname.endsWith('usuario.html')) {
      sessionStorage.setItem('meow_return_url', origem.href);
    }
  }
})();

function voltarTela() {
  const origemSalva = sessionStorage.getItem('meow_return_url');
  window.location.href = origemSalva || 'gerenciar.html';
}