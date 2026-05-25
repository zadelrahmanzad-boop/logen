// ============================================
// BARON POS - Firebase Helper Functions
// ============================================

import {
    collection, getDocs, doc, getDoc, deleteDoc, addDoc, setDoc,
    serverTimestamp, query, orderBy, limit, runTransaction, where,
    onSnapshot, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from '../firebase-config.js';

// Generic CRUD Operations
export async function getCollection(collectionName, options = {}) {
    try {
        const { orderByField = 'createdAt', orderDirection = 'desc', limitCount = null, whereClauses = [] } = options;

        let q = collection(db, collectionName);
        let constraints = [];

        // Apply where clauses
        whereClauses.forEach(clause => {
            constraints.push(where(clause.field, clause.op, clause.value));
        });

        // Apply ordering
        if (orderByField) {
            constraints.push(orderBy(orderByField, orderDirection));
        }

        // Apply limit
        if (limitCount) {
            constraints.push(limit(limitCount));
        }

        const finalQuery = query(q, ...constraints);
        const snap = await getDocs(finalQuery);

        const results = [];
        snap.forEach(d => results.push({ id: d.id, ...d.data() }));
        return results;
    } catch (error) {
        console.error(`Error fetching ${collectionName}:`, error);
        throw error;
    }
}

export async function getDocument(collectionName, docId) {
    try {
        const d = await getDoc(doc(db, collectionName, docId));
        return d.exists() ? { id: d.id, ...d.data() } : null;
    } catch (error) {
        console.error(`Error fetching document ${docId}:`, error);
        throw error;
    }
}

export async function addDocument(collectionName, data) {
    try {
        const docRef = await addDoc(collection(db, collectionName), {
            ...data,
            createdAt: serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        console.error(`Error adding to ${collectionName}:`, error);
        throw error;
    }
}

export async function updateDocument(collectionName, docId, data) {
    try {
        await setDoc(doc(db, collectionName, docId), {
            ...data,
            updatedAt: serverTimestamp()
        }, { merge: true });
        return true;
    } catch (error) {
        console.error(`Error updating ${docId}:`, error);
        throw error;
    }
}

export async function deleteDocument(collectionName, docId) {
    try {
        await deleteDoc(doc(db, collectionName, docId));
        return true;
    } catch (error) {
        console.error(`Error deleting ${docId}:`, error);
        throw error;
    }
}

// Transaction for atomic operations
export async function runAtomicUpdate(docPath, updateFn) {
    try {
        const docRef = doc(db, docPath);
        return await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(docRef);
            return updateFn(transaction, snap, docRef);
        });
    } catch (error) {
        console.error('Transaction error:', error);
        throw error;
    }
}

// Listen to real-time updates
export function listenToCollection(collectionName, callback, options = {}) {
    const { whereClauses = [], orderByField = 'createdAt', orderDirection = 'desc' } = options;

    let constraints = [];
    whereClauses.forEach(clause => {
        constraints.push(where(clause.field, clause.op, clause.value));
    });
    if (orderByField) constraints.push(orderBy(orderByField, orderDirection));

    const q = query(collection(db, collectionName), ...constraints);
    return onSnapshot(q, (snap) => {
        const results = [];
        snap.forEach(d => results.push({ id: d.id, ...d.data() }));
        callback(results);
    }, (error) => {
        console.error(`Listen error on ${collectionName}:`, error);
    });
}

// Get next invoice number atomically
export async function getNextInvoiceNumber() {
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
    } catch (e) {
        console.error('Invoice counter error:', e);
        return Math.floor(Math.random() * 900000) + 100000;
    }
}
