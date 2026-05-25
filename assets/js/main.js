// ============================================
// BARON POS - Main Application Entry Point
// ============================================

import { initAuth, startAuthCheck, doLogout, changePassword, createUser, updateUser, toggleUserStatus, extendUser, forceLogoutUser, deleteUserAccount } from './modules/auth.js';
import { enableMaintenanceMode, disableMaintenanceMode } from './modules/maintenance.js';
import { navTo, toggleSidebar, switchUserTab } from './modules/navigation.js';
import { loadPosProducts, filterProducts, filterByCategory, addToCart, changeQty, removeFromCart, addNoteToCartItem, selectQuickNote, saveNote, clearNote, closeNoteModal, clearCart, updateCartSummary, selectCartPayment, renderCart, checkout } from './modules/pos.js';
import { loadProductsTable, loadCategories, updateProdCatSelect, updateEditProdCatSelect, generateProductCode, addNewCategory, addNewEditCategory, saveProduct, deleteProduct, editProduct, saveProductEdit, openProductModal, closeProductModal, closeEditProductModal, onProdCatChange, onEditProdCatChange } from './modules/products.js';
import { loadInvoicesTable, viewInvoice, deleteInvoice, showInvoice, printInvoiceFromModal, printInvoiceDoubleFromModal, printInvoiceFromTable, closeInvoiceModal, resetInvoiceCounter, toggleSelectAllInvoices, getSelectedInvoices, printSelectedInvoices, deleteSelectedInvoices, exportSelectedToPDF } from './modules/invoices.js';
import { loadReports, printReports, printDayReport } from './modules/reports.js';
import { loadUsersTable, loadLoginLog, printLoginLog } from './modules/users.js';
import { loadStats } from './modules/dashboard.js';
import { openPrinterModal, closePrinterModal, connectQZ, savePrinterSettings, autoPrintDouble } from './modules/printer.js';
import { openEditInvoiceModal, closeEditInvoiceModal, changeEditItemQty, removeEditItem, recalcEditInvoice, openAddProductToInvoice, closeAddProdToInvModal, filterAddProdSearch, addProductToCurrentEdit, saveInvoiceEdit } from './modules/edit-invoice.js';
import { holdInvoice, loadPendingInvoices, resumePendingInvoice, printPendingInvoice, deletePendingInvoice } from './modules/pending.js';
import { state } from './utils/state.js';

// Make all functions globally available for HTML onclick handlers
Object.assign(window, {
    // Navigation
    navTo, toggleSidebar, switchUserTab,
    // Auth
    doLogout, changePassword, createUser, updateUser, toggleUserStatus, extendUser, forceLogoutUser, deleteUserAccount,
    // Maintenance
    enableMaintenanceMode, disableMaintenanceMode,
    // POS
    loadPosProducts, filterProducts, filterByCategory, addToCart, changeQty, removeFromCart, addNoteToCartItem,
    selectQuickNote, saveNote, clearNote, closeNoteModal, clearCart, updateCartSummary, selectCartPayment, checkout,
    // Products
    loadProductsTable, loadCategories, updateProdCatSelect, updateEditProdCatSelect, generateProductCode,
    addNewCategory, addNewEditCategory, saveProduct, deleteProduct, editProduct, saveProductEdit,
    openProductModal, closeProductModal, closeEditProductModal, onProdCatChange, onEditProdCatChange,
    // Invoices
    loadInvoicesTable, viewInvoice, deleteInvoice, showInvoice, printInvoiceFromModal, printInvoiceDoubleFromModal,
    printInvoiceFromTable, closeInvoiceModal, resetInvoiceCounter, toggleSelectAllInvoices, getSelectedInvoices,
    printSelectedInvoices, deleteSelectedInvoices, exportSelectedToPDF,
    // Reports
    loadReports, printReports, printDayReport,
    // Users
    loadUsersTable, loadLoginLog, printLoginLog,
    // Dashboard
    loadStats,
    // Printer
    openPrinterModal, closePrinterModal, connectQZ, savePrinterSettings, autoPrintDouble,
    // Edit Invoice
    openEditInvoiceModal, closeEditInvoiceModal, changeEditItemQty, removeEditItem, recalcEditInvoice,
    openAddProductToInvoice, closeAddProdToInvModal, filterAddProdSearch, addProductToCurrentEdit, saveInvoiceEdit,
    // Pending
    holdInvoice, loadPendingInvoices, resumePendingInvoice, printPendingInvoice, deletePendingInvoice,
    // Modal helpers
    openPendingModal: () => document.getElementById('pendingModal').classList.add('show'),
    closePendingModal: () => document.getElementById('pendingModal').classList.remove('show'),
    openChangePassModal: () => document.getElementById('changePassModal').classList.add('show'),
    closeChangePassModal: () => document.getElementById('changePassModal').classList.remove('show'),
    openUserModal: () => document.getElementById('userModal').classList.add('show'),
    closeUserModal: () => document.getElementById('userModal').classList.remove('show'),
    openEditUserModal: async (uid) => {
        if (!state.isAdmin) { alert('للمدير فقط'); return; }
        const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const { db } = await import('./firebase-config.js');
        const { DEFAULT_PERMS } = await import('./utils/constants.js');

        const ud = await getDoc(doc(db, "users", uid));
        if (!ud.exists()) return;
        const u = ud.data();

        document.getElementById('editUserId').value = uid;
        document.getElementById('editUserName').value = u.fullName || '';
        document.getElementById('editUserEmail').value = u.email || '';
        document.getElementById('editUserRole').value = u.role || 'cashier';
        document.getElementById('editUserStatus').value = u.status || 'active';

        if (u.role === 'admin') {
            document.getElementById('editUserDaysRow').classList.add('hidden');
            document.getElementById('editAdminNoteRow').classList.remove('hidden');
        } else {
            document.getElementById('editUserDaysRow').classList.remove('hidden');
            document.getElementById('editAdminNoteRow').classList.add('hidden');
            let daysLeft = 30;
            if (u.expiresAt && u.expiresAt.toDate) {
                daysLeft = Math.ceil((u.expiresAt.toDate() - new Date()) / (1000 * 60 * 60 * 24));
                if (daysLeft < 0) daysLeft = 1;
            } else if (u.daysActivated) daysLeft = u.daysActivated;
            document.getElementById('editUserDays').value = daysLeft;
        }

        const perms = u.permissions || DEFAULT_PERMS;
        document.querySelectorAll('#editUserPerms input[type="checkbox"]').forEach(cb => {
            cb.checked = perms[cb.value] || false;
            const parent = cb.closest('.perm-item');
            if (cb.checked) parent.classList.add('active');
            else parent.classList.remove('active');
        });

        document.getElementById('editUserModal').classList.add('show');
    },
    closeEditUserModal: () => document.getElementById('editUserModal').classList.remove('show'),
    toggleEditUserDays: () => {
        const role = document.getElementById('editUserRole').value;
        if (role === 'admin') {
            document.getElementById('editUserDaysRow').classList.add('hidden');
            document.getElementById('editAdminNoteRow').classList.remove('hidden');
        } else {
            document.getElementById('editUserDaysRow').classList.remove('hidden');
            document.getElementById('editAdminNoteRow').classList.add('hidden');
        }
    },
    toggleUserDays: () => {
        const role = document.getElementById('userRole').value;
        if (role === 'admin') {
            document.getElementById('userDaysRow').classList.add('hidden');
            document.getElementById('adminNoteRow').classList.remove('hidden');
        } else {
            document.getElementById('userDaysRow').classList.remove('hidden');
            document.getElementById('adminNoteRow').classList.add('hidden');
        }
    },
    togglePerm: (el) => {
        const cb = el.querySelector('input[type="checkbox"]');
        cb.checked = !cb.checked;
        el.classList.toggle('active', cb.checked);
    }
});

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    // Set date
    document.getElementById('topDate').textContent = new Date().toLocaleDateString('ar-EG', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    // Initialize auth
    initAuth();
    startAuthCheck();
});
