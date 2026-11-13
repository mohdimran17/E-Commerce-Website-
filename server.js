require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
if (!process.env.JWT_SECRET) console.warn('⚠  JWT_SECRET not set. Copy .env.example to .env and set a strong secret before deploying.');

const FREE_SHIPPING_ABOVE = 999;
const SHIPPING_FEE = 49;
const ORDER_STATUSES = ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const h = (fn) => (req, res, next) => { try { fn(req, res); } catch (e) { next(e); } };

const app = express();
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https:'],
      'upgrade-insecure-requests': null,
    },
  },
}));
app.use(compression());
app.use(express.json({ limit: '100kb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, message: { error: 'Too many attempts. Try again later.' } });

// ---------- helpers ----------
const sign = (u) => jwt.sign({ id: u.id }, JWT_SECRET, { expiresIn: '7d' });
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

function auth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return next(new HttpError(401, 'Please log in'));
  try {
    const { id } = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id);
    if (!user) throw new Error('no user');
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, 'Session expired. Please log in again.'));
  }
}
const adminOnly = (req, res, next) => (req.user.role === 'admin' ? next() : next(new HttpError(403, 'Admin access only')));

const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : d);

function cleanProduct(b) {
  const name = String(b.name || '').trim();
  if (name.length < 2) throw new HttpError(400, 'Product name is required');
  const price = parseInt(b.price, 10);
  const mrp = parseInt(b.mrp || b.price, 10);
  const stock = parseInt(b.stock, 10);
  if (!(price > 0)) throw new HttpError(400, 'Enter a valid price');
  if (!(stock >= 0)) throw new HttpError(400, 'Enter a valid stock quantity');
  const image = String(b.image || '').trim();
  return {
    name,
    description: String(b.description || '').trim().slice(0, 1000),
    price,
    mrp: Math.max(mrp || price, price),
    category: String(b.category || 'General').trim().slice(0, 40) || 'General',
    brand: String(b.brand || '').trim().slice(0, 40),
    emoji: String(b.emoji || '🛍️').trim().slice(0, 8) || '🛍️',
    color1: hex(b.color1, '#5b2eff'),
    color2: hex(b.color2, '#ff6a3d'),
    image: /^https?:\/\//i.test(image) ? image : '',
    stock,
    featured: b.featured ? 1 : 0,
  };
}

function calcDiscount(code, subtotal) {
  if (!code) return { discount: 0, code: null, percent: 0 };
  const c = db.prepare('SELECT * FROM coupons WHERE code = ? AND active = 1').get(String(code).trim().toUpperCase());
  if (!c) throw new HttpError(400, 'Invalid coupon code');
  if (subtotal < c.min_total) throw new HttpError(400, `Coupon ${c.code} needs a minimum order of ₹${c.min_total}`);
  const discount = Math.min(Math.floor((subtotal * c.percent) / 100), c.max_discount);
  return { discount, code: c.code, percent: c.percent };
}

const shippingFor = (amount) => (amount >= FREE_SHIPPING_ABOVE || amount <= 0 ? 0 : SHIPPING_FEE);

function fetchOrders(whereSql, params) {
  const orders = db.prepare(`SELECT o.*, u.name AS user_name, u.email AS user_email
    FROM orders o JOIN users u ON u.id = o.user_id ${whereSql} ORDER BY o.id DESC`).all(...params);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?');
  orders.forEach((o) => { o.items = items.all(o.id); });
  return orders;
}

// ---------- auth ----------
app.post('/api/auth/register', authLimiter, h((req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (name.length < 2) throw new HttpError(400, 'Please enter your name');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email');
  if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Email already registered');
  const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?,?,?)')
    .run(name, email, bcrypt.hashSync(password, 10));
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ token: sign(user), user: publicUser(user) });
}));

app.post('/api/auth/login', authLimiter, h((req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.password_hash)) {
    throw new HttpError(401, 'Incorrect email or password');
  }
  res.json({ token: sign(user), user: publicUser(user) });
}));

app.get('/api/auth/me', auth, h((req, res) => res.json({ user: req.user })));

// ---------- catalogue ----------
app.get('/api/categories', h((req, res) => {
  res.json(db.prepare('SELECT category, COUNT(*) AS count FROM products WHERE active = 1 GROUP BY category ORDER BY category').all());
}));

app.get('/api/products', h((req, res) => {
  const { q = '', category = '', sort = 'featured', min, max } = req.query;
  const where = ['active = 1'];
  const params = [];
  if (q) { where.push('(name LIKE ? OR description LIKE ? OR brand LIKE ? OR category LIKE ?)'); const l = `%${q}%`; params.push(l, l, l, l); }
  if (category) { where.push('category = ?'); params.push(category); }
  if (min && +min >= 0) { where.push('price >= ?'); params.push(+min); }
  if (max && +max > 0) { where.push('price <= ?'); params.push(+max); }
  const orderBy = {
    featured: 'featured DESC, rating_avg DESC',
    'price-asc': 'price ASC',
    'price-desc': 'price DESC',
    rating: 'rating_avg DESC, rating_count DESC',
    newest: 'id DESC',
  }[sort] || 'featured DESC, rating_avg DESC';
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 48);
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const w = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) c FROM products WHERE ${w}`).get(...params).c;
  const items = db.prepare(`SELECT * FROM products WHERE ${w} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(...params, limit, (page - 1) * limit);
  res.json({ items, total, page, pages: Math.max(Math.ceil(total / limit), 1) });
}));

app.get('/api/products/:id', h((req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(req.params.id);
  if (!p) throw new HttpError(404, 'Product not found');
  p.reviews = db.prepare(`SELECT r.id, r.rating, r.comment, r.created_at, u.name FROM reviews r
    JOIN users u ON u.id = r.user_id WHERE r.product_id = ? ORDER BY r.id DESC LIMIT 30`).all(p.id);
  p.related = db.prepare('SELECT * FROM products WHERE category = ? AND id != ? AND active = 1 ORDER BY rating_avg DESC LIMIT 4').all(p.category, p.id);
  res.json(p);
}));

app.post('/api/products/:id/reviews', auth, h((req, res) => {
  const p = db.prepare('SELECT id, rating_avg, rating_count FROM products WHERE id = ? AND active = 1').get(req.params.id);
  if (!p) throw new HttpError(404, 'Product not found');
  const rating = parseInt(req.body.rating, 10);
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'Choose a rating from 1 to 5');
  const comment = String(req.body.comment || '').trim().slice(0, 500);
  db.transaction(() => {
    if (db.prepare('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?').get(p.id, req.user.id)) {
      throw new HttpError(409, 'You have already reviewed this product');
    }
    db.prepare('INSERT INTO reviews (product_id, user_id, rating, comment) VALUES (?,?,?,?)').run(p.id, req.user.id, rating, comment);
    const count = p.rating_count + 1;
    const avg = Math.round(((p.rating_avg * p.rating_count + rating) / count) * 10) / 10;
    db.prepare('UPDATE products SET rating_avg = ?, rating_count = ? WHERE id = ?').run(avg, count, p.id);
  })();
  res.status(201).json({ ok: true });
}));

// ---------- cart ----------
const CART_SQL = `SELECT p.id, p.name, p.price, p.emoji, p.color1, p.color2, p.image, p.stock, c.qty
  FROM cart_items c JOIN products p ON p.id = c.product_id WHERE c.user_id = ? AND p.active = 1 ORDER BY p.name`;

app.get('/api/cart', auth, h((req, res) => res.json(db.prepare(CART_SQL).all(req.user.id))));

app.put('/api/cart/:productId', auth, h((req, res) => {
  const p = db.prepare('SELECT id, stock FROM products WHERE id = ? AND active = 1').get(req.params.productId);
  if (!p) throw new HttpError(404, 'Product not found');
  const qty = Math.min(parseInt(req.body.qty, 10) || 0, p.stock);
  if (qty <= 0) db.prepare('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?').run(req.user.id, p.id);
  else db.prepare(`INSERT INTO cart_items (user_id, product_id, qty) VALUES (?,?,?)
    ON CONFLICT(user_id, product_id) DO UPDATE SET qty = excluded.qty`).run(req.user.id, p.id, qty);
  res.json(db.prepare(CART_SQL).all(req.user.id));
}));

app.post('/api/cart/merge', auth, h((req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];
  db.transaction(() => {
    for (const it of items) {
      const p = db.prepare('SELECT id, stock FROM products WHERE id = ? AND active = 1').get(parseInt(it.id, 10));
      if (!p || p.stock < 1) continue;
      const existing = db.prepare('SELECT qty FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.user.id, p.id);
      const qty = Math.min((existing ? existing.qty : 0) + Math.max(parseInt(it.qty, 10) || 1, 1), p.stock);
      db.prepare(`INSERT INTO cart_items (user_id, product_id, qty) VALUES (?,?,?)
        ON CONFLICT(user_id, product_id) DO UPDATE SET qty = excluded.qty`).run(req.user.id, p.id, qty);
    }
  })();
  res.json(db.prepare(CART_SQL).all(req.user.id));
}));

// ---------- wishlist ----------
app.get('/api/wishlist', auth, h((req, res) => {
  res.json(db.prepare(`SELECT p.* FROM wishlist w JOIN products p ON p.id = w.product_id
    WHERE w.user_id = ? AND p.active = 1 ORDER BY p.name`).all(req.user.id));
}));

app.post('/api/wishlist/:productId', auth, h((req, res) => {
  const pid = parseInt(req.params.productId, 10);
  if (!db.prepare('SELECT id FROM products WHERE id = ? AND active = 1').get(pid)) throw new HttpError(404, 'Product not found');
  const del = db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?').run(req.user.id, pid);
  if (del.changes) return res.json({ wished: false });
  db.prepare('INSERT INTO wishlist (user_id, product_id) VALUES (?,?)').run(req.user.id, pid);
  res.json({ wished: true });
}));

// ---------- coupons ----------
app.post('/api/coupons/validate', h((req, res) => {
  const subtotal = Math.max(parseInt(req.body.subtotal, 10) || 0, 0);
  res.json(calcDiscount(req.body.code, subtotal));
}));

// ---------- orders ----------
const placeOrder = db.transaction((user, b) => {
  const items = db.prepare(`SELECT c.qty, p.id, p.name, p.price, p.stock FROM cart_items c
    JOIN products p ON p.id = c.product_id WHERE c.user_id = ? AND p.active = 1`).all(user.id);
  if (!items.length) throw new HttpError(400, 'Your cart is empty');
  let subtotal = 0;
  for (const it of items) {
    if (it.stock < it.qty) throw new HttpError(409, it.stock === 0 ? `${it.name} is out of stock` : `Only ${it.stock} left of ${it.name}`);
    subtotal += it.price * it.qty;
  }
  const { discount, code } = calcDiscount(b.coupon, subtotal);
  const shipping = shippingFor(subtotal - discount);
  const total = subtotal - discount + shipping;
  const info = db.prepare(`INSERT INTO orders (user_id, subtotal, discount, shipping, total, coupon, payment_method, name, phone, address, city, pincode)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(user.id, subtotal, discount, shipping, total, code, b.payment_method, b.name, b.phone, b.address, b.city, b.pincode);
  const orderId = info.lastInsertRowid;
  const insItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?,?,?,?,?)');
  const dec = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
  for (const it of items) {
    insItem.run(orderId, it.id, it.name, it.price, it.qty);
    if (dec.run(it.qty, it.id, it.qty).changes === 0) throw new HttpError(409, `${it.name} just went out of stock`);
  }
  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(user.id);
  return orderId;
});

app.post('/api/orders', auth, h((req, res) => {
  const b = req.body || {};
  const clean = {
    name: String(b.name || '').trim(),
    phone: String(b.phone || '').trim(),
    address: String(b.address || '').trim(),
    city: String(b.city || '').trim(),
    pincode: String(b.pincode || '').trim(),
    payment_method: String(b.payment_method || ''),
    coupon: b.coupon,
  };
  if (clean.name.length < 2) throw new HttpError(400, 'Enter the recipient name');
  if (!/^\d{10}$/.test(clean.phone)) throw new HttpError(400, 'Enter a valid 10-digit phone number');
  if (clean.address.length < 5) throw new HttpError(400, 'Enter the full delivery address');
  if (clean.city.length < 2) throw new HttpError(400, 'Enter your city');
  if (!/^\d{6}$/.test(clean.pincode)) throw new HttpError(400, 'Enter a valid 6-digit pincode');
  if (!['COD', 'UPI', 'CARD'].includes(clean.payment_method)) throw new HttpError(400, 'Choose a payment method');
  const id = placeOrder(req.user, clean);
  res.status(201).json({ id });
}));

app.get('/api/orders', auth, h((req, res) => res.json(fetchOrders('WHERE o.user_id = ?', [req.user.id]))));

app.post('/api/orders/:id/cancel', auth, h((req, res) => {
  db.transaction(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!o) throw new HttpError(404, 'Order not found');
    if (!['Placed', 'Processing'].includes(o.status)) throw new HttpError(400, 'This order can no longer be cancelled');
    db.prepare("UPDATE orders SET status = 'Cancelled' WHERE id = ?").run(o.id);
    const items = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?').all(o.id);
    items.forEach((i) => db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(i.qty, i.product_id));
  })();
  res.json({ ok: true });
}));

// ---------- admin ----------
app.get('/api/admin/stats', auth, adminOnly, h((req, res) => {
  const s = db.prepare("SELECT COUNT(*) orders, COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN total END), 0) revenue FROM orders").get();
  res.json({
    orders: s.orders,
    revenue: s.revenue,
    customers: db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'customer'").get().c,
    products: db.prepare('SELECT COUNT(*) c FROM products WHERE active = 1').get().c,
    lowStock: db.prepare('SELECT id, name, stock FROM products WHERE active = 1 AND stock <= 5 ORDER BY stock LIMIT 10').all(),
  });
}));

app.get('/api/admin/orders', auth, adminOnly, h((req, res) => res.json(fetchOrders('', []))));

app.patch('/api/admin/orders/:id/status', auth, adminOnly, h((req, res) => {
  const status = req.body.status;
  if (!ORDER_STATUSES.includes(status)) throw new HttpError(400, 'Invalid status');
  db.transaction(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!o) throw new HttpError(404, 'Order not found');
    if (o.status === 'Cancelled' && status !== 'Cancelled') throw new HttpError(400, 'Cancelled orders cannot be reopened');
    if (status === 'Cancelled' && o.status !== 'Cancelled') {
      db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?').all(o.id)
        .forEach((i) => db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(i.qty, i.product_id));
    }
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, o.id);
  })();
  res.json({ ok: true });
}));

app.get('/api/admin/products', auth, adminOnly, h((req, res) => {
  res.json(db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY id DESC').all());
}));

const PRODUCT_COLS = '(name, description, price, mrp, category, brand, emoji, color1, color2, image, stock, featured)';
const PRODUCT_VALS = '(@name, @description, @price, @mrp, @category, @brand, @emoji, @color1, @color2, @image, @stock, @featured)';

app.post('/api/admin/products', auth, adminOnly, h((req, res) => {
  const info = db.prepare(`INSERT INTO products ${PRODUCT_COLS} VALUES ${PRODUCT_VALS}`).run(cleanProduct(req.body));
  res.status(201).json({ id: info.lastInsertRowid });
}));

app.put('/api/admin/products/:id', auth, adminOnly, h((req, res) => {
  const p = cleanProduct(req.body);
  const r = db.prepare(`UPDATE products SET name=@name, description=@description, price=@price, mrp=@mrp, category=@category,
    brand=@brand, emoji=@emoji, color1=@color1, color2=@color2, image=@image, stock=@stock, featured=@featured WHERE id=@id`)
    .run({ ...p, id: req.params.id });
  if (!r.changes) throw new HttpError(404, 'Product not found');
  res.json({ ok: true });
}));

app.delete('/api/admin/products/:id', auth, adminOnly, h((req, res) => {
  // soft delete keeps order history intact
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM cart_items WHERE product_id = ?').run(req.params.id);
  res.json({ ok: true });
}));

// ---------- static + errors ----------
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side' : err.message });
});

const server = app.listen(PORT, () => {
  console.log(`\n  Zestora is running →  http://localhost:${PORT}`);
  console.log(`  Admin login        →  ${process.env.ADMIN_EMAIL || 'admin@zestora.com'} / ${process.env.ADMIN_PASSWORD || 'Admin@123'}\n`);
});

const shutdown = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
