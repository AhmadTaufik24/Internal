// ==========================================
// 1. SYSTEM CONFIG & FIREBASE INIT
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
const db = firebase.firestore(); // Panggil Firestore API

let OS_DATA = { projects: [], finance: { transactions: [], accounts: [] }, crm: [], notes: [], assets: [], events: [] };

let currentHealthMode = localStorage.getItem('cc_health_mode') || 'real';
let targetFinansial = parseInt(localStorage.getItem('cc_target_finansial')) || 100000000; 
let currentCalDate = new Date(); 
let allSystemEvents = []; 
let scheduleNotifs = []; 

// ==========================================
// 2. BOOT & AUTHENTICATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // PROTEKSI: Cek login dari index.html
    if (sessionStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('app-wrapper').style.display = 'flex';
    
    updateClock();
    setInterval(updateClock, 1000);
    bootSystem(); // Sekarang ini memanggil proses Async Cloud
});

// Jadikan Async karena akan download data dari awan
async function bootSystem() {
    await pullAllData(); 
    renderCalendarWidget(); 
    renderDynamicBriefing(); 
    renderTopKPIs();
    renderActionInbox();
    renderRadarAndWorkload();
    switchHealthMode(currentHealthMode); 
    renderPinnedNotes();
}

// [UPDATED] Tarik data dari Firestore, bukan localStorage
async function pullAllData() {
    try {
        // 1. Projects
        const projSnap = await db.collection('projects').get();
        OS_DATA.projects = projSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        // 2. CRM
        const crmSnap = await db.collection('crm').get();
        OS_DATA.crm = crmSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        // 3. Notes
        const notesSnap = await db.collection('notes').get();
        OS_DATA.notes = notesSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        // 4. Assets
        const assetsSnap = await db.collection('assets').get();
        OS_DATA.assets = assetsSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        
        // 5. Events
        const eventsSnap = await db.collection('events').get();
        OS_DATA.events = eventsSnap.docs.map(doc => {
            let ev = {id: doc.id, ...doc.data()};
            if(ev.date && !ev.startDate) {
                ev.startDate = ev.date;
                ev.endDate = ev.date;
            }
            return ev;
        });

        // 6. Finance
        const finSnap = await db.collection('finance').get();
        OS_DATA.finance.transactions = finSnap.docs.map(doc => ({id: doc.id, ...doc.data()}));
        OS_DATA.finance.accounts = []; // Sesuaikan kalau kamu punya tabel accounts sendiri
        
    } catch(err) {
        console.error("Gagal menarik data dari Firestore:", err);
    }
}

// ==========================================
// 3. DYNAMIC MORNING BRIEFING 
// ==========================================
function renderDynamicBriefing() {
    const today = new Date().setHours(0,0,0,0);
    let urgentJobs = 0;
    let unpaidAmount = 0;

    OS_DATA.projects.forEach(j => {
        if (!['archive', 'done', 'upload'].includes(j.stage) && j.data && j.data.deadline) {
            const dl = new Date(j.data.deadline).setHours(0,0,0,0);
            if (dl <= today) urgentJobs++;
        }
        if (j.stage === 'upload') unpaidAmount += calculateJobPrice(j);
    });

    const titleEl = document.getElementById('greeting-title');
    const textEl = document.getElementById('briefing-text');

    const h = new Date().getHours();
    let greet = 'Selamat Malam';
    if(h >= 5 && h < 12) greet = 'Selamat Pagi'; 
    else if(h >= 12 && h < 15) greet = 'Selamat Siang'; 
    else if(h >= 15 && h < 19) greet = 'Selamat Sore';

    if(titleEl) titleEl.innerText = `${greet}, Taufik.`;

    let briefingStr = `Sistem beroperasi optimal. `;
    
    if (urgentJobs > 0) briefingStr += `Ada <strong>${urgentJobs} deadline mendesak</strong> hari ini. `;
    else briefingStr += `Tidak ada deadline mendesak hari ini. `;

    if (unpaidAmount > 0) briefingStr += `Terdapat <strong>${formatRp(unpaidAmount)}</strong> uang di fase Delivery. `;
    
    if (scheduleNotifs.length > 0) {
        briefingStr += `<br><br><span style="color:var(--warning); display:inline-block; padding: 5px 10px; background: rgba(249, 175, 107, 0.2); border-radius: 8px;">`;
        briefingStr += `<i class="fa-solid fa-bell"></i> <strong>Reminder Jadwal:</strong> Ada ${scheduleNotifs.length} jadwal terdekat (${scheduleNotifs[0]}).`;
        briefingStr += `</span>`;
    }
    
    if(textEl) textEl.innerHTML = briefingStr;
}

// ==========================================
// 4. TOP KPIs 
// ==========================================
function renderTopKPIs() {
    let totalReal = 0, totalKelola = 0;

    OS_DATA.finance.transactions.forEach(tx => {
        if (tx.assetType === 'real') {
            if (tx.type === 'income') totalReal += tx.amount; 
            if (tx.type === 'expense') totalReal -= tx.amount;
        } else if (tx.assetType === 'titipan') {
            if (tx.type === 'titipan_in') totalKelola += tx.amount; 
            if (tx.type === 'titipan_out') totalKelola -= tx.amount;
        }
    });

    OS_DATA.projects.forEach(j => {
        if (j.stage === 'upload' || j.stage === 'review') {
            totalKelola += calculateJobPrice(j);
        }
    });

    const totalAset = totalReal + totalKelola; 
    const realPercent = totalAset !== 0 ? (totalReal / Math.abs(totalAset)) * 100 : 0;
    
    const elTotal = document.getElementById('kpi-total-asset');
    if(elTotal) elTotal.innerText = formatRp(totalAset);
    
    const pEl = document.getElementById('kpi-persen-real');
    if(pEl) {
        pEl.innerText = `${formatRp(totalReal)} (${realPercent.toFixed(1)}% Real)`;
        pEl.className = realPercent < 0 ? 'text-danger' : 'text-success';
    }

    const elProject = document.getElementById('kpi-total-project');
    const elKlien = document.getElementById('kpi-total-klien');
    if(elProject) elProject.innerText = OS_DATA.projects.length;
    if(elKlien) elKlien.innerText = OS_DATA.crm.length;
}

// ==========================================
// 5. UNIFIED ACTION INBOX
// ==========================================
function renderActionInbox() {
    const inbox = document.getElementById('inbox-list'); 
    if(!inbox) return;
    inbox.innerHTML = '';
    
    let actions = []; 
    const today = new Date().setHours(0,0,0,0);

    OS_DATA.projects.forEach(j => {
        if (j.stage === 'archive' || j.stage === 'done') return;

        const clientName = j.clientName ? j.clientName.replace(/\s\(\d{4}\)$/, '') : 'Internal';

        if (j.stage === 'upload') {
            actions.push({
                icon: 'fa-file-invoice-dollar', color: 'var(--success)', 
                title: `Tagih: ${j.batchID}`, desc: `Selesai dikerjakan.`,
                btnText: 'Lunas', actionCode: `markDone('${j.id}')`, priority: 3
            });
        }
        else if (j.stage === 'review') {
            const phone = getClientPhone(clientName);
            actions.push({
                icon: 'fa-comments', color: 'var(--warning)', 
                title: `Follow-up: ${j.batchID}`, desc: `Menunggu ACC Klien.`,
                btnText: 'WA', actionCode: `openWA('${phone}', 'Halo Kak, izin mengingatkan untuk review project ${j.batchID} ya.')`, priority: 2
            });
        }
        else if (j.data && j.data.deadline) {
            const dl = new Date(j.data.deadline).setHours(0,0,0,0);
            if (dl <= today) {
                actions.push({
                    icon: 'fa-triangle-exclamation', color: 'var(--danger)', 
                    title: `Kerjakan: ${j.batchID}`, desc: `Deadline ${dl < today ? 'OVERDUE' : 'HARI INI'}!`,
                    btnText: 'Buka Job', actionCode: `window.location.href='project-tracker.html?detailId=${j.id}'`, priority: 4
                });
            }
        }
    });

    const countEl = document.getElementById('inbox-count');
    if(countEl) countEl.innerText = actions.length;

    if (actions.length === 0) {
        inbox.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-sub); font-size: 12px;">Inbox bersih! 🎉</div>';
        return;
    }

    actions.sort((a,b) => b.priority - a.priority).forEach(act => {
        inbox.innerHTML += `
            <div class="inbox-item">
                <div class="inbox-content">
                    <div class="inbox-icon" style="background: ${act.color}20; color: ${act.color};"><i class="fa-solid ${act.icon}"></i></div>
                    <div>
                        <div class="inbox-text">${act.title}</div>
                        <div class="inbox-sub">${act.desc}</div>
                    </div>
                </div>
                <button class="inbox-action-btn" onclick="${act.actionCode}">${act.btnText}</button>
            </div>
        `;
    });
}

// [UPDATED] Update ke Firestore
async function markDone(id) {
    if(confirm("Tandai project ini selesai & sudah dibayar? (Akan dipindah ke History)")) {
        try {
            await db.collection('projects').doc(id).update({
                stage: 'archive',
                archivedDate: new Date().toISOString()
            });
            bootSystem(); 
        } catch(err) {
            console.error("Gagal update project:", err);
            alert("Gagal koneksi ke server!");
        }
    }
}
function openWA(phone, text) {
    if(!phone || phone === 'null') alert('Nomor HP klien tidak ditemukan di database CRM.');
    else window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text||'')}`, '_blank');
}
function getClientPhone(name) {
    const c = OS_DATA.crm.find(x => x.name.toLowerCase() === name.toLowerCase());
    return c && c.phone ? String(c.phone).replace(/\D/g, '') : null;
}

// ==========================================
// 6. PRODUCTION RADAR
// ==========================================
function renderRadarAndWorkload() {
    const tbody = document.getElementById('radar-tbody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    let activeCount = 0;
    let radarItems = [];

    OS_DATA.projects.forEach(j => {
        if (['archive', 'done', 'upload'].includes(j.stage)) return;
        activeCount++;

        let p = 0, badge = '', bClass = '';
        if (j.stage === 'review') { p=1; badge = 'WAITING'; bClass = 'orange'; }
        else if (j.data && j.data.deadline) {
            const dl = new Date(j.data.deadline).setHours(0,0,0,0);
            const today = new Date().setHours(0,0,0,0);
            const diff = (dl - today) / 86400000;
            
            if (diff < 0) { p=3; badge = 'OVERDUE'; bClass = 'red'; }
            else if (diff === 0) { p=2; badge = 'HARI INI'; bClass = 'red'; }
            else if (diff <= 2) { p=1; badge = `H-${diff}`; bClass = 'orange'; }
        }

        if(badge) radarItems.push({...j, p, badge, bClass});
    });

    const capacity = 12; 
    const perc = Math.min(100, (activeCount / capacity) * 100);
    const bar = document.getElementById('workload-bar');
    const wStatus = document.getElementById('workload-status');
    
    if(bar && wStatus) {
        bar.style.width = perc + '%';
        if(perc < 50) { bar.style.background = 'var(--success)'; wStatus.innerText = `Aman (${activeCount}/${capacity})`; wStatus.style.color = 'var(--success)';}
        else if(perc < 80) { bar.style.background = 'var(--warning)'; wStatus.innerText = `Padat (${activeCount}/${capacity})`; wStatus.style.color = '#d97706';}
        else { bar.style.background = 'var(--danger)'; wStatus.innerText = `OVERLOAD (${activeCount}/${capacity})`; wStatus.style.color = 'var(--danger)';}
    }

    radarItems.sort((a,b) => b.p - a.p).forEach(j => {
        const cName = j.clientName ? j.clientName.replace(/\s\(\d{4}\)$/, '') : '-';
        tbody.innerHTML += `
            <tr style="cursor:pointer;" onclick="window.location.href='project-tracker.html?detailId=${j.id}'">
                <td><span class="status-pill badge ${j.bClass}">${j.badge}</span> <br><span style="font-size:10px; color:var(--text-sub);">${formatDate(j.data.deadline)}</span></td>
                <td><strong style="color:var(--primary); font-size:12px;">${j.batchID}</strong></td>
                <td><span style="font-size:11px">${cName}</span></td>
                <td><span style="font-size:10px; font-weight:700; text-transform:uppercase;">${j.stage}</span></td>
            </tr>
        `;
    });
    if(radarItems.length === 0) tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-sub); font-size:12px;">Aman terkendali.</td></tr>';
}

// ==========================================
// 7. FINANCIAL PIPELINE 
// ==========================================
function formatNumberWithDot(num) { return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, "."); }
function formatInputTarget(el) { let val = el.value.replace(/[^0-9]/g, ''); el.value = val !== '' ? formatNumberWithDot(val) : ''; }

function switchHealthMode(mode) {
    currentHealthMode = mode;
    localStorage.setItem('cc_health_mode', mode);
    
    document.getElementById('toggle-real')?.classList.toggle('active', mode === 'real');
    document.getElementById('toggle-target')?.classList.toggle('active', mode === 'target');
    
    const targetBox = document.getElementById('target-setup-box');
    if (targetBox) {
        targetBox.style.display = (mode === 'target') ? 'block' : 'none';
        if (mode === 'target') document.getElementById('input-target-amount').value = formatNumberWithDot(targetFinansial);
    }
    renderFinancialPipeline(); 
}

function saveTarget() {
    const inputEl = document.getElementById('input-target-amount');
    const val = parseInt(inputEl.value.replace(/\./g, '')) || 0;
    if (val > 0) {
        targetFinansial = val;
        localStorage.setItem('cc_target_finansial', targetFinansial);
        renderFinancialPipeline(); 
    } else inputEl.value = formatNumberWithDot(targetFinansial);
}

function renderFinancialPipeline() {
    let totalAllIncome = 0, totalAllExpense = 0, thisMonthExpense = 0;
    const now = new Date(), currentMonth = now.getMonth(), currentYear = now.getFullYear();

    OS_DATA.finance.transactions.forEach(tx => {
        if (tx.assetType === 'real') {
            if(tx.type === 'income') totalAllIncome += tx.amount;
            if(tx.type === 'expense') {
                totalAllExpense += tx.amount;
                const d = new Date(tx.date);
                if(d.getMonth() === currentMonth && d.getFullYear() === currentYear) thisMonthExpense += tx.amount;
            }
        }
    });

    const sisaDana = totalAllIncome - totalAllExpense;
    let activeExpense = thisMonthExpense > 0 ? thisMonthExpense : 500000; 
    let monthsLeft = Math.max(0, sisaDana / activeExpense);

    let financialHealth = 0;
    if (currentHealthMode === 'real') {
        if (totalAllIncome > 0) financialHealth = Math.min(100, (sisaDana / totalAllIncome) * 100);
    } else {
        if (targetFinansial > 0) financialHealth = (sisaDana / targetFinansial) * 100;
    }
    financialHealth = Math.max(0, financialHealth);

    const elRunway = document.getElementById('cash-runway');
    if(elRunway) elRunway.innerText = Math.floor(monthsLeft) + " Bulan";
    const elSisa = document.getElementById('runway-sisa');
    if(elSisa) elSisa.innerText = formatRp(sisaDana);
    const elExp = document.getElementById('runway-expense');
    if(elExp) elExp.innerText = formatRp(thisMonthExpense); 

    const statusBadge = document.getElementById('runway-status');
    if (statusBadge) {
        statusBadge.className = 'health-badge ' + (financialHealth >= 75 ? 'health-blue' : (financialHealth >= 35 ? 'health-green' : 'health-red'));
        statusBadge.innerText = `${financialHealth >= 75 ? 'Sangat Baik' : (financialHealth >= 35 ? 'Baik' : 'Buruk')} : ${financialHealth.toFixed(1)}%`;
    }

    let uangNyangkut = 0, uangPotensial = 0;
    OS_DATA.projects.forEach(j => {
        const val = calculateJobPrice(j);
        if (j.stage === 'upload') uangNyangkut += val;
        else if (['scheduling','preparing','progress','internal','review'].includes(j.stage)) uangPotensial += val;
    });

    if(document.getElementById('pipe-nyangkut')) document.getElementById('pipe-nyangkut').innerText = formatRp(uangNyangkut);
    if(document.getElementById('pipe-potensial')) document.getElementById('pipe-potensial').innerText = formatRp(uangPotensial);
}

// ==========================================
// 8. SMART SCHEDULER WIDGET (VISUAL GRID)
// ==========================================
function renderCalendarWidget() {
    const today = new Date();
    today.setHours(0,0,0,0);

    allSystemEvents = [];
    scheduleNotifs = [];

    OS_DATA.projects.forEach(j => {
        if (['archive', 'done'].includes(j.stage)) return;
        if (j.data && j.data.deadline) {
            allSystemEvents.push({
                id: j.id, title: `Job: ${j.title || j.batchID}`, desc: `Klien: ${j.clientName || 'Internal'}`,
                startDate: j.data.deadline, endDate: j.data.deadline, type: 'job', reminder: 2
            });
        }
    });

    if(OS_DATA.events) {
        OS_DATA.events.forEach(e => {
            allSystemEvents.push({
                id: e.id, title: e.title, desc: e.desc || '',
                startDate: e.startDate, endDate: e.endDate, type: 'manual', reminder: e.reminder || 1
            });
        });
    }

    allSystemEvents.forEach(ev => {
        const evStart = new Date(ev.startDate);
        evStart.setHours(0,0,0,0);
        
        const evEnd = new Date(ev.endDate);
        evEnd.setHours(23,59,59,999);
        
        const reminderDate = new Date(evStart);
        reminderDate.setDate(reminderDate.getDate() - ev.reminder);
        
        if (today >= reminderDate && today <= evEnd) {
            const diffDays = Math.ceil((evStart - today) / (1000 * 60 * 60 * 24));
            let hStr = "Berlangsung";
            if (diffDays > 0) hStr = `H-${diffDays}`;
            else if (diffDays === 0) hStr = "HARI INI";
            
            scheduleNotifs.push(`[${hStr}] ${ev.title}`);
        }
    });

    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    
    document.getElementById('cal-month-year').innerText = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const grid = document.getElementById('cal-days-grid');
    if(!grid) return;
    grid.innerHTML = '';

    for(let i = 0; i < firstDay; i++) {
        grid.innerHTML += `<div class="cc-cal-day empty"></div>`;
    }

    for(let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(year, month, d);
        dateObj.setHours(0,0,0,0);
        
        let isToday = (dateObj.getTime() === today.getTime());
        
        let hasEvent = allSystemEvents.some(ev => {
            const sDate = new Date(ev.startDate).setHours(0,0,0,0);
            const eDate = new Date(ev.endDate).setHours(0,0,0,0);
            const cur = dateObj.getTime();
            return cur >= sDate && cur <= eDate;
        });

        let classes = "cc-cal-day";
        if (isToday) classes += " today";
        if (hasEvent) classes += " has-event";

        grid.innerHTML += `<div class="${classes}" onclick="selectDate(${year}, ${month}, ${d}, this)">${d}</div>`;
    }
    
    if (year === today.getFullYear() && month === today.getMonth()) {
        selectDate(today.getFullYear(), today.getMonth(), today.getDate());
    } else {
        document.getElementById('cal-selected-events').style.display = 'none';
    }
}

function changeMonth(offset) {
    currentCalDate.setMonth(currentCalDate.getMonth() + offset);
    renderCalendarWidget();
}

function selectDate(y, m, d, el = null) {
    document.querySelectorAll('.cc-cal-day').forEach(node => node.classList.remove('selected'));
    if (el) el.classList.add('selected');

    const selectedDate = new Date(y, m, d);
    selectedDate.setHours(0,0,0,0);

    const listEl = document.getElementById('cal-selected-events-list');
    const boxEl = document.getElementById('cal-selected-events');
    const labelEl = document.getElementById('cal-selected-date-label');
    
    boxEl.style.display = 'block';
    labelEl.innerText = `Agenda: ${selectedDate.toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year:'numeric'})}`;
    listEl.innerHTML = '';

    const dayEvents = allSystemEvents.filter(ev => {
        const sDate = new Date(ev.startDate).setHours(0,0,0,0);
        const eDate = new Date(ev.endDate).setHours(0,0,0,0);
        const cur = selectedDate.getTime();
        return cur >= sDate && cur <= eDate;
    });

    if (dayEvents.length === 0) {
        listEl.innerHTML = '<div class="empty-state">Tidak ada jadwal di tanggal ini.</div>';
        return;
    }

    dayEvents.forEach(ev => {
        const icon = ev.type === 'job' ? 'fa-briefcase text-primary' : 'fa-calendar-check text-success';
        
        // JIKA JOB: MENGARAH KE PROJECT TRACKER. JIKA ACARA MANUAL: BUKA MODAL DETAIL.
        const action = ev.type === 'job' 
            ? `window.location.href='project-tracker.html?detailId=${ev.id}'` 
            : `openEventDetail('${ev.id}')`;
            
        listEl.innerHTML += `
            <div class="cc-client-item" style="cursor: pointer; transition: 0.2s; background: var(--card-bg);" onclick="${action}" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
                <i class="fa-solid ${icon}"></i>
                <div style="flex: 1;">
                    <div style="font-size:12px; font-weight:700;">${ev.title}</div>
                    <div style="font-size:10px; color:var(--text-sub); margin-top: 2px;">${ev.desc || '-'}</div>
                </div>
            </div>
        `;
    });
}

// -----------------------------------------------------
// FUNGSI MODAL DETAIL, EDIT, DAN HAPUS ACARA MANUAL
// -----------------------------------------------------
function openEventDetail(id) {
    const ev = allSystemEvents.find(e => e.id === id && e.type === 'manual');
    if(!ev) return;
    
    document.getElementById('det-ev-title').innerText = ev.title;
    
    if (ev.startDate === ev.endDate) {
        document.getElementById('det-ev-date').innerText = formatDate(ev.startDate);
    } else {
        document.getElementById('det-ev-date').innerText = `${formatDate(ev.startDate)} s/d ${formatDate(ev.endDate)}`;
    }
    
    document.getElementById('det-ev-desc').innerText = ev.desc || 'Tidak ada catatan/deskripsi.';
    document.getElementById('det-ev-reminder').innerText = `H-${ev.reminder}`;
    
    document.getElementById('btn-edit-ev').onclick = () => editAcara(id);
    document.getElementById('btn-del-ev').onclick = () => deleteAcara(id);
    
    document.getElementById('modal-event-detail').style.display = 'flex';
}

function editAcara(id) {
    closeModal('modal-event-detail');
    const ev = OS_DATA.events.find(e => e.id === id);
    if(!ev) return;
    
    document.getElementById('evt-id').value = id;
    document.getElementById('evt-title').value = ev.title;
    document.getElementById('evt-start').value = ev.startDate;
    document.getElementById('evt-end').value = ev.endDate;
    document.getElementById('evt-desc').value = ev.desc || '';
    document.getElementById('evt-reminder').value = ev.reminder || 0;
    
    document.getElementById('event-modal').style.display = 'flex';
}

// [UPDATED] Menghapus acara dari Cloud
async function deleteAcara(id) {
    if(confirm('Yakin ingin menghapus acara ini secara permanen?')) {
        try {
            await db.collection('events').doc(id).delete();
            closeModal('modal-event-detail');
            bootSystem(); 
        } catch(err) {
            console.error("Gagal hapus acara:", err);
        }
    }
}

function tambahAcaraManual() {
    document.getElementById('evt-id').value = ''; // Kosongkan ID
    document.getElementById('evt-title').value = '';
    document.getElementById('evt-start').value = new Date().toISOString().split('T')[0];
    document.getElementById('evt-end').value = new Date().toISOString().split('T')[0];
    document.getElementById('evt-desc').value = '';
    document.getElementById('evt-reminder').value = '1';
    
    document.getElementById('event-modal').style.display = 'flex';
}

function closeAcaraModal() {
    document.getElementById('event-modal').style.display = 'none';
}

// [UPDATED] Menyimpan acara ke Cloud
async function simpanAcara() {
    let id = document.getElementById('evt-id').value;
    const title = document.getElementById('evt-title').value.trim();
    const startDate = document.getElementById('evt-start').value;
    const endDate = document.getElementById('evt-end').value;
    const desc = document.getElementById('evt-desc').value.trim();
    const reminder = parseInt(document.getElementById('evt-reminder').value) || 0;

    if (!title || !startDate || !endDate) {
        alert("Nama Acara dan Tanggal wajib diisi!");
        return;
    }

    if (new Date(endDate) < new Date(startDate)) {
        alert("Tanggal Selesai tidak boleh lebih awal dari Tanggal Mulai!");
        return;
    }

    if (!id) id = 'EVT-' + Date.now(); // Buat ID baru jika belum ada

    try {
        await db.collection('events').doc(id).set({
            id: id,
            title: title,
            startDate: startDate,
            endDate: endDate,
            desc: desc,
            reminder: reminder,
            createdAt: new Date().toISOString()
        }, { merge: true });

        closeAcaraModal();
        bootSystem(); 
    } catch(err) {
        console.error("Gagal simpan acara:", err);
        alert("Gagal menyimpan ke cloud!");
    }
}

// ==========================================
// 9. PINNED NOTES 
// ==========================================
function renderPinnedNotes() {
    const box = document.getElementById('pinned-note-box'); 
    if(!box) return;
    
    const pinned = OS_DATA.notes.filter(n => n.isPinned && !n.isArchived);
    box.innerHTML = '';
    
    if(pinned.length > 0) {
        pinned.forEach(p => {
            const cleanTxt = p.content.replace(/[#*`_]/g, '').replace(/\n/g, '<br>');
            box.innerHTML += `
                <div class="cc-pin-item">
                    <h4 style="margin:0 0 5px 0; color:var(--text-main); font-size:13px;">${p.title||'Catatan'}</h4>
                    <p style="margin:0; opacity:0.9;">${cleanTxt}</p>
                </div>
            `;
        });
    } else {
        box.innerHTML = '<p style="color:var(--text-sub); font-size:12px; text-align:center; margin-top:30px;">Tidak ada catatan yang di-pin di Notes OS.</p>';
    }
}

// ==========================================
// 10. OMNI-COMMAND PALETTE (UPDATED TO CLOUD)
// ==========================================
function handleOmniCommand(event) {
    const input = event.target.value;
    const dropdown = document.getElementById('omni-dropdown');
    
    if (input.startsWith('>')) { handleActionCommand(input, event.key); return; }
    if (input.length < 2) { dropdown.style.display = 'none'; return; }
    
    const q = input.toLowerCase();
    let html = '';
    
    const projMatches = OS_DATA.projects.filter(p => (p.title&&p.title.toLowerCase().includes(q)) || p.batchID.toLowerCase().includes(q)).slice(0,3);
    if(projMatches.length>0) {
        html += '<div class="omni-group-label">Project Tracker</div>';
        projMatches.forEach(p => { 
            html += `<div class="omni-item" onclick="window.location.href='project-tracker.html?detailId=${p.id}'"><div class="omni-title">${p.batchID} - ${p.title||'Untitled'}</div><div class="omni-desc">Stage: ${p.stage}</div></div>`; 
        });
    }
    
    const crmMatches = OS_DATA.crm.filter(c => c.name.toLowerCase().includes(q)).slice(0,2);
    if(crmMatches.length>0) {
        html += '<div class="omni-group-label">Client CRM</div>';
        crmMatches.forEach(c => { 
            html += `<div class="omni-item" onclick="window.location.href='client-crm.html?search=${encodeURIComponent(c.name)}'"><div class="omni-title">${c.name}</div><div class="omni-desc">${c.phone||'No HP'}</div></div>`; 
        });
    }

    if(html === '') html = '<div style="padding:15px; text-align:center; font-size:12px; color:var(--text-sub);">Data tidak ditemukan.</div>';
    
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

async function handleActionCommand(text, key) {
    const dropdown = document.getElementById('omni-dropdown');
    const parts = text.trim().split(' ');
    const cmd = parts[0].toLowerCase();
    
    let html = '<div class="omni-group-label" style="color:var(--primary);">⚡ QUICK COMMAND MODE</div>';
    
    if (cmd === '>out' || cmd === '>in') {
        const type = cmd === '>out' ? 'Pengeluaran' : 'Pemasukan';
        const amount = parseInt(parts[1]) || 0;
        const title = parts.slice(2).join(' ') || '...';
        
        html += `
            <div class="omni-item" style="background:var(--primary-bg);">
                <div class="omni-title">Catat ${type} Real</div>
                <div class="omni-desc">Rp ${formatRp(amount)} - ${title}</div>
                <div style="font-size:10px; color:var(--primary); margin-top:5px;"><strong>Tekan ENTER</strong> untuk eksekusi</div>
            </div>`;
            
        if(key === 'Enter' && amount > 0 && title !== '...') {
            const txId = 'TX-CMD-' + Date.now();
            const txData = {
                id: txId, 
                date: new Date().toISOString().split('T')[0],
                title: title, 
                type: cmd === '>out' ? 'expense' : 'income', 
                category: 'Lainnya',
                accountId: OS_DATA.finance.accounts[0]?.id || 'ACC-1', 
                assetType: 'real', 
                amount: amount, 
                notes: 'Via OmniCommand', 
                createdAt: new Date().toISOString()
            };
            
            try {
                await db.collection('finance').doc(txId).set(txData);
                finishCommand();
            } catch(err) {
                console.error("Gagal simpan transaksi:", err);
            }
        }
    } 
    else if (cmd === '>job') {
        const title = parts.slice(1).join(' ') || '...';
        html += `
            <div class="omni-item" style="background:var(--success-bg);">
                <div class="omni-title">Buat Job Baru</div>
                <div class="omni-desc">${title} (Klien: Internal)</div>
                <div style="font-size:10px; color:var(--success); margin-top:5px;"><strong>Tekan ENTER</strong> untuk eksekusi</div>
            </div>`;
            
        if(key === 'Enter' && title !== '...') {
            const jobId = Date.now().toString();
            const jobData = {
                id: jobId, 
                category: 'General', 
                type: 'Lainnya', 
                title: title, 
                clientName: 'Internal',
                batchID: 'CMD-' + Math.random().toString(36).substring(2,5).toUpperCase(), 
                stage: 'scheduling', 
                manualPrice: 0,
                data: { deadline: new Date().toISOString().split('T')[0] }, 
                history: [], 
                createdAt: new Date().toISOString()
            };
            
            try {
                await db.collection('projects').doc(jobId).set(jobData);
                finishCommand();
            } catch(err) {
                console.error("Gagal buat job:", err);
            }
        }
    }
    else {
        html += `
            <div class="omni-item"><div class="omni-desc"><strong>>out [nominal] [judul]</strong> - Catat Pengeluaran</div></div>
            <div class="omni-item"><div class="omni-desc"><strong>>in [nominal] [judul]</strong> - Catat Pemasukan</div></div>
            <div class="omni-item"><div class="omni-desc"><strong>>job [judul]</strong> - Buat Job Baru</div></div>
        `;
    }
    
    dropdown.innerHTML = html;
    dropdown.style.display = 'block';
}

function finishCommand() {
    document.getElementById('omni-input').value = '';
    document.getElementById('omni-dropdown').style.display = 'none';
    bootSystem(); 
}

// Tutup Dropdown dan Modal saat klik di luar area
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

document.addEventListener('click', (e) => {
    if(!e.target.closest('.cc-omni-container')) {
        const dd = document.getElementById('omni-dropdown');
        if(dd) dd.style.display = 'none';
    }

    if (e.target.classList.contains('cc-modal-overlay')) {
        e.target.style.display = 'none';
    }
});

// ==========================================
// 11. ZEN FOCUS MODE
// ==========================================
let zenTimer = null;
let zenTimeLeft = 25 * 60; 
let isZenRunning = false;

function enterZenMode() {
    document.getElementById('zen-overlay').classList.remove('cc-zen-hidden');
    
    const selectEl = document.getElementById('zen-task-select');
    selectEl.innerHTML = '<option value="">Pekerjaan Umum / Bebas</option>';
    
    const activeJobs = OS_DATA.projects.filter(j => !['archive', 'done', 'upload'].includes(j.stage));
    
    activeJobs.forEach(j => {
        const opt = document.createElement('option');
        opt.value = j.id;
        opt.text = `${j.batchID} - ${j.title || 'Untitled'} (${j.stage.toUpperCase()})`;
        selectEl.appendChild(opt);
    });

    const progressJob = activeJobs.find(j => j.stage === 'progress');
    if (progressJob) {
        selectEl.value = progressJob.id;
    }
}

function exitZenMode() {
    document.getElementById('zen-overlay').classList.add('cc-zen-hidden');
    resetZenTimer();
}

function toggleZenTimer() {
    const btn = document.getElementById('btn-zen-play');
    if (isZenRunning) {
        clearInterval(zenTimer);
        isZenRunning = false;
        btn.innerHTML = '<i class="fa-solid fa-play"></i> Lanjut Fokus';
    } else {
        isZenRunning = true;
        btn.innerHTML = '<i class="fa-solid fa-pause"></i> Jeda';
        zenTimer = setInterval(() => {
            if (zenTimeLeft > 0) {
                zenTimeLeft--;
                updateZenUI();
            } else {
                clearInterval(zenTimer);
                isZenRunning = false;
                alert("Sesi Fokus 25 Menit Selesai! Waktunya Istirahat 5 Menit.");
                zenTimeLeft = 5 * 60; 
                updateZenUI();
                btn.innerHTML = '<i class="fa-solid fa-play"></i> Mulai Istirahat';
            }
        }, 1000);
    }
}

function resetZenTimer() {
    clearInterval(zenTimer);
    isZenRunning = false;
    zenTimeLeft = 25 * 60;
    updateZenUI();
    document.getElementById('btn-zen-play').innerHTML = '<i class="fa-solid fa-play"></i> Mulai Fokus';
}

function updateZenUI() {
    const m = Math.floor(zenTimeLeft / 60).toString().padStart(2, '0');
    const s = (zenTimeLeft % 60).toString().padStart(2, '0');
    document.getElementById('zen-time').innerText = `${m}:${s}`;
}

// ==========================================
// UTILS
// ==========================================
function updateClock() {
    const now = new Date();
    const clk = document.getElementById('clock');
    if(clk) clk.innerText = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    
    const dt = document.getElementById('date-display');
    if(dt) dt.innerText = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRp(n) { return new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(n); }
function formatDate(dStr) { return dStr ? new Date(dStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : '-'; }
function calculateJobPrice(jo) {
    if (jo.type === 'Adjust' || jo.category === 'General' || jo.manualPrice > 0) return jo.manualPrice || 0; 
    const base = (jo.type === 'FKKR' || jo.type === 'Reels') ? 150000 : 50000;
    return (jo.type === 'Feed' || jo.type === 'FKKF') ? (base * (jo.slides || 1)) : base; 
}
