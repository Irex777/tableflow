# TableFlow POS — Implementation Plan

> **Goal:** Build a production-grade, touch-optimized restaurant POS app centered around a visual floor plan with real-time table status, order management, kitchen display, reservations, and analytics.

## Architecture

- **Backend:** Node.js 18 + Express, sql.js (WASM SQLite), ws (WebSocket)
- **Frontend:** Vanilla JS (ES modules), Canvas-based floor plan, touch-optimized dark UI
- **Real-time:** WebSocket for live table status, orders, KDS updates
- **Auth:** Session-based with bcrypt, admin + staff PIN login
- **Deploy:** Docker on Coolify, persistent volume for DB

## Project Structure

```
/server.js          — Express + WebSocket server, route mounting
/db.js              — sql.js database init, schema, migrations
/auth.js            — Session auth middleware, login/logout, staff PIN
/ws.js              — WebSocket handler for real-time broadcasts
/routes/
  menu.js           — Menu CRUD (categories, items, modifiers)
  tables.js         — Tables CRUD, floor plan state, sections
  orders.js         — Order lifecycle (create, fire, close, void)
  payments.js       — Payments, split bills, tips
  kds.js            — Kitchen display queries
  reservations.js   — Reservations + waitlist CRUD
  analytics.js      — Aggregated metrics
  staff.js          — Staff CRUD, section assignments
  settings.js       — App configuration
/public/
  index.html        — Single-page app shell
  css/style.css     — Dark theme, touch-optimized styles
  js/
    app.js          — Tab navigation, WebSocket, global state
    floorplan.js    — Canvas floor plan editor + renderer
    orders.js       — Order panel (add items, seats, courses)
    menu.js         — Menu management admin UI
    kds.js          — Kitchen Display Screen
    analytics.js    — Analytics charts (Canvas)
    settings.js     — Settings, staff, sections management
    utils.js        — Shared helpers (format currency, time, etc.)
Dockerfile
package.json
```

## Database Schema

```sql
-- Sections (floor areas like Main Dining, Bar, Patio)
CREATE TABLE sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  icon TEXT DEFAULT '🍽️',
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tables
CREATE TABLE tables (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  shape TEXT DEFAULT 'round' CHECK(shape IN ('round','square','rectangle','booth')),
  seats INTEGER DEFAULT 4,
  x REAL DEFAULT 50,
  y REAL DEFAULT 50,
  width REAL DEFAULT 80,
  height REAL DEFAULT 80,
  rotation REAL DEFAULT 0,
  status TEXT DEFAULT 'available' CHECK(status IN ('available','occupied','reserved','dirty','blocked')),
  merged_with TEXT,
  min_covers INTEGER DEFAULT 1,
  max_covers INTEGER DEFAULT 8,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Menu Categories
CREATE TABLE menu_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📋',
  color TEXT DEFAULT '#3b82f6',
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1
);

-- Menu Items
CREATE TABLE menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES menu_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL,
  cost REAL DEFAULT 0,
  sku TEXT,
  barcode TEXT,
  image_url TEXT,
  is_86d INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Modifiers (e.g. "Cooking: rare/medium/well")
CREATE TABLE modifier_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  required INTEGER DEFAULT 0,
  multi_select INTEGER DEFAULT 0,
  max_selections INTEGER DEFAULT 1
);

CREATE TABLE modifier_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_adjustment REAL DEFAULT 0,
  is_default INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE item_modifier_groups (
  item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
  group_id INTEGER REFERENCES modifier_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, group_id)
);

-- Orders
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER REFERENCES tables(id),
  order_number TEXT UNIQUE,
  status TEXT DEFAULT 'open' CHECK(status IN ('open','fired','completed','voided','no_show')),
  covers INTEGER DEFAULT 1,
  server_name TEXT DEFAULT '',
  subtotal REAL DEFAULT 0,
  tax_rate REAL DEFAULT 0.21,
  tax REAL DEFAULT 0,
  discount_type TEXT CHECK(discount_type IN ('percent','fixed')),
  discount_value REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  notes TEXT DEFAULT '',
  opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  fired_at DATETIME,
  closed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Order Items
CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id INTEGER REFERENCES menu_items(id),
  seat INTEGER DEFAULT 1,
  course INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','fired','ready','served','voided')),
  quantity INTEGER DEFAULT 1,
  unit_price REAL NOT NULL,
  modifiers_json TEXT DEFAULT '[]',
  modifiers_text TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  void_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  fired_at DATETIME,
  served_at DATETIME
);

-- Payments
CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  method TEXT DEFAULT 'cash' CHECK(method IN ('cash','card','mobile','other')),
  tip REAL DEFAULT 0,
  reference TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Reservations
CREATE TABLE reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
  guest_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  party_size INTEGER NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  duration_min INTEGER DEFAULT 90,
  status TEXT DEFAULT 'confirmed' CHECK(status IN ('confirmed','seated','completed','cancelled','no_show')),
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Waitlist
CREATE TABLE waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_name TEXT NOT NULL,
  party_size INTEGER NOT NULL,
  phone TEXT DEFAULT '',
  quoted_wait_min INTEGER DEFAULT 0,
  status TEXT DEFAULT 'waiting' CHECK(status IN ('waiting','seated','left','cancelled')),
  seated_table_id INTEGER REFERENCES tables(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  seated_at DATETIME
);

-- Staff
CREATE TABLE staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'server' CHECK(role IN ('admin','manager','server','host','bartender','chef','runner')),
  pin TEXT,
  section_id INTEGER REFERENCES sections(id),
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Settings
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Audit Log
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  details TEXT DEFAULT '{}',
  staff_name TEXT DEFAULT 'system',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## UI Layout

### Main Navigation (bottom bar, 5 tabs, touch-optimized 60px buttons)

| Tab | Icon | View |
|-----|------|------|
| Floor | 🏠 | Visual floor plan with tables |
| Orders | 📋 | Active orders list + order detail |
| Menu | 🍽️ | Quick order entry / Menu management |
| Kitchen | 🍳 | KDS — order queue, bump screen |
| More | ⋯ | Analytics, Reservations, Settings |

### Floor Plan View (primary view)
- **Canvas rendering** for performance (60fps drag, zoom, pan)
- Tables color-coded by status:
  - 🟢 Available (green)
  - 🔴 Occupied (red, with timer)
  - 🔵 Reserved (blue, with time)
  - 🟡 Dirty/Needs cleaning (yellow)
  - ⚫ Blocked (gray)
- **Tap table** → opens order panel (slide-up)
- **Edit mode toggle** → drag tables, resize, add/remove
- **Section tabs** at top (horizontal scroll)
- **Status filter pills** (All, Available, Occupied, Reserved)
- **Summary bar**: "12/20 tables occupied | Avg seat time: 42min"
- **Pinch-to-zoom** on mobile

### Order Panel (slide-up from bottom, 90% height)
- Table name + status header + seat timer
- **Seat tabs**: 1, 2, 3, 4... (tap to assign items)
- **Course pills**: Starter, Main, Dessert, Drinks
- **Category grid** (3-column): Appetizers, Mains, Desserts, Drinks...
- **Item buttons**: tap to add, long-press for modifiers
- **Modifier popup**: checkboxes with price adjustments
- **Order summary**: item list with seat#, course, qty, modifiers
- Swipe left on item → void
- **Bottom bar**: Subtotal | Tax | Total | [Pay] [Fire] [Close]

### Kitchen Display (KDS)
- **Columns**: ordered by priority/course
- **Order cards**: table name, items, modifiers, notes, timer
- **Bump button**: marks item ready
- **Color urgency**: green → yellow (5min) → red (10min)
- **Sound alert** for new orders
- **Full screen mode** (no nav)

### Analytics Dashboard
- Revenue today/week/month
- Table turnover rate
- Average seat time
- Top selling items
- Hourly heat map
- Staff performance
- Revenue by section

## API Routes

```
# Auth
POST   /api/auth/login          — Admin login (user+pass)
POST   /api/auth/pin            — Staff PIN login
POST   /api/auth/logout
GET    /api/auth/me             — Current session

# Sections
GET    /api/sections
POST   /api/sections
PATCH  /api/sections/:id
DELETE /api/sections/:id

# Tables
GET    /api/tables?section_id=X
POST   /api/tables
PATCH  /api/tables/:id          — Update position, status, etc.
DELETE /api/tables/:id
POST   /api/tables/:id/merge    — Merge tables
POST   /api/tables/:id/unmerge
PATCH  /api/tables/bulk         — Bulk position update

# Menu
GET    /api/menu/categories
POST   /api/menu/categories
PATCH  /api/menu/categories/:id
DELETE /api/menu/categories/:id
GET    /api/menu/items?category_id=X
POST   /api/menu/items
PATCH  /api/menu/items/:id
DELETE /api/menu/items/:id
GET    /api/menu/modifiers
POST   /api/menu/modifiers
PATCH  /api/menu/modifiers/:id
DELETE /api/menu/modifiers/:id

# Orders
GET    /api/orders?status=open&table_id=X
POST   /api/orders              — Create order for table
PATCH  /api/orders/:id          — Update status, covers, notes
POST   /api/orders/:id/items    — Add item to order
PATCH  /api/orders/:id/items/:itemId — Update item status, void
DELETE /api/orders/:id/items/:itemId — Remove item
POST   /api/orders/:id/fire     — Fire all pending items to kitchen
POST   /api/orders/:id/close    — Close order

# Payments
POST   /api/orders/:id/payments — Add payment
GET    /api/orders/:id/payments
POST   /api/orders/:id/split    — Get split suggestions

# KDS
GET    /api/kds/orders          — All active kitchen orders
POST   /api/kds/bump/:itemId    — Mark item ready

# Reservations
GET    /api/reservations?date=YYYY-MM-DD
POST   /api/reservations
PATCH  /api/reservations/:id
DELETE /api/reservations/:id

# Waitlist
GET    /api/waitlist
POST   /api/waitlist
PATCH  /api/waitlist/:id
DELETE /api/waitlist/:id

# Analytics
GET    /api/analytics/overview?period=today
GET    /api/analytics/tables
GET    /api/analytics/items
GET    /api/analytics/staff
GET    /api/analytics/hourly

# Staff
GET    /api/staff
POST   /api/staff
PATCH  /api/staff/:id
DELETE /api/staff/:id

# Settings
GET    /api/settings
PATCH  /api/settings
POST   /api/settings/seed       — Seed demo data
```

## WebSocket Events

```
# Client → Server
ws:table:update       — Table status/position changed
ws:order:create       — New order
ws:order:item         — Item added/updated
ws:order:fire         — Fire order to kitchen
ws:kds:bump           — Bump item
ws:reservation:update — Reservation changed

# Server → Client (broadcast)
ws:tables             — Full table state refresh
ws:orders             — Active orders update
ws:kds                — KDS queue update
ws:notification       — Toast notification
```

## Implementation Phases

### Phase 1: Foundation (Backend Core)
- package.json, Dockerfile
- db.js — full schema with seed data
- server.js — Express + static + session
- auth.js — admin login + staff PIN
- routes/settings.js

### Phase 2: Tables + Floor Plan
- routes/tables.js — CRUD + bulk positions
- routes/sections.js
- ws.js — WebSocket setup + table broadcasts
- public/js/floorplan.js — Canvas floor plan renderer + editor

### Phase 3: Menu + Order Entry
- routes/menu.js — categories, items, modifiers
- routes/orders.js — full order lifecycle
- public/js/menu.js — menu management + quick order grid
- public/js/orders.js — order panel with seats, courses

### Phase 4: KDS + Payments
- routes/kds.js — kitchen queries
- routes/payments.js — payments + splits
- public/js/kds.js — kitchen display screen

### Phase 5: Reservations + Waitlist + Analytics
- routes/reservations.js
- routes/analytics.js
- public/js/analytics.js — charts
- settings page with staff, sections management

### Phase 6: Polish + Production
- Seed data endpoint (demo data)
- Touch optimizations, animations
- Sound alerts for KDS
- Docker build + Coolify deploy
