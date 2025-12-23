/**
 * Resource Revenue Management Dashboard - JavaScript
 * ====================================================
 * 
 * This file handles:
 * 1. Fetching data from the backend API
 * 2. Updating all dashboard sections with live data
 * 3. Month/Year selector functionality
 * 4. Error handling and loading states
 * 
 * Author: Dashboard Integration Team
 * Date: December 2024
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

// Month names for display
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December'];

const MONTH_NAMES_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                           'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];


// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize dashboard on page load
 * - Sets current month and year in selectors
 * - Loads initial dashboard data
 * - Updates section titles based on selected month
 */
function initializeDashboard() {
    console.log('Initializing dashboard...');
    
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-based index
    const currentYear = now.getFullYear();
    
    // Set month selector to current month
    const monthSelect = document.getElementById('monthSelect');
    if (monthSelect) {
        monthSelect.value = currentMonth;
    }
    
    // Set year selector to current year
    const yearSelect = document.getElementById('yearSelect');
    if (yearSelect) {
        // Check if current year exists in dropdown
        const yearOption = Array.from(yearSelect.options).find(opt => opt.value == currentYear);
        if (yearOption) {
            yearSelect.value = currentYear;
        }
    }
    
    // Update section titles based on current month
    updateSectionTitles();
    
    // Load dashboard data
    loadDashboardData();
    
    console.log('Dashboard initialized successfully');
}


// =============================================================================
// API CALLS
// =============================================================================

/**
 * Load dashboard data from backend API
 * This is the main function that fetches all data and updates the UI
 */
function loadDashboardData() {
    console.log('Loading dashboard data...');

    const monthIndex = parseInt(document.getElementById('monthSelect').value);
    const year = parseInt(document.getElementById('yearSelect').value);

    // Show loading state
    showLoadingState();

    // Call backend API using frappe.call
    frappe.call({
        method: 'anshin_theme.api.dashboard_api.get_dashboard_data',
        args: {
            month: monthIndex,
            year: year
        },
        callback: function(r) {
            console.log('Data received:', r.message);

            if (r.message) {
                const data = r.message;

                // Update all dashboard sections
                updateRevenueSummary(data.revenueSummary);
                updateUtilization(data.utilization);
                updateAllEmployeesList(data.allEmployees);
                updateBenchSection(data.benchResources);
                updateExpiringSections(data.expiringResources);

                // Update last update time
                updateLastUpdateTime();

                console.log('Dashboard updated successfully');
            }

            // Hide loading state
            hideLoadingState();
        },
        error: function(r) {
            console.error('Error loading dashboard data:', r);
            hideLoadingState();
            showErrorMessage('Failed to load dashboard data. Please try again.');
        }
    });
}


// =============================================================================
// UI UPDATE FUNCTIONS
// =============================================================================

/**
 * Update Revenue Summary Cards
 * Updates the three top cards: Active Revenue, Bench Resources, Utilization Rate
 * 
 * @param {object} data - Revenue summary data from API
 */
function updateRevenueSummary(data) {
    console.log('Updating revenue summary...');
    
    // Update Active Revenue card
    const activeRevenueValue = document.querySelector('.revenue-card.positive .revenue-card-value');
    if (activeRevenueValue) {
        // Convert to millions and format with 1 decimal place
        const revenueInMillions = (data.activeRevenue.total / 1000000).toFixed(1);
        activeRevenueValue.textContent = `¥${revenueInMillions}M`;
    }
    
    // Update revenue breakdown (Billed vs Bench)
    const billedValue = document.querySelector('.revenue-breakdown .revenue-item:nth-child(1) .revenue-item-value');
    if (billedValue) {
        const billedInMillions = (data.activeRevenue.billed / 1000000).toFixed(1);
        billedValue.textContent = `¥${billedInMillions}M`;
    }
    
    const benchValue = document.querySelector('.revenue-breakdown .revenue-item:nth-child(2) .revenue-item-value');
    if (benchValue) {
        const benchInMillions = (data.activeRevenue.bench / 1000000).toFixed(1);
        benchValue.textContent = `¥${benchInMillions}M`;
    }
    
    // Update Bench Resources count
    const benchCountValue = document.querySelector('.revenue-card.attention .revenue-card-value');
    if (benchCountValue) {
        benchCountValue.textContent = data.benchResources.count;
    }
    
    // Update Utilization Rate
    const utilizationValue = document.querySelector('.revenue-card.neutral .revenue-card-value');
    if (utilizationValue) {
        utilizationValue.textContent = `${data.utilizationRate.percentage}%`;
    }
}


/**
 * Update Utilization Bar and Metrics
 * Shows billable, bench, and total employee counts
 * 
 * @param {object} data - Utilization data from API
 */
function updateUtilization(data) {
    console.log('Updating utilization metrics...');
    
    // Calculate utilization percentage
    const utilizationPercent = data.total > 0 
        ? Math.round((data.billable / data.total) * 100) 
        : 0;
    
    // Update utilization bar
    const utilizationBar = document.querySelector('.utilization-bar-fill');
    if (utilizationBar) {
        utilizationBar.style.width = `${utilizationPercent}%`;
        utilizationBar.textContent = `${utilizationPercent}% Utilization`;
    }
    
    // Update metric values
    const billableMetric = document.querySelector('.util-metric:nth-child(1) .util-metric-value');
    if (billableMetric) {
        billableMetric.textContent = data.billable;
    }
    
    const benchMetric = document.querySelector('.util-metric:nth-child(2) .util-metric-value');
    if (benchMetric) {
        benchMetric.textContent = data.bench;
    }
    
    const totalMetric = document.querySelector('.util-metric:nth-child(3) .util-metric-value');
    if (totalMetric) {
        totalMetric.textContent = data.total;
    }
    
    // Update summary card for total employees
    const totalCountElement = document.querySelector('#section-all-employees .section-count');
    if (totalCountElement) {
        totalCountElement.textContent = `${data.total} Total Employees`;
    }
}


/**
 * Update All Employees List
 * Populates the collapsible section with all employee data
 * 
 * @param {Array} employees - Array of employee objects from API
 */
function updateAllEmployeesList(employees) {
    console.log(`Updating all employees list (${employees.length} employees)...`);
    
    const tbody = document.querySelector('#section-all-employees tbody');
    if (!tbody) {
        console.error('All employees table body not found');
        return;
    }
    
    // Clear existing rows
    tbody.innerHTML = '';
    
    // Add employee rows
    employees.forEach(employee => {
        const row = createEmployeeRow(employee);
        tbody.appendChild(row);
    });
    
    // Add "show more" indicator if there are many employees
    if (employees.length > 10) {
        const moreRow = document.createElement('tr');
        moreRow.innerHTML = `
            <td colspan="5" style="text-align: center; color: #9ca3af; padding: 20px;">
                <em>Showing all ${employees.length} employees</em>
            </td>
        `;
        tbody.appendChild(moreRow);
    }
}


/**
 * Create an employee table row with all details
 * Helper function for updateAllEmployeesList
 * 
 * @param {object} employee - Employee data object
 * @returns {HTMLElement} - Table row element
 */
function createEmployeeRow(employee) {
    const row = document.createElement('tr');
    
    // Format skills HTML
    const skillsHtml = employee.skills
        .map(skill => `
            <span class="skill-item">
                <span class="skill-name">${escapeHtml(skill.name)}</span> 
                <span class="skill-years">(${skill.years}y)</span>
            </span>
        `)
        .join('');
    
    row.innerHTML = `
        <td>
            <div class="resource-name">${escapeHtml(employee.name)}</div>
        </td>
        <td><span class="resource-id">${escapeHtml(employee.employeeId)}</span></td>
        <td><span class="cost-value">¥${formatNumber(employee.ctc)}</span></td>
        <td><span class="cost-value">¥${formatNumber(employee.dailyCost)}</span></td>
        <td>
            <div class="skills-list">
                ${skillsHtml || '<em style="color: #9ca3af;">No skills listed</em>'}
            </div>
        </td>
    `;
    
    return row;
}


/**
 * Update On Bench Section
 * Shows employees who don't have active contracts
 * 
 * @param {Array} benchResources - Array of bench employees from API
 */
function updateBenchSection(benchResources) {
    console.log(`Updating bench section (${benchResources.length} resources)...`);
    
    const tbody = document.querySelector('#section-bench tbody');
    if (!tbody) {
        console.error('Bench section table body not found');
        return;
    }
    
    // Clear existing rows
    tbody.innerHTML = '';
    
    // Calculate total daily loss
    const totalDailyLoss = benchResources.reduce((sum, r) => sum + r.dailyCost, 0);
    
    // Update section header counts
    const sectionCount = document.querySelector('#section-bench .section-count');
    if (sectionCount) {
        sectionCount.textContent = `${benchResources.length} Resources`;
    }
    
    const sectionAmount = document.querySelector('#section-bench .section-amount');
    if (sectionAmount) {
        const monthlyLoss = totalDailyLoss * 30;
        sectionAmount.textContent = `Daily Loss: ¥${formatNumber(totalDailyLoss)} | Monthly: ¥${formatNumber(monthlyLoss)}`;
    }
    
    // Add bench resource rows
    benchResources.forEach(resource => {
        const row = createBenchResourceRow(resource);
        tbody.appendChild(row);
    });
    
    // Add summary row if more exist
    if (benchResources.length > 10) {
        const moreRow = document.createElement('tr');
        moreRow.innerHTML = `
            <td colspan="5" style="text-align: center; color: #9ca3af; padding: 20px;">
                <em>+ ${benchResources.length - 10} more resources on bench...</em>
            </td>
        `;
        tbody.appendChild(moreRow);
    }
}


/**
 * Create a bench resource table row
 * Helper function for updateBenchSection
 * 
 * @param {object} resource - Bench resource data object
 * @returns {HTMLElement} - Table row element
 */
function createBenchResourceRow(resource) {
    const row = document.createElement('tr');
    
    const skillsHtml = resource.skills
        .slice(0, 4) // Show max 4 skills
        .map(skill => `
            <span class="skill-item">
                <span class="skill-name">${escapeHtml(skill.name)}</span> 
                <span class="skill-years">(${skill.years}y)</span>
            </span>
        `)
        .join('');
    
    const monthlyLoss = resource.dailyCost * 30;
    
    row.innerHTML = `
        <td>
            <div class="resource-name">${escapeHtml(resource.name)}</div>
            <span class="resource-id">${escapeHtml(resource.id)}</span>
        </td>
        <td><span class="days-badge days-critical">On Bench</span></td>
        <td><span class="cost-value">¥${formatNumber(resource.dailyCost)}</span></td>
        <td><span class="loss-value">¥${formatNumber(monthlyLoss)}</span></td>
        <td>
            <div class="skills-list">
                ${skillsHtml || '<em style="color: #9ca3af;">No skills listed</em>'}
            </div>
        </td>
    `;
    
    return row;
}


/**
 * Update all expiring contract sections
 * Updates: This Month, Next Month, Next 3 Months
 * 
 * @param {object} data - Expiring resources data from API
 */
function updateExpiringSections(data) {
    console.log('Updating expiring sections...');
    
    // Update This Month section
    updateExpiringSection('section-7days', data.thisMonth, '⚡');
    
    // Update Next Month section
    updateExpiringSection('section-30days', data.nextMonth, '📋');
    
    // Update Next 3 Months section
    updateExpiringSection('section-90days', data.next3Months, '📅', true);
}


/**
 * Update a single expiring section with data
 * 
 * @param {string} sectionId - HTML ID of the section
 * @param {object} data - Section data from API
 * @param {string} icon - Emoji icon for the section
 * @param {boolean} showWeekly - Whether to show weekly breakdown (for 3-month section)
 */
function updateExpiringSection(sectionId, data, icon, showWeekly = false) {
    const section = document.getElementById(sectionId);
    if (!section) {
        console.error(`Section ${sectionId} not found`);
        return;
    }
    
    // Update header counts
    const countElement = section.querySelector('.section-count');
    if (countElement) {
        countElement.textContent = `${data.count} Resources`;
    }
    
    const amountElement = section.querySelector('.section-amount');
    if (amountElement) {
        amountElement.textContent = `Potential Loss: ¥${formatNumber(data.potentialLoss.daily)}/day | ¥${formatNumber(data.potentialLoss.monthly)}/month`;
    }
    
    // Update summary card (if exists)
    const summaryCard = document.getElementById(`summary-card-${sectionId.split('-')[1]}`);
    if (summaryCard) {
        const cardCount = summaryCard.closest('.summary-card').querySelector('.card-count');
        const cardAmount = summaryCard.closest('.summary-card').querySelector('.card-amount');
        
        if (cardCount) cardCount.textContent = data.count;
        if (cardAmount) cardAmount.textContent = `¥${formatNumber(data.potentialLoss.monthly)}/mo`;
    }
    
    // Update table body
    const tbody = section.querySelector('tbody');
    if (tbody && data.resources) {
        tbody.innerHTML = '';
        
        data.resources.forEach(resource => {
            const row = createExpiringResourceRow(resource);
            tbody.appendChild(row);
        });
        
        // Add "more" indicator if there are more resources
        if (data.count > data.resources.length) {
            const moreRow = document.createElement('tr');
            moreRow.innerHTML = `
                <td colspan="6" style="text-align: center; color: #9ca3af; padding: 20px;">
                    <em>+ ${data.count - data.resources.length} more resources expiring...</em>
                </td>
            `;
            tbody.appendChild(moreRow);
        }
    }
    
    // For 3-month section, show weekly breakdown
    if (showWeekly && data.weeklyBreakdown) {
        updateWeeklyBreakdown(section, data.weeklyBreakdown);
    }
}


/**
 * Create an expiring resource table row
 * 
 * @param {object} resource - Expiring resource data
 * @returns {HTMLElement} - Table row element
 */
function createExpiringResourceRow(resource) {
    const row = document.createElement('tr');
    
    const skillsHtml = resource.skills
        .slice(0, 4)
        .map(skill => `
            <span class="skill-item">
                <span class="skill-name">${escapeHtml(skill.name)}</span> 
                <span class="skill-years">(${skill.years}y)</span>
            </span>
        `)
        .join('');
    
    // Determine badge class based on days left
    let badgeClass = 'days-medium';
    if (resource.daysLeft <= 3) badgeClass = 'days-critical';
    else if (resource.daysLeft <= 7) badgeClass = 'days-urgent';
    else if (resource.daysLeft <= 30) badgeClass = 'days-high';
    
    row.innerHTML = `
        <td>
            <div class="resource-name">${escapeHtml(resource.name)}</div>
            <span class="resource-id">${escapeHtml(resource.id)}</span>
        </td>
        <td><span class="days-badge ${badgeClass}">${resource.daysLeft} days</span></td>
        <td><span class="cost-value">¥${formatNumber(resource.dailyCost)}</span></td>
        <td>
            <div class="client-info">
                <span class="client-name">${escapeHtml(resource.currentClient)}</span>
            </div>
        </td>
        <td>
            <div class="skills-list">
                ${skillsHtml || '<em style="color: #9ca3af;">No skills listed</em>'}
            </div>
        </td>
        <td>
            <div class="action-buttons">
                <button class="btn btn-primary" onclick="findMatch('${resource.id}')">🔍 Find Match</button>
            </div>
        </td>
    `;
    
    return row;
}


/**
 * Update weekly breakdown for 3-month section
 * 
 * @param {HTMLElement} section - Section element
 * @param {Array} weeklyData - Weekly breakdown data
 */
function updateWeeklyBreakdown(section, weeklyData) {
    const content = section.querySelector('.section-content');
    if (!content) return;
    
    // Check if weekly breakdown container exists, create if not
    let weeklyContainer = content.querySelector('.weekly-breakdown');
    if (!weeklyContainer) {
        weeklyContainer = document.createElement('div');
        weeklyContainer.className = 'weekly-breakdown';
        weeklyContainer.style.cssText = 'padding: 20px; text-align: center;';
        content.appendChild(weeklyContainer);
    }
    
    const weeklyHtml = `
        <h3 style="margin-bottom: 20px; color: #4b5563;">Summary by Week</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
            ${weeklyData.map(week => `
                <div style="background: #f9fafb; padding: 20px; border-radius: 12px; border: 2px solid #e5e7eb;">
                    <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">${week.week}</div>
                    <div style="font-size: 24px; font-weight: 800; color: #1f2937;">${week.resourceCount} resources</div>
                </div>
            `).join('')}
        </div>
    `;
    
    weeklyContainer.innerHTML = weeklyHtml;
}


// =============================================================================
// SECTION TITLE UPDATES (for dynamic month names)
// =============================================================================

/**
 * Update section titles based on selected month
 * Changes "Next Month" to actual month name (e.g., "JANUARY")
 */
function updateSectionTitles() {
    const monthIndex = parseInt(document.getElementById('monthSelect').value);
    
    // Section 2: This Month (stays same)
    const section2Title = document.getElementById('section2-title');
    if (section2Title) {
        section2Title.textContent = 'EXPIRING THIS MONTH';
    }
    
    // Summary card 2
    const summaryCard2 = document.getElementById('summary-card-2');
    if (summaryCard2) {
        summaryCard2.textContent = 'Expiring This Month';
    }
    
    // Section 3: Next Month
    const nextMonthIndex = (monthIndex + 1) % 12;
    const section3Title = document.getElementById('section3-title');
    if (section3Title) {
        section3Title.textContent = MONTH_NAMES[nextMonthIndex].toUpperCase();
    }
    
    const summaryCard3 = document.getElementById('summary-card-3');
    if (summaryCard3) {
        summaryCard3.textContent = `Expiring in ${MONTH_NAMES[nextMonthIndex]}`;
    }
    
    // Section 4: Next 3 Months
    const month2Index = (monthIndex + 1) % 12;
    const month4Index = (monthIndex + 3) % 12;
    const section4Title = document.getElementById('section4-title');
    if (section4Title) {
        section4Title.textContent = `${MONTH_NAMES_SHORT[month2Index]}-${MONTH_NAMES_SHORT[month4Index]}`;
    }
    
    const summaryCard4 = document.getElementById('summary-card-4');
    if (summaryCard4) {
        summaryCard4.textContent = `Expiring in Next 3 Months (${MONTH_NAMES_SHORT[month2Index]}-${MONTH_NAMES_SHORT[month4Index]})`;
    }
}


// =============================================================================
// USER INTERACTION HANDLERS
// =============================================================================

/**
 * Handle dashboard update when month or year is changed
 * Called by month/year selector onchange events
 */
function updateDashboard() {
    console.log('Dashboard update triggered by user selection');
    
    // Update section titles
    updateSectionTitles();
    
    // Reload data
    loadDashboardData();
}


/**
 * Refresh dashboard (reload current data)
 * Called by "Refresh Now" button
 */
function refreshDashboard() {
    console.log('Manual refresh triggered');
    
    // Update timestamp
    updateLastUpdateTime();
    
    // Show message
    const month = MONTH_NAMES[parseInt(document.getElementById('monthSelect').value)];
    const year = document.getElementById('yearSelect').value;
    
    // Reload data
    loadDashboardData();
    
    // Optional: Show success message
    // showSuccessMessage(`Dashboard refreshed for ${month} ${year}`);
}


/**
 * Toggle section expand/collapse
 * Called when clicking on section headers
 * 
 * @param {string} sectionId - ID of section to toggle
 */
function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.toggle('collapsed');
    }
}


/**
 * Find match for an employee
 * Placeholder for future matching functionality
 * 
 * @param {string} employeeId - ID of employee to find match for
 */
function findMatch(employeeId) {
    console.log(`Finding match for employee: ${employeeId}`);
    alert(`Finding match for employee ${employeeId}. This will integrate with your matching system.`);
    // TODO: Implement actual matching logic or navigate to matching page
}


// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Update last update time display
 */
function updateLastUpdateTime() {
    const timeElement = document.getElementById('lastUpdateTime');
    if (timeElement) {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        timeElement.textContent = `${hours}:${minutes}`;
    }
}


/**
 * Show loading state on dashboard
 */
function showLoadingState() {
    document.body.style.opacity = '0.6';
    document.body.style.pointerEvents = 'none';
    
    // Optional: Add loading spinner
    // const loader = document.createElement('div');
    // loader.id = 'dashboard-loader';
    // loader.innerHTML = '<div class="spinner">Loading...</div>';
    // document.body.appendChild(loader);
}


/**
 * Hide loading state
 */
function hideLoadingState() {
    document.body.style.opacity = '1';
    document.body.style.pointerEvents = 'auto';
    
    // Remove loader if exists
    // const loader = document.getElementById('dashboard-loader');
    // if (loader) loader.remove();
}


/**
 * Show error message to user
 * 
 * @param {string} message - Error message to display
 */
function showErrorMessage(message) {
    console.error(message);
    alert(message); // Replace with better UI notification
}


/**
 * Show success message to user
 * 
 * @param {string} message - Success message to display
 */
function showSuccessMessage(message) {
    console.log(message);
    // TODO: Implement better success notification UI
}


/**
 * Format number with commas (e.g., 1000000 -> 1,000,000)
 * 
 * @param {number} num - Number to format
 * @returns {string} - Formatted number string
 */
function formatNumber(num) {
    return Math.round(num).toLocaleString('en-US');
}


/**
 * Escape HTML to prevent XSS attacks
 * 
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}


// =============================================================================
// AUTO-INITIALIZATION
// =============================================================================

/**
 * Initialize dashboard when DOM is ready
 */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDashboard);
} else {
    initializeDashboard();
}


/**
 * Optional: Auto-refresh every 15 minutes
 * Uncomment to enable
 */
// setInterval(loadDashboardData, 15 * 60 * 1000); // 15 minutes

