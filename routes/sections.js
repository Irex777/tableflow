const express = require('express');

module.exports = (db, broadcast) => {
  const router = express.Router();

  // GET all sections with table counts
  router.get('/sections', (req, res) => {
    const sections = db.prepare(`
      SELECT s.*, COUNT(t.id) as table_count
      FROM sections s
      LEFT JOIN tables t ON t.section_id = s.id
      GROUP BY s.id
      ORDER BY s.sort_order
    `).all();
    res.json(sections);
  });

  // POST create section
  router.post('/sections', (req, res) => {
    const { name, color, icon, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = db.prepare('INSERT INTO sections (name, color, icon, sort_order) VALUES (?, ?, ?, ?)')
      .run(name, color || '#3b82f6', icon || '🍽️', sort_order || 0);
    broadcast('sections', { action: 'create', id: result.lastInsertRowid });
    res.json({ id: result.lastInsertRowid, name });
  });

  // PATCH update section
  router.patch('/sections/:id', (req, res) => {
    const { name, color, icon, sort_order } = req.body;
    const sets = [];
    const vals = [];
    if (name !== undefined) { sets.push('name = ?'); vals.push(name); }
    if (color !== undefined) { sets.push('color = ?'); vals.push(color); }
    if (icon !== undefined) { sets.push('icon = ?'); vals.push(icon); }
    if (sort_order !== undefined) { sets.push('sort_order = ?'); vals.push(sort_order); }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.id);
    db.prepare(`UPDATE sections SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    broadcast('sections', { action: 'update', id: req.params.id });
    res.json({ success: true });
  });

  // DELETE section
  router.delete('/sections/:id', (req, res) => {
    db.prepare('DELETE FROM sections WHERE id = ?').run(req.params.id);
    broadcast('sections', { action: 'delete', id: req.params.id });
    res.json({ success: true });
  });

  return router;
};
