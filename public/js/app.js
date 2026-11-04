/* ARAUJO IMPORTS — Vanilla JavaScript ES module. Não contém regras comerciais sensíveis. */
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatMoney = cents => formatter.format(cents / 100);
// A variação pode substituir o preço base; exibimos preços apenas para visualização.
const variantPrice = (product, variant) => variant?.priceCents ?? product.priceCents;
const minimumPrice = product => Math.min(...product.variants.map(v => variantPrice(product, v)));

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const CART_KEY = 'araujo:bag:v2';
const filters = { categories: new Set(), size: null, maxPrice: 600, colors: new Set(), search: '', sort: 'featured' };
const state = { catalog: null, product: null, variantIndex: 0, animateToken: 0, routeToken: 0, cart: loadCart(), toastTimer: 0, checkoutKey: null, quote: null, shipping: null, shippingCep: '' };

function loadCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(x => x && typeof x.productId === 'string' && typeof x.variantId === 'string' && typeof x.size === 'string' && Number.isInteger(x.quantity) && x.quantity > 0 && x.quantity <= 10).slice(0, 30);
  } catch { return []; }
}
function saveCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch { /* private mode */ }
  updateBadge();
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function toast(message) {
  const t = $('#toast'); t.textContent = message; t.classList.add('visible');
  clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => t.classList.remove('visible'), 3000);
}
function notifyApiError(error) {
  const messages = {
    DADOS_INVALIDOS: 'Confira as opções selecionadas.',
    ITEM_INVALIDO: 'Este produto ou variação não está disponível.',
    ESTOQUE_INDISPONIVEL: 'Um dos itens não está disponível neste momento.',
    PEDIDOS_INDISPONIVEIS: 'Pré-pedidos temporariamente indisponíveis. Configure o banco de dados.',
    MUITAS_REQUISICOES: 'Muitas solicitações. Tente novamente mais tarde.',
    ERRO_INTERNO: 'Não foi possível processar a solicitação.',
    CEP_INVALIDO: 'Informe um CEP válido com 8 dígitos.',
    FRETE_NAO_CONFIGURADO: 'Frete real ainda não configurado na loja.',
    FRETE_INDISPONIVEL: 'Frete indisponível. Confira o CEP ou tente mais tarde.',
    CHAVE_IDEMPOTENCIA_REUTILIZADA: 'Solicitação modificada. Abra novamente a finalização.'
  };
  return messages[error] || 'Ocorreu um erro. Tente novamente.';
}
async function requestJSON(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP_${response.status}`);
  return body;
}
function productOf(id) { return state.catalog?.products.find(p => p.id === id); }
function itemOf(entry) {
  const product = productOf(entry.productId);
  const variant = product?.variants.find(v => v.id === entry.variantId);
  if (!product || !variant || !product.sizes.includes(entry.size)) return null;
  return { ...entry, product, variant };
}
function relevantCart() { return state.cart.map(itemOf).filter(Boolean); }

async function bootstrap() {
  bindEvents();
  try {
    state.catalog = await requestJSON('/api/catalog');
    $('#announcement').textContent = state.catalog.announcement;
    state.cart = relevantCart().map(({ productId, variantId, size, quantity }) => ({ productId, variantId, size, quantity }));
    saveCart();
    buildFilters();
    renderRoute();
  } catch (error) {
    $('#productGrid').replaceChildren(el('p', 'no-results', 'A coleção está indisponível. Atualize a página para tentar novamente.'));
    console.warn('Não foi possível carregar o catálogo.');
  }
}

function bindEvents() {
  window.addEventListener('popstate', renderRoute);
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-link],a[data-category]');
    if (!link) return;
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    if (link.dataset.category) {
      filters.categories = new Set([link.dataset.category]);
      filters.search = ''; $('#globalSearch').value = '';
      $('#searchPanel').hidden = true;
    } else {
      filters.categories.clear();
    }
    navigate(link.getAttribute('href'));
    closeMobile();
  });
  $('#cartToggle').addEventListener('click', openCart);
  $('#shippingCep').addEventListener('input', e => { const d = e.target.value.replace(/\D/g,'').slice(0,8); e.target.value = d.length > 5 ? d.slice(0,5)+'-'+d.slice(5) : d; clearShipping(); });
  $('#shippingCalculate').addEventListener('click', calculateShipping);
  $('#shippingOptions').addEventListener('change', e => {
    if (e.target.name === 'shippingService' && state.shipping) { state.shipping.selected = e.target.value; renderShipping(); }
  });
  $('#closeCart').addEventListener('click', closeCart);
  $('#overlay').addEventListener('click', closeAll);
  $('#closeCheckout').addEventListener('click', closeCheckout);
  $('#openCheckout').addEventListener('click', openCheckout);
  $('#checkoutForm').addEventListener('submit', submitOrder);
  $('#menuToggle').addEventListener('click', () => {
    const menu = $('#mobileMenu'); menu.hidden = !menu.hidden;
    $('#menuToggle').setAttribute('aria-expanded', String(!menu.hidden));
  });
  $('#searchToggle').addEventListener('click', () => {
    $('#searchPanel').hidden = !$('#searchPanel').hidden;
    if (!$('#searchPanel').hidden) { if (state.product) navigate('/'); $('#globalSearch').focus(); }
  });
  $('#closeSearch').addEventListener('click', () => { $('#searchPanel').hidden = true; });
  $('#globalSearch').addEventListener('input', e => { filters.search = e.target.value.trim().toLowerCase(); if (state.catalog) renderCatalog(); });
  $('#sortSelect').addEventListener('change', e => { filters.sort = e.target.value; renderCatalog(); });
  $('#priceFilter').addEventListener('input', e => { filters.maxPrice = Number(e.target.value); $('#priceDisplay').textContent = formatMoney(filters.maxPrice * 100); renderCatalog(); });
  $('#resetFilters').addEventListener('click', () => {
    filters.categories.clear(); filters.size = null; filters.colors.clear(); filters.maxPrice = 600; filters.search = '';
    $('#priceFilter').value = '600'; $('#priceDisplay').textContent = formatMoney(60000); $('#globalSearch').value = '';
    buildFilters(); renderCatalog();
  });
  $('#productVariants').addEventListener('click', e => {
    const btn = e.target.closest('[data-variant-index]');
    if (btn) selectVariant(Number(btn.dataset.variantIndex));
  });
  $('#sizeSelect').addEventListener('change', () => {});
  $('#addToCartBtn').addEventListener('click', () => addSelected(false));
  $('#buyNowBtn').addEventListener('click', () => addSelected(true));
  $('#cartItems').addEventListener('click', e => {
    const btn = e.target.closest('button[data-cart-action]'); if (!btn) return;
    const index = Number(btn.dataset.index), action = btn.dataset.cartAction;
    if (!Number.isInteger(index) || index < 0 || index >= state.cart.length) return;
    if (action === 'remove') state.cart.splice(index, 1);
    else if (action === 'plus') state.cart[index].quantity = Math.min(10, state.cart[index].quantity + 1);
    else if (action === 'minus') { state.cart[index].quantity -= 1; if (state.cart[index].quantity <= 0) state.cart.splice(index, 1); }
    saveCart(); clearShipping(); renderCart();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeAll(); $('#searchPanel').hidden = true; closeMobile(); } });
}
function closeMobile() { $('#mobileMenu').hidden = true; $('#menuToggle').setAttribute('aria-expanded', 'false'); }
function navigate(path) {
  history.pushState({}, '', path);
  renderRoute();
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
}
async function renderRoute() {
  if (!state.catalog) return;
  const routeToken = ++state.routeToken;
  const match = location.pathname.match(/^\/produto\/([a-z0-9-]+)\/?$/);
  const product = match ? state.catalog.products.find(p => p.slug === match[1]) : null;
  state.product = product || null;
  if (match && !product) { navigate('/'); toast('Produto não encontrado.'); return; }
  const categoryFromUrl = new URLSearchParams(location.search).get('categoria');
  if (!match && categoryFromUrl && state.catalog.categories.includes(categoryFromUrl)) filters.categories = new Set([categoryFromUrl]);
  $('#catalogPage').hidden = Boolean(product);
  $('#productPage').hidden = !product;
  document.body.classList.toggle('is-product', Boolean(product));
  document.body.classList.toggle('is-catalog', !product);
  document.title = product ? `${product.name} — ARAUJO IMPORTS` : 'ARAUJO IMPORTS — Moda e estilo';
  closeMobile();
  if (product) {
    try {
      // A lista traz apenas campos de cartão; detalhes são requisitados sob demanda.
      const detail = await requestJSON(`/api/products/${encodeURIComponent(product.slug)}`);
      if (routeToken !== state.routeToken) return;
      state.product = detail;
      renderProduct(detail);
    } catch {
      if (routeToken !== state.routeToken) return;
      navigate('/'); toast('Não foi possível abrir este produto.');
    }
  } else {
    document.documentElement.style.setProperty('--accent', '#f13a3d');
    buildFilters(); renderCatalog();
  }
}

function buildFilters() {
  if (!state.catalog) return;
  const categories = $('#categoryFilters'); categories.replaceChildren();
  const counts = new Map(state.catalog.categories.map(c => [c, state.catalog.products.filter(p => p.category === c).length]));
  for (const [category, count] of counts) {
    const label = el('label', 'filter-checkbox');
    const input = el('input'); input.type = 'checkbox'; input.checked = filters.categories.has(category);
    input.addEventListener('change', () => { input.checked ? filters.categories.add(category) : filters.categories.delete(category); buildFilters(); renderCatalog(); });
    label.append(input, el('span', '', category), el('span', '', `(${String(count).padStart(2, '0')})`)); categories.append(label);
  }
  const visibleProducts = state.catalog.products.filter(p => !filters.categories.size || filters.categories.has(p.category));
  const allSizes = [...new Set(visibleProducts.flatMap(p => p.sizes))];
  const sizeOrder = ['34','35','36','37','38','39','40','41','42','43','44','45','46','P','M','G','GG','XG','Único'];
  allSizes.sort((a,b)=>sizeOrder.indexOf(a)-sizeOrder.indexOf(b));
  if (filters.size && !allSizes.includes(filters.size)) filters.size = null;
  const sizes = $('#sizeFilters'); sizes.replaceChildren();
  allSizes.forEach(size => {
    const b = el('button', `size-btn${filters.size === size ? ' selected' : ''}`, size); b.type = 'button';
    b.setAttribute('aria-pressed', String(filters.size === size));
    b.addEventListener('click', () => { filters.size = filters.size === size ? null : size; buildFilters(); renderCatalog(); });
    sizes.append(b);
  });
  const distinctColors = new Map();
  state.catalog.products.flatMap(p => p.variants).forEach(v => distinctColors.set(v.hex, v.hex));
  const colors = $('#colorFilters'); colors.replaceChildren();
  [...distinctColors.keys()].slice(0, 16).forEach(hex => {
    const b = el('button', `filter-color${filters.colors.has(hex) ? ' selected' : ''}`);
    b.type = 'button'; b.style.background = hex; b.title = `Filtrar cor ${hex}`;
    b.setAttribute('aria-label', `Filtrar cor ${hex}`); b.setAttribute('aria-pressed', String(filters.colors.has(hex)));
    b.addEventListener('click', () => { filters.colors.has(hex) ? filters.colors.delete(hex) : filters.colors.add(hex); buildFilters(); renderCatalog(); }); colors.append(b);
  });
}
function renderCatalog() {
  if (!state.catalog) return;
  let products = state.catalog.products.filter(p => {
    if (filters.categories.size && !filters.categories.has(p.category)) return false;
    if (filters.size && !p.sizes.includes(filters.size)) return false;
    if (filters.colors.size && !p.variants.some(v => filters.colors.has(v.hex))) return false;
    if (minimumPrice(p) > filters.maxPrice * 100) return false;
    if (filters.search && !`${p.name} ${p.category} ${p.kicker}`.toLowerCase().includes(filters.search)) return false;
    return true;
  });
  if (filters.sort === 'price-asc') products.sort((a,b) => minimumPrice(a) - minimumPrice(b));
  if (filters.sort === 'price-desc') products.sort((a,b) => minimumPrice(b) - minimumPrice(a));
  if (filters.sort === 'name') products.sort((a,b) => a.name.localeCompare(b.name));
  if (filters.sort === 'featured') products.sort((a,b) => Number(b.featured) - Number(a.featured));
  $('#resultsCount').textContent = `${String(products.length).padStart(2, '0')} PRODUTOS`;
  $('.list-bottom span:last-child').textContent = `01 — ${String(products.length).padStart(2, '0')}`;
  const grid = $('#productGrid'); grid.replaceChildren();
  if (!products.length) { const empty = el('div','no-results');empty.append(el('strong','','NENHUM PRODUTO ENCONTRADO'),el('span','','Experimente outra cor, tamanho ou categoria.'));grid.append(empty);return; }
  products.forEach((p, index) => {
    const card = el('a', 'product-card'); card.href = `/produto/${p.slug}`; card.dataset.link = ''; card.dataset.category = p.category;
    card.style.animationDelay = `${Math.min(index * 40, 200)}ms`;
    const art = el('div', 'product-art');
    const img = el('img'); img.src = p.image; img.alt = p.name; img.loading = index < 3 ? 'eager' : 'lazy'; img.decoding = 'async';
    art.append(img);
    if (p.badge) art.append(el('span', 'product-badge', p.badge));
    art.append(el('span', 'product-arrow', '↗'));
    const meta = el('div', 'product-meta'); const info = el('div');
    info.append(el('small', '', p.category.toUpperCase()), el('h3', '', p.name));
    const dots = el('div', 'product-mini-colors');
    p.variants.slice(0, 5).forEach(v => { const d = el('span'); d.style.background = v.hex; d.title = v.color; dots.append(d); });
    info.append(dots);meta.append(info, el('strong', '', formatMoney(minimumPrice(p))));
    card.append(art,meta);grid.append(card);
  });
}
function productLabel(title) {
  const chunks = title.split(' ');
  if (chunks.length > 1) return `${chunks[0]}<span>.</span><br>${chunks.slice(1).join(' ')}`;
  return `${title}<span>.</span>`;
}
function renderProduct(product) {
  state.variantIndex = 0;
  state.animateToken++;
  $('#productBreadcrumb').textContent = `HOME / ${product.category.toUpperCase()} / ${product.name}`;
  $('#productKicker').textContent = product.kicker;
  // Somente texto estático produzido após sanitização do dado vindo do catálogo.
  $('#productTitle').replaceChildren();
  const chunks = product.name.split(' ');
  const title = $('#productTitle'); title.append(document.createTextNode(chunks[0])); title.append(el('span', '', '.'));
  if (chunks.length > 1) { title.append(document.createElement('br')); title.append(document.createTextNode(chunks.slice(1).join(' '))); }
  $('#sceneWord').textContent = chunks[0];
  $('#productTagline').textContent = product.tagline;
  $('#purchaseName').textContent = product.name;
  $('#purchasePrice').textContent = formatMoney(variantPrice(product, product.variants[0]));
  $('#purchaseCategory').textContent = product.kicker;
  $('#productDescription').textContent = product.description;
  $('#totalVariants').textContent = String(product.variants.length).padStart(2,'0');
  const sizeSelect = $('#sizeSelect'); sizeSelect.replaceChildren();
  sizeSelect.append(el('option','', 'ESCOLHA O TAMANHO')); sizeSelect.firstChild.value = '';
  for (const size of product.sizes) { const opt = el('option','',size); opt.value = size; sizeSelect.append(opt); }
  const visual = $('#productStage'); visual.replaceChildren();
  const initial = el('img', 'shoe-layer'); initial.src = product.variants[0].image;
  initial.alt = `${product.name} — ${product.variants[0].color}`;
  initial.style.opacity = '1'; visual.append(initial);
  for (const v of product.variants) { const preload = new Image(); preload.src = v.image; }
  updateVariantUI();
}
function updateVariantUI() {
  const p = state.product; if (!p) return;
  const variants = $('#productVariants'); variants.replaceChildren();
  p.variants.forEach((v, i) => {
    const button = el('button', `variant-thumb${i === state.variantIndex ? ' selected' : ''}`);
    button.type = 'button'; button.dataset.variantIndex = i; button.title = v.color;
    button.setAttribute('aria-label', `Selecionar cor ${v.color}`); button.setAttribute('aria-pressed', String(i === state.variantIndex));
    const image = el('img'); image.src = v.image; image.alt = ''; image.loading = 'lazy';
    button.append(image); variants.append(button);
  });
  const variant = p.variants[state.variantIndex];
  $('#purchasePrice').textContent = formatMoney(variantPrice(p, variant));
  $('#variantCaption').textContent = `${variant.color.toUpperCase()} / ${String(state.variantIndex + 1).padStart(2,'0')}`;
  $('#currentVariantIndex').textContent = String(state.variantIndex + 1).padStart(2,'0');
  $('#counterFill').style.width = `${(state.variantIndex + 1)/p.variants.length*100}%`;
  document.documentElement.style.setProperty('--accent', variant.hex);
}
async function selectVariant(index) {
  const p = state.product; if (!p || index === state.variantIndex || !p.variants[index]) return;
  const previousIndex = state.variantIndex;
  const currentImage = $('#productStage .shoe-layer:last-child');
  const nextImage = new Image();
  nextImage.src = p.variants[index].image;
  nextImage.alt = `${p.name} — ${p.variants[index].color}`;
  const token = ++state.animateToken;
  try { await nextImage.decode(); } catch { /* imagem pode ainda ser exibida */ }
  if (token !== state.animateToken || state.product !== p) return;
  state.variantIndex = index;
  updateVariantUI();
  if (!currentImage || reducedMotion) {
    nextImage.className = 'shoe-layer'; $('#productStage').replaceChildren(nextImage); return;
  }
  nextImage.className = `shoe-layer ${index >= previousIndex ? 'shoe-enter' : 'shoe-enter-reverse'}`;
  currentImage.classList.remove('shoe-enter', 'shoe-enter-reverse', 'shoe-exit', 'shoe-exit-reverse');
  currentImage.classList.add(index >= previousIndex ? 'shoe-exit' : 'shoe-exit-reverse');
  // A imagem que entra é DOM distinto: as duas animações podem acontecer em paralelo.
  $('#productStage').append(nextImage);
  setTimeout(() => {
    if (token !== state.animateToken || state.product !== p) return;
    nextImage.className = 'shoe-layer';
    $('#productStage').replaceChildren(nextImage);
  }, 760);
}
function addSelected(buyNow) {
  const p = state.product, v = p?.variants[state.variantIndex], size = $('#sizeSelect').value;
  if (!p || !v) return;
  if (!size || !p.sizes.includes(size)) { toast('SELECIONE UM TAMANHO PARA CONTINUAR'); $('#sizeSelect').focus(); return; }
  const existing = state.cart.find(item => item.productId === p.id && item.variantId === v.id && item.size === size);
  if (existing) { if (existing.quantity === 10) return toast('LIMITE MÁXIMO POR ITEM'); existing.quantity += 1; }
  else { if (state.cart.length >= 30) return toast('SACOLA CHEIA'); state.cart.push({ productId: p.id, variantId: v.id, size, quantity: 1 }); }
  saveCart(); clearShipping(); toast('ADICIONADO À SUA SACOLA');
  if (buyNow) openCart();
}
function updateBadge() {
  const count = state.cart.reduce((n, item) => n + item.quantity, 0);
  $('#cartBadge').textContent = count;
  $('#drawerCount').textContent = String(count).padStart(2,'0');
}
function openCart() {
  closeCheckout(false); renderCart(); $('#overlay').hidden = false;
  $('#cartDrawer').classList.add('is-open'); $('#cartDrawer').setAttribute('aria-hidden','false');
  document.body.classList.add('no-scroll'); $('#closeCart').focus();
}
function closeCart(hideOverlay = true) {
  $('#cartDrawer').classList.remove('is-open'); $('#cartDrawer').setAttribute('aria-hidden','true');
  if (hideOverlay) { $('#overlay').hidden = true; document.body.classList.remove('no-scroll'); }
}
function closeCheckout(hideOverlay = true) {
  $('#checkoutModal').classList.remove('is-open'); $('#checkoutModal').setAttribute('aria-hidden','true');
  if (hideOverlay) { $('#overlay').hidden = true; document.body.classList.remove('no-scroll'); }
}
function closeAll() { closeCheckout(); closeCart(); }
function renderCart() {
  const items = relevantCart();
  const parent = $('#cartItems'); parent.replaceChildren();
  if (!items.length) {
    const empty = el('div','empty-cart', 'SUA SACOLA ESTÁ VAZIA.'); empty.append(el('small','','ESCOLHA SEUS FAVORITOS.')); parent.append(empty);
  }
  let total = 0;
  items.forEach((item, index) => {
    total += variantPrice(item.product, item.variant) * item.quantity;
    const node = el('div','cart-item');
    const visual = el('div','cart-image'); const img = el('img'); img.src = item.variant.image;img.alt = item.product.name;visual.append(img);
    const details = el('div');
    details.append(el('small','',`${item.variant.color.toUpperCase()} / SIZE ${item.size}`),el('h3','',item.product.name),el('strong','',formatMoney(variantPrice(item.product, item.variant) * item.quantity)));
    const quantity = el('div','cart-item-quantity');
    const dec = el('button','','−');dec.type='button';dec.dataset.cartAction='minus';dec.dataset.index=index;dec.setAttribute('aria-label','Diminuir quantidade');
    const inc = el('button','','+');inc.type='button';inc.dataset.cartAction='plus';inc.dataset.index=index;inc.setAttribute('aria-label','Aumentar quantidade');
    quantity.append(dec,el('span','',item.quantity),inc);details.append(quantity);
    const remove = el('button','remove-item','×');remove.type='button';remove.dataset.cartAction='remove';remove.dataset.index=index;remove.setAttribute('aria-label','Remover item');
    node.append(visual,details,remove);parent.append(node);
  });
  $('#cartTotal').textContent = formatMoney(total);
  renderShipping();
  $('#openCheckout').disabled = items.length === 0;
}
function clearShipping() {
  state.shipping = null;
  $('#shippingOptions').replaceChildren();
  $('#shippingLines').replaceChildren();
  $('#shippingStatus').textContent = 'Informe o CEP e calcule novamente após alterar a sacola.';
  const cartTotal = $('#cartGrandTotal'); if (cartTotal) cartTotal.textContent = formatMoney(relevantCart().reduce((s,i)=>s+variantPrice(i.product,i.variant)*i.quantity,0));
  $('#cartShipping').textContent = 'A calcular';
}
function renderShipping() {
  const subtotal = relevantCart().reduce((s,i)=>s+variantPrice(i.product,i.variant)*i.quantity,0);
  const result = state.shipping;
  if (!result) { $('#cartGrandTotal').textContent=formatMoney(subtotal); $('#cartShipping').textContent='A calcular';return; }
  const selected = result.options.find(o=>String(o.serviceId)===String(result.selected));
  if (!selected) { $('#cartShipping').textContent='Indisponível';$('#cartGrandTotal').textContent=formatMoney(subtotal);return; }
  $('#cartShipping').textContent = formatMoney(selected.totalCents);
  $('#cartGrandTotal').textContent = formatMoney(subtotal+selected.totalCents);
  const options = $('#shippingOptions'); options.replaceChildren();
  result.options.forEach(option=>{
    const label=el('label','shipping-choice');
    const radio=el('input');radio.type='radio';radio.name='shippingService';radio.value=String(option.serviceId);radio.checked=String(option.serviceId)===String(result.selected);
    const desc=el('span');desc.append(el('strong','',option.name),el('small','',`${option.days === null || option.days === undefined ? 'Prazo sob consulta' : option.days + ' dias'} · ${formatMoney(option.totalCents)}`));
    label.append(radio,desc);options.append(label);
  });
  const lines=$('#shippingLines');lines.replaceChildren();
  for(const line of selected.lines){
    const row=el('div','shipping-line');row.append(el('span','',`${line.name} × ${line.quantity}`),el('strong','',formatMoney(line.costCents)));lines.append(row);
  }
  if (Number.isInteger(selected.marginCents)) { const extra=el('div','shipping-line');extra.append(el('span','','Margem temporária de segurança'), el('strong','',formatMoney(selected.marginCents)));lines.append(extra); }
  $('#shippingStatus').textContent = result.demo ? 'SIMULAÇÃO ILUSTRATIVA — não é uma cotação real.' : 'Cotação da transportadora. Revalidar antes de pagar.';
}
async function calculateShipping() {
  const cep=$('#shippingCep').value.replace(/\D/g,'');
  if(!/^\d{8}$/.test(cep)){toast('INFORME UM CEP VÁLIDO COM 8 DÍGITOS');return;}
  const items=relevantCart();if(!items.length){toast('ADICIONE UM PRODUTO À SACOLA');return;}
  const button=$('#shippingCalculate');button.disabled=true;
  $('#shippingStatus').textContent='CONSULTANDO FRETE...';
  try {
    const result=await requestJSON('/api/shipping/quote',{method:'POST',body:JSON.stringify({cep,items:state.cart})});
    state.shipping={...result,selected:String(result.options[0]?.serviceId??'')};
    renderShipping();
  } catch(error) {clearShipping();$('#shippingStatus').textContent=notifyApiError(error.message);}
  finally {button.disabled=false;}
}

async function openCheckout() {
  if (!relevantCart().length) return;
  closeCart(false);
  $('#overlay').hidden = false;
  $('#checkoutModal').classList.add('is-open');$('#checkoutModal').setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  $('#checkoutMessage').textContent = '';
  state.checkoutKey = crypto.randomUUID();
  state.quote = null;
  $('#submitOrder').disabled = true;
  $('#quoteSummary').textContent = 'CONFERINDO VALORES NO SERVIDOR...';
  try {
    const items = state.cart.map(({ productId, variantId, size, quantity }) => ({ productId, variantId, size, quantity }));
    const quote = await requestJSON('/api/checkout/quote', { method: 'POST', body: JSON.stringify({ items }) });
    state.quote = quote;
    const container = $('#quoteSummary'); container.replaceChildren(el('span','',`${quote.items.length} ITENS / VALOR CONFIRMADO`),el('strong','',formatMoney(quote.totalCents)));
    if (quote.available === false) { $('#checkoutMessage').textContent = 'Algum item está indisponível no estoque.'; return; }
    $('#submitOrder').disabled = false;
  } catch (error) {
    $('#quoteSummary').textContent = 'COTAÇÃO INDISPONÍVEL';
    $('#checkoutMessage').textContent = notifyApiError(error.message);
  }
}
async function submitOrder(event) {
  event.preventDefault();
  if (!state.quote || !state.checkoutKey || $('#submitOrder').disabled) return;
  const form = event.currentTarget;
  const contactName = form.elements.contactName.value.trim();
  const email = form.elements.email.value.trim();
  const items = state.cart.map(({ productId, variantId, size, quantity }) => ({ productId, variantId, size, quantity }));
  $('#checkoutMessage').textContent = 'ENVIANDO SOLICITAÇÃO...';
  $('#submitOrder').disabled = true;
  try {
    const result = await requestJSON('/api/order-requests', { method: 'POST',
      body: JSON.stringify({ items, contactName, email, idempotencyKey: state.checkoutKey }) });
    const message = `Pré-pedido ${result.requestId.slice(0,8).toUpperCase()} recebido. Nenhum pagamento foi realizado.`;
    state.cart = []; saveCart(); renderCart();
    $('#checkoutMessage').textContent = message;
    toast('SOLICITAÇÃO RECEBIDA — SEM COBRANÇA');
    form.reset(); state.quote = null;
  } catch (error) {
    $('#checkoutMessage').textContent = notifyApiError(error.message);
    $('#submitOrder').disabled = false;
  }
}

bootstrap();
