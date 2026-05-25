// ====== Firebase Configuration & Initialization ======
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, getDoc, deleteDoc, addDoc, setDoc, serverTimestamp, query, orderBy, limit, runTransaction, where, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db, onAuthStateChanged, signOut, createUserWithEmailAndPassword, 
    EmailAuthProvider, reauthenticateWithCredential, updatePassword,
    collection, getDocs, doc, getDoc, deleteDoc, addDoc, setDoc, serverTimestamp, 
    query, orderBy, limit, runTransaction, where, onSnapshot, updateDoc };
