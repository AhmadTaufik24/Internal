// ==========================================
// 1. FIREBASE CONFIGURATION & DB SETUP
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCkUQXBYeMyQuB9X2HleubBDKuV3YpzVRg",
    authDomain: "taufik-internal.firebaseapp.com",
    projectId: "taufik-internal",
    storageBucket: "taufik-internal.firebasestorage.app",
    messagingSenderId: "212857824811",
    appId: "1:212857824811:web:15ba9d4d7edeae4afeec6e"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.firestore();

const DB_JO_KEY = 'jo_db_v47';

const JOB_TYPES = {
    'FKKF': { label: 'Freelance Konten Feed', cat: 'Content', price: 50000 },
    'FKKR': { label: 'Freelance Konten Reels', cat: 'Content', price: 150000 },
    'FKKS': { label: 'Freelance Konten Story', cat: 'Content', price: 50000 },
    'Feed': { label: 'Instagram Feed', cat: 'Content', price: 50000 },
    'Reels': { label: 'Instagram Reels', cat: 'Content', price: 150000 },
    'Story': { label: 'Instagram Story', cat: 'Content', price: 50000 },
    'FGP': { label: 'Freelance Photography', cat: 'General', price: 0 },
    'Photography': { label: 'Photography', cat: 'General', price: 0 },
    'FGV': { label: 'Freelance Videography', cat: 'General', price: 0 },
    'Videography': { label: 'Videography', cat: 'General', price: 0 },
    'FGR': { label: 'Freelance Retouch', cat: 'General', price: 0 }, 
    'Retoucher': { label: 'Retoucher', cat: 'General', price: 0 },
    'FGD': { label: 'Freelance Design', cat: 'General', price: 0 },
    'Design': { label: 'Design', cat: 'General', price: 0 },
    'FGW': { label: 'Freelance Web Dev', cat: 'General', price: 0 }, 
    'Web': { label: 'Web Development', cat: 'General', price: 0 },
    'FGL': { label: 'Freelance General Lainnya', cat: 'General', price: 0 },
    'Lainnya': { label: 'Lainnya', cat: 'General', price: 0 }
};

const MAX_CAPACITY = { feed1: 1, feed2: 1, feed4: 2, reels: 2, story: 7 };
const STAGE_FLOW = ['scheduling', 'preparing', 'progress', 'internal', 'review', 'upload'];
let jobOrders = [];
let cachedClients = []; 

function cleanName(n) { return n ? n.replace(/\s\(\d{4}\)$/, '') : ''; }

// ==========================================
// DB HELPERS
// ==========================================
function updateCloudJO(joId) {
    const jo = jobOrders.find(j => j.id === joId);
    if(jo) db.collection("jobOrders").doc(jo.id.toString()).set(jo).catch(console.error);
}

function saveBatchJOs(josArray) {
    const batch = db.batch();
    josArray.forEach(j => {
        const ref = db.collection("jobOrders").doc(j.id.toString());
        batch.set(ref, j);
    });
    batch.commit().catch(console.error);
}

// =======================================================
// INIT, MIGRATION & REAL-TIME LISTENERS
// =======================================================
document.addEventListener('DOMContentLoaded', () => { 
    migrateJOToFirestore();

    // Listener Real-time JO
    db.collection("jobOrders").onSnapshot((snapshot) => {
        jobOrders = [];
        snapshot.forEach((doc) => jobOrders.push(doc.data()));
        
        renderBoard(); 
        updateLifetimeIncome(); 
        
        const activeSalaryView = document.getElementById('view-salary').style.display !== 'none';
        const activeHistoryView = document.getElementById('view-done').style.display !== 'none';
        if(activeSalaryView || activeHistoryView) {
            renderSalaryTable(window.currentViewType, window.currentCategory);
        }
    });

    // Listener Real-time Clients
    db.collection("clients").onSnapshot((snapshot) => {
        cachedClients = [];
        snapshot.forEach((doc) => cachedClients.push(doc.data()));
    });

    const urlParams = new URLSearchParams(window.location.search);
    
    if(urlParams.get('action') === 'new') {
        setTimeout(() => { openManualJob(); }, 300);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    else if(urlParams.get('action') === 'newJO') {
        const cName = urlParams.get('client') || '';
        const cPhone = urlParams.get('phone') || '';
        const cEmail = urlParams.get('email') || '';
        const cCompany = urlParams.get('company') || '';
        const cAddress = urlParams.get('address') || '';
        
        openManualJob(); 
        
        setTimeout(() => {
            document.getElementById('man-client-search').value = cleanName(cName);
            document.getElementById('man-client').value = cleanName(cName);
            
            const manGroup = document.getElementById('manual-client-input-group');
            if(manGroup) manGroup.style.display = 'none';
            
            if(document.getElementById('man-client-phone')) document.getElementById('man-client-phone').value = cPhone;
            if(document.getElementById('man-client-email')) document.getElementById('man-client-email').value = cEmail;
            if(document.getElementById('man-client-company')) document.getElementById('man-client-company').value = cCompany;
            if(document.getElementById('man-client-address')) document.getElementById('man-client-address').value = cAddress;
        }, 300); // Timeout lebih aman untuk memastikan data cachedClients sudah ditarik
        
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

function migrateJOToFirestore() {
    const localJOs = JSON.parse(localStorage.getItem(DB_JO_KEY)) || [];
    if (localJOs.length > 0) {
        const batch = db.batch();
        localJOs.forEach(jo => {
            const docRef = db.collection("jobOrders").doc(jo.id.toString());
            batch.set(docRef, jo);
        });
        batch.commit().then(() => {
            console.log("Migrasi JO Tracker ke Cloud berhasil!");
            localStorage.removeItem(DB_JO_KEY);
        });
    }
}

// ==========================================
// 2. CORE: RENDER BOARD & CARD
// ==========================================
function getJobDisplayName(jo) {
    if (jo.type === 'Adjust') return jo.title || 'Adjustment';
    
    let batch = jo.batchID ? jo.batchID + ' ' : '';
    if (jo.category === 'Content') return `${batch}${jo.title || ''}`.trim();
    return jo.title ? `${batch}${jo.title}`.trim() : (jo.batchID || 'NO-BATCH');
}

function renderBoard() {
    STAGE_FLOW.forEach(stg => {
        const colBody = document.getElementById(`col-${stg}`);
        if(colBody) colBody.innerHTML = '';
        const colCount = document.getElementById(`c-${stg}`);
        if(colCount) colCount.innerText = jobOrders.filter(j => j.stage === stg).length;
    });

    jobOrders.forEach(jo => {
        if(jo.stage === 'archive' || jo.stage === 'done') return;

        const card = document.createElement('div');
        card.className = `card ${jo.category === 'General' ? 'general-job' : ''}`;
        card.onclick = (e) => { if(!e.target.closest('button')) showJobDetail(jo.id); };

        const dl = checkDeadline(jo.data.deadline);
        const dlHtml = `<div style="display:flex; align-items:center; font-size:11px; margin-bottom:5px; color:#555;"><span class="dl-indicator ${dl.bg}"></span> <span class="${dl.txt}">${dl.text}</span></div>`;
        let statusHTML = jo.statusText ? `<span class="status-text" style="color:${jo.statusText.includes('Revisi')?'#e74c3c':'#f39c12'}">${jo.statusText}</span>` : '';
        const displayTitle = getJobDisplayName(jo);

        let nominalHTML = '';
        if (jo.category === 'General') {
            nominalHTML = `<div style="font-size:11px; font-weight:800; color:var(--success); margin-top:5px;">💰 ${formatRp(jo.manualPrice || 0)}</div>`;
        }

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <h4 style="font-size:16px; font-weight:800; color:var(--primary); margin:0; line-height:1.4; padding-right:10px;">${displayTitle}</h4>
                <div class="card-tools" style="display:flex; gap:5px; flex-shrink:0;">
                    <button class="tool-btn btn-void" onclick="voidJob('${jo.id}', event)">↩</button>
                    <button class="tool-btn btn-del" onclick="deleteJob('${jo.id}', event)">🗑️</button>
                </div>
            </div>
            ${dlHtml} ${statusHTML} ${nominalHTML}
            <div style="margin-top:12px; padding-top:12px; border-top:1px dashed #ddd;">${getActionButtons(jo)}</div>`;
        
        const targetCol = document.getElementById(`col-${jo.stage}`);
        if(targetCol) targetCol.appendChild(card);
    });
}

function getActionButtons(jo) {
    if(jo.stage === 'scheduling') return `<button class="btn btn-sm" onclick="openPrep('${jo.id}')">Prepare ➜</button>`;
    if(jo.stage === 'preparing') return `<button class="btn btn-sm" onclick="openPrep('${jo.id}')">Lanjut Prepare ➜</button>`;
    if(jo.stage === 'progress') return `<button class="btn btn-sm" onclick="openProg('${jo.id}')">Kirim QC Internal ➜</button>`;
    if(jo.stage === 'internal') return `<div style="display:flex; gap:5px;"><button class="btn btn-sm" style="background:var(--success); color:white" onclick="openSendClient('${jo.id}')">✅ OK Lanjut Klien</button> <button class="btn btn-sm btn-danger" onclick="openInternalRev('${jo.id}')">❌ Revisi</button></div>`;
    if(jo.stage === 'review') return `<button class="btn btn-sm" style="background:#f39c12; color:white;" onclick="openRev('${jo.id}')">Keputusan Klien ⚖️</button>`;
    if(jo.stage === 'upload') return `<div style="display:flex; gap:5px;"><button class="btn btn-sm" style="background:#f1c40f; color:#000;" onclick="delayUpload('${jo.id}')">⏳ Tunda</button><button class="btn btn-sm" style="background:var(--success); color:white" onclick="doArchive('${jo.id}')">✅ Selesai</button></div>`;
    return '';
}

// ==========================================
// 3. JOB DETAIL (CANVAS & 3 LINKS)
// ==========================================
function toggleEditMode() {
    const container = document.getElementById('detail-container');
    container.classList.toggle('is-editing');
    document.getElementById('btn-toggle-edit').style.display = container.classList.contains('is-editing') ? 'none' : 'block';
}

function showJobDetail(id) {
    const jo = jobOrders.find(j => j.id === id); if(!jo) return;
    
    jo.data.internalLink = jo.data.internalLink || jo.data.link || '';
    jo.data.clientLink = jo.data.clientLink || '';

    document.getElementById('detail-container').classList.remove('is-editing');
    document.getElementById('btn-toggle-edit').style.display = 'block';
    document.getElementById('edit-id').value = id;

    document.getElementById('view-title').innerText = jo.title || '-';
    document.getElementById('view-client').innerText = cleanName(jo.clientName) || '-';
    document.getElementById('view-batch').innerText = jo.batchID || '-';
    document.getElementById('view-deadline').innerText = formatDate(jo.data.deadline);
    document.getElementById('view-status').innerText = jo.statusText || '-';
    
    const clientInfo = cachedClients.find(c => c.name.toLowerCase() === (jo.clientName || '').toLowerCase());
    
    if (clientInfo) {
        document.getElementById('det-client-phone').innerText = clientInfo.phone || '-';
        document.getElementById('det-client-email').innerText = clientInfo.email || '-';
        document.getElementById('det-client-address').innerText = clientInfo.address || '-';
        document.getElementById('client-info-box').style.display = 'block';
        document.getElementById('btn-to-crm').style.display = 'inline-block';
        document.getElementById('btn-to-crm').onclick = () => {
            window.open(`client-crm.html?search=${encodeURIComponent(jo.clientName)}`, '_blank');
        };
    } else {
        document.getElementById('client-info-box').style.display = 'none';
        document.getElementById('btn-to-crm').style.display = 'none';
    }

    let typeLabel = JOB_TYPES[jo.type] ? JOB_TYPES[jo.type].label : jo.type;
    document.getElementById('view-type').innerText = `${typeLabel} ${jo.type==='Feed'||jo.type==='FKKF' ? `(${jo.slides || 1}S)` : ''}`;

    document.getElementById('view-ref').innerHTML = linkify(jo.data.ref);
    document.getElementById('view-int-link').innerHTML = linkify(jo.data.internalLink);
    document.getElementById('view-cli-link').innerHTML = linkify(jo.data.clientLink);

    document.getElementById('edit-title').value = jo.title || '';
    document.getElementById('edit-client').value = jo.clientName || ''; 
    document.getElementById('edit-deadline').value = jo.data.deadline || '';
    document.getElementById('edit-status').value = jo.statusText || '';
    
    document.getElementById('edit-ref').value = jo.data.ref || '';
    document.getElementById('edit-int-link').value = jo.data.internalLink || '';
    document.getElementById('edit-cli-link').value = jo.data.clientLink || '';

    const editSlideGrp = document.getElementById('edit-slide-group');
    if(editSlideGrp) editSlideGrp.style.display = (jo.type === 'Feed' || jo.type === 'FKKF') ? 'block' : 'none';
    const editSlideInp = document.getElementById('edit-slides');
    if(editSlideInp) editSlideInp.value = jo.slides || 1;

    const editNominalGrp = document.getElementById('edit-nominal-group');
    if (editNominalGrp) {
        if (jo.category === 'General') {
            editNominalGrp.style.display = 'block';
            document.getElementById('view-nominal').innerText = formatRp(jo.manualPrice || 0);
            document.getElementById('edit-nominal').value = jo.manualPrice || 0;
        } else {
            editNominalGrp.style.display = 'none';
        }
    }

    const dl = checkDeadline(jo.data.deadline); 
    const dlBadge = document.getElementById('det-deadline-badge'); 
    dlBadge.innerText = dl.text; dlBadge.className = 'badge ' + dl.bg;
    document.getElementById('det-path').innerText = getPeriodPath(jo);
    
    renderHistoryLog(jo); 
    document.getElementById('modal-detail').style.display = 'flex';
}

function saveJobDetail() {
    const id = document.getElementById('edit-id').value;
    const jo = jobOrders.find(j => j.id === id); if(!jo) return;

    jo.title = document.getElementById('edit-title').value;
    jo.clientName = document.getElementById('edit-client').value;
    jo.data.deadline = document.getElementById('edit-deadline').value;
    jo.statusText = document.getElementById('edit-status').value;
    
    jo.data.ref = document.getElementById('edit-ref').value;
    jo.data.internalLink = document.getElementById('edit-int-link').value;
    jo.data.clientLink = document.getElementById('edit-cli-link').value;

    const editSlideInp = document.getElementById('edit-slides');
    if(editSlideInp && (jo.type === 'Feed' || jo.type === 'FKKF')) {
        jo.slides = parseInt(editSlideInp.value) || 1;
    }

    const editNominalInp = document.getElementById('edit-nominal');
    if(editNominalInp && jo.category === 'General') {
        jo.manualPrice = parseInt(editNominalInp.value) || 0;
    }

    const oldHex = jo.batchID ? jo.batchID.split('-')[0] : null;
    jo.batchID = generateBatchCode(jo.type, cleanName(jo.clientName), oldHex);

    updateCloudJO(jo.id);
    renderBoard(); toggleEditMode(); showJobDetail(id);
}

// ==========================================
// 4. CREATION & SMART SEARCH CLIENT
// ==========================================
function generateBatchCode(typeCode, clientName, existingHex = null) {
    const hex = existingHex || Math.random().toString(36).substring(2,6).toUpperCase();
    const cleanClient = (clientName || 'NONAME').replace(/[^a-zA-Z0-9 ]/g, '').trim().substring(0, 15);
    return `${hex}-${typeCode}-${cleanClient}`;
}

function toggleManualTypes() { 
    const c = document.getElementById('man-category').value; 
    const t = document.getElementById('man-type'); 
    
    const currentVal = t.value;
    t.innerHTML = ''; 
    Object.keys(JOB_TYPES).forEach(key => {
        if(JOB_TYPES[key].cat === c && !['Feed','Reels','Story','Photography','Design','Web','Retoucher','Lainnya'].includes(key)) { 
            t.add(new Option(`[${key}] ${JOB_TYPES[key].label}`, key)); 
        }
    });
    if ([...t.options].some(o => o.value === currentVal)) t.value = currentVal;

    document.getElementById('man-nominal-group').style.display = c === 'General' ? 'block' : 'none'; 
    
    const manSlideGrp = document.getElementById('man-slide-group');
    if(manSlideGrp) manSlideGrp.style.display = (c === 'Content' && (t.value === 'FKKF' || t.value === 'Feed')) ? 'block' : 'none';

    const searchInput = document.getElementById('man-client-search');
    if (c === 'Content' && !searchInput.value) {
        const dihidangClient = cachedClients.find(client => client.name.toLowerCase().includes('dihidang'));
        if(dihidangClient) {
            selectClientOption(dihidangClient, false);
        } else {
            selectClientOption({ name: 'Dihidang', phone: '', email: '', company: '', address: '' }, true);
        }
    }
}

function populateClientSelect() {
    cachedClients.sort((a,b) => a.name.localeCompare(b.name));
    renderClientDropdown();
}

function renderClientDropdown(filterText = '') {
    const dropdown = document.getElementById('man-client-dropdown');
    dropdown.innerHTML = '';
    
    const q = filterText.toLowerCase();
    
    const newOpt = document.createElement('div');
    newOpt.className = 'cc-dropdown-new';
    newOpt.innerHTML = `+ Gunakan "${filterText || 'Klien Baru'}" (Ketik Manual)`;
    newOpt.onclick = () => selectClientOption({ name: filterText, phone: '', email: '', company: '', address: '' }, true);
    dropdown.appendChild(newOpt);

    let matchCount = 0;
    cachedClients.forEach(c => {
        const searchStr = `${c.name} ${c.company || ''} ${c.phone || ''}`.toLowerCase();
        if (searchStr.includes(q)) {
            matchCount++;
            const opt = document.createElement('div');
            opt.className = 'cc-dropdown-item';
            opt.innerHTML = `
                <strong style="color: var(--text-color);">${c.name}</strong> 
                ${c.company ? `<span style="color: #888; font-size:10px;">(${c.company})</span>` : ''}<br>
                <span style="color: #888; font-size:10px;">📱 ${c.phone || '-'}</span>
            `;
            opt.onclick = () => selectClientOption(c, false);
            dropdown.appendChild(opt);
        }
    });

    if (matchCount === 0 && filterText !== '') {
        const noMatch = document.createElement('div');
        noMatch.style.cssText = "padding: 10px 15px; font-size: 11px; color: #888; text-align: center;";
        noMatch.innerText = "Klien tidak ditemukan di CRM.";
        dropdown.appendChild(noMatch);
    }
}

function showClientOptions() {
    document.getElementById('man-client-dropdown').style.display = 'block';
    renderClientDropdown(document.getElementById('man-client-search').value);
}

function filterClientOptions() {
    const val = document.getElementById('man-client-search').value;
    document.getElementById('man-client').value = val; 
    renderClientDropdown(val);
}

function selectClientOption(client, isNew) {
    document.getElementById('man-client-search').value = client.name;
    document.getElementById('man-client').value = client.name;
    
    const manualGroup = document.getElementById('manual-client-input-group');
    
    if (!isNew) {
        if(manualGroup) manualGroup.style.display = 'none';
        document.getElementById('man-client-phone').value = client.phone || '';
        document.getElementById('man-client-email').value = client.email || '';
        document.getElementById('man-client-company').value = client.company || '';
        document.getElementById('man-client-address').value = client.address || '';
    } else {
        if(manualGroup) manualGroup.style.display = 'block';
        document.getElementById('man-client-phone').value = '';
        document.getElementById('man-client-email').value = '';
        document.getElementById('man-client-company').value = '';
        document.getElementById('man-client-address').value = '';
        
        setTimeout(() => { document.getElementById('man-client').focus(); }, 100);
    }
    
    document.getElementById('man-client-dropdown').style.display = 'none';
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('#man-client-search') && !e.target.closest('#man-client-dropdown')) {
        const dd = document.getElementById('man-client-dropdown');
        if (dd) dd.style.display = 'none';
    }
});

function openManualJob() { 
    populateClientSelect(); 
    
    document.getElementById('modal-manual').style.display = 'flex'; 
    document.getElementById('man-category').value = 'Content'; 
    document.getElementById('man-title').value = ''; 
    document.getElementById('man-price').value = ''; 
    
    document.getElementById('man-client-search').value = '';
    document.getElementById('man-client').value = '';
    
    const manGroup = document.getElementById('manual-client-input-group');
    if(manGroup) manGroup.style.display = 'none';
    
    if(document.getElementById('man-client-phone')) document.getElementById('man-client-phone').value = '';
    if(document.getElementById('man-client-email')) document.getElementById('man-client-email').value = '';
    if(document.getElementById('man-client-company')) document.getElementById('man-client-company').value = '';
    if(document.getElementById('man-client-address')) document.getElementById('man-client-address').value = '';

    const manSlideInp = document.getElementById('man-slides');
    if(manSlideInp) manSlideInp.value = 1;
    toggleManualTypes(); 
}

function saveManualJob() {
    const c = document.getElementById('man-category').value; 
    const t = document.getElementById('man-title').value; 
    
    let cl = document.getElementById('man-client').value.trim(); 
    const typeCode = document.getElementById('man-type').value;
    
    const phoneVal = document.getElementById('man-client-phone') ? document.getElementById('man-client-phone').value.trim() : '';
    const emailVal = document.getElementById('man-client-email') ? document.getElementById('man-client-email').value.trim() : '';
    const companyVal = document.getElementById('man-client-company') ? document.getElementById('man-client-company').value.trim() : '';
    const addressVal = document.getElementById('man-client-address') ? document.getElementById('man-client-address').value.trim() : '';

    if (phoneVal && phoneVal.length >= 4) {
        const suffix = phoneVal.slice(-4);
        if (!cl.endsWith(`(${suffix})`)) {
            cl = `${cl} (${suffix})`;
        }
    }

    const manSlideInp = document.getElementById('man-slides');
    const slidesVal = manSlideInp ? parseInt(manSlideInp.value) : 1;

    if(!cl) return alert('Pilih atau ketik Nama Klien untuk membuat kode Batch!');
    const batchID = generateBatchCode(typeCode, cleanName(cl)); 
    const j = createJob(typeCode, t, batchID, slidesVal, cl); 
    j.category = c; j.data.deadline = document.getElementById('man-deadline').value;
    if(c === 'General') j.manualPrice = parseInt(document.getElementById('man-price').value) || 0;
    
    jobOrders.push(j); 
    db.collection("jobOrders").doc(j.id.toString()).set(j).catch(console.error);

    // Sync CRM Client
    let existingClient = cachedClients.find(client => client.name.toLowerCase() === cl.toLowerCase());
    
    if(!existingClient) {
        const isContent = c === 'Content' || ['FKKF','FKKR','FKKS','Feed','Reels','Story'].includes(typeCode);
        const newClient = {
            id: 'CL-' + Date.now() + Math.random().toString(36).substring(2,6).toUpperCase(),
            name: cl,
            phone: phoneVal,
            email: emailVal,
            address: addressVal,
            company: companyVal || (isContent ? "Dihidang" : ""), 
            notes: "Auto-imported dari form pembuatan JO Tracker",
            createdAt: new Date().toISOString()
        };
        db.collection("clients").doc(newClient.id).set(newClient);
    } else if (phoneVal || emailVal || companyVal || addressVal) {
        let isUpdated = false;
        if(phoneVal && !existingClient.phone) { existingClient.phone = phoneVal; isUpdated = true; }
        if(emailVal && !existingClient.email) { existingClient.email = emailVal; isUpdated = true; }
        if(companyVal && !existingClient.company) { existingClient.company = companyVal; isUpdated = true; }
        if(addressVal && !existingClient.address) { existingClient.address = addressVal; isUpdated = true; }
        if(isUpdated) db.collection("clients").doc(existingClient.id).set(existingClient);
    }

    closeModal('modal-manual'); 
    renderBoard();
}

function createJob(type, title, batchID, slides=1, clientName='') { 
    return { 
        id: Date.now() + Math.random().toString(36).slice(2), category: JOB_TYPES[type] ? JOB_TYPES[type].cat : 'Content', 
        type, title, clientName, batchID, stage: 'scheduling', slides: (type==='FKKF' || type==='Feed') ? slides : 1, 
        manualPrice: 0, statusText: '', portfolioLink: '', periodLink: '',
        data: { ref:'', deadline:'', internalLink:'', clientLink:'', chkRef: false, chkFolder: false }, 
        history: [], createdAt: new Date().toISOString(), archivedDate: null 
    }; 
}

// ==========================================
// 5. WORKFLOW: INTERNAL, CLIENT, ALERT UI
// ==========================================
function openPrep(id) { 
    const jo = jobOrders.find(j => j.id === id); 
    document.getElementById('prep-id').value = id; 
    document.getElementById('prep-ref').value = jo.data.ref || ''; 
    document.getElementById('prep-deadline').value = jo.data.deadline || ''; 
    document.getElementById('prep-notes-internal').value = ''; 
    document.getElementById('prep-slides').value = jo.slides || 1; 
    document.getElementById('slide-group').style.display = (jo.type === 'Feed' || jo.type === 'FKKF') ? 'block' : 'none'; 
    document.getElementById('prep-chk-ref').checked = jo.data.chkRef || false;
    document.getElementById('prep-chk-folder').checked = jo.data.chkFolder || false;
    
    document.getElementById('prep-alert').style.display = 'none'; 
    document.getElementById('modal-prep').style.display = 'flex'; 
}

function savePreparing() { 
    const jo = jobOrders.find(j => j.id === document.getElementById('prep-id').value); 
    const alertBox = document.getElementById('prep-alert');

    jo.data.ref = document.getElementById('prep-ref').value; 
    jo.data.deadline = document.getElementById('prep-deadline').value; 
    jo.data.chkRef = document.getElementById('prep-chk-ref').checked;
    jo.data.chkFolder = document.getElementById('prep-chk-folder').checked;

    const note = document.getElementById('prep-notes-internal').value; 
    if(note) { 
        if(!jo.history) jo.history=[]; 
        jo.history.push({ date: new Date().toLocaleString('id-ID'), msg: note, type: 'internal', voided: false }); 
    } 
    if(jo.type === 'Feed' || jo.type === 'FKKF') jo.slides = parseInt(document.getElementById('prep-slides').value) || 1; 
    
    if (jo.data.chkRef && jo.data.chkFolder) {
        jo.stage = 'progress'; 
        alertBox.className = 'ui-alert success';
        alertBox.innerHTML = `<strong>✅ Siap Dikerjakan!</strong> Semua checklist selesai. Job masuk ke On Progress.`;
        alertBox.style.display = 'flex';
        updateCloudJO(jo.id); renderBoard();
        setTimeout(() => closeModal('modal-prep'), 1500); 
    } else {
        jo.stage = 'preparing';
        alertBox.className = 'ui-alert warning';
        alertBox.innerHTML = `<strong>⚠️ Progress Tersimpan.</strong> Centang kedua checklist di atas jika ingin lanjut ke On Progress.`;
        alertBox.style.display = 'flex';
        updateCloudJO(jo.id); renderBoard();
    }
}

function openProg(id) { 
    const jo = jobOrders.find(j => j.id === id);
    document.getElementById('prog-id').value = id; 
    document.getElementById('prog-link').value = jo.data.internalLink || jo.data.link || ''; 
    document.getElementById('modal-prog').style.display = 'flex'; 
}
function saveProgress() { 
    const jo = jobOrders.find(j => j.id === document.getElementById('prog-id').value); 
    const link = document.getElementById('prog-link').value; 
    if(!link) return alert("WAJIB ISI LINK QC INTERNAL!"); 
    jo.data.internalLink = link; 
    jo.stage = 'internal'; jo.statusText = 'QC Internal'; 
    updateCloudJO(jo.id); closeModal('modal-prog'); renderBoard(); 
}

function openInternalRev(id) {
    document.getElementById('int-rev-id').value = id;
    document.getElementById('int-rev-notes').value = '';
    document.getElementById('modal-internal-rev').style.display = 'flex';
}
function saveInternalRev() {
    const jo = jobOrders.find(j => j.id === document.getElementById('int-rev-id').value);
    const note = document.getElementById('int-rev-notes').value;
    if(!note) return alert("Catatan revisi internal wajib diisi!");
    if(!jo.history) jo.history=[]; 
    jo.history.push({ date: new Date().toLocaleString('id-ID'), msg: `REVISI INTERNAL: ${note}`, type: 'internal', voided: false });
    
    jo.stage = 'progress'; jo.statusText = 'Revisi Internal'; 
    updateCloudJO(jo.id); closeModal('modal-internal-rev'); renderBoard();
}

function openSendClient(id) {
    const jo = jobOrders.find(j => j.id === id);
    document.getElementById('send-cli-id').value = id;
    document.getElementById('send-cli-link').value = jo.data.clientLink || '';
    document.getElementById('modal-send-client').style.display = 'flex';
}
function saveSendClient() {
    const jo = jobOrders.find(j => j.id === document.getElementById('send-cli-id').value);
    const link = document.getElementById('send-cli-link').value;
    if(!link) return alert("Link Review Klien wajib diisi sebelum dikirim!");
    jo.data.clientLink = link;
    jo.stage = 'review'; jo.statusText = 'Menunggu Review Klien'; 
    updateCloudJO(jo.id); closeModal('modal-send-client'); renderBoard();
}

function openRev(id) { document.getElementById('rev-id').value = id; document.getElementById('rev-notes-client').value = ''; document.getElementById('modal-rev').style.display = 'flex'; }
function saveReview(dec) { 
    const jo = jobOrders.find(j => j.id === document.getElementById('rev-id').value); 
    const note = document.getElementById('rev-notes-client').value; if(!jo.history) jo.history=[]; 
    if(dec === 'revisi') { 
        if(!note) return alert("Isi catatan revisi klien!"); 
        jo.history.push({ date: new Date().toLocaleString('id-ID'), msg: `REVISI KLIEN: ${note}`, type: 'client', voided: false }); 
        jo.statusText = 'Revisi Klien'; 
    } else { 
        if(note) jo.history.push({ date: new Date().toLocaleString('id-ID'), msg: `ACC NOTE: ${note}`, type: 'client', voided: false }); 
        jo.statusText = 'Approved ✅'; jo.stage = 'upload'; 
    } updateCloudJO(jo.id); closeModal('modal-rev'); renderBoard(); 
}
function delayUpload(id) { const jo = jobOrders.find(j => j.id === id); if(!jo.history) jo.history=[]; jo.history.push({ date: new Date().toLocaleString('id-ID'), msg: `STATUS: Upload Tertunda`, type: 'internal', voided: false }); jo.statusText = 'Upload Tertunda ⏳'; updateCloudJO(jo.id); renderBoard(); }

// ==========================================
// 6. TARGET & WEEKLY 
// ==========================================
function openTargetCalc() { document.getElementById('target-money').value=''; document.getElementById('modal-target').style.display='flex'; }
function generateByTarget() {
    const target = parseInt(document.getElementById('target-money').value); if(!target) return alert("Isi target nominal!");
    
    let targetDihidang = cachedClients.find(c => c.name.toLowerCase().includes('dihidang') && c.phone && String(c.phone).trim().length >= 4);
    const clientName = targetDihidang ? targetDihidang.name : "Dihidang";

    let current = 0; const newJobs = []; let counts = { feed1:0, feed2:0, feed4:0, reels:0, story:0 };
    while (current < target) {
        let added = false;
        if (counts.reels < MAX_CAPACITY.reels && current < target) { newJobs.push(createJob('FKKR', `Reels #${counts.reels+1}`, generateBatchCode('FKKR', cleanName(clientName)), 1, clientName)); current += JOB_TYPES['FKKR'].price; counts.reels++; added = true; }
        else if (counts.feed4 < MAX_CAPACITY.feed4 && current < target) { newJobs.push(createJob('FKKF', `Feed 4S #${counts.feed4+1}`, generateBatchCode('FKKF', cleanName(clientName)), 4, clientName)); current += (JOB_TYPES['FKKF'].price * 4); counts.feed4++; added = true; }
        else if (counts.feed2 < MAX_CAPACITY.feed2 && current < target) { newJobs.push(createJob('FKKF', `Feed 2S`, generateBatchCode('FKKF', cleanName(clientName)), 2, clientName)); current += (JOB_TYPES['FKKF'].price * 2); counts.feed2++; added = true; }
        else if (counts.feed1 < MAX_CAPACITY.feed1 && current < target) { newJobs.push(createJob('FKKF', `Feed 1S`, generateBatchCode('FKKF', cleanName(clientName)), 1, clientName)); current += JOB_TYPES['FKKF'].price; counts.feed1++; added = true; }
        else if (counts.story < MAX_CAPACITY.story && current < target) { newJobs.push(createJob('FKKS', `Story #${counts.story+1}`, generateBatchCode('FKKS', cleanName(clientName)), 1, clientName)); current += JOB_TYPES['FKKS'].price; counts.story++; added = true; }
        if (!added) break;
    }
    if(confirm(`Membuat ${newJobs.length} Job untuk ${cleanName(clientName)}.\nTotal: Rp ${formatRp(current)}`)) { 
        jobOrders = [...jobOrders, ...newJobs]; 
        saveBatchJOs(newJobs);
        closeModal('modal-target'); renderBoard(); 
    }
}

function generateWeeklyTarget() {
    let targetDihidang = cachedClients.find(c => c.name.toLowerCase().includes('dihidang') && c.phone && String(c.phone).trim().length >= 4);
    const clientName = targetDihidang ? targetDihidang.name : "Dihidang";

    if(!confirm(`Generate Paket Job Mingguan untuk ${cleanName(clientName)}?`)) return;
    
    const jobs = [
        createJob('FKKF', 'Feed Single (1S)', generateBatchCode('FKKF', cleanName(clientName)), 1, clientName),
        createJob('FKKF', 'Feed Carousel (2S)', generateBatchCode('FKKF', cleanName(clientName)), 2, clientName),
        createJob('FKKF', 'Feed Carousel (4S) A', generateBatchCode('FKKF', cleanName(clientName)), 4, clientName),
        createJob('FKKF', 'Feed Carousel (4S) B', generateBatchCode('FKKF', cleanName(clientName)), 4, clientName),
        createJob('FKKR', 'Reels #1', generateBatchCode('FKKR', cleanName(clientName)), 1, clientName),
        createJob('FKKR', 'Reels #2', generateBatchCode('FKKR', cleanName(clientName)), 1, clientName)
    ];
    for(let i=1; i<=7; i++) jobs.push(createJob('FKKS', `Story #${i}`, generateBatchCode('FKKS', cleanName(clientName)), 1, clientName));
    
    jobOrders = [...jobOrders, ...jobs]; 
    saveBatchJOs(jobs);
    renderBoard();
}

// ==========================================
// 7. RENDER SALARY TABLE & REPORT
// ==========================================
function renderSalaryTable(viewType, category) {
    window.currentViewType = viewType; window.currentCategory = category;
    const containerId = viewType==='salary' ? (category==='content' ? 'salary-dashboard-content' : 'salary-dashboard-general') : (category==='content' ? 'history-dashboard-content' : 'history-dashboard-general');
    const container = document.getElementById(containerId); if(!container) return;
    container.innerHTML = ''; const stageFilter = viewType === 'salary' ? 'archive' : 'done';
    
    const items = jobOrders.filter(j => j.stage === stageFilter && (category==='content' ? j.category==='Content' : j.category==='General'));
    if(items.length === 0) { container.innerHTML = '<div style="text-align:center; padding:40px; color:#aaa; font-style:italic;">Belum ada data di periode ini.</div>'; return; }
    
    const report = {};
    items.forEach(jo => {
        const d = new Date(jo.archivedDate); const key = getPeriod(d).key;
        if(!report[key]) report[key] = { total:0, items:[], title: key };
        let price = 0;
        if (jo.type === 'Adjust' || jo.category === 'General') { price = jo.manualPrice || 0; } 
        else { const basePrice = JOB_TYPES[jo.type] ? JOB_TYPES[jo.type].price : 50000; price = (jo.type === 'Feed' || jo.type === 'FKKF') ? (basePrice * (jo.slides || 1)) : basePrice; }
        report[key].total += price; report[key].items.push({...jo, price});
    });

    Object.keys(report).sort().reverse().forEach(key => {
        const data = report[key]; const hasLink = data.items.some(i => i.periodLink && i.periodLink.length > 5); let buttonsHTML = '';
        if (viewType === 'salary') {
            const btnLinkClass = hasLink ? 'btn-outline' : 'btn'; const btnLinkText = hasLink ? '🔗 Edit Link' : '🔗 Input Link'; const btnLinkStyle = hasLink ? 'border-color:#2ecc71; color:#2ecc71;' : ''; const disabledAttr = hasLink ? '' : 'disabled'; const disabledStyle = hasLink ? '' : 'opacity:0.5; cursor:not-allowed; background:#eee; color:#999; border:1px solid #ddd;'; const catStr = category==='content' ? 'Content' : 'General';
            buttonsHTML = `<div style="display:flex; gap:5px; margin-top:10px; justify-content:flex-end; flex-wrap:wrap;"><button class="btn btn-sm ${btnLinkClass}" onclick="openPeriodLink('${key}', '${catStr}')" style="${btnLinkStyle} width:auto;">${btnLinkText}</button><button class="btn btn-sm btn-outline" onclick="exportProfessionalPDF('${key}', '${catStr}')" style="width:auto; ${disabledStyle}" ${disabledAttr}>⬇️ PDF</button><button class="btn btn-sm" onclick="shareProfessionalPDF('${key}', '${catStr}')" style="width:auto; background:#25D366; color:white; border:none; ${disabledStyle}" ${disabledAttr}>📲 Share WA</button><button class="btn btn-sm" onclick="openFinalize('${key}', '${catStr}')" style="width:auto; background:#333; color:white; ${disabledStyle}" ${disabledAttr}>🔒 Final</button></div>`;
        } else { buttonsHTML = '<div style="margin-top:10px; text-align:right;"><span style="color:var(--success); font-weight:bold; font-size:12px; border:1px solid var(--success); padding:4px 8px; border-radius:4px;">✅ PERIODE DITUTUP (PAID)</span></div>'; }

        let html = `<div class="salary-card"><div style="display:flex; justify-content:space-between; align-items:flex-start;"><div><h3 style="margin-bottom:5px;">${data.title}</h3><div style="font-size:12px; color:#888;">${data.items.length} Pekerjaan Selesai</div></div><div style="text-align:right;"><div style="font-size:11px; color:#666; text-transform:uppercase; font-weight:600;">Total Pendapatan</div><div style="font-size:24px; color:var(--success); font-weight:700;">${formatRp(data.total)}</div></div></div><table><thead><tr><th width="15%">Tgl</th><th width="40%">Job</th><th width="15%">Qty / Slide</th><th width="15%">Ket</th><th width="15%" style="text-align:right;">Rp</th></tr></thead><tbody>`;
        data.items.forEach(i => { 
            const isAdj = i.type === 'Adjust'; let qtyDisplay = '-';
            if (i.type === 'Feed' || i.type === 'FKKF') qtyDisplay = `<strong>${i.slides || 1}</strong> Slide`; else if (i.type === 'Reels' || i.type === 'FKKR') qtyDisplay = '1 Video'; else if (i.type === 'Story' || i.type === 'FKKS') qtyDisplay = '1 Konten'; else if (i.type !== 'Adjust') qtyDisplay = '1 Aset';
            
            let displayTitle = getJobDisplayName(i);
            let noteHtml = '';
            if(isAdj && i.history && i.history[0] && i.history[0].msg) {
                noteHtml = `<br><span style="font-size:10px; color:#888; font-weight:normal;">Catatan: ${i.history[0].msg}</span>`;
            }

            html += `<tr style="${isAdj?'background:#fff8e1':''}"><td>${i.type==='Adjust' ? i.data.deadline : formatDate(i.archivedDate)}</td><td onclick="showJobDetail('${i.id}')" style="cursor:pointer; font-weight:500;">${displayTitle}${isAdj ? '<br><span style="font-size:10px; color:#f39c12; font-weight:800;">ADJUSTMENT</span>' : ''}${noteHtml}</td><td style="font-size:11px; color:#666;">${qtyDisplay}</td><td style="font-size:11px; color:#666;">${i.category}</td><td style="text-align:right;">${formatRp(i.price)}</td><td style="text-align:right; width:95px;"><button class="tool-btn" title="Pindah Periode" onclick="openMovePeriod('${i.id}')">🗓️</button> <button class="tool-btn btn-void" onclick="voidJob('${i.id}')">↩</button> <button class="tool-btn btn-del" onclick="deleteJob('${i.id}')">🗑️</button></td></tr>`; 
        });
        html += `</tbody></table>${buttonsHTML}</div>`; container.innerHTML += html;
    });
}

function updateLifetimeIncome() { const total = jobOrders.filter(j => j.stage === 'done').reduce((sum, j) => { let price = 0; if (j.type === 'Adjust' || j.category === 'General') { price = j.manualPrice || 0; } else { const basePrice = JOB_TYPES[j.type] ? JOB_TYPES[j.type].price : 50000; price = (j.type === 'Feed' || j.type === 'FKKF') ? (basePrice * (j.slides || 1)) : basePrice; } return sum + price; }, 0); document.getElementById('grand-total').innerText = formatRp(total); }

// ==========================================
// 8. UTILITIES, TABS, PDF, DLL
// ==========================================
function switchView(v) { if (v === 'done') { const userPin = prompt("🔒 Masukkan PIN Keamanan:"); if (userPin !== 'AT240104') return alert("❌ PIN Salah!"); } ['board','salary','done'].forEach(x => { document.getElementById(`view-${x}`).style.display='none'; }); const targetEl = document.getElementById(`view-${v}`); if(targetEl) targetEl.style.display = v === 'board' ? 'flex' : 'block'; document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active')); const menuEl = document.getElementById(`menu-${v}`); if(menuEl) menuEl.classList.add('active'); if(v === 'board') renderBoard(); if(v === 'salary') switchTab('salary','content'); if(v === 'done') { switchTab('history','content'); updateLifetimeIncome(); } }
function switchTab(v, c) { const p = v==='salary' ? 'view-salary' : 'view-done'; document.querySelectorAll(`#${p} .tab-btn`).forEach(b=>b.classList.remove('active')); if(c==='content') document.querySelectorAll(`#${p} .tab-btn`)[0].classList.add('active'); else document.querySelectorAll(`#${p} .tab-btn`)[1].classList.add('active'); document.querySelectorAll(`#${p} .tab-content`).forEach(e=>e.classList.remove('active')); document.getElementById(c==='content' ? `${v==='salary'?'salary':'history'}-content` : `${v==='salary'?'salary':'history'}-general`).classList.add('active'); renderSalaryTable(v, c); }
function formatRp(n) { return new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(n); }
function formatDate(s) { return s ? new Date(s).toLocaleDateString('id-ID') : '-'; }

function linkify(t) { 
    if (!t) return '-'; 
    return t.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" title="$1">Buka Link ↗</a>'); 
}

function closeModal(id) { document.getElementById(id).style.display='none'; }

window.onclick = function(event) { 
    if (event.target.classList.contains('modal')) {
        const mid = event.target.id;
        closeModal(mid);
        if(mid === 'modal-detail') {
            document.getElementById('detail-container').classList.remove('is-editing');
            document.getElementById('btn-toggle-edit').style.display = 'block';
        }
    } 
}

function moveStage(id, s) { const j = jobOrders.find(x => x.id === id); if(j) { j.stage = s; updateCloudJO(id); renderBoard(); } }
function doArchive(id) { const j = jobOrders.find(x => x.id === id); j.stage = 'archive'; j.archivedDate = new Date().toISOString(); updateCloudJO(id); renderBoard(); }
function checkDeadline(dStr) { if(!dStr) return { text: 'No Date', bg: '', txt: '' }; const today = new Date(); today.setHours(0,0,0,0); const dl = new Date(dStr); dl.setHours(0,0,0,0); const diff = (dl - today) / (1000 * 60 * 60 * 24); if(diff < 0) return { text: 'OVERDUE', bg: 'bg-urgent', txt: 'txt-urgent' }; if(diff === 0) return { text: 'HARI INI', bg: 'bg-urgent', txt: 'txt-urgent' }; if(diff <= 3) return { text: `${diff} Hari Lagi`, bg: 'bg-warning', txt: 'txt-warning' }; return { text: formatDate(dStr), bg: 'bg-safe', txt: 'txt-safe' }; }

function getPeriodPath(jo) { 
    const d = jo.data.deadline ? new Date(jo.data.deadline) : (jo.createdAt ? new Date(jo.createdAt) : new Date()); 
    const p = getPeriod(d); 
    const displayTitle = getJobDisplayName(jo); 
    return `My Space/00 Freelance/${p.year}/${p.monthName}/${displayTitle}`; 
}

function getPeriod(dateObj) { 
    if(isNaN(dateObj.getTime())) dateObj = new Date(); 
    const day = dateObj.getDate(); 
    let tDate = new Date(dateObj.getTime()); 

    if (day >= 1 && day <= 5) { 
        tDate.setMonth(tDate.getMonth() - 1); 
    } 
    
    const monthName = tDate.toLocaleString('id-ID', { month: 'long' }); 
    const year = tDate.getFullYear(); 
    
    return { 
        key: `${monthName} ${year}`, 
        monthName: monthName, 
        periodStr: monthName, 
        year: year 
    }; 
}

function deleteJob(id, e) { if(e) e.stopPropagation(); if(confirm("Hapus Permanen?")) { jobOrders = jobOrders.filter(j => j.id !== id); db.collection("jobOrders").doc(id.toString()).delete(); if(document.getElementById('view-board').style.display !== 'none') renderBoard(); else renderSalaryTable(window.currentViewType, window.currentCategory); } }
function voidJob(id, e) { if(e) e.stopPropagation(); const jo = jobOrders.find(j => j.id === id); const idx = STAGE_FLOW.indexOf(jo.stage); if(confirm(`VOID Job ini?`)) { if(jo.type==='Adjust'){ deleteJob(id); return; } if(jo.stage === 'archive' || jo.stage === 'done') { jo.stage = 'upload'; jo.archivedDate = null; } else if (idx > 0) jo.stage = STAGE_FLOW[idx - 1]; else jo.statusText = 'VOIDED'; if(jo.stage !== 'review') jo.statusText = ''; updateCloudJO(id); renderBoard(); } }

let currentNoteId = null;
function toggleVoidVisibility() { document.getElementById('detail-container').classList.toggle('show-voided-logs'); }
function toggleVoidNote(jobId, logIndex) { const jo = jobOrders.find(j => j.id === jobId); if(jo) { jo.history[logIndex].voided = !jo.history[logIndex].voided; updateCloudJO(jo.id); renderHistoryLog(jo); } }
function openQuickNote() { currentNoteId = document.getElementById('edit-id').value; document.getElementById('quick-note-text').value = ''; document.getElementById('modal-quick-note').style.display = 'flex'; }
function saveQuickNote() { const txt = document.getElementById('quick-note-text').value; const type = document.getElementById('quick-note-type').value; const jo = jobOrders.find(j=>j.id === currentNoteId); if(jo && txt) { if(!jo.history) jo.history = []; jo.history.push({ date: new Date().toLocaleString('id-ID'), msg: txt, type: type, voided: false }); updateCloudJO(jo.id); renderHistoryLog(jo); closeModal('modal-quick-note'); } }
function renderHistoryLog(jo) { const c = document.getElementById('history-log-container'); c.innerHTML = ''; if(jo.history && jo.history.length > 0) { jo.history.forEach((h, i) => { c.innerHTML += `<div class="log-item ${h.type} ${h.voided?'voided':''}"><button class="btn-void-note" onclick="toggleVoidNote('${jo.id}', ${i})">${h.voided?'Unvoid':'✖'}</button><div class="log-meta"><span>${h.date}</span> <span>${h.type.toUpperCase()}</span></div><div class="log-content">${h.msg}</div></div>`; }); } else { c.innerHTML = '<div style="color:#aaa; text-align:center;">Belum ada catatan aktivitas.</div>'; } }

function preparePDFContent(periodKey, categoryType, callback) { 
    const items = jobOrders.filter(j => (j.stage === 'archive' || j.stage === 'done') && getPeriod(new Date(j.archivedDate)).key === periodKey && (categoryType === 'Content' ? j.category === 'Content' : j.category === 'General')); 
    if(items.length === 0) return alert("Data kosong."); 
    const linkData = items.find(j => j.periodLink); 
    if(!linkData) return alert("Link Hasil belum diisi!"); 
    
    document.getElementById('pdf-period').innerText = periodKey + ` (${categoryType})`; 

    const isGeneral = categoryType === 'General';
    document.querySelector('#pdf-template table thead').innerHTML = `
        <tr style="background: #f8f8f8;">
            <th style="padding: 12px; text-align:left; border-bottom: 1px solid #ddd;">Tanggal</th>
            <th style="padding: 12px; text-align:left; border-bottom: 1px solid #ddd;">Job</th>
            <th style="padding: 12px; text-align:left; border-bottom: 1px solid #ddd;">Type</th>
            ${isGeneral ? '' : '<th style="padding: 12px; text-align:center; border-bottom: 1px solid #ddd;">Qty</th>'}
            <th style="padding: 12px; text-align:right; border-bottom: 1px solid #ddd;">Nominal</th>
        </tr>
    `;

    const tbody = document.getElementById('pdf-table-body'); 
    tbody.innerHTML = ''; 
    let sub = 0, adj = 0; 
    
    items.forEach(i => { 
        const date = i.type === 'Adjust' ? i.data.deadline : new Date(i.archivedDate).toLocaleDateString('id-ID'); 
        let nominal = 0; 
        if(i.type === 'Adjust' || i.category === 'General') { 
            nominal = i.manualPrice || 0; 
        } else { 
            const basePrice = JOB_TYPES[i.type] ? JOB_TYPES[i.type].price : 50000; 
            nominal = (i.type === 'Feed' || i.type === 'FKKF') ? (basePrice * (i.slides || 1)) : basePrice; 
        } 
        if(i.type === 'Adjust') adj += nominal; else sub += nominal; 
        
        let qtyDisplay = '-'; 
        if (i.type === 'Feed' || i.type === 'FKKF') qtyDisplay = `<strong>${i.slides || 1}</strong> Slide`; 
        else if (i.type === 'Reels' || i.type === 'FKKR') qtyDisplay = '1 Video'; 
        else if (i.type === 'Story' || i.type === 'FKKS') qtyDisplay = '1 Konten'; 
        else if (i.type !== 'Adjust') qtyDisplay = '1 Aset'; 

        let shortType = '-';
        if (i.type === 'FKKF' || i.type === 'Feed') shortType = 'Feed';
        else if (i.type === 'FKKR' || i.type === 'Reels') shortType = 'Reels';
        else if (i.type === 'FKKS' || i.type === 'Story') shortType = 'Story';
        else shortType = i.type;

        let displayTitle = getJobDisplayName(i); 
        
        if (i.type === 'Adjust' && i.history && i.history[0] && i.history[0].msg) {
            displayTitle += `<br><span style="font-size:10px; color:#666; font-weight:normal;">Catatan: ${i.history[0].msg}</span>`;
        }

        let qtyTd = isGeneral ? '' : `<td style="padding:10px; border-bottom:1px solid #eee; font-size:11px; text-align:center;">${qtyDisplay}</td>`;

        tbody.innerHTML += `<tr>
            <td style="padding:10px; border-bottom:1px solid #eee; font-size:11px;">${date}</td>
            <td style="padding:10px; border-bottom:1px solid #eee; font-size:11px;"><span style="font-weight:600;">${displayTitle}</span></td>
            <td style="padding:10px; border-bottom:1px solid #eee; font-size:11px;">${shortType}</td>
            ${qtyTd}
            <td style="padding:10px; border-bottom:1px solid #eee; font-size:11px; text-align:right;">${formatRp(nominal)}</td>
        </tr>`; 
    }); 
    
    document.getElementById('pdf-subtotal').innerText = formatRp(sub); 
    document.getElementById('pdf-adjust').innerText = formatRp(adj); 
    const totalUang = formatRp(sub+adj); 
    document.getElementById('pdf-total').innerText = totalUang; 
    document.getElementById('pdf-cloud-text').innerHTML = `<a href="${linkData.periodLink}" target="_blank" style="color:#456D91; text-decoration:underline; font-weight:bold;">${linkData.periodLink}</a>`; 
    document.getElementById('pdf-template-container').style.display='block'; 
    callback(document.getElementById('pdf-template'), `Invoice_${categoryType}_${periodKey}.pdf`, totalUang, linkData.periodLink); 
}

function shareProfessionalPDF(periodKey, categoryType) {
    const items = jobOrders.filter(j => (j.stage === 'archive' || j.stage === 'done') && getPeriod(new Date(j.archivedDate)).key === periodKey && (categoryType === 'Content' ? j.category === 'Content' : j.category === 'General'));
    if (items.length === 0) return alert("Belum ada data untuk periode ini.");
    
    const sampleDate = new Date(items[0].archivedDate);
    const p = getPeriod(sampleDate);
    const periodeDisplay = `${p.periodStr} ${p.year}`;
    
    const phone = "6281224714286";
    const text = `_Dear Kakak Anisa_

Berikut terlampir *Invoice & Laporan Pekerjaan* untuk:
Periode: *${periodeDisplay}*

Rincian total Invoice dan link master file sudah tersedia lengkap di dalam dokumen PDF ini.
Mohon dicek ya Kak. Terima kasih! 🙏

_*System Note*:_
_Pesan ini dikirim otomatis oleh *Taufik System*._
_Dengan menyimpan nomor ini, Kakak dapat terhubung langsung untuk diskusi project atau revisi kedepannya._`;

    const encodedText = encodeURIComponent(text);
    window.open(`https://wa.me/${phone}?text=${encodedText}`, '_blank');
}

function exportProfessionalPDF(periodKey, categoryType) { preparePDFContent(periodKey, categoryType, (element, fileName) => { const opt = { margin: 15, filename: fileName, image: {type:'jpeg', quality:0.98}, html2canvas: {scale: 2, useCORS: true}, jsPDF: {unit:'mm', format:'a4', orientation: 'portrait'} }; html2pdf().set(opt).from(element).save().then(() => { document.getElementById('pdf-template-container').style.display='none'; }); }); }

function openPeriodLink(key, cat) { document.getElementById('pl-period-key').value = key; document.getElementById('pl-category-key').value = cat; const items = jobOrders.filter(j => (j.stage==='archive' || j.stage==='done')); const exist = items.find(j => getPeriod(new Date(j.archivedDate)).key === key && j.category === cat && j.periodLink); document.getElementById('pl-link').value = exist ? exist.periodLink : ''; document.getElementById('modal-period-link').style.display = 'flex'; }

function savePeriodLink() { 
    const key = document.getElementById('pl-period-key').value; 
    const cat = document.getElementById('pl-category-key').value; 
    const link = document.getElementById('pl-link').value; 
    if(!link) return alert("Link Cloud Wajib Diisi!"); 
    
    const updatedJobs = [];
    jobOrders.forEach(jo => { 
        if(jo.stage !== 'archive' && jo.stage !== 'done') return; 
        const pDate = new Date(jo.archivedDate); 
        if(getPeriod(pDate).key === key) { 
            if(cat === 'Content' && jo.category === 'Content') { jo.periodLink = link; updatedJobs.push(jo); }
            else if(cat === 'General' && jo.category === 'General') { jo.periodLink = link; updatedJobs.push(jo); }
        } 
    }); 
    saveBatchJOs(updatedJobs);
    closeModal('modal-period-link'); 
    renderSalaryTable('salary', cat === 'Content' ? 'content' : 'general'); 
}

function openFinalize(k, c) { const items = jobOrders.filter(j => j.stage==='archive' && getPeriod(new Date(j.archivedDate)).key === k && j.category === c); if(items.length === 0) return alert("Data tidak ditemukan."); const hasLink = items.some(i => i.periodLink); if(!hasLink) return alert("Link Hasil belum diisi!"); document.getElementById('fin-period-key').value = k; document.getElementById('fin-category-key').value = c; const link = items.find(i => i.periodLink).periodLink; document.getElementById('fin-display-link').innerText = link; document.getElementById('fin-display-link').href = link; document.getElementById('check-cloud').checked = false; document.getElementById('check-master').checked = false; document.getElementById('modal-finalize').style.display = 'flex'; }

function executeFinalize() { 
    const k = document.getElementById('fin-period-key').value; 
    const c = document.getElementById('fin-category-key').value; 
    if(!document.getElementById('check-cloud').checked || !document.getElementById('check-master').checked) return alert("Wajib checklist!"); 
    
    const updatedJobs = [];
    jobOrders.forEach(jo => { 
        if(jo.stage !== 'archive') return; 
        const d = new Date(jo.archivedDate); 
        if(getPeriod(d).key === k && (jo.category===c || (c==='Content' && jo.category==='Content'))) { 
            jo.stage = 'done'; 
            updatedJobs.push(jo);
        } 
    }); 
    saveBatchJOs(updatedJobs);
    closeModal('modal-finalize'); 
    renderSalaryTable('salary', c.toLowerCase()); 
    updateLifetimeIncome(); 
}

function openAdjustModal() { document.getElementById('adj-title').value = ''; document.getElementById('adj-nominal').value = ''; document.getElementById('adj-date-range').value = ''; document.getElementById('adj-note').value = ''; document.getElementById('modal-adjust').style.display = 'flex'; }

function saveAdjustment() { 
    const title = document.getElementById('adj-title').value; 
    const nominal = parseInt(document.getElementById('adj-nominal').value); 
    const dateRange = document.getElementById('adj-date-range').value; 
    const week = document.getElementById('adj-week').value; 
    const cat = document.getElementById('adj-category').value; 

    if(!title || !nominal) return alert("Data tidak lengkap!"); 

    let targetDihidang = cachedClients.find(c => c.name.toLowerCase().includes('dihidang') && c.phone && String(c.phone).trim().length >= 4);
    const assignedClient = targetDihidang ? targetDihidang.name : 'Internal';

    const adjJob = { 
        id: Date.now() + 'ADJ', 
        category: cat, 
        type: 'Adjust', 
        title: `${title} (Pekan ${week})`, 
        clientName: assignedClient, 
        manualPrice: nominal, 
        stage: 'archive', 
        archivedDate: new Date().toISOString(), 
        data: { deadline: dateRange }, 
        history: [{ date: new Date().toLocaleString(), msg: document.getElementById('adj-note').value, type: 'internal', voided: false }], 
        statusText: 'Adjustment' 
    }; 
    jobOrders.push(adjJob); 
    db.collection("jobOrders").doc(adjJob.id.toString()).set(adjJob).catch(console.error);
    closeModal('modal-adjust'); 
    renderSalaryTable('salary', cat === 'Content' ? 'content' : 'general'); 
}

function searchJobs() {
    let input = document.getElementById('searchInput').value.toLowerCase();
    let cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        let text = card.innerText.toLowerCase();
        if (text.includes(input)) {
            card.style.display = ""; 
        } else {
            card.style.display = "none"; 
        }
    });
}

function openMovePeriod(id) {
    const jo = jobOrders.find(j => j.id === id);
    if(!jo) return;
    document.getElementById('move-period-id').value = id;
    
    const currDate = jo.archivedDate ? new Date(jo.archivedDate) : new Date();
    document.getElementById('move-period-date').value = currDate.toISOString().split('T')[0];
    
    document.getElementById('modal-move-period').style.display = 'flex';
}

function saveMovePeriod() {
    const id = document.getElementById('move-period-id').value;
    const newDate = document.getElementById('move-period-date').value;
    if(!newDate) return alert('Silakan pilih tanggal terlebih dahulu!');

    const jo = jobOrders.find(j => j.id === id);
    if(jo) {
        jo.archivedDate = new Date(newDate + 'T12:00:00').toISOString();
        
        if(jo.type === 'Adjust') {
            jo.data.deadline = new Date(newDate).toLocaleDateString('id-ID');
        }
        
        updateCloudJO(jo.id);
        closeModal('modal-move-period');
        renderSalaryTable(window.currentViewType, window.currentCategory);
    }
}
