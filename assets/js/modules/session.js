// ============================================
// BARON POS - Session Management
// ============================================

import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from '../firebase-config.js';
import { state } from '../utils/state.js';

export async function recordLogin(uid) {
    try {
        // Generate unique session ID
        const sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('baron_session_id', sessionId);
        state.currentSessionId = sessionId;

        // Write to Firestore
        await setDoc(doc(db, "users", uid), {
            lastSeen: serverTimestamp(),
            currentSessionId: sessionId
        }, { merge: true });

        // Add to login log
        const { addDoc, collection } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        await addDoc(collection(db, "login_log"), {
            userId: uid,
            userName: state.userData?.fullName || state.currentUser?.email || '',
            userEmail: state.currentUser?.email || '',
            type: 'login',
            loginAt: serverTimestamp(),
            logoutAt: null,
            sessionDuration: null,
            sessionId: sessionId,
            userAgent: navigator.userAgent.substring(0, 100),
            ip: 'unknown'
        });
    } catch (e) {
        console.error('Record login error:', e);
    }
}

export async function updateLastSeen() {
    if (!state.currentUser) return;
    await setDoc(doc(db, "users", state.currentUser.uid), {
        lastSeen: serverTimestamp(),
        currentSessionId: state.currentSessionId || localStorage.getItem('baron_session_id')
    }, { merge: true });
}

// Browser event handlers for session cleanup
export function initSessionHandlers() {
    window.addEventListener('beforeunload', () => {
        if (state.currentUser) {
            setDoc(doc(db, "users", state.currentUser.uid), {
                isLoggedIn: false,
                lastSeen: serverTimestamp()
            }, { merge: true }).catch(() => {});
        }
    });

    window.addEventListener('pagehide', () => {
        if (state.currentUser) {
            setDoc(doc(db, "users", state.currentUser.uid), {
                isLoggedIn: false
            }, { merge: true }).catch(() => {});
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && state.currentUser) {
            setDoc(doc(db, "users", state.currentUser.uid), {
                lastSeen: serverTimestamp()
            }, { merge: true }).catch(() => {});
        }
    });
}
