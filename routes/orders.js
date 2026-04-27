const express = require('express');

module.exports = (db, broadcast) => {
  const router = express.Router();

  function recalcOrder(orderId) {
    const items = db.prepare(`SELECT COALESCE(SUM(CASE WHEN status != 'voided' THEN quantity * unit_price ELSE 0 END), 0) as subtotal
      FROM order_items WHERE order_id = ?`).get(orderId);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return;

    const subtotal = items.subtotal;
    const discountAmount = order.discount_type === 'percent' ? subtotal * (order.discount_value / 100)
      : order.discount_type === 'fixed' ? order.discount_value : 0;
    const afterDiscount = subtotal - discountAmount;
    const tax = afterDiscount * order.tax_rate;
    const total = afterDiscount + tax;

    db.prepare('UPDATE orders SET subtotal=?, tax=?, discount_amount=?, total=? WHERE id=?')
      .run(subtotal, Math.round(tax * 100) / 100, discountAmount, Math.round(total * 100) / 100, orderId);
  }

  function nextOrderNumber() {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'order_counter'").get();
    const counter = parseInt(row?.value || '0') + 1;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('order_counter', ?)").run(String(counter));
    return `ORD-${String(counter).padStart(4, '0')}`;
  }

  // GET orders
  router.get('/orders', (req, res) => {
    const { status, table_id, date } = req.query;
    let query = `SELECT o.*, t.name as table_name, t.status as table_status
      FROM orders o LEFT JOIN tables t ON o.table_id = t.id WHERE 1=1`;
    const params = [];
    if (status) { query += ' AND o.status IN (' + status.split(',').map(() => '?').join(',') + ')'; params.push(...status.split(',')); }
    if (table_id) { query += ' AND o.table_id = ?'; params.push(table_id); }
    if (date) { query += " AND DATE(o.opened_at) = ?"; params.push(date); }
    query += ' ORDER BY o.opened_at DESC LIMIT 200';
    const orders = db.prepare(query).all(...params);

    for (const o of orders) {
      o.items = db.prepare(`SELECT oi.*, mi.name as item_name, mi.category_id
        FROM order_items oi LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = ? ORDER BY oi.seat, oi.course, oi.created_at`).all(o.id);
      o.payments = db.prepare('SELECT * FROM payments WHERE order_id = ?').all(o.id);
      o.total_paid = o.payments.reduce((s, p) => s + p.amount, 0);
    }
    res.json(orders);
  });

  // POST create order
  router.post('/orders', (req, res) => {
    const { table_id, covers, server_name, notes } = req.body;
    if (!table_id) return res.status(400).json({ error: 'table_id required' });

    const table = db.prepare('SELECT * FROM tables WHERE id = ?').get(table_id);
    if (!table) return res.status(404).json({ error: 'Table not found' });

    const orderNumber = nextOrderNumber();
    const result = db.prepare(`INSERT INTO orders (table_id, order_number, covers, server_name, notes)
      VALUES (?, ?, ?, ?, ?)`)
      .run(table_id, orderNumber, covers || 1, server_name || '', notes || '');

    // Set table to occupied
    db.prepare('UPDATE tables SET status = ? WHERE id = ?').run('occupied', table_id);

    recalcOrder(result.lastInsertRowid);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid);
    broadcast('tables', { action: 'update', id: table_id });
    broadcast('orders', { action: 'create', id: result.lastInsertRowid });
    res.json(order);
  });

  // PATCH update order
  router.patch('/orders/:id', (req, res) => {
    const { status, covers, notes, discount_type, discount_value, tax_rate } = req.body;
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const sets = []; const vals = [];
    if (covers !== undefined) { sets.push('covers=?'); vals.push(covers); }
    if (notes !== undefined) { sets.push('notes=?'); vals.push(notes); }
    if (discount_type !== undefined) { sets.push('discount_type=?'); vals.push(discount_type); }
    if (discount_value !== undefined) { sets.push('discount_value=?'); vals.push(discount_value); }
    if (tax_rate !== undefined) { sets.push('tax_rate=?'); vals.push(tax_rate); }
    if (status !== undefined) {
      sets.push('status=?'); vals.push(status);
      if (status === 'completed' || status === 'voided') { sets.push('closed_at=CURRENT_TIMESTAMP'); }
    }
    if (!sets.length) return res.status(400).json({ error: 'No fields' });
    vals.push(req.params.id);
    db.prepare(`UPDATE orders SET ${sets.join(',')} WHERE id=?`).run(...vals);
    recalcOrder(req.params.id);
    broadcast('orders', { action: 'update', id: parseInt(req.params.id) });
    res.json({ success: true });
  });

  // POST add item(s) to order
  router.post('/orders/:id/items', (req, res) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'completed' || order.status === 'voided') return res.status(400).json({ error: 'Order is closed' });

    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items array required' });

    const stmt = db.prepare(`INSERT INTO order_items (order_id, menu_item_id, seat, course, quantity, unit_price, modifiers_json, modifiers_text, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertAll = db.transaction((rows) => {
      for (const item of rows) {
        const menuItem = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(item.menu_item_id);
        if (!menuItem) continue;
        stmt.run(
          req.params.id, item.menu_item_id, item.seat || 1, item.course || 1,
          item.quantity || 1, menuItem.price,
          JSON.stringify(item.modifiers || []),
          (item.modifiers || []).map(m => m.name).join(', '),
          item.notes || ''
        );
      }
    });
    insertAll(items);
    recalcOrder(req.params.id);
    broadcast('orders', { action: 'items_added', orderId: parseInt(req.params.id) });
    res.json({ success: true });
  });

  // PATCH update order item
  router.patch('/orders/:id/items/:itemId', (req, res) => {
    const { status, quantity, notes, void_reason } = req.body;
    const item = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?').get(req.params.itemId, req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const sets = []; const vals = [];
    if (status !== undefined) {
      sets.push('status=?'); vals.push(status);
      if (status === 'fired') sets.push('fired_at=CURRENT_TIMESTAMP');
      if (status === 'served') sets.push('served_at=CURRENT_TIMESTAMP');
      if (status === 'voided') { sets.push('void_reason=?'); vals.push(void_reason || ''); }
    }
    if (quantity !== undefined) { sets.push('quantity=?'); vals.push(quantity); }
    if (notes !== undefined) { sets.push('notes=?'); vals.push(notes); }
    if (!sets.length) return res.status(400).json({ error: 'No fields' });
    vals.push(req.params.itemId);
    db.prepare(`UPDATE order_items SET ${sets.join(',')} WHERE id=?`).run(...vals);
    recalcOrder(req.params.id);
    broadcast('orders', { action: 'item_update', orderId: parseInt(req.params.id) });
    res.json({ success: true });
  });

  // DELETE remove pending item
  router.delete('/orders/:id/items/:itemId', (req, res) => {
    const item = db.prepare('SELECT * FROM order_items WHERE id=? AND order_id=? AND status=?').get(req.params.itemId, req.params.id, 'pending');
    if (!item) return res.status(400).json({ error: 'Only pending items can be removed' });
    db.prepare('DELETE FROM order_items WHERE id=?').run(req.params.itemId);
    recalcOrder(req.params.id);
    broadcast('orders', { action: 'item_removed', orderId: parseInt(req.params.id) });
    res.json({ success: true });
  });

  // POST fire order (send all pending items to kitchen)
  router.post('/orders/:id/fire', (req, res) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const fire = db.transaction(() => {
      db.prepare("UPDATE order_items SET status='fired', fired_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='pending'")
        .run(req.params.id);
      db.prepare("UPDATE orders SET status='fired', fired_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'")
        .run(req.params.id);
    });
    fire();
    broadcast('orders', { action: 'fired', id: parseInt(req.params.id) });
    broadcast('kds', { action: 'new_order' });
    res.json({ success: true });
  });

  // POST close order
  router.post('/orders/:id/close', (req, res) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const close = db.transaction(() => {
      db.prepare("UPDATE orders SET status='completed', closed_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
      // Set table to dirty
      db.prepare("UPDATE tables SET status='dirty' WHERE id=?").run(order.table_id);
    });
    close();
    broadcast('orders', { action: 'closed', id: parseInt(req.params.id) });
    broadcast('tables', { action: 'update', id: order.table_id });
    res.json({ success: true });
  });

  return router;
};
