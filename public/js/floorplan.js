import { api, statusColor, statusLabel, formatCurrency } from './utils.js';

let tables = [];
let activeOrders = {};

export async function loadTables() {
  const data = await api('/tables');
  tables = data;
  renderTables();
}

export function setActiveOrders(orders) { activeOrders = orders || {}; }

export function renderTables() {
  const grid = document.getElementById('tablesGrid');
  const legend = document.getElementById('tablesLegend');
  if (!grid) return;

  if (legend) {
    legend.innerHTML = ['available','occupied','reserved','dirty','blocked'].map(s =>
      `<div class="legend-item"><div class="legend-dot" style="background:${statusColor(s)}"></div><span>${statusLabel(s)}</span></div>`
    ).join('');
  }

  grid.innerHTML = tables.map(t => {
    const order = activeOrders[t.id];
    const total = order ? order.items.reduce((s,i) => s + i.price * i.qty, 0) : 0;
    return `<div class="table-card" data-status="${t.status}" data-id="${t.id}">
      <div class="table-status-dot" style="background:${statusColor(t.status)}"></div>
      <h3 class="table-name">${t.name}</h3>
      <p class="table-seats">${t.seats} Seats</p>
      ${order ? `<div class="table-order">${formatCurrency(total)} &middot; ${order.status}</div>` : ''}
    </div>`;
  }).join('');

  grid.querySelectorAll('.table-card').forEach(card => {
    card.addEventListener('click', () => {
      window.currentTableId = card.dataset.id;
      import('./app.js').then(m => m.switchTab('pos'));
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

export async function updateTableStatus(id, status) {
  await api(`/tables/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
  tables = tables.map(t => t.id === id ? { ...t, status } : t);
  renderTables();
}
