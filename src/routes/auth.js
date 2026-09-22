const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const auth = require('../auth');
const { HttpError, clean } = require('../util');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/register', async (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password ?? '');
  if (!name) throw new HttpError(400, 'Enter your name.');
  if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    throw new HttpError(409, 'An account with this email already exists. Log in instead.');
  }
  const hash = await bcrypt.hash(password, 10);
  const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?,?,?)').run(name, email, hash);
  const user = { id: Number(info.lastInsertRowid), name, email };
  auth.issue(res, user);
  res.status(201).json({ user });
});

router.post('/login', async (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = row && await bcrypt.compare(String(req.body.password ?? ''), row.password_hash);
  if (!ok) throw new HttpError(401, 'Email or password is incorrect.');
  const user = { id: row.id, name: row.name, email: row.email };
  auth.issue(res, user);
  res.json({ user });
});

router.post('/logout', (req, res) => { auth.clear(res); res.json({ ok: true }); });
router.get('/me', auth.optional, (req, res) => res.json({ user: req.user }));

module.exports = router;
