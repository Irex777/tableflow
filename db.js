const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

let db = null;

function initDB(dbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  return db;
}

function getDB() { return db; }

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#3b82f6',
      icon TEXT DEFAULT '🍽️',
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      shape TEXT DEFAULT 'round',
      seats INTEGER DEFAULT 4,
      x REAL DEFAULT 50,
      y REAL DEFAULT 50,
      width REAL DEFAULT 80,
      height REAL DEFAULT 80,
      rotation REAL DEFAULT 0,
      status TEXT DEFAULT 'available',
      merged_with TEXT,
      min_covers INTEGER DEFAULT 1,
      max_covers INTEGER DEFAULT 8,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS menu_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '📋',
      color TEXT DEFAULT '#3b82f6',
      sort_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS menu_items (
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

    CREATE TABLE IF NOT EXISTS modifier_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      required INTEGER DEFAULT 0,
      multi_select INTEGER DEFAULT 0,
      max_selections INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS modifier_options (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id INTEGER REFERENCES modifier_groups(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      price_adjustment REAL DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS item_modifier_groups (
      item_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
      group_id INTEGER REFERENCES modifier_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (item_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER REFERENCES tables(id),
      order_number TEXT UNIQUE,
      status TEXT DEFAULT 'open',
      covers INTEGER DEFAULT 1,
      server_name TEXT DEFAULT '',
      subtotal REAL DEFAULT 0,
      tax_rate REAL DEFAULT 0.21,
      tax REAL DEFAULT 0,
      discount_type TEXT,
      discount_value REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      notes TEXT DEFAULT '',
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      fired_at DATETIME,
      closed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      menu_item_id INTEGER REFERENCES menu_items(id),
      seat INTEGER DEFAULT 1,
      course INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending',
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

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      method TEXT DEFAULT 'cash',
      tip REAL DEFAULT 0,
      reference TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER REFERENCES tables(id) ON DELETE SET NULL,
      guest_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      party_size INTEGER NOT NULL,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      duration_min INTEGER DEFAULT 90,
      status TEXT DEFAULT 'confirmed',
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS waitlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guest_name TEXT NOT NULL,
      party_size INTEGER NOT NULL,
      phone TEXT DEFAULT '',
      quoted_wait_min INTEGER DEFAULT 0,
      status TEXT DEFAULT 'waiting',
      seated_table_id INTEGER REFERENCES tables(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      seated_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'server',
      pin TEXT,
      section_id INTEGER REFERENCES sections(id),
      active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT DEFAULT '{}',
      staff_name TEXT DEFAULT 'system',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function seedData() {
  const count = db.prepare('SELECT COUNT(*) as c FROM sections').get().c;
  if (count > 0) return false;

  const adminHash = bcrypt.hashSync('admin123', 10);

  // Settings
  const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
  const settings = [
    ['restaurant_name', 'TableFlow'],
    ['tax_rate', '0.21'],
    ['currency', '€'],
    ['order_counter', '0'],
    ['admin_password_hash', adminHash],
    ['admin_username', 'admin'],
  ];
  const insertSettings = db.transaction((rows) => {
    for (const [k, v] of rows) insertSetting.run(k, v);
  });
  insertSettings(settings);

  // Sections
  const insertSection = db.prepare('INSERT INTO sections (name, color, icon, sort_order) VALUES (?, ?, ?, ?)');
  const insertTable = db.prepare('INSERT INTO tables (section_id, name, shape, seats, x, y, width, height, min_covers, max_covers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const seedSections = db.transaction(() => {
    const mainId = insertSection.run('Main Dining', '#3b82f6', '🍽️', 0).lastInsertRowid;
    const barId = insertSection.run('Bar Area', '#8b5cf6', '🍸', 1).lastInsertRowid;
    const patioId = insertSection.run('Patio', '#f59e0b', '☀️', 2).lastInsertRowid;

    // Main Dining tables
    const mainTables = [
      ['T1', 'round', 4, 80, 80, 70, 70, 1, 6],
      ['T2', 'round', 4, 200, 80, 70, 70, 1, 6],
      ['T3', 'square', 4, 320, 80, 70, 70, 2, 6],
      ['T4', 'square', 4, 440, 80, 70, 70, 2, 6],
      ['T5', 'rectangle', 6, 80, 220, 120, 70, 4, 8],
      ['T6', 'rectangle', 6, 240, 220, 120, 70, 4, 8],
      ['T7', 'rectangle', 8, 400, 220, 140, 80, 6, 10],
      ['T8', 'rectangle', 8, 570, 220, 140, 80, 6, 10],
      ['T9', 'booth', 4, 80, 360, 100, 70, 2, 4],
      ['T10', 'booth', 4, 220, 360, 100, 70, 2, 4],
      ['T11', 'booth', 4, 360, 360, 100, 70, 2, 4],
      ['T12', 'round', 2, 500, 360, 60, 60, 1, 2],
    ];
    for (const [name, shape, seats, x, y, w, h, min, max] of mainTables) {
      insertTable.run(mainId, name, shape, seats, x, y, w, h, min, max);
    }

    // Bar tables
    const barTables = [
      ['B1', 'round', 2, 80, 80, 55, 55, 1, 2],
      ['B2', 'round', 2, 180, 80, 55, 55, 1, 2],
      ['B3', 'round', 2, 280, 80, 55, 55, 1, 2],
      ['B4', 'round', 2, 380, 80, 55, 55, 1, 2],
      ['B5', 'square', 4, 150, 200, 70, 70, 2, 4],
      ['B6', 'square', 4, 300, 200, 70, 70, 2, 4],
    ];
    for (const [name, shape, seats, x, y, w, h, min, max] of barTables) {
      insertTable.run(barId, name, shape, seats, x, y, w, h, min, max);
    }

    // Patio
    const patioTables = [
      ['P1', 'round', 4, 100, 80, 70, 70, 1, 6],
      ['P2', 'round', 4, 250, 80, 70, 70, 1, 6],
      ['P3', 'rectangle', 6, 150, 220, 120, 70, 4, 8],
    ];
    for (const [name, shape, seats, x, y, w, h, min, max] of patioTables) {
      insertTable.run(patioId, name, shape, seats, x, y, w, h, min, max);
    }
  });
  seedSections();

  // Menu Categories
  const insertCat = db.prepare('INSERT INTO menu_categories (name, icon, color, sort_order) VALUES (?, ?, ?, ?)');
  const seedCategories = db.transaction(() => {
    return [
      insertCat.run('Starters', '🥗', '#10b981', 0).lastInsertRowid,
      insertCat.run('Soups', '🍲', '#f59e0b', 1).lastInsertRowid,
      insertCat.run('Mains', '🥩', '#ef4444', 2).lastInsertRowid,
      insertCat.run('Pasta', '🍝', '#f97316', 3).lastInsertRowid,
      insertCat.run('Pizza', '🍕', '#ec4899', 4).lastInsertRowid,
      insertCat.run('Desserts', '🍰', '#8b5cf6', 5).lastInsertRowid,
      insertCat.run('Hot Drinks', '☕', '#78716c', 6).lastInsertRowid,
      insertCat.run('Cold Drinks', '🥤', '#06b6d4', 7).lastInsertRowid,
    ];
  });
  const catIds = seedCategories();

  // Menu Items
  const insertItem = db.prepare('INSERT INTO menu_items (category_id, name, description, price, cost, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
  const seedItems = db.transaction(() => {
    const items = [
      // Starters
      [catIds[0], 'Bruschetta', 'Toasted bread with tomatoes, garlic, basil', 8.50, 2.50, 0],
      [catIds[0], 'Caesar Salad', 'Romaine, croutons, parmesan, caesar dressing', 10.00, 3.00, 1],
      [catIds[0], 'Soup of the Day', 'Fresh daily soup with bread roll', 7.50, 2.00, 2],
      [catIds[0], 'Garlic Bread', 'Toasted ciabatta with garlic butter', 5.50, 1.50, 3],
      [catIds[0], 'Prawn Cocktail', 'Tiger prawns, marie rose sauce, avocado', 12.00, 5.00, 4],
      // Soups
      [catIds[1], 'Tomato Basil Soup', 'Creamy tomato soup with fresh basil', 7.00, 2.00, 0],
      [catIds[1], 'French Onion Soup', 'Caramelized onions, gruyere crouton', 8.50, 2.50, 1],
      [catIds[1], 'Minestrone', 'Italian vegetable soup with pasta', 7.50, 2.00, 2],
      // Mains
      [catIds[2], 'Grilled Salmon', 'Atlantic salmon, lemon butter, asparagus', 24.00, 10.00, 0],
      [catIds[2], 'Ribeye Steak 300g', 'Premium cut, chips, pepper sauce', 28.00, 14.00, 1],
      [catIds[2], 'Chicken Supreme', 'Stuffed chicken breast, roast veg', 19.00, 7.00, 2],
      [catIds[2], 'Lamb Chops', 'Grilled lamb, rosemary potatoes, mint sauce', 26.00, 12.00, 3],
      [catIds[2], 'Fish & Chips', 'Beer-battered cod, mushy peas, tartare', 16.00, 6.00, 4],
      [catIds[2], 'Burger Classic', 'Angus beef, cheddar, bacon, fries', 15.00, 5.50, 5],
      // Pasta
      [catIds[3], 'Spaghetti Carbonara', 'Guanciale, pecorino, egg yolk, black pepper', 14.00, 4.50, 0],
      [catIds[3], 'Penne Arrabbiata', 'Spicy tomato sauce, chili, garlic', 12.00, 3.50, 1],
      [catIds[3], 'Tagliatelle Bolognese', 'Slow-cooked beef ragu, parmesan', 15.00, 5.00, 2],
      [catIds[3], 'Linguine Frutti di Mare', 'Seafood mix, white wine, cherry tomato', 18.00, 8.00, 3],
      // Pizza
      [catIds[4], 'Margherita', 'San Marzano, mozzarella, fresh basil', 12.00, 4.00, 0],
      [catIds[4], 'Diavola', 'Spicy salami, chili flakes, mozzarella', 14.00, 5.00, 1],
      [catIds[4], 'Quattro Formaggi', 'Mozzarella, gorgonzola, parmesan, fontina', 15.00, 5.50, 2],
      [catIds[4], 'Prosciutto e Rucola', 'Parma ham, arugula, shaved parmesan', 16.00, 6.00, 3],
      // Desserts
      [catIds[5], 'Tiramisu', 'Classic Italian coffee dessert', 9.00, 3.00, 0],
      [catIds[5], 'Crème Brûlée', 'Vanilla custard, caramelized sugar', 8.50, 2.50, 1],
      [catIds[5], 'Chocolate Lava Cake', 'Warm chocolate fondant, vanilla ice cream', 10.00, 3.50, 2],
      [catIds[5], 'Panna Cotta', 'Vanilla bean, mixed berry compote', 8.00, 2.50, 3],
      // Hot Drinks
      [catIds[6], 'Espresso', 'Double shot Italian espresso', 3.00, 0.50, 0],
      [catIds[6], 'Cappuccino', 'Espresso, steamed milk, foam', 4.00, 0.80, 1],
      [catIds[6], 'Latte', 'Espresso, steamed milk', 4.50, 0.80, 2],
      [catIds[6], 'Americano', 'Espresso, hot water', 3.00, 0.40, 3],
      [catIds[6], 'Hot Chocolate', 'Belgian chocolate, steamed milk', 4.50, 1.00, 4],
      // Cold Drinks
      [catIds[7], 'Coca-Cola', '330ml can', 3.00, 1.00, 0],
      [catIds[7], 'Sparkling Water', '500ml San Pellegrino', 3.50, 1.00, 1],
      [catIds[7], 'Fresh Lemonade', 'Homemade lemonade, mint', 4.50, 1.00, 2],
      [catIds[7], 'Iced Tea', 'Peach iced tea, fresh peach', 4.00, 1.00, 3],
      [catIds[7], 'Orange Juice', 'Freshly squeezed', 4.50, 1.50, 4],
    ];
    for (const [catId, name, desc, price, cost, sort] of items) {
      insertItem.run(catId, name, desc, price, cost, sort);
    }
  });
  seedItems();

  // Modifier Groups
  const insertGroup = db.prepare('INSERT INTO modifier_groups (name, required, multi_select, max_selections) VALUES (?, ?, ?, ?)');
  const insertOption = db.prepare('INSERT INTO modifier_options (group_id, name, price_adjustment, is_default, sort_order) VALUES (?, ?, ?, ?, ?)');
  const insertItemMod = db.prepare('INSERT OR IGNORE INTO item_modifier_groups (item_id, group_id) VALUES (?, ?)');

  const seedModifiers = db.transaction(() => {
    // Cooking
    const cookId = insertGroup.run('Cooking', 1, 0, 1).lastInsertRowid;
    insertOption.run(cookId, 'Rare', 0, 0, 0);
    insertOption.run(cookId, 'Medium Rare', 0, 0, 1);
    insertOption.run(cookId, 'Medium', 0, 1, 2);
    insertOption.run(cookId, 'Medium Well', 0, 0, 3);
    insertOption.run(cookId, 'Well Done', 0, 0, 4);

    // Size
    const sizeId = insertGroup.run('Size', 1, 0, 1).lastInsertRowid;
    insertOption.run(sizeId, 'Small', 0, 0, 0);
    insertOption.run(sizeId, 'Regular', 0, 1, 1);
    insertOption.run(sizeId, 'Large', 2.00, 0, 2);

    // Spice Level
    const spiceId = insertGroup.run('Spice Level', 0, 0, 1).lastInsertRowid;
    insertOption.run(spiceId, 'Mild', 0, 1, 0);
    insertOption.run(spiceId, 'Medium', 0, 0, 1);
    insertOption.run(spiceId, 'Hot', 0, 0, 2);
    insertOption.run(spiceId, 'Extra Hot', 0.50, 0, 3);

    // Extra Toppings
    const toppingId = insertGroup.run('Extra Toppings', 0, 1, 5).lastInsertRowid;
    insertOption.run(toppingId, 'Extra Cheese', 1.50, 0, 0);
    insertOption.run(toppingId, 'Bacon', 2.00, 0, 1);
    insertOption.run(toppingId, 'Avocado', 2.00, 0, 2);
    insertOption.run(toppingId, 'Mushrooms', 1.00, 0, 3);
    insertOption.run(toppingId, 'Truffle Oil', 3.00, 0, 4);

    // Sides
    const sidesId = insertGroup.run('Side Dish', 0, 1, 2).lastInsertRowid;
    insertOption.run(sidesId, 'French Fries', 0, 0, 0);
    insertOption.run(sidesId, 'Sweet Potato Fries', 1.50, 0, 1);
    insertOption.run(sidesId, 'Mixed Salad', 0, 0, 2);
    insertOption.run(sidesId, 'Roasted Vegetables', 0, 0, 3);
    insertOption.run(sidesId, 'Coleslaw', 0, 0, 4);

    // Link modifiers to relevant items
    // Cooking → Steak, Lamb, Chicken, Burger, Salmon
    const meatItems = db.prepare("SELECT id FROM menu_items WHERE name IN ('Ribeye Steak 300g','Lamb Chops','Chicken Supreme','Burger Classic','Grilled Salmon')").all();
    for (const item of meatItems) insertItemMod.run(item.id, cookId);

    // Sides → Mains
    const mainItems = db.prepare("SELECT id FROM menu_items WHERE category_id = ?").all(catIds[2]);
    for (const item of mainItems) insertItemMod.run(item.id, sidesId);

    // Size → Drinks
    const drinkItems = db.prepare("SELECT id FROM menu_items WHERE category_id IN (?, ?)").all(catIds[6], catIds[7]);
    for (const item of drinkItems) insertItemMod.run(item.id, sizeId);

    // Spice → Pasta, Pizza
    const spicyItems = db.prepare("SELECT id FROM menu_items WHERE category_id IN (?, ?)").all(catIds[3], catIds[4]);
    for (const item of spicyItems) insertItemMod.run(item.id, spiceId);

    // Toppings → Pizza, Burger
    const toppingItems = db.prepare("SELECT id FROM menu_items WHERE category_id = ? OR name = 'Burger Classic'").all(catIds[4]);
    for (const item of toppingItems) insertItemMod.run(item.id, toppingId);
  });
  seedModifiers();

  // Staff
  const insertStaff = db.prepare('INSERT INTO staff (name, role, pin, section_id) VALUES (?, ?, ?, ?)');
  const seedStaff = db.transaction(() => {
    insertStaff.run('Anna', 'server', '1234', 1);
    insertStaff.run('Marco', 'server', '5678', 1);
    insertStaff.run('Chef Luca', 'chef', '9999', null);
    insertStaff.run('Sofia', 'host', '0000', null);
  });
  seedStaff();

  console.log('Database seeded with demo data');
  return true;
}

module.exports = { initDB, getDB, seedData };
