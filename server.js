const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static('public'));

const dataDir = path.join(__dirname, 'data');
const ordersFile = path.join(dataDir, 'orders.json');
const productsFile = path.join(dataDir, 'products.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);

function initFiles() {
  if (!fs.existsSync(ordersFile)) {
    fs.writeFileSync(ordersFile, JSON.stringify([], null, 2));
  }
  if (!fs.existsSync(productsFile)) {
    const defaultProducts = [
      { id: 1, name: 'تيشيرت كلاسيكي أسود', category: 'تيشيرتات', price: 2500, old: 3500, discount: 29, featured: true, order: 1, images: [] },
      { id: 2, name: 'بنطال جينز أزرق', category: 'بناطيل', price: 4500, old: 6500, discount: 31, featured: true, order: 2, images: [] },
      { id: 3, name: 'حذاء رياضي برتقالي', category: 'أحذية', price: 5500, old: 8000, discount: 31, featured: true, order: 3, images: [] },
      { id: 4, name: 'قبعة رياضية بيضاء', category: 'ملحقات', price: 1500, old: 2500, discount: 40, featured: true, order: 4, images: [] },
      { id: 5, name: 'سترة جلدية سوداء', category: 'سترات', price: 12000, old: 18000, discount: 33, featured: true, order: 5, images: [] },
      { id: 6, name: 'حقيبة ظهر عصرية', category: 'حقائب', price: 3500, old: 5000, discount: 30, featured: true, order: 6, images: [] }
    ];
    fs.writeFileSync(productsFile, JSON.stringify(defaultProducts, null, 2));
  }
}

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

initFiles();

// CUSTOMER API
app.get('/api/products', (req, res) => {
  let products = readJSON(productsFile);
  products = products.sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return (a.order || 999) - (b.order || 999);
  });
  res.json(products);
});

app.post('/api/orders', (req, res) => {
  const { product, price, size, qty, customer, phone, address } = req.body;

  if (!customer || !phone || !address || !product || !size) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const order = {
    id: 'ORD-' + Date.now(),
    product, price, size, qty, customer, phone, address,
    date: new Date().toLocaleDateString('ar-DZ'),
    time: new Date().toLocaleTimeString('ar-DZ'),
    status: 'جديد'
  };

  console.log('\n✅ NEW ORDER:', order.id);
  console.log('   Product:', product, '| Customer:', customer);
  
  const orders = readJSON(ordersFile);
  orders.push(order);
  writeJSON(ordersFile, orders);
  res.json({ success: true, order });
});

// ADMIN API - PASSWORD: 1234
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (password === '1234') {
    return res.json({ success: true, message: 'تم تسجيل الدخول' });
  } else {
    return res.status(401).json({ success: false, error: 'كلمة مرور خاطئة' });
  }
});

app.get('/api/admin/orders', (req, res) => {
  res.json(readJSON(ordersFile));
});

app.delete('/api/admin/orders/:id', (req, res) => {
  const orders = readJSON(ordersFile).filter(o => o.id !== req.params.id);
  writeJSON(ordersFile, orders);
  res.json({ success: true });
});

app.get('/api/admin/products', (req, res) => {
  res.json(readJSON(productsFile));
});

app.post('/api/admin/products', (req, res) => {
  const { name, category, price, old } = req.body;
  if (!name || !category || !price || !old) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const products = readJSON(productsFile);
  const newProduct = {
    id: Math.max(...products.map(p => p.id), 0) + 1,
    name, category, price, old, discount: 0, featured: false, order: products.length + 1, images: []
  };
  products.push(newProduct);
  writeJSON(productsFile, products);
  res.json(newProduct);
});

app.put('/api/admin/products/:id', (req, res) => {
  const { name, category, price, old, discount, featured, order } = req.body;
  const products = readJSON(productsFile);
  const product = products.find(p => p.id === parseInt(req.params.id));

  if (!product) return res.status(404).json({ error: 'Not found' });

  if (name) product.name = name;
  if (category) product.category = category;
  if (price !== undefined) product.price = price;
  if (old !== undefined) product.old = old;
  if (discount !== undefined) product.discount = discount;
  if (featured !== undefined) product.featured = featured;
  if (order !== undefined) product.order = order;

  writeJSON(productsFile, products);
  res.json(product);
});

app.put('/api/admin/products/order/update', (req, res) => {
  const { productIds } = req.body;
  if (!Array.isArray(productIds)) return res.status(400).json({ error: 'Invalid' });

  const products = readJSON(productsFile);
  productIds.forEach((id, idx) => {
    const p = products.find(x => x.id === parseInt(id));
    if (p) p.order = idx + 1;
  });
  writeJSON(productsFile, products);
  res.json({ success: true });
});

app.post('/api/admin/products/:id/images', (req, res) => {
  const { images } = req.body;
  const products = readJSON(productsFile);
  const product = products.find(p => p.id === parseInt(req.params.id));

  if (!product) return res.status(404).json({ error: 'Not found' });
  if (!product.images) product.images = [];

  const newImages = Array.isArray(images) ? images : [images];
  product.images = [...product.images, ...newImages].slice(0, 10);
  writeJSON(productsFile, products);
  res.json(product);
});

app.delete('/api/admin/products/:id/images/:index', (req, res) => {
  const products = readJSON(productsFile);
  const product = products.find(p => p.id === parseInt(req.params.id));

  if (product && product.images) {
    product.images.splice(parseInt(req.params.index), 1);
    writeJSON(productsFile, products);
  }
  res.json({ success: true });
});

app.delete('/api/admin/products/:id', (req, res) => {
  const products = readJSON(productsFile).filter(p => p.id !== parseInt(req.params.id));
  writeJSON(productsFile, products);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════╗
║  🛍️  BAZZAR URBAN v3.0             ║
║  ✅ Server Running                  ║
║  🌐 http://localhost:${PORT}        ║
║  🔑 Admin Password: 1234            ║
║  📍 /admin.html                     ║
╚════════════════════════════════════╝
  `);
});
