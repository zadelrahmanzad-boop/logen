
        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
        import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
        import { getFirestore, collection, getDocs, doc, getDoc, deleteDoc, addDoc, setDoc, serverTimestamp, query, orderBy, limit, runTransaction, where, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

        const app = initializeApp({
            apiKey: "AIzaSyDf_FZ5dDhJCYag9EpEblgylTrxber7oks",
            authDomain: "cashier-52332.firebaseapp.com",
            projectId: "cashier-52332",
            storageBucket: "cashier-52332.firebasestorage.app",
            messagingSenderId: "708122460779",
            appId: "1:708122460779:web:5c0fb2f36488aa6ae3272e",
            measurementId: "G-8BLM2L0LN5"
        });
        const auth = getAuth(app);
        const db = getFirestore(app);

        let currentUser = null, userData = null, isAdmin = false, cart = [], allProducts = [];
        let productCategories = ["تشكن", "برجر", "سايدز", "مشروبات", "أخرى"];
        let currentSessionId = null;
        let maintenanceUnsub = null;
        let currentFilter = 'all';
        let cartPaymentMethod = 'cash';
        let isMonitorOnly = false; // true = can view but cannot sell

        const DEFAULT_PERMS = { 
    pos: true, pos_sell: true, 
    products: true, products_add: true, products_edit: true, products_delete: true,
    invoices: true, invoices_view: true, invoices_print: true, invoices_delete: false, invoices_edit: false,
    reports: true, reports_view: true, reports_print: true,
    users: false, users_view: false, users_add: false, users_edit: false, users_delete: false,
    settings: false, settings_view: false, settings_edit: false,
    pending: true, pending_view: true, pending_resume: true, pending_delete: true,
    change_password: true, monitor_only: false
};
        const PERM_LABELS = { 
    pos: 'نقطة البيع', pos_sell: 'البيع في POS',
    products: 'المنتجات', products_add: 'إضافة منتج', products_edit: 'تعديل منتج', products_delete: 'حذف منتج',
    invoices: 'الفواتير', invoices_view: 'عرض الفواتير', invoices_print: 'طباعة الفواتير', invoices_delete: 'حذف الفواتير', invoices_edit: 'تعديل الفواتير',
    reports: 'التقارير', reports_view: 'عرض التقارير', reports_print: 'طباعة التقارير',
    users: 'المستخدمين', users_view: 'عرض المستخدمين', users_add: 'إضافة مستخدم', users_edit: 'تعديل مستخدم', users_delete: 'حذف مستخدم',
    settings: 'الإعدادات', settings_view: 'عرض الإعدادات', settings_edit: 'تعديل الإعدادات',
    pending: 'فواتير معلقة', pending_view: 'عرض المعلقة', pending_resume: 'استعادة معلقة', pending_delete: 'حذف معلقة',
    change_password: 'تغيير كلمة السر', monitor_only: 'متابعة فقط (بدون بيع)'
};

        // ========== PERMISSION SYSTEM ==========
        function checkPerm(permKey) {
            if (isAdmin) return true;
            if (!userData || !userData.permissions) return false;
            return userData.permissions[permKey] === true;
        }
        function hasAnyPerm(permKeys) {
            if (isAdmin) return true;
            if (!userData || !userData.permissions) return false;
            return permKeys.some(k => userData.permissions[k] === true);
        }
        function requirePerm(permKey, actionName) {
            if (!checkPerm(permKey)) {
                alert('ليس لديك صلاحية: ' + (actionName || PERM_LABELS[permKey] || permKey));
                return false;
            }
            return true;
        }
        const CAT_ICONS = {
            'تشكن': { icon: 'fa-drumstick-bite', class: 'cat-chicken' },
            'برجر': { icon: 'fa-hamburger', class: 'cat-burger' },
            'سايدز': { icon: 'fa-cookie-bite', class: 'cat-sides' },
            'مشروبات': { icon: 'fa-glass-whiskey', class: 'cat-drinks' },
            'أخرى': { icon: 'fa-ellipsis-h', class: 'cat-other' }
        };
        const LOGO_URL = "https://raw.githubusercontent.com/zadelrahmanzad-boop/baron2/refs/heads/main/EL.jpg";

        onAuthStateChanged(auth, async (user) => {
            if (!user) { window.location.href = "https://zadelrahmanzad-boop.github.io/baron1/"; return; }
            currentUser = user;
            const ud = await getDoc(doc(db, "users", user.uid));
            if (ud.exists()) {
                userData = ud.data();
                // Multi-login check: rely ONLY on lastSeen + sessionId (NOT isLoggedIn)
                const lastSeen = userData.lastSeen && userData.lastSeen.toDate ? userData.lastSeen.toDate() : null;
                const diffMin = lastSeen ? (new Date() - lastSeen) / (1000 * 60) : 999;
                const storedSessionId = localStorage.getItem('baron_session_id');
                const isSameSession = storedSessionId && storedSessionId === userData.currentSessionId;

                // Allow if: same session (F5/refresh) OR lastSeen is old (> 3 min, previous session died)
                // Block if: different session AND lastSeen is recent (< 3 min, someone else is active)
                if (userData.role !== 'admin' && !isSameSession && diffMin <= 3 && userData.forceLogout !== true) {
                    await signOut(auth);
                    alert('هذا الحساب مسجل دخول على جهاز آخر. يرجى الانتظار 3 دقائق وإعادة المحاولة.');
                    window.location.href = "https://zadelrahmanzad-boop.github.io/baron1/";
                    return;
                }
                document.getElementById('uName').textContent = userData.fullName || user.email;
                document.getElementById('uRole').textContent = roleName(userData.role);
                document.getElementById('uAvatar').textContent = (userData.fullName || user.email).charAt(0).toUpperCase();
                document.getElementById('currentUserName').textContent = userData.fullName || user.email;
                // Check expiry on login
                if (userData.expiresAt && userData.expiresAt.toDate) {
                    const now = new Date(); 
                    const ex = userData.expiresAt.toDate();
                    if (now > ex && userData.role !== 'admin') {
                        await signOut(auth); 
                        alert('انتهت صلاحية حسابك');
                        window.location.href = "https://zadelrahmanzad-boop.github.io/baron1/"; 
                        return;
                    }
                }
                // Check if disabled on login
                if (userData.status === 'disabled') {
                    await signOut(auth); 
                    alert('حسابك معطل');
                    window.location.href = "https://zadelrahmanzad-boop.github.io/baron1/"; 
                    return;
                }
                isAdmin = userData.role === 'admin';
                const userPerms = userData.permissions || DEFAULT_PERMS;
                isMonitorOnly = userPerms.monitor_only === true;

                if (isAdmin) {
                    document.getElementById('btnAddUser').style.display = 'inline-flex';
                    document.getElementById('navUsers').classList.add('show');
                    document.getElementById('btnResetInv').style.display = 'inline-flex';
                } else {
                    // FIX: Show reset button for all users with settings_edit permission
                    if (checkPerm('settings_edit')) {
                        document.getElementById('btnResetInv').style.display = 'inline-flex';
                    }
                    // Show/hide buttons based on permissions
                    if (checkPerm('products_add')) document.getElementById('btnAddProduct').style.display = 'inline-flex';
                    if (checkPerm('users_add')) document.getElementById('btnAddUser').style.display = 'inline-flex';
                    if (checkPerm('users')) document.getElementById('navUsers').classList.add('show');
                    if (checkPerm('settings_edit')) document.getElementById('btnResetInv').style.display = 'inline-flex';
                }
                // Show change password button if user has permission
                if (userPerms.change_password === true || isAdmin) {
                    document.getElementById('btnChangePass').style.display = 'block';
                }
                // Apply monitor-only mode
                if (isMonitorOnly) {
                    applyMonitorMode();
                }
                await recordLogin(user.uid);
            } else {
                document.getElementById('uName').textContent = user.email;
                document.getElementById('uRole').textContent = 'مستخدم';
                document.getElementById('currentUserName').textContent = user.email;
                await recordLogin(user.uid);
            }
            listenMaintenanceMode();
            updateLastSeen();
            setInterval(updateLastSeen, 60000);
            loadPosProducts();
            loadStats();
            loadCategories();
            listenPendingBadge();
        });

        async function recordLogin(uid) {
            try {
                // Generate unique session ID for THIS device/browser
                const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('baron_session_id', sessionId);
                currentSessionId = sessionId;

                // Write sessionId to Firestore so other devices can detect it
                await setDoc(doc(db, "users", uid), { 
                    lastSeen: serverTimestamp(),
                    currentSessionId: sessionId
                }, { merge: true });

                const logRef = await addDoc(collection(db, "login_log"), {
                    userId: uid, userName: userData?.fullName || currentUser?.email || '',
                    userEmail: currentUser?.email || '', type: 'login', loginAt: serverTimestamp(),
                    logoutAt: null, sessionDuration: null, sessionId: sessionId,
                    userAgent: navigator.userAgent.substring(0, 100), ip: 'unknown'
                });
            } catch (e) { console.error(e); }
        }

        async function updateLastSeen() {
            if (!currentUser) return;
            await setDoc(doc(db, "users", currentUser.uid), { 
                lastSeen: serverTimestamp(),
                currentSessionId: currentSessionId || localStorage.getItem('baron_session_id')
            }, { merge: true });
        }

        function roleName(r) { return { admin: 'مدير', manager: 'مشرف', cashier: 'كاشير' }[r] || r; }
        document.getElementById('topDate').textContent = new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        // ========== MAINTENANCE MODE ==========
        function listenMaintenanceMode() {
            const settingsRef = doc(db, "settings", "maintenance");
            maintenanceUnsub = onSnapshot(settingsRef, (snap) => {
                if (snap.exists() && snap.data().enabled === true) {
                    if (!isAdmin) document.getElementById('maintenanceOverlay').classList.add('show');
                    else document.getElementById('maintenanceBanner').classList.add('show');
                } else {
                    document.getElementById('maintenanceOverlay').classList.remove('show');
                    document.getElementById('maintenanceBanner').classList.remove('show');
                }
            });
        }

        window.enableMaintenanceMode = async () => {
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
        };

        window.disableMaintenanceMode = async () => {
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
        };

        window.forceLogoutUser = async (uid) => {
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
        };

        window.forceLogout = async () => {
            if (currentSessionId) {
                try { await setDoc(doc(db, "login_log", currentSessionId), { type: 'logout', logoutAt: serverTimestamp() }, { merge: true }); } catch (e) { console.error(e); }
            }
            if (currentUser) await setDoc(doc(db, "users", currentUser.uid), { isLoggedIn: false, forceLogout: false, currentSessionId: null }, { merge: true });
            localStorage.removeItem('baron_session_id');
            if (maintenanceUnsub) maintenanceUnsub();
            await signOut(auth);
            window.location.href = "https://zadelrahmanzad-boop.github.io/baron1/";
        };

        // Handle browser close/refresh to logout user immediately
        window.addEventListener('beforeunload', () => {
            if (currentUser) {
                setDoc(doc(db, "users", currentUser.uid), { 
                    isLoggedIn: false, 
                    lastSeen: serverTimestamp() 
                }, { merge: true }).catch(() => {});
            }
        });

        window.addEventListener('pagehide', () => {
            if (currentUser) {
                setDoc(doc(db, "users", currentUser.uid), { 
                    isLoggedIn: false 
                }, { merge: true }).catch(() => {});
            }
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && currentUser) {
                setDoc(doc(db, "users", currentUser.uid), { 
                    lastSeen: serverTimestamp() 
                }, { merge: true }).catch(() => {});
            }
        });

        // ========== CHANGE PASSWORD ==========
        window.openChangePassModal = () => {
            document.getElementById('changePassModal').classList.add('show');
        };
        window.closeChangePassModal = () => {
            document.getElementById('changePassModal').classList.remove('show');
            document.getElementById('currentPass').value = '';
            document.getElementById('newPass').value = '';
            document.getElementById('confirmPass').value = '';
        };
        window.changePassword = async () => {
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
        };

        setInterval(async () => {
            if (!currentUser || userData?.role === 'admin') return;
            try {
                const ud = await getDoc(doc(db, "users", currentUser.uid));
                if (!ud.exists()) return;
                const data = ud.data();
                const storedSessionId = localStorage.getItem('baron_session_id');
                const firestoreSessionId = data.currentSessionId || null;
                const isSameSession = storedSessionId && storedSessionId === firestoreSessionId;

                // Check force logout
                if (data.forceLogout === true) { 
                    alert('تم إغلاق جلستك من قبل الإدارة.'); 
                    await forceLogout(); 
                    return;
                }

                // PERFECT: If currentSessionId in Firestore changed → another device logged in
                if (!isSameSession && firestoreSessionId !== null) {
                    alert('تم فتح حسابك على جهاز آخر. سيتم تسجيل خروجك.');
                    await forceLogout();
                    return;
                }

                // Check expiry - log out immediately if expired
                if (data.expiresAt && data.expiresAt.toDate) {
                    const now = new Date();
                    const expiry = data.expiresAt.toDate();
                    if (now > expiry) {
                        alert('انتهت صلاحية حسابك. يرجى التواصل مع الإدارة لتجديد الاشتراك.');
                        await forceLogout();
                        return;
                    }
                }

                // Check if account disabled
                if (data.status === 'disabled') {
                    alert('حسابك معطل من قبل الإدارة.');
                    await forceLogout();
                    return;
                }
            } catch (e) { console.error('Auth check error:', e); }
        }, 15000); // Check every 15 seconds (faster detection)

        window.applyMonitorMode = () => {
            // Disable all product cards (visual only, no click)
            document.querySelectorAll('.product-card').forEach(card => {
                card.style.opacity = '0.6';
                card.style.cursor = 'not-allowed';
                card.onclick = null;
                card.title = 'وضع المتابعة فقط - لا يمكن البيع';
            });
            // Disable checkout button
            const checkoutBtn = document.getElementById('checkoutBtn');
            if (checkoutBtn) {
                checkoutBtn.disabled = true;
                checkoutBtn.textContent = 'وضع المتابعة فقط';
                checkoutBtn.style.background = '#888';
                checkoutBtn.onclick = () => alert('ليس لديك صلاحية البيع - متابعة فقط');
            }
            // Disable hold button
            const holdBtn = document.getElementById('holdBtn');
            if (holdBtn) {
                holdBtn.disabled = true;
                holdBtn.style.background = '#888';
            }
            // Show monitor banner
            const banner = document.createElement('div');
            banner.id = 'monitorBanner';
            banner.innerHTML = '<i class="fas fa-eye"></i> وضع المتابعة فقط - يمكنك المشاهدة بدون البيع';
            banner.style.cssText = 'background:linear-gradient(135deg, var(--warning), #d68910);color:white;padding:10px 20px;border-radius:10px;text-align:center;font-weight:700;font-size:14px;margin-bottom:15px;display:flex;align-items:center;justify-content:center;gap:10px;';
            const posView = document.getElementById('view-pos');
            if (posView && !document.getElementById('monitorBanner')) {
                posView.insertBefore(banner, posView.firstChild);
            }
            // Disable cart interactions
            document.querySelectorAll('.cart-qty button').forEach(btn => btn.disabled = true);
            const clearCart = document.querySelector('.clear-cart');
            if (clearCart) clearCart.style.display = 'none';
        };

        window.toggleSidebar = () => {
            const sidebar = document.querySelector('.sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            sidebar.classList.toggle('open');
            if (overlay) overlay.classList.toggle('show');
            document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
        };

        window.navTo = async (sec) => {
            // Check permissions for non-admin users
            if (!isAdmin) {
                const permMap = {
                    pos: 'pos', products: 'products', invoices: 'invoices',
                    reports: 'reports', users: 'users', settings: 'settings'
                };
                const requiredPerm = permMap[sec];
                if (requiredPerm && !checkPerm(requiredPerm)) {
                    alert('ليس لديك صلاحية الوصول إلى: ' + (PERM_LABELS[requiredPerm] || requiredPerm));
                    return;
                }
            }
            // Permission check already done above for all sections
    // if (sec === 'users' && !isAdmin && !checkPerm('users')) { alert('للمدير فقط'); return; }
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            if (event && event.currentTarget) event.currentTarget.classList.add('active');
            if (window.innerWidth <= 768 && document.querySelector('.sidebar').classList.contains('open')) toggleSidebar();
            // Apply monitor mode when returning to POS
            if (sec === 'pos' && isMonitorOnly) setTimeout(applyMonitorMode, 200);
            document.querySelectorAll('.section-view').forEach(s => s.classList.remove('active'));
            document.getElementById('view-' + sec).classList.add('active');
            const titles = { pos: 'نقطة البيع', products: 'المنتجات', invoices: 'الفواتير', reports: 'التقارير', users: 'المستخدمين' };
            document.getElementById('pageTitle').textContent = titles[sec];
            if (sec === 'pos') await loadPosProducts();
            if (sec === 'products') await loadProductsTable();
            if (sec === 'invoices') await loadInvoicesTable();
            if (sec === 'reports') await loadReports();
            if (sec === 'users') { await loadUsersTable(); await loadLoginLog(); }
            document.getElementById('statsBar').style.display = 'none';
        };

        window.switchUserTab = (tab) => {
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            document.getElementById('tab' + tab.charAt(0).toUpperCase() + tab.slice(1)).classList.add('active');
            document.getElementById('panel-users').classList.toggle('hidden', tab !== 'users');
            document.getElementById('panel-log').classList.toggle('hidden', tab !== 'log');
            if (tab === 'log') loadLoginLog();
        };

        async function loadCategories() {
            try {
                const snap = await getDocs(collection(db, "products"));
                const cats = new Set(productCategories);
                snap.forEach(d => { const c = d.data().category; if (c) cats.add(c); });
                productCategories = Array.from(cats);
                updateProdCatSelect();
                updateEditProdCatSelect();
                renderCategoryTabs();
            } catch (e) { console.error('loadCategories error:', e); }
        }

        function updateProdCatSelect() {
            const sel = document.getElementById('prodCat');
            const current = sel.value;
            sel.innerHTML = '';
            productCategories.forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.textContent = c; sel.appendChild(opt); });
            const newOpt = document.createElement('option'); newOpt.value = '__new__'; newOpt.textContent = '+ فئة جديدة'; sel.appendChild(newOpt);
            if (productCategories.includes(current)) sel.value = current;
        }

        window.onProdCatChange = () => {
            document.getElementById('newCatRow').classList.toggle('hidden', document.getElementById('prodCat').value !== '__new__');
        };

        window.addNewCategory = () => {
            const val = document.getElementById('newCatInput').value.trim();
            if (!val) return;
            if (!productCategories.includes(val)) productCategories.push(val);
            updateProdCatSelect();
            document.getElementById('prodCat').value = val;
            document.getElementById('newCatRow').classList.add('hidden');
            document.getElementById('newCatInput').value = '';
        };

        window.generateProductCode = async () => {
            try {
                const snap = await getDocs(collection(db, "products"));
                let maxCode = 1000;
                snap.forEach(d => {
                    const code = d.data().code;
                    if (code && code.startsWith('#')) { const num = parseInt(code.replace('#', '')); if (num > maxCode) maxCode = num; }
                });
                document.getElementById('prodCode').value = '#' + (maxCode + 1);
            } catch (e) { document.getElementById('prodCode').value = '#' + (Math.floor(Math.random() * 9000) + 1000); }
        };

        function getCategoryIcon(cat) { return CAT_ICONS[cat] || { icon: 'fa-utensils', class: 'cat-other' }; }

        async function loadPosProducts() {
            const box = document.getElementById('posProducts');
            box.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;"><div class="spin"></div><p style="color:#aaa;margin-top:15px;">جاري التحميل...</p></div>';
            try {
                const snap = await getDocs(collection(db, "products"));
                allProducts = [];
                if (snap.empty) {
                    const defaults = [
                        { code: "#1001", name: "تشكن بروست 2 قطع", price: 165, category: "تشكن" },
                        { code: "#1002", name: "تشكن بروست 4 قطع", price: 289, category: "تشكن" },
                        { code: "#1003", name: "تشكن بروست 8 قطع", price: 589, category: "تشكن" },
                        { code: "#1015", name: "هوت هاني تشكن رانش", price: 185, category: "تشكن" },
                        { code: "#1022", name: "بطاطس مقلية باكيت", price: 45, category: "سايدز" },
                        { code: "#1023", name: "بطاطس مقلية فاميلي", price: 79, category: "سايدز" },
                        { code: "#1027", name: "موزاريلا ستيكس 4 قطع", price: 59, category: "سايدز" },
                        { code: "#1029", name: "شريحة تركي مدخن", price: 20, category: "سايدز" },
                        { code: "#1037", name: "تشكن تشيز برجر", price: 150, category: "برجر" },
                        { code: "#1038", name: "بيف تشيز برجر", price: 150, category: "برجر" }
                    ];
                    for (const p of defaults) await addDoc(collection(db, "products"), { ...p, createdAt: serverTimestamp() });
                    await loadPosProducts();
                    return;
                }
                snap.forEach(d => { const p = d.data(); p.id = d.id; allProducts.push(p); });
                currentSearchQuery = '';
                const searchInput = document.getElementById('productSearch');
                if (searchInput) searchInput.value = '';
                renderCategoryTabs();
                renderProductsGrid();
            } catch (e) {
                console.error('loadPosProducts error:', e);
                box.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa;"><i class="fas fa-exclamation-circle" style="font-size:40px;margin-bottom:10px;"></i><p>خطأ في تحميل المنتجات</p></div>';
            }
        }

        let currentSearchQuery = '';

        function renderProductsGrid() {
            const box = document.getElementById('posProducts');
            try {
                let filtered = allProducts;
                // Category filter
                if (currentFilter !== 'all') {
                    filtered = filtered.filter(p => p.category === currentFilter);
                }
                // Search filter (instant)
                if (currentSearchQuery.trim()) {
                    const q = currentSearchQuery.trim().toLowerCase();
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
                    const catData = getCategoryIcon(p.category);
                    const price = p.price != null ? p.price : 0;
                    const name = p.name || 'منتج بدون اسم';
                    const code = p.code || '';
                    html += `<div class="product-card" onclick="addToCart('${p.id}')">
                        <div class="cat-img ${catData.class}"><i class="fas ${catData.icon}"></i><span class="cat-label">${p.category || 'أخرى'}</span></div>
                        <div class="prod-body"><div class="code">${code}</div><div class="name">${name}</div><div class="price">${price} <span>ج.م</span></div></div>
                    </div>`;
                });
                box.innerHTML = html;
                if (isMonitorOnly) setTimeout(applyMonitorMode, 100);
            } catch (e) {
                console.error('renderProductsGrid error:', e);
                box.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#aaa;"><i class="fas fa-exclamation-circle" style="font-size:40px;margin-bottom:10px;"></i><p>خطأ في عرض المنتجات</p></div>';
            }
        }

        window.filterProducts = () => {
            const input = document.getElementById('productSearch');
            currentSearchQuery = input ? input.value : '';
            renderProductsGrid();
        };

        function renderCategoryTabs() {
            const container = document.getElementById('catTabs');
            if (!container) return;
            let html = `<div class="cat-tab ${currentFilter === 'all' ? 'active' : ''}" onclick="filterByCategory('all', this)"><i class="fas fa-th-large"></i> الكل</div>`;
            productCategories.forEach(cat => {
                const catData = getCategoryIcon(cat);
                html += `<div class="cat-tab ${currentFilter === cat ? 'active' : ''}" onclick="filterByCategory('${cat}', this)"><i class="fas ${catData.icon}"></i> ${cat}</div>`;
            });
            container.innerHTML = html;
        }

        window.filterByCategory = (cat, el) => {
            currentFilter = cat;
            document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
            if (el) el.classList.add('active');
            else if (event && event.currentTarget) event.currentTarget.classList.add('active');
            renderProductsGrid();
        };

        window.addToCart = (pid) => {
            const p = allProducts.find(x => x.id === pid);
            if (!p) return;
            const existing = cart.find(x => x.id === pid);
            if (existing) {
                existing.qty++;
            } else {
                cart.push({ id: pid, name: p.name, price: p.price, qty: 1, note: '' });
            }
            renderCart();
        };

        window.changeQty = (pid, delta) => {
            const item = cart.find(x => x.id === pid);
            if (!item) return;
            item.qty += delta;
            if (item.qty <= 0) cart = cart.filter(x => x.id !== pid);
            renderCart();
        };

        window.removeFromCart = (pid) => { cart = cart.filter(x => x.id !== pid); renderCart(); };

        let noteTargetItemId = null;

        window.addNoteToCartItem = (pid) => {
            const item = cart.find(x => x.id === pid);
            if (!item) return;
            noteTargetItemId = pid;
            document.getElementById('customNoteInput').value = item.note || '';
            document.getElementById('noteModal').classList.add('show');
        };

        window.closeNoteModal = () => {
            document.getElementById('noteModal').classList.remove('show');
            noteTargetItemId = null;
        };

        window.selectQuickNote = (note) => {
            const input = document.getElementById('customNoteInput');
            const current = input.value.trim();
            if (current) {
                input.value = current + '\n' + note;
            } else {
                input.value = note;
            }
            input.focus();
        };

        window.saveNote = () => {
            if (!noteTargetItemId) return;
            const note = document.getElementById('customNoteInput').value.trim();
            const item = cart.find(x => x.id === noteTargetItemId);
            if (item) {
                item.note = note;
                renderCart();
            }
            closeNoteModal();
        };

        window.clearNote = () => {
            if (!noteTargetItemId) return;
            const item = cart.find(x => x.id === noteTargetItemId);
            if (item) {
                item.note = '';
                renderCart();
            }
            closeNoteModal();
        };
        window.clearCart = () => { cart = []; renderCart(); };

        // ========== CART SUMMARY CALCULATIONS ==========
        function getCartCalculations() {
            const subTotal = cart.reduce((s, i) => s + (i.price * i.qty), 0);
            const discountPercent = parseFloat(document.getElementById('discountPercent').value) || 0;
            const discountAmount = Math.round((subTotal * discountPercent) / 100);
            const deliveryFee = parseFloat(document.getElementById('summaryDeliveryFee').value) || 0;
            const finalTotal = Math.max(0, subTotal + deliveryFee - discountAmount);
            const paidAmount = parseFloat(document.getElementById('summaryPaid').value) || 0;
            const remaining = paidAmount - finalTotal;
            return { subTotal, discountPercent, discountAmount, deliveryFee, finalTotal, paidAmount, remaining };
        }

        window.updateCartSummary = () => {
            const calc = getCartCalculations();
            document.getElementById('summarySubTotal').textContent = calc.subTotal.toLocaleString('ar-EG') + ' ج.م';
            document.getElementById('summaryDiscount').textContent = calc.discountAmount.toLocaleString('ar-EG') + ' ج.م';
            document.getElementById('summaryFinalTotal').textContent = calc.finalTotal.toLocaleString('ar-EG') + ' ج.م';
            document.getElementById('summaryRemaining').textContent = calc.remaining.toLocaleString('ar-EG') + ' ج.م';
            document.getElementById('summaryRemaining').style.color = calc.remaining >= 0 ? 'var(--success)' : 'var(--danger)';
        };

        window.selectCartPayment = (method) => {
            cartPaymentMethod = method;
            document.querySelectorAll('.pay-toggle-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('pay' + method.charAt(0).toUpperCase() + method.slice(1)).classList.add('active');
            const paidInput = document.getElementById('summaryPaid');
            if (method === 'delivery') {
                const currentFee = parseFloat(document.getElementById('summaryDeliveryFee').value) || 0;
                if (currentFee === 0) document.getElementById('summaryDeliveryFee').value = 15;
            }
            if (method !== 'cash') {
                const calc = getCartCalculations();
                paidInput.value = calc.finalTotal;
                paidInput.readOnly = true;
                paidInput.style.background = '#f0f0f0';
            } else {
                paidInput.readOnly = false;
                paidInput.style.background = 'white';
            }
            updateCartSummary();
        };

        function renderCart() {
            const box = document.getElementById('cartItems');
            const btn = document.getElementById('checkoutBtn');
            if (cart.length === 0) {
                box.innerHTML = '<div class="empty" style="padding:30px 0;"><i class="fas fa-cart-plus" style="font-size:40px;color:#eee;"></i><p>اضغط على منتج لإضافته</p></div>';
                btn.disabled = true;
                document.getElementById('cartCount').textContent = '(0)';
                document.getElementById('discountPercent').value = 0;
                document.getElementById('summaryDeliveryFee').value = 0;
                document.getElementById('summaryPaid').value = 0;
                updateCartSummary();
                const holdBtn0 = document.getElementById('holdBtn');
                if (holdBtn0) holdBtn0.disabled = true;
                return;
            }
            let html = '';
            cart.forEach(item => {
                const itemTotal = item.price * item.qty;
                const noteLines = item.note ? item.note.toString().split(/\n|\r/).map(l => l.trim()).filter(l => l) : [];
                const noteDisplay = noteLines.length ? `<div style="font-size:11px;color:var(--warning);margin-top:2px;font-weight:700;line-height:1.4;">${noteLines.map(l => `<div><i class="fas fa-sticky-note" style="font-size:9px;margin-left:3px;"></i> ${l}</div>`).join('')}</div>` : '';
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
            document.getElementById('cartCount').textContent = '(' + cart.reduce((s, i) => s + i.qty, 0) + ')';
            updateCartSummary();
            // Check sell permission
            if (!checkPerm('pos_sell')) {
                btn.disabled = true;
                btn.textContent = 'لا يوجد صلاحية بيع';
                btn.style.background = '#888';
            } else {
                btn.disabled = false;
            }
            const holdBtn1 = document.getElementById('holdBtn');
            if (holdBtn1) {
                if (!checkPerm('pending_resume')) {
                    holdBtn1.disabled = true;
                    holdBtn1.style.background = '#888';
                } else {
                    holdBtn1.disabled = false;
                }
            }
        }

        async function getNextInvoiceNumber() {
            const counterRef = doc(db, "settings", "invoiceCounter");
            try {
                const result = await runTransaction(db, async (transaction) => {
                    const snap = await transaction.get(counterRef);
                    let current = 1;
                    if (snap.exists()) current = (snap.data().value || 0) + 1;
                    transaction.set(counterRef, { value: current, updatedAt: serverTimestamp() });
                    return current;
                });
                return result;
            } catch (e) { return Math.floor(Math.random() * 900000) + 100000; }
        }

        window.checkout = async () => {
            if (!requirePerm('pos_sell', 'إتمام البيع')) return;
            if (cart.length === 0) return;
            if (cartPaymentMethod !== 'cash') {
                const calcAuto = getCartCalculations();
                document.getElementById('summaryPaid').value = calcAuto.finalTotal;
            }
            const calc = getCartCalculations();
            if (cartPaymentMethod === 'cash' && calc.remaining < 0) { alert('المبلغ المدفوع غير كافٍ!'); return; }

            const btn = document.getElementById('checkoutBtn');
            btn.disabled = true;
            btn.textContent = 'جاري الحفظ...';

            const items = cart.map(i => ({ name: i.name, price: i.price, qty: i.qty, total: i.price * i.qty, note: (i.note || '').toString() }));
            try {
                const invoiceNumber = await getNextInvoiceNumber();
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
                    paymentMethod: cartPaymentMethod,
                    itemCount: cart.reduce((s, i) => s + i.qty, 0),
                    cashierId: currentUser.uid,
                    cashierName: userData?.fullName || currentUser.email,
                    createdAt: serverTimestamp()
                });
                showInvoice(invRef.id, invoiceNumber, items, calc);
                cart = [];
                document.getElementById('discountPercent').value = 0;
                document.getElementById('summaryDeliveryFee').value = 0;
                document.getElementById('summaryPaid').value = 0;
                renderCart();
                loadStats();
                btn.textContent = 'إتمام البيع وطباعة';
            } catch (e) {
                alert('خطأ: ' + e.message);
                btn.disabled = false;
                btn.textContent = 'إتمام البيع وطباعة';
            }
        };

        // ========== INVOICE PRINT - MATCHING IMAGE 2 ==========
        function showInvoice(invId, invoiceNumber, items, calc) {
            const modal = document.getElementById('invoiceModal');
            const box = document.getElementById('invoiceDetailContent');
            const now = new Date();
            const dateStr = now.toLocaleDateString('ar-EG');
            const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
            const payLabels = { cash: 'كاش', visa: 'فيزا', delivery: 'ديليفري' };
            const payMethodLabel = payLabels[cartPaymentMethod] || cartPaymentMethod;

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
                    كاشير: ${userData?.fullName || currentUser.email}
                </div>
                <table class="inv-table">
                    <thead>
                        <tr><th>اسم الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
                    </thead>
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

        // ========== EDIT INVOICE FUNCTIONS ==========
let currentEditInvoice = null;
let currentEditItems = [];

window.openEditInvoiceModal = async (id) => {
    if (!requirePerm('invoices_edit', 'تعديل الفواتير')) return;

    const d = await getDoc(doc(db, "invoices", id));
    if (!d.exists()) { alert('الفاتورة غير موجودة'); return; }

    currentEditInvoice = { id: d.id, ...d.data() };
    currentEditItems = JSON.parse(JSON.stringify(currentEditInvoice.items || []));

    document.getElementById('editInvoiceId').value = d.id;
    document.getElementById('editInvoiceNum').value = '#' + (currentEditInvoice.invoiceNumber || d.id.slice(-6));
    document.getElementById('editInvoiceDate').value = currentEditInvoice.createdAt ? new Date(currentEditInvoice.createdAt.toDate()).toLocaleString('ar-EG') : '-';
    document.getElementById('editInvoiceDiscount').value = currentEditInvoice.discountPercent || 0;
    document.getElementById('editInvoiceDelivery').value = currentEditInvoice.deliveryFee || 0;
    document.getElementById('editInvoiceReason').value = '';
    document.getElementById('editInvoiceNote').value = '';

    renderEditInvoiceItems();
    recalcEditInvoice();
    document.getElementById('editInvoiceModal').classList.add('show');
};

window.closeEditInvoiceModal = () => {
    document.getElementById('editInvoiceModal').classList.remove('show');
    currentEditInvoice = null;
    currentEditItems = [];
};

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

window.changeEditItemQty = (idx, delta) => {
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
};

window.removeEditItem = (idx) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج من الفاتورة؟')) return;
    currentEditItems.splice(idx, 1);
    renderEditInvoiceItems();
    recalcEditInvoice();
};

window.recalcEditInvoice = () => {
    const subTotal = currentEditItems.reduce((s, i) => s + (i.price * i.qty), 0);
    const discountPercent = parseFloat(document.getElementById('editInvoiceDiscount').value) || 0;
    const discountAmount = Math.round((subTotal * discountPercent) / 100);
    const deliveryFee = parseFloat(document.getElementById('editInvoiceDelivery').value) || 0;
    const total = Math.max(0, subTotal + deliveryFee - discountAmount);

    document.getElementById('editInvoiceSubTotal').textContent = subTotal.toLocaleString('ar-EG') + ' ج.م';
    document.getElementById('editInvoiceDiscountAmt').textContent = discountAmount.toLocaleString('ar-EG') + ' ج.م';
    document.getElementById('editInvoiceTotal').textContent = total.toLocaleString('ar-EG') + ' ج.م';
};

window.openAddProductToInvoice = () => {
    document.getElementById('addProdToInvModal').classList.add('show');
    document.getElementById('addProdSearch').value = '';
    document.getElementById('addProdResults').innerHTML = '<div class="empty" style="padding:20px;"><i class="fas fa-search" style="font-size:30px;color:#eee;"></i><p>ابحث عن منتج لإضافته</p></div>';
    document.getElementById('addProdSearch').focus();
};

window.closeAddProdToInvModal = () => {
    document.getElementById('addProdToInvModal').classList.remove('show');
};

window.filterAddProdSearch = () => {
    const q = document.getElementById('addProdSearch').value.trim().toLowerCase();
    const box = document.getElementById('addProdResults');
    if (!q) {
        box.innerHTML = '<div class="empty" style="padding:20px;"><i class="fas fa-search" style="font-size:30px;color:#eee;"></i><p>ابحث عن منتج لإضافته</p></div>';
        return;
    }
    const filtered = allProducts.filter(p => {
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
};

window.addProductToCurrentEdit = (pid) => {
    const p = allProducts.find(x => x.id === pid);
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
};

window.saveInvoiceEdit = async () => {
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
        editedBy: currentUser.uid,
        editedByName: userData?.fullName || currentUser.email,
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
            lastEditedBy: currentUser.uid
        });
        alert('تم تعديل الفاتورة بنجاح\nالسبب: ' + reason + (noteText ? '\nملاحظة: ' + noteText : ''));
        closeEditInvoiceModal();
        loadInvoicesTable();
        loadStats();
    } catch (e) {
        alert('خطأ في الحفظ: ' + e.message);
    }
};

// ========== END EDIT INVOICE FUNCTIONS ==========

window.printInvoiceSingle = async () => {
            const invId = document.querySelector('.invoice-print-wrap')?.id;
            if (invId) {
                // Mark as printed in DB
                const allInvs = await getDocs(query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(1)));
                allInvs.forEach(d => {
                    setDoc(doc(db, "invoices", d.id), { printed: true, printedAt: serverTimestamp() }, { merge: true });
                });
            }
            window.print();
        };

        window.printInvoiceFromModal = async () => {
            if (!requirePerm('invoices_print', 'طباعة الفواتير')) return;
            const allInvs = await getDocs(query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(1)));
            allInvs.forEach(d => { setDoc(doc(db, "invoices", d.id), { printed: true, printedAt: serverTimestamp(), copies: 1 }, { merge: true }); });
            window.print();
        };

        window.printInvoiceDoubleFromModal = async () => {
            if (!requirePerm('invoices_print', 'طباعة الفواتير')) return;
            const wrap = document.getElementById('printInvoice');
            if (!wrap) return;
            const clone = wrap.cloneNode(true);
            const separator = document.createElement('div');
            separator.innerHTML = '<div style="border-top:2px dashed #333;margin:15px 0;text-align:center;font-size:10px;color:#888;padding:5px;">--- نسخة ثانية ---</div>';
            wrap.parentNode.insertBefore(separator, wrap.nextSibling);
            wrap.parentNode.insertBefore(clone, separator.nextSibling);

            const allInvs = await getDocs(query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(1)));
            allInvs.forEach(d => { setDoc(doc(db, "invoices", d.id), { printed: true, printedAt: serverTimestamp(), copies: 2 }, { merge: true }); });

            setTimeout(() => {
                window.print();
                setTimeout(() => { separator.remove(); clone.remove(); }, 1000);
            }, 300);
        };

        window.printInvoiceFromTable = async (id) => {
            if (!requirePerm('invoices_print', 'طباعة الفواتير')) return;
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
            cartPaymentMethod = inv.paymentMethod || 'cash';
            showInvoice(d.id, inv.invoiceNumber || d.id.slice(-6), inv.items || [], calc);
            setTimeout(() => {
                window.print();
                setDoc(doc(db, "invoices", id), { printed: true, printedAt: serverTimestamp() }, { merge: true });
            }, 600);
        };

        window.closeInvoiceModal = () => { document.getElementById('invoiceModal').classList.remove('show'); };

        window.openProductModal = () => {
            if (!requirePerm('products_add', 'إضافة منتج')) return;
            document.getElementById('productModal').classList.add('show'); generateProductCode();
        };
        window.closeProductModal = () => {
            document.getElementById('productModal').classList.remove('show');
            document.getElementById('prodCode').value = '';
            document.getElementById('prodName').value = '';
            document.getElementById('prodPrice').value = '';
            document.getElementById('newCatInput').value = '';
            document.getElementById('newCatRow').classList.add('hidden');
            document.getElementById('prodModalTitle').textContent = 'إضافة منتج جديد';
        };
        window.saveProduct = async () => {
            if (!requirePerm('products_add', 'إضافة منتج')) return;
            const code = document.getElementById('prodCode').value.trim();
            const name = document.getElementById('prodName').value.trim();
            const price = parseFloat(document.getElementById('prodPrice').value);
            let cat = document.getElementById('prodCat').value;
            if (cat === '__new__') cat = document.getElementById('newCatInput').value.trim() || 'أخرى';
            if (!name || !price) { alert('املأ البيانات'); return; }
            await addDoc(collection(db, "products"), { code: code || '', name, price, category: cat, createdAt: serverTimestamp(), createdBy: currentUser.uid });
            closeProductModal();
            await loadProductsTable();
            await loadPosProducts();
            await loadStats();
            await loadCategories();
        };

        async function loadProductsTable() {
            const tbody = document.getElementById('productsBody');
            tbody.innerHTML = '<tr><td colspan="6" class="empty"><div class="spin"></div></td></tr>';
            try {
                const snap = await getDocs(collection(db, "products"));
                if (snap.empty) { tbody.innerHTML = '<tr><td colspan="6" class="empty"><i class="fas fa-utensils"></i><p>لا توجد منتجات</p></td></tr>'; return; }
                let html = '';
                snap.forEach(d => {
                    const p = d.data();
                    let actions = '';
                    if (isAdmin || checkPerm('products_edit')) {
                        actions += `<button class="btn btn-sec" onclick="editProduct('${d.id}')" style="padding:5px 10px;"><i class="fas fa-edit"></i></button>`;
                    }
                    if (isAdmin || checkPerm('products_delete')) {
                        actions += `<button class="btn btn-red" onclick="deleteProduct('${d.id}')" style="padding:5px 10px;"><i class="fas fa-trash"></i></button>`;
                    }
                    html += `<tr><td><strong>${p.code || '-'}</strong></td><td><strong>${p.name}</strong></td><td style="color:var(--primary);font-weight:800;">${p.price} ج.م</td><td>${p.category || '-'}</td><td><span class="tag tag-grn">متاح</span></td><td><div style="display:flex;gap:4px;flex-wrap:wrap;">${actions}</div></td></tr>`;
                });
                tbody.innerHTML = html;
            } catch (e) { tbody.innerHTML = '<tr><td colspan="6" class="empty">خطأ</td></tr>'; }
        }

        window.deleteProduct = async (id) => {
            if (!requirePerm('products_delete', 'حذف المنتجات')) return;
            if (!confirm('هل أنت متأكد؟')) return;
            await deleteDoc(doc(db, "products", id));
            loadProductsTable(); loadPosProducts(); loadStats();
        };
        let editingProductId = null;

        window.editProduct = async (id) => {
            if (!requirePerm('products_edit', 'تعديل المنتجات')) return;
            editingProductId = id;
            try {
                const d = await getDoc(doc(db, "products", id));
                if (!d.exists()) { alert('المنتج غير موجود'); return; }
                const p = d.data();
                document.getElementById('editProdId').value = id;
                document.getElementById('editProdCode').value = p.code || '';
                document.getElementById('editProdName').value = p.name || '';
                document.getElementById('editProdPrice').value = p.price || '';

                // Ensure category exists in select
                const catSelect = document.getElementById('editProdCat');
                updateEditProdCatSelect();
                if (productCategories.includes(p.category)) {
                    catSelect.value = p.category;
                } else if (p.category) {
                    // Add to categories if missing
                    productCategories.push(p.category);
                    updateEditProdCatSelect();
                    catSelect.value = p.category;
                } else {
                    catSelect.value = 'أخرى';
                }
                document.getElementById('editNewCatRow').classList.add('hidden');
                document.getElementById('editNewCatInput').value = '';

                document.getElementById('editProductModal').classList.add('show');
            } catch (e) {
                alert('خطأ في تحميل بيانات المنتج: ' + e.message);
            }
        };

        window.closeEditProductModal = () => {
            document.getElementById('editProductModal').classList.remove('show');
            editingProductId = null;
            document.getElementById('editProdId').value = '';
            document.getElementById('editProdCode').value = '';
            document.getElementById('editProdName').value = '';
            document.getElementById('editProdPrice').value = '';
            document.getElementById('editNewCatInput').value = '';
            document.getElementById('editNewCatRow').classList.add('hidden');
        };

        window.onEditProdCatChange = () => {
            document.getElementById('editNewCatRow').classList.toggle('hidden', document.getElementById('editProdCat').value !== '__new__');
        };

        function updateEditProdCatSelect() {
            const sel = document.getElementById('editProdCat');
            const current = sel.value;
            sel.innerHTML = '';
            productCategories.forEach(c => { const opt = document.createElement('option'); opt.value = c; opt.textContent = c; sel.appendChild(opt); });
            const newOpt = document.createElement('option'); newOpt.value = '__new__'; newOpt.textContent = '+ فئة جديدة'; sel.appendChild(newOpt);
            if (productCategories.includes(current)) sel.value = current;
        }

        window.addNewEditCategory = () => {
            const val = document.getElementById('editNewCatInput').value.trim();
            if (!val) return;
            if (!productCategories.includes(val)) productCategories.push(val);
            updateEditProdCatSelect();
            document.getElementById('editProdCat').value = val;
            document.getElementById('editNewCatRow').classList.add('hidden');
            document.getElementById('editNewCatInput').value = '';
        };

        window.saveProductEdit = async () => {
            if (!editingProductId) return;
            if (!requirePerm('products_edit', 'تعديل المنتجات')) return;
            const name = document.getElementById('editProdName').value.trim();
            const price = parseFloat(document.getElementById('editProdPrice').value);
            let cat = document.getElementById('editProdCat').value;
            if (cat === '__new__') cat = document.getElementById('editNewCatInput').value.trim() || 'أخرى';
            if (!name || !price) { alert('املأ البيانات'); return; }
            try {
                await setDoc(doc(db, "products", editingProductId), {
                    name,
                    price,
                    category: cat,
                    updatedAt: serverTimestamp(),
                    updatedBy: currentUser.uid
                }, { merge: true });
                alert('تم تعديل المنتج بنجاح');
                closeEditProductModal();
                await loadProductsTable();
                await loadPosProducts();
                await loadCategories();
            } catch (e) {
                alert('خطأ في الحفظ: ' + e.message);
            }
        };

        async function loadInvoicesTable() {
            const tbody = document.getElementById('invoicesBody');
            tbody.innerHTML = '<tr><td colspan="10" class="empty"><div class="spin"></div></td></tr>';
            try {
                const q = query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(100));
                const snap = await getDocs(q);
                if (snap.empty) { tbody.innerHTML = '<tr><td colspan="10" class="empty"><i class="fas fa-receipt"></i><p>لا توجد فواتير</p></td></tr>'; return; }
                let html = '';
                snap.forEach(d => {
                    const inv = d.data();
                    const invNum = inv.invoiceNumber || d.id.slice(-6);
                    const date = inv.createdAt ? new Date(inv.createdAt.toDate()).toLocaleString('ar-EG') : '-';
                    const payLabels = { cash: 'كاش', visa: 'فيزا', delivery: 'ديليفري' };
                    const payTag = inv.paymentMethod === 'cash' ? 'tag-grn' : inv.paymentMethod === 'visa' ? 'tag-blu' : 'tag-ylw';
                    let viewBtn = '';
                    let editBtn = '';
                    let printBtn = '';
                    let deleteBtn = '';
                    if (isAdmin || checkPerm('invoices_view')) {
                        viewBtn = `<button class="btn btn-sec" onclick="viewInvoice('${d.id}')" style="padding:5px 10px;" title="عرض"><i class="fas fa-eye"></i></button>`;
                    }
                    if (isAdmin || checkPerm('invoices_edit')) {
                        editBtn = ` <button class="btn btn-warn" onclick="openEditInvoiceModal('${d.id}')" style="padding:5px 10px;" title="تعديل"><i class="fas fa-edit"></i></button>`;
                    }
                    if (isAdmin || checkPerm('invoices_print')) {
                        printBtn = ` <button class="btn btn-blu" onclick="printInvoiceFromTable('${d.id}')" style="padding:5px 10px;" title="طباعة"><i class="fas fa-print"></i></button>`;
                    }
                    if (isAdmin || checkPerm('invoices_delete')) {
                        deleteBtn = ` <button class="btn btn-red" onclick="deleteInvoice('${d.id}')" style="padding:5px 10px;" title="حذف"><i class="fas fa-trash"></i></button>`;
                    }
                    html += `<tr><td style="text-align:center;"><input type="checkbox" class="inv-select" value="${d.id}"></td><td><strong>#${invNum}</strong></td><td>${date}</td><td>${inv.itemCount || 0} عنصر</td><td style="color:var(--primary);font-weight:800;">${inv.subTotal || inv.total || 0} ج.م</td><td>${inv.deliveryFee || 0} ج.م</td><td style="color:var(--success);">${inv.discountAmount || 0} ج.م</td><td style="font-weight:800;">${inv.total || 0} ج.م</td><td><span class="tag ${payTag}">${payLabels[inv.paymentMethod] || inv.paymentMethod}</span></td><td>${inv.cashierName || '-'}</td><td><div style="display:flex;gap:4px;flex-wrap:wrap;">${viewBtn}${editBtn}${printBtn}${deleteBtn}</div></td></tr>`;
                });
                tbody.innerHTML = html;
            } catch (e) { tbody.innerHTML = '<tr><td colspan="10" class="empty">خطأ</td></tr>'; }
        }

        window.viewInvoice = async (id) => {
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
            cartPaymentMethod = inv.paymentMethod || 'cash';
            showInvoice(d.id, inv.invoiceNumber || d.id.slice(-6), inv.items || [], calc);
        };
        window.deleteInvoice = async (id) => {
            if (!requirePerm('invoices_delete', 'حذف الفواتير')) return;
            if (!confirm('هل أنت متأكد من حذف الفاتورة؟')) return;
            await deleteDoc(doc(db, "invoices", id));
            loadInvoicesTable(); loadStats();
        };

        window.resetInvoiceCounter = async () => {
            // FIX: Available to all users with settings_edit permission
            if (!requirePerm('settings_edit', 'إعادة ترقيم الفواتير')) return;
            if (!confirm('هل أنت متأكد من إعادة ترقيم الفواتير من 1؟')) return;
            try {
                await setDoc(doc(db, "settings", "invoiceCounter"), { value: 0, resetAt: serverTimestamp(), resetBy: currentUser.uid });
                alert('تم إعادة ضبط الترقيم. الفاتورة القادمة ستكون رقم 1.');
            } catch (e) { alert('خطأ: ' + e.message); }
        };

        window.printDayReport = () => {
            if (!requirePerm('reports_print', 'طباعة تقرير اليوم')) return;
            window.print();
        };
        window.printReports = () => {
            if (!requirePerm('reports_print', 'طباعة التقارير')) return;
            window.print();
        };
        window.printLoginLog = () => { window.print(); };

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

                    // Date filter check
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
                    // Add summary row
                    html += `<tr style="background:#f8f9fa;font-weight:800;border-top:2px solid var(--dark);"><td>الإجمالي</td><td>${filteredCount}</td><td style="color:var(--primary);">${filteredTotal.toLocaleString('ar-EG')} ج.م</td><td>${filteredCount > 0 ? Math.round(filteredTotal / filteredCount).toLocaleString('ar-EG') : 0} ج.م</td></tr>`;
                    dailyBody.innerHTML = html;
                }
                // Update report page stats
                document.getElementById('repStSales').textContent = todaySales;
                document.getElementById('repStRevenue').textContent = todayRevenue.toLocaleString('ar-EG') + ' ج.م';
                document.getElementById('repStProducts').textContent = allProducts.length;
                document.getElementById('repStInvoices').textContent = invSnap.size;
            } catch (e) { console.error(e); }
        }

        window.openUserModal = () => {
            if (!isAdmin) { alert('للمدير فقط'); return; }
            if (!requirePerm('users_add', 'إضافة مستخدم')) return;
            document.getElementById('userModal').classList.add('show');
            toggleUserDays();
        };
        window.closeUserModal = () => {
            document.getElementById('userModal').classList.remove('show');
            document.getElementById('userName').value = '';
            document.getElementById('userEmail').value = '';
            document.getElementById('userPass').value = '';
            document.getElementById('userRole').value = 'cashier';
            document.getElementById('userDays').value = '30';
        };
        window.toggleUserDays = () => {
            const role = document.getElementById('userRole').value;
            if (role === 'admin') {
                document.getElementById('userDaysRow').classList.add('hidden');
                document.getElementById('adminNoteRow').classList.remove('hidden');
            } else {
                document.getElementById('userDaysRow').classList.remove('hidden');
                document.getElementById('adminNoteRow').classList.add('hidden');
            }
        };
        window.saveUser = async () => {
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
        };

        window.openEditUserModal = async (uid) => {
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
        };

        window.closeEditUserModal = () => {
            document.getElementById('editUserModal').classList.remove('show');
            document.getElementById('editUserId').value = '';
        };

        window.toggleEditUserDays = () => {
            const role = document.getElementById('editUserRole').value;
            if (role === 'admin') {
                document.getElementById('editUserDaysRow').classList.add('hidden');
                document.getElementById('editAdminNoteRow').classList.remove('hidden');
            } else {
                document.getElementById('editUserDaysRow').classList.remove('hidden');
                document.getElementById('editAdminNoteRow').classList.add('hidden');
            }
        };

        window.togglePerm = (el) => {
            const cb = el.querySelector('input[type="checkbox"]');
            cb.checked = !cb.checked;
            el.classList.toggle('active', cb.checked);
            console.log('Permission toggled:', cb.value, cb.checked); // Debug
        };

        window.updateUser = async () => {
            if (!isAdmin) { alert('للمدير فقط'); return; }
            if (!requirePerm('users_edit', 'تعديل مستخدم')) return;
            const uid = document.getElementById('editUserId').value;
            if (!uid) return;
            const name = document.getElementById('editUserName').value.trim();
            const role = document.getElementById('editUserRole').value;
            const status = document.getElementById('editUserStatus').value;
            const days = parseInt(document.getElementById('editUserDays').value);
            if (!name) { alert('الاسم مطلوب'); return; }

            // Gather permissions from checkboxes - ALL checkboxes
            const perms = {};
            document.querySelectorAll('#editUserPerms input[type="checkbox"]').forEach(cb => { 
                perms[cb.value] = cb.checked; 
            });
            // Ensure change_password is included
            const cpCb = document.getElementById('perm_change_password');
            if (cpCb) perms.change_password = cpCb.checked;
            console.log('Saving permissions:', perms); // Debug

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
        };

        window.toggleUserStatus = async (uid, currentStatus) => {
            if (!isAdmin) { alert('للمدير فقط'); return; }
            if (!requirePerm('users_edit', 'تعديل حالة المستخدم')) return;
            const newStatus = currentStatus === 'active' ? 'disabled' : 'active';
            const action = newStatus === 'active' ? 'تفعيل' : 'تعطيل';
            if (!confirm(`هل تريد ${action} هذا الحساب؟`)) return;
            try {
                await setDoc(doc(db, "users", uid), { status: newStatus, statusUpdatedAt: serverTimestamp(), statusUpdatedBy: currentUser.uid }, { merge: true });
                loadUsersTable();
            } catch (e) { alert('خطأ: ' + e.message); }
        };

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
                            acts += `<button class="btn btn-sec" onclick="openEditUserModal('${d.id}')" title="تعديل"><i class="fas fa-edit"></i></button>`;
                        }
                        if (!isAdminUser && (isAdmin || checkPerm('users_edit'))) {
                            acts += `<button class="btn ${isActive ? 'btn-red' : 'btn-grn'}" onclick="toggleUserStatus('${d.id}', '${u.status}')" title="${isActive ? 'تعطيل' : 'تفعيل'}"><i class="fas fa-power-off"></i></button>`;
                            acts += `<button class="btn btn-grn" onclick="extendUser('${d.id}')" title="تمديد"><i class="fas fa-calendar-plus"></i></button>`;
                            acts += `<button class="btn btn-warn" onclick="forceLogoutUser('${d.id}')" title="إغلاق الجلسة"><i class="fas fa-ban"></i></button>`;
                        }
                        if (isAdmin || checkPerm('users_delete')) {
                            acts += `<button class="btn btn-red" onclick="deleteUser('${d.id}')" title="حذف"><i class="fas fa-trash"></i></button>`;
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

        window.extendUser = async (uid) => {
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
        };

        window.deleteUser = async (id) => {
            if (!isAdmin) return;
            if (!requirePerm('users_delete', 'حذف مستخدم')) return;
            if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع!')) return;
            await deleteDoc(doc(db, "users", id));
            loadUsersTable(); loadStats();
        };

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
                document.getElementById('repStSales').textContent = todaySales;
                document.getElementById('repStRevenue').textContent = todayRevenue.toLocaleString('ar-EG') + ' ج.م';
                document.getElementById('repStProducts').textContent = prodSnap.size;
                document.getElementById('repStInvoices').textContent = invSnap.size;
            } catch (e) { }
        }


        // ========== PENDING INVOICES SYSTEM ==========
        let pendingUnsub = null;

        function listenPendingBadge() {
            if (!currentUser) return;
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

        window.holdInvoice = async () => {
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
        };

        window.openPendingModal = async () => {
            if (!checkPerm('pending')) { alert('ليس لديك صلاحية الوصول للفواتير المعلقة'); return; }
            document.getElementById('pendingModal').classList.add('show');
            await loadPendingInvoices();
        };

        window.closePendingModal = () => {
            document.getElementById('pendingModal').classList.remove('show');
        };

        window.loadPendingInvoices = async () => {
            const tbody = document.getElementById('pendingBody');
            tbody.innerHTML = '<tr><td colspan="6" class="empty"><div class="spin"></div></td></tr>';
            try {
                let q;
                if (isAdmin) q = query(collection(db, "pending_invoices"), orderBy("createdAt", "desc"));
                else {
                    // FIX: No orderBy to avoid Firestore composite index requirement
                    q = query(collection(db, "pending_invoices"), where("cashierId", "==", currentUser.uid));
                }
                const snap = await getDocs(q);
                if (snap.empty) { tbody.innerHTML = '<tr><td colspan="6" class="empty"><i class="fas fa-pause-circle"></i><p>لا توجد فواتير معلقة</p></td></tr>'; return; }

                // FIX: Sort in JavaScript for non-admin users (no orderBy in query)
                let docs = [];
                snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
                docs.sort((a, b) => {
                    const aTime = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
                    const bTime = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
                    return bTime - aTime;
                });

                let html = '', count = 0;
                docs.forEach(p => {
                    count++;
                    const d = p;
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
                                <button class="btn btn-grn" onclick="resumePendingInvoice('${d.id}')" style="padding:5px 10px;"><i class="fas fa-play"></i> استعادة</button>
                                <button class="btn btn-blu" onclick="printPendingInvoice('${d.id}')" style="padding:5px 10px;"><i class="fas fa-print"></i> طباعة</button>
                                <button class="btn btn-red" onclick="deletePendingInvoice('${d.id}')" style="padding:5px 10px;"><i class="fas fa-trash"></i> حذف</button>
                            </div>
                        </td>
                    </tr>`;
                });
                tbody.innerHTML = html;
            } catch (e) { tbody.innerHTML = '<tr><td colspan="6" class="empty">خطأ</td></tr>'; }
        };

        window.resumePendingInvoice = async (id) => {
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
        };

        window.printPendingInvoice = async (id) => {
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
        };

        window.deletePendingInvoice = async (id) => {
            if (!requirePerm('pending_delete', 'حذف فاتورة معلقة')) return;
            if (!confirm('هل أنت متأكد من حذف الفاتورة المعلقة؟')) return;
            await deleteDoc(doc(db, "pending_invoices", id));
            loadPendingInvoices();
        };

        // ========== BULK INVOICE ACTIONS ==========
        window.toggleSelectAllInvoices = () => {
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
        };

        window.getSelectedInvoices = () => {
            return Array.from(document.querySelectorAll('.inv-select:checked')).map(cb => cb.value);
        };

        window.printSelectedInvoices = async () => {
            const ids = getSelectedInvoices();
            if (ids.length === 0) { alert('اختر فواتير أولاً'); return; }
            if (!requirePerm('invoices_print', 'طباعة الفواتير')) return;
            for (const id of ids) {
                await printInvoiceFromTable(id);
                await new Promise(r => setTimeout(r, 1200));
            }
        };

        window.deleteSelectedInvoices = async () => {
            const ids = getSelectedInvoices();
            if (ids.length === 0) { alert('اختر فواتير أولاً'); return; }
            if (!requirePerm('invoices_delete', 'حذف الفواتير')) return;
            if (!confirm(`هل أنت متأكد من حذف ${ids.length} فاتورة؟`)) return;
            for (const id of ids) await deleteDoc(doc(db, "invoices", id));
            loadInvoicesTable(); loadStats();
        };

        window.exportSelectedToPDF = async () => {
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
        };

        window.doLogout = async () => {
            if (currentSessionId) {
                try { await setDoc(doc(db, "login_log", currentSessionId), { type: 'logout', logoutAt: serverTimestamp() }, { merge: true }); } catch (e) { console.error(e); }
            }
            // CRITICAL: Clear currentSessionId from Firestore so other devices can login
            if (currentUser) await setDoc(doc(db, "users", currentUser.uid), { 
                forceLogout: false, 
                currentSessionId: null,
                lastSeen: serverTimestamp()
            }, { merge: true });
            localStorage.removeItem('baron_session_id');
            if (maintenanceUnsub) maintenanceUnsub();
            await signOut(auth);
            window.location.href = "https://zadelrahmanzad-boop.github.io/baron1/";
        };
    

        // ========== QZ TRAY PRINTER INTEGRATION ==========
        let qzPrinter = localStorage.getItem('qzPrinter') || null;
        let qzConnected = false;
        let qzPrinterCopies = parseInt(localStorage.getItem('qzPrinterCopies') || '2');
        let qzPaperWidth = localStorage.getItem('qzPaperWidth') || '58';
        if (qzPrinter) { document.getElementById('printerStatusDot').style.background = '#27ae60'; }

        window.openPrinterModal = () => {
            document.getElementById('printerModal').classList.add('show');
            document.getElementById('printerSelect').value = qzPrinter || '';
            document.getElementById('printerCopies').value = qzPrinterCopies;
            document.getElementById('paperWidth').value = qzPaperWidth;
            if (qzConnected) updateQZStatus('متصل', 'var(--success)');
        };
        window.closePrinterModal = () => { document.getElementById('printerModal').classList.remove('show'); };

        window.connectQZ = async () => {
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
                document.getElementById('printerStatusDot').style.background = '#27ae60';
            } catch (e) {
                updateQZStatus('فشل: ' + e.message, 'var(--danger)');
                btn.disabled = false; btn.innerHTML = '<i class="fas fa-plug"></i> إعادة توصيل';
                alert('مش قادر أتواصل مع QZ Tray.\n\n1. تأكد إن البرنامج شغال على الجهاز\n2. جرّب تفتحه كـ Administrator\n3. لو مش مثبّت: https://qz.io');
            }
        };
        function updateQZStatus(text, color) {
            const el = document.getElementById('qzStatus');
            el.textContent = text; el.style.color = color || '#888';
        }
        window.savePrinterSettings = () => {
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
                document.getElementById('printerStatusDot').style.background = '#27ae60';
                alert('تم حفظ إعدادات الطابعة: ' + qzPrinter);
                closePrinterModal();
            } else { alert('اختر طابعة الأول'); }
        };
        if (qzPrinter) { setTimeout(() => { connectQZ().catch(() => {}); }, 2000); }

        // Override autoPrintDouble to use QZ if available
        window.autoPrintDouble = async () => {
            if (qzConnected && qzPrinter) {
                try {
                    const original = document.getElementById('printInvoice');
                    if (!original) return;
                    const styleTag = document.querySelector('style');
                    const cssText = styleTag ? styleTag.innerText : '';
                    const paperW = qzPaperWidth === 'A4' ? '210mm' : qzPaperWidth + 'mm';
                    const htmlContent = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>@page { size: ${paperW} auto; margin: 0; } body { margin: 0; padding: 0; font-family: 'Cairo', sans-serif; width: ${paperW}; direction: rtl; font-weight: 900; } .page-break { page-break-after: always; height: 0; display: block; } ${cssText}</style></head><body style="margin:0;padding:0;direction:rtl;width:${paperW};font-weight:900;">${original.outerHTML}<div class="page-break"></div>${original.outerHTML}
    <!-- Pending Invoices Modal -->
    <div class="modal-bg" id="pendingModal">
        <div class="modal-box wide">
            <button class="modal-close" onclick="closePendingModal()">&times;</button>
            <h2><i class="fas fa-pause-circle" style="color:var(--warning);"></i> الفواتير المعلقة</h2>
            <table>
                <thead><tr><th>#</th><th>الوقت</th><th>العناصر</th><th>المجموع</th><th>الكاشير</th><th>إجراءات</th></tr></thead>
                <tbody id="pendingBody"><tr><td colspan="6" class="empty"><div class="spin"></div></td></tr></tbody>
            </table>
        </div>
    </div>

</body></html>`;
                    const config = qz.configs.create(qzPrinter, { copies: qzPrinterCopies });
                    await qz.print(config, [{ type: 'html', format: 'plain', data: htmlContent }]);
                    const allInvs = await getDocs(query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(1)));
                    allInvs.forEach(d => { setDoc(doc(db, "invoices", d.id), { printed: true, printedAt: serverTimestamp(), copies: qzPrinterCopies, printer: qzPrinter }, { merge: true }); });
                    return;
                } catch (e) { console.error('QZ Print failed, falling back to iframe:', e); }
            }
            const original = document.getElementById('printInvoice');
            if (!original) return;
            const iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
            document.body.appendChild(iframe);
            const doc = iframe.contentWindow.document;
            const styleTag = document.querySelector('style');
            const cssText = styleTag ? styleTag.innerText : '';
            doc.open();
            doc.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>@page { size: 58mm auto; margin: 0; } body { margin: 0; padding: 0; font-family: 'Cairo', sans-serif; width: 58mm; direction: rtl; font-weight: 900; } .page-break { page-break-after: always; height: 0; display: block; } ${cssText}</style></head><body style="margin:0;padding:0;direction:rtl;width:58mm;font-weight:900;">${original.outerHTML}<div class="page-break"></div>${original.outerHTML}
    <!-- Pending Invoices Modal -->
    <div class="modal-bg" id="pendingModal">
        <div class="modal-box wide">
            <button class="modal-close" onclick="closePendingModal()">&times;</button>
            <h2><i class="fas fa-pause-circle" style="color:var(--warning);"></i> الفواتير المعلقة</h2>
            <table>
                <thead><tr><th>#</th><th>الوقت</th><th>العناصر</th><th>المجموع</th><th>الكاشير</th><th>إجراءات</th></tr></thead>
                <tbody id="pendingBody"><tr><td colspan="6" class="empty"><div class="spin"></div></td></tr></tbody>
            </table>
        </div>
    </div>

</body></html>`);
            doc.close();
            setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); setTimeout(() => iframe.remove(), 3000); }, 600);
        };



// ==================== EXPOSE FUNCTIONS TO WINDOW FOR HTML ONCLICK ====================
window.toggleSidebar = toggleSidebar;
window.navTo = navTo;
window.loadPosProducts = loadPosProducts;
window.filterProducts = filterProducts;
window.filterByCategory = filterByCategory;
window.addToCart = addToCart;
window.changeQty = changeQty;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.addNoteToCartItem = addNoteToCartItem;
window.closeNoteModal = closeNoteModal;
window.selectQuickNote = selectQuickNote;
window.saveNote = saveNote;
window.clearNote = clearNote;
window.updateCartSummary = updateCartSummary;
window.selectCartPayment = selectCartPayment;
window.checkout = checkout;
window.holdInvoice = holdInvoice;
window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.saveProduct = saveProduct;
window.loadProductsTable = loadProductsTable;
window.deleteProduct = deleteProduct;
window.editProduct = editProduct;
window.closeEditProductModal = closeEditProductModal;
window.saveProductEdit = saveProductEdit;
window.generateProductCode = generateProductCode;
window.onProdCatChange = onProdCatChange;
window.addNewCategory = addNewCategory;
window.onEditProdCatChange = onEditProdCatChange;
window.addNewEditCategory = addNewEditCategory;
window.loadInvoicesTable = loadInvoicesTable;
window.viewInvoice = viewInvoice;
window.deleteInvoice = deleteInvoice;
window.resetInvoiceCounter = resetInvoiceCounter;
window.printInvoiceFromModal = printInvoiceFromModal;
window.printInvoiceDoubleFromModal = printInvoiceDoubleFromModal;
window.printInvoiceFromTable = printInvoiceFromTable;
window.closeInvoiceModal = closeInvoiceModal;
window.openEditInvoiceModal = openEditInvoiceModal;
window.closeEditInvoiceModal = closeEditInvoiceModal;
window.changeEditItemQty = changeEditItemQty;
window.removeEditItem = removeEditItem;
window.recalcEditInvoice = recalcEditInvoice;
window.openAddProductToInvoice = openAddProductToInvoice;
window.closeAddProdToInvModal = closeAddProdToInvModal;
window.filterAddProdSearch = filterAddProdSearch;
window.addProductToCurrentEdit = addProductToCurrentEdit;
window.saveInvoiceEdit = saveInvoiceEdit;
window.toggleSelectAllInvoices = toggleSelectAllInvoices;
window.printSelectedInvoices = printSelectedInvoices;
window.deleteSelectedInvoices = deleteSelectedInvoices;
window.exportSelectedToPDF = exportSelectedToPDF;
window.loadReports = loadReports;
window.printDayReport = printDayReport;
window.printReports = printReports;
window.printLoginLog = printLoginLog;
window.switchUserTab = switchUserTab;
window.openUserModal = openUserModal;
window.closeUserModal = closeUserModal;
window.toggleUserDays = toggleUserDays;
window.saveUser = saveUser;
window.openEditUserModal = openEditUserModal;
window.closeEditUserModal = closeEditUserModal;
window.toggleEditUserDays = toggleEditUserDays;
window.togglePerm = togglePerm;
window.updateUser = updateUser;
window.toggleUserStatus = toggleUserStatus;
window.extendUser = extendUser;
window.deleteUser = deleteUser;
window.loadUsersTable = loadUsersTable;
window.loadLoginLog = loadLoginLog;
window.openPendingModal = openPendingModal;
window.closePendingModal = closePendingModal;
window.loadPendingInvoices = loadPendingInvoices;
window.resumePendingInvoice = resumePendingInvoice;
window.printPendingInvoice = printPendingInvoice;
window.deletePendingInvoice = deletePendingInvoice;
window.openChangePassModal = openChangePassModal;
window.closeChangePassModal = closeChangePassModal;
window.changePassword = changePassword;
window.openPrinterModal = openPrinterModal;
window.closePrinterModal = closePrinterModal;
window.connectQZ = connectQZ;
window.savePrinterSettings = savePrinterSettings;
window.doLogout = doLogout;
window.forceLogout = forceLogout;
window.enableMaintenanceMode = enableMaintenanceMode;
window.disableMaintenanceMode = disableMaintenanceMode;
window.forceLogoutUser = forceLogoutUser;
