const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const { initDB, seedData } = require('./db');
const { createAuthMiddleware, requireAuth, loginPage } = require('./auth');
const { setupWebSocket } = require('./ws');

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './data/tableflow.db';

// Init database
const db = initDB(DB_PATH);
seedData();

// Express app
const app = express();
const server = http.createServer(app);

// Setup WebSocket first (creates broadcast function)
const { broadcast } = setupWebSocket(server);

app.use(express.json({ limit: '1mb' }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'tableflow-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
  }
}));

// Auth routes (public)
const authRouter = createAuthMiddleware(db);
app.use('/api/auth', authRouter);

// Login page (public - inline HTML, no external assets)
app.get('/login', (req, res) => {
  res.type('html').send(loginPage());
});

// API routes (protected)
const sections = require('./routes/sections');
const tables = require('./routes/tables');
const menu = require('./routes/menu');
const orders = require('./routes/orders');
const payments = require('./routes/payments');
const kds = require('./routes/kds');
const reservations = require('./routes/reservations');
const analytics = require('./routes/analytics');
const staff = require('./routes/staff');
const settings = require('./routes/settings');

app.use('/api', requireAuth, sections(db, broadcast));
app.use('/api', requireAuth, tables(db, broadcast));
app.use('/api', requireAuth, menu(db, broadcast));
app.use('/api', requireAuth, orders(db, broadcast));
app.use('/api', requireAuth, payments(db, broadcast));
app.use('/api', requireAuth, kds(db, broadcast));
app.use('/api', requireAuth, reservations(db, broadcast));
app.use('/api', requireAuth, analytics(db, broadcast));
app.use('/api', requireAuth, staff(db, broadcast));
app.use('/api', requireAuth, settings(db, broadcast, seedData));

// Static files (protected - behind auth)
app.use((req, res, next) => {
  if (req.path === '/login') return next();
  if (!req.session.user) return res.redirect('/login');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.css') || filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
  }
}));

// SPA fallback — inject version hash for cache busting
const APP_VERSION = Date.now().toString(36);
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  if (!req.session.user) return res.redirect('/login');
  const fs = require('fs');
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace('src="/js/app.js"', `src="/js/app.js?v=${APP_VERSION}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(html);
});

// Start
server.listen(PORT, () => {
  console.log(`TableFlow POS running on port ${PORT}`);
});

// Graceful shutdown
const shutdown = () => {
  console.log('Shutting down...');
  server.close(() => { db.close(); process.exit(0); });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
