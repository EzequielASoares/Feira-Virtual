/**
 * Painel do Produtor: produtos (com upload de imagem), pedidos, vendas, avaliações e propriedade.
 */
import { apiFetch, extractApiError } from './api.js';
import { checkAuth } from './auth.js';
import { loadProducts } from './catalogo.js';
import {
  confirmDialog,
  escapeHtml,
  formatBRL,
  formatDateTime,
  getStatusBadge,
  getUnitDisplay,
  openGenericModal,
  closeGenericModal,
  safeUrl,
  setButtonLoading,
  showToast,
  state,
} from './utils.js';

let currentTab = 'pedidos';

export function renderProdutorDashboard(container, tabsEl) {
  const tabs = [
    { id: 'pedidos', label: 'Pedidos Recebidos' },
    { id: 'produtos', label: 'Meus Produtos' },
    { id: 'vendas', label: 'Vendas & Faturamento' },
    { id: 'avaliacoes', label: 'Avaliações' },
    { id: 'propriedade', label: 'Minha Propriedade' },
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
      renderProdutorDashboard(container, tabsEl);
    });
  });

  if (currentTab === 'pedidos') loadProdutorPedidos(container);
  else if (currentTab === 'produtos') loadProdutorProdutos(container);
  else if (currentTab === 'vendas') loadProdutorVendas(container);
  else if (currentTab === 'avaliacoes') loadProdutorAvaliacoes(container);
  else if (currentTab === 'propriedade') loadProdutorPropriedade(container);
}

async function loadProdutorPedidos(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando pedidos...</p></div>';
  try {
    const res = await apiFetch('/produtor/pedidos/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar pedidos.'));
    const data = await res.json();
    const pedidos = data.results || data;

    if (!pedidos.length) {
      container.innerHTML = '<div class="empty-state"><p>Nenhum pedido recebido ainda.</p></div>';
      return;
    }

    container.innerHTML = `
      <div class="orders-list">
        ${pedidos
          .map((p) => {
            const actions = [];
            if (p.status === 'PENDENTE') {
              actions.push(`<button type="button" class="btn btn--primary btn--sm btn-prod-acao" data-id="${p.id}" data-act="aceitar">Aceitar e baixar estoque</button>`);
              actions.push(`<button type="button" class="btn btn--danger btn--sm btn-prod-acao" data-id="${p.id}" data-act="recusar">Recusar</button>`);
            } else if (p.status === 'ACEITO') {
              actions.push(`<button type="button" class="btn btn--primary btn--sm btn-prod-status" data-id="${p.id}" data-status="EM_PREPARO">Iniciar preparo</button>`);
            } else if (p.status === 'EM_PREPARO') {
              actions.push(`<button type="button" class="btn btn--primary btn--sm btn-prod-status" data-id="${p.id}" data-status="PRONTO">Marcar como Pronto</button>`);
            } else if (p.status === 'PRONTO' && p.modalidade === 'RETIRADA') {
              actions.push(`<button type="button" class="btn btn--cta btn--sm btn-prod-status" data-id="${p.id}" data-status="CONCLUIDO">Confirmar retirada</button>`);
            }

            return `
              <article class="order-card">
                <div class="order-card__head">
                  <div>
                    <strong>Pedido #${p.id} · Cliente: ${escapeHtml(p.cliente_nome || p.cliente_username)}</strong>
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
                ${p.endereco_entrega ? `<p class="order-card__meta"><strong>Endereço:</strong> ${escapeHtml(p.endereco_entrega)}</p>` : ''}
                ${p.observacao ? `<p class="order-card__meta"><strong>Obs:</strong> ${escapeHtml(p.observacao)}</p>` : ''}
                <div class="order-card__actions">${actions.join('')}</div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;

    container.querySelectorAll('.btn-prod-acao').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'recusar') {
          const ok = await confirmDialog(`Recusar o pedido #${btn.dataset.id}?`, 'Recusar pedido');
          if (!ok) return;
        }
        setButtonLoading(btn, true, 'Atualizando...');
        try {
          const r = await apiFetch(`/produtor/pedidos/${btn.dataset.id}/${act}/`, { method: 'POST', body: JSON.stringify({}) });
          if (!r.ok) throw new Error(await extractApiError(r, 'Erro ao atualizar pedido.'));
          showToast(`Pedido #${btn.dataset.id} atualizado!`, 'success');
          loadProdutorPedidos(container);
          loadProducts();
        } catch (err) {
          showToast(err.message, 'error');
          setButtonLoading(btn, false);
        }
      });
    });

    container.querySelectorAll('.btn-prod-status').forEach((btn) => {
      btn.addEventListener('click', async () => {
        setButtonLoading(btn, true, 'Atualizando...');
        try {
          const r = await apiFetch(`/produtor/pedidos/${btn.dataset.id}/status/`, {
            method: 'POST',
            body: JSON.stringify({ status: btn.dataset.status }),
          });
          if (!r.ok) throw new Error(await extractApiError(r, 'Erro ao atualizar status.'));
          showToast(`Status atualizado para ${btn.dataset.status}!`, 'success');
          loadProdutorPedidos(container);
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

async function loadProdutorProdutos(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando seus produtos...</p></div>';
  try {
    const [prodRes, catRes] = await Promise.all([apiFetch('/produtor/produtos/'), apiFetch('/categorias/')]);
    if (!prodRes.ok) throw new Error(await extractApiError(prodRes, 'Erro ao carregar produtos.'));
    const data = await prodRes.json();
    const produtos = data.results || data;
    const categorias = catRes.ok ? await catRes.json() : state.categories;

    const statusPerfil = state.user?.perfil_produtor?.status;
    const aviso =
      statusPerfil !== 'APROVADO'
        ? `<div class="auth-info">Sua propriedade está com status <strong>${escapeHtml(statusPerfil)}</strong>. Seus produtos ficarão visíveis ao público assim que um administrador aprovar sua conta.</div>`
        : '';

    container.innerHTML = `
      ${aviso}
      <div class="panel-card">
        <div class="panel-card__header">
          <h3 class="panel-card__title">Catálogo da Propriedade</h3>
          <button type="button" class="btn btn--cta btn--sm" id="btnNovoProduto">+ Cadastrar Produto</button>
        </div>
        ${
          !produtos.length
            ? '<p style="color: var(--text-secondary);">Nenhum produto cadastrado ainda.</p>'
            : `
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th>Categoria</th>
                      <th>Preço</th>
                      <th>Estoque</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${produtos
                      .map(
                        (p) => `
                          <tr>
                            <td><strong>${escapeHtml(p.nome)}</strong></td>
                            <td>${escapeHtml(p.categoria_nome || p.categoria)}</td>
                            <td>${formatBRL(p.preco)} / ${escapeHtml(getUnitDisplay(p.unidade_medida))}</td>
                            <td>${Number.parseFloat(p.estoque)}</td>
                            <td>${p.ativo ? '<span class="badge badge--success">Ativo</span>' : '<span class="badge badge--danger">Oculto</span>'}</td>
                            <td class="table-actions">
                              <button type="button" class="btn btn--outline btn--sm btn-edit-prod" data-id="${p.id}">Editar</button>
                              <button type="button" class="btn btn--danger btn--sm btn-del-prod" data-id="${p.id}">Excluir</button>
                            </td>
                          </tr>
                        `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
        }
      </div>
    `;

    document.getElementById('btnNovoProduto')?.addEventListener('click', () =>
      openProdutoFormModal(null, categorias, () => {
        loadProdutorProdutos(container);
        loadProducts();
      })
    );

    container.querySelectorAll('.btn-edit-prod').forEach((btn) => {
      const prod = produtos.find((x) => x.id === Number(btn.dataset.id));
      btn.addEventListener('click', () =>
        openProdutoFormModal(prod, categorias, () => {
          loadProdutorProdutos(container);
          loadProducts();
        })
      );
    });

    container.querySelectorAll('.btn-del-prod').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ok = await confirmDialog('Deseja excluir permanentemente este produto?', 'Excluir produto');
        if (!ok) return;
        const r = await apiFetch(`/produtor/produtos/${btn.dataset.id}/`, { method: 'DELETE' });
        if (r.ok) {
          showToast('Produto excluído.', 'info');
          loadProdutorProdutos(container);
          loadProducts();
        } else {
          showToast(await extractApiError(r, 'Erro ao excluir produto.'), 'error');
        }
      });
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

function openProdutoFormModal(produto, categorias, onDone) {
  const isEdit = Boolean(produto);
  openGenericModal(
    isEdit ? `Editar ${produto.nome}` : 'Cadastrar Novo Produto',
    `
      <form id="produtoCrudForm">
        <div class="form-group">
          <label for="pfNome">Nome do produto *</label>
          <input id="pfNome" class="form-input" required value="${escapeHtml(produto?.nome || '')}" />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="pfCategoria">Categoria *</label>
            <select id="pfCategoria" class="form-select form-select--full" required>
              ${categorias
                .map(
                  (c) =>
                    `<option value="${c.id}" ${produto?.categoria === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`
                )
                .join('')}
            </select>
          </div>
          <div class="form-group">
            <label for="pfTipoProd">Tipo de cultivo</label>
            <select id="pfTipoProd" class="form-select form-select--full">
              <option value="ORGANICO_CERTIFICADO" ${produto?.tipo_producao === 'ORGANICO_CERTIFICADO' ? 'selected' : ''}>Orgânico Certificado</option>
              <option value="AGROECOLOGICO" ${produto?.tipo_producao === 'AGROECOLOGICO' ? 'selected' : ''}>Agroecológico</option>
              <option value="CONVENCIONAL" ${!produto || produto?.tipo_producao === 'CONVENCIONAL' ? 'selected' : ''}>Convencional</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="pfPreco">Preço (R$) *</label>
            <input id="pfPreco" type="number" step="0.01" min="0.01" class="form-input" required value="${escapeHtml(produto?.preco || '')}" />
          </div>
          <div class="form-group">
            <label for="pfUnidade">Unidade</label>
            <select id="pfUnidade" class="form-select form-select--full">
              ${['KG', 'G', 'L', 'ML', 'UNIDADE', 'CAIXA', 'SACO', 'MACO']
                .map((u) => `<option value="${u}" ${produto?.unidade_medida === u ? 'selected' : ''}>${u}</option>`)
                .join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="pfEstoque">Estoque disponível *</label>
            <input id="pfEstoque" type="number" step="0.001" min="0" class="form-input" required value="${escapeHtml(produto?.estoque ?? '0')}" />
          </div>
          <div class="form-group">
            <label for="pfImagem">Imagem do produto</label>
            <input id="pfImagem" type="file" accept="image/*" class="form-input" />
          </div>
        </div>
        <div class="form-group">
          <label for="pfDescricao">Descrição</label>
          <textarea id="pfDescricao" rows="3" class="form-textarea">${escapeHtml(produto?.descricao || '')}</textarea>
        </div>
        <div class="form-group">
          <label class="checkbox-label"><input type="checkbox" id="pfAtivo" ${produto?.ativo !== false ? 'checked' : ''} /> Produto ativo no catálogo</label>
        </div>
        <div id="pfError" class="auth-error" style="display: none;"></div>
        <button type="submit" class="btn btn--cta btn--full" id="btnSalvarProduto">${isEdit ? 'Salvar alterações' : 'Cadastrar produto'}</button>
      </form>
    `
  );

  document.getElementById('produtoCrudForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = document.getElementById('pfError');
    const submitBtn = document.getElementById('btnSalvarProduto');
    errBox.style.display = 'none';

    const fd = new FormData();
    fd.append('nome', document.getElementById('pfNome').value.trim());
    fd.append('categoria', document.getElementById('pfCategoria').value);
    fd.append('tipo_producao', document.getElementById('pfTipoProd').value);
    fd.append('preco', document.getElementById('pfPreco').value);
    fd.append('unidade_medida', document.getElementById('pfUnidade').value);
    fd.append('estoque', document.getElementById('pfEstoque').value);
    fd.append('descricao', document.getElementById('pfDescricao').value.trim());
    fd.append('ativo', document.getElementById('pfAtivo').checked ? 'true' : 'false');

    const fileInput = document.getElementById('pfImagem');
    if (fileInput.files && fileInput.files[0]) {
      fd.append('imagem', fileInput.files[0]);
    }

    setButtonLoading(submitBtn, true, 'Salvando...');
    try {
      const res = await apiFetch(isEdit ? `/produtor/produtos/${produto.id}/` : '/produtor/produtos/', {
        method: isEdit ? 'PATCH' : 'POST',
        body: fd,
      });
      if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao salvar produto.'));
      closeGenericModal();
      showToast(isEdit ? 'Produto atualizado!' : 'Produto cadastrado!', 'success');
      if (onDone) onDone();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
      setButtonLoading(submitBtn, false);
    }
  });
}

async function loadProdutorVendas(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando vendas...</p></div>';
  try {
    const res = await apiFetch('/produtor/pedidos/vendas/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar vendas.'));
    const data = await res.json();

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-card__label">Vendas Concluídas</div>
          <div class="kpi-card__value">${data.quantidade_vendas || 0}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-card__label">Faturamento Total</div>
          <div class="kpi-card__value">${formatBRL(data.faturamento)}</div>
        </div>
      </div>
      <div class="panel-card">
        <div class="panel-card__header"><h3 class="panel-card__title">Pedidos Concluídos</h3></div>
        ${
          !(data.pedidos || []).length
            ? '<p style="color: var(--text-secondary);">Nenhuma venda concluída ainda.</p>'
            : `
              <div class="table-wrap">
                <table class="data-table">
                  <thead><tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Pagamento</th><th>Total</th></tr></thead>
                  <tbody>
                    ${data.pedidos
                      .map(
                        (p) => `
                          <tr>
                            <td>#${p.id}</td>
                            <td>${escapeHtml(p.cliente_nome || p.cliente_username)}</td>
                            <td>${formatDateTime(p.criado_em)}</td>
                            <td>${escapeHtml(p.forma_pagamento)}</td>
                            <td><strong>${formatBRL(p.total)}</strong></td>
                          </tr>
                        `
                      )
                      .join('')}
                  </tbody>
                </table>
              </div>
            `
        }
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadProdutorAvaliacoes(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando avaliações...</p></div>';
  try {
    const res = await apiFetch('/produtor/avaliacoes/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar avaliações.'));
    const data = await res.json();
    const list = data.results || data;

    if (!list.length) {
      container.innerHTML = '<div class="empty-state"><p>Você ainda não recebeu avaliações.</p></div>';
      return;
    }

    container.innerHTML = `
      <div class="orders-list">
        ${list
          .map(
            (av) => `
              <article class="panel-card">
                <div class="panel-card__header">
                  <strong>${escapeHtml(av.produto_nome ? `Produto: ${av.produto_nome}` : 'Avaliação da Propriedade')}</strong>
                  <span class="badge badge--success">★ ${av.nota}/5</span>
                </div>
                <p style="color: var(--text-secondary);">${escapeHtml(av.comentario || 'Sem comentário escrito.')}</p>
                <p style="font-size: 0.78rem; color: var(--text-disabled); margin-top: 6px;">Por ${escapeHtml(av.cliente_nome)} em ${formatDateTime(av.criado_em)}</p>
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

async function loadProdutorPropriedade(container) {
  container.innerHTML = '<div class="catalog-loading"><div class="spinner"></div><p>Carregando dados da propriedade...</p></div>';
  try {
    const res = await apiFetch('/perfil/produtor/');
    if (!res.ok) throw new Error(await extractApiError(res, 'Erro ao carregar perfil do produtor.'));
    const p = await res.json();
    const fotoUrl = safeUrl(p.foto_propriedade);

    container.innerHTML = `
      <div class="panel-card" style="max-width: 640px;">
        <div class="panel-card__header">
          <h3 class="panel-card__title">Dados da Propriedade e Recebimento</h3>
          ${getStatusBadge(p.status)}
        </div>
        ${fotoUrl ? `<img src="${fotoUrl}" alt="${escapeHtml(p.nome_propriedade)}" style="width: 100%; max-height: 200px; object-fit: cover; border-radius: var(--radius-md); margin-bottom: var(--space-4);" />` : ''}
        <form id="perfilProdutorForm">
          <div class="form-group"><label for="ppNome">Nome da propriedade</label><input id="ppNome" class="form-input" required value="${escapeHtml(p.nome_propriedade)}" /></div>
          <div class="form-group"><label for="ppDesc">Descrição</label><textarea id="ppDesc" rows="3" class="form-textarea">${escapeHtml(p.descricao || '')}</textarea></div>
          <div class="form-group"><label for="ppEnd">Endereço da propriedade</label><input id="ppEnd" class="form-input" value="${escapeHtml(p.endereco_propriedade || '')}" /></div>
          <div class="form-row">
            <div class="form-group"><label for="ppCid">Cidade</label><input id="ppCid" class="form-input" value="${escapeHtml(p.cidade || '')}" /></div>
            <div class="form-group"><label for="ppEst">UF</label><input id="ppEst" class="form-input" maxlength="2" value="${escapeHtml(p.estado || '')}" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label for="ppPix">Chave Pix</label><input id="ppPix" class="form-input" value="${escapeHtml(p.chave_pix || '')}" /></div>
            <div class="form-group"><label for="ppFoto">Atualizar foto</label><input id="ppFoto" type="file" accept="image/*" class="form-input" /></div>
          </div>
          <div class="checkbox-row" style="margin-bottom: var(--space-4);">
            <label class="checkbox-label"><input type="checkbox" id="ppMaq" ${p.possui_maquininha ? 'checked' : ''} /> Possui maquininha de cartão</label>
            <label class="checkbox-label"><input type="checkbox" id="ppDin" ${p.aceita_dinheiro ? 'checked' : ''} /> Aceita dinheiro</label>
          </div>
          <button type="submit" class="btn btn--primary">Salvar dados da propriedade</button>
        </form>
      </div>
    `;

    document.getElementById('perfilProdutorForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData();
      fd.append('nome_propriedade', document.getElementById('ppNome').value.trim());
      fd.append('descricao', document.getElementById('ppDesc').value.trim());
      fd.append('endereco_propriedade', document.getElementById('ppEnd').value.trim());
      fd.append('cidade', document.getElementById('ppCid').value.trim());
      fd.append('estado', document.getElementById('ppEst').value.trim().toUpperCase());
      fd.append('chave_pix', document.getElementById('ppPix').value.trim());
      fd.append('possui_maquininha', document.getElementById('ppMaq').checked ? 'true' : 'false');
      fd.append('aceita_dinheiro', document.getElementById('ppDin').checked ? 'true' : 'false');
      const file = document.getElementById('ppFoto').files?.[0];
      if (file) fd.append('foto_propriedade', file);

      const r = await apiFetch('/perfil/produtor/', { method: 'PATCH', body: fd });
      if (r.ok) {
        await checkAuth();
        showToast('Dados da propriedade atualizados!', 'success');
        loadProdutorPropriedade(container);
      } else {
        showToast(await extractApiError(r, 'Erro ao atualizar propriedade.'), 'error');
      }
    });
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>${escapeHtml(err.message)}</p></div>`;
  }
}
