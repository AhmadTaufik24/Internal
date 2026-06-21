// ==========================================
// 0. FIREBASE AUTH, FIRESTORE & GATEWAY SYSTEM
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCkUQXBYeMyQuB9X2HleubBDKuV3YpzVRg",
    authDomain: "taufik-internal.firebaseapp.com",
    projectId: "taufik-internal",
    storageBucket: "taufik-internal.firebasestorage.app",
    messagingSenderId: "212857824811",
    appId: "1:212857824811:web:15ba9d4d7edeae4afeec6e"
};

// Inisialisasi Firebase
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const auth = firebase.auth();
const db = firebase.firestore(); // Inisialisasi Firestore

// Pantau Sesi Login (Otomatis jalan saat halaman dibuka)
auth.onAuthStateChanged((user) => {
    const loginOverlay = document.getElementById('login-overlay');
    if (user) {
        // [FIXED] Simpan sesi login agar commandcenter.js bisa mendeteksi
        sessionStorage.setItem('isLoggedIn', 'true');
        
        // Jika sudah login, hilangkan layar penutup
        loginOverlay.style.opacity = '0';
        setTimeout(() => loginOverlay.style.display = 'none', 500);
    } else {
        // [FIXED] Hapus sesi jika tidak ada user yang login
        sessionStorage.removeItem('isLoggedIn');
        
        // Jika belum login, paksa munculkan layar penutup
        loginOverlay.style.display = 'flex';
        loginOverlay.style.opacity = '1';
    }
});

// Fungsi Eksekusi Login
window.processLogin = function() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    const btn = document.getElementById('btn-login');
    
    if(!email || !pass) {
        showModal('warning', 'Input Kosong', 'Harap isi email dan password.', false);
        return;
    }

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
    btn.disabled = true;

    auth.signInWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Berhasil';
            // Layar akan otomatis hilang berkat onAuthStateChanged
            setTimeout(() => {
                btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login System';
                btn.disabled = false;
                document.getElementById('login-pass').value = ''; // bersihkan password
            }, 1000);
        })
        .catch((error) => {
            btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login System';
            btn.disabled = false;
            showModal('error', 'Akses Ditolak', 'Email atau password salah!', false);
        });
}

// Fungsi Lupa Password
window.resetPassword = function() {
    const email = document.getElementById('login-email').value;
    
    if(!email) {
        showModal('warning', 'Email Kosong', 'Ketik email lo dulu di kolom atas, baru klik Lupa Password.', false);
        return;
    }

    auth.sendPasswordResetEmail(email)
        .then(() => {
            showModal('success', 'Email Terkirim', 'Link reset password udah dikirim. Silakan cek Inbox atau folder Spam email lo!', false);
        })
        .catch((error) => {
            let msg = 'Terjadi kesalahan sistem.';
            if(error.code === 'auth/user-not-found') msg = 'Email tidak terdaftar di sistem.';
            else if(error.code === 'auth/invalid-email') msg = 'Format email tidak valid.';
            
            showModal('error', 'Gagal Reset', msg, false);
        });
}

// Fungsi Logout
window.processLogout = async function() {
    const isConfirmed = await showModal('warning', 'Konfirmasi', 'Yakin ingin keluar dari Taufik OS?', true);
    if(isConfirmed) {
        auth.signOut().then(() => {
            // [FIXED] Bersihkan sesi saat logout
            sessionStorage.removeItem('isLoggedIn');
            
            showToast && typeof showToast === 'function' ? showToast('Berhasil Logout') : null;
        }).catch((error) => {
            showModal('error', 'Error', 'Gagal logout.', false);
        });
    }
}


// ==========================================
// 1. DATABASE REGISTRY (CLOUD FIRESTORE)
// ==========================================
// Kumpulan nama Collection di Firestore untuk fitur Backup/Restore
const OS_COLLECTIONS = [
    'projects',          // misal untuk data job order tracker
    'finance',           // misal untuk data finance
    'notes',             // misal untuk data notes
    'crm',               // misal untuk data klien
    'assets',            // misal untuk data asset library
    'events'             // misal untuk acara/scheduler
];


// ==========================================
// 2. CLOCK, DATE & GREETING SYSTEM
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
    
    if (hour >= 5 && hour < 12) greetingText = 'Good Morning, Taufik.';
    else if (hour >= 12 && hour < 15) greetingText = 'Good Afternoon, Taufik.';
    else if (hour >= 15 && hour < 19) greetingText = 'Good Evening, Taufik.';
    else greetingText = 'Good Night, Taufik.';

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
// 3. CUSTOM MODAL ENGINE
// ==========================================
function showModal(type, title, message, showCancel = true) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('os-modal');
        const titleEl = document.getElementById('modal-title');
        const messageEl = document.getElementById('modal-message');
        const iconEl = document.getElementById('modal-icon');
        const btnCancel = document.getElementById('modal-cancel');
        const btnConfirm = document.getElementById('modal-confirm');

        titleEl.textContent = title;
        messageEl.innerHTML = message.replace(/\n/g, '<br>');

        iconEl.className = `modal-icon ${type}`;
        if (type === 'warning') iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
        if (type === 'success') iconEl.innerHTML = '<i class="fa-solid fa-check"></i>';
        if (type === 'error') iconEl.innerHTML = '<i class="fa-solid fa-xmark"></i>';

        btnCancel.style.display = showCancel ? 'block' : 'none';
        btnConfirm.textContent = showCancel ? 'Lanjutkan' : 'Oke';

        overlay.classList.add('active');

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
// 4. MASTER OS BACKUP SYSTEM (FIRESTORE TO JSON)
// ==========================================
async function downloadMasterBackup() {
    try {
        const btn = document.querySelector('.btn-admin.primary');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;

        let dbDump = {};
        
        // Looping untuk narik semua data dari setiap collection di Firestore
        for (let collectionName of OS_COLLECTIONS) {
            const snapshot = await db.collection(collectionName).get();
            dbDump[collectionName] = [];
            snapshot.forEach(doc => {
                dbDump[collectionName].push({ id: doc.id, ...doc.data() });
            });
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
        a.download = `TAUFIK_OS_CLOUD_BACKUP_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        btn.innerHTML = originalHtml;
        btn.disabled = false;
        await showModal('success', 'Backup Berhasil', 'Seluruh database cloud berhasil di-backup ke JSON.', false);
    } catch (error) {
        console.error("Backup Error: ", error);
        await showModal('error', 'Backup Gagal', 'Terjadi kesalahan saat menarik data dari Firestore.', false);
    }
}

// ==========================================
// 5. MASTER OS RESTORE SYSTEM (JSON TO FIRESTORE)
// ==========================================
async function restoreMasterBackup(inputElement) {
    const file = inputElement.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const content = JSON.parse(e.target.result);

            if (content.app_name === "TAUFIK_FREELANCE_OS") {
                const isConfirmed = await showModal(
                    'warning',
                    'Peringatan Sistem Cloud!',
                    `Kamu akan menimpa/menambahkan data CLOUD dengan data dari:\n<strong>${content.backup_date}</strong>\n\nApakah kamu yakin ingin melanjutkan?`,
                    true
                );

                if (isConfirmed) {
                    // Batch write ke Firestore
                    for (let collectionName in content.data) {
                        const items = content.data[collectionName];
                        for (let item of items) {
                            // Menggunakan set() dengan merge agar tidak menimpa field yang sudah ada di document tersebut
                            await db.collection(collectionName).doc(item.id).set(item, { merge: true });
                        }
                    }
                    
                    await showModal('success', 'Restore Berhasil', 'Master Data berhasil dipulihkan ke Firestore!', false);
                    location.reload(); 
                }
            } else {
                await showModal('error', 'Akses Ditolak', 'File JSON ini bukan format backup Taufik OS.', false);
            }
        } catch (err) {
            console.error(err);
            await showModal('error', 'File Corrupt', 'Gagal membaca file atau push ke database.', false);
        }
    };
    reader.readAsText(file);
    inputElement.value = ""; 
}
