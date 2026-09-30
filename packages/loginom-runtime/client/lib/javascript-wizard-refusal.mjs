// A stale error button cannot attribute a failure to the new gesture. An
// observed pending interval or changed/new tooltip supplies freshness instead.
export function isCurrentJavascriptWizardRefusal({before,after,pendingSeen}) {
  return after.native_owner_verified===true&&after.wizard_visible===true
    &&after.page_tid===before.page_tid&&!!after.page_tid&&after.pending===false
    &&after.wizard_error?.visible===true&&after.wizard_error.exact_count===1
    &&(after.boundary_refusal===null||after.boundary_refusal==='foreign_dialog')
    &&(after.boundary_refusal!=='foreign_dialog'||before.dialog_diagnostic?.visible_count===0
      &&after.dialog_diagnostic?.foreign_count===1&&/^msgbox(?:-\d+)?$/.test(after.dialog_diagnostic.roots?.[0]?.tid??''))
    &&(before.wizard_error?.visible!==true||before.wizard_error.tooltip!==after.wizard_error.tooltip||pendingSeen);
}
