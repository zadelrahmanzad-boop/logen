.data();
    const calc = {
        subTotal: inv.subTotal || inv.total || 0,
        discountPercent: inv.discountPercent || 0,
        discountAmount: inv.discountAmount || 0,
        deliveryFee: inv.deliveryFee || 0,
        finalTotal: inv.total || 0,
        paidAmount: inv.paidAmount || 0,
        remaining: inv.change || 0
    };
    cartPaymentMethod = inv.paymentMethod || 'cash';
    showInvoice(d.id, inv.invoiceNumber || d.id.slice(-6), inv.items || [], calc);
}

async function deleteInvoice(id) {
    if (!requirePerm('invoices_delete', 'حذف الفواتير')) return;
    if (!confirm('هل أنت متأكد من حذف الفاتورة؟')) return;
    await deleteDoc(doc(db, "invoices", id));
    loadInvoicesTable(); loadStats();
}

// ✅ FIX: Reset invoice counter now available to all users with settings_edit permission
async function resetInvoiceCounter() {
    if (!requirePerm('settings_edit', 'إعادة ترقيم الفواتير')) return;
    if (!confirm('هل أنت متأكد من إعادة ترقيم الفواتير من 1؟')) return;
    try {
        await setDoc(doc(db, "settings", "invoiceCounter"), { 
            value: 0, 
            resetAt: serverTimestamp(), 
            resetBy: currentUser.uid 
        });
        alert('تم إعادة ضبط الترقيم. الفاتورة القادمة ستكون رقم 1.');
    } catch (e) { alert('خطأ: ' + e.message); }
}

function printDayReport() {
    if (!requirePerm('reports_print', 'طباعة تقرير اليوم')) return;
    window.print();
}

function printReports() {
    if (!requirePerm('reports_print', 'طباعة التقارير')) return;
    window.print();
}

function printLoginLog() { window.print(); }

// ==================== BULK INVOICE ACTIONS ====================
function toggleSelectAllInvoices() {
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

function getSelectedInvoices() {
    return Array.from(document.querySelectorAll('.inv-select:checked')).map(cb => cb.value);
}

async function printSelectedInvoices() {
    const ids = getSelectedInvoices();
    if (ids.length === 0) { alert('اختر فواتير أولاً'); return; }
    if (!requirePerm('invoices_print', 'طباعة الفواتير')) return;
    for (const id of ids) {
        await printInvoiceFromTable(id);
        await new Promise(r => setTimeout(r, 1200));
    }
}

async function deleteSelectedInvoices() {
    const ids = getSelectedInvoices();
    if (ids.length === 0) { alert('اختر فواتير أولاً'); return; }
    if (!requirePerm('invoices_delete', 'حذف الفواتير')) return;
    if (!confirm(`هل أنت متأكد من حذف ${ids.length} فاتورة؟`)) return;
    for (const id of ids) await deleteDoc(doc(db, "invoices", id));
    loadInvoicesTable(); loadStats();
}

async function exportSelectedToPDF() {
    if (!requirePerm('invoices_view', 'تصدير الفواتير')) return;
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
            <thead>
                <tr><th>#</th><th>رقم الفاتورة</th><th>التاريخ</th><th>العناصر</th><th>الإجمالي</th><th>الكاشير</th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <div class="summary">الإجمالي الكلي: ${invoices.reduce((s, i) => s + (i.total || 0), 0).toLocaleString('ar-EG')} ج.م</div>
    </body>
    </html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 600);
}

// ==================== REPORTS ====================
async function loadReports() {
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
                (inv.items || []).forEach(item => { productSales[item.name] = (productSales[item.name] || 0) + (item.qty || 1); });
                const dayKey = date.toISOString().split('T')[0];
                if (!dailyMap[dayKey]) dailyMap[dayKey] = { count: 0, total: 0 };
                dailyMap[dayKey].count++; dailyMap[dayKey].total += total;
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
                html += `<tr><td>${d.toLocaleDateString('ar-EG')}</td><td>${data.count}</td><td style="color:var(--primary);font-weight:800;">${data.total.toLocaleString('ar-EG')} ج.م</td><td>${Math.round(data.total / data.count).toLocaleString('ar-EG')} ج.م</td></tr>`;
            });
            html += `<tr style="background:#f8f9fa;font-weight:800;border-top:2px solid var(--dark);"><td>الإجمالي</td><td>${filteredCount}</td><td style="color:var(--primary);">${filteredTotal.toLocaleString('ar-EG')} ج.م</td><td>${filteredCount > 0 ? Math.round(filteredTotal / filteredCount).toLocaleString('ar-EG') : 0} ج.م</td></tr>`;
            dailyBody.innerHTML = html;
        }

        // Update stats
        const prodSnap = await getDocs(collection(db, "products"));
        const invSnap = await getDocs(collection(db, "invoices"));
        let todaySales = 0, todayRevenue = 0;
        invSnap.forEach(d => {
            const inv = d.data();
            if (inv.createdAt && inv.createdAt.toDate) {
                if (inv.createdAt.toDate() >= todayStart) { todaySales++; todayRevenue += inv.total || 0; }
            }
        });
        document.getElementById('repStSales').textContent = todaySales;
        document.getElementById('repStRevenue').textContent = todayRevenue.toLocaleString('ar-EG') + ' ج.م';
        document.getElementById('repStProducts').textContent = prodSnap.size;
        document.getElementById('repStInvoices').textContent = invSnap.size;
    } catch (e) { console.error(e); }
}

// ==================== USERS ====================
function switchUserTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
    document.getElementById('panel-users').classList.toggle('hidden', tab !== 'users');
    document.getElementById('panel-log').classList.toggle('hidden', tab !== 'log');
    if (tab === 'log') loadLoginLog();
}

function openUserModal() {
    if (!isAdmin) { alert('للمدير فقط'); return; }
    if (!requirePerm('users_add', 'إضافة مستخدم')) return;
    document.getElementById('userModal').classList.add('show');
    toggleUserDays();
}

function closeUserModal() {
    document.getElementById('userModal').classList.remove('show');
    document.getElementById('userName').value = '';
    document.getElementById('userEmail').value = '';
    document.getElementById('userPass').value = '';
    document.getElementById('userRole').value = 'cashier';
    document.getElementById('userDays').value = '30';
}

function toggleUserDays() {
    const role = document.getElementById('userRole').value;
    if (role === 'admin') {
        document.getElementById('userDaysRow').classList.add('hidden');
        document.getElementById('adminNoteRow').classList.remove('hidden');
    } else {
        document.getElementById('userDaysRow').classList.remove('hidden');
        document.getElementById('adminNoteRow').classList.add('hidden');
    }
}

async function saveUser() {
    if (!isAdmin) { alert('للمدير فقط'); return; }
    if (!requirePerm('users_add', 'إضافة مستخدم')) return;
    const name = document.getElementById('userName').value.trim();
    const email = document.getElementById('userEmail').value.trim();
    const pass = document.getElementById('userPass').value;
    const role = document.getElementById('userRole').value;
    const days = parseInt(document.getElementById('userDays').value);
    if (!name || !email || !pass) { alert('املأ جميع الحقول'); return; }
    if (pass.length < 6) { alert('كلمة المرور ضعيفة'); return; }
    if (role !== 'admin' && (!days || days < 1)) { alert('حدد عدد أيام'); return; }
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const perms = role === 'admin' ? { pos: true, products: true, invoices: true, reports: true, users: true, settings: true, change_password: true, monitor_only: false } : { ...DEFAULT_PERMS };
        const udata = { email, fullName: name, role, status: "active", permissions: perms, isLoggedIn: false, createdAt: serverTimestamp(), lastLogin: serverTimestamp(), createdBy: currentUser.uid };
        if (role !== 'admin') { const exp = new Date(Date.now() + days * 24 * 60 * 60 * 1000); udata.daysActivated = days; udata.expiresAt = exp; }
        await setDoc(doc(db, "users", cred.user.uid), udata);
        alert('تم إنشاء المستخدم');
        closeUserModal(); loadUsersTable(); loadStats();
    } catch (err) { alert(err.code === 'auth/email-already-in-use' ? 'البريد مستخدم' : err.message); }
}

async function openEditUserModal(uid) {
    if (!isAdmin) { alert('للمدير فقط'); return; }
    if (!requirePerm('users_edit', 'تعديل مستخدم')) return;
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
}

function closeEditUserModal() {
    document.getElementById('editUserModal').classList.remove('show');
    document.getElementById('editUserId').value = '';
}

function toggleEditUserDays() {
    const role = document.getElementById('editUserRole').value;
    if (role === 'admin') {
        document.getElementById('editUserDaysRow').classList.add('hidden');
        document.getElementById('editAdminNoteRow').classList.remove('hidden');
    } else {
        document.getElementById('editUserDaysRow').classList.remove('hidden');
        document.getElementById('editAdminNoteRow').classList.add('hidden');
    }
}

function togglePerm(el) {
    const cb = el.querySelector('input[type="checkbox"]');
    cb.checked = !cb.checked;
    el.classList.toggle('active', cb.checked);
}

async function updateUser() {
    if (!isAdmin) { alert('للمدير فقط'); return; }
    if (!requirePerm('users_edit', 'تعديل مستخدم')) return;
    const uid = document.getElementById('editUserId').value;
    if (!uid) return;
    const name = document.getElementById('editUserName').value.trim();
    const role = document.getElementById('editUserRole').value;
    const status = document.getElementById('editUserStatus').value;
    const days = parseInt(document.getElementById('editUserDays').value);
    if (!name) { alert('الاسم مطلوب'); return; }

    const perms = {};
    document.querySelectorAll('#editUserPerms input[type="checkbox"]').forEach(cb => { 
        perms[cb.value] = cb.checked; 
    });
    const cpCb = document.getElementById('perm_change_password');
    if (cpCb) perms.change_password = cpCb.checked;

    const updates = { 
        fullName: name, 
        role: role, 
        status: status, 
        permissions: perms, 
        updatedAt: serverTimestamp(), 
        updatedBy: currentUser.uid 
    };

    if (role !== 'admin') {
        if (!days || days < 1) { alert('حدد عدد أيام'); return; }
        const newExp = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
        updates.expiresAt = newExp; 
        updates.daysActivated = days;
    } else { 
        updates.expiresAt = null; 
        updates.daysActivated = null; 
    }

    try {
        await setDoc(doc(db, "users", uid), updates, { merge: true });
        alert('تم تحديث المستخدم بنجاح');
        closeEditUserModal(); 
        loadUsersTable();
    } catch (e) { 
        alert('خطأ: ' + e.message); 
        console.error(e);
    }
}

async function toggleUserStatus(uid, currentStatus) {
    if (!isAdmin) { alert('للمدير فقط'); return; }
    if (!requirePerm('users_edit', 'تعديل حالة المستخدم')) return;
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    const action = newStatus === 'active' ? 'تفعيل' : 'تعطيل';
    if (!confirm(`هل تريد ${action} هذا الحساب؟`)) return;
    try {
        await setDoc(doc(db, "users", uid), { status: newStatus, statusUpdatedAt: serverTimestamp(), statusUpdatedBy: currentUser.uid }, { merge: true });
        loadUsersTable();
    } catch (e) { alert('خطأ: ' + e.message); }
}

async function loadUsersTable() {
    const tbody = document.getElementById('usersBody');
    tbody.innerHTML = '<tr><td colspan="11" class="empty"><div class="spin"></div></td></tr>';
    try {
        const snap = await getDocs(collection(db, "users"));
        if (snap.empty) { tbody.innerHTML = '<tr><td colspan="11" class="empty"><i class="fas fa-users"></i><p>لا يوجد مستخدمين</p></td></tr>'; return; }
        let html = '', count = 0;
        const now = new Date();

        const logSnap = await getDocs(collection(db, "login_log"));
        const userHours = {};
        logSnap.forEach(ld => {
            const l = ld.data();
            if (!l.userId || !l.loginAt || !l.loginAt.toDate) return;
            const loginTime = l.loginAt.toDate();
            const logoutTime = l.logoutAt && l.logoutAt.toDate ? l.logoutAt.toDate() : null;
            const duration = logoutTime ? (logoutTime - loginTime) / (1000 * 60 * 60) : 0;
            if (!userHours[l.userId]) userHours[l.userId] = 0;
            userHours[l.userId] += duration;
        });

        snap.forEach(d => {
            count++;
            const u = d.data();
            const created = u.createdAt ? new Date(u.createdAt.toDate()).toLocaleDateString('ar-EG') : '-';
            const isAdminUser = u.role === 'admin';
            let daysBadge = '', isExpired = false;
            if (isAdminUser) daysBadge = '<span class="tag tag-prp">دائم</span>';
            else if (u.expiresAt && u.expiresAt.toDate) {
                const ex = u.expiresAt.toDate();
                const dl = Math.ceil((ex - now) / (1000 * 60 * 60 * 24));
                if (dl < 0) { isExpired = true; daysBadge = '<span class="days-left days-red">منتهي</span>'; }
                else if (dl <= 3) daysBadge = `<span class="days-left days-red">${dl} يوم</span>`;
                else if (dl <= 7) daysBadge = `<span class="days-left days-ylw">${dl} يوم</span>`;
                else daysBadge = `<span class="days-left days-grn">${dl} يوم</span>`;
            } else daysBadge = '<span class="tag tag-blu">غير محدد</span>';

            let onlineStatus = '<span class="offline-dot"></span>غير متصل';
            if (u.lastSeen && u.lastSeen.toDate) {
                const diffMin = (now - u.lastSeen.toDate()) / (1000 * 60);
                if (diffMin <= 3) onlineStatus = '<span class="online-dot"></span>متصل';
            }

            const isActive = (u.status === 'active' && !isExpired) || isAdminUser;
            const statusTag = isActive ? '<span class="tag tag-grn">نشط</span>' : '<span class="tag tag-red">معطل</span>';
            const roleTag = `<span class="tag tag-blu">${roleName(u.role)}</span>`;

            const perms = u.permissions || DEFAULT_PERMS;
            let permIcons = '';
            Object.entries(PERM_LABELS).forEach(([key, label]) => {
                if (perms[key]) {
                    let tagClass = 'tag-blu';
                    if (key === 'delete_invoices') tagClass = 'tag-red';
                    else if (key === 'print_invoices' || key === 'print_reports') tagClass = 'tag-grn';
                    else if (key === 'monitor_only') tagClass = 'tag-ylw';
                    permIcons += `<span class="tag ${tagClass}" style="margin:2px;font-size:10px;padding:2px 8px;" title="${label}">${label}</span>`;
                }
            });
            if (!permIcons) permIcons = '<span style="color:#ccc;font-size:12px;">لا توجد</span>';

            const hours = userHours[d.id] || 0;
            const hoursDisplay = hours > 0 ? `<span class="hours-badge">${hours.toFixed(1)} س</span>` : '<span style="color:#ccc;font-size:12px;">0</span>';

            let acts = '';
            if (isAdmin || checkPerm('users_edit') || checkPerm('users_delete')) {
                acts = `<div class="user-actions">`;
                if (isAdmin || checkPerm('users_edit')) {
                    acts += `<button class="btn btn-sec" onclick="app.openEditUserModal('${d.id}')" title="تعديل"><i class="fas fa-edit"></i></button>`;
                }
                if (!isAdminUser && (isAdmin || checkPerm('users_edit'))) {
                    acts += `<button class="btn ${isActive ? 'btn-red' : 'btn-grn'}" onclick="app.toggleUserStatus('${d.id}', '${u.status}')" title="${isActive ? 'تعطيل' : 'تفعيل'}"><i class="fas fa-power-off"></i></button>`;
                    acts += `<button class="btn btn-grn" onclick="app.extendUser('${d.id}')" title="تمديد"><i class="fas fa-calendar-plus"></i></button>`;
                    acts += `<button class="btn btn-warn" onclick="app.forceLogoutUser('${d.id}')" title="إغلاق الجلسة"><i class="fas fa-ban"></i></button>`;
                }
                if (isAdmin || checkPerm('users_delete')) {
                    acts += `<button class="btn btn-red" onclick="app.deleteUser('${d.id}')" title="حذف"><i class="fas fa-trash"></i></button>`;
                }
                acts += `</div>`;
            } else acts = '<span style="color:#ccc;">-</span>';

            html += `<tr><td>${count}</td><td><strong>${u.fullName || '-'}</strong></td><td>${u.email}</td><td>${roleTag}</td><td>${statusTag}</td><td>${daysBadge}</td><td>${permIcons}</td><td>${hoursDisplay}</td><td>${onlineStatus}</td><td>${created}</td><td>${acts}</td></tr>`;
        });
        tbody.innerHTML = html;
    } catch (e) { tbody.innerHTML = '<tr><td colspan="11" class="empty">خطأ</td></tr>'; }
}

async function loadLoginLog() {
    const tbody = document.getElementById('loginLogBody');
    tbody.innerHTML = '<tr><td colspan="8" class="empty"><div class="spin"></div></td></tr>';
    try {
        const q = query(collection(db, "login_log"), orderBy("loginAt", "desc"), limit(200));
        const snap = await getDocs(q);
        if (snap.empty) { tbody.innerHTML = '<tr><td colspan="8" class="empty"><i class="fas fa-clipboard-list"></i><p>لا توجد سجلات</p></td></tr>'; return; }
        let html = '', count = 0;
        snap.forEach(d => {
            count++;
            const l = d.data();
            const loginTime = l.loginAt && l.loginAt.toDate ? new Date(l.loginAt.toDate()).toLocaleString('ar-EG') : '-';
            const logoutTime = l.logoutAt && l.logoutAt.toDate ? new Date(l.logoutAt.toDate()).toLocaleString('ar-EG') : '-';
            let duration = '-';
            if (l.loginAt && l.loginAt.toDate && l.logoutAt && l.logoutAt.toDate) {
                const diffMs = l.logoutAt.toDate() - l.loginAt.toDate();
                const diffMin = Math.floor(diffMs / (1000 * 60));
                const h = Math.floor(diffMin / 60);
                const m = diffMin % 60;
                duration = h > 0 ? `${h}س ${m}د` : `${m}د`;
            } else if (l.sessionDuration) duration = l.sessionDuration;
            const typeBadge = l.type === 'login' ? '<span class="login-badge login-in"><i class="fas fa-sign-in-alt"></i> دخول</span>' : '<span class="login-badge login-out"><i class="fas fa-sign-out-alt"></i> خروج</span>';
            html += `<tr><td>${count}</td><td><strong>${l.userName || '-'}</strong></td><td>${l.userEmail || '-'}</td><td>${typeBadge}</td><td>${loginTime}</td><td>${logoutTime}</td><td style="font-weight:800;color:var(--info);">${duration}</td><td style="font-size:11px;color:#888;">${l.userAgent || '-'}</td></tr>`;
        });
        tbody.innerHTML = html;
    } catch (e) { tbody.innerHTML = '<tr><td colspan="8" class="empty">خطأ</td></tr>'; }
}

async function extendUser(uid) {
    if (!isAdmin) return;
    if (!requirePerm('users_edit', 'تمديد صلاحية مستخدم')) return;
    const days = parseInt(prompt('كم يوم تريد إضافته؟'));
    if (!days || days < 1) return;
    const ud = await getDoc(doc(db, "users", uid));
    if (!ud.exists()) return;
    const data = ud.data();
    if (data.role === 'admin') { alert('المدير لا يحتاج تمديد'); return; }
    let base = new Date();
    if (data.expiresAt && data.expiresAt.toDate) { const ex = data.expiresAt.toDate(); base = ex > new Date() ? ex : new Date(); }
    const newExp = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    await setDoc(doc(db, "users", uid), { expiresAt: newExp, extendedAt: serverTimestamp() }, { merge: true });
    alert('تم التمديد'); loadUsersTable();
}

async function deleteUser(id) {
    if (!isAdmin) return;
    if (!requirePerm('users_delete', 'حذف مستخدم')) return;
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع!')) return;
    await deleteDoc(doc(db, "users", id));
    loadUsersTable(); loadStats();
}

// ==================== STATS ====================
async function loadStats() {
    try {
        const prodSnap = await getDocs(collection(db, "products"));
        document.getElementById('stProducts').textContent = prodSnap.size;
        const invSnap = await getDocs(collection(db, "invoices"));
        document.getElementById('stInvoices').textContent = invSnap.size;
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        let todaySales = 0, todayRevenue = 0;
        invSnap.forEach(d => {
            const inv = d.data();
            if (inv.createdAt && inv.createdAt.toDate) {
                if (inv.createdAt.toDate() >= todayStart) { todaySales++; todayRevenue += inv.total || 0; }
            }
        });
        document.getElementById('stSales').textContent = todaySales;
        document.getElementById('stRevenue').textContent = todayRevenue.toLocaleString('ar-EG') + ' ج.م';
    } catch (e) { }
}

// ==================== PENDING INVOICES ====================
function listenPendingBadge() {
    if (!currentUser) return;
    // ✅ FIX: Use simple query without orderBy to avoid index issues for non-admin users
    const q = query(collection(db, "pending_invoices"), where("cashierId", "==", currentUser.uid));
    pendingUnsub = onSnapshot(q, (snap) => {
        const count = snap.size;
        const badge = document.getElementById('pendingBadge');
        if (badge) {
            if (count > 0) { badge.textContent = count; badge.style.display = 'inline-block'; }
            else badge.style.display = 'none';
        }
    });
}

async function holdInvoice() {
    if (!requirePerm('pending_resume', 'تعليق الفاتورة')) return;
    if (cart.length === 0) return;
    if (isMonitorOnly) { alert('وضع المتابعة فقط - لا يمكن التعليق'); return; }
    const calc = getCartCalculations();
    const items = cart.map(i => ({ name: i.name, price: i.price, qty: i.qty, total: i.price * i.qty, note: (i.note || '').toString() }));
    try {
        await addDoc(collection(db, "pending_invoices"), {
            items, subTotal: calc.subTotal, discountPercent: calc.discountPercent,
            discountAmount: calc.discountAmount, deliveryFee: calc.deliveryFee,
            total: calc.finalTotal, paidAmount: calc.paidAmount, remaining: calc.remaining,
            paymentMethod: cartPaymentMethod, cashierId: currentUser.uid,
            cashierName: userData?.fullName || currentUser.email,
            createdAt: serverTimestamp()
        });
        cart = []; document.getElementById('discountPercent').value = 0;
        document.getElementById('summaryDeliveryFee').value = 0;
        document.getElementById('summaryPaid').value = 0;
        renderCart();
        alert('تم تعليق الفاتورة بنجاح');
    } catch (e) { alert('خطأ: ' + e.message); }
}

async function openPendingModal() {
    if (!checkPerm('pending')) { alert('ليس لديك صلاحية الوصول للفواتير المعلقة'); return; }
    document.getElementById('pendingModal').classList.add('show');
    await loadPendingInvoices();
}

function closePendingModal() {
    document.getElementById('pendingModal').classList.remove('show');
}

// ✅ FIX: loadPendingInvoices - removed orderBy for non-admin users to avoid Firestore index requirement
async function loadPendingInvoices() {
    const tbody = document.getElementById('pendingBody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty"><div class="spin"></div></td></tr>';
    try {
        let snap;
        if (isAdmin) {
            // Admin can use orderBy (should have index created)
            const q = query(collection(db, "pending_invoices"), orderBy("createdAt", "desc"));
            snap = await getDocs(q);
        } else {
            // ✅ FIX: Non-admin users - use where only, no orderBy to avoid composite index requirement
            // Data will be sorted in JavaScript instead
            const q = query(collection(db, "pending_invoices"), where("cashierId", "==", currentUser.uid));
            snap = await getDocs(q);
        }

        if (snap.empty) { 
            tbody.innerHTML = '<tr><td colspan="6" class="empty"><i class="fas fa-pause-circle"></i><p>لا توجد فواتير معلقة</p></td></tr>'; 
            return; 
        }

        // ✅ FIX: Sort results in JavaScript instead of Firestore
        let docs = [];
        snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
        docs.sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
            return bTime - aTime; // descending
        });

        let html = '', count = 0;
        docs.forEach(p => {
            count++;
            const date = p.createdAt ? new Date(p.createdAt.toDate()).toLocaleString('ar-EG') : '-';
            const itemCount = p.items ? p.items.reduce((s, i) => s + i.qty, 0) : 0;
            html += `<tr>
                <td>${count}</td>
                <td>${date}</td>
                <td>${itemCount} عنصر</td>
                <td style="font-weight:800;color:var(--primary);">${p.total || 0} ج.م</td>
                <td>${p.cashierName || '-'}</td>
                <td>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                        <button class="btn btn-grn" onclick="app.resumePendingInvoice('${p.id}')" style="padding:5px 10px;"><i class="fas fa-play"></i> استعادة</button>
                        <button class="btn btn-blu" onclick="app.printPendingInvoice('${p.id}')" style="padding:5px 10px;"><i class="fas fa-print"></i> طباعة</button>
                        <button class="btn btn-red" onclick="app.deletePendingInvoice('${p.id}')" style="padding:5px 10px;"><i class="fas fa-trash"></i> حذف</button>
                    </div>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (e) { 
        console.error('loadPendingInvoices error:', e);
        tbody.innerHTML = '<tr><td colspan="6" class="empty">خطأ في تحميل الفواتير المعلقة</td></tr>'; 
    }
}

async function resumePendingInvoice(id) {
    if (!requirePerm('pending_resume', 'استعادة فاتورة معلقة')) return;
    const d = await getDoc(doc(db, "pending_invoices", id));
    if (!d.exists()) return;
    const p = d.data();
    cart = (p.items || []).map(i => ({ id: 'pending_' + Math.random().toString(36).substr(2, 9), name: i.name, price: i.price, qty: i.qty, note: i.note || '' }));
    document.getElementById('discountPercent').value = p.discountPercent || 0;
    document.getElementById('summaryDeliveryFee').value = p.deliveryFee || 0;
    document.getElementById('summaryPaid').value = p.paidAmount || 0;
    selectCartPayment(p.paymentMethod || 'cash');
    renderCart();
    await deleteDoc(doc(db, "pending_invoices", id));
    closePendingModal();
    alert('تم استعادة الفاتورة إلى السلة');
}

async function printPendingInvoice(id) {
    if (!requirePerm('invoices_print', 'طباعة الفاتورة المعلقة')) return;
    const d = await getDoc(doc(db, "pending_invoices", id));
    if (!d.exists()) return;
    const p = d.data();
    const calc = {
        subTotal: p.subTotal || 0, discountPercent: p.discountPercent || 0,
        discountAmount: p.discountAmount || 0, deliveryFee: p.deliveryFee || 0,
        finalTotal: p.total || 0, paidAmount: p.paidAmount || 0, remaining: p.remaining || 0
    };
    cartPaymentMethod = p.paymentMethod || 'cash';
    showInvoice(d.id, 'معلق-' + d.id.slice(-4), p.items || [], calc);
}

async function deletePendingInvoice(id) {
    if (!requirePerm('pending_delete', 'حذف فاتورة معلقة')) return;
    if (!confirm('هل أنت متأكد من حذف الفاتورة المعلقة؟')) return;
    await deleteDoc(doc(db, "pending_invoices", id));
    loadPendingInvoices();
}

// ==================== MAINTENANCE ====================
async function enableMaintenanceMode() {
    if (!isAdmin) { alert('للمدير فقط'); return; }
    if (!requirePerm('settings_edit', 'تفعيل وضع الصيانة')) return;
    if (!confirm('هل أنت متأكد من إغلاق جميع جلسات المستخدمين؟')) return;
    try {
        await setDoc(doc(db, "settings", "maintenance"), { enabled: true, startedAt: serverTimestamp(), startedBy: currentUser.uid, startedByName: userData?.fullName || currentUser.email });
        const usersSnap = await getDocs(collection(db, "users"));
        const batch = [];
        usersSnap.forEach((d) => {
            const u = d.data();
            if (u.role !== 'admin') {
                batch.push(setDoc(doc(db, "users", d.id), { 
                    forceLogout: true, 
                    forceLogoutAt: serverTimestamp(), 
                    forceLogoutBy: currentUser.uid,
                    currentSessionId: null
                }, { merge: true }));
            }
        });
        await Promise.all(batch);
        alert('تم تفعيل وضع الصيانة وإغلاق جميع الجلسات.');
    } catch (e) { alert('خطأ: ' + e.message); }
}

async function disableMaintenanceMode() {
    if (!isAdmin) { alert('للمدير فقط'); return; }
    if (!requirePerm('settings_edit', 'إيقاف وضع الصيانة')) return;
    try {
        await setDoc(doc(db, "settings", "maintenance"), { enabled: false, endedAt: serverTimestamp(), endedBy: currentUser.uid }, { merge: true });
        const usersSnap = await getDocs(collection(db, "users"));
        const batch = [];
        usersSnap.forEach((d) => {
            const u = d.data();
            if (u.role !== 'admin') batch.push(setDoc(doc(db, "users", d.id), { forceLogout: false }, { merge: true }));
        });
        await Promise.all(batch);
        alert('تم إيقاف وضع الصيانة.');
    } catch (e) { alert('خطأ: ' + e.message); }
}

async function forceLogoutUser(uid) {
    if (!isAdmin) { alert('للمدير فقط'); return; }
    if (!requirePerm('users_edit', 'إغلاق جلسة مستخدم')) return;
    if (!confirm('هل أنت متأكد من إغلاق جلسة هذا المستخدم؟')) return;
    try {
        await setDoc(doc(db, "users", uid), { 
            forceLogout: true, 
            forceLogoutAt: serverTimestamp(), 
            forceLogoutBy: currentUser.uid,
            currentSessionId: null
        }, { merge: true });
        alert('تم إرسال أمر إغلاق الجلسة.'); loadUsersTable();
    } catch (e) { alert('خطأ: ' + e.message); }
}

// ==================== CHANGE PASSWORD ====================
function openChangePassModal() {
    document.getElementById('changePassModal').classList.add('show');
}

function closeChangePassModal() {
    document.getElementById('changePassModal').classList.remove('show');
    document.getElementById('currentPass').value = '';
    document.getElementById('newPass').value = '';
    document.getElementById('confirmPass').value = '';
}

async function changePassword() {
    const current = document.getElementById('currentPass').value;
    const newPass = document.getElementById('newPass').value;
    const confirm = document.getElementById('confirmPass').value;
    if (!current || !newPass || !confirm) { alert('املأ جميع الحقول'); return; }
    if (newPass.length < 6) { alert('كلمة السر الجديدة ضعيفة'); return; }
    if (newPass !== confirm) { alert('كلمة السر الجديدة غير متطابقة'); return; }
    try {
        const cred = EmailAuthProvider.credential(currentUser.email, current);
        await reauthenticateWithCredential(currentUser, cred);
        await updatePassword(currentUser, newPass);
        alert('تم تغيير كلمة السر بنجاح');
        closeChangePassModal();
    } catch (e) {
        if (e.code === 'auth/wrong-password') alert('كلمة السر الحالية غير صحيحة');
        else alert('خطأ: ' + e.message);
    }
}

// ==================== PRINTER SETTINGS ====================
function openPrinterModal() {
    document.getElementById('printerModal').classList.add('show');
    document.getElementById('printerSelect').value = qzPrinter || '';
    document.getElementById('printerCopies').value = qzPrinterCopies;
    document.getElementById('paperWidth').value = qzPaperWidth;
    if (qzConnected) updateQZStatus('متصل', 'var(--success)');
}

function closePrinterModal() { 
    document.getElementById('printerModal').classList.remove('show'); 
}

async function connectQZ() {
    const btn = document.getElementById('btnConnectQZ');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التوصيل...';
    try {
        if (typeof qz === 'undefined') { throw new Error('مكتبة QZ Tray غير محملة'); }
        if (!qz.websocket.isActive()) { await qz.websocket.connect(); }
        qzConnected = true;
        updateQZStatus('متصل', 'var(--success)');
        const printers = await qz.printers.find();
        const sel = document.getElementById('printerSelect');
        sel.innerHTML = '<option value="">-- اختر طابعة --</option>';
        printers.forEach(p => {
            const opt = document.createElement('option'); opt.value = p; opt.textContent = p;
            if (p === qzPrinter) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> متصل';
        btn.style.background = 'var(--success)';
    } catch (e) {
        updateQZStatus('فشل: ' + e.message, 'var(--danger)');
        btn.disabled = false; btn.innerHTML = '<i class="fas fa-plug"></i> إعادة توصيل';
        alert('مش قادر أتواصل مع QZ Tray.\n\n1. تأكد إن البرنامج شغال على الجهاز\n2. جرّب تفتحه كـ Administrator\n3. لو مش مثبّت: https://qz.io');
    }
}

function updateQZStatus(text, color) {
    const el = document.getElementById('qzStatus');
    el.textContent = text; el.style.color = color || '#888';
}

function savePrinterSettings() {
    const sel = document.getElementById('printerSelect');
    const copies = document.getElementById('printerCopies').value;
    const width = document.getElementById('paperWidth').value;
    if (sel.value) {
        qzPrinter = sel.value;
        localStorage.setItem('qzPrinter', qzPrinter);
        localStorage.setItem('qzPrinterCopies', copies);
        localStorage.setItem('qzPaperWidth', width);
        qzPrinterCopies = parseInt(copies);
        qzPaperWidth = width;
        alert('تم حفظ إعدادات الطابعة: ' + qzPrinter);
        closePrinterModal();
    } else { alert('اختر طابعة الأول'); }
}

// ==================== LOGOUT ====================
async function doLogout() {
    if (currentSessionId) {
        try { 
            await setDoc(doc(db, "login_log", currentSessionId), { type: 'logout', logoutAt: serverTimestamp() }, { merge: true }); 
        } catch (e) { console.error(e); }
    }
    if (currentUser) await setDoc(doc(db, "users", currentUser.uid), { 
        forceLogout: false, 
        currentSessionId: null,
        lastSeen: serverTimestamp()
    }, { merge: true });
    localStorage.removeItem('baron_session_id');
    if (maintenanceUnsub) maintenanceUnsub();
    await signOut(auth);
    window.location.href = "https://zadelrahmanzad-boop.github.io/baron1/";
}

async function forceLogout() {
    if (currentSessionId) {
        try { await setDoc(doc(db, "login_log", currentSessionId), { type: 'logout', logoutAt: serverTimestamp() }, { merge: true }); } catch (e) { console.error(e); }
    }
    if (currentUser) await setDoc(doc(db, "users", currentUser.uid), { 
        forceLogout: false, 
        currentSessionId: null,
        lastSeen: serverTimestamp()
    }, { merge: true });
    localStorage.removeItem('baron_session_id');
    if (maintenanceUnsub) maintenanceUnsub();
    await signOut(auth);
    window.location.href = "https://zadelrahmanzad-boop.github.io/baron1/";
}

// ==================== AUTH CHECK INTERVAL ====================
setInterval(async () => {
    if (!currentUser || userData?.role === 'admin') return;
    try {
        const ud = await getDoc(doc(db, "users", currentUser.uid));
        if (!ud.exists()) return;
        const data = ud.data();
        const storedSessionId = localStorage.getItem('baron_session_id');
        const firestoreSessionId = data.currentSessionId || null;
        const isSameSession = storedSessionId && storedSessionId === firestoreSessionId;

        if (data.forceLogout === true) { 
            alert('تم إغلاق جلستك من قبل الإدارة.'); 
            await forceLogout(); 
            return;
        }

        if (!isSameSession && firestoreSessionId !== null) {
            alert('تم فتح حسابك على جهاز آخر. سيتم تسجيل خروجك.');
            await forceLogout();
            return;
        }

        if (data.expiresAt && data.expiresAt.toDate) {
            const now = new Date();
            const expiry = data.expiresAt.toDate();
            if (now > expiry) {
                alert('انتهت صلاحية حسابك. يرجى التواصل مع الإدارة لتجديد الاشتراك.');
                await forceLogout();
                return;
            }
        }

        if (data.status === 'disabled') {
            alert('حسابك معطل من قبل الإدارة.');
            await forceLogout();
            return;
        }
    } catch (e) { console.error('Auth check error:', e); }
}, 15000);

// ==================== DATE DISPLAY ====================
document.getElementById('topDate').textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

// ==================== EXPORT ALL FUNCTIONS ====================
window.app = {
    // Navigation
    navTo, toggleSidebar,
    // Auth
    doLogout, forceLogout,
    // Maintenance
    enableMaintenanceMode, disableMaintenanceMode, forceLogoutUser,
    // Products
    loadPosProducts, filterProducts, filterByCategory, addToCart, changeQty, removeFromCart, clearCart,
    addNoteToCartItem, closeNoteModal, selectQuickNote, saveNote, clearNote,
    updateCartSummary, selectCartPayment, getCartCalculations,
    checkout, holdInvoice,
    // Product Management
    openProductModal, closeProductModal, saveProduct, loadProductsTable,
    deleteProduct, editProduct, closeEditProductModal, saveProductEdit,
    generateProductCode, onProdCatChange, addNewCategory, onEditProdCatChange, addNewEditCategory,
    // Invoices
    loadInvoicesTable, viewInvoice, deleteInvoice, resetInvoiceCounter,
    printInvoiceFromModal, printInvoiceDoubleFromModal, printInvoiceFromTable,
    openEditInvoiceModal, closeEditInvoiceModal, changeEditItemQty, removeEditItem,
    recalcEditInvoice, openAddProductToInvoice, closeAddProdToInvModal,
    filterAddProdSearch, addProductToCurrentEdit, saveInvoiceEdit,
    // Bulk Actions
    toggleSelectAllInvoices, printSelectedInvoices, deleteSelectedInvoices, exportSelectedToPDF,
    // Reports
    loadReports, printDayReport, printReports, printLoginLog,
    // Users
    switchUserTab, openUserModal, closeUserModal, toggleUserDays, saveUser,
    openEditUserModal, closeEditUserModal, toggleEditUserDays, togglePerm, updateUser,
    toggleUserStatus, extendUser, deleteUser, loadUsersTable, loadLoginLog,
    // Pending
    openPendingModal, closePendingModal, loadPendingInvoices,
    resumePendingInvoice, printPendingInvoice, deletePendingInvoice,
    // Password
    openChangePassModal, closeChangePassModal, changePassword,
    // Printer
    openPrinterModal, closePrinterModal, connectQZ, savePrinterSettings,
    // Monitor
    applyMonitorMode
};
