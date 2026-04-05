/**
 * Tooltip Module — Handles Heatmap Cell Data Breakdown
 * Provides a floating detailed view of cell performance on hover.
 */

const Tooltip = {
    element: null,

    init() {
        // Create the tooltip element if it doesn't exist
        let tooltipEl = document.getElementById('heatmapTooltip');
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = 'heatmapTooltip';
            tooltipEl.className = 'heatmap-tooltip glass';
            document.body.appendChild(tooltipEl);
        }
        this.element = tooltipEl;

        this.setupListeners();
    },

    setupListeners() {
        // We use event delegation on the tableBody for efficiency
        const tableBody = document.getElementById('tableBody');
        if (!tableBody) return;

        tableBody.addEventListener('mouseover', (e) => {
            const cell = e.target.closest('td[data-date]');
            if (cell) this.show(cell, e);
        });

        tableBody.addEventListener('mousemove', (e) => {
            if (this.element.style.display === 'block') {
                this.move(e);
            }
        });

        tableBody.addEventListener('mouseout', (e) => {
            const cell = e.target.closest('td[data-date]');
            if (cell) this.hide();
        });
    },

    show(cell, e) {
        const date = cell.getAttribute('data-date');
        const spend = cell.getAttribute('data-spend');
        const revenue = cell.getAttribute('data-revenue');
        const profit = cell.getAttribute('data-profit');
        const roi = cell.getAttribute('data-roi');
        const rpc = cell.getAttribute('data-rpc');
        const cpa = cell.getAttribute('data-cpa');
        const cpc = cell.getAttribute('data-cpc');

        const profitClass = parseFloat(profit) >= 0 ? 'text-profit' : 'text-loss';
        const roiClass = parseFloat(roi) >= 0 ? 'text-profit' : 'text-loss';

        this.element.innerHTML = `
            <div class="tooltip-header">${this.formatDateLabel(date)}</div>
            <div class="tooltip-row"><span>Spend:</span> <strong>$${spend}</strong></div>
            <div class="tooltip-row"><span>Revenue:</span> <strong>$${revenue}</strong></div>
            <div class="tooltip-row"><span>Profit:</span> <strong class="${profitClass}">$${profit}</strong></div>
            <div class="tooltip-row"><span>ROI:</span> <strong class="${roiClass}">${roi}%</strong></div>
            <div class="tooltip-row"><span>RPC:</span> <strong>$${rpc}</strong></div>
            <div class="tooltip-row"><span>CPA:</span> <strong>$${cpa}</strong></div>
            <div class="tooltip-row"><span>CPC:</span> <strong>$${cpc}</strong></div>
        `;

        this.element.style.display = 'block';
        this.move(e);
    },

    move(e) {
        const x = e.pageX + 15;
        const y = e.pageY + 15;
        this.element.style.left = `${x}px`;
        this.element.style.top = `${y}px`;
        
        // Prevent overflow
        const rect = this.element.getBoundingClientRect();
        if (x + rect.width > window.innerWidth) {
            this.element.style.left = `${e.pageX - rect.width - 15}px`;
        }
    },

    hide() {
        this.element.style.display = 'none';
    },

    formatDateLabel(date) {
        const d = new Date(date + 'T00:00:00');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
};

window.Tooltip = Tooltip;
