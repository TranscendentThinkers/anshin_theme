import frappe
import openpyxl
from frappe.utils.file_manager import get_file

@frappe.whitelist()
def update_nationalities(file_url):
    # Get File doc properly
    file_doc = frappe.get_doc("File", {"file_url": file_url})
    file_path = file_doc.get_full_path()

    # IMPORTANT: openpyxl must read a REAL file path
    wb = openpyxl.load_workbook(filename=file_path, data_only=True)
    sheet = wb.active

    updated = 0
    skipped = []
    errors = []

    for row_idx, row in enumerate(
        sheet.iter_rows(min_row=2, values_only=True), start=2
    ):
        employee_id, custom_nationality = row

        if not employee_id or not custom_nationality:
            skipped.append(f"Row {row_idx}: empty value")
            continue

        if not frappe.db.exists("Employee", employee_id):
            skipped.append(f"Row {row_idx}: Employee {employee_id} not found")
            continue

        try:
            doc = frappe.get_doc("Employee", employee_id)
            doc.custom_nationality = custom_nationality
            doc.save()

            updated += 1

        except Exception as e:
            errors.append(f"Row {row_idx}: {employee_id} → {str(e)}")

    frappe.db.commit()

    return {
        "updated": updated,
        "skipped": skipped,
        "errors": errors
    }

