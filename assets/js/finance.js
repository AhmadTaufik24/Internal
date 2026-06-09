// Import Firestore SDK (V9 Modular) & Auth
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";

// Inisialisasi Database & Auth dari App Firebase Global
const db = getFirestore(window.firebaseApp);
const auth = getAuth(window.firebaseApp); // <-- Inisialisasi Auth
const FINANCE_DOC_REF = doc(db, "finance", "main_data");

let financeData = { accounts: [], transactions: [], categories: {} };

const DEFAULT_ACCOUNTS = [
    { id: 'ACC-1', name: 'Bank BCA', type: 'Bank', isActive: true },
    { id: 'ACC-2', name: 'Bank Mandiri', type: 'Bank', isActive: true },
    { id: 'ACC-4', name: 'Dana', type: 'E-Wallet', isActive: true },
    { id: 'ACC-7', name: 'Cash / Dompet', type: 'Cash', isActive: true }
];

const DEFAULT_CATEGORIES = {
    'income': { 'Penjualan': ['Fotografi', 'Retouch', 'Desain'], 'Lainnya': ['Bonus', 'Refund'] },
    'expense': { 'Operasional': ['Transport', 'Bensin'], 'Konsumsi': ['Makan', 'Minum'], 'Bisnis': ['Peralatan', 'Software'] },
    'titipan': { 'Dana Kelola Client': ['Masuk', 'Keluar'] }
};

let charts = {}; 
let currentFilterMode = 'bulan'; 
let currentRefDate = new Date();
let rangeStart = new Date();
let rangeEnd = new Date();
let breadcrumbs = [{ level: 'dashboard', label: 'Dashboard', filterData: {} }];
let globalSearchQuery = '';

// VAR GLOBAL UNTUK FULL OVERLAY & EXPORT
window.globalCatTotalsIn = {};
window.globalCatTotalsOut = {};
window.lastFilteredTransactions = [];

// ==========================================
// 1. INIT APP & FIREBASE SYNC CLOUD (DENGAN SATPAM AUTH)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Cek status login user
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Kalau udah login, izinkan aplikasi jalan
            initApp();
        } else {
            // Kalau belum login, tendang balik ke halaman utama
            window.location.replace("../index.html"); 
        }
    });
});

function initApp() {
    // Karena login via index.html, kita langsung tampilkan wrapper
    document.getElementById('app-wrapper').style.display = 'flex';
    
    // Load data langsung dari Firestore Cloud
    loadData();
    
    updateDateNavigatorUI();
    switchView('dashboard');
    
    const today = new Date();
    const localDate = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    
    document.getElementById('tx-date').value = localDate;
    document.getElementById('tf-date').value = localDate;

    // Cek parameter URL untuk aksi otomatis
    const urlParams = new URLSearchParams(window.location.search);
    const actionVal = urlParams.get('action');
    if (actionVal === 'income') {
        setTimeout(() => { openTransactionModal('income'); }, 300);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (actionVal === 'expense') {
        setTimeout(() => { openTransactionModal('expense'); }, 300);
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (actionVal === 'assetBreakdown') {
        setTimeout(() => { openAssetBreakdown(); }, 300);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// FUNGSI LOAD REAL-TIME DARI FIRESTORE
function loadData() {
    onSnapshot(FINANCE_DOC_REF, (docSnap) => {
        if (docSnap.exists()) {
            financeData = docSnap.data();
        } else {
            // Kalau database kosong, buat default dan push ke Cloud
            financeData = { accounts: [...DEFAULT_ACCOUNTS], transactions: [], categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)) };
            saveData();
        }
        refreshActiveView();
    }, (error) => {
        console.error("Gagal menarik data dari Cloud:", error);
        showToast("Gagal sinkronisasi data dengan Cloud!", "error");
    });
}

// FUNGSI SAVE KE FIRESTORE
async function saveData() {
    try {
        await setDoc(FINANCE_DOC_REF, financeData);
    } catch (e) {
        console.error("Gagal menyimpan data:", e);
        showToast("Gagal menyimpan ke Cloud!", "error");
    }
}

function parseLocalDate(dateString) {
    if (!dateString) return new Date();
    const parts = dateString.split('-');
    if (parts.length === 3) return new Date(parts[0], parts[1] - 1, parts[2]); 
    return new Date(dateString);
}

// ==========================================
// 2. NAVIGASI, FILTER & KALENDER
// ==========================================
function getWeekRange(date) {
    const d = new Date(date);
    const day = d.getDay(); 
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    const start = new Date(d.setDate(diff));
    start.setHours(0,0,0,0);
    const end = new Date(start);
    end.setDate(end.getDate() + 6); 
    end.setHours(23,59,59,999);
    return { start, end };
}

function refreshActiveView() {
    if (document.getElementById('view-dashboard').style.display === 'block') { 
        renderDashboard(); 
    } else if (document.getElementById('view-kelola').style.display === 'block') { 
        renderKelolaDashboard(); 
    } else if (document.getElementById('view-detail').style.display === 'block') { 
        applyFilters(); 
    } else if (document.getElementById('view-accounts').style.display === 'block') { 
        populateTransferSelects(); 
        renderAccounts(); 
    }
}

function setPeriodFilter(mode) {
    currentFilterMode = mode; 
    currentRefDate = new Date(); 
    if (mode === 'minggu') {
        const range = getWeekRange(currentRefDate);
        rangeStart = range.start;
        rangeEnd = range.end;
    }
    document.querySelectorAll('.period-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + mode).classList.add('active');
    document.querySelector('.date-navigator').style.visibility = mode === 'semua' ? 'hidden' : 'visible';
    updateDateNavigatorUI(); 
    refreshActiveView();
}

function changeDateOffset(offset) {
    if (currentFilterMode === 'hari') { 
        currentRefDate.setDate(currentRefDate.getDate() + offset); 
    } else if (currentFilterMode === 'minggu') { 
        rangeStart.setDate(rangeStart.getDate() + (offset * 7)); 
        rangeEnd.setDate(rangeEnd.getDate() + (offset * 7)); 
    } else if (currentFilterMode === 'bulan') {
        let d = currentRefDate.getDate();
        currentRefDate.setDate(1); 
        currentRefDate.setMonth(currentRefDate.getMonth() + offset);
        let maxDays = new Date(currentRefDate.getFullYear(), currentRefDate.getMonth() + 1, 0).getDate();
        currentRefDate.setDate(Math.min(d, maxDays));
    } else if (currentFilterMode === 'tahun') { 
        currentRefDate.setFullYear(currentRefDate.getFullYear() + offset); 
    }
    updateDateNavigatorUI(); 
    refreshActiveView();
}

function updateDateNavigatorUI() {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
    let label = "", text = "";
    if (currentFilterMode === 'hari') { 
        label = "DAY"; 
        text = currentRefDate.getDate() + " " + monthNames[currentRefDate.getMonth()] + " " + currentRefDate.getFullYear(); 
    } else if (currentFilterMode === 'minggu') { 
        label = "RANGE / WEEK"; 
        const s = rangeStart, e = rangeEnd;
        if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) { 
            text = `${s.getDate()} - ${e.getDate()} ${monthNames[s.getMonth()]} ${s.getFullYear()}`; 
        } else { 
            const yStart = s.getFullYear() === e.getFullYear() ? '' : s.getFullYear() + ' '; 
            text = `${s.getDate()} ${monthNames[s.getMonth()]} ${yStart}- ${e.getDate()} ${monthNames[e.getMonth()]} ${e.getFullYear()}`; 
        }
    } else if (currentFilterMode === 'bulan') { 
        label = "MONTH"; 
        text = monthNames[currentRefDate.getMonth()] + " " + currentRefDate.getFullYear(); 
    } else if (currentFilterMode === 'tahun') { 
        label = "YEAR"; 
        text = currentRefDate.getFullYear(); 
    } else if (currentFilterMode === 'semua') { 
        label = "ALL"; 
        text = "Semua Waktu"; 
    }
    
    document.getElementById('header-period-label').innerText = label; 
    document.getElementById('header-date-text').innerText = text;
}

function openDatePicker() {
    if (currentFilterMode === 'hari') {
        const picker = document.getElementById('hidden-date-picker');
        const y = currentRefDate.getFullYear();
        const m = String(currentRefDate.getMonth() + 1).padStart(2, '0');
        const d = String(currentRefDate.getDate()).padStart(2, '0');
        picker.value = `${y}-${m}-${d}`;
        try { picker.showPicker(); } catch (e) { showToast("Browser tidak mendukung kalender popup.", "warning"); }
    } else if (currentFilterMode === 'minggu') {
        const ys = rangeStart.getFullYear(), ms = String(rangeStart.getMonth()+1).padStart(2,'0'), ds = String(rangeStart.getDate()).padStart(2,'0');
        const ye = rangeEnd.getFullYear(), me = String(rangeEnd.getMonth()+1).padStart(2,'0'), de = String(rangeEnd.getDate()).padStart(2,'0');
        document.getElementById('range-start').value = `${ys}-${ms}-${ds}`;
        document.getElementById('range-end').value = `${ye}-${me}-${de}`;
        document.getElementById('modal-date-range').style.display = 'flex';
    }
}

function applyPickedDate(e) {
    if (!e.target.value) return;
    currentRefDate = parseLocalDate(e.target.value);
    updateDateNavigatorUI();
    refreshActiveView();
}

function applyCustomRange() {
    const sVal = document.getElementById('range-start').value;
    const eVal = document.getElementById('range-end').value;
    if (!sVal || !eVal) return showToast("Pilih tanggal awal dan akhir!", "error");
    
    rangeStart = parseLocalDate(sVal); rangeStart.setHours(0,0,0,0);
    rangeEnd = parseLocalDate(eVal); rangeEnd.setHours(23,59,59,999);
    
    if (rangeStart > rangeEnd) return showToast("Tanggal akhir harus lebih besar dari tanggal awal!", "error");
    currentRefDate = new Date(rangeStart); 
    closeModal('modal-date-range');
    updateDateNavigatorUI();
    refreshActiveView();
}

function isDateInFilter(dateString) {
    if (currentFilterMode === 'semua') return true;
    const d = parseLocalDate(dateString); 
    if(isNaN(d.getTime())) return false;
    
    if (currentFilterMode === 'hari') { return d.getDate() === currentRefDate.getDate() && d.getMonth() === currentRefDate.getMonth() && d.getFullYear() === currentRefDate.getFullYear(); }
    if (currentFilterMode === 'minggu') { return d >= rangeStart && d <= rangeEnd; }
    if (currentFilterMode === 'bulan') { return d.getMonth() === currentRefDate.getMonth() && d.getFullYear() === currentRefDate.getFullYear(); }
    if (currentFilterMode === 'tahun') { return d.getFullYear() === currentRefDate.getFullYear(); }
    return true; 
}

function calculateAssets() {
    let totalReal = 0, totalTitipan = 0;
    financeData.transactions.forEach(tx => {
        if(tx.assetType === 'real') {
            if(tx.type === 'income') totalReal += tx.amount;
            if(tx.type === 'expense') totalReal -= tx.amount;
        } else if (tx.assetType === 'titipan') {
            if(tx.type === 'titipan_in') totalTitipan += tx.amount;
            if(tx.type === 'titipan_out') totalTitipan -= tx.amount;
        }
    });
    return { real: totalReal, titipan: totalTitipan, all: totalReal + totalTitipan };
}

function getAccountBalance(accountId) {
    let balance = 0;
    financeData.transactions.forEach(tx => {
        if (tx.accountId === accountId) {
            if (tx.type === 'income' || tx.type === 'transfer_in' || tx.type === 'titipan_in') balance += tx.amount;
            if (tx.type === 'expense' || tx.type === 'transfer_out' || tx.type === 'titipan_out') balance -= tx.amount;
        }
    }); 
    return balance;
}

// ==========================================
// 3. KALKULASI & RENDER DASHBOARD UTAMA
// ==========================================
function renderDashboard() {
    document.getElementById('page-main-title').innerText = "Dashboard Real";
    const assets = calculateAssets();
    document.getElementById('sidebar-total-asset').innerText = formatRp(assets.all);
    
    let incomeReal = 0, expenseReal = 0;
    financeData.transactions.forEach(tx => {
        if(isDateInFilter(tx.date) && tx.assetType === 'real') {
            if (tx.type === 'income') incomeReal += tx.amount;
            if (tx.type === 'expense') expenseReal += tx.amount;
        }
    });
    
    document.getElementById('dash-income').innerText = formatRp(incomeReal);
    document.getElementById('dash-expense').innerText = formatRp(expenseReal);
    
    let cfPercent = 0;
    if(incomeReal > 0) cfPercent = ((incomeReal - expenseReal) / incomeReal) * 100;
    else if(expenseReal > 0) cfPercent = -100;
    
    const elNet = document.getElementById('dash-net');
    elNet.innerText = (incomeReal === 0 && expenseReal === 0) ? "0%" : cfPercent.toFixed(1) + "%";
    elNet.style.color = cfPercent >= 0 ? "var(--success)" : "var(--danger)";
    document.getElementById('dash-net-sub').innerText = "Sisa: " + formatRp(incomeReal - expenseReal);

    let incCats = {}, expCats = {};
    financeData.transactions.forEach(tx => {
        if(isDateInFilter(tx.date) && tx.assetType === 'real') {
            if(tx.type === 'income') incCats[tx.category] = (incCats[tx.category] || 0) + tx.amount;
            if(tx.type === 'expense') expCats[tx.category] = (expCats[tx.category] || 0) + tx.amount;
        }
    });

    const renderList = (data, prefix) => {
        if(data.length === 0) return '<small style="color:#aaa;">Belum ada data</small>';
        return data.map(item => `
            <div class="analytic-item" onclick="openDetailView('category', '${item[0]}', 'Kategori: ${item[0]}')">
                <div><div class="analytic-title">${item[0]}</div></div>
                <div class="analytic-amount" style="color:${prefix==='+'?'var(--success)':'var(--danger)'}">
                    ${formatRp(item[1])}
                </div>
            </div>
        `).join('');
    };

    let sortedIn = Object.entries(incCats).sort((a,b)=>b[1]-a[1]).slice(0,3);
    let sortedOut = Object.entries(expCats).sort((a,b)=>b[1]-a[1]).slice(0,3);

    document.getElementById('top-income-list').innerHTML = renderList(sortedIn, '+');
    document.getElementById('top-expense-list').innerHTML = renderList(sortedOut, '-');

    renderMiniTable(); 
    renderPieChart();
}

function renderKelolaDashboard() {
    document.getElementById('page-main-title').innerText = "Dashboard Dana Kelola";
    const assets = calculateAssets();
    document.getElementById('dash-titipan').innerText = formatRp(assets.titipan);
    
    let kelolaIn = 0, kelolaOut = 0, titipanData = {};
    financeData.transactions.forEach(tx => {
        if(tx.assetType === 'titipan') {
            if(!titipanData[tx.category]) titipanData[tx.category] = { balance: 0, count: 0 };
            if(tx.type === 'titipan_in') titipanData[tx.category].balance += tx.amount;
            if(tx.type === 'titipan_out') titipanData[tx.category].balance -= tx.amount;
            if(isDateInFilter(tx.date)) {
                titipanData[tx.category].count++;
                if(tx.type === 'titipan_in') kelolaIn += tx.amount;
                if(tx.type === 'titipan_out') kelolaOut += tx.amount;
            }
        }
    });
    
    document.getElementById('dash-kelola-in').innerText = formatRp(kelolaIn);
    document.getElementById('dash-kelola-out').innerText = formatRp(kelolaOut);

    const arr = Object.entries(titipanData).filter(item => item[1].balance !== 0 || item[1].count > 0);
    if(arr.length > 0) {
        let htmlContent = '';
        arr.forEach(item => {
            htmlContent += `
            <div class="analytic-item" onclick="openDetailView('category', '${item[0]}', 'Detail Kelola: ${item[0]}')">
                <div>
                    <div class="analytic-title">${item[0]}</div>
                    <div class="analytic-subtitle">${item[1].count} Transaksi (Periode Ini)</div>
                </div>
                <div class="analytic-amount text-warning">${formatRp(item[1].balance)}</div>
            </div>`;
        });
        document.getElementById('titipan-analytics-list').innerHTML = htmlContent;
    } else {
        document.getElementById('titipan-analytics-list').innerHTML = '<small style="color:#aaa;">Tidak ada aktivitas</small>';
    }

    const tbody = document.getElementById('mini-kelola-table');
    const recentTx = financeData.transactions.filter(t => t.assetType === 'titipan' && isDateInFilter(t.date)).sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 10); 
    if(recentTx.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#aaa;">Belum ada transaksi.</td></tr>'; 
        return; 
    }
    
    let tableContent = '';
    recentTx.forEach(tx => {
        let prefix = tx.type === 'titipan_in' ? '+' : '-'; 
        let color = tx.type === 'titipan_in' ? '#e67e22' : 'var(--danger)';
        let d = parseLocalDate(tx.date); 
        let dateStr = d.getDate() + " " + d.toLocaleString('id-ID',{month:'short'});
        tableContent += `<tr class="clickable" onclick="openDetailView('ALL', null, 'Semua Transaksi')"><td style="color:#888;">${dateStr}</td><td style="font-weight:700;">${tx.title} <br><span class="badge-kategori">${tx.category}</span></td><td style="text-align:right; font-weight:800; color:${color};">${prefix} ${formatRp(tx.amount)}</td></tr>`;
    });
    tbody.innerHTML = tableContent;
}

function renderMiniTable() {
    const tbody = document.getElementById('mini-transaction-table');
    const recentTx = financeData.transactions.filter(t => t.assetType === 'real' && !t.type.includes('transfer') && isDateInFilter(t.date)).sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 10); 
    if(recentTx.length === 0) { 
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#aaa;">Belum ada transaksi.</td></tr>'; 
        return; 
    }
    
    let tableContent = '';
    recentTx.forEach(tx => {
        let prefix = '', color = 'var(--text-color)';
        if(tx.type === 'income') { prefix = '+'; color = 'var(--success)'; }
        if(tx.type === 'expense') { prefix = '-'; color = 'var(--danger)'; }
        let d = parseLocalDate(tx.date); 
        let dateStr = d.getDate() + " " + d.toLocaleString('id-ID',{month:'short'});
        tableContent += `<tr class="clickable" onclick="openDetailView('ALL', null, 'Semua Transaksi Real')"><td style="color:#888;">${dateStr}</td><td style="font-weight:700;">${tx.title}</td><td><span class="badge-kategori">${tx.category}</span></td><td style="text-align:right; font-weight:800; color:${color};">${prefix} ${formatRp(tx.amount)}</td></tr>`;
    });
    tbody.innerHTML = tableContent;
}

function renderPieChart() {
    const typeToggle = document.getElementById('chart-type-toggle').value; 
    let cats = {}, bgColors = [];
    
    financeData.transactions.forEach(tx => {
        if(isDateInFilter(tx.date) && tx.assetType === 'real') {
            if(typeToggle === 'all' && (tx.type === 'expense' || tx.type === 'income')) {
                const labelName = (tx.type === 'income' ? '(+) ' : '(-) ') + tx.category;
                cats[labelName] = (cats[labelName] || 0) + tx.amount;
            } else if (tx.type === typeToggle) {
                cats[tx.category] = (cats[tx.category] || 0) + tx.amount;
            }
        }
    });

    const labels = Object.keys(cats), dataVals = Object.values(cats);
    const inColors = ['#2ecc71', '#27ae60', '#1abc9c', '#16a085', '#3498db'];
    const outColors = ['#e74c3c', '#c0392b', '#e67e22', '#d35400', '#9b59b6'];
    let inIdx = 0, outIdx = 0;

    labels.forEach(lbl => {
        if (lbl.startsWith('(+) ') || typeToggle === 'income') { 
            bgColors.push(inColors[inIdx % inColors.length]); 
            inIdx++; 
        } else { 
            bgColors.push(outColors[outIdx % outColors.length]); 
            outIdx++; 
        }
    });

    if(charts.pie) charts.pie.destroy();
    const ctxPie = document.getElementById('expensePieChart');
    charts.pie = new Chart(ctxPie.getContext('2d'), {
        type: 'doughnut',
        data: { labels: labels.length ? labels : ['Belum ada data'], datasets: [{ data: dataVals.length ? dataVals : [1], backgroundColor: dataVals.length ? bgColors : ['#ecf0f1'], borderWidth: 0, cutout: '65%' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10 } } }, onClick: (evt, item) => { if (item.length && dataVals.length) { let rawLbl = labels[item[0].index].replace('(+) ','').replace('(-) ',''); openDetailView('category', rawLbl, 'Kategori: ' + rawLbl); } } }
    });
}

// ==========================================
// 4. VIEW, SEARCH & FILTERS (DETAIL TRANSAKSI)
// ==========================================
function switchView(view) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.sidebar .menu-item').forEach(el => el.classList.remove('active'));
    document.getElementById('view-' + view).style.display = 'block';
    
    let menuId = view === 'detail' ? 'dashboard' : view;
    let menuEl = document.getElementById('menu-' + menuId);
    if(menuEl) menuEl.classList.add('active');
    
    document.getElementById('dashboard-header-area').style.display = (view === 'accounts') ? 'none' : 'block';
    if(view !== 'detail') { breadcrumbs = [{ level: view, label: view.toUpperCase(), filterData: {} }]; }
    refreshActiveView();
}

function openDetailView(filterKey, filterValue, label) {
    breadcrumbs.push({ level: 'detail', label: label, filterData: { [filterKey]: filterValue } });
    renderBreadcrumbs();
    
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById('view-detail').style.display = 'block';
    
    document.getElementById('filter-asset').value = 'ALL'; 
    document.getElementById('filter-type').value = 'ALL';
    document.getElementById('filter-cat').value = 'ALL'; 
    document.getElementById('filter-subcat').value = 'ALL'; 
    document.getElementById('filter-acc').value = 'ALL';
    
    if(document.getElementById('view-mode')) {
        document.getElementById('view-mode').value = 'detail';
    }
    
    if(filterKey === 'assetType') document.getElementById('filter-asset').value = filterValue;
    if(filterKey === 'type') document.getElementById('filter-type').value = filterValue;
    if(filterKey === 'category') document.getElementById('filter-cat').value = filterValue;
    if(filterKey === 'accountId') document.getElementById('filter-acc').value = filterValue;

    populateFilterCategories(); 
    applyFilters();
}

function renderBreadcrumbs() { 
    document.getElementById('breadcrumb-container').innerHTML = breadcrumbs.map((b, index) => {
        if(index === breadcrumbs.length - 1) return `<span class="breadcrumb-current">${b.label}</span>`;
        return `<span class="breadcrumb-item" onclick="navigateBreadcrumb(${index})">${b.label}</span> <span class="breadcrumb-separator">/</span>`;
    }).join(''); 
}

function navigateBreadcrumb(index) { 
    breadcrumbs = breadcrumbs.slice(0, index + 1); 
    switchView(breadcrumbs[breadcrumbs.length - 1].level); 
}

function handleSearch() {
    globalSearchQuery = document.getElementById('global-search').value.toLowerCase();
    if(globalSearchQuery === '') { 
        if (breadcrumbs.length > 0 && breadcrumbs[0].level) switchView(breadcrumbs[0].level); else switchView('dashboard'); return; 
    }
    if(document.getElementById('view-dashboard').style.display === 'block' || document.getElementById('view-kelola').style.display === 'block') { 
        openDetailView('ALL', null, 'Hasil Pencarian'); 
    } else { 
        applyFilters(); 
    }
}

function populateFilterCategories() {
    const selCat = document.getElementById('filter-cat'); 
    const valCat = selCat.value;
    selCat.innerHTML = '<option value="ALL">Semua Kategori</option>';
    let cats = new Set(); 
    financeData.transactions.forEach(t => cats.add(t.category));
    cats.forEach(c => selCat.add(new Option(c, c)));
    selCat.value = Array.from(selCat.options).some(o=>o.value===valCat) ? valCat : 'ALL';

    const accSel = document.getElementById('filter-acc'); 
    const valAcc = accSel.value;
    accSel.innerHTML = '<option value="ALL">Semua Akun</option>';
    financeData.accounts.filter(a => a.isActive).forEach(a => accSel.add(new Option(a.name, a.id)));
    accSel.value = Array.from(accSel.options).some(o=>o.value===valAcc) ? valAcc : 'ALL';
    
    populateFilterSubCat();
}

function populateFilterSubCat() {
    const cat = document.getElementById('filter-cat').value; 
    const selSub = document.getElementById('filter-subcat');
    selSub.innerHTML = '<option value="ALL">Semua Sub Kategori</option>';
    if(cat !== 'ALL') { 
        let subs = new Set(); 
        financeData.transactions.forEach(t => { if(t.category === cat && t.subcategory) subs.add(t.subcategory); }); 
        subs.forEach(s => selSub.add(new Option(s, s))); 
    }
}

function applyFilters() {
    if(document.getElementById('filter-cat').options.length <= 1) populateFilterCategories();
    
    const fAsset = document.getElementById('filter-asset').value;
    const fType = document.getElementById('filter-type').value;
    const fCat = document.getElementById('filter-cat').value;
    const fSub = document.getElementById('filter-subcat').value;
    const fAcc = document.getElementById('filter-acc').value;
    
    const currentContext = breadcrumbs[breadcrumbs.length - 1]; 
    document.getElementById('detail-title').innerText = currentContext.label;

    let filtered = financeData.transactions.filter(t => {
        if(!isDateInFilter(t.date)) return false;
        if (fAcc === 'ALL' && t.type.includes('transfer')) return false;
        if(fAsset !== 'ALL' && t.assetType !== fAsset) return false;
        if(fType !== 'ALL' && t.type !== fType) return false; 
        if(fCat !== 'ALL' && t.category !== fCat) return false;
        if(fSub !== 'ALL' && t.subcategory !== fSub) return false;
        if(fAcc !== 'ALL' && t.accountId !== fAcc) return false;
        if(currentContext.filterData.category && currentContext.filterData.category !== t.category) return false;
        if(currentContext.filterData.assetType && currentContext.filterData.assetType !== t.assetType) return false;
        if(currentContext.filterData.accountId && currentContext.filterData.accountId !== t.accountId) return false;
        if(globalSearchQuery && !t.title.toLowerCase().includes(globalSearchQuery) && !t.category.toLowerCase().includes(globalSearchQuery) && (!t.subcategory || !t.subcategory.toLowerCase().includes(globalSearchQuery))) { return false; }
        return true;
    });
    
    filtered.sort((a,b) => b.amount - a.amount); 
    renderDetailTable(filtered);
}

// ==========================================
// RENDERING TABEL DETAIL & REKAP
// ==========================================
function renderDetailTable(filtered) {
    const tbody = document.getElementById('detail-table-body'); 
    const thead = document.querySelector(".finance-table thead");
    let tableContent = '';
    let totalIn = 0, totalOut = 0;
    let catTotalsIn = {}, catTotalsOut = {};
    
    const fAsset = document.getElementById('filter-asset').value;
    const fType = document.getElementById('filter-type').value;
    const fCat = document.getElementById('filter-cat').value;
    const fSub = document.getElementById('filter-subcat').value;
    const fAcc = document.getElementById('filter-acc').value;
    
    const viewModeEl = document.getElementById('view-mode');
    const viewMode = viewModeEl ? viewModeEl.value : 'detail';
    
    const summaryContainer = document.getElementById('detail-category-summary');
    const catList = document.getElementById('cat-summary-list');

    let aggregateData = {}; 

    const prefillCats = (sourceObj, targetObj) => {
        Object.keys(sourceObj).forEach(cName => {
            if (fCat !== 'ALL' && fCat !== cName) return; 
            if (!targetObj[cName]) targetObj[cName] = { total: 0, subs: {} };
            sourceObj[cName].forEach(sName => {
                if (fSub !== 'ALL' && fSub !== sName) return; 
                targetObj[cName].subs[sName] = 0;
            });
        });
    };

    if (fType !== 'expense' && fType !== 'titipan_out' && fType !== 'transfer') {
        prefillCats(financeData.categories.income || {}, catTotalsIn);
        if (fAsset === 'ALL' || fAsset === 'titipan') prefillCats(financeData.categories.titipan || {}, catTotalsIn);
    }
    if (fType !== 'income' && fType !== 'titipan_in' && fType !== 'transfer') {
        prefillCats(financeData.categories.expense || {}, catTotalsOut);
        if (fAsset === 'ALL' || fAsset === 'titipan') prefillCats(financeData.categories.titipan || {}, catTotalsOut);
    }

    filtered.forEach(tx => {
        let isIncome = false, isExpense = false;
        
        if (tx.assetType === 'titipan') { 
            if (tx.type === 'titipan_in') isIncome = true; 
            if (tx.type === 'titipan_out') isExpense = true; 
        } else { 
            if (tx.type === 'income') isIncome = true; 
            if (tx.type === 'expense') isExpense = true; 
            if (fAcc !== 'ALL') { 
                if (tx.type === 'transfer_in') isIncome = true; 
                if (tx.type === 'transfer_out') isExpense = true; 
            } 
        }

        if (isIncome) {
            totalIn += tx.amount;
            if (!tx.type.includes('transfer')) {
                const cName = tx.category || 'Lainnya', sName = tx.subcategory || 'Umum';
                if (!catTotalsIn[cName]) catTotalsIn[cName] = { total: 0, subs: {} };
                catTotalsIn[cName].total += tx.amount; 
                catTotalsIn[cName].subs[sName] = (catTotalsIn[cName].subs[sName] || 0) + tx.amount;
            }
        }
        
        if (isExpense) {
            totalOut += tx.amount;
            if (!tx.type.includes('transfer')) {
                const cName = tx.category || 'Lainnya', sName = tx.subcategory || 'Umum';
                if (!catTotalsOut[cName]) catTotalsOut[cName] = { total: 0, subs: {} };
                catTotalsOut[cName].total += tx.amount; 
                catTotalsOut[cName].subs[sName] = (catTotalsOut[cName].subs[sName] || 0) + tx.amount;
            }
        }

        if (viewMode !== 'detail') {
            let aggKey = viewMode === 'category' ? (tx.category || 'Lainnya') : `${tx.category || 'Lainnya'} > ${tx.subcategory || 'Umum'}`;
            if(!aggregateData[aggKey]) aggregateData[aggKey] = { in: 0, out: 0 };
            if (isIncome) aggregateData[aggKey].in += tx.amount;
            if (isExpense) aggregateData[aggKey].out += tx.amount;
        }
    });

    if(filtered.length === 0) { 
        thead.innerHTML = `<tr><th>Tanggal</th><th>Judul Transaksi</th><th>Kategori > Jenis</th><th>Tipe & Aset</th><th>Akun</th><th style="text-align: right;">Nominal</th></tr>`;
        tableContent = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#aaa;">Data tidak ditemukan.</td></tr>'; 
    } else {
        if (viewMode === 'detail') {
            thead.innerHTML = `<tr><th>Tanggal</th><th>Judul Transaksi</th><th>Kategori > Jenis</th><th>Tipe & Aset</th><th>Akun</th><th style="text-align: right;">Nominal</th></tr>`;
            
            filtered.forEach(tx => {
                const acc = financeData.accounts.find(a => a.id === tx.accountId);
                let isIncome = (tx.assetType === 'titipan' && tx.type === 'titipan_in') || (tx.assetType !== 'titipan' && (tx.type === 'income' || tx.type === 'transfer_in'));
                let prefix = isIncome ? '+' : '-'; 
                let color = isIncome ? (tx.assetType === 'titipan' ? '#e67e22' : 'var(--success)') : (tx.type.includes('transfer') ? '#3498db' : 'var(--danger)');
                let bgAsset = tx.assetType === 'titipan' ? '#f39c12' : 'var(--primary)'; 
                let lblAsset = tx.assetType === 'titipan' ? 'KELOLA' : 'REAL';
                
                tableContent += `<tr>
                    <td style="color:#666;">${formatDate(tx.date)}</td>
                    <td style="font-weight:700;">${tx.title} <br><small style="color:#aaa; font-weight:normal;">${tx.notes||''}</small></td>
                    <td><span style="color:var(--primary); font-weight:600;">${tx.category||'-'}</span> <br><small>${tx.subcategory||'-'}</small></td>
                    <td><span class="badge" style="background:${bgAsset};">${lblAsset}</span> <br><small>${tx.type.replace('titipan','kelola').replace('_', ' ')}</small></td>
                    <td>${acc ? acc.name : '-'}</td>
                    <td style="text-align:right; font-weight:800; color:${color}">${prefix} ${formatRp(tx.amount)} <button onclick="deleteTransaction('${tx.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer; margin-left:15px;" title="Hapus">🗑️</button></td>
                </tr>`;
            });
        } else {
            let headTitle = viewMode === 'category' ? 'Kategori Utama' : 'Kategori > Jenis (Sub)';
            thead.innerHTML = `<tr><th>${headTitle}</th><th style="text-align: right;">Pemasukan</th><th style="text-align: right;">Pengeluaran</th><th style="text-align: right;">Total Bersih</th></tr>`;
            
            Object.keys(aggregateData).sort().forEach(key => {
                let d = aggregateData[key];
                let net = d.in - d.out;
                tableContent += `<tr>
                    <td style="font-weight:700; color:var(--primary);">${key}</td>
                    <td style="text-align:right; color:var(--success); font-weight:600;">${d.in > 0 ? '+ ' + formatRp(d.in) : '-'}</td>
                    <td style="text-align:right; color:var(--danger); font-weight:600;">${d.out > 0 ? '- ' + formatRp(d.out) : '-'}</td>
                    <td style="text-align:right; font-weight:800; color:${net >= 0 ? 'var(--success)' : 'var(--danger)'};">${net >= 0 ? '+ ' : '- '} ${formatRp(Math.abs(net))}</td>
                </tr>`;
            });
        }
    }
    
    tbody.innerHTML = tableContent;
    window.globalCatTotalsIn = catTotalsIn; 
    window.globalCatTotalsOut = catTotalsOut; 
    window.lastFilteredTransactions = filtered;

    let htmlHTML = '';
    const renderTop5List = (dataObj, title, colorVar, bgVar, borderColor) => {
        let catsArr = Object.entries(dataObj).sort((a,b) => b[1].total - a[1].total);
        if(catsArr.length === 0) return '';
        
        catsArr = catsArr.slice(0, 5); 
        
        let html = `
            <div style="flex: 1; min-width: 280px;">
                <div style="font-size: 11px; font-weight: 800; color: var(--${colorVar}); text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.5px;">${title}</div>
                <div style="border: 1px solid ${borderColor}; border-radius: 8px; overflow: hidden; background: #fff; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
        `;
        
        catsArr.forEach((c, index) => {
            const catName = c[0];
            const catData = c[1];
            let borderBottom = index < catsArr.length - 1 ? `border-bottom: 1px solid ${borderColor};` : '';
            html += `
                <div style="${borderBottom} display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--${bgVar});">
                    <span style="font-size: 12px; font-weight: 700; color: var(--${colorVar});">${catName}</span>
                    <span style="font-size: 13px; font-weight: 800; color: var(--${colorVar});">${formatRp(catData.total)}</span>
                </div>
            `;
        });
        html += `</div></div>`;
        return html;
    };

    htmlHTML += `<div style="display: flex; flex-wrap: wrap; gap: 20px;">`;
    htmlHTML += renderTop5List(catTotalsIn, '🟢 Top 5 Pemasukan', 'success', 'success-bg', 'rgba(69, 109, 145, 0.2)');
    htmlHTML += renderTop5List(catTotalsOut, '🔴 Top 5 Pengeluaran', 'danger', 'danger-bg', 'rgba(249, 107, 107, 0.2)');
    htmlHTML += `</div>`;
    
    if(htmlHTML !== '<div style="display: flex; flex-wrap: wrap; gap: 20px;"></div>') {
        htmlHTML += `
            <div style="text-align: center; margin-top: 20px; width: 100%;">
                <button class="btn btn-outline" style="width: 100%; max-width: 350px; padding: 12px; font-weight: bold; border-radius: 30px;" onclick="openFullCategoryView()">
                    Lihat Semua Kategori & Detail Transaksi ➔
                </button>
            </div>
        `;
        if (viewMode === 'detail') {
            summaryContainer.style.display = 'block';
            catList.innerHTML = htmlHTML;
        } else {
            summaryContainer.style.display = 'none';
        }
    } else {
        summaryContainer.style.display = 'none';
    }
    
    document.getElementById('dt-count').innerText = viewMode === 'detail' ? filtered.length : Object.keys(aggregateData).length; 
    document.getElementById('dt-in').innerText = formatRp(totalIn); 
    document.getElementById('dt-out').innerText = formatRp(totalOut);
    let net = totalIn - totalOut; 
    let netEl = document.getElementById('dt-net'); 
    netEl.innerText = formatRp(net); 
    netEl.style.color = net >= 0 ? 'var(--success)' : 'var(--danger)';
}

// ==========================================
// FUNGSI UNTUK OVERLAY FULL DETAIL KATEGORI
// ==========================================
function openFullCategoryView() {
    document.getElementById('full-category-overlay').style.display = 'flex';
    renderFullCategoryContent();
}

function closeFullCategoryView() {
    document.getElementById('full-category-overlay').style.display = 'none';
}

function switchFullCatTab(tab) {
    document.getElementById('tab-full-expense').classList.remove('active');
    document.getElementById('tab-full-income').classList.remove('active');
    document.getElementById('tab-full-' + tab).classList.add('active');
    
    if (tab === 'expense') {
        document.getElementById('full-category-content-expense').style.display = 'block';
        document.getElementById('full-category-content-income').style.display = 'none';
    } else {
        document.getElementById('full-category-content-expense').style.display = 'none';
        document.getElementById('full-category-content-income').style.display = 'block';
    }
}

function renderFullCategoryContent() {
    const expContainer = document.getElementById('full-category-content-expense');
    const incContainer = document.getElementById('full-category-content-income');

    const generateFullList = (dataObj, colorVar, bgVar, borderColor) => {
        let catsArr = Object.entries(dataObj).sort((a,b) => b[1].total - a[1].total);
        if(catsArr.length === 0) return '<div style="text-align: center; color: #888; padding: 20px;">Tidak ada data.</div>';

        let out = '';
        catsArr.forEach((c, catIdx) => {
            const catName = c[0];
            const catData = c[1];
            let subsArr = Object.entries(catData.subs).sort((a,b) => b[1] - a[1]);

            let subsHtml = subsArr.map(s => {
                const subName = s[0];
                const subTotal = s[1];

                const txs = window.lastFilteredTransactions.filter(t => {
                    const matchCat = (t.category || 'Lainnya') === catName;
                    const matchSub = (t.subcategory || 'Umum') === subName;
                    const matchType = (colorVar === 'success' && (t.type.includes('in') && !t.type.includes('transfer'))) || 
                                      (colorVar === 'danger' && (t.type.includes('out') || t.type === 'expense'));
                    return matchCat && matchSub && matchType;
                });

                const txHtml = txs.map(t => `
                    <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed rgba(0,0,0,0.05);">
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 11px; color: #555; font-weight: 600;">${t.title}</span>
                            <span style="font-size: 9px; color: #888;">${formatDate(t.date)}</span>
                        </div>
                        <span style="font-size: 11px; font-weight: 700; color: var(--${colorVar});">${formatRp(t.amount)}</span>
                    </div>
                `).join('');

                let uniqueSubId = 'subtx-' + Math.random().toString(36).substr(2, 9);

                return `
                    <div style="margin-bottom: 12px; padding: 12px; background: #fff; border-radius: 8px; border: 1px solid rgba(0,0,0,0.05);">
                        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; font-weight: 800; color: #333; cursor: pointer; transition: 0.2s;" 
                             onclick="event.stopPropagation(); const el = document.getElementById('${uniqueSubId}'); const icon = this.querySelector('.sub-arrow'); if(el.style.display==='none'){el.style.display='block'; icon.style.transform='rotate(180deg)';}else{el.style.display='none'; icon.style.transform='rotate(0deg)';}">
                            <span>↳ ${subName}</span>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span>${formatRp(subTotal)}</span>
                                <span class="sub-arrow" style="font-size: 10px; color: #888; transition: transform 0.3s;">▼</span>
                            </div>
                        </div>
                        <div id="${uniqueSubId}" style="display: none; padding-left: 12px; border-left: 2px solid var(--${colorVar}); margin-top: 10px; padding-top: 5px;">
                            ${txHtml || '<div style="font-size:10px; color:#aaa;">Tidak ada transaksi</div>'}
                        </div>
                    </div>
                `;
            }).join('');

            let uniqueId = 'fullcat-' + Math.random().toString(36).substr(2, 9);

            out += `
                <div style="background: var(--${bgVar}); border-radius: 12px; margin-bottom: 15px; border: 1px solid ${borderColor}; overflow: hidden;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; cursor: pointer; transition: 0.2s;" 
                         onclick="const el = document.getElementById('${uniqueId}'); const icon = this.querySelector('.cat-arrow'); if(el.style.display==='none'){el.style.display='block'; icon.style.transform='rotate(180deg)';}else{el.style.display='none'; icon.style.transform='rotate(0deg)';}">
                        <div style="font-weight: 800; font-size: 14px; color: var(--${colorVar});">
                            ${catIdx + 1}. ${catName}
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-weight: 800; font-size: 14px; color: var(--${colorVar});">${formatRp(catData.total)}</span>
                            <span class="cat-arrow" style="font-size: 10px; color: var(--${colorVar}); transition: transform 0.3s;">▼</span>
                        </div>
                    </div>
                    <div id="${uniqueId}" style="display: none; padding: 0 15px 15px 15px;">
                        ${subsHtml}
                    </div>
                </div>
            `;
        });
        return out;
    };

    incContainer.innerHTML = generateFullList(window.globalCatTotalsIn, 'success', 'success-bg', 'rgba(69, 109, 145, 0.2)');
    expContainer.innerHTML = generateFullList(window.globalCatTotalsOut, 'danger', 'danger-bg', 'rgba(249, 107, 107, 0.2)');
    
    switchFullCatTab('expense');
}

// ==========================================
// FITUR EXPORT PDF & CSV 
// ==========================================
function exportTransactionToPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) { 
        return showToast("Library PDF belum dimuat. Periksa koneksi internet.", "error"); 
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'pt', 'a4'); 
    const viewModeEl = document.getElementById('view-mode');
    const viewMode = viewModeEl ? viewModeEl.value : 'detail';
    const currentContext = breadcrumbs[breadcrumbs.length - 1];

    if(window.lastFilteredTransactions.length === 0) { 
        return showToast("Tidak ada data untuk di-export.", "warning"); 
    }
    
    let filtered = window.lastFilteredTransactions.sort((a,b) => new Date(a.date) - new Date(b.date)); 
    let tableData = [];
    let totalIn = 0; let totalOut = 0;
    let aggregateData = {};

    filtered.forEach((tx) => {
        let isIncome = (tx.assetType === 'titipan' && tx.type === 'titipan_in') || (tx.assetType !== 'titipan' && (tx.type === 'income' || tx.type === 'transfer_in'));
        if (isIncome) totalIn += tx.amount; else totalOut += tx.amount;

        if (viewMode === 'detail') {
            const acc = financeData.accounts.find(a => a.id === tx.accountId);
            let nominalStr = (isIncome ? '+ ' : '- ') + formatRp(tx.amount);
            tableData.push([ formatDate(tx.date), tx.title, `${tx.category} / ${tx.subcategory || '-'}`, acc ? acc.name : '-', nominalStr ]);
        } else {
            let aggKey = viewMode === 'category' ? (tx.category || 'Lainnya') : `${tx.category || 'Lainnya'} > ${tx.subcategory || 'Umum'}`;
            if(!aggregateData[aggKey]) aggregateData[aggKey] = { in: 0, out: 0 };
            if (isIncome) aggregateData[aggKey].in += tx.amount;
            else aggregateData[aggKey].out += tx.amount;
        }
    });

    let headColumns = [];
    let colStyles = {};

    if (viewMode === 'detail') {
        headColumns = ['Tanggal', 'Judul Transaksi', 'Kategori / Jenis', 'Akun', 'Nominal'];
        colStyles = { 0: { cellWidth: 70 }, 4: { halign: 'right', cellWidth: 85 } };
    } else {
        let headTitle = viewMode === 'category' ? 'Kategori Utama' : 'Kategori > Jenis (Sub)';
        headColumns = ['No', headTitle, 'Pemasukan', 'Pengeluaran', 'Total Bersih'];
        colStyles = { 0: { halign: 'center', cellWidth: 30 }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } };

        let idx = 1;
        Object.keys(aggregateData).sort().forEach(key => {
            let d = aggregateData[key];
            let net = d.in - d.out;
            tableData.push([ idx++, key, d.in > 0 ? '+ '+formatRp(d.in) : '-', d.out > 0 ? '- '+formatRp(d.out) : '-', (net >= 0 ? '+ ' : '- ') + formatRp(Math.abs(net)) ]);
        });
    }

    doc.setFontSize(18); 
    doc.setTextColor(69, 109, 145); 
    doc.setFont("helvetica", "bold");
    doc.text("TAUFIK OS - FINANCIAL REPORT", 40, 40);
    
    doc.setFontSize(10); 
    doc.setTextColor(100, 100, 100); 
    doc.setFont("helvetica", "normal");
    const printDate = new Date(); 
    const strPrintDate = printDate.getDate() + ' ' + printDate.toLocaleString('id-ID',{month:'long', year:'numeric'}) + ' ' + printDate.toLocaleTimeString('id-ID');
    
    let modeLabel = viewMode === 'detail' ? 'Semua Detail Transaksi' : (viewMode === 'category' ? 'Rekap Kategori Utama' : 'Rekap Jenis (Sub Kategori)');
    doc.text(`Dicetak pada: ${strPrintDate}`, 40, 55);
    doc.text(`Konteks Filter: ${currentContext.label} | Tampilan: ${modeLabel}`, 40, 68);

    doc.autoTable({
        startY: 85, 
        head: [headColumns], 
        body: tableData, 
        theme: 'striped',
        headStyles: { fillColor: [69, 109, 145], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: colStyles, 
        styles: { fontSize: 9, cellPadding: 5 }, 
        alternateRowStyles: { fillColor: [245, 248, 250] },
        didParseCell: function (data) {
            if (data.section === 'body') {
                if (viewMode === 'detail' && data.column.index === 4) {
                    if (data.cell.raw.startsWith('+')) { 
                        data.cell.styles.textColor = [46, 204, 113]; 
                        data.cell.styles.fontStyle = 'bold'; 
                    } else if (data.cell.raw.startsWith('-')) { 
                        data.cell.styles.textColor = [231, 76, 60]; 
                        data.cell.styles.fontStyle = 'bold'; 
                    }
                } else if (viewMode !== 'detail') {
                    if (data.column.index === 2 && data.cell.raw !== '-') data.cell.styles.textColor = [46, 204, 113];
                    if (data.column.index === 3 && data.cell.raw !== '-') data.cell.styles.textColor = [231, 76, 60];
                    if (data.column.index === 4) {
                        if (data.cell.raw.startsWith('+')) data.cell.styles.textColor = [46, 204, 113]; 
                        else data.cell.styles.textColor = [231, 76, 60];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        }
    });

    let finalY = doc.lastAutoTable.finalY || 85; 
    doc.setFontSize(11); doc.setTextColor(50, 50, 50); doc.setFont("helvetica", "bold"); doc.text("Ringkasan Laporan:", 40, finalY + 25);
    doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.text(`Total Pemasukan:`, 40, finalY + 45); doc.setTextColor(46, 204, 113); doc.setFont("helvetica", "bold"); doc.text(formatRp(totalIn), 140, finalY + 45);
    doc.setTextColor(50, 50, 50); doc.setFont("helvetica", "normal"); doc.text(`Total Pengeluaran:`, 40, finalY + 60); doc.setTextColor(231, 76, 60); doc.setFont("helvetica", "bold"); doc.text(formatRp(totalOut), 140, finalY + 60);
    
    let net = totalIn - totalOut;
    doc.setTextColor(50, 50, 50); doc.setFont("helvetica", "normal"); doc.text(`Total Bersih:`, 40, finalY + 75); doc.setTextColor(net >= 0 ? 46 : 231, net >= 0 ? 204 : 76, net >= 0 ? 113 : 60); doc.setFont("helvetica", "bold"); doc.text(formatRp(net), 140, finalY + 75);

    doc.save(`TaufikOS_${viewMode.toUpperCase()}_${new Date().toISOString().slice(0,10)}.pdf`);
    showToast("Laporan PDF berhasil diunduh!", "success");
}

function exportTransactionToCSV() {
    const viewModeEl = document.getElementById('view-mode');
    const viewMode = viewModeEl ? viewModeEl.value : 'detail';
    if(window.lastFilteredTransactions.length === 0) return showToast("Tidak ada data untuk di-export.", "warning");
    
    let csvContent = "data:text/csv;charset=utf-8,";
    let filtered = window.lastFilteredTransactions.sort((a,b) => b.amount - a.amount);

    if (viewMode === 'detail') {
        csvContent += "Tanggal,Judul,Kategori,Sub Kategori,Tipe,Aset,Akun,Nominal,Catatan\n";
        filtered.forEach(tx => {
            const acc = financeData.accounts.find(a => a.id === tx.accountId);
            csvContent += `${tx.date},"${tx.title}","${tx.category}","${tx.subcategory||''}","${tx.type}","${tx.assetType}","${acc?acc.name:''}",${tx.amount},"${tx.notes||''}"\n`;
        });
    } else {
        let headTitle = viewMode === 'category' ? 'Kategori Utama' : 'Kategori > Jenis (Sub)';
        csvContent += `${headTitle},Total Pemasukan,Total Pengeluaran,Bersih (Net)\n`;
        
        let aggregateData = {};
        filtered.forEach(tx => {
            let isIncome = (tx.assetType === 'titipan' && tx.type === 'titipan_in') || (tx.assetType !== 'titipan' && (tx.type === 'income' || tx.type === 'transfer_in'));
            let aggKey = viewMode === 'category' ? (tx.category || 'Lainnya') : `${tx.category || 'Lainnya'} > ${tx.subcategory || 'Umum'}`;
            if(!aggregateData[aggKey]) aggregateData[aggKey] = { in: 0, out: 0 };
            if (isIncome) aggregateData[aggKey].in += tx.amount; else aggregateData[aggKey].out += tx.amount;
        });

        Object.keys(aggregateData).sort().forEach(key => {
            let d = aggregateData[key];
            csvContent += `"${key}",${d.in},${d.out},${d.in - d.out}\n`;
        });
    }
    
    const dl = document.createElement('a'); 
    dl.href = encodeURI(csvContent); 
    dl.download = `Export_Finance_${viewMode}_${new Date().toISOString().slice(0,10)}.csv`; 
    dl.click();
}

// ==========================================
// 5. TRANSACTION MODAL (AUTO SPLIT ACCOUNT)
// ==========================================
function openTransactionModal(baseType) { 
    document.getElementById('tx-base-type').value = baseType; 
    document.getElementById('tx-modal-title').innerText = baseType === 'income' ? 'Catat Uang Masuk' : 'Catat Uang Keluar';
    ['tx-title','tx-amount','tx-notes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('tx-asset-type').value = 'real'; 
    populateCategoryDropdowns();
    document.getElementById('tx-account-container').innerHTML = '';
    addAccountRow(); 
    document.getElementById('btn-add-split').style.display = baseType === 'expense' ? 'block' : 'none';
    document.getElementById('modal-transaction').style.display = 'flex';
}

function addAccountRow() {
    const container = document.getElementById('tx-account-container');
    const div = document.createElement('div');
    div.className = 'split-row'; 
    div.style.display = 'flex'; 
    div.style.gap = '10px'; 
    div.style.marginBottom = '8px';

    let selHTML = `<select class="split-acc" onchange="autoCalculateSplit()" style="flex: 2; padding: 10px; border-radius: 8px; border: 1px solid var(--navbar-border); font-family: inherit;">`;
    financeData.accounts.filter(a => a.isActive).forEach(a => { 
        const bal = getAccountBalance(a.id); 
        selHTML += `<option value="${a.id}">${a.name} (Sisa: ${formatRp(bal)})</option>`; 
    });
    selHTML += `</select>`;

    let displayStyle = container.children.length === 0 ? 'none' : 'block';
    let amtHTML = `<input type="number" class="split-amt" placeholder="Nominal di Akun Ini" style="flex: 1; padding: 10px; border-radius: 8px; border: 1px solid var(--navbar-border); display: ${displayStyle}; background: #f4f7f9;" readonly>`;
    let delHTML = container.children.length > 0 ? `<button onclick="this.parentElement.remove(); autoCalculateSplit();" style="background:none; border:none; color:red; cursor:pointer; font-size:16px;" title="Hapus Akun">✖</button>` : '';

    div.innerHTML = selHTML + amtHTML + delHTML; 
    container.appendChild(div);
    if (container.children.length > 1) { 
        container.children[0].querySelector('.split-amt').style.display = 'block'; 
    }
    autoCalculateSplit();
}

function autoCalculateSplit() {
    const totalAmount = parseInt(document.getElementById('tx-amount').value) || 0;
    const rows = document.querySelectorAll('.split-row');
    if (rows.length === 0) return;
    let remaining = totalAmount;

    rows.forEach((row, index) => {
        const accId = row.querySelector('.split-acc').value; 
        const amtInput = row.querySelector('.split-amt'); 
        const bal = getAccountBalance(accId);
        let assignAmt = 0;
        
        if (remaining > 0) {
            if (index === rows.length - 1) { 
                assignAmt = remaining; 
            } else { 
                assignAmt = Math.min(remaining, bal); 
            }
            remaining -= assignAmt;
        }
        amtInput.value = assignAmt;
    });
}

function populateCategoryDropdowns() {
    const baseType = document.getElementById('tx-base-type').value; 
    const assetType = document.getElementById('tx-asset-type').value; 
    const catTarget = assetType === 'titipan' ? 'titipan' : baseType; 
    const catSel = document.getElementById('tx-category'); 
    catSel.innerHTML = '';
    
    Object.keys(financeData.categories[catTarget] || {}).forEach(c => catSel.add(new Option(c, c)));
    populateSubCategoryTx();
}

function toggleTitipanFields() { 
    populateCategoryDropdowns(); 
}

function populateSubCategoryTx() {
    const baseType = document.getElementById('tx-base-type').value;
    const assetType = document.getElementById('tx-asset-type').value;
    const catTarget = assetType === 'titipan' ? 'titipan' : baseType;
    const cat = document.getElementById('tx-category').value;
    const subSel = document.getElementById('tx-subcategory'); 
    subSel.innerHTML = '';
    
    if (financeData.categories[catTarget] && financeData.categories[catTarget][cat]) { 
        financeData.categories[catTarget][cat].forEach(s => subSel.add(new Option(s, s))); 
    }
}

function addNewParentCategory() {
    const assetType = document.getElementById('tx-asset-type').value;
    const baseType = document.getElementById('tx-base-type').value;
    const targetType = assetType === 'titipan' ? 'titipan' : baseType; 
    const newCat = prompt(`Nama Kategori Utama Baru:`);
    
    if (newCat && newCat.trim() !== '') {
        const cleanCat = newCat.trim();
        if(!financeData.categories[targetType]) financeData.categories[targetType] = {};
        if(!financeData.categories[targetType][cleanCat]) financeData.categories[targetType][cleanCat] = ['Umum'];
        saveData(); 
        populateCategoryDropdowns(); 
        document.getElementById('tx-category').value = cleanCat; 
        populateSubCategoryTx();
    }
}

function addNewSubCategory() {
    const assetType = document.getElementById('tx-asset-type').value;
    const baseType = document.getElementById('tx-base-type').value;
    const targetType = assetType === 'titipan' ? 'titipan' : baseType;
    const cat = document.getElementById('tx-category').value;
    const newSub = prompt(`Tambah Jenis Baru untuk Kategori "${cat}":`);
    
    if (newSub && newSub.trim() !== '') {
        if(!financeData.categories[targetType][cat]) financeData.categories[targetType][cat] = [];
        financeData.categories[targetType][cat].push(newSub.trim()); 
        saveData(); 
        populateSubCategoryTx(); 
        document.getElementById('tx-subcategory').value = newSub.trim();
    }
}

function saveTransaction() {
    const title = document.getElementById('tx-title').value;
    const amount = parseInt(document.getElementById('tx-amount').value);
    const date = document.getElementById('tx-date').value;
    const assetType = document.getElementById('tx-asset-type').value;
    const baseType = document.getElementById('tx-base-type').value;
    const cat = document.getElementById('tx-category').value;
    const subcat = document.getElementById('tx-subcategory').value;
    const notes = document.getElementById('tx-notes').value;
    
    if(!title || !amount || !date) return showToast("Wajib isi Judul, Nominal, dan Tanggal!", "error");
    
    let finalType = baseType; 
    if (assetType === 'titipan') {
        finalType = baseType === 'income' ? 'titipan_in' : 'titipan_out';
    }

    const rows = document.querySelectorAll('.split-row');
    if (baseType === 'expense' && rows.length > 1) {
        let totalSplit = 0, splitData = [], valid = true, balSufficient = true;
        rows.forEach(r => {
            const accId = r.querySelector('.split-acc').value;
            const amt = parseInt(r.querySelector('.split-amt').value) || 0;
            if (amt <= 0) valid = false; 
            if (amt > getAccountBalance(accId)) balSufficient = false;
            splitData.push({ accId, amt }); 
            totalSplit += amt;
        });

        if (!valid) return showToast("Kolom Nominal Split harus lebih dari 0!", "error");
        if (!balSufficient) return showToast("Saldo akun tidak mencukupi untuk split ini!", "error");
        if (totalSplit !== amount) return showToast(`Gagal! Total split akun tidak sama dengan Nominal Utama.`, "error");

        const groupId = 'SPLIT-' + Date.now();
        splitData.forEach((sd, idx) => {
            financeData.transactions.push({ 
                id: 'TX-' + Date.now() + '-' + idx, 
                date: date, 
                title: title + ` (Split ${idx+1}/${splitData.length})`, 
                type: finalType, 
                category: cat, 
                subcategory: subcat, 
                accountId: sd.accId, 
                assetType: assetType, 
                amount: sd.amt, 
                notes: notes, 
                transferGroupId: groupId, 
                createdAt: new Date().toISOString() 
            });
        });
    } else {
        const accId = rows[0].querySelector('.split-acc').value;
        if (baseType === 'expense' && amount > getAccountBalance(accId)) {
            return showToast("Saldo akun tidak mencukupi!", "error");
        }
        financeData.transactions.push({ 
            id: 'TX-' + Date.now(), 
            date: date, 
            title: title, 
            type: finalType, 
            category: cat, 
            subcategory: subcat, 
            accountId: accId, 
            assetType: assetType, 
            amount: amount, 
            notes: notes, 
            transferGroupId: null, 
            createdAt: new Date().toISOString() 
        });
    }
    saveData(); 
    closeModal('modal-transaction'); 
    refreshActiveView(); 
    showToast("Transaksi berhasil disimpan!", "success");
}

function deleteTransaction(id) {
    const tx = financeData.transactions.find(t => t.id === id); 
    if(!tx) return;
    
    let msg = tx.transferGroupId ? "Ini adalah transaksi gabungan (Transfer/Split). Menghapus ini akan membatalkan semua transaksi dalam grup tersebut. Lanjutkan?" : "Yakin ingin menghapus transaksi ini?";
    
    if(confirm(msg)) {
        if(tx.transferGroupId) {
            financeData.transactions = financeData.transactions.filter(t => t.transferGroupId !== tx.transferGroupId);
        } else {
            financeData.transactions = financeData.transactions.filter(t => t.id !== id);
        }
        saveData(); 
        refreshActiveView(); 
        showToast("Transaksi dihapus.", "warning");
    }
}

// ==========================================
// MANAJEMEN KATEGORI
// ==========================================
function openCategoryManager() { 
    document.getElementById('modal-category-manager').style.display = 'flex'; 
    renderCategoryManager('expense'); 
}

function renderCategoryManager(type) {
    document.querySelectorAll('#modal-category-manager .period-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-cat-' + type).classList.add('active');
    
    const container = document.getElementById('cat-manager-list'); 
    let htmlContent = '';
    const cats = financeData.categories[type] || {};
    
    Object.keys(cats).forEach(catName => {
        let subsHTML = cats[catName].map((sub, idx) => `<div class="cat-manager-sub"><span>└ ${sub}</span><span class="clickable text-danger" onclick="deleteSubCategory('${type}', '${catName}', ${idx})">🗑️</span></div>`).join('');
        htmlContent += `<div style="margin-bottom: 10px;"><div class="cat-manager-row"><strong style="color:var(--text-color)">${catName}</strong><span class="clickable text-danger" onclick="deleteCategory('${type}', '${catName}')">🗑️ Hapus Kategori</span></div>${subsHTML}</div>`;
    });
    container.innerHTML = htmlContent;
}

function deleteCategory(type, catName) { 
    if(confirm(`Yakin hapus Kategori "${catName}"?`)) { 
        delete financeData.categories[type][catName]; 
        saveData(); 
        renderCategoryManager(type); 
        if(document.getElementById('modal-transaction').style.display === 'flex') {
            populateCategoryDropdowns(); 
        }
    } 
}

function deleteSubCategory(type, catName, subIdx) { 
    if(confirm(`Hapus sub-kategori ini?`)) { 
        financeData.categories[type][catName].splice(subIdx, 1); 
        saveData(); 
        renderCategoryManager(type); 
        if(document.getElementById('modal-transaction').style.display === 'flex') {
            populateSubCategoryTx(); 
        }
    } 
}

// ==========================================
// 6. ACCOUNTS & TRANSFER
// ==========================================
function openAssetBreakdown() { 
    const assets = calculateAssets(); 
    document.getElementById('modal-val-real').innerText = formatRp(assets.real); 
    document.getElementById('modal-val-titipan').innerText = formatRp(assets.titipan); 
    document.getElementById('modal-asset-breakdown').style.display = 'flex'; 
}

function renderAccounts() {
    const container = document.getElementById('account-manager-list'); 
    let htmlContent = '';
    
    financeData.accounts.filter(a => a.isActive).forEach(acc => {
        const bal = getAccountBalance(acc.id); 
        let totIn = 0, totOut = 0;
        
        financeData.transactions.forEach(t => { 
            if(t.accountId === acc.id) { 
                if(t.type.includes('in') || t.type === 'income') totIn += t.amount; 
                if(t.type.includes('out') || t.type === 'expense') totOut += t.amount; 
            } 
        });
        
        htmlContent += `
        <div class="wallet-card">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 10px; position:relative; z-index:2;">
                <div>
                    <h4 style="margin:0; font-size:16px;">${acc.name}</h4>
                    <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">ID: ${acc.id}</div>
                </div>
                <span class="badge-kategori" style="background:var(--primary-bg); color:var(--primary); font-weight:700;">${acc.type}</span>
            </div>
            <div style="font-size:26px; font-weight:800; margin:15px 0; color:${bal < 0 ? 'var(--danger)' : 'var(--text-color)'}; position:relative; z-index:2;">${formatRp(bal)}</div>
            <div style="display:flex; gap:10px; font-size:10px; color:var(--text-muted); position:relative; z-index:2;">
                <div style="background:var(--success-bg); padding:6px 10px; border-radius:6px; color:var(--success); flex:1; font-weight:600;">In: ${formatRp(totIn)}</div>
                <div style="background:var(--danger-bg); padding:6px 10px; border-radius:6px; color:var(--danger); flex:1; font-weight:600;">Out: ${formatRp(totOut)}</div>
            </div>
            <div style="margin-top:15px; padding-top:15px; border-top:1px dashed var(--navbar-border); display:flex; justify-content:space-between; align-items:center; position:relative; z-index:2;">
                <div>
                    <button style="background:none; border:none; color:var(--text-muted); font-size:12px; cursor:pointer;" onclick="editAccount('${acc.id}')">✏️ Edit</button>
                    <button style="background:none; border:none; color:var(--danger); font-size:12px; cursor:pointer; margin-left:5px;" onclick="deleteAccount('${acc.id}')">🗑️</button>
                </div>
                <button class="btn btn-outline btn-sm" style="font-weight:bold;" onclick="openDetailView('accountId', '${acc.id}', 'Mutasi: ${acc.name}')">Mutasi ➔</button>
            </div>
        </div>`;
    });
    container.innerHTML = htmlContent;
}

function openAccountModal() { 
    document.getElementById('acc-modal-title').innerText = "Tambah Akun"; 
    document.getElementById('acc-edit-id').value = ''; 
    document.getElementById('acc-name').value = ''; 
    document.getElementById('modal-account').style.display = 'flex'; 
}

function editAccount(id) { 
    const acc = financeData.accounts.find(a => a.id === id); 
    if(acc) { 
        document.getElementById('acc-modal-title').innerText = "Edit Akun"; 
        document.getElementById('acc-edit-id').value = id; 
        document.getElementById('acc-name').value = acc.name; 
        document.getElementById('acc-type').value = acc.type; 
        document.getElementById('modal-account').style.display = 'flex'; 
    } 
}

function deleteAccount(id) { 
    if(getAccountBalance(id) > 0) {
        return showToast("Akun masih memiliki Saldo. Kosongkan dulu!", "error");
    }
    if(confirm("Hapus akun ini dari sistem?")) { 
        const acc = financeData.accounts.find(a => a.id === id); 
        if(acc) acc.isActive = false; 
        saveData(); 
        renderAccounts(); 
        populateTransferSelects(); 
        showToast("Akun berhasil dihapus.", "warning"); 
    } 
}

function saveAccount() { 
    const name = document.getElementById('acc-name').value.trim(); 
    const editId = document.getElementById('acc-edit-id').value; 
    
    if(!name) return showToast("Nama akun wajib diisi!", "error"); 
    
    if(editId) { 
        const acc = financeData.accounts.find(a => a.id === editId); 
        if(acc) { 
            acc.name = name; 
            acc.type = document.getElementById('acc-type').value; 
        } 
    } else { 
        financeData.accounts.push({ 
            id: 'ACC-' + Date.now(), 
            name: name, 
            type: document.getElementById('acc-type').value, 
            isActive: true 
        }); 
    } 
    saveData(); 
    closeModal('modal-account'); 
    renderAccounts(); 
    populateTransferSelects(); 
    showToast("Akun berhasil disimpan!", "success"); 
}

function toggleTransferForm() { 
    const form = document.getElementById('transfer-form-area'); 
    const btn = document.getElementById('transfer-secure-btn'); 
    if (form.style.display === 'none') { 
        form.style.display = 'block'; 
        btn.style.display = 'none'; 
    } else { 
        form.style.display = 'none'; 
        btn.style.display = 'block'; 
    } 
}

function populateTransferSelects() { 
    const fromSel = document.getElementById('tf-from'); 
    const toSel = document.getElementById('tf-to'); 
    if(!fromSel || !toSel) return; 
    
    fromSel.innerHTML = ''; 
    toSel.innerHTML = ''; 
    
    financeData.accounts.filter(a => a.isActive).forEach(a => { 
        fromSel.add(new Option(`${a.name} (Saldo: ${formatRp(getAccountBalance(a.id))})`, a.id)); 
        toSel.add(new Option(a.name, a.id)); 
    }); 
}

function saveTransfer() { 
    const fromId = document.getElementById('tf-from').value; 
    const toId = document.getElementById('tf-to').value; 
    const amount = parseInt(document.getElementById('tf-amount').value); 
    const date = document.getElementById('tf-date').value; 
    
    if (fromId === toId) return showToast("Akun asal dan tujuan tidak boleh sama!", "error"); 
    if (!amount || amount <= 0) return showToast("Nominal tidak valid!", "error"); 
    if (amount > getAccountBalance(fromId)) return showToast("Saldo tidak mencukupi!", "error"); 
    
    const accFrom = financeData.accounts.find(a => a.id === fromId); 
    const accTo = financeData.accounts.find(a => a.id === toId); 
    const groupId = 'TRX-TF-' + Date.now(); 
    
    financeData.transactions.push(
        { id: groupId + '-OUT', date: date, title: 'Transfer Ke ' + accTo.name, type: 'transfer_out', category: 'Transfer', subcategory: 'Antar Rekening', accountId: fromId, assetType: 'real', amount: amount, notes: '', transferGroupId: groupId, createdAt: new Date().toISOString() }, 
        { id: groupId + '-IN', date: date, title: 'Transfer Dari ' + accFrom.name, type: 'transfer_in', category: 'Transfer', subcategory: 'Antar Rekening', accountId: toId, assetType: 'real', amount: amount, notes: '', transferGroupId: groupId, createdAt: new Date().toISOString() }
    ); 
    
    saveData(); 
    document.getElementById('tf-amount').value = ''; 
    toggleTransferForm(); 
    showToast("Transfer berhasil dieksekusi!", "success"); 
    refreshActiveView(); 
}

function formatRp(n) { 
    return new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(n); 
}

function formatDate(s) { 
    if(!s) return '-'; 
    let d = parseLocalDate(s); 
    return d.getDate() + ' ' + d.toLocaleString('id-ID',{month:'short', year:'numeric'}); 
}

function closeModal(id) { 
    document.getElementById(id).style.display = 'none'; 
}

window.onclick = function(event) { 
    if (event.target.classList.contains('modal')) closeModal(event.target.id); 
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = msg;
    container.appendChild(toast);
    
    setTimeout(() => { toast.remove(); }, 3000);
}

// ==========================================
// MENGHUBUNGKAN FUNGSI KE GLOBAL WINDOW (KARENA TYPE="MODULE")
// ==========================================
window.initApp = initApp;
window.switchView = switchView;
window.handleSearch = handleSearch;
window.changeDateOffset = changeDateOffset;
window.openDatePicker = openDatePicker;
window.applyPickedDate = applyPickedDate;
window.setPeriodFilter = setPeriodFilter;
window.openDetailView = openDetailView;
window.renderPieChart = renderPieChart;
window.openAssetBreakdown = openAssetBreakdown;
window.exportTransactionToPDF = exportTransactionToPDF;
window.exportTransactionToCSV = exportTransactionToCSV;
window.applyFilters = applyFilters;
window.populateFilterSubCat = populateFilterSubCat;
window.openAccountModal = openAccountModal;
window.toggleTransferForm = toggleTransferForm;
window.saveTransfer = saveTransfer;
window.closeFullCategoryView = closeFullCategoryView;
window.switchFullCatTab = switchFullCatTab;
window.autoCalculateSplit = autoCalculateSplit;
window.toggleTitipanFields = toggleTitipanFields;
window.addAccountRow = addAccountRow;
window.openCategoryManager = openCategoryManager;
window.populateSubCategoryTx = populateSubCategoryTx;
window.addNewParentCategory = addNewParentCategory;
window.addNewSubCategory = addNewSubCategory;
window.closeModal = closeModal;
window.saveTransaction = saveTransaction;
window.applyCustomRange = applyCustomRange;
window.renderCategoryManager = renderCategoryManager;
window.saveAccount = saveAccount;
window.deleteTransaction = deleteTransaction;
window.deleteSubCategory = deleteSubCategory;
window.deleteCategory = deleteCategory;
window.editAccount = editAccount;
window.deleteAccount = deleteAccount;
window.openFullCategoryView = openFullCategoryView;
window.navigateBreadcrumb = navigateBreadcrumb;
window.openTransactionModal = openTransactionModal;
