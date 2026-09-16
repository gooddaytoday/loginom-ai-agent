"""Compare public configuration readback with raw observations, not model input.

This proves the projection only. Source identity, requested semantics, execution
and saved-package persistence require their existing independent auditors.
"""
from import_limits import import_operation_step_budget

from node_procedure_evidence import verify_internal_sequence


def verify_configuration_readback(events, request):
    failures = []
    try:
        operation = request['operation_id']
        rows = [e for e in events if e.get('operation_id') == operation]
        sequence = verify_internal_sequence(events, operation, max_steps=import_operation_step_budget(events, operation))
        if sequence['failures']:
            raise ValueError('readback_internal_sequence')
        checkpoints = [e['result'] for e in rows if e.get('phase') == 'node_checkpoint']
        if len(checkpoints) != 1 or checkpoints[0]['status'] != 'SUCCEEDED':
            raise ValueError('readback_unique_success')
        result = checkpoints[0]
        if not sequence['observations'] or any(
                s.get('prepared_node_context',{}).get('verified') is not True
                or any(s['prepared_node_context'].get(k) != result['node'].get(k)
                       for k in ('document_id','workflow_id','node_id'))
                for _,s in sequence['observations']):
            raise ValueError('readback_observed_node_binding')
        def phase(name):
            starts = [i for i,e in enumerate(rows) if e.get('phase') == 'node_phase_prepared' and e.get('receipt',{}).get('phase') == name]
            ends = [(i,e['receipt']) for i,e in enumerate(rows) if e.get('phase') == 'node_phase_completed' and e.get('receipt',{}).get('phase') == name]
            if len(starts) != 1 or len(ends) != 1 or starts[0] >= ends[0][0]:
                raise ValueError('readback_phase_order')
            end, receipt = ends[0]
            if receipt.get('status') != 'verified' or receipt.get('receipt_id') != operation+':'+name:
                raise ValueError('readback_phase_receipt')
            steps = {e.get('step') for e in rows[starts[0]+1:end]}
            return receipt, [(n,s) for n,s in sequence['observations'] if n in steps], [(n,a,o) for n,a,o in sequence['mutations'] if n in steps]
        configured, observations, mutations = phase('configure')
        mapped, mapping_observations, _ = phase('output_mapping')
        finished, _, _ = phase('finish')
        if request['finish'] not in ('done','execute') or finished['value'].get('settings_applied') is not True:
            raise ValueError('readback_finish_not_applied')
        def fields(group, names):
            result = {}
            for name in names:
                f = group['fields'][name]
                if f.get('status') != 'observed' or f.get('truncated') is True:
                    raise ValueError('readback_incomplete_field')
                result[name] = f['value']
            return result
        source_states = [s['wizard']['import_source'] for _,s in observations if s.get('wizard',{}).get('stage') == 'text_import_file']
        source = fields(source_states[-1], ('source_path','connection','encoding','rows_to_skip','first_line_as_title'))
        after = max((n for n,_,_ in mutations), default=0)
        pages = [s['wizard'] for n,s in observations if n > after and s.get('wizard',{}).get('import_columns',{}).get('page',{}).get('status') == 'complete_definition_page']
        starts = [i for i,w in enumerate(pages) if w['import_columns']['page'].get('offset') == 0]
        pages = pages[starts[-1]:]
        columns, schema, total = [], None, None
        for wizard in pages:
            d = wizard['import_columns']; p = d['page']
            if (p['offset'] != len(columns) or p['returned'] != len(d['fields'])
                    or not p.get('schema_id') or schema is not None and schema != p['schema_id']
                    or total is not None and total != p['total_columns']):
                raise ValueError('readback_page_identity')
            schema, total = p['schema_id'], p['total_columns']
            for field in d['fields']:
                if field.get('status') != 'observed' or field.get('index') != len(columns):
                    raise ValueError('readback_column_identity')
                columns.append({k:field[k] for k in ('index','name','label','type','data_kind','used')})
            if p.get('next_offset') != (len(columns) if len(columns) < total else None):
                raise ValueError('readback_page_continuation')
        if not pages or len(columns) != total:
            raise ValueError('readback_incomplete_columns')
        fmt = fields(pages[-1]['settings'], ('delimiter','text_qualifier','null_marker','decimal_separator'))
        native = [s['node_mapping'] for _,s in mapping_observations if 'node_mapping' in s][-1]
        if not all(native.get(k) is True for k in ('verified','source_identity_verified','inventory_complete')):
            raise ValueError('readback_native_mapping')
        output = []
        for i,f in enumerate(native['target_fields']):
            sources = [s for s in native['source_fields'] if s.get('record_id') == f.get('source',{}).get('record_id')]
            if len(sources) != 1 or sources[0] != f['source'] or f['index'] != i:
                raise ValueError('readback_source_identity')
            output.append({**{k:f[k] for k in ('index','name','label','type','data_kind')}, 'source_name': f['source']['name']})
        expected = dict(kind='text_import', scope='observed_before_verified_finish', node=result['node'],
            receipt_ids=[configured['receipt_id'],mapped['receipt_id'],finished['receipt_id']], values_are='observed_ui_values',
            source=source,format=fmt,columns=columns,output_mapping=dict(port=0,autosync=native['autosync'],fields=output),
            package_persistence_verified=False)
        if result.get('configuration') != dict(status='applied',readback=expected):
            raise ValueError('readback_differs_from_raw_observations')
    except (KeyError, IndexError, TypeError, ValueError, AttributeError) as error:
        failures.append(str(error) if isinstance(error, ValueError) else 'readback_malformed_evidence')
    return dict(passed=not failures, failures=failures, scope='public_readback_raw_observations', package_persistence_verified=False)
