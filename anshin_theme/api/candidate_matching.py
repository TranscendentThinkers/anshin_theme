# apps/app_name/app_name/api/candidate_matching.py

import frappe
from frappe import _
import json


@frappe.whitelist()
def get_all_requirements():
    try:
        requirements = frappe.db.sql("""
            SELECT 
                name,
                customer,
                project_name,
                minimum_age,
                maximum_age,
                nationality,
                number_of_positions,
                location
            FROM 
                `tabCandidate Requirements`
            WHERE 
                docstatus = 0
            ORDER BY 
                creation DESC
        """, as_dict=True)

        for req in requirements:
            req['required_skills'] = frappe.db.sql("""
                SELECT 
                    skill,
                    skill_group,
                    proficiency,
                    no_of_years as years
                FROM 
                    `tabSkill Child`
                WHERE 
                    parent = %(requirement_id)s
                    AND parenttype = 'Candidate Requirements'
                    AND parentfield = 'required_skills'
                ORDER BY 
                    idx
            """, {'requirement_id': req.name}, as_dict=True)

            req['preferred_skills'] = frappe.db.sql("""
                SELECT 
                    skill,
                    skill_group,
                    proficiency,
                    no_of_years as years
                FROM 
                    `tabSkill Child`
                WHERE 
                    parent = %(requirement_id)s
                    AND parenttype = 'Candidate Requirements'
                    AND parentfield = 'preferred_skills'
                ORDER BY 
                    idx
            """, {'requirement_id': req.name}, as_dict=True)

        return {"success": True, "data": requirements}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Get Requirements Error"))
        return {"success": False, "message": str(e)}


@frappe.whitelist()
def get_matched_candidates(requirement_id):
    try:
        req = frappe.db.get_value(
            "Candidate Requirements",
            requirement_id,
            [
                "minimum_age",
                "maximum_age",
                "nationality",
                "customer",
                "project_name",
                "number_of_positions",
            ],
            as_dict=True,
        )
        frappe.log_error("Req",req)

        if not req:
            return {"success": False, "message": "Requirement not found"}

        req_skills = get_requirement_skills(requirement_id)
        employees = get_employees_with_skills()
        frappe.log_error("Data",{"Req Skills":req_skills,"Employees":employees})

        matched_candidates = {
            "exceeds": [],
            "exact": [],
            "near": [],
            "potential": [],
        }

        for emp in employees:
            candidate, tier = match_employee_to_requirement(
                emp, req, req_skills
            )

            # ✅ FIX: tier handled externally, candidate has NO 'tier' key
            if tier != "NOT_SHOWN":
                matched_candidates[tier.lower()].append(candidate)

        my_data =  {
            "success": True,
            "requirement": {
                "id": requirement_id,
                "customer": req.customer,
                "project_name": req.project_name,
                "age": f"{req.minimum_age}-{req.maximum_age}",
                "nationality": req.nationality,
                "positions": req.number_of_positions,
                "required": req_skills["required"],
                "preferred": req_skills["preferred"],
            },
            "matches": matched_candidates,
        }
        frappe.log_error("My Daata",my_data)

        return {
            "success": True,
            "requirement": {
                "id": requirement_id,
                "customer": req.customer,
                "project_name": req.project_name,
                "age": f"{req.minimum_age}-{req.maximum_age}",
                "nationality": req.nationality,
                "positions": req.number_of_positions,
                "required": req_skills["required"],
                "preferred": req_skills["preferred"],
            },
            "matches": matched_candidates,
        }

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), _("Get Matched Candidates Error"))
        return {"success": False, "message": str(e)}


def get_requirement_skills(requirement_id):
    return {
        "required": frappe.db.sql("""
            SELECT 
                skill as name,
                skill_group,
                proficiency,
                IFNULL(no_of_years, 0) as years,
                CASE 
                    WHEN proficiency = 'No experience, but knowledgeable' THEN 1
                    WHEN proficiency = 'Sufficient experience available, training possible' THEN 2
                    WHEN proficiency = 'Experienced, available' THEN 3
                    ELSE 2
                END as prof,
                'required' as type
            FROM `tabSkill Child`
            WHERE parent=%(id)s
              AND parenttype='Candidate Requirements'
              AND parentfield='required_skills'
        """, {"id": requirement_id}, as_dict=True),

        "preferred": frappe.db.sql("""
            SELECT 
                skill as name,
                skill_group,
                proficiency,
                IFNULL(no_of_years, 0) as years,
                CASE 
                    WHEN proficiency = 'No experience, but knowledgeable' THEN 1
                    WHEN proficiency = 'Sufficient experience available, training possible' THEN 2
                    WHEN proficiency = 'Experienced, available' THEN 3
                    ELSE 2
                END as prof,
                'preferred' as type
            FROM `tabSkill Child`
            WHERE parent=%(id)s
              AND parenttype='Candidate Requirements'
              AND parentfield='preferred_skills'
        """, {"id": requirement_id}, as_dict=True),
    }


def get_employees_with_skills():
    employees = frappe.db.sql("""
        SELECT 
            employee,
            employee_name,
            custom_age as age,
            custom_nationality1 as nationality
        FROM `tabEmployee`
        WHERE status='Active'
    """, as_dict=True)

    for emp in employees:
        emp["skills"] = frappe.db.sql("""
            SELECT 
                skill,
                skill_group,
                proficiency,
                IFNULL(no_of_years, 0) as years,
                CASE 
                    WHEN proficiency = 'No experience, but knowledgeable' THEN 1
                    WHEN proficiency = 'Sufficient experience available, training possible' THEN 2
                    WHEN proficiency = 'Experienced, available' THEN 3
                    ELSE 2
                END as prof_level
            FROM `tabSkill Child`
            WHERE parent=%(id)s
              AND parenttype='Employee'
              AND parentfield='custom_employee_skills'
        """, {"id": emp.employee}, as_dict=True)

    return employees


def match_employee_to_requirement(employee, requirement, req_skills):
    if employee["nationality"] != requirement.nationality:
        return None, "NOT_SHOWN"

    age_status = check_age_match(
        employee["age"],
        requirement.minimum_age,
        requirement.maximum_age,
    )

    if age_status == "FAIL":
        return None, "NOT_SHOWN"

    required_matches = [
        match_single_skill(s, employee["skills"], "required")
        for s in req_skills["required"]
    ]

    preferred_matches = [
        match_single_skill(s, employee["skills"], "preferred")
        for s in req_skills["preferred"]
    ]

    reqExceeds = sum(m["status"] == "exceeds" for m in required_matches)
    reqExact = sum(m["status"] == "exact" for m in required_matches)
    reqNear = sum(m["status"] == "near" for m in required_matches)
    reqBelow = sum(m["status"] == "below" for m in required_matches)
    reqMissing = sum(m["status"] == "missing" for m in required_matches)

    prefMatched = sum(
        m["status"] in ("exceeds", "exact", "near")
        for m in preferred_matches
    )

    tier = calculate_tier(
        reqExceeds,
        reqExact,
        reqNear,
        reqBelow,
        reqMissing,
        len(required_matches),
        age_status,
    )

    all_skill_matches = required_matches + preferred_matches

    age_text = "Within ±2 tolerance" if age_status == "POTENTIAL" else None

    candidate = {
        "id": employee["employee"],
        "name": employee["employee_name"],
        "age": employee["age"],
        "nationality": employee["nationality"],
        "ageStatus": age_text,
        "reqExceeds": reqExceeds,
        "reqExact": reqExact,
        "reqNear": reqNear,
        "reqBelow": reqBelow,
        "reqMissing": reqMissing,
        "prefMatched": prefMatched,
        "prefTotal": len(preferred_matches),
        "skills": all_skill_matches,
    }

    return candidate, tier


def check_age_match(emp_age, min_age, max_age):
    if emp_age is None:
        return "FAIL"

    if min_age <= emp_age <= max_age:
        return "EXACT"
    if (min_age - 2) <= emp_age < min_age or max_age < emp_age <= (max_age + 2):
        return "POTENTIAL"

    return "FAIL"


def match_single_skill(req_skill, emp_skills, skill_type):
    emp_skill = next((s for s in emp_skills if s["skill"] == req_skill["name"]), None)

    if not emp_skill:
        return {
            "name": req_skill["name"],
            "reqYears": req_skill["years"],
            "reqProf": req_skill["prof"],
            "empYears": 0,
            "empProf": 0,
            "status": "missing",
            "type": skill_type,
        }

    years_diff = emp_skill["years"] - req_skill["years"]
    prof_diff = emp_skill["prof_level"] - req_skill["prof"]

    if years_diff > 2 and emp_skill["prof_level"] >= req_skill["prof"]:
        status = "exceeds"
    elif emp_skill["prof_level"] >= req_skill["prof"] and 0 <= years_diff <= 2:
        status = "exact"
    elif abs(prof_diff) <= 1 and abs(years_diff) <= 1:
        status = "near"
    else:
        status = "below"

    return {
        "name": req_skill["name"],
        "reqYears": req_skill["years"],
        "reqProf": req_skill["prof"],
        "empYears": emp_skill["years"],
        "empProf": emp_skill["prof_level"],
        "status": status,
        "type": skill_type,
    }


def calculate_tier(
    reqExceeds, reqExact, reqNear, reqBelow, reqMissing, reqTotal, age_status
):
    if reqExceeds >= (reqTotal * 0.5):
        return "EXCEEDS"

    if (reqExceeds + reqExact) == reqTotal:
        return "EXACT"

    if (reqExceeds + reqExact + reqNear) == reqTotal:
        return "NEAR"

    if (
        (reqExceeds + reqExact + reqNear) >= (reqTotal * 0.8)
        or age_status == "POTENTIAL"
    ):
        return "POTENTIAL"

    return "NOT_SHOWN"

