import { api, formatTime } from './utils.js';

let timerInterval = null;

export async function refresh() {
  try {
    const orders = await api('/orders?status=kitchen');
    render(orders);
  } catch (err) {
    console.error('Failed to load kitchen orders:', err);
  }
}

export function init() {
  refresh();
}

function render(orders) {
  const board = document.getElementById('kdsBoard');
  const count = document.getElementById('kdsCount');
  count.textContent = `${orders.length} order${orders.length !== 1 ? 's' : ''}`;

  if (!orders.length) {
    board.innerHTML = '<div class="kds-empty"><i data-lucide="chef-hat"></i><span>No orders in kitchen</span></div>';
    window.lucide?.createIcons();
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
                ${item.item_notes ? `<div class="kds-item-mods"><i data-lucide="pencil-line" style="width:12px;height:12px;vertical-align:middle"></i> ${item.item_notes}</div>` : ''}
              </div>
              <button class="kds-bump-btn" data-order-id="${o.id}" data-item-id="${item.id}"><i data-lucide="check" style="width:14px;height:14px;vertical-align:middle"></i> Done</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  window.lucide?.createIcons();

  board.querySelectorAll('.kds-bump-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/orders/${btn.dataset.orderId}/status`, {
          method: 'PUT',
          body: JSON.stringify({ itemId: btn.dataset.itemId, status: 'completed' }),
        });
        refresh();
      } catch (err) {
        console.error('Bump failed:', err);
      }
    });
  });

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
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
