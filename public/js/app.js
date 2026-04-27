import { formatCurrency, formatTime, showToast, api, statusColor, timeAgo } from './utils.js';
import { FloorPlan } from './floorplan.js';
import { OrdersPanel } from './orders.js';
import { MenuPanel } from './menu.js';
import { KDSPanel } from './kds.js';
import { MorePanel } from './more.js';

// Global state
window.APP = {
  tables: [],
  orders: [],
  categories: [],
  items: [],
  sections: [],
  modifiers: [],
  staff: [],
  settings: {},
  activeTab: 'Floor',
  activeSection: 'all',
  filterStatus: 'all',
  editingFloor: false,
  selectedTable: null,
  openOrder: null,
  currentSeat: 1,
  currentCourse: 1,
  orderMenuCat: null,
};

// Sub-modules
let floorPlan, ordersPanel, menuPanel, kdsPanel, morePanel;

// --- Init ---
async function init() {
  try {
    await loadSettings();
    await Promise.all([loadSections(), loadTables(), loadCategories(), loadItems(), loadModifiers(), loadStaff()]);
    initWebSocket();
    initClock();
    initNavigation();
    initFilters();
    initSectionTabs();

    floorPlan = new FloorPlan();
    ordersPanel = new OrdersPanel();
    menuPanel = new MenuPanel();
    kdsPanel = new KDSPanel();
    morePanel = new MorePanel();

    floorPlan.render();
    updateStatusBar();
    await loadActiveOrders();

    // Check user session for header
    try {
      const me = await api('/auth/me');
      document.getElementById('currentUser').textContent = me.user?.name || '';
    } catch {}

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await api('/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    });

    console.log('TableFlow POS initialized');
  } catch (err) {
    console.error('Init error:', err);
    showToast('Failed to initialize', 'error');
  }
}

// --- Data Loading ---
async function loadSettings() {
  window.APP.settings = await api('/settings');
  window.APP_SETTINGS = {};
  for (const [k, v] of Object.entries(window.APP.settings)) {
    try { window.APP_SETTINGS[k] = JSON.parse(v); } catch { window.APP_SETTINGS[k] = v; }
  }
}

async function loadSections() {
  window.APP.sections = await api('/sections');
  renderSectionTabs();
}

async function loadTables() {
  window.APP.tables = await api('/tables');
  if (floorPlan) floorPlan.render();
  updateStatusBar();
}

async function loadCategories() {
  window.APP.categories = await api('/menu/categories');
}

async function loadItems() {
  window.APP.items = await api('/menu/items');
}

async function loadModifiers() {
  window.APP.modifiers = await api('/menu/modifiers');
}

async function loadStaff() {
  window.APP.staff = await api('/staff');
}

async function loadActiveOrders() {
  window.APP.orders = await api('/orders?status=open,fired');
  if (ordersPanel) ordersPanel.render();
}

// --- Clock ---
function initClock() {
  const el = document.getElementById('currentTime');
  function tick() {
    const now = new Date();
    el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  tick();
  setInterval(tick, 10000);
}

// --- Navigation ---
function initNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  window.APP.activeTab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.toggle('active', t.id === `tab${tab}`));

  if (tab === 'Floor' && floorPlan) floorPlan.render();
  if (tab === 'Orders' && ordersPanel) ordersPanel.render();
  if (tab === 'Menu' && menuPanel) menuPanel.render();
  if (tab === 'Kitchen') kdsPanel?.load();
}

// --- Filters ---
function initFilters() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.APP.filterStatus = btn.dataset.filter;
      if (floorPlan) floorPlan.render();
    });
  });
}

// --- Section Tabs ---
function initSectionTabs() {
  renderSectionTabs();
  document.getElementById('sectionTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.section-tab');
    if (!btn) return;
    document.querySelectorAll('.section-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window.APP.activeSection = btn.dataset.section;
    if (floorPlan) floorPlan.render();
  });
}

function renderSectionTabs() {
  const container = document.getElementById('sectionTabs');
  const sections = window.APP.sections;
  let html = `<button class="section-tab ${window.APP.activeSection === 'all' ? 'active' : ''}" data-section="all">All Sections</button>`;
  for (const s of sections) {
    html += `<button class="section-tab ${window.APP.activeSection == s.id ? 'active' : ''}" data-section="${s.id}">${s.icon} ${s.name}</button>`;
  }
  container.innerHTML = html;
}

// --- Status Bar ---
function updateStatusBar() {
  const tables = window.APP.tables;
  const occupied = tables.filter(t => t.status === 'occupied').length;
  const available = tables.filter(t => t.status === 'available').length;
  const total = tables.length;
  document.getElementById('statusOccupied').textContent = `${occupied}/${total} occupied`;
  document.getElementById('statusAvailable').textContent = `${available} available`;
  document.getElementById('statusRevenue').textContent = `${formatCurrency(0)} today`;
}

// --- WebSocket ---
function initWebSocket() {
  let ws;
  let reconnectTimer;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws`);

    ws.onopen = () => {
      document.getElementById('connectionStatus').className = 'ws-status ws-connected';
      console.log('WebSocket connected');
    };

    ws.onclose = () => {
      document.getElementById('connectionStatus').className = 'ws-status ws-disconnected';
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
      try {
        const { type, payload } = JSON.parse(event.data);
        handleWSMessage(type, payload);
      } catch (err) {
        console.error('WS parse error:', err);
      }
    };
  }

  connect();
}

async function handleWSMessage(type, payload) {
  switch (type) {
    case 'tables':
      await loadTables();
      break;
    case 'orders':
      if (payload?.action === 'create' || payload?.action === 'closed') {
        await loadActiveOrders();
      }
      if (window.APP.openOrder?.id === payload?.orderId) {
        await ordersPanel.reloadOrder();
      }
      ordersPanel?.render();
      break;
    case 'kds':
      if (window.APP.activeTab === 'Kitchen') kdsPanel?.load();
      break;
    case 'menu':
      await Promise.all([loadCategories(), loadItems(), loadModifiers()]);
      if (menuPanel) menuPanel.render();
      break;
    case 'reservations':
    case 'waitlist':
      morePanel?.loadReservations();
      morePanel?.loadWaitlist();
      break;
    case 'notification':
      showToast(payload.message || payload, payload.type || 'info');
      break;
  }
}

// --- Start ---
document.addEventListener('DOMContentLoaded', init);
