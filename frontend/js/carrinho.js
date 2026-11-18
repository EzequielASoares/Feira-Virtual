/**
 * Gerenciamento do carrinho de compras e drawer lateral.
 */
import { apiFetch, extractApiError } from './api.js';
import { openAuthModal } from './auth.js';
import { confirmDialog, escapeHtml, formatBRL, getUnitDisplay, showToast, state } from './utils.js';

export async function loadCart() {
  if (!state.user || state.user.tipo !== 'CLIENTE') {
    state.cart = { itens: [], total: '0.00' };
    updateCartBadge();
    renderCartDrawer();
    return;
  }

  try {
    const res = await apiFetch('/carrinho/');
    if (res.ok) {
      state.cart = await res.json();
      updateCartBadge();
      renderCartDrawer();
    }
  } catch (err) {
    console.error('Erro ao carregar carrinho:', err);
  }
}

export async function addToCart(productId, productName) {
  if (!state.user) {
    openAuthModal('login');
    showToast('Entre na sua conta para adicionar produtos ao carrinho.', 'info');
    return;
  }

  if (state.user.tipo !== 'CLIENTE') {
    showToast('Apenas contas de Cliente podem adicionar produtos ao carrinho.', 'error');
    return;
  }

  try {
    const res = await apiFetch('/carrinho/itens/', {
      method: 'POST',
      body: JSON.stringify({ produto: Number.parseInt(productId, 10), quantidade: 1 }),
    });

    if (res.ok) {
      await loadCart();
      showToast(`${productName} adicionado ao carrinho!`, 'success');
      openCartDrawer();
    } else {
      showToast(await extractApiError(res, 'Não foi possível adicionar ao carrinho.'), 'error');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

export async function updateCartItemQuantity(itemId, newQty) {
  if (newQty <= 0) {
    return removeCartItem(itemId);
  }

  try {
    const res = await apiFetch(`/carrinho/itens/${itemId}/`, {
      method: 'PATCH',
      body: JSON.stringify({ quantidade: newQty }),
    });
    if (res.ok) {
      await loadCart();
    } else {
      showToast(await extractApiError(res, 'Estoque insuficiente.'), 'error');
    }
  } catch {
    showToast('Erro ao atualizar quantidade.', 'error');
  }
}

export async function removeCartItem(itemId) {
  try {
    const res = await apiFetch(`/carrinho/itens/${itemId}/`, { method: 'DELETE' });
    if (res.ok) {
      await loadCart();
      showToast('Item removido do carrinho.', 'info');
    } else {
      showToast(await extractApiError(res, 'Erro ao remover item.'), 'error');
    }
  } catch {
    showToast('Erro ao remover item.', 'error');
  }
}

export async function clearCart() {
  const ok = await confirmDialog('Deseja esvaziar todos os itens do seu carrinho?', 'Limpar carrinho');
  if (!ok) return;

  try {
    const res = await apiFetch('/carrinho/', { method: 'DELETE' });
    if (res.ok) {
      state.cart = { itens: [], total: '0.00' };
      updateCartBadge();
      renderCartDrawer();
      showToast('Carrinho esvaziado.', 'info');
    } else {
      showToast(await extractApiError(res, 'Erro ao limpar carrinho.'), 'error');
    }
  } catch {
    showToast('Erro ao limpar carrinho.', 'error');
  }
}

export function updateCartBadge() {
  const badge = document.getElementById('cartBadge');
  if (!badge) return;
  const count = state.cart.itens ? state.cart.itens.length : 0;
  if (count > 0) {
    badge.textContent = String(count);
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

export function renderCartDrawer() {
  const container = document.getElementById('cartItemsList');
  const footer = document.getElementById('cartFooter');
  const totalVal = document.getElementById('cartTotalVal');
  if (!container || !footer || !totalVal) return;

  if (!state.cart.itens || state.cart.itens.length === 0) {
    container.innerHTML = `
      <div class="cart-empty">
        <span class="cart-empty__icon" aria-hidden="true">🧺</span>
        <p style="font-weight: 700; color: var(--text-primary);">Seu carrinho está vazio.</p>
        <p style="font-size: 0.8125rem; margin-top: 4px;">Explore o catálogo e apoie a produção local.</p>
        <button type="button" class="btn btn--outline btn--sm" id="btnExploreFromCart" style="margin-top: 16px;">
          Ver produtos
        </button>
      </div>
    `;
    document.getElementById('btnExploreFromCart')?.addEventListener('click', () => {
      closeCartDrawer();
      document.getElementById('produtos')?.scrollIntoView({ behavior: 'smooth' });
    });
    footer.style.display = 'none';
    return;
  }

  container.innerHTML = state.cart.itens
    .map((it) => {
      const qty = Number.parseFloat(it.quantidade);
      return `
        <div class="cart-item" data-id="${it.id}">
          <div class="cart-item__info">
            <h4 class="cart-item__name">${escapeHtml(it.produto_nome)}</h4>
            <div class="cart-item__price">${escapeHtml(it.produtor_nome || '')} · ${formatBRL(it.preco_unitario)} / ${escapeHtml(getUnitDisplay(it.unidade_medida))}</div>
            <div class="cart-item__subtotal">${formatBRL(it.subtotal)}</div>
          </div>

          <div class="cart-item__qty">
            <button type="button" class="qty-btn btn-qty-minus" data-id="${it.id}" data-qty="${qty - 1}" aria-label="Diminuir quantidade">−</button>
            <span class="qty-val">${qty}</span>
            <button type="button" class="qty-btn btn-qty-plus" data-id="${it.id}" data-qty="${qty + 1}" aria-label="Aumentar quantidade">+</button>
          </div>

          <button type="button" class="cart-item__remove btn-cart-remove" data-id="${it.id}" title="Remover item" aria-label="Remover ${escapeHtml(it.produto_nome)}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      `;
    })
    .join('');

  totalVal.textContent = formatBRL(state.cart.total);
  footer.style.display = 'block';

  container.querySelectorAll('.btn-qty-minus').forEach((b) => {
    b.addEventListener('click', () => updateCartItemQuantity(b.dataset.id, Number.parseFloat(b.dataset.qty)));
  });
  container.querySelectorAll('.btn-qty-plus').forEach((b) => {
    b.addEventListener('click', () => updateCartItemQuantity(b.dataset.id, Number.parseFloat(b.dataset.qty)));
  });
  container.querySelectorAll('.btn-cart-remove').forEach((b) => {
    b.addEventListener('click', () => removeCartItem(b.dataset.id));
  });
}

export function openCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  drawer?.classList.add('open');
  drawer?.setAttribute('aria-hidden', 'false');
  document.getElementById('cartOverlay')?.classList.add('active');
}

export function closeCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  drawer?.classList.remove('open');
  drawer?.setAttribute('aria-hidden', 'true');
  document.getElementById('cartOverlay')?.classList.remove('active');
}
