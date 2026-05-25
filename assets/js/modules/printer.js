// ============================================
// BARON POS - Printer & QZ Tray Integration
// ============================================

let qzPrinter = localStorage.getItem('qzPrinter') || null;
let qzConnected = false;
let qzPrinterCopies = parseInt(localStorage.getItem('qzPrinterCopies') || '2');
let qzPaperWidth = localStorage.getItem('qzPaperWidth') || '58';

if (qzPrinter) {
    const dot = document.getElementById('printerStatusDot');
    if (dot) dot.style.background = '#27ae60';
}

export function openPrinterModal() {
    document.getElementById('printerModal').classList.add('show');
    document.getElementById('printerSelect').value = qzPrinter || '';
    document.getElementById('printerCopies').value = qzPrinterCopies;
    document.getElementById('paperWidth').value = qzPaperWidth;
    if (qzConnected) updateQZStatus('متصل', 'var(--success)');
}

export function closePrinterModal() {
    document.getElementById('printerModal').classList.remove('show');
}

export async function connectQZ() {
    const btn = document.getElementById('btnConnectQZ');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري التوصيل...';

    try {
        if (typeof qz === 'undefined') {
            throw new Error('مكتبة QZ Tray غير محملة');
        }
        if (!qz.websocket.isActive()) {
            await qz.websocket.connect();
        }
        qzConnected = true;
        updateQZStatus('متصل', 'var(--success)');

        const printers = await qz.printers.find();
        const sel = document.getElementById('printerSelect');
        sel.innerHTML = '<option value="">-- اختر طابعة --</option>';
        printers.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            if (p === qzPrinter) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> متصل';
        btn.style.background = 'var(--success)';

        const dot = document.getElementById('printerStatusDot');
        if (dot) dot.style.background = '#27ae60';
    } catch (e) {
        updateQZStatus('فشل: ' + e.message, 'var(--danger)');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-plug"></i> إعادة توصيل';
        alert('مش قادر أتواصل مع QZ Tray.

1. تأكد إن البرنامج شغال على الجهاز
2. جرّب تفتحه كـ Administrator
3. لو مش مثبّت: https://qz.io');
    }
}

function updateQZStatus(text, color) {
    const el = document.getElementById('qzStatus');
    if (el) {
        el.textContent = text;
        el.style.color = color || '#888';
    }
}

export function savePrinterSettings() {
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

        const dot = document.getElementById('printerStatusDot');
        if (dot) dot.style.background = '#27ae60';
        alert('تم حفظ إعدادات الطابعة: ' + qzPrinter);
        closePrinterModal();
    } else {
        alert('اختر طابعة الأول');
    }
}

export async function autoPrintDouble() {
    if (qzConnected && qzPrinter) {
        try {
            const original = document.getElementById('printInvoice');
            if (!original) return;

            const styleTag = document.querySelector('style');
            const cssText = styleTag ? styleTag.innerText : '';
            const paperW = qzPaperWidth === 'A4' ? '210mm' : qzPaperWidth + 'mm';

            const htmlContent = `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>@page { size: ${paperW} auto; margin: 0; } body { margin: 0; padding: 0; font-family: 'Cairo', sans-serif; width: ${paperW}; direction: rtl; font-weight: 900; } .page-break { page-break-after: always; height: 0; display: block; } ${cssText}</style></head><body style="margin:0;padding:0;direction:rtl;width:${paperW};font-weight:900;">${original.outerHTML}<div class="page-break"></div>${original.outerHTML}</body></html>`;

            const config = qz.configs.create(qzPrinter, { copies: qzPrinterCopies });
            await qz.print(config, [{ type: 'html', format: 'plain', data: htmlContent }]);

            const { collection, query, orderBy, limit, getDocs, doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
            const { db } = await import('../firebase-config.js');
            const allInvs = await getDocs(query(collection(db, "invoices"), orderBy("createdAt", "desc"), limit(1)));
            allInvs.forEach(d => {
                setDoc(doc(db, "invoices", d.id), { printed: true, printedAt: serverTimestamp(), copies: qzPrinterCopies, printer: qzPrinter }, { merge: true });
            });
            return;
        } catch (e) {
            console.error('QZ Print failed, falling back to iframe:', e);
        }
    }

    // Fallback: iframe print
    const original = document.getElementById('printInvoice');
    if (!original) return;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    const styleTag = document.querySelector('style');
    const cssText = styleTag ? styleTag.innerText : '';

    doc.open();
    doc.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><style>@page { size: 58mm auto; margin: 0; } body { margin: 0; padding: 0; font-family: 'Cairo', sans-serif; width: 58mm; direction: rtl; font-weight: 900; } .page-break { page-break-after: always; height: 0; display: block; } ${cssText}</style></head><body style="margin:0;padding:0;direction:rtl;width:58mm;font-weight:900;">${original.outerHTML}<div class="page-break"></div>${original.outerHTML}</body></html>`);
    doc.close();

    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => iframe.remove(), 3000);
    }, 600);
}

// Auto-connect on load
if (qzPrinter) {
    setTimeout(() => { connectQZ().catch(() => {}); }, 2000);
}
