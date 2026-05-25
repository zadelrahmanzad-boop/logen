// ============================================
// BARON POS - Reports & Analytics Module
// ============================================

import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from '../firebase-config.js';
import { state } from '../utils/state.js';

export async function loadReports() {
    try {
        const fromVal = document.getElementById('reportFrom').value;
        const toVal = document.getElementById('reportTo').value;
        const fromDate = fromVal ? new Date(fromVal) : null;
        const toDate = toVal ? new Date(toVal) : null;
        if (toDate) toDate.setHours(23, 59, 59, 999);

        const snap = await getDocs(collection(db, "invoices"));
        let todayTotal = 0, weekTotal = 0, monthTotal = 0, filteredTotal = 0, filteredCount = 0;
        const now = new Date();
        const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
        const weekStart = new Date(now); weekStart.setDate(weekStart.getDate() - 7);
        const monthStart = new Date(now); monthStart.setDate(1);
        const productSales = {};
        const dailyMap = {};

        snap.forEach(d => {
            const inv = d.data();
            if (!inv.createdAt || !inv.createdAt.toDate) return;
            const date = inv.createdAt.toDate();
            const total = inv.total || 0;

            let inRange = true;
            if (fromDate && date < fromDate) inRange = false;
            if (toDate && date > toDate) inRange = false;

            if (inRange) {
                filteredTotal += total;
                filteredCount++;
                (inv.items || []).forEach(item => {
                    productSales[item.name] = (productSales[item.name] || 0) + (item.qty || 1);
                });
                const dayKey = date.toISOString().split('T')[0];
                if (!dailyMap[dayKey]) dailyMap[dayKey] = { count: 0, total: 0 };
                dailyMap[dayKey].count++;
                dailyMap[dayKey].total += total;
            }

            if (date >= todayStart) todayTotal += total;
            if (date >= weekStart) weekTotal += total;
            if (date >= monthStart) monthTotal += total;
        });

        document.getElementById('repTodaySales').textContent = todayTotal.toLocaleString('ar-EG') + ' ج.م';
        document.getElementById('repWeekSales').textContent = weekTotal.toLocaleString('ar-EG') + ' ج.م';
        document.getElementById('repMonthSales').textContent = monthTotal.toLocaleString('ar-EG') + ' ج.م';

        const topProduct = Object.entries(productSales).sort((a, b) => b[1] - a[1])[0];
        document.getElementById('repTopProduct').textContent = topProduct ? topProduct[0] : '-';

        const dailyBody = document.getElementById('dailyReportBody');
        const sortedDays = Object.entries(dailyMap).sort((a, b) => b[0].localeCompare(a[0]));

        if (sortedDays.length === 0) {
            dailyBody.innerHTML = '<tr><td colspan="4" class="empty"><i class="fas fa-chart-bar"></i><p>لا توجد بيانات في الفترة المحددة</p></td></tr>';
        } else {
            let html = '';
            sortedDays.forEach(([day, data]) => {
                const d = new Date(day);
                html += `<tr>
                    <td>${d.toLocaleDateString('ar-EG')}</td>
                    <td>${data.count}</td>
                    <td style="color:var(--primary);font-weight:800;">${data.total.toLocaleString('ar-EG')} ج.م</td>
                    <td>${Math.round(data.total / data.count).toLocaleString('ar-EG')} ج.م</td>
                </tr>`;
            });
            html += `<tr style="background:#f8f9fa;font-weight:800;border-top:2px solid var(--dark);">
                <td>الإجمالي</td>
                <td>${filteredCount}</td>
                <td style="color:var(--primary);">${filteredTotal.toLocaleString('ar-EG')} ج.م</td>
                <td>${filteredCount > 0 ? Math.round(filteredTotal / filteredCount).toLocaleString('ar-EG') : 0} ج.م</td>
            </tr>`;
            dailyBody.innerHTML = html;
        }

        // Update report page stats
        const prodSnap = await getDocs(collection(db, "products"));
        const invSnap = await getDocs(collection(db, "invoices"));
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

        document.getElementById('repStSales').textContent = todaySales;
        document.getElementById('repStRevenue').textContent = todayRevenue.toLocaleString('ar-EG') + ' ج.م';
        document.getElementById('repStProducts').textContent = prodSnap.size;
        document.getElementById('repStInvoices').textContent = invSnap.size;
    } catch (e) {
        console.error('loadReports error:', e);
    }
}

export function printReports() {
    if (!state.requirePerm('reports_print', 'طباعة التقارير')) return;
    window.print();
}

export function printDayReport() {
    if (!state.requirePerm('reports_print', 'طباعة تقرير اليوم')) return;
    window.print();
}
