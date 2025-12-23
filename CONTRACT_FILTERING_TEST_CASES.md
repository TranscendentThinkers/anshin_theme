# Contract-Based Filtering - Test Cases

## Test Setup Information

**Test Requirement:**
- **Requirement ID:** Kanumatsu Japan-12-2025-0054
- **Customer:** Kanumatsu Japan
- **Nationality:** Japan
- **Age Range:** (check actual values in requirement)
- **Start Date:** (check actual value)
- **Minimum Availability:** (check actual value - default or custom)

**Test Employee:**
- **Employee ID:** HR-EMP-00109
- **Name:** Ryota
- **Nationality:** Japan
- **Contract:** CON-2025-00004
  - Start Date: 2025-12-01
  - End Date: 2026-03-31
  - Status: Active
  - DocStatus: 1 (Submitted)

---

## Test Case Categories

### A. Contract Status Tests
### B. Contract Date Range Tests
### C. Minimum Availability Tests
### D. Multiple Contracts Tests
### E. Future Contracts Tests
### F. Skill-Based Tier Tests (with contracts)

---

## A. CONTRACT STATUS TESTS

### Test Case A1: Active Contract - Should Filter
**Objective:** Verify that employee with Active contract is filtered from top tiers

**Setup:**
```sql
-- Contract exists with:
-- status = 'Active'
-- docstatus = 1
-- end_date = 2026-03-31 (future)
```

**Steps:**
1. Open Candidate Requirements: Kanumatsu Japan-12-2025-0054
2. Click "Open Matching Dashboard"
3. Verify Ryota (HR-EMP-00109) appears in results

**Expected Result:**
- Ryota should **NOT** appear in EXCEEDS/EXACT/NEAR tiers
- Ryota should appear in **POTENTIAL** tier (if skills qualify)
- Contract info should show: "Available from: 2026-03-31" with yellow background

---

### Test Case A2: Inactive Contract - Should NOT Filter
**Objective:** Verify that employee with Inactive contract is treated as available

**Setup:**
```sql
UPDATE `tabContract`
SET status = 'Inactive'
WHERE name = 'CON-2025-00004';
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should appear in normal tier based on skills (EXCEEDS/EXACT/NEAR)
- NO contract info should be displayed
- Behaves as if no active contract exists

**Cleanup:**
```sql
UPDATE `tabContract`
SET status = 'Active'
WHERE name = 'CON-2025-00004';
```

---

### Test Case A3: Unsigned Contract - Should NOT Filter
**Objective:** Verify that unsigned contract doesn't affect matching

**Setup:**
```sql
UPDATE `tabContract`
SET status = 'Unsigned'
WHERE name = 'CON-2025-00004';
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should appear in normal tier based on skills
- NO contract filtering applied

**Cleanup:**
```sql
UPDATE `tabContract`
SET status = 'Active'
WHERE name = 'CON-2025-00004';
```

---

### Test Case A4: Draft Contract (docstatus=0) - Should NOT Filter
**Objective:** Verify that draft contracts don't affect matching

**Setup:**
```sql
UPDATE `tabContract`
SET docstatus = 0
WHERE name = 'CON-2025-00004';
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should appear in normal tier based on skills
- NO contract filtering applied (draft contract ignored)

**Cleanup:**
```sql
UPDATE `tabContract`
SET docstatus = 1
WHERE name = 'CON-2025-00004';
```

---

### Test Case A5: Cancelled Contract (docstatus=2) - Should NOT Filter
**Objective:** Verify that cancelled contracts don't affect matching

**Setup:**
```sql
UPDATE `tabContract`
SET docstatus = 2
WHERE name = 'CON-2025-00004';
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should appear in normal tier based on skills
- NO contract filtering applied

**Cleanup:**
```sql
UPDATE `tabContract`
SET docstatus = 1
WHERE name = 'CON-2025-00004';
```

---

## B. CONTRACT DATE RANGE TESTS

### Test Case B1: Past Contract (Already Ended) - Should NOT Filter
**Objective:** Verify that expired contracts don't affect matching

**Setup:**
```sql
UPDATE `tabContract`
SET start_date = '2024-01-01',
    end_date = '2024-12-31'
WHERE name = 'CON-2025-00004';
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should appear in normal tier based on skills
- NO contract filtering (contract already ended)
- NO contract info displayed

**Cleanup:**
```sql
UPDATE `tabContract`
SET start_date = '2025-12-01',
    end_date = '2026-03-31'
WHERE name = 'CON-2025-00004';
```

---

### Test Case B2: Contract Ending Today - Edge Case
**Objective:** Verify behavior when contract ends today

**Setup:**
```sql
UPDATE `tabContract`
SET end_date = CURDATE()
WHERE name = 'CON-2025-00004';
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should be in POTENTIAL tier (if skills qualify)
- Contract info should show: "Available from: [today's date]"
- Days until available = 0

**Cleanup:**
```sql
UPDATE `tabContract`
SET end_date = '2026-03-31'
WHERE name = 'CON-2025-00004';
```

---

### Test Case B3: Long-Term Contract (Beyond Buffer) - Should EXCLUDE
**Objective:** Verify that long contracts beyond acceptable window exclude employee

**Setup:**
```sql
-- Assuming requirement start_date = 2026-01-01
-- Assuming minimum_availability = 60 days
-- Acceptable window = 2026-03-01

UPDATE `tabContract`
SET end_date = '2026-04-30'  -- Beyond acceptable window
WHERE name = 'CON-2025-00004';
```

**Steps:**
1. Refresh matching dashboard
2. Search for Ryota

**Expected Result:**
- Ryota should **NOT** appear in ANY tier (NOT_SHOWN)
- Completely excluded from results

**Cleanup:**
```sql
UPDATE `tabContract`
SET end_date = '2026-03-31'
WHERE name = 'CON-2025-00004';
```

---

### Test Case B4: Contract Ending Within Buffer - Should Show POTENTIAL
**Objective:** Verify that contract ending within acceptable window shows in POTENTIAL

**Setup:**
```sql
-- Assuming requirement start_date = 2026-01-01
-- Assuming minimum_availability = 60 days
-- Acceptable window = 2026-03-01

UPDATE `tabContract`
SET end_date = '2026-02-15'  -- Within acceptable window
WHERE name = 'CON-2025-00004';
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should appear in **POTENTIAL** tier (if skills qualify)
- Contract info should show: "Available from: 2026-02-15"

**Cleanup:**
```sql
UPDATE `tabContract`
SET end_date = '2026-03-31'
WHERE name = 'CON-2025-00004';
```

---

### Test Case B5: Contract Ending Exactly on Buffer Boundary
**Objective:** Verify boundary condition behavior

**Setup:**
```sql
-- If requirement start_date = 2026-01-01
-- If minimum_availability = 90 days
-- Boundary date = 2026-03-31

UPDATE `tabContract`
SET end_date = '2026-03-31'  -- Exactly on boundary
WHERE name = 'CON-2025-00004';
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should be **EXCLUDED** (NOT_SHOWN)
- Logic uses `<` (strictly less than), so boundary is excluded
- This is conservative approach

**Note:** Current value might already be testing this scenario

---

## C. MINIMUM AVAILABILITY TESTS

### Test Case C1: Zero Minimum Availability
**Objective:** Verify behavior when minimum_availability = 0

**Setup:**
```sql
UPDATE `tabCandidate Requirements`
SET minimum_availability = 0
WHERE name = 'Kanumatsu Japan-12-2025-0054';
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should appear in POTENTIAL tier
- Contract ending anytime in future should qualify
- Contract info displayed

**Cleanup:**
```sql
UPDATE `tabCandidate Requirements`
SET minimum_availability = 60  -- or original value
WHERE name = 'Kanumatsu Japan-12-2025-0054';
```

---

### Test Case C2: NULL Minimum Availability (Default)
**Objective:** Verify behavior when minimum_availability is NULL

**Setup:**
```sql
UPDATE `tabCandidate Requirements`
SET minimum_availability = NULL
WHERE name = 'Kanumatsu Japan-12-2025-0054';
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Should treat as 0 (code: `min_avail_days = minimum_availability or 0`)
- Ryota appears in POTENTIAL with contract info

**Cleanup:**
```sql
UPDATE `tabCandidate Requirements`
SET minimum_availability = 60  -- or original value
WHERE name = 'Kanumatsu Japan-12-2025-0054';
```

---

### Test Case C3: Very Long Minimum Availability (365 days)
**Objective:** Verify strict filtering with long availability requirement

**Setup:**
```sql
UPDATE `tabCandidate Requirements`
SET minimum_availability = 365
WHERE name = 'Kanumatsu Japan-12-2025-0054';

-- Contract ends 2026-03-31 (about 105 days from Jan 1, 2026)
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should be **EXCLUDED** (NOT_SHOWN)
- Contract ends too soon for 365-day availability requirement

**Cleanup:**
```sql
UPDATE `tabCandidate Requirements`
SET minimum_availability = 60  -- or original value
WHERE name = 'Kanumatsu Japan-12-2025-0054';
```

---

### Test Case C4: Short Minimum Availability (30 days)
**Objective:** Verify lenient filtering with short availability requirement

**Setup:**
```sql
UPDATE `tabCandidate Requirements`
SET minimum_availability = 30
WHERE name = 'Kanumatsu Japan-12-2025-0054';
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should appear in **POTENTIAL** tier
- Most contracts will qualify with only 30-day requirement

**Cleanup:**
```sql
UPDATE `tabCandidate Requirements`
SET minimum_availability = 60  -- or original value
WHERE name = 'Kanumatsu Japan-12-2025-0054';
```

---

## D. MULTIPLE CONTRACTS TESTS

### Test Case D1: Two Overlapping Contracts - Use Latest End Date
**Objective:** Verify that latest end_date is used when multiple contracts exist

**Setup:**
```sql
-- Create second contract
INSERT INTO `tabContract` (
    name, docstatus, status, party_type, party_name,
    custom_candidate, start_date, end_date,
    contract_terms, modified, modified_by, owner
)
SELECT
    'CON-2025-00005', 1, 'Active', party_type, party_name,
    custom_candidate, '2025-11-01', '2026-05-31',  -- Ends later
    contract_terms, NOW(), modified_by, owner
FROM `tabContract`
WHERE name = 'CON-2025-00004';
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement
3. Check contract end date displayed

**Expected Result:**
- System should use **2026-05-31** (latest end date)
- Ryota likely **EXCLUDED** if 2026-05-31 is beyond acceptable window
- If shown in POTENTIAL, contract info should show: "Available from: 2026-05-31"

**Cleanup:**
```sql
DELETE FROM `tabContract` WHERE name = 'CON-2025-00005';
```

---

### Test Case D2: Three Contracts with Different End Dates
**Objective:** Verify MAX(end_date) logic with multiple contracts

**Setup:**
```sql
-- Create multiple contracts
INSERT INTO `tabContract` (
    name, docstatus, status, party_type, party_name,
    custom_candidate, start_date, end_date,
    contract_terms, modified, modified_by, owner
) VALUES
('CON-2025-TEMP1', 1, 'Active', 'Customer', 'Test Customer',
 'HR-EMP-00109', '2025-12-01', '2026-02-28',
 'Test', NOW(), 'Administrator', 'Administrator'),
('CON-2025-TEMP2', 1, 'Active', 'Customer', 'Test Customer',
 'HR-EMP-00109', '2026-01-01', '2026-06-30',  -- Latest
 'Test', NOW(), 'Administrator', 'Administrator'),
('CON-2025-TEMP3', 1, 'Active', 'Customer', 'Test Customer',
 'HR-EMP-00109', '2025-11-01', '2026-04-15',
 'Test', NOW(), 'Administrator', 'Administrator');
```

**Steps:**
1. Refresh matching dashboard
2. Verify which end date is used

**Expected Result:**
- System should use **2026-06-30** (absolute latest)
- Employee available only after ALL contracts complete

**Cleanup:**
```sql
DELETE FROM `tabContract` WHERE name IN ('CON-2025-TEMP1', 'CON-2025-TEMP2', 'CON-2025-TEMP3');
```

---

### Test Case D3: One Active, One Inactive Contract
**Objective:** Verify that only Active contracts are considered

**Setup:**
```sql
-- Create inactive contract with later end date
INSERT INTO `tabContract` (
    name, docstatus, status, party_type, party_name,
    custom_candidate, start_date, end_date,
    contract_terms, modified, modified_by, owner
)
SELECT
    'CON-2025-INACTIVE', 1, 'Inactive', party_type, party_name,
    custom_candidate, '2026-01-01', '2026-12-31',  -- Much later but inactive
    contract_terms, NOW(), modified_by, owner
FROM `tabContract`
WHERE name = 'CON-2025-00004';
```

**Steps:**
1. Refresh matching dashboard
2. Check which contract end date is used

**Expected Result:**
- System should **IGNORE** inactive contract
- Only use CON-2025-00004 (2026-03-31)
- Inactive contract doesn't affect availability

**Cleanup:**
```sql
DELETE FROM `tabContract` WHERE name = 'CON-2025-INACTIVE';
```

---

## E. FUTURE CONTRACTS TESTS

### Test Case E1: Active Contract + Interfering Future Contract
**Objective:** Verify that future contract can exclude employee even if current contract ends soon

**Setup:**
```sql
-- Current contract ends soon
UPDATE `tabContract`
SET end_date = '2026-01-31'  -- Ends within buffer
WHERE name = 'CON-2025-00004';

-- Add future contract starting soon after
INSERT INTO `tabContract` (
    name, docstatus, status, party_type, party_name,
    custom_candidate, start_date, end_date,
    contract_terms, modified, modified_by, owner
)
SELECT
    'CON-2026-FUTURE', 1, 'Active', party_type, party_name,
    custom_candidate, '2026-02-15', '2026-08-31',  -- Starts 15 days after current ends
    contract_terms, NOW(), modified_by, owner
FROM `tabContract`
WHERE name = 'CON-2025-00004';

-- If requirement start_date = 2026-01-01
-- If minimum_availability = 60 days
-- Availability window = 2026-02-15 - 2026-01-01 = 45 days < 60 days
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should be **EXCLUDED** (NOT_SHOWN)
- Availability window (45 days) < minimum_availability (60 days)
- Future contract interferes with availability

**Cleanup:**
```sql
UPDATE `tabContract` SET end_date = '2026-03-31' WHERE name = 'CON-2025-00004';
DELETE FROM `tabContract` WHERE name = 'CON-2026-FUTURE';
```

---

### Test Case E2: No Active Contract + Future Contract (Sufficient Gap)
**Objective:** Verify employee is available if future contract starts after buffer period

**Setup:**
```sql
-- Remove current contract's active period
UPDATE `tabContract`
SET end_date = '2025-11-30'  -- Already ended
WHERE name = 'CON-2025-00004';

-- Add future contract with sufficient gap
INSERT INTO `tabContract` (
    name, docstatus, status, party_type, party_name,
    custom_candidate, start_date, end_date,
    contract_terms, modified, modified_by, owner
)
SELECT
    'CON-2026-FUTURE2', 1, 'Active', party_type, party_name,
    custom_candidate, '2026-04-01', '2026-09-30',  -- Starts 90 days after req start
    contract_terms, NOW(), modified_by, owner
FROM `tabContract`
WHERE name = 'CON-2025-00004';

-- If requirement start_date = 2026-01-01
-- If minimum_availability = 60 days
-- Availability window = 2026-04-01 - 2026-01-01 = 90 days > 60 days ✓
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should appear in **normal tiers** (EXCEEDS/EXACT/NEAR based on skills)
- No contract filtering applied
- Has 90-day availability window before next contract

**Cleanup:**
```sql
UPDATE `tabContract` SET end_date = '2026-03-31' WHERE name = 'CON-2025-00004';
DELETE FROM `tabContract` WHERE name = 'CON-2026-FUTURE2';
```

---

### Test Case E3: No Active Contract + Future Contract (Insufficient Gap)
**Objective:** Verify exclusion when future contract starts too soon

**Setup:**
```sql
-- Remove current contract's active period
UPDATE `tabContract`
SET end_date = '2025-11-30'  -- Already ended
WHERE name = 'CON-2025-00004';

-- Add future contract starting too soon
INSERT INTO `tabContract` (
    name, docstatus, status, party_type, party_name,
    custom_candidate, start_date, end_date,
    contract_terms, modified, modified_by, owner
)
SELECT
    'CON-2026-FUTURE3', 1, 'Active', party_type, party_name,
    custom_candidate, '2026-02-15', '2026-08-31',  -- Starts 45 days after req start
    contract_terms, NOW(), modified_by, owner
FROM `tabContract`
WHERE name = 'CON-2025-00004';

-- If requirement start_date = 2026-01-01
-- If minimum_availability = 60 days
-- Availability window = 45 days < 60 days
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- Ryota should be **EXCLUDED** (NOT_SHOWN)
- Future contract interferes even though currently available

**Cleanup:**
```sql
UPDATE `tabContract` SET end_date = '2026-03-31' WHERE name = 'CON-2025-00004';
DELETE FROM `tabContract` WHERE name = 'CON-2026-FUTURE3';
```

---

## F. SKILL-BASED TIER TESTS (With Contracts)

### Test Case F1: Perfect Skills + Active Contract = POTENTIAL
**Objective:** Verify that even perfect skill match forces POTENTIAL tier if contract exists

**Precondition:**
- Ryota has 100% exact/exceeds skill matches
- Active contract exists

**Steps:**
1. Verify Ryota's skills match requirement perfectly
2. Check tier placement

**Expected Result:**
- Despite perfect skills, Ryota appears in **POTENTIAL** tier only
- NOT in EXCEEDS/EXACT/NEAR tiers
- Contract info displayed

---

### Test Case F2: Below 80% Skills + Active Contract = NOT_SHOWN
**Objective:** Verify that insufficient skills + contract excludes employee

**Setup:**
- Ensure Ryota has < 80% skill match
- Active contract exists

**Steps:**
1. Check tier placement

**Expected Result:**
- Ryota should be **EXCLUDED** (NOT_SHOWN)
- Insufficient skills + contract = complete exclusion

---

### Test Case F3: 80% Skills + Active Contract = POTENTIAL
**Objective:** Verify minimum skill threshold for POTENTIAL tier with contract

**Setup:**
- Ensure Ryota has exactly 80% skill match
- Active contract exists (within buffer)

**Steps:**
1. Check tier placement

**Expected Result:**
- Ryota appears in **POTENTIAL** tier
- 80% is minimum threshold for contract cases

---

### Test Case F4: Skills + No Contract = Normal Tier
**Objective:** Verify normal tier calculation without contract

**Setup:**
```sql
UPDATE `tabContract`
SET status = 'Inactive'
WHERE name = 'CON-2025-00004';
```

**Steps:**
1. Refresh matching dashboard
2. Check tier placement

**Expected Result:**
- Ryota appears in tier matching skills:
  - EXCEEDS if ≥50% exceeds
  - EXACT if 100% exact/exceeds
  - NEAR if 100% exact/near/exceeds
  - POTENTIAL if ≥80%

**Cleanup:**
```sql
UPDATE `tabContract`
SET status = 'Active'
WHERE name = 'CON-2025-00004';
```

---

## G. REQUIREMENT START DATE TESTS

### Test Case G1: NULL Start Date - Use Current Date
**Objective:** Verify that NULL start_date defaults to current date

**Setup:**
```sql
UPDATE `tabCandidate Requirements`
SET start_date = NULL
WHERE name = 'Kanumatsu Japan-12-2025-0054';
```

**Steps:**
1. Refresh matching dashboard
2. Check Ryota's tier placement

**Expected Result:**
- System should use CURDATE() as requirement start
- Contract end date evaluated against today + minimum_availability
- Logic: `req_start = getdate(requirement_start_date) if requirement_start_date else today`

**Cleanup:**
```sql
UPDATE `tabCandidate Requirements`
SET start_date = '2026-01-01'  -- or original value
WHERE name = 'Kanumatsu Japan-12-2025-0054';
```

---

### Test Case G2: Past Start Date
**Objective:** Verify behavior when requirement already started

**Setup:**
```sql
UPDATE `tabCandidate Requirements`
SET start_date = '2025-11-01'  -- In the past
WHERE name = 'Kanumatsu Japan-12-2025-0054';
```

**Steps:**
1. Refresh matching dashboard
2. Check contract filtering

**Expected Result:**
- System should still calculate acceptable window from past date
- May show different results based on contract end vs (past_start + buffer)

**Cleanup:**
```sql
UPDATE `tabCandidate Requirements`
SET start_date = '2026-01-01'  -- or original value
WHERE name = 'Kanumatsu Japan-12-2025-0054';
```

---

## H. UI/DISPLAY TESTS

### Test Case H1: Contract Info Display Format
**Objective:** Verify contract information is displayed correctly

**Expected UI Elements:**
- Yellow background (#fff3cd)
- Orange border-left (#ffc107)
- Text color (#856404)
- Format: "📅 **Available from:** YYYY-MM-DD (Contract ends YYYY-MM-DD)"

**Steps:**
1. Open matching dashboard with Ryota in POTENTIAL
2. Inspect contract info div

**Expected HTML:**
```html
<div class="candidate-meta contract-info" style="margin-top: 8px; padding: 8px; background: #fff3cd; border-left: 3px solid #ffc107; border-radius: 4px;">
    <span style="color: #856404;">📅 <strong>Available from:</strong> 2026-03-31</span>
    <span style="color: #856404; margin-left: 10px;">(Contract ends 2026-03-31)</span>
</div>
```

---

### Test Case H2: POTENTIAL Tier Header Display
**Objective:** Verify POTENTIAL tier section is visible and properly styled

**Steps:**
1. Ensure at least one candidate is in POTENTIAL tier
2. Check tier header

**Expected Result:**
```html
<div class="tier-header tier-potential">
    <span>🔍 POTENTIAL MATCH</span>
    <span class="badge badge-success">1 candidate</span>
</div>
```

---

### Test Case H3: No Contract Info for Non-Contract Candidates
**Objective:** Verify that candidates without contracts don't show contract info

**Setup:**
- Find employee without active contract
- Ensure they match requirement

**Expected Result:**
- Candidate card displays normally
- NO yellow contract info box
- Appears in normal tier (EXCEEDS/EXACT/NEAR)

---

## I. INTEGRATION TESTS

### Test Case I1: Age Filter + Contract Filter Combined
**Objective:** Verify age and contract filters work together

**Setup:**
- Employee with contract
- Employee age within ±2 tolerance (not exact range)

**Expected Result:**
- If age is POTENTIAL status + contract exists = POTENTIAL tier
- Both filters contribute to final tier

---

### Test Case I2: Nationality Filter + Contract Filter
**Objective:** Verify nationality mismatch excludes before contract check

**Setup:**
```sql
-- Temporarily change Ryota's nationality
UPDATE `tabEmployee`
SET custom_nationality1 = 'India'
WHERE employee = 'HR-EMP-00109';
```

**Steps:**
1. Refresh matching dashboard (requirement is for Japan nationality)

**Expected Result:**
- Ryota should be **EXCLUDED** immediately
- Nationality filter happens before contract check
- NOT_SHOWN regardless of contract

**Cleanup:**
```sql
UPDATE `tabEmployee`
SET custom_nationality1 = 'Japan'
WHERE employee = 'HR-EMP-00109';
```

---

### Test Case I3: End-to-End: New Contract Creation
**Objective:** Test complete workflow of adding new contract

**Steps:**
1. Verify Ryota appears in normal tier (no contract)
2. Create new contract for Ryota:
   - Customer: Any customer
   - custom_candidate: HR-EMP-00109
   - Start Date: Today
   - End Date: 3 months from today
   - Status: Active
3. Submit contract
4. Refresh matching dashboard

**Expected Result:**
- Ryota moves from normal tier to POTENTIAL tier
- Contract info appears

---

### Test Case I4: End-to-End: Contract Expiration
**Objective:** Test behavior as contract expires

**Steps:**
1. Set contract end_date to tomorrow
2. Check Ryota in POTENTIAL tier
3. Wait until after end_date passes (or manually update to past)
4. Refresh dashboard

**Expected Result:**
- After expiration, Ryota should move to normal tier
- Contract no longer filters

---

## J. ERROR HANDLING TESTS

### Test Case J1: Missing custom_candidate Field
**Objective:** Verify graceful handling if custom_candidate is NULL

**Setup:**
```sql
UPDATE `tabContract`
SET custom_candidate = NULL
WHERE name = 'CON-2025-00004';
```

**Steps:**
1. Refresh matching dashboard

**Expected Result:**
- No crash/error
- Contract not associated with employee
- Ryota appears in normal tier (no contract found)

**Cleanup:**
```sql
UPDATE `tabContract`
SET custom_candidate = 'HR-EMP-00109'
WHERE name = 'CON-2025-00004';
```

---

### Test Case J2: Invalid Date Format
**Objective:** Test handling of malformed dates

**Note:** This is difficult to test directly in DB, but code should handle via getdate()

**Expected Behavior:**
- frappe.utils.getdate() should handle invalid dates gracefully
- Log error if date parsing fails

---

## K. PERFORMANCE TESTS

### Test Case K1: Large Number of Contracts per Employee
**Objective:** Verify performance with multiple contracts

**Setup:**
```sql
-- Create 10 contracts for Ryota
-- Use script to generate
```

**Expected Result:**
- Dashboard still loads within 3-5 seconds
- MAX(end_date) and MIN(start_date) handled efficiently

---

### Test Case K2: Many Employees with Contracts
**Objective:** Verify performance with large dataset

**Note:** Production environment test

**Expected Result:**
- Matching completes within reasonable time
- No N+1 query issues

---

## SUMMARY CHECKLIST

### Quick Smoke Test (After Any Changes)
- [ ] Test Case A1: Active contract filters to POTENTIAL
- [ ] Test Case B1: Past contract doesn't filter
- [ ] Test Case D1: Multiple contracts use latest end date
- [ ] Test Case H1: Contract info displays correctly

### Comprehensive Test (Before Production)
- [ ] All Contract Status Tests (A1-A5)
- [ ] All Date Range Tests (B1-B5)
- [ ] All Minimum Availability Tests (C1-C4)
- [ ] Multiple Contracts Tests (D1-D3)
- [ ] Future Contracts Tests (E1-E3)
- [ ] Skill-Based Tier Tests (F1-F4)
- [ ] UI Display Tests (H1-H3)
- [ ] Integration Tests (I1-I4)

---

## NOTES FOR TESTERS

1. **Always backup before SQL updates:**
   ```sql
   CREATE TABLE `tabContract_backup` AS SELECT * FROM `tabContract`;
   ```

2. **Quick restore if needed:**
   ```sql
   UPDATE `tabContract` c
   INNER JOIN `tabContract_backup` b ON c.name = b.name
   SET c.status = b.status, c.end_date = b.end_date, c.docstatus = b.docstatus;
   ```

3. **Check actual requirement values first:**
   ```sql
   SELECT name, start_date, minimum_availability, nationality, minimum_age, maximum_age
   FROM `tabCandidate Requirements`
   WHERE name = 'Kanumatsu Japan-12-2025-0054';
   ```

4. **Browser cache:** Always do hard refresh (Ctrl+Shift+R) after changes

5. **Check Error Log** for debugging:
   - Navigate to: Setup > Error Log
   - Look for logs with title "Req" or "Data"

---

*Test Cases Created: 2025-12-16*
*For Contract-Based Filtering Feature*
