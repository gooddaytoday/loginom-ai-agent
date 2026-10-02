"""Source-bound fresh late-read native business/format/return proof, without JS eval.

Caller authenticates files and derives baseline from the independently verified
writer/source operation. Historical native fixtures do not certify that parent.
"""
from javascript_cli_candidate import hexadecimal
from javascript_cli_evidence import value_digest
from javascript_configuration_evidence import javascript_operation,OWNER_KEYS
from javascript_source_evidence import source_identity,verify_closed_source_read
from javascript_output_evidence import javascript_business_table
from import_execution_evidence import verify_execution_observations


def verify_read_source(events,operation,request,baseline):
    node = operation['node']
    metadata = source_identity(baseline['source'])
    if (metadata['source_lf_lines'] > 1024 or value_digest(request['parameters']['javascript_source']) != value_digest(metadata)
            or any(baseline['node'].get(k) != node[k] for k in OWNER_KEYS)
            or not hexadecimal(baseline.get('settings_sha256'),64)):
        raise ValueError('javascript_reread_external_source_settings_node')
    op = request['operation_id']
    selected = [(i,r) for i,r in enumerate(events) if (r.get('owner') or r.get('receipt',{}).get('owner') or {}).get('operation_id') == op]
    owned = [(i,r) for i,r in selected if r.get('phase') in ('source_open_dispatch','source_open_settled','source_discard_dispatch',
        'source_discard_settled','source_delivery_verified','javascript_source_admitted','javascript_source_effect_dispatch','javascript_source_effect_returned')]
    if not owned or any(tuple(r.get(k) for k in ('session_id','runtime_revision','target')) != operation['identity']
            or any((r.get('owner') or r['receipt']['owner']).get(k) != node[k] for k in OWNER_KEYS) for i,r in owned):
        raise ValueError('javascript_reread_source_native_identity')
    admissions = [(i,r['receipt']) for i,r in owned if r['phase'] == 'javascript_source_admitted']
    dispatches = [(i,r['receipt']) for i,r in owned if r['phase'] == 'javascript_source_effect_dispatch']
    returns = [(i,r['receipt']) for i,r in owned if r['phase'] == 'javascript_source_effect_returned']
    if (len(admissions) != 2 or len(dispatches) != 1 or len(returns) != 1
            or admissions[0][1]['admission_id'] == admissions[1][1]['admission_id']
            or value_digest(dispatches[0][1]) != value_digest(admissions[1][1]) or value_digest(returns[0][1]) != value_digest(admissions[1][1])):
        raise ValueError('javascript_reread_source_effect_receipts')
    for (index,receipt),phase in zip(admissions,('target','finish')):
        if (receipt.get('intent') != 'preserve' or receipt.get('kind') != 'existing' or receipt.get('phase') != 'admitted'
                or not isinstance(receipt.get('admission_id'),str) or not receipt['admission_id']
                or type(receipt.get('deadline')) is not int
                or receipt['deadline'] != next(r['receipt']['deadline'] for r in operation['rows']
                    if r.get('phase') == 'node_phase_prepared' and r['receipt']['phase'] == phase)
                or receipt.get('planned_settings_sha256') is not None
                or value_digest(receipt.get('previous_source')) != value_digest(metadata)
                or value_digest(receipt.get('expected_source_identity')) != value_digest(metadata)
                or any(receipt.get('effective_source',{}).get(k) != v for k,v in metadata.items())
                or receipt['effective_source'].get('status') != 'ADMITTED' or receipt['effective_source'].get('policy') != 'javascript-module-v1'
                or receipt.get('settings_sha256') != baseline['settings_sha256']):
            raise ValueError('javascript_reread_source_preserve_admission')
    groups = {}
    for i,row in owned:
        if row['phase'] != 'source_delivery_verified':continue
        key = row.get('admission_id'),row.get('read_id')
        if (not isinstance(key[0],str) or type(key[1]) is not int or key[1] <= 0):raise ValueError('javascript_reread_source_read_identity')
        groups.setdefault(key,[]).append((i,row))
    if len(groups) != 4:raise ValueError('javascript_reread_four_source_checks')
    boundaries = []
    for (admission_id,read_id),deliveries in groups.items():
        admission = next((r for i,r in admissions if r['admission_id'] == admission_id),None)
        if admission is None:raise ValueError('javascript_reread_foreign_source_admission')
        closed = [(i,r) for i,r in owned if r['phase'].startswith('source_')
            and r.get('admission_id') == admission_id and r.get('read_id') == read_id]
        start,end = verify_closed_source_read(closed,baseline['source'],metadata,admission['owner'],admission['deadline'])
        boundaries.append((start,end,admission_id))
    launch = [(i,r) for i,r in enumerate(events) if r.get('operation_id') == op and r.get('phase') == 'node_step_prepared'
        and r.get('action',{}).get('verb') == 'execute_graph_node']
    if (len(launch) != 1 or not boundaries[0][1] < admissions[0][0] < boundaries[1][0] <= boundaries[1][1]
            < admissions[1][0] < boundaries[2][0] <= boundaries[2][1] < dispatches[0][0]
            < boundaries[3][0] <= boundaries[3][1] < launch[0][0] < returns[0][0]
            or boundaries[0][2] != admissions[0][1]['admission_id']
            or any(b[2] != admissions[1][1]['admission_id'] for b in boundaries[1:])):
        raise ValueError('javascript_reread_source_fresh_dispatch_order')
    if any('refused' in r.get('phase','') or r.get('phase','').startswith(('javascript_source_write','javascript_source_mutation')) for i,r in selected):
        raise ValueError('javascript_reread_source_refusal_or_mutation')
    settings = [r for r in operation['rows'] if r.get('phase') == 'javascript_managed_source_settings_observed']
    if len(settings) != 4 or any(value_digest(r['settings']) != baseline['settings_sha256']
            or r.get('settings_sha256') != baseline['settings_sha256'] or r.get('effect_possible') is not False
            or any(r.get('owner',{}).get(k) != node[k] for k in OWNER_KEYS) for r in settings):
        raise ValueError('javascript_reread_settings_preserved')
    output = operation['result']['output']['javascript_source']
    if (any(output.get(k) != v for k,v in metadata.items()) or output.get('source_operation_id') != baseline['operation_id']
            or output.get('settings_sha256') != baseline['settings_sha256'] or output.get('policy') != 'javascript-module-v1'):
        raise ValueError('javascript_reread_delivered_source_settings')
    if any(r.get('phase','').startswith(('javascript_source_write','javascript_source_mutation','persistence_save')) for i,r in selected):
        raise ValueError('javascript_reread_source_or_save_mutation')


def verify_javascript_read_output(events,request,baseline,columns,rows,*,expected_target=None,expected_origin=None):
    failures = []
    execution_id = None
    try:
        if (not columns or len({c['name'] for c in columns}) != len(columns) or any(c['type'] not in ('integer','string') for c in columns)
                or any(len(r) != len(columns) or any(v is not None and (type(v) is not int or not -(2**63) <= v < 2**63)
                    if c['type'] == 'integer' else v is not None and not isinstance(v,str) for c,v in zip(columns,r)) for r in rows)
                or request.get('read',{}).get('ports') != [0] or request['read'].get('require_exact_numbers') is not True
                or 'coverage' in request['read'] or type(request['read'].get('sample_rows')) is not int
                or not len(rows) <= request['read']['sample_rows'] <= 100):
            raise ValueError('javascript_reread_full_business_oracle')
        if (request['target']['kind'] != 'existing' or request['inputs'] != [] or request['mappings'] != []
                or set(request['parameters']) != {'source_operation_id','schemas','javascript_source'}
                or request['parameters']['source_operation_id'] != baseline['operation_id'] or request['operation_id'] == baseline['operation_id']
                or not baseline['execution_ids'] or len(set(baseline['execution_ids'])) != len(baseline['execution_ids'])):
            raise ValueError('javascript_reread_retained_request')
        operation = javascript_operation(events,request,expected_target=expected_target,expected_origin=expected_origin,reading=True)
        if any(s.get('origin') not in ('http://logi-test-plan.bg.local','http://logi-test-plan.bg.local/')
                or s.get('loginom_build') != '7.4.2' for _,s in operation['sequence']['observations']):
            raise ValueError('javascript_reread_native_target_origin')
        own = operation['rows']
        source_ends = [(i,r) for i,r in enumerate(events) if r.get('phase') == 'completed' and r.get('operation_id') == baseline['operation_id']]
        if (len(source_ends) != 1 or source_ends[0][0] >= events.index(own[0])
                or tuple(source_ends[0][1].get(k) for k in ('session_id','runtime_revision','target')) != operation['identity']
                or source_ends[0][1]['outcome'].get('status') != 'SUCCEEDED' or source_ends[0][1]['outcome'].get('cleanup_complete') is not True
                or value_digest(source_ends[0][1]['outcome']['output']['node']) != value_digest(baseline['node'])
                or source_ends[0][1]['outcome']['output']['execution']['execution_id'] not in baseline['execution_ids']):
            raise ValueError('javascript_reread_parent_native_completion')
        phases = operation['phases']
        if (phases['source']['value'].get('source_operation_id') != baseline['operation_id']
                or phases['finish']['value'].get('settings_applied') is not False
                or operation['result'].get('configuration') != {'status':'not_requested'}):
            raise ValueError('javascript_reread_configuration_not_requested')
        verify_read_source(events,operation,request,baseline)
        proof = verify_execution_observations(operation['sequence']['observations'],operation['sequence']['mutations'],operation['node'],launch_mode='graph')
        execution_id = proof['execution_id']
        if (not proof['passed'] or not execution_id or execution_id in baseline['execution_ids']
                or phases['finish']['value'].get('execution_id') != execution_id or phases['finish']['value'].get('execution_started') is not True
                or phases['execute']['value'].get('execution_id') != execution_id or phases['execute']['value'].get('status') != 'completed'
                or phases['execute']['value'].get('owner_verified') is not True):
            raise ValueError('javascript_reread_fresh_native_execution')
        # Table decoding adds an observed UI header locator; retained mapping
        # schemas contain only field meaning. The Table audit binds that locator.
        schema = [{k:v for k,v in c.items() if k != 'header_tid'} for c in operation['result']['output']['ports'][0]['schema']]
        if request['parameters']['schemas'] != [dict(port=0,schema=schema)]:
            raise ValueError('javascript_reread_retained_schema')
        steps = {r.get('step') for r in own[phases['finish']['start']+1:phases['read']['end']]
            if r.get('internal_provenance') == 'client_node_procedure_v1'}
        observations = [(n,s) for n,s in operation['sequence']['observations'] if n in steps]
        mutations = [(n,a,o) for n,a,o in operation['sequence']['mutations'] if n in steps]
        failures.extend(javascript_business_table(operation,request,columns,rows,observations,mutations,execution_id))
    except (KeyError,IndexError,TypeError,AttributeError,ValueError,UnicodeError,OverflowError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'javascript_reread_malformed')
    return dict(passed=not failures,failures=sorted(set(failures)),execution_id=execution_id,
        scope='late_source_bound_native_full_business_table_and_restoration',native_source_settings_verified=not failures,
        native_full_business_table_verified=not failures,parent_lifecycle_verified=False,journal_authenticated=False,
        model_delivery_verified=False,package_persistence_verified=False,process_cleanup_verified=False,cli_acceptance_verified=False)
