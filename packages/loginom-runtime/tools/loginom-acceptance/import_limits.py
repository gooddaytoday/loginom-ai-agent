"""Independent request-derived bound shared with the pinned client runtime."""
import json
from pathlib import Path

LIMITS = json.loads((Path(__file__).resolve().parents[2] / 'client/lib/text-import-limits.json').read_text())


def import_step_budget(request):
    columns = LIMITS['max_columns'] if request.get('target', {}).get('kind') == 'existing' else len(request['parameters']['settings']['columns'])
    mapped = next((len(m.get('fields', [])) for m in request.get('mappings', []) if m['direction'] == 'output'), 0)
    if not 1 <= columns <= LIMITS['max_columns'] or mapped > LIMITS['max_columns']:
        raise ValueError('Invalid bounded text import schema')
    return LIMITS['base_steps'] + LIMITS['steps_per_column'] * columns + LIMITS['steps_per_mapping_pair'] * mapped * mapped


def import_operation_step_budget(events, operation_id):
    requests = [e.get('request') for e in events if e.get('operation_id') == operation_id
                and e.get('phase') == 'node_apply_prepared']
    if len(requests) == 1 and requests[0].get('target', {}).get('type') == 'imports.text':
        return import_step_budget(requests[0])
    return LIMITS['base_steps']  # Legacy standalone procedures keep their original bound.
