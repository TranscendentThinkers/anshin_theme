import frappe
from frappe import _
from datetime import datetime, timedelta
from calendar import monthrange

@frappe.whitelist()
def get_dashboard_data(month=None, year=None):
    """
    Get Resource Revenue Management Dashboard data for specified month/year.

    Args:
        month: Month number (0-11, JavaScript style) or None for current month
        year: Year (e.g., 2025) or None for current year

    Returns:
        Dictionary with all dashboard sections data
    """
    # Default to current month/year if not provided
    today = datetime.now()
    if month is None:
        month = today.month - 1  # Convert to 0-based
    else:
        month = int(month)

    if year is None:
        year = today.year
    else:
        year = int(year)

    # Convert 0-based month to 1-based for calculations
    selected_month = month + 1
    selected_year = year

    # Calculate date ranges
    first_day = datetime(selected_year, selected_month, 1).date()
    last_day = datetime(selected_year, selected_month, monthrange(selected_year, selected_month)[1]).date()

    # Get data for all sections
    data = {
        "revenue_summary": get_revenue_summary(first_day, last_day),
        "utilization": get_utilization_metrics(first_day, last_day),
        "all_employees": get_all_employees(),
        "summary_cards": get_summary_cards(first_day, last_day),
        "on_bench": get_on_bench_employees(first_day, last_day),
        "expiring_this_month": get_expiring_contracts(first_day, last_day, "this_month"),
        "expiring_next_month": get_expiring_contracts(first_day, last_day, "next_month"),
        "expiring_next_3_months": get_expiring_contracts(first_day, last_day, "next_3_months"),
        "total_at_risk": 0,  # Will be calculated from summary cards
        "selected_month": selected_month,
        "selected_year": selected_year
    }

    # Calculate total at risk
    data["total_at_risk"] = (
        data["summary_cards"]["expiring_this_month"]["amount"] +
        data["summary_cards"]["expiring_next_month"]["amount"] +
        data["summary_cards"]["expiring_next_3_months"]["amount"]
    )

    return data


def get_revenue_summary(first_day, last_day):
    """Get revenue summary cards data"""

    # Active Revenue: Sum of custom_unit_price for active contracts in selected month
    active_contracts = frappe.db.sql("""
        SELECT
            SUM(custom_unit_price) as total_revenue,
            COUNT(DISTINCT custom_candidate) as billable_count
        FROM `tabContract`
        WHERE docstatus = 1
          AND custom_candidate IS NOT NULL
          AND start_date <= %(last_day)s
          AND end_date >= %(first_day)s
    """, {"first_day": first_day, "last_day": last_day}, as_dict=True)[0]

    active_revenue = active_contracts.total_revenue or 0
    billable_count = active_contracts.billable_count or 0
    avg_rate = (active_revenue / billable_count) if billable_count > 0 else 0

    # Net Margin: Revenue - Salary Costs
    # Get billable employees and their CTC
    billable_employees = frappe.db.sql("""
        SELECT DISTINCT e.ctc
        FROM `tabEmployee` e
        INNER JOIN `tabContract` c ON c.custom_candidate = e.name
        WHERE c.docstatus = 1
          AND c.start_date <= %(last_day)s
          AND c.end_date >= %(first_day)s
          AND e.status = 'Active'
    """, {"first_day": first_day, "last_day": last_day}, as_dict=True)

    total_salary_costs = sum((emp.ctc or 0) / 12 for emp in billable_employees)
    net_margin = active_revenue - total_salary_costs
    margin_percentage = (net_margin / active_revenue * 100) if active_revenue > 0 else 0

    # Bench Cost Impact
    bench_data = get_bench_cost_impact(first_day, last_day)

    return {
        "active_revenue": active_revenue,
        "billable_count": billable_count,
        "avg_rate": avg_rate,
        "net_margin": net_margin,
        "margin_percentage": margin_percentage,
        "total_salary_costs": total_salary_costs,
        "bench_cost": bench_data["monthly_cost"],
        "bench_count": bench_data["count"],
        "action_items": bench_data["action_items"],
        "at_risk": bench_data["at_risk"]
    }


def get_bench_cost_impact(first_day, last_day):
    """Calculate bench cost impact for selected month"""

    # Get employees on bench (no active contract)
    bench_employees = frappe.db.sql("""
        SELECT
            e.name as employee,
            e.ctc,
            e.ctc / 365 as daily_cost
        FROM `tabEmployee` e
        WHERE e.status = 'Active'
          AND NOT EXISTS (
              SELECT 1 FROM `tabContract` c
              WHERE c.custom_candidate = e.name
                AND c.docstatus = 1
                AND c.start_date <= %(last_day)s
                AND c.end_date >= %(first_day)s
          )
    """, {"first_day": first_day, "last_day": last_day}, as_dict=True)

    # Calculate monthly cost for selected month
    days_in_month = (last_day - first_day).days + 1
    monthly_cost = sum(emp.daily_cost * days_in_month for emp in bench_employees)
    bench_count = len(bench_employees)

    # Action items: on bench + expiring this month + expiring next month
    expiring_this_month = get_expiring_count(first_day, last_day, "this_month")
    expiring_next_month = get_expiring_count(first_day, last_day, "next_month")
    action_items = bench_count + expiring_this_month + expiring_next_month

    # At Risk: Total CTC cost for next 3 months if not placed
    at_risk = calculate_at_risk_amount(first_day, last_day)

    return {
        "monthly_cost": monthly_cost,
        "count": bench_count,
        "action_items": action_items,
        "at_risk": at_risk
    }


def calculate_at_risk_amount(first_day, last_day):
    """Calculate total at risk amount for next 3 months"""

    # Get contracts expiring in next 3 months
    next_month_first = datetime(last_day.year, last_day.month, 1).date() + timedelta(days=32)
    next_month_first = datetime(next_month_first.year, next_month_first.month, 1).date()

    three_months_later = next_month_first + timedelta(days=90)

    expiring_contracts = frappe.db.sql("""
        SELECT
            e.ctc,
            e.ctc / 365 as daily_cost,
            c.end_date
        FROM `tabContract` c
        INNER JOIN `tabEmployee` e ON e.name = c.custom_candidate
        WHERE c.docstatus = 1
          AND c.end_date >= %(next_month_first)s
          AND c.end_date <= %(three_months_later)s
    """, {"next_month_first": next_month_first, "three_months_later": three_months_later}, as_dict=True)

    total_at_risk = 0
    for contract in expiring_contracts:
        # Calculate days from end_date + 1 to end of 3-month window
        days_at_risk = (three_months_later - contract.end_date).days
        total_at_risk += contract.daily_cost * days_at_risk

    return total_at_risk


def get_expiring_count(first_day, last_day, period):
    """Get count of expiring contracts for specified period"""

    if period == "this_month":
        start_date = first_day
        end_date = last_day
    elif period == "next_month":
        next_month_first = datetime(last_day.year, last_day.month, 1).date() + timedelta(days=32)
        next_month_first = datetime(next_month_first.year, next_month_first.month, 1).date()
        start_date = next_month_first
        end_date = datetime(next_month_first.year, next_month_first.month,
                           monthrange(next_month_first.year, next_month_first.month)[1]).date()
    else:
        return 0

    count = frappe.db.count("Contract", filters={
        "docstatus": 1,
        "custom_candidate": ["is", "set"],
        "end_date": ["between", [start_date, end_date]]
    })

    return count


def get_utilization_metrics(first_day, last_day):
    """Get utilization metrics"""

    # Total active employees
    total_employees = frappe.db.count("Employee", filters={"status": "Active"})

    # Billable employees (with active contracts)
    billable_count = frappe.db.sql("""
        SELECT COUNT(DISTINCT custom_candidate)
        FROM `tabContract`
        WHERE docstatus = 1
          AND custom_candidate IS NOT NULL
          AND start_date <= %(last_day)s
          AND end_date >= %(first_day)s
    """, {"first_day": first_day, "last_day": last_day})[0][0] or 0

    # On bench = total - billable
    on_bench_count = total_employees - billable_count

    # Utilization percentage
    utilization = (billable_count / total_employees * 100) if total_employees > 0 else 0

    return {
        "total": total_employees,
        "billable": billable_count,
        "on_bench": on_bench_count,
        "utilization_percentage": utilization
    }


def get_all_employees():
    """Get all active employees with CTC and skills"""

    employees = frappe.db.sql("""
        SELECT
            e.name as employee_id,
            e.employee_name,
            e.ctc,
            e.ctc / 365 as daily_cost
        FROM `tabEmployee` e
        WHERE e.status = 'Active'
        ORDER BY e.employee_name
    """, as_dict=True)

    # Get skills for each employee
    for emp in employees:
        skills = frappe.db.sql("""
            SELECT
                skill,
                proficiency,
                no_of_years
            FROM `tabSkill Child`
            WHERE parent = %(employee)s
              AND parenttype = 'Employee'
            ORDER BY skill
        """, {"employee": emp.employee_id}, as_dict=True)

        emp["skills"] = skills

    return employees


def get_summary_cards(first_day, last_day):
    """Get data for the 4 summary cards"""

    today = datetime.now().date()

    # Card 1: On Bench Now
    on_bench = get_on_bench_summary(first_day, last_day)

    # Card 2: Expiring This Month
    expiring_this = get_expiring_summary(first_day, last_day, "this_month")

    # Card 3: Expiring Next Month
    expiring_next = get_expiring_summary(first_day, last_day, "next_month")

    # Card 4: Expiring in Next 3 Months
    expiring_3months = get_expiring_summary(first_day, last_day, "next_3_months")

    return {
        "on_bench_now": on_bench,
        "expiring_this_month": expiring_this,
        "expiring_next_month": expiring_next,
        "expiring_next_3_months": expiring_3months
    }


def get_on_bench_summary(first_day, last_day):
    """Get on bench summary for card"""

    # Get employees on bench
    bench_employees = frappe.db.sql("""
        SELECT
            e.ctc / 365 as daily_cost
        FROM `tabEmployee` e
        WHERE e.status = 'Active'
          AND NOT EXISTS (
              SELECT 1 FROM `tabContract` c
              WHERE c.custom_candidate = e.name
                AND c.docstatus = 1
                AND c.start_date <= %(last_day)s
                AND c.end_date >= %(first_day)s
          )
    """, {"first_day": first_day, "last_day": last_day}, as_dict=True)

    # Calculate cost for selected month
    days_in_month = (last_day - first_day).days + 1
    monthly_cost = sum(emp.daily_cost * days_in_month for emp in bench_employees)

    return {
        "count": len(bench_employees),
        "amount": monthly_cost
    }


def get_expiring_summary(first_day, last_day, period):
    """Get expiring contracts summary for card"""

    if period == "this_month":
        start_date = first_day
        end_date = last_day
    elif period == "next_month":
        next_month_first = datetime(last_day.year, last_day.month, 1).date() + timedelta(days=32)
        next_month_first = datetime(next_month_first.year, next_month_first.month, 1).date()
        start_date = next_month_first
        end_date = datetime(next_month_first.year, next_month_first.month,
                           monthrange(next_month_first.year, next_month_first.month)[1]).date()
    elif period == "next_3_months":
        next_month_first = datetime(last_day.year, last_day.month, 1).date() + timedelta(days=32)
        next_month_first = datetime(next_month_first.year, next_month_first.month, 1).date()
        start_date = next_month_first
        end_date = next_month_first + timedelta(days=90)
    else:
        return {"count": 0, "amount": 0}

    # Get expiring contracts with employee CTC
    expiring = frappe.db.sql("""
        SELECT
            e.ctc,
            e.ctc / 365 as daily_cost,
            c.end_date
        FROM `tabContract` c
        INNER JOIN `tabEmployee` e ON e.name = c.custom_candidate
        WHERE c.docstatus = 1
          AND c.end_date >= %(start_date)s
          AND c.end_date <= %(end_date)s
    """, {"start_date": start_date, "end_date": end_date}, as_dict=True)

    # Calculate prorated CTC cost
    total_amount = 0
    for contract in expiring:
        if period == "this_month" or period == "next_month":
            # Prorated for remaining days in that month
            days_remaining = (end_date - contract.end_date).days
            total_amount += contract.daily_cost * days_remaining
        else:
            # Total for entire 3-month window
            days_remaining = (end_date - contract.end_date).days
            total_amount += contract.daily_cost * days_remaining

    return {
        "count": len(expiring),
        "amount": total_amount
    }


def get_on_bench_employees(first_day, last_day):
    """Get detailed list of employees on bench"""

    today = datetime.now().date()

    # Get employees on bench
    bench_employees = frappe.db.sql("""
        SELECT
            e.name as employee_id,
            e.employee_name,
            e.ctc,
            e.ctc / 365 as daily_cost
        FROM `tabEmployee` e
        WHERE e.status = 'Active'
          AND NOT EXISTS (
              SELECT 1 FROM `tabContract` c
              WHERE c.custom_candidate = e.name
                AND c.docstatus = 1
                AND c.end_date >= CURDATE()
          )
        ORDER BY e.ctc DESC
    """, as_dict=True)

    for emp in bench_employees:
        # Get when they went on bench (most recent contract end date)
        last_contract = frappe.db.sql("""
            SELECT end_date, party_name
            FROM `tabContract`
            WHERE custom_candidate = %(employee)s
              AND docstatus = 1
            ORDER BY end_date DESC
            LIMIT 1
        """, {"employee": emp.employee_id}, as_dict=True)

        if last_contract:
            bench_start = last_contract[0].end_date + timedelta(days=1)
            days_on_bench = (today - bench_start).days
            emp["days_on_bench"] = days_on_bench
            emp["total_loss"] = emp.daily_cost * days_on_bench
            emp["last_client"] = last_contract[0].party_name
            emp["last_contract_end"] = last_contract[0].end_date

            # Get count of contracts with last client
            contracts_count = frappe.db.count("Contract", filters={
                "custom_candidate": emp.employee_id,
                "party_name": last_contract[0].party_name,
                "docstatus": 1
            })
            emp["contracts_with_last_client"] = contracts_count
        else:
            emp["days_on_bench"] = 0
            emp["total_loss"] = 0
            emp["last_client"] = None
            emp["last_contract_end"] = None
            emp["contracts_with_last_client"] = 0

        # Get skills
        skills = frappe.db.sql("""
            SELECT skill, proficiency, no_of_years
            FROM `tabSkill Child`
            WHERE parent = %(employee)s AND parenttype = 'Employee'
        """, {"employee": emp.employee_id}, as_dict=True)

        emp["skills"] = skills

    # Calculate monthly cost for selected month
    days_in_month = (last_day - first_day).days + 1
    monthly_cost = sum(emp.daily_cost * days_in_month for emp in bench_employees)

    return {
        "employees": bench_employees,
        "monthly_cost": monthly_cost,
        "daily_loss": sum(emp.daily_cost for emp in bench_employees)
    }


def get_expiring_contracts(first_day, last_day, period):
    """Get detailed list of expiring contracts"""

    today = datetime.now().date()

    if period == "this_month":
        start_date = first_day
        end_date = last_day
    elif period == "next_month":
        next_month_first = datetime(last_day.year, last_day.month, 1).date() + timedelta(days=32)
        next_month_first = datetime(next_month_first.year, next_month_first.month, 1).date()
        start_date = next_month_first
        end_date = datetime(next_month_first.year, next_month_first.month,
                           monthrange(next_month_first.year, next_month_first.month)[1]).date()
    elif period == "next_3_months":
        next_month_first = datetime(last_day.year, last_day.month, 1).date() + timedelta(days=32)
        next_month_first = datetime(next_month_first.year, next_month_first.month, 1).date()
        start_date = next_month_first
        end_date = next_month_first + timedelta(days=90)
    else:
        return {"contracts": [], "potential_loss_daily": 0, "potential_loss_monthly": 0}

    # Get expiring contracts
    contracts = frappe.db.sql("""
        SELECT
            e.name as employee_id,
            e.employee_name,
            e.ctc,
            e.ctc / 365 as daily_cost,
            c.end_date,
            c.party_name as current_client
        FROM `tabContract` c
        INNER JOIN `tabEmployee` e ON e.name = c.custom_candidate
        WHERE c.docstatus = 1
          AND c.end_date >= %(start_date)s
          AND c.end_date <= %(end_date)s
        ORDER BY c.end_date
    """, {"start_date": start_date, "end_date": end_date}, as_dict=True)

    for contract in contracts:
        # Days left until contract ends
        contract["days_left"] = (contract.end_date - today).days if contract.end_date >= today else 0

        # Get skills
        skills = frappe.db.sql("""
            SELECT skill, proficiency, no_of_years
            FROM `tabSkill Child`
            WHERE parent = %(employee)s AND parenttype = 'Employee'
        """, {"employee": contract.employee_id}, as_dict=True)

        contract["skills"] = skills

    # Calculate potential loss
    daily_loss = sum(c.daily_cost for c in contracts)
    monthly_loss = sum(c.daily_cost * 30 for c in contracts)  # Approximate

    return {
        "contracts": contracts,
        "potential_loss_daily": daily_loss,
        "potential_loss_monthly": monthly_loss
    }
