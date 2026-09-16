"""Independent v2 saved-import inspection, cancellation, download and execution."""
import hashlib
from pathlib import Path
from node_procedure_evidence import verify_internal_sequence
from import_fields_evidence import verify_import_field_observations
from import_execution_evidence import verify_execution_observations
from import_output_evidence import verify_table_output_observations
from date_time_goal_oracle import FIXTURES, frozen


def one(items, message):
    if len(items) != 1:
        raise ValueError(message)
    return items[0]


def readonly_wizard_mutations(sequence, allow_finish=False):
    failures = []
    for step, action, _ in sequence['mutations']:
        state = next((s for n, s in reversed(sequence['observations']) if n < step), {})
        wizard = state.get('wizard', {})
        if wizard.get('status') != 'observed':
            continue
        element = one([e for e in state['ui']['elements'] if e['ref'] == action.get('ref')], 'mutation_control')
        verb, tid, root = action['verb'], element.get('tid'), wizard['root_tid']
        cell, date = element.get('date_time_cell', {}), state.get('node_date_time', {})
        selection = (verb == 'click' and wizard.get('stage') == 'date_time' and date.get('verified') is True
            and cell.get('role') == 'field' and cell.get('wizard_root_ref') == wizard.get('root_ref')
            and any(f['name'] == cell.get('field_key') and f['record_id'] == cell.get('record_id') for f in date.get('fields', [])))
        metadata = (verb == 'click' and wizard.get('stage') == 'output_mapping'
            and tid in [root+';DerivedDataSourceOutputSocketWizard;'+key for key in ('rbLinks;DisplayEl','rbTable;DisplayEl','btnGetSourceColumns')])
        if metadata and tid.endswith(';btnGetSourceColumns'):
            before = next((s['node_mapping'] for n,s in reversed(sequence['observations']) if n<step and s.get('node_mapping',{}).get('verified')), {})
            after = next((s['node_mapping'] for n,s in sequence['observations'] if n>step and s.get('node_mapping',{}).get('verified')), {})
            def persisted(field):
                return {k:v for k,v in field.items() if k not in ('record_id','source','exclusion_source') and not (field.get('excluded') and k=='field_id')}
            if (before.get('source_fields') != [] or not after.get('source_fields')
                    or after.get('inventory_complete') is not True or after.get('source_identity_verified') is not True
                    or before.get('node_context') != after.get('node_context') or before.get('autosync') != after.get('autosync')
                    or [persisted(f) for f in before.get('target_fields',[])] != [persisted(f) for f in after.get('target_fields',[])]):
                failures.append('source_metadata_fetch_changed_saved_definition')
        allowed = (verb == 'wizard_step' and tid in (root+';btnNext', root+';btnPrev')
            or verb == 'click' and tid == root+';btnClose'
            or verb == 'confirm_wizard_close' and tid == 'msgbox;tlb;yes'
            or verb in ('scroll', 'scroll_horizontal')
            or selection
            or metadata
            or allow_finish and verb == 'finish_wizard' and tid == root+';btnDone')
        if not allowed:
            failures.append('saved_wizard_mutation')
    return failures


def verify_saved_import(events, operation_id, original_request, original, directory):
    failures = []
    try:
        rows = [e for e in events if e.get('operation_id') == operation_id]
        start = one([e for e in rows if e.get('phase') == 'diagnostic_import_prepared'], 'one_diagnostic_import_start')
        end = one([e for e in rows if e.get('phase') == 'diagnostic_import_completed'], 'one_diagnostic_import_end')
        request, result = start['request'], end['result']
        if (start['protocol_revision'] != 2 or result['protocol_revision'] != 2
                or result['status'] != 'SUCCEEDED' or result['cleanup_complete'] is not True
                or result['public_node_apply'] is not False or result['package_saved'] is not False
                or request['parameters'] != dict(source=original_request['parameters']['source'], settings={})
                or request['target']['ref'] != result['node'] or result['node']['node_id'] != original['node']['node_id']
                or result['node']['document_id'] == original['node']['document_id']):
            failures.append('diagnostic_import_identity')
        sequence = verify_internal_sequence(events, operation_id, max_steps=4096)
        failures.extend(sequence['failures'])
        failures.extend(readonly_wizard_mutations(sequence))
        for _, state in sequence['observations']:
            node = state.get('prepared_node_context', {})
            if node.get('verified') is not True or any(node.get(k) != v for k, v in result['node'].items()):
                failures.append('diagnostic_import_observation_owner')
        configuration = one([e for e in rows if e.get('phase') == 'diagnostic_import_configuration_read'], 'one_saved_configuration')
        cancel = one([e for e in rows if e.get('phase') == 'diagnostic_import_cancelled'], 'one_saved_draft_cancel')
        if not (rows.index(start) < rows.index(configuration) < rows.index(cancel) < rows.index(end)
                and cancel['cancellation']['draft_discarded'] is True and cancel['cancellation']['settings_applied'] is False
                and cancel['cancellation']['cleanup_complete'] is True):
            failures.append('saved_draft_not_cancelled')
        keys = ('source', 'format', 'columns', 'output_mapping')
        wanted = {k: original['configuration']['readback'][k] for k in keys}
        if any(configuration['configuration'][k] != wanted[k] or result['configuration']['readback'][k] != wanted[k] for k in keys):
            failures.append('saved_configuration_changed')
        settings = original_request['parameters']['settings']
        inspected = [(n, s) for n, s in sequence['observations'] if s.get('wizard', {}).get('stage') in ('text_import_file', 'text_import_format')]
        failures.extend(verify_import_field_observations(inspected, [], settings)['failures'])
        mappings = [s['node_mapping'] for _, s in sequence['observations'] if s.get('node_mapping', {}).get('verified') is True]
        native = configuration['native_mapping']
        if native not in mappings or native.get('inventory_complete') is not True or native.get('source_identity_verified') is not True:
            failures.append('saved_mapping_raw_proof')
        expected = wanted['output_mapping']
        fields = native['target_fields']
        actual = [{k: f[k] for k in ('index','name','label','type','data_kind')} | {'source_name': f.get('source', {}).get('name')} for f in fields]
        if (native['autosync'] != expected['autosync'] or actual != expected['fields']
                or any(f.get('excluded') or f.get('source') not in native['source_fields'] for f in fields)):
            failures.append('saved_mapping_definition')
        downloads = [e for e in events if e.get('operation_id') == operation_id+'-source']
        prepared = one([e for e in downloads if e.get('phase') == 'diagnostic_source_download_prepared'], 'one_saved_source_download')
        downloaded = one([e for e in downloads if e.get('phase') == 'diagnostic_source_download_completed'], 'one_saved_source_bytes')
        receipt = downloaded['receipt']; source_path = wanted['source']['source_path']
        fixture = (FIXTURES/'sales.csv').read_bytes(); sha = hashlib.sha256(fixture).hexdigest()
        file = (directory/receipt['download_file']).resolve()
        if (not file.is_relative_to(directory.resolve()) or file.read_bytes() != fixture
                or receipt['source_path'] != source_path or receipt['bytes'] != len(fixture) or receipt['sha256'] != sha
                or prepared['source_path'] != source_path or prepared['expected_bytes'] != len(fixture) or prepared['expected_sha256'] != sha
                or prepared['snapshot']['file_storage']['directory'] != str(Path(source_path).parent)
                or not any(e.get('label') == Path(source_path).name and e.get('ref') == receipt['outcome']['output']['file_ref'] for e in prepared['snapshot']['ui']['elements'])
                or receipt['outcome']['status'] != 'SUCCEEDED' or receipt['outcome']['cleanup_complete'] is not True
                or receipt['outcome']['output']['destination'] != source_path
                or receipt['outcome']['output']['suggested_name'] != Path(source_path).name
                or receipt['outcome']['output']['download_completed'] is not True):
            failures.append('saved_source_bytes_or_identity')
        if not events.index(cancel) < events.index(prepared) < events.index(downloaded) < events.index(end):
            failures.append('saved_download_order')
        launches = [e for e in rows if e.get('phase') == 'node_step_prepared' and e.get('action', {}).get('verb') == 'execute_graph_node']
        if len(launches) != 1 or events.index(launches[0]) <= events.index(downloaded):
            failures.append('source_verified_before_launch')
        if any(e.get('action_key', '').startswith(('package.save', 'artifact.upload')) for e in events):
            failures.append('diagnostic_save_or_upload_forbidden')
        execution = verify_execution_observations(sequence['observations'], sequence['mutations'], result['node'], launch_mode='graph')
        failures.extend(execution['failures'])
        if result['execution']['execution_id'] != execution['execution_id'] or execution['execution_id'] == original['execution']['execution_id']:
            failures.append('fresh_saved_source_execution')
        comparison = dict(request, parameters=dict(settings=settings), mappings=[])
        failures.extend(verify_table_output_observations(sequence['observations'], sequence['mutations'], comparison, fixture, result, execution['execution_id']))
        port = one(result['output']['ports'], 'one_saved_import_port'); expected_table = frozen()['source']
        if (port['row_count'] != 10 or port['sample_rows'] != 10 or port['sample_complete'] is not True
                or len(port['sample']) != 10 or port.get('truncated', False)
                or [{k:c[k] for k in ('name','label','type')} for c in port['schema']] != expected_table['schema']):
            failures.append('complete_saved_import_output')
    except (KeyError, TypeError, ValueError, IndexError, OSError) as error:
        failures.append(str(error))
    return dict(passed=not failures, failures=sorted(set(failures)), protocol_revision=2,
                scope='saved_import_read_cancel_download_execute', public_node_apply_supported=False)
