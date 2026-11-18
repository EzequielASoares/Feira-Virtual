/**
 * Utilitários compartilhados, estado global e segurança contra XSS.
 */

export const state = {
  user: null,
  cart: { itens: [], total: '0.00' },
  categories: [],
  selectedCategory: '',
  selectedProducerId: '',
  selectedProducerName: '',
  searchQuery: '',
  tipoProducao: '',
  ordering: 'nome',
  currentPage: 1,
  activeView: 'store', // 'store' | 'dashboard'
};

const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"'`]/g, (ch) => ESCAPE_MAP[ch]);
}

export function safeUrl(url) {
  if (!url) return '';
  const str = String(url).trim();
  if (str.startsWith('/') || str.startsWith('http://') || str.startsWith('https://')) {
    return escapeHtml(str);
  }
  return '';
}

export function formatBRL(val) {
  const num = Number.parseFloat(val || 0);
  return Number.isNaN(num)
    ? 'R$ 0,00'
    : num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return escapeHtml(iso);
  }
}

export function getUnitDisplay(unit) {
  const map = {
    KG: 'kg',
    G: 'g',
    L: 'L',
    ML: 'ml',
    UNIDADE: 'un',
    CAIXA: 'cx',
    MACO: 'maço',
    SACO: 'saco',
  };
  return map[unit] || (unit ? String(unit).toLowerCase() : 'un');
}

export function getStatusBadge(statusValue) {
  const map = {
    PENDENTE: { label: 'Aguardando produtor', cls: 'badge--warning' },
    ACEITO: { label: 'Aceito', cls: 'badge--info' },
    RECUSADO: { label: 'Recusado', cls: 'badge--danger' },
    EM_PREPARO: { label: 'Em preparo', cls: 'badge--info' },
    PRONTO: { label: 'Pronto', cls: 'badge--success' },
    EM_ENTREGA: { label: 'Saiu para entrega', cls: 'badge--info' },
    CONCLUIDO: { label: 'Concluído', cls: 'badge--success' },
    CANCELADO: { label: 'Cancelado', cls: 'badge--danger' },
    APROVADO: { label: 'Aprovado', cls: 'badge--success' },
    SUSPENSO: { label: 'Suspenso', cls: 'badge--danger' },
    ABERTA: { label: 'Aberta', cls: 'badge--warning' },
    EM_ANALISE: { label: 'Em análise', cls: 'badge--info' },
    RESOLVIDA: { label: 'Resolvida', cls: 'badge--success' },
  };
  const info = map[statusValue] || { label: statusValue || '—', cls: 'badge--outline' };
  return `<span class="badge ${info.cls}">${escapeHtml(info.label)}</span>`;
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  const iconEl = document.createElement('span');
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️';

  const textEl = document.createElement('span');
  textEl.textContent = String(message);

  toast.appendChild(iconEl);
  toast.appendChild(textEl);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

export function setButtonLoading(btn, loading, loadingText = 'Processando...') {
  if (!btn) return;
  if (loading) {
    btn.dataset.origText = btn.textContent;
    btn.textContent = loadingText;
    btn.disabled = true;
  } else {
    btn.textContent = btn.dataset.origText || btn.textContent;
    btn.disabled = false;
  }
}

export function openGenericModal(title, htmlContent) {
  const overlay = document.getElementById('genericModalOverlay');
  document.getElementById('genericModalTitle').textContent = title;
  document.getElementById('genericModalBody').innerHTML = htmlContent;
  overlay.classList.add('active');
  overlay.setAttribute('aria-hidden', 'false');
}

export function closeGenericModal() {
  const overlay = document.getElementById('genericModalOverlay');
  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  document.getElementById('genericModalBody').innerHTML = '';
}

export function confirmDialog(message, title = 'Confirmar ação') {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirmModalOverlay');
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl = document.getElementById('confirmModalMessage');
    const btnOk = document.getElementById('btnConfirmOk');
    const btnCancel = document.getElementById('btnConfirmCancel');

    titleEl.textContent = title;
    msgEl.textContent = message;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');

    const cleanup = (result) => {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
      btnOk.removeEventListener('click', onOk);
      btnCancel.removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBackdrop);
      resolve(result);
    };

    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => {
      if (e.target === overlay) cleanup(false);
    };

    btnOk.addEventListener('click', onOk);
    btnCancel.addEventListener('click', onCancel);
    overlay.addEventListener('click', onBackdrop);
    btnOk.focus();
  });
}
