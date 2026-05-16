// ==========================================
// 1. DATABASE REGISTRY (SKEMA SQL MASA DEPAN)
// ==========================================
const OS_TABLES = [
    'jo_db_v47',                // Milik halaman: project-tracker.html
    'taufik_finance_db',        // Milik halaman: finance.html
    'taufik_notes_db_v1',       // Milik halaman: notes.html
    'taufik_crm_v2',            // Milik halaman: client-crm.html
    'taufik_assets_library_v1', // Milik halaman: lib.html
    'taufik_core_db'            // Milik halaman: command-center.html
];

// ==========================================
// 2. DATABASE SERVICE (SQL / API READY)
// ==========================================
const DB = {
    load: async function(tableName) {
        return JSON.parse(localStorage.getItem(tableName)) || [];
    },

    save: async function(tableName, data) {
        localStorage.setItem(tableName, JSON.stringify(data));
        return true;
    }
};

// ==========================================
// 3. CLOCK, DATE & GREETING SYSTEM
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
    
    if (hour >= 5 && hour < 12) greetingText = 'Good Morning,';
    else if (hour >= 12 && hour < 15) greetingText = 'Good Afternoon Taufik';
    else if (hour >= 15 && hour < 19) greetingText = 'Good Evening Taufik';
    else greetingText = 'Good Night Taufik';

    const greetingElement = document.getElementById('greeting');
    if (greetingElement) {
        greetingElement.textContent = greetingText;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateTime();
    setInterval(updateTime, 1000);
});

// ==========================================
// 4. MASTER OS BACKUP SYSTEM (UPDATED)
// ==========================================
async function downloadMasterBackup() {
    try {
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

        // Munculkan notifikasi sukses menggunakan Custom Modal
        await showModal(
            'success', 
            'Backup Berhasil', 
            'Seluruh database sistem (6 Tabel) berhasil di-backup dan diunduh. Simpan file tersebut di tempat yang aman.', 
            false
        );

    } catch (error) {
        // Jika terjadi error saat proses backup
        await showModal(
            'error', 
            'Backup Gagal', 
            'Terjadi kesalahan saat memproses data backup. Silakan coba lagi.', 
            false
        );
        console.error("Backup Error: ", error);
    }
}

// ==========================================
// 5. CUSTOM MODAL ENGINE
// ==========================================
function showModal(type, title, message, showCancel = true) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('os-modal');
        const titleEl = document.getElementById('modal-title');
        const messageEl = document.getElementById('modal-message');
        const iconEl = document.getElementById('modal-icon');
        const btnCancel = document.getElementById('modal-cancel');
        const btnConfirm = document.getElementById('modal-confirm');

        // Setup Teks & HTML
        titleEl.textContent = title;
        messageEl.innerHTML = message.replace(/\n/g, '<br>');

        // Setup Icon berdasarkan tipe
        iconEl.className = `modal-icon ${type}`;
        if (type === 'warning') iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
        if (type === 'success') iconEl.innerHTML = '<i class="fa-solid fa-check"></i>';
        if (type === 'error') iconEl.innerHTML = '<i class="fa-solid fa-xmark"></i>';

        // Setup Tombol
        btnCancel.style.display = showCancel ? 'block' : 'none';
        btnConfirm.textContent = showCancel ? 'Lanjutkan' : 'Oke';

        // Tampilkan Modal
        overlay.classList.add('active');

        // Fungsi Cleanup & Resolve
        const cleanup = () => {
            overlay.classList.remove('active');
            btnConfirm.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel);
        };

        const onConfirm = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        btnConfirm.addEventListener('click', onConfirm);
        btnCancel.addEventListener('click', onCancel);
    });
}

// ==========================================
// 6. MASTER OS RESTORE SYSTEM (UPDATED)
// ==========================================
async function restoreMasterBackup(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const content = JSON.parse(e.target.result);

            if (content.app_name === "TAUFIK_FREELANCE_OS") {
                // Menggunakan Custom Modal pengganti confirm()
                const isConfirmed = await showModal(
                    'warning',
                    'Peringatan Sistem!',
                    `Kamu akan menimpa seluruh sistem dengan data dari tanggal:\n<strong>${content.backup_date}</strong>\n\nApakah kamu yakin ingin melanjutkan?`,
                    true
                );

                if (isConfirmed) {
                    for (let tableName in content.data) {
                        await DB.save(tableName, content.data[tableName]);
                    }
                    
                    // Menggunakan Custom Modal pengganti alert()
                    await showModal(
                        'success', 
                        'Restore Berhasil', 
                        'Master Data berhasil dipulihkan! Seluruh sistem telah sinkron.', 
                        false
                    );
                    location.reload(); 
                }
            } else {
                await showModal('error', 'Akses Ditolak', 'File JSON ini bukan format backup Taufik OS.', false);
            }
        } catch (err) {
            await showModal('error', 'File Corrupt', 'Gagal membaca file. File mungkin rusak atau tidak valid.', false);
        }
    };
    reader.readAsText(file);
    inputElement.value = ""; 
}
