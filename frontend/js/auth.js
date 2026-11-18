/**
 * Autenticação, cadastro multi-perfil, recuperação de senha e estado da sessão.
 */
import { apiFetch, ensureCsrf, extractApiError, setOnUnauthorized } from './api.js';
import { escapeHtml, showToast, state } from './utils.js';

let onAuthChangedHandler = null;

export function setOnAuthChanged(cb) {
  onAuthChangedHandler = cb;
}

export function initAuthHooks() {
  setOnUnauthorized(() => {
    if (state.user) {
      logoutLocal();
    }
  });
}

export async function checkAuth() {
  try {
    await ensureCsrf();
    const res = await apiFetch('/perfil/', { skipAuthRefresh: false });
    if (res.ok) {
      state.user = await res.json();
    } else {
      state.user = null;
    }
  } catch {
    state.user = null;
  }
  renderAuthArea();
  if (onAuthChangedHandler) onAuthChangedHandler(state.user);
}

export async function loginUser(username, password) {
  const res = await apiFetch('/auth/login/', {
    method: 'POST',
    skipAuthRefresh: true,
    headers: { 'X-Auth-Mode': 'cookie' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    throw new Error(await extractApiError(res, 'Usuário ou senha incorretos.'));
  }

  const data = await res.json();
  state.user = data.user || null;
  if (!state.user) {
    await checkAuth();
  } else {
    renderAuthArea();
    if (onAuthChangedHandler) onAuthChangedHandler(state.user);
  }
  showToast('Login realizado com sucesso!', 'success');
}

export async function registerUser(tipo, payload) {
  const endpointMap = {
    cliente: '/auth/registro/cliente/',
    produtor: '/auth/registro/produtor/',
    entregador: '/auth/registro/entregador/',
  };
  const endpoint = endpointMap[tipo] || '/auth/registro/cliente/';

  const res = await apiFetch(endpoint, {
    method: 'POST',
    skipAuthRefresh: true,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(await extractApiError(res, 'Erro ao criar conta.'));
  }

  await loginUser(payload.username, payload.password);
  if (tipo === 'produtor') {
    showToast('Conta de produtor criada! Aguardando aprovação do administrador para publicar produtos.', 'info');
  } else {
    showToast('Conta criada com sucesso! Bem-vindo(a) à Feira Virtual!', 'success');
  }
}

export async function requestPasswordRecovery(email) {
  const res = await apiFetch('/auth/recuperar-senha/', {
    method: 'POST',
    skipAuthRefresh: true,
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new Error(await extractApiError(res, 'Não foi possível solicitar recuperação.'));
  }
  return res.json();
}

export async function resetPassword(uid, token, novaSenha) {
  const res = await apiFetch('/auth/redefinir-senha/', {
    method: 'POST',
    skipAuthRefresh: true,
    body: JSON.stringify({ uid, token, nova_senha: novaSenha }),
  });
  if (!res.ok) {
    throw new Error(await extractApiError(res, 'Não foi possível redefinir a senha.'));
  }
  return res.json();
}

export async function logout() {
  try {
    await apiFetch('/auth/logout/', {
      method: 'POST',
      skipAuthRefresh: true,
      headers: { 'X-Auth-Mode': 'cookie' },
      body: JSON.stringify({}),
    });
  } catch {
    // Limpa estado local mesmo em caso de erro de rede
  }
  logoutLocal();
  showToast('Você saiu da sua conta.', 'info');
}

export function logoutLocal() {
  state.user = null;
  state.cart = { itens: [], total: '0.00' };
  state.activeView = 'store';
  renderAuthArea();
  if (onAuthChangedHandler) onAuthChangedHandler(null);
}

export function renderAuthArea() {
  const area = document.getElementById('navAuthArea');
  const mobileArea = document.getElementById('mobileAuthArea');
  const navPanelWrap = document.getElementById('navPanelLinkWrap');
  const mobilePanelWrap = document.getElementById('mobilePanelLinkWrap');

  if (state.user) {
    if (navPanelWrap) navPanelWrap.style.display = 'block';
    if (mobilePanelWrap) mobilePanelWrap.style.display = 'block';

    const displayName = escapeHtml(state.user.first_name || state.user.username);
    const initials = escapeHtml((state.user.first_name?.[0] || state.user.username?.[0] || 'U').toUpperCase());
    const roleLabel = escapeHtml(
      {
        CLIENTE: 'Cliente',
        PRODUTOR: 'Produtor',
        ENTREGADOR: 'Entregador',
        ADMIN: 'Admin',
      }[state.user.tipo] || state.user.tipo
    );

    area.innerHTML = `
      <div class="user-chip" title="Logado como ${escapeHtml(state.user.username)}">
        <button type="button" class="user-chip__trigger" id="btnOpenUserPanel" aria-label="Abrir meu painel">
          <span class="user-chip__avatar">${initials}</span>
          <span class="user-chip__name">${displayName}</span>
          <span class="user-chip__role">(${roleLabel})</span>
        </button>
        <button type="button" class="user-chip__logout" id="btnLogout" title="Sair da conta" aria-label="Sair da conta">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    `;

    mobileArea.innerHTML = `
      <div style="padding: 8px 0; font-weight: 600;">Olá, ${displayName} (${roleLabel})</div>
      <button type="button" class="btn btn--primary btn--full" id="btnMobileGoPanel">Acessar Meu Painel</button>
      <button type="button" class="btn btn--outline btn--full" id="btnMobileLogout">Sair da conta</button>
    `;

    document.getElementById('btnLogout')?.addEventListener('click', logout);
    document.getElementById('btnMobileLogout')?.addEventListener('click', logout);
    document.getElementById('btnOpenUserPanel')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('fv:open-dashboard'));
    });
    document.getElementById('btnMobileGoPanel')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('fv:open-dashboard'));
    });
  } else {
    if (navPanelWrap) navPanelWrap.style.display = 'none';
    if (mobilePanelWrap) mobilePanelWrap.style.display = 'none';

    area.innerHTML = `
      <button type="button" class="btn btn--outline btn--sm" id="btnOpenLogin">Entrar</button>
      <button type="button" class="btn btn--primary btn--sm" id="btnOpenRegister">Cadastrar</button>
    `;
    mobileArea.innerHTML = `
      <button type="button" class="btn btn--outline btn--full" id="btnMobileLogin">Entrar</button>
      <button type="button" class="btn btn--primary btn--full" id="btnMobileRegister">Cadastrar</button>
    `;

    document.getElementById('btnOpenLogin')?.addEventListener('click', () => openAuthModal('login'));
    document.getElementById('btnOpenRegister')?.addEventListener('click', () => openAuthModal('register'));
    document.getElementById('btnMobileLogin')?.addEventListener('click', () => {
      closeMobileMenu();
      openAuthModal('login');
    });
    document.getElementById('btnMobileRegister')?.addEventListener('click', () => {
      closeMobileMenu();
      openAuthModal('register');
    });
  }
}

export function openAuthModal(tab = 'login') {
  const modal = document.getElementById('authModalOverlay');
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  switchAuthTab(tab);
}

export function closeAuthModal() {
  const modal = document.getElementById('authModalOverlay');
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  document.getElementById('loginError').style.display = 'none';
  document.getElementById('registerError').style.display = 'none';
  document.getElementById('resetError').style.display = 'none';
}

export function switchAuthTab(tab) {
  const tabs = {
    login: document.getElementById('tabLogin'),
    register: document.getElementById('tabRegister'),
    recover: document.getElementById('tabRecover'),
  };
  const panels = {
    login: document.getElementById('loginForm'),
    register: document.getElementById('registerForm'),
    recover: document.getElementById('recoverFormWrap'),
  };

  Object.keys(tabs).forEach((k) => {
    const isActive = k === tab;
    tabs[k]?.classList.toggle('active', isActive);
    tabs[k]?.setAttribute('aria-selected', String(isActive));
    if (panels[k]) panels[k].style.display = isActive ? 'block' : 'none';
  });
}

export function closeMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  hamburger?.classList.remove('open');
  hamburger?.setAttribute('aria-expanded', 'false');
  mobileMenu?.classList.remove('open');
  mobileMenu?.setAttribute('aria-hidden', 'true');
}

export function syncThemeLogos(theme) {
  document.querySelectorAll('[data-theme-logo]').forEach((img) => {
    const target = theme === 'dark' ? img.dataset.logoDark : img.dataset.logoLight;
    if (target) img.src = target;
  });
}
