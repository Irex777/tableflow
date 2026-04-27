const express = require('express');

module.exports = (db, broadcast) => {
  const router = express.Router();

  function getDateFilter(period) {
    const now = new Date();
    switch (period) {
      case 'today': return `DATE(opened_at) = DATE('now')`;
      case 'week': return `opened_at >= DATE('now', '-7 days')`;
      case 'month': return `opened_at >= DATE('now', '-30 days')`;
      default: return '1=1';
    }
  }

  // Overview
  router.get('/analytics/overview', (req, res) => {
    const period = req.query.period || 'today';
    const filter = getDateFilter(period);

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(SUM(covers), 0) as total_covers,
        COALESCE(AVG(total), 0) as avg_check,
        COALESCE(SUM(tax), 0) as total_tax,
        COALESCE(SUM(discount_amount), 0) as total_discounts
      FROM orders WHERE ${filter} AND status = 'completed'
    `).get();

    const payments = db.prepare(`
      SELECT method, COUNT(*) as count, SUM(amount) as total, SUM(tip) as tips
      FROM payments WHERE ${filter.replace(/opened_at/g, 'created_at')}
      GROUP BY method
    `).all();

    res.json({ ...stats, payments });
  });

  // Table analytics
  router.get('/analytics/tables', (req, res) => {
    const period = req.query.period || 'today';
    const filter = getDateFilter(period);

    const tables = db.prepare(`
      SELECT t.id, t.name, t.section_id, s.name as section_name,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total), 0) as revenue,
        COALESCE(AVG(o.covers), 0) as avg_covers,
        COALESCE(AVG((JULIANDAY(o.closed_at) - JULIANDAY(o.opened_at)) * 1440), 0) as avg_seat_time_min
      FROM tables t
      LEFT JOIN orders o ON o.table_id = t.id AND ${filter} AND o.status = 'completed'
      LEFT JOIN sections s ON t.section_id = s.id
      GROUP BY t.id
      ORDER BY revenue DESC
    `).all();

    res.json(tables);
  });

  // Item analytics
  router.get('/analytics/items', (req, res) => {
    const period = req.query.period || 'today';
    const filter = getDateFilter(period);

    const items = db.prepare(`
      SELECT mi.name, mc.name as category_name,
        SUM(oi.quantity) as qty_sold,
        SUM(oi.quantity * oi.unit_price) as revenue
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      JOIN menu_categories mc ON mi.category_id = mc.id
      JOIN orders o ON oi.order_id = o.id AND ${filter} AND o.status = 'completed'
      WHERE oi.status != 'voided'
      GROUP BY mi.id
      ORDER BY qty_sold DESC
      LIMIT 30
    `).all();

    const categories = db.prepare(`
      SELECT mc.name, mc.color, mc.icon,
        COUNT(DISTINCT oi.id) as items_sold,
        SUM(oi.quantity * oi.unit_price) as revenue
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      JOIN menu_categories mc ON mi.category_id = mc.id
      JOIN orders o ON oi.order_id = o.id AND ${filter} AND o.status = 'completed'
      WHERE oi.status != 'voided'
      GROUP BY mc.id
      ORDER BY revenue DESC
    `).all();

    res.json({ items, categories });
  });

  // Staff analytics
  router.get('/analytics/staff', (req, res) => {
    const period = req.query.period || 'today';
    const filter = getDateFilter(period);

    const staff = db.prepare(`
      SELECT o.server_name,
        COUNT(*) as order_count,
        COALESCE(SUM(o.total), 0) as revenue,
        COALESCE(SUM(o.covers), 0) as covers_served,
        COALESCE(AVG(o.total), 0) as avg_check
      FROM orders o
      WHERE ${filter} AND o.status = 'completed' AND o.server_name != ''
      GROUP BY o.server_name
      ORDER BY revenue DESC
    `).all();

    res.json(staff);
  });

  // Hourly breakdown
  router.get('/analytics/hourly', (req, res) => {
    const period = req.query.period || 'today';
    const filter = getDateFilter(period);

    const hourly = db.prepare(`
      SELECT CAST(strftime('%H', opened_at) AS INTEGER) as hour,
        COUNT(*) as order_count,
        COALESCE(SUM(total), 0) as revenue,
        COALESCE(SUM(covers), 0) as covers
      FROM orders
      WHERE ${filter} AND status = 'completed'
      GROUP BY hour
      ORDER BY hour
    `).all();

    // Fill in missing hours
    const result = [];
    for (let h = 6; h <= 23; h++) {
      const found = hourly.find(r => r.hour === h);
      result.push({ hour: h, order_count: found?.order_count || 0, revenue: found?.revenue || 0, covers: found?.covers || 0 });
    }
    res.json(result);
  });

  return router;
};
