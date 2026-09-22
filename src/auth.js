const jwt = require('jsonwebtoken');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}
const COOKIE = 'token';

exports.issue = (res, user) =>
  res.cookie(COOKIE, jwt.sign({ id: user.id }, SECRET, { expiresIn: '7d' }), {
    httpOnly: true,           // not readable from JavaScript, so XSS cannot steal it
    sameSite: 'lax',          // blocks cross-site form posts (CSRF)
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 3600 * 1000
  });

exports.clear = res => res.clearCookie(COOKIE);

function load(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  try {
    const { id } = jwt.verify(token, SECRET);
    return db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(id) || null;
  } catch { return null; }
}

exports.optional = (req, res, next) => { req.user = load(req); next(); };
exports.required = (req, res, next) => {
  req.user = load(req);
  if (!req.user) return res.status(401).json({ error: 'Please log in to continue.' });
  next();
};
