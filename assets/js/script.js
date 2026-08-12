// ==========================================
// 0. PRE-CHECK LOADING SCREEN
// ==========================================
if (sessionStorage.getItem('hasSeenLoader') === 'true') {
    const preLoader = document.getElementById('global-loader');
    if (preLoader) preLoader.style.display = 'none'; 
} else {
    // Animasi teks loading ala terminal/sistem
    const loadText = document.getElementById('loading-text');
    const texts = ["Menyiapkan workspace...", "Memuat database...", "Sinkronisasi UI...", "Sistem siap."];
    let i = 0;
    if(loadText) {
        setInterval(() => {
            i = (i + 1) % texts.length;
            loadText.innerText = texts[i];
        }, 400);
    }
}

// ==========================================
// 1. FIREBASE AUTH, FIRESTORE & GATEWAY
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
const auth = firebase.auth();
const db = firebase.firestore();

auth.onAuthStateChanged((user) => {
    const loginOverlay = document.getElementById('login-overlay');
    const globalLoader = document.getElementById('global-loader');

    if (user) {
        sessionStorage.setItem('isLoggedIn', 'true');
        if (sessionStorage.getItem('hasSeenLoader') === 'true') {
            if(globalLoader) globalLoader.style.display = 'none';
        } else {
            setTimeout(() => {
                if(globalLoader) {
                    globalLoader.classList.add('hidden');
                    setTimeout(() => {
                        globalLoader.style.display = 'none';
                        sessionStorage.setItem('hasSeenLoader', 'true');
                    }, 600); 
                }
            }, 1800); 
        }
    } else {
        sessionStorage.removeItem('isLoggedIn');
        sessionStorage.removeItem('hasSeenLoader'); 
        loginOverlay.style.display = 'flex';
        setTimeout(() => {
            loginOverlay.style.opacity = '1';
            if(globalLoader) {
                globalLoader.classList.add('hidden');
                setTimeout(() => globalLoader.style.display = 'none', 500);
            }
        }, 1500);
    }
});

window.processLogin = function() {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;
    const btn = document.getElementById('btn-login');
    
    if(!email || !pass) { showModal('warning', 'Input Kosong', 'Harap isi email dan password.', false); return; }
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...'; btn.disabled = true;

    auth.signInWithEmailAndPassword(email, pass)
        .then((userCredential) => {
            btn.innerHTML = '<i class="fa-solid fa-check"></i> Berhasil';
            sessionStorage.setItem('hasSeenLoader', 'true');
            setTimeout(() => {
                const loginOverlay = document.getElementById('login-overlay');
                if (loginOverlay) {
                    loginOverlay.style.opacity = '0';
                    setTimeout(() => loginOverlay.style.display = 'none', 500);
                }
                btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login System';
                btn.disabled = false;
                document.getElementById('login-pass').value = ''; 
            }, 1000);
        }).catch((error) => {
            btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Login System';
            btn.disabled = false;
            showModal('error', 'Akses Ditolak', 'Email atau password salah!', false);
        });
}

window.resetPassword = function() {
    const email = document.getElementById('login-email').value;
    const btn = document.getElementById('btn-login');
    const originalBtnText = btn.innerHTML;
    
    if(!email) { 
        showModal('warning', 'Email Kosong', 'Ketik email di kolom atas, baru klik Lupa Password.', false); 
        return; 
    }

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...'; 
    btn.disabled = true;

    auth.sendPasswordResetEmail(email)
        .then(() => { 
            btn.innerHTML = originalBtnText; 
            btn.disabled = false;
            showModal('success', 'Email Terkirim', 'Link reset password sudah dikirim. Silakan cek Inbox atau folder Spam!', false); 
        })
        .catch((error) => { 
            btn.innerHTML = originalBtnText; 
            btn.disabled = false;
            
            if (error.code === 'auth/user-not-found') {
                showModal('error', 'Tidak Terdaftar', 'Email yang kamu masukkan tidak terdaftar di database sistem Taufik OS.', false);
            } else if (error.code === 'auth/invalid-email') {
                showModal('error', 'Format Salah', 'Format email yang dimasukkan tidak valid.', false);
            } else {
                showModal('error', 'Error Sistem', 'Gagal memverifikasi email.', false);
            }
        });
}

window.processLogout = async function() {
    const isConfirmed = await showModal('warning', 'Konfirmasi', 'Yakin ingin keluar dari Taufik OS?', true);
    if(isConfirmed) {
        auth.signOut().then(() => {
            sessionStorage.removeItem('isLoggedIn');
            sessionStorage.removeItem('hasSeenLoader'); 
            location.reload(); 
        }).catch((error) => { showModal('error', 'Error', 'Gagal logout.', false); });
    }
}

// ==========================================
// 2. ULTRA-ACCURATE LOCATION & WEATHER (GPS + IP FALLBACK)
// ==========================================
function fetchLiveLocationAndWeather() {
    const locEl = document.getElementById('user-location');
    const cloudValEl = document.getElementById('cloud-cover-val');
    const weatherDescEl = document.getElementById('weather-desc');

    const loadWeather = (lat, lon) => {
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,cloud_cover,weather_code`)
            .then(res => res.json())
            .then(weather => {
                const current = weather.current;
                if (current) {
                    if (cloudValEl) cloudValEl.innerText = `${current.cloud_cover}%`;
                    let condition = "Clear / Sunny";
                    if (current.weather_code >= 1 && current.weather_code <= 3) condition = "Cloudy";
                    if (current.weather_code >= 45 && current.weather_code <= 55) condition = "Foggy";
                    if (current.weather_code >= 61) condition = "Rainy / Wet";
                    if (weatherDescEl) weatherDescEl.innerText = `${current.temperature_2m}°C • ${condition}`;
                }
            }).catch(err => console.warn("Open-Meteo Error:", err));
    };

    const fallbackToIP = () => {
        fetch('https://ipapi.co/json/')
            .then(response => response.json())
            .then(data => {
                if (data.city && data.latitude && data.longitude) {
                    locEl.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${data.city}, ${data.country_code}`;
                    loadWeather(data.latitude, data.longitude);
                }
            })
            .catch(() => {
                if (locEl) locEl.innerHTML = `<i class="fa-solid fa-location-dot"></i> Offline Mode`;
                if (weatherDescEl) weatherDescEl.innerText = `Gagal memuat cuaca`;
            });
    };

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;

                fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
                    .then(res => res.json())
                    .then(data => {
                        const area = data.address.city || data.address.town || data.address.village || data.address.county;
                        const country = data.address.country_code.toUpperCase();
                        locEl.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${area}, ${country}`;
                    }).catch(() => locEl.innerHTML = `<i class="fa-solid fa-location-dot"></i> GPS Aktif`);

                loadWeather(lat, lon);
            },
            (error) => {
                console.warn("GPS Ditolak/Error. Menggunakan IP Geolocation...", error);
                fallbackToIP(); 
            }
        );
    } else {
        fallbackToIP(); 
    }
}

// ==========================================
// 3. DAILY PALETTE ENGINE (BENTO FORMAT)
// ==========================================
function updateDailyPalette() {
    const palettes = [
        ['#F38181', '#FCE38A', '#95E1D3'],
        ['#E27D60', '#85DCBA', '#E8A87C'],
        ['#2A363B', '#E84A5F', '#FF847C'],
        ['#A8E6CF', '#DCEDC1', '#FFD3B6'],
        ['#112F41', '#068587', '#4FB99F'],
        ['#343D46', '#4F5B66', '#65737E'],
        ['#D9B08C', '#FFCB9A', '#D1E8E2'],
        ['#5D5C61', '#379683', '#7395AE'],
        ['#1A1A1D', '#4E4E50', '#6F2232'],
        ['#950740', '#C3073F', '#EDC7B7']
    ];
    
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now - startOfYear) / (1000 * 60 * 60 * 24));
    
    const todaysPalette = palettes[dayOfYear % palettes.length];
    
    const container = document.getElementById('daily-palette');
    if (container) {
        container.innerHTML = `
            <div class="color-circles">
                <div class="color-swatch" style="background: ${todaysPalette[0]};"></div>
                <div class="color-swatch" style="background: ${todaysPalette[1]};"></div>
                <div class="color-swatch" style="background: ${todaysPalette[2]};"></div>
            </div>
            <div class="hex-codes">
                ${todaysPalette[0]}<br>${todaysPalette[1]}<br>${todaysPalette[2]}
            </div>
        `;
    }
}

// ==========================================
// 4. MILESTONE COUNTDOWN & MODAL ENGINE
// ==========================================
function updateCountdown() {
    let savedDateStr = localStorage.getItem('milestoneDate');
    if (!savedDateStr) {
        savedDateStr = '2026-12-31'; 
    }
    
    const targetDate = new Date(savedDateStr + 'T00:00:00'); 
    const now = new Date();
    const diff = targetDate - now;

    const countdownEl = document.getElementById('milestone-countdown');
    if (countdownEl) {
        if (diff > 0) {
            const daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));
            countdownEl.innerText = `${daysLeft} DAYS LEFT`;
        } else if (diff > -86400000) { 
            countdownEl.innerText = "IT'S TODAY! 🎉";
        } else {
            countdownEl.innerText = "ACARA SELESAI ✨";
        }
    }
}

window.openDateModal = function() {
    const modal = document.getElementById('date-modal');
    if(modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
        
        const savedDate = localStorage.getItem('milestoneDate');
        if(savedDate) document.getElementById('milestone-date-input').value = savedDate;
    }
}

window.closeDateModal = function() {
    const modal = document.getElementById('date-modal');
    if(modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 300);
    }
}

window.saveMilestoneDate = function() {
    const dateInput = document.getElementById('milestone-date-input').value;
    if (dateInput) {
        localStorage.setItem('milestoneDate', dateInput);
        updateCountdown();
        closeDateModal();
        showModal('success', 'Tersimpan', 'Tanggal The Big Day berhasil diatur!', false);
    } else {
        showModal('warning', 'Peringatan', 'Harap pilih tanggal terlebih dahulu!', false);
    }
}

// ==========================================
// 5. CLOCK, DATE & INIT SYSTEM
// ==========================================
function updateTime() {
    const now = new Date();
    
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    
    const clockElement = document.getElementById('clock');
    if (clockElement) clockElement.textContent = `${h}.${m}.${s}`;

    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateString = now.toLocaleDateString('id-ID', options);
    const dateElement = document.getElementById('date');
    if (dateElement) dateElement.textContent = dateString;

    const hour = now.getHours();
    let greetingText = '';
    if (hour >= 5 && hour < 12) greetingText = 'GOOD MORNING, TAUFIK.';
    else if (hour >= 12 && hour < 15) greetingText = 'GOOD AFTERNOON, TAUFIK.';
    else if (hour >= 15 && hour < 19) greetingText = 'GOOD EVENING, TAUFIK.';
    else greetingText = 'GOOD NIGHT, TAUFIK.';

    const greetingElement = document.getElementById('greeting');
    if (greetingElement) greetingElement.textContent = greetingText;
}

document.addEventListener('DOMContentLoaded', () => {
    updateTime();
    setInterval(updateTime, 1000); 
    
    fetchLiveLocationAndWeather(); 
    
    // UPDATE CUACA PER 1 MENIT (60.000 milidetik)
    setInterval(fetchLiveLocationAndWeather, 60000); 
    
    updateDailyPalette();
    
    updateCountdown();
    setInterval(updateCountdown, 1000 * 60 * 60); 
});

// ==========================================
// 6. CUSTOM MODAL ENGINE
// ==========================================
function showModal(type, title, message, showCancel = true) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('os-modal');
        const titleEl = document.getElementById('modal-title');
        const messageEl = document.getElementById('modal-message');
        const iconEl = document.getElementById('modal-icon');
        const btnCancel = document.getElementById('modal-cancel');
        const btnConfirm = document.getElementById('modal-confirm');

        titleEl.textContent = title; messageEl.innerHTML = message.replace(/\n/g, '<br>');
        iconEl.className = `modal-icon ${type}`;
        if (type === 'warning') iconEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i>';
        if (type === 'success') iconEl.innerHTML = '<i class="fa-solid fa-check"></i>';
        if (type === 'error') iconEl.innerHTML = '<i class="fa-solid fa-xmark"></i>';

        btnCancel.style.display = showCancel ? 'block' : 'none';
        btnConfirm.textContent = showCancel ? 'Lanjutkan' : 'Oke';

        overlay.classList.add('active');

        const cleanup = () => { overlay.classList.remove('active'); btnConfirm.removeEventListener('click', onConfirm); btnCancel.removeEventListener('click', onCancel); };
        const onConfirm = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

        btnConfirm.addEventListener('click', onConfirm);
        btnCancel.addEventListener('click', onCancel);
    });
}

// ==========================================
// 7. MASTER OS BACKUP & RESTORE
// ==========================================
const OS_COLLECTIONS = ['projects', 'finance', 'notes', 'crm', 'assets', 'events'];

async function downloadMasterBackup() {
    try {
        const btn = document.querySelector('.control-dock .btn-backup'); 
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; btn.disabled = true;

        let dbDump = {};
        for (let collectionName of OS_COLLECTIONS) {
            const snapshot = await db.collection(collectionName).get();
            dbDump[collectionName] = [];
            snapshot.forEach(doc => { dbDump[collectionName].push({ id: doc.id, ...doc.data() }); });
        }
        const masterData = { app_name: "TAUFIK_FREELANCE_OS", backup_date: new Date().toLocaleString('id-ID'), data: dbDump };
        const dataStr = JSON.stringify(masterData, null, 2); 
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `TAUFIK_OS_CLOUD_BACKUP_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);

        btn.innerHTML = originalHtml; btn.disabled = false;
        await showModal('success', 'Backup Berhasil', 'Seluruh database cloud berhasil di-backup.', false);
    } catch (error) { await showModal('error', 'Backup Gagal', 'Terjadi kesalahan sistem.', false); }
}

async function restoreMasterBackup(inputElement) {
    const file = inputElement.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const content = JSON.parse(e.target.result);
            if (content.app_name === "TAUFIK_FREELANCE_OS") {
                const isConfirmed = await showModal('warning', 'Peringatan Cloud!', `Timpa data dari:\n<strong>${content.backup_date}</strong>\nLanjutkan?`, true);
                if (isConfirmed) {
                    for (let collectionName in content.data) {
                        const items = content.data[collectionName];
                        for (let item of items) { await db.collection(collectionName).doc(item.id).set(item, { merge: true }); }
                    }
                    await showModal('success', 'Restore Berhasil', 'Master Data dipulihkan!', false); location.reload(); 
                }
            } else { await showModal('error', 'Ditolak', 'File bukan format Taufik OS.', false); }
        } catch (err) { await showModal('error', 'File Corrupt', 'Gagal membaca file.', false); }
    };
    reader.readAsText(file); inputElement.value = ""; 
}
