import { api, showToast, formatCurrency, formatTime, timeAgo, statusColor, statusLabel } from './utils.js';

export class OrdersPanel {
  constructor() {
    this.showAddItems = false;
  }

  render() {
    const container = document.getElementById('ordersList');
    const orders = window.APP.orders.filter(o => o.status === 'open' || o.status === 'fired');

    if (!orders.length) {
      container.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text3)"><div style="font-size:48px;margin-bottom:16px">📋</div>No active orders<br><span style="font-size:13px">Tap a table on the floor plan to create one</span></div>';
      return;
    }

    container.innerHTML = orders.map(o => `
      <div class="order-card" data-order-id="${o.id}">
        <div class="order-card-header">
          <div>
            <div class="order-card-title">${o.table_name || 'Unknown'}</div>
            <div class="order-card-time">${o.order_number} · ${timeAgo(o.opened_at)}</div>
          </div>
          <span class="order-card-status status-${o.status}">${statusLabel(o.status)}</span>
        </div>
        <div class="order-card-items">
          ${(o.items || []).filter(i => i.status !== 'voided').slice(0, 5).map(i => `
            <div>${i.quantity}× ${i.item_name} ${i.modifiers_text ? '<span style="color:var(--text3)">(' + i.modifiers_text + ')</span>' : ''}</div>
          `).join('')}
          ${o.items && o.items.length > 5 ? `<div style="color:var(--text3)">+${o.items.length - 5} more</div>` : ''}
        </div>
        <div class="order-card-footer">
          <span class="order-card-total">${formatCurrency(o.total)}</span>
          <span style="color:var(--text3);font-size:12px">${o.covers} covers · ${o.server_name || 'Unassigned'}</span>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('.order-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.dataset.orderId);
        const order = window.APP.orders.find(o => o.id === id);
        if (order) this.openOrderPanel(order);
      });
    });
  }

  async openOrderForTable(table) {
    // Check for existing open order
    const existing = window.APP.orders.find(o => o.table_id === table.id && (o.status === 'open' || o.status === 'fired'));
    if (existing) {
      await this.reloadOrder(existing.id);
      this.openOrderPanel(window.APP.openOrder);
    } else {
      // Create new order
      try {
        const order = await api('/orders', {
          method: 'POST',
          body: JSON.stringify({ table_id: table.id, covers: table.seats }),
        });
        await reloadOrders();
        await this.reloadOrder(order.id);
        this.openOrderPanel(window.APP.openOrder);
        showToast(`Order ${order.order_number} created`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  }

  async reloadOrder(orderId) {
    if (!orderId && window.APP.openOrder) orderId = window.APP.openOrder.id;
    if (!orderId) return;

    const orders = await api(`/orders?status=open,fired,completed`);
    const order = orders.find(o => o.id === orderId);
    if (order) {
      window.APP.openOrder = order;
      // Also refresh the orders list
      window.APP.orders = await api('/orders?status=open,fired');
    }
  }

  openOrderPanel(order) {
    window.APP.openOrder = order;
    window.APP.currentSeat = 1;
    window.APP.currentCourse = 1;
    window.APP.orderMenuCat = null;

    const panel = document.getElementById('orderPanel');
    panel.style.display = 'flex';
    this.renderOrderPanel();

    document.getElementById('orderPanelBackdrop').onclick = () => this.closeOrderPanel();
  }

  closeOrderPanel() {
    document.getElementById('orderPanel').style.display = 'none';
    window.APP.openOrder = null;
    this.showAddItems = false;
  }

  renderOrderPanel() {
    const order = window.APP.openOrder;
    if (!order) return;

    const table = window.APP.tables.find(t => t.id === order.table_id);
    const items = (order.items || []).filter(i => i.status !== 'voided');
    const pending = items.filter(i => i.status === 'pending');
    const fired = items.filter(i => i.status === 'fired');
    const ready = items.filter(i => i.status === 'ready');
    const served = items.filter(i => i.status === 'served');

    const seatCount = Math.max(order.covers || 1, ...items.map(i => i.seat || 1));
    const activeCat = window.APP.orderMenuCat;
    const catItems = activeCat ? window.APP.items.filter(i => i.category_id === activeCat && i.active && !i.is_86d) : [];

    document.getElementById('orderPanelContent').innerHTML = `
      <!-- Header -->
      <div class="order-header">
        <div class="order-header-left">
          <span class="order-table-name">${order.table_name || 'Table'}</span>
          <span class="order-status-badge status-${order.status}" style="background:${statusColor(order.status)}20;color:${statusColor(order.status)}">${statusLabel(order.status)}</span>
          <span class="order-timer">${timeAgo(order.opened_at)}</span>
        </div>
        <button class="order-close-btn" id="closeOrderPanel">&times;</button>
      </div>

      <!-- Seats -->
      <div class="order-seats">
        ${Array.from({ length: seatCount }, (_, i) => `
          <button class="seat-btn ${window.APP.currentSeat === i + 1 ? 'active' : ''}" data-seat="${i + 1}">Seat ${i + 1}</button>
        `).join('')}
      </div>

      <!-- Courses -->
      <div class="order-courses">
        ${[1, 2, 3].map(c => `
          <button class="course-btn ${window.APP.currentCourse === c ? 'active' : ''}" data-course="${c}">
            ${['Starter', 'Main', 'Dessert'][c - 1]}
          </button>
        `).join('')}
      </div>

      <div class="order-body">
        <!-- Items List -->
        <div class="order-items-list">
          ${!this.showAddItems ? `
            ${items.length === 0 ? '<div style="text-align:center;padding:30px;color:var(--text3)">No items yet. Tap "Add Items" below.</div>' : ''}
            ${items.map(item => `
              <div class="order-item" style="opacity:${item.status === 'voided' ? 0.3 : 1}">
                <span class="order-item-seat">${item.seat}</span>
                <div class="order-item-details">
                  <div class="order-item-name">${item.quantity}× ${item.item_name}</div>
                  ${item.modifiers_text ? `<div class="order-item-mods">${item.modifiers_text}</div>` : ''}
                  ${item.notes ? `<div class="order-item-mods">📝 ${item.notes}</div>` : ''}
                </div>
                <span class="order-item-price">${formatCurrency(item.quantity * item.unit_price)}</span>
                ${item.status === 'pending' ? `<button class="order-item-void" data-void="${item.id}">✕</button>` : ''}
              </div>
            `).join('')}
          ` : `
            <!-- Add Items Mode -->
            <div class="order-cats-row">
              ${window.APP.categories.map(c => `
                <button class="order-cat-btn ${activeCat === c.id ? 'active' : ''}" data-cat="${c.id}">${c.icon} ${c.name}</button>
              `).join('')}
            </div>
            <div class="order-items-add">
              ${catItems.map(item => `
                <button class="order-add-btn" data-add-item="${item.id}">
                  <div class="order-add-name">${item.name}</div>
                  <div class="order-add-price">${formatCurrency(item.price)}</div>
                </button>
              `).join('')}
              ${activeCat && catItems.length === 0 ? '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text3)">No items in this category</div>' : ''}
            </div>
          `}
        </div>

        <!-- Footer -->
        <div class="order-footer">
          <div class="order-totals">
            <span>Subtotal</span><span>${formatCurrency(order.subtotal)}</span>
          </div>
          <div class="order-totals">
            <span>Tax (${(order.tax_rate * 100).toFixed(0)}%)</span><span>${formatCurrency(order.tax)}</span>
          </div>
          ${order.discount_amount > 0 ? `<div class="order-totals"><span>Discount</span><span>-${formatCurrency(order.discount_amount)}</span></div>` : ''}
          <div class="order-totals total">
            <span>Total</span><span>${formatCurrency(order.total)}</span>
          </div>
          ${order.total_paid > 0 ? `<div class="order-totals"><span>Paid</span><span style="color:var(--success)">${formatCurrency(order.total_paid)}</span></div>` : ''}

          <div class="order-actions">
            ${!this.showAddItems ? `
              <button class="order-action-btn btn-add" id="toggleAddItems">+ Add Items</button>
              ${pending.length > 0 ? `<button class="order-action-btn btn-fire" id="fireOrder">🔥 Fire (${pending.length})</button>` : ''}
              <button class="order-action-btn btn-pay" id="payOrder">💳 Pay</button>
            ` : `
              <button class="order-action-btn" id="toggleAddItems" style="background:var(--surface3);color:var(--text)">✕ Done</button>
            `}
          </div>
        </div>
      </div>
    `;

    this.bindOrderEvents();
  }

  bindOrderEvents() {
    // Close
    document.getElementById('closeOrderPanel')?.addEventListener('click', () => this.closeOrderPanel());

    // Seats
    document.querySelectorAll('.seat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.APP.currentSeat = parseInt(btn.dataset.seat);
        this.renderOrderPanel();
      });
    });

    // Courses
    document.querySelectorAll('.course-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.APP.currentCourse = parseInt(btn.dataset.course);
        this.renderOrderPanel();
      });
    });

    // Toggle add items
    document.getElementById('toggleAddItems')?.addEventListener('click', () => {
      this.showAddItems = !this.showAddItems;
      if (this.showAddItems && !window.APP.orderMenuCat && window.APP.categories.length) {
        window.APP.orderMenuCat = window.APP.categories[0].id;
      }
      this.renderOrderPanel();
    });

    // Category select
    document.querySelectorAll('.order-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        window.APP.orderMenuCat = parseInt(btn.dataset.cat);
        this.renderOrderPanel();
      });
    });

    // Add item
    document.querySelectorAll('.order-add-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemId = parseInt(btn.dataset.addItem);
        const order = window.APP.openOrder;
        try {
          await api(`/orders/${order.id}/items`, {
            method: 'POST',
            body: JSON.stringify({
              items: [{
                menu_item_id: itemId,
                seat: window.APP.currentSeat,
                course: window.APP.currentCourse,
                quantity: 1,
                modifiers: [],
              }],
            }),
          });
          await this.reloadOrder();
          this.renderOrderPanel();
          showToast('Item added');
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    // Void item
    document.querySelectorAll('[data-void]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const itemId = parseInt(btn.dataset.void);
        try {
          await api(`/orders/${window.APP.openOrder.id}/items/${itemId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'voided', void_reason: 'Cancelled' }),
          });
          await this.reloadOrder();
          this.renderOrderPanel();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    // Fire order
    document.getElementById('fireOrder')?.addEventListener('click', async () => {
      try {
        await api(`/orders/${window.APP.openOrder.id}/fire`, { method: 'POST' });
        await this.reloadOrder();
        this.renderOrderPanel();
        showToast('Order fired to kitchen! 🔥', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    // Pay
    document.getElementById('payOrder')?.addEventListener('click', () => {
      this.openPaymentModal();
    });
  }

  openPaymentModal() {
    const order = window.APP.openOrder;
    if (!order) return;
    const remaining = order.total - (order.total_paid || 0);

    document.getElementById('paymentModal').style.display = 'flex';
    document.getElementById('paymentModalBody').innerHTML = `
      <div class="payment-total">${formatCurrency(remaining)}</div>
      <div class="split-options">
        <button class="split-btn active" data-split="full">Full</button>
        <button class="split-btn" data-split="even">Split Evenly</button>
        <button class="split-btn" data-split="custom">Custom</button>
      </div>
      <div id="splitContent"></div>
      <div class="payment-methods">
        <button class="pay-method-btn active" data-method="cash">💵 Cash</button>
        <button class="pay-method-btn" data-method="card">💳 Card</button>
        <button class="pay-method-btn" data-method="mobile">📱 Mobile</button>
      </div>
      <div class="payment-quick">
        <button class="payment-quick-btn" data-amount="${remaining.toFixed(2)}">Exact</button>
        ${[5, 10, 20, 50, 100].map(v => `<button class="payment-quick-btn" data-amount="${v}">${formatCurrency(v)}</button>`).join('')}
      </div>
      <div class="payment-actions">
        <div style="margin-bottom:8px">
          <input type="number" id="paymentAmount" value="${remaining.toFixed(2)}" step="0.01"
            style="width:100%;padding:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--radius);font-size:18px;text-align:center;font-weight:600">
        </div>
        <button class="payment-confirm-btn" id="confirmPayment">Confirm Payment</button>
      </div>
    `;

    let selectedMethod = 'cash';
    let selectedSplit = 'full';

    // Method select
    document.querySelectorAll('.pay-method-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedMethod = btn.dataset.method;
      });
    });

    // Split select
    document.querySelectorAll('.split-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.split-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedSplit = btn.dataset.split;
        const splitContent = document.getElementById('splitContent');
        if (selectedSplit === 'even') {
          const perPerson = remaining / (order.covers || 1);
          splitContent.innerHTML = `<div style="text-align:center;padding:12px;color:var(--text2)">${order.covers} × ${formatCurrency(perPerson)}</div>`;
          document.getElementById('paymentAmount').value = perPerson.toFixed(2);
        } else if (selectedSplit === 'full') {
          splitContent.innerHTML = '';
          document.getElementById('paymentAmount').value = remaining.toFixed(2);
        }
      });
    });

    // Quick amounts
    document.querySelectorAll('.payment-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('paymentAmount').value = btn.dataset.amount;
      });
    });

    // Confirm
    document.getElementById('confirmPayment').addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('paymentAmount').value);
      if (!amount || amount <= 0) return showToast('Invalid amount', 'error');
      try {
        const result = await api(`/orders/${order.id}/payments`, {
          method: 'POST',
          body: JSON.stringify({ amount, method: selectedMethod }),
        });
        showToast('Payment recorded', 'success');
        document.getElementById('paymentModal').style.display = 'none';
        await this.reloadOrder();
        if (result.auto_closed) {
          this.closeOrderPanel();
          showToast('Order completed! ✅', 'success');
        } else {
          this.renderOrderPanel();
        }
        await reloadOrders();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('paymentModalClose').addEventListener('click', () => {
      document.getElementById('paymentModal').style.display = 'none';
    });
  }
}

// Export for floorplan to call
export function openOrderForTable(table) {
  const panel = new OrdersPanel();
  panel.openOrderForTable(table);
}

async function reloadOrders() {
  window.APP.orders = await api('/orders?status=open,fired');
}

async function reloadOrder(orderId) {
  if (!orderId && window.APP.openOrder) orderId = window.APP.openOrder.id;
  if (!orderId) return;
  const orders = await api('/orders?status=open,fired,completed');
  const order = orders.find(o => o.id === orderId);
  if (order) {
    window.APP.openOrder = order;
    await reloadOrders();
  }
}
