// Resource Revenue Management Dashboard - Frontend JavaScript

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December'];
const monthNamesShort = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
                        'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// Global state
let dashboardData = null;

// Initialize dashboard on page load
function initializeDashboard() {
    const now = new Date();
    const currentMonth = now.getMonth();  // 0-based
    const currentYear = now.getFullYear();

    // Set month selector to current month
    document.getElementById('monthSelect').value = currentMonth;

    // Set year selector to current year
    const yearSelect = document.getElementById('yearSelect');
    const yearOption = Array.from(yearSelect.options).find(opt => opt.value == currentYear);
    if (yearOption) {
        yearSelect.value = currentYear;
    }

    // Load dashboard data
    loadDashboardData(currentMonth, currentYear);
}

// Load dashboard data from API
function loadDashboardData(month, year) {
    // Show loading state
    showLoadingState();

    // Call Frappe API
    frappe.call({
        method: 'anshin_theme.api.revenue_dashboard.get_dashboard_data',
        args: {
            month: month,
            year: year
        },
        callback: function(response) {
            if (response.message) {
                dashboardData = response.message;
                renderDashboard();
                updateLastUpdateTime();
            }
        },
        error: function(error) {
            console.error('Error loading dashboard data:', error);
            frappe.msgprint({
                title: __('Error'),
                indicator: 'red',
                message: __('Failed to load dashboard data. Please try again.')
            });
        }
    });
}

// Show loading state
function showLoadingState() {
    // Add loading spinners or skeleton screens if needed
    console.log('Loading dashboard data...');
}

// Render entire dashboard
function renderDashboard() {
    if (!dashboardData) return;

    renderRevenueSummary();
    renderUtilization();
    renderAllEmployees();
    renderSummaryCards();
    renderOnBench();
    renderExpiringThisMonth();
    renderExpiringNextMonth();
    renderExpiringNext3Months();
    renderTotalAtRisk();
    updateSectionTitles();
}

// Render revenue summary cards
function renderRevenueSummary() {
    const data = dashboardData.revenue_summary;

    // Active Revenue card
    document.getElementById('activeRevenue').textContent = formatCurrency(data.active_revenue);
    document.getElementById('billableCount').textContent = data.billable_count;
    document.getElementById('avgRate').textContent = formatCurrency(data.avg_rate);

    // Net Margin card
    document.getElementById('netMargin').textContent = formatCurrency(data.net_margin);
    document.getElementById('marginPercentage').textContent = `${Math.round(data.margin_percentage)}%`;

    // Bench Cost Impact card
    document.getElementById('benchCost').textContent = formatCurrency(-data.bench_cost);
    document.getElementById('benchResourceCount').textContent = `${data.bench_count} resources without billing`;
    document.getElementById('actionItems').textContent = data.action_items;
    document.getElementById('atRisk').textContent = formatCurrency(data.at_risk);
}

// Render utilization bar
function renderUtilization() {
    const data = dashboardData.utilization;

    // Update utilization bar
    const percentage = Math.round(data.utilization_percentage);
    document.getElementById('utilizationBar').style.width = `${percentage}%`;
    document.getElementById('utilizationBar').textContent = `${percentage}% Utilization`;

    // Update metrics
    document.getElementById('billableMetric').textContent = data.billable;
    document.getElementById('onBenchMetric').textContent = data.on_bench;
    document.getElementById('totalMetric').textContent = data.total;
}

// Render all employees section
function renderAllEmployees() {
    const employees = dashboardData.all_employees;
    const tbody = document.getElementById('allEmployeesTableBody');

    tbody.innerHTML = '';

    employees.forEach(emp => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="resource-name">${emp.employee_name}</div>
            </td>
            <td><span class="resource-id">${emp.employee_id}</span></td>
            <td><span class="cost-value">${formatCurrency(emp.ctc)}</span></td>
            <td><span class="cost-value">${formatCurrency(emp.daily_cost)}</span></td>
            <td>${renderSkills(emp.skills)}</td>
        `;
        tbody.appendChild(row);
    });

    // Update header count
    document.getElementById('totalEmployeesCount').textContent = `${employees.length} Total Employees`;
}

// Render summary cards
function renderSummaryCards() {
    const cards = dashboardData.summary_cards;

    // On Bench Now
    document.getElementById('onBenchNowCount').textContent = cards.on_bench_now.count;
    document.getElementById('onBenchNowAmount').textContent = formatCurrency(cards.on_bench_now.amount) + '/mo';

    // Expiring This Month
    document.getElementById('expiringThisMonthCount').textContent = cards.expiring_this_month.count;
    document.getElementById('expiringThisMonthAmount').textContent = formatCurrency(cards.expiring_this_month.amount) + '/mo';

    // Expiring Next Month
    document.getElementById('expiringNextMonthCount').textContent = cards.expiring_next_month.count;
    document.getElementById('expiringNextMonthAmount').textContent = formatCurrency(cards.expiring_next_month.amount) + '/mo';

    // Expiring Next 3 Months
    document.getElementById('expiringNext3MonthsCount').textContent = cards.expiring_next_3_months.count;
    document.getElementById('expiringNext3MonthsAmount').textContent = formatCurrency(cards.expiring_next_3_months.amount) + ' Total';
}

// Render on bench section
function renderOnBench() {
    const data = dashboardData.on_bench;
    const tbody = document.getElementById('onBenchTableBody');

    tbody.innerHTML = '';

    // Update section header
    document.getElementById('onBenchCount').textContent = `${data.employees.length} Resources`;
    document.getElementById('onBenchLoss').textContent =
        `Daily Loss: ${formatCurrency(data.daily_loss)} | Monthly: ${formatCurrency(data.monthly_cost)}`;

    data.employees.forEach(emp => {
        const row = document.createElement('tr');

        // Format previous client display
        let previousClient = 'New Resource';
        if (emp.last_client) {
            if (emp.contracts_with_last_client > 1) {
                previousClient = `${emp.last_client} (${emp.contracts_with_last_client} contracts)`;
            } else {
                previousClient = `${emp.last_client} (${formatDate(emp.last_contract_end)})`;
            }
        }

        row.innerHTML = `
            <td>
                <div class="resource-name">${emp.employee_name}</div>
                <span class="resource-id">${emp.employee_id}</span>
            </td>
            <td><span class="days-badge ${getDaysBadgeClass(emp.days_on_bench)}">${emp.days_on_bench} days</span></td>
            <td><span class="cost-value">${formatCurrency(emp.daily_cost)}</span></td>
            <td><span class="loss-value">${formatCurrency(emp.total_loss)}</span></td>
            <td>
                <div class="client-info">
                    <span class="client-name">${previousClient}</span>
                </div>
            </td>
            <td>${renderSkills(emp.skills)}</td>
        `;
        tbody.appendChild(row);
    });
}

// Render expiring this month section
function renderExpiringThisMonth() {
    const data = dashboardData.expiring_this_month;
    const tbody = document.getElementById('expiringThisMonthTableBody');

    tbody.innerHTML = '';

    // Update section header
    document.getElementById('expiringThisMonthSectionCount').textContent = `${data.contracts.length} Resources`;
    document.getElementById('expiringThisMonthSectionLoss').textContent =
        `Potential Loss: ${formatCurrency(data.potential_loss_daily)}/day | ${formatCurrency(data.potential_loss_monthly)}/month`;

    data.contracts.forEach(contract => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="resource-name">${contract.employee_name}</div>
                <span class="resource-id">${contract.employee_id}</span>
            </td>
            <td><span class="days-badge ${getDaysBadgeClass(contract.days_left)}">${contract.days_left} days</span></td>
            <td><span class="cost-value">${formatCurrency(contract.daily_cost)}</span></td>
            <td>
                <div class="client-info">
                    <span class="client-name">${contract.current_client}</span>
                </div>
            </td>
            <td>${renderSkills(contract.skills)}</td>
        `;
        tbody.appendChild(row);
    });
}

// Render expiring next month section
function renderExpiringNextMonth() {
    const data = dashboardData.expiring_next_month;
    const tbody = document.getElementById('expiringNextMonthTableBody');

    tbody.innerHTML = '';

    // Update section header
    document.getElementById('expiringNextMonthSectionCount').textContent = `${data.contracts.length} Resources`;
    document.getElementById('expiringNextMonthSectionLoss').textContent =
        `Potential Loss: ${formatCurrency(data.potential_loss_daily)}/day | ${formatCurrency(data.potential_loss_monthly)}/month`;

    data.contracts.forEach(contract => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="resource-name">${contract.employee_name}</div>
                <span class="resource-id">${contract.employee_id}</span>
            </td>
            <td><span class="days-badge ${getDaysBadgeClass(contract.days_left)}">${contract.days_left} days</span></td>
            <td><span class="cost-value">${formatCurrency(contract.daily_cost)}</span></td>
            <td>
                <div class="client-info">
                    <span class="client-name">${contract.current_client}</span>
                </div>
            </td>
            <td>${renderSkills(contract.skills)}</td>
        `;
        tbody.appendChild(row);
    });
}

// Render expiring next 3 months section
function renderExpiringNext3Months() {
    const data = dashboardData.expiring_next_3_months;
    const tbody = document.getElementById('expiringNext3MonthsTableBody');

    tbody.innerHTML = '';

    // Update section header
    document.getElementById('expiringNext3MonthsSectionCount').textContent = `${data.contracts.length} Resources`;
    document.getElementById('expiringNext3MonthsSectionLoss').textContent =
        `Potential Loss: ${formatCurrency(data.potential_loss_daily)}/day | ${formatCurrency(data.potential_loss_monthly)}/month`;

    data.contracts.forEach(contract => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <div class="resource-name">${contract.employee_name}</div>
                <span class="resource-id">${contract.employee_id}</span>
            </td>
            <td><span class="days-badge ${getDaysBadgeClass(contract.days_left)}">${contract.days_left} days</span></td>
            <td><span class="cost-value">${formatCurrency(contract.daily_cost)}</span></td>
            <td>
                <div class="client-info">
                    <span class="client-name">${contract.current_client}</span>
                </div>
            </td>
            <td>${renderSkills(contract.skills)}</td>
        `;
        tbody.appendChild(row);
    });
}

// Render total at risk
function renderTotalAtRisk() {
    document.getElementById('totalAtRisk').textContent = formatCurrency(dashboardData.total_at_risk);
}

// Update section titles based on selected month
function updateSectionTitles() {
    const monthIndex = parseInt(document.getElementById('monthSelect').value);

    // Section 2: This month
    document.getElementById('section2Title').textContent = 'EXPIRING THIS MONTH';
    document.getElementById('summaryCard2Label').textContent = 'Expiring This Month';

    // Section 3: Next month
    const nextMonthIndex = (monthIndex + 1) % 12;
    document.getElementById('section3Title').textContent = monthNames[nextMonthIndex].toUpperCase();
    document.getElementById('summaryCard3Label').textContent = `Expiring in ${monthNames[nextMonthIndex]}`;

    // Section 4: Next 3 months
    const month2Index = (monthIndex + 1) % 12;
    const month4Index = (monthIndex + 3) % 12;
    document.getElementById('section4Title').textContent =
        `${monthNamesShort[month2Index]}-${monthNamesShort[month4Index]}`;
    document.getElementById('summaryCard4Label').textContent =
        `Expiring in Next 3 Months (${monthNamesShort[month2Index]}-${monthNamesShort[month4Index]})`;
}

// Update dashboard when month or year is changed
function updateDashboard() {
    const month = parseInt(document.getElementById('monthSelect').value);
    const year = parseInt(document.getElementById('yearSelect').value);

    loadDashboardData(month, year);
}

// Refresh dashboard
function refreshDashboard() {
    const month = parseInt(document.getElementById('monthSelect').value);
    const year = parseInt(document.getElementById('yearSelect').value);

    loadDashboardData(month, year);

    frappe.show_alert({
        message: __('Dashboard refreshed successfully'),
        indicator: 'green'
    }, 3);
}

// Update last update time
function updateLastUpdateTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    document.getElementById('lastUpdateTime').textContent = `${hours}:${minutes}`;
}

// Toggle section collapse
function toggleSection(sectionId) {
    const section = document.getElementById(sectionId);
    section.classList.toggle('collapsed');
}

// Helper: Format currency (JPY)
function formatCurrency(value) {
    if (value === null || value === undefined) return '¥0';

    const absValue = Math.abs(value);
    const sign = value < 0 ? '-' : '';

    if (absValue >= 1000000) {
        return `${sign}¥${(absValue / 1000000).toFixed(1)}M`;
    } else if (absValue >= 1000) {
        return `${sign}¥${(absValue / 1000).toFixed(0)}K`;
    } else {
        return `${sign}¥${Math.round(absValue).toLocaleString()}`;
    }
}

// Helper: Format date
function formatDate(dateString) {
    if (!dateString) return '';

    const date = new Date(dateString);
    const month = monthNamesShort[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month} ${day}, ${year}`;
}

// Helper: Get badge class for days
function getDaysBadgeClass(days) {
    if (days <= 7) return 'days-critical';
    if (days <= 14) return 'days-urgent';
    if (days <= 30) return 'days-high';
    return 'days-normal';
}

// Helper: Render skills
function renderSkills(skills) {
    if (!skills || skills.length === 0) return '<em>No skills listed</em>';

    return `<div class="skills-list">
        ${skills.map(skill => {
            const experience = skill.no_of_years ? `(${skill.no_of_years}y)` : '';
            return `<span class="skill-item"><span class="skill-name">${skill.skill}</span> <span class="skill-years">${experience}</span></span>`;
        }).join('')}
    </div>`;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDashboard);
} else {
    initializeDashboard();
}
