const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = (db, broadcast) => {
  const router = express.Router();

  router.get('/staff', (req, res) => {
    const staff = db.prepare(`
      SELECT s.*, sec.name as section_name
      FROM staff s LEFT JOIN sections sec ON s.section_id = sec.id
      WHERE s.active = 1 ORDER BY s.name
    `).all();
    res.json(staff);
  });

  router.post('/staff', (req, res) => {
    const { name, role, pin, section_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    // Check PIN uniqueness
    if (pin) {
      const existing = db.prepare('SELECT id FROM staff WHERE pin = ? AND active = 1').get(pin);
      if (existing) return res.status(400).json({ error: 'PIN already in use' });
    }

    const result = db.prepare('INSERT INTO staff (name, role, pin, section_id) VALUES (?, ?, ?, ?)')
      .run(name, role || 'server', pin || null, section_id || null);
    broadcast('staff', { action: 'create' });
    res.json({ id: result.lastInsertRowid });
  });

  router.patch('/staff/:id', (req, res) => {
    const { name, role, pin, section_id, active } = req.body;

    if (pin) {
      const existing = db.prepare('SELECT id FROM staff WHERE pin = ? AND id != ? AND active = 1').get(pin, req.params.id);
      if (existing) return res.status(400).json({ error: 'PIN already in use' });
    }

    const sets = []; const vals = [];
    if (name !== undefined) { sets.push('name=?'); vals.push(name); }
    if (role !== undefined) { sets.push('role=?'); vals.push(role); }
    if (pin !== undefined) { sets.push('pin=?'); vals.push(pin); }
    if (section_id !== undefined) { sets.push('section_id=?'); vals.push(section_id); }
    if (active !== undefined) { sets.push('active=?'); vals.push(active); }
    if (!sets.length) return res.status(400).json({ error: 'No fields' });
    vals.push(req.params.id);
    db.prepare(`UPDATE staff SET ${sets.join(',')} WHERE id=?`).run(...vals);
    broadcast('staff', { action: 'update' });
    res.json({ success: true });
  });

  router.delete('/staff/:id', (req, res) => {
    db.prepare('UPDATE staff SET active=0 WHERE id=?').run(req.params.id);
    broadcast('staff', { action: 'delete' });
    res.json({ success: true });
  });

  return router;
};
