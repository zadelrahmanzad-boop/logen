            const data = ud.data();
            const storedSessionId = localStorage.getItem('baron_session_id');
            const firestoreSessionId = data.currentSessionId || null;
            const isSameSession = storedSessionId && storedSessionId === firestoreSessionId;

            // Check force logout
            if (data.forceLogout === true) {
                alert('تم إغلاق جلستك من قبل الإدارة.');
                await doLogout();
                return;
            }

            // Session hijacking detection
            if (!isSameSession && firestoreSessionId !== null) {
                alert('تم فتح حسابك على جهاز آخر. سيتم تسجيل خروجك.');
                await doLogout();
                return;
            }

            // Check expiry
            if (data.expiresAt && data.expiresAt.toDate) {
                const now = new Date();
                const expiry = data.expiresAt.toDate();
                if (now > expiry) {
                    alert('انتهت صلاحية حسابك. يرجى التواصل مع الإدارة لتجديد الاشتراك.');
                    await doLogout();
                    return;
                }
            }

            // Check disabled
            if (data.status === 'disabled') {
                alert('حسابك معطل من قبل الإدارة.');
                await doLogout();
                return;
            }
        } catch (e) {
            console.error('Auth check error:', e);
        }
    }, 15000);
}

// Logout
export async function doLogout() {
    if (state.currentSessionId) {
        try {
            await setDoc(doc(db, "login_log", state.currentSessionId), {
                type: 'logout',
                logoutAt: serverTimestamp()
            }, { merge: true });
        } catch (e) { console.error(e); }
    }

    if (state.currentUser) {
        await setDoc(doc(db, "users", state.currentUser.uid), {
            forceLogout: false,
            currentSessionId: null,
            lastSeen: serverTimestamp()
        }, { merge: true });
    }

    localStorage.removeItem('baron_session_id');
    await signOut(auth);
    window.location.href = "https://zadelrahmanzad-boop.github.io/baron1/";
}

// Change Password
export async function changePassword(currentPass, newPass, confirmPass) {
    if (!currentPass || !newPass || !confirmPass) {
        alert('املأ جميع الحقول');
        return false;
    }
    if (newPass.length < 6) {
        alert('كلمة السر الجديدة ضعيفة');
        return false;
    }
    if (newPass !== confirmPass) {
        alert('كلمة السر الجديدة غير متطابقة');
        return false;
    }

    try {
        const cred = EmailAuthProvider.credential(state.currentUser.email, currentPass);
        await reauthenticateWithCredential(state.currentUser, cred);
        await updatePassword(state.currentUser, newPass);
        alert('تم تغيير كلمة السر بنجاح');
        return true;
    } catch (e) {
        if (e.code === 'auth/wrong-password') alert('كلمة السر الحالية غير صحيحة');
        else alert('خطأ: ' + e.message);
        return false;
    }
}

// Create New User (Admin only)
export async function createUser(name, email, pass, role, days) {
    if (!state.isAdmin) { alert('للمدير فقط'); return false; }
    if (!name || !email || !pass) { alert('املأ جميع الحقول'); return false; }
    if (pass.length < 6) { alert('كلمة المرور ضعيفة'); return false; }
    if (role !== 'admin' && (!days || days < 1)) { alert('حدد عدد أيام'); return false; }

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const perms = role === 'admin'
            ? { pos: true, products: true, invoices: true, reports: true, users: true, settings: true, change_password: true, monitor_only: false }
            : { ...DEFAULT_PERMS };

        const udata = {
            email,
            fullName: name,
            role,
            status: "active",
            permissions: perms,
            isLoggedIn: false,
            createdAt: serverTimestamp(),
            lastLogin: serverTimestamp(),
            createdBy: state.currentUser.uid
        };

        if (role !== 'admin') {
            const exp = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
            udata.daysActivated = days;
            udata.expiresAt = exp;
        }

        await setDoc(doc(db, "users", cred.user.uid), udata);
        alert('تم إنشاء المستخدم');
        return true;
    } catch (err) {
        alert(err.code === 'auth/email-already-in-use' ? 'البريد مستخدم' : err.message);
        return false;
    }
}

// Update User
export async function updateUser(uid, updates) {
    if (!state.isAdmin) { alert('للمدير فقط'); return false; }

    try {
        await setDoc(doc(db, "users", uid), {
            ...updates,
            updatedAt: serverTimestamp(),
            updatedBy: state.currentUser.uid
        }, { merge: true });
        alert('تم تحديث المستخدم بنجاح');
        return true;
    } catch (e) {
        alert('خطأ: ' + e.message);
        return false;
    }
}

// Toggle User Status
export async function toggleUserStatus(uid, currentStatus) {
    if (!state.isAdmin) { alert('للمدير فقط'); return; }
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
    const action = newStatus === 'active' ? 'تفعيل' : 'تعطيل';
    if (!confirm(`هل تريد ${action} هذا الحساب؟`)) return;

    try {
        await setDoc(doc(db, "users", uid), {
            status: newStatus,
            statusUpdatedAt: serverTimestamp(),
            statusUpdatedBy: state.currentUser.uid
        }, { merge: true });
        return true;
    } catch (e) {
        alert('خطأ: ' + e.message);
        return false;
    }
}

// Extend User Subscription
export async function extendUser(uid, days) {
    if (!state.isAdmin) return;
    if (!days || days < 1) return;

    const ud = await getDoc(doc(db, "users", uid));
    if (!ud.exists()) return;
    const data = ud.data();
    if (data.role === 'admin') { alert('المدير لا يحتاج تمديد'); return; }

    let base = new Date();
    if (data.expiresAt && data.expiresAt.toDate) {
        const ex = data.expiresAt.toDate();
        base = ex > new Date() ? ex : new Date();
    }
    const newExp = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    await setDoc(doc(db, "users", uid), {
        expiresAt: newExp,
        extendedAt: serverTimestamp()
    }, { merge: true });
    alert('تم التمديد');
}

// Force Logout User
export async function forceLogoutUser(uid) {
    if (!state.isAdmin) { alert('للمدير فقط'); return; }
    if (!confirm('هل أنت متأكد من إغلاق جلسة هذا المستخدم؟')) return;

    try {
        await setDoc(doc(db, "users", uid), {
            forceLogout: true,
            forceLogoutAt: serverTimestamp(),
            forceLogoutBy: state.currentUser.uid,
            currentSessionId: null
        }, { merge: true });
        alert('تم إرسال أمر إغلاق الجلسة.');
        return true;
    } catch (e) {
        alert('خطأ: ' + e.message);
        return false;
    }
}

// Delete User
export async function deleteUserAccount(uid) {
    if (!state.isAdmin) return;
    if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع!')) return;
    await deleteDoc(doc(db, "users", uid));
    return true;
}
