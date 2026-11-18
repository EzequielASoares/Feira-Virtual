/**
 * Painel Administrativo: indicadores, produtores, produtos, categorias, usuários e reclamações.
 */
import { apiFetch, extractApiError } from './api.js';
import { loadCategories, loadProducers, loadProducts } from './catalogo.js';
import {
  confirmDialog,
  escapeHtml,
  formatBRL,
  formatDateTime,
  getStatusBadge,
  openGenericModal,
  closeGenericModal,
  showToast,
} from './utils.js';

let currentTab = 'indicadores';

export function renderAdminDashboard(container, tabsEl) {
  const tabs = [
    { id: 'indicadores', label: 'Indicadores' },
    { id: 'produtores', label: 'Produtores' },
    { id: 'produtos', label: 'Produtos' },
    { id: 'categorias', label: 'Categorias' },
    { id: 'usuarios', label: 'Usuários' },
    { id: 'reclamacoes', label: 'Reclamações' },
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
      renderAdminDashboard(container, tabsEl);
    });
  });

  if (currentTab === 'indicadores') loadIndicadores(container);
  else if (currentTab === 'produtores') loadAdminProdutores(container);
  else if (currentTab === 'produtos') loadAdminProdutos(container);
  else if (currentTab === 'categorias') loadAdminCategorias(container);
  else if (currentTab === 'usuarios') loadAdminUsuarios(container);
  else if (currentTab === 'reclamacoes') loadAdminReclamacoes(container);
}

async function loadIndicadores(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando indicadores...</p></div>';
  try {
    const res = await apiFetch('/admin/indicadores/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar indicadores.'));
    const kpi = await res.json();

    const totalUsuarios = Object.values(kpi.usuarios_por_tipo || {}).reduce((a, b) => a + b, 0);
    const totalPedidos = Object.values(kpi.pedidos_por_status || {}).reduce((a, b) => a + b, 0);

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-card__label">Faturamento Total</div>
          <div class="kpi-card__value">${formatBRL(kpi.faturamento_total)}</div>
          <div class="kpi-card__meta">${kpi.vendas_concluidas || 0} venda(s) concluída(s)</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__label">Produtos Ativos</div>
          <div class="kpi-card__value">${kpi.produtos_ativos || 0}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__label">Usuários Totais</div>
          <div class="kpi-card__value">${totalUsuarios}</div>
          <div class="kpi-card__meta">Clientes: ${kpi.usuarios_por_tipo?.CLIENTE || 0} · Produtores: ${kpi.usuarios_por_tipo?.PRODUTOR || 0}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__label">Reclamações Abertas</div>
          <div class="kpi-card__value">${kpi.reclamacoes_abertas || 0}</div>
          <div class="kpi-card__meta">Total de pedidos: ${totalPedidos}</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="panel-card">
          <div class="panel-card__header"><h3 class="panel-card__title">Produtores por Status</h3></div>
          <p>Pendentes: <strong>${kpi.produtores_por_status?.PENDENTE || 0}</strong></p>
          <p>Aprovados: <strong>${kpi.produtores_por_status?.APROVADO || 0}</strong></p>
          <p>Suspensos: <strong>${kpi.produtores_por_status?.SUSPENSO || 0}</strong></p>
        </div>
        <div class="panel-card">
          <div class="panel-card__header"><h3 class="panel-card__title">Pedidos por Status</h3></div>
          ${Object.entries(kpi.pedidos_por_status || {})
            .map(([st, count]) => `<div style="display:flex; justify-content:space-between; margin-bottom:4px;">${getStatusBadge(st)}<strong>${count}</strong></div>`)
            .join('') || '<p>Sem pedidos ainda.</p>'}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadAdminProdutores(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando produtores...</p></div>';
  try {
    const res = await apiFetch('/admin/produtores/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar produtores.'));
    const data = await res.json();
    const list = data.results || data;

    container.innerHTML = `
      <div class="panel-card">
        <div class="panel-card__header"><h3 class="panel-card__title">Moderação de Produtores</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Propriedade</th><th>Usuário</th><th>Cidade/UF</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>
              ${list
                .map(
                  (p) => `
                    <tr>
                      <td><strong>${escapeHtml(p.nome_propriedade)}</strong></td>
                      <td>${escapeHtml(p.username || '')}</td>
                      <td>${escapeHtml([p.cidade, p.estado].filter(Boolean).join('/') || '—')}</td>
                      <td>${getStatusBadge(p.status)}</td>
                      <td class="table-actions">
                        ${p.status !== 'APROVADO' ? `<button type="button" class="btn btn--primary btn--sm btn-adm-prod" data-id="${p.id}" data-act="aprovar">Aprovar</button>` : ''}
                        ${p.status !== 'SUSPENSO' ? `<button type="button" class="btn btn--danger btn--sm btn-adm-prod" data-id="${p.id}" data-act="suspender">Suspender</button>` : ''}
                      </td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelectorAll('.btn-adm-prod').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (btn.dataset.act === 'suspender') {
          const ok = await confirmDialog('Suspender este produtor ocultará seus produtos do catálogo público. Continuar?', 'Suspender produtor');
          if (!ok) return;
        }
        const r = await apiFetch(`/admin/produtores/${btn.dataset.id}/${btn.dataset.act}/`, { method: 'POST', body: JSON.stringify({}) });
        if (r.ok) {
          showToast('Status do produtor atualizado!', 'success');
          loadAdminProdutores(container);
          loadProducers();
          loadProducts();
        } else {
          showToast(await extractApiError(r, 'Erro na operação.'), 'error');
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadAdminProdutos(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando produtos...</p></div>';
  try {
    const res = await apiFetch('/admin/produtos/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar produtos.'));
    const data = await res.json();
    const list = data.results || data;

    container.innerHTML = `
      <div class="panel-card">
        <div class="panel-card__header"><h3 class="panel-card__title">Moderação de Produtos</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Produto</th><th>Produtor</th><th>Preço</th><th>Visibilidade</th><th>Ação</th></tr></thead>
            <tbody>
              ${list
                .map(
                  (p) => `
                    <tr>
                      <td><strong>${escapeHtml(p.nome)}</strong><div style="font-size:0.75rem;color:var(--text-secondary);">${escapeHtml(p.categoria_nome || '')}</div></td>
                      <td>${escapeHtml(p.produtor_nome || '')}</td>
                      <td>${formatBRL(p.preco)}</td>
                      <td>${p.ativo ? '<span class="badge badge--success">Visível</span>' : '<span class="badge badge--danger">Oculto</span>'}</td>
                      <td>
                        <button type="button" class="btn btn--outline btn--sm btn-adm-item" data-id="${p.id}" data-act="${p.ativo ? 'ocultar' : 'reexibir'}">
                          ${p.ativo ? 'Ocultar' : 'Reexibir'}
                        </button>
                      </td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelectorAll('.btn-adm-item').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const r = await apiFetch(`/admin/produtos/${btn.dataset.id}/${btn.dataset.act}/`, { method: 'POST', body: JSON.stringify({}) });
        if (r.ok) {
          showToast('Visibilidade do produto atualizada!', 'success');
          loadAdminProdutos(container);
          loadProducts();
        } else {
          showToast(await extractApiError(r, 'Erro na operação.'), 'error');
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadAdminCategorias(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando categorias...</p></div>';
  try {
    const res = await apiFetch('/categorias/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar categorias.'));
    const list = await res.json();

    container.innerHTML = `
      <div class="grid-2">
        <div class="panel-card">
          <div class="panel-card__header"><h3 class="panel-card__title">Nova Categoria</h3></div>
          <form id="novaCatForm">
            <div class="form-group"><label for="catNome">Nome *</label><input id="catNome" class="form-input" required /></div>
            <div class="form-group"><label for="catDesc">Descrição</label><input id="catDesc" class="form-input" /></div>
            <button type="submit" class="btn btn--primary">Criar categoria</button>
          </form>
        </div>
        <div class="panel-card">
          <div class="panel-card__header"><h3 class="panel-card__title">Categorias Cadastradas</h3></div>
          <div class="table-wrap">
            <table class="data-table">
              <thead><tr><th>Nome</th><th>Status</th><th>Ação</th></tr></thead>
              <tbody>
                ${list
                  .map(
                    (c) => `
                      <tr>
                        <td><strong>${escapeHtml(c.nome)}</strong></td>
                        <td>${c.ativa ? '<span class="badge badge--success">Ativa</span>' : '<span class="badge badge--danger">Inativa</span>'}</td>
                        <td><button type="button" class="btn btn--outline btn--sm btn-toggle-cat" data-id="${c.id}" data-ativa="${c.ativa}">${c.ativa ? 'Desativar' : 'Ativar'}</button></td>
                      </tr>
                    `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    document.getElementById('novaCatForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await apiFetch('/categorias/', {
        method: 'POST',
        body: JSON.stringify({
          nome: document.getElementById('catNome').value.trim(),
          descricao: document.getElementById('catDesc').value.trim(),
          ativa: true,
        }),
      });
      if (r.ok) {
        showToast('Categoria criada!', 'success');
        loadAdminCategorias(container);
        loadCategories();
      } else {
        showToast(await extractApiError(r, 'Erro ao criar categoria.'), 'error');
      }
    });

    container.querySelectorAll('.btn-toggle-cat').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ativa = btn.dataset.ativa === 'true';
        const r = await apiFetch(`/categorias/${btn.dataset.id}/`, {
          method: 'PATCH',
          body: JSON.stringify({ ativa: !ativa }),
        });
        if (r.ok) {
          showToast('Categoria atualizada!', 'success');
          loadAdminCategorias(container);
          loadCategories();
        } else {
          showToast(await extractApiError(r, 'Erro ao atualizar categoria.'), 'error');
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadAdminUsuarios(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando usuários...</p></div>';
  try {
    const res = await apiFetch('/admin/usuarios/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar usuários.'));
    const data = await res.json();
    const list = data.results || data;

    container.innerHTML = `
      <div class="panel-card">
        <div class="panel-card__header"><h3 class="panel-card__title">Usuários do Sistema</h3></div>
        <div class="table-wrap">
          <table class="data-table">
            <thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Ação</th></tr></thead>
            <tbody>
              ${list
                .map(
                  (u) => `
                    <tr>
                      <td><strong>${escapeHtml(u.username)}</strong></td>
                      <td>${escapeHtml(u.email)}</td>
                      <td><span class="badge badge--outline">${escapeHtml(u.tipo)}</span></td>
                      <td>${u.is_active ? '<span class="badge badge--success">Ativo</span>' : '<span class="badge badge--danger">Bloqueado</span>'}</td>
                      <td>
                        <button type="button" class="btn btn--outline btn--sm btn-adm-user" data-id="${u.id}" data-act="${u.is_active ? 'bloquear' : 'reativar'}">
                          ${u.is_active ? 'Bloquear' : 'Reativar'}
                        </button>
                      </td>
                    </tr>
                  `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    container.querySelectorAll('.btn-adm-user').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (btn.dataset.act === 'bloquear') {
          const ok = await confirmDialog('Bloquear a conta deste usuário?', 'Bloquear usuário');
          if (!ok) return;
        }
        const r = await apiFetch(`/admin/usuarios/${btn.dataset.id}/${btn.dataset.act}/`, { method: 'POST', body: JSON.stringify({}) });
        if (r.ok) {
          showToast('Conta atualizada!', 'success');
          loadAdminUsuarios(container);
        } else {
          showToast(await extractApiError(r, 'Erro ao atualizar usuário.'), 'error');
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadAdminReclamacoes(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando reclamações...</p></div>';
  try {
    const res = await apiFetch('/admin/reclamacoes/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar reclamações.'));
    const data = await res.json();
    const list = data.results || data;

    if (!list.length) {
      container.innerHTML = '<div class="empty-state"><p>Nenhuma reclamação registrada.</p></div>';
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
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">
                      Cliente: ${escapeHtml(rec.cliente_nome || rec.cliente_username)} · Pedido #${rec.pedido} (${escapeHtml(rec.produtor_nome || '')}) · ${formatDateTime(rec.criado_em)}
                    </div>
                  </div>
                  ${getStatusBadge(rec.status)}
                </div>
                <p style="color: var(--text-secondary); margin-bottom: 10px;">${escapeHtml(rec.descricao)}</p>
                ${rec.resposta_admin ? `<p class="auth-info"><strong>Resposta atual:</strong> ${escapeHtml(rec.resposta_admin)}</p>` : ''}
                <button type="button" class="btn btn--primary btn--sm btn-resp-rec" data-id="${rec.id}">Responder / Atualizar Status</button>
              </article>
            `
          )
          .join('')}
      </div>
    `;

    container.querySelectorAll('.btn-resp-rec').forEach((btn) => {
      const rec = list.find((r) => r.id === Number(btn.dataset.id));
      btn.addEventListener('click', () => openResponderReclamacaoModal(rec, () => loadAdminReclamacoes(container)));
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function openResponderReclamacaoModal(rec, onDone) {
  openGenericModal(
    `Responder Reclamação #${rec.id}`,
    `
      <form id="respRecForm">
        <div class="form-group">
          <label for="rrStatus">Status</label>
          <select id="rrStatus" class="form-select form-select--full">
            <option value="ABERTA" ${rec.status === 'ABERTA' ? 'selected' : ''}>Aberta</option>
            <option value="EM_ANALISE" ${rec.status === 'EM_ANALISE' ? 'selected' : ''}>Em análise</option>
            <option value="RESOLVIDA" ${rec.status === 'RESOLVIDA' ? 'selected' : ''}>Resolvida</option>
          </select>
        </div>
        <div class="form-group">
          <label for="rrResposta">Resposta ao cliente</label>
          <textarea id="rrResposta" rows="4" class="form-textarea">${escapeHtml(rec.resposta_admin || '')}</textarea>
        </div>
        <button type="submit" class="btn btn--cta btn--full">Salvar resposta</button>
      </form>
    `
  );

  document.getElementById('respRecForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const res = await apiFetch(`/admin/reclamacoes/${rec.id}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: document.getElementById('rrStatus').value,
        resposta_admin: document.getElementById('rrResposta').value.trim(),
      }),
    });
    if (res.ok) {
      closeGenericModal();
      showToast('Reclamação atualizada!', 'success');
      if (onDone) onDone();
    } else {
      showToast(await extractApiError(res, 'Erro ao responder reclamação.'), 'error');
    }
  });
}
