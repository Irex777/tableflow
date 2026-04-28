import { api, showToast, formatCurrency, formatTime, formatDateTime, timeAgo, statusLabel, emojiToLucide } from './utils.js';

export class MorePanel {
  constructor() {
    this.activeSubtab = null;
    this.initMoreCards();
  }

  initMoreCards() {
    document.querySelectorAll('.more-card').forEach(card => {
      card.addEventListener('click', () => {
        const subtab = card.dataset.subtab;
        this.openSubtab(subtab);
      });
    });
  }

  openSubtab(name) {
    document.querySelectorAll('.subtab-content').forEach(s => s.style.display = 'none');
    document.querySelectorAll('.more-card').forEach(c => c.classList.remove('active'));
    // Hide the cards grid when a subtab is open
    document.querySelector('.more-grid').style.display = 'none';
    this.activeSubtab = name;

    const el = document.getElementById(`subtab${name.charAt(0).toUpperCase() + name.slice(1)}`);
    if (el) el.style.display = 'block';

    // Add back button after content loads
    const addBackBtn = () => {
      if (el && !el.querySelector('.subtab-back')) {
        el.insertAdjacentHTML('afterbegin', '<button class="subtab-back" style="background:none;border:none;color:var(--primary);font-size:14px;padding:8px 0;cursor:pointer;margin-bottom:8px;display:flex;align-items:center;gap:4px"><i data-lucide="arrow-left" style="width:16px;height:16px"></i> Back</button>');
        el.querySelector('.subtab-back').addEventListener('click', () => {
          el.style.display = 'none';
          document.querySelector('.more-grid').style.display = '';
          this.activeSubtab = null;
        });
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    };

    switch (name) {
      case 'analytics': this.loadAnalytics().then(addBackBtn); break;
      case 'reservations': this.loadReservations().then(addBackBtn); break;
      case 'waitlist': this.loadWaitlist().then(addBackBtn); break;
      case 'menuManage': this.loadMenuManage().then(addBackBtn); break;
      case 'staff': this.loadStaffManage().then(addBackBtn); break;
      case 'settings': this.loadSettings().then(addBackBtn); break;
    }
  }

  // --- Analytics ---
  async loadAnalytics() {
    try {
      const [overview, tables, items, hourly] = await Promise.all([
        api('/analytics/overview?period=today'),
        api('/analytics/tables'),
        api('/analytics/items'),
        api('/analytics/hourly'),
      ]);

      const el = document.getElementById('subtabAnalytics');
      el.innerHTML = `
        <div class="analytics-grid">
          <div class="stat-card">
            <div class="stat-label">Revenue Today</div>
            <div class="stat-value">${formatCurrency(overview.total_revenue)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Orders</div>
            <div class="stat-value">${overview.total_orders}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Covers</div>
            <div class="stat-value">${overview.total_covers}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Avg Check</div>
            <div class="stat-value">${formatCurrency(overview.avg_check)}</div>
          </div>
        </div>

        <h3 style="margin-bottom:12px;font-size:15px">Top Items</h3>
        <div style="margin-bottom:20px">
          ${(items.items || []).slice(0, 10).map(i => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
              <span>${i.name}</span>
              <span style="color:var(--text2)">${i.qty_sold} sold · ${formatCurrency(i.revenue)}</span>
            </div>
          `).join('')}
        </div>

        <h3 style="margin-bottom:12px;font-size:15px">Hourly Breakdown</h3>
        <div style="display:flex;align-items:flex-end;gap:4px;height:100px">
          ${(hourly || []).map(h => `
            <div style="flex:1;background:#D4A843;border-radius:2px 2px 0 0;height:${Math.max(2, h.order_count * 10)}px;min-height:2px"
              title="${h.hour}:00 — ${h.order_count} orders"></div>
          `).join('')}
        </div>
        <div style="display:flex;gap:4px;margin-top:4px">
          ${(hourly || []).filter((_, i) => i % 3 === 0).map(h => `
            <div style="flex:3;text-align:center;font-size:10px;color:var(--text3)">${h.hour}:00</div>
          `).join('')}
        </div>
      `;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
      showToast('Failed to load analytics', 'error');
    }
  }

  // --- Reservations ---
  async loadReservations() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const reservations = await api(`/reservations?date=${today}`);
      const el = document.getElementById('subtabReservations');

      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3>Today's Reservations</h3>
          <button class="btn-primary" id="addReservation"><i data-lucide="plus" style="width:14px;height:14px;vertical-align:middle"></i> New</button>
        </div>
        <div class="reservation-list">
          ${reservations.length === 0 ? '<div style="text-align:center;color:var(--text3);padding:30px">No reservations today</div>' : ''}
          ${reservations.map(r => `
            <div class="reservation-card">
              <div class="reservation-info">
                <div class="reservation-name">${r.guest_name} · ${r.party_size} guests</div>
                <div class="reservation-time">${r.time} ${r.table_name ? `→ ${r.table_name}` : ''} ${r.phone ? `· ${r.phone}` : ''}</div>
                ${r.notes ? `<div style="font-size:12px;color:var(--text3);margin-top:2px">${r.notes}</div>` : ''}
              </div>
              <div style="display:flex;gap:6px">
                <span class="order-card-status status-${r.status}">${statusLabel(r.status)}</span>
                ${r.status === 'confirmed' ? `<button class="btn-primary" style="padding:6px 12px;font-size:12px" data-seat-res="${r.id}">Seat</button>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      `;
      if (typeof lucide !== 'undefined') lucide.createIcons();

      document.getElementById('addReservation')?.addEventListener('click', () => this.showReservationForm());
      el.querySelectorAll('[data-seat-res]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const res = reservations.find(r => r.id === parseInt(btn.dataset.seatRes));
          if (res?.table_id) {
            await api(`/reservations/${res.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'seated', table_id: res.table_id }),
            });
            this.loadReservations();
            showToast('Guest seated!', 'success');
          }
        });
      });
    } catch (err) {
      showToast('Failed to load reservations', 'error');
    }
  }

  showReservationForm() {
    const el = document.getElementById('subtabReservations');
    el.innerHTML = `
      <h3 style="margin-bottom:16px">New Reservation</h3>
      <div style="display:flex;flex-direction:column;gap:12px;max-width:400px">
        <input id="resName" placeholder="Guest name" class="settings-row input" style="padding:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--radius)">
        <input id="resPhone" placeholder="Phone" style="padding:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--radius)">
        <input id="resParty" type="number" placeholder="Party size" min="1" style="padding:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--radius)">
        <input id="resDate" type="date" value="${new Date().toISOString().split('T')[0]}" style="padding:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--radius)">
        <input id="resTime" type="time" style="padding:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--radius)">
        <select id="resTable" style="padding:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--radius)">
          <option value="">Auto-assign</option>
          ${window.APP.tables.filter(t => t.status === 'available').map(t => `<option value="${t.id}">${t.name} (${t.seats} seats)</option>`).join('')}
        </select>
        <textarea id="resNotes" placeholder="Notes" rows="2" style="padding:12px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--radius);resize:none"></textarea>
        <div style="display:flex;gap:8px">
          <button class="btn-primary" id="submitRes">Create Reservation</button>
          <button class="btn-secondary" style="padding:12px" id="cancelRes">Cancel</button>
        </div>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();

    document.getElementById('submitRes')?.addEventListener('click', async () => {
      try {
        await api('/reservations', {
          method: 'POST',
          body: JSON.stringify({
            guest_name: document.getElementById('resName').value,
            phone: document.getElementById('resPhone').value,
            party_size: parseInt(document.getElementById('resParty').value),
            date: document.getElementById('resDate').value,
            time: document.getElementById('resTime').value,
            table_id: document.getElementById('resTable').value ? parseInt(document.getElementById('resTable').value) : null,
            notes: document.getElementById('resNotes').value,
          }),
        });
        showToast('Reservation created!', 'success');
        this.loadReservations();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });

    document.getElementById('cancelRes')?.addEventListener('click', () => {
      this.loadReservations();
    });
  }

  // --- Waitlist ---
  async loadWaitlist() {
    try {
      const list = await api('/waitlist');
      const el = document.getElementById('subtabWaitlist');

      el.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3>Waitlist</h3>
          <button class="btn-primary" id="addWaitlist"><i data-lucide="plus" style="width:14px;height:14px;vertical-align:middle"></i> Add Guest</button>
        </div>
        ${list.length === 0 ? '<div style="text-align:center;color:var(--text3);padding:30px">No one waiting</div>' : ''}
        ${list.map(w => `
          <div class="waitlist-card">
            <div>
              <div class="waitlist-name">${w.guest_name} · ${w.party_size} guests</div>
              <div class="waitlist-info">${w.phone || ''} ${w.quoted_wait_min ? `· Quoted ${w.quoted_wait_min}m` : ''}</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="waitlist-wait">${w.wait_minutes}m</span>
              <select data-seat-waitlist="${w.id}" style="padding:4px 8px;background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:var(--radius-sm);font-size:12px">
                <option value="">Seat at...</option>
                ${window.APP.tables.filter(t => t.status === 'available').map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
              </select>
            </div>
          </div>
        `).join('')}
      `;
      if (typeof lucide !== 'undefined') lucide.createIcons();

      document.getElementById('addWaitlist')?.addEventListener('click', () => {
        const name = prompt('Guest name:');
        if (!name) return;
        const party = prompt('Party size:', '2');
        api('/waitlist', {
          method: 'POST',
          body: JSON.stringify({ guest_name: name, party_size: parseInt(party), quoted_wait_min: 15 }),
        }).then(() => { showToast('Added to waitlist'); this.loadWaitlist(); })
          .catch(err => showToast(err.message, 'error'));
      });

      el.querySelectorAll('[data-seat-waitlist]').forEach(sel => {
        sel.addEventListener('change', async () => {
          if (!sel.value) return;
          try {
            await api(`/waitlist/${sel.dataset.seatWaitlist}`, {
              method: 'PATCH',
              body: JSON.stringify({ status: 'seated', seated_table_id: parseInt(sel.value) }),
            });
            showToast('Guest seated!', 'success');
            this.loadWaitlist();
          } catch (err) { showToast(err.message, 'error'); }
        });
      });
    } catch (err) {
      showToast('Failed to load waitlist', 'error');
    }
  }

  // --- Menu Management ---
  async loadMenuManage() {
    const el = document.getElementById('subtabMenuManage');
    const cats = window.APP.categories;
    const items = window.APP.items;

    el.innerHTML = `
      <h3 style="margin-bottom:12px">Categories</h3>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px">
        ${cats.map(c => `<span style="background:var(--surface2);border:1px solid var(--border);padding:8px 14px;border-radius:var(--radius);cursor:pointer;display:flex;align-items:center;gap:4px">${emojiToLucide(c.icon)} ${c.name} (${c.item_count || 0})</span>`).join('')}
      </div>

      <h3 style="margin-bottom:12px">Menu Items</h3>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${items.slice(0, 30).map(i => {
          const cat = cats.find(c => c.id === i.category_id);
          return `<div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm)">
            <div><span style="font-weight:500">${i.name}</span> <span style="color:var(--text3);font-size:12px">${cat?.name || ''}</span></div>
            <span style="font-weight:600;color:var(--success)">${formatCurrency(i.price)}</span>
          </div>`;
        }).join('')}
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // --- Staff ---
  async loadStaffManage() {
    const el = document.getElementById('subtabStaff');
    const staff = window.APP.staff;

    el.innerHTML = `
      <h3 style="margin-bottom:12px">Staff</h3>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${staff.map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm)">
            <div>
              <div style="font-weight:500">${s.name}</div>
              <div style="font-size:12px;color:var(--text3)">${s.role} ${s.section_name ? `· ${s.section_name}` : ''} ${s.pin ? `· PIN: ${s.pin}` : ''}</div>
            </div>
            <span style="font-size:12px;padding:3px 8px;border-radius:12px;background:${s.active ? 'var(--success)' : 'var(--danger)'}20;color:${s.active ? 'var(--success)' : 'var(--danger)'}">${s.active ? 'Active' : 'Inactive'}</span>
          </div>
        `).join('')}
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // --- Settings ---
  async loadSettings() {
    const el = document.getElementById('subtabSettings');
    const s = window.APP.settings;

    el.innerHTML = `
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
        <button class="btn-primary" style="margin-top:12px" id="saveSettings">Save Settings</button>
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
        <button class="btn-primary" style="margin-top:12px" id="saveAdmin">Update Admin</button>
      </div>

      <div class="settings-section">
        <div class="settings-title">Data</div>
        <button class="btn-danger" id="seedData"><i data-lucide="refresh-cw" style="width:14px;height:14px;vertical-align:middle"></i> Reset & Seed Demo Data</button>
      </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();

    document.getElementById('saveSettings')?.addEventListener('click', async () => {
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

    document.getElementById('saveAdmin')?.addEventListener('click', async () => {
      const pass = document.getElementById('setAdminPass').value;
      const user = document.getElementById('setAdminUser').value;
      const body = { admin_username: user };
      if (pass) body.admin_password = pass;
      try {
        await api('/settings', { method: 'PATCH', body: JSON.stringify(body) });
        showToast('Admin updated!', 'success');
      } catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('seedData')?.addEventListener('click', async () => {
      if (!confirm('This will DELETE all data and re-seed demo data. Continue?')) return;
      try {
        await api('/settings/seed', { method: 'POST' });
        showToast('Demo data seeded!', 'success');
        location.reload();
      } catch (err) { showToast(err.message, 'error'); }
    });
  }
}
