// The user supplies an issued workflow identity. Long UI paths remain pinned
// locally; the normal node contract and all live identity guards stay intact.
export function userNodeTool(tool) {
  if (!['dock_node_apply', 'dock_node_resume'].includes(tool.name)) return tool;
  const copy = structuredClone(tool);
  const workflow = copy.inputSchema.properties.workflow_ref;
  workflow.properties = { workflow_id: workflow.properties.workflow_id };
  workflow.required = ['workflow_id'];
  copy.description += ' User profile: workflow_ref contains only the issued workflow_id. The client resolves its pinned navigation locally; do not copy tab, prefix or navigation_path.';
  return copy;
}

export function createUserWorkflowBindings() {
  const references = new Map();
  const key = (document, workflow) => JSON.stringify([document, workflow]);
  const samePath = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length
    && a.every((part, i) => part.tid === b[i].tid && part.label === b[i].label);
  return {
    remember({ document_id, workflow_ref }) {
      if (typeof document_id !== 'string' || !workflow_ref?.workflow_id || !Array.isArray(workflow_ref.navigation_path)) return;
      references.set(key(document_id, workflow_ref.workflow_id), structuredClone(workflow_ref));
    },
    expandNode(request) {
      const ref = references.get(key(request.document_id, request.workflow_ref?.workflow_id));
      if (!ref) throw Error('UNKNOWN_PREPARED_WORKFLOW: use document_id and workflow_id issued together by successful dock_prepare. No node operation started.');
      return { ...request, workflow_ref: structuredClone(ref) };
    },
    normalizePreparation(args) {
      if (args.intent !== 'existing_workflow') return args;
      const supplied = args.workflow_ref;
      const ref = references.get(key(supplied?.document_id, supplied?.workflow_id));
      if (!ref) throw Error('UNKNOWN_PREPARED_WORKFLOW: existing_workflow requires a reference issued in this session.');
      const expected = { ...structuredClone(ref), document_id: supplied.document_id };
      if (supplied.tab_tid !== ref.tab_tid || supplied.prefix !== ref.prefix || !samePath(supplied.navigation_path, ref.navigation_path))
        throw Error('WORKFLOW_REFERENCE_MISMATCH: no preparation started; use the retained reference: ' + JSON.stringify(expected));
      return { ...args, workflow_ref: expected };
    },
  };
}
