// Shared utility functions for TableFlow POS

export function formatCurrency(amount) {
  const currency = window.APP_SETTINGS?.currency || '€';
  return `${currency}${(amount || 0).toFixed(2)}`;
}

export function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' + formatTime(dateStr);
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

export async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'API Error');
  return data;
}

export function statusColor(status) {
  const colors = {
    available: '#22c55e',
    occupied: '#ef4444',
    reserved: '#3b82f6',
    dirty: '#f59e0b',
    blocked: '#52525b',
  };
  return colors[status] || '#52525b';
}

export function statusLabel(status) {
  const labels = {
    available: 'Available',
    occupied: 'Occupied',
    reserved: 'Reserved',
    dirty: 'Needs Cleaning',
    blocked: 'Blocked',
    open: 'Open',
    fired: 'Fired',
    completed: 'Completed',
    voided: 'Voided',
    pending: 'Pending',
    ready: 'Ready',
    served: 'Served',
  };
  return labels[status] || status;
}

export function debounce(fn, ms = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
