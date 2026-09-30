const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("../database/database");

// Timezone fix: Get local date string in ISO format (YYYY-MM-DDTHH:MM:SS) 
// to prevent timezone shifts (like 1:30 AM IST becoming previous day in UTC)
function getLocalISOString() {
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    return (new Date(Date.now() - tzoffset)).toISOString().slice(0, 19);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, "../renderer")));

// Request logging
app.use((req, res, next) => {
    console.log(`${getLocalISOString()} - ${req.method} ${req.path}`);
    next();
});

// ─── PING ────────────────────────────────────────────────────────────────────
app.get("/ping", (req, res) => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let ip = "127.0.0.1";
    for (let devName in interfaces) {
        interfaces[devName].forEach(iface => {
            if (iface.family === 'IPv4' && !iface.internal) ip = iface.address;
        });
    }
    res.json({ status: "ok", message: "APNA ENTERPRISES Server Online ✅", ip });
});

// ─── AUTHENTICATION ──────────────────────────────────────────────────────────
app.post("/login", (req, res) => {
    const { username, password, shop_id } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ? AND shop_id = ?",
        [username, password, shop_id], (err, user) => {
            if (err) return res.status(500).json({ error: err.message });
            if (user) {
                res.json({ success: true, username: user.username, shop_id: user.shop_id });
            } else {
                res.status(401).json({ success: false, message: "Invalid credentials" });
            }
        });
});

app.post("/reset-password-with-pin", (req, res) => {
    const { username, masterPin, newPassword, shop_id } = req.body;
    const targetShopId = shop_id || 1;
    db.get("SELECT * FROM users WHERE username = ? AND master_pin = ? AND shop_id = ?", [username, masterPin, targetShopId], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (user) {
            db.run("UPDATE users SET password = ? WHERE id = ?", [newPassword, user.id], function (err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true, message: "Password updated successfully" });
            });
        } else {
            res.status(401).json({ success: false, message: "Incorrect Master PIN" });
        }
    });
});

app.post("/change-password", (req, res) => {
    const { username, oldPassword, newPassword } = req.body;
    db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, oldPassword], (err, user) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!user) return res.status(401).json({ success: false, message: "Incorrect old password." });
        
        db.run("UPDATE users SET password = ? WHERE id = ?", [newPassword, user.id], function (err) {
            if (err) return res.status(500).json({ error: "Failed to update password" });
            res.json({ success: true, message: "Password updated successfully" });
        });
    });
});

// ─── SHOP INFO ───────────────────────────────────────────────────────────────
app.get("/shop-info", (req, res) => {
    const shop_id = req.query.shop_id || 1;
    db.get("SELECT * FROM shops WHERE id = ?", [shop_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

app.post("/update-shop-info", (req, res) => {
    const { shop_id, name, gstin, address, phone, state, state_code, bank_name, account_number, ifsc_code, invoice_prefix } = req.body;
    db.run(`UPDATE shops SET name=?, gstin=?, address=?, phone=?, state=?, state_code=?, bank_name=?, account_number=?, ifsc_code=?, invoice_prefix=? WHERE id=?`,
        [name, gstin, address, phone, state, state_code, bank_name, account_number, ifsc_code, invoice_prefix, shop_id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Shop info updated ✅" });
        });
});

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
app.get("/products", (req, res) => {
    const shop_id = req.query.shop_id || 1;
    db.all("SELECT * FROM products WHERE shop_id = ?", [shop_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get("/next-invoice-number", (req, res) => {
    const shop_id = req.query.shop_id || 1;
    const year = new Date().getFullYear();
    
    // First get the prefix for this shop
    db.get("SELECT invoice_prefix FROM shops WHERE id = ?", [shop_id], (err, shopRow) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let prefix = shopRow && shopRow.invoice_prefix ? shopRow.invoice_prefix : (shop_id == 2 ? "APNA-HW" : "APNA");
        
        // Then get the count for the next number
        db.get("SELECT COUNT(*) as count FROM sales WHERE strftime('%Y', date) = ? AND shop_id = ?",
            [year.toString(), shop_id], (err, row) => {
                if (err) return res.status(500).json({ error: err.message });
                const nextNum = (row.count + 1).toString().padStart(3, '0');
                res.json({ invoiceNumber: `${prefix}/${year}/${nextNum}` });
            });
    });
});

app.post("/add-product", (req, res) => {
    const { name, category, purchase_price, selling_price, gst, quantity, min_stock, hsn_code, shop_id, sku,
            unit, sell_mode, loose_unit, loose_conversion, loose_stock, loose_price } = req.body;
    const finalSku = (sku && sku.trim()) ? sku.trim().toUpperCase() : null;
    const finalUnit = (unit && unit.trim()) ? unit.trim().toUpperCase() : 'NOS';
    const finalMode = sell_mode || 'UNIT';
    
    const query = `INSERT INTO products (name, category, purchase_price, selling_price, gst, quantity, min_stock, hsn_code, shop_id, sku, unit, sell_mode, loose_unit, loose_conversion, loose_stock, loose_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(query, [name, category || "", purchase_price || 0, selling_price || 0, gst || 0, quantity || 0, min_stock || 0, hsn_code || "", shop_id || 1, finalSku, finalUnit, finalMode, loose_unit || null, loose_conversion || 1, loose_stock || 0, loose_price || 0], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        const newId = this.lastID;
        if (!finalSku) {
            db.run("UPDATE products SET sku = ? WHERE id = ?", [`SKU-${newId}`, newId], () => {
                res.json({ message: "Product Added", id: newId });
            });
        } else {
            res.json({ message: "Product Added", id: newId });
        }
    });
});

app.post("/bulk-import-products", (req, res) => {
    const { products, shop_id } = req.body;
    if (!products || !Array.isArray(products) || products.length === 0)
        return res.status(400).json({ error: "No products provided" });
    const valid = products.filter(p => p.name && p.selling_price);
    if (valid.length === 0)
        return res.status(400).json({ error: "No valid rows" });
    const query = `INSERT INTO products (
        name, category, purchase_price, selling_price, gst, quantity, min_stock, hsn_code, shop_id, sku,
        unit, sell_mode, loose_unit, loose_conversion, loose_stock, loose_price
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        valid.forEach(p => {
            const skuVal = p.sku ? p.sku.trim().toUpperCase() : null;
            const finalUnit = p.unit ? p.unit.trim().toUpperCase() : 'NOS';
            const finalMode = p.sell_mode ? p.sell_mode.trim().toUpperCase() : 'UNIT';
            db.run(query, [
                p.name, p.category || "", p.purchase_price || 0, p.selling_price || 0, p.gst || 0, p.quantity || 0, p.min_stock || 0, p.hsn_code || "", shop_id || 1, skuVal,
                finalUnit, finalMode, p.loose_unit || null, p.loose_conversion || 1, p.loose_stock || 0, p.loose_price || 0
            ]);
        });
        db.run("COMMIT", (err) => {
            if (err) return res.status(500).json({ error: "Commit failed: " + err.message });
            // Back-fill any rows that got NULL sku (auto-generate)
            db.run("UPDATE products SET sku = 'SKU-' || id WHERE (sku IS NULL OR sku = '') AND shop_id = ?", [shop_id || 1], () => {
                res.json({ message: "Bulk import successful", imported: valid.length });
            });
        });
    });
});

app.post("/update-product-details", (req, res) => {
    const { id, name, category, purchase_price, selling_price, gst, quantity, min_stock, hsn_code, sku,
            unit, sell_mode, loose_unit, loose_conversion, loose_price } = req.body;
    const skuVal = (sku && String(sku).trim()) ? String(sku).trim().toUpperCase() : `SKU-${id}`;
    const finalUnit = (unit && unit.trim()) ? unit.trim().toUpperCase() : 'NOS';
    const finalMode = sell_mode || 'UNIT';
    const query = `UPDATE products SET name=?, category=?, purchase_price=?, selling_price=?, gst=?, quantity=?, min_stock=?, hsn_code=?, sku=?, unit=?, sell_mode=?, loose_unit=?, loose_conversion=?, loose_price=? WHERE id=?`;
    db.run(query, [name, category || "", purchase_price || 0, selling_price || 0, gst || 0, quantity || 0, min_stock || 0, hsn_code || "", skuVal, finalUnit, finalMode, loose_unit || null, loose_conversion || 1, loose_price || 0, id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Updated Successfully", changes: this.changes });
    });
});

// ─── BREAK STOCK (convert whole units → loose stock) ─────────────────────────
app.post("/break-stock", (req, res) => {
    const { id, units_to_break } = req.body;
    if (!id || !units_to_break || units_to_break <= 0)
        return res.status(400).json({ error: "Invalid break-stock request" });
    db.get("SELECT quantity, loose_conversion, loose_stock, sell_mode FROM products WHERE id = ?", [id], (err, p) => {
        if (err || !p) return res.status(404).json({ error: "Product not found" });
        if (p.sell_mode === 'UNIT') return res.status(400).json({ error: "Product is not set to loose/both mode" });
        if (p.quantity < units_to_break) return res.status(400).json({ error: "Not enough stock to break" });
        const newQty        = p.quantity - units_to_break;
        const addedLoose    = units_to_break * (p.loose_conversion || 1);
        const newLooseStock = (p.loose_stock || 0) + addedLoose;
        db.run("UPDATE products SET quantity=?, loose_stock=? WHERE id=?", [newQty, newLooseStock, id], function(err2) {
            if (err2) return res.status(500).json({ error: err2.message });
            res.json({ message: "Stock broken successfully", new_qty: newQty, new_loose_stock: newLooseStock });
        });
    });
});

app.post("/update-stock", (req, res) => {
    const { id, added_qty, new_purchase_price } = req.body;
    db.get("SELECT quantity, purchase_price FROM products WHERE id = ?", [id], (err, product) => {
        if (err || !product) return res.status(404).json({ error: "Product not found" });
        const oldQty = product.quantity || 0;
        const oldPrice = product.purchase_price || 0;
        const incomingPrice = new_purchase_price || oldPrice;
        const newTotalQty = oldQty + added_qty;
        const newAvgPrice = newTotalQty > 0 ? ((oldQty * oldPrice) + (added_qty * incomingPrice)) / newTotalQty : 0;
        db.run(`UPDATE products SET quantity = ?, purchase_price = ? WHERE id = ?`, [newTotalQty, newAvgPrice, id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Stock Updated", new_quantity: newTotalQty });
        });
    });
});

app.delete("/delete-product/:id", (req, res) => {
    db.run("DELETE FROM products WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Deleted", changes: this.changes });
    });
});

// ─── SALES ───────────────────────────────────────────────────────────────────
// /add-sale and /undo-sale are defined below (credit/ledger-aware versions)

// ─── SALES HISTORY ───────────────────────────────────────────────────────────
app.get("/sales-history", (req, res) => {
    const shop_id = req.query.shop_id || 1;
    const limit = req.query.limit || 50;
    db.all(`SELECT s.*, GROUP_CONCAT(p.name || ' x' || si.quantity) as items_summary
            FROM sales s
            LEFT JOIN sale_items si ON s.id = si.sale_id
            LEFT JOIN products p ON si.product_id = p.id
            WHERE s.shop_id = ?
            GROUP BY s.id
            ORDER BY s.date DESC LIMIT ?`, [shop_id, limit], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get("/sales-advanced-report", (req, res) => {
    const shop_id = req.query.shop_id || 1;
    // We will join sales and sale_items to get comprehensive data
    db.all(`
        SELECT 
            s.id as sale_id, s.invoice_number, s.date, s.customer_name, s.customer_phone, 
            s.total_amount, s.gst_amount, s.payment_mode, s.payment_status,
            si.product_id, si.quantity, si.selling_price, si.purchase_price,
            p.name as product_name
        FROM sales s
        LEFT JOIN sale_items si ON s.id = si.sale_id
        LEFT JOIN products p ON si.product_id = p.id
        WHERE s.shop_id = ?
        ORDER BY s.date DESC
    `, [shop_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get("/sale-detail/:id", (req, res) => {
    db.all(`SELECT si.*, p.name, p.hsn_code FROM sale_items si
            LEFT JOIN products p ON si.product_id = p.id
            WHERE si.sale_id = ?`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// ─── CUSTOMERS ───────────────────────────────────────────────────────────────
app.get("/customers", (req, res) => {
    const shop_id = req.query.shop_id || 1;
    db.all("SELECT * FROM customers WHERE shop_id = ? ORDER BY name ASC", [shop_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post("/add-customer", (req, res) => {
    const { name, phone, gstin, address, state, state_code, credit_limit, shop_id } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    db.run(`INSERT INTO customers (name, phone, gstin, address, state, state_code, credit_limit, shop_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, phone || "", gstin || "", address || "", state || "", state_code || "", credit_limit || 0, shop_id || 1],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Customer Added ✅", id: this.lastID });
        });
});

app.post("/update-customer", (req, res) => {
    const { id, name, phone, gstin, address, state, state_code, credit_limit } = req.body;
    db.run(`UPDATE customers SET name=?, phone=?, gstin=?, address=?, state=?, state_code=?, credit_limit=? WHERE id=?`,
        [name, phone, gstin, address, state, state_code, credit_limit, id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Customer Updated ✅" });
        });
});

app.delete("/delete-customer/:id", (req, res) => {
    db.run("DELETE FROM customers WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Deleted ✅" });
    });
});

app.get("/customer-sales/:id", (req, res) => {
    db.all(
        `SELECT * FROM sales WHERE customer_id = ? ORDER BY date DESC`,
        [req.params.id], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// Record a payment received from customer (reduces outstanding)
app.post("/record-payment", (req, res) => {
    const { customer_id, amount, description, shop_id } = req.body;
    if (!customer_id || !amount || amount <= 0)
        return res.status(400).json({ error: "customer_id and positive amount required" });
    const date = getLocalISOString();
    db.get(
        "SELECT IFNULL(SUM(debit - credit), 0) as balance FROM customer_ledger WHERE customer_id = ?",
        [customer_id],
        (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            const prevBalance = row ? row.balance : 0;
            const newBalance = prevBalance - amount;
            db.run(
                `INSERT INTO customer_ledger
                 (customer_id, customer_name, date, type, description, debit, credit, balance, shop_id)
                 SELECT ?, name, ?, 'payment', ?, 0, ?, ?, ? FROM customers WHERE id = ?`,
                [customer_id, date, description || "Payment received", amount, newBalance, shop_id || 1, customer_id],
                (err2) => {
                    if (err2) return res.status(500).json({ error: err2.message });
                    db.run("UPDATE customers SET outstanding = ? WHERE id = ?", [newBalance, customer_id], (err3) => {
                        if (err3) return res.status(500).json({ error: err3.message });
                        res.json({ message: "Payment recorded ✅", newBalance });
                    });
                }
            );
        }
    );
});

// ─── SUPPLIERS ───────────────────────────────────────────────────────────────

app.get("/suppliers", (req, res) => {
    const shop_id = req.query.shop_id || 1;
    db.all("SELECT * FROM suppliers WHERE shop_id = ? ORDER BY name ASC", [shop_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post("/add-supplier", (req, res) => {
    const { name, phone, gstin, address, state, state_code, shop_id } = req.body;
    if (!name) return res.status(400).json({ error: "Name is required" });
    db.run(`INSERT INTO suppliers (name, phone, gstin, address, state, state_code, shop_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, phone || "", gstin || "", address || "", state || "", state_code || "", shop_id || 1],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Supplier Added ✅", id: this.lastID });
        });
});

app.post("/update-supplier", (req, res) => {
    const { id, name, phone, gstin, address, state, state_code } = req.body;
    db.run(`UPDATE suppliers SET name=?, phone=?, gstin=?, address=?, state=?, state_code=? WHERE id=?`,
        [name, phone, gstin, address, state, state_code, id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Supplier Updated ✅" });
        });
});

app.delete("/delete-supplier/:id", (req, res) => {
    db.run("DELETE FROM suppliers WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Deleted ✅" });
    });
});

// ─── PURCHASES ───────────────────────────────────────────────────────────────
app.get("/purchases", (req, res) => {
    const shop_id = req.query.shop_id || 1;
    db.all("SELECT * FROM purchases WHERE shop_id = ? ORDER BY date DESC", [shop_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get("/purchase-detail/:id", (req, res) => {
    db.all("SELECT * FROM purchase_items WHERE purchase_id = ?", [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post("/add-purchase", (req, res) => {
    const { supplier_id, supplier_name, invoice_number, total_amount, gst_amount, items, shop_id } = req.body;
    const date = getLocalISOString();
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run(`INSERT INTO purchases (date, supplier_id, supplier_name, invoice_number, total_amount, gst_amount, shop_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [date, supplier_id || 0, supplier_name, invoice_number, total_amount, gst_amount || 0, shop_id || 1],
            function (err) {
                if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
                const purchaseId = this.lastID;
                items.forEach(item => {
                    db.run(`INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, purchase_price, gst, hsn_code) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [purchaseId, item.product_id || 0, item.product_name, item.quantity, item.purchase_price, item.gst || 0, item.hsn_code || ""]);
                    if (item.product_id) {
                        db.run("UPDATE products SET quantity = quantity + ?, purchase_price = ? WHERE id = ?",
                            [item.quantity, item.purchase_price, item.product_id]);
                    }
                });
                db.run("COMMIT", (err) => {
                    if (err) return res.status(500).json({ error: "Commit failed" });
                    res.json({ message: "Purchase Recorded ✅", purchaseId });
                });
            });
    });
});

app.delete("/delete-purchase/:id", (req, res) => {
    const purchaseId = req.params.id;
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.all("SELECT * FROM purchase_items WHERE purchase_id = ?", [purchaseId], (err, items) => {
            if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
            items.forEach(item => {
                if (item.product_id) {
                    db.run("UPDATE products SET quantity = quantity - ? WHERE id = ?", [item.quantity, item.product_id]);
                }
            });
            db.run("DELETE FROM purchase_items WHERE purchase_id = ?", [purchaseId]);
            db.run("DELETE FROM purchases WHERE id = ?", [purchaseId]);
            db.run("COMMIT", (err) => {
                if (err) return res.status(500).json({ error: "Commit failed" });
                res.json({ message: "Purchase Deleted ✅" });
            });
        });
    });
});

app.put("/edit-purchase/:id", (req, res) => {
    const purchaseId = req.params.id;
    const { supplier_id, supplier_name, invoice_number, total_amount, gst_amount, items } = req.body;
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        // 1. Fetch old items and revert stock
        db.all("SELECT * FROM purchase_items WHERE purchase_id = ?", [purchaseId], (err, oldItems) => {
            if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }
            oldItems.forEach(item => {
                if (item.product_id) {
                    db.run("UPDATE products SET quantity = quantity - ? WHERE id = ?", [item.quantity, item.product_id]);
                }
            });
            
            // 2. Delete old items
            db.run("DELETE FROM purchase_items WHERE purchase_id = ?", [purchaseId]);
            
            // 3. Update purchase record
            db.run("UPDATE purchases SET supplier_id = ?, supplier_name = ?, invoice_number = ?, total_amount = ?, gst_amount = ? WHERE id = ?", 
                [supplier_id, supplier_name, invoice_number, total_amount, gst_amount, purchaseId]);
            
            // 4. Insert new items and update stock
            if (items && items.length > 0) {
                items.forEach(item => {
                    db.run(`INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, purchase_price, gst, hsn_code) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [purchaseId, item.product_id || 0, item.product_name, item.quantity, item.purchase_price, item.gst || 0, item.hsn_code || ""]);
                    if (item.product_id) {
                        db.run("UPDATE products SET quantity = quantity + ?, purchase_price = ? WHERE id = ?",
                            [item.quantity, item.purchase_price, item.product_id]);
                    }
                });
            }
            
            db.run("COMMIT", (err) => {
                if (err) return res.status(500).json({ error: "Commit failed" });
                res.json({ message: "Purchase Updated ✅", purchaseId });
            });
        });
    });
});

// ─── EXPENSES ────────────────────────────────────────────────────────────────
app.get("/expenses", (req, res) => {
    const shop_id = req.query.shop_id || 1;
    const from = req.query.from;
    const to = req.query.to;
    let query = "SELECT * FROM expenses WHERE shop_id = ?";
    let params = [shop_id];
    if (from && to) { query += " AND date(date) BETWEEN date(?) AND date(?)"; params.push(from, to); }
    query += " ORDER BY date DESC";
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post("/add-expense", (req, res) => {
    const { date, category, description, amount, shop_id } = req.body;
    if (!amount) return res.status(400).json({ error: "Amount is required" });
    db.run(`INSERT INTO expenses (date, category, description, amount, shop_id) VALUES (?, ?, ?, ?, ?)`,
        [date || getLocalISOString(), category || "General", description || "", amount, shop_id || 1],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Expense Added ✅", id: this.lastID });
        });
});

app.delete("/delete-expense/:id", (req, res) => {
    db.run("DELETE FROM expenses WHERE id = ?", [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Deleted ✅" });
    });
});

// ─── CUSTOMER LEDGER ─────────────────────────────────────────────────────────
app.get("/ledger/:customer_id", (req, res) => {
    db.all("SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY date ASC", [req.params.customer_id], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post("/add-ledger-entry", (req, res) => {
    const { customer_id, customer_name, type, description, debit, credit, sale_id, shop_id } = req.body;
    const date = getLocalISOString();
    db.get("SELECT IFNULL(SUM(debit - credit), 0) as balance FROM customer_ledger WHERE customer_id = ?", [customer_id], (err, row) => {
        const prevBalance = row ? row.balance : 0;
        const newBalance = prevBalance + (debit || 0) - (credit || 0);
        db.run(`INSERT INTO customer_ledger (customer_id, customer_name, date, type, description, debit, credit, balance, sale_id, shop_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [customer_id, customer_name, date, type, description, debit || 0, credit || 0, newBalance, sale_id || null, shop_id || 1],
            function (err) {
                if (err) return res.status(500).json({ error: err.message });
                db.run("UPDATE customers SET outstanding = ? WHERE id = ?", [newBalance, customer_id]);
                res.json({ message: "Entry Added ✅", balance: newBalance });
            });
    });
});

app.delete("/ledger/:id", (req, res) => {
    db.get("SELECT customer_id FROM customer_ledger WHERE id = ?", [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Entry not found" });
        const custId = row.customer_id;
        
        db.run("DELETE FROM customer_ledger WHERE id = ?", [req.params.id], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            
            // Recalculate overall outstanding balance for the customer
            db.get("SELECT IFNULL(SUM(debit - IFNULL(credit, 0)), 0) as balance FROM customer_ledger WHERE customer_id = ?", [custId], (err, bRow) => {
                const newBalance = bRow ? bRow.balance : 0;
                db.run("UPDATE customers SET outstanding = ? WHERE id = ?", [newBalance, custId]);
                
                // Optional: Recalculate running balances for all rows of this customer to keep ledger correct
                db.all("SELECT id, debit, credit FROM customer_ledger WHERE customer_id = ? ORDER BY date ASC, id ASC", [custId], (err, rows) => {
                    if (!err && rows) {
                        let running = 0;
                        rows.forEach(r => {
                            running += (r.debit || 0) - (r.credit || 0);
                            db.run("UPDATE customer_ledger SET balance = ? WHERE id = ?", [running, r.id]);
                        });
                    }
                });

                res.json({ message: "Deleted ✅" });
            });
        });
    });
});

// ─── REPORTS ─────────────────────────────────────────────────────────────────
app.get("/gst-report", (req, res) => {
    const shop_id = req.query.shop_id || 1;
    const from = req.query.from;
    const to = req.query.to;
    
    let condition = `s.shop_id = ?`;
    let params = [shop_id];

    if (from && to) {
        condition += ` AND date(s.date) BETWEEN date(?) AND date(?)`;
        params.push(from, to);
    }

    const q = `SELECT s.invoice_number, s.date, s.customer_name, s.customer_gstin,
                s.total_amount, s.gst_amount,
                (s.total_amount - IFNULL(s.gst_amount, 0)) as taxable_amount
                FROM sales s WHERE ${condition} ORDER BY s.date DESC`;
                
    db.all(q, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get("/profit-loss", (req, res) => {
    const shop_id = req.query.shop_id || 1;
    const from = req.query.from;
    const to = req.query.to;
    
    let saleCond = `s.shop_id = ?`;
    let expCond = `shop_id = ?`;
    let params = [shop_id];
    
    if (from && to) {
        saleCond += ` AND date(s.date) BETWEEN date(?) AND date(?)`;
        expCond += ` AND date(date) BETWEEN date(?) AND date(?)`;
        params.push(from, to);
    }
    
    const salesQ = `SELECT IFNULL(SUM(total_amount - IFNULL(gst_amount,0)),0) as revenue, IFNULL(SUM(IFNULL(gst_amount,0)),0) as gst_collected FROM sales s WHERE ${saleCond}`;
    const profitQ = `SELECT IFNULL(SUM((si.selling_price - si.purchase_price) * si.quantity),0) as gross_profit FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE ${saleCond}`;
    const expenseQ = `SELECT IFNULL(SUM(amount),0) as total_expenses FROM expenses WHERE ${expCond}`;
    
    let purchaseCond = `shop_id = ?`;
    let purchaseParams = [shop_id];
    if (from && to) {
        purchaseCond += ` AND date(date) BETWEEN date(?) AND date(?)`;
        purchaseParams.push(from, to);
    }
    const purchaseQ = `SELECT IFNULL(SUM(total_amount),0) as total_purchases FROM purchases WHERE ${purchaseCond}`;

    db.get(salesQ, params, (err, sRow) => {
        db.get(profitQ, params, (err, pRow) => {
            db.get(expenseQ, params, (err, eRow) => {
                db.get(purchaseQ, purchaseParams, (err, puRow) => {
                    const gross = pRow ? pRow.gross_profit : 0;
                    const expenses = eRow ? eRow.total_expenses : 0;
                    const net_profit = gross - expenses;
                    res.json({
                        revenue: sRow ? sRow.revenue : 0,
                        gst_collected: sRow ? sRow.gst_collected : 0,
                        gross_profit: gross,
                        total_expenses: expenses,
                        total_purchases: puRow ? puRow.total_purchases : 0,
                        net_profit
                    });
                });
            });
        });
    });
});

// ─── BACKUP ──────────────────────────────────────────────────────────────────
app.get("/backup", (req, res) => {
    // Core tables to backup
    const tables = ['shops', 'users', 'products', 'sales', 'sale_items', 'customers', 'suppliers', 'purchases', 'purchase_items', 'expenses', 'customer_ledger'];
    const backup = { timestamp: new Date().toISOString(), is_full_backup: true, data: {} };
    let done = 0;
    
    tables.forEach(table => {
        db.all(`SELECT * FROM ${table}`, (err, rows) => {
            backup.data[table] = rows || [];
            done++;
            if (done === tables.length) {
                res.setHeader('Content-Disposition', `attachment; filename=apna_enterprises_backup_${new Date().toISOString().slice(0, 10)}.json`);
                res.json(backup);
            }
        });
    });
});

// ─── RESTORE BACKUP ──────────────────────────────────────────────────────────
app.post("/restore-backup", (req, res) => {
    const backup = req.body;

    if (!backup || !backup.data) {
        return res.status(400).json({ error: "Invalid backup file. Please select a valid Apna Enterprises backup." });
    }

    const { data } = backup;
    const isFull = backup.is_full_backup || !backup.shop_id;
    const targetShopId = backup.shop_id;
    const tablesToRestore = ['shops', 'users', 'products', 'sales', 'sale_items', 'customers', 'suppliers', 'purchases', 'purchase_items', 'expenses', 'customer_ledger'];

    const hasValidData = tablesToRestore.some(t => Array.isArray(data[t]));
    if (!hasValidData) {
        return res.status(400).json({ error: "Backup file does not contain recognizable data tables." });
    }

    db.run("BEGIN TRANSACTION", (beginErr) => {
        if (beginErr) return res.status(500).json({ error: "Failed to start restore transaction." });

        // Define delete queries: clear entire database if full backup, or filter by shop_id if legacy backup
        let deleteSql = [];
        if (isFull) {
            deleteSql = [
                `DELETE FROM sale_items`,
                `DELETE FROM purchase_items`,
                `DELETE FROM sales`,
                `DELETE FROM purchases`,
                `DELETE FROM products`,
                `DELETE FROM customers`,
                `DELETE FROM suppliers`,
                `DELETE FROM expenses`,
                `DELETE FROM customer_ledger`,
                `DELETE FROM users`,
                `DELETE FROM shops`
            ];
        } else {
            deleteSql = [
                `DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE shop_id = ${targetShopId})`,
                `DELETE FROM purchase_items WHERE purchase_id IN (SELECT id FROM purchases WHERE shop_id = ${targetShopId})`,
                `DELETE FROM sales WHERE shop_id = ${targetShopId}`,
                `DELETE FROM purchases WHERE shop_id = ${targetShopId}`,
                `DELETE FROM products WHERE shop_id = ${targetShopId}`,
                `DELETE FROM customers WHERE shop_id = ${targetShopId}`,
                `DELETE FROM suppliers WHERE shop_id = ${targetShopId}`,
                `DELETE FROM expenses WHERE shop_id = ${targetShopId}`,
                `DELETE FROM customer_ledger WHERE shop_id = ${targetShopId}`,
                `DELETE FROM users WHERE shop_id = ${targetShopId}`,
                `DELETE FROM shops WHERE id = ${targetShopId}`
            ];
        }

        let deleteError = null;
        function runDeletes(index) {
            if (index >= deleteSql.length) {
                if (deleteError) {
                    db.run("ROLLBACK");
                    return res.status(500).json({ error: "Failed to clear existing data: " + deleteError });
                }
                return runInserts();
            }
            db.run(deleteSql[index], (err) => {
                if (err) deleteError = err.message;
                runDeletes(index + 1);
            });
        }

        function runInserts() {
            let tableIndex = 0;

            function restoreNextTable() {
                if (tableIndex >= tablesToRestore.length) {
                    db.run("COMMIT", (commitErr) => {
                        if (commitErr) {
                            db.run("ROLLBACK");
                            return res.status(500).json({ error: "Failed to commit restore transaction." });
                        }
                        return res.json({ success: true, message: "Backup restored successfully!" });
                    });
                    return;
                }

                const table = tablesToRestore[tableIndex];
                const rows = data[table];

                if (!rows || rows.length === 0) {
                    tableIndex++;
                    return restoreNextTable();
                }

                db.all(`PRAGMA table_info(${table})`, (infoErr, columnsInfo) => {
                    if (infoErr || !columnsInfo || columnsInfo.length === 0) {
                        tableIndex++;
                        return restoreNextTable();
                    }

                    const dbColumns = columnsInfo.map(col => col.name);
                    let rowIndex = 0;

                    function insertNextRow() {
                        if (rowIndex >= rows.length) {
                            tableIndex++;
                            return restoreNextTable();
                        }

                        const row = rows[rowIndex];
                        const validCols = dbColumns.filter(c => {
                            if (row[c] !== undefined && row[c] !== null) return true;
                            if (c === 'hsn_code' && row['hsn'] !== undefined) return true;
                            if (c === 'gst' && row['gst_rate'] !== undefined) return true;
                            if (c === 'min_stock' && row['min_stock_level'] !== undefined) return true;
                            return false;
                        });

                        if (validCols.length === 0) {
                            rowIndex++;
                            return insertNextRow();
                        }

                        const placeholders = validCols.map(() => '?').join(',');
                        const values = validCols.map(c => {
                            if (row[c] !== undefined && row[c] !== null) return row[c];
                            if (c === 'hsn_code' && row['hsn'] !== undefined) return row['hsn'];
                            if (c === 'gst' && row['gst_rate'] !== undefined) return row['gst_rate'];
                            if (c === 'min_stock' && row['min_stock_level'] !== undefined) return row['min_stock_level'];
                            return null;
                        });

                        const sql = `INSERT OR IGNORE INTO ${table} (${validCols.join(',')}) VALUES (${placeholders})`;
                        db.run(sql, values, (err) => {
                            if (err) console.warn(`Restore warning on ${table} row ${rowIndex}:`, err.message);
                            rowIndex++;
                            insertNextRow();
                        });
                    }

                    insertNextRow();
                });
            }

            restoreNextTable();
        }

        runDeletes(0);
    });
});
// ─── SERVER START ────────────────────────────────────────────────────────────
const serverReady = new Promise((resolve) => {
    app.listen(4000, "0.0.0.0", () => {
        console.log("Server running on http://0.0.0.0:4000");
        resolve();
    });
});

module.exports = { serverReady };

// ─── CUSTOMER SEARCH ─────────────────────────────────────────────────────────
app.get("/customer-search", (req, res) => {
    const { q, shop_id } = req.query;
    if (!q || q.trim() === "") return res.json([]);
    const term = `%${q}%`;
    db.all(
        `SELECT id, name, phone, gstin, address, state, state_code, credit_limit, outstanding
         FROM customers
         WHERE shop_id = ? AND (name LIKE ? OR phone LIKE ?)
         ORDER BY name ASC LIMIT 10`,
        [shop_id || 1, term, term],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

// ─── SALES (credit/ledger-aware) ─────────────────────────────────────────────
app.post("/add-sale", (req, res) => {
    const {
        total_amount, gst_amount, items,
        customer_name, customer_phone, customer_gstin,
        invoice_number, shop_id,
        customer_id,     // nullable, links to customers table
        payment_mode,    // 'cash' | 'credit' | 'part'
        cash_paid,       // for 'part' mode: amount paid upfront
        credit_amount    // for 'credit'/'part' mode: amount going to ledger
    } = req.body;

    if (!items || items.length === 0) {
        return res.status(400).json({ error: "No items in sale" });
    }

    const mode   = ['credit', 'part'].includes(payment_mode) ? payment_mode : 'cash';
    const status = mode === 'cash' ? 'paid' : (mode === 'part' ? 'part-paid' : 'due');
    const ledgerAmount = parseFloat(credit_amount) || 0;  // amount that goes to ledger/outstanding
    const date = getLocalISOString();


    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        // Step 1: verify stock for every item before writing anything
        let stockError = null;
        let checked = 0;

        items.forEach((item) => {
            const isLoose = item.sale_type === 'loose';
            const stockField = isLoose ? 'loose_stock' : 'quantity';
            db.get(
                `SELECT quantity, loose_stock, name FROM products WHERE id = ? AND shop_id = ?`,
                [item.product_id, shop_id || 1],
                (err, row) => {
                    checked++;
                    if (err) stockError = err.message;
                    else if (!row) stockError = `Product not found: ${item.name}`;
                    else {
                        const available = isLoose ? (row.loose_stock || 0) : (row.quantity || 0);
                        if (available < item.quantity) {
                            stockError = `Insufficient ${isLoose ? 'loose' : ''} stock for "${row.name}". Available: ${available}, Requested: ${item.quantity}`;
                        }
                    }

                    if (checked === items.length) {
                        if (stockError) {
                            db.run("ROLLBACK");
                            return res.status(400).json({ error: stockError });
                        }
                        proceedWithSale();
                    }
                }
            );
        });

        function proceedWithSale() {
            db.run(
                `INSERT INTO sales
                 (date, total_amount, gst_amount, customer_name, customer_phone, customer_gstin,
                  invoice_number, shop_id, customer_id, payment_mode, payment_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [date, total_amount, gst_amount, customer_name, customer_phone, customer_gstin,
                    invoice_number, shop_id || 1, customer_id || null, mode, status],
                function (err) {
                    if (err) { db.run("ROLLBACK"); return res.status(500).json({ error: err.message }); }

                    const saleId = this.lastID;
                    let itemsDone = 0;
                    let itemError = null;

                    items.forEach((item) => {
                        const isLoose = item.sale_type === 'loose';
                        db.run(
                            "INSERT INTO sale_items (sale_id, product_id, quantity, selling_price, purchase_price) VALUES (?, ?, ?, ?, ?)",
                            [saleId, item.product_id, item.quantity, item.selling_price, item.purchase_price],
                            (err2) => {
                                if (err2) itemError = err2.message;
                                // Deduct from correct stock field (loose_stock vs quantity)
                                const updateQ = isLoose
                                    ? "UPDATE products SET loose_stock = loose_stock - ? WHERE id = ? AND shop_id = ?"
                                    : "UPDATE products SET quantity = quantity - ? WHERE id = ? AND shop_id = ?";
                                db.run(
                                    updateQ,
                                    [item.quantity, item.product_id, shop_id || 1],
                                    (err3) => {
                                        if (err3) itemError = err3.message;
                                        itemsDone++;
                                        if (itemsDone === items.length) {
                                            if (itemError) { db.run("ROLLBACK"); return res.status(500).json({ error: itemError }); }
                                            finalizeLedger();
                                        }
                                    }
                                );
                            }
                        );
                    });


                    function finalizeLedger() {
                        if ((mode === "credit" || mode === "part") && customer_id && ledgerAmount !== 0) {
                            db.get(
                                "SELECT IFNULL(SUM(debit - credit), 0) as balance FROM customer_ledger WHERE customer_id = ?",
                                [customer_id],
                                (err4, row) => {
                                    if (err4) { db.run("ROLLBACK"); return res.status(500).json({ error: err4.message }); }
                                    const prevBalance = row ? row.balance : 0;
                                    const newBalance  = prevBalance + ledgerAmount;
                                    const debitVal    = ledgerAmount > 0 ? ledgerAmount : 0;
                                    const creditVal   = ledgerAmount < 0 ? -ledgerAmount : 0;
                                    const description = mode === "part"
                                        ? `Invoice ${invoice_number} (Part: ₹${Math.round(cash_paid || 0)} cash, net change: ${ledgerAmount > 0 ? '₹' + Math.round(ledgerAmount) + ' udhaar' : '₹' + Math.round(-ledgerAmount) + ' advance'})`
                                        : `Invoice ${invoice_number}`;

                                    db.run(
                                        `INSERT INTO customer_ledger
                                         (customer_id, customer_name, date, type, description, debit, credit, balance, sale_id, shop_id)
                                         VALUES (?, ?, ?, 'sale', ?, ?, ?, ?, ?, ?)`,
                                        [customer_id, customer_name, date, description, debitVal, creditVal, newBalance, saleId, shop_id || 1],
                                        (err5) => {
                                            if (err5) { db.run("ROLLBACK"); return res.status(500).json({ error: err5.message }); }
                                            db.run(
                                                "UPDATE customers SET outstanding = ? WHERE id = ?",
                                                [newBalance, customer_id],
                                                (err6) => {
                                                    if (err6) { db.run("ROLLBACK"); return res.status(500).json({ error: err6.message }); }
                                                    db.run("COMMIT");
                                                    res.json({ message: `Sale Recorded (${mode})`, saleId });
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        } else {
                            db.run("COMMIT", (err) => {
                                if (err) return res.status(500).json({ error: "Commit failed" });
                                res.json({ message: "Sale Recorded", saleId });
                            });
                        }
                    }
                }
            );
        }
    });
});

// ─── UNDO SALE ───────────────────────────────────────────────────────────────
app.delete("/undo-sale/:id", (req, res) => {
    const saleId = req.params.id;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");

        db.get("SELECT * FROM sales WHERE id = ?", [saleId], (err, sale) => {
            if (err || !sale) { db.run("ROLLBACK"); return res.status(404).json({ error: "Sale not found" }); }

            db.all("SELECT product_id, quantity FROM sale_items WHERE sale_id = ?", [saleId], (err2, items) => {
                if (err2 || !items || items.length === 0) {
                    db.run("ROLLBACK");
                    return res.status(404).json({ error: "Sale items not found" });
                }

                let done = 0;
                items.forEach(item => {
                    db.run("UPDATE products SET quantity = quantity + ? WHERE id = ?", [item.quantity, item.product_id], () => {
                        done++;
                        if (done === items.length) afterStockRestored();
                    });
                });

                function afterStockRestored() {
                    db.run("DELETE FROM sale_items WHERE sale_id = ?", [saleId]);

                    if (["credit", "part"].includes(sale.payment_mode) && sale.customer_id) {
                        // Remove the ledger entry for this sale and recompute customer's outstanding
                        db.run("DELETE FROM customer_ledger WHERE sale_id = ?", [saleId], (errL) => {
                            if (errL) { db.run("ROLLBACK"); return res.status(500).json({ error: errL.message }); }

                            db.get(
                                "SELECT IFNULL(SUM(debit - credit), 0) as balance FROM customer_ledger WHERE customer_id = ?",
                                [sale.customer_id],
                                (errB, row) => {
                                    const newBalance = row ? row.balance : 0;
                                    db.run("UPDATE customers SET outstanding = ? WHERE id = ?", [newBalance, sale.customer_id], (errU) => {
                                        if (errU) { db.run("ROLLBACK"); return res.status(500).json({ error: errU.message }); }
                                        db.run("DELETE FROM sales WHERE id = ?", [saleId]);
                                        db.run("COMMIT", (errC) => {
                                            if (errC) return res.status(500).json({ error: "Commit failed" });
                                            res.json({ message: "Sale Undone Successfully ✅ (Ledger reversed)" });
                                        });
                                    });
                                }
                            );
                        });
                    } else {
                        db.run("DELETE FROM sales WHERE id = ?", [saleId]);
                        db.run("COMMIT", (errC) => {
                            if (errC) return res.status(500).json({ error: "Commit failed" });
                            res.json({ message: "Sale Undone Successfully ✅" });
                        });
                    }
                }
            });
        });
    });
});