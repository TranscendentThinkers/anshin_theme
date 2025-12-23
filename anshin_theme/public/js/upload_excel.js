frappe.listview_settings['Employee'] = {
    onload(listview) {
        listview.page.add_menu_item(__('Upload Excel & Update'), () => {
            open_upload_dialog();
        });
    }
};

function open_upload_dialog() {
    let d = new frappe.ui.Dialog({
        title: 'Upload Excel',
        fields: [
            {
                fieldname: 'excel_file',
                fieldtype: 'Attach',
                label: 'Excel File',
                reqd: 1
            }
        ],
        primary_action_label: 'Update',
        primary_action(values) {
            frappe.call({
                method: 'anshin_theme.server_scripts.update_nationalities.update_nationalities',
                args: {
                    file_url: values.excel_file
                },
                callback(r) {
                    if (!r.exc) {
                        frappe.msgprint(__('Update completed'));
                        frappe.listview.refresh();
                        d.hide();
                    }
                }
            });
        }
    });

    d.show();
}

