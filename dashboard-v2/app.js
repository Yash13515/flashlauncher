// Maximizer Rocket Dashboard - Main Application Logic (Proxy Integrated)

const CONFIG = {
    API_KEY: '3s5Vp7jCkFeIiSv8p7o0OOIUcAhH9Bjpjw4LvZVRlBOMFMcsa9mj7VSdGKxi2D27',
    BASE_URL: '/api/v1/stats', // Use the existing server.py proxy to avoid CORS
    CURRENCY_SYMBOL: '$'
};

let dashboardData = [];
let performanceChart = null;
let currentMetric = 'profit';
let dateColumns = [];

// DOM Elements
const elements = {
    dateStart: document.getElementById('dateStart'),
    dateEnd: document.getElementById('dateEnd'),
    refreshBtn: document.getElementById('refreshData'),
    loadingOverlay: document.getElementById('loadingOverlay'),
    totalSpend: document.getElementById('totalSpend'),
    totalRevenue: document.getElementById('totalRevenue'),
    totalProfit: document.getElementById('totalProfit'),
    roiPercent: document.getElementById('roiPercent'),
    valRpc: document.getElementById('valRpc'),
    valCpa: document.getElementById('valCpa'),
    tableHead: document.getElementById('tableHead'),
    tableBody: document.getElementById('tableBody'),
    tableSearch: document.getElementById('tableSearch'),
    navDashboard: document.getElementById('navDashboard'),
    navCampaigns: document.getElementById('navCampaigns'),
    dashboardView: document.getElementById('dashboardView'),
    campaignsView: document.getElementById('campaignsView')
};

/**
 * Initialize Dashboard
 */
/**
 * Initialize Dashboard
 */
async function init() {
    // Set default dates
    const today = new Date();
    const pastDate = new Date();
    pastDate.setDate(today.getDate() - 3);

    if (elements.dateStart && elements.dateEnd) {
        elements.dateStart.value = pastDate.toISOString().split('T')[0];
        elements.dateEnd.value = today.toISOString().split('T')[0];
    }

    // Event Listeners
    if (elements.refreshBtn) elements.refreshBtn.addEventListener('click', updateDashboard);
    if (elements.tableSearch) elements.tableSearch.addEventListener('input', handleSearch);

    // Navigation Switcher
    if (elements.navDashboard) elements.navDashboard.addEventListener('click', () => switchView('dashboard'));
    if (elements.navCampaigns) elements.navCampaigns.addEventListener('click', () => switchView('campaigns'));

    // Metric Switcher
    document.querySelectorAll('.metric-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.metric-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMetric = btn.dataset.metric;
            renderTable(dashboardData); 
        });
    });

    // Initialize Launcher
    if (window.Launcher) window.Launcher.init();
    
    // Initialize Tooltip
    if (window.Tooltip) window.Tooltip.init();

    // Initial Data Load
    updateDashboard();
}

// Start the app
init();

/**
 * Switch Dashboard View
 */
function switchView(view) {
    if (view === 'dashboard') {
        elements.dashboardView.classList.remove('hidden-view');
        elements.campaignsView.classList.add('hidden-view');
        elements.navDashboard.classList.add('active');
        elements.navCampaigns.classList.remove('active');
    } else {
        elements.dashboardView.classList.add('hidden-view');
        elements.campaignsView.classList.remove('hidden-view');
        elements.navDashboard.classList.remove('active');
        elements.navCampaigns.classList.add('active');
    }
}

/**
 * Fetch and Update UI
 */
async function updateDashboard() {
    const startDate = elements.dateStart.value;
    const endDate = elements.dateEnd.value;

    if (!startDate || !endDate) {
        alert('Please select both start and end dates.');
        return;
    }

    showLoading(true);

    try {
        // Protocol check
        if (window.location.protocol === 'file:') {
            throw new Error('Protocol Error: You are opening the dashboard as a local file. Please open it via http://localhost:8080/dashboard-v2/index.html instead.');
        }

        // 1. Fetch Summary (Daily) for accurate Primary Numbers
        const summaryResponse = await fetchPerformanceData(startDate, endDate, false);
        const initialData = summaryResponse.results || [];
        
        // Use API-provided totals for absolute accuracy
        const totals = calculateTotals(summaryResponse); 
        updateKPICards(totals);
        updateChart(initialData);
        renderTable(initialData);

        // 2. Fetch Detailed Data (Hourly) and Refresh Table
        fetchPerformanceData(startDate, endDate, true).then(detailedResponse => {
            dashboardData = detailedResponse.results || [];
            // Re-render table with full data once background fetch is complete
            renderTable(dashboardData);
        });
        
    } catch (error) {
        console.error('Dashboard Update Error:', error);
        
        // Detailed error reporting
        const errorMsg = error.message.includes('Protocol Error') 
            ? error.message 
            : `Failed to fetch data from API (Status: ${error.message}).\n\n` +
              `1. Ensure "python server.py" is running.\n` +
              `2. Ensure you are using http://localhost:8080/dashboard-v2/index.html\n` +
              `3. Check the browser console (F12) for the specific error reason.`;
        
        alert(errorMsg);
    } finally {
        showLoading(false);
    }
}

/**
 * API Service (Using Proxy)
 */
async function fetchPerformanceData(dateStart, dateEnd, includeHour = false) {
    const dims = includeHour ? 'campaignName,date,hour' : 'campaignName,date';
    const limit = 15000; // Safer limit for Maximizer API
    let allResults = [];
    let currentPage = 1;
    let totalRecords = 0;

    async function fetchPage(page) {
        // Only add page param if page > 1 (and only if we're sure it's supported)
        const pageParam = page > 1 ? `&page=${page}` : '';
        const url = `${CONFIG.BASE_URL}?dateStart=${dateStart}&dateEnd=${dateEnd}&dimensions=${dims}&metrics=impressions,clicks,spend,conversions,revenue,profit&limit=${limit}${pageParam}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${CONFIG.API_KEY}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error(response.status);
        return await response.json();
    }

    try {
        const firstPage = await fetchPage(1);
        allResults = firstPage.results || [];
        totalRecords = firstPage.total || allResults.length;
        
        // Update sync info if possible
        if (elements.syncInfo) {
            elements.syncInfo.textContent = `Syncing: ${allResults.length} / ${totalRecords}...`;
        }

        // Fetch remaining pages if needed
        while (allResults.length < totalRecords) {
            currentPage++;
            const nextPage = await fetchPage(currentPage);
            const newResults = nextPage.results || [];
            if (newResults.length === 0) break; // Safety break
            allResults = allResults.concat(newResults);
            
            if (elements.syncInfo) {
                elements.syncInfo.textContent = `Syncing: ${allResults.length} / ${totalRecords}...`;
            }
        }

        return { results: allResults, totals: firstPage.totals, total: totalRecords };
    } catch (error) {
        console.error('Fetch Failed:', error);
        throw error;
    }
}

/**
 * Data Aggregation Logic
 */
function calculateTotals(apiData) {
    const results = apiData.results || [];
    const manualTotals = { spend: 0, revenue: 0, clicks: 0, conversions: 0, profit: 0 };

    results.forEach(item => {
        manualTotals.spend += parseMetricValue(item.spend);
        manualTotals.revenue += parseMetricValue(item.revenue);
        manualTotals.clicks += parseInt(item.clicks || 0);
        manualTotals.conversions += parseInt(item.conversions || 0);
        manualTotals.profit += parseMetricValue(item.profit || (parseMetricValue(item.revenue) - parseMetricValue(item.spend)));
    });

    // Prioritize API-level totals if they exist and are higher/more complete
    if (apiData.totals) {
        const t = apiData.totals;
        const apiSpend = parseMetricValue(t.spend);
        const apiRevenue = parseMetricValue(t.revenue);
        
        // If API totals are significantly higher than our row sum, use them (they represent the whole account)
        const finalSpend = Math.max(apiSpend, manualTotals.spend);
        const finalRevenue = Math.max(apiRevenue, manualTotals.revenue);
        const finalProfit = parseMetricValue(t.profit) || (finalRevenue - finalSpend);

        return {
            spend: finalSpend,
            revenue: finalRevenue,
            clicks: Math.max(parseInt(t.clicks || 0), manualTotals.clicks),
            conversions: Math.max(parseInt(t.conversions || 0), manualTotals.conversions),
            profit: finalProfit,
            roi: finalSpend > 0 ? (finalProfit / finalSpend) * 100 : 0,
            rpc: manualTotals.clicks > 0 ? finalRevenue / manualTotals.clicks : 0,
            cpa: manualTotals.conversions > 0 ? finalSpend / manualTotals.conversions : 0
        };
    }

    manualTotals.roi = manualTotals.spend > 0 ? (manualTotals.profit / manualTotals.spend) * 100 : 0;
    manualTotals.rpc = manualTotals.clicks > 0 ? (manualTotals.revenue / manualTotals.clicks) : 0;
    manualTotals.cpa = manualTotals.conversions > 0 ? (manualTotals.spend / manualTotals.conversions) : 0;

    return manualTotals;
}

/**
 * UI Updates - KPI Cards
 */
function updateKPICards(totals) {
    elements.totalSpend.textContent = formatCurrency(totals.spend);
    elements.totalRevenue.textContent = formatCurrency(totals.revenue);
    elements.totalProfit.textContent = formatCurrency(totals.profit);
    elements.roiPercent.textContent = totals.roi.toFixed(2) + '%';
    elements.valRpc.textContent = formatCurrency(totals.rpc, 3);
    elements.valCpa.textContent = formatCurrency(totals.cpa);

    // Dynamic coloring for Profit and ROI
    elements.totalProfit.className = 'value ' + (totals.profit >= 0 ? 'positive' : 'negative');
    elements.roiPercent.className = 'value ' + (totals.roi >= 0 ? 'positive' : 'negative');
}

/**
 * UI Updates - Chart (Spend vs Revenue)
 */
function updateChart(data) {
    const ctx = document.getElementById('performanceChart').getContext('2d');
    
    // Group data by date
    const dateGroups = {};
    data.forEach(item => {
        const date = item.date;
        if (!dateGroups[date]) {
            dateGroups[date] = { spend: 0, revenue: 0 };
        }
        dateGroups[date].spend += parseFloat(item.spend || 0);
        dateGroups[date].revenue += parseFloat(item.revenue || 0);
    });

    const dates = Object.keys(dateGroups).sort();
    const spendData = dates.map(d => dateGroups[d].spend);
    const revenueData = dates.map(d => dateGroups[d].revenue);

    if (performanceChart) {
        performanceChart.destroy();
    }

    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'Spend',
                    data: spendData,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Revenue',
                    data: revenueData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8b949e' }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#8b949e' }
                }
            }
        }
    });
}

/**
 * UI Updates - Table (Heatmap Grid)
 */
function renderTable(data) {
    elements.tableHead.innerHTML = '';
    elements.tableBody.innerHTML = '';

    if (!data || data.length === 0) {
        elements.tableBody.innerHTML = '<tr><td colspan="8" class="empty-state">No data matches your criteria.</td></tr>';
        return;
    }

    // 1. Generate Date Columns (Robust)
    dateColumns = [];
    let [sY, sM, sD] = elements.dateStart.value.split('-').map(Number);
    let [eY, eM, eD] = elements.dateEnd.value.split('-').map(Number);
    
    let cur = new Date(sY, sM - 1, sD);
    let end = new Date(eY, eM - 1, eD);
    
    while (cur <= end) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        dateColumns.push(`${y}-${m}-${d}`);
        cur.setDate(cur.getDate() + 1);
    }

    // 2. Render Headers
    let headHTML = `<tr><th>CAMPAIGN</th>`;
    dateColumns.forEach(date => {
        const d = new Date(date + 'T00:00:00');
        const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
        headHTML += `<th>${dayLabel.toUpperCase()}</th>`;
    });
    headHTML += `<th>TOTAL</th></tr>`;
    elements.tableHead.innerHTML = headHTML;

    // 3. Aggregate Data
    const campaignMap = {};
    data.forEach(r => {
        const name = r.campaignName || 'Unnamed';
        const date = r.date;
        const hour = parseInt(r.hour || 0);

        if (!campaignMap[name]) {
            campaignMap[name] = { 
                daily: {}, 
                totals: { spend:0, revenue:0, profit:0, clicks:0, conv:0 },
                hourly: {} 
            };
        }
        if (!campaignMap[name].daily[date]) {
            campaignMap[name].daily[date] = { 
                spend:0, revenue:0, profit:0, clicks:0, conv:0, 
                hourly: {} 
            };
        }
        
        // Detailed hourly under each date
        if (!campaignMap[name].daily[date].hourly[hour]) {
            campaignMap[name].daily[date].hourly[hour] = { spend:0, revenue:0, profit:0, clicks:0, conv:0 };
        }
        
        // Aggregate totals for the hour (all dates)
        if (!campaignMap[name].hourly[hour]) {
            campaignMap[name].hourly[hour] = { spend:0, revenue:0, profit:0, clicks:0, conv:0 };
        }
        
        const d = campaignMap[name].daily[date];
        const dh = d.hourly[hour];
        const t = campaignMap[name].totals;
        const h = campaignMap[name].hourly[hour];
        
        const spend = parseMetricValue(r.spend);
        const rev = parseMetricValue(r.revenue);
        const clicks = parseInt(r.clicks || 0);
        const conv = parseInt(r.conversions || 0);
        const profit = parseMetricValue(r.profit || (rev - spend));

        [d, dh, t, h].forEach(node => {
            node.spend += spend;
            node.revenue += rev;
            node.clicks += clicks;
            node.conv += conv;
            node.profit += profit;
        });
    });

    // 4. Render Rows
    Object.entries(campaignMap).forEach(([name, c]) => {
        const row = document.createElement('tr');
        row.classList.add('campaign-row');
        
        let rowHTML = `
            <td class="campaign-cell">
                <div class="campaign-name-row">
                    <label class="switch-small">
                        <input type="checkbox" checked>
                        <span class="slider-round"></span>
                    </label>
                    <span class="budget-pill">$5</span>
                    <button class="bolt-btn">⚡</button>
                    <span class="clickable-name"><strong>${name}</strong></span>
                    <button class="launch-btn-fast" title="Launch on Meta">🚀</button>
                </div>
            </td>
        `;
        
        dateColumns.forEach(date => {
            const dayData = c.daily[date];
            if (dayData) {
                const val = getMetricValue(dayData, currentMetric);
                const className = getCellClass(val, currentMetric);
                
                // Tooltip Data Attributes
                const spend = dayData.spend.toFixed(2);
                const rev = dayData.revenue.toFixed(2);
                const profit = dayData.profit.toFixed(2);
                const roi = dayData.spend > 0 ? ((dayData.revenue - dayData.spend) / dayData.spend * 100).toFixed(1) : 0;
                const rpc = dayData.clicks > 0 ? (dayData.revenue / dayData.clicks).toFixed(2) : 0;
                const cpa = dayData.conv > 0 ? (dayData.spend / dayData.conv).toFixed(2) : 0;
                const cpc = dayData.clicks > 0 ? (dayData.spend / dayData.clicks).toFixed(2) : 0;

                rowHTML += `<td class="${className}" 
                    data-date="${date}" 
                    data-spend="${spend}" 
                    data-revenue="${rev}" 
                    data-profit="${profit}" 
                    data-roi="${roi}"
                    data-rpc="${rpc}"
                    data-cpa="${cpa}"
                    data-cpc="${cpc}"
                >${formatMetric(val, currentMetric)}</td>`;
            } else {
                rowHTML += `<td class="cell-nodata">-</td>`;
            }
        });

        const totalVal = getMetricValue(c.totals, currentMetric);
        const totalClass = getCellClass(totalVal, currentMetric);
        rowHTML += `<td class="cell-total ${totalClass}">${formatMetric(totalVal, currentMetric)}</td>`;

        row.innerHTML = rowHTML;
        elements.tableBody.appendChild(row);

        // Safely attach event listeners
        const nameEl = row.querySelector('.clickable-name');
        if (nameEl) {
            nameEl.addEventListener('click', () => toggleCampaignRows(name, row, c));
        }

        const launchBtn = row.querySelector('.launch-btn-fast');
        if (launchBtn) {
            launchBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.Launcher) window.Launcher.open(name);
            });
        }
    });
}

/**
 * Toggle Hourly Rows
 */
function toggleCampaignRows(campaignName, parentRow, campaignNode) {
    const isExpanded = parentRow.classList.contains('expanded');
    
    if (isExpanded) {
        // Remove sub-rows
        let next = parentRow.nextElementSibling;
        while (next && next.classList.contains('hourly-row')) {
            const toRemove = next;
            next = next.nextElementSibling;
            toRemove.remove();
        }
        parentRow.classList.remove('expanded');
    } else {
        // Add sub-rows
        parentRow.classList.add('expanded');
        let lastRow = parentRow;

        // Sort hours for display (0 to 23)
        const sortedHours = Array.from({length: 24}, (_, i) => i);

        sortedHours.forEach(h => {
            const hTotalData = campaignNode.hourly[h];
            // Only show hour rows if there is data for that hour in ANY date
            if (!hTotalData || hTotalData.clicks === 0) return;

            const hRow = document.createElement('tr');
            hRow.classList.add('hourly-row');
            
            // Hour Label Column
            let hRowHTML = `<td class="hour-label">└─ ${formatTime(h)}</td>`;
            
            // Per-Date Hourly Cells
            dateColumns.forEach(date => {
                const dayNode = campaignNode.daily[date];
                const hNode = dayNode?.hourly?.[h];
                
                if (hNode) {
                    const val = getMetricValue(hNode, currentMetric);
                    const className = getCellClass(val, currentMetric);
                    
                    const spend = hNode.spend.toFixed(2);
                    const rev = hNode.revenue.toFixed(2);
                    const profit = hNode.profit.toFixed(2);
                    const roi = hNode.spend > 0 ? ((hNode.revenue - hNode.spend) / hNode.spend * 100).toFixed(1) : 0;
                    const rpc = hNode.clicks > 0 ? (hNode.revenue / hNode.clicks).toFixed(2) : 0;
                    const cpa = hNode.conv > 0 ? (hNode.spend / hNode.conv).toFixed(2) : 0;
                    const cpc = hNode.clicks > 0 ? (hNode.spend / hNode.clicks).toFixed(2) : 0;

                    hRowHTML += `<td class="${className}"
                        data-date="${date} ${h}:00"
                        data-spend="${spend}" 
                        data-revenue="${rev}" 
                        data-profit="${profit}" 
                        data-roi="${roi}"
                        data-rpc="${rpc}"
                        data-cpa="${cpa}"
                        data-cpc="${cpc}"
                    >${formatMetric(val, currentMetric)}</td>`;
                } else {
                    hRowHTML += `<td class="cell-nodata">-</td>`;
                }
            });

            // Hourly Total Cell (Across all dates)
            const hTotalVal = getMetricValue(hTotalData, currentMetric);
            const hTotalClass = getCellClass(hTotalVal, currentMetric);
            hRowHTML += `<td class="cell-total ${hTotalClass}">${formatMetric(hTotalVal, currentMetric)}</td>`;

            hRow.innerHTML = hRowHTML;
            lastRow.after(hRow);
            lastRow = hRow;
        });

        // Smooth scroll
        parentRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function getMetricValue(node, metric) {
    if (!node) return 0;
    switch(metric) {
        case 'spend': return node.spend;
        case 'revenue': return node.revenue;
        case 'profit': return node.profit;
        case 'roi': return node.spend > 0 ? (node.profit / node.spend) * 100 : 0;
        case 'rpc': return node.clicks > 0 ? node.revenue / node.clicks : 0;
        case 'cpa': return node.conv > 0 ? node.spend / node.conv : 0;
        default: return 0;
    }
}

function getCellClass(val, metric) {
    if (val === 0) return 'cell-zero';
    
    if (metric === 'profit' || metric === 'revenue') {
        if (val > 50) return 'cell-profit-high';
        if (val > 10) return 'cell-profit-mid';
        if (val > 0) return 'cell-profit-low';
        if (val < -50) return 'cell-loss-high';
        if (val < -10) return 'cell-loss-mid';
        return 'cell-loss-low';
    }

    if (metric === 'roi') {
        if (val > 100) return 'cell-profit-high';
        if (val > 30) return 'cell-profit-mid';
        if (val > 0) return 'cell-profit-low';
        return 'cell-loss-mid';
    }

    return '';
}

function formatMetric(val, metric) {
    if (val === 0) return '-';
    if (metric === 'roi') return val.toFixed(1) + '%';
    if (metric === 'rpc' || metric === 'cpa') return '$' + val.toFixed(3);
    return '$' + val.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

/**
 * Helper Functions
 */
function handleSearch(e) {
    const term = e.target.value.toLowerCase();
    const rows = elements.tableBody.querySelectorAll('tr');
    rows.forEach(row => {
        const text = row.querySelector('td')?.textContent.toLowerCase() || '';
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

function showLoading(show) {
    if (show) elements.loadingOverlay.classList.remove('hidden');
    else elements.loadingOverlay.classList.add('hidden');
}

function formatCurrency(value, decimals = 2) {
    return CONFIG.CURRENCY_SYMBOL + parseFloat(value).toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatTime(h) {
    const hour = h % 12 === 0 ? 12 : h % 12;
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${hour.toString().padStart(2, '0')}:00 ${ampm}`;
}

function parseMetricValue(val) {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    // Remove commas and other non-numeric characters except decimal point and minus sign
    const cleaned = String(val).replace(/[^-0-9.]/g, '');
    return parseFloat(cleaned) || 0;
}

// End of file
