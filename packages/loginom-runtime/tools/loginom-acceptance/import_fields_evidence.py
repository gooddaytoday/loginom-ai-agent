"""Independent audit of source/format/definition configuration, before Done.

Reads native observations and mutation receipts, not the handler's success flag.
This does not prove delivery, execution, port mapping or persistence.
"""
from import_limits import import_operation_step_budget

from node_procedure_evidence import verify_internal_sequence


def verify_text_import_fields(events, operation_id, expected):
    sequence = verify_internal_sequence(events, operation_id, max_steps=import_operation_step_budget(events, operation_id))
    return verify_import_field_observations(sequence['observations'], sequence['mutations'], expected, sequence['failures'])


def verify_import_field_observations(observations, mutations, expected, sequence_failures=()):
    """Audit an already sequence-verified configuration phase without renumbering it."""
    failures = list(sequence_failures)
    owners = []
    source = None
    for step, state in observations:
        wizard = state.get('wizard', {})
        if wizard.get('stage') not in ('text_import_file', 'text_import_format'):
            failures.append('unexpected_wizard_stage')
        owner = wizard.get('owner_context', {})
        owners.append((owner.get('node', {}).get('tid'), [(x.get('tid'), x.get('label')) for x in owner.get('path', [])]))
        if owner.get('status') != 'observed' or not owners[-1][0]:
            failures.append('wizard_owner_missing')
        if wizard.get('stage') == 'text_import_file':
            source = wizard.get('import_source', {}).get('fields', {})
    if not owners or any(owner != owners[0] for owner in owners):
        failures.append('wizard_owner_changed')
    for name, wanted in expected['source'].items():
        field = (source or {}).get(name, {})
        if name == 'encoding':
            aliases = {'UTF-8':'UTF-8 (65001)', '65001':'UTF-8 (65001)',
                       'Windows-1251':'Кириллическая (1251)', 'CP1251':'Кириллическая (1251)', '1251':'Кириллическая (1251)',
                       'Windows-1252':'Западноевропейская (1252)', 'CP1252':'Западноевропейская (1252)', '1252':'Западноевропейская (1252)',
                       'UTF-16 LE':'UTF-16 LE (1200)', 'UTF-16LE':'UTF-16 LE (1200)', '1200':'UTF-16 LE (1200)',
                       'UTF-16 BE':'UTF-16 BE (1201)', 'UTF-16BE':'UTF-16 BE (1201)', '1201':'UTF-16 BE (1201)'}
            wanted = aliases.get(wanted, wanted)
        if (field.get('status') != 'observed' or field.get('truncated') is True
                or field.get('value') != (str(wanted) if name == 'rows_to_skip' else wanted)):
            failures.append('source_' + name)
    for step, action, outcome in mutations:
        if action.get('verb') not in ('fill', 'press', 'set_checked', 'wizard_step', 'set_wizard_field', 'double_click', 'click', 'select_wizard_option', 'scroll_horizontal'):
            failures.append('unexpected_configuration_action')
        if action.get('verb') == 'wizard_step' and action.get('expected_stage') != 'text_import_format':
            before = next((s for n, s in reversed(observations) if n < step), {})
            after = next((s for n, s in observations if n > step), {})
            wizard = before.get('wizard', {})
            controls = [e for e in before.get('ui', {}).get('elements', []) if e.get('ref') == action.get('ref')]
            if (action.get('expected_stage') != 'text_import_file' or wizard.get('stage') != 'text_import_format'
                    or after.get('wizard', {}).get('stage') != 'text_import_file'
                    or len(controls) != 1 or not wizard.get('root_tid')
                    or controls[0].get('tid') != wizard['root_tid'] + ';btnPrev'
                    or controls[0].get('wizard_step', {}).get('direction') != 'previous'
                    or controls[0].get('wizard_step', {}).get('root_ref') != wizard.get('root_ref')
                    or 'wizard_step' not in controls[0].get('allowed_actions', [])):
                failures.append('unexpected_configuration_transition')
        if action.get('verb') == 'scroll_horizontal':
            proof = [e for e in outcome.get('trace', []) if e.get('event') == 'ui_scroll_applied' and e.get('axis') == 'horizontal']
            if len(proof) != 1 or not 0 < abs(proof[0].get('to', 0) - proof[0].get('from', 0)) <= 1000:
                failures.append('horizontal_reveal_unverified')
    for index, wanted in enumerate(expected['columns']):
        if 'source_name' not in wanted:
            continue
        originals = [field for _, state in observations
                     for field in state.get('wizard', {}).get('import_columns', {}).get('fields', [])
                     if field.get('status') == 'observed' and field.get('index') == index
                     and field.get('name') == wanted['source_name']]
        if not originals:
            failures.append('rename_source_identity_missing')
    last_mutation = max((s for s, _, _ in mutations), default=0)
    # Choose the final sweep starting at zero AFTER all settings mutations.
    pages = [(s, state['wizard']) for s, state in observations if s > last_mutation
             and state.get('wizard', {}).get('import_columns', {}).get('page', {}).get('status') == 'complete_definition_page']
    starts = [i for i, (_, w) in enumerate(pages) if w['import_columns']['page'].get('offset') == 0]
    pages = pages[starts[-1]:] if starts else []
    offset, schema_id = 0, None
    aliases = {'delimiter': {';': 'Точка с запятой', ',': 'Запятая', '\t': 'Символ табуляции', ' ': 'Пробел'},
               'decimal_separator': {'.': 'Точка (.)', ',': 'Запятая (,)'},
               'text_qualifier': {'"': 'Двойная кавычка (")', "'": "Одинарная кавычка (')", '`': 'Обратная кавычка (`)', '': 'Нет'}}
    for _, wizard in pages:
        definitions = wizard['import_columns']; page = definitions['page']; fields = definitions.get('fields', [])
        count = len(expected['columns'])
        if (page.get('total_columns') != count or page.get('offset') != offset or page.get('limit') != 8
                or page.get('returned') != len(fields) or len(fields) != min(8, count-offset)
                or page.get('next_offset') != (offset+len(fields) if offset+len(fields) < count else None)):
            failures.append('definition_page_coverage')
        if not page.get('schema_id') or (schema_id and page['schema_id'] != schema_id):
            failures.append('definition_identity_changed')
        schema_id = page.get('schema_id')
        for i, field in enumerate(fields):
            if field.get('status') != 'observed' or field.get('index') != offset+i:
                failures.append('definition_index')
            if offset+i >= count or any(field.get(k) != expected['columns'][offset+i][k] for k in ['name', 'label', 'type', 'data_kind', 'used']):
                failures.append('definition_values')
        for name, wanted in expected['format'].items():
            field = wizard.get('settings', {}).get('fields', {}).get(name, {})
            allowed = [wanted] + ([aliases[name][wanted]] if wanted in aliases.get(name, {}) else [])
            if field.get('status') != 'observed' or field.get('truncated') is True or field.get('value') not in allowed:
                failures.append('format_' + name)
        offset += len(fields)
    if not pages or offset != len(expected['columns']):
        failures.append('complete_definition_sweep_missing')
    return {'passed': not failures, 'failures': sorted(set(failures)), 'columns_verified': offset,
            'journal_authentication_verified': False, 'hermes_acceptance_verified': False,
            'upload_verified': False, 'execution_verified': False, 'package_persistence_verified': False,
            'settings_saved_verified': False}
