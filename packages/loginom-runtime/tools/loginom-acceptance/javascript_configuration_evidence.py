"""Independent Execute configuration audit; input journal authenticity is external.

Does not run JavaScript, authenticate CLI/model input, or certify saved packages.
The expected source and columns must be independently supplied by the operator.
"""
import hashlib
import json
from node_procedure_evidence import verify_internal_sequence


EXECUTE_PHASES = ('source', 'workflow', 'target', 'input_mapping', 'open',
    'configure', 'node_finish', 'materialization_start', 'materialization_execute',
    'output_mapping', 'finish', 'execute', 'read')
OWNER_KEYS = ('document_id', 'workflow_id', 'node_id')
READ_PHASES = ('source','workflow','target','finish','execute','read')


def javascript_operation(events, request, *, expected_target=None, expected_origin=None, reading=False):
    operation = request['operation_id']
    rows = [r for r in events if r.get('operation_id') == operation]
    admissions = [r for r in rows if r.get('phase') == 'node_apply_prepared']
    checkpoints = [r['result'] for r in rows if r.get('phase') == 'node_checkpoint']
    if (request.get('target', {}).get('type') != 'programming.javascript'
            or type(reading) is not bool or request.get('mode') != ('read_existing_output' if reading else 'script') or request.get('finish') != 'execute'
            or not reading and request.get('parameters', {}).get('schema_mode') not in ('code', 'declared')
            or len(admissions) != 1 or admissions[0].get('request') != request
            or len(checkpoints) != 1 or checkpoints[0].get('status') != 'SUCCEEDED'
            or checkpoints[0].get('operation_id') != operation
            or checkpoints[0].get('cleanup_complete') is not True):
        raise ValueError('javascript_execute_admission')
    identity = tuple(admissions[0].get(k) for k in ('session_id','runtime_revision','target'))
    product_target = expected_target is not None or expected_origin is not None
    if product_target and (not isinstance(expected_target,dict)
            or set(expected_target) != {'profile_id','loginom_build','platform','browser'}
            or not isinstance(expected_target.get('profile_id'),str) or not expected_target['profile_id']
            or expected_target.get('loginom_build') != '7.4.2' or expected_target.get('platform') != 'linux'
            or expected_target.get('browser') != 'chromium' or expected_origin != 'http://logi-test-plan.bg.local'):
        raise ValueError('javascript_external_product_target_pin')
    if (not identity[0] or not identity[1] or not isinstance(identity[2],dict)
            or identity[2].get('loginom_build') != '7.4.2'
            or (identity[2] != expected_target if product_target else not identity[2].get('origin'))
            or any(tuple(r.get(k) for k in ('session_id','runtime_revision','target')) != identity for r in rows)):
        raise ValueError('javascript_journal_identity')
    sequence = verify_internal_sequence(events, operation, max_steps=4096)
    if not sequence['passed']:
        raise ValueError('javascript_internal_sequence:'+','.join(sequence['failures']))
    # Runtime observations use either URL.origin or the equivalent root URL.href.
    # Keep the recorded value and digests intact; accept only those two forms.
    if product_target and any(s.get('origin') not in (expected_origin,expected_origin+'/') or s.get('loginom_build') != expected_target['loginom_build']
            for _,s in sequence['observations']):
        raise ValueError('javascript_native_product_target_pin')
    result = checkpoints[0]
    node = result['node']
    if (any(not node.get(k) for k in OWNER_KEYS) or node['document_id'] != request['document_id']
            or node['workflow_id'] != request['workflow_ref']['workflow_id']
            or request['target']['kind'] == 'existing' and any(request['target']['ref'].get(k) != node[k] for k in OWNER_KEYS)):
        raise ValueError('javascript_target_owner')
    if any(s.get('prepared_node_context', {}).get('verified') is not True
            or any(s['prepared_node_context'].get(k) != node[k] for k in OWNER_KEYS)
            for _, s in sequence['observations']):
        raise ValueError('javascript_observed_owner')
    starts = [r['receipt']['phase'] for r in rows if r.get('phase') == 'node_phase_prepared']
    ends = [r['receipt']['phase'] for r in rows if r.get('phase') == 'node_phase_completed']
    inventory = READ_PHASES if reading else EXECUTE_PHASES
    if starts != list(inventory) or ends != list(inventory):
        raise ValueError('javascript_phase_inventory')
    phases = {}
    previous = -1
    for name in inventory:
        start = next(i for i,r in enumerate(rows) if r.get('phase') == 'node_phase_prepared' and r['receipt']['phase'] == name)
        end = next(i for i,r in enumerate(rows) if r.get('phase') == 'node_phase_completed' and r['receipt']['phase'] == name)
        receipt = rows[end]['receipt']
        if (not previous < start < end or receipt.get('status') != 'verified'
                or receipt.get('receipt_id') != operation+':'+name
                or receipt.get('value', {}).get('verified') is not True
                or receipt['value'].get('cleanup_complete') is not True
                or type(rows[start]['receipt'].get('deadline')) is not int
                or not 0 < rows[start]['receipt']['deadline'] <= admissions[0].get('deadline_at', 0)
                ):
            raise ValueError('javascript_phase_receipt:'+name)
        steps = {r.get('step') for r in rows[start+1:end] if r.get('internal_provenance') == 'client_node_procedure_v1'}
        phases[name] = dict(value=receipt['value'], observations=[(n,s) for n,s in sequence['observations'] if n in steps],
            mutations=[(n,a,o) for n,a,o in sequence['mutations'] if n in steps], start=start, end=end)
        previous = end
    if result.get('phases') != [{k:r['receipt'][k] for k in ('phase','receipt_id','status','effect_possible')}
            for r in rows if r.get('phase') == 'node_phase_completed']:
        raise ValueError('javascript_checkpoint_phases')
    return dict(rows=rows, result=result, node=node, sequence=sequence, phases=phases, identity=identity)


def verify_javascript_configuration(events, request, expected_source, input_columns, output_columns, *, expected_target=None, expected_origin=None):
    failures = []
    source_sha = None
    try:
        source_sha = hashlib.sha256(expected_source).hexdigest()
        text = expected_source.decode('utf-8')
        if '\r' in text or '\x00' in text or len(expected_source) > 32768:
            raise ValueError('javascript_source_contract')
        operation = javascript_operation(events, request,expected_target=expected_target,expected_origin=expected_origin)
        node = operation['node']
        mode = request['parameters']['schema_mode']
        phases = operation['phases']
        if 'source_text' in request['parameters'] and request['parameters']['source_text'].encode('utf-8') != expected_source:
            raise ValueError('javascript_admitted_source')
        for name, columns, wizard in [('input_mapping', input_columns, 'TuneDataSourceMappingWizard'),
                ('output_mapping', output_columns, 'DataSetOutputSocketWizard')]:
            mapping = phases[name]['value']['native_mapping']
            snapshots = [s['node_mapping'] for _,s in phases[name]['observations'] if s.get('node_mapping', {}).get('verified') is True]
            if (not snapshots or snapshots[-1] != mapping
                    or any(mapping.get(k) is not True for k in ('verified','inventory_complete','source_identity_verified'))
                    or mapping.get('mapping_wizard') != wizard or type(mapping.get('autosync')) is not bool
                    or mapping.get('node_context', {}).get('verified') is not True
                    or any(mapping['node_context'].get(k) != node[k] for k in OWNER_KEYS)):
                raise ValueError('javascript_mapping_observation:'+name)
            sources, targets = mapping['source_fields'], mapping['target_fields']
            if (len(sources) != len(targets) or len(targets) != len(columns)
                    or len({s['record_id'] for s in sources}) != len(sources)
                    or len({t['record_id'] for t in targets}) != len(targets)):
                raise ValueError('javascript_mapping_inventory:'+name)
            for i,(field,column) in enumerate(zip(targets,columns)):
                linked = [s for s in sources if s.get('record_id') == field.get('source', {}).get('record_id')]
                if (field.get('index') != i or any(field.get(k) != column.get(k, column['name'] if k == 'label' else None)
                        for k in ('name','label','type')) or len(linked) != 1 or field.get('source') != linked[0]
                        or type(field.get('required')) is not bool or field.get('excluded') is True):
                    raise ValueError('javascript_mapping_field:'+name+':'+str(i))
        settings = [r for r in operation['rows'] if r.get('phase') == 'javascript_managed_source_settings_observed']
        if not settings:
            raise ValueError('javascript_settings_missing')
        effective_settings = []
        for row in settings:
            value = row['settings']
            if (any(row.get('owner', {}).get(k) != node[k] for k in OWNER_KEYS)
                    or type(value.get('generation')) is not bool
                    or row.get('settings_sha256') != hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')).hexdigest()
                    or len(value.get('grids', [])) != 2):
                raise ValueError('javascript_settings_observation')
            if operation['rows'].index(row) <= phases['configure']['end']:
                continue
            effective_settings.append(row)
            if value['generation'] is not (mode == 'code'):
                raise ValueError('javascript_effective_schema_mode')
            source, target = value['grids']
            prefix = request['workflow_ref']['prefix']+';WizrdMCF;JavaScriptColumnsWizard;'
            if (source.get('tid') != prefix+'grdSourceColumns;tbl' or target.get('tid') != prefix+'grdTargetColumns;tbl'
                    or source.get('fields') != [] or mode == 'code' and target.get('fields') != []):
                raise ValueError('javascript_settings_grids')
            if mode == 'declared':
                native_types = {'integer':4, 'string':5}
                fields = target['fields']
                if len(fields) != len(output_columns):
                    raise ValueError('javascript_declared_inventory')
                for i,(field,column) in enumerate(zip(fields,output_columns)):
                    if (field.get('Index') != i or field.get('Name') != column['name']
                            or field.get('DisplayName') != column.get('label',column['name'])
                            or field.get('DataType') != native_types.get(column['type'])
                            or field.get('Broken') is not False):
                        raise ValueError('javascript_declared_field:'+str(i))
        if not effective_settings:
            raise ValueError('javascript_effective_settings_missing')
        baseline = settings[0]['settings'] if request['target']['kind'] == 'existing' else effective_settings[0]['settings']
        if any(r['settings'] != baseline for r in effective_settings):
            raise ValueError('javascript_settings_not_preserved')
        # Only the post-commit deliveries establish the effective source. Older
        # source reads before an edit legitimately have a different digest.
        all_rows = list(events)
        commit = next(r for r in operation['rows'] if r.get('phase') == 'node_phase_completed' and r['receipt']['phase'] == 'node_finish')
        position = all_rows.index(commit)
        deliveries = [(i,r) for i,r in enumerate(all_rows) if i > position and r.get('phase') == 'source_delivery_verified'
            and r.get('owner', {}).get('operation_id') == request['operation_id']]
        if not deliveries:
            raise ValueError('javascript_source_delivery_missing')
        previous = position
        offset = 0
        for index,row in deliveries:
            receipt = row['receipt']
            if (tuple(row.get(k) for k in ('session_id','runtime_revision','target')) != operation['identity']
                    or any(row.get('owner', {}).get(k) != node[k] for k in OWNER_KEYS)
                    or receipt.get('source_sha256') != source_sha or receipt.get('source_utf8_bytes') != len(expected_source)
                    or receipt.get('source_lf_lines') != (text.count('\n')+1 if text else 0)
                    or receipt.get('offset_utf8_bytes') != offset or type(receipt.get('chunk_utf8_bytes')) is not int
                    or not 0 <= receipt['chunk_utf8_bytes'] <= 4096):
                raise ValueError('javascript_source_delivery_identity')
            chunk = expected_source[offset:offset+receipt['chunk_utf8_bytes']]
            if len(chunk) != receipt['chunk_utf8_bytes'] or hashlib.sha256(chunk).hexdigest() != receipt.get('chunk_sha256'):
                raise ValueError('javascript_source_chunk')
            if offset == 0:
                interval = all_rows[previous+1:index]
                opens = [r for r in interval if r.get('phase') == 'source_open_settled' and r.get('owner') == row.get('owner')]
                closes = [r for r in interval if r.get('phase') == 'source_discard_settled' and r.get('owner') == row.get('owner')]
                if (len(opens) != 1 or len(closes) != 1 or interval.index(opens[0]) >= interval.index(closes[0])
                        or any(r.get('admission_id') != row.get('admission_id') or r.get('read_id') != row.get('read_id') for r in opens+closes)):
                    raise ValueError('javascript_source_read_cleanup')
            offset += receipt['chunk_utf8_bytes']
            if receipt.get('cursor_sha256') is None:
                if offset != len(expected_source):
                    raise ValueError('javascript_source_incomplete')
                offset = 0
                previous = index
            elif offset >= len(expected_source) or not receipt['chunk_utf8_bytes']:
                raise ValueError('javascript_source_cursor')
        if deliveries[-1][1]['receipt'].get('cursor_sha256') is not None:
            raise ValueError('javascript_source_incomplete')
        finish = phases['node_finish']['value']
        if (finish.get('wizard_commit_verified') is not True or finish.get('settings_preserved') is not True
                or finish.get('source_sha256') != source_sha or finish.get('source_utf8_bytes') != len(expected_source)
                or finish.get('source_lf_lines') != (text.count('\n')+1 if text else 0)
                or finish.get('settings_sha256') != effective_settings[-1]['settings_sha256']):
            raise ValueError('javascript_committed_source_settings')
    except (KeyError,IndexError,TypeError,AttributeError,ValueError,UnicodeError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'javascript_configuration_malformed')
    return dict(passed=not failures, failures=sorted(set(failures)), source_sha256=source_sha,
        scope='native_javascript_execute_configuration', journal_authenticated=False,
        model_authorship_verified=False, package_persistence_verified=False)


if __name__ == '__main__':
    import argparse
    from pathlib import Path
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--journal',type=Path,required=True)
    parser.add_argument('--request',type=Path,required=True)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--input-columns',type=Path,required=True)
    parser.add_argument('--output-columns',type=Path,required=True)
    args = parser.parse_args()
    proof = verify_javascript_configuration([json.loads(line) for line in args.journal.read_text().splitlines()],
        json.loads(args.request.read_text()),args.source.read_bytes(),json.loads(args.input_columns.read_text()),
        json.loads(args.output_columns.read_text()))
    print(json.dumps(proof,ensure_ascii=False))
    raise SystemExit(0 if proof['passed'] else 1)
