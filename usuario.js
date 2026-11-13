const POCKETBASE_URL = 'http://127.0.0.1:8090';
const pb = new PocketBase(POCKETBASE_URL);

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!pb.authStore.isValid || !pb.authStore.model) {
    window.location.href = 'login.html';
    return;
  }

  currentUser = pb.authStore.model;
  initThemeTracker();
  loadUserProfile();

  document.getElementById('profileForm').addEventListener('submit', handleUpdateProfile);
  document.getElementById('btnDeleteAccount').addEventListener('click', handleDeleteAccount);
  document.getElementById('avatarInput').addEventListener('change', handleAvatarPreview);
});

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
    avatarPreview.innerHTML = `<span>${initial}</span>`;
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
    alert('⚠️ As senhas digitadas não coincidem!');
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
    alert('✅ Perfil atualizado com sucesso!');
    
    // Atualiza a sessão ativa no SDK
    currentUser = updatedUser;
    loadUserProfile();

    // Limpa os campos de senha
    document.getElementById('newPasswordInput').value = '';
    document.getElementById('confirmPasswordInput').value = '';
  } catch (err) {
    console.error('Erro ao atualizar perfil:', err);
    alert('Erro ao atualizar perfil. Verifique se o e-mail já está em uso.');
  }
}

// Exclui permanentemente a conta do usuário
async function handleDeleteAccount() {
  const confirmText = prompt('⚠️ ATENÇÃO: Esta ação apagar sua conta permanentemente! Digite "EXCLUIR" para confirmar:');
  
  if (confirmText === 'EXCLUIR') {
    try {
      await pb.collection('users').delete(currentUser.id);
      pb.authStore.clear();
      alert('Sua conta foi excluída com sucesso.');
      window.location.href = 'login.html';
    } catch (err) {
      console.error('Erro ao excluir conta:', err);
      alert('Erro ao excluir a conta.');
    }
  }
}

// Alternador de Tema
function initThemeTracker() {
  const savedTheme = localStorage.getItem('app_theme') || 'dark';
  if (savedTheme === 'dark') document.body.classList.add('dark-theme');

  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    themeBtn.onclick = () => {
      const isDark = document.body.classList.toggle('dark-theme');
      localStorage.setItem('app_theme', isDark ? 'dark' : 'light');
      themeBtn.textContent = isDark ? '☀️' : '🌙';
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