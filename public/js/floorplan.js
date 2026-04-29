import { api, statusColor, statusLabel, formatCurrency } from './utils.js';

let tables = [];
let sections = [];
let activeOrders = {};
let activeSection = 'all';
let activeStatus = 'all';

export async function loadTables() {
  const data = await api('/tables');
  tables = data;
  renderTables();
}

export function setActiveOrders(orders) { activeOrders = orders || {}; }

export function setSections(data) { sections = data || []; }

function renderSectionTabs() {
  const container = document.getElementById('sectionTabs');
  if (!container) return;
  let html = `<button class="section-tab ${activeSection === 'all' ? 'active' : ''}" data-section="all">All Sections</button>`;
  sections.forEach(section => {
    html += `<button class="section-tab ${activeSection == section.id ? 'active' : ''}" data-section="${section.id}">${section.name}</button>`;
  });
  container.innerHTML = html;
  container.querySelectorAll('.section-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSection = btn.dataset.section;
      renderTables();
    });
  });
}

function renderStatusFilters() {
  const container = document.getElementById('statusFilters');
  if (!container) return;
  const statuses = ['all', 'available', 'occupied', 'reserved', 'dirty', 'blocked'];
  const labels = ['All', 'Available', 'Occupied', 'Reserved', 'Needs Cleaning', 'Blocked'];
  container.innerHTML = statuses.map((s, i) => {
    const dot = s !== 'all' ? `<span class="status-dot" style="background:${statusColor(s)}"></span>` : '';
    return `<button class="status-filter-btn ${activeStatus === s ? 'active' : ''}" data-status="${s}">${dot}${labels[i]}</button>`;
  }).join('');
  container.querySelectorAll('.status-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeStatus = btn.dataset.status;
      renderTables();
    });
  });
}

export function renderTables() {
  const grid = document.getElementById('tablesGrid');
  const legend = document.getElementById('tablesLegend');
  if (!grid) return;

  renderSectionTabs();
  renderStatusFilters();

  const contextMenu = document.getElementById("tableContextMenu");
  if (contextMenu) {
    const statuses = [
      { value: "available", label: "Available" },
      { value: "occupied", label: "Occupied" },
      { value: "reserved", label: "Reserved" },
      { value: "dirty", label: "Needs Cleaning" },
      { value: "blocked", label: "Blocked" },
    ];
    contextMenu.innerHTML = statuses.map(s =>
      `<button class="ctx-menu-item" data-set-status="${s.value}"><span class="status-dot" style="background:${statusColor(s.value)}"></span>${s.label}</button>`
    ).join("");
  }

  if (legend) {
    legend.innerHTML = ['available','occupied','reserved','dirty','blocked'].map(s =>
      `<div class="legend-item"><div class="legend-dot" style="background:${statusColor(s)}"></div><span>${statusLabel(s)}</span></div>`
    ).join('');
  }

  let filtered = tables;
  if (activeSection !== 'all') filtered = filtered.filter(t => t.section_id == activeSection);
  if (activeStatus !== 'all') filtered = filtered.filter(t => t.status === activeStatus);

  grid.innerHTML = filtered.map(t => {
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

    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const menu = document.getElementById('tableContextMenu');
      if (!menu) return;
      menu.style.display = 'block';
      menu.style.left = e.clientX + 'px';
      menu.style.top = e.clientY + 'px';
      menu.dataset.tableId = card.dataset.id;
    });
  });

  document.addEventListener('click', () => {
    const menu = document.getElementById('tableContextMenu');
    if (menu) menu.style.display = 'none';
  });

  const contextMenu = document.getElementById('tableContextMenu');
  if (contextMenu) {
    contextMenu.querySelectorAll('[data-set-status]').forEach(item => {
      item.addEventListener('click', async () => {
        const id = contextMenu.dataset.tableId;
        const newStatus = item.dataset.setStatus;
        await api(`/tables/${id}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
        tables = tables.map(t => t.id == id ? { ...t, status: newStatus } : t);
        contextMenu.style.display = 'none';
        renderTables();
      });
    });
  }

  if (window.lucide) window.lucide.createIcons();
}

export async function updateTableStatus(id, status) {
  await api(`/tables/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  tables = tables.map(t => t.id === id ? { ...t, status } : t);
  renderTables();
}
