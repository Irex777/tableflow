import { api, showToast, formatCurrency, timeAgo } from './utils.js';

export class KDSPanel {
  constructor() {
    this.timerInterval = null;
  }

  async load() {
    try {
      const orders = await api('/kds/orders');
      this.render(orders);
    } catch (err) {
      showToast('Failed to load kitchen orders', 'error');
    }
  }

  render(orders) {
    const board = document.getElementById('kdsBoard');
    const count = document.getElementById('kdsCount');
    count.textContent = `${orders.length} orders`;

    if (!orders.length) {
      board.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text3);font-size:18px">🍳 No orders in kitchen</div>';
      return;
    }

    board.innerHTML = orders.map(o => {
      const mins = o.fired_minutes_ago || 0;
      const urgent = mins >= 10;
      const warn = mins >= 5;
      const timerClass = urgent ? 'danger' : warn ? 'warning' : '';

      return `
        <div class="kds-card ${urgent ? 'urgent' : ''}">
          <div class="kds-card-header">
            <span class="kds-table-name">${o.table_name || '?'}</span>
            <span class="kds-timer ${timerClass}">${o.order_number} · ${mins}m</span>
          </div>
          <div class="kds-items">
            ${o.items.map(item => `
              <div class="kds-item">
                <span class="kds-item-seat">S${item.seat}</span>
                <div class="kds-item-info">
                  <div class="kds-item-name">${item.quantity}× ${item.item_name}</div>
                  ${item.modifiers_text ? `<div class="kds-item-mods">${item.modifiers_text}</div>` : ''}
                  ${item.item_notes ? `<div class="kds-item-mods">📝 ${item.item_notes}</div>` : ''}
                </div>
                <button class="kds-bump-btn" data-bump="${item.id}">Done</button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

    // Bump buttons
    board.querySelectorAll('.kds-bump-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const result = await api(`/kds/bump/${btn.dataset.bump}`, { method: 'POST' });
          showToast('Item bumped ✅', 'success');
          this.load();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    // Auto-refresh timer display
    clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      document.querySelectorAll('.kds-timer').forEach(el => {
        const text = el.textContent;
        const match = text.match(/(\d+)m/);
        if (match) {
          const mins = parseInt(match[1]) + 1;
          el.textContent = text.replace(/\d+m/, `${mins}m`);
          el.className = `kds-timer ${mins >= 10 ? 'danger' : mins >= 5 ? 'warning' : ''}`;
        }
      });
    }, 60000);
  }
}
