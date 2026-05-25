// ============================================
// BARON POS - Maintenance Mode Module
// ============================================

import { doc, setDoc, serverTimestamp, getDocs, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from '../firebase-config.js';
import { state } from '../utils/state.js';
import { doLogout } from './auth.js';

export function listenMaintenanceMode() {
    const settingsRef = doc(db, "settings", "maintenance");
    state.maintenanceUnsub = onSnapshot(settingsRef, (snap) => {
        if (snap.exists() && snap.data().enabled === true) {
            if (!state.isAdmin) {
                document.getElementById('maintenanceOverlay').classList.add('show');
            } else {
                document.getElementById('maintenanceBanner').classList.add('show');
            }
        } else {
            document.getElementById('maintenanceOverlay').classList.remove('show');
            document.getElementById('maintenanceBanner').classList.remove('show');
        }
    });
}

export async function enableMaintenanceMode() {
    if (!state.isAdmin) { alert('للمدير فقط'); return; }
    if (!state.requirePerm('settings_edit', 'تفعيل وضع الصيانة')) return;
    if (!confirm('هل أنت متأكد من إغلاق جميع جلسات المستخدمين؟')) return;

    try {
        await setDoc(doc(db, "settings", "maintenance"), {
            enabled: true,
            startedAt: serverTimestamp(),
            startedBy: state.currentUser.uid,
            startedByName: state.userData?.fullName || state.currentUser.email
        });

        const usersSnap = await getDocs(collection(db, "users"));
        const batch = [];
        usersSnap.forEach((d) => {
            const u = d.data();
            if (u.role !== 'admin') {
                batch.push(setDoc(doc(db, "users", d.id), {
                    forceLogout: true,
                    forceLogoutAt: serverTimestamp(),
                    forceLogoutBy: state.currentUser.uid,
                    currentSessionId: null
                }, { merge: true }));
            }
        });
        await Promise.all(batch);
        alert('تم تفعيل وضع الصيانة وإغلاق جميع الجلسات.');
    } catch (e) {
        alert('خطأ: ' + e.message);
    }
}

export async function disableMaintenanceMode() {
    if (!state.isAdmin) { alert('للمدير فقط'); return; }
    if (!state.requirePerm('settings_edit', 'إيقاف وضع الصيانة')) return;

    try {
        await setDoc(doc(db, "settings", "maintenance"), {
            enabled: false,
            endedAt: serverTimestamp(),
            endedBy: state.currentUser.uid
        }, { merge: true });

        const usersSnap = await getDocs(collection(db, "users"));
        const batch = [];
        usersSnap.forEach((d) => {
            const u = d.data();
            if (u.role !== 'admin') {
                batch.push(setDoc(doc(db, "users", d.id), { forceLogout: false }, { merge: true }));
            }
        });
        await Promise.all(batch);
        alert('تم إيقاف وضع الصيانة.');
    } catch (e) {
        alert('خطأ: ' + e.message);
    }
}
