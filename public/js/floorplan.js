import { api, showToast, statusColor, formatCurrency, timeAgo } from './utils.js';

// Canvas color palette - warm design system
const TABLE_COLORS = {
  available: { fill: 'rgba(92, 184, 92, 0.15)', border: '#5CB85C' },
  occupied:  { fill: 'rgba(217, 83, 79, 0.15)',  border: '#D9534F' },
  reserved:  { fill: 'rgba(91, 192, 222, 0.15)',  border: '#5BC0DE' },
  dirty:     { fill: 'rgba(232, 168, 56, 0.15)',  border: '#E8A838' },
  blocked:   { fill: 'rgba(107, 100, 89, 0.15)',  border: '#6B6459' },
};
const TABLE_TEXT = '#F0EBE1';
const TABLE_TEXT2 = '#A69F91';
const HOVER_GLOW = 'rgba(212, 168, 67, 0.3)';
const SELECTED_FILL = 'rgba(212, 168, 67, 0.4)';
const SELECTED_BORDER = '#D4A843';
const BG_COLOR = '#0C0B09';
const GRID_COLOR = '#1A1814';

export class FloorPlan {
  constructor() {
    this.canvas = document.getElementById('floorCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.dragging = null;
    this.panStart = null;
    this.lastTouch = null;
    this.editMode = false;
    this.hoveredTable = null;

    this.setupEvents();
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Toolbar
    document.getElementById('editModeBtn').addEventListener('click', () => this.toggleEdit());
    document.getElementById('addTableBtn').addEventListener('click', () => this.addTable());
    document.getElementById('zoomInBtn').addEventListener('click', () => this.zoom(0.2));
    document.getElementById('zoomOutBtn').addEventListener('click', () => this.zoom(-0.2));
    document.getElementById('zoomResetBtn').addEventListener('click', () => { this.scale = 1; this.offsetX = 0; this.offsetY = 0; this.render(); });
  }

  resize() {
    const container = document.getElementById('floorPlanContainer');
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = container.clientWidth * dpr;
    this.canvas.height = container.clientHeight * dpr;
    this.canvas.style.width = container.clientWidth + 'px';
    this.canvas.style.height = container.clientHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  setupEvents() {
    const c = this.canvas;

    // Mouse
    c.addEventListener('mousedown', (e) => this.onPointerDown(e));
    c.addEventListener('mousemove', (e) => this.onPointerMove(e));
    c.addEventListener('mouseup', () => this.onPointerUp());
    c.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? -0.1 : 0.1); }, { passive: false });

    // Touch
    c.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) this.onPointerDown(e.touches[0]);
    }, { passive: false });
    c.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1) this.onPointerMove(e.touches[0]);
    }, { passive: false });
    c.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.onPointerUp();
    }, { passive: false });
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.offsetX) / this.scale,
      y: (sy - this.offsetY) / this.scale,
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * this.scale + this.offsetX,
      y: wy * this.scale + this.offsetY,
    };
  }

  getTablesToRender() {
    let tables = window.APP.tables;
    if (window.APP.activeSection !== 'all') {
      tables = tables.filter(t => t.section_id == window.APP.activeSection);
    }
    if (window.APP.filterStatus !== 'all') {
      tables = tables.filter(t => t.status === window.APP.filterStatus);
    }
    return tables;
  }

  hitTest(sx, sy) {
    const { x, y } = this.screenToWorld(sx, sy);
    const tables = this.getTablesToRender();
    for (let i = tables.length - 1; i >= 0; i--) {
      const t = tables[i];
      const tw = t.width || 80;
      const th = t.height || 80;
      if (x >= t.x - tw/2 && x <= t.x + tw/2 && y >= t.y - th/2 && y <= t.y + th/2) {
        return t;
      }
    }
    return null;
  }

  onPointerDown(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const hit = this.hitTest(sx, sy);
    if (hit && this.editMode) {
      this.dragging = { table: hit, startX: sx, startY: sy, origX: hit.x, origY: hit.y };
    } else if (hit) {
      this.selectTable(hit);
    } else {
      // Pan
      this.panStart = { x: sx - this.offsetX, y: sy - this.offsetY };
    }
    this.lastTouch = { x: sx, y: sy };
  }

  onPointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (this.dragging) {
      const dx = (sx - this.dragging.startX) / this.scale;
      const dy = (sy - this.dragging.startY) / this.scale;
      this.dragging.table.x = this.dragging.origX + dx;
      this.dragging.table.y = this.dragging.origY + dy;
      this.render();
    } else if (this.panStart) {
      this.offsetX = sx - this.panStart.x;
      this.offsetY = sy - this.panStart.y;
      this.render();
    } else {
      // Hover
      const hit = this.hitTest(sx, sy);
      if (hit !== this.hoveredTable) {
        this.hoveredTable = hit;
        this.canvas.style.cursor = hit ? 'pointer' : 'grab';
        this.render();
      }
    }
  }

  onPointerUp() {
    if (this.dragging && this.editMode) {
      // Save position
      const t = this.dragging.table;
      api(`/tables/${t.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ x: t.x, y: t.y }),
      }).catch(err => showToast('Failed to save position', 'error'));
    }
    this.dragging = null;
    this.panStart = null;
  }

  zoom(delta) {
    const oldScale = this.scale;
    this.scale = Math.max(0.4, Math.min(3, this.scale + delta));
    // Zoom toward center
    const cw = this.canvas.clientWidth / 2;
    const ch = this.canvas.clientHeight / 2;
    this.offsetX = cw - (cw - this.offsetX) * (this.scale / oldScale);
    this.offsetY = ch - (ch - this.offsetY) * (this.scale / oldScale);
    this.render();
  }

  toggleEdit() {
    this.editMode = !this.editMode;
    const btn = document.getElementById('editModeBtn');
    btn.classList.toggle('active', this.editMode);
    btn.innerHTML = this.editMode
      ? '<i data-lucide="pencil" style="width:14px;height:14px;vertical-align:middle"></i> Editing'
      : '<i data-lucide="pencil" style="width:14px;height:14px;vertical-align:middle"></i> Edit';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    document.getElementById('addTableBtn').style.display = this.editMode ? 'inline-block' : 'none';
    this.render();
  }

  async addTable() {
    const section = window.APP.activeSection === 'all' ? null : window.APP.activeSection;
    const count = window.APP.tables.length + 1;
    await api('/tables', {
      method: 'POST',
      body: JSON.stringify({
        section_id: section ? parseInt(section) : null,
        name: `T${count}`,
        shape: 'round',
        seats: 4,
        x: 200 + Math.random() * 200,
        y: 200 + Math.random() * 100,
        width: 70,
        height: 70,
      }),
    });
    await loadTables();
    showToast('Table added');
  }

  selectTable(table) {
    window.APP.selectedTable = table;
    // Import orders panel dynamically
    import('./orders.js').then(m => m.openOrderForTable(table));
  }

  render() {
    const ctx = this.ctx;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, cw, ch);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    // Grid
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1 / this.scale;
    const gridSize = 40;
    const startX = Math.floor(-this.offsetX / this.scale / gridSize) * gridSize - gridSize;
    const startY = Math.floor(-this.offsetY / this.scale / gridSize) * gridSize - gridSize;
    const endX = startX + (cw / this.scale) + gridSize * 2;
    const endY = startY + (ch / this.scale) + gridSize * 2;
    for (let x = startX; x < endX; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, startY); ctx.lineTo(x, endY); ctx.stroke();
    }
    for (let y = startY; y < endY; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(endX, y); ctx.stroke();
    }

    // Tables
    const tables = this.getTablesToRender();
    for (const t of tables) {
      this.drawTable(ctx, t);
    }

    ctx.restore();
  }

  drawTable(ctx, t) {
    const w = (t.width || 80);
    const h = (t.height || 80);
    const x = t.x;
    const y = t.y;
    const isHovered = t === this.hoveredTable;
    const isSelected = t === window.APP.selectedTable;
    const tc = TABLE_COLORS[t.status] || TABLE_COLORS.blocked;
    const r = 10 / this.scale;

    ctx.save();
    ctx.translate(x, y);
    if (t.rotation) ctx.rotate(t.rotation * Math.PI / 180);

    // Shadow / glow
    if (isSelected) {
      ctx.shadowColor = SELECTED_BORDER;
      ctx.shadowBlur = 16 / this.scale;
    } else if (isHovered) {
      ctx.shadowColor = HOVER_GLOW;
      ctx.shadowBlur = 16 / this.scale;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.3)';
      ctx.shadowBlur = 8 / this.scale;
    }

    // Shape
    ctx.beginPath();
    const shape = t.shape || 'round';
    if (shape === 'round') {
      ctx.ellipse(0, 0, w/2, h/2, 0, 0, Math.PI * 2);
    } else if (shape === 'rectangle' || shape === 'booth') {
      this.roundRect(ctx, -w/2, -h/2, w, h, r);
    } else {
      this.roundRect(ctx, -w/2, -h/2, w, h, r);
    }

    // Fill
    ctx.fillStyle = isSelected ? SELECTED_FILL : tc.fill;
    ctx.fill();

    // Border
    ctx.shadowBlur = 0;
    ctx.strokeStyle = isSelected ? SELECTED_BORDER : tc.border;
    ctx.lineWidth = (isSelected ? 3 : isHovered ? 2 : 1.5) / this.scale;
    ctx.stroke();

    // Table name
    ctx.fillStyle = isSelected ? '#F0EBE1' : TABLE_TEXT;
    ctx.font = `600 ${Math.max(12, 14) / this.scale}px -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.name, 0, -4 / this.scale);

    // Seats count
    ctx.fillStyle = isSelected ? TABLE_TEXT2 : TABLE_TEXT2;
    ctx.font = `${11 / this.scale}px -apple-system, sans-serif`;
    ctx.fillText(`${t.seats} seats`, 0, 10 / this.scale);

    // Status indicator dot
    ctx.beginPath();
    ctx.arc(w/2 - 8/this.scale, -h/2 + 8/this.scale, 5/this.scale, 0, Math.PI * 2);
    ctx.fillStyle = tc.border;
    ctx.fill();

    // Order info for occupied
    if (t.active_order) {
      ctx.fillStyle = '#A69F91';
      ctx.font = `${10 / this.scale}px -apple-system, sans-serif`;
      ctx.fillText(`${t.active_order.covers} covers · ${timeAgo(t.active_order.opened_at)}`, 0, 24/this.scale);
    }

    ctx.restore();
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}

async function loadTables() {
  window.APP.tables = await api('/tables');
}
