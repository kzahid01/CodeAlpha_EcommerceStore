process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server');

let server, base, cookie = '';
before(() => new Promise(r => { server = app.listen(0, () => { base = `http://localhost:${server.address().port}/api`; r(); }); }));
after(() => server.close());

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method, headers: { 'Content-Type': 'application/json', cookie },
    body: body ? JSON.stringify(body) : undefined
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  return { status: res.status, data: await res.json() };
}

test('lists, filters and sorts products', async () => {
  const all = await call('GET', '/products');
  assert.equal(all.status, 200);
  assert.ok(all.data.products.length >= 10);
  const tech = await call('GET', '/products?category=Tech&sort=price-asc');
  assert.ok(tech.data.products.every(p => p.category === 'Tech'));
  const prices = tech.data.products.map(p => p.price_cents);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));
  const search = await call('GET', '/products?q=warm%20glow');
  assert.equal(search.data.products.length, 1);
  assert.equal(search.data.products[0].name, 'Warm Glow Desk Lamp');
});

test('product detail and 404', async () => {
  assert.equal((await call('GET', '/products/1')).status, 200);
  assert.equal((await call('GET', '/products/9999')).status, 404);
});

test('orders require login', async () => {
  assert.equal((await call('POST', '/orders', { items: [] })).status, 401);
});

test('register validates input, then logs in', async () => {
  assert.equal((await call('POST', '/auth/register', { name: 'A', email: 'bad', password: 'password1' })).status, 400);
  assert.equal((await call('POST', '/auth/register', { name: 'A', email: 'a@b.co', password: 'short' })).status, 400);
  const ok = await call('POST', '/auth/register', { name: 'Ada', email: 'ada@example.com', password: 'password1' });
  assert.equal(ok.status, 201);
  assert.equal((await call('POST', '/auth/register', { name: 'Ada', email: 'ada@example.com', password: 'password1' })).status, 409);
  assert.equal((await call('GET', '/auth/me')).data.user.email, 'ada@example.com');
  await call('POST', '/auth/logout');
  cookie = '';
  assert.equal((await call('GET', '/auth/me')).data.user, null);
  assert.equal((await call('POST', '/auth/login', { email: 'ada@example.com', password: 'wrong-pass' })).status, 401);
  assert.equal((await call('POST', '/auth/login', { email: 'ada@example.com', password: 'password1' })).status, 200);
});

test('order uses server prices, decrements stock, rejects oversell', async () => {
  const before = (await call('GET', '/products/3')).data.product;
  const shipping = { name: 'Ada', address: '1 Main St', city: 'London' };
  const res = await call('POST', '/orders', {
    items: [{ productId: 3, quantity: 2 }, { productId: 3, quantity: 1 }], shipping, price: 1   // extra client "price" is ignored
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.order.total_cents, before.price_cents * 3);
  assert.equal(res.data.order.items.length, 1);
  assert.equal((await call('GET', '/products/3')).data.product.stock, before.stock - 3);

  const tooMany = await call('POST', '/orders', { items: [{ productId: 3, quantity: 99 }], shipping });
  assert.equal(tooMany.status, 409);
  assert.equal((await call('GET', '/products/3')).data.product.stock, before.stock - 3);  // rolled back

  assert.equal((await call('POST', '/orders', { items: [{ productId: 3, quantity: 0 }], shipping })).status, 400);
  assert.equal((await call('POST', '/orders', { items: [{ productId: 3, quantity: 1 }], shipping: {} })).status, 400);
});

test('order history is private to the user', async () => {
  const mine = await call('GET', '/orders');
  assert.equal(mine.data.orders.length, 1);
  cookie = '';
  await call('POST', '/auth/register', { name: 'Bob', email: 'bob@example.com', password: 'password1' });
  assert.equal((await call('GET', '/orders')).data.orders.length, 0);
  assert.equal((await call('GET', `/orders/${mine.data.orders[0].id}`)).status, 404);
});
