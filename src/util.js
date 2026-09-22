class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const clean = (v, max) => String(v ?? '').trim().slice(0, max);
module.exports = { HttpError, clean };
