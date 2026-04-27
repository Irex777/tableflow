const express = require('express');

module.exports = (db, broadcast) => {
  const router = express.Router();

  // GET active kitchen orders
  router.get('/kds/orders', (req, res) => {
    const orders = db.prepare(`
      SELECT o.id, o.order_number, o.table_id, o.covers, o.opened_at, o.fired_at, o.notes, o.server_name,
        t.name as table_name
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE o.status IN ('open', 'fired')
      ORDER BY o.fired_at ASC, o.opened_at ASC
    `).all();

    for (const o of orders) {
      o.items = db.prepare(`
        SELECT oi.id, oi.menu_item_id, oi.seat, oi.course, oi.status, oi.quantity,
          oi.unit_price, oi.modifiers_text, oi.notes as item_notes, oi.created_at, oi.fired_at,
          mi.name as item_name
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = ? AND oi.status IN ('fired', 'pending')
        ORDER BY oi.course, oi.seat, oi.created_at
      `).all(o.id);

      // Calculate time since fired
      if (o.fired_at) {
        o.fired_minutes_ago = Math.round((Date.now() - new Date(o.fired_at).getTime()) / 60000);
      }
      // Only include orders that have items to prepare
      if (o.items.length === 0) {
        orders.splice(orders.indexOf(o), 1);
      }
    }

    res.json(orders.filter(o => o.items.length > 0));
  });

  // POST bump item (mark ready)
  router.post('/kds/bump/:itemId', (req, res) => {
    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (item.status !== 'fired') return res.status(400).json({ error: 'Item not in fired state' });

    db.prepare("UPDATE order_items SET status='ready', served_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.itemId);

    // Check if all items in order are ready/served
    const pending = db.prepare("SELECT COUNT(*) as c FROM order_items WHERE order_id=? AND status IN ('pending','fired')").get(item.order_id).c;
    if (pending === 0) {
      broadcast('orders', { action: 'all_ready', orderId: item.order_id });
    }

    broadcast('kds', { action: 'bump', itemId: parseInt(req.params.itemId) });
    broadcast('orders', { action: 'item_update', orderId: item.order_id });
    res.json({ success: true, all_ready: pending === 0 });
  });

  return router;
};
