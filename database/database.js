const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const { app } = require("electron").remote || require("electron");

const isDev = app && !app.isPackaged;
const userDataPath = (app && !isDev) ? app.getPath("userData") : path.join(__dirname);
const dbPath = path.join(userDataPath, "apna_enterprises.db");

console.log("Environment:", isDev ? "Development" : "Production");
console.log("Database Path:", dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("DB Connection Error:", err);
  else console.log("Database connected ✅");
});

db.serialize(() => {

  // ─── SHOPS TABLE ────────────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS shops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    gstin TEXT,
    address TEXT,
    phone TEXT,
    state TEXT,
    state_code TEXT,
    bank_name TEXT,
    account_number TEXT,
    ifsc_code TEXT,
    invoice_prefix TEXT
  )`, (err) => {
    if (!err) {
      // Migrations for existing DBs
      db.run(`ALTER TABLE shops ADD COLUMN bank_name TEXT`, () => {});
      db.run(`ALTER TABLE shops ADD COLUMN account_number TEXT`, () => {});
      db.run(`ALTER TABLE shops ADD COLUMN ifsc_code TEXT`, () => {});
      db.run(`ALTER TABLE shops ADD COLUMN invoice_prefix TEXT`, () => {});

      db.get("SELECT COUNT(*) as count FROM shops", (err, row) => {
        if (!err && row.count === 0) {
          db.run(`INSERT INTO shops (id, name, gstin, address, phone, state, state_code) VALUES (1, 'Apna Enterprises', '27AAAAA0000A1Z5', 'Plot 45, Industrial Estate, Pune', '+91 98765 43210', 'Maharashtra', '27')`);
          db.run(`INSERT INTO shops (id, name, gstin, address, phone, state, state_code) VALUES (2, 'Apna Hardware', '27BBBBB0000B1Z5', 'Plot 46, Industrial Estate, Pune', '+91 98765 43211', 'Maharashtra', '27')`);
          console.log("Default shops created ✅");
        }
      });
    }
  });

  // ─── USERS TABLE ────────────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    master_pin TEXT,
    shop_id INTEGER DEFAULT 1
  )`, (err) => {
    // Always ensure default users are present (will be ignored if username unique constraint is hit)
    db.run(`INSERT OR IGNORE INTO users (username, password, master_pin, shop_id) VALUES ('ApnaEnterprises', 'admin123', '9999', 1)`);
    db.run(`INSERT OR IGNORE INTO users (username, password, master_pin, shop_id) VALUES ('ApnaHardware', 'admin123', '8888', 2)`);
    console.log("Default users verified ✅");
  });

  // Safe migration: add shop_id to users if missing
  db.all("PRAGMA table_info(users)", (err, columns) => {
    if (!err && columns && !columns.some(c => c.name === "shop_id")) {
      db.run("ALTER TABLE users ADD COLUMN shop_id INTEGER DEFAULT 1");
    }
    if (!err && columns && !columns.some(c => c.name === "master_pin")) {
      db.run("ALTER TABLE users ADD COLUMN master_pin TEXT DEFAULT '9999'");
    }
  });

  // ─── PRODUCTS TABLE ─────────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    category TEXT,
    purchase_price REAL,
    selling_price REAL,
    gst REAL,
    quantity INTEGER,
    min_stock INTEGER,
    hsn_code TEXT,
    shop_id INTEGER DEFAULT 1,
    sku TEXT
  )`, (err) => {
    if (err) console.error("Error creating products table:", err);
  });

  // Safe migrations for products
  db.all("PRAGMA table_info(products)", (err, columns) => {
    if (!err && columns) {
      db.serialize(() => {
        if (!columns.some(c => c.name === "hsn_code")) db.run("ALTER TABLE products ADD COLUMN hsn_code TEXT");
        if (!columns.some(c => c.name === "shop_id")) db.run("ALTER TABLE products ADD COLUMN shop_id INTEGER DEFAULT 1");
        // SKU migration: add column then back-fill existing products
        if (!columns.some(c => c.name === "sku")) {
          db.run("ALTER TABLE products ADD COLUMN sku TEXT", () => {
            db.run("UPDATE products SET sku = 'SKU-' || id WHERE sku IS NULL OR sku = ''", (err2) => {
              if (!err2) console.log("SKU column added and back-filled ✅");
            });
          });
        }
        // ── Dual-unit / Loose Selling migrations (safe, all nullable/defaulted) ──
        if (!columns.some(c => c.name === "unit"))             db.run("ALTER TABLE products ADD COLUMN unit TEXT DEFAULT 'NOS'");
        if (!columns.some(c => c.name === "sell_mode"))        db.run("ALTER TABLE products ADD COLUMN sell_mode TEXT DEFAULT 'UNIT'");
        if (!columns.some(c => c.name === "loose_unit"))       db.run("ALTER TABLE products ADD COLUMN loose_unit TEXT");
        if (!columns.some(c => c.name === "loose_conversion")) db.run("ALTER TABLE products ADD COLUMN loose_conversion REAL DEFAULT 1");
        if (!columns.some(c => c.name === "loose_stock"))      db.run("ALTER TABLE products ADD COLUMN loose_stock REAL DEFAULT 0");
        if (!columns.some(c => c.name === "loose_price"))      db.run("ALTER TABLE products ADD COLUMN loose_price REAL DEFAULT 0");
        db.run("SELECT 1", () => {
          console.log("Dual-unit columns ready ✅");
        });
      });
    }
  });

  // ─── SALES TABLE ────────────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    total_amount REAL,
    gst_amount REAL,
    customer_name TEXT,
    customer_phone TEXT,
    customer_gstin TEXT,
    invoice_number TEXT,
    shop_id INTEGER DEFAULT 1
  )`, (err) => {
    if (err) console.error("Error creating sales table:", err);
  });

  // Safe migrations for sales
  db.all("PRAGMA table_info(sales)", (err, columns) => {
    if (!err && columns) {
      if (!columns.some(c => c.name === "customer_name"))    db.run("ALTER TABLE sales ADD COLUMN customer_name TEXT");
      if (!columns.some(c => c.name === "customer_phone"))   db.run("ALTER TABLE sales ADD COLUMN customer_phone TEXT");
      if (!columns.some(c => c.name === "customer_gstin"))   db.run("ALTER TABLE sales ADD COLUMN customer_gstin TEXT");
      if (!columns.some(c => c.name === "invoice_number"))   db.run("ALTER TABLE sales ADD COLUMN invoice_number TEXT");
      if (!columns.some(c => c.name === "shop_id"))          db.run("ALTER TABLE sales ADD COLUMN shop_id INTEGER DEFAULT 1");
      // columns needed for credit/ledger tracking
      if (!columns.some(c => c.name === "customer_id"))      db.run("ALTER TABLE sales ADD COLUMN customer_id INTEGER");
      if (!columns.some(c => c.name === "payment_mode"))     db.run("ALTER TABLE sales ADD COLUMN payment_mode TEXT DEFAULT 'cash'");
      if (!columns.some(c => c.name === "payment_status"))   db.run("ALTER TABLE sales ADD COLUMN payment_status TEXT DEFAULT 'paid'");
    }
  });

  // Safe migrations for customers
  db.all("PRAGMA table_info(customers)", (err, columns) => {
    if (!err && columns) {
      if (!columns.some(c => c.name === "outstanding"))   db.run("ALTER TABLE customers ADD COLUMN outstanding REAL DEFAULT 0");
      if (!columns.some(c => c.name === "credit_limit"))  db.run("ALTER TABLE customers ADD COLUMN credit_limit REAL DEFAULT 0");
    }
  });

  // ─── SALE ITEMS TABLE ───────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS sale_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id INTEGER,
    product_id INTEGER,
    quantity INTEGER,
    selling_price REAL,
    purchase_price REAL
  )`);

  // ─── CUSTOMERS TABLE ────────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    gstin TEXT,
    address TEXT,
    state TEXT,
    state_code TEXT,
    credit_limit REAL DEFAULT 0,
    outstanding REAL DEFAULT 0,
    shop_id INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) console.error("Error creating customers table:", err);
    else console.log("Customers table ready ✅");
  });

  // ─── SUPPLIERS TABLE ────────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    gstin TEXT,
    address TEXT,
    state TEXT,
    state_code TEXT,
    shop_id INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
  )`, (err) => {
    if (err) console.error("Error creating suppliers table:", err);
    else console.log("Suppliers table ready ✅");
  });

  // ─── PURCHASES TABLE ────────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    supplier_id INTEGER,
    supplier_name TEXT,
    invoice_number TEXT,
    total_amount REAL,
    gst_amount REAL,
    shop_id INTEGER DEFAULT 1
  )`, (err) => {
    if (err) console.error("Error creating purchases table:", err);
    else console.log("Purchases table ready ✅");
  });

  // ─── PURCHASE ITEMS TABLE ───────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS purchase_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_id INTEGER,
    product_id INTEGER,
    product_name TEXT,
    quantity INTEGER,
    purchase_price REAL,
    gst REAL,
    hsn_code TEXT
  )`, (err) => {
    if (err) console.error("Error creating purchase_items table:", err);
    else console.log("Purchase items table ready ✅");
  });

  // ─── EXPENSES TABLE ─────────────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    category TEXT,
    description TEXT,
    amount REAL,
    shop_id INTEGER DEFAULT 1
  )`, (err) => {
    if (err) console.error("Error creating expenses table:", err);
    else console.log("Expenses table ready ✅");
  });

  // ─── CUSTOMER LEDGER TABLE ──────────────────────────────────────
  db.run(`CREATE TABLE IF NOT EXISTS customer_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    customer_name TEXT,
    date TEXT,
    type TEXT,
    description TEXT,
    debit REAL DEFAULT 0,
    credit REAL DEFAULT 0,
    balance REAL DEFAULT 0,
    sale_id INTEGER,
    shop_id INTEGER DEFAULT 1
  )`, (err) => {
    if (err) console.error("Error creating customer_ledger table:", err);
    else {
      console.log("Customer ledger table ready ✅");
      
      // Historical fix/migration: Update loose item sale purchase prices to reflect loose unit cost
      const fixLoosePurchasesQuery = `
        UPDATE sale_items 
        SET purchase_price = (
            SELECT p.purchase_price / IFNULL(p.loose_conversion, 1)
            FROM products p 
            WHERE p.id = sale_items.product_id
        )
        WHERE sale_items.id IN (
            SELECT si.id 
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            WHERE (p.sell_mode = 'LOOSE' AND si.purchase_price = p.purchase_price AND p.loose_conversion > 1)
               OR (p.sell_mode = 'BOTH' AND si.selling_price = p.loose_price AND si.purchase_price = p.purchase_price AND p.loose_conversion > 1 AND p.loose_price != p.selling_price)
        )
      `;
      db.run(fixLoosePurchasesQuery, function(err2) {
        if (err2) console.error("Error running loose purchase price migration:", err2.message);
        else if (this.changes > 0) {
          console.log(`Successfully fixed purchase prices for ${this.changes} historical loose sale items! ✅`);
        }
      });
    }
  });

});

module.exports = db;