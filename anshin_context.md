# Anshin Theme Project Context

## Project Overview

Anshin Theme is a Frappe/ERPNext app for **Candidate-to-Requirement Matching** in recruitment/staffing operations. The system intelligently matches employees (candidates) to job requirements (Candidate Requirements) based on skills, experience, age, nationality, and contract availability.

---

## 2025-12-16: Contract-Based Filtering & Minimum Availability Logic

### Business Problem

**Challenge:**
Recruiters were seeing candidates in matching results who were:
- Already committed to other clients (under active contracts)
- About to start new contracts that would make them unavailable
- Available for only a short window before next commitment (insufficient for project needs)

**Impact:**
- Proposing unavailable candidates to clients
- Client dissatisfaction when candidates leave too soon
- Wasted time processing candidates who can't fulfill requirements

### Solution Implemented

Added **contract-based intelligent filtering** with configurable minimum availability requirements.

---

## Key Features

### 1. **Minimum Availability Field**

**Location:** Candidate Requirements DocType
**Field Name:** `minimum_availability`
**Type:** Integer (days)
**Label:** "Minimum Availability"

**Purpose:**
Defines the minimum number of days a candidate must be available for the project before their next contract commitment. This ensures candidates have sufficient time to:
- Complete onboarding and training
- Contribute meaningfully to the project
- Provide stability and continuity for the client

**Business Logic:**
- Used to filter candidates with upcoming contract commitments
- Ensures only candidates with adequate availability windows are shown
- Configurable per requirement (short-term vs long-term projects)
- Default value set at DocType level (can be overridden per requirement)

**Example Use Cases:**
- Short-term project: Set to 30 days
- Long-term project: Set to 90 or 180 days
- Critical role: Set to 365 days (1 year commitment)

---

### 2. **Contract Status Filtering**

**Contract DocType:** Standard ERPNext Contract
**Key Fields Used:**
- `party_name` (employee link)
- `party_type` = "Employee"
- `start_date`
- `end_date`
- `docstatus` = 1 (Submitted)

**Contract Types Considered:**
1. **Active Contracts:** `end_date >= CURRENT_DATE`
2. **Future Contracts:** `start_date > CURRENT_DATE`

---

## Complete Matching Logic

### Tier System

Candidates are categorized into 4 tiers based on skill match quality:

| Tier | Criteria | Display |
|------|----------|---------|
| **EXCEEDS** | ≥50% of required skills exceed requirements | ✨ EXCEEDS REQUIREMENTS (Green) |
| **EXACT** | 100% of required skills are exact or exceed | ✓ EXACT MATCH (Blue) |
| **NEAR** | 100% of required skills are exact, near, or exceed | ⚠ NEAR MATCH (Yellow) |
| **POTENTIAL** | ≥80% skill match AND age acceptable (exact or ±2) | 🔍 POTENTIAL MATCH (Gray) |
| **NOT_SHOWN** | Below threshold or unavailable | Hidden |

---

## Contract-Based Filtering Rules

### Rule 1: Hard Exclusion from Top 3 Tiers (EXCEEDS/EXACT/NEAR)

**Condition:**
```
Exclude if ANY active contract exists with:
  end_date >= CURRENT_DATE
```

**Result:** Employee does NOT appear in EXCEEDS, EXACT, or NEAR tiers regardless of skill match quality.

**Rationale:** These tiers represent immediately available top candidates. Contracted employees cannot fulfill immediate requirements.

---

### Rule 2: POTENTIAL Tier - Contract-Based Inclusion

**Show in POTENTIAL tier ONLY if ALL conditions are met:**

#### A. Skills AND Age Qualify
- Must meet BOTH POTENTIAL criteria:
  - Skills: ≥80% required skills match (exact/near/exceeds)
  - Age: Within exact range OR ±2 tolerance

#### B. Active Contract Ends Within Acceptable Window
```sql
active_contract_end < (requirement_start_date + minimum_availability)
```

**Example:**
- Requirement starts: Jan 15, 2026
- Minimum availability: 60 days
- Acceptable window: Up to Mar 16, 2026
- Contract ends: Feb 28, 2026 ✅ (within window)

#### C. Future Contract Doesn't Interfere

**Condition:**
```python
availability_window = future_contract_start - requirement_start_date

IF availability_window < minimum_availability:
    → EXCLUDE (insufficient availability)
```

**Example:**
- Requirement starts: Jan 15, 2026
- Minimum availability: 60 days
- Future contract starts: Feb 20, 2026
- Availability window: 36 days ❌ (less than 60)
- **Result:** NOT_SHOWN

---

### Rule 3: Multiple Contracts - Use Latest End Date

**If employee has multiple overlapping contracts:**
```sql
latest_contract_end = MAX(end_date)
FROM tabContract
WHERE party_name = %(employee)s
  AND party_type = 'Employee'
  AND end_date >= CURRENT_DATE
```

**Example:**
- Contract A: Ends Jun 30, 2026
- Contract B: Ends Dec 31, 2026
- Contract C: Ends Mar 31, 2027
- **Use:** Mar 31, 2027 (latest end date)

**Rationale:** Employee is only truly available after ALL contracts end.

---

### Rule 4: No Requirement Start Date

**If `start_date` is NULL in Candidate Requirements:**
```python
requirement_start_date = CURRENT_DATE
```

**Rationale:** No planned start means immediate hiring, so use today's date for calculations.

---

## Complete Decision Tree

```
FOR EACH EMPLOYEE:

┌─ 1. Hard Filters (Existing Logic)
│  ├─ Nationality matches requirement? NO → NOT_SHOWN
│  ├─ Age within range or ±2 tolerance? NO → NOT_SHOWN
│  └─ PASS → Continue to Contract Check
│
├─ 2. Get Contract Information
│  ├─ active_contract_end = MAX(end_date) WHERE end_date >= CURRENT_DATE
│  ├─ future_contract_start = MIN(start_date) WHERE start_date > CURRENT_DATE
│  └─ min_availability = requirement.minimum_availability (from doctype)
│
└─ 3. Contract-Based Filtering

   ┌─ NO ACTIVE CONTRACT (active_contract_end is NULL)
   │  │
   │  └─ Check Future Contract Interference:
   │     │
   │     ├─ No future contract → Normal Tier Logic (EXCEEDS/EXACT/NEAR/POTENTIAL)
   │     │
   │     └─ Has future contract:
   │        ├─ availability_window = future_contract_start - requirement_start_date
   │        ├─ IF availability_window < min_availability:
   │        │  └─ NOT_SHOWN (insufficient availability)
   │        └─ ELSE:
   │           └─ Normal Tier Logic (EXCEEDS/EXACT/NEAR/POTENTIAL)
   │
   └─ HAS ACTIVE CONTRACT (active_contract_end exists)
      │
      ├─ Check if contract ends within acceptable window:
      │  │
      │  ├─ IF active_contract_end >= (requirement_start_date + min_availability):
      │  │  └─ NOT_SHOWN (contract too long)
      │  │
      │  └─ ELSE (contract ends within acceptable window):
      │     │
      │     └─ Check Future Contract Interference:
      │        │
      │        ├─ No future contract:
      │        │  └─ IF skills qualify for POTENTIAL → POTENTIAL (with contract info)
      │        │     ELSE → NOT_SHOWN
      │        │
      │        └─ Has future contract:
      │           ├─ availability_window = future_contract_start - requirement_start_date
      │           ├─ IF availability_window < min_availability:
      │           │  └─ NOT_SHOWN (insufficient availability after gap)
      │           └─ ELSE:
      │              └─ IF skills qualify for POTENTIAL → POTENTIAL (with contract info)
      │                 ELSE → NOT_SHOWN
```

---

## Example Scenarios

**Given:**
- Requirement starts: Jan 15, 2026
- Minimum availability: 60 days
- Acceptable window ends: Mar 16, 2026 (Jan 15 + 60 days)
- Current date: Dec 16, 2025

### Scenario Matrix

| # | Active Contract | Contract Ends | Future Contract | Future Starts | Availability Window | Skills Match | Final Tier |
|---|----------------|---------------|-----------------|---------------|---------------------|--------------|------------|
| 1 | No | N/A | No | N/A | Infinite | Exact | **EXACT** |
| 2 | No | N/A | Yes | Mar 20, 2026 | 65 days | Exact | **EXACT** (65 > 60) |
| 3 | No | N/A | Yes | Feb 20, 2026 | 36 days | Exact | **NOT_SHOWN** (36 < 60) |
| 4 | Yes | Jan 30, 2026 | No | N/A | Infinite | 80% | **POTENTIAL** |
| 5 | Yes | Jan 30, 2026 | Yes | Mar 20, 2026 | 65 days | 80% | **POTENTIAL** (65 > 60) |
| 6 | Yes | Jan 30, 2026 | Yes | Feb 20, 2026 | 36 days | 80% | **NOT_SHOWN** (36 < 60) |
| 7 | Yes | Apr 30, 2026 | No | N/A | N/A | Exact | **NOT_SHOWN** (Apr 30 > Mar 16) |
| 8 | Yes (past) | Dec 10, 2025 | No | N/A | N/A | Exact | **EXACT** (past contract ignored) |

---

## Implementation Details

### Backend Changes

**File:** `/apps/anshin_theme/anshin_theme/api/candidate_matching.py`

**Key Functions Modified:**

#### 1. `get_employees_with_skills()`
- **Change:** Add LEFT JOIN with Contract table
- **Purpose:** Fetch contract information along with employee data
- **Returns:**
  ```python
  {
      "employee": "EMP-001",
      "employee_name": "Rajesh Kumar",
      "age": 28,
      "nationality": "India",
      "skills": [...],
      "active_contract_end": "2026-01-30",      # NEW
      "future_contract_start": "2026-03-15",    # NEW
      "contract_customer": "Client ABC"         # NEW (optional)
  }
  ```

#### 2. `match_employee_to_requirement()`
- **Change:** Add contract filtering logic before skill matching
- **New Parameters:**
  - `active_contract_end`
  - `future_contract_start`
  - `minimum_availability`
- **Returns:**
  - Candidate object with contract info
  - Tier decision based on both skills AND contract availability

#### 3. `calculate_tier()`
- **Change:** Consider contract status when determining tier
- **Logic:**
  - If active contract exists → Force to POTENTIAL (even if skills qualify for higher)
  - If no contract → Normal skill-based tier calculation

#### 4. New Helper Function: `check_contract_availability()`
```python
def check_contract_availability(
    active_contract_end,
    future_contract_start,
    requirement_start_date,
    minimum_availability
):
    """
    Check if employee's contract status allows them to be shown.

    Returns:
        - ("AVAILABLE", None): Show in normal tiers
        - ("POTENTIAL", contract_info): Show in POTENTIAL with contract details
        - ("EXCLUDED", reason): Do not show
    """
```

---

### Frontend Changes

**File:** `/apps/anshin_theme/anshin_theme/public/js/candidate_matching_algorithms.js`

**Key Changes:**

#### 1. Uncomment POTENTIAL Tier Display
- **Lines:** 143-145 (currently commented)
- **Action:** Uncomment to re-enable POTENTIAL tier section

#### 2. Add Contract Information Display
- **Location:** `render_candidate()` function
- **New Elements:**
  ```javascript
  {
      "contractInfo": {
          "hasContract": true,
          "endsOn": "2026-01-30",
          "customer": "Client ABC",
          "availableFrom": "2026-01-30",
          "daysUntilAvailable": 45
      }
  }
  ```

#### 3. Visual Indicator for Contract Status
```html
📅 Available from: Jan 30, 2026
(Current contract ends Jan 30, 2026)
```

**Display in POTENTIAL tier card:**
```
┌─────────────────────────────────────────────┐
│ 🔍 POTENTIAL MATCH                          │
├─────────────────────────────────────────────┤
│ Rajesh Kumar (EMP-001)                      │
│ 📅 Age 28 | 🌏 India                        │
│ 📅 Available from: Jan 30, 2026             │
│    (Contract with Client ABC ends)          │
│                                             │
│ Required: 4/5 | Preferred: 2/3              │
└─────────────────────────────────────────────┘
```

---

## Edge Cases Handled

### Edge Case 1: Contract Ends on Buffer Boundary
- **Scenario:** Contract ends exactly on (req_start + min_availability)
- **Decision:** Use `<` (strictly less than) → NOT in POTENTIAL
- **Reason:** Conservative approach, safer to exclude boundary cases

### Edge Case 2: Employee Available Now, Future Contract Soon
- **Scenario:** No active contract, but starts new contract before min_availability
- **Decision:** NOT_SHOWN (even if currently available)
- **Reason:** Will be unavailable when requirement starts

### Edge Case 3: Past Contracts
- **Scenario:** Contract ended in the past (before CURRENT_DATE)
- **Decision:** Show in normal tiers (EXCEEDS/EXACT/NEAR)
- **SQL Check:** `end_date >= CURRENT_DATE` excludes past contracts

### Edge Case 4: Multiple Overlapping Contracts
- **Scenario:** Employee has 3 contracts with different end dates
- **Decision:** Use MAX(end_date) - latest end date
- **Reason:** Employee only available after ALL contracts complete

### Edge Case 5: No Requirement Start Date
- **Scenario:** `start_date` field is NULL in Candidate Requirements
- **Decision:** Use CURRENT_DATE as requirement_start_date
- **Reason:** Immediate hiring assumed when no start date specified

---

## Business Benefits

### For Recruiters
✅ **Accurate Availability:** Only see candidates who can actually fulfill the requirement
✅ **Time Savings:** Don't waste time on unavailable candidates
✅ **Better Planning:** See contract end dates for upcoming availability
✅ **Flexible Filtering:** Adjust minimum_availability per project needs

### For Clients
✅ **Quality Assurance:** Candidates proposed have adequate availability commitment
✅ **No Surprises:** No candidates leaving shortly after joining
✅ **Project Continuity:** Sufficient time for onboarding and meaningful contribution
✅ **Professional Service:** Demonstrates thoroughness in candidate vetting

### For Employees
✅ **Accurate Matching:** Only matched to opportunities they can fulfill
✅ **No Conflicts:** System prevents double-booking or overlapping commitments
✅ **Clear Timeline:** Contract obligations considered in matching

---

## Testing Recommendations

### Test Case 1: Employee Under Active Contract (Within Buffer)
**Setup:**
- Employee: EMP-001
- Active contract: Dec 1, 2025 - Jan 30, 2026
- Requirement starts: Jan 15, 2026
- Minimum availability: 60 days
- Skills: 85% match

**Expected Result:** Show in POTENTIAL tier with "Available from: Jan 30, 2026"

---

### Test Case 2: Employee Under Active Contract (Beyond Buffer)
**Setup:**
- Employee: EMP-002
- Active contract: Dec 1, 2025 - Apr 30, 2026
- Requirement starts: Jan 15, 2026
- Minimum availability: 60 days

**Expected Result:** NOT_SHOWN (contract ends Apr 30 > Mar 16 buffer)

---

### Test Case 3: Future Contract Interference
**Setup:**
- Employee: EMP-003
- No active contract
- Future contract: Starts Feb 20, 2026
- Requirement starts: Jan 15, 2026
- Minimum availability: 60 days
- Skills: Exact match

**Expected Result:** NOT_SHOWN (availability window = 36 days < 60 days minimum)

---

### Test Case 4: Sufficient Future Contract Window
**Setup:**
- Employee: EMP-004
- No active contract
- Future contract: Starts Mar 20, 2026
- Requirement starts: Jan 15, 2026
- Minimum availability: 60 days
- Skills: Exact match

**Expected Result:** Show in EXACT tier (availability window = 65 days > 60 days minimum)

---

### Test Case 5: Multiple Contracts - Latest End Date
**Setup:**
- Employee: EMP-005
- Contract A: Ends Jan 30, 2026
- Contract B: Ends Mar 31, 2026
- Requirement starts: Jan 15, 2026
- Minimum availability: 60 days

**Expected Result:** NOT_SHOWN (latest end date Mar 31 > Mar 16 buffer)

---

### Test Case 6: No Minimum Availability Set
**Setup:**
- Employee: EMP-006
- Active contract: Ends Feb 28, 2026
- Requirement starts: Jan 15, 2026
- Minimum availability: NULL (use default from doctype)
- Skills: 80% match

**Expected Result:** Depends on default value set in DocType field

---

## Configuration

### Setting Default Minimum Availability

**Location:** Candidate Requirements DocType
**Path:** Customize Form → minimum_availability field → Default

**Recommended Defaults:**
- **General staffing:** 30 days
- **Professional roles:** 60 days
- **Senior positions:** 90 days
- **Critical/leadership:** 180+ days

**Override per Requirement:**
Users can override the default when creating each Candidate Requirements document.

---

## Files Modified

### Backend Files
- **File:** `/apps/anshin_theme/anshin_theme/api/candidate_matching.py`
  - Main matching logic with contract-based filtering
  - Functions: `get_matched_candidates()`, `match_employee_to_requirement()`, `calculate_tier()`, `check_contract_availability()`

- **File:** `/apps/anshin_theme/anshin_theme/doctype/candidate_requirements/candidate_requirements.json`
  - Added `minimum_availability` field (integer, days)

### Frontend Files
- **File:** `/apps/anshin_theme/anshin_theme/public/js/candidate_matching_algorithms.js`
  - Display logic for contract info and tier rendering
  - Renders EXCEEDS, EXACT, NEAR, and POTENTIAL tiers

### Documentation Files
- **File:** `/apps/anshin_theme/anshin_context.md`
  - This file - complete business logic documentation

---

## Future Enhancements (Planned)

### 1. Make minimum_availability Configurable
- Add global settings for organization-wide defaults
- Role-based minimum availability templates
- Industry-specific presets

### 2. Contract Type Filtering
- Distinguish between full-time, part-time, project-based contracts
- Allow partial availability for part-time candidates
- Multi-client availability for freelancers

### 3. Advanced Availability Visualization
- Timeline view showing contract periods
- Gantt chart for candidate availability windows
- Color-coded availability calendar

### 4. Contract End Date Notifications
- Alert recruiters when contracts are ending soon
- Automated reminders for candidate follow-up
- Integration with requirement matching (auto-match when available)

### 5. Availability Forecasting
- Predict candidate availability based on historical contract patterns
- Suggest optimal hiring timing
- Capacity planning for upcoming requirements

---

## Technical Notes

### Database Performance Considerations

**Contract Table Indexing:**
```sql
-- Recommended indexes for optimal query performance
CREATE INDEX idx_contract_party ON `tabContract`(party_type, party_name, docstatus);
CREATE INDEX idx_contract_dates ON `tabContract`(start_date, end_date);
```

**Query Optimization:**
- Use LEFT JOIN to fetch contract info in single query
- Avoid N+1 queries (fetching contracts per employee)
- Consider caching contract data for frequently accessed employees

### Error Handling

**Missing minimum_availability:**
```python
min_availability = requirement.minimum_availability or 0
# If 0, no contract-based filtering applied (backward compatible)
```

**Invalid Dates:**
```python
if not requirement_start_date:
    requirement_start_date = frappe.utils.nowdate()
```

**Contract Data Integrity:**
- Handle NULL start_date or end_date gracefully
- Validate date ranges (end_date >= start_date)
- Log warnings for data quality issues

---

## Related Documentation

### Frappe/ERPNext Standard DocTypes Used
- **Contract:** [ERPNext Contract Documentation](https://docs.erpnext.com/docs/user/manual/en/human-resources/contract)
- **Employee:** [ERPNext Employee Documentation](https://docs.erpnext.com/docs/user/manual/en/human-resources/employee)

### Custom DocTypes
- **Candidate Requirements:** Job opening/requirement specification
- **Skill Child:** Skills table with proficiency levels

### Related APIs
- `get_all_requirements()` - Fetch all requirements for dropdown
- `get_matched_candidates(requirement_id)` - Main matching API
- `get_requirement_skills(requirement_id)` - Fetch required/preferred skills
- `get_employees_with_skills()` - Fetch all active employees with skills and contracts

---

## 2025-12-19: Bug Fix - Contract Status Field Issue

### Problem Identified

**Issue:** Candidates with future contracts were incorrectly appearing in matching results even when their availability window was insufficient.

**Example Case:**
- Requirement: Kanumatsu Japan-12-2025-0054
  - Start Date: 2026-01-01
  - Minimum Availability: 365 days
- Employee: HR-EMP-00110
  - Contract: CON-2025-00006-2
  - Start Date: 2026-06-01
  - End Date: 2026-08-31
  - **Status: Inactive**
- Expected: Should be EXCLUDED (availability window = 151 days < 365 days)
- Actual: Was showing in EXCEEDS tier ❌

### Root Cause

The contract queries in `get_employees_with_skills()` were filtering by `status = 'Active'`:

```python
# OLD CODE (BUGGY)
WHERE custom_candidate = %(employee)s
  AND docstatus = 1
  AND status = 'Active'  # ❌ This excluded Inactive future contracts
  AND start_date > CURDATE()
```

**Problem:** Contracts that are signed but not yet started may have `status = 'Inactive'`, even though they represent valid future commitments. The code was ignoring these contracts, causing candidates to appear available when they weren't.

### Solution

**Changed approach:** Check **contract dates only**, not the `status` field.

**Rationale:**
1. **Contract Status Field** (`status`) indicates operational state:
   - `Active` - Currently in effect
   - `Inactive` - Not yet started OR ended (ambiguous)

2. **DocStatus Field** (`docstatus`) indicates document lifecycle:
   - `0` - Draft
   - `1` - Submitted (valid contract)
   - `2` - Cancelled (invalid contract)

3. **Date Fields** provide definitive availability information:
   - `end_date >= CURDATE()` - Contract is current or future
   - `start_date > CURDATE()` - Contract starts in the future

**Fix Applied:**
```python
# NEW CODE (FIXED)
# Active contracts query
WHERE custom_candidate = %(employee)s
  AND docstatus = 1  # Only submitted contracts (excludes cancelled)
  AND end_date >= CURDATE()  # Contract hasn't ended yet

# Future contracts query
WHERE custom_candidate = %(employee)s
  AND docstatus = 1  # Only submitted contracts (excludes cancelled)
  AND start_date > CURDATE()  # Contract starts in the future
```

### Code Changes

**File:** `/apps/anshin_theme/anshin_theme/api/candidate_matching.py`

**Lines 298-308:** Active contract query
- Removed `AND status = 'Active'`
- Added comment explaining the logic

**Lines 312-321:** Future contract query
- Removed `AND status = 'Active'`
- Added comment explaining that `docstatus = 1` already excludes cancelled contracts

### Verification

After fix, the query correctly detects:
- **Active Contract End:** 2026-08-31 (contract ends in future)
- **Future Contract Start:** 2026-06-01 (contract starts in future)

**Calculation:**
- Requirement Start: 2026-01-01
- Future Contract Start: 2026-06-01
- Availability Window: 151 days
- Minimum Required: 365 days
- **Result:** EXCLUDED ✅ (151 < 365)

### Key Learnings

1. **Don't rely on status fields for availability logic** - Use actual dates
2. **Contract status is operational state, not availability state**
3. **DocStatus handles cancellation** - No need to check status field for cancelled contracts
4. **Inactive doesn't mean invalid** - Future contracts may be Inactive until they start

### Impact

- Candidates with insufficient availability windows are now correctly excluded
- Future contracts (regardless of Active/Inactive status) are properly considered
- Only cancelled contracts (docstatus = 2) are ignored, as intended

---

## 2025-12-20: Resource Revenue Management Dashboard - Business Logic

### Overview

**Purpose:** Sales planning and action tool to proactively manage contract expirations and prevent revenue loss by finding new placements before employees go on bench.

**Business Goal:** Sales team needs visibility into upcoming contract expirations to set targets and prevent employees from going on bench (which means paying salaries without incoming revenue).

---

### Key Doctypes Used

#### Employee Doctype
**Base ERPNext Fields:**
- `employee_name` - Full name
- `employee` (ID) - Employee ID (e.g., HR-EMP-00100)
- `ctc` - Cost to Company (Annual)
- `custom_employee_skills` - Child table linking to Skill Child doctype

**Calculated Fields:**
- `daily_cost = ctc ÷ 365` (runtime calculation, not stored)
- `monthly_salary = ctc ÷ 12` (for margin calculations)

#### Contract Doctype
**Base ERPNext Fields:**
- `party_type` - "Employee" for employee contracts
- `party_name` - Link to Customer (client name)
- `custom_candidate` - Link to Employee (the resource assigned)
- `start_date` - Contract start date
- `end_date` - Contract end date
- `docstatus` - 1 = Submitted (valid contract)

**Custom Fields:**
- `custom_unit_price` - **Monthly billing rate** (revenue per month)
- `custom_unit_price_currency` - Currency (default JPY)
- `custom_employment_structure` - Employment type

---

### Dashboard Sections & Logic

#### Section 1: Header (Month/Year Selector)

**Month/Year Dropdowns:**
- **Default Selection:** Current month and current year (auto-set via JavaScript on page load)
- **Generation:** JavaScript dynamically generates options
  - Months: January-December (static)
  - Years: Calculated range (e.g., 2020 to current_year + 1)
- **Purpose:** Allows users to view historical data or plan for future months

**When User Changes Selection:**
- Calls backend API: `get_dashboard_data(month, year)`
- Updates all dashboard sections with data for selected month
- Use case: "What will January 2026 look like?" for forward planning

---

#### Section 2: Revenue Summary Cards (Top 3 Cards)

##### Card 1: Active Revenue (This Month)

**Filters for Active Contracts:**
- `docstatus = 1` (submitted)
- `start_date <= last_day_of_selected_month`
- `end_date >= first_day_of_selected_month`
- `custom_candidate IS NOT NULL` (employee assigned)

**Calculations:**
```python
active_revenue = SUM(custom_unit_price) for all active contracts
billable_count = COUNT(DISTINCT custom_candidate) from active contracts
average_rate = active_revenue ÷ billable_count
```

**Display:**
- Main Value: ¥28.5M (Active Revenue)
- Subtitle: "From 60 active resources" (Billable Count)
- Breakdown:
  - Billable: 60
  - Avg Rate: ¥475K

---

##### Card 2: Net Margin (This Month)

**Salary Costs Calculation:**
- Get all billable employees (employees with active submitted contracts in selected month)
- For each billable employee: `monthly_salary = ctc ÷ 12`
- `total_salary_costs = SUM(monthly_salary)` for all billable employees

**Net Margin Calculation:**
```python
net_margin = active_revenue - total_salary_costs
margin_percentage = (net_margin / active_revenue) × 100
```

**Display:**
- Main Value: ¥23.7M (Net Margin)
- Subtitle: "Revenue - Salary Costs"
- Breakdown:
  - Margin %: 83%
  - ~~Target: 85%~~ (COMMENTED OUT - not needed)

---

##### Card 3: Bench Cost Impact

**Bench Cost Calculation:**
- For selected month, calculate cost for employees on bench at ANY point
- Uses actual days on bench so far + projected days remaining in month
- `bench_cost = SUM(days_on_bench_in_month × daily_cost)` for all bench employees

**Bench Employee Count:**
- Count of employees on bench at any point in selected month (actual + projected)

**Action Items Calculation:**
```python
action_items = on_bench_count + expiring_this_month_count + expiring_next_month_count
```

**At Risk Calculation:**
- Sum of **CTC-based costs** for contracts expiring in next 3 months
- For each expiring contract:
  - Calculate days from (end_date + 1) to (end of 3-month window)
  - Cost = days × (employee_ctc ÷ 365)
- `total_at_risk = SUM(all individual at-risk costs)`

**Display:**
- Main Value: -¥4.8M (Bench Cost for selected month)
- Subtitle: "12 resources without billing"
- Breakdown:
  - Action Items: 35 (on bench + expiring this month + expiring next month)
  - At Risk: ¥27.8M (total CTC cost for next 3 months if not placed)
  - ~~Actions button~~ (COMMENTED OUT)

---

#### Section 3: Utilization Bar

**Utilization Percentage:**
```python
utilization = (billable_count / total_active_employees) × 100
```

**Metrics:**
- Billable: Count of employees with active contracts
- On Bench: Count of employees without active contracts
- Total: Total active employees

**Display:**
- Progress bar showing utilization percentage
- Three metrics below: Billable (green), On Bench (orange), Total (gray)

---

#### Section 4: All Employees Section (Collapsible)

**Purpose:** Complete list of all active employees with CTC and skills

**Data Displayed:**
- Employee name + ID
- CTC (Annual)
- Daily Cost (ctc ÷ 365)
- Skills & Experience (from custom_employee_skills)

**Default State:** Collapsed (to save space)

---

#### Section 5: Summary Cards (4 Cards)

**Note:** These cards display **TOTAL COSTS** (not per month)

##### Card 1: On Bench Now
- **Count:** Employees on bench at any point in selected month (actual + projected)
- **Amount:** Total bench cost for selected month (CTC-based)
- **Status:** "LOSING NOW"

##### Card 2: Expiring This Month
- **Count:** Contracts ending in selected month
- **Amount:** **Prorated CTC cost** for remaining days in month
  - Example: Contract expires Dec 22 → Cost for Dec 23-31 (9 days) × (CTC ÷ 365)
- **Status:** "IF NOT PLACED"

##### Card 3: Expiring Next Month
- **Count:** Contracts ending in next month
- **Amount:** **Prorated CTC cost** for remaining days in that month
  - Example: Contract expires Jan 15 → Cost for Jan 16-31 (16 days) × (CTC ÷ 365)
- **Status:** "IF NOT PLACED"

##### Card 4: Expiring in Next 3 Months
- **Count:** Contracts ending anywhere from Month+1 to Month+3
- **Amount:** **TOTAL prorated CTC cost** from each contract end to end of 3-month window
  - Example viewing Dec: Contract expires Jan 15 → Cost for Jan 16 to Mar 31 (74 days) × (CTC ÷ 365)
- **Display:** "¥12,000,000 Total" (NOT per month - total for entire period)
- **Status:** "IF NOT PLACED"

---

#### Section 6: Total At Risk (Gradient Banner)

**Calculation:**
```python
total_at_risk = card2_amount + card3_amount + card4_amount
```

**Display:**
- Label: "TOTAL AT RISK (Monthly)"
- Value: ¥27,840,000 (sum of all expiring contract costs - CTC based)
- **Note:** Despite label saying "Monthly", this is the TOTAL cost for all expiring contracts across the 3-month window

---

#### Section 7: On Bench Detail Section (Collapsible Table)

**Filters:**
- Employees on bench at ANY point in selected month
  - Case 1: No active contract as of today
  - Case 2: Contract expires during selected month

**Calculations:**

**Days on Bench (Column):**
- **Cumulative days** from when employee first went on bench to TODAY
- Example: Went on bench Nov 15, viewing Dec 20 → Shows 36 days

**Total Loss (Column):**
- Cumulative cost since bench started
- `total_loss = cumulative_days × daily_cost`

**Section Header "Monthly Cost":**
- Cost for selected month ONLY (actual + projected days)
- Example viewing December, today is Dec 20:
  - Employee on bench since Nov 15
  - Dec cost = 31 days × daily_cost (entire December)

**Previous Client (Column):**
- Shows employment history for credibility assessment
- **For employees with expired contracts:**
  - Display: "Client Name (End Date)" - e.g., "Kanumatsu Japan (Nov 15)"
  - If multiple contracts: Show most recent + count - e.g., "Kanumatsu Japan (3 contracts)"
- **For employees never contracted:**
  - Display: "New Resource" or "-"
- **Purpose:** Provides context for sales team to assess employee credibility and previous client relationships

**Table Columns:**
1. Resource (name + ID)
2. Days on Bench (cumulative from bench start)
3. Daily Cost (ctc ÷ 365)
4. Total Loss (cumulative days × daily_cost)
5. Previous Client (most recent expired contract)
6. Skills & Experience
7. ~~Actions~~ (COMMENTED OUT)

---

#### Sections 8-10: Expiring Contract Detail Sections

**Three sections:**
1. Expiring This Month - ACT NOW
2. Expiring Next Month - START MATCHING
3. Expiring in Next 3 Months - MONITOR

**Filters:**
- Contracts where `end_date` falls in the respective period
- `docstatus = 1` (submitted)
- `custom_candidate IS NOT NULL`

**Table Columns:**
1. Resource (name + ID)
2. Days Left (until contract ends from today)
3. Daily Cost (ctc ÷ 365)
4. Current Client (party_name from contract)
5. Skills & Experience
6. ~~Actions~~ (COMMENTED OUT)

**Section Header Amount:**
- **Prorated CTC cost** for remaining days in that specific period
- Calculation varies by section (explained in Summary Cards above)

---

### Key Business Rules Summary

1. **All costs are CTC-based** - Focus is on money going out (salary costs)
2. **Revenue is from custom_unit_price** - Monthly billing rate
3. **Daily cost = CTC ÷ 365** - Calculated runtime, not stored
4. **Monthly salary = CTC ÷ 12** - For margin calculations
5. **Contract status field IGNORED** - Only check docstatus=1 and date ranges
6. **Prorated calculations** - Costs calculated based on actual/projected days in period
7. **Display format change** - Card 4 shows "Total" not "/mo"
8. **Comments removed** - Target margin and Action buttons

---

### Month Selector Dynamic Behavior

**When user selects different month:**
- "Expiring This Month" = Contracts ending in selected month
- "Expiring Next Month" = Contracts ending in (selected_month + 1)
- "Expiring in Next 3 Months" = Contracts ending from (selected_month + 1) to (selected_month + 3)

**Example:**
- **Viewing December 2025:**
  - This Month = December
  - Next Month = January
  - Next 3 Months = Jan-Mar

- **Viewing March 2026:**
  - This Month = March
  - Next Month = April
  - Next 3 Months = Apr-Jun

---

### Backend Data Structure for "On Bench" Section

**API Response Enhancement:**

For each employee on bench, the backend should return:

```python
{
    "employee": "HR-EMP-00049",
    "employee_name": "Hana",
    "days_on_bench": 36,
    "daily_cost": 110203,
    "total_loss": 3967308,
    "skills": [...],

    # NEW FIELDS for Previous Client display:
    "last_client": "Kanumatsu Japan",           # Most recent expired contract client
    "last_contract_end": "2025-11-15",          # Date in YYYY-MM-DD format
    "total_contract_count": 3,                  # Total contracts with any client
    "contracts_with_last_client": 2             # Count with most recent client
}
```

**Query Logic:**

```sql
-- Get most recent expired contract for employee
SELECT
    party_name as last_client,
    end_date as last_contract_end,
    COUNT(*) as contracts_with_last_client
FROM tabContract
WHERE custom_candidate = %(employee)s
  AND docstatus = 1
  AND end_date < CURDATE()
GROUP BY party_name
ORDER BY end_date DESC
LIMIT 1
```

**Display Logic:**

```python
if last_client:
    if contracts_with_last_client > 1:
        display = f"{last_client} ({contracts_with_last_client} contracts)"
    else:
        # Format date as "MMM DD" for display
        display = f"{last_client} ({format_date(last_contract_end)})"
else:
    display = "New Resource"
```

---

### Implementation Files

#### Backend API
**File:** `/apps/anshin_theme/anshin_theme/api/revenue_dashboard.py`

**Functions:**
- `get_dashboard_data(month, year)` - Main API endpoint that returns complete dashboard data
- `get_revenue_summary(first_day, last_day)` - Calculates revenue cards (Active Revenue, Net Margin, Bench Cost)
- `get_utilization_metrics(first_day, last_day)` - Calculates utilization bar (Billable %, counts)
- `get_all_employees()` - Returns complete employee list with CTC, skills, and experience
- `get_on_bench_employees(first_day, last_day)` - Returns bench employees with previous client info
- `get_expiring_contracts(first_day, last_day, next_month_first, next_month_last, three_months_last)` - Returns all expiring contract categories

**Key Calculations:**
- Daily Cost: `ctc ÷ 365` (runtime, not stored)
- Monthly Salary: `ctc ÷ 12` (for margin calculations)
- Prorated costs for partial months
- Previous client detection from last submitted contract end date

#### Frontend JavaScript
**File:** `/apps/anshin_theme/anshin_theme/public/js/revenue_dashboard.js`

**Main Functions:**
- `loadDashboardData()` - Fetches data from API and renders all sections
- `updateDashboard()` - Triggered when month/year selection changes
- `refreshDashboard()` - Manual refresh triggered by Refresh button
- `toggleSection(sectionId)` - Collapses/expands dashboard sections

**Rendering Functions:**
- `renderRevenueSummary(data)` - Renders top 3 revenue cards
- `renderUtilizationMetrics(data)` - Renders utilization bar and metrics
- `renderAllEmployees(employees)` - Renders complete employee list table
- `renderOnBench(employees)` - Renders bench employees with previous client
- `renderExpiringContracts(contracts, sectionId)` - Renders expiring contract tables

**Helper Functions:**
- `formatCurrency(value)` - Formats yen amounts (e.g., ¥28.5M)
- `formatDate(dateString)` - Formats dates as "MMM DD, YYYY"
- `renderSkills(skills)` - Renders skill list with experience years
- `getDaysBadgeClass(days)` - Returns CSS class for urgency badges

**Auto-initialization:**
- Sets current month/year on page load
- Calls `loadDashboardData()` on DOM ready

#### HTML Template
**File:** `/apps/anshin_theme/revenue_dashboard_html.txt` (working copy)

**Deployed Location:** Frappe Web Page → "Revenue Dashboard" → Main Section field

**Structure:**
- Gradient header with month/year selectors and refresh button
- Revenue summary cards (3 cards)
- Utilization bar with metrics
- All Employees section (collapsible, scrollable)
- Summary cards (4 cards for bench and expiring contracts)
- Total At Risk banner
- Detail sections (all collapsible, scrollable):
  - On Bench (critical priority)
  - Expiring This Month (urgent priority)
  - Expiring Next Month (high priority)
  - Expiring Next 3 Months (planning priority)

**Styling Features:**
- Compact headers with reduced padding (10px vertical)
- Collapsible sections with toggle arrows
- Max-height 500px with scrollbars for all detail sections
- Color-coded priority indicators
- Responsive design with mobile breakpoints

#### Web Page Setup
**Type:** Frappe Web Page doctype
**Route:** `/revenue-dashboard`
**Title:** Resource Revenue Management Dashboard
**Published:** Yes

**JavaScript Includes:**
- `/assets/anshin_theme/js/revenue_dashboard.js` (loaded via script tag in Main Section)

**External Dependencies:**
- Google Fonts: Inter font family (weights 300-800)
- Frappe Framework JS for API calls

---

### Deployment Workflow

1. **Backend Changes (Python):**
   - Edit: `/apps/anshin_theme/anshin_theme/api/revenue_dashboard.py`
   - No build required (Python changes take effect immediately after save)
   - May need to restart bench in development mode

2. **Frontend Changes (JavaScript):**
   - Edit: `/apps/anshin_theme/anshin_theme/public/js/revenue_dashboard.js`
   - **Build required:** `bench build --app anshin_theme`
   - Hard refresh browser (Ctrl+Shift+R / Cmd+Shift+R)

3. **HTML/CSS Changes:**
   - Edit: `/apps/anshin_theme/revenue_dashboard_html.txt`
   - Copy entire contents to Web Page → Revenue Dashboard → Main Section
   - Save Web Page
   - **No build required** - changes take effect immediately
   - Normal browser refresh

---

### UI Elements to Comment Out

1. ~~Target: 85%~~ in Net Margin card breakdown
2. ~~Actions button~~ in all table sections
3. Update Card 4 display from "¥12,000,000/mo" to "¥12,000,000 Total"

---

*Last Updated: 2025-12-22*
*Session: Revenue Management Dashboard Implementation + UI Optimization + Documentation*
