// ============================================
// BARON POS - Global State Management
// ============================================

import { DEFAULT_PERMS } from './constants.js';

class AppState {
    constructor() {
        this.currentUser = null;
        this.userData = null;
        this.isAdmin = false;
        this.isMonitorOnly = false;
        this.cart = [];
        this.allProducts = [];
        this.productCategories = ["تشكن", "برجر", "سايدز", "مشروبات", "أخرى"];
        this.currentSessionId = null;
        this.currentFilter = 'all';
        this.cartPaymentMethod = 'cash';
        this.currentSearchQuery = '';
        this.maintenanceUnsub = null;
        this.pendingUnsub = null;
        this.editingProductId = null;
        this.noteTargetItemId = null;
        this.currentEditInvoice = null;
        this.currentEditItems = [];
    }

    // Permission Checks
    checkPerm(permKey) {
        if (this.isAdmin) return true;
        if (!this.userData || !this.userData.permissions) return false;
        return this.userData.permissions[permKey] === true;
    }

    hasAnyPerm(permKeys) {
        if (this.isAdmin) return true;
        if (!this.userData || !this.userData.permissions) return false;
        return permKeys.some(k => this.userData.permissions[k] === true);
    }

    requirePerm(permKey, actionName) {
        if (!this.checkPerm(permKey)) {
            alert('ليس لديك صلاحية: ' + (actionName || 'غير محددة'));
            return false;
        }
        return true;
    }

    // Cart Calculations
    getCartCalculations() {
        const subTotal = this.cart.reduce((s, i) => s + (i.price * i.qty), 0);
        const discountPercent = parseFloat(document.getElementById('discountPercent')?.value) || 0;
        const discountAmount = Math.round((subTotal * discountPercent) / 100);
        const deliveryFee = parseFloat(document.getElementById('summaryDeliveryFee')?.value) || 0;
        const finalTotal = Math.max(0, subTotal + deliveryFee - discountAmount);
        const paidAmount = parseFloat(document.getElementById('summaryPaid')?.value) || 0;
        const remaining = paidAmount - finalTotal;
        return { subTotal, discountPercent, discountAmount, deliveryFee, finalTotal, paidAmount, remaining };
    }

    // Reset Cart
    clearCart() {
        this.cart = [];
        this.currentSearchQuery = '';
    }

    // Get Category Icon
    getCategoryIcon(cat) {
        const { CAT_ICONS } = require('./constants.js');
        return CAT_ICONS[cat] || { icon: 'fa-utensils', class: 'cat-other' };
    }

    // Role Name
    getRoleName(r) {
        const { ROLE_NAMES } = require('./constants.js');
        return ROLE_NAMES[r] || r;
    }
}

export const state = new AppState();
export default state;
