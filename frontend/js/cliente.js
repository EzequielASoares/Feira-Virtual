/**
 * Painel do Cliente: pedidos, cancelamento, avaliações, reclamações, endereços e perfil.
 */
import { apiFetch, extractApiError } from './api.js';
import { checkAuth } from './auth.js';
import {
  confirmDialog,
  escapeHtml,
  formatBRL,
  formatDateTime,
  getStatusBadge,
  getUnitDisplay,
  openGenericModal,
  closeGenericModal,
  setButtonLoading,
  showToast,
  state,
} from './utils.js';

let currentTab = 'pedidos';

export function renderClienteDashboard(container, tabsEl) {
  const tabs = [
    { id: 'pedidos', label: 'Meus Pedidos' },
    { id: 'enderecos', label: 'Meus Endereços' },
    { id: 'reclamacoes', label: 'Reclamações' },
    { id: 'perfil', label: 'Meu Perfil' },
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
      renderClienteDashboard(container, tabsEl);
    });
  });

  if (currentTab === 'pedidos') loadClientePedidos(container);
  else if (currentTab === 'enderecos') loadClienteEnderecos(container);
  else if (currentTab === 'reclamacoes') loadClienteReclamacoes(container);
  else if (currentTab === 'perfil') renderClientePerfil(container);
}

async function loadClientePedidos(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando pedidos...</p></div>';
  try {
    const res = await apiFetch('/pedidos/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar pedidos.'));
    const data = await res.json();
    const pedidos = data.results || data;

    if (!pedidos.length) {
      container.innerHTML = '<div class="empty-state"><p><strong>Você ainda não realizou nenhum pedido.</strong></p><p>Adicione produtos do catálogo ao carrinho para começar.</p></div>';
      return;
    }

    container.innerHTML = `
      <div class="orders-list">
        ${pedidos
          .map((p) => {
            const podeCancelar = p.status === 'PENDENTE' || p.status === 'ACEITO';
            const podeAvaliar = p.status === 'CONCLUIDO';
            return `
              <article class="order-card">
                <div class="order-card__head">
                  <div>
                    <strong>Pedido #${p.id} · ${escapeHtml(p.produtor_nome)}</strong>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">${formatDateTime(p.criado_em)} · ${escapeHtml(p.modalidade)} · ${escapeHtml(p.forma_pagamento)}</div>
                  </div>
                  <div style="text-align: right;">
                    ${getStatusBadge(p.status)}
                    <div style="font-weight: 800; color: var(--color-primary); margin-top: 4px;">${formatBRL(p.total)}</div>
                  </div>
                </div>

                <div class="order-card__items">
                  ${p.itens
                    .map(
                      (it) =>
                        `<div class="order-card__item">
                          <span>${Number.parseFloat(it.quantidade)} ${escapeHtml(getUnitDisplay(it.unidade_medida))} × ${escapeHtml(it.nome_produto)}</span>
                          <span>${formatBRL(it.subtotal)}</span>
                        </div>`
                    )
                    .join('')}
                </div>

                ${p.endereco_entrega ? `<p class="order-card__meta"><strong>Entrega:</strong> ${escapeHtml(p.endereco_entrega)}</p>` : ''}
                ${p.observacao ? `<p class="order-card__meta"><strong>Obs:</strong> ${escapeHtml(p.observacao)}</p>` : ''}

                <div class="order-card__timeline">
                  ${(p.historico || []).map((h) => getStatusBadge(h.status)).join('')}
                </div>

                <div class="order-card__actions">
                  ${podeCancelar ? `<button type="button" class="btn btn--danger btn--sm btn-cancelar-pedido" data-id="${p.id}">Cancelar pedido</button>` : ''}
                  ${podeAvaliar ? `<button type="button" class="btn btn--outline btn--sm btn-avaliar-pedido" data-id="${p.id}">Avaliar produtos / produtor</button>` : ''}
                  <button type="button" class="btn btn--ghost btn--sm btn-abrir-reclamacao" data-id="${p.id}">Abrir reclamação</button>
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;

    container.querySelectorAll('.btn-cancelar-pedido').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog(`Deseja cancelar o pedido #${btn.dataset.id}?`, 'Cancelar pedido');
        if (!ok) return;
        setButtonLoading(btn, true, 'Cancelando...');
        try {
          const r = await apiFetch(`/pedidos/${btn.dataset.id}/cancelar/`, { method: 'POST', body: JSON.stringify({}) });
          if (!r.ok) throw new Error(await extractApiError(r, 'Não foi possível cancelar o pedido.'));
          showToast('Pedido cancelado e estoque estornado.', 'success');
          loadClientePedidos(container);
        } catch (err) {
          showToast(err.message, 'error');
          setButtonLoading(btn, false);
        }
      });
    });

    container.querySelectorAll('.btn-avaliar-pedido').forEach((btn) => {
      const pedido = pedidos.find((x) => x.id === Number(btn.dataset.id));
      btn.addEventListener('click', () => openAvaliarModal(pedido));
    });

    container.querySelectorAll('.btn-abrir-reclamacao').forEach((btn) => {
      btn.addEventListener('click', () => openReclamacaoModal(Number(btn.dataset.id), () => {
        currentTab = 'reclamacoes';
        renderClienteDashboard(container, document.getElementById('dashboardTabs'));
      }));
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function openAvaliarModal(pedido) {
  if (!pedido) return;
  const targets = [
    { key: `produtor:${pedido.produtor}`, label: `Produtor: ${pedido.produtor_nome}` },
    ...pedido.itens
      .filter((it) => it.produto)
      .map((it) => ({ key: `produto:${it.produto}`, label: `Produto: ${it.nome_produto}` })),
  ];

  openGenericModal(
    `Avaliar Pedido #${pedido.id}`,
    `
      <form id="avaliacaoForm">
        <div class="form-group">
          <label for="avTarget">O que deseja avaliar?</label>
          <select id="avTarget" class="form-select form-select--full">
            ${targets.map((t) => `<option value="${escapeHtml(t.key)}">${escapeHtml(t.label)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="avNota">Nota (1 a 5)</label>
          <select id="avNota" class="form-select form-select--full">
            <option value="5">5 — Excelente</option>
            <option value="4">4 — Muito bom</option>
            <option value="3">3 — Regular</option>
            <option value="2">2 — Ruim</option>
            <option value="1">1 — Muito ruim</option>
          </select>
        </div>
        <div class="form-group">
          <label for="avComentario">Comentário (opcional)</label>
          <textarea id="avComentario" rows="3" class="form-textarea" placeholder="Conte como foi a qualidade e o atendimento..."></textarea>
        </div>
        <div id="avError" class="auth-error" style="display: none;"></div>
        <button type="submit" class="btn btn--cta btn--full">Enviar avaliação</button>
      </form>
    `
  );

  document.getElementById('avaliacaoForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('avError');
    errBox.style.display = 'none';
    const [kind, idStr] = document.getElementById('avTarget').value.split(':');
    const payload = {
      nota: Number.parseInt(document.getElementById('avNota').value, 10),
      comentario: document.getElementById('avComentario').value.trim(),
      [kind]: Number.parseInt(idStr, 10),
    };

    try {
      const res = await apiFetch('/avaliacoes/', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await extractApiError(res, 'Não foi possível enviar a avaliação.'));
      closeGenericModal();
      showToast('Avaliação registrada com sucesso!', 'success');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    }
  });
}

function openReclamacaoModal(pedidoId, onSuccess) {
  openGenericModal(
    `Abrir Reclamação — Pedido #${pedidoId}`,
    `
      <form id="reclamacaoForm">
        <div class="form-group">
          <label for="recAssunto">Assunto</label>
          <input type="text" id="recAssunto" required maxlength="150" placeholder="Ex: Produto danificado ou atraso" class="form-input" />
        </div>
        <div class="form-group">
          <label for="recDescricao">Descrição detalhada</label>
          <textarea id="recDescricao" required rows="4" class="form-textarea" placeholder="Descreva o ocorrido..."></textarea>
        </div>
        <div id="recError" class="auth-error" style="display: none;"></div>
        <button type="submit" class="btn btn--cta btn--full">Enviar reclamação</button>
      </form>
    `
  );

  document.getElementById('reclamacaoForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('recError');
    errBox.style.display = 'none';
    try {
      const res = await apiFetch('/reclamacoes/', {
        method: 'POST',
        body: JSON.stringify({
          pedido: pedidoId,
          assunto: document.getElementById('recAssunto').value.trim(),
          descricao: document.getElementById('recDescricao').value.trim(),
        }),
      });
      if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao enviar reclamação.'));
      closeGenericModal();
      showToast('Reclamação registrada!', 'success');
      if (onSuccess) onSuccess();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    }
  });
}

async function loadClienteEnderecos(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando endereços...</p></div>';
  try {
    const res = await apiFetch('/enderecos/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar endereços.'));
    const enderecos = await res.json();

    container.innerHTML = `
      <div class="grid-2">
        <div class="panel-card">
          <div class="panel-card__header"><h3 class="panel-card__title">Novo Endereço</h3></div>
          <form id="novoEnderecoForm">
            <div class="form-row">
              <div class="form-group"><label for="endRotulo">Rótulo</label><input id="endRotulo" class="form-input" value="Casa" required /></div>
              <div class="form-group"><label for="endCep">CEP</label><input id="endCep" class="form-input" placeholder="59000-000" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label for="endLogradouro">Logradouro *</label><input id="endLogradouro" class="form-input" required /></div>
              <div class="form-group"><label for="endNumero">Número *</label><input id="endNumero" class="form-input" required /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label for="endBairro">Bairro *</label><input id="endBairro" class="form-input" required /></div>
              <div class="form-group"><label for="endComplemento">Complemento</label><input id="endComplemento" class="form-input" /></div>
            </div>
            <div class="form-row">
              <div class="form-group"><label for="endCidade">Cidade *</label><input id="endCidade" class="form-input" required /></div>
              <div class="form-group"><label for="endEstado">UF *</label><input id="endEstado" class="form-input" maxlength="2" required /></div>
            </div>
            <button type="submit" class="btn btn--primary btn--full">Salvar endereço</button>
          </form>
        </div>

        <div class="panel-card">
          <div class="panel-card__header"><h3 class="panel-card__title">Endereços Cadastrados</h3></div>
          ${
            !enderecos.length
              ? '<p style="color: var(--text-secondary);">Nenhum endereço cadastrado ainda.</p>'
              : enderecos
                  .map(
                    (e) => `
                      <div class="cart-item" style="margin-bottom: 10px;">
                        <div class="cart-item__info">
                          <div class="cart-item__name">${escapeHtml(e.rotulo)}</div>
                          <div class="cart-item__price">${escapeHtml(e.logradouro)}, ${escapeHtml(e.numero)} ${e.complemento ? `(${escapeHtml(e.complemento)})` : ''}</div>
                          <div class="cart-item__price">${escapeHtml(e.bairro)} — ${escapeHtml(e.cidade)}/${escapeHtml(e.estado)} ${escapeHtml(e.cep)}</div>
                        </div>
                        <button type="button" class="btn btn--danger btn--sm btn-del-end" data-id="${e.id}">Excluir</button>
                      </div>
                    `
                  )
                  .join('')
          }
        </div>
      </div>
    `;

    document.getElementById('novoEnderecoForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        rotulo: document.getElementById('endRotulo').value.trim(),
        cep: document.getElementById('endCep').value.trim(),
        logradouro: document.getElementById('endLogradouro').value.trim(),
        numero: document.getElementById('endNumero').value.trim(),
        bairro: document.getElementById('endBairro').value.trim(),
        complemento: document.getElementById('endComplemento').value.trim(),
        cidade: document.getElementById('endCidade').value.trim(),
        estado: document.getElementById('endEstado').value.trim().toUpperCase(),
      };
      const r = await apiFetch('/enderecos/', { method: 'POST', body: JSON.stringify(payload) });
      if (r.ok) {
        showToast('Endereço adicionado!', 'success');
        loadClienteEnderecos(container);
      } else {
        showToast(await extractApiError(r, 'Erro ao salvar endereço.'), 'error');
      }
    });

    container.querySelectorAll('.btn-del-end').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog('Remover este endereço?', 'Excluir endereço');
        if (!ok) return;
        const r = await apiFetch(`/enderecos/${btn.dataset.id}/`, { method: 'DELETE' });
        if (r.ok) {
          showToast('Endereço removido.', 'info');
          loadClienteEnderecos(container);
        } else {
          showToast(await extractApiError(r, 'Erro ao excluir endereço.'), 'error');
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadClienteReclamacoes(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando reclamações...</p></div>';
  try {
    const res = await apiFetch('/reclamacoes/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar reclamações.'));
    const data = await res.json();
    const list = data.results || data;

    if (!list.length) {
      container.innerHTML = '<div class="empty-state"><p>Nenhuma reclamação aberta.</p></div>';
      return;
    }

    container.innerHTML = `
      <div class="orders-list">
        ${list
          .map(
            (rec) => `
              <article class="panel-card">
                <div class="panel-card__header">
                  <div>
                    <strong>#${rec.id} — ${escapeHtml(rec.assunto)}</strong>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">Pedido #${rec.pedido} (${escapeHtml(rec.produtor_nome || '')}) · ${formatDateTime(rec.criado_em)}</div>
                  </div>
                  ${getStatusBadge(rec.status)}
                </div>
                <p style="color: var(--text-secondary); margin-bottom: 8px;">${escapeHtml(rec.descricao)}</p>
                ${
                  rec.resposta_admin
                    ? `<div class="auth-info" style="margin-bottom: 0;"><strong>Resposta da administração:</strong> ${escapeHtml(rec.resposta_admin)}</div>`
                    : ''
                }
              </article>
            `
          )
          .join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

export function renderClientePerfil(container) {
  const u = state.user || {};
  container.innerHTML = `
    <div class="panel-card" style="max-width: 560px;">
      <div class="panel-card__header"><h3 class="panel-card__title">Meus Dados Cadastrais</h3></div>
      <form id="perfilUsuarioForm">
        <div class="form-row">
          <div class="form-group"><label for="perfFirst">Nome</label><input id="perfFirst" class="form-input" value="${escapeHtml(u.first_name)}" /></div>
          <div class="form-group"><label for="perfLast">Sobrenome</label><input id="perfLast" class="form-input" value="${escapeHtml(u.last_name)}" /></div>
        </div>
        <div class="form-group"><label for="perfEmail">E-mail</label><input id="perfEmail" type="email" class="form-input" value="${escapeHtml(u.email)}" required /></div>
        <div class="form-group"><label for="perfTel">Telefone</label><input id="perfTel" class="form-input" value="${escapeHtml(u.telefone)}" /></div>
        <button type="submit" class="btn btn--primary">Salvar alterações</button>
      </form>
    </div>
  `;

  document.getElementById('perfilUsuarioForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await apiFetch('/perfil/', {
      method: 'PATCH',
      body: JSON.stringify({
        first_name: document.getElementById('perfFirst').value.trim(),
        last_name: document.getElementById('perfLast').value.trim(),
        email: document.getElementById('perfEmail').value.trim(),
        telefone: document.getElementById('perfTel').value.trim(),
      }),
    });
    if (res.ok) {
      await checkAuth();
      showToast('Perfil atualizado!', 'success');
    } else {
      showToast(await extractApiError(res, 'Erro ao atualizar perfil.'), 'error');
    }
  });
}
