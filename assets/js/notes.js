/**
 * TAUFIK SYSTEM - SMART NOTES ENGINE v6.1 (FIXED RESPONSIVE + DELETE COMMENT)
 * + Firebase Firestore Sync, Gateway Auth, Realtime Public Comments, Shared Editor
 */

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

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.firestore();
const auth = firebase.auth();

// ==========================================
// 2. STATE ENGINE & CACHE
// ==========================================
const DB = {
    load: function(t) { return JSON.parse(localStorage.getItem(t)) || null; },
    save: function(t, d) { localStorage.setItem(t, JSON.stringify(d)); }
};

let notesData = [];
let currentFilter = 'all';
let activeNoteId = null;
let autoSaveTimer = null;
let isPreviewMode = false;
let draggedNoteId = null;
let categoryToDelete = null; 
let activeShareId = null; 
let commentListener = null; 
let adminCommentListener = null;

const defaultCategories = [
    { id: 'work', label: '💼 Pekerjaan' },
    { id: 'code', label: '💻 Koding & Snippet' },
    { id: 'personal', label: '👤 Pribadi' },
    { id: 'idea', label: '💡 Ide Kreatif' },
    { id: 'misc', label: '📦 Lainnya' }
];
let customCategories = DB.load('taufik_categories_v1') || [];

function getAllCategories() { return [...defaultCategories, ...customCategories]; }

// 🔥 BAGIAN YANG DIUBAH ADA DI SINI 🔥
if (typeof marked !== 'undefined' && typeof hljs !== 'undefined') {
    // 1. Buat custom renderer
    const renderer = new marked.Renderer();
    const originalLink = renderer.link.bind(renderer);
    
    // 2. Timpa pengaturan default untuk link
    renderer.link = function(href, title, text) {
        const html = originalLink(href, title, text);
        // Sisipkan target="_blank" dan atribut keamanan
        return html.replace(/^<a /, '<a target="_blank" rel="noopener noreferrer" ');
    };

    // 3. Masukkan renderer ke dalam options
    marked.setOptions({
        renderer: renderer,
        highlight: function(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        breaks: true 
    });
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// ==========================================
// 3. LOGIKA INISIALISASI & GATEWAY SATPAM
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const shareId = urlParams.get('share');
    
    if (shareId) {
        initShareMode(shareId);
        return; 
    }

    auth.onAuthStateChanged((user) => {
        if (!user) {
            window.location.href = 'index.html';
        } else {
            renderCategoryDropdown();
            renderSidebarCategories();

            db.collection("notes").onSnapshot((snapshot) => {
                notesData = [];
                snapshot.forEach((doc) => { notesData.push(doc.data()); });
                renderNotesList();
            }, (error) => {
                console.error(error);
                showToast("Gagal menyinkronkan server.");
            });

            const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            db.collection("notes").where("isArchived", "==", true).get().then((snapshot) => {
                const batch = db.batch();
                let hasDeletions = false;
                snapshot.forEach((doc) => {
                    const note = doc.data();
                    if (note.archived_at && (now - new Date(note.archived_at).getTime() > THIRTY_DAYS_MS)) {
                        batch.delete(doc.ref);
                        hasDeletions = true;
                    }
                });
                if (hasDeletions) batch.commit();
            });
        }
    });

    const editorInputs = ['note-title', 'note-input', 'note-category', 'note-tags', 'note-color'];
    editorInputs.forEach(id => {
        const el = document.getElementById(id);
        if(el) el.addEventListener('input', triggerAutoSave);
    });

    const deleteInput = document.getElementById('delete-confirm-input');
    if (deleteInput) {
        deleteInput.addEventListener('input', function(e) {
            const btn = document.getElementById('btn-confirm-delete');
            if (e.target.value.trim().toUpperCase() === 'YAKIN') {
                btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer';
            } else {
                btn.disabled = true; btn.style.opacity = '0.5'; btn.style.cursor = 'not-allowed';
            }
        });
    }

    window.addEventListener('click', function(e) {
        if (!e.target.closest('.kebab-wrapper')) {
            document.querySelectorAll('.kebab-dropdown').forEach(d => d.classList.remove('show'));
        }
    });
});

// ==========================================
// 4. OPERASI KELOLA CATEGORY
// ==========================================
function renderCategoryDropdown() {
    const select = document.getElementById('note-category');
    if(!select) return; select.innerHTML = '';
    getAllCategories().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id; opt.innerText = cat.label; select.appendChild(opt);
    });
}

function renderSidebarCategories() {
    const container = document.getElementById('custom-categories-container');
    if(!container) return; container.innerHTML = '';
    if (customCategories.length > 0) {
        container.innerHTML = `<div class="menu-section-title" style="margin-top: 15px;">Kategori Custom</div>`;
        customCategories.forEach(cat => {
            const item = document.createElement('div');
            item.className = 'menu-item';
            if(currentFilter === cat.id) item.classList.add('active');
            item.onclick = function() { filterNotes(cat.id, this); };
            item.innerHTML = `<i class="fa-solid fa-folder"></i> <span>${cat.label.replace('📁 ', '')}</span>`;
            container.appendChild(item);
        });
    }
}

window.openCategoryModal = function() { document.getElementById('modal-category').style.display = 'flex'; renderCategoryManager(); }
window.closeCategoryModal = function() { document.getElementById('modal-category').style.display = 'none'; }
window.addCategory = function() {
    const input = document.getElementById('new-category-input'); const val = input.value.trim(); if(!val) return;
    const newCat = { id: 'cat_' + Date.now(), label: '📁 ' + val }; customCategories.push(newCat);
    DB.save('taufik_categories_v1', customCategories); input.value = '';
    renderCategoryManager(); renderCategoryDropdown(); renderSidebarCategories(); showToast("Kategori ditambah");
}

window.deleteCategory = function(id) { categoryToDelete = id; document.getElementById('modal-delete-category').style.display = 'flex'; }
window.closeDeleteCategoryModal = function() { document.getElementById('modal-delete-category').style.display = 'none'; categoryToDelete = null; }
window.processDeleteCategory = function() {
    if(!categoryToDelete) return;
    customCategories = customCategories.filter(c => c.id !== categoryToDelete);
    DB.save('taufik_categories_v1', customCategories);
    db.collection("notes").where("category", "==", categoryToDelete).get().then((snapshot) => {
        const batch = db.batch(); snapshot.forEach((doc) => { batch.update(doc.ref, { category: 'misc' }); }); batch.commit();
    });
    if(currentFilter === categoryToDelete) filterNotes('all', document.querySelectorAll('.sidebar .menu-item')[0]);
    renderCategoryManager(); renderCategoryDropdown(); renderSidebarCategories(); showToast("Kategori dihapus"); closeDeleteCategoryModal();
}

function renderCategoryManager() {
    const list = document.getElementById('category-list'); if(!list) return; list.innerHTML = '';
    defaultCategories.forEach(cat => { list.innerHTML += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #f5f5f5; border-radius: 6px;"><span style="font-size: 13px; color: #666;">${cat.label}</span><span style="font-size: 10px; font-weight: bold; color: #aaa; text-transform: uppercase;">Default</span></div>`; });
    customCategories.forEach(cat => { list.innerHTML += `<div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; background: #fff; border: 1px solid #ddd; border-radius: 6px;"><span style="font-size: 13px;">${cat.label}</span><button onclick="deleteCategory('${cat.id}')" style="background: none; border: none; color: var(--danger); cursor: pointer;"><i class="fa-solid fa-trash"></i></button></div>`; });
}

function getCategoryLabel(catId) { const allCats = getAllCategories(); const found = allCats.find(c => c.id === catId); return found ? found.label : '📦 Lainnya'; }

// ==========================================
// 5. RENDER & FILTER CATATAN VIEW LIST
// ==========================================
window.filterNotes = function(filter, element) { currentFilter = filter; document.querySelectorAll('.sidebar .menu-item').forEach(m => m.classList.remove('active')); if(element) element.classList.add('active'); closeEditor(); renderNotesList(); }
window.searchNotes = function() { renderNotesList(); }

function renderNotesList() {
    const listPanel = document.getElementById('notes-list'); if(!listPanel) return;
    const searchVal = document.getElementById('searchNote').value.toLowerCase(); listPanel.innerHTML = '';

    let filtered = notesData.filter(n => {
        if (currentFilter === 'archive') { if (!n.isArchived) return false; } else { if (n.isArchived) return false; }
        let mTabFix = false;
        if (currentFilter === 'all' || currentFilter === 'archive') mTabFix = true;
        else if (currentFilter === 'pinned') mTabFix = n.isPinned === true;
        else mTabFix = n.category === currentFilter;
        return mTabFix && (n.title.toLowerCase().includes(searchVal) || n.content.toLowerCase().includes(searchVal));
    });

    filtered.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1; if (!a.isPinned && b.isPinned) return 1;
        return (a.order || 0) - (b.order || 0) || new Date(b.created_at) - new Date(a.created_at);
    });

    if (filtered.length === 0) {
        listPanel.innerHTML = `<div style="text-align:center; padding: 40px 20px; color:#aaa;"><i class="fa-solid fa-note-sticky" style="font-size:32px; margin-bottom:10px;"></i><p style="font-size:12px;">Tidak ada catatan.</p></div>`; return;
    }

    filtered.forEach((n, index) => {
        const dateStr = new Date(n.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short' });
        const previewText = escapeHTML(n.content.replace(/[#*`_>]/g, '').substring(0, 60)) + '...'; 
        const cardBorder = n.color && n.color !== '#ffffff' ? `border-left-color: ${n.color};` : '';

        const card = document.createElement('div');
        card.className = `note-card-item ${n.isPinned ? 'is-pinned' : ''} ${n.id === activeNoteId ? 'active' : ''}`;
        card.style = cardBorder; card.draggable = true; card.dataset.id = n.id;
        card.addEventListener('dragstart', handleDragStart); card.addEventListener('dragover', handleDragOver); card.addEventListener('dragleave', handleDragLeave); card.addEventListener('drop', handleDrop);

        card.onclick = (e) => { if(!e.target.closest('.kebab-wrapper')) openNoteInEditor(n.id); };
        card.innerHTML = `
            <div class="kebab-wrapper">
                <button class="kebab-btn" onclick="toggleKebab(event, '${n.id}')"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                <div class="kebab-dropdown" id="kebab-${n.id}"><div class="kebab-item" onclick="quickDelete(event, '${n.id}')"><i class="fa-solid fa-trash"></i> Hapus</div></div>
            </div>
            <h4 class="nc-title" style="${n.isArchived ? 'text-decoration: line-through; opacity:0.6;' : ''}">${escapeHTML(n.title) || 'Tanpa Judul'}</h4>
            <p class="nc-preview">${previewText}</p>
            <div class="nc-meta"><span>${dateStr}</span><span>${getCategoryLabel(n.category)}</span></div>
            ${n.isArchived ? '<div style="font-size:9px; color:var(--danger); margin-top:5px;">Arsip</div>' : ''}
        `;
        listPanel.appendChild(card);
    });
}

function handleDragStart(e) { draggedNoteId = this.dataset.id; e.dataTransfer.effectAllowed = 'move'; setTimeout(() => this.classList.add('dragging'), 0); }
function handleDragOver(e) { e.preventDefault(); this.classList.add('drag-over'); }
function handleDragLeave() { this.classList.remove('drag-over'); }
function handleDrop(e) {
    e.preventDefault(); this.classList.remove('drag-over'); document.querySelectorAll('.note-card-item').forEach(c => c.classList.remove('dragging'));
    const targetId = this.dataset.id; if (draggedNoteId === targetId) return;
    const dragIdx = notesData.findIndex(n => n.id === draggedNoteId); const targetIdx = notesData.findIndex(n => n.id === targetId);
    if (notesData[dragIdx].isPinned !== notesData[targetIdx].isPinned) { showToast("Grup Pin dipisah!"); return; }
    const draggedItem = notesData.splice(dragIdx, 1)[0]; notesData.splice(targetIdx, 0, draggedItem);
    const batch = db.batch(); notesData.forEach((note, idx) => { note.order = idx; batch.update(db.collection("notes").doc(note.id), { order: idx }); }); batch.commit();
}

window.toggleKebab = function(e, id) { e.stopPropagation(); document.querySelectorAll('.kebab-dropdown').forEach(d => { if(d.id !== `kebab-${id}`) d.classList.remove('show'); }); document.getElementById(`kebab-${id}`).classList.toggle('show'); }
window.quickDelete = function(e, id) { e.stopPropagation(); activeNoteId = id; deleteCurrentNote(); document.getElementById(`kebab-${id}`).classList.remove('show'); }


// ==========================================
// 6. EDITOR ACTIONS (ADMIN SIDE)
// ==========================================
window.insertFormat = function(type) {
    const textarea = document.getElementById('note-input'); 
    const start = textarea.selectionStart; const end = textarea.selectionEnd; const text = textarea.value; const selectedText = text.substring(start, end);
    let before = '', after = '', fallback = '';
    
    switch(type) {
        case 'bold': before = '**'; after = '**'; fallback = 'Teks tebal'; break;
        case 'italic': before = '*'; after = '*'; fallback = 'Teks miring'; break;
        case 'strike': before = '~~'; after = '~~'; fallback = 'Teks coret'; break;
        case 'code': before = '`'; after = '`'; fallback = 'kode inline'; break;
        case 'codeblock': before = '\n```\n'; after = '\n```\n'; fallback = 'Ketik kode disini'; break;
        case 'ul': before = '\n- '; fallback = 'List item'; break;
        case 'quote': before = '\n> '; fallback = 'Kutipan'; break;
    }
    const insertText = selectedText || fallback; textarea.value = text.substring(0, start) + before + insertText + after + text.substring(end);
    textarea.focus(); textarea.selectionStart = start + before.length; textarea.selectionEnd = textarea.selectionStart + insertText.length; triggerAutoSave();
}

window.createNewNote = function() {
    activeNoteId = null; 
    document.getElementById('note-title').value = ''; 
    document.getElementById('note-input').value = '';
    document.getElementById('note-category').value = getAllCategories().find(c => c.id === currentFilter) ? currentFilter : 'idea';
    document.getElementById('note-color').value = '#ffffff';
    document.getElementById('btn-pin').dataset.pinned = "false"; document.getElementById('btn-pin').style.color = '#888';
    
    document.getElementById('btn-share').innerHTML = '<i class="fa-solid fa-lock"></i>';
    document.getElementById('btn-share').style.color = '#888';
    document.getElementById('share-permission-select').style.display = 'none';
    document.getElementById('btn-restore').style.display = 'none';
    
    document.getElementById('admin-comments-section').style.display = 'none';
    if(adminCommentListener) adminCommentListener();

    document.getElementById('empty-editor-state').style.display = 'none'; 
    document.getElementById('note-editor').style.display = 'flex';
    enableEditMode(); document.body.classList.add('editor-open'); document.getElementById('note-title').focus(); renderNotesList();
}

window.openNoteInEditor = function(id) {
    const note = notesData.find(n => n.id === id); if (!note) return; activeNoteId = id;
    document.getElementById('note-title').value = note.title; 
    document.getElementById('note-input').value = note.content;
    document.getElementById('note-category').value = note.category; 
    document.getElementById('note-tags').value = (note.tags || []).join(', ');
    document.getElementById('note-color').value = note.color || '#ffffff';
    
    const pinBtn = document.getElementById('btn-pin'); 
    pinBtn.dataset.pinned = note.isPinned ? "true" : "false"; 
    pinBtn.style.color = note.isPinned ? 'var(--warning)' : '#888';
    
    const shareBtn = document.getElementById('btn-share');
    const permSelect = document.getElementById('share-permission-select');
    if(note.isShared) {
        shareBtn.innerHTML = '<i class="fa-solid fa-unlock"></i>'; shareBtn.style.color = 'var(--primary)';
        permSelect.value = note.shareMode || 'view'; permSelect.style.display = 'inline-block';
    } else {
        shareBtn.innerHTML = '<i class="fa-solid fa-lock"></i>'; shareBtn.style.color = '#888';
        permSelect.style.display = 'none';
    }

    if (note.isShared && note.shareMode === 'comment') {
        document.getElementById('admin-comments-section').style.display = 'block';
        loadAdminComments(id);
    } else {
        document.getElementById('admin-comments-section').style.display = 'none';
        if(adminCommentListener) adminCommentListener();
    }

    if (note.isArchived) {
        document.getElementById('btn-restore').style.display = 'inline-block'; document.getElementById('btn-pin').style.display = 'none'; document.getElementById('btn-toggle-view').style.display = 'none'; document.getElementById('format-toolbar').style.display = 'none';
    } else {
        document.getElementById('btn-restore').style.display = 'none'; document.getElementById('btn-pin').style.display = 'inline-block'; document.getElementById('btn-toggle-view').style.display = 'inline-block'; document.getElementById('format-toolbar').style.display = 'flex';
    }
    
    document.getElementById('empty-editor-state').style.display = 'none'; 
    document.getElementById('note-editor').style.display = 'flex';
    enablePreviewMode(); document.body.classList.add('editor-open'); renderNotesList();
}

window.closeEditor = function() { document.body.classList.remove('editor-open'); activeNoteId = null; document.getElementById('note-editor').style.display = 'none'; document.getElementById('empty-editor-state').style.display = 'flex'; renderNotesList(); }

function triggerAutoSave() { 
    if (isPreviewMode || (notesData.find(n => n.id === activeNoteId) && notesData.find(n => n.id === activeNoteId).isArchived)) return; 
    document.getElementById('save-status').innerText = 'Mengetik...'; clearTimeout(autoSaveTimer); autoSaveTimer = setTimeout(() => { saveNote(true); }, 1000); 
}

function saveNote(isAutoSave = false) {
    const title = document.getElementById('note-title').value.trim(); const content = document.getElementById('note-input').value; if (!title && !content) return;
    const category = document.getElementById('note-category').value; const color = document.getElementById('note-color').value; const tagsInput = document.getElementById('note-tags').value;
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '') : []; const isPinned = document.getElementById('btn-pin').dataset.pinned === "true";
    
    if (activeNoteId) {
        db.collection("notes").doc(activeNoteId).update({ title: title || 'Tanpa Judul', content: content, category: category, tags: tags, color: color, isPinned: isPinned });
    } else {
        const newId = 'NOTE-' + Date.now(); activeNoteId = newId; 
        const newNote = { id: newId, title: title || 'Tanpa Judul', content: content, category: category, tags: tags, color: color, isPinned: isPinned, isArchived: false, isShared: false, shareMode: 'view', order: 0, created_at: new Date().toISOString() };
        db.collection("notes").doc(newId).set(newNote);
    }
    document.getElementById('save-status').innerText = 'Tersimpan otomatis.';
}

window.deleteCurrentNote = function() {
    if (!activeNoteId) return; const note = notesData.find(n => n.id === activeNoteId); document.getElementById('delete-confirm-input').value = '';
    document.getElementById('btn-confirm-delete').disabled = true; document.getElementById('btn-confirm-delete').style.opacity = '0.5';
    document.getElementById('delete-modal-text').innerHTML = note.isArchived ? 'Catatan ini akan <strong>dihapus permanen</strong>. Ketik <strong>YAKIN</strong>.' : 'Catatan pindah ke Sampah. Ketik <strong>YAKIN</strong>.';
    document.getElementById('modal-delete').style.display = 'flex'; document.getElementById('delete-confirm-input').focus();
}
window.closeDeleteModal = function() { document.getElementById('modal-delete').style.display = 'none'; }
window.processDelete = function() {
    const note = notesData.find(n => n.id === activeNoteId); if (!note) return;
    if (note.isArchived) { db.collection("notes").doc(activeNoteId).delete().then(() => { showToast('Dihapus permanen.'); closeDeleteModal(); closeEditor(); }); } 
    else { db.collection("notes").doc(activeNoteId).update({ isArchived: true, archived_at: new Date().toISOString(), isPinned: false }).then(() => { showToast('Masuk Sampah.'); closeDeleteModal(); closeEditor(); }); }
}
window.restoreNote = function() { db.collection("notes").doc(activeNoteId).update({ isArchived: false, archived_at: firebase.firestore.FieldValue.delete() }).then(() => { closeEditor(); showToast('Catatan dipulihkan.'); }); }


// ==========================================
// 7. SHARE ACCESS MANAGEMENT (ADMIN)
// ==========================================
window.toggleShare = function() {
    if(!activeNoteId) return;
    const note = notesData.find(n => n.id === activeNoteId);
    const newShareStatus = !note.isShared;
    const currentMode = note.shareMode || 'view';

    db.collection("notes").doc(activeNoteId).update({
        isShared: newShareStatus,
        shareMode: currentMode
    }).then(() => {
        const shareBtn = document.getElementById('btn-share');
        const permSelect = document.getElementById('share-permission-select');
        
        if(newShareStatus) {
            shareBtn.innerHTML = '<i class="fa-solid fa-unlock"></i>'; shareBtn.style.color = 'var(--primary)';
            permSelect.style.display = 'inline-block';
            
            let txtMap = { 'view': 'Lihat Saja', 'comment': 'Bisa Komentar', 'edit': 'Bisa Mengedit' };
            document.getElementById('share-info-text').innerText = `Status: ${txtMap[currentMode]}. Tautan disalin ke papan klip!`;
            
            const shareURL = window.location.origin + window.location.pathname + '?share=' + activeNoteId;
            navigator.clipboard.writeText(shareURL).then(() => { document.getElementById('modal-share-info').style.display = 'flex'; });
        } else {
            shareBtn.innerHTML = '<i class="fa-solid fa-lock"></i>'; shareBtn.style.color = '#888';
            permSelect.style.display = 'none'; showToast('Catatan dikunci (Private)');
        }
    });
}

window.updateSharePermission = function() {
    if(!activeNoteId) return;
    const nextMode = document.getElementById('share-permission-select').value;
    db.collection("notes").doc(activeNoteId).update({ shareMode: nextMode }).then(() => {
        showToast(`Hak akses diubah ke: ${nextMode.toUpperCase()}`);
        
        if (nextMode === 'comment') {
            document.getElementById('admin-comments-section').style.display = 'block';
            loadAdminComments(activeNoteId);
        } else {
            document.getElementById('admin-comments-section').style.display = 'none';
            if(adminCommentListener) adminCommentListener();
        }
    });
}


// ==========================================
// 8. SHARE MODE PUBLIK (LOGIKA PENGUNJUNG)
// ==========================================
window.initShareMode = function(id) {
    activeShareId = id;
    document.getElementById('app-sidebar').style.display = 'none';
    document.getElementById('app-main').style.display = 'none';
    document.body.style.background = '#f8f9fa';
    document.getElementById('share-view-overlay').style.display = 'block';

    db.collection("notes").doc(id).onSnapshot((doc) => {
        if (doc.exists) {
            const note = doc.data();
            const mode = note.shareMode || 'view';
            
            if (!note.isShared) {
                document.getElementById('share-locked-view').style.display = 'block';
                document.getElementById('share-preview-view').style.display = 'none';
                document.getElementById('share-edit-view').style.display = 'none';
                document.getElementById('share-comments-section').style.display = 'none';
            } else {
                document.getElementById('share-locked-view').style.display = 'none';
                
                const isEditingNow = document.getElementById('share-edit-view').style.display === 'flex';
                if (!isEditingNow) {
                    document.getElementById('share-preview-view').style.display = 'block';
                }

                document.getElementById('share-title').innerText = escapeHTML(note.title) || 'Catatan';
                document.getElementById('share-content').innerHTML = typeof marked !== 'undefined' ? marked.parse(note.content || '') : note.content;
                
                if (document.activeElement !== document.getElementById('share-note-input') && document.activeElement !== document.getElementById('share-title-input')) {
                    document.getElementById('share-note-input').value = note.content || '';
                    document.getElementById('share-title-input').value = note.title || '';
                }

                const btnEdit = document.getElementById('btn-share-edit-trigger');
                const commentSec = document.getElementById('share-comments-section');
                const footerStatus = document.getElementById('share-footer-status');

                if (mode === 'edit') {
                    btnEdit.style.display = 'flex';
                    commentSec.style.display = 'none';
                    footerStatus.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Mode Kolaborasi Publik (Dapat Mengedit)';
                } else if (mode === 'comment') {
                    btnEdit.style.display = 'none';
                    commentSec.style.display = 'block';
                    footerStatus.innerHTML = '<i class="fa-regular fa-comment-dots"></i> Mode Interaktif (Dapat Berkomentar)';
                    loadCommentsRealtime(id); 
                } else { 
                    btnEdit.style.display = 'none';
                    commentSec.style.display = 'none';
                    footerStatus.innerHTML = '<i class="fa-solid fa-eye"></i> Catatan Publik (Read-Only)';
                }
            }
        } else {
            document.getElementById('share-locked-view').style.display = 'block';
            document.getElementById('share-preview-view').style.display = 'none';
            document.getElementById('share-edit-view').style.display = 'none';
            document.getElementById('share-comments-section').style.display = 'none';
            document.querySelector('#share-locked-view h2').innerText = "Catatan Tidak Ditemukan";
            document.querySelector('#share-locked-view p').innerText = "Tautan ini mungkin salah atau catatan sudah dihapus.";
        }
    });
}

window.toggleShareEditMode = function() {
    const previewView = document.getElementById('share-preview-view');
    const editView = document.getElementById('share-edit-view');
    
    if (editView.style.display === 'none') {
        previewView.style.display = 'none';
        editView.style.display = 'flex';
        document.getElementById('share-note-input').focus();
    } else {
        editView.style.display = 'none';
        previewView.style.display = 'block';
    }
}

window.saveSharedEdit = function() {
    if(!activeShareId) return;
    const nextContent = document.getElementById('share-note-input').value;
    const nextTitle = document.getElementById('share-title-input').value;
    
    const btn = event.currentTarget;
    const origText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan...';
    btn.disabled = true;

    db.collection("notes").doc(activeShareId).update({ 
        content: nextContent,
        title: nextTitle || 'Tanpa Judul'
    }).then(() => {
        btn.innerHTML = origText;
        btn.disabled = false;
        toggleShareEditMode();
        showToast("Perubahan berhasil disimpan dan disinkronkan!");
    }).catch(err => {
        btn.innerHTML = origText;
        btn.disabled = false;
        alert("Gagal memperbarui catatan.");
    });
}

window.insertShareFormat = function(type) {
    const textarea = document.getElementById('share-note-input'); 
    const start = textarea.selectionStart; const end = textarea.selectionEnd; const text = textarea.value; const selectedText = text.substring(start, end);
    let before = '', after = '', fallback = '';
    
    switch(type) {
        case 'bold': before = '**'; after = '**'; fallback = 'Teks tebal'; break;
        case 'italic': before = '*'; after = '*'; fallback = 'Teks miring'; break;
        case 'strike': before = '~~'; after = '~~'; fallback = 'Teks coret'; break;
        case 'code': before = '`'; after = '`'; fallback = 'kode inline'; break;
        case 'codeblock': before = '\n```\n'; after = '\n```\n'; fallback = 'Ketik kode disini'; break;
        case 'ul': before = '\n- '; fallback = 'List item'; break;
        case 'quote': before = '\n> '; fallback = 'Kutipan'; break;
    }
    const insertText = selectedText || fallback; textarea.value = text.substring(0, start) + before + insertText + after + text.substring(end);
    textarea.focus(); textarea.selectionStart = start + before.length; textarea.selectionEnd = textarea.selectionStart + insertText.length;
}

window.submitSharedComment = function() {
    if(!activeShareId) return;
    const author = document.getElementById('share-comment-author').value.trim() || 'Anonymous';
    const msg = document.getElementById('share-comment-input').value.trim();
    if(!msg) return;

    db.collection("notes").doc(activeShareId).collection("comments").add({
        author: author,
        message: msg,
        created_at: new Date().toISOString()
    }).then(() => {
        document.getElementById('share-comment-input').value = '';
    });
}

function loadCommentsRealtime(id) {
    if(commentListener) commentListener(); 
    commentListener = db.collection("notes").doc(id).collection("comments").orderBy("created_at", "asc").onSnapshot((snapshot) => {
        const box = document.getElementById('share-comments-list');
        if(!box) return; box.innerHTML = '';
        if(snapshot.empty) { box.innerHTML = '<p style="font-size:11px; color:#aaa; font-style:italic;">Belum ada komentar.</p>'; return; }
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const dateStr = new Date(data.created_at).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) + ' - ' + new Date(data.created_at).toLocaleDateString('id-ID', {day:'numeric', month:'short'});
            const isAdmin = data.author === 'Admin' ? 'border-left: 3px solid var(--warning); background: #fff8e6;' : 'border-left: 3px solid var(--primary); background: #f1f5f9;';

            box.innerHTML += `
                <div class="comment-item" style="${isAdmin}">
                    <div class="comment-meta">
                        <span>👤 ${escapeHTML(data.author)} ${data.author === 'Admin' ? '👑' : ''}</span>
                        <span>${dateStr}</span>
                    </div>
                    <div style="color:#333;">${escapeHTML(data.message)}</div>
                </div>
            `;
        });
        box.scrollTop = box.scrollHeight; 
    });
}

// ==========================================
// 9. FITUR KOMENTAR UNTUK ADMIN (DITAMBAH FUNGSI HAPUS)
// ==========================================
function loadAdminComments(id) {
    if(adminCommentListener) adminCommentListener(); 
    const box = document.getElementById('admin-comments-list');
    
    adminCommentListener = db.collection("notes").doc(id).collection("comments").orderBy("created_at", "asc").onSnapshot((snapshot) => {
        if(!box) return; box.innerHTML = '';
        if(snapshot.empty) { box.innerHTML = '<p style="font-size:11px; color:#aaa; font-style:italic;">Belum ada komentar masuk.</p>'; return; }
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const dateStr = new Date(data.created_at).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) + ' - ' + new Date(data.created_at).toLocaleDateString('id-ID', {day:'numeric', month:'short'});
            const isAdmin = data.author === 'Admin' ? 'border-left: 3px solid var(--warning); background: #fff8e6;' : 'border-left: 3px solid var(--primary); background: #f1f5f9;';
            
            // Perbaikan: Nambahin tombol Delete (Tong Sampah Merah) khusus di view Admin
            box.innerHTML += `
                <div style="padding: 10px 14px; border-radius: 12px; font-size: 12px; line-height: 1.4; margin-bottom: 5px; ${isAdmin}">
                    <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; color: #64748b; margin-bottom: 4px; text-transform: uppercase; align-items: center;">
                        <span>👤 ${escapeHTML(data.author)} ${data.author === 'Admin' ? '👑' : ''}</span>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span>${dateStr}</span>
                            <button onclick="deleteComment('${id}', '${doc.id}')" style="background: none; border: none; color: var(--danger); cursor: pointer; padding: 0; font-size: 12px;" title="Hapus Komentar"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                    <div style="color:#333;">${escapeHTML(data.message)}</div>
                </div>
            `;
        });
        const section = document.getElementById('admin-comments-section');
        section.scrollTop = section.scrollHeight; 
    });
}

window.submitAdminComment = function() {
    if(!activeNoteId) return;
    const msg = document.getElementById('admin-comment-input').value.trim();
    if(!msg) return;

    db.collection("notes").doc(activeNoteId).collection("comments").add({
        author: 'Admin',
        message: msg,
        created_at: new Date().toISOString()
    }).then(() => {
        document.getElementById('admin-comment-input').value = '';
    });
}

window.deleteComment = function(noteId, commentId) {
    if(confirm("Yakin ingin menghapus komentar ini?")) {
        db.collection("notes").doc(noteId).collection("comments").doc(commentId).delete().then(() => {
            showToast("Komentar berhasil dihapus");
        }).catch(err => {
            console.error(err);
            showToast("Gagal menghapus komentar");
        });
    }
}

// ==========================================
// 10. UTILITY WINDOW 
// ==========================================
window.togglePin = function() { const pinBtn = document.getElementById('btn-pin'); const isCurrentlyPinned = pinBtn.dataset.pinned === "true"; pinBtn.dataset.pinned = isCurrentlyPinned ? "false" : "true"; pinBtn.style.color = isCurrentlyPinned ? '#888' : 'var(--warning)'; saveNote(true); }
window.toggleViewMode = function() { if (isPreviewMode) enableEditMode(); else { saveNote(); enablePreviewMode(); } }
window.enablePreviewMode = function() {
    const inputArea = document.getElementById('note-input'); const previewArea = document.getElementById('note-preview'); const btnToggle = document.getElementById('btn-toggle-view');
    if (typeof marked !== 'undefined') { previewArea.innerHTML = marked.parse(inputArea.value || '*Catatan kosong*'); } else { previewArea.innerHTML = "<p><em>Gagal memuat parser.</em></p>"; }
    inputArea.style.display = 'none'; document.getElementById('format-toolbar').style.display = 'none'; previewArea.style.display = 'block';
    document.getElementById('note-title').readOnly = true; document.getElementById('note-tags').readOnly = true; document.getElementById('note-category').disabled = true; document.getElementById('note-color').disabled = true;
    btnToggle.innerHTML = '<i class="fa-solid fa-pen"></i> Edit Catatan'; isPreviewMode = true;
}
window.enableEditMode = function() {
    const inputArea = document.getElementById('note-input'); const previewArea = document.getElementById('note-preview'); const btnToggle = document.getElementById('btn-toggle-view');
    inputArea.style.display = 'block'; document.getElementById('format-toolbar').style.display = 'flex'; previewArea.style.display = 'none';
    document.getElementById('note-title').readOnly = false; document.getElementById('note-tags').readOnly = false; document.getElementById('note-category').disabled = false; document.getElementById('note-color').disabled = false;
    btnToggle.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Catatan'; isPreviewMode = false;
}
function showToast(message) { const toast = document.getElementById("toast"); if(!toast) return; toast.innerText = message; toast.className = "toast show"; setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000); }
