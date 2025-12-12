// candidate_matching_page.js
// Place this in: {your_app}/{your_app}/public/js/candidate_matching_page.js

// candidate_matching_page.js
window.candidate_matching = window.candidate_matching || {};
window.candidate_matching = {
    init: function () {
        const container = document.getElementById('candidate-matching-container');

        if (!container) {
            console.error('Container not found');
            return;
        }

        load_requirements();
        setup_requirement_selector();
    }
};

function get_query_param(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
}
function load_requirements() {
    frappe.call({
        method: 'anshin_theme.api.candidate_matching.get_all_requirements',
        callback: function(r) {
            if (r.message.success ) {
                populate_requirement_dropdown(r.message.data);
            } else {
                frappe.msgprint(__('Error loading requirements: ' + r.message.message));
            }
		const preselected = get_query_param('requirement');
            if (preselected) {
                auto_select_requirement(preselected);
            }
        },
        error: function(r) {
            frappe.msgprint(__('Error loading requirements'));
        }
    });
}

function populate_requirement_dropdown(requirements) {
    const select = document.getElementById('requirement-select');
    
    if (!select) return;
    
    // Clear existing options except first
    select.innerHTML = '<option value="">── Choose a requirement to begin matching ──</option>';
    
    // Add requirements
    requirements.forEach(req => {
        const option = document.createElement('option');
        option.value = req.name;
        option.textContent = `${req.name} - ${req.project_name || req.customer} (${req.number_of_positions} position${req.number_of_positions > 1 ? 's' : ''})`;
        select.appendChild(option);
    });
}

function setup_requirement_selector() {
    const select = document.getElementById('requirement-select');
    
    if (!select) return;
    
    select.addEventListener('change', function() {
        const reqId = this.value;
        
        if (!reqId) {
            hide_requirement_info();
            show_no_selection();
            return;
        }
        
        // Show loading
        show_loading();
        
        // Load matched candidates
        frappe.call({
            method: 'anshin_theme.api.candidate_matching.get_matched_candidates',
            args: {
                requirement_id: reqId
            },
            callback: function(r) {
                if (r.message.success) {
			console.log("Message",r.message.requirement)
                    display_requirement_info(r.message.requirement);
                    display_matched_candidates(r.message.requirement, r.message.matches);
                } else {
                    frappe.msgprint(__('Error: ' + r.message.message));
                    show_no_selection();
                }
            },
            error: function(r) {
                frappe.msgprint(__('Error loading candidates'));
                show_no_selection();
            }
        });
    });
}
function display_requirement_info(req) {
    const customer = document.getElementById('info-customer');
    const age = document.getElementById('info-age');
    const nationality = document.getElementById('info-nationality');
    const required = document.getElementById('info-required');
    const preferred = document.getElementById('info-preferred');
    const wrapper = document.getElementById('requirement-info');

    if (!customer || !age || !nationality || !required || !preferred || !wrapper) {
        console.error('Requirement info elements missing in HTML');
        return;
    }

    customer.textContent = req.customer || '-';
    age.textContent = req.age || '-';
    nationality.textContent = req.nationality || '-';
    required.textContent = req.required ? req.required.length : 0;
    preferred.textContent = req.preferred ? req.preferred.length : 0;

    wrapper.classList.add('active');
}

function display_matched_candidates(req, matches) {
    const resultsDiv = document.getElementById('results');
    let html = '';
    
    // EXCEEDS
    if (matches.exceeds && matches.exceeds.length > 0) {
        html += render_tier('✨ EXCEEDS REQUIREMENTS', 'exceeds', matches.exceeds, req);
    }
    
    // EXACT
    if (matches.exact && matches.exact.length > 0) {
        html += render_tier('✓ EXACT MATCH', 'exact', matches.exact, req);
    }
    
    // NEAR
    if (matches.near && matches.near.length > 0) {
        html += render_tier('⚠ NEAR MATCH', 'near', matches.near, req);
    }
    
    // POTENTIAL
//    if (matches.potential && matches.potential.length > 0) {
//        html += render_tier('🔍 POTENTIAL MATCH', 'potential', matches.potential, req);
//    }
    
    if (!html) {
        html = '<div class="no-selection"><h3>No matching candidates found</h3></div>';
    }
    
    resultsDiv.innerHTML = html;
}

function render_tier(title, tier, candidates, req) {
    let html = `
        <div class="tier-section">
            <div class="tier-header tier-${tier}">
                <span>${title}</span>
                <span class="badge badge-success">${candidates.length} candidate${candidates.length > 1 ? 's' : ''}</span>
            </div>
    `;
    
    candidates.forEach(candidate => {
        html += render_candidate(candidate, req);
    });
    
    html += '</div>';
    return html;
}

function render_candidate(candidate, req) {
    const reqTotal = req.required ? req.required.length : 0;
    
    return `
        <div class="candidate-card">
            <div class="candidate-header">
                <div class="candidate-info">
                    <h3>${candidate.name}</h3>
                    <div class="candidate-meta">
                        <span>🆔 ${candidate.id}</span>
                        <span>📅 Age ${candidate.age}${candidate.ageStatus ? ' (' + candidate.ageStatus + ')' : ''}</span>
                        <span>🌏 ${candidate.nationality}</span>
                    </div>
                </div>
                <div class="candidate-stats">
                    <div class="stat">
                        <div class="stat-label">Required</div>
                        <div class="stat-value ${candidate.reqMissing === 0 ? 'good' : 'warning'}">
                            ${candidate.reqExceeds + candidate.reqExact + candidate.reqNear}/${reqTotal}
                        </div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Exceeds</div>
                        <div class="stat-value good">${candidate.reqExceeds}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Exact</div>
                        <div class="stat-value good">${candidate.reqExact}</div>
                    </div>
                    <div class="stat">
                        <div class="stat-label">Near</div>
                        <div class="stat-value warning">${candidate.reqNear}</div>
                    </div>
                    ${candidate.reqBelow > 0 ? `
                        <div class="stat">
                            <div class="stat-label">Below</div>
                            <div class="stat-value bad">${candidate.reqBelow}</div>
                        </div>
                    ` : ''}
                    ${candidate.reqMissing > 0 ? `
                        <div class="stat">
                            <div class="stat-label">Missing</div>
                            <div class="stat-value bad">${candidate.reqMissing}</div>
                        </div>
                    ` : ''}
                    <div class="stat">
                        <div class="stat-label">Preferred</div>
                        <div class="stat-value ${candidate.prefMatched === candidate.prefTotal ? 'good' : 'warning'}">
                            ${candidate.prefMatched}/${candidate.prefTotal}
                        </div>
                    </div>
                </div>
            </div>
            <div class="skills-grid">
                ${candidate.skills.map(skill => render_skill(skill)).join('')}
            </div>
        </div>
    `;
}

function render_skill(skill) {
    const maxYears = Math.max(skill.reqYears || 0, skill.empYears || 0, 10);
    const reqWidth = skill.reqYears > 0 ? (skill.reqYears / maxYears * 100) : 10;
    const empWidth = skill.empYears > 0 ? (skill.empYears / maxYears * 100) : (skill.status === 'missing' ? 0 : 10);
    
    const statusClass = `status-${skill.status}`;
    const barClass = `bar-${skill.status}`;
    
    const skillTypeTag = skill.type === 'preferred' ? 
        '<span class="skill-type preferred">PREFERRED</span>' : 
        '<span class="skill-type required">REQUIRED</span>';
    
    return `
        <div class="skill-row">
            <div class="skill-name">
                <span>${skill.name}</span>
                ${skillTypeTag}
            </div>
            <div class="skill-comparison">
                <div class="bar-wrapper">
                    <span class="bar-label">Required</span>
                    <div class="bar-container">
                        <div class="bar bar-required" style="width: ${reqWidth}%">
                            ${skill.reqYears > 0 ? skill.reqYears + ' years' : 'Required'}
                        </div>
                    </div>
                </div>
                <div class="bar-wrapper">
                    <span class="bar-label">Candidate</span>
                    <div class="bar-container">
                        <div class="bar ${barClass}" style="width: ${empWidth}%">
                            ${skill.status === 'missing' ? 'Missing' : (skill.empYears > 0 ? skill.empYears + ' years' : 'Has')}
                        </div>
                    </div>
                </div>
            </div>
            <div class="skill-status ${statusClass}">
                ${skill.status === 'exceeds' ? '✨ Exceeds' : 
                  skill.status === 'exact' ? '✓ Exact' : 
                  skill.status === 'near' ? '⚠ Near' : 
                  skill.status === 'below' ? '⬇ Below' : 
                  '✗ Missing'}
            </div>
        </div>
    `;
}

function show_loading() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `
        <div class="no-selection">
            <div class="spinner-border text-primary" role="status">
                <span class="sr-only">Loading...</span>
            </div>
            <h3>Loading candidates...</h3>
        </div>
    `;
}

function show_no_selection() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = `
        <div class="no-selection">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
            </svg>
            <h3>Select a requirement above to view intelligent candidate matches</h3>
        </div>
    `;
}

function hide_requirement_info() {
    document.getElementById('requirement-info').classList.remove('active');
}

// Initialize when DOM is ready
$(document).ready(function() {
    candidate_matching.init();
});

function auto_select_requirement(requirement_id) {
    const select = document.getElementById('requirement-select');
    if (!select) return;

    // ✅ Keep retrying until option exists
    const options = Array.from(select.options);
    const match = options.find(opt => opt.value === requirement_id);

    if (!match) {
        // options not ready yet → retry
        setTimeout(() => auto_select_requirement(requirement_id), 100);
        return;
    }

    select.value = requirement_id;

    // ✅ Force change event
    select.dispatchEvent(new Event('change', { bubbles: true }));
}

