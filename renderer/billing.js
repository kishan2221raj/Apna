// billing.js — Full rewrite with correct element IDs matching billing.html

let billItems = [];
let allProducts = [];
let selectedCustomer = null;   // { id, name, phone, gstin, address, state, state_code, outstanding } or null = walk-in
let paymentMode = "cash";      // 'cash' | 'credit' | 'part'
let partCashPaid = 0;          // amount paid cash when mode = 'part'
let lastSaleId = null;
let shopInfo = null;

// ============================================================
// HELPERS
// ============================================================
function $(id) { return document.getElementById(id); }
function setVal(id, val) { const el = $(id); if (el) el.value = val; }

function showToast(msg, type = 'success') {
    const t = $("toast");
    if (t) {
        t.innerText = msg;
        t.className = `toast-${type}`;
        t.style.display = "block";
        setTimeout(() => { t.style.display = "none"; t.className = ''; }, 3500);
    }
}

// ============================================================
// INIT
// ============================================================
async function loadInitialData() {
    try {
        const res = await fetch(window.apiUrl("/products"));
        allProducts = await res.json();
    } catch (err) { console.error("Load products error:", err); }

    try {
        const res2 = await fetch(window.apiUrl("/shop-info"));
        shopInfo = await res2.json();
        applyShopInfoToInvoice();
    } catch (err) { console.error("Load shop info error:", err); }
}

function applyShopInfoToInvoice() {
    if (!shopInfo) return;
    const set = (id, val) => { const el = $(id); if (el && val) el.innerText = val; };
    set("invShopName", shopInfo.name);
    set("invShopSign", shopInfo.name);
    set("invShopAddr", shopInfo.address);
    set("invShopGstin", shopInfo.gstin);
    set("invShopPhone", shopInfo.phone);
    if (shopInfo.state || shopInfo.state_code) {
        set("invShopState", `${shopInfo.state || ''} (Code: ${shopInfo.state_code || ''})`);
    }
    
    // Bank Details
    let bankStr = "";
    if (shopInfo.bank_name) bankStr += shopInfo.bank_name;
    if (shopInfo.account_number) bankStr += (bankStr ? " | A/c: " : "A/c: ") + shopInfo.account_number;
    if (shopInfo.ifsc_code) bankStr += (bankStr ? " | IFSC: " : "IFSC: ") + shopInfo.ifsc_code;
    set("invBankDetails", bankStr || "Not Provided");
}

// ============================================================
// SHIP TO TOGGLE  (HTML checkbox id = "chkShipTo")
// ============================================================
function toggleShipTo() {
    const isChecked = $("chkShipTo").checked;
    $("shipToSection").style.display = isChecked ? "block" : "none";
}

// ============================================================
// CUSTOMER SEARCH / SELECT
// ============================================================
let customerSearchTimer = null;

function searchCustomer() {
    const query = $("custSearchInput").value.trim();
    const resultsDiv = $("custSearchResults");
    if (!query) { resultsDiv.style.display = "none"; return; }

    clearTimeout(customerSearchTimer);
    customerSearchTimer = setTimeout(async () => {
        try {
            const res = await fetch(window.apiUrl("/customer-search", { q: query }));
            const results = await res.json();

            if (results.length > 0) {
                resultsDiv.innerHTML = results.map(c => `
                    <div class="cust-result" onclick='selectCustomer(${JSON.stringify(c).replace(/'/g, "&#39;")})'>
                        <strong>${c.name}</strong> ${c.phone ? `— ${c.phone}` : ''}<br>
                        <small style="color:var(--text-muted);">
                            ${c.gstin ? 'GSTIN: ' + c.gstin + ' | ' : ''}
                            Outstanding: ₹${Math.round(c.outstanding || 0).toLocaleString('en-IN')}
                        </small>
                    </div>
                `).join("");
            } else {
                resultsDiv.innerHTML = `<div class="cust-result" style="color:var(--text-muted);">
                    No customer found. <a href="#" onclick="showNewCustForm(); return false;" style="color:var(--primary);">+ Add new</a>
                </div>`;
            }
            resultsDiv.style.display = "block";
        } catch (e) {
            console.error("Customer search error:", e);
        }
    }, 250);
}

function selectCustomer(customer) {
    selectedCustomer = customer;

    // Switch UI panels
    $("custSearchBox").style.display = "none";
    $("selCustCard").style.display = "block";
    $("walkInFields").style.display = "none";
    $("newCustForm").style.display = "none";
    $("custSearchResults").style.display = "none";
    $("custSearchInput").value = "";

    // Fill selected card
    $("selCustName").innerText = customer.name;
    $("selCustPhone").innerText = customer.phone || "No phone on file";

    const gstinTag = $("selCustGstin");
    if (gstinTag) gstinTag.innerText = customer.gstin ? `GSTIN: ${customer.gstin}` : 'No GSTIN (B2C)';

    const badge = $("selCustBal");
    const outstanding = customer.outstanding || 0;
    if (outstanding > 0) {
        badge.className = "bal-badge bal-due";
        badge.innerText = `Due: ₹${Math.round(outstanding).toLocaleString('en-IN')}`;
        badge.style.background = "";
        badge.style.color = "";
    } else if (outstanding < 0) {
        badge.className = "bal-badge bal-clear";
        badge.innerText = `Adv: ₹${Math.round(-outstanding).toLocaleString('en-IN')}`;
        badge.style.background = "#dcfce7";
        badge.style.color = "#15803d";
    } else {
        badge.className = "bal-badge bal-clear";
        badge.innerText = "No dues";
        badge.style.background = "";
        badge.style.color = "";
    }

    // Enable credit + part-pay options
    $("payCredit").classList.remove("disabled");
    if ($("payPart")) $("payPart").classList.remove("disabled");
    $("creditNote").style.display = "none";

    renderCart();
}

function selectWalkIn() {
    selectedCustomer = null;
    $("custSearchBox").style.display = "none";
    $("selCustCard").style.display = "none";
    $("walkInFields").style.display = "block";
    $("newCustForm").style.display = "none";

    // Force cash mode, disable credit & part-pay
    setPayMode("cash");
    $("payCredit").classList.add("disabled");
    if ($("payPart")) $("payPart").classList.add("disabled");
    $("creditNote").style.display = "block";
}

function clearCustomer() {
    selectedCustomer = null;
    partCashPaid = 0;
    $("selCustCard").style.display = "none";
    $("custSearchBox").style.display = "block";
    $("walkInFields").style.display = "none";
    $("custSearchInput").value = "";
    $("custSearchInput").focus();

    $("payCredit").classList.add("disabled");
    if ($("payPart")) $("payPart").classList.add("disabled");
    $("creditNote").style.display = "block";
    setPayMode("cash");

    renderCart();
}

// ============================================================
// NEW CUSTOMER INLINE FORM  (ids: ncName, ncPhone, ncGstin, ncState, ncStateCode, ncAddress)
// ============================================================
function showNewCustForm() {
    $("custSearchBox").style.display = "none";
    $("selCustCard").style.display = "none";
    $("walkInFields").style.display = "none";
    $("newCustForm").style.display = "block";
    $("custSearchResults").style.display = "none";
    const el = $("ncName"); if (el) el.focus();
}

function hideNewCustForm() {
    $("newCustForm").style.display = "none";
    $("custSearchBox").style.display = "block";
    ["ncName", "ncPhone", "ncGstin", "ncState", "ncStateCode", "ncAddress"].forEach(id => setVal(id, ""));
}

async function saveNewCustomer() {
    const name = $("ncName").value.trim();
    if (!name) { showToast("Customer name is required ❌", "error"); return; }

    const data = {
        name,
        phone: $("ncPhone").value.trim(),
        gstin: $("ncGstin").value.trim().toUpperCase(),
        state: $("ncState").value.trim(),
        state_code: $("ncStateCode").value.trim(),
        address: $("ncAddress").value.trim(),
        credit_limit: 0,
        shop_id: window.SHOP_ID
    };

    try {
        const res = await fetch(window.API + "/add-customer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (res.ok) {
            showToast("Customer added ✅");
            hideNewCustForm();
            selectCustomer({
                id: result.id,
                name: data.name,
                phone: data.phone,
                gstin: data.gstin,
                address: data.address,
                state: data.state,
                state_code: data.state_code,
                outstanding: 0,
                credit_limit: 0
            });
        } else {
            showToast("Failed to save customer ❌", "error");
        }
    } catch (e) {
        showToast("Connection error ❌", "error");
    }
}

// ============================================================
// PAYMENT MODE  (HTML ids: payCash, payCredit, payPart, creditInfo, partInfo, partPayInput, creditNote)
// ============================================================
function setPayMode(mode) {
    if ((mode === "credit" || mode === "part") && !selectedCustomer) {
        showToast("Select a registered customer for credit / part payment ⚠️", "warning");
        return;
    }
    paymentMode = mode;
    partCashPaid = 0;

    // Toggle button active states
    $("payCash").classList.toggle("active",   mode === "cash");
    $("payCash").classList.toggle("cash",     mode === "cash");
    $("payCredit").classList.toggle("active", mode === "credit");
    if ($("payPart")) $("payPart").classList.toggle("active", mode === "part");

    // Info banners
    const creditInfo = $("creditInfo");
    const partInfo   = $("partInfo");
    if (creditInfo) creditInfo.style.display = (mode === "credit") ? "block" : "none";
    if (partInfo)   partInfo.style.display   = (mode === "part")   ? "block" : "none";

    // Part cash input
    const partPayInput = $("partPayInput");
    if (partPayInput) {
        partPayInput.style.display = (mode === "part") ? "block" : "none";
        // Always clear the input when switching modes
        const cashEl = $("partCashInput");
        if (cashEl) cashEl.value = "";
        if (mode === "part" && cashEl) cashEl.focus();
    }

    renderCart();
}

function onPartCashChange() {
    const cashRaw = parseFloat($("partCashInput").value) || 0;
    partCashPaid = Math.max(cashRaw, 0); // only ensure positive, no upper clamp
    renderCart();
}

function getCurrentGrand() {
    let subTotal = 0, totalGST = 0;
    const isGst = $("enableGst").checked;
    billItems.forEach(item => {
        const tv = item.selling_price * item.quantity;
        subTotal += tv;
        totalGST += isGst ? (tv * item.gst) / 100 : 0;
    });
    return Math.round(subTotal + totalGST);
}

// ============================================================
// PRODUCT SEARCH / CART  (HTML ids: prodSearch, prodResults, billItems, enableGst)
// ============================================================
function searchProduct() {
    const query = $("prodSearch").value.toLowerCase();
    const resultsDiv = $("prodResults");
    if (!query) { resultsDiv.style.display = "none"; return; }

    const filtered = allProducts.filter(p =>
        p.name.toLowerCase().includes(query) ||
        (p.sku && p.sku.toLowerCase().includes(query)) ||
        (p.hsn_code && p.hsn_code.toLowerCase().includes(query)) ||
        (p.category && p.category.toLowerCase().includes(query))
    );

    if (filtered.length > 0) {
        let html = '';
        filtered.forEach(p => {
            const mode = p.sell_mode || 'UNIT';
            const unit = p.unit || 'Nos';
            const looseUnit = p.loose_unit || '';
            const looseStock = p.loose_stock || 0;
            const loosePrice = p.loose_price || 0;

            // Standard unit row
            html += `<div class="cust-result" onclick="addToBillById(${p.id}, 'unit')">
                <strong>${p.name}</strong>
                ${p.sku ? `<small style="background:#f0fdf4;color:#166534;padding:1px 6px;border-radius:4px;font-size:0.72rem;font-weight:600;margin-left:4px;">${p.sku}</small>` : ''}
                ${mode !== 'UNIT' && mode !== 'LOOSE' ? `<span style="background:#ede9fe;color:#5b21b6;font-size:0.7rem;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:4px;">per ${unit}</span>` : ''}
                <small style="color:var(--text-muted);">(Stock: ${mode === 'LOOSE' ? looseStock + ' ' + looseUnit : p.quantity + ' ' + unit})</small><br>
                <small>₹${p.selling_price}/${unit} | HSN: ${p.hsn_code || '-'} | GST: ${p.gst}%</small>
            </div>`;

            // Loose option row (only for BOTH and PIECE and LOOSE modes)
            if ((mode === 'BOTH' || mode === 'PIECE') && looseUnit) {
                html += `<div class="cust-result" onclick="addToBillById(${p.id}, 'loose')"
                    style="border-left:3px solid #7c3aed; background:#faf5ff;">
                    <strong>${p.name}</strong>
                    <span style="background:#7c3aed;color:white;font-size:0.7rem;font-weight:700;padding:1px 7px;border-radius:4px;margin-left:6px;">LOOSE / ${looseUnit}</span>
                    <small style="color:var(--text-muted);">(Loose Stock: ${looseStock} ${looseUnit})</small><br>
                    <small>₹${loosePrice}/${looseUnit} | GST: ${p.gst}%</small>
                </div>`;
            } else if (mode === 'LOOSE' && looseUnit) {
                html += `<div class="cust-result" onclick="addToBillById(${p.id}, 'loose')"
                    style="border-left:3px solid #7c3aed; background:#faf5ff;">
                    <strong>${p.name}</strong>
                    <span style="background:#7c3aed;color:white;font-size:0.7rem;font-weight:700;padding:1px 7px;border-radius:4px;margin-left:6px;">⚖ LOOSE — ${looseUnit}</span>
                    <small style="color:var(--text-muted);">(Stock: ${looseStock} ${looseUnit})</small><br>
                    <small>₹${loosePrice}/${looseUnit} | GST: ${p.gst}%</small>
                </div>`;
            }
        });
        resultsDiv.innerHTML = html;
        resultsDiv.style.display = "block";
    } else {
        resultsDiv.innerHTML = `<div class="cust-result" style="color:var(--text-muted);">No products found</div>`;
        resultsDiv.style.display = "block";
    }
}

function addToBillById(id, saleType = 'unit') {
    const product = allProducts.find(p => p.id == id);
    if (!product) return;

    const mode = product.sell_mode || 'UNIT';
    const isLoose = saleType === 'loose';
    const unit = isLoose ? (product.loose_unit || 'unit') : (product.unit || 'Nos');
    const price = isLoose ? (product.loose_price || 0) : product.selling_price;
    const availableStock = isLoose ? (product.loose_stock || 0) : product.quantity;

    if (availableStock <= 0) {
        showToast(`Out of ${isLoose ? 'loose ' : ''}stock ⚠️`, "warning");
        return;
    }

    // Find existing item with same product AND same sale type
    const existing = billItems.find(item => item.product_id === product.id && item.sale_type === saleType);
    if (existing) {
        if (existing.quantity >= availableStock) {
            showToast(`Only ${availableStock} ${unit} in stock!`, "warning");
            return;
        }
        existing.quantity++;
    } else {
        billItems.push({
            product_id: product.id,
            name: product.name,
            sku: product.sku || "",
            selling_price: price,
            purchase_price: isLoose ? (product.purchase_price / (product.loose_conversion || 1)) : product.purchase_price,
            gst: product.gst,
            hsn_code: product.hsn_code || "N/A",
            quantity: 1,
            discount_value: 0,
            discount_type: "percentage",
            sale_type: saleType,   // 'unit' or 'loose'
            unit_label: unit        // display label for qty column
        });
    }

    $("prodSearch").value = "";
    $("prodResults").style.display = "none";
    renderCart();
}

function updateDiscount(index, val) {
    const item = billItems[index];
    const parsed = parseFloat(val);
    item.discount_value = isNaN(parsed) ? 0 : parsed;
    renderCart();
}

function updateDiscountType(index, type) {
    const item = billItems[index];
    item.discount_type = type;
    renderCart();
}

function isInterstate() {
    let customerStateCode = null;
    if (selectedCustomer) {
        customerStateCode = selectedCustomer.state_code;
    } else if ($("walkInFields").style.display !== "none") {
        customerStateCode = $("wiStateCode").value;
    }
    
    if (!customerStateCode || !shopInfo || !shopInfo.state_code) {
        return false;
    }
    
    // Normalise comparison
    const shopCodeClean = String(shopInfo.state_code).trim().padStart(2, '0');
    const custCodeClean = String(customerStateCode).trim().padStart(2, '0');
    return shopCodeClean !== custCodeClean;
}

function renderCart() {
    const tbody = $("billItemsTbody");
    const isGstEnabled = $("enableGst").checked;
    tbody.innerHTML = "";
    
    let subTotal = 0;
    let totalGST = 0;

    // Update cart count
    const cartCount = $("cartCount");
    if (cartCount) cartCount.innerText = `${billItems.length} item${billItems.length !== 1 ? 's' : ''}`;

    if (billItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding:2rem;">Search and add products above</td></tr>`;
    }

    billItems.forEach((item, index) => {
        const lineTotalRaw = item.selling_price * item.quantity;
        let discountAmt = 0;
        if (item.discount_type === "percentage") {
            discountAmt = (lineTotalRaw * item.discount_value) / 100;
        } else {
            discountAmt = item.discount_value;
        }
        
        // Ensure discount is not greater than the line item value
        discountAmt = Math.min(discountAmt, lineTotalRaw);
        const taxableVal = lineTotalRaw - discountAmt;
        const itemGST = isGstEnabled ? (taxableVal * item.gst) / 100 : 0;
        
        subTotal += taxableVal;
        totalGST += itemGST;

        tbody.innerHTML += `
            <tr>
                <td>
                    <strong>${item.name}</strong><br>
                    ${item.sale_type === 'loose' ? `<span style="background:#7c3aed;color:white;font-size:0.68rem;font-weight:700;padding:1px 6px;border-radius:4px;">LOOSE/${item.unit_label}</span> ` : ''}
                    ${item.sku ? `<small style="color:#166534;font-weight:600;">${item.sku}</small> ` : ''}<small style="color:var(--text-muted);">GST: ${item.gst}%</small>
                </td>
                <td><small>${item.hsn_code}</small></td>
                <td>₹${parseFloat(item.selling_price).toFixed(2)}<small style="color:var(--text-muted);">/${item.unit_label || 'Nos'}</small></td>
                <td>
                    <div style="display:flex;align-items:center;gap:4px;">
                        <input type="number" value="${item.quantity}" min="0.001" step="${item.sale_type === 'loose' ? '0.001' : '1'}"
                            onchange="updateQty(${index}, this.value)"
                            style="width:65px; margin:0; font-size:0.875rem;">
                        <small style="color:#7c3aed;font-weight:600;">${item.unit_label || ''}</small>
                    </div>
                </td>
                <td>
                    <div style="display:flex;gap:2px;">
                        <input type="number" value="${item.discount_value}" min="0"
                            onchange="updateDiscount(${index}, this.value)"
                            style="width:55px; margin:0; font-size:0.875rem; padding:4px;">
                        <select onchange="updateDiscountType(${index}, this.value)" style="padding:2px; font-size:0.75rem;">
                            <option value="percentage" ${item.discount_type === "percentage" ? "selected" : ''}>%</option>
                            <option value="fixed" ${item.discount_type === "fixed" ? "selected" : ''}>₹</option>
                        </select>
                    </div>
                </td>
                <td>₹${taxableVal.toFixed(2)}</td>
                <td><strong>₹${(taxableVal + itemGST).toFixed(2)}</strong></td>
                <td>
                    <button onclick="removeItem(${index})"
                        style="color:var(--danger); background:none; border:none; cursor:pointer; font-size:1.1rem;">✖</button>
                </td>
            </tr>`;
    });

    // Handle overall invoice discount
    const invDiscountRaw = parseFloat($("invDiscountInput").value) || 0;
    const invDiscount = Math.min(invDiscountRaw, subTotal);
    
    // Proportionally adjust subtotal & taxes if there's an overall invoice discount
    let finalSubtotal = subTotal - invDiscount;
    let gstFactor = subTotal > 0 ? finalSubtotal / subTotal : 0;
    let finalGST = totalGST * gstFactor;

    const rawGrand = finalSubtotal + finalGST;
    const grand = Math.round(rawGrand);
    const roundOff = grand - rawGrand;

    // Summary rows
    $("sumSubtotal").innerText = `₹${finalSubtotal.toFixed(2)}`;
    $("sumRoundOff").innerText = `${roundOff >= 0 ? "+" : ""}₹${roundOff.toFixed(2)}`;

    const gstRows = document.querySelectorAll(".gst-row");
    const isInter = isInterstate();

    if (isGstEnabled && finalSubtotal > 0) {
        gstRows.forEach(row => row.style.display = "none");
        if (isInter) {
            const igstRow = document.querySelector(".igst-row");
            if (igstRow) {
                igstRow.style.display = "flex";
                const avgRate = (finalGST / finalSubtotal) * 100;
                $("igstLabel").innerText = `IGST (${avgRate.toFixed(1)}%)`;
                $("sumIGST").innerText = `₹${finalGST.toFixed(2)}`;
            }
        } else {
            document.querySelectorAll(".cgst-sgst-rows").forEach(row => row.style.display = "flex");
            const avgRate = (finalGST / finalSubtotal) * 100;
            const halfRate = (avgRate / 2).toFixed(1);
            $("cgstLabel").innerText = `CGST (${halfRate}%)`;
            $("sgstLabel").innerText = `SGST (${halfRate}%)`;
            $("sumCGST").innerText = `₹ ${(finalGST / 2).toFixed(2)}`;
            $("sumSGST").innerText = `₹ ${(finalGST / 2).toFixed(2)}`;
        }
    } else {
        gstRows.forEach(row => row.style.display = "none");
        $("sumCGST").innerText = `₹0.00`;
        $("sumSGST").innerText = `₹0.00`;
        $("sumIGST").innerText = `₹0.00`;
    }

    $("sumGrand").innerText = grand.toLocaleString('en-IN');

    // Balance preview panel
    const previewBox = $("newBalPreview");
    const prevOut    = selectedCustomer ? (selectedCustomer.outstanding || 0) : 0;
    const cashLbl    = $("partCashLabel");
    const creditLbl  = $("partCreditLabel");
    const balAmt     = $("newBalAmt");

    if (paymentMode === "credit" && selectedCustomer) {
        if (cashLbl)   { cashLbl.parentElement.style.display = "none"; }
        if (creditLbl) { creditLbl.parentElement.style.display = "none"; }
        const newBal = prevOut + grand;
        if (balAmt) {
            if (newBal < 0) {
                balAmt.innerText = `₹${Math.round(-newBal).toLocaleString('en-IN')} (Advance)`;
                balAmt.style.color = "#16a34a";
            } else {
                balAmt.innerText = `₹${Math.round(newBal).toLocaleString('en-IN')}`;
                balAmt.style.color = "";
            }
        }
        previewBox.style.display = "block";
    } else if (paymentMode === "part" && selectedCustomer) {
        const creditAmt = grand - partCashPaid;
        const newBal    = prevOut + creditAmt;
        if (cashLbl)   { cashLbl.parentElement.style.display = "flex";   cashLbl.innerText   = `₹${Math.round(partCashPaid).toLocaleString('en-IN')}`; }
        if (creditLbl) {
            creditLbl.parentElement.style.display = "flex";
            const labelSpan = creditLbl.parentElement.querySelector("span");
            if (creditAmt < 0) {
                if (labelSpan) labelSpan.innerText = "Excess (Paid to Ledger)";
                creditLbl.innerText = `₹${Math.round(-creditAmt).toLocaleString('en-IN')}`;
                creditLbl.style.color = "#16a34a";
            } else {
                if (labelSpan) labelSpan.innerText = "Goes to Credit";
                creditLbl.innerText = `₹${Math.round(creditAmt).toLocaleString('en-IN')}`;
                creditLbl.style.color = "#dc2626";
            }
        }
        if (balAmt) {
            if (newBal < 0) {
                balAmt.innerText = `₹${Math.round(-newBal).toLocaleString('en-IN')} (Advance)`;
                balAmt.style.color = "#16a34a";
            } else {
                balAmt.innerText = `₹${Math.round(newBal).toLocaleString('en-IN')}`;
                balAmt.style.color = "";
            }
        }
        previewBox.style.display = "block";
    } else {
        previewBox.style.display = "none";
    }
}

function updateQty(index, newQty) {
    const item = billItems[index];
    const original = allProducts.find(p => p.id === item.product_id);
    const isLoose = item.sale_type === 'loose';

    // Loose items support decimals (e.g. 2.5 KG); unit items are integers
    const qty = isLoose ? parseFloat(newQty) : parseInt(newQty);
    const minQty = isLoose ? 0.001 : 1;
    const availableStock = isLoose
        ? (original ? (original.loose_stock || 0) : 0)
        : (original ? (original.quantity || 0) : 0);
    const unit = item.unit_label || (isLoose ? 'units' : 'Nos');

    if (isNaN(qty) || qty < minQty) {
        item.quantity = minQty;
    } else if (original && qty > availableStock) {
        showToast(`Only ${availableStock} ${unit} in stock!`, "warning");
        item.quantity = availableStock;
    } else {
        item.quantity = qty;
    }
    renderCart();
}

function removeItem(index) {
    billItems.splice(index, 1);
    renderCart();
}

// ============================================================
// INVOICE PREVIEW  (HTML ids match billing.html invoice section)
// ============================================================
function prepareInvoice() {
    if (billItems.length === 0) {
        showToast("Add items to the cart first ⚠️", "warning");
        return;
    }

    // Reset buttons
    const confirmBtn = $("confirmBtn");
    const undoBtn = $("undoBtn");
    if (confirmBtn) { confirmBtn.innerText = "✅ Confirm & Save"; confirmBtn.disabled = false; confirmBtn.style.opacity = "1"; }
    if (undoBtn) undoBtn.style.display = "none";

    // Customer Info (from selected customer or walk-in fields)
    let custName, custAddress, custGstin, custState, custStateCode;
    if (selectedCustomer) {
        custName      = selectedCustomer.name;
        custAddress   = selectedCustomer.address || "N/A";
        custGstin     = selectedCustomer.gstin   || "URD (Unregistered)";
        custState     = selectedCustomer.state    || "N/A";
        custStateCode = selectedCustomer.state_code || "N/A";
    } else if ($("walkInFields").style.display !== "none") {
        // Walk-in manual fields
        custName      = $("wiName").value  || "Walk-in Customer";
        custAddress   = $("wiAddress").value || "N/A";
        custGstin     = $("wiGstin").value || "URD (Unregistered)";
        custState     = $("wiState").value || "N/A";
        custStateCode = $("wiStateCode").value || "N/A";
    } else {
        custName = "Walk-in Customer";
        custAddress = custGstin = custState = custStateCode = "N/A";
    }

    $("invCustName").innerText  = custName;
    $("invCustAddr").innerText  = custAddress;
    $("invCustGstin").innerText = custGstin;
    $("invCustState").innerText = custState ? `${custState} (Code: ${custStateCode})` : "N/A";

    // Shipping Info
    const isShipDifferent = $("chkShipTo").checked;
    $("invShipName").innerText  = isShipDifferent ? ($("shipName").value  || custName)    : custName;
    $("invShipAddr").innerText  = isShipDifferent ? ($("shipAddr").value  || custAddress) : custAddress;
    $("invShipState").innerText = isShipDifferent
        ? `${$("shipState").value || custState} (Code: ${$("shipStateCode").value || custStateCode})`
        : `${custState} (Code: ${custStateCode})`;

    // Invoice number
    fetch(window.apiUrl("/next-invoice-number"))
        .then(r => r.json())
        .then(data => { $("invNum").innerText = data.invoiceNumber; })
        .catch(() => {
            const year = new Date().getFullYear();
            $("invNum").innerText = `APNA/${year}/${Date.now().toString().slice(-3)}`;
        });

    $("invDate").innerText = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

    // Payment mode + stamp  (HTML ids: invPayMode, invStamp)
    const stamp = $("invStamp");
    const invPayMode = $("invPayMode");
    if (paymentMode === "credit") {
        if (invPayMode) invPayMode.innerText = "Credit (Udhaar)";
        if (stamp) { stamp.innerText = "CREDIT"; stamp.className = "inv-stamp stamp-credit"; }
    } else if (paymentMode === "part") {
        if (invPayMode) invPayMode.innerText = `Part Payment (Cash: ₹${Math.round(partCashPaid).toLocaleString('en-IN')})`;
        if (stamp) { stamp.innerText = "PART"; stamp.className = "inv-stamp stamp-credit"; }
    } else {
        if (invPayMode) invPayMode.innerText = "Cash / UPI";
        if (stamp) { stamp.innerText = "PAID"; stamp.className = "inv-stamp stamp-paid"; }
    }

    // Build invoice items
    const isGstEnabled = $("enableGst").checked;
    const invItems = $("invItems");
    invItems.innerHTML = "";
    
    let subTotal = 0;
    let totalGST = 0;

    billItems.forEach((item, i) => {
        const lineTotalRaw = item.selling_price * item.quantity;
        let discountAmt = 0;
        if (item.discount_type === "percentage") {
            discountAmt = (lineTotalRaw * item.discount_value) / 100;
        } else {
            discountAmt = item.discount_value;
        }
        discountAmt = Math.min(discountAmt, lineTotalRaw);
        const taxableVal = lineTotalRaw - discountAmt;
        const itemGST = isGstEnabled ? (taxableVal * item.gst) / 100 : 0;
        
        subTotal += taxableVal;
        totalGST += itemGST;

        invItems.innerHTML += `
            <tr>
                <td style="border:1px solid #000; padding:8px; text-align:center;">${i + 1}</td>
                <td style="border:1px solid #000; padding:8px;"><strong>${item.name}</strong><br><small style="color:#666;">${item.sku ? 'SKU: ' + item.sku + ' | ' : ''}${item.sale_type === 'loose' ? (item.unit_label || '') + ' (Loose) | ' : ''}GST: ${item.gst}%</small></td>
                <td style="border:1px solid #000; padding:8px; text-align:center;">${item.hsn_code}</td>
                <td style="border:1px solid #000; padding:8px; text-align:center;">${item.quantity} ${item.unit_label || ''}</td>
                <td style="border:1px solid #000; padding:8px; text-align:right;">₹${parseFloat(item.selling_price).toFixed(2)}</td>
                <td style="border:1px solid #000; padding:8px; text-align:right;">₹${discountAmt.toFixed(2)}</td>
                <td style="border:1px solid #000; padding:8px; text-align:right;">₹${taxableVal.toFixed(2)}</td>
            </tr>`;
    });

    // Handle overall invoice discount
    const invDiscountRaw = parseFloat($("invDiscountInput").value) || 0;
    const invDiscount = Math.min(invDiscountRaw, subTotal);
    
    // Proportionally adjust subtotal & taxes
    let finalSubtotal = subTotal - invDiscount;
    let gstFactor = subTotal > 0 ? finalSubtotal / subTotal : 0;
    let finalGST = totalGST * gstFactor;

    const rawGrand = finalSubtotal + finalGST;
    const grand = Math.round(rawGrand);
    const roundOff = grand - rawGrand;

    // Totals
    $("invSubtotal").innerText = finalSubtotal.toFixed(2);
    
    const invDiscRow = $("invDiscountRow");
    if (invDiscount > 0) {
        invDiscRow.style.display = "table-row";
        $("invDiscountVal").innerText = invDiscount.toFixed(2);
    } else {
        invDiscRow.style.display = "none";
    }

    const pGstRows = document.querySelectorAll(".p-gst-row");
    pGstRows.forEach(row => row.style.display = "none");

    const isInter = isInterstate();
    if (isGstEnabled && finalSubtotal > 0) {
        if (isInter) {
            document.querySelectorAll(".p-igst-row").forEach(row => row.style.display = "table-row");
            const avgRate = (finalGST / finalSubtotal) * 100;
            $("invIgstLabel").innerText = `IGST @ ${avgRate.toFixed(1)}%:`;
            $("invIGST").innerText = finalGST.toFixed(2);
        } else {
            document.querySelectorAll(".p-cgst-sgst-row").forEach(row => row.style.display = "table-row");
            const avgRate = (finalGST / finalSubtotal) * 100;
            const halfRate = (avgRate / 2).toFixed(1);
            $("invCgstLabel").innerText = `CGST @ ${halfRate}%:`;
            $("invSgstLabel").innerText = `SGST @ ${halfRate}%:`;
            $("invCGST").innerText = (finalGST / 2).toFixed(2);
            $("invSGST").innerText = (finalGST / 2).toFixed(2);
        }
    } else {
        $("invCGST").innerText = "0.00";
        $("invSGST").innerText = "0.00";
        $("invIGST").innerText = "0.00";
    }

    $("invRoundOff").innerText = `${roundOff >= 0 ? "+" : ""}₹${roundOff.toFixed(2)}`;
    $("invGrand").innerText = grand.toLocaleString('en-IN');
    $("invWords").innerText = numberToWords(grand) + " Rupees Only";

    // Ledger summary boxes
    const ledgerBox  = $("invLedgerBox");
    const partBox    = $("invPartBox");
    const prevBalance = selectedCustomer ? (selectedCustomer.outstanding || 0) : 0;

    if (paymentMode === "credit" && selectedCustomer) {
        const newBalance = prevBalance + grand;
        $("invPrevBal").innerText = (prevBalance < 0 ? "-" : "") + Math.round(Math.abs(prevBalance)).toLocaleString('en-IN');
        $("invThisAmt").innerText = Math.round(grand).toLocaleString('en-IN');
        
        const newBalEl = $("invNewBal");
        if (newBalance < 0) {
            newBalEl.innerText = `${Math.round(-newBalance).toLocaleString('en-IN')} (Advance)`;
            newBalEl.parentElement.style.color = "#15803d"; // green for advance
        } else {
            newBalEl.innerText = `${Math.round(newBalance).toLocaleString('en-IN')}`;
            newBalEl.parentElement.style.color = "#b45309"; // brown/orange for due
        }
        ledgerBox.style.display = "block";
        if (partBox) partBox.style.display = "none";
    } else if (paymentMode === "part" && selectedCustomer) {
        const creditAmt = grand - partCashPaid;
        const newBal    = prevBalance + creditAmt;
        $("invPartTotal").innerText   = Math.round(grand).toLocaleString('en-IN');
        $("invPartCash").innerText    = Math.round(partCashPaid).toLocaleString('en-IN');
        
        const creditEl = $("invPartCredit");
        const creditRow = creditEl.parentElement.parentElement;
        const creditLabelEl = creditRow.querySelector("td");
        if (creditAmt < 0) {
            if (creditLabelEl) creditLabelEl.innerText = "Excess Paid (Reduction)";
            creditEl.innerText = `${Math.round(-creditAmt).toLocaleString('en-IN')}`;
            creditRow.style.color = "#16a34a"; // green
        } else {
            if (creditLabelEl) creditLabelEl.innerText = "Balance to Udhaar";
            creditEl.innerText = `${Math.round(creditAmt).toLocaleString('en-IN')}`;
            creditRow.style.color = "#dc2626"; // red
        }
        
        const newBalEl = $("invPartNewBal");
        const newBalRow = newBalEl.parentElement.parentElement;
        const newBalLabelEl = newBalRow.querySelector("td");
        if (newBal < 0) {
            if (newBalLabelEl) newBalLabelEl.innerText = "New Total Outstanding (Advance)";
            newBalEl.innerText = `${Math.round(-newBal).toLocaleString('en-IN')}`;
            newBalRow.style.color = "#16a34a"; // green
        } else {
            if (newBalLabelEl) newBalLabelEl.innerText = "New Total Outstanding";
            newBalEl.innerText = `${Math.round(newBal).toLocaleString('en-IN')}`;
            newBalRow.style.color = "#b45309"; // orange/brown
        }
        if (partBox) partBox.style.display = "block";
        ledgerBox.style.display = "none";
    } else {
        ledgerBox.style.display = "none";
        if (partBox) partBox.style.display = "none";
    }

    $("mainUI").style.display = "none";
    $("invoicePreview").style.display = "block";
    window.scrollTo(0, 0);
}

function closePreview() {
    const confirmBtn = $("confirmBtn");
    if (confirmBtn && confirmBtn.disabled) {
        // Sale already saved — full reset
        billItems = [];
        renderCart();
        clearCustomer();
        $("chkShipTo").checked = false;
        $("shipToSection").style.display = "none";
        ["shipName", "shipAddr", "shipState", "shipStateCode"].forEach(id => setVal(id, ""));
    }
    $("mainUI").style.display = "block";
    $("invoicePreview").style.display = "none";
}

function printInvoice() { window.print(); }

// ============================================================
// NUMBER TO WORDS
// ============================================================
function numberToWords(num) {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
        'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    if ((num = num.toString()).length > 9) return 'overflow';
    const n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n) return '';
    let str = '';
    str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + ' Crore '    : '';
    str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + ' Lakh '     : '';
    str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + ' Thousand '  : '';
    str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + ' Hundred '   : '';
    str += (n[5] != 0) ? ((str !== '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
    return str.trim();
}

// ============================================================
// CONFIRM / UNDO SALE
// ============================================================
async function confirmSale() {
    const confirmBtn = $("confirmBtn");
    const undoBtn    = $("undoBtn");

    const cgstText  = $("invCGST")  ? $("invCGST").innerText.replace(/,/g, '')  : '0';
    const sgstText  = $("invSGST")  ? $("invSGST").innerText.replace(/,/g, '')  : '0';
    const igstText  = $("invIGST")  ? $("invIGST").innerText.replace(/,/g, '')  : '0';
    const grandText = $("invGrand") ? $("invGrand").innerText.replace(/,/g, '') : '0';
    const grand     = parseFloat(grandText) || 0;
    
    const gstTotal = parseFloat(igstText) > 0 ? parseFloat(igstText) : (parseFloat(cgstText) + parseFloat(sgstText));

    // Resolve customer name
    let custName  = "Walk-in Customer";
    let custPhone = "N/A";
    let custGstin = "N/A";

    if (selectedCustomer) {
        custName  = selectedCustomer.name;
        custPhone = selectedCustomer.phone || "N/A";
        custGstin = selectedCustomer.gstin || "N/A";
    } else if ($("walkInFields").style.display !== "none") {
        custName  = $("wiName").value  || "Walk-in Customer";
        custPhone = $("wiPhone").value || "N/A";
        custGstin = $("wiGstin").value || "N/A";
    }

    // For part payment, validate: cash paid must be > 0
    if (paymentMode === "part") {
        if (partCashPaid <= 0) {
            showToast("Enter the cash/UPI amount paid now ⚠️", "warning");
            return;
        }
    }

    const data = {
        total_amount:    grand,
        gst_amount:      gstTotal,
        items:           billItems,
        customer_name:   custName,
        customer_phone:  custPhone,
        customer_gstin:  custGstin,
        invoice_number:  $("invNum").innerText,
        shop_id:         window.SHOP_ID,
        customer_id:     selectedCustomer ? selectedCustomer.id : null,
        payment_mode:    paymentMode,
        cash_paid:       paymentMode === "part" ? partCashPaid : (paymentMode === "cash" ? grand : 0),
        credit_amount:   paymentMode === "credit" ? grand : (paymentMode === "part" ? (grand - partCashPaid) : 0)
    };

    try {
        const res = await fetch(window.API + "/add-sale", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (res.ok) {
            showToast("Sale Recorded ✅");
            lastSaleId = result.saleId;
            if (confirmBtn) { confirmBtn.innerText = "Saved ✅"; confirmBtn.disabled = true; confirmBtn.style.opacity = "0.7"; }
            if (undoBtn) undoBtn.style.display = "inline-flex";
            loadInitialData();
        // Notify other pages (e.g., Customers) to refresh data
        try { localStorage.setItem('customers_updated', Date.now().toString()); } catch(e) {}

            // Update local outstanding
            if ((paymentMode === "credit" || paymentMode === "part") && selectedCustomer) {
                selectedCustomer.outstanding = (selectedCustomer.outstanding || 0) + data.credit_amount;
                selectCustomer(selectedCustomer);
            }
        } else {
            showToast(result.error || "Failed to save ❌", "error");
        }
    } catch (err) {
        showToast("Connection Error ❌", "error");
    }
}

async function undoSale() {
    if (!lastSaleId) return;
    const confirmBtn = $("confirmBtn");
    const undoBtn    = $("undoBtn");

    try {
        const res = await fetch(window.API + "/undo-sale/" + lastSaleId, { method: "DELETE" });
        if (res.ok) {
            showToast("Sale Reverted ↩️");
            lastSaleId = null;
            if (confirmBtn) { confirmBtn.innerText = "✅ Confirm & Save"; confirmBtn.disabled = false; confirmBtn.style.opacity = "1"; }
            if (undoBtn) undoBtn.style.display = "none";
            loadInitialData();

            if ((paymentMode === "credit" || paymentMode === "part") && selectedCustomer) {
                const credit = paymentMode === "part"
                    ? (parseFloat($("invGrand").innerText.replace(/,/g, '')) || 0) - partCashPaid
                    : (parseFloat($("invGrand").innerText.replace(/,/g, '')) || 0);
                selectedCustomer.outstanding = (selectedCustomer.outstanding || 0) - credit;
                selectCustomer(selectedCustomer);
            }
        } else {
            showToast("Undo failed ❌", "error");
        }
    } catch (e) {
        showToast("Error ❌", "error");
    }
}

// ============================================================
// STATE CODE AUTO-FILL
// ============================================================
const stateCodeMap = {
    "Jammu & Kashmir": "01", "Himachal Pradesh": "02", "Punjab": "03", "Chandigarh": "04",
    "Uttarakhand": "05", "Haryana": "06", "Delhi": "07", "Rajasthan": "08", "Uttar Pradesh": "09",
    "Bihar": "10", "Sikkim": "11", "Arunachal Pradesh": "12", "Nagaland": "13", "Manipur": "14",
    "Mizoram": "15", "Tripura": "16", "Meghalaya": "17", "Assam": "18", "West Bengal": "19",
    "Jharkhand": "20", "Odisha": "21", "Chhattisgarh": "22", "Madhya Pradesh": "23",
    "Gujarat": "24", "Maharashtra": "27", "Karnataka": "29", "Goa": "30", "Kerala": "32",
    "Tamil Nadu": "33", "Puducherry": "34", "Telangana": "36", "Andhra Pradesh": "37", "Ladakh": "38"
};

function handleStateChange(stateInputId, codeInputId) {
    const stateInput = $(stateInputId);
    const codeInput  = $(codeInputId);
    if (!stateInput || !codeInput) return;
    stateInput.addEventListener("input", () => {
        const code = stateCodeMap[stateInput.value.trim()];
        if (code) codeInput.value = code;
    });
}

// ============================================================
// INIT ON DOM READY
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    loadInitialData();

    // State auto-fill for walk-in, new customer, ship-to
    handleStateChange("wiState",  "wiStateCode");
    handleStateChange("ncState",  "ncStateCode");
    handleStateChange("shipState","shipStateCode");

    // Default: credit & part-pay disabled until customer selected
    $("payCredit").classList.add("disabled");
    if ($("payPart")) $("payPart").classList.add("disabled");
    $("creditNote").style.display = "block";

    // Click outside to close customer search results
    document.addEventListener("click", (e) => {
        const box = $("custSearchBox");
        const results = $("custSearchResults");
        if (box && results && !box.contains(e.target)) {
            results.style.display = "none";
        }
        // Close product results when clicking outside
        const prodBox = $("prodResults");
        const prodInput = $("prodSearch");
        const prodContainer = prodInput ? prodInput.closest("div[style*='position:relative']") : null;
        if (prodBox && prodInput) {
            const inProdArea = prodContainer
                ? prodContainer.contains(e.target)
                : (prodInput.contains(e.target) || prodBox.contains(e.target));
            if (!inProdArea) {
                prodBox.style.display = "none";
            }
        }
    });

    // Initial cart render
    renderCart();
});

// ── Global expose ──────────────────────────────────────────────
window.searchCustomer       = searchCustomer;
window.selectCustomer       = selectCustomer;
window.selectWalkIn         = selectWalkIn;
window.clearCustomer        = clearCustomer;
window.showNewCustForm      = showNewCustForm;
window.hideNewCustForm      = hideNewCustForm;
window.saveNewCustomer      = saveNewCustomer;
window.setPayMode           = setPayMode;
window.searchProduct        = searchProduct;
window.addToBillById        = addToBillById;
window.updateQty            = updateQty;
window.removeItem           = removeItem;
window.renderCart           = renderCart;
window.prepareInvoice       = prepareInvoice;
window.closePreview         = closePreview;
window.printInvoice         = printInvoice;
window.confirmSale          = confirmSale;
window.undoSale             = undoSale;
window.toggleShipTo         = toggleShipTo;
window.onPartCashChange     = onPartCashChange;
window.updateDiscount       = updateDiscount;
window.updateDiscountType   = updateDiscountType;