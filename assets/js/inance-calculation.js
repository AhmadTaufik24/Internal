function getAccountMap() { return new Map(db.accounts.map(acc => [acc.id, acc])); }

function calculateFinancialHealth(periodTransactions) {
    if (!periodTransactions) return { status: 'Aman', color: 'var(--text-muted)', icon: '💤' };
    let income = 0, expense = 0;
    periodTransactions.forEach(tx => {
        if(tx.assetType === 'real') {
            if(tx.type === 'income') income += tx.amount;
            if(tx.type === 'expense') expense += tx.amount;
        }
    });

    if (expense === 0 && income === 0) return { status: 'Belum Ada Data', color: 'var(--text-muted)', icon: '💤' };
    if (expense === 0 && income > 0) return { status: 'Sangat Sehat', color: 'var(--success)', icon: '🚀' };
    
    const ratio = income / expense;
    if (ratio >= 1.2) return { status: 'Sehat', color: 'var(--success)', icon: '🌱' };
    if (ratio >= 1.0) return { status: 'Stabil', color: '#f59e0b', icon: '⚖️' };
    return { status: 'Defisit', color: 'var(--danger)', icon: '⚠️' };
}

function calculateAssets() {
    let real = 0, titipan = 0;
    db.transactions.forEach(tx => {
        if(tx.assetType === 'real') {
            if(tx.type === 'income') real += tx.amount;
            if(tx.type === 'expense') real -= tx.amount;
        } else if (tx.assetType === 'titipan') {
            if(tx.type === 'titipan_in') titipan += tx.amount;
            if(tx.type === 'titipan_out') titipan -= tx.amount;
        }
    });
    return { real, titipan, all: real + titipan };
}

function getTopAnalytics(filteredTransactions) {
    let incCats = {}, expCats = {}, titipanClients = {}, popCats = {};
    filteredTransactions.forEach(tx => {
        popCats[tx.category] = (popCats[tx.category] || 0) + 1;
        if(tx.assetType === 'real') {
            if(tx.type === 'income') incCats[tx.category] = (incCats[tx.category] || 0) + tx.amount;
            if(tx.type === 'expense') expCats[tx.category] = (expCats[tx.category] || 0) + tx.amount;
        } else if (tx.assetType === 'titipan' && tx.ownerName) {
            if(!titipanClients[tx.ownerName]) titipanClients[tx.ownerName] = 0;
            if(tx.type === 'titipan_in') titipanClients[tx.ownerName] += tx.amount;
            if(tx.type === 'titipan_out') titipanClients[tx.ownerName] -= tx.amount;
        }
    });
    return {
        topIncome: Object.entries(incCats).sort((a,b)=>b[1]-a[1]).slice(0,3),
        topExpense: Object.entries(expCats).sort((a,b)=>b[1]-a[1]).slice(0,3),
        topCategory: Object.entries(popCats).sort((a,b)=>b[1]-a[1]).slice(0,3),
        topTitipan: Object.entries(titipanClients).sort((a,b)=>b[1]-a[1]).filter(c => c[1] > 0).slice(0,3)
    };
}

function getAccountBalance(accountId) {
    let balance = 0;
    db.transactions.forEach(tx => {
        if (tx.accountId === accountId) {
            if (tx.type === 'income' || tx.type === 'transfer_in' || tx.type === 'titipan_in') balance += tx.amount;
            if (tx.type === 'expense' || tx.type === 'transfer_out' || tx.type === 'titipan_out') balance -= tx.amount;
        }
    }); 
    return balance;
}

function get12MonthCashflowData() {
    const labels = [], incomeData = [], expenseData = [];
    for(let i = 11; i >= 0; i--) {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        labels.push(d.toLocaleString('id-ID', { month: 'short', year: 'numeric' }));
        incomeData.push(0); expenseData.push(0);
    }
    db.transactions.forEach(tx => {
        if(tx.assetType === 'real' && (tx.type === 'income' || tx.type === 'expense')) {
            const txMonthYear = new Date(tx.date).toLocaleString('id-ID', { month: 'short', year: 'numeric' });
            const index = labels.indexOf(txMonthYear);
            if(index !== -1) {
                if(tx.type === 'income') incomeData[index] += tx.amount;
                if(tx.type === 'expense') expenseData[index] += tx.amount;
            }
        }
    });
    return { labels, incomeData, expenseData };
}

function formatRp(n) { return new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(n); }
function formatDate(s) { if(!s) return '-'; const d = new Date(s); return d.getDate() + ' ' + d.toLocaleString('id-ID',{month:'short', year:'numeric'}); }