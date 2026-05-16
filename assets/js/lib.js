const DB = window.DB || {
    load: function(t) { return JSON.parse(localStorage.getItem(t)) || []; },
    save: function(t, d) { localStorage.setItem(t, JSON.stringify(d)); }
};

const TABLE = 'taufik_assets_library_v1';
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

document.addEventListener('DOMContentLoaded', () => {
    libraryAssets = DB.load(TABLE);
    renderAssets();
});

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
    const id = document.getElementById('asset-id').value;
    const name = document.getElementById('asset-name').value;
    const url = document.getElementById('asset-url').value;
    if (!name || !url) return alert('Nama & Link wajib diisi!');

    const tags = document.getElementById('asset-tags').value.split(',').map(t => t.trim()).filter(t => t !== '');
    
    const data = {
        name, url, tags,
        category: document.getElementById('asset-category').value,
        description: document.getElementById('asset-desc').value,
        created_at: new Date().toISOString()
    };

    if (id) {
        const i = libraryAssets.findIndex(x => x.id === id);
        libraryAssets[i] = { ...libraryAssets[i], ...data };
    } else {
        data.id = 'AST-' + Date.now();
        libraryAssets.push(data);
    }

    DB.save(TABLE, libraryAssets);
    closeAssetModal();
    renderAssets();
}

function editAsset(id) {
    const a = libraryAssets.find(x => x.id === id);
    document.getElementById('asset-id').value = a.id;
    document.getElementById('asset-name').value = a.name;
    document.getElementById('asset-category').value = a.category;
    document.getElementById('asset-url').value = a.url;
    document.getElementById('asset-tags').value = (a.tags || []).join(', ');
    document.getElementById('asset-desc').value = a.description;
    document.getElementById('modal-asset').style.display = 'flex';
}

function deleteAsset(id) {
    if (confirm('Hapus aset ini?')) {
        libraryAssets = libraryAssets.filter(x => x.id !== id);
        DB.save(TABLE, libraryAssets);
        renderAssets();
    }
}

function copyUrl(u) {
    navigator.clipboard.writeText(decodeURIComponent(u)).then(() => {
        const t = document.getElementById('toast');
        t.className = 'toast show';
        setTimeout(() => t.className = 'toast', 2000);
    });
}

window.onclick = (e) => { if (e.target.id === 'modal-asset') closeAssetModal(); };