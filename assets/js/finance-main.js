let currentFilterMode = 'bulan'; 
let currentRefDate = new Date();
let breadcrumbs = [{ level: 'dashboard', label: 'Dashboard', filterData: {} }];
let currentSort = { column: 'date', order: 'desc' }; 

document.addEventListener('DOMContentLoaded', () => {
    initStorage();
    updateDateNavigatorUI();
    switchView('dashboard');
    
    // Set auto date to local format YYYY-MM-DD aman dari Timezone
    const todayStr = new Date().toISOString().split('T')[0];
    const dDate = document.getElementById('tx-date');
    if(dDate) dDate.value = todayStr;
    const fDate = document.getElementById('tf-date');
    if(fDate) fDate.value = todayStr;
});

function refreshAllViews() {
    if (document.getElementById('view-dashboard').style.display === 'block') renderDashboard();
    else if (document.getElementById('view-detail').style.display === 'block') applyFilters(); 
    else if (document.getElementById('view-accounts').style.display === 'block') { populateTransferSelects(); renderAccounts(); }
}

function switchView(view) {
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.sidebar .menu-item').forEach(el => el.classList.remove('active'));
    document.getElementById('view-' + view).style.display = 'block';
    if(view === 'dashboard' || view === 'accounts') breadcrumbs = [{ level: view, label: view === 'dashboard' ? 'Dashboard' : 'Accounts', filterData: {} }];
    let menuEl = document.getElementById('menu-' + view);
    if(menuEl) menuEl.classList.add('active');
    document.getElementById('dashboard-header-area').style.display = (view === 'dashboard' || view === 'detail') ? 'block' : 'none';
    refreshAllViews();
}

function openDetailView(filterKey, filterValue, label) {
    breadcrumbs.push({ level: 'detail', label: label, filterData: { [filterKey]: filterValue } });
    renderBreadcrumbs();
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.getElementById('view-detail').style.display = 'block';
    
    document.getElementById('filter-asset').value = 'ALL';
    document.getElementById('filter-type').value = 'ALL';
    populateFilterDropdowns();
    
    if(filterKey === 'assetType') document.getElementById('filter-asset').value = filterValue;
    if(filterKey === 'type') document.getElementById('filter-type').value = filterValue;
    if(filterKey === 'category') document.getElementById('filter-cat').value = filterValue;
    applyFilters();
}

function renderBreadcrumbs() {
    const container = document.getElementById('breadcrumb-container');
    container.innerHTML = breadcrumbs.map((b, index) => {
        const isLast = index === breadcrumbs.length - 1;
        return isLast ? `<span class="breadcrumb-current">${b.label}</span>` : `<span class="breadcrumb-item" onclick="navigateBreadcrumb(${index})">${b.label}</span> <span class="breadcrumb-separator">/</span>`;
    }).join('');
}

function navigateBreadcrumb(index) {
    breadcrumbs = breadcrumbs.slice(0, index + 1);
    const target = breadcrumbs[breadcrumbs.length - 1];
    if(target.level === 'dashboard') switchView('dashboard');
    else if(target.level === 'accounts') switchView('accounts');
    else { renderBreadcrumbs(); applyFilters(); }
}

function setPeriodFilter(mode) {
    currentFilterMode = mode; currentRefDate = new Date(); 
    document.querySelectorAll('.period-tab').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + mode).classList.add('active');
    document.querySelector('.date-navigator').style.visibility = mode === 'semua' ? 'hidden' : 'visible';
    updateDateNavigatorUI(); refreshAllViews();
}

function changeDateOffset(offset) {
    if (currentFilterMode === 'hari') { currentRefDate.setDate(currentRefDate.getDate() + offset); } 
    else if (currentFilterMode === 'minggu') { currentRefDate.setDate(currentRefDate.getDate() + (offset * 7)); } 
    else if (currentFilterMode === 'bulan') {
        currentRefDate.setMonth(currentRefDate.getMonth() + offset);
    } 
    else if (currentFilterMode === 'tahun') { currentRefDate.setFullYear(currentRefDate.getFullYear() + offset); }
    updateDateNavigatorUI(); refreshAllViews();
}

function updateDateNavigatorUI() {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
    let label = "", text = "";
    if (currentFilterMode === 'hari') { label = "DAY"; text = currentRefDate.getDate() + " " + monthNames[currentRefDate.getMonth()] + " " + currentRefDate.getFullYear(); } 
    else if (currentFilterMode === 'bulan') { label = "MONTH"; text = monthNames[currentRefDate.getMonth()] + " " + currentRefDate.getFullYear(); } 
    else if (currentFilterMode === 'tahun') { label = "YEAR"; text = currentRefDate.getFullYear(); } 
    else if (currentFilterMode === 'semua') { label = "ALL"; text = "Semua Waktu"; }
    else { label = "WEEK"; text = "Minggu Ini"; } 
    document.getElementById('header-period-label').innerText = label;
    document.getElementById('header-date-text').innerText = text;
}

function isDateInFilter(dateString) {
    if (!dateString) return false;
    if (currentFilterMode === 'semua') return true;
    const d = new Date(dateString);
    if(isNaN(d.getTime())) return false;
    if (currentFilterMode === 'hari') return d.getDate() === currentRefDate.getDate() && d.getMonth() === currentRefDate.getMonth() && d.getFullYear() === currentRefDate.getFullYear();
    if (currentFilterMode === 'bulan') return d.getMonth() === currentRefDate.getMonth() && d.getFullYear() === currentRefDate.getFullYear();
    if (currentFilterMode === 'tahun') return d.getFullYear() === currentRefDate.getFullYear();
    return true; 
}

function handleSearch() {
    if(document.getElementById('view-dashboard').style.display === 'block' && document.getElementById('global-search').value.length > 0) {
        openDetailView('ALL', null, 'Hasil Pencarian');
    } else if (document.getElementById('view-detail').style.display === 'block') {
        applyFilters();
    }
}

function populateFilterDropdowns() {
    const selCat = document.getElementById('filter-cat');
    selCat.innerHTML = '<option value="ALL">Semua Kategori</option>';
    let cats = new Set();
    db.transactions.forEach(t => cats.add(t.category));
    cats.forEach(c => selCat.add(new Option(c, c)));
    
    const selAcc = document.getElementById('filter-acc');
    selAcc.innerHTML = '<option value="ALL">Semua Rekening/Akun</option>';
    db.accounts.forEach(a => selAcc.add(new Option(a.name, a.id)));
}

function applyFilters() {
    const currentContext = breadcrumbs[breadcrumbs.length - 1];
    document.getElementById('detail-title').innerText = currentContext.label;

    const fAsset = document.getElementById('filter-asset').value;
    const fType = document.getElementById('filter-type').value;
    const fCat = document.getElementById('filter-cat').value;
    const fAcc = document.getElementById('filter-acc').value;
    const fOwner = document.getElementById('filter-owner').value.toLowerCase();
    const fMin = parseInt(document.getElementById('filter-nom-min').value) || 0;
    const fMax = parseInt(document.getElementById('filter-nom-max').value) || Infinity;
    const fStart = document.getElementById('filter-date-start').value;
    const fEnd = document.getElementById('filter-date-end').value;
    const query = document.getElementById('global-search').value.toLowerCase();

    let filtered = db.transactions.filter(t => {
        if(currentContext.filterData.category && currentContext.filterData.category !== 'ALL' && currentContext.filterData.category !== t.category) return false;
        
        if(fStart && fEnd) { if(t.date < fStart || t.date > fEnd) return false; } 
        else { if(!isDateInFilter(t.date)) return false; }

        if(fAsset !== 'ALL' && t.assetType !== fAsset) return false;
        if(fType !== 'ALL') {
            if(fType === 'transfer' && !t.type.includes('transfer')) return false;
            else if(fType !== 'transfer' && t.type !== fType) return false;
        }
        if(fCat !== 'ALL' && t.category !== fCat) return false;
        if(fAcc !== 'ALL' && t.accountId !== fAcc) return false;
        if(fOwner && (!t.ownerName || !t.ownerName.toLowerCase().includes(fOwner))) return false;
        if(t.amount < fMin || t.amount > fMax) return false;

        if(query) {
            const accName = getAccountMap().get(t.accountId)?.name || '';
            const matchStr = t.title.toLowerCase().includes(query) || t.category.toLowerCase().includes(query) || (t.subcategory && t.subcategory.toLowerCase().includes(query)) || (t.notes && t.notes.toLowerCase().includes(query)) || (t.ownerName && t.ownerName.toLowerCase().includes(query)) || accName.toLowerCase().includes(query) || (t.tags && t.tags.some(tag => tag.includes(query)));
            if(!matchStr) return false;
        }
        return true;
    });

    filtered.sort((a, b) => {
        let valA, valB;
        if(currentSort.column === 'date') { valA = new Date(a.date); valB = new Date(b.date); }
        else if(currentSort.column === 'amount') { valA = a.amount; valB = b.amount; }
        else if(currentSort.column === 'title') { valA = a.title.toLowerCase(); valB = b.title.toLowerCase(); }
        else if(currentSort.column === 'category') { valA = a.category.toLowerCase(); valB = b.category.toLowerCase(); }
        else if(currentSort.column === 'account') { 
            const accMap = getAccountMap();
            valA = (accMap.get(a.accountId)?.name || '').toLowerCase(); 
            valB = (accMap.get(b.accountId)?.name || '').toLowerCase(); 
        }

        if(valA < valB) return currentSort.order === 'asc' ? -1 : 1;
        if(valA > valB) return currentSort.order === 'asc' ? 1 : -1;
        return 0;
    });

    renderDetailTable(filtered);
}

function sortTable(column) {
    if(currentSort.column === column) { currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc'; } 
    else { currentSort.column = column; currentSort.order = 'desc'; }
    applyFilters();
}

function handleQuickAdd(event) {
    if(event.key === 'Enter') {
        const input = event.target.value.trim();
        if(!input) return;

        const amountMatch = input.match(/\d+$/);
        const amount = amountMatch ? parseInt(amountMatch[0]) : 0;
        if(amount === 0) return alert("❌ Nominal tidak terdeteksi. Contoh: Beli kopi #operasional 25000");

        const tagsMatch = input.match(/#\w+/g) || [];
        const tags = tagsMatch.map(t => t.replace('#', '').toLowerCase());
        let title = input.replace(/\d+$/, '').replace(/#\w+/g, '').trim();

        if (db.accounts.length === 0) return alert("❌ Tidak ada akun aktif!");

        db.transactions.push({
            id: 'TX-' + Date.now(), date: new Date().toISOString().split('T')[0],
            title: title, type: 'expense', category: 'Uncategorized', subcategory: '',
            accountId: db.accounts[0].id, assetType: 'real', amount: amount, tags: tags,
            notes: 'Via Quick Add', createdAt: new Date().toISOString()
        });
        saveData(); event.target.value = ''; refreshAllViews();
        alert(`✅ Berhasil dicatat: ${title} (Rp ${formatRp(amount)})`);
    }
}

function openTransactionModal(baseType) { 
    document.getElementById('tx-base-type').value = baseType;
    document.getElementById('tx-modal-title').innerText = baseType === 'income' ? 'Catat Pemasukan' : 'Catat Pengeluaran';
    ['tx-title','tx-amount','tx-notes','tx-owner', 'tx-tags', 'tx-category', 'tx-subcategory'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('tx-asset-type').value = 'real';
    toggleTitipanFields(); populateAutoSuggestions();

    const accSel = document.getElementById('tx-account'); accSel.innerHTML = '';
    db.accounts.filter(a => a.isActive).forEach(a => accSel.add(new Option(a.name, a.id)));
    document.getElementById('modal-transaction').style.display = 'flex';
}

function toggleTitipanFields() {
    const isTitipan = document.getElementById('tx-asset-type').value === 'titipan';
    document.getElementById('tx-owner-group').style.display = isTitipan ? 'block' : 'none';
    if(isTitipan) document.getElementById('tx-category').value = 'Titipan';
}

function populateAutoSuggestions() {
    const listCat = document.getElementById('cat-suggestions'); const listSub = document.getElementById('subcat-suggestions');
    listCat.innerHTML = ''; listSub.innerHTML = '';
    let cats = new Set(), subs = new Set();
    db.transactions.forEach(t => { cats.add(t.category); if(t.subcategory) subs.add(t.subcategory); });
    cats.forEach(c => listCat.appendChild(new Option(c)));
    subs.forEach(s => listSub.appendChild(new Option(s)));
}

function populateSubCategoryTx() {
    const cat = document.getElementById('tx-category').value.trim();
    const listSub = document.getElementById('subcat-suggestions');
    listSub.innerHTML = '';
    let subs = new Set();
    db.transactions.forEach(t => { if(t.category === cat && t.subcategory) subs.add(t.subcategory); });
    subs.forEach(s => listSub.appendChild(new Option(s)));
}

function saveTransaction() {
    const title = document.getElementById('tx-title').value.trim();
    const amount = parseInt(document.getElementById('tx-amount').value);
    const date = document.getElementById('tx-date').value;
    const assetType = document.getElementById('tx-asset-type').value; 
    const baseType = document.getElementById('tx-base-type').value; 
    
    if(!title || !amount || !date) return alert("Wajib isi Judul, Nominal, dan Tanggal!");

    let finalType = baseType; let ownerName = null;
    if (assetType === 'titipan') {
        finalType = baseType === 'income' ? 'titipan_in' : 'titipan_out';
        ownerName = document.getElementById('tx-owner').value.trim();
        if(!ownerName) return alert("Nama Pemilik Titipan wajib diisi!");
    }

    const tagsInput = document.getElementById('tx-tags').value;
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim().toLowerCase().replace('#','')).filter(t => t) : [];

    db.transactions.push({
        id: 'TX-' + Date.now(), date: date, title: title, type: finalType, 
        category: document.getElementById('tx-category').value.trim() || 'Uncategorized', 
        subcategory: document.getElementById('tx-subcategory').value.trim(), accountId: document.getElementById('tx-account').value, 
        assetType: assetType, amount: amount, ownerName: ownerName, tags: tags, notes: document.getElementById('tx-notes').value, 
        transferGroupId: null, createdAt: new Date().toISOString()
    });

    saveData(); closeModal('modal-transaction'); refreshAllViews(); 
}

function populateTransferSelects() {
    const fromSel = document.getElementById('tf-from'); const toSel = document.getElementById('tf-to');
    if(!fromSel || !toSel) return;
    fromSel.innerHTML = ''; toSel.innerHTML = '';
    db.accounts.filter(a => a.isActive).forEach(a => {
        fromSel.add(new Option(`${a.name} (Saldo: ${formatRp(getAccountBalance(a.id))})`, a.id));
        toSel.add(new Option(a.name, a.id));
    });
}

function saveTransfer() {
    const fromId = document.getElementById('tf-from').value; const toId = document.getElementById('tf-to').value;
    const amount = parseInt(document.getElementById('tf-amount').value); const date = document.getElementById('tf-date').value;
    const memo = document.getElementById('tf-memo').value; 

    if (fromId === toId) return alert("Akun asal dan tujuan tidak boleh sama!");
    if (!amount || amount <= 0) return alert("Nominal tidak valid!");
    if (amount > getAccountBalance(fromId)) return alert("Saldo tidak mencukupi!");

    const accFrom = db.accounts.find(a => a.id === fromId); const accTo = db.accounts.find(a => a.id === toId);
    const groupId = 'TRX-TF-' + Date.now();

    db.transactions.push(
        { id: groupId + '-OUT', date: date, title: 'Transfer Ke ' + accTo.name, type: 'transfer_out', category: 'Transfer', subcategory: 'Antar Rekening', accountId: fromId, assetType: 'real', amount: amount, notes: memo, transferGroupId: groupId, createdAt: new Date().toISOString() },
        { id: groupId + '-IN', date: date, title: 'Transfer Dari ' + accFrom.name, type: 'transfer_in', category: 'Transfer', subcategory: 'Antar Rekening', accountId: toId, assetType: 'real', amount: amount, notes: memo, transferGroupId: groupId, createdAt: new Date().toISOString() }
    );
    saveData(); document.getElementById('tf-amount').value = ''; document.getElementById('tf-memo').value = '';
    alert("✅ Transfer berhasil!"); refreshAllViews();
}

function openAccountModal() { document.getElementById('acc-modal-title').innerText = "Tambah Akun"; document.getElementById('acc-edit-id').value = ''; document.getElementById('acc-name').value = ''; document.getElementById('modal-account').style.display = 'flex'; }
function editAccount(id) { const acc = db.accounts.find(a => a.id === id); if(acc) { document.getElementById('acc-modal-title').innerText = "Edit Akun"; document.getElementById('acc-edit-id').value = id; document.getElementById('acc-name').value = acc.name; document.getElementById('acc-type').value = acc.type; document.getElementById('modal-account').style.display = 'flex'; } }
function saveAccount() {
    const name = document.getElementById('acc-name').value.trim(); const editId = document.getElementById('acc-edit-id').value;
    if(!name) return alert("Nama akun wajib diisi!");
    if(editId) { const acc = db.accounts.find(a => a.id === editId); if(acc) { acc.name = name; acc.type = document.getElementById('acc-type').value; } } 
    else { db.accounts.push({ id: 'ACC-' + Date.now(), name: name, type: document.getElementById('acc-type').value, isActive: true }); }
    saveData(); closeModal('modal-account'); refreshAllViews();
}

function openAssetBreakdown() {
    const assets = calculateAssets();
    document.getElementById('modal-val-real').innerText = formatRp(assets.real);
    document.getElementById('modal-val-titipan').innerText = formatRp(assets.titipan);
    document.getElementById('modal-asset-breakdown').style.display = 'flex';
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }
window.onclick = function(event) { if (event.target.classList.contains('modal')) closeModal(event.target.id); }
function toggleDarkMode() { document.body.setAttribute('data-theme', document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }