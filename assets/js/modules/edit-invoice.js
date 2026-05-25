// ============================================
// BARON POS - Edit Invoice Module
// ============================================

import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from '../firebase-config.js';
import { state } from '../utils/state.js';
import { allProducts } from './pos.js';

let currentEditInvoice = null;
let currentEditItems = [];

export async function openEditInvoiceModal(id) {
    if (!state.requirePerm('invoices_edit', 'تعديل الفواتير')) return;

    const d = await getDoc(doc(db, "invoices", id));
    if (!d.exists()) { alert('الفاتورة غير موجودة'); return; }

    currentEditInvoice = { id: d.id, ...d.data() };
    currentEditItems = JSON.parse(JSON.stringify(currentEditInvoice.items || []));

    document.getElementById('editInvoiceId').value = d.id;
    document.getElementById('editInvoiceNum').value = '#' + (currentEditInvoice.invoiceNumber || d.id.slice(-6));
    document.getElementById('editInvoiceDate').value = currentEditInvoice.createdAt
        ? new Date(currentEditInvoice.createdAt.toDate()).toLocaleString('ar-EG')
        : '-';
    document.getElementById('editInvoiceDiscount').value = currentEditInvoice.discountPercent || 0;
    document.getElementById('editInvoiceDelivery').value = currentEditInvoice.deliveryFee || 0;
    document.getElementById('editInvoiceReason').value = '';
    document.getElementById('editInvoiceNote').value = '';

    renderEditInvoiceItems();
    recalcEditInvoice();
    document.getElementById('editInvoiceModal').classList.add('show');
}

export function closeEditInvoiceModal() {
    document.getElementById('editInvoiceModal').classList.remove('show');
    currentEditInvoice = null;
    currentEditItems = [];
}

function renderEditInvoiceItems() {
    const tbody = document.getElementById('editInvoiceItemsBody');
    if (currentEditItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty"><i class="fas fa-box-open"></i><p>لا توجد عناصر</p></td></tr>';
        return;
    }

    let html = '';
    currentEditItems.forEach((item, idx) => {
        const note = item.note || '';
        html += `<tr>
            <td><strong>${item.name}</strong></td>
            <td>${item.price} ج.م</td>
            <td>
                <div class="cart-qty" style="margin:0;">
                    <button onclick="changeEditItemQty(${idx}, -1)">−</button>
                    <span>${item.qty}</span>
                    <button onclick="changeEditItemQty(${idx}, 1)">+</button>
                </div>
            </td>
            <td style="font-weight:800;">${item.price * item.qty} ج.م</td>
            <td style="font-size:12px;color:#888;">${note ? '<i class="fas fa-sticky-note" style="color:var(--warning);"></i> ' + note : '-'}</td>
            <td><button class="btn btn-red" style="padding:4px 10px;font-size:12px;" onclick="removeEditItem(${idx})" title="حذف"><i class="fas fa-trash"></i></button></td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

export function changeEditItemQty(idx, delta) {
    if (!currentEditItems[idx]) return;
    currentEditItems[idx].qty += delta;
    if (currentEditItems[idx].qty <= 0) {
        if (confirm('الكمية صارت صفر. هل تريد حذف المنتج من الفاتورة؟')) {
            currentEditItems.splice(idx, 1);
        } else {
            currentEditItems[idx].qty = 1;
        }
    }
    renderEditInvoiceItems();
    recalcEditInvoice();
}

export function removeEditItem(idx) {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج من الفاتورة؟')) return;
    currentEditItems.splice(idx, 1);
    renderEditInvoiceItems();
    recalcEditInvoice();
}

export function recalcEditInvoice() {
    const subTotal = currentEditItems.reduce((s, i) => s + (i.price * i.qty), 0);
    const discountPercent = parseFloat(document.getElementById('editInvoiceDiscount').value) || 0;
    const discountAmount = Math.round((subTotal * discountPercent) / 100);
    const deliveryFee = parseFloat(document.getElementById('editInvoiceDelivery').value) || 0;
    const total = Math.max(0, subTotal + deliveryFee - discountAmount);

    document.getElementById('editInvoiceSubTotal').textContent = subTotal.toLocaleString('ar-EG') + ' ج.م';
    document.getElementById('editInvoiceDiscountAmt').textContent = discountAmount.toLocaleString('ar-EG') + ' ج.م';
    document.getElementById('editInvoiceTotal').textContent = total.toLocaleString('ar-EG') + ' ج.م';
}

export function openAddProductToInvoice() {
    document.getElementById('addProdToInvModal').classList.add('show');
    document.getElementById('addProdSearch').value = '';
    document.getElementById('addProdResults').innerHTML = '<div class="empty" style="padding:20px;"><i class="fas fa-search" style="font-size:30px;color:#eee;"></i><p>ابحث عن منتج لإضافته</p></div>';
    document.getElementById('addProdSearch').focus();
}

export function closeAddProdToInvModal() {
    document.getElementById('addProdToInvModal').classList.remove('show');
}

export function filterAddProdSearch() {
    const q = document.getElementById('addProdSearch').value.trim().toLowerCase();
    const box = document.getElementById('addProdResults');

    if (!q) {
        box.innerHTML = '<div class="empty" style="padding:20px;"><i class="fas fa-search" style="font-size:30px;color:#eee;"></i><p>ابحث عن منتج لإضافته</p></div>';
        return;
    }

    const filtered = state.allProducts.filter(p => {
        return (p.name || '').toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q);
    });

    if (filtered.length === 0) {
        box.innerHTML = '<div class="empty" style="padding:20px;"><i class="fas fa-times-circle" style="font-size:30px;color:#eee;"></i><p>لا توجد نتائج</p></div>';
        return;
    }

    let html = '';
    filtered.forEach(p => {
        html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid #f0f0f0;cursor:pointer;" onclick="addProductToCurrentEdit('${p.id}')" onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
            <div><strong>${p.name}</strong><div style="font-size:12px;color:#888;">${p.code || ''} - ${p.price} ج.م</div></div>
            <button class="btn btn-main" style="padding:4px 10px;font-size:12px;"><i class="fas fa-plus"></i> إضافة</button>
        </div>`;
    });
    box.innerHTML = html;
}

export function addProductToCurrentEdit(pid) {
    const p = state.allProducts.find(x => x.id === pid);
    if (!p) return;

    const existing = currentEditItems.find(x => x.name === p.name && x.price === p.price);
    if (existing) {
        existing.qty++;
    } else {
        currentEditItems.push({ name: p.name, price: p.price, qty: 1, total: p.price, note: '' });
    }
    renderEditInvoiceItems();
    recalcEditInvoice();
    closeAddProdToInvModal();
}

export async function saveInvoiceEdit() {
    if (!currentEditInvoice) return;
    const reason = document.getElementById('editInvoiceReason').value;
    if (!reason) { alert('اختر سبب التعديل'); document.getElementById('editInvoiceReason').focus(); return; }

    const subTotal = currentEditItems.reduce((s, i) => s + (i.price * i.qty), 0);
    const discountPercent = parseFloat(document.getElementById('editInvoiceDiscount').value) || 0;
    const discountAmount = Math.round((subTotal * discountPercent) / 100);
    const deliveryFee = parseFloat(document.getElementById('editInvoiceDelivery').value) || 0;
    const total = Math.max(0, subTotal + deliveryFee - discountAmount);
    const itemCount = currentEditItems.reduce((s, i) => s + i.qty, 0);
    const noteText = document.getElementById('editInvoiceNote').value.trim();

    const historyEntry = {
        editedAt: new Date().toISOString(),
        editedBy: state.currentUser.uid,
        editedByName: state.userData?.fullName || state.currentUser.email,
        reason: reason,
        note: noteText,
        oldTotal: currentEditInvoice.total || 0,
        newTotal: total,
        oldItemsCount: (currentEditInvoice.items || []).reduce((s, i) => s + (i.qty || 1), 0),
        newItemsCount: itemCount
    };

    const editHistory = currentEditInvoice.editHistory || [];
    editHistory.push(historyEntry);

    try {
        await updateDoc(doc(db, "invoices", currentEditInvoice.id), {
            items: currentEditItems,
            subTotal: subTotal,
            discountPercent: discountPercent,
            discountAmount: discountAmount,
            deliveryFee: deliveryFee,
            total: total,
            itemCount: itemCount,
            editHistory: editHistory,
            lastEditedAt: serverTimestamp(),
            lastEditedBy: state.currentUser.uid
        });
        alert('تم تعديل الفاتورة بنجاح\nالسبب: ' + reason + (noteText ? '\nملاحظة: ' + noteText : ''));
        closeEditInvoiceModal();
        const { loadInvoicesTable } = await import('./invoices.js');
        await loadInvoicesTable();
        const { loadStats } = await import('./dashboard.js');
        await loadStats();
    } catch (e) {
        alert('خطأ في الحفظ: ' + e.message);
    }
}
