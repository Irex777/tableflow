import { formatCurrency, showToast, api, emojiToLucide } from './utils.js';
import * as floorplan from './floorplan.js';
import * as orders from './orders.js';
import * as kds from './kds.js';
import * as more from './more.js';

export let currentTableId = null;
export let APP_SETTINGS = {};

const PAGE_TITLES = {
  tables: 'Floor Plan',
  pos: 'Terminal',
  orders: 'Orders',
  kitchen: 'Kitchen Display',
  staff: 'Staff',
  settings: 'Settings',
};

// --- Init ---
async function init() {
  try {
    await loadSettings();
    await Promise.all([
      floorplan.loadTables(),
      orders.loadMenu(),
      loadStaff(),
      loadSections(),
    ]);

    initClock();
    initNavigation();
    initWebSocket();

    switchTab('tables');
    kds.init();

    // Session
    try {
      const me = await api('/auth/me');
      const el = document.getElementById('currentUser');
      if (el) el.textContent = me.user?.name || '';
    } catch {}

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await api('/auth/logout', { method: 'POST' });
        window.location.href = '/login';
      });
    }

    console.log('TableFlow POS initialized');
  } catch (err) {
    console.error('Init error:', err);
    showToast('Failed to initialize', 'error');
  }
}

// --- Settings ---
async function loadSettings() {
  const settings = await api('/settings');
  APP_SETTINGS = {};
  for (const [k, v] of Object.entries(settings)) {
    try { APP_SETTINGS[k] = JSON.parse(v); } catch { APP_SETTINGS[k] = v; }
  }
}

async function loadStaff() {
  // kept for future use
}

async function loadSections() {
  try {
    const data = await api("/sections");
    if (data && data.length) floorplan.setSections(data);
  } catch (err) { console.error("Failed to load sections:", err); }
}

// --- Clock ---
function initClock() {
  const el = document.getElementById('currentTime');
  if (!el) return;
  function tick() {
    el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  tick();
  setInterval(tick, 1000);
}

// --- Navigation ---
function initNavigation() {
  document.querySelectorAll('.sidebar-item[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

export function switchTab(name) {
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

  const sidebarItem = document.querySelector(`.sidebar-item[data-tab="${name}"]`);
  if (sidebarItem) sidebarItem.classList.add('active');

  const tabId = 'tab' + name.charAt(0).toUpperCase() + name.slice(1);
  const tabEl = document.getElementById(tabId);
  if (tabEl) tabEl.classList.add('active');

  const titleEl = document.getElementById('pageTitle');
  if (titleEl) titleEl.textContent = PAGE_TITLES[name] || name;

  if (name === 'tables') floorplan.renderTables();
  if (name === 'orders') { orders.refresh(); orders.renderOrdersList?.(); }
  if (name === 'kitchen') kds.refresh();
  if (name === 'staff') more.renderStaff();
  if (name === 'settings') more.renderSettings();

  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// --- WebSocket ---
function initWebSocket() {
  let ws;
  let reconnectTimer;

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}/ws`);

    ws.onopen = () => {
      const el = document.getElementById('connectionStatus');
      if (el) el.className = 'ws-status ws-connected';
      console.log('WebSocket connected');
    };

    ws.onclose = () => {
      const el = document.getElementById('connectionStatus');
      if (el) el.className = 'ws-status ws-disconnected';
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

function handleWSMessage(type, payload) {
  switch (type) {
    case 'table_update':
      floorplan.renderTables();
      break;
    case 'order_update':
    case 'kds_refresh':
      kds.refresh();
      orders.refresh();
      orders.renderOrdersList?.();
      break;
    case 'notification':
      showToast(payload?.message || payload, payload?.type || 'info');
      break;
  }
}

// --- Start ---
document.addEventListener('DOMContentLoaded', init);
