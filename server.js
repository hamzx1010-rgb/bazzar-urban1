/* ============================================================
   BAZZAR URBAN — Express server
   Same working model as DARI MEUBLE:
   JSON-file storage + REST API + static public/ folder
   ============================================================ */

const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Admin password — set ADMIN_PASSWORD in Render's Environment tab.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '1234';

// Hidden admin page file name
const ADMIN_PAGE = 'admin463782726.html';

/* ---------- storage -------------------------------------- */
// If a Render Disk is mounted at /data it is used (persistent),
// otherwise files live next to the app.
const DATA_DIR = fs.existsSync('/data') ? '/data' : __dirname;
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.error('read error', file, e.message);
    return fallback;
  }
}

function writeJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('write error', file, e.message);
    return false;
  }
}

// seed products.json on first boot (copies the repo copy into /data)
(function seed() {
  if (!fs.existsSync(PRODUCTS_FILE)) {
    const bundled = path.join(__dirname, 'products.json');
    const seedData = (bundled !== PRODUCTS_FILE && fs.existsSync(bundled))
      ? readJSON(bundled, [])
      : [];
    writeJSON(PRODUCTS_FILE, seedData);
  }
  if (!fs.existsSync(ORDERS_FILE)) writeJSON(ORDERS_FILE, []);
})();

const getProducts = () => readJSON(PRODUCTS_FILE, []);
const saveProducts = (p) => writeJSON(PRODUCTS_FILE, p);
const getOrders = () => readJSON(ORDERS_FILE, []);
const saveOrders = (o) => writeJSON(ORDERS_FILE, o);

/* ---------- middleware ----------------------------------- */
app.use(express.json({ limit: '25mb' }));           // base64 images
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// simple token auth for /api/admin/*
const sessions = new Set();

function auth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token && sessions.has(token)) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

/* ---------- admin login ---------------------------------- */
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    const token = 'tk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12);
    sessions.add(token);
    return res.json({ ok: true, token });
  }
  res.status(401).json({ ok: false, error: 'Wrong password' });
});

app.post('/api/admin/logout', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

/* ---------- PUBLIC API ----------------------------------- */

// products shown on the storefront (sorted: featured order first)
app.get('/api/products', (req, res) => {
  const products = getProducts().slice().sort((a, b) => (a.order || 999) - (b.order || 999));
  res.json(products);
});

app.get('/api/products/:id', (req, res) => {
  const p = getProducts().find(x => x.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json(p);
});

// customer places an order  -> saved for the hidden admin page
app.post('/api/orders', (req, res) => {
  const { product, price, size, qty, customer, phone, address, date } = req.body || {};
  if (!product || !customer || !phone || !address) {
    return res.status(400).json({ error: 'missing fields' });
  }
  const orders = getOrders();
  const order = {
    id: Date.now(),
    product: String(product),
    price: Number(price) || 0,
    size: size || '-',
    qty: Number(qty) || 1,
    customer: String(customer),
    phone: String(phone),
    address: String(address),
    date: date || new Date().toLocaleDateString('en-US'),
    createdAt: new Date().toISOString(),
    status: 'new'
  };
  orders.push(order);
  if (!saveOrders(orders)) return res.status(500).json({ error: 'save failed' });
  console.log('NEW ORDER:', order.id, order.product, '-', order.customer);
  res.status(201).json({ ok: true, order });
});

/* ---------- ADMIN API ------------------------------------ */

// ORDERS
app.get('/api/admin/orders', auth, (req, res) => res.json(getOrders()));

app.delete('/api/admin/orders/:id', auth, (req, res) => {
  const id = String(req.params.id);
  const orders = getOrders().filter(o => String(o.id) !== id);
  saveOrders(orders);
  res.json({ ok: true });
});

// PRODUCTS
app.get('/api/admin/products', auth, (req, res) => {
  res.json(getProducts().slice().sort((a, b) => (a.order || 999) - (b.order || 999)));
});

app.post('/api/admin/products', auth, (req, res) => {
  const { name, category, price, old, discount, featured, images } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name required' });
  const products = getProducts();
  const product = {
    id: Date.now(),
    name: String(name),
    category: category || 'Uncategorized',
    price: Number(price) || 0,
    old: Number(old) || 0,
    discount: Number(discount) || 0,
    featured: !!featured,
    order: products.length + 1,
    images: Array.isArray(images) ? images : []
  };
  products.push(product);
  saveProducts(products);
  res.status(201).json(product);
});

app.put('/api/admin/products/:id', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const products = getProducts();
  const i = products.findIndex(p => p.id === id);
  if (i === -1) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  products[i] = {
    ...products[i],
    name: b.name !== undefined ? String(b.name) : products[i].name,
    category: b.category !== undefined ? b.category : products[i].category,
    price: b.price !== undefined ? Number(b.price) : products[i].price,
    old: b.old !== undefined ? Number(b.old) : products[i].old,
    discount: b.discount !== undefined ? Number(b.discount) : products[i].discount,
    featured: b.featured !== undefined ? !!b.featured : products[i].featured
  };
  saveProducts(products);
  res.json(products[i]);
});

// replace the image list of a product
app.post('/api/admin/products/:id/images', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const products = getProducts();
  const i = products.findIndex(p => p.id === id);
  if (i === -1) return res.status(404).json({ error: 'not found' });
  const images = Array.isArray(req.body.images) ? req.body.images.slice(0, 10) : [];
  products[i].images = images;
  saveProducts(products);
  res.json(products[i]);
});

app.delete('/api/admin/products/:id', auth, (req, res) => {
  const id = parseInt(req.params.id);
  const products = getProducts().filter(p => p.id !== id);
  saveProducts(products);
  res.json({ ok: true });
});

// drag & drop reorder of featured products
app.put('/api/admin/products/order/update', auth, (req, res) => {
  const ids = Array.isArray(req.body.productIds) ? req.body.productIds : [];
  const products = getProducts();
  ids.forEach((pid, idx) => {
    const p = products.find(x => x.id === parseInt(pid));
    if (p) p.order = idx + 1;
  });
  saveProducts(products);
  res.json({ ok: true });
});

/* ---------- pages ---------------------------------------- */
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// nice alias for the hidden admin page
app.get('/' + ADMIN_PAGE.replace('.html', ''), (req, res) =>
  res.sendFile(path.join(__dirname, 'public', ADMIN_PAGE))
);

app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// anything else -> storefront
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'not found' });
  res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log('BAZZAR URBAN running on port ' + PORT);
  console.log('Storefront : /');
  console.log('Admin      : /' + ADMIN_PAGE);
  console.log('Data dir   : ' + DATA_DIR);
});
