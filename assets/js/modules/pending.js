// ============================================
// BARON POS - Pending Invoices Module
// ============================================
// FIXED: Removed orderBy from non-admin queries to avoid Firestore index requirement
// Now uses client-side sorting instead of server-side ordering

import {
    collection, getDocs, doc, getDoc, deleteDoc, addDoc, query,
    where, orderBy, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from '../firebase-config.js';
import { state } from '../utils/state.js';
import { showInvoice } from './invoices.js';

// Listen to pending badge updates
export function listenPendingBadge() {
    if (!state.currentUser) return;

    // For admin: listen to ALL pending invoices
    // For users: listen to their own pending invoices only
    let q;
    if (state.isAdmin) {
        q = query(collection(db, "pending_invoices"), orderBy("createdAt", "desc"));
    } else {
        // FIXED: Use simple where without orderBy to avoid composite index requirement
        // Sorting is done client-side after fetching
        q = query(collection(db, "pending_invoices"), where("cashierId", "==", state.currentUser.uid));
    }

    state.pendingUnsub = onSnapshot(q, (snap) => {
        const count = snap.size;
        const badge = document.getElementById('pendingBadge');
        if (badge) {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }
    }, (error) => {
        console.error('Pending badge listener error:', error);
        // Silently fail - badge will just not update in real-time
    });
}

// Load pending invoices table
export async function loadPendingInvoices() {
    const tbody = document.getElementById('pendingBody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty"><div class="spin"></div></td></tr>';

    try {
        let invoices = [];

        if (state.isAdmin) {
            // Admin: can use orderBy (index exists or will be auto-created for admin)
            const q = query(collection(db, "pending_invoices"), orderBy("createdAt", "desc"));
            const snap = await getDocs(q);
            snap.forEach(d => invoices.push({ id: d.id, ...d.data() }));
        } else {
            // FIXED: Non-admin users - use simple where query without orderBy
            // This avoids the composite index requirement!
            const q = query(
                collection(db, "pending_invoices"),
                where("cashierId", "==", state.currentUser.uid)
            );
            const snap = await getDocs(q);
            snap.forEach(d => invoices.push({ id: d.id, ...d.data() }));

            // Sort client-side by createdAt descending
            invoices.sort((a, b) => {
                const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                return bTime - aTime;
            });
        }

        if (invoices.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty"><i class="fas fa-pause-circle"></i><p>لا توجد فواتير معلقة</p></td></tr>';
            return;
        }

        let html = '';
        invoices.forEach((p, idx) => {
            const date = p.createdAt?.toDate
                ? new Date(p.createdAt.toDate()).toLocaleString('ar-EG')
                : '-';
            const itemCount = p.items ? p.items.reduce((s, i) => s + (i.qty || 1), 0) : 0;

            html += `<tr>
                <td>${idx + 1}</td>
                <td>${date}</td>
                <td>${itemCount} عنصر</td>
                <td style="font-weight:800;color:var(--primary);">${p.total || 0} ج.م</td>
                <td>${p.cashierName || '-'}</td>
                <td>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                        <button class="btn btn-grn" onclick="resumePendingInvoice('${p.id}')" style="padding:5px 10px;"><i class="fas fa-play"></i> استعادة</button>
                        <button class="btn btn-blu" onclick="printPendingInvoice('${p.id}')" style="padding:5px 10px;"><i class="fas fa-print"></i> طباعة</button>
                        <button class="btn btn-red" onclick="deletePendingInvoice('${p.id}')" style="padding:5px 10px;"><i class="fas fa-trash"></i> حذف</button>
                    </div>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (e) {
        console.error('loadPendingInvoices error:', e);
        tbody.innerHTML = `<tr><td colspan="6" class="empty"><i class="fas fa-exclamation-circle"></i><p>خطأ في تحميل الفواتير المعلقة</p><p style="font-size:12px;color:#888;">${e.message}</p></td></tr>`;
    }
}

// Hold current invoice
export async function holdInvoice() {
    if (!state.requirePerm('pending_resume', 'تعليق الفاتورة')) return;
    if (state.cart.length === 0) return;
    if (state.isMonitorOnly) { alert('وضع المتابعة فقط - لا يمكن التعليق'); return; }

    const calc = state.getCartCalculations();
    const items = state.cart.map(i => ({
        name: i.name,
        price: i.price,
        qty: i.qty,
        total: i.price * i.qty,
        note: (i.note || '').toString()
    }));

    try {
        await addDoc(collection(db, "pending_invoices"), {
            items,
            subTotal: calc.subTotal,
            discountPercent: calc.discountPercent,
            discountAmount: calc.discountAmount,
            deliveryFee: calc.deliveryFee,
            total: calc.finalTotal,
            paidAmount: calc.paidAmount,
            remaining: calc.remaining,
            paymentMethod: state.cartPaymentMethod,
            cashierId: state.currentUser.uid,
            cashierName: state.userData?.fullName || state.currentUser.email,
            createdAt: serverTimestamp()
        });

        // Clear cart
        state.cart = [];
        document.getElementById('discountPercent').value = 0;
        document.getElementById('summaryDeliveryFee').value = 0;
        document.getElementById('summaryPaid').value = 0;

        // Re-render cart
        const { renderCart } = await import('./pos.js');
        renderCart();

        alert('تم تعليق الفاتورة بنجاح');
    } catch (e) {
        alert('خطأ: ' + e.message);
    }
}

// Resume pending invoice
export async function resumePendingInvoice(id) {
    if (!state.requirePerm('pending_resume', 'استعادة فاتورة معلقة')) return;

    try {
        const d = await getDoc(doc(db, "pending_invoices", id));
        if (!d.exists()) return;
        const p = d.data();

        // Load into cart
        state.cart = (p.items || []).map(i => ({
            id: 'pending_' + Math.random().toString(36).substr(2, 9),
            name: i.name,
            price: i.price,
            qty: i.qty,
            note: i.note || ''
        }));

        document.getElementById('discountPercent').value = p.discountPercent || 0;
        document.getElementById('summaryDeliveryFee').value = p.deliveryFee || 0;
        document.getElementById('summaryPaid').value = p.paidAmount || 0;

        // Update payment method
        const { selectCartPayment } = await import('./pos.js');
        selectCartPayment(p.paymentMethod || 'cash');

        // Render
        const { renderCart } = await import('./pos.js');
        renderCart();

        // Delete from pending
        await deleteDoc(doc(db, "pending_invoices", id));

        // Close modal
        document.getElementById('pendingModal').classList.remove('show');
        alert('تم استعادة الفاتورة إلى السلة');
    } catch (e) {
        alert('خطأ: ' + e.message);
    }
}

// Print pending invoice
export async function printPendingInvoice(id) {
    if (!state.requirePerm('invoices_print', 'طباعة الفاتورة المعلقة')) return;

    try {
        const d = await getDoc(doc(db, "pending_invoices", id));
        if (!d.exists()) return;
        const p = d.data();

        const calc = {
            subTotal: p.subTotal || 0,
            discountPercent: p.discountPercent || 0,
            discountAmount: p.discountAmount || 0,
            deliveryFee: p.deliveryFee || 0,
            finalTotal: p.total || 0,
            paidAmount: p.paidAmount || 0,
            remaining: p.remaining || 0
        };

        state.cartPaymentMethod = p.paymentMethod || 'cash';
        showInvoice(d.id, 'معلق-' + d.id.slice(-4), p.items || [], calc);
    } catch (e) {
        alert('خطأ: ' + e.message);
    }
}

// Delete pending invoice
export async function deletePendingInvoice(id) {
    if (!state.requirePerm('pending_delete', 'حذف فاتورة معلقة')) return;
    if (!confirm('هل أنت متأكد من حذف الفاتورة المعلقة؟')) return;

    try {
        await deleteDoc(doc(db, "pending_invoices", id));
        await loadPendingInvoices();
    } catch (e) {
        alert('خطأ: ' + e.message);
    }
}
