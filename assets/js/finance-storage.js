const DB_KEY = 'finance_os_v5'; // Ubah versi DB biar ke-reset dari bug yang lama

let db = { accounts: [], transactions: [] };

function initStorage() {
    try {
        const raw = localStorage.getItem(DB_KEY);
        if (raw) {
            db = JSON.parse(raw);
            // Failsafe jika data korup
            if (!db.transactions) db.transactions = [];
            if (!db.accounts) db.accounts = [];
        } else {
            db.accounts = [
                { id: 'ACC-1', name: 'Bank BCA', type: 'Bank', isActive: true },
                { id: 'ACC-2', name: 'Dana', type: 'E-Wallet', isActive: true },
                { id: 'ACC-3', name: 'Dompet Cash', type: 'Cash', isActive: true }
            ];
            db.transactions = [];
            saveData();
        }
    } catch (e) {
        console.error("Storage Error:", e);
        db = { accounts: [], transactions: [] };
    }
}

function saveData() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

function exportData(format = 'json') {
    if(format === 'json') {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db));
        triggerDownload(dataStr, 'json');
    } else if (format === 'csv') {
        let csvContent = "data:text/csv;charset=utf-8,id,date,title,type,category,subcategory,accountId,assetType,ownerName,amount,tags,notes\n";
        db.transactions.forEach(tx => {
            const tags = tx.tags && tx.tags.length ? tx.tags.join(';') : '';
            csvContent += `${tx.id},${tx.date},"${tx.title}",${tx.type},"${tx.category}","${tx.subcategory || ''}",${tx.accountId},${tx.assetType},"${tx.ownerName || ''}",${tx.amount},"${tags}","${tx.notes || ''}"\n`;
        });
        triggerDownload(csvContent, 'csv');
    }
}

function triggerDownload(content, ext) {
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", content);
    dlAnchorElem.setAttribute("download", `FinanceOS_Backup_${new Date().toISOString().split('T')[0]}.${ext}`);
    dlAnchorElem.click();
}

function safeDeleteTransaction(id) {
    if(confirm("🔒 Yakin ingin menghapus transaksi ini?")) {
        const tx = db.transactions.find(t => t.id === id);
        if(tx && tx.transferGroupId) {
            db.transactions = db.transactions.filter(t => t.transferGroupId !== tx.transferGroupId);
        } else {
            db.transactions = db.transactions.filter(t => t.id !== id);
        }
        saveData(); refreshAllViews();
    }
}

function safeDeleteAccount(id) {
    if(confirm("🔒 Yakin ingin menghapus/menonaktifkan akun ini?")) {
        const acc = db.accounts.find(a => a.id === id);
        if(acc) acc.isActive = false; 
        saveData(); refreshAllViews();
    }
}