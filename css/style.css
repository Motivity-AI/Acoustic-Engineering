/* ============================================================
   Acoustic Engineering — css/style.css
   Base styles for all pages
   ============================================================ */

* { box-sizing: border-box; }

html, body {
    margin: 0;
    padding: 0;
    font-family: "Cairo", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

body {
    background: #080b12;
    color: #f4f7fb;
    min-height: 100vh;
    direction: rtl;
}

/* ============================================================
   Layout
============================================================ */
.container { width: min(1400px, 100%); margin: 0 auto; padding: 0 20px; }
.row { display: flex; flex-wrap: wrap; gap: 16px; }
.col { flex: 1; min-width: 0; }

/* ============================================================
   Buttons
============================================================ */
button {
    font-family: inherit;
    cursor: pointer;
    border: 0;
    background: transparent;
    color: inherit;
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 44px;
    padding: 0 20px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    transition: all 0.2s ease;
    text-decoration: none;
}

.btn-primary {
    background: linear-gradient(135deg, #e60012, #a5000e);
    color: #fff;
    box-shadow: 0 10px 30px rgba(230, 0, 18, 0.22);
}

.btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 14px 40px rgba(230, 0, 18, 0.32);
}

.btn-secondary {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #fff;
}

.btn-secondary:hover {
    background: rgba(255, 255, 255, 0.09);
    border-color: rgba(56, 189, 248, 0.35);
}

.btn-ghost {
    background: transparent;
    color: #a8b3c2;
    padding: 0 12px;
}

.btn-ghost:hover { color: #fff; background: rgba(255,255,255,.05); }

.btn-sm { height: 36px; padding: 0 14px; font-size: 12px; }
.btn-lg { height: 54px; padding: 0 28px; font-size: 15px; }
.btn-block { width: 100%; }

/* ============================================================
   Forms
============================================================ */
input, select, textarea {
    font-family: inherit;
    width: 100%;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.03);
    color: #f4f7fb;
    border-radius: 10px;
    padding: 11px 14px;
    font-size: 13px;
    outline: none;
    transition: all 0.2s ease;
}

input:focus, select:focus, textarea:focus {
    border-color: rgba(56, 189, 248, 0.5);
    background: rgba(56, 189, 248, 0.04);
    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.08);
}

input::placeholder, textarea::placeholder { color: #59626e; }

label {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    color: #c9d1dc;
    font-weight: 600;
}

.form-group { margin-bottom: 16px; }

/* ============================================================
   Cards & Panels
============================================================ */
.card {
    background: #10151f;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 20px;
}

.panel {
    background: #10151f;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    overflow: hidden;
}

.panel-header {
    padding: 14px 18px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.panel-body { padding: 18px; }

/* ============================================================
   Badges & Tags
============================================================ */
.badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
}

.badge-blue { background: rgba(56,189,248,.12); color: #8fd4ff; }
.badge-green { background: rgba(34,197,94,.12); color: #6ee7a1; }
.badge-red { background: rgba(230,0,18,.12); color: #ff8c97; }
.badge-yellow { background: rgba(245,158,11,.12); color: #fbbf24; }
.badge-purple { background: rgba(167,139,250,.12); color: #c4b5fd; }
.badge-gray { background: rgba(255,255,255,.05); color: #9ca3af; }

/* ============================================================
   Tables
============================================================ */
.table-wrap { width: 100%; overflow-x: auto; }

table { width: 100%; border-collapse: collapse; font-size: 12px; }

th, td {
    padding: 11px 12px;
    text-align: right;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

th {
    color: #8792a3;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.02);
    font-size: 11px;
}

tbody tr:hover { background: rgba(255, 255, 255, 0.02); }

/* ============================================================
   Modals
============================================================ */
.modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
}

.modal-overlay.active,
.modal-overlay.show {
    display: flex;
}

.modal {
    width: min(560px, 100%);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #10151f;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5);
    animation: modalIn 0.2s ease;
}

@keyframes modalIn {
    from { opacity: 0; transform: translateY(10px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
}

.modal-header {
    min-height: 60px;
    padding: 14px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-header h3 { margin: 0; font-size: 16px; }

.modal-close {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    color: #8792a3;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    cursor: pointer;
}

.modal-close:hover { color: #fff; background: rgba(255, 255, 255, 0.1); }

.modal-body {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
}

.modal-footer {
    padding: 14px 20px;
    display: flex;
    justify-content: flex-start;
    gap: 8px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
}

/* ============================================================
   Toast
============================================================ */
#toastContainer,
.toast-container {
    position: fixed;
    left: 20px;
    bottom: 20px;
    z-index: 7000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
}

.toast {
    min-width: 260px;
    max-width: 380px;
    padding: 12px 16px;
    border-radius: 10px;
    background: #111821;
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #dce5ef;
    font-size: 12px;
    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.35);
    animation: toastIn 0.25s ease;
    pointer-events: auto;
}

.toast.success { border-color: rgba(34, 197, 94, 0.3); }
.toast.error { border-color: rgba(230, 0, 18, 0.3); }
.toast.warning { border-color: rgba(245, 158, 11, 0.3); }
.toast.info { border-color: rgba(56, 189, 248, 0.3); }

@keyframes toastIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
}

/* ============================================================
   Spinner & Loading
============================================================ */
.spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.1);
    border-top-color: #38bdf8;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 12px;
}

@keyframes spin { to { transform: rotate(360deg); } }

.loading-overlay {
    position: fixed;
    inset: 0;
    z-index: 9000;
    display: none;
    align-items: center;
    justify-content: center;
    background: rgba(5, 7, 10, 0.88);
    backdrop-filter: blur(8px);
}

.loading-overlay.active { display: flex; }

.loading-card {
    padding: 30px;
    border-radius: 16px;
    background: #10151f;
    border: 1px solid rgba(255, 255, 255, 0.1);
    text-align: center;
    min-width: 260px;
}

/* ============================================================
   Utilities
============================================================ */
.hidden { display: none !important; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-left { text-align: left; }

.mt-1 { margin-top: 8px; } .mt-2 { margin-top: 16px; } .mt-3 { margin-top: 24px; } .mt-4 { margin-top: 32px; }
.mb-1 { margin-bottom: 8px; } .mb-2 { margin-bottom: 16px; } .mb-3 { margin-bottom: 24px; }

.flex { display: flex; }
.flex-center { display: flex; align-items: center; justify-content: center; }
.flex-between { display: flex; align-items: center; justify-content: space-between; }
.gap-1 { gap: 8px; } .gap-2 { gap: 16px; } .gap-3 { gap: 24px; }

/* ============================================================
   Responsive
============================================================ */
@media (max-width: 768px) {
    .container { padding: 0 14px; }
    .modal { width: 100%; }
    .btn { padding: 0 16px; font-size: 12px; }
}
