// ============================================
// BARON POS - Firebase Configuration
// ============================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDf_FZ5dDhJCYag9EpEblgylTrxber7oks",
    authDomain: "cashier-52332.firebaseapp.com",
    projectId: "cashier-52332",
    storageBucket: "cashier-52332.firebasestorage.app",
    messagingSenderId: "708122460779",
    appId: "1:708122460779:web:5c0fb2f36488aa6ae3272e",
    measurementId: "G-8BLM2L0LN5"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
