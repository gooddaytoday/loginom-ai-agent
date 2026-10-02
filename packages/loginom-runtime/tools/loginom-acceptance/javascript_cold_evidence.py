"""Actual separate cold-reader source/state/fresh Table evidence, without JS eval.

Caller authenticates files, writer baseline, source freeze, path-only launch and
original process termination. This module never certifies those or whole CLI.
"""
import copy
import csv
import hashlib
import io
from datetime import datetime
from javascript_cli_evidence import value_digest
from javascript_cli_persistence import owned_package_path
from import_execution_evidence import verify_execution_observations
from import_output_evidence import verify_table_output_observations
from node_procedure_evidence import verify_internal_sequence


OWNER_KEYS = ('document_id','workflow_id','node_id')
READ_PHASES = ('source_open_dispatch','source_open_settled','source_discard_dispatch','source_discard_settled','source_delivery_verified')


def epoch(text):
    return int(datetime.fromisoformat(text.replace('Z','+00:00')).timestamp()*1000)


def source_identity(source):
    text = source.decode('utf-8')
    if '\r' in text or '\x00' in text or not source or len(source) > 32768:raise ValueError('cold_source_contract')
    return dict(source_sha256=hashlib.sha256(source).hexdigest(),source_utf8_bytes=len(source),source_lf_lines=text.count('\n')+1)


def graph_meaning(graph,node):
    if (graph.get('complete') is not True or graph.get('interaction_ready') is not True or graph.get('foreign_links') != []
            or graph.get('document_id') != node['document_id'] or graph.get('workflow_ref',{}).get('workflow_id') != node['workflow_id']
            or not isinstance(graph.get('nodes'),list) or not graph['nodes'] or len(graph['nodes']) > 20
            or not isinstance(graph.get('links'),list) or len(graph['links']) > 400):
        raise ValueError('cold_graph_inventory')
    nodes = graph['nodes']
    if len({n['ref']['node_id'] for n in nodes}) != len(nodes) or len([n for n in nodes if n['ref']['node_id'] == node['node_id']]) != 1:
        raise ValueError('cold_graph_node_identity')
    for n in nodes:
        if (n['ref'].get('document_id') != node['document_id'] or n['ref'].get('workflow_id') != node['workflow_id']
                or not n['ref'].get('node_id') or n.get('locked') is not False
                or any(not isinstance(n.get(k),list) or len(set(n[k])) != len(n[k])
                    or any(type(v) is not int or not 0 <= v < 100 for v in n[k]) for k in ('inputs','outputs'))):
            raise ValueError('cold_graph_native_owner_ports')
    links = graph['links']
    if len({value_digest(e) for e in links}) != len(links) or any(set(e) != {'source','output','target','input'}
            or type(e['input']) is not int or type(e['output']) is not int
            or not any(n['ref']['node_id'] == e['source'] and e['output'] in n['outputs'] for n in nodes)
            or not any(n['ref']['node_id'] == e['target'] and e['input'] in n['inputs'] for n in nodes) for e in links):
        raise ValueError('cold_graph_endpoints')
    return dict(nodes=sorted([{**{k:v for k,v in n.items() if k not in ('dom_epoch','ref')},'node_id':n['ref']['node_id']} for n in nodes],key=lambda n:n['node_id']),
        links=sorted(links,key=value_digest))


def settings_for_writer(settings,cold_prefix,writer_prefix):
    value = copy.deepcopy(settings)
    if type(value.get('generation')) is not bool or set(value) != {'generation','grids'} or len(value['grids']) != 2:
        raise ValueError('cold_settings_inventory')
    root = ';WizrdMCF;JavaScriptColumnsWizard;'
    for grid,suffix in zip(value['grids'],('grdSourceColumns;tbl','grdTargetColumns;tbl')):
        if set(grid) != {'tid','fields'} or grid['tid'] != cold_prefix+root+suffix or not isinstance(grid['fields'],list):
            raise ValueError('cold_settings_grid_identity')
        grid['tid'] = writer_prefix+root+suffix
        for field in grid['fields']:
            for key in ('record_id','connected_record_id','connected_back_id'):field.pop(key,None)
            # Same narrow 7.4.2 normalization as javascriptManagedSourceSettings.
            # Non-null ConnectedRecord and every other scalar remain meaningful.
            if 'ConnectedRecord' in field and field['ConnectedRecord'] is None:del field['ConnectedRecord']
    return value


def mapping_meaning(mapping,node,direction,*,pending=False):
    context = mapping['node_context']
    port = context[direction+'_port']
    if (mapping.get('inventory_complete') is not True or mapping.get('state_source') != 'cached_mapping_stores'
            or mapping.get('settings_applied') is not False or mapping.get('package_saved') is not False
            or type(mapping.get('autosync')) is not bool or context.get('verified') is not True or context.get('surface') != 'wizard'
            or any(context.get(k) != node[k] for k in OWNER_KEYS) or port.get('direction') != direction or type(port.get('port')) is not int
            or port['port'] != 0 or not isinstance(port.get('port_guid'),str) or not port['port_guid']
            or type(port.get('native_index')) is not int or port['native_index'] != 0
            or mapping.get('mapping_wizard') != ('TuneDataSourceMappingWizard' if direction == 'input' else 'DataSetOutputSocketWizard')
            or any(not isinstance(mapping.get(k),list) or len(mapping[k]) > 1000 for k in ('source_fields','target_fields'))):
        raise ValueError('cold_mapping_inventory:'+direction)
    sources,targets = mapping['source_fields'],mapping['target_fields']
    if (mapping.get('rendered_indices') != list(range(len(targets)))
            or any(type(f.get('index')) is not int or f['index'] != i or not isinstance(f.get('record_id'),str) or not f['record_id']
                for fields in (sources,targets) for i,f in enumerate(fields))
            or any(len({f['record_id'] for f in fields}) != len(fields) for fields in (sources,targets))):
        raise ValueError('cold_mapping_dense_native_fields:'+direction)
    if pending:
        prefix = context['tid']+';DataSetOutputSocketWizard;'
        want = dict(kind='hidden_source_column',header_tid=prefix+'grdTargetColumns;headercontainer',column_tid=prefix+'colSourceDisplayName',
            data_index='SourceDisplayName',item_id='colSourceDisplayName',hidden=True,visible=False,source_count=0,target_count=len(targets),native_header_verified=True)
        if (direction != 'output' or mapping.get('verified') is not False or mapping.get('source_identity_verified') is not False
                or mapping.get('configured_inventory_verified') is not True or mapping.get('reason') != 'mapping_source_pending'
                or sources or not targets or value_digest(mapping.get('source_pending')) != value_digest(want)
                or any(t.get('source') is not None or t.get('exclusion_source') is not None or t.get('excluded') is not False for t in targets)):
            raise ValueError('cold_mapping_configured_pending')
    elif (mapping.get('verified') is not True or mapping.get('source_identity_verified') is not True
            or mapping.get('configured_inventory_verified') is True or 'source_pending' in mapping
            or len(sources) != len(targets) or {t.get('source',{}).get('record_id') for t in targets} != {s['record_id'] for s in sources}
            or any(t.get('excluded') is True
                or not any(value_digest(t.get('source')) == value_digest(s) for s in sources) for t in targets)):
        raise ValueError('cold_mapping_native_reciprocity:'+direction)
    strip = lambda field:{k:v for k,v in field.items() if k not in ('record_id','field_id')}
    return dict(autosync=mapping['autosync'],source_fields=[strip(s) for s in sources],target_fields=[{**strip({k:v for k,v in t.items() if k not in ('source','exclusion_source')}),
        'source':strip(t['source']) if t.get('source') is not None else None,
        'exclusion_source':strip(t['exclusion_source']) if t.get('exclusion_source') is not None else None} for t in targets])


def cold_table_proof(rows,report,execution_op,execution_id,columns,expected_rows,ceiling):
    if (not columns or len({c['name'] for c in columns}) != len(columns) or any(c['type'] not in ('integer','string') for c in columns)
            or any(len(r) != len(columns) or any(v is not None and (type(v) is not int or not -(2**63) <= v < 2**63)
                if c['type'] == 'integer' else v is not None and not isinstance(v,str) for c,v in zip(columns,r)) for r in expected_rows)):
        raise ValueError('cold_business_oracle')
    cold = report['cold']
    result = cold['output']
    output_rows = [(i,r) for i,r in enumerate(rows) if r.get('phase') == 'cold_output_observed']
    if (len(output_rows) != 1 or output_rows[0][1].get('execution_started') is not False
            or value_digest(output_rows[0][1].get('node')) != value_digest(cold['node'])
            or value_digest(output_rows[0][1].get('result')) != value_digest(result)
            or result.get('filter_enabled') is not False or result.get('sample_complete') is not True
            or result.get('row_count') != len(expected_rows) or result.get('sample_rows') != len(expected_rows)):
        raise ValueError('cold_output_native_receipt')
    begin = next(i for i,r in enumerate(rows) if r.get('operation_id') == execution_op)
    observations = [(i,r['outcome']['output']) for i,r in enumerate(rows) if begin <= i < output_rows[0][0] and r.get('phase') == 'node_observation_completed']
    pages = [(i,s) for i,s in observations if s.get('node_table',{}).get('verified') is True
        and value_digest(s['node_table'].get('table')) == value_digest(result['table']) and s['node_table'].get('rows')]
    if not pages:raise ValueError('cold_full_native_table_missing')
    # Data proof ends at the last native data page. Restoration/return are
    # separate cleanup obligations; never replace their absent receipt by True.
    end = max(i for i,s in pages)
    table_ops = {r['operation_id'] for i,r in enumerate(rows) if begin <= i <= end and r.get('phase') == 'node_observation_completed'
        and r.get('outcome',{}).get('output',{}).get('node_table',{}).get('table') == result['table']}
    if len(table_ops) != 1:raise ValueError('cold_table_procedure_identity')
    table_op = next(iter(table_ops))
    sequence = verify_internal_sequence(rows,table_op,max_steps=4096,cold_read_ceiling=dict(operation_id=table_op,node=cold['node'],deadline_at=ceiling,total_ms=600000))
    if not sequence['passed']:raise ValueError('cold_table_sequence:'+','.join(sequence['failures']))
    if any(s.get('origin') not in ('http://logi-test-plan.bg.local','http://logi-test-plan.bg.local/')
            or s.get('loginom_build') != '7.4.2'
            or any(s.get('prepared_node_context',{}).get(k) != cold['node'][k] for k in OWNER_KEYS)
            for _,s in sequence['observations']):
        raise ValueError('cold_table_native_origin_owner')
    observations = [(i,s) for i,s in observations if i <= end]
    mutations = []
    for i,r in enumerate(rows):
        if not begin <= i <= end or r.get('phase') != 'node_step_prepared':continue
        completed = [v for v in rows[i+1:] if v.get('phase') == 'node_step_completed' and v.get('internal_operation_id') == r.get('internal_operation_id')]
        if len(completed) != 1:raise ValueError('cold_table_mutation_receipt')
        mutations.append((i,r['action'],completed[0]['outcome']))
    marker = '__JAVASCRIPT_COLD_ORACLE_NULL__'
    if any(marker in r for r in expected_rows):raise ValueError('cold_oracle_marker_collision')
    stream = io.StringIO(newline='')
    writer = csv.writer(stream,delimiter=';',lineterminator='\n')
    writer.writerow([c['name'] for c in columns]);writer.writerows([[marker if v is None else v for v in r] for r in expected_rows])
    request = dict(target=dict(kind='existing'),mappings=[],read=dict(sample_rows=len(expected_rows)),parameters=dict(settings=dict(
        source=dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True),format=dict(delimiter=';',text_qualifier='"',decimal_separator='.',null_marker=marker),
        columns=[dict(c,label=c.get('label',c['name']),used=True) for c in columns])))
    port = dict(result,port=0,port_guid=result['table']['port_guid'],execution_id=execution_id)
    checkpoint = dict(execution=dict(execution_id=execution_id),output=dict(ports=[port]))
    failures = verify_table_output_observations(observations,mutations,request,stream.getvalue().encode('utf-8'),checkpoint,execution_id)
    for i,r in enumerate(expected_rows):
        for j,(value,column) in enumerate(zip(r,columns)):
            cell = result['sample'][i][j]
            if (cell.get('is_null') is not (value is None) or cell.get('type') != column['type'] or value is None and cell.get('value') is not None
                    or value is not None and (cell.get('value') != (str(value) if column['type'] == 'integer' else value)
                        or cell.get('precision') != ('exact_integer' if column['type'] == 'integer' else 'display_text')
                        or cell.get('representation') != ('decimal_integer' if column['type'] == 'integer' else 'cached_display_text'))):
                failures.append('cold_typed_value:'+str(i)+':'+str(j))
    if failures:raise ValueError('cold_native_table:'+','.join(sorted(set(failures))))


def verify_javascript_cold(report,events,writer,expected,columns,expected_rows):
    failures = []
    execution_id = None
    try:
        source = writer['source']
        metadata = source_identity(source)
        path = writer['package_path']
        if writer['schema_mode'] not in ('code','declared') or not writer['execution_ids'] or len(set(writer['execution_ids'])) != len(writer['execution_ids']):
            raise ValueError('cold_writer_baseline_contract')
        if not owned_package_path(path,expected['account']) or path != expected['package_path']:
            raise ValueError('cold_external_owned_path')
        if set(expected['journal']) - {'session_id','runtime_revision','target','manifest_sha256'} or not all(expected['journal'].get(k) for k in ('session_id','runtime_revision','target')):
            raise ValueError('cold_external_journal_pin')
        if not events or any(any(value_digest(r.get(k)) != value_digest(v) for k,v in expected['journal'].items()) for r in events):
            raise ValueError('cold_journal_owner_pin')
        cold = report['cold']
        node,prepared = cold['node'],cold['prepared']
        start,work,end = [epoch(report[k]) for k in ('started_at','work_finished_at','finished_at')]
        birth = epoch(report['host_process']['started_at'])
        ceiling = report['original_deadline']
        if (report.get('status') != 'OBSERVED' or report.get('headless') is not False or report.get('explicit_execution_limit') != 1
                or cold.get('status') != 'COLD_OBSERVED' or report.get('failure') or type(ceiling) is not int
                or ceiling != birth+600000 or not birth <= start <= work <= ceiling or not work <= end <= work+180000
                or birth <= epoch(writer['finished_at']) or any(not birth <= epoch(r['recorded_at']) <= end for r in events)):
            raise ValueError('cold_original_process_budget')
        work_phases = set(READ_PHASES) | {'port_mapping_observed','cold_output_observed','execution_launched','execution_terminal',
            'execution_boundary_observed','javascript_source_admitted','javascript_source_effect_dispatch','javascript_source_effect_returned',
            'node_step_prepared','node_step_completed','node_observation_prepared','node_observation_sample','node_observation_completed'}
        if any(epoch(r['recorded_at']) > ceiling for r in events if r.get('phase') in work_phases):
            raise ValueError('cold_work_after_original_deadline')
        target = expected['preparation_target']
        if (set(target) != {'profile_id','loginom_build','platform','browser'} or not target['profile_id']
                or target['loginom_build'] != '7.4.2' or target['platform'] != 'linux' or target['browser'] != 'chromium'
                or value_digest(prepared.get('target')) != value_digest(target)):
            raise ValueError('cold_preparation_target_pin')
        if (cold['path'] != path or prepared.get('status') != 'READY' or prepared.get('authenticated') is not True
                or prepared.get('created_draft') is not False or prepared.get('ownership_verified') is not False or prepared.get('target_verified') is not True
                or prepared.get('loginom_account') != expected['account'] or prepared.get('session_id') != expected['preparation_session_id']
                or prepared.get('package_ref',{}).get('persisted') is not True or prepared['package_ref'].get('path') != path
                or prepared.get('document_id') != node['document_id'] or prepared['workflow_ref'].get('workflow_id') != node['workflow_id']
                or node['document_id'] == writer['node']['document_id'] or node['workflow_id'] == writer['node']['workflow_id']
                or node['node_id'] != writer['node']['node_id']):
            raise ValueError('cold_new_owned_saved_document')
        preparations = [(i,r) for i,r in enumerate(events) if r.get('phase') == 'cold_workspace_prepared']
        if len(preparations) != 1 or value_digest(preparations[0][1].get('prepared')) != value_digest(prepared):
            raise ValueError('cold_native_preparation')
        before,after = cold['graph_before'],cold['graph_after']
        writer_graph = graph_meaning(writer['graph'],writer['node'])
        if any(value_digest(graph_meaning(g,node)) != value_digest(writer_graph) or value_digest(g['workflow_ref']) != value_digest(prepared['workflow_ref']) for g in (before,after)):
            raise ValueError('cold_guid_graph_persistence')
        boundaries = [(i,r) for i,r in enumerate(events) if r.get('phase') == 'execution_boundary_observed']
        if (not boundaries or any(value_digest(graph_meaning(r['before'],node)) != value_digest(writer_graph)
                or value_digest(graph_meaning(r['after'],node)) != value_digest(writer_graph) for i,r in boundaries)):
            raise ValueError('cold_graph_native_boundary')
        actual = cold['source']
        if (actual.get('source_text','').encode('utf-8') != source or any(actual.get(k) != v for k,v in metadata.items())
                or any(type(actual.get(k)) is not int for k in ('source_utf8_bytes','source_lf_lines'))):
            raise ValueError('cold_full_saved_source')
        owner,admission = actual['owner'],actual['admission']
        if (any(owner.get(k) != node[k] or admission.get('owner',{}).get(k) != node[k] for k in OWNER_KEYS)
                or admission.get('intent') != 'preserve' or admission.get('kind') != 'existing' or admission.get('phase') != 'admitted'
                or admission.get('deadline') != ceiling or admission.get('planned_settings_sha256') is not None
                or value_digest(admission.get('previous_source')) != value_digest(metadata)
                or any(admission.get('effective_source',{}).get(k) != v for k,v in metadata.items())):
            raise ValueError('cold_source_preserve_admission')
        settings = settings_for_writer(actual['settings'],prepared['workflow_ref']['prefix'],writer['prefix'])
        # Source admission hashes the original observed settings including null
        # cache references; cross-process comparison uses the canonical projection.
        if (value_digest(actual['settings']) != admission.get('settings_sha256')
                or value_digest(settings) != writer['settings_sha256'] or settings['generation'] is not (writer['schema_mode'] == 'code')):
            raise ValueError('cold_full_settings_persistence')
        admissions = []
        for phase in ('javascript_source_admitted','javascript_source_effect_dispatch','javascript_source_effect_returned'):
            found = [(i,r) for i,r in enumerate(events) if r.get('phase') == phase]
            if len(found) != 1 or value_digest(found[0][1].get('receipt')) != value_digest(admission):raise ValueError('cold_source_effect_receipts')
            admissions.append(found[0][0])
        launches = [(i,r) for i,r in enumerate(events) if r.get('phase') == 'execution_launched']
        terminals = [(i,r) for i,r in enumerate(events) if r.get('phase') == 'execution_terminal']
        if len(launches) != 1 or len(terminals) != 1 or not preparations[0][0] < admissions[0] < admissions[1] < launches[0][0] < terminals[0][0] < admissions[2]:
            raise ValueError('cold_single_execute_order')
        execution = cold['execution']
        execution_id = execution['execution_id']
        if (value_digest(terminals[0][1].get('terminal')) != value_digest(execution) or launches[0][1].get('execution_dispatched') is not True
                or any(value_digest(r.get('node')) != value_digest(node) for i,r in launches+terminals)
                or value_digest(launches[0][1].get('identity')) != value_digest(execution['trial'])
                or value_digest(terminals[0][1].get('identity')) != value_digest(execution['trial'])
                or value_digest(terminals[0][1].get('baseline')) != value_digest(execution.get('fresh_baseline'))
                or value_digest(terminals[0][1].get('identified')) != value_digest(execution.get('launch_identity'))
                or any(value_digest(execution.get(k,{}).get('node')) != value_digest(node) for k in ('fresh_baseline','launch_identity'))
                or execution['trial'].get('source_sha256') != metadata['source_sha256'] or execution.get('status') != 'completed'
                or any(execution.get(k) is not True for k in ('verified','owner_verified','cleanup_complete'))
                or execution_id in writer['execution_ids']):
            raise ValueError('cold_native_fresh_execution')
        executes = [(i,r) for i,r in enumerate(events) if r.get('phase') == 'node_step_prepared' and r.get('action',{}).get('verb') == 'execute_graph_node']
        if len(executes) != 1:raise ValueError('cold_native_single_launch')
        execution_op = executes[0][1]['operation_id']
        sequence = verify_internal_sequence(events,execution_op,max_steps=4096)
        if any(s.get('origin') not in ('http://logi-test-plan.bg.local','http://logi-test-plan.bg.local/')
                or s.get('loginom_build') != '7.4.2' for _,s in sequence['observations']):
            raise ValueError('cold_execution_native_origin')
        proof = verify_execution_observations(sequence['observations'],sequence['mutations'],node,launch_mode='graph')
        if not sequence['passed'] or not proof['passed'] or proof['execution_id'] != execution_id:
            raise ValueError('cold_native_execute_procedure')
        deliveries = [(i,r) for i,r in enumerate(events) if r.get('phase') == 'source_delivery_verified']
        offset = 0
        groups = []
        previous = preparations[0][0]
        for i,r in deliveries:
            receipt = r['receipt']
            if (value_digest(r.get('owner')) != value_digest(admission['owner']) or r.get('admission_id') != admission['admission_id']
                    or r.get('deadline') != ceiling or any(receipt.get(k) != v for k,v in metadata.items())
                    or any(type(receipt.get(k)) is not int for k in ('source_utf8_bytes','source_lf_lines'))
                    or type(r.get('read_id')) is not int or r['read_id'] <= 0
                    or type(receipt.get('offset_utf8_bytes')) is not int or receipt['offset_utf8_bytes'] != offset
                    or type(receipt.get('chunk_utf8_bytes')) is not int or not 0 < receipt['chunk_utf8_bytes'] <= 4096):
                raise ValueError('cold_source_chunk_identity')
            count = receipt['chunk_utf8_bytes']
            chunk = source[offset:offset+count]
            if len(chunk) != count or hashlib.sha256(chunk).hexdigest() != receipt.get('chunk_sha256'):raise ValueError('cold_source_chunk_bytes')
            lifecycle = []
            for phase in READ_PHASES:
                found = [(j,v) for j,v in enumerate(events) if v.get('phase') == phase and v.get('read_id') == r['read_id']]
                if (len(found) != 1 or found[0][0] <= previous or value_digest(found[0][1].get('owner')) != value_digest(admission['owner'])
                        or found[0][1].get('admission_id') != admission['admission_id'] or found[0][1].get('deadline') != ceiling):
                    raise ValueError('cold_source_read_lifecycle')
                lifecycle.append(found[0][0])
            if lifecycle != sorted(lifecycle):raise ValueError('cold_source_read_order')
            previous = i
            offset += count
            if receipt.get('cursor_sha256') is None:
                if offset != len(source):raise ValueError('cold_source_incomplete')
                groups.append((lifecycle[0],i));offset = 0
            elif (offset >= len(source) or not isinstance(receipt['cursor_sha256'],str) or len(receipt['cursor_sha256']) != 64
                    or any(c not in '0123456789abcdef' for c in receipt['cursor_sha256'])):
                raise ValueError('cold_source_cursor')
        if (offset or len(groups) != 3 or not groups[0][1] < admissions[0] < groups[1][0] <= groups[1][1] < admissions[1]
                or not admissions[1] < groups[2][0] <= groups[2][1] < launches[0][0]):
            raise ValueError('cold_three_fresh_source_checks')
        mapping_rows = [(i,r) for i,r in enumerate(events) if r.get('phase') == 'port_mapping_observed']
        if len(mapping_rows) != 4:raise ValueError('cold_mapping_observation_inventory')
        for side,after_execute in (('mappings_before',False),('mappings_after',True)):
            for direction in ('input','output'):
                m = cold[side][direction]
                matches = [(i,r) for i,r in mapping_rows if r.get('direction') == direction and value_digest(r.get('mapping')) == value_digest(m)]
                bound = [i for i,r in matches if i > terminals[0][0]] if after_execute else [i for i,r in matches if groups[0][1] < i < admissions[1]]
                if not bound or m['node_context'][direction+'_port']['port_guid'] != writer['mappings'][direction]['node_context'][direction+'_port']['port_guid']:
                    raise ValueError('cold_mapping_native_port_binding')
                want = mapping_meaning(writer['mappings'][direction],writer['node'],direction)
                pending = not after_execute and direction == 'output' and m.get('configured_inventory_verified') is True
                observed = mapping_meaning(m,node,direction,pending=pending)
                if pending:
                    strip_source = lambda fields:[{k:v for k,v in f.items() if k not in ('source','exclusion_source')} for f in fields]
                    equal = observed['autosync'] is want['autosync'] and value_digest(strip_source(observed['target_fields'])) == value_digest(strip_source(want['target_fields']))
                elif not after_execute and direction == 'output' and writer['schema_mode'] == 'code' and not observed['source_fields'] and not observed['target_fields']:
                    equal = observed['autosync'] is want['autosync']
                else:equal = value_digest(observed) == value_digest(want)
                if not equal:raise ValueError('cold_mapping_semantic_persistence:'+side+':'+direction)
        if any(r.get('phase','').startswith(('javascript_source_write','javascript_source_mutation','persistence_save')) for r in events):
            raise ValueError('cold_source_or_save_mutation')
        cold_table_proof(events,report,execution_op,execution_id,columns,expected_rows,ceiling)
    except (KeyError,IndexError,TypeError,AttributeError,ValueError,UnicodeError,OverflowError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'cold_evidence_malformed')
    return dict(passed=not failures,failures=sorted(set(failures)),execution_id=execution_id,scope='separate_technical_cold_source_state_native_execution_full_table_evidence',
        source_settings_mapping_graph_evidence_verified=not failures,cold_fresh_execution_evidence_verified=not failures,
        cold_full_business_table_evidence_verified=not failures,writer_lifecycle_verified=False,journal_authenticated=False,
        launch_arguments_verified=False,source_freeze_verified=False,process_termination_verified=False,cli_acceptance_verified=False)
