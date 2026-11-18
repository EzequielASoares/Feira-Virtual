/**
 * Painel do Entregador: entregas disponíveis, minhas entregas e perfil.
 */
import { apiFetch, extractApiError } from './api.js';
import { checkAuth } from './auth.js';
import {
  confirmDialog,
  escapeHtml,
  formatBRL,
  formatDateTime,
  getStatusBadge,
  setButtonLoading,
  showToast,
} from './utils.js';

let currentTab = 'disponiveis';

export function renderEntregadorDashboard(container, tabsEl) {
  const tabs = [
    { id: 'disponiveis', label: 'Entregas Disponíveis' },
    { id: 'minhas', label: 'Minhas Entregas' },
    { id: 'perfil', label: 'Meu Veículo & Área' },
  ];

  tabsEl.innerHTML = tabs
    .map(
      (t) =>
        `<button type="button" class="workspace-tab ${currentTab === t.id ? 'active' : ''}" data-tab="${t.id}" role="tab" aria-selected="${currentTab === t.id}">${t.label}</button>`
    )
    .join('');

  tabsEl.querySelectorAll('.workspace-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      renderEntregadorDashboard(container, tabsEl);
    });
  });

  if (currentTab === 'disponiveis') loadEntregas(container, 'disponiveis');
  else if (currentTab === 'minhas') loadEntregas(container, 'minhas');
  else loadEntregadorPerfil(container);
}

async function loadEntregas(container, escopo) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando entregas...</p></div>';
  try {
    const res = await apiFetch(`/entregas/?escopo=${escopo}`);
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar entregas.'));
    const data = await res.json();
    const entregas = data.results || data;

    if (!entregas.length) {
      container.innerHTML = `<div class="empty-state"><p>${escopo === 'disponiveis' ? 'Nenhuma entrega aguardando entregador no momento.' : 'Você ainda não assumiu nenhuma entrega.'}</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="orders-list">
        ${entregas
          .map((p) => {
            const actions = [];
            if (escopo === 'disponiveis') {
              actions.push(`<button type="button" class="btn btn--cta btn--sm btn-ent-acao" data-id="${p.id}" data-act="aceitar">Aceitar entrega</button>`);
            } else {
              if (['ACEITO', 'EM_PREPARO', 'PRONTO'].includes(p.status)) {
                actions.push(`<button type="button" class="btn btn--primary btn--sm btn-ent-acao" data-id="${p.id}" data-act="saiu-para-entrega" ${p.status !== 'PRONTO' ? 'title="O produtor precisa marcar como Pronto antes de sair"' : ''}>Saiu para entrega</button>`);
              }
              if (p.status === 'EM_ENTREGA') {
                actions.push(`<button type="button" class="btn btn--cta btn--sm btn-ent-acao" data-id="${p.id}" data-act="confirmar">Confirmar entrega concluída</button>`);
              }
            }
            return `
              <article class="order-card">
                <div class="order-card__head">
                  <div>
                    <strong>Pedido #${p.id} · ${escapeHtml(p.produtor_nome)}</strong>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">Cliente: ${escapeHtml(p.cliente_nome || p.cliente_username)} · ${formatDateTime(p.criado_em)}</div>
                  </div>
                  <div style="text-align: right;">
                    ${getStatusBadge(p.status)}
                    <div style="font-weight: 800; color: var(--color-primary); margin-top: 4px;">${formatBRL(p.total)} (${escapeHtml(p.forma_pagamento)})</div>
                  </div>
                </div>
                <p class="order-card__meta"><strong>Endereço de entrega:</strong> ${escapeHtml(p.endereco_entrega || 'Não informado')}</p>
                <div class="order-card__actions">${actions.join('')}</div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;

    container.querySelectorAll('.btn-ent-acao').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'confirmar') {
          const ok = await confirmDialog(`Confirmar que o pedido #${btn.dataset.id} foi entregue ao cliente?`, 'Confirmar entrega');
          if (!ok) return;
        }
        setButtonLoading(btn, true, 'Processando...');
        try {
          const r = await apiFetch(`/entregas/${btn.dataset.id}/${act}/`, { method: 'POST', body: JSON.stringify({}) });
          if (!r.ok) throw new Error(await extractApiError(r, 'Não foi possível executar ação na entrega.'));
          showToast('Entrega atualizada com sucesso!', 'success');
          if (act === 'aceitar') currentTab = 'minhas';
          renderEntregadorDashboard(container, document.getElementById('dashboardTabs'));
        } catch (err) {
          showToast(err.message, 'error');
          setButtonLoading(btn, false);
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadEntregadorPerfil(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando perfil...</p></div>';
  try {
    const res = await apiFetch('/perfil/entregador/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar perfil.'));
    const pe = await res.json();

    container.innerHTML = `
      <div class="panel-card" style="max-width: 520px;">
        <div class="panel-card__header"><h3 class="panel-card__title">Dados do Entregador</h3></div>
        <form id="perfilEntregadorForm">
          <div class="form-group"><label for="peVeiculo">Veículo</label><input id="peVeiculo" class="form-input" value="${escapeHtml(pe.veiculo || '')}" /></div>
          <div class="form-group"><label for="pePlaca">Placa</label><input id="pePlaca" class="form-input" maxlength="10" value="${escapeHtml(pe.placa || '')}" /></div>
          <div class="form-group"><label for="peArea">Área de atuação</label><input id="peArea" class="form-input" value="${escapeHtml(pe.area_atuacao || '')}" /></div>
          <button type="submit" class="btn btn--primary">Salvar perfil</button>
        </form>
      </div>
    `;

    document.getElementById('perfilEntregadorForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await apiFetch('/perfil/entregador/', {
        method: 'PATCH',
        body: JSON.stringify({
          veiculo: document.getElementById('peVeiculo').value.trim(),
          placa: document.getElementById('pePlaca').value.trim(),
          area_atuacao: document.getElementById('peArea').value.trim(),
        }),
      });
      if (r.ok) {
        await checkAuth();
        showToast('Perfil de entregador atualizado!', 'success');
      } else {
        showToast(await extractApiError(r, 'Erro ao atualizar perfil.'), 'error');
      }
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}
