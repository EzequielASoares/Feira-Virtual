/**
 * Ponto de entrada do frontend Feira Virtual.
 */
import { renderAdminDashboard } from './admin.js';
import {
  checkAuth,
  closeAuthModal,
  closeMobileMenu,
  initAuthHooks,
  loginUser,
  openAuthModal,
  registerUser,
  requestPasswordRecovery,
  resetPassword,
  setOnAuthChanged,
  switchAuthTab,
  syncThemeLogos,
} from './auth.js';
import { closeCartDrawer, loadCart, openCartDrawer, clearCart } from './carrinho.js';
import { loadCategories, loadProducers, loadProducts } from './catalogo.js';
import { closeCheckoutModal, handleCheckoutSubmit, openCheckoutModal, saveQuickAddress } from './checkout.js';
import { renderClienteDashboard } from './cliente.js';
import { renderEntregadorDashboard } from './entregador.js';
import { renderProdutorDashboard } from './produtor.js';
import { closeGenericModal, setButtonLoading, showToast, state } from './utils.js';

function showStoreView() {
  state.activeView = 'store';
  document.getElementById('storeView').style.display = 'block';
  document.getElementById('dashboardSection').style.display = 'none';
}

function showDashboardView() {
  if (!state.user) {
    openAuthModal('login');
    return;
  }
  state.activeView = 'dashboard';
  document.getElementById('storeView').style.display = 'none';
  document.getElementById('dashboardSection').style.display = 'block';

  const roleLabels = {
    CLIENTE: { badge: 'Cliente', title: 'Painel do Comprador', sub: 'Acompanhe seus pedidos, endereços, avaliações e reclamações.' },
    PRODUTOR: { badge: 'Produtor Rural', title: 'Painel da Propriedade', sub: 'Gerencie seus produtos, pedidos recebidos, vendas e formas de pagamento.' },
    ENTREGADOR: { badge: 'Entregador Parceiro', title: 'Painel de Entregas', sub: 'Aceite entregas disponíveis e atualize o andamento até a conclusão.' },
    ADMIN: { badge: 'Administrador', title: 'Painel Administrativo', sub: 'Indicadores, aprovação de produtores, moderação de produtos e reclamações.' },
  };
  const info = roleLabels[state.user.tipo] || roleLabels.CLIENTE;
  document.getElementById('dashboardRoleBadge').textContent = info.badge;
  document.getElementById('dashboardTitle').textContent = info.title;
  document.getElementById('dashboardSubtitle').textContent = info.sub;

  const tabsEl = document.getElementById('dashboardTabs');
  const contentEl = document.getElementById('dashboardContent');

  if (state.user.tipo === 'CLIENTE') renderClienteDashboard(contentEl, tabsEl);
  else if (state.user.tipo === 'PRODUTOR') renderProdutorDashboard(contentEl, tabsEl);
  else if (state.user.tipo === 'ENTREGADOR') renderEntregadorDashboard(contentEl, tabsEl);
  else if (state.user.tipo === 'ADMIN') renderAdminDashboard(contentEl, tabsEl);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', () => {
  initAuthHooks();

  setOnAuthChanged((user) => {
    if (user?.tipo === 'CLIENTE') {
      loadCart();
    } else {
      state.cart = { itens: [], total: '0.00' };
      loadCart();
    }
    if (!user && state.activeView === 'dashboard') {
      showStoreView();
    }
  });

  // Tema claro/escuro com atualização da logo
  const html = document.documentElement;
  const savedTheme = localStorage.getItem('fv-theme') || 'light';
  html.setAttribute('data-theme', savedTheme);
  syncThemeLogos(savedTheme);

  document.getElementById('themeToggle')?.addEventListener('click', () => {
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('fv-theme', next);
    syncThemeLogos(next);
  });

  // Inicialização de dados
  checkAuth();
  loadCategories();
  loadProducts(1);
  loadProducers();

  // Navegação Loja / Painel
  document.getElementById('btnNavPanel')?.addEventListener('click', showDashboardView);
  document.getElementById('btnMobilePanel')?.addEventListener('click', () => {
    closeMobileMenu();
    showDashboardView();
  });
  document.getElementById('btnBackToStore')?.addEventListener('click', showStoreView);
  document.getElementById('navHomeLink')?.addEventListener('click', showStoreView);
  document.querySelectorAll('[data-nav-view="store"]').forEach((link) => {
    link.addEventListener('click', () => {
      showStoreView();
      closeMobileMenu();
    });
  });
  window.addEventListener('fv:open-dashboard', () => {
    closeMobileMenu();
    showDashboardView();
  });

  // Navbar mobile
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobileMenu');
  hamburger?.addEventListener('click', () => {
    const open = hamburger.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(open));
    mobileMenu.classList.toggle('open', open);
    mobileMenu.setAttribute('aria-hidden', String(!open));
  });

  // Carrinho
  document.getElementById('btnOpenCart')?.addEventListener('click', () => {
    if (!state.user) {
      openAuthModal('login');
      showToast('Entre na sua conta para ver o carrinho.', 'info');
    } else if (state.user.tipo !== 'CLIENTE') {
      showToast('O carrinho está disponível apenas para contas de Cliente.', 'info');
    } else {
      openCartDrawer();
    }
  });
  document.getElementById('btnCloseCart')?.addEventListener('click', closeCartDrawer);
  document.getElementById('cartOverlay')?.addEventListener('click', closeCartDrawer);
  document.getElementById('btnClearCart')?.addEventListener('click', clearCart);
  document.getElementById('btnCheckout')?.addEventListener('click', openCheckoutModal);

  // Modais Auth
  document.getElementById('btnCloseAuthModal')?.addEventListener('click', closeAuthModal);
  document.getElementById('authModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'authModalOverlay') closeAuthModal();
  });
  document.getElementById('tabLogin')?.addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('tabRegister')?.addEventListener('click', () => switchAuthTab('register'));
  document.getElementById('tabRecover')?.addEventListener('click', () => switchAuthTab('recover'));
  document.getElementById('btnGoRecover')?.addEventListener('click', () => switchAuthTab('recover'));

  // Alternância de campos extras no cadastro
  document.getElementById('regTipo')?.addEventListener('change', (e) => {
    const tipo = e.target.value;
    document.getElementById('regProdutorFields').style.display = tipo === 'produtor' ? 'block' : 'none';
    document.getElementById('regEntregadorFields').style.display = tipo === 'entregador' ? 'block' : 'none';
    document.getElementById('regPropNome').required = tipo === 'produtor';
  });

  // Submit Login
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('loginError');
    const btn = document.getElementById('btnLoginSubmit');
    errBox.style.display = 'none';
    setButtonLoading(btn, true, 'Entrando...');
    try {
      await loginUser(
        document.getElementById('loginUsername').value.trim(),
        document.getElementById('loginPassword').value
      );
      closeAuthModal();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      setButtonLoading(btn, false);
    }
  });

  // Submit Cadastro
  document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('registerError');
    const btn = document.getElementById('btnRegisterSubmit');
    errBox.style.display = 'none';

    const tipo = document.getElementById('regTipo').value;
    const payload = {
      first_name: document.getElementById('regFirstName').value.trim(),
      last_name: document.getElementById('regLastName').value.trim(),
      email: document.getElementById('regEmail').value.trim(),
      telefone: document.getElementById('regPhone').value.trim(),
      username: document.getElementById('regUsername').value.trim(),
      password: document.getElementById('regPassword').value,
    };

    if (tipo === 'produtor') {
      payload.nome_propriedade = document.getElementById('regPropNome').value.trim();
      payload.cidade = document.getElementById('regPropCidade').value.trim();
      payload.estado = document.getElementById('regPropEstado').value.trim().toUpperCase();
      payload.chave_pix = document.getElementById('regPropPix').value.trim();
      payload.possui_maquininha = document.getElementById('regPropMaquininha').checked;
      payload.aceita_dinheiro = document.getElementById('regPropDinheiro').checked;
    } else if (tipo === 'entregador') {
      payload.veiculo = document.getElementById('regEntVeiculo').value.trim();
      payload.placa = document.getElementById('regEntPlaca').value.trim();
      payload.area_atuacao = document.getElementById('regEntArea').value.trim();
    }

    setButtonLoading(btn, true, 'Criando conta...');
    try {
      await registerUser(tipo, payload);
      closeAuthModal();
      loadProducers();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      setButtonLoading(btn, false);
    }
  });

  // Recuperar e redefinir senha
  document.getElementById('recoverForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgBox = document.getElementById('recoverMsg');
    try {
      const data = await requestPasswordRecovery(document.getElementById('recoverEmail').value.trim());
      msgBox.textContent = data.detail || 'Se o e-mail existir, enviaremos as instruções.';
      msgBox.style.display = 'block';
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('resetPasswordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('resetError');
    errBox.style.display = 'none';
    try {
      await resetPassword(
        document.getElementById('resetUid').value.trim(),
        document.getElementById('resetToken').value.trim(),
        document.getElementById('resetNewPassword').value
      );
      showToast('Senha alterada com sucesso! Faça login com a nova senha.', 'success');
      switchAuthTab('login');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    }
  });

  // Checkout
  document.getElementById('btnCloseCheckoutModal')?.addEventListener('click', closeCheckoutModal);
  document.getElementById('checkoutModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'checkoutModalOverlay') closeCheckoutModal();
  });
  document.getElementById('checkoutForm')?.addEventListener('submit', handleCheckoutSubmit);
  document.getElementById('btnToggleQuickAddress')?.addEventListener('click', () => {
    const form = document.getElementById('quickAddressForm');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('btnSaveQuickAddress')?.addEventListener('click', saveQuickAddress);

  document.querySelectorAll('input[name="modalidade"]').forEach((r) => {
    r.addEventListener('change', (e) => {
      document.querySelectorAll('.radio-card').forEach((rc) => rc.classList.remove('active'));
      e.target.closest('.radio-card').classList.add('active');
      document.getElementById('enderecoGroup').style.display = e.target.value === 'ENTREGA' ? 'block' : 'none';
    });
  });

  document.querySelectorAll('input[name="forma_pagamento"]').forEach((r) => {
    r.addEventListener('change', (e) => {
      if (e.target.disabled) return;
      document.querySelectorAll('#checkoutPaymentOptions .payment-option').forEach((po) => po.classList.remove('active'));
      e.target.closest('.payment-option').classList.add('active');
    });
  });

  // Modal Genérico
  document.getElementById('btnCloseGenericModal')?.addEventListener('click', closeGenericModal);
  document.getElementById('genericModalOverlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'genericModalOverlay') closeGenericModal();
  });

  // Busca e filtros do catálogo
  let searchTimeout;
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  searchInput?.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    btnClearSearch.style.display = val ? 'block' : 'none';
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = val;
      loadProducts(1);
    }, 300);
  });
  btnClearSearch?.addEventListener('click', () => {
    searchInput.value = '';
    btnClearSearch.style.display = 'none';
    state.searchQuery = '';
    loadProducts(1);
  });
  document.getElementById('tipoProducaoSelect')?.addEventListener('change', (e) => {
    state.tipoProducao = e.target.value;
    loadProducts(1);
  });
  document.getElementById('orderingSelect')?.addEventListener('change', (e) => {
    state.ordering = e.target.value;
    loadProducts(1);
  });

  // Acessibilidade: fechar modais/drawer com Escape e sombra da navbar no scroll
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeCartDrawer();
      closeAuthModal();
      closeCheckoutModal();
      closeGenericModal();
    }
  });
  window.addEventListener('scroll', () => {
    document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 10);
  });
});
