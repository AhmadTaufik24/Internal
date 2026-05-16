let activeCharts = {};

function updateHealthIndicator(periodTransactions) {
    try {
        const health = calculateFinancialHealth(periodTransactions);
        const badge = document.getElementById('health-status-badge');
        const icon = document.getElementById('health-icon');
        if (badge && icon) {
            badge.innerText = health.status;
            badge.style.color = health.color;
            icon.innerText = health.icon;
        }
    } catch (e) { console.error("Error UI Health:", e); }
}

function renderDashboard() {
    try {
        const filteredTx = db.transactions.filter(t => isDateInFilter(t.date));
        updateHealthIndicator(filteredTx);
        
        const assets = calculateAssets();
        let incReal = 0, expReal = 0;
        filteredTx.forEach(tx => {
            if(tx.assetType === 'real') {
                if(tx.type === 'income') incReal += tx.amount;
                if(tx.type === 'expense') expReal += tx.amount;
            }
        });

        document.getElementById('sidebar-total-asset').innerText = formatRp(assets.all);
        document.getElementById('dash-income').innerText = formatRp(incReal);
        document.getElementById('dash-expense').innerText = formatRp(expReal);
        document.getElementById('dash-net').innerText = formatRp(incReal - expReal);
        document.getElementById('dash-titipan').innerText = formatRp(assets.titipan);

        const topStats = getTopAnalytics(filteredTx);
        const renderList = (data, prefix, isCount = false) => data.length ? data.map(item => `
            <div class="analytic-item" onclick="openDetailView('category', '${item[0]}', 'Detail: ${item[0]}')">
                <div class="analytic-title">${item[0]}</div>
                <div class="analytic-amount" style="color:${prefix==='+' ? 'var(--success)' : (prefix==='-' ? 'var(--danger)' : 'var(--text-color)')}">
                    ${isCount ? item[1] + ' Trx' : prefix + ' ' + formatRp(item[1])}
                </div>
            </div>
        `).join('') : '<small style="color:var(--text-muted);">Belum ada data</small>';

        document.getElementById('top-income-list').innerHTML = renderList(topStats.topIncome, '+');
        document.getElementById('top-expense-list').innerHTML = renderList(topStats.topExpense, '-');
        document.getElementById('top-category-list').innerHTML = renderList(topStats.topCategory, '', true);
        
        document.getElementById('top-titipan-client-list').innerHTML = topStats.topTitipan.length ? topStats.topTitipan.map(item => `
            <div class="analytic-item" onclick="document.getElementById('filter-owner').value='${item[0]}'; openDetailView('ALL', null, 'Titipan: ${item[0]}');">
                <div class="analytic-title">${item[0]}</div>
                <div class="analytic-amount text-warning">${formatRp(item[1])}</div>
            </div>
        `).join('') : '<small style="color:var(--text-muted);">Belum ada data</small>';

        // Render Grafik
        if(typeof Chart !== 'undefined') {
            renderCashflowChart();
            renderAssetDistributionChart();
            renderCategoryPieChart(filteredTx);
        }
        renderMiniTable(filteredTx);
        
    } catch (error) {
        console.error("CRITICAL DASHBOARD ERROR:", error);
    }
}

function renderCashflowChart() {
    const ctx = document.getElementById('cashflowLineChart');
    if(!ctx) return;
    if(activeCharts.cashflow) activeCharts.cashflow.destroy();
    const data = get12MonthCashflowData();
    activeCharts.cashflow = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: { labels: data.labels, datasets: [{ label: 'Pemasukan', data: data.incomeData, borderColor: '#34d399', fill: false, tension: 0.4 }, { label: 'Pengeluaran', data: data.expenseData, borderColor: '#f87171', fill: false, tension: 0.4 }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderAssetDistributionChart() {
    const ctx = document.getElementById('assetDistributionChart');
    if(!ctx) return;
    if(activeCharts.assetDist) activeCharts.assetDist.destroy();
    const labels = [], dataVals = [];
    db.accounts.filter(a => a.isActive).forEach(acc => {
        const bal = getAccountBalance(acc.id);
        if(bal > 0) { labels.push(acc.name); dataVals.push(bal); }
    });
    activeCharts.assetDist = new Chart(ctx.getContext('2d'), {
        type: 'pie', data: { labels: labels.length ? labels : ['Kosong'], datasets: [{ data: dataVals.length ? dataVals : [1], backgroundColor: dataVals.length ? ['#38bdf8', '#34d399', '#fbbf24', '#f87171'] : ['#e2e8f0'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
}

function renderCategoryPieChart(filteredTx) {
    const ctx = document.getElementById('expensePieChart');
    if(!ctx) return;
    const typeToggle = document.getElementById('chart-type-toggle')?.value || 'expense'; 
    let cats = {};
    (filteredTx || db.transactions).forEach(tx => { if(tx.type === typeToggle && tx.assetType === 'real') cats[tx.category] = (cats[tx.category] || 0) + tx.amount; });
    if(activeCharts.catPie) activeCharts.catPie.destroy();
    const labels = Object.keys(cats), dataVals = Object.values(cats);
    activeCharts.catPie = new Chart(ctx.getContext('2d'), {
        type: 'doughnut', data: { labels: labels.length ? labels : ['Kosong'], datasets: [{ data: dataVals.length ? dataVals : [1], backgroundColor: dataVals.length ? ['#f87171', '#fbbf24', '#38bdf8'] : ['#e2e8f0'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
    });
}

function renderMiniTable(filteredTx) {
    const tbody = document.getElementById('mini-transaction-table');
    const recentTx = filteredTx.sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5); 
    if(recentTx.length === 0) { tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">Belum ada transaksi.</td></tr>'; return; }
    tbody.innerHTML = recentTx.map(tx => {
        let prefix = '', color = 'var(--text-color)';
        if(tx.type.includes('in') && !tx.type.includes('transfer')) { prefix = '+'; color = tx.assetType === 'titipan' ? '#fbbf24' : 'var(--success)'; }
        if(tx.type.includes('out') || tx.type === 'expense') { prefix = '-'; color = 'var(--danger)'; }
        return `<tr class="clickable" onclick="openDetailView('ALL', null, 'Semua Transaksi')">
            <td style="color:var(--text-muted);">${formatDate(tx.date)}</td>
            <td style="font-weight:700;">${tx.title} <br><span class="tx-tag" style="background:transparent; padding:0; color:var(--text-muted)">${tx.category}</span></td>
            <td style="text-align:right; font-weight:800; color:${color};">${prefix} ${formatRp(tx.amount)}</td>
        </tr>`;
    }).join('');
}

function renderDetailTable(filtered) {
    const tbody = document.getElementById('detail-table-body');
    tbody.innerHTML = '';
    let totalNom = 0, maxNom = 0;
    if(filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">Data tidak ditemukan.</td></tr>';
    } else {
        const accMap = getAccountMap();
        filtered.forEach(tx => {
            totalNom += tx.amount;
            if(tx.amount > maxNom) maxNom = tx.amount;
            const acc = accMap.get(tx.accountId);
            let prefix = '', color = 'var(--text-color)';
            if(tx.type.includes('in') && !tx.type.includes('transfer')) { prefix = '+'; color = tx.assetType === 'titipan' ? '#fbbf24' : 'var(--success)'; }
            if(tx.type.includes('out') || tx.type === 'expense') { prefix = '-'; color = 'var(--danger)'; }
            if(tx.type.includes('transfer')) { color = '#38bdf8'; }
            
            let bgAsset = tx.assetType === 'titipan' ? '#fbbf24' : 'var(--primary)';
            let noteHtml = tx.notes ? `<br><small style="color:var(--text-muted); font-weight:normal;">📝 ${tx.notes}</small>` : '';
            let tagsHtml = tx.tags && tx.tags.length ? `<br>` + tx.tags.map(t => `<span class="tx-tag">#${t}</span>`).join('') : '';
            let ownerBadge = tx.ownerName ? `<br><small style="color:#fbbf24; font-weight:bold;">👤 ${tx.ownerName}</small>` : '';

            tbody.innerHTML += `<tr>
                <td style="color:var(--text-muted);">${formatDate(tx.date)}</td>
                <td style="font-weight:700;">${tx.title} ${ownerBadge} ${tagsHtml} ${noteHtml}</td>
                <td><span style="color:var(--primary); font-weight:600; cursor:pointer;" onclick="document.getElementById('filter-cat').value='${tx.category}'; applyFilters();">${tx.category||'-'}</span> <br><small>${tx.subcategory||'-'}</small></td>
                <td><span style="background:${bgAsset}; color:#fff; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold;">${tx.assetType.toUpperCase()}</span> <br><small>${tx.type}</small></td>
                <td>${acc ? acc.name : '-'}</td>
                <td style="text-align:right; font-weight:800; color:${color}">${prefix} ${formatRp(tx.amount)} <button onclick="safeDeleteTransaction('${tx.id}')" style="background:none; border:none; color:var(--danger); cursor:pointer; margin-left:15px;" title="Hapus">🗑️</button></td>
            </tr>`;
        });
    }
    document.getElementById('dt-count').innerText = filtered.length;
    document.getElementById('dt-total').innerText = formatRp(totalNom);
    document.getElementById('dt-avg').innerText = formatRp(filtered.length > 0 ? (totalNom/filtered.length) : 0);
    document.getElementById('dt-max').innerText = formatRp(maxNom);
}

function renderAccounts() {
    const container = document.getElementById('account-manager-list');
    container.innerHTML = '';
    db.accounts.filter(a => a.isActive).forEach(acc => {
        const bal = getAccountBalance(acc.id);
        let totIn = 0, totOut = 0;
        db.transactions.forEach(t => {
            if(t.accountId === acc.id) {
                if(t.type.includes('in') || t.type === 'income') totIn += t.amount;
                if(t.type.includes('out') || t.type === 'expense') totOut += t.amount;
            }
        });

        container.innerHTML += `
        <div class="list-card" style="border-left: 4px solid var(--primary); padding:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h4 style="margin:0; font-size:16px;">${acc.name}</h4>
                <span style="background:var(--primary-bg); color:var(--primary); padding:4px 8px; border-radius:6px; font-size:10px; font-weight:bold;">${acc.type}</span>
            </div>
            <div style="font-size:24px; font-weight:800; margin-top:10px; color:${bal < 0 ? 'var(--danger)' : 'var(--text-color)'};">${formatRp(bal)}</div>
            <div style="margin-top:15px; border-top:1px dashed var(--navbar-border); padding-top:10px; display:flex; justify-content:space-between;">
                <div><button style="background:none; border:none; color:var(--text-muted); cursor:pointer;" onclick="editAccount('${acc.id}')">✏️ Edit</button></div>
                <button class="btn btn-outline btn-sm" onclick="document.getElementById('filter-acc').value='${acc.id}'; openDetailView('ALL', null, 'Mutasi: ${acc.name}')">Mutasi ➔</button>
            </div>
        </div>`;
    });
}