import { api, formatCurrency, showToast, emojiToLucide, timeAgo, statusColor, statusLabel } from './utils.js';

// --- State ---
let categories = [];
let menuItems = [];
let activeCategory = null;
let searchQuery = '';
let currentOrder = null;
let tables = [];

const categoryColors = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
];

// --- Initialization & Data Loading ---

export async function loadMenu() {
  try {
    const [cats, items] = await Promise.all([
      api('/menu/categories'),
      api('/menu/items'),
    ]);
    categories = cats || [];
    menuItems = items || [];
    if (categories.length && !activeCategory) {
      activeCategory = categories[0].id;
    }
  } catch (err) {
    console.error('Failed to load menu:', err);
    showToast('Failed to load menu', 'error');
  }
}

async function loadTables() {
  try {
    tables = await api('/tables');
  } catch (err) {
    console.error('Failed to load tables:', err);
  }
}

async function loadActiveOrders() {
  try {
    return await api('/orders?status=open,fired');
  } catch {
    return [];
  }
}

async function createOrder(tableId, covers) {
  try {
    const order = await api('/orders', {
      method: 'POST',
      body: JSON.stringify({ table_id: tableId, covers }),
    });
    showToast(`Order ${order.order_number} created`, 'success');
    return order;
  } catch (err) {
    showToast(err.message, 'error');
    return null;
  }
}

async function reloadOrder(orderId) {
  if (!orderId && currentOrder) orderId = currentOrder.id;
  if (!orderId) return;
  try {
    const orders = await api('/orders?status=open,fired,completed');
    const order = orders.find(o => o.id === orderId);
    if (order) {
      currentOrder = order;
    } else {
      currentOrder = null;
    }
  } catch (err) {
    console.error('Failed to reload order:', err);
  }
}

// --- Main Refresh (called when POS tab is activated) ---

export async function refresh() {
  await loadTables();
  await loadMenu();
  await loadOrderForCurrentTable();
  renderCategories();
  renderMenuItems();
  renderTicket();
  bindSearch();
}

async function loadOrderForCurrentTable() {
  const tableId = parseInt(window.currentTableId);
  if (!tableId) {
    currentOrder = null;
    return;
  }

  try {
    const orders = await loadActiveOrders();
    const existing = orders.find(o => o.table_id === tableId);
    if (existing) {
      currentOrder = existing;
    } else {
      const table = tables.find(t => t.id === tableId);
      if (table) {
        currentOrder = await createOrder(tableId, table.seats || 1);
      }
    }
  } catch (err) {
    console.error('Error loading order for table:', err);
  }
}

// --- Category Rendering ---

function renderCategories() {
  const container = document.getElementById('posCategories');
  if (!container) return;

  let html = `<button class="pos-cat-pill ${!activeCategory ? 'active' : ''}" data-cat="all">All</button>`;
  categories.forEach((cat, idx) => {
    const color = cat.color || categoryColors[idx % categoryColors.length];
    html += `<button class="pos-cat-pill ${activeCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}" style="--cat-color:${color}">${emojiToLucide(cat.icon)} ${cat.name}</button>`;
  });
  container.innerHTML = html;

  container.querySelectorAll('.pos-cat-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      activeCategory = cat === 'all' ? null : parseInt(cat);
      renderCategories();
      renderMenuItems();
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

// --- Menu Items Rendering ---

function getFilteredItems() {
  let items = menuItems.filter(i => i.active && !i.is_86d);

  if (activeCategory) {
    items = items.filter(i => i.category_id === activeCategory);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    items = items.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.description || '').toLowerCase().includes(q) ||
      (i.category_name || '').toLowerCase().includes(q)
    );
  }

  return items;
}

function renderMenuItems() {
  const grid = document.getElementById('posItemsGrid');
  if (!grid) return;

  const items = getFilteredItems();

  if (items.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8">
      <i data-lucide="search-x" style="width:48px;height:48px;opacity:0.3;margin-bottom:12px"></i>
      <p>No menu items found</p>
    </div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  grid.innerHTML = items.map(item => {
    const cat = categories.find(c => c.id === item.category_id);
    const color = cat ? (cat.color || categoryColors[categories.indexOf(cat) % categoryColors.length]) : '#94a3b8';
    const catName = item.category_name || cat?.name || '';
    return `<div class="pos-item-card" data-item-id="${item.id}">
      <div class="pos-item-icon" style="--cat-color:${color}">${emojiToLucide(cat?.icon || '🍽️')}</div>
      <div class="pos-item-name">${item.name}</div>
      <div class="pos-item-cat">${catName}</div>
      <div class="pos-item-price">${formatCurrency(item.price)}</div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.pos-item-card').forEach(card => {
    card.addEventListener('click', () => {
      const itemId = parseInt(card.dataset.itemId);
      addItemToOrder(itemId);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

// --- Search Binding ---

function bindSearch() {
  const input = document.getElementById('posSearch');
  if (!input) return;

  // Remove previous listener by cloning
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);

  newInput.addEventListener('input', () => {
    searchQuery = newInput.value.trim();
    renderMenuItems();
  });
}

// --- Ticket Rendering ---

function renderTicket() {
  renderTicketHeader();
  renderTicketItems();
  renderTicketTotals();
}

function renderTicketHeader() {
  const badgeEl = document.getElementById('posTableBadge');
  const guestsEl = document.getElementById('posGuests');
  const tableId = parseInt(window.currentTableId);
  const table = tables.find(t => t.id === tableId);

  if (badgeEl) {
    if (table) {
      badgeEl.textContent = table.name || `Table ${table.id}`;
      badgeEl.style.display = '';
    } else {
      badgeEl.textContent = 'No Table';
      badgeEl.style.display = '';
    }
  }

  if (guestsEl) {
    if (currentOrder) {
      guestsEl.textContent = `${currentOrder.covers || 1} guest${(currentOrder.covers || 1) !== 1 ? 's' : ''}`;
    } else if (table) {
      guestsEl.textContent = `${table.seats || 1} seats`;
    } else {
      guestsEl.textContent = 'Select a table';
    }
  }
}

function renderTicketItems() {
  const container = document.getElementById('posTicketItems');
  if (!container) return;

  if (!currentOrder || !currentOrder.items || currentOrder.items.length === 0) {
    container.innerHTML = `<div class="pos-ticket-empty">
      <i data-lucide="receipt" style="width:48px;height:48px;opacity:0.15"></i>
      <p>No items in current order</p>
      <span>${parseInt(window.currentTableId) ? 'Tap menu items to add them.' : 'Select a table from the floor plan first.'}</span>
    </div>`;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  const items = currentOrder.items.filter(i => i.status !== 'voided');

  container.innerHTML = items.map(item => {
    const lineTotal = item.quantity * item.unit_price;
    return `<div class="pos-ticket-item" data-ticket-item="${item.id}">
      <div class="pos-ticket-item-row">
        <div class="pos-ticket-item-info">
          <span class="pos-ticket-item-name">${item.item_name}</span>
          ${item.modifiers_text ? `<span class="pos-ticket-item-mods">${item.modifiers_text}</span>` : ''}
          ${item.notes ? `<span class="pos-ticket-item-notes"><i data-lucide="pencil-line" style="width:11px;height:11px"></i> ${item.notes}</span>` : ''}
        </div>
        <div class="pos-ticket-item-qty">
          <button class="pos-qty-btn pos-qty-minus" data-qty-action="minus" data-item-id="${item.id}"><i data-lucide="minus" style="width:14px;height:14px"></i></button>
          <span class="pos-qty-value">${item.quantity}</span>
          <button class="pos-qty-btn pos-qty-plus" data-qty-action="plus" data-item-id="${item.id}"><i data-lucide="plus" style="width:14px;height:14px"></i></button>
        </div>
        <span class="pos-ticket-item-price">${formatCurrency(lineTotal)}</span>
        ${item.status === 'pending' ? `<button class="pos-qty-btn pos-qty-void" data-void="${item.id}" title="Void item"><i data-lucide="x" style="width:14px;height:14px"></i></button>` : ''}
      </div>
    </div>`;
  }).join('');

  // Bind qty controls
  container.querySelectorAll('.pos-qty-btn[data-qty-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = parseInt(btn.dataset.itemId);
      const action = btn.dataset.qtyAction;
      await handleQtyChange(itemId, action);
    });
  });

  // Bind void buttons
  container.querySelectorAll('[data-void]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const itemId = parseInt(btn.dataset.void);
      await voidItem(itemId);
    });
  });

  if (window.lucide) window.lucide.createIcons();
}

function renderTicketTotals() {
  const footer = document.getElementById('posTicketFooter');
  if (!footer) return;

  if (!currentOrder || !currentOrder.items || currentOrder.items.filter(i => i.status !== 'voided').length === 0) {
    footer.style.display = 'none';
    return;
  }

  footer.style.display = '';

  const subtotalEl = document.getElementById('posSubtotal');
  const taxEl = document.getElementById('posTax');
  const totalEl = document.getElementById('posTotal');

  if (subtotalEl) subtotalEl.textContent = formatCurrency(currentOrder.subtotal);
  if (taxEl) taxEl.textContent = formatCurrency(currentOrder.tax);
  if (totalEl) totalEl.textContent = formatCurrency(currentOrder.total);

  renderActions();
}

function renderActions() {
  const container = document.getElementById('posActions');
  if (!container) return;

  const items = (currentOrder?.items || []).filter(i => i.status !== 'voided');
  const pending = items.filter(i => i.status === 'pending');

  container.innerHTML = `
    ${pending.length > 0 ? `<button class="btn-fire" id="btnFire"><i data-lucide="flame" style="width:16px;height:16px;vertical-align:middle"></i> Fire (${pending.length})</button>` : ''}
    <button class="btn-pay" id="btnPay"><i data-lucide="credit-card" style="width:16px;height:16px;vertical-align:middle"></i> Pay</button>
  `;

  const fireBtn = document.getElementById('btnFire');
  if (fireBtn) {
    fireBtn.addEventListener('click', async () => {
      await fireOrder();
    });
  }

  const payBtn = document.getElementById('btnPay');
  if (payBtn) {
    payBtn.addEventListener('click', () => {
      openPaymentModal();
    });
  }

  if (window.lucide) window.lucide.createIcons();
}

// --- Order Operations ---

async function addItemToOrder(itemId) {
  if (!currentOrder) {
    showToast('No active order — select a table first', 'error');
    return;
  }

  try {
    await api(`/orders/${currentOrder.id}/items`, {
      method: 'POST',
      body: JSON.stringify({
        items: [{
          menu_item_id: itemId,
          seat: 1,
          course: 1,
          quantity: 1,
          modifiers: [],
        }],
      }),
    });
    await reloadOrder();
    renderTicket();
    showToast('Item added', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleQtyChange(itemId, action) {
  if (!currentOrder) return;
  const item = currentOrder.items.find(i => i.id === itemId);
  if (!item) return;

  let newQty = item.quantity;
  if (action === 'plus') {
    newQty += 1;
  } else if (action === 'minus') {
    newQty -= 1;
  }

  if (newQty <= 0) {
    await voidItem(itemId);
    return;
  }

  try {
    await api(`/orders/${currentOrder.id}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ quantity: newQty }),
    });
    await reloadOrder();
    renderTicket();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function voidItem(itemId) {
  if (!currentOrder) return;
  try {
    await api(`/orders/${currentOrder.id}/items/${itemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'voided', void_reason: 'Cancelled' }),
    });
    await reloadOrder();
    renderTicket();
    showToast('Item voided', 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function fireOrder() {
  if (!currentOrder) return;
  try {
    await api(`/orders/${currentOrder.id}/fire`, { method: 'POST' });
    await reloadOrder();
    renderTicket();
    showToast('Order fired to kitchen!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Payment Modal ---

function openPaymentModal() {
  if (!currentOrder) return;

  const remaining = currentOrder.total - (currentOrder.total_paid || 0);
  const modal = document.getElementById('paymentModal');
  const body = document.getElementById('paymentModalBody');
  if (!modal || !body) return;

  modal.style.display = 'flex';

  body.innerHTML = `
    <div class="payment-total">${formatCurrency(remaining)}</div>
    <div class="split-options">
      <button class="split-btn active" data-split="full">Full</button>
      <button class="split-btn" data-split="even">Split Evenly</button>
      <button class="split-btn" data-split="custom">Custom</button>
    </div>
    <div id="splitContent"></div>
    <div class="payment-methods">
      <button class="pay-method-btn active" data-method="cash"><i data-lucide="banknote" style="width:16px;height:16px;vertical-align:middle"></i> Cash</button>
      <button class="pay-method-btn" data-method="card"><i data-lucide="credit-card" style="width:16px;height:16px;vertical-align:middle"></i> Card</button>
      <button class="pay-method-btn" data-method="mobile"><i data-lucide="smartphone" style="width:16px;height:16px;vertical-align:middle"></i> Mobile</button>
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

  if (window.lucide) window.lucide.createIcons();

  let selectedMethod = 'cash';
  let selectedSplit = 'full';

  // Method select
  body.querySelectorAll('.pay-method-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('.pay-method-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMethod = btn.dataset.method;
    });
  });

  // Split select
  body.querySelectorAll('.split-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      body.querySelectorAll('.split-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSplit = btn.dataset.split;
      const splitContent = document.getElementById('splitContent');
      if (selectedSplit === 'even') {
        const perPerson = remaining / (currentOrder.covers || 1);
        splitContent.innerHTML = `<div style="text-align:center;padding:12px;color:var(--text2)">${currentOrder.covers} × ${formatCurrency(perPerson)}</div>`;
        document.getElementById('paymentAmount').value = perPerson.toFixed(2);
      } else if (selectedSplit === 'full') {
        splitContent.innerHTML = '';
        document.getElementById('paymentAmount').value = remaining.toFixed(2);
      }
    });
  });

  // Quick amounts
  body.querySelectorAll('.payment-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('paymentAmount').value = btn.dataset.amount;
    });
  });

  // Confirm payment
  document.getElementById('confirmPayment').addEventListener('click', async () => {
    await processPayment(selectedMethod);
  });

  // Close handlers
  const closeBtn = document.getElementById('paymentModalClose');
  if (closeBtn) {
    closeBtn.onclick = () => { modal.style.display = 'none'; };
  }
  const backdrop = document.getElementById('paymentModalBackdrop');
  if (backdrop) {
    backdrop.onclick = () => { modal.style.display = 'none'; };
  }
}

async function processPayment(method) {
  if (!currentOrder) return;

  const amountInput = document.getElementById('paymentAmount');
  const amount = parseFloat(amountInput?.value);
  if (!amount || amount <= 0) {
    showToast('Invalid amount', 'error');
    return;
  }

  try {
    const result = await api(`/orders/${currentOrder.id}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount, method }),
    });
    showToast('Payment recorded', 'success');
    document.getElementById('paymentModal').style.display = 'none';

    if (result.auto_closed) {
      currentOrder = null;
      window.currentTableId = null;
      renderTicket();
      showToast('Order completed! Table cleared.', 'success');
    } else {
      await reloadOrder();
      renderTicket();
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}
