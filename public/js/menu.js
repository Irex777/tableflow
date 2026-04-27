import { api, showToast, formatCurrency } from './utils.js';

export class MenuPanel {
  constructor() {
    this.activeCat = null;
  }

  render() {
    const catContainer = document.getElementById('menuCategories');
    const itemsContainer = document.getElementById('menuItems');
    const cats = window.APP.categories;

    if (!this.activeCat && cats.length) this.activeCat = cats[0].id;

    catContainer.innerHTML = cats.map(c => `
      <button class="menu-cat-btn ${this.activeCat === c.id ? 'active' : ''}" data-cat="${c.id}">${c.icon} ${c.name}</button>
    `).join('');

    const items = window.APP.items.filter(i => i.category_id === this.activeCat && i.active);
    itemsContainer.innerHTML = items.map(item => `
      <button class="menu-item-btn ${item.is_86d ? 'disabled' : ''}" data-item="${item.id}">
        <span class="menu-item-name">${item.name}</span>
        <span class="menu-item-price">${formatCurrency(item.price)}</span>
        ${item.is_86d ? '<span style="font-size:11px;color:var(--danger)">86\'d</span>' : ''}
      </button>
    `).join('') || '<div style="padding:40px;text-align:center;color:var(--text3)">Select a category</div>';

    // Events
    catContainer.querySelectorAll('.menu-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeCat = parseInt(btn.dataset.cat);
        this.render();
      });
    });

    itemsContainer.querySelectorAll('.menu-item-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemId = parseInt(btn.dataset.item);
        const item = window.APP.items.find(i => i.id === itemId);
        if (item) showToast(`${item.name} — use Floor/Orders tab to add to orders`, 'info');
      });
    });
  }
}
