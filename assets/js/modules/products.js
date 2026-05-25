// ============================================
// BARON POS - Products Management Module
// ============================================

import {
    collection, getDocs, doc, getDoc, deleteDoc, addDoc, setDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from '../firebase-config.js';
import { state } from '../utils/state.js';
import { CAT_ICONS } from '../utils/constants.js';

// Load categories from products
export async function loadCategories() {
    try {
        const snap = await getDocs(collection(db, "products"));
        const cats = new Set(state.productCategories);
        snap.forEach(d => { const c = d.data().category; if (c) cats.add(c); });
        state.productCategories = Array.from(cats);
        updateProdCatSelect();
        updateEditProdCatSelect();
    } catch (e) { console.error('loadCategories error:', e); }
}

// Update product category select
export function updateProdCatSelect() {
    const sel = document.getElementById('prodCat');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '';
    state.productCategories.forEach(c => {
        const opt = document.createElement('option'); opt.value = c; opt.textContent = c; sel.appendChild(opt);
    });
    const newOpt = document.createElement('option'); newOpt.value = '__new__'; newOpt.textContent = '+ فئة جديدة'; sel.appendChild(newOpt);
    if (state.productCategories.includes(current)) sel.value = current;
}

// Update edit product category select
export function updateEditProdCatSelect() {
    const sel = document.getElementById('editProdCat');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '';
    state.productCategories.forEach(c => {
        const opt = document.createElement('option'); opt.value = c; opt.textContent = c; sel.appendChild(opt);
    });
    const newOpt = document.createElement('option'); newOpt.value = '__new__'; newOpt.textContent = '+ فئة جديدة'; sel.appendChild(newOpt);
    if (state.productCategories.includes(current)) sel.value = current;
}

// Generate product code
export async function generateProductCode() {
    try {
        const snap = await getDocs(collection(db, "products"));
        let maxCode = 1000;
        snap.forEach(d => {
            const code = d.data().code;
            if (code && code.startsWith('#')) {
                const num = parseInt(code.replace('#', ''));
                if (num > maxCode) maxCode = num;
            }
        });
        document.getElementById('prodCode').value = '#' + (maxCode + 1);
    } catch (e) {
        document.getElementById('prodCode').value = '#' + (Math.floor(Math.random() * 9000) + 1000);
    }
}

// Add new category
export function addNewCategory() {
    const val = document.getElementById('newCatInput').value.trim();
    if (!val) return;
    if (!state.productCategories.includes(val)) state.productCategories.push(val);
    updateProdCatSelect();
    document.getElementById('prodCat').value = val;
    document.getElementById('newCatRow').classList.add('hidden');
    document.getElementById('newCatInput').value = '';
}

// Add new category in edit mode
export function addNewEditCategory() {
    const val = document.getElementById('editNewCatInput').value.trim();
    if (!val) return;
    if (!state.productCategories.includes(val)) state.productCategories.push(val);
    updateEditProdCatSelect();
    document.getElementById('editProdCat').value = val;
    document.getElementById('editNewCatRow').classList.add('hidden');
    document.getElementById('editNewCatInput').value = '';
}

// Load products table
export async function loadProductsTable() {
    const tbody = document.getElementById('productsBody');
    tbody.innerHTML = '<tr><td colspan="6" class="empty"><div class="spin"></div></td></tr>';

    try {
        const snap = await getDocs(collection(db, "products"));
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty"><i class="fas fa-utensils"></i><p>لا توجد منتجات</p></td></tr>';
            return;
        }

        let html = '';
        snap.forEach(d => {
            const p = d.data();
            let actions = '';
            if (state.isAdmin || state.checkPerm('products_edit')) {
                actions += `<button class="btn btn-sec" onclick="editProduct('${d.id}')" style="padding:5px 10px;"><i class="fas fa-edit"></i></button>`;
            }
            if (state.isAdmin || state.checkPerm('products_delete')) {
                actions += `<button class="btn btn-red" onclick="deleteProduct('${d.id}')" style="padding:5px 10px;"><i class="fas fa-trash"></i></button>`;
            }

            html += `<tr>
                <td><strong>${p.code || '-'}</strong></td>
                <td><strong>${p.name}</strong></td>
                <td style="color:var(--primary);font-weight:800;">${p.price} ج.م</td>
                <td>${p.category || '-'}</td>
                <td><span class="tag tag-grn">متاح</span></td>
                <td><div style="display:flex;gap:4px;flex-wrap:wrap;">${actions}</div></td>
            </tr>`;
        });
        tbody.innerHTML = html;
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">خطأ</td></tr>';
    }
}

// Save new product
export async function saveProduct() {
    if (!state.requirePerm('products_add', 'إضافة منتج')) return;

    const code = document.getElementById('prodCode').value.trim();
    const name = document.getElementById('prodName').value.trim();
    const price = parseFloat(document.getElementById('prodPrice').value);
    let cat = document.getElementById('prodCat').value;
    if (cat === '__new__') cat = document.getElementById('newCatInput').value.trim() || 'أخرى';

    if (!name || !price) { alert('املأ البيانات'); return; }

    await addDoc(collection(db, "products"), {
        code: code || '',
        name,
        price,
        category: cat,
        createdAt: serverTimestamp(),
        createdBy: state.currentUser.uid
    });

    closeProductModal();
    await loadProductsTable();
    const { loadPosProducts } = await import('./pos.js');
    await loadPosProducts();
    const { loadStats } = await import('./dashboard.js');
    await loadStats();
    await loadCategories();
}

// Delete product
export async function deleteProduct(id) {
    if (!state.requirePerm('products_delete', 'حذف المنتجات')) return;
    if (!confirm('هل أنت متأكد؟')) return;

    await deleteDoc(doc(db, "products", id));
    await loadProductsTable();
    const { loadPosProducts } = await import('./pos.js');
    await loadPosProducts();
    const { loadStats } = await import('./dashboard.js');
    await loadStats();
}

// Edit product
export async function editProduct(id) {
    if (!state.requirePerm('products_edit', 'تعديل المنتجات')) return;
    state.editingProductId = id;

    try {
        const d = await getDoc(doc(db, "products", id));
        if (!d.exists()) { alert('المنتج غير موجود'); return; }
        const p = d.data();

        document.getElementById('editProdId').value = id;
        document.getElementById('editProdCode').value = p.code || '';
        document.getElementById('editProdName').value = p.name || '';
        document.getElementById('editProdPrice').value = p.price || '';

        const catSelect = document.getElementById('editProdCat');
        updateEditProdCatSelect();
        if (state.productCategories.includes(p.category)) {
            catSelect.value = p.category;
        } else if (p.category) {
            state.productCategories.push(p.category);
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
}

// Save product edit
export async function saveProductEdit() {
    if (!state.editingProductId) return;
    if (!state.requirePerm('products_edit', 'تعديل المنتجات')) return;

    const name = document.getElementById('editProdName').value.trim();
    const price = parseFloat(document.getElementById('editProdPrice').value);
    let cat = document.getElementById('editProdCat').value;
    if (cat === '__new__') cat = document.getElementById('editNewCatInput').value.trim() || 'أخرى';

    if (!name || !price) { alert('املأ البيانات'); return; }

    try {
        await setDoc(doc(db, "products", state.editingProductId), {
            name,
            price,
            category: cat,
            updatedAt: serverTimestamp(),
            updatedBy: state.currentUser.uid
        }, { merge: true });

        alert('تم تعديل المنتج بنجاح');
        closeEditProductModal();
        await loadProductsTable();
        const { loadPosProducts } = await import('./pos.js');
        await loadPosProducts();
        await loadCategories();
    } catch (e) {
        alert('خطأ في الحفظ: ' + e.message);
    }
}

// Modal controls
export function openProductModal() {
    if (!state.requirePerm('products_add', 'إضافة منتج')) return;
    document.getElementById('productModal').classList.add('show');
    generateProductCode();
}

export function closeProductModal() {
    document.getElementById('productModal').classList.remove('show');
    document.getElementById('prodCode').value = '';
    document.getElementById('prodName').value = '';
    document.getElementById('prodPrice').value = '';
    document.getElementById('newCatInput').value = '';
    document.getElementById('newCatRow').classList.add('hidden');
}

export function closeEditProductModal() {
    document.getElementById('editProductModal').classList.remove('show');
    state.editingProductId = null;
    document.getElementById('editProdId').value = '';
    document.getElementById('editProdCode').value = '';
    document.getElementById('editProdName').value = '';
    document.getElementById('editProdPrice').value = '';
    document.getElementById('editNewCatInput').value = '';
    document.getElementById('editNewCatRow').classList.add('hidden');
}

export function onProdCatChange() {
    document.getElementById('newCatRow').classList.toggle('hidden', document.getElementById('prodCat').value !== '__new__');
}

export function onEditProdCatChange() {
    document.getElementById('editNewCatRow').classList.toggle('hidden', document.getElementById('editProdCat').value !== '__new__');
}
