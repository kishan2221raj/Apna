// dashboard.js — Fixed with shop_id support

async function loadDashboardStats() {
    try {
        const today = new Date();
        const yday = new Date(today); yday.setDate(today.getDate() - 1);
        const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        // Fetch stats from reports profit-loss endpoint
        const qToday = window.apiUrl('/profit-loss', { from: fmt(today), to: fmt(today) });
        const qYday = window.apiUrl('/profit-loss', { from: fmt(yday), to: fmt(yday) });

        const [resToday, resYday] = await Promise.all([
            fetch(qToday),
            fetch(qYday)
        ]);

        const rawToday = resToday.ok ? await resToday.json() : { revenue: 0, net_profit: 0, total_expenses: 0 };
        const rawYday = resYday.ok ? await resYday.json() : { revenue: 0, net_profit: 0, total_expenses: 0 };

        const dataToday = { sales: rawToday.revenue || 0, profit: rawToday.net_profit || 0, expenses: rawToday.total_expenses || 0 };
        const dataYday = { sales: rawYday.revenue || 0, profit: rawYday.net_profit || 0, expenses: rawYday.total_expenses || 0 };

        const todaySalesEl = document.getElementById("todaySales");
        const todayProfitEl = document.getElementById("todayProfit");
        const todayExpensesEl = document.getElementById("todayExpenses");

        if (todaySalesEl) todaySalesEl.innerText = `₹${Math.round(dataToday.sales).toLocaleString('en-IN')}`;
        if (todayProfitEl) todayProfitEl.innerText = `₹${Math.round(dataToday.profit).toLocaleString('en-IN')}`;
        if (todayExpensesEl) todayExpensesEl.innerText = `₹${Math.round(dataToday.expenses).toLocaleString('en-IN')}`;

        // Trend calculation
        function updateTrend(elemId, todayVal, yVal) {
            const el = document.getElementById(elemId);
            if (!el) return;
            el.classList.remove('up', 'down');
            if (yVal === 0) {
                if (todayVal === 0) { el.innerText = '— No change'; }
                else { el.innerText = '↑ New since yesterday'; el.classList.add('up'); }
            } else {
                const pct = ((todayVal - yVal) / Math.abs(yVal)) * 100;
                const sign = pct >= 0 ? '↑' : '↓';
                el.innerText = `${sign} ${Math.abs(pct).toFixed(1)}% from yesterday`;
                el.classList.add(pct >= 0 ? 'up' : 'down');
            }
        }

        updateTrend('todaySalesTrend', Number(dataToday.sales), Number(dataYday.sales));
        updateTrend('todayProfitTrend', Number(dataToday.profit), Number(dataYday.profit));

        // FIX: use apiUrl for products
        const prodRes = await fetch(window.apiUrl("/products"));
        const products = prodRes.ok ? await prodRes.json() : [];

        const lowStockCount = products.filter(p => p.quantity <= p.min_stock).length;
        const lowStockEl = document.getElementById("lowStockCount");
        if (lowStockEl) lowStockEl.innerText = lowStockCount;

        // Calculate Stock Value and SKU Count
        let totalValue = 0;
        products.forEach(p => {
            totalValue += ((p.purchase_price || 0) * (p.quantity || 0));
        });

        const inventoryValueEl = document.getElementById("inventoryValue");
        if (inventoryValueEl) inventoryValueEl.innerText = `₹${Math.round(totalValue).toLocaleString('en-IN')}`;

        const uniqueProductsEl = document.getElementById("uniqueProducts");
        if (uniqueProductsEl) uniqueProductsEl.innerText = products.length;

        // Wire low stock card click
        const lowStockCard = document.getElementById('lowStockCard');
        if (lowStockCard) {
            // Remove old listeners by cloning
            const newCard = lowStockCard.cloneNode(true);
            lowStockCard.parentNode.replaceChild(newCard, lowStockCard);
            newCard.addEventListener('click', () => showStockPopup(products));
        }

    } catch (err) {
        console.error("Dashboard Stats Error:", err);
    }
}

function showStockPopup(products) {
    const popup = document.getElementById('stockPopup');
    const tbody = document.querySelector('#stockTable tbody');
    if (!popup || !tbody) return;

    tbody.innerHTML = '';
    const low = products.filter(p => Number(p.quantity) <= Number(p.min_stock));

    if (low.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding:1rem;">✅ All stock levels are healthy!</td></tr>`;
    } else {
        low.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escapeHtml(p.name || '')}</td>
                <td>${escapeHtml(p.hsn_code || '—')}</td>
                <td style="font-weight:700; color:${p.quantity <= 0 ? 'var(--danger)' : 'var(--warning)'};">${p.quantity}</td>
                <td>${p.min_stock}</td>`;
            tbody.appendChild(tr);
        });
    }

    const dl = document.getElementById('downloadStockCsv');
    if (dl) dl.onclick = () => downloadProductsCsv(low);

    const closeBtn = document.getElementById('closeStockPopup');
    if (closeBtn) closeBtn.onclick = () => { popup.style.display = 'none'; };

    popup.style.display = 'flex';
}

function escapeHtml(s) {
    return (s + '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function downloadProductsCsv(list) {
    if (!list || !list.length) { alert('No items to download'); return; }
    const headers = ['name', 'hsn_code', 'quantity', 'min_stock', 'purchase_price', 'selling_price'];
    const rows = [headers.join(',')];
    list.forEach(p => {
        rows.push(headers.map(h => `"${p[h] !== undefined ? p[h] : ''}"`).join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `low_stock_shop${window.SHOP_ID}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
}

// Global expose
window.loadDashboardStats = loadDashboardStats;
window.showStockPopup = showStockPopup;

// Auto start with polling
function startDashboardPolling() {
    loadDashboardStats();
    setInterval(loadDashboardStats, 30000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startDashboardPolling);
} else {
    startDashboardPolling();
}