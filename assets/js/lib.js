// ==========================================
// 1. FIREBASE CONFIGURATION
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
const db = firebase.firestore();
const auth = firebase.auth(); // Kalau butuh auth kedepannya

// ==========================================
// 2. APP STATE & CONFIG
// ==========================================
let libraryAssets = [];
let currentTab = 'all';

const CAT_CONFIG = {
    'photo': { icon: 'fa-camera', color: '#f96b6b', label: 'Photo' },
    'retouch': { icon: 'fa-wand-magic-sparkles', color: '#a29bfe', label: 'Retouch' },
    'video': { icon: 'fa-video', color: '#9b59b6', label: 'Video' },
    'design': { icon: 'fa-pen-nib', color: '#f9af6b', label: 'Design' },
    'web': { icon: 'fa-code', color: '#7a9ebf', label: 'Web' },
    'business': { icon: 'fa-briefcase', color: '#27ae60', label: 'Bisnis' },
    'software': { icon: 'fa-key', color: '#897e7a', label: 'Software' },
    'misc': { icon: 'fa-box-open', color: '#bdc3c7', label: 'Lain-lain' }
};

// ==========================================
// 3. INITIALIZATION & SYNC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Jalankan Migrasi Data dari LocalStorage ke Firestore (Jika Ada)
    migrateLocalDataToFirestore();

    // 2. Realtime Listener ke Firestore (Collection: 'assets')
    db.collection("assets").onSnapshot((snapshot) => {
        libraryAssets = [];
        snapshot.forEach((doc) => { 
            libraryAssets.push(doc.data()); 
        });
        renderAssets();
    }, (error) => {
        console.error("Gagal sinkronisasi data:", error);
        showToast("Gagal menyinkronkan dengan server.");
    });
});

// Fungsi untuk memindah data dari LocalStorage laptop kamu ke Firestore
function migrateLocalDataToFirestore() {
    const TABLE = 'taufik_assets_library_v1';
    const localData = JSON.parse(localStorage.getItem(TABLE)) || [];
    
    if (localData.length > 0) {
        const batch = db.batch();
        localData.forEach(asset => {
            const docRef = db.collection("assets").doc(asset.id);
            batch.set(docRef, asset);
        });
        
        batch.commit().then(() => {
            console.log("Migrasi data lokal ke Firestore berhasil!");
            showToast("Data laptop berhasil dipindah ke Cloud!");
            // Hapus data lokal agar tidak di-migrasi berulang-ulang
            localStorage.removeItem(TABLE);
        }).catch(err => {
            console.error("Gagal migrasi data:", err);
        });
    }
}

// ==========================================
// 4. UI LOGIC & RENDER
// ==========================================
function switchTab(t, el) {
    currentTab = t;
    document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
    el.classList.add('active');
    renderAssets();
}

function searchAssets() { renderAssets(); }

function renderAssets() {
    const grid = document.getElementById('asset-grid');
    const search = document.getElementById('searchInput').value.toLowerCase();
    grid.innerHTML = '';

    let filtered = libraryAssets.filter(a => {
        const mTab = currentTab === 'all' || a.category === currentTab;
        const mSearch = a.name.toLowerCase().includes(search) || (a.tags && a.tags.some(t => t.toLowerCase().includes(search)));
        return mTab && mSearch;
    });

    filtered.sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).forEach(a => {
        const cfg = CAT_CONFIG[a.category] || CAT_CONFIG.misc;
        const card = document.createElement('div');
        card.className = 'card';
        card.style.borderLeftColor = cfg.color;
        
        card.innerHTML = `
            <div class="card-header">
                <h4 class="card-title"><i class="fa-solid ${cfg.icon}" style="color:${cfg.color}"></i> ${a.name}</h4>
                <div class="card-tools">
                    <button class="tool-btn" onclick="editAsset('${a.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="tool-btn" onclick="deleteAsset('${a.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div class="card-tags">${(a.tags || []).map(t => `<span>#${t}</span>`).join('')}</div>
            <div class="card-desc">${a.description || 'Nggak ada catatan.'}</div>
            <div class="card-actions">
                <button class="btn btn-outline btn-sm" onclick="copyUrl('${encodeURIComponent(a.url)}')">Copy Link</button>
                <button class="btn btn-sm" onclick="window.open('${a.url}', '_blank')">Buka ↗</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ==========================================
// 5. CRUD OPERATIONS TO FIRESTORE
// ==========================================
function openAssetModal() {
    document.getElementById('asset-id').value = '';
    document.getElementById('asset-name').value = '';
    document.getElementById('asset-url').value = '';
    document.getElementById('asset-tags').value = '';
    document.getElementById('asset-desc').value = '';
    document.getElementById('modal-asset').style.display = 'flex';
}

function closeAssetModal() { document.getElementById('modal-asset').style.display = 'none'; }

function saveAsset() {
    const idInput = document.getElementById('asset-id').value;
    const name = document.getElementById('asset-name').value;
    const url = document.getElementById('asset-url').value;
    if (!name || !url) return alert('Nama & Link wajib diisi!');

    const tags = document.getElementById('asset-tags').value.split(',').map(t => t.trim()).filter(t => t !== '');
    
    const data = {
        name, url, tags,
        category: document.getElementById('asset-category').value,
        description: document.getElementById('asset-desc').value,
        updated_at: new Date().toISOString()
    };

    let id = idInput;
    if (!id) {
        id = 'AST-' + Date.now();
        data.id = id;
        data.created_at = new Date().toISOString();
    }

    // Simpan/Update ke Firestore
    db.collection("assets").doc(id).set(data, { merge: true }).then(() => {
        closeAssetModal();
        showToast("Aset berhasil disimpan!");
    }).catch(err => {
        console.error("Gagal menyimpan:", err);
        alert("Gagal menyimpan aset ke Cloud.");
    });
}

function editAsset(id) {
    const a = libraryAssets.find(x => x.id === id);
    if(!a) return;
    document.getElementById('asset-id').value = a.id;
    document.getElementById('asset-name').value = a.name;
    document.getElementById('asset-category').value = a.category;
    document.getElementById('asset-url').value = a.url;
    document.getElementById('asset-tags').value = (a.tags || []).join(', ');
    document.getElementById('asset-desc').value = a.description;
    document.getElementById('modal-asset').style.display = 'flex';
}

function deleteAsset(id) {
    if (confirm('Hapus aset ini secara permanen dari Cloud?')) {
        db.collection("assets").doc(id).delete().then(() => {
            showToast("Aset berhasil dihapus!");
        }).catch(err => {
            console.error("Gagal menghapus:", err);
        });
    }
}

// ==========================================
// 6. UTILITIES
// ==========================================
function copyUrl(u) {
    navigator.clipboard.writeText(decodeURIComponent(u)).then(() => {
        showToast("Link berhasil dicopy!");
    });
}

function showToast(msg) {
    const t = document.getElementById('toast');
    t.innerText = msg;
    t.className = 'toast show';
    setTimeout(() => t.className = 'toast', 2000);
}

window.onclick = (e) => { if (e.target.id === 'modal-asset') closeAssetModal(); };
