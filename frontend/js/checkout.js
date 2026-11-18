/**
 * Fluxo de checkout, compatibilidade de pagamento e cadastro rápido de endereço.
 */
import { apiFetch, extractApiError } from './api.js';
import { closeCartDrawer, loadCart } from './carrinho.js';
import { loadProducts } from './catalogo.js';
import { escapeHtml, formatBRL, setButtonLoading, showToast, state } from './utils.js';

export async function openCheckoutModal() {
  if (!state.cart.itens || state.cart.itens.length === 0) {
    showToast('Seu carrinho está vazio.', 'info');
    return;
  }

  closeCartDrawer();
  const modal = document.getElementById('checkoutModalOverlay');
  document.getElementById('checkoutTotalDisplay').textContent = formatBRL(state.cart.total);

  syncPaymentAvailability();
  await loadUserAddresses();

  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
}

export function closeCheckoutModal() {
  const modal = document.getElementById('checkoutModalOverlay');
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  document.getElementById('checkoutError').style.display = 'none';
}

function syncPaymentAvailability() {
  const itens = state.cart.itens || [];
  const accepts = {
    PIX: itens.every((it) => it.produtor_aceita_pix !== false),
    CARTAO: itens.every((it) => it.produtor_possui_maquininha !== false),
    DINHEIRO: itens.every((it) => it.produtor_aceita_dinheiro !== false),
  };

  let firstEnabled = null;
  document.querySelectorAll('#checkoutPaymentOptions .payment-option').forEach((label) => {
    const input = label.querySelector('input');
    const val = input.value;
    const ok = accepts[val];
    input.disabled = !ok;
    label.classList.toggle('disabled', !ok);
    if (ok && !firstEnabled) firstEnabled = input;
  });

  const checked = document.querySelector('#checkoutPaymentOptions input:checked');
  if (checked && checked.disabled && firstEnabled) {
    firstEnabled.checked = true;
    document.querySelectorAll('#checkoutPaymentOptions .payment-option').forEach((l) => l.classList.remove('active'));
    firstEnabled.closest('.payment-option').classList.add('active');
  }

  const hint = document.getElementById('checkoutPaymentHint');
  if (hint) {
    const indisponiveis = Object.entries(accepts)
      .filter(([, ok]) => !ok)
      .map(([k]) => k);
    hint.textContent = indisponiveis.length
      ? `Opções indisponíveis para algum produtor do carrinho: ${indisponiveis.join(', ')}.`
      : 'Formas aceitas por todos os produtores do seu carrinho.';
  }
}

export async function loadUserAddresses() {
  const select = document.getElementById('enderecoSelect');
  if (!select) return;

  try {
    const res = await apiFetch('/enderecos/');
    if (res.ok) {
      const enderecos = await res.json();
      if (!enderecos.length) {
        select.innerHTML = '<option value="">Nenhum endereço cadastrado — cadastre ao lado</option>';
      } else {
        select.innerHTML = enderecos
          .map(
            (e) =>
              `<option value="${e.id}">${escapeHtml(e.rotulo || 'Endereço')}: ${escapeHtml(e.logradouro)}, ${escapeHtml(e.numero)} - ${escapeHtml(e.bairro)} (${escapeHtml(e.cidade)}/${escapeHtml(e.estado)})</option>`
          )
          .join('');
      }
    }
  } catch {
    select.innerHTML = '<option value="">Erro ao carregar endereços</option>';
  }
}

export async function saveQuickAddress() {
  const payload = {
    rotulo: document.getElementById('qaRotulo').value.trim() || 'Casa',
    cep: document.getElementById('qaCep').value.trim(),
    logradouro: document.getElementById('qaLogradouro').value.trim(),
    numero: document.getElementById('qaNumero').value.trim(),
    bairro: document.getElementById('qaBairro').value.trim(),
    cidade: document.getElementById('qaCidade').value.trim(),
    estado: document.getElementById('qaEstado').value.trim().toUpperCase(),
    complemento: document.getElementById('qaComplemento').value.trim(),
  };

  if (!payload.logradouro || !payload.numero || !payload.bairro || !payload.cidade || !payload.estado) {
    showToast('Preencha logradouro, número, bairro, cidade e UF.', 'error');
    return;
  }

  const btn = document.getElementById('btnSaveQuickAddress');
  setButtonLoading(btn, true, 'Salvando...');
  try {
    const res = await apiFetch('/enderecos/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(await extractApiError(res, 'Não foi possível salvar o endereço.'));
    }
    const created = await res.json();
    await loadUserAddresses();
    document.getElementById('enderecoSelect').value = String(created.id);
    document.getElementById('quickAddressForm').style.display = 'none';
    showToast('Endereço cadastrado!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    setButtonLoading(btn, false);
  }
}

export async function handleCheckoutSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('checkoutForm');
  const errorBox = document.getElementById('checkoutError');
  const submitBtn = document.getElementById('btnConfirmOrder');
  errorBox.style.display = 'none';

  const modalidade = form.elements['modalidade'].value;
  const formaPagamento = form.elements['forma_pagamento'].value;
  const observacao = document.getElementById('checkoutObs').value.trim();
  const enderecoId = document.getElementById('enderecoSelect').value;

  const payload = {
    modalidade,
    forma_pagamento: formaPagamento,
    observacao,
  };

  if (modalidade === 'ENTREGA') {
    if (!enderecoId) {
      errorBox.textContent = 'Informe ou cadastre um endereço de entrega.';
      errorBox.style.display = 'block';
      return;
    }
    payload.endereco_id = Number.parseInt(enderecoId, 10);
  }

  setButtonLoading(submitBtn, true, 'Enviando pedido...');
  try {
    const res = await apiFetch('/pedidos/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const pedidos = await res.json();
      closeCheckoutModal();
      await loadCart();
      await loadProducts();
      showToast(
        `${pedidos.length} pedido(s) realizado(s) com sucesso! Acompanhe no seu painel.`,
        'success'
      );
    } else {
      errorBox.textContent = await extractApiError(res, 'Erro ao finalizar pedido.');
      errorBox.style.display = 'block';
    }
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  } finally {
    setButtonLoading(submitBtn, false);
  }
}
