const express = require('express');

module.exports = (db, broadcast) => {
  const router = express.Router();

  // --- CATEGORIES ---
  router.get('/menu/categories', (req, res) => {
    const cats = db.prepare('SELECT * FROM menu_categories WHERE active = 1 ORDER BY sort_order').all();
    for (const c of cats) {
      c.item_count = db.prepare('SELECT COUNT(*) as c FROM menu_items WHERE category_id = ? AND active = 1').get(c.id).c;
    }
    res.json(cats);
  });

  router.post('/menu/categories', (req, res) => {
    const { name, icon, color, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = db.prepare('INSERT INTO menu_categories (name, icon, color, sort_order) VALUES (?, ?, ?, ?)')
      .run(name, icon || '📋', color || '#3b82f6', sort_order || 0);
    broadcast('menu', { action: 'category_create' });
    res.json({ id: result.lastInsertRowid });
  });

  router.patch('/menu/categories/:id', (req, res) => {
    const { name, icon, color, sort_order, active } = req.body;
    const sets = []; const vals = [];
    if (name !== undefined) { sets.push('name=?'); vals.push(name); }
    if (icon !== undefined) { sets.push('icon=?'); vals.push(icon); }
    if (color !== undefined) { sets.push('color=?'); vals.push(color); }
    if (sort_order !== undefined) { sets.push('sort_order=?'); vals.push(sort_order); }
    if (active !== undefined) { sets.push('active=?'); vals.push(active); }
    if (!sets.length) return res.status(400).json({ error: 'No fields' });
    vals.push(req.params.id);
    db.prepare(`UPDATE menu_categories SET ${sets.join(',')} WHERE id=?`).run(...vals);
    broadcast('menu', { action: 'category_update' });
    res.json({ success: true });
  });

  router.delete('/menu/categories/:id', (req, res) => {
    db.prepare('DELETE FROM menu_categories WHERE id=?').run(req.params.id);
    broadcast('menu', { action: 'category_delete' });
    res.json({ success: true });
  });

  // --- ITEMS ---
  router.get('/menu/items', (req, res) => {
    const { category_id } = req.query;
    let query = `SELECT mi.*, mc.name as category_name,
      GROUP_CONCAT(DISTINCT mg.id) as modifier_group_ids
      FROM menu_items mi
      LEFT JOIN menu_categories mc ON mi.category_id = mc.id
      LEFT JOIN item_modifier_groups img ON mi.id = img.item_id
      LEFT JOIN modifier_groups mg ON img.group_id = mg.id
      WHERE mi.active = 1`;
    const params = [];
    if (category_id) { query += ' AND mi.category_id = ?'; params.push(category_id); }
    query += ' GROUP BY mi.id ORDER BY mi.sort_order';
    const items = db.prepare(query).all(...params);
    for (const item of items) {
      item.modifier_group_ids = item.modifier_group_ids ? item.modifier_group_ids.split(',').map(Number) : [];
    }
    res.json(items);
  });

  router.post('/menu/items', (req, res) => {
    const { category_id, name, description, price, cost, sku, sort_order } = req.body;
    if (!name || price === undefined) return res.status(400).json({ error: 'Name and price required' });
    const result = db.prepare(`INSERT INTO menu_items (category_id, name, description, price, cost, sku, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(category_id || null, name, description || '', price, cost || 0, sku || null, sort_order || 0);
    broadcast('menu', { action: 'item_create' });
    res.json({ id: result.lastInsertRowid });
  });

  router.patch('/menu/items/:id', (req, res) => {
    const allowed = ['category_id', 'name', 'description', 'price', 'cost', 'sku', 'barcode', 'image_url', 'is_86d', 'sort_order', 'active'];
    const sets = []; const vals = [];
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k}=?`); vals.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields' });
    vals.push(req.params.id);
    db.prepare(`UPDATE menu_items SET ${sets.join(',')} WHERE id=?`).run(...vals);
    broadcast('menu', { action: 'item_update' });
    res.json({ success: true });
  });

  router.delete('/menu/items/:id', (req, res) => {
    db.prepare('DELETE FROM menu_items WHERE id=?').run(req.params.id);
    broadcast('menu', { action: 'item_delete' });
    res.json({ success: true });
  });

  // --- MODIFIERS ---
  router.get('/menu/modifiers', (req, res) => {
    const groups = db.prepare('SELECT * FROM modifier_groups ORDER BY name').all();
    for (const g of groups) {
      g.options = db.prepare('SELECT * FROM modifier_options WHERE group_id = ? ORDER BY sort_order').all(g.id);
    }
    res.json(groups);
  });

  router.post('/menu/modifiers', (req, res) => {
    const { name, required, multi_select, max_selections } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = db.prepare('INSERT INTO modifier_groups (name, required, multi_select, max_selections) VALUES (?, ?, ?, ?)')
      .run(name, required ? 1 : 0, multi_select ? 1 : 0, max_selections || 1);
    broadcast('menu', { action: 'modifier_create' });
    res.json({ id: result.lastInsertRowid });
  });

  router.patch('/menu/modifiers/:id', (req, res) => {
    const { name, required, multi_select, max_selections } = req.body;
    const sets = []; const vals = [];
    if (name !== undefined) { sets.push('name=?'); vals.push(name); }
    if (required !== undefined) { sets.push('required=?'); vals.push(required ? 1 : 0); }
    if (multi_select !== undefined) { sets.push('multi_select=?'); vals.push(multi_select ? 1 : 0); }
    if (max_selections !== undefined) { sets.push('max_selections=?'); vals.push(max_selections); }
    if (!sets.length) return res.status(400).json({ error: 'No fields' });
    vals.push(req.params.id);
    db.prepare(`UPDATE modifier_groups SET ${sets.join(',')} WHERE id=?`).run(...vals);
    res.json({ success: true });
  });

  router.delete('/menu/modifiers/:id', (req, res) => {
    db.prepare('DELETE FROM modifier_groups WHERE id=?').run(req.params.id);
    res.json({ success: true });
  });

  // Modifier options
  router.post('/menu/modifiers/:id/options', (req, res) => {
    const { name, price_adjustment, is_default, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const result = db.prepare('INSERT INTO modifier_options (group_id, name, price_adjustment, is_default, sort_order) VALUES (?, ?, ?, ?, ?)')
      .run(req.params.id, name, price_adjustment || 0, is_default ? 1 : 0, sort_order || 0);
    res.json({ id: result.lastInsertRowid });
  });

  router.patch('/menu/modifiers/:groupId/options/:optionId', (req, res) => {
    const { name, price_adjustment, is_default, sort_order } = req.body;
    const sets = []; const vals = [];
    if (name !== undefined) { sets.push('name=?'); vals.push(name); }
    if (price_adjustment !== undefined) { sets.push('price_adjustment=?'); vals.push(price_adjustment); }
    if (is_default !== undefined) { sets.push('is_default=?'); vals.push(is_default ? 1 : 0); }
    if (sort_order !== undefined) { sets.push('sort_order=?'); vals.push(sort_order); }
    if (!sets.length) return res.status(400).json({ error: 'No fields' });
    vals.push(req.params.optionId);
    db.prepare(`UPDATE modifier_options SET ${sets.join(',')} WHERE id=?`).run(...vals);
    res.json({ success: true });
  });

  router.delete('/menu/modifiers/:groupId/options/:optionId', (req, res) => {
    db.prepare('DELETE FROM modifier_options WHERE id=?').run(req.params.optionId);
    res.json({ success: true });
  });

  // Link modifier to item
  router.post('/menu/items/:id/modifiers', (req, res) => {
    const { group_id } = req.body;
    if (!group_id) return res.status(400).json({ error: 'group_id required' });
    db.prepare('INSERT OR IGNORE INTO item_modifier_groups (item_id, group_id) VALUES (?, ?)').run(req.params.id, group_id);
    res.json({ success: true });
  });

  router.delete('/menu/items/:itemId/modifiers/:groupId', (req, res) => {
    db.prepare('DELETE FROM item_modifier_groups WHERE item_id=? AND group_id=?').run(req.params.itemId, req.params.groupId);
    res.json({ success: true });
  });

  return router;
};
