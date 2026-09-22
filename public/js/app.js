(() => {
  'use strict';

  /* ---------- tiny helpers ---------- */
  // html`...` escapes every interpolated value, so user-provided text can never inject markup.
  class Raw { constructor(s) { this.s = s; } }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const render = v => v instanceof Raw ? v.s : Array.isArray(v) ? v.map(render).join('') : (v == null || v === false) ? '' : esc(v);
  const html = (strs, ...vals) => new Raw(strs.reduce((out, s, i) => out + s + (i < vals.length ? render(vals[i]) : ''), ''));
  const money = c => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
  const date = s => new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  const app = document.getElementById('app');
  const navEl = document.getElementById('nav');
  const set = (el, view) => { el.innerHTML = view.s; };

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong. Try again.'), { status: res.status });
    return data;
  }

  let toastTimer;
  function toast(msg, bad = false) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = ''; }, 2800);
  }

  /* ---------- state ---------- */
  const state = { user: null, next: null, filter: { q: '', category: '', sort: 'featured' } };
  let cart = {};
  try { cart = JSON.parse(localStorage.getItem('deskwork.cart') || '{}'); } catch { cart = {}; }
  const cartCount = () => Object.values(cart).reduce((a, b) => a + b, 0);
  function saveCart() { localStorage.setItem('deskwork.cart', JSON.stringify(cart)); renderNav(); }
  function addToCart(id, qty = 1, max = 99) {
    cart[id] = Math.min((cart[id] || 0) + qty, max, 99);
    saveCart();
  }

  function renderNav() {
    const n = cartCount();
    set(navEl, html`
      <a class="logo" href="#/"><i></i><span>Deskwork</span></a>
      <nav aria-label="Main">
        ${state.user ? html`
          <a href="#/orders">Orders</a>
          <button data-action="logout" title="Log out ${state.user.name}">Log out</button>
        ` : html`
          <a href="#/login">Log in</a>
          <a href="#/register">Sign up</a>`}
        <a href="#/cart">Cart${n ? html`<span class="badge" aria-label="${n} items">${n}</span>` : ''}</a>
      </nav>`);
  }

  const tile = (p, lg = false) => html`
    <div class="tile ${lg ? 'lg' : ''}" style="--tint:${p.color}">
      ${p.image_url ? html`<img src="${p.image_url}" alt="${p.name}">` : html`<span class="emoji" aria-hidden="true">${p.emoji}</span>`}
    </div>`;

  const stockNote = p => p.stock === 0 ? html`<span class="low">Sold out</span>` : p.stock <= 5 ? html`<span class="low">Only ${p.stock} left</span>` : '';

  /* ---------- views ---------- */
  const loading = () => set(app, html`<p class="skeleton">Loading…</p>`);

  async function home() {
    const { categories } = await api('/products/categories');
    const f = state.filter;
    set(app, html`
      <section class="intro">
        <h1 tabindex="-1">Gear for the desk you actually work at.</h1>
        <p>Keyboards, lamps and small things that make eight hours feel shorter.</p>
      </section>
      <div class="toolbar">
        <input class="search" type="search" id="q" placeholder="Search products" aria-label="Search products" value="${f.q}">
        <select id="sort" aria-label="Sort by">
          ${[['featured', 'Featured'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['name', 'Name']]
            .map(([v, l]) => html`<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`)}
        </select>
      </div>
      <div class="chips" id="chips" style="margin-bottom:1.5rem">
        ${['', ...categories].map(c => html`<button class="chip" data-action="category" data-value="${c}" aria-pressed="${String(f.category === c)}">${c || 'All'}</button>`)}
      </div>
      <div class="grid" id="grid"></div>`);
    await loadGrid();
  }

  async function loadGrid() {
    const grid = document.getElementById('grid');
    if (!grid) return;
    const f = state.filter;
    const { products } = await api('/products?' + new URLSearchParams(f));
    set(grid, products.length ? html`${products.map(p => html`
      <article class="card">
        <a class="tile-link" href="#/product/${p.id}" aria-label="${p.name}">${tile(p)}</a>
        <div class="body">
          <h3><a href="#/product/${p.id}">${p.name}</a></h3>
          <span class="muted">${p.category}</span>
          ${stockNote(p)}
          <div class="row">
            <span class="price">${money(p.price_cents)}</span>
            <button class="btn sm" data-action="add" data-id="${p.id}" data-stock="${p.stock}" ${p.stock ? '' : 'disabled'}>Add to cart</button>
          </div>
        </div>
      </article>`)}` : html`<p class="muted">No products match “${f.q}”. Try a different search.</p>`);
    document.querySelectorAll('#chips .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === f.category)));
  }

  async function product(id) {
    const { product: p } = await api('/products/' + id);
    let qty = 1;
    set(app, html`
      <p class="crumbs"><a href="#/">All products</a> / ${p.category}</p>
      <section class="detail">
        ${tile(p, true)}
        <div class="info">
          <h1 tabindex="-1">${p.name}</h1>
          <span class="price">${money(p.price_cents)}</span>
          <p class="desc">${p.description}</p>
          ${stockNote(p) || html`<span class="muted">In stock</span>`}
          <div class="buy">
            <div class="qty" role="group" aria-label="Quantity">
              <button data-action="pqty" data-delta="-1" aria-label="Decrease quantity">−</button>
              <span id="pq" aria-live="polite">1</span>
              <button data-action="pqty" data-delta="1" aria-label="Increase quantity">+</button>
            </div>
            <button class="btn amber" id="addDetail" ${p.stock ? '' : 'disabled'}>Add to cart</button>
          </div>
        </div>
      </section>`);
    const q = document.getElementById('pq');
    app.onclick = e => {
      const b = e.target.closest('[data-action="pqty"]');
      if (b) { qty = Math.max(1, Math.min(p.stock || 1, qty + Number(b.dataset.delta))); q.textContent = qty; }
      if (e.target.closest('#addDetail')) { addToCart(p.id, qty, p.stock); toast(`Added ${qty} × ${p.name} to your cart`); }
    };
  }

  async function loadCartProducts() {
    const ids = Object.keys(cart);
    if (!ids.length) return [];
    const { products } = await api('/products?ids=' + ids.join(','));
    // drop items that no longer exist and clamp quantity to stock
    const known = new Set(products.map(p => String(p.id)));
    Object.keys(cart).forEach(id => { if (!known.has(id)) delete cart[id]; });
    products.forEach(p => { if (cart[p.id] > p.stock) cart[p.id] = p.stock; if (!cart[p.id]) delete cart[p.id]; });
    saveCart();
    return products.filter(p => cart[p.id]);
  }
  const subtotal = ps => ps.reduce((s, p) => s + p.price_cents * cart[p.id], 0);

  async function cartView() {
    const ps = await loadCartProducts();
    if (!ps.length) return set(app, html`
      <div class="empty"><h1 tabindex="-1">Your cart is empty</h1><p class="muted">Add something you like and it will show up here.</p><a class="btn" href="#/">Browse products</a></div>`);
    set(app, html`
      <div class="page">
        <h1 tabindex="-1">Your cart</h1>
        <div class="two">
          <section class="panel">
            ${ps.map(p => html`
              <div class="line">
                <a href="#/product/${p.id}">${tile(p)}</a>
                <div><a href="#/product/${p.id}"><strong>${p.name}</strong></a><div class="muted">${money(p.price_cents)} each</div></div>
                <div class="right">
                  <div class="qty" role="group" aria-label="Quantity for ${p.name}">
                    <button data-action="cqty" data-id="${p.id}" data-delta="-1" aria-label="Decrease">−</button>
                    <span>${cart[p.id]}</span>
                    <button data-action="cqty" data-id="${p.id}" data-delta="1" data-stock="${p.stock}" aria-label="Increase">+</button>
                  </div>
                  <span class="price">${money(p.price_cents * cart[p.id])}</span>
                  <button class="link-btn" data-action="remove" data-id="${p.id}">Remove</button>
                </div>
              </div>`)}
          </section>
          <aside class="panel">
            <div class="sum"><span>Subtotal</span><span>${money(subtotal(ps))}</span></div>
            <div class="sum"><span>Shipping</span><span>Free</span></div>
            <div class="sum total"><span>Total</span><span>${money(subtotal(ps))}</span></div>
            <a class="btn amber" style="width:100%;margin-top:1rem" href="#/checkout">Checkout</a>
          </aside>
        </div>
      </div>`);
  }

  async function checkout() {
    if (!state.user) { state.next = '#/checkout'; toast('Log in to place your order'); location.hash = '#/login'; return; }
    const ps = await loadCartProducts();
    if (!ps.length) { location.hash = '#/cart'; return; }
    set(app, html`
      <div class="page">
        <h1 tabindex="-1">Checkout</h1>
        <div class="two">
          <form class="panel" data-form="order" novalidate>
            <h2 style="margin-bottom:1rem">Delivery details</h2>
            <p class="err" id="err" role="alert" hidden></p>
            <div class="field"><label for="name">Full name</label><input id="name" name="name" autocomplete="name" required value="${state.user.name}"></div>
            <div class="field"><label for="address">Street address</label><input id="address" name="address" autocomplete="street-address" required></div>
            <div class="field"><label for="city">City</label><input id="city" name="city" autocomplete="address-level2" required></div>
            <p class="muted" style="margin-bottom:1rem">Demo checkout: no payment details needed.</p>
            <button class="btn amber" type="submit">Place order · ${money(subtotal(ps))}</button>
          </form>
          <aside class="panel">
            <h2 style="margin-bottom:.75rem">Order summary</h2>
            ${ps.map(p => html`<div class="sum"><span>${cart[p.id]} × ${p.name}</span><span>${money(p.price_cents * cart[p.id])}</span></div>`)}
            <div class="sum total"><span>Total</span><span>${money(subtotal(ps))}</span></div>
          </aside>
        </div>
      </div>`);
  }

  const orderCard = (o, detail = false) => html`
    <article class="panel order">
      <header>
        <h2>${detail ? html`<span tabindex="-1" id="ohead">Order #${o.id} confirmed</span>` : html`<a href="#/order/${o.id}">Order #${o.id}</a>`}</h2>
        <span class="pill">${o.status}</span>
      </header>
      <span class="muted">${date(o.created_at)} · Ship to ${o.ship_name}, ${o.ship_address}, ${o.ship_city}</span>
      ${o.items.map(i => html`<div class="sum"><span>${i.quantity} × ${i.name}</span><span>${money(i.unit_price_cents * i.quantity)}</span></div>`)}
      <div class="sum total"><span>Total</span><span>${money(o.total_cents)}</span></div>
    </article>`;

  async function orders() {
    if (!state.user) { state.next = '#/orders'; location.hash = '#/login'; return; }
    const { orders } = await api('/orders');
    set(app, html`<div class="page"><h1 tabindex="-1">Your orders</h1>
      ${orders.length ? orders.map(o => orderCard(o)) : html`<div class="empty panel"><p class="muted">You have not placed an order yet.</p><a class="btn" href="#/">Start shopping</a></div>`}</div>`);
  }

  async function orderDetail(id) {
    if (!state.user) { state.next = '#/order/' + id; location.hash = '#/login'; return; }
    const { order } = await api('/orders/' + id);
    set(app, html`<div class="page narrow" style="max-width:640px">${orderCard(order, true)}<a class="btn alt" href="#/">Continue shopping</a></div>`);
  }

  function authView(mode) {
    const reg = mode === 'register';
    set(app, html`
      <div class="page narrow">
        <h1 tabindex="-1">${reg ? 'Create your account' : 'Log in'}</h1>
        <form class="panel" data-form="${mode}" novalidate>
          <p class="err" id="err" role="alert" hidden></p>
          ${reg ? html`<div class="field"><label for="name">Name</label><input id="name" name="name" autocomplete="name" required></div>` : ''}
          <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="password">Password ${reg ? html`<span class="muted">(8+ characters)</span>` : ''}</label>
            <input id="password" name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required></div>
          <button class="btn" type="submit" style="width:100%">${reg ? 'Create account' : 'Log in'}</button>
        </form>
        <p class="muted">${reg ? html`Already have an account? <a href="#/login">Log in</a>` : html`New here? <a href="#/register">Create an account</a>`}</p>
      </div>`);
  }

  /* ---------- router ---------- */
  const routes = [
    [/^#\/?$/, home], [/^#\/product\/(\d+)$/, product], [/^#\/cart$/, cartView], [/^#\/checkout$/, checkout],
    [/^#\/orders$/, orders], [/^#\/order\/(\d+)$/, orderDetail],
    [/^#\/login$/, () => authView('login')], [/^#\/register$/, () => authView('register')]
  ];
  async function route() {
    app.onclick = null;
    const hash = location.hash || '#/';
    const match = routes.map(([re, fn]) => [hash.match(re), fn]).find(([m]) => m);
    if (!match) return set(app, html`<div class="empty"><h1 tabindex="-1">Page not found</h1><a class="btn" href="#/">Back to the shop</a></div>`);
    try {
      await match[1](...match[0].slice(1));
    } catch (e) {
      set(app, html`<div class="empty"><h1 tabindex="-1">${e.status === 404 ? 'We could not find that' : 'Something went wrong'}</h1><p class="muted">${e.message}</p><a class="btn" href="#/">Back to the shop</a></div>`);
    }
    window.scrollTo(0, 0);
    (app.querySelector('h1, #ohead') || app).focus?.({ preventScroll: true });
  }

  /* ---------- events ---------- */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action, id, delta, value, stock } = el.dataset;
    try {
      if (action === 'add') { addToCart(id, 1, Number(stock)); toast('Added to cart'); }
      if (action === 'category') { state.filter.category = value; await loadGrid(); }
      if (action === 'cqty') {
        const next = (cart[id] || 0) + Number(delta);
        if (next < 1) delete cart[id]; else if (stock && next > Number(stock)) return toast(`Only ${stock} in stock`, true); else cart[id] = next;
        saveCart(); await route();
      }
      if (action === 'remove') { delete cart[id]; saveCart(); await route(); }
      if (action === 'logout') { await api('/auth/logout', { method: 'POST' }); state.user = null; renderNav(); toast('Logged out'); location.hash = '#/'; }
    } catch (err) { toast(err.message, true); }
  });

  let searchTimer;
  document.addEventListener('input', e => {
    if (e.target.id !== 'q') return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.filter.q = e.target.value.trim(); loadGrid().catch(err => toast(err.message, true)); }, 250);
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'sort') { state.filter.sort = e.target.value; loadGrid().catch(err => toast(err.message, true)); }
  });

  document.addEventListener('submit', async e => {
    const form = e.target.closest('[data-form]');
    if (!form) return;
    e.preventDefault();
    const kind = form.dataset.form;
    const data = Object.fromEntries(new FormData(form));
    const err = document.getElementById('err');
    const btn = form.querySelector('button[type=submit]');
    err.hidden = true; btn.disabled = true;
    try {
      if (kind === 'order') {
        const items = Object.entries(cart).map(([productId, quantity]) => ({ productId: Number(productId), quantity }));
        const { order } = await api('/orders', { method: 'POST', body: { items, shipping: data } });
        cart = {}; saveCart(); location.hash = '#/order/' + order.id;
      } else {
        const { user } = await api('/auth/' + kind, { method: 'POST', body: data });
        state.user = user; renderNav(); toast(`Welcome, ${user.name}`);
        location.hash = state.next || '#/'; state.next = null;
      }
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    } finally { btn.disabled = false; }
  });

  window.addEventListener('hashchange', route);
  (async () => {
    try { state.user = (await api('/auth/me')).user; } catch { /* stay logged out */ }
    renderNav(); route();
  })();
})();
