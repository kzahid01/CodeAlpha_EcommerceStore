const router = require('express').Router();
const db = require('../db');
const { HttpError } = require('../util');

const SORTS = {
  featured: 'id ASC',
  'price-asc': 'price_cents ASC',
  'price-desc': 'price_cents DESC',
  name: 'name COLLATE NOCASE ASC'
};

router.get('/categories', (req, res) => {
  res.json({ categories: db.prepare('SELECT DISTINCT category FROM products ORDER BY category').all().map(r => r.category) });
});

// GET /api/products?q=lamp&category=Tech&sort=price-asc&ids=1,2,3
router.get('/', (req, res) => {
  const where = []; const params = [];
  if (req.query.q) { where.push('(name LIKE ? OR description LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
  if (req.query.category) { where.push('category = ?'); params.push(req.query.category); }
  if (req.query.ids) {
    const ids = String(req.query.ids).split(',').map(Number).filter(Number.isInteger).slice(0, 100);
    where.push(`id IN (${ids.map(() => '?').join(',') || 'NULL'})`); params.push(...ids);
  }
  const order = SORTS[req.query.sort] || SORTS.featured;
  const sql = `SELECT * FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${order}`;
  res.json({ products: db.prepare(sql).all(...params) });
});

router.get('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
  if (!product) throw new HttpError(404, 'Product not found.');
  res.json({ product });
});

module.exports = router;
