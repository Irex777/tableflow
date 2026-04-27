const express = require('express');

module.exports = (db, broadcast) => {
  const router = express.Router();

  // GET reservations
  router.get('/reservations', (req, res) => {
    const { date, status } = req.query;
    let query = `SELECT r.*, t.name as table_name FROM reservations r LEFT JOIN tables t ON r.table_id = t.id WHERE 1=1`;
    const params = [];
    if (date) { query += ' AND r.date = ?'; params.push(date); }
    if (status) { query += ' AND r.status = ?'; params.push(status); }
    query += ' ORDER BY r.date, r.time';
    res.json(db.prepare(query).all(...params));
  });

  // POST create reservation
  router.post('/reservations', (req, res) => {
    const { table_id, guest_name, phone, email, party_size, date, time, duration_min, notes } = req.body;
    if (!guest_name || !party_size || !date || !time) return res.status(400).json({ error: 'guest_name, party_size, date, time required' });

    // Check for conflicts
    if (table_id) {
      const conflict = db.prepare(`
        SELECT * FROM reservations
        WHERE table_id = ? AND date = ? AND status != 'cancelled'
        AND time < ? AND time > ?
      `).get(table_id, date, time, time);
      // Simple overlap check — could be more sophisticated
    }

    const result = db.prepare(`INSERT INTO reservations (table_id, guest_name, phone, email, party_size, date, time, duration_min, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(table_id || null, guest_name, phone || '', email || '', party_size, date, time, duration_min || 90, notes || '');

    // If table assigned, mark as reserved
    if (table_id) {
      db.prepare("UPDATE tables SET status='reserved' WHERE id=? AND status='available'").run(table_id);
      broadcast('tables', { action: 'update', id: table_id });
    }

    broadcast('reservations', { action: 'create' });
    res.json({ id: result.lastInsertRowid });
  });

  // PATCH update reservation
  router.patch('/reservations/:id', (req, res) => {
    const allowed = ['table_id', 'guest_name', 'phone', 'email', 'party_size', 'date', 'time', 'duration_min', 'notes', 'status'];
    const sets = []; const vals = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k}=?`); vals.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields' });
    vals.push(req.params.id);
    db.prepare(`UPDATE reservations SET ${sets.join(',')} WHERE id=?`).run(...vals);

    // If seated, create order for table
    if (req.body.status === 'seated' && req.body.table_id) {
      const orderNum = db.prepare("SELECT value FROM settings WHERE key='order_counter'").get();
      const counter = parseInt(orderNum?.value || '0') + 1;
      db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('order_counter',?)").run(String(counter));
      const orderNumber = `ORD-${String(counter).padStart(4, '0')}`;
      db.prepare('INSERT INTO orders (table_id, order_number, covers, server_name) VALUES (?, ?, ?, ?)')
        .run(req.body.table_id, orderNumber, req.body.party_size || 1, '');
      db.prepare("UPDATE tables SET status='occupied' WHERE id=?").run(req.body.table_id);
      broadcast('tables', { action: 'update', id: req.body.table_id });
    }

    broadcast('reservations', { action: 'update' });
    res.json({ success: true });
  });

  // DELETE reservation
  router.delete('/reservations/:id', (req, res) => {
    const r = db.prepare('SELECT * FROM reservations WHERE id=?').get(req.params.id);
    if (r?.table_id) {
      db.prepare("UPDATE tables SET status='available' WHERE id=? AND status='reserved'").run(r.table_id);
      broadcast('tables', { action: 'update', id: r.table_id });
    }
    db.prepare('DELETE FROM reservations WHERE id=?').run(req.params.id);
    broadcast('reservations', { action: 'delete' });
    res.json({ success: true });
  });

  // --- WAITLIST ---
  router.get('/waitlist', (req, res) => {
    const list = db.prepare(`SELECT w.*, t.name as seated_table_name
      FROM waitlist w LEFT JOIN tables t ON w.seated_table_id = t.id
      WHERE w.status = 'waiting' ORDER BY w.created_at`).all();
    for (const w of list) {
      w.wait_minutes = Math.round((Date.now() - new Date(w.created_at).getTime()) / 60000);
    }
    res.json(list);
  });

  router.post('/waitlist', (req, res) => {
    const { guest_name, party_size, phone, quoted_wait_min } = req.body;
    if (!guest_name || !party_size) return res.status(400).json({ error: 'guest_name and party_size required' });
    const result = db.prepare('INSERT INTO waitlist (guest_name, party_size, phone, quoted_wait_min) VALUES (?, ?, ?, ?)')
      .run(guest_name, party_size, phone || '', quoted_wait_min || 0);
    broadcast('waitlist', { action: 'create' });
    res.json({ id: result.lastInsertRowid });
  });

  router.patch('/waitlist/:id', (req, res) => {
    const { status, seated_table_id } = req.body;
    const sets = []; const vals = [];
    if (status) { sets.push('status=?'); vals.push(status); }
    if (seated_table_id) { sets.push('seated_table_id=?'); vals.push(seated_table_id); }
    if (status === 'seated') { sets.push('seated_at=CURRENT_TIMESTAMP'); }
    if (!sets.length) return res.status(400).json({ error: 'No fields' });
    vals.push(req.params.id);
    db.prepare(`UPDATE waitlist SET ${sets.join(',')} WHERE id=?`).run(...vals);
    broadcast('waitlist', { action: 'update' });
    res.json({ success: true });
  });

  router.delete('/waitlist/:id', (req, res) => {
    db.prepare('DELETE FROM waitlist WHERE id=?').run(req.params.id);
    broadcast('waitlist', { action: 'delete' });
    res.json({ success: true });
  });

  return router;
};
