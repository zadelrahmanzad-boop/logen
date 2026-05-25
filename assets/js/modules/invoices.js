// ============================================
// BARON POS - Invoices Management Module
// ============================================

import {
    collection, getDocs, doc, getDoc, deleteDoc, setDoc, query, orderBy, limit, serverTimestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from '../firebase-config.js';
import { state } from '../utils/state.js';
import { PAY_LABELS, LOGO_URL } from '../utils/constants.js';

// Load invoices table
export async function loadInvoicesTable() {
    const tbody = document.getElementById('invoicesBody');
    tbody.innerHTML = '<tr><td colspan="10" class="empty"><div class="spin"></div></td></tr>';

    try {
        const q = query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(100));
        const snap = await getDocs(q);

        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty"><i class="fas fa-receipt"></i><p>لا توجد فواتير</p></td></tr>';
            return;
        }

        let html = '';
        snap.forEach(d => {
            const inv = d.data();
            const invNum = inv.invoiceNumber || d.id.slice(-6);
            const date = inv.createdAt ? new Date(inv.createdAt.toDate()).toLocaleString('ar-EG') : '-';
            const payTag = inv.paymentMethod === 'cash' ? 'tag-grn' : inv.paymentMethod === 'visa' ? 'tag-blu' : 'tag-ylw';

            let viewBtn = '', editBtn = '', printBtn = '', deleteBtn = '';
            if (state.isAdmin || state.checkPerm('invoices_view')) {
                viewBtn = `<button class="btn btn-sec" onclick="viewInvoice('${d.id}')" style="padding:5px 10px;" title="عرض"><i class="fas fa-eye"></i></button>`;
            }
            if (state.isAdmin || state.checkPerm('invoices_edit')) {
                editBtn = ` <button class="btn btn-warn" onclick="openEditInvoiceModal('${d.id}')" style="padding:5px 10px;" title="تعديل"><i class="fas fa-edit"></i></button>`;
            }
            if (state.isAdmin || state.checkPerm('invoices_print')) {
                printBtn = ` <button class="btn btn-blu" onclick="printInvoiceFromTable('${d.id}')" style="padding:5px 10px;" title="طباعة"><i class="fas fa-print"></i></button>`;
            }
            if (state.isAdmin || state.checkPerm('invoices_delete')) {
                deleteBtn = ` <button class="btn btn-red" onclick="deleteInvoice('${d.id}')" style="padding:5px 10px;" title="حذف"><i class="fas fa-trash"></i></button>`;
            }

            html += `<tr>
                <td style="text-align:center;"><input type="checkbox" class="inv-select" value="${d.id}"></td>
                <td><strong>#${invNum}</strong></td>
                <td>${date}</td>
                <td>${inv.itemCount || 0} عنصر</td>
                <td style="color:var(--primary);font-weight:800;">${inv.subTotal || inv.total || 0} ج.م</td>
                <td>${inv.deliveryFee || 0} ج.م</td>
                <td style="color:var(--success);">${inv.discountAmount || 0} ج.م</td>
                <td style="font-weight:800;">${inv.total || 0} ج.م</td>
                <td><span class="tag ${payTag}">${PAY_LABELS[inv.paymentMethod] || inv.paymentMethod}</span></td>
                <td>${inv.cashierName || '-'}</td>
                <td><div style="display:flex;gap:4px;flex-wrap:wrap;">${viewBtn}${editBtn}${printBtn}${deleteBtn}</div></td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty">خطأ</td></tr>';
    }
}

// View invoice
export async function viewInvoice(id) {
    const d = await getDoc(doc(db, "invoices", id));
    if (!d.exists()) return;
    const inv = d.data();
    const calc = {
        subTotal: inv.subTotal || inv.total || 0,
        discountPercent: inv.discountPercent || 0,
        discountAmount: inv.discountAmount || 0,
        deliveryFee: inv.deliveryFee || 0,
        finalTotal: inv.total || 0,
        paidAmount: inv.paidAmount || 0,
        remaining: inv.change || 0
    };
    state.cartPaymentMethod = inv.paymentMethod || 'cash';
    showInvoice(d.id, inv.invoiceNumber || d.id.slice(-6), inv.items || [], calc);
}

// Delete invoice
export async function deleteInvoice(id) {
    if (!state.requirePerm('invoices_delete', 'حذف الفواتير')) return;
    if (!confirm('هل أنت متأكد من حذف الفاتورة؟')) return;

    await deleteDoc(doc(db, "invoices", id));
    await loadInvoicesTable();
    const { loadStats } = await import('./dashboard.js');
    await loadStats();
}

// Show invoice modal
export function showInvoice(invId, invoiceNumber, items, calc) {
    const modal = document.getElementById('invoiceModal');
    const box = document.getElementById('invoiceDetailContent');
    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-EG');
    const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const payMethodLabel = PAY_LABELS[state.cartPaymentMethod] || state.cartPaymentMethod;

    let rows = '';
    items.forEach(i => {
        const noteText = (i.note || '').toString().trim();
        let noteRow = '';
        if (noteText) {
            const noteLines = noteText.split(/\n|\r/).map(l => l.trim()).filter(l => l);
            if (noteLines.length > 0) {
                const noteHtml = noteLines.map(line => `<div>${line}</div>`).join('');
                noteRow = `<tr class="note-row"><td colspan="4"><i class="fas fa-sticky-note" style="color:#d68910;margin-left:4px;"></i> ${noteHtml}</td></tr>`;
            }
        }
        rows += `<tr><td>${i.name}</td><td>${i.qty}</td><td>${i.price}</td><td>${i.total.toLocaleString('en-US')}</td></tr>${noteRow}`;
    });

    const invoiceHTML = `
    <div class="invoice-print-wrap" id="printInvoice">
        <div class="inv-header">
            <div class="logo-text">BARON</div>
            <div class="sub-text">DONE WITH LOVE</div>
            <div class="inv-logo">
                <img src="${LOGO_URL}" alt="BARON" onerror="this.style.display='none'" style="width:100%;max-width:58mm;height:auto;margin:2px auto;display:block;">
            </div>
        </div>
        <div class="inv-meta">
            <strong>فاتورة: ${invoiceNumber}</strong><br>
            ${timeStr} ص<br>
            ${dateStr}<br>
            كاشير: ${state.userData?.fullName || state.currentUser?.email || '-'}
        </div>
        <table class="inv-table">
            <thead><tr><th>اسم الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="inv-footer-box">
            <div class="f-row"><span class="lbl">حساب الدفع عن طريق: ${payMethodLabel}</span><span class="val"></span></div>
            <div class="f-row"><span class="lbl">المدفوع:</span><span class="val">${calc.paidAmount.toLocaleString('en-US')}</span></div>
            <div class="f-row"><span class="lbl">خصم %:</span><span class="val">${calc.discountPercent}%</span></div>
            <div class="f-row"><span class="lbl">الخصم:</span><span class="val">${calc.discountAmount.toLocaleString('en-US')}</span></div>
            <div class="f-row"><span class="lbl">المتبقي:</span><span class="val">${calc.remaining.toLocaleString('en-US')}</span></div>
            <div class="f-row"><span class="lbl">ديليفري:</span><span class="val">${calc.deliveryFee.toLocaleString('en-US')}</span></div>
            <div class="f-row total-row"><span class="lbl">المجموع:</span><span class="val">${calc.finalTotal.toLocaleString('en-US')}</span></div>
        </div>
        <div class="inv-phone">خدمه التوصيل : 01070004717</div>
        <div class="inv-thanks">شكراً لزيارتكم - BARON</div>
    </div>`;

    box.innerHTML = invoiceHTML + `
    <div class="no-print" style="text-align:center;margin-top:15px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-gry" onclick="closeInvoiceModal()">إغلاق</button>
        <button class="btn btn-blu" onclick="printInvoiceFromModal()"><i class="fas fa-print"></i> طباعة</button>
        <button class="btn btn-drk" onclick="printInvoiceDoubleFromModal()"><i class="fas fa-copy"></i> طباعة نسختين</button>
    </div>`;
    modal.classList.add('show');
}

// Print invoice from modal
export async function printInvoiceFromModal() {
    if (!state.requirePerm('invoices_print', 'طباعة الفواتير')) return;

    const allInvs = await getDocs(query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(1)));
    allInvs.forEach(d => {
        setDoc(doc(db, "invoices", d.id), { printed: true, printedAt: serverTimestamp(), copies: 1 }, { merge: true });
    });
    window.print();
}

// Print double from modal
export async function printInvoiceDoubleFromModal() {
    if (!state.requirePerm('invoices_print', 'طباعة الفواتير')) return;

    const wrap = document.getElementById('printInvoice');
    if (!wrap) return;

    const clone = wrap.cloneNode(true);
    const separator = document.createElement('div');
    separator.innerHTML = '<div style="border-top:2px dashed #333;margin:15px 0;text-align:center;font-size:10px;color:#888;padding:5px;">--- نسخة ثانية ---</div>';
    wrap.parentNode.insertBefore(separator, wrap.nextSibling);
    wrap.parentNode.insertBefore(clone, separator.nextSibling);

    const allInvs = await getDocs(query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(1)));
    allInvs.forEach(d => {
        setDoc(doc(db, "invoices", d.id), { printed: true, printedAt: serverTimestamp(), copies: 2 }, { merge: true });
    });

    setTimeout(() => {
        window.print();
        setTimeout(() => { separator.remove(); clone.remove(); }, 1000);
    }, 300);
}

// Print invoice from table
export async function printInvoiceFromTable(id) {
    if (!state.requirePerm('invoices_print', 'طباعة الفواتير')) return;

    const d = await getDoc(doc(db, "invoices", id));
    if (!d.exists()) return;
    const inv = d.data();
    const calc = {
        subTotal: inv.subTotal || inv.total || 0,
        discountPercent: inv.discountPercent || 0,
        discountAmount: inv.discountAmount || 0,
        deliveryFee: inv.deliveryFee || 0,
        finalTotal: inv.total || 0,
        paidAmount: inv.paidAmount || 0,
        remaining: inv.change || 0
    };
    state.cartPaymentMethod = inv.paymentMethod || 'cash';
    showInvoice(d.id, inv.invoiceNumber || d.id.slice(-6), inv.items || [], calc);

    setTimeout(() => {
        window.print();
        setDoc(doc(db, "invoices", id), { printed: true, printedAt: serverTimestamp() }, { merge: true });
    }, 600);
}

// Close invoice modal
export function closeInvoiceModal() {
    document.getElementById('invoiceModal').classList.remove('show');
}

// Reset invoice counter
export async function resetInvoiceCounter() {
    if (!state.isAdmin) { alert('للمدير فقط'); return; }
    if (!state.requirePerm('settings_edit', 'إعادة ترقيم الفواتير')) return;
    if (!confirm('هل أنت متأكد من إعادة ترقيم الفواتير من 1؟')) return;

    try {
        await setDoc(doc(db, "settings", "invoiceCounter"), {
            value: 0,
            resetAt: serverTimestamp(),
            resetBy: state.currentUser.uid
        });
        alert('تم إعادة ضبط الترقيم. الفاتورة القادمة ستكون رقم 1.');
    } catch (e) {
        alert('خطأ: ' + e.message);
    }
}

// Bulk actions
export function toggleSelectAllInvoices() {
    const topCb = document.getElementById('selectAllInvTop');
    const headerCb = document.getElementById('selectAllInv');
    let checked;

    if (event && event.target) {
        checked = event.target.checked;
        if (event.target === topCb && headerCb) headerCb.checked = checked;
        else if (event.target === headerCb && topCb) topCb.checked = checked;
    } else {
        checked = topCb ? topCb.checked : (headerCb ? headerCb.checked : false);
    }

    document.querySelectorAll('.inv-select').forEach(cb => cb.checked = checked);
}

export function getSelectedInvoices() {
    return Array.from(document.querySelectorAll('.inv-select:checked')).map(cb => cb.value);
}

export async function printSelectedInvoices() {
    const ids = getSelectedInvoices();
    if (ids.length === 0) { alert('اختر فواتير أولاً'); return; }
    if (!state.requirePerm('invoices_print', 'طباعة الفواتير')) return;

    for (const id of ids) {
        await printInvoiceFromTable(id);
        await new Promise(r => setTimeout(r, 1200));
    }
}

export async function deleteSelectedInvoices() {
    const ids = getSelectedInvoices();
    if (ids.length === 0) { alert('اختر فواتير أولاً'); return; }
    if (!state.requirePerm('invoices_delete', 'حذف الفواتير')) return;
    if (!confirm(`هل أنت متأكد من حذف ${ids.length} فاتورة؟`)) return;

    for (const id of ids) await deleteDoc(doc(db, "invoices", id));
    await loadInvoicesTable();
    const { loadStats } = await import('./dashboard.js');
    await loadStats();
}

export async function exportSelectedToPDF() {
    if (!state.requirePerm('invoices_view', 'تصدير الفواتير')) return;
    const ids = getSelectedInvoices();
    if (ids.length === 0) { alert('اختر فواتير أولاً'); return; }

    const invoices = [];
    for (const id of ids) {
        const d = await getDoc(doc(db, "invoices", id));
        if (d.exists()) invoices.push({ id: d.id, ...d.data() });
    }
    if (invoices.length === 0) return;

    const rows = invoices.map((inv, idx) => {
        const date = inv.createdAt ? new Date(inv.createdAt.toDate()).toLocaleString('ar-EG') : '-';
        return `<tr>
            <td>${idx + 1}</td>
            <td>#${inv.invoiceNumber || inv.id.slice(-6)}</td>
            <td>${date}</td>
            <td>${inv.itemCount || 0}</td>
            <td>${inv.total || 0} ج.م</td>
            <td>${inv.cashierName || '-'}</td>
        </tr>`;
    }).join('');

    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html>
    <html lang="ar" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>فواتير BARON</title>
        <style>
            @page { size: A4; margin: 15mm; }
            body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 20px; }
            h2 { text-align: center; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background: #1a1a2e; color: white; padding: 10px; text-align: right; }
            td { padding: 10px; border-bottom: 1px solid #ddd; text-align: right; }
            tr:nth-child(even) { background: #f8f9fa; }
            .summary { margin-top: 20px; text-align: left; font-size: 18px; font-weight: bold; }
        </style>
    </head>
    <body>
        <h2>تقرير الفواتير المحددة - BARON POS</h2>
        <p>تاريخ التصدير: ${new Date().toLocaleString('ar-EG')}</p>
        <p>عدد الفواتير: ${invoices.length}</p>
        <table>
            <thead><tr><th>#</th><th>رقم الفاتورة</th><th>التاريخ</th><th>العناصر</th><th>الإجمالي</th><th>الكاشير</th></tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="summary">الإجمالي الكلي: ${invoices.reduce((s, i) => s + (i.total || 0), 0).toLocaleString('ar-EG')} ج.م</div>
    </body>
    </html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 600);
}
