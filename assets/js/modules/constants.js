// ====== BARON POS - Constants & Configuration ======

export const LOGO_URL = "https://raw.githubusercontent.com/zadelrahmanzad-boop/baron2/refs/heads/main/EL.jpg";
export const LOGIN_URL = "https://zadelrahmanzad-boop.github.io/baron1/";

export const CAT_ICONS = {
    'تشكن': { icon: 'fa-drumstick-bite', class: 'cat-chicken' },
    'برجر': { icon: 'fa-hamburger', class: 'cat-burger' },
    'سايدز': { icon: 'fa-cookie-bite', class: 'cat-sides' },
    'مشروبات': { icon: 'fa-glass-whiskey', class: 'cat-drinks' },
    'أخرى': { icon: 'fa-ellipsis-h', class: 'cat-other' }
};

export const ROLE_NAMES = {
    admin: 'مدير',
    manager: 'مشرف',
    cashier: 'كاشير'
};

export const PAYMENT_LABELS = {
    cash: 'كاش',
    visa: 'فيزا',
    delivery: 'ديليفري'
};

export const PERM_LABELS = {
    pos: 'نقطة البيع',
    pos_sell: 'البيع في POS',
    products: 'المنتجات',
    products_add: 'إضافة منتج',
    products_edit: 'تعديل منتج',
    products_delete: 'حذف منتج',
    invoices: 'الفواتير',
    invoices_view: 'عرض الفواتير',
    invoices_print: 'طباعة الفواتير',
    invoices_delete: 'حذف الفواتير',
    invoices_edit: 'تعديل الفواتير',
    reports: 'التقارير',
    reports_view: 'عرض التقارير',
    reports_print: 'طباعة التقارير',
    users: 'المستخدمين',
    users_view: 'عرض المستخدمين',
    users_add: 'إضافة مستخدم',
    users_edit: 'تعديل مستخدم',
    users_delete: 'حذف مستخدم',
    settings: 'الإعدادات',
    settings_view: 'عرض الإعدادات',
    settings_edit: 'تعديل الإعدادات',
    pending: 'فواتير معلقة',
    pending_view: 'عرض المعلقة',
    pending_resume: 'استعادة معلقة',
    pending_delete: 'حذف معلقة',
    change_password: 'تغيير كلمة السر',
    monitor_only: 'متابعة فقط (بدون بيع)'
};

export const DEFAULT_PERMS = {
    pos: true, pos_sell: true,
    products: true, products_add: true, products_edit: true, products_delete: true,
    invoices: true, invoices_view: true, invoices_print: true, invoices_delete: false, invoices_edit: false,
    reports: true, reports_view: true, reports_print: true,
    users: false, users_view: false, users_add: false, users_edit: false, users_delete: false,
    settings: false, settings_view: false, settings_edit: false,
    pending: true, pending_view: true, pending_resume: true, pending_delete: true,
    change_password: true, monitor_only: false
};

export const ADMIN_PERMS = {
    pos: true, pos_sell: true,
    products: true, products_add: true, products_edit: true, products_delete: true,
    invoices: true, invoices_view: true, invoices_print: true, invoices_delete: true, invoices_edit: true,
    reports: true, reports_view: true, reports_print: true,
    users: true, users_view: true, users_add: true, users_edit: true, users_delete: true,
    settings: true, settings_view: true, settings_edit: true,
    pending: true, pending_view: true, pending_resume: true, pending_delete: true,
    change_password: true, monitor_only: false
};
