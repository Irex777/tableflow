const express = require('express');

module.exports = (db, broadcast) => {
  const router = express.Router();

  // GET tables with section info
  router.get('/tables', (req, res) => {
    const { section_id } = req.query;
    let query = `SELECT t.*, s.name as section_name, s.color as section_color
      FROM tables t LEFT JOIN sections s ON t.section_id = s.id`;
    const params = [];
    if (section_id) { query += ' WHERE t.section_id = ?'; params.push(section_id); }
    query += ' ORDER BY t.name';
    const tables = db.prepare(query).all(...params);

    // Add active order info for occupied tables
    for (const t of tables) {
      if (t.status === 'occupied') {
        const order = db.prepare('SELECT id, order_number, covers, opened_at, server_name FROM orders WHERE table_id = ? AND status IN (?, ?) ORDER BY opened_at DESC LIMIT 1')
          .get(t.id, 'open', 'fired');
        t.active_order = order || null;
        if (order) {
          const mins = Math.round((Date.now() - new Date(order.opened_at).getTime()) / 60000);
          t.seat_time = mins;
        }
      }
    }
    res.json(tables);
  });

  // POST create table
  router.post('/tables', (req, res) => {
    const { section_id, name, shape, seats, x, y, width, height, min_covers, max_covers } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = db.prepare(`INSERT INTO tables (section_id, name, shape, seats, x, y, width, height, min_covers, max_covers)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(section_id || null, name, shape || 'round', seats || 4, x || 50, y || 50, width || 80, height || 80, min_covers || 1, max_covers || 8);
    broadcast('tables', { action: 'create', id: result.lastInsertRowid });
    res.json({ id: result.lastInsertRowid, name });
  });

  // PATCH update table
  router.patch('/tables/:id', (req, res) => {
    const allowed = ['section_id', 'name', 'shape', 'seats', 'x', 'y', 'width', 'height', 'rotation', 'status', 'merged_with', 'min_covers', 'max_covers'];
    const sets = [];
    const vals = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = ?`); vals.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
    vals.push(req.params.id);
    db.prepare(`UPDATE tables SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    broadcast('tables', { action: 'update', id: parseInt(req.params.id) });
    res.json({ success: true });
  });

  // DELETE table
  router.delete('/tables/:id', (req, res) => {
    db.prepare('DELETE FROM tables WHERE id = ?').run(req.params.id);
    broadcast('tables', { action: 'delete', id: parseInt(req.params.id) });
    res.json({ success: true });
  });

  // PATCH bulk position update
  router.patch('/tables/bulk', (req, res) => {
    const { tables } = req.body;
    if (!Array.isArray(tables)) return res.status(400).json({ error: 'tables array required' });
    const stmt = db.prepare('UPDATE tables SET x = ?, y = ? WHERE id = ?');
    const updateAll = db.transaction((items) => {
      for (const t of items) stmt.run(t.x, t.y, t.id);
    });
    updateAll(tables);
    broadcast('tables', { action: 'bulk_update' });
    res.json({ success: true, updated: tables.length });
  });

  // POST merge tables
  router.post('/tables/:id/merge', (req, res) => {
    const { merge_with } = req.body;
    if (!merge_with) return res.status(400).json({ error: 'merge_with ID required' });
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    const other = db.prepare('SELECT * FROM tables WHERE id = ?').get(merge_with);
    if (!table || !other) return res.status(404).json({ error: 'Table not found' });

    const merged = [parseInt(req.params.id), parseInt(merge_with)].sort((a, b) => a - b);
    const mergedStr = JSON.stringify(merged);
    const totalSeats = table.seats + other.seats;
    const avgX = (table.x + other.x) / 2;
    const avgY = (table.y + other.y) / 2;

    const updateMerged = db.transaction(() => {
      db.prepare('UPDATE tables SET merged_with = ?, seats = ?, x = ?, y = ?, width = ?, height = ? WHERE id = ?')
        .run(mergedStr, totalSeats, avgX, avgY, Math.max(table.width, other.width) * 1.5, Math.max(table.height, other.height) * 1.2, merged[0]);
      db.prepare('UPDATE tables SET status = ?, merged_with = ? WHERE id = ?')
        .run('blocked', mergedStr, merged[1]);
    });
    updateMerged();
    broadcast('tables', { action: 'merge', ids: merged });
    res.json({ success: true });
  });

  // POST unmerge table
  router.post('/tables/:id/unmerge', (req, res) => {
    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(req.params.id);
    if (!table || !table.merged_with) return res.status(400).json({ error: 'Table not merged' });

    const merged = JSON.parse(table.merged_with);
    const unmerge = db.transaction(() => {
      for (const id of merged) {
        db.prepare('UPDATE tables SET merged_with = NULL, status = ? WHERE id = ?').run('available', id);
      }
    });
    unmerge();
    broadcast('tables', { action: 'unmerge', ids: merged });
    res.json({ success: true });
  });

  return router;
};
