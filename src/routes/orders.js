const router = require('express').Router();
const db = require('../db');
const auth = require('../auth');
const { HttpError, clean } = require('../util');

router.use(auth.required);

const createOrder = db.transaction((userId, items, ship) => {
  const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
  const takeStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
  let total = 0;
  const lines = items.map(({ productId, quantity }) => {
    const p = getProduct.get(productId);
    if (!p) throw new HttpError(400, 'One of the items in your cart no longer exists.');
    // Atomic check-and-decrement so two buyers cannot both take the last unit
    if (takeStock.run(quantity, productId, quantity).changes === 0) {
      throw new HttpError(409, p.stock > 0 ? `Only ${p.stock} of "${p.name}" left in stock.` : `"${p.name}" is sold out.`);
    }
    total += p.price_cents * quantity;   // price always comes from the DB, never from the client
    return { p, quantity };
  });
  const { lastInsertRowid } = db.prepare(
    'INSERT INTO orders (user_id, total_cents, ship_name, ship_address, ship_city) VALUES (?,?,?,?,?)'
  ).run(userId, total, ship.name, ship.address, ship.city);
  const addLine = db.prepare('INSERT INTO order_items (order_id, product_id, name, unit_price_cents, quantity) VALUES (?,?,?,?,?)');
  lines.forEach(({ p, quantity }) => addLine.run(lastInsertRowid, p.id, p.name, p.price_cents, quantity));
  return Number(lastInsertRowid);
});

const withItems = order => ({
  ...order,
  items: db.prepare('SELECT product_id, name, unit_price_cents, quantity FROM order_items WHERE order_id = ?').all(order.id)
});

// POST /api/orders  { items: [{ productId, quantity }], shipping: { name, address, city } }
router.post('/', (req, res) => {
  const ship = {
    name: clean(req.body.shipping?.name, 80),
    address: clean(req.body.shipping?.address, 160),
    city: clean(req.body.shipping?.city, 80)
  };
  if (!ship.name || !ship.address || !ship.city) throw new HttpError(400, 'Fill in your name, address and city.');
  if (!Array.isArray(req.body.items) || !req.body.items.length) throw new HttpError(400, 'Your cart is empty.');

  const merged = new Map();  // merge duplicate product ids
  for (const it of req.body.items.slice(0, 50)) {
    const productId = Number(it.productId), quantity = Number(it.quantity);
    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new HttpError(400, 'Invalid item in cart.');
    }
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }
  const id = createOrder(req.user.id, [...merged].map(([productId, quantity]) => ({ productId, quantity })), ship);
  res.status(201).json({ order: withItems(db.prepare('SELECT * FROM orders WHERE id = ?').get(id)) });
});

router.get('/', (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ orders: orders.map(withItems) });
});

router.get('/:id', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(Number(req.params.id), req.user.id);
  if (!order) throw new HttpError(404, 'Order not found.');
  res.json({ order: withItems(order) });
});

module.exports = router;
