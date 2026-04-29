import { api, showToast, formatCurrency } from './utils.js';

// ─── Staff ────────────────────────────────────────────────────────────────────

export async function renderStaff() {
  const container = document.getElementById('staffContent');
  if (!container) return;

  try {
    const staff = await api('/staff');

    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <h2 style="font-size:18px;font-weight:600">Staff</h2>
        <button class="btn-primary" id="addStaffBtn"><i data-lucide="plus" style="width:14px;height:14px;vertical-align:middle"></i> Add Staff</button>
      </div>
      <div class="staff-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px">
        ${staff.length === 0 ? '<div style="text-align:center;color:#94a3b8;padding:40px;grid-column:1/-1">No staff members found</div>' : ''}
        ${staff.map(s => {
          const initials = (s.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
          const isActive = s.active;
          return `
          <div class="staff-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px;display:flex;flex-direction:column;align-items:center;gap:12px;transition:box-shadow .2s">
            <div class="staff-avatar" style="width:56px;height:56px;border-radius:50%;background:${isActive ? '#6366f1' : '#94a3b8'};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:20px">${initials}</div>
            <div style="text-align:center">
              <div style="font-weight:600;font-size:15px">${s.name}</div>
              <div style="font-size:13px;color:#64748b;margin-top:2px">${s.role || 'server'}${s.section_name ? ` · ${s.section_name}` : ''}</div>
              ${s.pin ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">PIN: ${s.pin}</div>` : ''}
            </div>
            <span class="status-badge" style="font-size:12px;padding:4px 12px;border-radius:20px;font-weight:500;background:${isActive ? '#dcfce7' : '#fee2e2'};color:${isActive ? '#16a34a' : '#dc2626'}">${isActive ? 'Clocked In' : 'Clocked Out'}</span>
            <div style="display:flex;gap:8px;width:100%">
              <button class="btn-primary clock-btn" data-staff-id="${s.id}" data-action="${isActive ? 'out' : 'in'}" style="flex:1;padding:8px;font-size:13px">${isActive ? 'Clock Out' : 'Clock In'}</button>
              <button class="btn-secondary edit-staff-btn" data-staff-id="${s.id}" style="padding:8px 12px;font-size:13px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer"><i data-lucide="pencil" style="width:14px;height:14px"></i></button>
            </div>
          </div>`;
        }).join('')}
      </div>
    `;

    window.lucide?.createIcons();
    bindStaffEvents(staff);
  } catch (err) {
    showToast('Failed to load staff: ' + err.message, 'error');
  }
}

function bindStaffEvents(staff) {
  // Clock in/out
  document.querySelectorAll('.clock-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.staffId;
      const action = btn.dataset.action;
      const active = action === 'in' ? 1 : 0;
      try {
        await api(`/staff/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ active }),
        });
        showToast(`Staff ${action === 'in' ? 'clocked in' : 'clocked out'}`, 'success');
        renderStaff();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Edit staff
  document.querySelectorAll('.edit-staff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.staffId);
      const s = staff.find(x => x.id === id);
      if (s) showStaffForm(s);
    });
  });

  // Add staff
  document.getElementById('addStaffBtn')?.addEventListener('click', () => showStaffForm(null));
}

function showStaffForm(existing) {
  const container = document.getElementById('staffContent');
  const isEdit = !!existing;

  container.innerHTML = `
    <div style="max-width:440px">
      <h2 style="font-size:18px;font-weight:600;margin-bottom:20px">${isEdit ? 'Edit Staff' : 'Add Staff'}</h2>
      <div class="settings-section">
        <div class="settings-row">
          <label>Name</label>
          <input id="staffName" value="${existing?.name || ''}" placeholder="Full name">
        </div>
        <div class="settings-row">
          <label>Role</label>
          <select id="staffRole" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:14px">
            <option value="server" ${existing?.role === 'server' ? 'selected' : ''}>Server</option>
            <option value="bartender" ${existing?.role === 'bartender' ? 'selected' : ''}>Bartender</option>
            <option value="host" ${existing?.role === 'host' ? 'selected' : ''}>Host</option>
            <option value="runner" ${existing?.role === 'runner' ? 'selected' : ''}>Runner</option>
            <option value="manager" ${existing?.role === 'manager' ? 'selected' : ''}>Manager</option>
            <option value="chef" ${existing?.role === 'chef' ? 'selected' : ''}>Chef</option>
          </select>
        </div>
        <div class="settings-row">
          <label>PIN</label>
          <input id="staffPin" type="text" maxlength="6" value="${existing?.pin || ''}" placeholder="Optional PIN">
        </div>
        <div style="display:flex;gap:8px;margin-top:16px">
          <button class="btn-primary" id="saveStaffBtn">${isEdit ? 'Update' : 'Create'} Staff</button>
          <button class="btn-secondary" id="cancelStaffBtn" style="padding:10px 20px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer">Cancel</button>
          ${isEdit ? `<button class="btn-danger" id="deleteStaffBtn" style="margin-left:auto">Delete</button>` : ''}
        </div>
      </div>
    </div>
  `;

  window.lucide?.createIcons();

  document.getElementById('saveStaffBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('staffName').value.trim();
    if (!name) return showToast('Name is required', 'error');
    const body = {
      name,
      role: document.getElementById('staffRole').value,
      pin: document.getElementById('staffPin').value || null,
    };
    try {
      if (isEdit) {
        await api(`/staff/${existing.id}`, { method: 'PATCH', body: JSON.stringify(body) });
        showToast('Staff updated', 'success');
      } else {
        await api('/staff', { method: 'POST', body: JSON.stringify(body) });
        showToast('Staff created', 'success');
      }
      renderStaff();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  document.getElementById('cancelStaffBtn')?.addEventListener('click', () => renderStaff());

  document.getElementById('deleteStaffBtn')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${existing.name}?`)) return;
    try {
      await api(`/staff/${existing.id}`, { method: 'DELETE' });
      showToast('Staff deleted', 'success');
      renderStaff();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function renderSettings() {
  const container = document.getElementById('settingsContent');
  if (!container) return;

  try {
    const [settings, categories, tables] = await Promise.all([
      api('/settings'),
      api('/menu/categories'),
      api('/tables'),
    ]);

    // Parse settings into a flat object
    const s = {};
    for (const [k, v] of Object.entries(settings)) {
      try { s[k] = JSON.parse(v); } catch { s[k] = v; }
    }

    container.innerHTML = `
      <h2 style="font-size:18px;font-weight:600;margin-bottom:20px">Settings</h2>

      <div class="settings-section">
        <div class="settings-title">Restaurant</div>
        <div class="settings-row">
          <label>Name</label>
          <input id="setName" value="${s.restaurant_name || 'TableFlow'}">
        </div>
        <div class="settings-row">
          <label>Tax Rate (%)</label>
          <input id="setTax" type="number" step="0.01" value="${parseFloat(s.tax_rate || 0.21) * 100}">
        </div>
        <div class="settings-row">
          <label>Currency</label>
          <input id="setCurrency" value="${s.currency || '€'}" maxlength="3">
        </div>
        <button class="btn-primary" style="margin-top:12px" id="saveSettingsBtn"><i data-lucide="save" style="width:14px;height:14px;vertical-align:middle"></i> Save Settings</button>
      </div>

      <div class="settings-section">
        <div class="settings-title">Admin</div>
        <div class="settings-row">
          <label>Username</label>
          <input id="setAdminUser" value="${s.admin_username || 'admin'}">
        </div>
        <div class="settings-row">
          <label>New Password</label>
          <input id="setAdminPass" type="password" placeholder="Leave blank to keep">
        </div>
        <button class="btn-primary" style="margin-top:12px" id="saveAdminBtn"><i data-lucide="shield" style="width:14px;height:14px;vertical-align:middle"></i> Update Admin</button>
      </div>

      <div class="settings-section">
        <div class="settings-title">Categories</div>
        <div style="margin-bottom:12px">
          ${categories.map(c => `
            <div class="settings-row" style="align-items:center;gap:8px">
              <span style="flex:1">${c.name} <span style="color:#94a3b8;font-size:12px">(${c.item_count || 0} items)</span></span>
              <button class="btn-secondary edit-cat-btn" data-cat-id="${c.id}" style="padding:4px 10px;font-size:12px;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;cursor:pointer"><i data-lucide="pencil" style="width:12px;height:12px"></i></button>
              <button class="btn-danger delete-cat-btn" data-cat-id="${c.id}" style="padding:4px 10px;font-size:12px"><i data-lucide="trash-2" style="width:12px;height:12px"></i></button>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
          <input id="newCatName" placeholder="Category name" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;background:#f8fafc;flex:1;min-width:140px">
          <input id="newCatIcon" placeholder="📋" maxlength="4" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;background:#f8fafc;width:50px;text-align:center">
          <button class="btn-primary" id="addCatBtn" style="padding:8px 16px"><i data-lucide="plus" style="width:14px;height:14px;vertical-align:middle"></i> Add</button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-title">Tables</div>
        <div style="margin-bottom:12px;max-height:260px;overflow-y:auto">
          ${tables.map(t => `
            <div class="settings-row" style="align-items:center;gap:8px">
              <span style="flex:1">${t.name} <span style="color:#94a3b8;font-size:12px">(${t.seats} seats · ${t.section_name || 'No section'})</span></span>
              <button class="btn-danger delete-table-btn" data-table-id="${t.id}" style="padding:4px 10px;font-size:12px"><i data-lucide="trash-2" style="width:12px;height:12px"></i></button>
            </div>
          `).join('')}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end">
          <input id="newTableName" placeholder="Table name" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;background:#f8fafc;flex:1;min-width:100px">
          <input id="newTableSeats" type="number" placeholder="Seats" min="1" value="4" style="padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;background:#f8fafc;width:70px">
          <button class="btn-primary" id="addTableBtn" style="padding:8px 16px"><i data-lucide="plus" style="width:14px;height:14px;vertical-align:middle"></i> Add</button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-title">Reports</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn-primary" id="viewReportsBtn" style="padding:10px 20px"><i data-lucide="bar-chart-3" style="width:14px;height:14px;vertical-align:middle"></i> View Reports</button>
        </div>
        <div id="reportsContent" style="margin-top:16px"></div>
      </div>

      <div class="settings-section">
        <div class="settings-title">Data</div>
        <button class="btn-danger" id="seedDataBtn"><i data-lucide="refresh-cw" style="width:14px;height:14px;vertical-align:middle"></i> Reset & Seed Demo Data</button>
      </div>
    `;

    window.lucide?.createIcons();
    bindSettingsEvents(categories, tables);
  } catch (err) {
    showToast('Failed to load settings: ' + err.message, 'error');
  }
}

function bindSettingsEvents(categories, tables) {
  // Save restaurant settings
  document.getElementById('saveSettingsBtn')?.addEventListener('click', async () => {
    try {
      await api('/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          restaurant_name: document.getElementById('setName').value,
          tax_rate: parseFloat(document.getElementById('setTax').value) / 100,
          currency: document.getElementById('setCurrency').value,
        }),
      });
      showToast('Settings saved!', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Save admin
  document.getElementById('saveAdminBtn')?.addEventListener('click', async () => {
    const pass = document.getElementById('setAdminPass').value;
    const user = document.getElementById('setAdminUser').value;
    const body = { admin_username: user };
    if (pass) body.admin_password = pass;
    try {
      await api('/settings', { method: 'PATCH', body: JSON.stringify(body) });
      showToast('Admin updated!', 'success');
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Add category
  document.getElementById('addCatBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('newCatName').value.trim();
    if (!name) return showToast('Category name required', 'error');
    const icon = document.getElementById('newCatIcon').value || '📋';
    try {
      await api('/menu/categories', {
        method: 'POST',
        body: JSON.stringify({ name, icon }),
      });
      showToast('Category created!', 'success');
      renderSettings();
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Edit category
  document.querySelectorAll('.edit-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.catId);
      const cat = categories.find(c => c.id === id);
      if (!cat) return;
      const newName = prompt('Category name:', cat.name);
      if (!newName || newName === cat.name) return;
      api(`/menu/categories/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName }),
      }).then(() => { showToast('Category updated', 'success'); renderSettings(); })
        .catch(err => showToast(err.message, 'error'));
    });
  });

  // Delete category
  document.querySelectorAll('.delete-cat-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.catId);
      const cat = categories.find(c => c.id === id);
      if (!confirm(`Delete category "${cat?.name}"? This will also delete its items.`)) return;
      try {
        await api(`/menu/categories/${id}`, { method: 'DELETE' });
        showToast('Category deleted', 'success');
        renderSettings();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  // Add table
  document.getElementById('addTableBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('newTableName').value.trim();
    if (!name) return showToast('Table name required', 'error');
    const seats = parseInt(document.getElementById('newTableSeats').value) || 4;
    try {
      await api('/tables', {
        method: 'POST',
        body: JSON.stringify({ name, seats, shape: 'round' }),
      });
      showToast('Table added!', 'success');
      renderSettings();
    } catch (err) { showToast(err.message, 'error'); }
  });

  // Delete table
  document.querySelectorAll('.delete-table-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.tableId);
      const table = tables.find(t => t.id === id);
      if (!confirm(`Delete table "${table?.name}"?`)) return;
      try {
        await api(`/tables/${id}`, { method: 'DELETE' });
        showToast('Table deleted', 'success');
        renderSettings();
      } catch (err) { showToast(err.message, 'error'); }
    });
  });

  // View reports
  document.getElementById('viewReportsBtn')?.addEventListener('click', () => loadReports());

  // Seed data
  document.getElementById('seedDataBtn')?.addEventListener('click', async () => {
    if (!confirm('This will DELETE all data and re-seed demo data. Continue?')) return;
    try {
      await api('/settings/seed', { method: 'POST' });
      showToast('Demo data seeded!', 'success');
      location.reload();
    } catch (err) { showToast(err.message, 'error'); }
  });
}

// ─── Reports ──────────────────────────────────────────────────────────────────

async function loadReports() {
  const container = document.getElementById('reportsContent');
  if (!container) return;

  try {
    const [overview, items, hourly] = await Promise.all([
      api('/analytics/overview?period=today'),
      api('/analytics/items'),
      api('/analytics/hourly'),
    ]);

    const maxOrders = Math.max(1, ...(hourly || []).map(h => h.order_count));

    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:20px">
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
          <div style="font-size:12px;color:#64748b;font-weight:500">Revenue Today</div>
          <div style="font-size:20px;font-weight:700;color:#1e293b;margin-top:4px">${formatCurrency(overview.total_revenue)}</div>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
          <div style="font-size:12px;color:#64748b;font-weight:500">Orders</div>
          <div style="font-size:20px;font-weight:700;color:#1e293b;margin-top:4px">${overview.total_orders}</div>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
          <div style="font-size:12px;color:#64748b;font-weight:500">Covers</div>
          <div style="font-size:20px;font-weight:700;color:#1e293b;margin-top:4px">${overview.total_covers}</div>
        </div>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center">
          <div style="font-size:12px;color:#64748b;font-weight:500">Avg Check</div>
          <div style="font-size:20px;font-weight:700;color:#1e293b;margin-top:4px">${formatCurrency(overview.avg_check)}</div>
        </div>
      </div>

      <div style="font-weight:600;font-size:14px;margin-bottom:8px">Top Items</div>
      <div style="margin-bottom:20px">
        ${(items.items || []).slice(0, 10).map(i => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9">
            <span style="font-size:14px">${i.name}</span>
            <span style="color:#64748b;font-size:13px">${i.qty_sold} sold · ${formatCurrency(i.revenue)}</span>
          </div>
        `).join('')}
      </div>

      <div style="font-weight:600;font-size:14px;margin-bottom:8px">Hourly Breakdown</div>
      <div style="display:flex;align-items:flex-end;gap:4px;height:100px">
        ${(hourly || []).map(h => `
          <div style="flex:1;background:#6366f1;border-radius:3px 3px 0 0;height:${Math.max(2, (h.order_count / maxOrders) * 100)}px;min-height:2px"
            title="${h.hour}:00 — ${h.order_count} orders"></div>
        `).join('')}
      </div>
      <div style="display:flex;gap:4px;margin-top:4px">
        ${(hourly || []).filter((_, i) => i % 3 === 0).map(h => `
          <div style="flex:3;text-align:center;font-size:10px;color:#94a3b8">${h.hour}:00</div>
        `).join('')}
      </div>
    `;

    window.lucide?.createIcons();
  } catch (err) {
    showToast('Failed to load reports: ' + err.message, 'error');
  }
}

// ─── MorePanel class (backward compat) ────────────────────────────────────────

export class MorePanel {
  constructor() {
    this.activeSubtab = null;
  }

  openSubtab(name) {
    this.activeSubtab = name;
    switch (name) {
      case 'staff': renderStaff(); break;
      case 'settings': renderSettings(); break;
    }
  }
}

export default MorePanel;
