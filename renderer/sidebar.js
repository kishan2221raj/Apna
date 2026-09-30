// ─── AUTH GUARD ──────────────────────────────────────────────────────────────
const isLoggedIn = sessionStorage.getItem("isLoggedIn") === "true";
const isLoginPage = window.location.pathname.includes("login.html");

if (!isLoggedIn && !isLoginPage) {
    window.location.href = "login.html";
}

// ─── GLOBAL HELPERS ──────────────────────────────────────────────────────────
window.SHOP_ID = parseInt(sessionStorage.getItem("shop_id") || "1");
window.SHOP_NAME = sessionStorage.getItem("shopName") || "Apna Enterprises";
window.API = window.location.protocol === 'file:' ? "http://127.0.0.1:4000" : window.location.origin;

// Helper to build API URLs with shop_id automatically
window.apiUrl = function (path, extraParams = {}) {
    const url = new URL(window.API + path);
    url.searchParams.set("shop_id", window.SHOP_ID);
    Object.entries(extraParams).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
};

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
window.handleLogout = function () {
    if (confirm("Are you sure you want to logout?")) {
        sessionStorage.clear();
        window.location.href = "login.html?t=" + new Date().getTime();
    }
};

// ─── SIDEBAR BUILDER ─────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    const currentPage = window.location.pathname.split("/").pop();
    const shopId = window.SHOP_ID;
    const shopName = window.SHOP_NAME;
    const shopColor = shopId === 2 ? "#10b981" : "#6366f1";
    const shopIcon = shopId === 2 ? "fa-hammer" : "fa-store";

    const navItems = [
        { href: "index.html", icon: "fa-home", label: "Dashboard" },
        { href: "billing.html", icon: "fa-file-invoice", label: "Sales Billing" },
        { href: "purchases.html", icon: "fa-cart-arrow-down", label: "Purchases" },
        { href: "product.html", icon: "fa-boxes-stacked", label: "Inventory" },
        { href: "customers.html", icon: "fa-users", label: "Customers" },
        { href: "suppliers.html", icon: "fa-truck", label: "Suppliers" },
        { href: "expenses.html", icon: "fa-wallet", label: "Expenses" },
        { href: "reports.html", icon: "fa-chart-line", label: "Reports" },
        { href: "settings.html", icon: "fa-cog", label: "Settings" },
    ];

    const sidebarHTML = `
    <div class="sidebar" id="sidebar">
        <div class="sidebar-header" style="
            padding: 1.25rem 1rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            height: 80px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
        ">
            <div class="logo-container" style="display:flex; align-items:center; gap:10px; overflow:hidden;">
                <div class="logo-icon" style="background:${shopColor}; width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="fas ${shopIcon}" style="color:white; font-size:1rem;"></i>
                </div>
                <div style="overflow:hidden;">
                    <h2 style="color:white; font-size:0.95rem; font-weight:700; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${shopName}</h2>
                    <small style="color:#64748b; font-size:0.78rem;">Shop ${shopId}</small>
                </div>
            </div>
            <button class="toggle-btn" onclick="toggleSidebar()" title="Toggle Sidebar">
                <i class="fas fa-bars"></i>
            </button>
        </div>

        <ul class="nav-list" style="padding: 1rem 0.75rem; margin-top: 0.5rem;">
            ${navItems.map(item => `
                <li class="nav-item">
                    <a href="${item.href}" class="nav-link ${currentPage === item.href ? 'active' : ''}">
                        <i class="fas ${item.icon}"></i>
                        <span>${item.label}</span>
                    </a>
                </li>
            `).join("")}
        </ul>

        <div style="padding: 0.75rem; border-top: 1px solid rgba(255,255,255,0.08); margin-top: auto;">

            <button onclick="handleLogout()" style="
                width: 100%;
                padding: 0.625rem;
                background: rgba(239,68,68,0.1);
                border: 1px solid rgba(239,68,68,0.2);
                border-radius: 10px;
                color: #f87171;
                font-size: 0.8rem;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.2s;
            " onmouseover="this.style.background='rgba(239,68,68,0.2)'"
               onmouseout="this.style.background='rgba(239,68,68,0.1)'">
                <i class="fas fa-sign-out-alt"></i>
                <span class="logout-text">Logout</span>
            </button>
        </div>
    </div>`;

    // Inject sidebar at start of body
    document.body.insertAdjacentHTML("afterbegin", sidebarHTML);



        // Responsive sidebar handling
        function handleResponsiveSidebar() {
          if (window.innerWidth < 768) {
            collapseSidebar();
          } else {
            expandSidebar();
          }
        }
        window.addEventListener('resize', handleResponsiveSidebar);
        handleResponsiveSidebar();

    // Show sidebar and adjust main content
    const sidebar = document.getElementById("sidebar");
    const mainContent = document.querySelector(".main-content");

    // Apply sidebar styles
    sidebar.style.cssText = `
        display: flex;
        flex-direction: column;
        width: 240px;
        height: 100vh;
        background: #1e293b;
        position: fixed;
        left: 0; top: 0;
        z-index: 1000;
        transition: width 0.3s ease;
        overflow: hidden;
    `;

    if (mainContent) {
        mainContent.style.marginLeft = "240px";
        mainContent.style.transition = "margin-left 0.3s ease";
    }

    // Restore collapsed state
    const isCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
    if (isCollapsed) collapseSidebar(false);

    // Active link color override for shop 2
    if (shopId === 2) {
        const style = document.createElement("style");
        style.textContent = `.nav-link.active { background: #10b981 !important; box-shadow: 0 4px 6px -1px rgba(16,185,129,0.4) !important; }`;
        document.head.appendChild(style);
    }
});

// ─── TOGGLE SIDEBAR ──────────────────────────────────────────────────────────
function toggleSidebar() {
    const isCollapsed = localStorage.getItem("sidebarCollapsed") === "true";
    if (isCollapsed) {
        expandSidebar();
    } else {
        collapseSidebar();
    }
}

function collapseSidebar(animate = true) {
    const sidebar = document.getElementById("sidebar");
    const mainContent = document.querySelector(".main-content");
    if (!sidebar) return;

    sidebar.style.width = "72px";
    if (mainContent) mainContent.style.marginLeft = "72px";

    // Hide text labels
    sidebar.querySelectorAll(".nav-link span, h2, small, .logout-text").forEach(el => {
        el.style.display = "none";
    });
    sidebar.querySelectorAll(".nav-link").forEach(el => {
        el.style.justifyContent = "center";
        el.style.padding = "0.875rem 0";
    });

    localStorage.setItem("sidebarCollapsed", "true");
}

function expandSidebar() {
    const sidebar = document.getElementById("sidebar");
    const mainContent = document.querySelector(".main-content");
    if (!sidebar) return;

    sidebar.style.width = "240px";
    if (mainContent) mainContent.style.marginLeft = "240px";

    // Show text labels
    sidebar.querySelectorAll(".nav-link span, h2, small, .logout-text").forEach(el => {
        el.style.display = "";
    });
    sidebar.querySelectorAll(".nav-link").forEach(el => {
        el.style.justifyContent = "";
        el.style.padding = "";
    });

    localStorage.setItem("sidebarCollapsed", "false");
}

window.toggleSidebar = toggleSidebar;