// ============================================
// BARON POS - Users Management Module
// ============================================

import {
    collection, getDocs, doc, getDoc, deleteDoc, setDoc, serverTimestamp, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from '../firebase-config.js';
import { state } from '../utils/state.js';
import { DEFAULT_PERMS, PERM_LABELS } from '../utils/constants.js';

export async function loadUsersTable() {
    const tbody = document.getElementById('usersBody');
    tbody.innerHTML = '<tr><td colspan="11" class="empty"><div class="spin"></div></td></tr>';

    try {
        const snap = await getDocs(collection(db, "users"));
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="11" class="empty"><i class="fas fa-users"></i><p>لا يوجد مستخدمين</p></td></tr>';
            return;
        }

        let html = '', count = 0;
        const now = new Date();

        // Get login hours
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
            const roleTag = `<span class="tag tag-blu">${getRoleName(u.role)}</span>`;

            const perms = u.permissions || DEFAULT_PERMS;
            let permIcons = '';
            Object.entries(PERM_LABELS).forEach(([key, label]) => {
                if (perms[key]) {
                    let tagClass = 'tag-blu';
                    if (key.includes('delete')) tagClass = 'tag-red';
                    else if (key.includes('print')) tagClass = 'tag-grn';
                    else if (key === 'monitor_only') tagClass = 'tag-ylw';
                    permIcons += `<span class="tag ${tagClass}" style="margin:2px;font-size:10px;padding:2px 8px;" title="${label}">${label}</span>`;
                }
            });
            if (!permIcons) permIcons = '<span style="color:#ccc;font-size:12px;">لا توجد</span>';

            const hours = userHours[d.id] || 0;
            const hoursDisplay = hours > 0 ? `<span class="hours-badge">${hours.toFixed(1)} س</span>` : '<span style="color:#ccc;font-size:12px;">0</span>';

            let acts = '';
            if (state.isAdmin || state.checkPerm('users_edit') || state.checkPerm('users_delete')) {
                acts = `<div class="user-actions">`;
                if (state.isAdmin || state.checkPerm('users_edit')) {
                    acts += `<button class="btn btn-sec" onclick="openEditUserModal('${d.id}')" title="تعديل"><i class="fas fa-edit"></i></button>`;
                }
                if (!isAdminUser && (state.isAdmin || state.checkPerm('users_edit'))) {
                    acts += `<button class="btn ${isActive ? 'btn-red' : 'btn-grn'}" onclick="toggleUserStatus('${d.id}', '${u.status}')" title="${isActive ? 'تعطيل' : 'تفعيل'}"><i class="fas fa-power-off"></i></button>`;
                    acts += `<button class="btn btn-grn" onclick="extendUser('${d.id}')" title="تمديد"><i class="fas fa-calendar-plus"></i></button>`;
                    acts += `<button class="btn btn-warn" onclick="forceLogoutUser('${d.id}')" title="إغلاق الجلسة"><i class="fas fa-ban"></i></button>`;
                }
                if (state.isAdmin || state.checkPerm('users_delete')) {
                    acts += `<button class="btn btn-red" onclick="deleteUser('${d.id}')" title="حذف"><i class="fas fa-trash"></i></button>`;
                }
                acts += `</div>`;
            } else acts = '<span style="color:#ccc;">-</span>';

            html += `<tr>
                <td>${count}</td>
                <td><strong>${u.fullName || '-'}</strong></td>
                <td>${u.email}</td>
                <td>${roleTag}</td>
                <td>${statusTag}</td>
                <td>${daysBadge}</td>
                <td>${permIcons}</td>
                <td>${hoursDisplay}</td>
                <td>${onlineStatus}</td>
                <td>${created}</td>
                <td>${acts}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="11" class="empty">خطأ</td></tr>';
    }
}

export async function loadLoginLog() {
    const tbody = document.getElementById('loginLogBody');
    tbody.innerHTML = '<tr><td colspan="8" class="empty"><div class="spin"></div></td></tr>';

    try {
        const q = query(collection(db, "login_log"), orderBy("loginAt", "desc"), limit(200));
        const snap = await getDocs(q);

        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty"><i class="fas fa-clipboard-list"></i><p>لا توجد سجلات</p></td></tr>';
            return;
        }

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

            const typeBadge = l.type === 'login'
                ? '<span class="login-badge login-in"><i class="fas fa-sign-in-alt"></i> دخول</span>'
                : '<span class="login-badge login-out"><i class="fas fa-sign-out-alt"></i> خروج</span>';

            html += `<tr>
                <td>${count}</td>
                <td><strong>${l.userName || '-'}</strong></td>
                <td>${l.userEmail || '-'}</td>
                <td>${typeBadge}</td>
                <td>${loginTime}</td>
                <td>${logoutTime}</td>
                <td style="font-weight:800;color:var(--info);">${duration}</td>
                <td style="font-size:11px;color:#888;">${l.userAgent || '-'}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="8" class="empty">خطأ</td></tr>';
    }
}

export function printLoginLog() {
    window.print();
}

function getRoleName(r) {
    return { admin: 'مدير', manager: 'مشرف', cashier: 'كاشير' }[r] || r;
}
