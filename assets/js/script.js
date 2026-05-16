// ==========================================
// 1. DATABASE REGISTRY (SKEMA SQL MASA DEPAN)
// ==========================================
const OS_TABLES = [
    'jo_db_v47',                // Milik halaman: project-tracker.html
    'taufik_finance_db',        // Milik halaman: finance.html
    'taufik_notes_db_v1',       // Milik halaman: notes.html
    'taufik_crm_v2',            // Milik halaman: client-crm.html
    'taufik_assets_library_v1', // Milik halaman: lib.html
    'taufik_core_db'            // Milik halaman: index.html (pengaturan/stats)
];

// ==========================================
// 2. DATABASE SERVICE (SQL / API READY)
// ==========================================
const DB = {
    load: async function(tableName) {
        let rawData = localStorage.getItem(tableName);
        if (!rawData) return [];
        
        try {
            let parsedData = JSON.parse(rawData);
            
            // TAMENG ANTI-DOUBLE STRINGIFY: 
            // Kalau data ternyata masih wujud string setelah di-parse, parse sekali lagi!
            if (typeof parsedData === 'string') {
                parsedData = JSON.parse(parsedData);
            }
            
            return parsedData;
        } catch (e) {
            console.error("Error loading table:", tableName, e);
            return [];
        }
    },

    save: async function(tableName, data) {
        // TAMENG ANTI-DOUBLE STRINGIFY:
        // Cek dulu, kalau wujudnya sudah string, JANGAN di-stringify lagi.
        let safeData = typeof data === 'string' ? data : JSON.stringify(data);
        
        localStorage.setItem(tableName, safeData);
        return true;
    }
};

// ==========================================
// 3. CLOCK & GREETING SYSTEM
// ==========================================
function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const clockElement = document.getElementById('clock');
    if (clockElement) clockElement.textContent = timeString;

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateString = now.toLocaleDateString('id-ID', options);
    const dateElement = document.getElementById('date');
    if (dateElement) {
        dateElement.textContent = dateString;
    }

    const hour = now.getHours();
    let greetingText = '';
    if (hour >= 5 && hour < 12) greetingText = 'Good Morning, Taufik';
    else if (hour >= 12 && hour < 15) greetingText = 'Good Afternoon, Taufik';
    else if (hour >= 15 && hour < 19) greetingText = 'Good Evening, Taufik';
    else greetingText = 'Good Night, Taufik';

    const greetingElement = document.getElementById('greeting');
    if (greetingElement) greetingElement.textContent = greetingText;
}

document.addEventListener('DOMContentLoaded', () => {
    updateTime();
    setInterval(updateTime, 1000);
});

// ==========================================
// UI CUSTOM TOAST NOTIFICATION
// ==========================================
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = type === 'success' ? '<i class="fa-solid fa-circle-check"></i>' : 
                 type === 'error' ? '<i class="fa-solid fa-triangle-exclamation"></i>' : 
                 '<i class="fa-solid fa-circle-info"></i>';
    
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.4s forwards';
        setTimeout(() => toast.remove(), 400);
    }, 3500);
}

// ==========================================
// 4. MASTER OS BACKUP SYSTEM
// ==========================================
async function downloadMasterBackup() {
    showToast('Mengemas data dari 6 tabel...', 'info');
    let dbDump = {};

    for (let table of OS_TABLES) {
        dbDump[table] = await DB.load(table);
    }

    const masterData = {
        app_name: "TAUFIK_FREELANCE_OS",
        backup_date: new Date().toLocaleString('id-ID'),
        data: dbDump 
    };

    const dataStr = JSON.stringify(masterData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `TAUFIK_OS_MASTER_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setTimeout(() => { showToast('Backup berhasil diunduh!', 'success'); }, 500);
}

// ==========================================
// 5. MASTER OS RESTORE SYSTEM
// ==========================================
let pendingRestoreData = null;

function closeRestoreModal() {
    document.getElementById('restore-modal').classList.remove('active');
    pendingRestoreData = null;
    document.getElementById('restore-upload').value = ""; 
}

async function restoreMasterBackup(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const content = JSON.parse(e.target.result);

            if (content.app_name === "TAUFIK_FREELANCE_OS") {
                pendingRestoreData = content.data;
                document.getElementById('restore-date-badge').textContent = content.backup_date;
                document.getElementById('restore-modal').classList.add('active');
            } else {
                showToast("Gagal. File JSON ini bukan format backup Taufik OS.", "error");
            }
        } catch (err) {
            showToast("Gagal membaca file. File mungkin corrupt.", "error");
        }
    };
    reader.readAsText(file);
}

async function proceedRestore() {
    if (!pendingRestoreData) return;
    closeRestoreModal();
    
    // Simpan semua data menggunakan DB.save yang sudah diperkuat
    for (let tableName in pendingRestoreData) {
        await DB.save(tableName, pendingRestoreData[tableName]);
    }
    
    // Tampilkan animasi sukses dan reload
    const rebootModal = document.getElementById('reboot-modal');
    rebootModal.classList.add('active');
    
    setTimeout(() => {
        document.getElementById('reboot-progress').style.width = '100%';
    }, 100);
    
    setTimeout(() => {
        location.reload(); 
    }, 2500);
}