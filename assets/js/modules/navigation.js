// ============================================
// BARON POS - Navigation & UI Module
// ============================================

import { state } from '../utils/state.js';
import { loadPosProducts, renderProductsGrid } from './pos.js';
import { loadProductsTable } from './products.js';
import { loadInvoicesTable } from './invoices.js';
import { loadReports } from './reports.js';
import { loadUsersTable, loadLoginLog } from './users.js';
import { loadStats } from './dashboard.js';
import { applyMonitorMode } from './auth.js';

const SECTION_TITLES = {
    pos: 'نقطة البيع',
    products: 'المنتجات',
    invoices: 'الفواتير',
    reports: 'التقارير',
    users: 'المستخدمين'
};

export async function navTo(sec) {
    // Check permissions for non-admin users
    if (!state.isAdmin) {
        const permMap = {
            pos: 'pos', products: 'products', invoices: 'invoices',
            reports: 'reports', users: 'users', settings: 'settings'
        };
        const requiredPerm = permMap[sec];
        if (requiredPerm && !state.checkPerm(requiredPerm)) {
            alert('ليس لديك صلاحية الوصول إلى: ' + (requiredPerm || 'غير محددة'));
            return;
        }
    }

    if (sec === 'users' && !state.isAdmin && !state.checkPerm('users')) {
        alert('للمدير فقط');
        return;
    }

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    if (event && event.currentTarget) event.currentTarget.classList.add('active');

    // Close mobile sidebar
    if (window.innerWidth <= 768 && document.querySelector('.sidebar').classList.contains('open')) {
        toggleSidebar();
    }

    // Apply monitor mode when returning to POS
    if (sec === 'pos' && state.isMonitorOnly) {
        setTimeout(() => applyMonitorMode(), 200);
    }

    // Show section
    document.querySelectorAll('.section-view').forEach(s => s.classList.remove('active'));
    document.getElementById('view-' + sec).classList.add('active');
    document.getElementById('pageTitle').textContent = SECTION_TITLES[sec] || sec;

    // Load section data
    if (sec === 'pos') await loadPosProducts();
    if (sec === 'products') await loadProductsTable();
    if (sec === 'invoices') await loadInvoicesTable();
    if (sec === 'reports') await loadReports();
    if (sec === 'users') {
        await loadUsersTable();
        await loadLoginLog();
    }

    document.getElementById('statsBar').style.display = 'none';
}

export function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('show');
    document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
}

export function switchUserTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
    document.getElementById('panel-users').classList.toggle('hidden', tab !== 'users');
    document.getElementById('panel-log').classList.toggle('hidden', tab !== 'log');
    if (tab === 'log') loadLoginLog();
}
