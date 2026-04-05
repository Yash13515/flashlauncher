/* ============================================
   Maximizer Campaign Heatmap — Full Dashboard JS
   ============================================ */

// ─── Campaign Data ───
let campaigns = [];

// Generate realistic hourly data for a campaign
function generateHourlyData(dailyTotal, intensity) {
    const hourly = {};
    const seed = Math.abs(dailyTotal * 100) % 1000;
    let remaining = dailyTotal;

    for (let h = 0; h < 24; h++) {
        const pseudoRand = Math.sin(seed + h * 2.7) * 0.5 + 0.5;
        const base = remaining / (24 - h);
        const variation = base * (pseudoRand * 1.8 - 0.4);
        const profit = +variation.toFixed(2);

        const spendBase = intensity === 'high' ? 2.5 : intensity === 'mid' ? 1.2 : 0.6;
        const spend = +(spendBase * (0.3 + pseudoRand * 1.4)).toFixed(2);
        const earned = +(spend + profit).toFixed(2);

        hourly[h] = {
            spend: Math.max(0, spend),
            earned: Math.max(0, earned),
            profit: profit,
            roi: spend > 0 ? Math.round(((earned - spend) / spend) * 100) : 0,
            clicks: Math.round(20 + pseudoRand * (intensity === 'high' ? 200 : 80)),
            conv: Math.round(pseudoRand * (intensity === 'high' ? 15 : 5)),
            cpc: +(spend / Math.max(1, Math.round(20 + pseudoRand * 80))).toFixed(3),
            rpc: +(Math.max(0, earned) / Math.max(1, Math.round(20 + pseudoRand * 80))).toFixed(3)
        };

        remaining -= profit;
    }
    return hourly;
}

// ─── State ───
let currentMetric = 'profit';
let expandedCampaigns = new Set();
let dateColumns = [];
let searchFilter = '';
let countryFilter = 'all';

// ─── API Integration ───
const API_KEY = '3s5Vp7jCkFeIiSv8p7o0OOIUcAhH9Bjpjw4LvZVRlBOMFMcsa9mj7VSdGKxi2D27';

async function fetchCampaignData(start = null, end = null) {
    try {
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 6); // Default: last 7 days

        const dateStart = start || pastDate.toISOString().split('T')[0];
        const dateEnd = end || today.toISOString().split('T')[0];

        // Ensure date inputs in UI match the fetch range
        document.getElementById('dateFrom').value = dateStart;
        document.getElementById('dateTo').value = dateEnd;

        // Build date columns exactly for the fetched range (local-aware)
        dateColumns = [];
        let cur = new Date(dateStart + 'T00:00:00');
        const endD = new Date(dateEnd + 'T00:00:00');

        while (cur <= endD) {
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            dateColumns.push(`${y}-${m}-${d}`);
            cur.setDate(cur.getDate() + 1);
        }

        // Simplify metrics list to avoid API timeouts/errors with 'hour' dimension
        const metrics = 'impressions,clicks,spend,conversions,revenue,profit';
        const url = `/api/v1/stats?dateStart=${dateStart}&dateEnd=${dateEnd}&dimensions=campaignName,date,hour&metrics=${metrics}&limit=15000`;

        console.log(`[Dashboard] Fetching Stats: ${url}`);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);
        const data = await response.json();

        if (data && data.results) {
            const campaignMap = {};

            data.results.forEach(r => {
                const name = r.campaignName || 'Unnamed Campaign';
                if (!campaignMap[name]) {
                    const nameParts = name.split('-');
                    const country = nameParts.length > 0 ? nameParts[0].toUpperCase() : 'US';

                    campaignMap[name] = {
                        id: `c${Object.keys(campaignMap).length}`,
                        name: name,
                        status: true,
                        budget: 0,
                        bid: 0,
                        auto: true,
                        country: country.length === 2 ? country : 'US',
                        daily: {},   // Stats per date
                        hourly: {},  // Aggregated stats per hour (0-23)
                        totals: { spend: 0, revenue: 0, conversions: 0, clicks: 0, cpa: 0 }
                    };
                }

                const c = campaignMap[name];
                const date = r.date;
                const hour = parseInt(r.hour) || 0;
                const spend = parseFloat(r.spend) || 0;
                const rev = parseFloat(r.revenue) || 0;
                const conv = parseFloat(r.conversions) || 0;
                const clicks = parseFloat(r.clicks) || 0;
                const profit = rev - spend;

                // Update internal totals (all fetched data)
                c.totals.spend += spend;
                c.totals.revenue += rev;
                c.totals.conversions += conv;
                c.totals.clicks += clicks;
                c.totals.cpa = parseFloat(r.cpa) || c.totals.cpa;

                // Add to daily
                if (!c.daily[date]) {
                    c.daily[date] = { spend: 0, revenue: 0, profit: 0, clicks: 0, conv: 0 };
                }
                const dNode = c.daily[date];
                dNode.spend += spend;
                dNode.revenue += rev;
                dNode.profit += profit;
                dNode.clicks += clicks;
                dNode.conv += conv;

                // Add to hourly (for expanded rows)
                if (!c.hourly[hour]) {
                    c.hourly[hour] = { spend: 0, earned: 0, profit: 0, clicks: 0, conv: 0, roi: 0, rpc: 0 };
                }
                const hNode = c.hourly[hour];
                hNode.spend += spend;
                hNode.earned += rev;
                hNode.profit += profit;
                hNode.clicks += clicks;
                hNode.conv += conv;
            });

            // Finalize campaign objects (calc ROI, budget, bid)
            campaigns = Object.values(campaignMap).map(c => {
                // Calculate ROI for each hour
                for (let h in c.hourly) {
                    const hData = c.hourly[h];
                    const h_spend = parseFloat(hData.spend) || 0;
                    const h_profit = parseFloat(hData.profit) || 0;
                    const h_revenue = parseFloat(hData.earned) || 0;
                    const h_clicks = parseFloat(hData.clicks) || 0;

                    hData.roi = h_spend > 0 ? Math.round((h_profit / h_spend) * 100) : 0;
                    hData.rpc = h_clicks > 0 ? +(h_revenue / h_clicks).toFixed(3) : 0;
                }

                // Finalize budget/bid from totals
                const total_spend = parseFloat(c.totals.spend) || 0;
                const total_cpa = parseFloat(c.totals.cpa) || 1.5;

                c.budget = Math.floor(total_spend * 1.5) || 10;
                c.bid = +(total_cpa * 0.3).toFixed(2);
                c.status = Math.random() > 0.1; // fallback status

                return c;
            });
        }

    } catch (e) {
        console.error('Failed to fetch campaign data:', e);
        alert('Error fetching data from Maximizer API. See console for details.');
    } finally {
        document.getElementById('lastSyncTime').textContent = new Date().toLocaleString();
        document.getElementById('cachedRecords').textContent = campaigns?.length || 0;
    }
}

// ─── Helpers ───
function getCellClass(val, metric) {
    if (val === null || val === undefined || val === '-') return 'cell-nodata';
    const v = parseFloat(val);
    if (isNaN(v)) return 'cell-nodata';

    if (metric === 'roi') {
        if (v > 80) return 'cell-profit-high';
        if (v > 20) return 'cell-profit-mid';
        if (v > 0) return 'cell-profit-low';
        if (v === 0) return 'cell-zero';
        if (v > -40) return 'cell-loss-low';
        if (v > -80) return 'cell-loss-mid';
        return 'cell-loss-high';
    }

    if (metric === 'profit') {
        if (v > 5) return 'cell-profit-high';
        if (v > 1) return 'cell-profit-mid';
        if (v > 0) return 'cell-profit-low';
        if (v === 0) return 'cell-zero';
        if (v > -2) return 'cell-loss-low';
        if (v > -5) return 'cell-loss-mid';
        return 'cell-loss-high';
    }

    if (metric === 'spend') {
        if (v > 1) return 'cell-loss-mid';
        if (v > 0) return 'cell-loss-low';
        return 'cell-zero';
    }

    if (metric === 'revenue') {
        if (v > 3) return 'cell-profit-high';
        if (v > 1) return 'cell-profit-mid';
        if (v > 0) return 'cell-profit-low';
        return 'cell-zero';
    }

    // rpc, cpx
    return v > 0 ? 'cell-profit-low' : 'cell-zero';
}

function getHourlyVal(hData, metric) {
    if (!hData) return null;
    switch (metric) {
        case 'profit': return +(hData.earned - hData.spend).toFixed(2);
        case 'spend': return +hData.spend.toFixed(2);
        case 'revenue': return +hData.earned.toFixed(2);
        case 'roi': return hData.roi;
        case 'rpc': return +hData.rpc.toFixed(3);
        case 'cpx': return hData.conv > 0 ? +(hData.spend / hData.conv).toFixed(3) : 0;
        default: return null;
    }
}

function fmtVal(val, metric) {
    if (val === null || val === undefined || val === '-') return '-';
    const v = parseFloat(val);
    if (isNaN(v)) return '-';

    if (metric === 'roi') return v.toFixed(0) + '%';
    if (metric === 'profit' || metric === 'spend' || metric === 'revenue') {
        return v.toFixed(2);
    }
    return v.toFixed(2);
}

function fmtDateHeader(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return `${days[d.getDay()]}<br>${months[d.getMonth()]} ${d.getDate()}`;
}

function fmtTime(h) {
    const hour = h % 12 === 0 ? 12 : h % 12;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${hour.toString().padStart(2, '0')}:00`;
}

// ─── Init ───
document.addEventListener('DOMContentLoaded', async () => {
    setupTabs();
    setupMetrics();
    setupFilters();
    setupActions();

    // Fetch live data instead of rendering empty mock array
    await fetchCampaignData();
    renderAll();
});

function setupTabs() {
    document.getElementById('tabHeatmap').addEventListener('click', () => {
        document.getElementById('tabHeatmap').classList.add('active');
        document.getElementById('tabURLStatus').classList.remove('active');
        document.getElementById('panelHeatmap').classList.add('active');
        document.getElementById('panelURLStatus').classList.remove('active');
    });
    document.getElementById('tabURLStatus').addEventListener('click', () => {
        document.getElementById('tabURLStatus').classList.add('active');
        document.getElementById('tabHeatmap').classList.remove('active');
        document.getElementById('panelURLStatus').classList.add('active');
        document.getElementById('panelHeatmap').classList.remove('active');
        renderURLStatusPanel();
    });
}

function setupMetrics() {
    document.querySelectorAll('.metric-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.metric-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMetric = btn.dataset.metric;
            renderHeatmapTable();
        });
    });
}

function setupFilters() {
    document.getElementById('campaignSearch').addEventListener('input', (e) => {
        searchFilter = e.target.value.toLowerCase();
        renderHeatmapTable();
    });

    document.getElementById('countrySelect').addEventListener('change', (e) => {
        countryFilter = e.target.value;
        renderHeatmapTable();
    });

    document.getElementById('applyBtn').addEventListener('click', async () => {
        const from = document.getElementById('dateFrom').value;
        const to = document.getElementById('dateTo').value;
        if (from && to) {
            await fetchCampaignData(from, to);
            renderAll();
        }
    });

    // Toggle feature buttons
    document.querySelectorAll('.toggle-feature').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
        });
    });
}

function setupActions() {
    // Export CSV
    document.getElementById('exportBtn').addEventListener('click', exportCSV);

    // Refresh
    document.getElementById('refreshBtn').addEventListener('click', () => {
        document.getElementById('lastSyncTime').textContent = new Date().toLocaleString();
        renderAll();
    });

    // Fetch Data
    document.getElementById('fetchBtn').addEventListener('click', async () => {
        const btn = document.getElementById('fetchBtn');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Fetching...';
        btn.style.opacity = '0.6';

        await fetchCampaignData();
        renderAll();

        btn.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Fetch Data';
        btn.style.opacity = '1';
    });

    // Sync Data
    document.getElementById('syncBtn').addEventListener('click', async () => {
        const btn = document.getElementById('syncBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing...';
        btn.style.opacity = '0.6';

        await fetchCampaignData();
        renderAll();

        btn.innerHTML = originalText;
        btn.style.opacity = '1';
    });

    // Filters dialog — open the advanced filters modal
    document.getElementById('filtersBtn').addEventListener('click', () => {
        openAdvancedFilters();
    });

    // Chat
    document.getElementById('chatBtn').addEventListener('click', () => {
        alert('Chat assistant — coming soon!');
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) {
            alert('Logged out successfully.');
        }
    });
}

// ─── Render All ───
function renderAll() {
    renderKPIs();
    renderHeatmapTable();
}

// ─── KPIs ───
function renderKPIs() {
    let tSpend = 0, tEarned = 0;
    campaigns.forEach(c => {
        Object.values(c.hourly).forEach(h => {
            tSpend += h.spend;
            tEarned += h.earned;
        });
    });

    const tProfit = tEarned - tSpend;
    const roi = tSpend > 0 ? ((tProfit / tSpend) * 100) : 0;

    document.getElementById('totalSpend').textContent = '$' + tSpend.toFixed(2);
    document.getElementById('totalRevenue').textContent = '$' + tEarned.toFixed(2);

    const profEl = document.getElementById('totalProfit');
    profEl.textContent = '$' + tProfit.toFixed(2);
    profEl.className = 'kpi-val ' + (tProfit >= 0 ? 'green' : 'red');

    const roiEl = document.getElementById('overallROI');
    roiEl.textContent = roi.toFixed(2) + '%';
    roiEl.className = 'kpi-val ' + (roi >= 0 ? 'green' : 'red');

    document.getElementById('totalRecords').textContent = campaigns.length;
}

// ─── Heatmap Table ───
function renderHeatmapTable() {
    const head = document.getElementById('heatmapHead');
    const body = document.getElementById('heatmapBody');

    // Filtered campaigns
    let filtered = campaigns.filter(c => {
        const normalizedName = c.name.toLowerCase().replace(/×/g, 'x');
        const normalizedSearch = searchFilter.replace(/×/g, 'x');
        const nameMatch = !searchFilter || normalizedName.includes(normalizedSearch);
        const countryMatch = countryFilter === 'all' || c.country === countryFilter;
        return nameMatch && countryMatch;
    });

    // Apply advanced filters (if active)
    filtered = applyAdvancedFilters(filtered);

    // Sort by first date column profit descending
    filtered.sort((a, b) => {
        const aVal = (a.daily[dateColumns[0]]?.profit) || 0;
        const bVal = (b.daily[dateColumns[0]]?.profit) || 0;
        return bVal - aVal;
    });

    // ─── Header ───
    let headHTML = '<tr>';
    headHTML += '<th style="min-width:40px"></th>';  // checkbox
    headHTML += '<th class="col-campaign">CAMPAIGN</th>';
    headHTML += '<th class="col-status">STATUS</th>';
    headHTML += '<th class="col-budget">BUDGET</th>';
    headHTML += '<th class="col-bid">BID</th>';
    headHTML += '<th class="col-auto">AUTO</th>';

    dateColumns.forEach(date => {
        headHTML += `<th class="date-header">${fmtDateHeader(date)}</th>`;
    });

    headHTML += '<th class="col-total">TOTAL</th>';
    headHTML += '</tr>';
    head.innerHTML = headHTML;

    // ─── Body ───
    let bodyHTML = '';
    filtered.forEach(c => {
        // Compute total
        let totalVal = computeTotal(c);

        // Main campaign row
        const isExpanded = expandedCampaigns.has(c.id);
        bodyHTML += `<tr data-campaign-id="${c.id}">`;
        bodyHTML += `<td class="col-checkbox">
            <input type="checkbox" class="row-checkbox">
            <button class="expand-btn ${isExpanded ? 'expanded' : ''}" onclick="toggleExpand('${c.id}')">▶</button>
        </td>`;
        bodyHTML += `<td class="col-campaign-cell">
            <span class="campaign-icon" title="Play">▶</span>
            ${c.name}
            <button class="launch-icon-btn" title="Launch / Duplicate Campaign">🚀</button>
        </td>`;
        bodyHTML += `<td><button class="status-toggle ${c.status ? '' : 'off'}" onclick="toggleStatus('${c.id}', this)"></button></td>`;
        bodyHTML += `<td class="budget-val" data-cid="${c.id}" onclick="editBudget(this, '${c.id}')">
            <span class="budget-display">$${c.budget}</span>
        </td>`;
        bodyHTML += `<td class="bid-val">$${c.bid.toFixed(2)}</td>`;
        bodyHTML += `<td>${c.auto ? '<span class="auto-icon" title="Auto-bidding enabled">⚡</span>' : ''}</td>`;

        // Date columns
        dateColumns.forEach(date => {
            const val = computeDailyMetric(c, date);
            const cellClass = val !== null ? getCellClass(val, currentMetric) : 'cell-nodata';
            const display = val !== null ? fmtVal(val, currentMetric) : '-';
            bodyHTML += `<td class="${cellClass}" data-campaign="${c.id}" data-date="${date}">${display}</td>`;
        });

        // Total
        const totalClass = totalVal >= 0 ? 'cell-profit-mid' : 'cell-loss-mid';
        bodyHTML += `<td class="cell-total ${totalClass}">${fmtVal(totalVal, currentMetric)}</td>`;
        bodyHTML += '</tr>';

        // Expanded hourly sub-rows
        if (isExpanded) {
            for (let h = 0; h < 24; h++) {
                const hData = c.hourly[h];
                const hVal = hData ? getHourlyVal(hData, currentMetric) : null;
                bodyHTML += `<tr class="sub-row" data-parent="${c.id}">`;
                bodyHTML += `<td class="col-checkbox"></td>`;
                bodyHTML += `<td class="col-campaign-cell">
                    <span class="hour-label">
                        <span class="expand-icon">▶</span>
                        └─ ${fmtTime(h)}
                    </span>
                </td>`;
                bodyHTML += '<td></td><td></td><td></td><td></td>';

                // Date columns for hourly — show only first date column
                dateColumns.forEach((date, idx) => {
                    if (idx === 0 && hVal !== null) {
                        const cellClass = getCellClass(hVal, currentMetric);
                        bodyHTML += `<td class="${cellClass}" data-campaign="${c.id}" data-hour="${h}">${fmtVal(hVal, currentMetric)}</td>`;
                    } else {
                        bodyHTML += '<td class="cell-nodata">-</td>';
                    }
                });

                // Hourly total
                const hourTotal = hData ? +(hData.earned - hData.spend).toFixed(2) : 0;
                const hourTotalClass = hourTotal >= 0 ? 'cell-profit-low' : 'cell-loss-low';
                bodyHTML += `<td class="${hourTotalClass}" style="font-size:0.78rem">${hourTotal.toFixed(2)}</td>`;
                bodyHTML += '</tr>';
            }
        }
    });

    body.innerHTML = bodyHTML;

    // ─── Tooltip ───
    setupTooltips();
}

function computeTotal(c) {
    // Only sum up the stats for days visible in the current dashboard range (dateColumns)
    let spend = 0, revenue = 0, profit = 0, clicks = 0, conv = 0;

    dateColumns.forEach(date => {
        const d = c.daily[date];
        if (d) {
            spend += d.spend;
            revenue += d.revenue;
            profit += d.profit;
            clicks += d.clicks;
            conv += d.conv;
        }
    });

    switch (currentMetric) {
        case 'profit': return profit;
        case 'spend': return spend;
        case 'revenue': return revenue;
        case 'roi': return spend > 0 ? (profit / spend) * 100 : 0;
        case 'rpc': return clicks > 0 ? revenue / clicks : 0;
        case 'cpx': return conv > 0 ? spend / conv : 0;
        default: return 0;
    }
}

function computeDailyMetric(c, date) {
    const d = c.daily[date];
    if (!d) return null;

    switch (currentMetric) {
        case 'profit': return d.profit;
        case 'spend': return d.spend;
        case 'revenue': return d.revenue;
        case 'roi': return d.spend > 0 ? Math.round((d.profit / d.spend) * 100) : 0;
        case 'rpc': return d.clicks > 0 ? d.revenue / d.clicks : 0;
        case 'cpx': return d.conv > 0 ? d.spend / d.conv : 0;
        default: return 0;
    }
}

// ─── Expand / Collapse ───
function toggleExpand(campaignId) {
    if (expandedCampaigns.has(campaignId)) {
        expandedCampaigns.delete(campaignId);
    } else {
        expandedCampaigns.add(campaignId);
    }
    renderHeatmapTable();
}

// ─── Status Toggle ───
function toggleStatus(campaignId, el) {
    const c = campaigns.find(x => x.id === campaignId);
    if (c) {
        c.status = !c.status;
        el.classList.toggle('off');
    }
}

// ─── Inline Budget Edit ───
function editBudget(td, campaignId) {
    // Don't create a duplicate input if already editing
    if (td.querySelector('input')) return;

    const c = campaigns.find(x => x.id === campaignId);
    if (!c) return;

    const currentVal = c.budget;
    const span = td.querySelector('.budget-display');

    // Hide the display span and insert an input
    span.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'budget-edit-input';
    input.value = currentVal;
    input.min = 1;
    input.step = 0.5;
    td.appendChild(input);
    input.focus();
    input.select();

    const save = () => {
        const newVal = parseFloat(input.value);
        if (!isNaN(newVal) && newVal > 0 && newVal !== currentVal) {
            c.budget = newVal;
            span.textContent = '$' + newVal;
            td.classList.add('budget-saved');
            setTimeout(() => td.classList.remove('budget-saved'), 1000);

            // Sync to launcher panel if open
            const launcherBudget = document.getElementById('tsBudget');
            if (launcherBudget && launcherSourceCampaign && launcherSourceCampaign.id === campaignId) {
                launcherBudget.value = newVal;
            }
        }
        input.remove();
        span.style.display = '';
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { input.remove(); span.style.display = ''; }
    });

    // Stop click from propagating to parent row
    input.addEventListener('click', (e) => e.stopPropagation());
}

// ─── Tooltips ───
function setupTooltips() {
    const tooltip = document.getElementById('tooltip');
    const body = document.getElementById('heatmapBody');

    body.querySelectorAll('td[data-campaign]').forEach(td => {
        td.addEventListener('mouseenter', () => {
            const cId = td.dataset.campaign;
            const c = campaigns.find(x => x.id === cId);
            if (!c) return;

            const hour = td.dataset.hour !== undefined ? parseInt(td.dataset.hour) : null;
            const date = td.dataset.date;

            if (hour !== null) {
                const hData = c.hourly[hour];
                if (!hData) return;

                const cpa = hData.conv > 0 ? (hData.spend / hData.conv).toFixed(2) : '0.00';
                const cpc = hData.clicks > 0 ? (hData.spend / hData.clicks).toFixed(2) : '0.00';
                const profit = (hData.earned - hData.spend);
                const isProfit = profit >= 0;

                tooltip.innerHTML = `
                    <div class="tooltip-header">${fmtTime(hour)}</div>
                    <div class="tooltip-body">
                        <div class="tooltip-row">
                            <span class="tooltip-label">Spend:</span>
                            <span class="tooltip-value">$${hData.spend.toFixed(2)}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Revenue:</span>
                            <span class="tooltip-value">$${hData.earned.toFixed(2)}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Profit:</span>
                            <span class="tooltip-value ${isProfit ? 'positive' : 'negative'}">$${profit.toFixed(2)}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">ROI:</span>
                            <span class="tooltip-value ${hData.roi >= 0 ? 'positive' : 'negative'}">${hData.roi}%</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">RPC:</span>
                            <span class="tooltip-value">$${hData.rpc.toFixed(2)}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">CPA:</span>
                            <span class="tooltip-value">$${cpa}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">CPC:</span>
                            <span class="tooltip-value">$${cpc}</span>
                        </div>
                    </div>`;
            } else if (date) {
                const d = c.daily[date];
                if (!d) return;

                const cpa = d.conv > 0 ? (d.spend / d.conv).toFixed(2) : '0.00';
                const cpc = d.clicks > 0 ? (d.spend / d.clicks).toFixed(2) : '0.00';
                const roi = d.spend > 0 ? Math.round((d.profit / d.spend) * 100) : 0;
                const rpc = d.clicks > 0 ? (d.revenue / d.clicks).toFixed(2) : '0.00';
                const isProfit = d.profit >= 0;
                const dateHeader = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                tooltip.innerHTML = `
                    <div class="tooltip-header">${dateHeader}</div>
                    <div class="tooltip-body">
                        <div class="tooltip-row">
                            <span class="tooltip-label">Spend:</span>
                            <span class="tooltip-value">$${d.spend.toFixed(2)}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Revenue:</span>
                            <span class="tooltip-value">$${d.revenue.toFixed(2)}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">Profit:</span>
                            <span class="tooltip-value ${isProfit ? 'positive' : 'negative'}">$${d.profit.toFixed(2)}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">ROI:</span>
                            <span class="tooltip-value ${roi >= 0 ? 'positive' : 'negative'}">${roi}%</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">RPC:</span>
                            <span class="tooltip-value">$${rpc}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">CPA:</span>
                            <span class="tooltip-value">$${cpa}</span>
                        </div>
                        <div class="tooltip-row">
                            <span class="tooltip-label">CPC:</span>
                            <span class="tooltip-value">$${cpc}</span>
                        </div>
                    </div>`;
            }

            tooltip.classList.add('show');
        });

        td.addEventListener('mousemove', (e) => {
            const x = Math.min(e.clientX + 12, window.innerWidth - 300);
            const y = Math.min(e.clientY + 12, window.innerHeight - 120);
            tooltip.style.left = x + 'px';
            tooltip.style.top = y + 'px';
        });

        td.addEventListener('mouseleave', () => {
            tooltip.classList.remove('show');
        });
    });
}

// ─── Export CSV ───
function exportCSV() {
    let csv = 'Campaign,Status,Budget,Bid,Auto';
    dateColumns.forEach(d => csv += ',' + d);
    csv += ',Total\n';

    campaigns.forEach(c => {
        csv += `"${c.name}",${c.status ? 'ON' : 'OFF'},$${c.budget},$${c.bid.toFixed(2)},${c.auto ? 'Yes' : 'No'}`;
        dateColumns.forEach(d => {
            csv += ',' + (c.daily[d] !== undefined ? c.daily[d].toFixed(2) : '');
        });
        const total = Object.values(c.daily).reduce((s, v) => s + v, 0);
        csv += ',' + total.toFixed(2);
        csv += '\n';
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `campaign_heatmap_${currentMetric}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ─── URL Status Panel ───
function renderURLStatusPanel() {
    const grid = document.getElementById('urlStatusGrid');
    const statuses = ['ok', 'ok', 'ok', 'error', 'ok', 'pending', 'ok', 'ok', 'ok', 'ok', 'error', 'ok', 'ok', 'ok', 'ok'];

    let html = '';
    campaigns.forEach((c, i) => {
        const status = statuses[i % statuses.length];
        const statusLabel = status === 'ok' ? '200 OK' : status === 'error' ? '404 ERROR' : 'PENDING';
        html += `
            <div class="url-card">
                <div class="url-card-header">
                    <span class="url-card-name">${c.name}</span>
                    <span class="url-status-badge ${status}">${statusLabel}</span>
                </div>
                <div class="url-card-url">https://campaigns.maximizer.io/c/${c.id}/landing</div>
            </div>`;
    });
    grid.innerHTML = html;
}

// ═══════════════════════════════════════════════
// ─── Advanced Filters System ───
// ═══════════════════════════════════════════════

// Field definitions for condition builder
const AF_FIELDS = [
    {
        group: 'Campaign', options: [
            { value: 'campaignName', label: 'Campaign Name' },
            { value: 'user', label: 'User' },
            { value: 'country', label: 'Country' },
            { value: 'status', label: 'Status' },
        ]
    },
    {
        group: 'Metrics', options: [
            { value: 'profit', label: 'Profit ($)' },
            { value: 'spend', label: 'Spend ($)' },
            { value: 'revenue', label: 'Revenue ($)' },
            { value: 'roi', label: 'ROI (%)' },
            { value: 'rpc', label: 'RPC ($)' },
            { value: 'cpa', label: 'CPA ($)' },
        ]
    },
    {
        group: 'Budget', options: [
            { value: 'budget', label: 'Budget ($)' },
        ]
    },
    {
        group: 'Time', options: [
            { value: 'hour', label: 'Hour (0-23)' },
        ]
    },
];

const AF_OPERATORS = [
    { value: 'gt', label: 'Greater than' },
    { value: 'gte', label: 'Greater or equal' },
    { value: 'lt', label: 'Less than' },
    { value: 'lte', label: 'Less or equal' },
    { value: 'eq', label: 'Equal to' },
    { value: 'neq', label: 'Not equal to' },
    { value: 'contains', label: 'Contains' },
    { value: 'notcontains', label: 'Not contains' },
];

// Filter presets
const AF_PRESETS = {
    highROI: [
        [{ field: 'roi', op: 'gt', value: '50' }]
    ],
    bigSpend: [
        [{ field: 'spend', op: 'gt', value: '10' }]
    ],
    lowCPA: [
        [{ field: 'cpa', op: 'lt', value: '1' }, { field: 'profit', op: 'gt', value: '0' }]
    ],
};

// State: array of OR groups, each is an array of AND conditions
let afConditions = [
    [{ field: 'roi', op: 'gt', value: '50' }]
];

let advancedFilterActive = false;

// Open modal
function openAdvancedFilters() {
    document.getElementById('afOverlay').classList.add('open');
    renderAFConditions();
    setupAFListeners();
}

// Close modal
function closeAdvancedFilters() {
    document.getElementById('afOverlay').classList.remove('open');
}

// Build field <select> as HTML with optgroups
function buildFieldOptions(selected) {
    let html = '<option value="">Select Field...</option>';
    AF_FIELDS.forEach(g => {
        html += `<optgroup label="${g.group}">`;
        g.options.forEach(o => {
            html += `<option value="${o.value}" ${selected === o.value ? 'selected' : ''}>${o.label}</option>`;
        });
        html += '</optgroup>';
    });
    return html;
}

// Build operator <select>
function buildOpOptions(selected) {
    return AF_OPERATORS.map(o =>
        `<option value="${o.value}" ${selected === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');
}

// Render all condition groups
function renderAFConditions() {
    const container = document.getElementById('afConditionsContainer');
    let html = '';

    afConditions.forEach((group, gi) => {
        html += `<div class="af-or-group" data-gi="${gi}">`;
        html += `<div class="af-and-block">`;
        html += `<div class="af-and-title">AND CONDITIONS</div>`;

        group.forEach((cond, ci) => {
            html += `<div class="af-condition-row" data-gi="${gi}" data-ci="${ci}">`;
            html += `<select class="af-select af-field-select" data-gi="${gi}" data-ci="${ci}">${buildFieldOptions(cond.field)}</select>`;
            html += `<select class="af-select af-op-select" data-gi="${gi}" data-ci="${ci}">${buildOpOptions(cond.op)}</select>`;
            html += `<input type="text" class="af-value-input" data-gi="${gi}" data-ci="${ci}" value="${cond.value}" placeholder="Value">`;
            html += `<button class="af-del-btn" data-gi="${gi}" data-ci="${ci}" title="Remove condition">✕</button>`;
            html += `</div>`;
        });

        html += `<button class="af-add-condition" data-gi="${gi}">+ Add Condition</button>`;
        html += `</div></div>`;
    });

    container.innerHTML = html;

    // Attach listeners to new elements
    container.querySelectorAll('.af-field-select').forEach(sel => {
        sel.addEventListener('change', () => {
            const gi = +sel.dataset.gi, ci = +sel.dataset.ci;
            afConditions[gi][ci].field = sel.value;
        });
    });
    container.querySelectorAll('.af-op-select').forEach(sel => {
        sel.addEventListener('change', () => {
            const gi = +sel.dataset.gi, ci = +sel.dataset.ci;
            afConditions[gi][ci].op = sel.value;
        });
    });
    container.querySelectorAll('.af-value-input').forEach(inp => {
        inp.addEventListener('input', () => {
            const gi = +inp.dataset.gi, ci = +inp.dataset.ci;
            afConditions[gi][ci].value = inp.value;
        });
    });
    container.querySelectorAll('.af-del-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const gi = +btn.dataset.gi, ci = +btn.dataset.ci;
            afConditions[gi].splice(ci, 1);
            if (afConditions[gi].length === 0) {
                afConditions.splice(gi, 1);
            }
            if (afConditions.length === 0) {
                afConditions.push([{ field: '', op: 'gt', value: '' }]);
            }
            renderAFConditions();
        });
    });
    container.querySelectorAll('.af-add-condition').forEach(btn => {
        btn.addEventListener('click', () => {
            const gi = +btn.dataset.gi;
            afConditions[gi].push({ field: '', op: 'gt', value: '' });
            renderAFConditions();
        });
    });
}

// Setup footer listeners (only once)
let afListenersSet = false;
function setupAFListeners() {
    if (afListenersSet) return;
    afListenersSet = true;

    document.getElementById('afClose').addEventListener('click', closeAdvancedFilters);
    document.getElementById('afOverlay').addEventListener('click', (e) => {
        if (e.target === document.getElementById('afOverlay')) closeAdvancedFilters();
    });

    document.getElementById('afAddOrGroup').addEventListener('click', () => {
        afConditions.push([{ field: '', op: 'gt', value: '' }]);
        renderAFConditions();
    });

    document.getElementById('afClearAll').addEventListener('click', () => {
        afConditions = [[{ field: '', op: 'gt', value: '' }]];
        advancedFilterActive = false;
        renderAFConditions();
        renderHeatmapTable();
    });

    document.getElementById('afLoadPreset').addEventListener('change', (e) => {
        const key = e.target.value;
        if (AF_PRESETS[key]) {
            afConditions = JSON.parse(JSON.stringify(AF_PRESETS[key]));
            renderAFConditions();
        }
        e.target.value = '';
    });

    document.getElementById('afSavePreset').addEventListener('click', () => {
        const name = prompt('Enter a name for this preset:');
        if (name) {
            alert(`Preset "${name}" saved! (${afConditions.length} group(s), ${afConditions.reduce((s, g) => s + g.length, 0)} condition(s))`);
        }
    });

    document.getElementById('afApplyFilters').addEventListener('click', () => {
        advancedFilterActive = true;
        renderHeatmapTable();
        closeAdvancedFilters();
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.getElementById('afOverlay').classList.contains('open')) {
            closeAdvancedFilters();
        }
    });
}

// ─── Apply Advanced Filters to campaign list ───
function applyAdvancedFilters(campaignList) {
    if (!advancedFilterActive) return campaignList;

    return campaignList.filter(c => {
        // OR logic: at least one group must pass
        return afConditions.some(group => {
            // AND logic: all conditions in group must pass
            return group.every(cond => {
                if (!cond.field || cond.value === '') return true; // skip empty
                return evaluateCondition(c, cond);
            });
        });
    });
}

function evaluateCondition(c, cond) {
    let actual;

    // Get actual value based on field
    switch (cond.field) {
        case 'campaignName': actual = c.name; break;
        case 'user': actual = 'yash'; break;
        case 'country': actual = c.country; break;
        case 'status': actual = c.status ? 'on' : 'off'; break;
        case 'profit': actual = Object.values(c.daily).reduce((s, v) => s + v, 0); break;
        case 'spend': actual = Object.values(c.hourly).reduce((s, h) => s + h.spend, 0); break;
        case 'revenue': actual = Object.values(c.hourly).reduce((s, h) => s + h.earned, 0); break;
        case 'roi': {
            const sp = Object.values(c.hourly).reduce((s, h) => s + h.spend, 0);
            const ea = Object.values(c.hourly).reduce((s, h) => s + h.earned, 0);
            actual = sp > 0 ? ((ea - sp) / sp) * 100 : 0;
            break;
        }
        case 'rpc': {
            const cl = Object.values(c.hourly).reduce((s, h) => s + h.clicks, 0);
            const ea = Object.values(c.hourly).reduce((s, h) => s + h.earned, 0);
            actual = cl > 0 ? ea / cl : 0;
            break;
        }
        case 'cpa': {
            const cv = Object.values(c.hourly).reduce((s, h) => s + h.conv, 0);
            const sp = Object.values(c.hourly).reduce((s, h) => s + h.spend, 0);
            actual = cv > 0 ? sp / cv : 0;
            break;
        }
        case 'budget': actual = c.budget; break;
        case 'hour': actual = new Date().getHours(); break;
        default: return true;
    }

    const target = cond.value;

    // String comparisons
    if (cond.op === 'contains') {
        return String(actual).toLowerCase().includes(target.toLowerCase());
    }
    if (cond.op === 'notcontains') {
        return !String(actual).toLowerCase().includes(target.toLowerCase());
    }

    // Numeric comparisons
    const numActual = parseFloat(actual);
    const numTarget = parseFloat(target);
    if (isNaN(numActual) || isNaN(numTarget)) {
        return String(actual).toLowerCase() === target.toLowerCase();
    }

    switch (cond.op) {
        case 'gt': return numActual > numTarget;
        case 'gte': return numActual >= numTarget;
        case 'lt': return numActual < numTarget;
        case 'lte': return numActual <= numTarget;
        case 'eq': return numActual === numTarget;
        case 'neq': return numActual !== numTarget;
        default: return true;
    }
}

/* ============================================
   CAMPAIGN LAUNCHER (Duplicate & Launch Feature)
   ============================================ */

let launcherSourceCampaign = null;
let copyRowCount = 0;

// ─── Context Menu Setup ───
function setupLauncher() {
    const ctxMenu = document.getElementById('campCtxMenu');
    const overlay = document.getElementById('launcherOverlay');

    // Hide context menu on any click outside it
    document.addEventListener('click', (e) => {
        if (!ctxMenu.contains(e.target)) {
            ctxMenu.classList.remove('visible');
        }
    });

    // Open launcher when "Duplicate Campaign" is clicked
    document.getElementById('ctxDuplicateBtn').addEventListener('click', () => {
        ctxMenu.classList.remove('visible');
        if (launcherSourceCampaign) openLauncher(launcherSourceCampaign);
    });

    // Close launcher
    document.getElementById('launcherCloseBtn').addEventListener('click', closeLauncher);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeLauncher();
    });

    // Generate copies button
    document.getElementById('ngGenerateBtn').addEventListener('click', generateCopies);

    // Add row button
    document.getElementById('addCopyRowBtn').addEventListener('click', () => addCopyRow());

    // Apply-to-All pills
    document.querySelectorAll('.apply-btn-pill[data-field]').forEach(btn => {
        btn.addEventListener('click', () => applyToAll(btn.dataset.field));
    });

    // Bulk AI button
    document.getElementById('bulkAiBtn').addEventListener('click', () => {
        showToast('🤖 Bulk AI is generating content for all rows...', '#7c3aed');
        setTimeout(() => {
            document.querySelectorAll('#copiesTableBody tr').forEach(row => {
                const nameCell = row.querySelector('.col-name input');
                if (nameCell && nameCell.value) {
                    const base = nameCell.value.split('-').slice(0, 3).join(' ');
                    row.querySelector('.col-head input').value = `Discover ${base} — Limited Time`;
                    row.querySelector('.col-body input').value = `${base} opens the door to new possibilities for you and your family.`;
                    row.querySelector('.col-query input').value = `${base.toLowerCase().replace(/\s+/g, ' ')} guide`;
                }
            });
            showToast('✅ Bulk AI generated content for all rows!');
        }, 1200);
    });

    // Footer buttons
    document.getElementById('launcherPreviewBtn').addEventListener('click', previewCampaigns);
    document.getElementById('launcherResetBtn').addEventListener('click', resetLauncher);
    document.getElementById('launcherSubmitBtn').addEventListener('click', submitToMaximizer);
}

// ─── Show context menu on campaign row click ───
function showCampaignContextMenu(campaign, x, y) {
    launcherSourceCampaign = campaign;

    // Derive creative fields from campaign name (or use real API data if available)
    const nameParts = campaign.name.split('-');
    const topic = nameParts.slice(2, 5).join(' ').replace(/MXM.*/, '').trim();
    const headline = campaign.headline || `${topic} — Top Results for You`;
    const primaryText = campaign.primaryText || `${topic} opens the door to new opportunities. Find out more today.`;
    const query = campaign.query || `your complete guide to ${topic.toLowerCase()}`;

    document.getElementById('ctxHeadline').textContent = headline;
    document.getElementById('ctxPrimaryText').textContent = primaryText;
    document.getElementById('ctxQuery').textContent = query;

    const menu = document.getElementById('campCtxMenu');
    menu.style.left = Math.min(x, window.innerWidth - 300) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
    menu.classList.add('visible');
}

// ─── Open Launcher Panel ───
function openLauncher(campaign) {
    launcherSourceCampaign = campaign;
    copyRowCount = 0;

    document.getElementById('launcherSourceName').textContent = campaign.name;
    document.getElementById('ngBaseName').value = campaign.name;
    document.getElementById('ngNumber').value = 1;
    document.getElementById('ngSuffix').value = 'dup';
    document.getElementById('tsBudget').value = campaign.budget || 5;

    // Clear existing rows
    document.getElementById('copiesTableBody').innerHTML = '';

    // Add the initial row pre-filled from this campaign
    const nameParts = campaign.name.split('-');
    const topic = nameParts.slice(2, 5).join(' ').replace(/MXM.*/, '').trim();
    addCopyRow({
        name: campaign.name,
        query: `your complete guide to ${topic.toLowerCase()}`,
        headline: `${topic} — Top Results for You`,
        primaryText: `${topic} opens the door to new opportunities.`,
        budget: campaign.budget || 5,
        type: 'Adset',
        land: 'EN',
        feed: '-- No Feed --',
        image: ''
    });

    document.getElementById('launcherOverlay').classList.add('open');

    // Auto-load Meta account data if not yet loaded
    const adSel = document.getElementById('tsAdAccount');
    const alreadyLoaded = adSel.options.length > 0 && !adSel.options[0].text.includes('Loading') && !adSel.options[0].text.includes('Select');
    if (!alreadyLoaded) {
        loadMetaData();
    }
}

// ─── Close Launcher ───
function closeLauncher() {
    document.getElementById('launcherOverlay').classList.remove('open');
    launcherSourceCampaign = null;
}

// ─── Generate N Copy Rows ───
function generateCopies() {
    const baseName = document.getElementById('ngBaseName').value.trim();
    const num = parseInt(document.getElementById('ngNumber').value) || 1;
    const suffix = document.getElementById('ngSuffix').value.trim();
    const budget = document.getElementById('tsBudget').value;

    if (!baseName) {
        showToast('⚠️ Please enter a Base Campaign Name', '#e5a020');
        return;
    }

    // Clear existing rows
    document.getElementById('copiesTableBody').innerHTML = '';
    copyRowCount = 0;

    for (let i = 1; i <= num; i++) {
        const finalName = `${baseName}${suffix ? `-${suffix}` : ''}-${i}`;
        const nameParts = baseName.split('-');
        const topic = nameParts.slice(2, 5).join(' ').replace(/MXM.*/, '').trim();
        addCopyRow({
            name: finalName,
            query: `your complete guide to ${topic.toLowerCase()}`,
            headline: `${topic} — Top Results for You`,
            primaryText: `${topic} opens the door to new opportunities.`,
            budget,
            type: 'Adset',
            land: 'EN',
            feed: '-- No Feed --',
            image: ''
        });
    }
}

// ─── Add a single editable copy row ───
function addCopyRow(data = {}) {
    copyRowCount++;
    const n = copyRowCount;
    const typeOptions = ['Adset', 'CBO', 'ABO'].map(o =>
        `<option ${(data.type || 'Adset') === o ? 'selected' : ''}>${o}</option>`
    ).join('');
    const landOptions = ['EN', 'ES', 'FR', 'DE', 'IT', 'PT', 'NL'].map(o =>
        `<option ${(data.land || 'EN') === o ? 'selected' : ''}>${o}</option>`
    ).join('');
    const feedOptions = ['-- No Feed --', 'Feed A', 'Feed B', 'Feed C'].map(o =>
        `<option ${(data.feed || '-- No Feed --') === o ? 'selected' : ''}>${o}</option>`
    ).join('');

    const imgHtml = data.image
        ? `<div class="img-thumb-wrap"><img class="img-thumb" src="${data.image}" onerror="this.parentNode.innerHTML='<div class=img-placeholder>📷</div>'"><button class="row-del-btn" style="font-size:0.7rem;" title="Change image">🖼️</button></div>`
        : `<div class="img-thumb-wrap"><div class="img-placeholder">📷</div><button class="row-del-btn" style="font-size:0.7rem;" title="Set image url">🖼️</button></div>`;

    const tr = document.createElement('tr');
    tr.dataset.rowId = n;
    tr.innerHTML = `
        <td class="col-num">${n}</td>
        <td class="col-name"><input type="text" value="${data.name || ''}" placeholder="Campaign name..."></td>
        <td class="col-query"><input type="text" value="${data.query || ''}" placeholder="Query..."></td>
        <td class="col-head"><input type="text" value="${data.headline || ''}" placeholder="Headline..."></td>
        <td class="col-body"><input type="text" value="${data.primaryText || ''}" placeholder="Primary text..."></td>
        <td class="col-bud"><input type="number" value="${data.budget || 5}" min="1" max="100" step="0.5"></td>
        <td class="col-type"><select>${typeOptions}</select></td>
        <td class="col-land"><select>${landOptions}</select></td>
        <td class="col-feed"><select>${feedOptions}</select></td>
        <td class="col-img">${imgHtml}</td>
        <td><button class="row-del-btn" onclick="this.closest('tr').remove(); renumberRows();">🗑️</button></td>
    `;
    document.getElementById('copiesTableBody').appendChild(tr);
}

// ─── Renumber rows after deletion ───
function renumberRows() {
    document.querySelectorAll('#copiesTableBody tr').forEach((tr, i) => {
        tr.querySelector('.col-num').textContent = i + 1;
    });
}

// ─── Apply to All ───
function applyToAll(field) {
    const rows = document.querySelectorAll('#copiesTableBody tr');
    if (rows.length === 0) return;

    const fieldLabels = {
        budget: 'Budget ($)',
        bidStrategy: 'Bid Strategy',
        query: 'Query text',
        headline: 'Headline',
        primaryText: 'Primary text',
        image: 'Image URL'
    };

    const val = prompt(`Enter value to apply to all rows — ${fieldLabels[field] || field}:`);
    if (val === null) return;

    rows.forEach(row => {
        const inputs = row.querySelectorAll('input, select');
        const colMap = { budget: 5, bidStrategy: 6, query: 2, headline: 3, primaryText: 4, image: 9 };
        const cells = row.querySelectorAll('td');
        const targetCell = cells[colMap[field]];
        if (!targetCell) return;
        const inp = targetCell.querySelector('input, select');
        if (inp) inp.value = val;
    });

    showToast(`✅ Applied "${val}" to all rows`);
}

// ─── Preview ───
function previewCampaigns() {
    const rows = document.querySelectorAll('#copiesTableBody tr');
    if (rows.length === 0) {
        showToast('⚠️ No campaign rows to preview!', '#e5a020');
        return;
    }
    const data = [...rows].map((row, i) => {
        const inputs = row.querySelectorAll('input, select');
        return `[${i + 1}] ${inputs[0]?.value || '—'} | $${inputs[4]?.value || '—'}`;
    }).join('\n');
    alert(`Campaign Preview:\n\n${data}`);
}

// ─── Reset ───
function resetLauncher() {
    if (!confirm('Reset all campaign rows?')) return;
    document.getElementById('copiesTableBody').innerHTML = '';
    copyRowCount = 0;
    if (launcherSourceCampaign) openLauncher(launcherSourceCampaign);
}

// ─── Load Meta API Data into dropdowns ───
async function loadMetaData() {
    const adAccountSel = document.getElementById('tsAdAccount');
    const pageSel = document.getElementById('tsFbPage');
    const pixelSel = document.getElementById('tsPixel');

    // Set loading state
    adAccountSel.innerHTML = '<option>⏳ Loading...</option>';
    pageSel.innerHTML = '<option>⏳ Loading...</option>';
    pixelSel.innerHTML = '<option>⏳ Loading...</option>';

    try {
        // Fetch all three in parallel
        const [acResp, pgResp] = await Promise.all([
            fetch('/meta/adaccounts').then(r => r.json()),
            fetch('/meta/pages').then(r => r.json())
        ]);

        // Populate Ad Accounts
        if (acResp.accounts && acResp.accounts.length > 0) {
            adAccountSel.innerHTML = acResp.accounts.map(a =>
                `<option value="${a.id}">${a.name} (${a.id}) — ${a.currency || 'USD'}</option>`
            ).join('');
        } else {
            adAccountSel.innerHTML = '<option value="">⚠️ No ad accounts found</option>';
            if (acResp.error) console.warn('[Meta] Ad accounts error:', acResp.error);
        }

        // Populate Pages
        if (pgResp.pages && pgResp.pages.length > 0) {
            pageSel.innerHTML = '<option value="">-- Select page --</option>' +
                pgResp.pages.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        } else {
            pageSel.innerHTML = '<option value="">No pages found</option>';
        }

        // Fetch pixels for the first ad account
        const firstAccount = adAccountSel.value;
        if (firstAccount) {
            const pxResp = await fetch(`/meta/pixels?ad_account=${firstAccount}`).then(r => r.json());
            if (pxResp.pixels && pxResp.pixels.length > 0) {
                pixelSel.innerHTML = '<option value="">-- Select pixel --</option>' +
                    pxResp.pixels.map(p => `<option value="${p.id}">${p.name} (${p.id})</option>`).join('');
            } else {
                pixelSel.innerHTML = '<option value="">No pixels found</option>';
            }
        }

        // When ad account changes, reload pixels
        adAccountSel.addEventListener('change', async () => {
            pixelSel.innerHTML = '<option>⏳ Loading pixels...</option>';
            const pxResp = await fetch(`/meta/pixels?ad_account=${adAccountSel.value}`).then(r => r.json());
            pixelSel.innerHTML = pxResp.pixels && pxResp.pixels.length
                ? '<option value="">-- Select pixel --</option>' + pxResp.pixels.map(p => `<option value="${p.id}">${p.name}</option>`).join('')
                : '<option value="">No pixels found</option>';
        });

        showToast('✅ Meta account data loaded!');
    } catch (err) {
        console.error('[Meta] Failed to load account data:', err);
        adAccountSel.innerHTML = '<option value="">❌ Failed to load — check server</option>';
        pageSel.innerHTML = '<option value="">—</option>';
        pixelSel.innerHTML = '<option value="">—</option>';
        showToast('❌ Could not connect to Meta API. Is server running?', '#ef4444');
    }
}

// ─── Submit to Maximizer (Real Meta API) ───
async function submitToMaximizer() {
    const rows = document.querySelectorAll('#copiesTableBody tr');
    if (rows.length === 0) {
        showToast('⚠️ Add at least one campaign row before submitting!', '#e5a020');
        return;
    }

    const adAccount = document.getElementById('tsAdAccount').value;
    if (!adAccount) {
        showToast('⚠️ Please select an Ad Account first!', '#e5a020');
        return;
    }

    const bidStrategy = document.getElementById('tsBidStrategy').value;
    const bidCap = document.getElementById('tsBidCap').value;
    const objective = document.getElementById('tsCampaignObjective')?.value || 'OUTCOME_TRAFFIC';

    const campaignPayload = [...rows].map(row => {
        const cells = row.querySelectorAll('td');
        const getInput = (n) => cells[n]?.querySelector('input, select')?.value || '';
        return {
            name: getInput(1),
            query: getInput(2),
            headline: getInput(3),
            primaryText: getInput(4),
            budget: parseFloat(getInput(5)) || 5,
            adAccount,
            bidStrategy,
            bidCap,
            objective,
            status: 'PAUSED',
        };
    }).filter(c => c.name.trim());

    if (campaignPayload.length === 0) {
        showToast('⚠️ Fill in at least one campaign name!', '#e5a020');
        return;
    }

    const submitBtn = document.getElementById('launcherSubmitBtn');
    const origText = submitBtn.textContent;
    submitBtn.textContent = '⏳ Creating campaigns...';
    submitBtn.disabled = true;

    try {
        const resp = await fetch('/meta/campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaigns: campaignPayload })
        });

        const result = await resp.json();

        if (resp.ok && result.success) {
            const ids = result.results.map(r => r.id).filter(Boolean).join(', ');
            showToast(`✅ ${result.results.length} campaign(s) created on Meta! IDs: ${ids}`);
            console.log('[Meta] Campaign creation results:', result.results);
            setTimeout(closeLauncher, 3000);
        } else {
            const errMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
            showToast(`❌ Meta API error: ${errMsg.substring(0, 100)}`, '#ef4444');
            console.error('[Meta Error]', result);
        }
    } catch (err) {
        showToast(`❌ Network error: ${err.message}`, '#ef4444');
        console.error('[Submit Error]', err);
    } finally {
        submitBtn.textContent = origText;
        submitBtn.disabled = false;
    }
}

// ─── Toast helper ───
let toastTimeout;
function showToast(message, color = '#22c55e') {
    let toast = document.getElementById('launcherToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'launcherToast';
        toast.className = 'launcher-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.background = color;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Hook up launcher to campaign rows ───
// Override renderHeatmapTable to inject the 🚀 button per row
const _origRenderHeatmapTable = renderHeatmapTable;
// We patch setupActions to also setup the launcher
const _origSetupActions = setupActions;

// Initialize launcher after DOM ready
document.addEventListener('DOMContentLoaded', () => {
    setupLauncher();
});

// ─── Wire right-click on campaign rows ───
document.addEventListener('contextmenu', (e) => {
    const td = e.target.closest('td.col-campaign-cell');
    if (!td) return;
    const tr = td.closest('tr[data-campaign-id]');
    if (!tr) return;
    const cId = tr.dataset.campaignId;
    const campaign = campaigns.find(c => c.id === cId);
    if (!campaign) return;
    e.preventDefault();
    showCampaignContextMenu(campaign, e.clientX, e.clientY);
});

// Wire 🚀 click on launch buttons (event delegation since rows are re-rendered)
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('launch-icon-btn')) {
        const tr = e.target.closest('tr[data-campaign-id]');
        if (!tr) return;
        const cId = tr.dataset.campaignId;
        const campaign = campaigns.find(c => c.id === cId);
        if (campaign) openLauncher(campaign);
    }
});

