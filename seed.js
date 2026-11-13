const bcrypt = require('bcryptjs');

// name, category, brand, price, mrp, stock, emoji, color1, color2, description, rating, ratingCount, featured
const PRODUCTS = [
  ['Aura Wireless Headphones', 'Electronics', 'Aura', 2999, 4999, 40, '🎧', '#5b2eff', '#8f6bff', 'Active noise cancelling, 40-hour battery, soft memory-foam ear cushions and fast USB-C charging.', 4.6, 312, 1],
  ['Pulse Smartwatch S2', 'Electronics', 'Pulse', 3499, 5999, 25, '⌚', '#0f9d8a', '#5eead4', 'AMOLED display, heart-rate and sleep tracking, 7-day battery, water resistant to 50m.', 4.4, 205, 1],
  ['Boom Mini Bluetooth Speaker', 'Electronics', 'Boom', 1499, 2499, 60, '🔊', '#ff6a3d', '#ffb199', 'Pocket-sized 360° sound with deep bass, IPX7 waterproof and 12 hours of playtime.', 4.3, 178, 0],
  ['VoltMax 20000mAh Power Bank', 'Electronics', 'VoltMax', 1799, 2999, 80, '🔋', '#2b2d42', '#6c6f93', '22.5W fast charging, dual output, LED indicator and a slim aluminium body.', 4.5, 421, 0],
  ['KeyForge Mechanical Keyboard', 'Electronics', 'KeyForge', 3299, 4999, 18, '⌨️', '#7c3aed', '#c4b5fd', 'Hot-swappable switches, RGB backlight, compact 75% layout with a sturdy metal plate.', 4.7, 133, 1],
  ['GlidePro Wireless Mouse', 'Electronics', 'GlidePro', 899, 1599, 90, '🖱️', '#475569', '#94a3b8', 'Silent clicks, 2.4GHz + Bluetooth, ergonomic shape and 6-month battery life.', 4.2, 96, 0],

  ['Stride Runner Sneakers', 'Fashion', 'Stride', 2499, 3999, 55, '👟', '#e11d48', '#fda4af', 'Breathable knit upper with responsive cushioning. Light enough for daily wear and runs.', 4.5, 267, 1],
  ['Urban Commuter Backpack', 'Fashion', 'Nomad', 1899, 2999, 35, '🎒', '#0369a1', '#7dd3fc', '25L water-resistant backpack with a padded 15.6" laptop sleeve and hidden anti-theft pocket.', 4.6, 189, 1],
  ['Solstice Polarized Sunglasses', 'Fashion', 'Solstice', 1199, 2199, 70, '🕶️', '#b45309', '#fcd34d', 'UV400 polarized lenses in a lightweight, flexible frame that stays comfortable all day.', 4.1, 74, 0],
  ['Cloudsoft Everyday Hoodie', 'Fashion', 'Cloudsoft', 1599, 2599, 48, '🧥', '#6d28d9', '#a78bfa', 'Heavyweight 380GSM brushed cotton fleece with a relaxed fit and kangaroo pocket.', 4.7, 301, 0],
  ['Classic Leather Strap Watch', 'Fashion', 'Heritage', 2199, 3799, 22, '🕰️', '#78350f', '#d6a77a', 'Minimal dial, scratch-resistant glass and genuine leather strap with quick-release pins.', 4.3, 88, 0],

  ['Lumi Dimmable Desk Lamp', 'Home', 'Lumi', 1299, 2199, 42, '💡', '#f59e0b', '#fde68a', 'Touch-dimming LED lamp with 3 colour temperatures, USB charging port and flexible neck.', 4.5, 154, 1],
  ['BrewMate Coffee Maker', 'Home', 'BrewMate', 2799, 4299, 15, '☕', '#7f1d1d', '#e2a38f', 'Programmable 6-cup brewer with reusable filter, keep-warm plate and auto shut-off.', 4.4, 112, 0],
  ['Woven Boho Cushion Set (2)', 'Home', 'Nest', 799, 1499, 100, '🛋️', '#be185d', '#f9a8d4', 'Hand-woven covers with soft inserts. Machine washable and available in warm tones.', 4.0, 61, 0],
  ['Terra Ceramic Planter', 'Home', 'Nest', 549, 999, 75, '🪴', '#15803d', '#86efac', 'Matte ceramic planter with drainage hole and bamboo tray. Fits medium indoor plants.', 4.6, 143, 0],
  ['FrostGuard Steel Bottle 1L', 'Home', 'FrostGuard', 699, 1199, 120, '🧴', '#0e7490', '#67e8f9', 'Double-wall vacuum insulation keeps drinks cold for 24h and hot for 12h. Leak-proof lid.', 4.7, 388, 1],

  ['FlexGrip Yoga Mat 6mm', 'Fitness', 'FlexGrip', 999, 1799, 65, '🧘', '#4d7c0f', '#bef264', 'Non-slip TPE mat with alignment lines, extra cushioning and a carry strap.', 4.5, 220, 0],
  ['IronCore Adjustable Dumbbells', 'Fitness', 'IronCore', 3999, 6499, 12, '🏋️', '#1f2937', '#9ca3af', 'Pair of dials that adjust from 2kg to 20kg each. Replaces ten sets of weights.', 4.8, 97, 1],
  ['SpeedRope Pro Skipping Rope', 'Fitness', 'SpeedRope', 399, 799, 150, '🪢', '#dc2626', '#fca5a5', 'Ball-bearing handles and tangle-free steel cable for smooth, fast skipping.', 4.2, 83, 0],

  ['Glow Vitamin C Serum', 'Beauty', 'Glow', 649, 1099, 85, '🧪', '#ea580c', '#fdba74', '15% Vitamin C with hyaluronic acid for brighter, even-looking skin. Fragrance free.', 4.4, 275, 0],
  ['Silk Repair Hair Mask', 'Beauty', 'Silk', 599, 999, 70, '💆', '#9333ea', '#d8b4fe', 'Deep conditioning mask with argan oil that tames frizz and restores shine.', 4.3, 119, 0],

  ['DotGrid Hardcover Notebook', 'Stationery', 'Inkwell', 349, 599, 200, '📓', '#1d4ed8', '#93c5fd', 'A5 dotted notebook, 160 pages of 100GSM fountain-pen-friendly paper, lay-flat binding.', 4.6, 342, 0],
  ['Inkwell Gel Pen Set (12)', 'Stationery', 'Inkwell', 299, 499, 180, '🖊️', '#0891b2', '#a5f3fc', 'Smooth 0.5mm gel pens in 12 vivid colours with quick-dry ink.', 4.5, 210, 0],
  ['Sketcher Art Kit (48 pcs)', 'Stationery', 'Inkwell', 1099, 1899, 30, '🎨', '#c026d3', '#f0abfc', 'Pencils, charcoal, pastels and a sketchbook in a portable wooden case.', 4.6, 66, 0],
];

module.exports = function seed(db) {
  const hasProducts = db.prepare('SELECT COUNT(*) c FROM products').get().c > 0;
  if (!hasProducts) {
    const ins = db.prepare(`INSERT INTO products
      (name, category, brand, price, mrp, stock, emoji, color1, color2, description, rating_avg, rating_count, featured)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    db.transaction(() => PRODUCTS.forEach(p => ins.run(...p)))();
  }

  const coupons = db.prepare('SELECT COUNT(*) c FROM coupons').get().c;
  if (!coupons) {
    const c = db.prepare('INSERT INTO coupons (code, percent, min_total, max_discount) VALUES (?,?,?,?)');
    c.run('WELCOME10', 10, 0, 500);
    c.run('SAVE20', 20, 2999, 1500);
    c.run('FESTIVE15', 15, 999, 1000);
  }

  const email = (process.env.ADMIN_EMAIL || 'admin@zestora.com').toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!exists) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'Admin@123', 10);
    db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,'admin')").run('Store Admin', email, hash);
  }
};
