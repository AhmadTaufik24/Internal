/**
 * TAUFIK SYSTEM - SMART NOTES ENGINE v4.0
 * Soft-Delete (Archive 30 Days), YAKIN Confirmation, Restore
 */

const DB = window.DB || {
    load: function(t) { return JSON.parse(localStorage.getItem(t)) || []; },
    save: function(t, d) { localStorage.setItem(t, JSON.stringify(d)); }
};

const TABLE_NAME = 'taufik_notes_db_v1';
let notesData = [];
let currentFilter = 'all';
let activeNoteId = null;
let autoSaveTimer = null;
let isPreviewMode = false;

if (typeof marked !== 'undefined' && typeof hljs !== 'undefined') {
    marked.setOptions({
        highlight: function(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        breaks: true 
    });
}

document.addEventListener('DOMContentLoaded', () => {
    notesData = DB.load(TABLE_NAME);
    
    // Auto-Delete catatan di Sampah yang > 30 Hari
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    let isCleaned = false;

    notesData = notesData.filter(n => {
        if (n.isArchived && n.archived_at) {
            if (now - new Date(n.archived_at).getTime() > THIRTY_DAYS_MS) {
                isCleaned = true;
                return false; // Hapus permanen
            }
        }
        return true;
    });

    if (isCleaned) DB.save(TABLE_NAME, notesData);
    
    // Auto-Inject Data
    if (notesData.length === 0) {
        notesData = [{
            id: 'NOTE-1',
            title: 'Welcome to Smart Notes! 🎉',
            content: 'Catatan ini mendukung **Markdown**!\n\n```javascript\nconsole.log("Halo, Taufik!");\n```',
            category: 'idea',
            tags: ['welcome'],
            color: '#7a9ebf',
            isPinned: true,
            isArchived: false,
            created_at: new Date().toISOString()
        }];
        DB.save(TABLE_NAME, notesData);
    }
    
    renderNotesList();

    const editorInputs = ['note-title', 'note-input', 'note-category', 'note-tags', 'note-color'];
    editorInputs.forEach(id => {
        document.getElementById(id).addEventListener('input', triggerAutoSave);
    });

    // Validasi ketik "YAKIN" di Modal Delete
    document.getElementById('delete-confirm-input').addEventListener('input', function(e) {
        const btn = document.getElementById('btn-confirm-delete');
        if (e.target.value.trim().toUpperCase() === 'YAKIN') {
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        } else {
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        }
    });

    // =======================================================
    // PENANGKAP AKSES CEPAT DARI COMMAND CENTER
    // =======================================================
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'new') {
        setTimeout(() => { createNewNote(); }, 300);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

function filterNotes(filter, element) {
    currentFilter = filter;
    document.querySelectorAll('.sidebar .menu-item').forEach(m => m.classList.remove('active'));
    element.classList.add('active');
    
    // Tutup editor kalau pindah menu biar ga bug
    closeEditor();
    renderNotesList();
}

function searchNotes() { renderNotesList(); }

function renderNotesList() {
    const listPanel = document.getElementById('notes-list');
    const searchVal = document.getElementById('searchNote').value.toLowerCase();
    listPanel.innerHTML = '';

    let filtered = notesData.filter(n => {
        // Logika Mode Sampah vs Mode Normal
        if (currentFilter === 'archive') {
            if (!n.isArchived) return false;
        } else {
            if (n.isArchived) return false; // Sembunyikan yang diarsip dari menu normal
        }

        let mTabFix = false;
        if (currentFilter === 'all' || currentFilter === 'archive') mTabFix = true;
        else if (currentFilter === 'pinned') mTabFix = n.isPinned === true;
        else mTabFix = n.category === currentFilter;

        const mSearch = n.title.toLowerCase().includes(searchVal) || 
                        n.content.toLowerCase().includes(searchVal) || 
                        (n.tags && n.tags.join(' ').toLowerCase().includes(searchVal));
        return mTabFix && mSearch;
    });

    filtered.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
    });

    if (filtered.length === 0) {
        let emptyText = currentFilter === 'archive' ? 'Sampah bersih.' : 'Tidak ada catatan di sini.';
        listPanel.innerHTML = `
            <div style="text-align:center; padding: 40px 20px; color:#aaa;">
                <i class="fa-solid ${currentFilter === 'archive' ? 'fa-trash-can' : 'fa-note-sticky'}" style="font-size:32px; margin-bottom:10px;"></i>
                <p style="font-size:12px;">${emptyText}</p>
            </div>`;
        return;
    }

    filtered.forEach(n => {
        const dateStr = new Date(n.created_at).toLocaleDateString('id-ID', { day:'numeric', month:'short' });
        const previewText = n.content.replace(/[#*`_]/g, '').substring(0, 60) + '...'; 
        
        const pinClass = n.isPinned ? 'is-pinned' : '';
        const activeClass = (n.id === activeNoteId) ? 'active' : '';
        const cardBorder = n.color && n.color !== '#ffffff' ? `border-left-color: ${n.color};` : '';

        const card = document.createElement('div');
        card.className = `note-card-item ${pinClass} ${activeClass}`;
        card.style = cardBorder;
        
        // Peringatan sisa hari kalau di archive
        let archiveNotice = '';
        if (n.isArchived) {
            const daysLeft = 30 - Math.floor((Date.now() - new Date(n.archived_at).getTime()) / (1000 * 60 * 60 * 24));
            archiveNotice = `<div style="font-size:9px; color:var(--danger); margin-top:5px; font-weight:bold;">Sisa ${daysLeft} hari sblm dihapus permanen</div>`;
        }

        card.onclick = () => openNoteInEditor(n.id);
        card.innerHTML = `
            <h4 class="nc-title" style="${n.isArchived ? 'text-decoration: line-through; opacity:0.6;' : ''}">${n.title || 'Catatan Tanpa Judul'}</h4>
            <p class="nc-preview">${previewText}</p>
            <div class="nc-meta">
                <span>${dateStr}</span>
                <span>${getCategoryLabel(n.category)}</span>
            </div>
            ${archiveNotice}
        `;
        listPanel.appendChild(card);
    });
}

function getCategoryLabel(cat) {
    const labels = { work: '💼 Kerja', code: '💻 Koding', personal: '👤 Pribadi', idea: '💡 Ide', misc: '📦 Lainnya' };
    return labels[cat] || '📦 Lainnya';
}

function createNewNote() {
    activeNoteId = null; 
    
    document.getElementById('note-title').value = '';
    document.getElementById('note-input').value = '';
    document.getElementById('note-tags').value = '';
    
    let defaultCat = 'idea';
    if (['work','code','personal','misc'].includes(currentFilter)) {
        defaultCat = currentFilter;
    }
    document.getElementById('note-category').value = defaultCat;
    document.getElementById('note-color').value = '#ffffff';
    document.getElementById('btn-pin').style.color = '#888';
    
    // Sembunyikan tombol restore
    document.getElementById('btn-restore').style.display = 'none';

    document.getElementById('empty-editor-state').style.display = 'none';
    document.getElementById('note-editor').style.display = 'flex';
    
    enableEditMode();
    document.body.classList.add('editor-open');
    document.getElementById('note-title').focus();
    renderNotesList();
}

function openNoteInEditor(id) {
    const note = notesData.find(n => n.id === id);
    if (!note) return;

    activeNoteId = id;

    document.getElementById('note-title').value = note.title;
    document.getElementById('note-input').value = note.content;
    document.getElementById('note-category').value = note.category;
    document.getElementById('note-tags').value = (note.tags || []).join(', ');
    document.getElementById('note-color').value = note.color || '#ffffff';
    
    document.getElementById('btn-pin').style.color = note.isPinned ? 'var(--warning)' : '#888';

    // Tampilkan tombol Restore JIKA lagi di Archive, Sembunyikan tombol Edit & Pin
    if (note.isArchived) {
        document.getElementById('btn-restore').style.display = 'inline-block';
        document.getElementById('btn-pin').style.display = 'none';
        document.getElementById('btn-toggle-view').style.display = 'none';
    } else {
        document.getElementById('btn-restore').style.display = 'none';
        document.getElementById('btn-pin').style.display = 'inline-block';
        document.getElementById('btn-toggle-view').style.display = 'inline-block';
    }

    document.getElementById('empty-editor-state').style.display = 'none';
    document.getElementById('note-editor').style.display = 'flex';
    
    enablePreviewMode();
    document.getElementById('save-status').innerText = note.isArchived ? 'Mode Sampah (Read-Only)' : 'Mode Baca.';

    document.body.classList.add('editor-open');
    renderNotesList();
}

function closeEditor() {
    document.body.classList.remove('editor-open');
    activeNoteId = null;
    document.getElementById('note-editor').style.display = 'none';
    document.getElementById('empty-editor-state').style.display = 'flex';
    renderNotesList();
}

function triggerAutoSave() {
    if (isPreviewMode) return; 
    const note = notesData.find(n => n.id === activeNoteId);
    if (note && note.isArchived) return; // Kalo di archive ga boleh di-save
    
    const statusText = document.getElementById('save-status');
    statusText.innerText = 'Mengetik...';
    
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => { saveNote(true); }, 1000); 
}

function saveNote(isAutoSave = false) {
    const title = document.getElementById('note-title').value.trim();
    const content = document.getElementById('note-input').value;
    if (!title && !content) return;

    const category = document.getElementById('note-category').value;
    const color = document.getElementById('note-color').value;
    const tagsInput = document.getElementById('note-tags').value;
    const tags = tagsInput ? tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '') : [];
    const isPinned = document.getElementById('btn-pin').style.color === 'var(--warning)';

    if (activeNoteId) {
        const idx = notesData.findIndex(n => n.id === activeNoteId);
        if (idx > -1) {
            if (notesData[idx].isArchived) return; // Prevent saving archived notes
            notesData[idx].title = title || 'Catatan Tanpa Judul';
            notesData[idx].content = content;
            notesData[idx].category = category;
            notesData[idx].tags = tags;
            notesData[idx].color = color;
            notesData[idx].isPinned = isPinned;
        }
    } else {
        const newNote = {
            id: 'NOTE-' + Date.now(),
            title: title || 'Catatan Tanpa Judul',
            content: content,
            category: category,
            tags: tags,
            color: color,
            isPinned: isPinned,
            isArchived: false,
            created_at: new Date().toISOString()
        };
        notesData.push(newNote);
        activeNoteId = newNote.id; 
    }

    DB.save(TABLE_NAME, notesData);
    document.getElementById('save-status').innerText = 'Tersimpan otomatis.';
    renderNotesList(); 
}

// ------------------------------------------
// LOGIKA DELETE DENGAN MODAL "YAKIN"
// ------------------------------------------
function deleteCurrentNote() {
    if (!activeNoteId) return;
    const note = notesData.find(n => n.id === activeNoteId);
    
    // Reset form modal
    document.getElementById('delete-confirm-input').value = '';
    const btnConfirm = document.getElementById('btn-confirm-delete');
    btnConfirm.disabled = true;
    btnConfirm.style.opacity = '0.5';
    btnConfirm.style.cursor = 'not-allowed';

    // Set Teks Modal
    if (note.isArchived) {
        document.getElementById('delete-modal-text').innerHTML = 'Catatan ini akan <strong>dihapus permanen</strong> dan tidak bisa dikembalikan. Ketik <strong>YAKIN</strong> untuk konfirmasi.';
    } else {
        document.getElementById('delete-modal-text').innerHTML = 'Catatan akan dipindahkan ke Sampah dan dihapus permanen dalam 30 hari. Ketik <strong>YAKIN</strong> untuk konfirmasi.';
    }
    
    document.getElementById('modal-delete').style.display = 'flex';
    document.getElementById('delete-confirm-input').focus();
}

function closeDeleteModal() {
    document.getElementById('modal-delete').style.display = 'none';
}

function processDelete() {
    const noteIndex = notesData.findIndex(n => n.id === activeNoteId);
    if (noteIndex === -1) return;

    if (notesData[noteIndex].isArchived) {
        // HAPUS PERMANEN DARI ARCHIVE
        notesData.splice(noteIndex, 1);
        showToast('Catatan dihapus permanen.');
    } else {
        // PINDAH KE SAMPAH
        notesData[noteIndex].isArchived = true;
        notesData[noteIndex].archived_at = new Date().toISOString();
        notesData[noteIndex].isPinned = false; 
        showToast('Catatan dipindah ke Sampah.');
    }

    DB.save(TABLE_NAME, notesData);
    closeDeleteModal();
    closeEditor(); 
    renderNotesList();
}

function restoreNote() {
    const noteIndex = notesData.findIndex(n => n.id === activeNoteId);
    if (noteIndex > -1) {
        notesData[noteIndex].isArchived = false;
        delete notesData[noteIndex].archived_at;
        DB.save(TABLE_NAME, notesData);
        closeEditor();
        renderNotesList();
        showToast('Catatan berhasil dikembalikan.');
    }
}
// ------------------------------------------

function togglePin() {
    const pinBtn = document.getElementById('btn-pin');
    const isCurrentlyPinned = pinBtn.style.color === 'var(--warning)';
    pinBtn.style.color = isCurrentlyPinned ? '#888' : 'var(--warning)';
    saveNote(true); 
}

function toggleViewMode() {
    if (isPreviewMode) enableEditMode();
    else { saveNote(); enablePreviewMode(); }
}

function enablePreviewMode() {
    const inputArea = document.getElementById('note-input');
    const previewArea = document.getElementById('note-preview');
    const btnToggle = document.getElementById('btn-toggle-view');

    if (typeof marked !== 'undefined') {
        previewArea.innerHTML = marked.parse(inputArea.value || '*Catatan kosong*');
    } else {
        previewArea.innerHTML = "<p><em>Gagal memuat Markdown parser.</em></p>";
    }
    
    inputArea.style.display = 'none';
    previewArea.style.display = 'block';
    
    document.getElementById('note-title').readOnly = true;
    document.getElementById('note-tags').readOnly = true;
    document.getElementById('note-category').disabled = true;
    document.getElementById('note-color').disabled = true;
    
    btnToggle.innerHTML = '<i class="fa-solid fa-pen"></i> Edit Catatan';
    btnToggle.classList.remove('btn-outline');
    btnToggle.classList.add('btn');
    
    const note = notesData.find(n => n.id === activeNoteId);
    document.getElementById('save-status').innerText = note && note.isArchived ? 'Mode Sampah (Read-Only)' : 'Mode Baca.';
    isPreviewMode = true;
}

function enableEditMode() {
    const inputArea = document.getElementById('note-input');
    const previewArea = document.getElementById('note-preview');
    const btnToggle = document.getElementById('btn-toggle-view');

    inputArea.style.display = 'block';
    previewArea.style.display = 'none';
    
    document.getElementById('note-title').readOnly = false;
    document.getElementById('note-tags').readOnly = false;
    document.getElementById('note-category').disabled = false;
    document.getElementById('note-color').disabled = false;
    
    btnToggle.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Simpan Catatan';
    btnToggle.classList.remove('btn-outline');
    btnToggle.classList.add('btn');
    
    document.getElementById('save-status').innerText = 'Mode Edit.';
    isPreviewMode = false;
}

function showToast(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.className = "toast show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
}