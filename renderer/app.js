// app.js — Fixed with shop_id support
let selectedProductId = null;
let editProductId = null;
let allProductsCache = [];

function showToast(msg, type = 'success') {
    const t = document.getElementById("toast");
    if (t) {
        t.innerText = msg;
        t.className = `toast-${type}`;
        t.style.display = "block";
        setTimeout(() => { t.style.display = "none"; t.className = ''; }, 3000);
    }
}

async function loadProducts() {
    try {
        // FIX: use apiUrl to include shop_id
        const res = await fetch(window.apiUrl("/products"));
        if (!res.ok) throw new Error("Failed to fetch");
        allProductsCache = await res.json();
        displayProducts(allProductsCache);
    } catch (err) {
        console.error("Load Error:", err);
        showToast("Server not reachable ❌", "error");
    }
}

// ─── SELL MODE TOGGLE ────────────────────────────────────────────────────────
function onSellModeChange() {
    const mode = document.getElementById("sell_mode").value;
    const wrapper = document.getElementById("looseFieldsWrapper");
    const unitEl = document.getElementById("unit");
    const looseUnitLabel = document.getElementById("looseUnitLabel");
    const conversionLabel = document.getElementById("conversionLabel");
    const loosePriceLabel = document.getElementById("loosePriceLabel");

    if (mode === 'UNIT') {
        wrapper.style.display = 'none';
    } else {
        wrapper.style.display = 'block';
        if (mode === 'LOOSE') {
            looseUnitLabel.textContent = 'Unit (you sell in)';
            conversionLabel.textContent = 'Conversion Factor (N/A for loose)';
            loosePriceLabel.textContent = 'Selling Price (₹ per loose unit)';
            unitEl.placeholder = 'e.g. KG, LITRE, GRAM';
        } else if (mode === 'PIECE') {
            looseUnitLabel.textContent = 'Piece Unit Name';
            conversionLabel.textContent = 'Pieces per Pack/Box';
            loosePriceLabel.textContent = 'Price per Piece (₹)';
            unitEl.placeholder = 'e.g. BOX, PACK, BUNDLE';
        } else { // BOTH
            looseUnitLabel.textContent = 'Loose Unit (sold loose in)';
            conversionLabel.textContent = 'Loose units per 1 Unit (e.g. 50 KG/BAG)';
            loosePriceLabel.textContent = 'Loose Selling Price (₹ per loose unit)';
            unitEl.placeholder = 'e.g. BAG, DRUM, BUNDLE';
        }
    }
}

async function addProduct() {
    const sellMode = document.getElementById("sell_mode") ? document.getElementById("sell_mode").value : 'UNIT';
    const data = {
        name: document.getElementById("name").value.trim(),
        category: document.getElementById("category").value.trim(),
        purchase_price: Number(document.getElementById("purchase").value) || 0,
        selling_price: Number(document.getElementById("selling").value) || 0,
        gst: Number(document.getElementById("gst").value) || 0,
        quantity: Number(document.getElementById("qty").value) || 0,
        min_stock: Number(document.getElementById("minstock").value) || 0,
        hsn_code: document.getElementById("hsn").value.trim(),
        sku: document.getElementById("sku") ? document.getElementById("sku").value.trim().toUpperCase() : "",
        shop_id: window.SHOP_ID,
        // Dual-unit fields
        unit: (document.getElementById("unit") ? document.getElementById("unit").value.trim().toUpperCase() : 'NOS') || 'NOS',
        sell_mode: sellMode,
        loose_unit: document.getElementById("loose_unit") ? document.getElementById("loose_unit").value.trim().toUpperCase() : null,
        loose_conversion: document.getElementById("loose_conversion") ? Number(document.getElementById("loose_conversion").value) || 1 : 1,
        loose_price: document.getElementById("loose_price") ? Number(document.getElementById("loose_price").value) || 0 : 0
    };

    if (!data.name || !data.selling_price) {
        showToast("Name and Selling Price are required ❌", "error");
        return;
    }
    if (sellMode !== 'UNIT' && sellMode !== 'LOOSE' && !data.loose_unit) {
        showToast("Please enter the Loose Unit name ❌", "error");
        return;
    }

    let url = window.API + "/add-product";
    if (editProductId) {
        url = window.API + "/update-product-details";
        data.id = editProductId;
    }

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });

        if (res.ok) {
            showToast(editProductId ? "Updated Successfully ✅" : "Product Added ✅");
            resetForm();
            loadProducts();
        } else {
            showToast("Operation failed ❌", "error");
        }
    } catch (err) {
        showToast("Connection Error ❌", "error");
    }
}

function resetForm() {
    editProductId = null;
    ["name", "category", "purchase", "selling", "gst", "qty", "minstock", "hsn", "sku",
     "loose_unit", "loose_conversion", "loose_price"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const unitEl = document.getElementById("unit"); if (unitEl) unitEl.value = "NOS";
    const modeEl = document.getElementById("sell_mode"); if (modeEl) { modeEl.value = "UNIT"; onSellModeChange(); }
    const saveText = document.getElementById("saveBtnText");
    if (saveText) saveText.innerText = "Save Product";
    const cancelBtn = document.getElementById("cancelEdit");
    if (cancelBtn) cancelBtn.style.display = "none";
    const looseInfo = document.getElementById("looseStockInfo");
    if (looseInfo) looseInfo.style.display = "none";
}

function displayProducts(list) {
    const table = document.getElementById("productList");
    if (!table) return;

    if (!list || list.length === 0) {
        table.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:2rem;">No products found. Add your first product above!</td></tr>`;
        return;
    }

    table.innerHTML = list.map(p => {
        const mode = p.sell_mode || 'UNIT';
        const unit = p.unit || 'Nos';
        const looseUnit = p.loose_unit || '';
        const looseStock = p.loose_stock || 0;

        // Stock status — for LOOSE mode, use loose_stock instead of quantity
        let effectiveQty = (mode === 'LOOSE') ? looseStock : p.quantity;
        let statusClass = "badge-success";
        let statusText = "Healthy";
        if (effectiveQty <= 0) { statusClass = "badge-danger"; statusText = "Stock Out"; }
        else if (effectiveQty <= p.min_stock) { statusClass = "badge-warning"; statusText = "Low Stock"; }

        const margin = p.purchase_price > 0
            ? Math.round(((p.selling_price - p.purchase_price) / p.purchase_price) * 100)
            : 0;

        // Loose mode badge
        const looseBadge = mode !== 'UNIT' ? `
            <div style="margin-top:4px;">
                <span style="background:#ede9fe; color:#5b21b6; font-size:0.7rem; font-weight:700; padding:2px 7px; border-radius:10px; letter-spacing:0.3px;">
                    ${mode === 'LOOSE' ? '⚖ LOOSE' : mode === 'PIECE' ? '📦 PACK→PCS' : '🔓 UNIT+LOOSE'}
                </span>
            </div>` : '';

        // Stock display
        let stockDisplay = `${p.quantity} <small style="font-weight:400; color:#64748b;">${unit}</small><div style="font-size:0.75rem; color:var(--text-muted);">Min: ${p.min_stock}</div>`;
        if (mode === 'BOTH' || mode === 'PIECE') {
            stockDisplay += `<div style="font-size:0.75rem; color:#7c3aed; margin-top:2px;">Loose: ${looseStock} ${looseUnit}</div>`;
        } else if (mode === 'LOOSE') {
            stockDisplay = `${looseStock} <small style="font-weight:400; color:#64748b;">${looseUnit}</small><div style="font-size:0.75rem; color:var(--text-muted);">Min: ${p.min_stock}</div>`;
        }

        // Break stock button (only for BOTH and PIECE)
        const breakBtn = (mode === 'BOTH' || mode === 'PIECE') ? `
            <button class="btn btn-outline" style="padding:8px 12px; border-color:#7c3aed; color:#7c3aed;"
                onclick="breakStock(${p.id})" title="Break into ${looseUnit}">
                <i class="fas fa-cut"></i>
            </button>` : '';

        return `
        <tr>
            <td>
                <div style="font-weight:700; color:var(--secondary); font-size:0.875rem;">${p.name}</div>
                <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">${p.category || '—'}</div>
                ${looseBadge}
            </td>
            <td style="text-align:center;">
                <code style="background:#f0fdf4; color:#166534; padding:2px 6px; border-radius:6px; font-size:0.72rem; border:1px solid #bbf7d0; font-weight:600; letter-spacing:0.5px;">
                    ${p.sku || '—'}
                </code>
            </td>
            <td style="text-align:center;">
                <code style="background:#f1f5f9; padding:3px 6px; border-radius:6px; font-size:0.74rem; border:1px solid var(--border);">
                    ${p.hsn_code || '—'}
                </code>
            </td>
            <td>
                <div style="font-size:0.82rem;">
                    <div style="color:var(--text-muted);"><small>BUY:</small> ₹${Math.round(p.purchase_price)}</div>
                    <div style="color:var(--primary); font-weight:700;"><small>SELL:</small> ₹${Math.round(p.selling_price)}/${unit}</div>
                    ${mode !== 'UNIT' && p.loose_price ? `<div style="color:#7c3aed; font-size:0.72rem;">Loose: ₹${p.loose_price}/${looseUnit}</div>` : ''}
                    <div style="color:var(--secondary); font-size:0.7rem;">Margin: ${margin}%</div>
                </div>
            </td>
            <td style="font-weight:700; font-size:0.95rem; color:#1e293b;">${stockDisplay}</td>
            <td>
                <span class="badge ${statusClass}" style="padding:4px 10px; border-radius:20px; font-size:0.75rem;">${statusText}</span>
            </td>
            <td style="text-align:right;">
                <div style="display:flex; gap:6px; justify-content:flex-end; flex-wrap:wrap;">
                    ${breakBtn}
                    <button class="btn btn-outline" style="padding:6px 10px; border-color:var(--primary); color:var(--primary);"
                        onclick="addStock(${p.id})" title="Add Stock">
                        <i class="fas fa-plus"></i>
                    </button>
                    <button class="btn btn-outline" style="padding:6px 10px; border-color:var(--secondary); color:var(--secondary);"
                        onclick="prepareEdit(${p.id})" title="Edit Product">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline" style="padding:8px 12px; border-color:var(--danger); color:var(--danger);"
                        onclick="deleteProduct(${p.id})" title="Delete Product">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

function prepareEdit(id) {
    const p = allProductsCache.find(item => item.id == id);
    if (!p) return;
    editProductId = p.id;

    document.getElementById("name").value = p.name;
    document.getElementById("category").value = p.category || "";
    document.getElementById("purchase").value = p.purchase_price;
    document.getElementById("selling").value = p.selling_price;
    document.getElementById("gst").value = p.gst;
    document.getElementById("qty").value = p.quantity;
    document.getElementById("minstock").value = p.min_stock;
    document.getElementById("hsn").value = p.hsn_code || "";
    const skuEl = document.getElementById("sku");
    if (skuEl) skuEl.value = p.sku || "";

    // Dual-unit fields
    const unitEl = document.getElementById("unit");               if (unitEl) unitEl.value = p.unit || 'NOS';
    const modeEl = document.getElementById("sell_mode");          if (modeEl) { modeEl.value = p.sell_mode || 'UNIT'; onSellModeChange(); }
    const luEl   = document.getElementById("loose_unit");         if (luEl)   luEl.value = p.loose_unit || '';
    const lcEl   = document.getElementById("loose_conversion");   if (lcEl)   lcEl.value = p.loose_conversion || 1;
    const lpEl   = document.getElementById("loose_price");        if (lpEl)   lpEl.value = p.loose_price || '';

    // Show loose stock info if applicable
    const looseInfo = document.getElementById("looseStockInfo");
    const looseText = document.getElementById("looseStockText");
    if (looseInfo && looseText && p.sell_mode && p.sell_mode !== 'UNIT' && p.loose_stock > 0) {
        looseText.textContent = `Current loose stock: ${p.loose_stock} ${p.loose_unit || ''}  (this field updates via "Break Stock" action)`;
        looseInfo.style.display = 'block';
    } else if (looseInfo) {
        looseInfo.style.display = 'none';
    }

    const saveText = document.getElementById("saveBtnText");
    const cancelBtn = document.getElementById("cancelEdit");
    if (saveText) saveText.innerText = "Update Product";
    if (cancelBtn) cancelBtn.style.display = "block";

    // Expand form if collapsed
    const section = document.getElementById("productFormSection");
    if (section && section.style.display === "none") {
        if (typeof toggleProductForm === "function") toggleProductForm();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ─── BREAK STOCK ─────────────────────────────────────────────────────────────
let breakStockProductId = null;

function breakStock(id) {
    const p = allProductsCache.find(item => item.id == id);
    if (!p) return;
    breakStockProductId = id;

    const unit = p.unit || 'UNIT';
    const looseUnit = p.loose_unit || 'LOOSE UNIT';
    const conversion = p.loose_conversion || 1;

    document.getElementById("breakProductName").innerText = `${p.name}`;
    document.getElementById("breakInfoText").innerHTML = `
        <strong>Available Stock:</strong> ${p.quantity} ${unit}<br>
        <strong>Conversion Ratio:</strong> 1 ${unit} = ${conversion} ${looseUnit}<br>
        <em>Breaking 1 ${unit} converts it to ${conversion} ${looseUnit} loose stock.</em>
    `;
    document.getElementById("breakQtyLabel").innerText = `Number of ${unit}s to Break`;
    document.getElementById("breakQty").value = "";
    document.getElementById("breakStockPopup").style.display = "grid";
}

function closeBreakStockPopup() {
    document.getElementById("breakStockPopup").style.display = "none";
    breakStockProductId = null;
}

async function submitBreakStock() {
    if (!breakStockProductId) return;
    const p = allProductsCache.find(item => item.id == breakStockProductId);
    if (!p) return;

    const qtyVal = document.getElementById("breakQty").value;
    const n = parseFloat(qtyVal);
    const unit = p.unit || 'UNIT';
    const looseUnit = p.loose_unit || 'LOOSE UNIT';
    const conversion = p.loose_conversion || 1;

    if (isNaN(n) || n <= 0) {
        showToast("Enter a valid quantity to break ❌", "error");
        return;
    }
    if (n > p.quantity) {
        showToast(`Only ${p.quantity} ${unit}s available ❌`, "error");
        return;
    }

    try {
        const res = await fetch(window.API + "/break-stock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: breakStockProductId, units_to_break: n })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`✅ ${n} ${unit}(s) broken → ${n * conversion} ${looseUnit} added to loose stock`);
            closeBreakStockPopup();
            loadProducts();
        } else {
            showToast(data.error || "Failed to break stock ❌", "error");
        }
    } catch (e) {
        showToast("Connection error ❌", "error");
    }
}

function addStock(id) {
    const p = allProductsCache.find(item => item.id == id);
    if (!p) return;
    selectedProductId = id;
    document.getElementById("popupProductName").innerText = `${p.name} — Current Stock: ${p.quantity}`;
    document.getElementById("popupQty").value = "";
    document.getElementById("popupPrice").value = "";
    document.getElementById("stockPopup").style.display = "grid";
}

function closePopup() {
    document.getElementById("stockPopup").style.display = "none";
}

async function submitStock() {
    const qty = document.getElementById("popupQty").value;
    const price = document.getElementById("popupPrice").value;

    if (!qty || parseInt(qty) <= 0) { showToast("Enter valid quantity ❌", "error"); return; }
    if (!selectedProductId) { showToast("No product selected ❌", "error"); return; }

    try {
        const res = await fetch(window.API + "/update-stock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                id: Number(selectedProductId),
                added_qty: Number(qty),
                new_purchase_price: price ? Number(price) : null
            })
        });
        const json = await res.json();
        if (res.ok) {
            showToast(`Stock Updated ✅ — New Qty: ${json.new_quantity}`);
            closePopup();
            loadProducts();
        } else {
            showToast(json.error || "Update failed ❌", "error");
        }
    } catch (err) { showToast("Error ❌", "error"); }
}

async function deleteProduct(id) {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    try {
        const res = await fetch(window.API + "/delete-product/" + id, { method: "DELETE" });
        if (res.ok) { showToast("Deleted 🗑"); loadProducts(); }
        else { showToast("Delete failed ❌", "error"); }
    } catch (e) { showToast("Error ❌", "error"); }
}

function searchProduct() {
    const keyword = document.getElementById("search").value.toLowerCase();
    const filtered = allProductsCache.filter(p =>
        (p.name && p.name.toLowerCase().includes(keyword)) ||
        (p.category && p.category.toLowerCase().includes(keyword)) ||
        (p.hsn_code && String(p.hsn_code).toLowerCase().includes(keyword)) ||
        (p.sku && String(p.sku).toLowerCase().includes(keyword))
    );
    displayProducts(filtered);
}

// ─── BULK EXPORT ──────────────────────────────────────────────────────────────
function exportInventoryCSV() {
    if (!allProductsCache || allProductsCache.length === 0) {
        showToast("No products to export ❌", "error");
        return;
    }
    const headers = [
        "sku", "name", "category", "hsn_code", "purchase_price", "selling_price", "gst", "quantity", "min_stock",
        "unit", "sell_mode", "loose_unit", "loose_conversion", "loose_stock", "loose_price"
    ];
    const rows = allProductsCache.map(p =>
        headers.map(h => {
            const val = p[h] !== null && p[h] !== undefined ? p[h] : "";
            return String(val).includes(",") || String(val).includes("\n") ? `"${val}"` : val;
        }).join(",")
    );
    const csvContent = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory_shop${window.SHOP_ID}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${allProductsCache.length} products ✅`);
}

// ─── BULK IMPORT ──────────────────────────────────────────────────────────────
function importInventoryCSV(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function (e) {
        const text = e.target.result;
        const lines = text.trim().split("\n").map(l => l.trim()).filter(l => l);
        if (lines.length < 2) { showToast("CSV is empty ❌", "error"); return; }

        const requiredHeaders = ["name", "category", "hsn_code", "purchase_price", "selling_price", "gst", "quantity", "min_stock"];
        const fileHeaders = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/^"|"$/g, ""));
        const missing = requiredHeaders.filter(h => !fileHeaders.includes(h));

        if (missing.length > 0) {
            showToast(`Missing columns: ${missing.join(", ")} ❌`, "error");
            input.value = "";
            return;
        }

        const products = lines.slice(1).map(row => {
            const cols = row.match(/(".*?"|[^,]+)(?=,|$)/g) || row.split(",");
            const cleaned = cols.map(c => c.replace(/^"|"$/g, "").trim());
            const obj = {};
            fileHeaders.forEach((h, i) => obj[h] = cleaned[i] || "");
            return {
                sku: obj.sku || "",   // optional — auto-generated if blank
                name: obj.name,
                category: obj.category,
                hsn_code: obj.hsn_code,
                purchase_price: parseFloat(obj.purchase_price) || 0,
                selling_price: parseFloat(obj.selling_price) || 0,
                gst: parseFloat(obj.gst) || 0,
                quantity: parseInt(obj.quantity) || 0,
                min_stock: parseInt(obj.min_stock) || 0,
                // Extra fields for Loose / Bulk selling
                unit: obj.unit || "NOS",
                sell_mode: obj.sell_mode || "UNIT",
                loose_unit: obj.loose_unit || null,
                loose_conversion: parseFloat(obj.loose_conversion) || 1,
                loose_stock: parseFloat(obj.loose_stock) || 0,
                loose_price: parseFloat(obj.loose_price) || 0
            };
        }).filter(p => p.name);

        if (products.length === 0) {
            showToast("No valid products in CSV ❌", "error");
            input.value = "";
            return;
        }

        try {
            // FIX: include shop_id in bulk import
            const res = await fetch(window.API + "/bulk-import-products", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ products, shop_id: window.SHOP_ID })
            });
            const json = await res.json();
            if (res.ok) {
                showToast(`Imported ${json.imported} products ✅`);
                loadProducts();
            } else {
                showToast(json.error || "Import failed ❌", "error");
            }
        } catch (err) {
            showToast("Connection error ❌", "error");
        }
        input.value = "";
    };
    reader.readAsText(file);
}

// Global expose
window.addProduct = addProduct;
window.addStock = addStock;
window.submitStock = submitStock;
window.closePopup = closePopup;
window.deleteProduct = deleteProduct;
window.searchProduct = searchProduct;
window.prepareEdit = prepareEdit;
window.resetForm = resetForm;
window.exportInventoryCSV = exportInventoryCSV;
window.importInventoryCSV = importInventoryCSV;
window.breakStock = breakStock;
window.submitBreakStock = submitBreakStock;
window.closeBreakStockPopup = closeBreakStockPopup;
window.onSellModeChange = onSellModeChange;

document.addEventListener("DOMContentLoaded", loadProducts);