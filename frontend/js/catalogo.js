/**
 * Catálogo público de produtos, paginação, produtores parceiros e avaliações.
 */
import { apiFetch, extractApiError } from './api.js';
import { addToCart } from './carrinho.js';
import {
  escapeHtml,
  formatBRL,
  formatDateTime,
  getUnitDisplay,
  openGenericModal,
  safeUrl,
  state,
} from './utils.js';

let loadedProductsCache = [];

export async function loadCategories() {
  try {
    const res = await apiFetch('/categorias/');
    if (res.ok) {
      state.categories = await res.json();
      renderCategoryPills();
    }
  } catch (err) {
    console.error('Erro ao carregar categorias:', err);
  }
}

export function renderCategoryPills() {
  const container = document.getElementById('categoryPills');
  if (!container) return;

  let html = `
    <button type="button" class="pill ${state.selectedCategory === '' ? 'active' : ''}" data-category="" role="tab" aria-selected="${state.selectedCategory === ''}">
      Todas as categorias
    </button>
  `;

  state.categories.forEach((cat) => {
    const isSelected = state.selectedCategory === String(cat.id);
    html += `
      <button type="button" class="pill ${isSelected ? 'active' : ''}" data-category="${cat.id}" role="tab" aria-selected="${isSelected}">
        ${escapeHtml(cat.nome)}
      </button>
    `;
  });

  container.innerHTML = html;

  container.querySelectorAll('.pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedCategory = btn.dataset.category || '';
      state.currentPage = 1;
      renderCategoryPills();
      loadProducts();
    });
  });
}

export function renderActiveProducerFilter() {
  const bar = document.getElementById('activeProducerFilter');
  if (!bar) return;
  if (!state.selectedProducerId) {
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }
  bar.style.display = 'flex';
  bar.innerHTML = `
    <span>Filtrando por produtor: <strong>${escapeHtml(state.selectedProducerName)}</strong></span>
    <button type="button" class="btn-link" id="btnClearProducerFilter">Limpar filtro</button>
  `;
  document.getElementById('btnClearProducerFilter')?.addEventListener('click', () => {
    state.selectedProducerId = '';
    state.selectedProducerName = '';
    state.currentPage = 1;
    renderActiveProducerFilter();
    loadProducts();
  });
}

export async function loadProducts(page = state.currentPage) {
  state.currentPage = page;
  const grid = document.getElementById('productsGrid');
  const paginationBar = document.getElementById('catalogPagination');
  if (!grid) return;

  grid.innerHTML = `
    <div class="catalog-loading">
      <div class="spinner"></div>
      <p>Carregando produtos da feira...</p>
    </div>
  `;

  const params = new URLSearchParams();
  if (state.searchQuery) params.append('search', state.searchQuery);
  if (state.selectedCategory) params.append('categoria', state.selectedCategory);
  if (state.selectedProducerId) params.append('produtor', state.selectedProducerId);
  if (state.tipoProducao) params.append('tipo_producao', state.tipoProducao);
  if (state.ordering) params.append('ordering', state.ordering);
  if (page > 1) params.append('page', String(page));

  try {
    const res = await apiFetch(`/produtos/?${params.toString()}`);
    if (!res.ok) {
      throw new Error(await extractApiError(res, 'Erro ao buscar produtos.'));
    }

    const data = await res.json();
    const products = Array.isArray(data) ? data : data.results || [];
    loadedProductsCache = products;

    renderProducts(products);
    updateHeroFeaturedCard(products[0]);

    if (!Array.isArray(data) && (data.next || data.previous)) {
      const totalPages = Math.max(1, Math.ceil((data.count || products.length) / 20));
      paginationBar.style.display = 'flex';
      paginationBar.innerHTML = `
        <button type="button" class="btn btn--outline btn--sm" id="btnPrevPage" ${data.previous ? '' : 'disabled'}>← Anterior</button>
        <span>Página ${page} de ${totalPages} (${data.count} produtos)</span>
        <button type="button" class="btn btn--outline btn--sm" id="btnNextPage" ${data.next ? '' : 'disabled'}>Próxima →</button>
      `;
      document.getElementById('btnPrevPage')?.addEventListener('click', () => loadProducts(page - 1));
      document.getElementById('btnNextPage')?.addEventListener('click', () => loadProducts(page + 1));
    } else if (paginationBar) {
      paginationBar.style.display = 'none';
      paginationBar.innerHTML = '';
    }
  } catch (err) {
    if (paginationBar) paginationBar.style.display = 'none';
    grid.innerHTML = `
      <div class="catalog-empty">
        <p><strong>Não foi possível carregar os produtos.</strong></p>
        <p style="font-size: 0.875rem; margin-top: 6px;">${escapeHtml(err.message)}</p>
        <button type="button" class="btn btn--outline btn--sm" id="btnRetryProducts" style="margin-top: 12px;">Tentar novamente</button>
      </div>
    `;
    document.getElementById('btnRetryProducts')?.addEventListener('click', () => loadProducts(page));
  }
}

function updateHeroFeaturedCard(product) {
  if (!product) return;
  const imgWrap = document.querySelector('#heroFeaturedCard .product-card-hero__img');
  const badgeEl = document.getElementById('heroCardBadge');
  const catEl = document.getElementById('heroCardCategory');
  const nameEl = document.getElementById('heroCardName');
  const prodEl = document.getElementById('heroCardProducer');
  const priceEl = document.getElementById('heroCardPrice');
  const unitEl = document.getElementById('heroCardUnit');

  if (product.imagem && imgWrap) {
    const url = safeUrl(product.imagem);
    if (url) {
      imgWrap.innerHTML = `<img src="${url}" alt="${escapeHtml(product.nome)}" class="hero-prod-photo" />`;
    }
  }
  if (badgeEl) {
    badgeEl.textContent = product.nota_media ? `★ ${Number(product.nota_media).toFixed(1)}` : 'Disponível';
  }
  if (catEl) catEl.textContent = product.categoria_nome || 'Feira Virtual';
  if (nameEl) nameEl.textContent = product.nome;
  if (prodEl) {
    const loc = [product.produtor_cidade, product.produtor_estado].filter(Boolean).join('/');
    prodEl.textContent = loc ? `${product.produtor_nome} (${loc})` : product.produtor_nome;
  }
  if (priceEl) priceEl.textContent = formatBRL(product.preco);
  if (unitEl) unitEl.textContent = `/ ${getUnitDisplay(product.unidade_medida)}`;
}

function getProductEmoji(nome) {
  const n = (nome || '').toLowerCase();
  if (n.includes('alface') || n.includes('rúcula') || n.includes('folha') || n.includes('couve')) return '🥬';
  if (n.includes('tomate')) return '🍅';
  if (n.includes('cenoura')) return '🥕';
  if (n.includes('banana')) return '🍌';
  if (n.includes('mel')) return '🍯';
  if (n.includes('queijo') || n.includes('leite')) return '🧀';
  if (n.includes('laranja') || n.includes('limão')) return '🍊';
  return '🌱';
}

function getTipoBadge(tipo) {
  if (tipo === 'ORGANICO_CERTIFICADO') return '<span class="badge badge--organico">Orgânico</span>';
  if (tipo === 'AGROECOLOGICO') return '<span class="badge badge--agroecologico">Agroecológico</span>';
  return '<span class="badge badge--convencional">Convencional</span>';
}

function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  if (!products || products.length === 0) {
    grid.innerHTML = `
      <div class="catalog-empty">
        <span style="font-size: 2.5rem;" aria-hidden="true">🌱</span>
        <p style="font-weight: 700; margin-top: 8px;">Nenhum produto encontrado com esses filtros.</p>
        <p style="font-size: 0.875rem; margin-top: 4px;">Experimente limpar a busca ou escolher outra categoria.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = products
    .map((p) => {
      const preco = formatBRL(p.preco);
      const unit = escapeHtml(getUnitDisplay(p.unidade_medida));
      const emoji = getProductEmoji(p.nome);
      const imgUrl = safeUrl(p.imagem);
      const estoque = Number.parseFloat(p.estoque || 0);
      const semEstoque = estoque <= 0;
      const rating = p.nota_media ? `★ ${Number(p.nota_media).toFixed(1)} (${p.total_avaliacoes || 0})` : 'Sem avaliações';

      return `
        <article class="product-card" data-id="${p.id}">
          <div class="product-card__thumb" data-action="detail" data-id="${p.id}" tabindex="0" role="button" aria-label="Ver detalhes de ${escapeHtml(p.nome)}">
            ${imgUrl ? `<img src="${imgUrl}" alt="${escapeHtml(p.nome)}" loading="lazy" />` : `<span aria-hidden="true">${emoji}</span>`}
            <div class="product-card__badges">${getTipoBadge(p.tipo_producao)}</div>
            <span class="product-card__stock-tag">${semEstoque ? 'Esgotado' : `Disp: ${estoque} ${unit}`}</span>
          </div>

          <div class="product-card__meta-row">
            <span class="product-card__category">${escapeHtml(p.categoria_nome || 'Geral')}</span>
            <span class="product-card__rating">${escapeHtml(rating)}</span>
          </div>

          <h3 class="product-card__title" data-action="detail" data-id="${p.id}">${escapeHtml(p.nome)}</h3>
          <p class="product-card__producer">${escapeHtml(p.produtor_nome || 'Produtor Rural')}</p>
          <p class="product-card__desc">${escapeHtml(p.descricao || 'Produto fresco colhido diretamente na propriedade familiar.')}</p>

          <div class="product-card__action-row">
            <div class="product-card__price-wrap">
              <span class="product-card__price">${preco}</span>
              <span class="product-card__unit">/ ${unit}</span>
            </div>
            <div class="product-card__buttons">
              <button type="button" class="btn btn--ghost btn--sm btn-product-detail" data-id="${p.id}">Detalhes</button>
              <button type="button" class="btn btn--cta btn--sm btn-add-cart" data-id="${p.id}" data-name="${escapeHtml(p.nome)}" ${semEstoque ? 'disabled' : ''}>
                ${semEstoque ? 'Esgotado' : 'Adicionar'}
              </button>
            </div>
          </div>
        </article>
      `;
    })
    .join('');

  grid.querySelectorAll('.btn-add-cart').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToCart(btn.dataset.id, btn.dataset.name);
    });
  });

  grid.querySelectorAll('[data-action="detail"], .btn-product-detail').forEach((el) => {
    el.addEventListener('click', () => openProductDetailModal(Number(el.dataset.id)));
  });
}

async function openProductDetailModal(productId) {
  const product = loadedProductsCache.find((p) => p.id === productId);
  if (!product) return;

  const imgUrl = safeUrl(product.imagem);
  const unit = escapeHtml(getUnitDisplay(product.unidade_medida));
  const pagamentos = [
    product.produtor_aceita_pix ? '⚡ Pix' : null,
    product.produtor_possui_maquininha ? '💳 Cartão' : null,
    product.produtor_aceita_dinheiro ? '💵 Dinheiro' : null,
  ]
    .filter(Boolean)
    .map((label) => `<span class="payment-badge">${label}</span>`)
    .join('');

  openGenericModal(
    product.nome,
    `
      <div style="display: grid; gap: var(--space-4);">
        ${
          imgUrl
            ? `<img src="${imgUrl}" alt="${escapeHtml(product.nome)}" style="width: 100%; max-height: 240px; object-fit: cover; border-radius: var(--radius-md);" />`
            : ''
        }
        <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
          ${getTipoBadge(product.tipo_producao)}
          <span class="badge badge--outline">${escapeHtml(product.categoria_nome || '')}</span>
          <span class="badge badge--outline">Estoque: ${Number.parseFloat(product.estoque)} ${unit}</span>
        </div>
        <p style="color: var(--text-secondary);">${escapeHtml(product.descricao || 'Sem descrição adicional.')}</p>
        <div class="panel-card" style="margin-bottom: 0;">
          <strong>Produtor:</strong> ${escapeHtml(product.produtor_nome)}
          ${product.produtor_cidade ? ` — ${escapeHtml(product.produtor_cidade)}/${escapeHtml(product.produtor_estado)}` : ''}
          <div class="producer-card__badges" style="margin-top: 8px;">${pagamentos}</div>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <strong style="font-size: 1.5rem; color: var(--color-primary);">${formatBRL(product.preco)}</strong>
            <span style="color: var(--text-secondary);">/ ${unit}</span>
          </div>
          <button type="button" class="btn btn--cta" id="btnModalAddCart" ${Number.parseFloat(product.estoque) <= 0 ? 'disabled' : ''}>
            Adicionar ao carrinho
          </button>
        </div>
        <div>
          <h4 style="margin-bottom: 8px;">Avaliações dos clientes</h4>
          <div id="productReviewsBox"><p style="color: var(--text-secondary); font-size: 0.875rem;">Carregando avaliações...</p></div>
        </div>
      </div>
    `
  );

  document.getElementById('btnModalAddCart')?.addEventListener('click', () => {
    addToCart(product.id, product.nome);
  });

  try {
    const res = await apiFetch(`/avaliacoes/?produto=${productId}`);
    const box = document.getElementById('productReviewsBox');
    if (!box) return;
    if (!res.ok) {
      box.innerHTML = '<p style="font-size: 0.875rem;">Não foi possível carregar avaliações.</p>';
      return;
    }
    const data = await res.json();
    const items = data.results || data;
    if (!items.length) {
      box.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.875rem;">Este produto ainda não recebeu avaliações.</p>';
      return;
    }
    box.innerHTML = items
      .map(
        (av) => `
          <div style="padding: 8px 0; border-bottom: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; font-size: 0.8125rem;">
              <strong>${escapeHtml(av.cliente_nome || 'Cliente')} · ★ ${av.nota}/5</strong>
              <span style="color: var(--text-disabled);">${formatDateTime(av.criado_em)}</span>
            </div>
            ${av.comentario ? `<p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 2px;">${escapeHtml(av.comentario)}</p>` : ''}
          </div>
        `
      )
      .join('');
  } catch {
    const box = document.getElementById('productReviewsBox');
    if (box) box.innerHTML = '<p style="font-size: 0.875rem;">Erro ao carregar avaliações.</p>';
  }
}

export async function loadProducers() {
  const grid = document.getElementById('producersGrid');
  if (!grid) return;

  try {
    const res = await apiFetch('/produtores/');
    if (!res.ok) {
      throw new Error(await extractApiError(res, 'Erro ao carregar produtores.'));
    }
    const data = await res.json();
    const producers = data.results || data;

    if (!producers.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <p><strong>Nenhum produtor aprovado cadastrado no momento.</strong></p>
        </div>
      `;
      return;
    }

    grid.innerHTML = producers
      .map((p) => {
        const imgUrl = safeUrl(p.foto_propriedade);
        const loc = [p.cidade, p.estado].filter(Boolean).join('/');
        const rating = p.nota_media ? `★ ${Number(p.nota_media).toFixed(1)} (${p.total_avaliacoes})` : 'Novo parceiro';
        return `
          <article class="producer-card">
            <div class="producer-card__top">
              <div class="producer-card__avatar">
                ${imgUrl ? `<img src="${imgUrl}" alt="${escapeHtml(p.nome_propriedade)}" loading="lazy" />` : '<span aria-hidden="true">🏡</span>'}
              </div>
              <div style="flex: 1;">
                <div class="producer-card__header">
                  <h3>${escapeHtml(p.nome_propriedade)}</h3>
                  <span class="badge badge--success">Aprovado</span>
                </div>
                <p class="producer-card__location">${loc ? escapeHtml(loc) : 'Agricultura familiar'} · ${escapeHtml(rating)}</p>
              </div>
            </div>
            <p class="producer-card__desc">${escapeHtml(p.descricao || 'Produção familiar sustentável com entrega e retirada local.')}</p>
            <div class="producer-card__badges">
              ${p.aceita_pix ? '<span class="payment-badge">⚡ Aceita Pix</span>' : ''}
              ${p.possui_maquininha ? '<span class="payment-badge">💳 Maquininha</span>' : ''}
              ${p.aceita_dinheiro ? '<span class="payment-badge">💵 Dinheiro</span>' : ''}
            </div>
            <div class="producer-card__footer">
              <span>${p.produtos_ativos || 0} produto(s) ativo(s)</span>
              <button type="button" class="btn btn--outline btn--sm btn-filter-producer" data-id="${p.id}" data-name="${escapeHtml(p.nome_propriedade)}">
                Ver produtos
              </button>
            </div>
          </article>
        `;
      })
      .join('');

    grid.querySelectorAll('.btn-filter-producer').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedProducerId = btn.dataset.id;
        state.selectedProducerName = btn.dataset.name;
        state.currentPage = 1;
        renderActiveProducerFilter();
        loadProducts(1);
        document.getElementById('produtos')?.scrollIntoView({ behavior: 'smooth' });
      });
    });
  } catch (err) {
    grid.innerHTML = `
      <div class="empty-state">
        <p>${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}
