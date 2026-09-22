const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const file = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'store.db');
if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  category    TEXT NOT NULL,
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  emoji       TEXT NOT NULL DEFAULT '📦',
  color       TEXT NOT NULL DEFAULT '#DCE6FF',
  image_url   TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  total_cents  INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'paid',
  ship_name    TEXT NOT NULL,
  ship_address TEXT NOT NULL,
  ship_city    TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id       INTEGER NOT NULL REFERENCES products(id),
  name             TEXT NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  quantity         INTEGER NOT NULL CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
`);

// Seed the catalogue on first run
if (db.prepare('SELECT COUNT(*) c FROM products').get().c === 0) {
  const seed = [
    ['Tactile Mechanical Keyboard', 'A compact 75% board with hot-swappable switches, PBT keycaps and a solid aluminium case. Quiet enough for shared offices, satisfying enough that you will not want to stop typing.', 12900, 'Tech', 25, '⌨️', '#DCE6FF'],
    ['Aluminium Monitor Arm', 'Gas-spring arm that clamps to any desk up to 5 cm thick. Lifts, tilts and rotates a monitor up to 9 kg, and gives you your desk space back.', 8900, 'Desk', 18, '🖥️', '#E3E8EE'],
    ['Warm Glow Desk Lamp', 'Dimmable LED lamp with three colour temperatures and a touch dial. Flicker-free, so it is kind to your eyes on long evenings.', 5400, 'Lighting', 30, '💡', '#FFF1C7'],
    ['Dot-Grid Notebook, 3-pack', 'A5 notebooks with 120 gsm paper that takes fountain pens without bleeding. Lay-flat binding and a numbered index page.', 1800, 'Stationery', 80, '📓', '#E6F3E1'],
    ['Stoneware Pour-Over Mug', 'Hand-glazed 350 ml mug with a wide base that stays put when you reach for it. Dishwasher and microwave safe.', 2400, 'Comfort', 40, '☕', '#FBE3D6'],
    ['Fold-Flat Laptop Stand', 'Raises your laptop to eye level and folds to the thickness of a phone. Six height settings, non-slip silicone pads.', 4500, 'Desk', 35, '💻', '#E3E8EE'],
    ['1080p Streaming Webcam', 'Sharp 1080p at 60 fps with a privacy shutter and two noise-reducing microphones. Plug-and-play over USB.', 6900, 'Tech', 22, '📷', '#DCE6FF'],
    ['7-in-1 USB-C Hub', 'HDMI 4K, two USB-A, SD and microSD readers, Ethernet and 100 W pass-through charging in one aluminium block.', 4900, 'Tech', 50, '🔌', '#DCE6FF'],
    ['Ergonomic Vertical Mouse', 'A handshake-angle grip that takes the strain off your wrist. Bluetooth or 2.4 GHz, and a battery that lasts about three months.', 3600, 'Tech', 38, '🖱️', '#DCE6FF'],
    ['Noise-Cancelling Headphones', 'Over-ear headphones with adaptive noise cancelling, 30-hour battery and a transparency mode for when someone taps your shoulder.', 15900, 'Tech', 15, '🎧', '#DCE6FF'],
    ['Ceramic Planter with Tray', 'A 12 cm matte planter with drainage hole and bamboo tray. Small enough for a desk, big enough for a pothos.', 2200, 'Comfort', 45, '🪴', '#FBE3D6'],
    ['Magnetic Cable Organiser Set', 'Six weighted magnetic clips that keep charging cables where you left them instead of behind the desk.', 1400, 'Desk', 100, '🧲', '#E3E8EE']
  ];
  const ins = db.prepare('INSERT INTO products (name, description, price_cents, category, stock, emoji, color) VALUES (?,?,?,?,?,?,?)');
  db.transaction(() => seed.forEach(r => ins.run(...r)))();
}

module.exports = db;
