// ============================================
// BARON POS - Dashboard Statistics Module
// ============================================

import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from '../firebase-config.js';

export async function loadStats() {
    try {
        const prodSnap = await getDocs(collection(db, "products"));
        document.getElementById('stProducts').textContent = prodSnap.size;

        const invSnap = await getDocs(collection(db, "invoices"));
        document.getElementById('stInvoices').textContent = invSnap.size;

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        let todaySales = 0, todayRevenue = 0;
        invSnap.forEach(d => {
            const inv = d.data();
            if (inv.createdAt && inv.createdAt.toDate) {
                if (inv.createdAt.toDate() >= todayStart) {
                    todaySales++;
                    todayRevenue += inv.total || 0;
                }
            }
        });

        document.getElementById('stSales').textContent = todaySales;
        document.getElementById('stRevenue').textContent = todayRevenue.toLocaleString('ar-EG') + ' ج.م';

        // Update report page stats too
        const repStSales = document.getElementById('repStSales');
        const repStRevenue = document.getElementById('repStRevenue');
        const repStProducts = document.getElementById('repStProducts');
        const repStInvoices = document.getElementById('repStInvoices');

        if (repStSales) repStSales.textContent = todaySales;
        if (repStRevenue) repStRevenue.textContent = todayRevenue.toLocaleString('ar-EG') + ' ج.م';
        if (repStProducts) repStProducts.textContent = prodSnap.size;
        if (repStInvoices) repStInvoices.textContent = invSnap.size;
    } catch (e) {
        console.error('loadStats error:', e);
    }
}
