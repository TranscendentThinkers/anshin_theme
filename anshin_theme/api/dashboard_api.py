"""
Resource Revenue Management Dashboard API
==========================================

This file contains the backend API logic for the Resource Revenue Management Dashboard.
It fetches data from 3 doctypes: Employee, Contract, and Candidate_Requirements.

Dependencies:
- frappe (if using Frappe/ERPNext)
- pandas (for data processing)
- datetime (for date calculations)

Author: Dashboard Integration Team
Date: December 2024
"""

import frappe
from datetime import datetime, timedelta
from dateutil.relativedelta import relativedelta
import json


@frappe.whitelist(allow_guest=False)
def get_dashboard_data(month=None, year=None):
    """
    Main API endpoint for dashboard data.
    
    Parameters:
    -----------
    month : int (0-11)
        Selected month (0=January, 11=December)
        If None, uses current month
    year : int
        Selected year
        If None, uses current year
    
    Returns:
    --------
    dict : Complete dashboard data including revenue, utilization, and expiring contracts
    
    Logic:
    ------
    1. Fetch all active employees with their skills
    2. Fetch all contracts and determine which are active
    3. Calculate revenue summary (active revenue, bench cost, utilization)
    4. Identify employees on bench (no active contract)
    5. Find contracts expiring in different time periods
    6. Return formatted JSON response
    """
    
    # =============================================================================
    # STEP 1: PARSE INPUT PARAMETERS
    # =============================================================================
    # If month/year not provided, use current date
    if month is None:
        month = datetime.now().month - 1  # Convert to 0-based index
    else:
        month = int(month)
    
    if year is None:
        year = datetime.now().year
    else:
        year = int(year)
    
    # Create date object for the selected month
    selected_date = datetime(year, month + 1, 1)  # month+1 because we store 0-based
    
    
    # =============================================================================
    # STEP 2: FETCH EMPLOYEES DATA
    # =============================================================================
    """
    Logic for Employee Data:
    - Employee doctype has multiple rows per employee (one row per skill)
    - We need to group by employee ID and aggregate skills
    - Calculate daily cost from CTC: Daily Cost = CTC / 365
    """
    
    # Fetch all active employees
    # Note: Employee doctype structure has multiple rows for same employee with different skills
    employees_data = frappe.db.sql("""
        SELECT 
            e.name as id,
            e.employee_code,
            e.full_name,
            e.first_name,
            e.last_name,
            e.cost_to_company_ctc as ctc,
            e.status,
            e.date_of_joining,
            e.date_of_retirement
        FROM `tabEmployee` e
        WHERE e.status = 'Active'
        GROUP BY e.name
    """, as_dict=True)
    
    # Fetch skills separately and group by employee
    # Skills are stored in child table format in Employee doctype
    skills_data = frappe.db.sql("""
        SELECT 
            parent as employee_id,
            skill as skill_name,
            no_of_years as years,
            proficiency
        FROM `tabEmployee Skill`
        WHERE parenttype = 'Employee'
        ORDER BY parent, no_of_years DESC
    """, as_dict=True)
    
    # Create a skills map: {employee_id: [skills]}
    skills_map = {}
    for skill in skills_data:
        emp_id = skill['employee_id']
        if emp_id not in skills_map:
            skills_map[emp_id] = []
        skills_map[emp_id].append({
            'name': skill['skill_name'],
            'years': skill['years'] or 0,
            'proficiency': skill['proficiency']
        })
    
    
    # =============================================================================
    # STEP 3: FETCH CONTRACTS DATA
    # =============================================================================
    """
    Logic for Contract Data:
    - Filter contracts by Status = 'Active'
    - A contract is "currently active" if: Status='Active' AND today is between Start Date and End Date
    - Unit Price in contract is per MONTH
    - Calculate days remaining: (End Date - Today)
    """
    
    today = datetime.now().date()
    
    # Fetch all contracts
    contracts_data = frappe.db.sql("""
        SELECT 
            name as id,
            candidate as employee_id,
            party_full_name as client_name,
            party_name as client_code,
            start_date,
            end_date,
            unit_price,
            unit_price_currency as currency,
            status,
            employment_structure
        FROM `tabContract`
        WHERE status IN ('Active', 'Signed')
        ORDER BY end_date ASC
    """, as_dict=True)
    
    # Separate currently active contracts (today is within contract period)
    currently_active_contracts = []
    all_active_contracts = []
    
    for contract in contracts_data:
        # Convert string dates to date objects
        if isinstance(contract['start_date'], str):
            contract['start_date'] = datetime.strptime(contract['start_date'], '%Y-%m-%d').date()
        if isinstance(contract['end_date'], str):
            contract['end_date'] = datetime.strptime(contract['end_date'], '%Y-%m-%d').date()
        
        # Check if contract is currently active (today falls within contract period)
        if contract['start_date'] <= today <= contract['end_date']:
            currently_active_contracts.append(contract)
        
        # All active status contracts (for future expiry tracking)
        if contract['status'] == 'Active':
            all_active_contracts.append(contract)
    
    
    # =============================================================================
    # STEP 4: CALCULATE REVENUE SUMMARY
    # =============================================================================
    """
    Revenue Calculation Logic:
    1. Active Revenue (Monthly) = Sum of all currently active contracts' Unit Price
    2. Active Revenue is split into:
       - Billed: Revenue from contracts that are active today
       - Bench: Cost of employees without contracts (calculated as sum of their CTC/12)
    3. Total employees = Count of all active employees
    4. Billable employees = Employees who have a currently active contract
    5. Bench employees = Total - Billable
    6. Utilization Rate = (Billable / Total) * 100
    """
    
    # Calculate total monthly revenue from currently active contracts
    total_monthly_revenue = sum(
        contract.get('unit_price', 0) or 0 
        for contract in currently_active_contracts
    )
    
    # Get list of employees who are currently billable (have active contract)
    billable_employee_ids = list(set(
        contract['employee_id'] 
        for contract in currently_active_contracts
        if contract['employee_id']
    ))
    
    # Calculate bench employees and their cost
    bench_employees = []
    bench_monthly_cost = 0
    
    for employee in employees_data:
        if employee['id'] not in billable_employee_ids:
            # Employee is on bench
            ctc = employee.get('ctc', 0) or 0
            monthly_cost = ctc / 12  # Monthly cost from annual CTC
            
            bench_employees.append({
                'id': employee['id'],
                'name': employee['full_name'],
                'monthly_cost': monthly_cost
            })
            bench_monthly_cost += monthly_cost
    
    # Calculate utilization metrics
    total_employees = len(employees_data)
    billable_count = len(billable_employee_ids)
    bench_count = len(bench_employees)
    utilization_rate = (billable_count / total_employees * 100) if total_employees > 0 else 0
    
    revenue_summary = {
        'activeRevenue': {
            'total': int(total_monthly_revenue + bench_monthly_cost),  # Total = billed + bench cost
            'billed': int(total_monthly_revenue),  # Revenue from active contracts
            'bench': int(bench_monthly_cost)  # Cost of bench employees
        },
        'benchResources': {
            'count': bench_count
        },
        'utilizationRate': {
            'percentage': round(utilization_rate, 1)
        }
    }
    
    
    # =============================================================================
    # STEP 5: CALCULATE UTILIZATION BREAKDOWN
    # =============================================================================
    """
    Utilization Breakdown:
    - Billable: Employees with active contracts today
    - Bench: Employees without any active contract
    - Total: All active employees
    """
    
    utilization = {
        'billable': billable_count,
        'bench': bench_count,
        'total': total_employees
    }
    
    
    # =============================================================================
    # STEP 6: PREPARE ALL EMPLOYEES LIST
    # =============================================================================
    """
    All Employees List Logic:
    - Show all active employees
    - Include: Name, Employee Code, CTC (annual), Daily Cost (CTC/365), Skills
    - Daily Cost = CTC / 365 (as per requirement)
    """
    
    all_employees_list = []
    
    for employee in employees_data:
        emp_id = employee['id']
        ctc = employee.get('ctc', 0) or 0
        daily_cost = ctc / 365 if ctc > 0 else 0
        
        all_employees_list.append({
            'name': employee['full_name'] or f"{employee['first_name']} {employee['last_name']}",
            'employeeId': employee['employee_code'] or emp_id,
            'ctc': int(ctc),
            'dailyCost': int(daily_cost),
            'skills': skills_map.get(emp_id, [])
        })
    
    
    # =============================================================================
    # STEP 7: CALCULATE EXPIRING CONTRACTS BY TIME PERIOD
    # =============================================================================
    """
    Expiring Contracts Logic:
    
    Time Periods:
    1. This Month: Contracts ending in the selected month
    2. Next Month: Contracts ending in the month after selected month
    3. Next 3 Months: Contracts ending in the 3 months following selected month
    
    For each period, calculate:
    - Number of contracts expiring
    - Potential loss = Sum of (Employee CTC / 12) for all expiring contracts
    - Daily loss = Potential loss / 30
    - List of resources with details
    
    Note: We use Employee's CTC for loss calculation, NOT contract unit price
    """
    
    # Calculate date ranges
    # This Month: Selected month (from input parameters)
    this_month_start = datetime(year, month + 1, 1).date()
    if month == 11:  # December
        this_month_end = datetime(year + 1, 1, 1).date() - timedelta(days=1)
    else:
        this_month_end = datetime(year, month + 2, 1).date() - timedelta(days=1)
    
    # Next Month: Month after selected month
    next_month_start = this_month_end + timedelta(days=1)
    next_month_end = (next_month_start + relativedelta(months=1)) - timedelta(days=1)
    
    # Next 3 Months: 3 months after selected month
    three_months_start = next_month_start
    three_months_end = (three_months_start + relativedelta(months=3)) - timedelta(days=1)
    
    
    def get_expiring_contracts(start_date, end_date, contracts_list, employees_list, skills_mapping):
        """
        Helper function to get contracts expiring in a given date range.
        
        Parameters:
        -----------
        start_date : date
            Start of the period
        end_date : date
            End of the period
        contracts_list : list
            List of all active contracts
        employees_list : list
            List of all employees
        skills_mapping : dict
            Mapping of employee_id to their skills
        
        Returns:
        --------
        dict : Formatted data for expiring contracts section
        """
        
        expiring_contracts = []
        total_monthly_loss = 0
        
        # Filter contracts ending in this period
        for contract in contracts_list:
            if start_date <= contract['end_date'] <= end_date:
                # Find employee details
                employee = next((e for e in employees_list if e['id'] == contract['employee_id']), None)
                
                if employee:
                    ctc = employee.get('ctc', 0) or 0
                    daily_cost = ctc / 365 if ctc > 0 else 0
                    monthly_loss = ctc / 12 if ctc > 0 else 0
                    
                    # Calculate days remaining from today
                    days_left = (contract['end_date'] - today).days
                    
                    expiring_contracts.append({
                        'name': employee['full_name'] or f"{employee['first_name']} {employee['last_name']}",
                        'id': employee['employee_code'] or employee['id'],
                        'daysLeft': days_left,
                        'dailyCost': int(daily_cost),
                        'currentClient': contract['client_name'],
                        'contractEnd': contract['end_date'].strftime('%b %d'),
                        'skills': skills_mapping.get(employee['id'], [])
                    })
                    
                    total_monthly_loss += monthly_loss
        
        # Sort by days left (ascending)
        expiring_contracts.sort(key=lambda x: x['daysLeft'])
        
        return {
            'count': len(expiring_contracts),
            'potentialLoss': {
                'daily': int(total_monthly_loss / 30) if total_monthly_loss > 0 else 0,
                'monthly': int(total_monthly_loss)
            },
            'resources': expiring_contracts[:10]  # Return first 10 for display, indicate more exist
        }
    
    
    # Get expiring contracts for each period
    expiring_this_month = get_expiring_contracts(
        this_month_start, 
        this_month_end, 
        all_active_contracts, 
        employees_data, 
        skills_map
    )
    
    expiring_next_month = get_expiring_contracts(
        next_month_start, 
        next_month_end, 
        all_active_contracts, 
        employees_data, 
        skills_map
    )
    
    expiring_next_3_months = get_expiring_contracts(
        three_months_start, 
        three_months_end, 
        all_active_contracts, 
        employees_data, 
        skills_map
    )
    
    # For 3 months section, also calculate weekly breakdown
    weekly_breakdown = []
    current_week_start = three_months_start
    week_number = 1
    
    while current_week_start <= three_months_end:
        current_week_end = min(current_week_start + timedelta(days=6), three_months_end)
        
        week_contracts = [
            c for c in all_active_contracts 
            if current_week_start <= c['end_date'] <= current_week_end
        ]
        
        if len(week_contracts) > 0 or week_number <= 4:  # Show first 4 weeks always
            weekly_breakdown.append({
                'week': f"Week {week_number} ({current_week_start.strftime('%b %d')}-{current_week_end.strftime('%b %d')})",
                'resourceCount': len(week_contracts)
            })
        
        current_week_start = current_week_end + timedelta(days=1)
        week_number += 1
    
    expiring_next_3_months['weeklyBreakdown'] = weekly_breakdown
    
    
    # =============================================================================
    # STEP 8: GET ON BENCH DETAILS (for "Currently On Bench" section)
    # =============================================================================
    """
    On Bench Section:
    - Show employees who don't have any active contract RIGHT NOW
    - Calculate daily and monthly loss for each
    - Include their skills
    """
    
    bench_resources = []
    
    for employee in employees_data:
        if employee['id'] not in billable_employee_ids:
            ctc = employee.get('ctc', 0) or 0
            daily_cost = ctc / 365 if ctc > 0 else 0
            
            bench_resources.append({
                'name': employee['full_name'] or f"{employee['first_name']} {employee['last_name']}",
                'id': employee['employee_code'] or employee['id'],
                'dailyCost': int(daily_cost),
                'ctc': int(ctc),
                'skills': skills_map.get(employee['id'], []),
                'benchSince': 'Unknown'  # Can be enhanced with last contract end date
            })
    
    # Sort by daily cost (highest first)
    bench_resources.sort(key=lambda x: x['dailyCost'], reverse=True)
    
    
    # =============================================================================
    # STEP 9: CONSTRUCT FINAL RESPONSE
    # =============================================================================
    """
    Final Response Structure:
    - revenueSummary: Top-level metrics (revenue, bench count, utilization)
    - utilization: Breakdown of billable/bench/total
    - allEmployees: Complete list of all active employees
    - expiringResources: Contracts expiring in different time periods
    - benchResources: Employees currently on bench
    """
    
    response = {
        'revenueSummary': revenue_summary,
        'utilization': utilization,
        'allEmployees': all_employees_list,
        'expiringResources': {
            'thisMonth': expiring_this_month,
            'nextMonth': expiring_next_month,
            'next3Months': expiring_next_3_months
        },
        'benchResources': bench_resources[:10],  # First 10 bench resources
        'selectedMonth': month,
        'selectedYear': year,
        'generatedAt': datetime.now().isoformat()
    }
    
    return response


@frappe.whitelist(allow_guest=False)
def get_employee_details(employee_id):
    """
    Get detailed information for a specific employee.
    This can be used for drill-down functionality.
    
    Parameters:
    -----------
    employee_id : str
        Employee ID or Employee Code
    
    Returns:
    --------
    dict : Detailed employee information including full contract history
    """
    
    # Fetch employee details
    employee = frappe.db.get_value('Employee', 
        {'name': employee_id}, 
        ['name', 'employee_code', 'full_name', 'cost_to_company_ctc', 'status'],
        as_dict=True
    )
    
    if not employee:
        return {'error': 'Employee not found'}
    
    # Fetch all skills
    skills = frappe.db.sql("""
        SELECT skill, no_of_years, proficiency
        FROM `tabEmployee Skill`
        WHERE parent = %s
        ORDER BY no_of_years DESC
    """, (employee_id,), as_dict=True)
    
    # Fetch all contracts (past and present)
    contracts = frappe.db.sql("""
        SELECT 
            name, party_full_name, start_date, end_date, 
            unit_price, status
        FROM `tabContract`
        WHERE candidate = %s
        ORDER BY end_date DESC
    """, (employee_id,), as_dict=True)
    
    return {
        'employee': employee,
        'skills': skills,
        'contracts': contracts
    }


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def calculate_month_difference(date1, date2):
    """
    Calculate the number of months between two dates.
    Used for revenue projections.
    """
    return (date2.year - date1.year) * 12 + (date2.month - date1.month)


def get_fiscal_year_dates(year):
    """
    Get start and end dates for fiscal year.
    Modify based on your company's fiscal year.
    """
    # Example: April to March fiscal year
    fiscal_start = datetime(year, 4, 1).date()
    fiscal_end = datetime(year + 1, 3, 31).date()
    return fiscal_start, fiscal_end

