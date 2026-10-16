/**
 * Miau Plans - Módulo de Autenticação
 * Integração Frontend com PocketBase SDK
 */

// 1. Configuração da Instância do PocketBase
// Altere para a URL do seu servidor PocketBase se não for local
const POCKETBASE_URL = 'http://127.0.0.1:8090';
const pb = new PocketBase(POCKETBASE_URL);

// Redireciona para o app caso já esteja autenticado
if (pb.authStore.isValid) {
  window.location.href = 'calendario.html'; // Descomentar ao integrar com a dashboard
}

// 2. Elementos do DOM
const cardTitle = document.getElementById('cardTitle');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const authAlert = document.getElementById('authAlert');

// Botões de Alternância e Ações
const btnGoToRegister = document.getElementById('btnGoToRegister');
const btnGoToLogin = document.getElementById('btnGoToLogin');
const btnForgotPassword = document.getElementById('btnForgotPassword');

const btnLoginSubmit = document.getElementById('btnLoginSubmit');
const btnRegisterSubmit = document.getElementById('btnRegisterSubmit');

// 3. Utilitários de UI e Alertas
function showAlert(message, type = 'error') {
  authAlert.textContent = message;
  authAlert.className = `alert-box ${type}`;
}

function hideAlert() {
  authAlert.textContent = '';
  authAlert.className = 'alert-box hidden';
}

// 4. Alternância entre Login e Cadastro
function switchToRegister() {
  hideAlert();
  loginForm.classList.add('hidden');
  registerForm.classList.remove('hidden');
  cardTitle.textContent = 'Cadastre-se';
}

function switchToLogin() {
  hideAlert();
  registerForm.classList.add('hidden');
  loginForm.classList.remove('hidden');
  cardTitle.textContent = 'Acesse sua Conta';
}

// Event Listeners para Alternância
btnGoToRegister.addEventListener('click', switchToRegister);
btnGoToLogin.addEventListener('click', switchToLogin);

// 5. Lógica de Login
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    showAlert('Por favor, preencha todos os campos.');
    return;
  }

  try {
    btnLoginSubmit.disabled = true;
    btnLoginSubmit.textContent = 'Entrando...';

    // Autenticação com PocketBase
    const authData = await pb.collection('users').authWithPassword(email, password);

    showAlert('Login realizado com sucesso! Redirecionando...', 'success');
    
    setTimeout(() => {
      // Redireciona para a tela principal
      window.location.href = 'calendario.html';
    }, 1000);

  } catch (error) {
    console.error('Erro de login:', error);
    showAlert('E-mail ou senha incorretos. Verifique suas credenciais.');
  } finally {
    btnLoginSubmit.disabled = false;
    btnLoginSubmit.textContent = 'Entrar';
  }
});

// 6. Lógica de Cadastro
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert();

  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;
  const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

  // Validações no Frontend
  if (!email || !password || !passwordConfirm) {
    showAlert('Por favor, preencha todos os campos do cadastro.');
    return;
  }

  if (password.length < 8) {
    showAlert('A senha deve conter no mínimo 8 caracteres.');
    return;
  }

  if (password !== passwordConfirm) {
    showAlert('As senhas não coincidem. Tente novamente.');
    return;
  }

  try {
    btnRegisterSubmit.disabled = true;
    btnRegisterSubmit.textContent = 'Cadastrando...';

    // Payload de criação conforme esquema da coleção 'users'
    const data = {
      email: email,
      password: password,
      passwordConfirm: passwordConfirm,
      name: email.split('@')[0], // Nome padrão temporário derivado do e-mail
    };

    // 1. Criar novo usuário na coleção
    await pb.collection('users').create(data);

    // 2. Realizar login automático após criar conta
    await pb.collection('users').authWithPassword(email, password);

    showAlert('Conta criada com sucesso! Redirecionando...', 'success');

    setTimeout(() => {
      window.location.href = 'calendario.html';
    }, 1200);

  } catch (error) {
    console.error('Erro de cadastro:', error);
    
    // Tratamento de erros do PocketBase
    if (error.data?.data?.email) {
      showAlert('Este e-mail já está em uso.');
    } else if (error.data?.message) {
      showAlert(error.data.message);
    } else {
      showAlert('Não foi possível realizar o cadastro. Tente novamente.');
    }
  } finally {
    btnRegisterSubmit.disabled = false;
    btnRegisterSubmit.textContent = 'Cadastrar';
  }
});

// 7. Recuperação de Senha (Esqueci a Senha)
btnForgotPassword.addEventListener('click', async () => {
  hideAlert();
  const email = document.getElementById('loginEmail').value.trim();

  if (!email) {
    showAlert('Insira seu e-mail no campo acima para redefinir a senha.');
    document.getElementById('loginEmail').focus();
    return;
  }

  try {
    await pb.collection('users').requestPasswordReset(email);
    showAlert('E-mail de redefinição enviado! Verifique sua caixa de entrada.', 'success');
  } catch (error) {
    console.error('Erro ao solicitar redefinição:', error);
    showAlert('Erro ao enviar e-mail de redefinição. Verifique o endereço.');
  }
});