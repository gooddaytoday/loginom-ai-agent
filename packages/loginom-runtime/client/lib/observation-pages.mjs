import { randomUUID, createHash } from 'node:crypto';

const scopes = new Set(['all', 'palette', 'graph', 'dialogs', 'roots']);
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? value.map(canonical) : Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const revision = snapshot => {
  const { operation, observation_id, recovery, gesture_applied, verification_required, ...state } = snapshot;
  const {mutation_counts,...guardScan}=state.scan??{};
  if(state.scan)state.scan=guardScan; // Telemetry is not a DOM identity/version.
  return createHash('sha256').update(JSON.stringify(canonical(state))).digest('hex');
};
const compactElement = item => {
  const { signature, bounding_box, ...rest } = item;
  if (typeof item.tid === 'string' && item.tid && item.identity?.anchor_tid === item.tid
      && Array.isArray(item.identity.path) && item.identity.path.length === 0
      && Object.keys(item.identity).every(key => ['anchor_tid', 'path'].includes(key))) delete rest.identity;
  return { ...rest, ...(signature ? { signature: { tag: signature.tag } } : {}) };
};
const compactOperation = operation => operation && ({
  operation_id: operation.operation_id, state: operation.state, cleanup_confirmed: operation.cleanup_confirmed,
  effect_state: operation.effect_state, recovery_options: operation.recovery_options, next_steps: operation.next_steps,
  outcome_summary: operation.outcome ? { status: operation.outcome.status, action_key: operation.outcome.action_key,
    operation_id: operation.outcome.operation_id, detail_tool: 'dock_operation_inspect' } : null,
});

// Full guard snapshots stay private. Only issued references may be acted on.
// Cursors address one captured state; a fresh browser read must match its revision.
export function createObservationPages({ maxBytes = 12000, maxRecords = 32, capacity = 8 } = {}) {
  const entries = new Map(), cursors = new Map();
  const clear = () => { entries.clear(); cursors.clear(); };
  const remove = id => {
    entries.delete(id);
    for (const [cursor, page] of cursors) if (page.id === id) cursors.delete(cursor);
  };
  const records = (snapshot, scope) => {
    const rows = [];
    if (scope === 'all' || scope === 'graph') {
      for (const node of snapshot.nodes ?? []) {
        const ports = node.ports ?? [];
        for (let offset = 0; offset < Math.max(ports.length, 1); offset += 8) {
          rows.push(['nodes', { ...node, ports: ports.slice(offset, offset + 8),
            ...(ports.length > 8 ? { ports_page: { offset, total: ports.length, complete: false } } : {}) }]);
        }
      }
      for (const link of snapshot.links ?? []) rows.push(['links', link]);
    }
    const uiElements = [...(snapshot.ui.elements ?? [])];
    // Palette paging must lead with the currently reachable rows after scroll,
    // while retaining offscreen entries on subsequent pages for inventory.
    if (scope === 'palette') uiElements.sort((a,b) => Number(b.interaction?.state === 'point_observed') - Number(a.interaction?.state === 'point_observed'));
    // A wizard's draft metadata is repeated on every page. Deliver its actual
    // forward/finish and editable controls before the larger schema inventory,
    // so the first page contains usable refs rather than metadata-only refs.
    // Sorting never manufactures a record or bypasses issuance/allowed actions.
    else if (snapshot.wizard?.status === 'observed' && ['all', 'dialogs'].includes(scope)) {
      const rank = item => item.signature?.dialog_ref || item.role === 'menuitem' ? -2
        : item.wizard_combo?.kind === 'picker' && item.wizard_combo.field?.scope === 'import_column' ? -1
        : item.allowed_actions?.includes('select_wizard_option') ? 0
        : item.allowed_actions?.includes('finish_wizard') || item.wizard_step?.direction === 'next' && item.allowed_actions?.includes('wizard_step') ? 0.5
        : item.wizard_field && item.allowed_actions?.includes('set_wizard_field') ? 1
        : item.allowed_actions?.some(action => ['wizard_step', 'finish_wizard'].includes(action)) ? 2 : 3;
      uiElements.sort((a,b) => rank(a) - rank(b));
    }
    for (const item of uiElements) {
      const palette = /;ModelForm;colVendors_Компоненты>/.test(item.tid ?? '');
      if (scope === 'palette' && !palette || scope === 'graph' && !['graph', 'graph_editor'].includes(item.scope)
          || scope === 'dialogs' && item.scope !== 'dialog') continue;
      rows.push(['elements', compactElement(item)]);
    }
    for (const collection of ['dialogs', 'masks', 'messages', 'table_cells']) {
      if (scope === 'palette' || scope === 'graph') continue;
      for (const item of snapshot.ui[collection] ?? []) rows.push([collection, item]);
    }
    return rows;
  };
  const render = (entry, offset) => {
    const snapshot = entry.snapshot;
    const output = Object.fromEntries(['origin', 'authenticated', 'loginom_build', 'workflow_ref', 'active_identity', 'active_tab_ref', 'navigation_context','wizard_pending_owner','workflow_navigation','node_context', 'graph_identity', 'package_identity', 'workarea', 'verification_required', 'gesture_applied', 'scan', 'dom_epoch', 'observation_root', 'observation_kind', 'file_storage', 'observation_filter', 'wizard', 'table_settings', 'table_coverage', 'process_console']
      .filter(key => key in snapshot).map(key => [key, structuredClone(snapshot[key])]));
    output.operation = compactOperation(snapshot.operation);
    if (snapshot.recovery) output.recovery = compactOperation(snapshot.recovery);
    output.observation_id = entry.id;
    output.observation_revision = entry.revision;
    output.nodes = []; output.links = [];
    output.ui = { elements: [], dialogs: [], masks: [], messages: [], table_cells: [], truncated: { ...snapshot.ui.truncated } };
    if (entry.scope !== 'all') {
      // Scope omission is not evidence of absence in the workspace.
      if (entry.rows.filter(([key]) => key === 'elements').length < (snapshot.ui.elements?.length ?? 0)) output.ui.truncated.elements = true;
      if (entry.scope !== 'dialogs') for (const key of ['dialogs', 'masks', 'messages', 'table_cells']) output.ui.truncated[key] = true;
    }
    output.page = { schema_version: 1, scope: entry.scope, offset, returned: 0, total_records: entry.rows.length,
      next_cursor: null, captured_snapshot_complete: false, full_dom_complete: false };
    if (bytes(output) > maxBytes - 700) throw new Error('Observation metadata exceeds the page budget; inspect a narrower context');
    let end = offset;
    while (end < entry.rows.length && end - offset < maxRecords) {
      const [collection, value] = entry.rows[end];
      const target = ['nodes', 'links'].includes(collection) ? output[collection] : output.ui[collection];
      target.push(value);
      if (bytes(output) > maxBytes - 700) { target.pop(); break; }
      end++;
    }
    if (end === offset && end < entry.rows.length) throw new Error('One observation record exceeds the page budget');
    const included = entry.rows.slice(offset, end);
    for (const collection of ['nodes', 'links', 'elements', 'dialogs', 'masks', 'messages', 'table_cells']) {
      if (entry.rows.some(([key], index) => key === collection && (index < offset || index >= end))) output.ui.truncated[collection] = true;
    }
    if (!['all', 'graph'].includes(entry.scope)) output.ui.truncated.nodes = output.ui.truncated.links = output.ui.truncated.ports = true;
    if (output.nodes.some(node => node.ports_page)) output.ui.truncated.ports = true;
    for (const [collection, item] of included) if (collection === 'elements') entry.issued.add(item.ref);
    output.page.returned = end - offset;
    output.page.captured_snapshot_complete = offset === 0 && end === entry.rows.length;
    if (end < entry.rows.length) {
      let cursor = entry.next.get(end);
      if (!cursor) { cursor = randomUUID(); entry.next.set(end, cursor); cursors.set(cursor, { id: entry.id, offset: end }); }
      output.page.next_cursor = cursor;
    }
    return output;
  };
  return {
    clear,
    filterForCursor(cursor) {
      const page=cursors.get(cursor),entry=page && entries.get(page.id);
      if (!entry) throw new Error('Observation cursor is stale or belongs to another session');
      return structuredClone(entry.snapshot.observation_filter);
    },
    kindForCursor(cursor) {
      const page=cursors.get(cursor),entry=page && entries.get(page.id);
      if (!entry) throw new Error('Observation cursor is stale or belongs to another session');
      return entry.snapshot.observation_kind;
    },
    rootForCursor(cursor) {
      const page=cursors.get(cursor),entry=page && entries.get(page.id);
      if (!entry) throw new Error('Observation cursor is stale or belongs to another session');
      return entry.snapshot.observation_root?.ref;
    },
    get(id) {
      const entry=entries.get(id);
      if(entry)return entry.snapshot;
      const matches=typeof id==='string' && id ? [...entries.values()].filter(value=>value.receiptOperationId===id) : [];
      if(matches.length===1)throw new Error('The supplied observation_id is a browser receipt operation_id. Copy output.observation_id instead: '+matches[0].id+'. Use only refs delivered in that observation; the receipt ID is not an alias.');
      if(matches.length>1)throw new Error('The supplied ID identifies multiple browser receipts, not a unique observation. Obtain a fresh observation and copy output.observation_id.');
      return undefined;
    },
    assertIssued(id, action) {
      const entry = entries.get(id);
      const refs=[action.ref, action.source_ref, action.target_ref].filter(Boolean);
      if (!entry || refs.some(ref => !entry.issued.has(ref))) {
        // Suggest only a retained observation which actually delivered ALL refs.
        // Never resolve an alias or issue a reference from a private raw snapshot.
        const candidate=refs.length ? [...entries.values()].reverse().find(value=>refs.every(ref=>value.issued.has(ref))) : null;
        const hint=candidate ? ' These refs were delivered with output.observation_id='+candidate.id+'. Use that exact pair, or obtain a fresh observation if the interface changed.' : '';
        throw new Error('UI reference has not been delivered in this observation; read its page first.'+hint);
      }
    },
    retain(outcome, { scope = 'all' } = {}) {
      if (!scopes.has(scope)) throw new Error('Unknown observation scope');
      if (!outcome?.output?.ui) return outcome;
      const snapshot = structuredClone(outcome.output), id = randomUUID();
      const entry = { id, snapshot, receiptOperationId:outcome.operation_id, revision: revision(snapshot), scope, rows: records(snapshot, scope), issued: new Set(), next: new Map() };
      const output = render(entry, 0);
      entries.set(id, entry);
      while (entries.size > capacity) remove(entries.keys().next().value);
      outcome.output = output;
      return outcome;
    },
    next(cursor, fresh) {
      const page = cursors.get(cursor), entry = page && entries.get(page.id);
      if (!entry) throw new Error('Observation cursor is stale or belongs to another session');
      if (fresh.status !== 'SUCCEEDED' || revision(fresh.output) !== entry.revision) {
        remove(entry.id);
        throw new Error('Workspace changed between observation pages; begin a new observation. If this repeats in a wizard, use scope roots, then read its freshly delivered WizrdMCF root_ref and observation_id. Do not reuse refs from the invalidated observation');
      }
      // Only diagnostic counters refresh; guard state and issued refs remain
      // the retained snapshot. All other scan fields still participate in revision.
      if(fresh.output.scan?.mutation_counts)entry.snapshot.scan.mutation_counts=structuredClone(fresh.output.scan.mutation_counts);
      entry.receiptOperationId=fresh.operation_id;
      return { ...fresh, output: render(entry, page.offset) };
    },
  };
}
