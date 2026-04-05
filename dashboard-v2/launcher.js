/**
 * Launcher Module — Handles Meta Ad Campaign Creation
 * Separation of Concerns: Keeps Meta API logic out of the main dashboard app.js
 */

const Launcher = {
    elements: {
        overlay: null,
        adAccount: null,
        fbPage: null,
        pixel: null,
        budget: null,
        bidStrategy: null,
        copiesTable: null,
        submitBtn: null,
        closeBtn: null
    },

    init() {
        // Find elements (will be injected into index.html)
        this.elements.overlay = document.getElementById('launcherOverlay');
        this.elements.adAccount = document.getElementById('tsAdAccount');
        this.elements.fbPage = document.getElementById('tsFbPage');
        this.elements.pixel = document.getElementById('tsPixel');
        this.elements.budget = document.getElementById('tsBudget');
        this.elements.bidStrategy = document.getElementById('tsBidStrategy');
        this.elements.copiesTable = document.getElementById('copiesTableBody');
        this.elements.submitBtn = document.getElementById('launcherSubmitBtn');
        this.elements.closeBtn = document.getElementById('launcherCloseBtn');

        this.setupListeners();
    },

    setupListeners() {
        if (this.elements.closeBtn) {
            this.elements.closeBtn.addEventListener('click', () => this.close());
        }
        if (this.elements.submitBtn) {
            this.elements.submitBtn.addEventListener('click', () => this.submitToMeta());
        }
        
        // Load metadata when ad account changes (to update pixels)
        if (this.elements.adAccount) {
            this.elements.adAccount.addEventListener('change', () => this.loadPixels());
        }
    },

    async open(campaignName) {
        this.elements.overlay.classList.add('active');
        document.getElementById('launcherSourceName').textContent = campaignName;
        document.getElementById('ngBaseName').value = campaignName + '-copy-';
        
        // Initial load of Meta data if not already loaded
        await this.loadMetaData();
        this.generateCopies(1); // Default to 1 copy
    },

    close() {
        this.elements.overlay.classList.remove('active');
    },

    async loadMetaData() {
        try {
            // Load Ad Accounts
            const accResp = await fetch('/meta/adaccounts');
            const accData = await accResp.json();
            if (accData.accounts) {
                this.elements.adAccount.innerHTML = accData.accounts.map(a => 
                    `<option value="${a.id}">${a.name} (${a.currency})</option>`
                ).join('');
            }

            // Load Pages
            const pageResp = await fetch('/meta/pages');
            const pageData = await pageResp.json();
            if (pageData.pages) {
                this.elements.fbPage.innerHTML = pageData.pages.map(p => 
                    `<option value="${p.id}">${p.name}</option>`
                ).join('');
            }

            // Initial pixel load for first account
            await this.loadPixels();

        } catch (err) {
            console.error('Failed to load Meta metadata:', err);
        }
    },

    async loadPixels() {
        const adAccountId = this.elements.adAccount.value;
        if (!adAccountId) return;
        
        try {
            const resp = await fetch(`/meta/pixels?ad_account=${adAccountId}`);
            const data = await resp.json();
            if (data.pixels) {
                this.elements.pixel.innerHTML = data.pixels.map(p => 
                    `<option value="${p.id}">${p.name}</option>`
                ).join('');
            }
        } catch (err) {
            console.error('Failed to load pixels:', err);
        }
    },

    generateCopies(count, suffix = '') {
        const baseName = document.getElementById('ngBaseName').value;
        this.elements.copiesTable.innerHTML = '';
        
        for (let i = 1; i <= count; i++) {
            const name = `${baseName}${i}${suffix ? '-' + suffix : ''}`;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${i}</td>
                <td><input type="text" value="${name}" class="copy-name-input"></td>
                <td><button class="remove-copy-btn" onclick="this.parentElement.parentElement.remove()">✕</button></td>
            `;
            this.elements.copiesTable.appendChild(tr);
        }
    },

    async submitToMeta() {
        const adAccount = this.elements.adAccount.value;
        const objective = document.getElementById('tsCampaignObjective').value;
        const budget = this.elements.budget.value;
        const bidStrategy = this.elements.bidStrategy.value;
        
        const copyRows = this.elements.copiesTable.querySelectorAll('tr');
        const campaigns = Array.from(copyRows).map(row => ({
            name: row.querySelector('.copy-name-input').value,
            adAccount,
            objective,
            budget,
            bidStrategy,
            status: 'PAUSED'
        }));

        if (campaigns.length === 0) {
            alert('Please add at least one campaign copy.');
            return;
        }

        this.elements.submitBtn.disabled = true;
        this.elements.submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

        try {
            const resp = await fetch('/meta/campaign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaigns })
            });
            const data = await resp.json();

            if (data.success) {
                alert(`Successfully created ${data.results.length} campaigns on Meta!`);
                this.close();
            } else {
                throw new Error(data.error || 'Unknown error during submission');
            }
        } catch (err) {
            alert('Meta Submission Error: ' + err.message);
            console.error(err);
        } finally {
            this.elements.submitBtn.disabled = false;
            this.elements.submitBtn.textContent = '🚀 Submit to Meta';
        }
    }
};

// Global Exposure for app.js integration
window.Launcher = Launcher;
