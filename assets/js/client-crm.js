// ==========================================
// 1. DATABASE & SETUP
// ==========================================
const DB_JO_KEY = 'jo_db_v47';
const DB_CLIENT_KEY = 'taufik_crm_v2'; // UBAH INI (Sesuaikan dengan script.js)
const VIP_THRESHOLD = 15000000;

const JOB_TYPES = {
    'FKKF': { price: 50000 }, 'FKKR': { price: 150000 }, 'FKKS': { price: 50000 },
    'Feed': { price: 50000 }, 'Reels': { price: 150000 }, 'Story': { price: 50000 },
    'FGP': { price: 0 }, 'Photography': { price: 0 },
    'FGV': { price: 0 }, 'Videography': { price: 0 },
    'FGR': { price: 0 }, 'Retoucher': { price: 0 },
    'FGD': { price: 0 }, 'Design': { price: 0 },
    'FGW': { price: 0 }, 'Web': { price: 0 },
    'FGL': { price: 0 }, 'Lainnya': { price: 0 }
};

let jobOrders = [];
let clients = [];
let currentSelectedClient = null;
let currentView = 'clients'; 

// Broadcast Queue System
let bqList = [];
let bqIndex = 0;

// Fungsi Sembunyikan Suffix di UI CRM
function cleanName(n) { return n ? n.replace(/\s\(\d{4}\)$/, '') : ''; }

// ==========================================
// 2. INIT & EVENT LISTENERS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    jobOrders = JSON.parse(localStorage.getItem(DB_JO_KEY)) || [];
    clients = JSON.parse(localStorage.getItem(DB_CLIENT_KEY)) || [];
    
    // CEK APAKAH ADA PARAMETER URL
    const urlParams = new URLSearchParams(window.location.search);
    const searchQ = urlParams.get('search');
    const actionQ = urlParams.get('action');
    
    switchView('clients');
    populateDashboardFilters();

    // Skenario 1: Buka CRM dan auto-search klien
    if (searchQ) {
        document.getElementById('searchClient').value = searchQ;
        searchClients(); 
        window.history.replaceState({}, document.title, window.location.pathname); 
    }
    
    // Skenario 2: Akses Cepat dari Command Center (+ Klien Baru)
    if (actionQ === 'new') {
        setTimeout(() => { openAddClientModal(); }, 300);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

// TUTUP MODAL JIKA KLIK DI LUAR CARD / PANEL
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        if (event.target.id === 'modal-client-detail') {
            closeClientDetail();
        } else {
            closeModal(event.target.id);
        }
    }
}

function saveClientsDB() { localStorage.setItem(DB_CLIENT_KEY, JSON.stringify(clients)); }

// ==========================================
// 3. CORE CALCULATION LOGIC
// ==========================================
function calculateJobPrice(jo) {
    if (jo.type === 'Adjust' || jo.category === 'General' || jo.manualPrice > 0) return jo.manualPrice || 0; 
    const basePrice = JOB_TYPES[jo.type] ? JOB_TYPES[jo.type].price : 50000; 
    return (jo.type === 'Feed' || jo.type === 'FKKF') ? (basePrice * (jo.slides || 1)) : basePrice; 
}

function getClientIncomeProfile(clientName) {
    let realIncome = 0; 
    let pendingIncome = 0; 
    let validJobsCount = 0;
    
    jobOrders.forEach(job => {
        if(job.clientName && job.clientName.toLowerCase() === clientName.toLowerCase()) {
            const price = calculateJobPrice(job);
            if(job.stage === 'archive' || job.stage === 'done') {
                realIncome += price;
                validJobsCount++;
            } else {
                pendingIncome += price;
            }
        }
    });
    return { realIncome, pendingIncome, validJobsCount };
}

function formatRp(n) { return new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(n); }
function formatDate(s) { return s ? new Date(s).toLocaleDateString('id-ID', {day:'numeric', month:'short', year:'numeric'}) : '-'; }

// ==========================================
// 4. NAVIGATION & RENDER VIEWS
// ==========================================
function switchView(viewName) {
    if (viewName === 'dashboard') {
        const userPin = prompt("🔒 Masukkan PIN Keamanan untuk mengakses Analytics Dashboard:");
        if (userPin !== 'AT240104') {
            alert("❌ PIN Salah! Akses Ditolak.");
            return; 
        }
    }

    // MEMUAT ULANG DATA AGAR SYNC REAL-TIME JIKA ADA JO YG DIHAPUS DI TRACKER
    jobOrders = JSON.parse(localStorage.getItem(DB_JO_KEY)) || [];

    currentView = viewName;
    document.querySelectorAll('.sidebar .menu-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`menu-${viewName}`).classList.add('active');

    document.getElementById('view-dashboard').style.display = 'none';
    document.getElementById('view-clients').style.display = 'none';

    document.getElementById('client-search-container').style.display = 'none';
    document.getElementById('dash-filter-container').style.display = 'none';

    if(viewName === 'dashboard') {
        document.getElementById('view-dashboard').style.display = 'block';
        document.getElementById('view-title').innerText = 'Analytics Dashboard';
        document.getElementById('dash-filter-container').style.display = 'flex';
        renderDashboard();
    } else {
        document.getElementById('view-clients').style.display = 'block';
        document.getElementById('view-title').innerText = viewName === 'vip' ? '👑 VIP Clients' : 'Data Klien';
        document.getElementById('client-search-container').style.display = 'block';
        closeClientDetail();
        renderClientList();
    }
}

function renderClientList(searchTerm = '') {
    const listContainer = document.getElementById('client-list');
    listContainer.innerHTML = '';

    let processedClients = clients.map(c => {
        const profile = getClientIncomeProfile(c.name);
        return { ...c, profile: profile, isVIP: profile.realIncome >= VIP_THRESHOLD };
    });

    if(currentView === 'vip') processedClients = processedClients.filter(c => c.isVIP);

    const filteredClients = processedClients.filter(c => {
        const matchBasic = c.name.toLowerCase().includes(searchTerm) || 
                           (c.company && c.company.toLowerCase().includes(searchTerm)) || 
                           (c.phone && String(c.phone).includes(searchTerm)); 
        
        const cJobs = jobOrders.filter(j => j.clientName && j.clientName.toLowerCase() === c.name.toLowerCase());
        const matchJob = cJobs.some(j => 
            (j.batchID && j.batchID.toLowerCase().includes(searchTerm)) || 
            (j.title && j.title.toLowerCase().includes(searchTerm))
        );

        return matchBasic || matchJob;
    }).sort((a, b) => a.name.localeCompare(b.name));

    if(filteredClients.length === 0) {
        listContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align:center; padding:40px; color:var(--text-color); opacity: 0.5; font-weight:600;">Data tidak ditemukan.</div>`;
        return;
    }

    filteredClients.forEach(client => {
        const card = document.createElement('div');
        card.className = `card`; 
        card.style.borderLeft = client.isVIP ? '4px solid var(--warning)' : '4px solid var(--primary)';
        card.onclick = () => openClientDetail(client.id);
        
        const vipBadge = client.isVIP ? `<span class="badge bg-warning" style="margin-left: 5px; font-size:10px;">VIP</span>` : '';

        // Gunakan cleanName agar 4 digit tidak muncul di list
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <h4 style="margin: 0; font-size: 16px;">${cleanName(client.name)} ${vipBadge}</h4>
            </div>
            <div style="font-size:12px; color:var(--text-color); opacity: 0.7; margin-bottom:5px;">🏢 ${client.company || 'Personal'}</div>
            <div style="font-size:12px; color:var(--text-color); opacity: 0.7; margin-bottom:15px;">📱 ${client.phone || '-'}</div>
            <div style="padding-top:12px; border-top:1px dashed var(--navbar-border); display:flex; justify-content:space-between; align-items:center; font-size:12px; font-weight:700;">
                <span style="color:var(--text-color); opacity: 0.6;">Jobs: ${client.profile.validJobsCount}</span>
                <span style="color:var(--success); font-size:13px;">${formatRp(client.profile.realIncome)}</span>
            </div>
        `;
        listContainer.appendChild(card);
    });
}

function searchClients() { renderClientList(document.getElementById('searchClient').value.toLowerCase()); }

// ==========================================
// 5. CLIENT DETAIL (MODAL SLIDE-IN) & EDIT
// ==========================================
function closeClientDetail() {
    document.getElementById('modal-client-detail').style.display = 'none';
    currentSelectedClient = null;
    
    document.getElementById('info-view').style.display = 'block';
    document.getElementById('info-edit').style.display = 'none';
    document.getElementById('btn-toggle-edit').innerText = '✏️ Edit Info';
}

function openClientDetail(clientId) {
    currentSelectedClient = clients.find(c => c.id === clientId);
    if(!currentSelectedClient) return;

    document.getElementById('info-view').style.display = 'block';
    document.getElementById('info-edit').style.display = 'none';
    document.getElementById('btn-toggle-edit').innerText = '✏️ Edit Info';

    const c = currentSelectedClient;
    const profile = getClientIncomeProfile(c.name);

    document.getElementById('det-name').innerText = cleanName(c.name);
    document.getElementById('det-vip-badge').style.display = profile.realIncome >= VIP_THRESHOLD ? 'inline-block' : 'none';
    
    document.getElementById('view-phone').innerText = c.phone || '-';
    document.getElementById('view-company').innerText = c.company || '-';
    document.getElementById('view-address').innerText = c.address || '-';
    document.getElementById('view-notes').innerText = c.notes || '-';
    
    const emailEl = document.getElementById('view-email');
    emailEl.innerText = c.email || '-';
    emailEl.href = c.email ? `mailto:${c.email}` : '#';

    document.getElementById('edit-id').value = c.id;
    document.getElementById('edit-name').value = c.name; 
    document.getElementById('edit-phone').value = c.phone;
    document.getElementById('edit-company').value = c.company;
    document.getElementById('edit-email').value = c.email;
    document.getElementById('edit-address').value = c.address;
    document.getElementById('edit-notes').value = c.notes;

    document.getElementById('stat-income').innerText = formatRp(profile.realIncome);
    document.getElementById('stat-pending').innerText = `Estimasi Belum Paid: ${formatRp(profile.pendingIncome)}`;

    const cJobs = jobOrders.filter(j => j.clientName && j.clientName.toLowerCase() === c.name.toLowerCase())
                           .sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    const historyContainer = document.getElementById('job-history-list');
    historyContainer.innerHTML = '';

    if(cJobs.length === 0) {
        historyContainer.innerHTML = '<div style="color:var(--text-color); opacity: 0.5; font-size:12px; text-align:center;">Belum ada riwayat pekerjaan.</div>';
    } else {
        cJobs.forEach(job => {
            let qty = job.slides ? `${job.slides} Slide` : '1 Item';
            let price = calculateJobPrice(job);
            let isValid = (job.stage === 'archive' || job.stage === 'done');
            let statusColor = isValid ? 'var(--success)' : 'var(--warning)';
            let priceDisplay = isValid ? formatRp(price) : `<span style="font-size:10px; color:var(--text-color); opacity:0.5;">(Estimasi)</span> <br>${formatRp(price)}`;
            
            historyContainer.innerHTML += `
                <div class="history-card" style="border-left: 4px solid ${statusColor};">
                    <div>
                        <div class="hc-title">${job.title || job.batchID}</div>
                        <div style="font-size:11px; color:var(--text-color); opacity: 0.7;">${formatDate(job.createdAt)} | ${qty} | <strong style="text-transform:uppercase;">${job.stage}</strong></div>
                    </div>
                    <div style="font-weight:800; color:${statusColor}; font-size:13px; text-align:right;">${priceDisplay}</div>
                </div>
            `;
        });
    }

    document.getElementById('modal-client-detail').style.display = 'flex';
}

function toggleEditMode() {
    const viewDiv = document.getElementById('info-view');
    const editDiv = document.getElementById('info-edit');
    const btn = document.getElementById('btn-toggle-edit');
    if(viewDiv.style.display !== 'none') {
        viewDiv.style.display = 'none';
        editDiv.style.display = 'block';
        btn.innerText = 'Batal Edit';
    } else {
        viewDiv.style.display = 'block';
        editDiv.style.display = 'none';
        btn.innerText = '✏️ Edit Info';
    }
}

// ==========================================
// 6. DASHBOARD ANALYTICS
// ==========================================
function populateDashboardFilters() {
    const sel = document.getElementById('dash-client-filter');
    clients.sort((a,b)=>a.name.localeCompare(b.name)).forEach(c => {
        sel.add(new Option(cleanName(c.name), c.name)); 
    });
    const now = new Date();
    document.getElementById('dash-month-filter').value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
}

function renderDashboard() {
    const clientFilter = document.getElementById('dash-client-filter').value;
    const monthFilter = document.getElementById('dash-month-filter').value; 
    
    let fYear = null, fMonth = null;
    if(monthFilter) {
        const parts = monthFilter.split('-');
        fYear = parseInt(parts[0]);
        fMonth = parseInt(parts[1]) - 1; 
    }

    const validJobs = jobOrders.filter(j => j.stage === 'archive' || j.stage === 'done');
    let todayInc = 0, weekInc = 0, monthInc = 0, totalInc = 0;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(now.getDate() - now.getDay()); 
    const startOfWeekTime = startOfWeek.getTime();

    const listContainer = document.getElementById('dash-job-list');
    listContainer.innerHTML = '';
    let filteredJobCount = 0;

    validJobs.forEach(job => {
        if(clientFilter !== 'ALL' && job.clientName.toLowerCase() !== clientFilter.toLowerCase()) return;
        
        const price = calculateJobPrice(job);
        const jobDate = job.archivedDate ? new Date(job.archivedDate) : new Date(job.createdAt);
        const jTime = jobDate.getTime();

        totalInc += price;
        if(jTime >= startOfDay) todayInc += price;
        if(jTime >= startOfWeekTime) weekInc += price;

        if(fYear !== null && (jobDate.getFullYear() !== fYear || jobDate.getMonth() !== fMonth)) return;

        monthInc += price;
        filteredJobCount++;

        listContainer.innerHTML += `
            <div class="history-card" style="border-left: 4px solid var(--success);">
                <div>
                    <div class="hc-title">${job.title || job.batchID} <span style="font-size:11px; font-weight:normal; color:var(--text-color); opacity: 0.5;">(${cleanName(job.clientName)})</span></div>
                    <div style="font-size:11px; color:var(--text-color); opacity: 0.7;">${formatDate(jobDate)} | ${job.type}</div>
                </div>
                <div style="font-weight:800; color:var(--success); font-size:13px;">${formatRp(price)}</div>
            </div>
        `;
    });

    if(filteredJobCount === 0) listContainer.innerHTML = '<div style="color:var(--text-color); opacity: 0.5; font-size:12px; text-align:center; padding:10px;">Tidak ada pekerjaan selesai di periode/klien ini.</div>';

    document.getElementById('dash-day').innerText = formatRp(todayInc);
    document.getElementById('dash-week').innerText = formatRp(weekInc);
    document.getElementById('dash-month').innerText = formatRp(monthInc);
    document.getElementById('dash-total').innerText = formatRp(totalInc);
}

// ==========================================
// 7. CRUD ACTIONS
// ==========================================
function openAddClientModal() {
    ['add-name','add-phone','add-company','add-email','add-address','add-notes'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('modal-add-client').style.display = 'flex';
}

function closeModal(id) { document.getElementById(id).style.display = 'none'; }

function saveClient() {
    let name = document.getElementById('add-name').value.trim();
    const phone = document.getElementById('add-phone').value.trim();
    
    if(!name) return alert("Nama Klien Wajib Diisi!");

    if (phone && phone.length >= 4) {
        const suffix = phone.slice(-4);
        if (!name.endsWith(`(${suffix})`)) {
            name = `${name} (${suffix})`;
        }
    }

    const newClient = {
        id: 'CL-' + Date.now(), 
        name: name,
        phone: phone, 
        company: document.getElementById('add-company').value.trim(),
        email: document.getElementById('add-email').value.trim(), 
        address: document.getElementById('add-address').value.trim(),
        notes: document.getElementById('add-notes').value.trim(), 
        createdAt: new Date().toISOString()
    };
    
    clients.push(newClient); 
    saveClientsDB();
    closeModal('modal-add-client'); 
    switchView('clients'); 
    openClientDetail(newClient.id);
    populateDashboardFilters();
}

function updateClient() {
    const id = document.getElementById('edit-id').value;
    const idx = clients.findIndex(c => c.id === id);
    if(idx === -1) return;

    clients[idx].name = document.getElementById('edit-name').value.trim();
    clients[idx].phone = document.getElementById('edit-phone').value.trim();
    clients[idx].company = document.getElementById('edit-company').value.trim();
    clients[idx].email = document.getElementById('edit-email').value.trim();
    clients[idx].address = document.getElementById('edit-address').value.trim();
    clients[idx].notes = document.getElementById('edit-notes').value.trim();

    saveClientsDB(); toggleEditMode();
    currentSelectedClient = clients[idx]; openClientDetail(id);
    populateDashboardFilters(); renderClientList();
}

function deleteClient() {
    if(!currentSelectedClient) return;
    if(!confirm(`Hapus ${currentSelectedClient.name} dari CRM? (History job tetap aman)`)) return;
    clients = clients.filter(c => c.id !== currentSelectedClient.id);
    saveClientsDB(); closeClientDetail(); populateDashboardFilters(); renderClientList();
}

// ==========================================
// 8. BROADCAST QUEUE SYSTEM
// ==========================================
function chatWhatsApp() {
    if(!currentSelectedClient || !currentSelectedClient.phone) return;
    window.open(`https://wa.me/${String(currentSelectedClient.phone).replace(/\D/g, '')}`, '_blank');
}

function openBroadcastModal() {
    document.getElementById('broadcast-msg').value = '';
    document.getElementById('broadcast-category').value = 'ALL';
    document.getElementById('broadcast-input-area').style.display = 'block';
    document.getElementById('broadcast-action-area').style.display = 'none';
    document.getElementById('modal-broadcast').style.display = 'flex';
}

function startBroadcastQueue() {
    const msg = document.getElementById('broadcast-msg').value;
    const targetCat = document.getElementById('broadcast-category').value;
    
    if(!msg) return alert("Isi pesan terlebih dahulu!");

    bqList = clients.filter(c => {
        if (!c.phone || String(c.phone).trim() === '') return false;
        if (targetCat === 'ALL') return true;
        
        const cJobs = jobOrders.filter(j => j.clientName && j.clientName.toLowerCase() === c.name.toLowerCase());
        
        if (targetCat === 'Content') return cJobs.some(j => j.category === 'Content' || ['FKKF','FKKR','FKKS','Feed','Reels','Story'].includes(j.type));
        if (targetCat === 'Design') return cJobs.some(j => j.type === 'Design' || j.type === 'FGD');
        if (targetCat === 'Photography') return cJobs.some(j => j.type === 'Photography' || j.type === 'FGP');
        if (targetCat === 'Videography') return cJobs.some(j => j.type === 'Videography' || j.type === 'FGV');
        if (targetCat === 'Retoucher') return cJobs.some(j => j.type === 'Retoucher' || j.type === 'FGR' || (j.title && j.title.toLowerCase().includes('retouch')));
        if (targetCat === 'Web') return cJobs.some(j => j.type === 'Web' || j.type === 'FGW');
        
        return false;
    });

    if(bqList.length === 0) return alert(`Tidak ada klien yang cocok untuk kategori: ${targetCat} (Atau klien tersebut belum punya nomor HP)`);

    bqIndex = 0;
    document.getElementById('broadcast-input-area').style.display = 'none';
    document.getElementById('broadcast-action-area').style.display = 'block';
    updateBroadcastUI();
}

function updateBroadcastUI() {
    const statusText = document.getElementById('broadcast-status-text');
    const btnNext = document.getElementById('btn-send-next-wa');

    if(bqIndex >= bqList.length) {
        statusText.innerHTML = "🎉 Selesai! Pesan telah diproses ke semua target klien.";
        btnNext.style.display = 'none';
    } else {
        const client = bqList[bqIndex];
        statusText.innerHTML = `Antrean ${bqIndex + 1} dari ${bqList.length}<br><span style="color:var(--primary); font-size:24px;">${cleanName(client.name)}</span>`;
        btnNext.style.display = 'inline-block';
        btnNext.innerText = `Kirim Pesan Berikutnya ➔`;
    }
}

function sendNextBroadcast() {
    const client = bqList[bqIndex];
    const msg = document.getElementById('broadcast-msg').value;
    window.open(`https://wa.me/${String(client.phone).replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
    
    bqIndex++;
    updateBroadcastUI();
}

// ==========================================
// 9. INTEGRASI CRM KE PROJECT TRACKER
// ==========================================
function buatJODariCRM() {
    if(!currentSelectedClient) return;
    
    const cName = encodeURIComponent(currentSelectedClient.name || '');
    const cPhone = encodeURIComponent(currentSelectedClient.phone || '');
    const cEmail = encodeURIComponent(currentSelectedClient.email || '');
    const cCompany = encodeURIComponent(currentSelectedClient.company || '');
    const cAddress = encodeURIComponent(currentSelectedClient.address || '');
    
    window.location.href = `project-tracker.html?action=newJO&client=${cName}&phone=${cPhone}&email=${cEmail}&company=${cCompany}&address=${cAddress}`;
}