"""Admit only a complete identity output mapping, proven against CSV and native state."""
from import_source_binding import source_ordered_settings
from import_output_evidence import verify_text_import_output
from node_procedure_evidence import verify_internal_sequence
from import_limits import import_step_budget


def verify_identity_autosync(events, request):
    sequence = verify_internal_sequence(events, request['operation_id'], max_steps=import_step_budget(request))
    mappings = [s['node_mapping'] for _, s in sequence['observations'] if s.get('node_mapping', {}).get('verified') is True]
    return dict(passed=sequence['passed'] and bool(mappings) and all(type(m.get('autosync')) is bool for m in mappings) and mappings[-1]['autosync'] is False,
                scope='native_identity_autosync')


def verify_identity_import_mapping(events, request, source_bytes):
    try:
        if request['inputs'] != []:
            raise ValueError('import_inputs_not_empty')
        mappings = request['mappings']
        if mappings == []:
            return dict(passed=True, scope='unmapped_import')
        columns = request['parameters']['settings']['columns']
        ordered = source_ordered_settings(request['parameters']['settings'], source_bytes)['columns']
        if columns != ordered or any(c['used'] is not True or c.get('source_name', c['name']) != c['name'] or c['label'] != c['name'] for c in columns):
            raise ValueError('identity_source_columns')
        expected = [dict(direction='output', port=0, autosync=False, fields=[
            dict(source=dict(kind='configured_field', name=c['name']), name=c['name'],
                 label=c['label'], excluded=False) for c in ordered])]
        # Exact JSON comparison also rejects integer substitutes for booleans,
        # extra type/data_kind overrides and unrecognised operations.
        import json
        if json.dumps(mappings, sort_keys=True) != json.dumps(expected, sort_keys=True):
            raise ValueError('non_identity_output_mapping')
        native = verify_text_import_output(events, request, source_bytes)
        autosync = verify_identity_autosync(events, request)
        return dict(passed=native['passed'] and autosync['passed'], scope='csv_bound_native_identity_mapping', native=native, autosync=autosync)
    except (KeyError, TypeError, ValueError, UnicodeError, IndexError) as error:
        return dict(passed=False, failures=[str(error)])
