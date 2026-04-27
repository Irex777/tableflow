const express = require('express');

module.exports = (db, broadcast) => {
  const router = express.Router();

  // POST add payment
  router.post('/orders/:id/payments', (req, res) => {
    const { amount, method, tip, reference } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount required' });

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'completed' || order.status === 'voided') return res.status(400).json({ error: 'Order is closed' });

    const existingPaid = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE order_id = ?').get(req.params.id).total;
    const remaining = order.total - existingPaid;
    if (amount > remaining + 0.01) return res.status(400).json({ error: `Amount exceeds remaining balance (${remaining.toFixed(2)})` });

    const result = db.prepare('INSERT INTO payments (order_id, amount, method, tip, reference) VALUES (?, ?, ?, ?, ?)')
      .run(req.params.id, amount, method || 'cash', tip || 0, reference || '');

    // Auto-close if fully paid
    const newTotal = existingPaid + amount;
    if (newTotal >= order.total - 0.01) {
      db.prepare("UPDATE orders SET status='completed', closed_at=CURRENT_TIMESTAMP WHERE id=?").run(req.params.id);
      db.prepare("UPDATE tables SET status='dirty' WHERE id=?").run(order.table_id);
      broadcast('orders', { action: 'closed', id: parseInt(req.params.id) });
      broadcast('tables', { action: 'update', id: order.table_id });
    }

    broadcast('orders', { action: 'payment', orderId: parseInt(req.params.id) });
    res.json({ id: result.lastInsertRowid, auto_closed: newTotal >= order.total - 0.01 });
  });

  // GET payments for order
  router.get('/orders/:id/payments', (req, res) => {
    const payments = db.prepare('SELECT * FROM payments WHERE order_id = ? ORDER BY created_at').all(req.params.id);
    res.json(payments);
  });

  return router;
};
