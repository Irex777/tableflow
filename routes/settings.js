const express = require('express');

module.exports = (db, broadcast, seedData) => {
  const router = express.Router();

  // GET all settings
  router.get('/settings', (req, res) => {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    for (const r of rows) {
      // Mask sensitive values
      if (r.key.includes('password') || r.key.includes('hash') || r.key.includes('secret')) {
        settings[r.key] = '••••••••';
      } else {
        settings[r.key] = r.value;
      }
    }
    res.json(settings);
  });

  // PATCH update settings
  router.patch('/settings', (req, res) => {
    const allowed = ['restaurant_name', 'tax_rate', 'currency', 'admin_username', 'admin_password'];
    const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
    const bcrypt = require('bcryptjs');

    const updateSettings = db.transaction((data) => {
      for (const [key, value] of Object.entries(data)) {
        if (!allowed.includes(key)) continue;
        if (key === 'admin_password') {
          stmt.run('admin_password_hash', bcrypt.hashSync(value, 10));
        } else {
          stmt.run(key, String(value));
        }
      }
    });
    updateSettings(req.body);
    res.json({ success: true });
  });

  // POST seed demo data
  router.post('/settings/seed', (req, res) => {
    try {
      // Drop all data tables and re-create
      db.exec(`
        DELETE FROM order_items; DELETE FROM payments; DELETE FROM orders;
        DELETE FROM reservations; DELETE FROM waitlist;
        DELETE FROM item_modifier_groups; DELETE FROM modifier_options; DELETE FROM modifier_groups;
        DELETE FROM menu_items; DELETE FROM menu_categories;
        DELETE FROM tables; DELETE FROM sections; DELETE FROM staff;
        DELETE FROM audit_log;
        DELETE FROM settings WHERE key NOT LIKE 'admin%';
      `);
      seedData();
      broadcast('tables', { action: 'reset' });
      broadcast('menu', { action: 'reset' });
      res.json({ success: true, message: 'Demo data seeded' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
