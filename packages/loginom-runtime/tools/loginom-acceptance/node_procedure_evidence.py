"""Independent journal checks for the private node procedures.

Input must come from the authenticated session journal. This verifier does not
admit a catalog, authenticate a journal file, or establish Hermes acceptance.
It never uses the handler's settings_readback_verified summary as evidence.
"""
import json
from json_digest import javascript_digest


def digest(value):
    return javascript_digest(value)


def bound_wizard_close_confirmation(state):
    binding = state.get('node_wizard_confirmation', {})
    wizard = state.get('wizard', {})
    node = state.get('prepared_node_context', {})
    ui = state.get('ui', {})
    port_key = 'input_port' if 'input_port' in binding.get('owner', {}) else 'output_port'
    port = binding.get('owner', {}).get(port_key)
    direction = 'input' if port_key == 'input_port' else 'output'
    owner = wizard.get('owner_context')
    if port:
        if (port.get('direction') != direction or type(port.get('port')) is not int or not 0 <= port['port'] < 100
                or type(port.get('native_index')) is not int or port['native_index'] < 0
                or not isinstance(port.get('port_guid'), str) or not port['port_guid']
                or not isinstance(port.get('opening_operation_id'), str) or not port['opening_operation_id'] or wizard.get('stage') != direction + '_mapping'
                or node.get('surface') != 'wizard'):
            return False
        owner = {port_key: node.get(port_key)}
    output = binding.get('owner', {}).get('output_port')
    if output:
        context = wizard.get('port_context', {})
        if (output.get('direction') != 'output' or type(output.get('port')) is not int or not 0 <= output['port'] < 100
                or type(output.get('native_index')) is not int or output['native_index'] < 0
                or not isinstance(output.get('port_guid'), str) or not output['port_guid']
                or not isinstance(output.get('opening_operation_id'), str) or not output['opening_operation_id']
                or wizard.get('stage') != 'output_mapping' or node.get('surface') != 'wizard'
                or context.get('status') != 'observed' or context.get('kind') != 'output_data'
                or not context.get('node', {}).get('ref') or not context.get('port', {}).get('ref')):
            return False
        owner = dict(output_port=node.get('output_port'), port_context=context)
    if (binding.get('kind') != 'close' or wizard.get('status') != 'observed'
            or node.get('verified') is not True
            or any(node.get(k) != binding.get('node', {}).get(k) for k in ('document_id', 'workflow_id', 'node_id'))
            or any(wizard.get(k) != binding.get(k) for k in ('root_ref', 'root_tid', 'stage'))
            or owner != binding.get('owner')):
        return False
    dialogs, masks = ui.get('dialogs'), ui.get('masks')
    if (not isinstance(dialogs, list) or len(dialogs) != 1 or not isinstance(masks, list)
            or any(m.get('kind') != 'modal_background' or m.get('ref') != binding.get('root_ref') for m in masks)):
        return False
    dialog = dialogs[0]
    if (dialog.get('title') != 'Подтвердить'
            or dialog.get('text') != 'Подтвердить Вы действительно хотите закрыть мастер настройки? Да Нет'):
        return False
    return all(len([e for e in ui.get('elements', []) if e.get('tid') == 'msgbox;tlb;' + name
                    and e.get('label') == label and e.get('signature', {}).get('dialog_ref') == dialog.get('ref')
                    and 'click' in e.get('allowed_actions', [])]) == 1 for name, label in [('yes', 'Да'), ('no', 'Нет')])


def bound_wizard_deactivation_confirmation(state):
    binding = state.get('node_wizard_confirmation', {})
    node, ui = state.get('prepared_node_context', {}), state.get('ui', {})
    dialogs, masks = ui.get('dialogs'), ui.get('masks')
    if (binding.get('kind') != 'deactivation' or node.get('verified') is not True
            or node.get('surface') != 'graph' or node.get('tid') != binding.get('graph_tid')
            or any(node.get(k) != binding.get('node', {}).get(k) for k in ('document_id', 'workflow_id', 'node_id'))
            or state.get('wizard', {}).get('status') != 'absent'
            or state.get('wizard_pending_owner', {}).get('status') != 'observed'
            or [{k: x.get(k) for k in ('tid', 'label')} for x in state['wizard_pending_owner'].get('path', [])[:-2]] != binding.get('opening', {}).get('workflow_path')
            or state['wizard_pending_owner'].get('node', {}).get('tid') != (binding.get('opening', {}).get('workflow_path') or [{}])[-1].get('tid', '') + '>' + binding.get('opening', {}).get('node', {}).get('node_label', '')
            or not isinstance(dialogs, list) or len(dialogs) != 1 or not isinstance(masks, list)
            or any(m.get('kind') != 'modal_background' or m.get('target_tid') != binding.get('graph_tid', '').split(';Graph;')[0] or m.get('dialog_ref') is not None for m in masks)):
        return False
    title = 'Loginom ' + str(state.get('loginom_build'))
    dialog = dialogs[0]
    if (dialog.get('title') != title or dialog.get('text') != title +
            ' Настройка узла приведет к его деактивации. Вы действительно хотите начать настраивать узел? Да Да, больше не спрашивать Нет'):
        return False
    return all(len([e for e in ui.get('elements', []) if e.get('tid') == 'msgbox;tlb;' + name
                    and e.get('label') == label and e.get('signature', {}).get('dialog_ref') == dialog.get('ref')
                    and 'click' in e.get('allowed_actions', [])]) == 1
               for name, label in [('yes', 'Да'), ('no', 'Да, больше не спрашивать'), ('cancel', 'Нет')])


def bound_wizard_confirmation(state):
    return bound_wizard_close_confirmation(state) or bound_wizard_deactivation_confirmation(state)


def bound_missing_values_dialog(state):
    ui=state.get('ui',{});dialogs=ui.get('dialogs',[]);wizard=state.get('wizard',{});mv=state.get('node_missing_values',{});node=state.get('prepared_node_context',{})
    if (len(dialogs)!=1 or ui.get('masks')!=[] or wizard.get('status')!='observed' or wizard.get('stage')!='missing_values'
        or mv.get('verified') is not True or mv.get('inventory_complete') is not True
        or node.get('verified') is not True or node.get('surface')!='wizard' or mv.get('node_context')!=node):return False
    dialog=dialogs[0];title='Редактирование значения замены для пропусков'
    if dialog.get('title')!=title or dialog.get('text')!=title+' Значение для замены пропусков: OK Отмена':return False
    context=mv.get('method_context',{});fields=[f for f in mv.get('fields',[]) if f.get('record_id')==context.get('record_id') and f.get('name')==context.get('field_name')]
    if len(fields)!=1 or fields[0].get('used') is not True or fields[0].get('method')!='constant' or fields[0].get('type')!='string' or fields[0].get('data_kind')!='Дискретный':return False
    elements=[e for e in ui.get('elements',[]) if e.get('scope')=='dialog' and e.get('signature',{}).get('dialog_ref')==dialog.get('ref')]
    return (len(elements)==3 and len([e for e in elements if e.get('signature',{}).get('role')=='textbox' and e.get('signature',{}).get('value_truncated') is False and 'fill' in e.get('allowed_actions',[])])==1
        and all(len([e for e in elements if e.get('tid')==tid and e.get('label')==label and 'click' in e.get('allowed_actions',[])])==1 for tid,label in [('msgbox;tlb;ok','OK'),('msgbox;tlb;cancel','Отмена')]))


def bound_table_dialogs(state):
    dialogs = state.get('ui', {}).get('dialogs')
    if dialogs == []:
        return True
    binding = state.get('node_table_dialog', {})
    table = binding.get('table', {})
    outputs = state.get('node_outputs', {})
    if binding.get('kind') not in ('format', 'filter') or outputs.get('verified') is not True:
        return False
    matches = [t for t in outputs.get('tables', []) if t.get('active') is True
               and all(t.get(k) == table.get(k) and isinstance(table.get(k), str) and table[k]
                       for k in ('view_guid', 'port_guid', 'table_tid'))]
    if len(matches) != 1 or not isinstance(dialogs, list):
        return False
    expected = table['table_tid'] + ';ModalWindow_Browse' + binding['kind'].title()
    return all(d.get('identity', {}).get('anchor_tid') == expected for d in dialogs)


def bound_output_column_dialog(state):
    wizard=state.get('wizard',{});params=wizard.get('column_parameters',{});dialogs=state.get('ui',{}).get('dialogs',[])
    selected=params.get('selected_column',{})
    root='EditTuneColumnDefForm' if wizard.get('stage')=='input_mapping' else 'EditColumnDefForm'
    if (wizard.get('stage') not in ('output_mapping','input_mapping') or params.get('status')!='observed'
        or params.get('portal_bound') is not True or params.get('root_tid')!=root
        or not isinstance(dialogs,list) or len(dialogs)!=1
        or dialogs[0].get('ref')!=params.get('root_ref')
        or dialogs[0].get('identity',{}).get('anchor_tid')!=root
        or selected.get('status')!='observed' or selected.get('selected') is not True):return False
    matches=[f for f in wizard.get('output_columns',{}).get('fields',[]) if f==selected]
    fields=params.get('fields',{})
    return len(matches)==1 and set(fields)=={'name','label','type_label','data_kind','usage'} and all(
        f.get('status')=='observed' and f.get('truncated') is False for f in fields.values())


def bound_expression_dialog(state):
    wizard=state.get('wizard',{});params=wizard.get('expression_parameters',{})
    selection=wizard.get('expression_selection',{});ui=state.get('ui',{})
    dialogs,masks=ui.get('dialogs'),ui.get('masks')
    root=wizard.get('root_tid','')
    if (wizard.get('stage')!='calculator' or wizard.get('status')!='observed'
            or params.get('status')!='observed' or selection.get('status')!='observed'
            or not isinstance(selection.get('name'),str) or not selection['name']
            or params.get('selected_expression',{}).get('tid')!=root+';CalcDataWizard;colExpressionName_'+selection['name']
            or not isinstance(dialogs,list) or len(dialogs)!=1
            or dialogs[0].get('ref')!=params.get('root_ref')
            or dialogs[0].get('identity',{}).get('anchor_tid')!=root+';ExprDataEditForm'
            or not isinstance(masks,list) or any(m.get('kind')!='modal_background'
                or m.get('target_tid')!=root or m.get('ref')!=wizard.get('root_ref') for m in masks)):
        return False
    fields=params.get('fields',{})
    return set(fields)=={'name','label','type_label'} and all(
        f.get('status')=='observed' and f.get('truncated') is False for f in fields.values())


def bound_reform_dialog(state):
    wizard=state.get('wizard',{});params=wizard.get('reform_parameters',{})
    selected=params.get('selected_column',{});owner=state.get('prepared_node_context',{})
    dialogs=state.get('ui',{}).get('dialogs');masks=state.get('ui',{}).get('masks')
    if (wizard.get('stage')!='field_parameters' or params.get('status')!='observed'
            or params.get('portal_bound') is not True or params.get('root_tid')!='EditReformColumnDefForm'
            or owner.get('verified') is not True or owner.get('surface')!='wizard' or owner.get('tid')!=wizard.get('root_tid')
            or not isinstance(dialogs,list) or len(dialogs)!=1 or masks!=[]
            or dialogs[0].get('ref')!=params.get('root_ref')
            or dialogs[0].get('identity',{}).get('anchor_tid')!='EditReformColumnDefForm'
            or selected.get('status')!='observed' or selected.get('selected') is not True):return False
    fields=params.get('fields',{})
    return (len([f for f in wizard.get('reform_columns',{}).get('fields',[]) if f==selected])==1
        and set(fields)=={'name','label','type_label','data_kind','usage','caching','excluded'}
        and all(f.get('status')=='observed' and f.get('truncated') is not True for f in fields.values())
        and type(fields['excluded'].get('value')) is bool)


def bound_filter_dialog(state):
    wizard, native = state.get('wizard', {}), state.get('node_filter', {})
    owner, cached_owner = state.get('prepared_node_context', {}), native.get('node_context', {})
    dialogs, masks = state.get('ui', {}).get('dialogs'), state.get('ui', {}).get('masks')
    bound = native.get('dialogs', [])
    if (wizard.get('status') != 'observed' or wizard.get('stage') != 'row_filter'
            or native.get('verified') is not True or native.get('inventory_complete') is not True
            or owner.get('verified') is not True or cached_owner != owner or owner.get('surface') != 'wizard'
            or owner.get('input_port') or owner.get('output_port') or owner.get('tid') != wizard.get('root_tid')
            or len(bound) != 1 or not isinstance(dialogs, list) or len(dialogs) != 1
            or not isinstance(masks, list)):
        return False
    kind = bound[0].get('kind')
    suffix = {'range': 'BetweenValuesEditor', 'list': 'ValueListEditor'}.get(kind)
    if suffix is None:
        return False
    root = wizard['root_tid'] + ';ModalWindow_' + suffix
    records = [r for r in native.get('rows', []) if r.get('record_id') == bound[0].get('record_id')]
    return (bound[0].get('root_tid') == root and dialogs[0].get('identity', {}).get('anchor_tid') == root
            and len(records) == 1 and records[0].get('kind') == 'condition'
            and records[0].get('operator_code') in ([8, 9] if kind == 'range' else [10, 11])
            and all(m.get('kind') == 'modal_background' and m.get('ref') == wizard.get('root_ref')
                    and m.get('target_tid') == wizard['root_tid'] for m in masks))


def bound_grouping_factor(state):
    wizard=state.get('wizard',{});factor=wizard.get('factor_editor',{})
    native=state.get('node_grouping',{});owner=state.get('prepared_node_context',{})
    dialogs=state.get('ui',{}).get('dialogs',[]);masks=state.get('ui',{}).get('masks',[])
    if (wizard.get('stage')!='grouping' or factor.get('status')!='rendered_factor_options'
            or factor.get('dialog_tid')!=wizard.get('root_tid','')+';FactorEditDialog'
            or native.get('verified') is not True or native.get('inventory_complete') is not True
            or owner.get('verified') is not True
            or any(native.get('node_context',{}).get(k)!=owner.get(k) for k in ('document_id','workflow_id','node_id'))
            or len(dialogs)!=1 or dialogs[0].get('ref')!=factor.get('dialog_ref')
            or dialogs[0].get('identity',{}).get('anchor_tid')!=factor.get('dialog_tid')
            or masks):return False
    fields=[f for f in native.get('measures',[]) if f.get('name')==factor.get('selected_field',{}).get('field_key')]
    options=factor.get('options',[])
    return (len(fields)==1 and native.get('selected_records')==[fields[0].get('record_id')]
        and [o.get('aggregation') for o in options]==['sum','count','min','max','average','median','mode','standard_deviation','unique_count','null_count','first','last','only','concat']
        and all(type(o.get('checked')) is bool and type(o.get('enabled')) is bool for o in options))


def bound_schema_preview(state):
    preview=state.get('node_preview_schema',{});owner=state.get('prepared_node_context',{})
    dialogs=state.get('ui',{}).get('dialogs',[])
    return (preview.get('verified') is True and preview.get('inventory_complete') is True
        and preview.get('state_source')=='cached_preview_column_infos' and type(preview.get('port')) is int and 0<=preview['port']<100
        and preview.get('node_id')==owner.get('node_id') and owner.get('verified') is True
        and preview.get('node_context')==owner and owner.get('surface')=='graph'
        and preview.get('root_tid')==state.get('workflow_ref',{}).get('prefix','')+';ModelForm;PreviewWindow'
        and len(dialogs)==1 and dialogs[0].get('identity',{}).get('anchor_tid')==preview.get('root_tid')
        and state.get('ui',{}).get('masks')==[])


def bound_port_open(action, outcome, state):
    direction={'open_input_port':'input','open_output_port':'output'}.get(action.get('verb'))
    if direction is None or set(action)!={'verb','port'} or type(action['port']) is not int:
        return False
    owner=state.get('prepared_node_context',{});actual=outcome.get('output',{})
    if (owner.get('verified') is not True or owner.get('surface')!='graph' or owner.get('locked') is not False
            or state.get('wizard',{}).get('status')!='absent'
            or actual.get('verified') is not True or actual.get('direction')!=direction
            or actual.get('port')!=action['port'] or actual.get('opening_operation_id')!=outcome.get('operation_id')
            or any(not owner.get(k) or actual.get(k)!=owner[k] for k in ('document_id','workflow_id','node_id'))):
        return False
    proofs=[e for e in outcome.get('trace',[]) if e.get('event')==direction+'_port_wizard_verified']
    return len(proofs)==1 and all(proofs[0].get(k)==actual.get(k) for k in
        ('direction','port','opening_operation_id','document_id','workflow_id','node_id','verified'))


def verify_internal_sequence(events, operation_id, *, max_steps=96):
    rows = [r for r in events if r.get('operation_id') == operation_id]
    failures, observations, mutations = [], [], []
    current = pending = None
    samples = []
    observation_attempts = root_refreshes = 0
    previous_step = 0
    session = None
    document = workflow = origin = build = None
    prepared_state = rejected = None
    retry_count = 0
    refresh_authorized = False
    for row in rows:
        if row.get('internal_provenance') != 'client_node_procedure_v1':
            continue
        identity = (row.get('session_id'), row.get('runtime_revision'), row.get('target'))
        if session is None:
            session = identity
        if identity != session or not identity[0] or not identity[1]:
            failures.append('journal_session_mismatch')
        phase, step = row.get('phase'), row.get('step')
        if not isinstance(step, int) or step < 1 or step > max_steps:
            failures.append('invalid_step'); continue
        if row.get('internal_operation_id') != f'{operation_id}:n{step}':
            failures.append('internal_identity_mismatch')
        if phase == 'node_observation_root_refreshed':
            outcome = row.get('outcome', {})
            if (pending or step != previous_step + 1 or row.get('sample') != observation_attempts
                    or row.get('refresh') != root_refreshes + 1 or root_refreshes >= 2
                    or outcome.get('status') != 'NOT_APPLIED' or outcome.get('action_key') != 'workspace.observe'
                    or outcome.get('phase') != 'observing' or outcome.get('error', {}).get('code') != 'UI_ROOT_STALE'
                    or outcome.get('effect_possible') is not False or outcome.get('cleanup_complete') is not True):
                failures.append('unsafe_observation_root_refresh')
            root_refreshes += 1
            observation_attempts += 1
            samples = []
        elif phase == 'node_observation_sample':
            if pending or (samples and samples[0].get('step') != step):
                failures.append('observation_interleaving')
            if row.get('sample') != observation_attempts:
                failures.append('sample_sequence')
            observation_attempts += 1
            samples.append(row)
        elif phase == 'node_observation_interrupted':
            if (pending or rejected or step != previous_step + 1
                    or any(s.get('step') != step or s.get('readiness', {}).get('condition') != row.get('condition') for s in samples)
                    or not isinstance(row.get('condition'), str) or not row['condition']
                    or row.get('reason') != 'local_cancel' or row.get('effect_possible') is not False
                    or row.get('cleanup_complete') is not True):
                failures.append('unsafe_observation_interruption')
            previous_step, current, samples = step, None, []
            observation_attempts = root_refreshes = 0
        elif phase == 'node_observation_completed':
            semantic = row.get('readiness', {}).get('policy') == 'semantic_condition_v2'
            required_samples = row.get('readiness', {}).get('required_samples') if semantic else 4
            if semantic and required_samples not in (1, 2):
                failures.append('invalid_readiness_policy'); required_samples = 2
            if step != previous_step + 1 or pending or not required_samples <= len(samples) <= (80 if row.get('readiness') else 12) or observation_attempts > 80:
                failures.append('observation_sequence')
            readiness = row.get('readiness')
            if readiness is not None:
                condition = readiness.get('condition')
                if (not isinstance(condition, str) or not condition.strip()
                        or readiness.get('satisfied') is not True
                        or not 0 <= readiness.get('elapsed_ms', -1) < readiness.get('timeout_ms', 0) <= 15000
                        or any(s.get('readiness', {}).get('condition') != condition for s in samples)
                        or any(s.get('readiness', {}).get('satisfied') is not True for s in samples[-required_samples:])):
                    failures.append('readiness_not_confirmed')
                if semantic and required_samples == 2 and (not readiness.get('identity_sha256') or any(
                        s.get('readiness', {}).get('identity_sha256') != readiness['identity_sha256'] for s in samples[-2:])):
                    failures.append('target_identity_not_stable')
            outcome = row.get('outcome', {})
            state = outcome.get('output', {})
            if outcome.get('status') != 'SUCCEEDED' or not samples or samples[-1].get('outcome') != outcome:
                failures.append('observation_not_backed_by_sample')
            recent = [s.get('outcome', {}).get('output', {}) for s in samples[-required_samples:]]
            if len(recent) != required_samples or any((not semantic and s.get('dom_epoch') != state.get('dom_epoch')) or s.get('ui', {}).get('masks') and not (bound_wizard_confirmation(s) or bound_missing_values_dialog(s) or bound_expression_dialog(s) or bound_reform_dialog(s) or bound_filter_dialog(s) or bound_grouping_factor(s) or bound_schema_preview(s)) for s in recent):
                failures.append('observation_not_settled')
            doc = state.get('dom_epoch', {}).get('document')
            if document is None:
                document, workflow, origin, build = doc, state.get('workflow_ref'), state.get('origin'), state.get('loginom_build')
            if not doc or (doc, state.get('workflow_ref'), state.get('origin'), state.get('loginom_build')) != (document, workflow, origin, build):
                failures.append('document_context_mismatch')
            ui = state.get('ui', {})
            if state.get('scan', {}).get('complete') is not True or (ui.get('masks') != [] or not (bound_table_dialogs(state) or bound_output_column_dialog(state) or bound_reform_dialog(state))) and not (bound_wizard_confirmation(state) or bound_missing_values_dialog(state) or bound_expression_dialog(state) or bound_filter_dialog(state) or bound_grouping_factor(state) or bound_schema_preview(state)):
                failures.append('observation_blocked')
            current = state
            observations.append((step, state))
            previous_step, samples = step, []
            observation_attempts = root_refreshes = 0
        elif phase == 'node_step_prepared':
            if step != previous_step + 1 or pending or samples or current is None:
                failures.append('mutation_without_fresh_observation')
            action = row.get('action', {})
            if rejected:
                old_action, old_state, _ = rejected
                intent = lambda a: {k: v for k, v in a.items() if k not in ('ref', 'source_ref', 'target_ref')}
                def binding(state, act):
                    if not isinstance(state, dict):
                        return None
                    result = []
                    for key in ('ref', 'source_ref', 'target_ref'):
                        if key in act:
                            matches = [e for e in state.get('ui', {}).get('elements', []) if e.get('ref') == act[key]]
                            if len(matches) != 1 or not matches[0].get('identity'):
                                return None
                            result.append(refresh_control_binding(state, act, matches[0]))
                    wizard = state.get('wizard', {})
                    editor = wizard.get('import_column_editor', {})
                    return (result, wizard.get('owner_context'), {k: editor.get(k) for k in
                        ('index', 'name', 'label', 'property', 'canonical_value', 'used', 'other_property', 'other_value')})
                old_binding, new_binding = binding(old_state, old_action), binding(current, action)
                if not refresh_authorized or intent(action) != intent(old_action) or old_binding is None or old_binding != new_binding:
                    failures.append('unsafe_local_refresh')
                refresh_authorized = False
            if current is not None:
                if row.get('observation_sha256') != digest(current):
                    failures.append('observation_digest_mismatch')
                if row.get('signature') != digest([row.get('internal_operation_id'), action, current]):
                    failures.append('step_signature_mismatch')
                if current.get('node_wizard_confirmation') and (not bound_wizard_confirmation(current)
                        or action.get('verb') != ('confirm_wizard_close' if current['node_wizard_confirmation'].get('kind') == 'close' else 'confirm_wizard_deactivation')
                        or not any(e.get('ref') == action.get('ref') and e.get('tid') == 'msgbox;tlb;yes' for e in current.get('ui', {}).get('elements', []))):
                    failures.append('unsafe_wizard_confirmation_answer')
                refs = [action.get(k) for k in ('ref', 'source_ref', 'target_ref') if k in action]
                for ref in refs:
                    matching = [e for e in current.get('ui', {}).get('elements', []) if e.get('ref') == ref]
                    if len(matching) != 1 or action.get('verb') not in matching[0].get('allowed_actions', []):
                        failures.append('unissued_action_reference')
            pending, prepared_state = row, current
            current = None
        elif phase == 'node_step_completed':
            outcome = row.get('outcome', {})
            if not pending or pending.get('step') != step:
                failures.append('completion_without_preparation')
            action=(pending or {}).get('action',{})
            direction={'open_input_port':'input','open_output_port':'output'}.get(action.get('verb'))
            key='node.'+direction+'_port.open.internal' if direction else 'ui.act'
            if direction and not bound_port_open(action,outcome,prepared_state or {}):
                failures.append('unbound_port_open')
            if outcome.get('operation_id') != row.get('internal_operation_id') or outcome.get('action_key') != key:
                failures.append('receipt_identity_mismatch')
            strict_refusal = (outcome.get('status') == 'NOT_APPLIED'
                and (outcome.get('phase'),outcome.get('error',{}).get('code')) in [('preconditions','UI_EPOCH_CHANGED'),('observing','UI_ROOT_STALE')]
                and outcome.get('effect_possible') is False and outcome.get('cleanup_complete') is True
                and isinstance(outcome.get('trace'), list)
                and not any(e.get('event') in ('ui_preconditions_verified','ui_gesture_applied') for e in outcome['trace']))
            if not strict_refusal and (outcome.get('status') != 'SUCCEEDED' or outcome.get('cleanup_complete') is not True):
                failures.append('incomplete_mutation')
            if pending and strict_refusal:
                rejected = (pending['action'], prepared_state, outcome)
            elif pending:
                mutations.append((step, pending['action'], outcome))
                rejected, retry_count = None, 0
            pending = None
            previous_step = step
        elif phase == 'node_step_refresh_authorized':
            retry_count += 1
            expected_intent = digest(json.loads(json.dumps(
                {k: v for k, v in (rejected[0] if rejected else {}).items() if k not in ('ref', 'source_ref', 'target_ref')},
                ensure_ascii=False, sort_keys=True, separators=(',', ':'))))
            if (not rejected or pending or samples or step != previous_step or retry_count > 2
                    or refresh_authorized or row.get('retry') != retry_count
                    or row.get('rejected_operation_id') != rejected[2].get('operation_id')
                    or row.get('effect_possible') is not False
                    or row.get('intent_sha256') != expected_intent
                    or not isinstance(row.get('condition'), str) or not row['condition'].strip()
                    or any(not isinstance(row.get(k), str) or len(row[k]) != 64
                           or any(c not in '0123456789abcdef' for c in row[k])
                           for k in ('binding_sha256', 'intent_sha256'))):
                failures.append('invalid_refresh_authorization')
            refresh_authorized = True
        else:
            failures.append('unknown_internal_event')
    if pending or rejected or refresh_authorized or samples or not observations or not mutations:
        failures.append('incomplete_procedure_journal')
    return {'passed': not failures, 'failures': sorted(set(failures)),
            'observations': observations, 'mutations': mutations}


def verify_text_import_roundtrip(events, operation_id, expected):
    sequence = verify_internal_sequence(events, operation_id)
    failures = list(sequence['failures'])
    mutations, observations = sequence['mutations'], sequence['observations']
    saves = [s for s, a, _ in mutations if a.get('verb') == 'finish_wizard']
    opens = [s for s, a, _ in mutations if a.get('verb') == 'open_wizard']
    if len(saves) != 2 or len(opens) != 1 or not saves[0] < opens[0] < saves[1]:
        failures.append('save_open_save_sequence')
    else:
        nodes = []
        for step, action, outcome in mutations:
            if action.get('verb') == 'finish_wizard':
                proof = [e for e in outcome.get('trace', []) if e.get('event') == 'wizard_finish_graph_verified']
                if len(proof) != 1:
                    failures.append('finish_receipt_missing')
                else:
                    nodes.append(proof[0].get('node', {}).get('node_label'))
        if len(nodes) != 2 or not nodes[0] or nodes[0] != nodes[1]:
            failures.append('finished_node_changed')
        for start, end in [(0, saves[0]), (opens[0], saves[1])]:
            reads = [(s, o) for s, o in observations if start < s < end]
            chosen = {}
            for step, state in reads:
                stage = state.get('wizard', {}).get('stage')
                if stage in ['text_import_file', 'text_import_format', 'output_mapping']:
                    chosen[stage] = (step, state['wizard'])
            if set(chosen) != {'text_import_file', 'text_import_format', 'output_mapping'}:
                failures.append('missing_stage_readback'); continue
            if not chosen['text_import_file'][0] < chosen['text_import_format'][0] < chosen['output_mapping'][0]:
                failures.append('stage_order')
            source = chosen['text_import_file'][1].get('import_source', {}).get('fields', {})
            for name, desired in expected['source'].items():
                f = source.get(name, {})
                value = str(desired) if name == 'rows_to_skip' else desired
                if f.get('status') != 'observed' or f.get('truncated') is True or f.get('value') != value:
                    failures.append('source_' + name)
            owners = [chosen[k][1].get('owner_context', {}) for k in ('text_import_file', 'text_import_format', 'output_mapping')]
            owner_ids = [(o.get('node', {}).get('tid'), [(x.get('tid'), x.get('label')) for x in o.get('path', [])]) for o in owners]
            if any(o.get('status') != 'observed' for o in owners) or not owner_ids[0][0] or any(o != owner_ids[0] for o in owner_ids):
                failures.append('wizard_owner_mismatch')
            if start and nodes and not owner_ids[0][0].endswith('>' + nodes[0]):
                failures.append('reopened_node_mismatch')
            formatted = chosen['text_import_format'][1]
            aliases = {'delimiter': {';': 'Точка с запятой', ',': 'Запятая', '\t': 'Символ табуляции', ' ': 'Пробел'},
                       'decimal_separator': {'.': 'Точка (.)', ',': 'Запятая (,)'},
                       'text_qualifier': {'"': 'Двойная кавычка (")', "'": "Одинарная кавычка (')", '`': 'Обратная кавычка (`)', '': 'Нет'}}
            for name, desired in expected['format'].items():
                f = formatted.get('settings', {}).get('fields', {}).get(name, {})
                allowed = [desired]
                if desired in aliases.get(name, {}):
                    allowed.append(aliases[name][desired])
                if f.get('status') != 'observed' or f.get('truncated') is True or f.get('value') not in allowed:
                    failures.append('format_' + name)
            columns = formatted.get('import_columns', {})
            if columns.get('definition_coverage', {}).get('status') != 'complete_configured_columns' or columns.get('definition_coverage', {}).get('count') != len(expected['columns']):
                failures.append('column_coverage')
            actual = [{k: c.get(k) for k in expected['columns'][0]} for c in columns.get('fields', [])]
            if actual != expected['columns']:
                failures.append('column_values')
            output = chosen['output_mapping'][1].get('output_columns', {})
            if output.get('definition_coverage', {}).get('status') != 'complete_configured_rows' or output.get('definition_coverage', {}).get('count') != len(expected['columns']):
                failures.append('mapping_coverage')
            wanted = [{k: c[k] for k in ('name', 'label', 'type', 'data_kind')} for c in expected['columns']]
            if [{k: c.get(k) for k in wanted[0]} for c in output.get('fields', [])] != wanted:
                failures.append('mapping_values')
            for actual, desired in zip(output.get('fields', []), expected['columns']):
                if actual.get('source', {}).get('status') != 'rendered_source' or actual.get('source', {}).get('label') != desired['label'] or actual.get('source', {}).get('type') != desired['type']:
                    failures.append('mapping_source_values')
    return {'passed': not failures, 'failures': sorted(set(failures)),
            'journal_authentication_verified': False, 'hermes_acceptance_verified': False,
            'package_persistence_verified': False, 'execution_verified': False}


def audit_bound_operation(evidence, request, expected, source_path, prefix, transfer_verified):
    """Bind internal evidence to one real external request and its upload proof."""
    failure = {'passed': False, 'reason': 'node_procedure_binding_missing'}
    if not transfer_verified or not source_path:
        return failure
    try:
        calls, replies, events = evidence['calls'], evidence['tools'], evidence['events']
        configs = [c for c in calls if c.get('tool') == prefix + 'dock_action_run'
                   and c.get('arguments', {}).get('action_key') == 'node.configure_text_import']
        uploads = [c for c in calls if c.get('tool') == prefix + 'dock_artifact_upload']
        if len(configs) != 1 or len(uploads) != 1:
            return failure
        call, upload = configs[0], uploads[0]
        args = call['arguments']; parameters = args['parameters']; operation_id = args['operation_id']
        twins = [r for r in replies if (r.get('session_id'), r.get('tool_call_id')) == (call['session_id'], call['tool_call_id'])]
        if len(twins) != 1 or twins[0].get('tool') != call['tool'] or twins[0]['row'] <= call['row']:
            return failure
        if call['session_id'] != upload['session_id'] or parameters['source_transfer_operation_id'] != upload['arguments']['operation_id']:
            return failure
        output = twins[0]['result']
        if output.get('status') != 'SUCCEEDED' or output.get('cleanup_complete') is not True or output.get('operation_id') != operation_id:
            return failure
        prepared = [(i, e) for i, e in enumerate(events) if e.get('operation_id') == operation_id and e.get('phase') == 'prepared']
        completed = [(i, e) for i, e in enumerate(events) if e.get('operation_id') == operation_id and e.get('phase') == 'completed']
        if len(prepared) != 1 or len(completed) != 1 or prepared[0][0] >= completed[0][0]:
            return failure
        if prepared[0][1].get('parameters') != parameters or completed[0][1].get('outcome') != output:
            return failure
        checkpoint = prepared[0][1].get('checkpoint', {})
        if checkpoint.get('source_transfer_operation_id') != upload['arguments']['operation_id'] or checkpoint.get('workflow_ref') != parameters['node_ref']['workflow_ref']:
            return failure
        subset = events[prepared[0][0]+1:completed[0][0]]
        all_internal = [e for e in events if e.get('operation_id') == operation_id and e.get('internal_provenance') == 'client_node_procedure_v1']
        if not all_internal or all_internal != subset:
            return failure
        if any(not e.get('readiness') for e in subset if e.get('phase') in ('node_observation_sample', 'node_observation_completed')):
            return {**failure, 'reason': 'explicit_readiness_evidence_missing'}
        desired = {'source': {'source_path': source_path, 'encoding': 'UTF-8 (65001)',
                              'rows_to_skip': 0, 'first_line_as_title': True},
                   'format': {'delimiter': expected['input']['delimiter'], 'decimal_separator': expected['input']['decimal_separator'],
                              'text_qualifier': expected['input']['quote'], 'null_marker': expected['input']['null_literal']},
                   'columns': [{'name': c['name'], 'label': c['name'], 'type': c['type'], 'used': True,
                                'data_kind': 'Непрерывный' if c['type'] in ('integer', 'real') else 'Дискретный'} for c in expected['schema']]}
        if parameters['settings'] != desired:
            return {**failure, 'reason': 'declared_fixture_settings_mismatch'}
        first = next(e['outcome']['output'] for e in subset if e['phase'] == 'node_observation_completed')
        if first.get('authenticated') is not True or first.get('dom_epoch', {}).get('document') != checkpoint.get('document_id') or first.get('wizard', {}).get('owner_context') != checkpoint.get('owner'):
            return failure
        proof = verify_text_import_roundtrip(subset, operation_id, desired)
        return {**proof, 'operation_id': operation_id, 'reason': 'bound_internal_text_import_roundtrip'}
    except (KeyError, TypeError, ValueError, IndexError, StopIteration, AttributeError):
        return failure


def refresh_control_binding(state, action, control):
    binding = {k: control.get(k) for k in ('tid', 'identity', 'label')}
    process = state.get('node_processes', {})
    node = state.get('prepared_node_context', {})
    part = control.get('graph_node', {}).get('part')
    if (action.get('verb') == 'click' and part in ('body', 'label') and node.get('verified') is True
            and node.get('surface') == 'graph' and all(node.get(k) for k in ('document_id','workflow_id','node_id','tid'))
            and control.get('tid') == node['tid'] + (';Label;Label' if part == 'label' else '')
            and control.get('identity', {}).get('anchor_tid') == control['tid']
            and control.get('identity', {}).get('path') == []):
        return dict(prepared_graph_selection={k:node[k] for k in ('document_id','workflow_id','node_id','tid')})
    grid = control.get('process_grid', {})
    # Right-click opens the console menu on its native grid, whose text changes
    # as process rows load. Row/menu actions retain the ordinary label guard.
    if (action.get('verb') == 'right_click' and control.get('tid') in (
            'ConsoleForm;ProgressForm;trpProgress;grd;tbl', 'ConsoleForm;ProgressForm;trpProgress;treepanel;tree')
            and grid.get('panel_ref') and grid.get('grid_id') and process.get('verified') is True
            and process.get('root_id') and node.get('verified') is True
            and process.get('node_context', {}).get('verified') is True
            and all(node.get(k) and node[k] == process['node_context'].get(k) for k in ('document_id','workflow_id','node_id'))):
        binding.pop('label')
        binding.update(process_grid=grid, root_id=process['root_id'], node={k:node[k] for k in ('document_id','workflow_id','node_id')})
    return binding
