// ============================================
// BARON POS - Point of Sale Module
// ============================================

import {
    collection, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from '../firebase-config.js';
import { state } from '../utils/state.js';
import { CAT_ICONS, DEFAULT_PRODUCTS } from '../utils/constants.js';
import { getNextInvoiceNumber } from '../utils/firebase-helpers.js';
import { showInvoice } from './invoices.js';

// Load products for POS grid
export async function loadPosProducts() {
    const box = document.getElementById('posProducts');
    box.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;"><div class="spin"></div><p style="color:#aaa;margin-top:15px;">جاري التحميل...</p></div>';

    try {
        const snap = await getDocs(collection(db, "products"));
        state.allProducts = [];

        if (snap.empty) {
            // Initialize with default products
            for (const p of DEFAULT_PRODUCTS) {
                await addDoc(collection(db, "products"), { ...p, createdAt: serverTimestamp() });
            }
            return await loadPosProducts();
        }

        snap.forEach(d => {
            const p = d.data();
            p.id = d.id;
            state.allProducts.push(p);
        });

        state.currentSearchQuery = '';
        const searchInput = document.getElementById('productSearch');
        if (searchInput) searchInput.value = '';

        renderCategoryTabs();
        renderProductsGrid();
    } catch (e) {
        console.error('loadPosProducts error:', e);
        box.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa;"><i class="fas fa-exclamation-circle" style="font-size:40px;margin-bottom:10px;"></i><p>خطأ في تحميل المنتجات</p></div>';
    }
}

// Render category tabs
export function renderCategoryTabs() {
    const container = document.getElementById('catTabs');
    if (!container) return;

    let html = `<div class="cat-tab ${state.currentFilter === 'all' ? 'active' : ''}" onclick="filterByCategory('all', this)"><i class="fas fa-th-large"></i> الكل</div>`;

    state.productCategories.forEach(cat => {
        const catData = CAT_ICONS[cat] || { icon: 'fa-ellipsis-h', class: 'cat-other' };
        html += `<div class="cat-tab ${state.currentFilter === cat ? 'active' : ''}" onclick="filterByCategory('${cat}', this)"><i class="fas ${catData.icon}"></i> ${cat}</div>`;
    });

    container.innerHTML = html;
}

// Render products grid
export function renderProductsGrid() {
    const box = document.getElementById('posProducts');
    try {
        let filtered = state.allProducts;

        // Category filter
        if (state.currentFilter !== 'all') {
            filtered = filtered.filter(p => p.category === state.currentFilter);
        }

        // Search filter
        if (state.currentSearchQuery.trim()) {
            const q = state.currentSearchQuery.trim().toLowerCase();
            filtered = filtered.filter(p => {
                const nameMatch = (p.name || '').toLowerCase().includes(q);
                const codeMatch = (p.code || '').toLowerCase().includes(q);
                return nameMatch || codeMatch;
            });
        }

        if (filtered.length === 0) {
            box.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa;"><i class="fas fa-box-open" style="font-size:40px;margin-bottom:10px;"></i><p>لا توجد منتجات مطابقة</p></div>';
            return;
        }

        let html = '';
        filtered.forEach(p => {
            if (!p || !p.id) return;
            const catData = CAT_ICONS[p.category] || { icon: 'fa-ellipsis-h', class: 'cat-other' };
            const price = p.price != null ? p.price : 0;
            const name = p.name || 'منتج بدون اسم';
            const code = p.code || '';

            html += `<div class="product-card" onclick="addToCart('${p.id}')">
                <div class="cat-img ${catData.class}"><i class="fas ${catData.icon}"></i><span class="cat-label">${p.category || 'أخرى'}</span></div>
                <div class="prod-body"><div class="code">${code}</div><div class="name">${name}</div><div class="price">${price} <span>ج.م</span></div></div>
            </div>`;
        });

        box.innerHTML = html;

        // Apply monitor mode if needed
        if (state.isMonitorOnly) {
            setTimeout(() => {
                const { applyMonitorMode } = require('./auth.js');
                applyMonitorMode();
            }, 100);
        }
    } catch (e) {
        console.error('renderProductsGrid error:', e);
        box.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa;"><i class="fas fa-exclamation-circle" style="font-size:40px;margin-bottom:10px;"></i><p>خطأ في عرض المنتجات</p></div>';
    }
}

// Filter by search
export function filterProducts() {
    const input = document.getElementById('productSearch');
    state.currentSearchQuery = input ? input.value : '';
    renderProductsGrid();
}

// Filter by category
export function filterByCategory(cat, el) {
    state.currentFilter = cat;
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
    renderProductsGrid();
}

// Add to cart
export function addToCart(pid) {
    const p = state.allProducts.find(x => x.id === pid);
    if (!p) return;

    const existing = state.cart.find(x => x.id === pid);
    if (existing) {
        existing.qty++;
    } else {
        state.cart.push({ id: pid, name: p.name, price: p.price, qty: 1, note: '' });
    }
    renderCart();
}

// Change quantity
export function changeQty(pid, delta) {
    const item = state.cart.find(x => x.id === pid);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) state.cart = state.cart.filter(x => x.id !== pid);
    renderCart();
}

// Remove from cart
export function removeFromCart(pid) {
    state.cart = state.cart.filter(x => x.id !== pid);
    renderCart();
}

// Add note to cart item
export function addNoteToCartItem(pid) {
    const item = state.cart.find(x => x.id === pid);
    if (!item) return;
    state.noteTargetItemId = pid;
    document.getElementById('customNoteInput').value = item.note || '';
    document.getElementById('noteModal').classList.add('show');
}

// Select quick note
export function selectQuickNote(note) {
    const input = document.getElementById('customNoteInput');
    const current = input.value.trim();
    if (current) {
        input.value = current + '\n' + note;
    } else {
        input.value = note;
    }
    input.focus();
}

// Save note
export function saveNote() {
    if (!state.noteTargetItemId) return;
    const note = document.getElementById('customNoteInput').value.trim();
    const item = state.cart.find(x => x.id === state.noteTargetItemId);
    if (item) {
        item.note = note;
        renderCart();
    }
    closeNoteModal();
}

// Clear note
export function clearNote() {
    if (!state.noteTargetItemId) return;
    const item = state.cart.find(x => x.id === state.noteTargetItemId);
    if (item) {
        item.note = '';
        renderCart();
    }
    closeNoteModal();
}

// Close note modal
export function closeNoteModal() {
    document.getElementById('noteModal').classList.remove('show');
    state.noteTargetItemId = null;
}

// Clear entire cart
export function clearCart() {
    state.cart = [];
    renderCart();
}

// Update cart summary calculations
export function updateCartSummary() {
    const calc = state.getCartCalculations();
    document.getElementById('summarySubTotal').textContent = calc.subTotal.toLocaleString('ar-EG') + ' ج.م';
    document.getElementById('summaryDiscount').textContent = calc.discountAmount.toLocaleString('ar-EG') + ' ج.م';
    document.getElementById('summaryFinalTotal').textContent = calc.finalTotal.toLocaleString('ar-EG') + ' ج.م';
    document.getElementById('summaryRemaining').textContent = calc.remaining.toLocaleString('ar-EG') + ' ج.م';
    document.getElementById('summaryRemaining').style.color = calc.remaining >= 0 ? 'var(--success)' : 'var(--danger)';
}

// Select payment method
export function selectCartPayment(method) {
    state.cartPaymentMethod = method;
    document.querySelectorAll('.pay-toggle-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('pay' + method.charAt(0).toUpperCase() + method.slice(1)).classList.add('active');

    const paidInput = document.getElementById('summaryPaid');
    if (method === 'delivery') {
        const currentFee = parseFloat(document.getElementById('summaryDeliveryFee').value) || 0;
        if (currentFee === 0) document.getElementById('summaryDeliveryFee').value = 15;
    }
    if (method !== 'cash') {
        const calc = state.getCartCalculations();
        paidInput.value = calc.finalTotal;
        paidInput.readOnly = true;
        paidInput.style.background = '#f0f0f0';
    } else {
        paidInput.readOnly = false;
        paidInput.style.background = 'white';
    }
    updateCartSummary();
}

// Render cart UI
export function renderCart() {
    const box = document.getElementById('cartItems');
    const btn = document.getElementById('checkoutBtn');

    if (state.cart.length === 0) {
        box.innerHTML = '<div class="empty" style="padding:30px 0;"><i class="fas fa-cart-plus" style="font-size:40px;color:#eee;"></i><p>اضغط على منتج لإضافته</p></div>';
        btn.disabled = true;
        document.getElementById('cartCount').textContent = '(0)';
        document.getElementById('discountPercent').value = 0;
        document.getElementById('summaryDeliveryFee').value = 0;
        document.getElementById('summaryPaid').value = 0;
        updateCartSummary();

        const holdBtn = document.getElementById('holdBtn');
        if (holdBtn) holdBtn.disabled = true;
        return;
    }

    let html = '';
    state.cart.forEach(item => {
        const itemTotal = item.price * item.qty;
        const noteLines = item.note ? item.note.toString().split(/\n|\r/).map(l => l.trim()).filter(l => l) : [];
        const noteDisplay = noteLines.length
            ? `<div style="font-size:11px;color:var(--warning);margin-top:2px;font-weight:700;line-height:1.4;">${noteLines.map(l => `<div><i class="fas fa-sticky-note" style="font-size:9px;margin-left:3px;"></i> ${l}</div>`).join('')}</div>`
            : '';

        html += `<div class="cart-item" style="align-items:flex-start;">
            <div class="cart-item-info" style="flex:1;">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">${item.price} ج.م × ${item.qty}</div>
                ${noteDisplay}
            </div>
            <div style="display:flex;flex-direction:column;align-items:center;gap:4px;margin:0 8px;">
                <div class="cart-qty"><button onclick="changeQty('${item.id}', -1)">−</button><span>${item.qty}</span><button onclick="changeQty('${item.id}', 1)">+</button></div>
                <button class="btn btn-warn" style="padding:3px 8px;font-size:11px;" onclick="addNoteToCartItem('${item.id}')" title="إضافة ملاحظة"><i class="fas fa-sticky-note"></i></button>
            </div>
            <div style="font-weight:800;min-width:60px;text-align:left;margin-top:4px;">${itemTotal} ج.م</div>
            <button class="btn btn-red" style="padding:4px 8px;margin-right:6px;margin-top:4px;" onclick="removeFromCart('${item.id}')"><i class="fas fa-times"></i></button>
        </div>`;
    });

    box.innerHTML = html;
    document.getElementById('cartCount').textContent = '(' + state.cart.reduce((s, i) => s + i.qty, 0) + ')';
    updateCartSummary();

    // Check sell permission
    if (!state.checkPerm('pos_sell')) {
        btn.disabled = true;
        btn.textContent = 'لا يوجد صلاحية بيع';
        btn.style.background = '#888';
    } else {
        btn.disabled = false;
    }

    const holdBtn = document.getElementById('holdBtn');
    if (holdBtn) {
        if (!state.checkPerm('pending_resume')) {
            holdBtn.disabled = true;
            holdBtn.style.background = '#888';
        } else {
            holdBtn.disabled = false;
        }
    }
}

// Checkout
export async function checkout() {
    if (!state.requirePerm('pos_sell', 'إتمام البيع')) return;
    if (state.cart.length === 0) return;

    if (state.cartPaymentMethod !== 'cash') {
        const calcAuto = state.getCartCalculations();
        document.getElementById('summaryPaid').value = calcAuto.finalTotal;
    }

    const calc = state.getCartCalculations();
    if (state.cartPaymentMethod === 'cash' && calc.remaining < 0) {
        alert('المبلغ المدفوع غير كافٍ!');
        return;
    }

    const btn = document.getElementById('checkoutBtn');
    btn.disabled = true;
    btn.textContent = 'جاري الحفظ...';

    const items = state.cart.map(i => ({
        name: i.name,
        price: i.price,
        qty: i.qty,
        total: i.price * i.qty,
        note: (i.note || '').toString()
    }));

    try {
        const invoiceNumber = await getNextInvoiceNumber();
        const { addDoc, collection } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");

        const invRef = await addDoc(collection(db, "invoices"), {
            invoiceNumber: invoiceNumber,
            items: items,
            subTotal: calc.subTotal,
            discountPercent: calc.discountPercent,
            discountAmount: calc.discountAmount,
            deliveryFee: calc.deliveryFee,
            total: calc.finalTotal,
            paidAmount: calc.paidAmount,
            change: calc.remaining,
            paymentMethod: state.cartPaymentMethod,
            itemCount: state.cart.reduce((s, i) => s + i.qty, 0),
            cashierId: state.currentUser.uid,
            cashierName: state.userData?.fullName || state.currentUser.email,
            createdAt: serverTimestamp()
        });

        showInvoice(invRef.id, invoiceNumber, items, calc);

        // Clear cart
        state.cart = [];
        document.getElementById('discountPercent').value = 0;
        document.getElementById('summaryDeliveryFee').value = 0;
        document.getElementById('summaryPaid').value = 0;
        renderCart();

        // Reload stats
        const { loadStats } = await import('./dashboard.js');
        loadStats();

        btn.textContent = 'إتمام البيع وطباعة';
    } catch (e) {
        alert('خطأ: ' + e.message);
        btn.disabled = false;
        btn.textContent = 'إتمام البيع وطباعة';
    }
}
