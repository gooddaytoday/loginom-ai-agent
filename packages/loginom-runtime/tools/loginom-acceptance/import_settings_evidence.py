"""Diagnostic comparison of rendered import settings, never persistence proof."""
import copy
import re
import settings_evidence

MISSING_PROOFS = ('source_artifact_binding', 'encoding_header_skip_readback',
                  'complete_source_schema', 'output_mapping', 'apply_reopen_readback',
                  'package_persistence')
# Exact display labels observed in the import UI; do not infer a locale or
# normalize unknown labels. Literal delimiter input is also supported.
DISPLAY_VALUES = {
    'delimiter': {';': ';', 'Точка с запятой': ';'},
    # Loginom 7.4.2 live: literal quote after fill/blur, display label after next/back.
    'text_qualifier': {'"': '"', 'Двойная кавычка (")': '"'},
    # Live 2026-09-06: literal input stays '.' after blur; next/back renders
    # the same choice as 'Точка (.)'. This is displayed settings, not apply proof.
    'decimal_separator': {'.': '.', 'Точка (.)': '.'},
}
FIELD_OWNERS = {'delimiter': 'edtDelimiterChar', 'text_qualifier': 'edtTextQualifier',
                'decimal_separator': 'edtDecimalSeparator', 'null_marker': 'edtValueNull'}


class Unverifiable(ValueError):
    pass


def _context(snapshot, stage='text_import_format'):
    if snapshot.get('authenticated') is not True:
        raise Unverifiable('unauthenticated')
    wizard = snapshot['wizard']
    if wizard.get('status') != 'observed' or wizard.get('stage') != stage:
        raise Unverifiable(stage + '_not_observed')
    prefix = snapshot['workflow_ref']['prefix']
    if not isinstance(prefix, str) or not re.fullmatch(r'MF;TF(?:-\d+)?', prefix):
        raise Unverifiable('workflow_context_missing')
    if wizard.get('root_tid') != prefix + ';WizrdMCF' or not wizard.get('root_ref'):
        raise Unverifiable('wizard_context_mismatch')
    owner = wizard['owner_context']
    path = owner.get('path', [])
    node = owner.get('node', {})
    if (owner.get('status') != 'observed' or not isinstance(path, list) or not 3 <= len(path) <= 32
            or not node.get('ref') or not node.get('label') or not node.get('tid')):
        raise Unverifiable('owner_context_missing')
    for index, item in enumerate(path):
        icon_only_root = (index == 0 and item.get('tid') == prefix + ';cnrNaviMode;b.s_Сервер'
                          and item.get('label') == '')
        if (not isinstance(item.get('tid'), str) or not item['tid'].startswith(prefix + ';')
                or not isinstance(item.get('label'), str) or (not item['label'] and not icon_only_root)
                or (index and not item['tid'].startswith(path[index - 1]['tid'] + '>'))):
            raise Unverifiable('owner_path_mismatch')
    if any(node.get(key) != path[-2].get(key) for key in ('ref', 'tid', 'label')):
        raise Unverifiable('owner_node_mismatch')
    context = {key: copy.deepcopy(snapshot.get(key)) for key in
               ('origin', 'loginom_build', 'workflow_ref', 'package_identity', 'active_tab_ref')}
    if any(not value for value in context.values()) or not snapshot.get('dom_epoch', {}).get('document'):
        raise Unverifiable('context_missing')
    context.update(document=snapshot['dom_epoch']['document'], wizard_root_ref=wizard['root_ref'],
                   owner=copy.deepcopy(owner))
    return context


def compare(snapshot, expected, expected_context=None):
    """Compare one native snapshot; optional context anchors it to a prior read.

    Callers must bind snapshots to immutable receipts. A match deliberately
    remains incomplete: rendered columns do not prove full source schema.
    """
    result = {'rendered_import_settings_match': False, 'complete': False,
              'node_persistence_verified': False, 'package_persistence_verified': False,
              'missing_proofs': list(MISSING_PROOFS)}
    try:
        context = _context(snapshot)
        if expected_context is not None and context != expected_context:
            raise Unverifiable('context_changed')
        wizard = snapshot['wizard']
        ui = snapshot['ui']
        if ui.get('dialogs') != [] or ui.get('masks') != []:
            raise Unverifiable('dialog_or_mask_present_or_unobserved')
        if 'import_column_editor' in wizard:
            raise Unverifiable('column_editor_present')
        settings = wizard['settings']
        if settings.get('status') != 'draft_ui_values' or settings.get('applied_verified') is not False:
            raise Unverifiable('draft_settings_unobserved')
        wanted = expected['input']
        keys = {'delimiter': 'delimiter', 'text_qualifier': 'quote',
                'decimal_separator': 'decimal_separator', 'null_marker': 'null_literal'}
        values = {}
        refs = set()
        for key, target in keys.items():
            field = settings['fields'][key]
            value = field.get('value')
            if (field.get('status') != 'observed' or field.get('truncated') is not False
                    or field.get('value_kind') != 'displayed_input_text' or not isinstance(value, str)
                    or len(value) > 256
                    or field.get('value_length_utf16') != len(value.encode('utf-16-le')) // 2
                    or not field.get('input_ref') or not field.get('owner_ref')):
                raise Unverifiable('setting_unobserved:' + key)
            if field.get('source_tid') != wizard['root_tid'] + ';ImportTextFileParamsWizard;' + FIELD_OWNERS[key] + ';ValueControl':
                raise Unverifiable('setting_owner_mismatch:' + key)
            if field['input_ref'] in refs:
                raise Unverifiable('duplicate_setting_input')
            refs.add(field['input_ref'])
            actual = value if key == 'null_marker' else DISPLAY_VALUES[key].get(value)
            if actual is None or actual != wanted[target]:
                raise Unverifiable('setting_mismatch:' + key)
            values[key] = actual
        columns = wizard['import_columns']
        if (columns.get('status') != 'rendered_draft_columns' or columns.get('truncated') is not False
                or columns.get('complete') is not False or columns.get('settings_applied') is not False):
            raise Unverifiable('rendered_columns_unobserved_or_truncated')
        fields, schema = columns['fields'], expected['schema']
        if not isinstance(fields, list) or not isinstance(schema, list) or not 1 <= len(fields) == len(schema) <= 8:
            raise Unverifiable('rendered_column_count_mismatch')
        indexes, names = set(), set()
        for column in fields:
            index, name = column.get('index'), column.get('name')
            if (column.get('status') != 'observed' or type(index) is not int
                    or not 0 <= index < len(schema) or index in indexes
                    or not isinstance(name, str) or name in names):
                raise Unverifiable('column_ambiguous_or_duplicate')
            indexes.add(index); names.add(name)
            if name != schema[index]['name'] or column.get('type') != schema[index]['type'] or column.get('used') is not True:
                raise Unverifiable('column_mismatch:' + str(index))
        if len({c['name'] for c in schema}) != len(schema):
            raise Unverifiable('expected_schema_ambiguous')
        return {**result, 'rendered_import_settings_match': True, 'reason': 'rendered_settings_match',
                'context': context, 'values': values, 'rendered_column_count': len(fields)}
    except (KeyError, TypeError, AttributeError, ValueError, UnicodeError) as error:
        return {**result, 'reason': str(error) if isinstance(error, Unverifiable) else 'malformed_evidence_or_fixture'}


def _diagnostic_result(verdict):
    return {verdict: False, 'complete': False, 'node_persistence_verified': False,
            'package_persistence_verified': False, 'file_bytes_verified': False,
            'source_identity_verified': False,
            'missing_proofs': ['source_artifact_binding', 'complete_source_schema',
                               'source_field_identity', 'apply_reopen_readback', 'package_persistence']}


def _ready_context(snapshot, stage, expected_context):
    context = _context(snapshot, stage)
    if expected_context is not None and context != expected_context:
        raise Unverifiable('context_changed')
    if snapshot['ui'].get('dialogs') != [] or snapshot['ui'].get('masks') != []:
        raise Unverifiable('dialog_or_mask_present_or_unobserved')
    if any(key in snapshot['wizard'] for key in ('import_column_editor', 'column_parameters')):
        raise Unverifiable('column_editor_present')
    return context


def source_compare(snapshot, expected, expected_source_path, expected_context=None):
    """Match UI source settings to an explicit storage file; no byte identity."""
    verdict = 'rendered_import_source_match'
    result = _diagnostic_result(verdict)
    try:
        # Caller supplies an exact Loginom path. Never derive it from account,
        # local OS, basename or fixture; do not normalize traversal/URL inputs.
        if (not isinstance(expected_source_path, str) or not expected_source_path.startswith('/')
                or len(expected_source_path) > 2048
                or any(part in ('', '.', '..') for part in expected_source_path[1:].split('/'))
                or any(c in expected_source_path for c in ('\\', '\0', '\r', '\n', ':', '?', '#'))):
            raise Unverifiable('invalid_expected_source_path')
        context = _ready_context(snapshot, 'text_import_file', expected_context)
        source = snapshot['wizard']['import_source']
        if (source.get('status') != 'draft_ui_values' or source.get('settings_applied') is not False
                or source.get('file_bytes_verified') is not False or source.get('schema_complete') is not False):
            raise Unverifiable('source_settings_unobserved')
        wanted = expected['input']
        if wanted.get('encoding') != 'UTF-8' or type(wanted.get('header')) is not bool:
            raise Unverifiable('unsupported_expected_source_settings')
        # Current pinned fixture has no skipped data lines. Explicit nonzero
        # fixture settings are supported only as integer counts.
        skip = wanted.get('rows_to_skip', 0)
        if type(skip) is not int or not 0 <= skip <= 1000000:
            raise Unverifiable('invalid_expected_skip')
        expected_values = {'source_path': expected_source_path, 'connection': 'Локальное',
                           'encoding': 'UTF-8 (65001)', 'rows_to_skip': str(skip)}
        refs = set(); values = {}
        for name, value in expected_values.items():
            field = source['fields'][name]; actual = field.get('value')
            if (field.get('status') != 'observed' or field.get('truncated') is not False
                    or field.get('value_kind') != 'displayed_input_text' or not isinstance(actual, str)
                    or len(actual) > (2048 if name == 'source_path' else 256)
                    or field.get('value_length_utf16') != len(actual.encode('utf-16-le')) // 2
                    or not field.get('input_ref') or not field.get('owner_ref')):
                raise Unverifiable('source_field_unobserved:' + name)
            if field['input_ref'] in refs:
                raise Unverifiable('duplicate_source_input')
            refs.add(field['input_ref'])
            if actual != value:
                raise Unverifiable('source_field_mismatch:' + name)
            values[name] = actual
        header = source['fields']['first_line_as_title']
        if (header.get('status') != 'observed' or header.get('value_kind') != 'loginom_ext_checkbox'
                or type(header.get('value')) is not bool or not header.get('owner_ref') or not header.get('display_ref')):
            raise Unverifiable('header_unobserved')
        if header['value'] != wanted['header']:
            raise Unverifiable('header_mismatch')
        values['first_line_as_title'] = header['value']
        return {**result, verdict: True, 'reason': 'rendered_source_settings_match', 'context': context, 'values': values}
    except (KeyError, TypeError, AttributeError, ValueError, UnicodeError) as error:
        return {**result, 'reason': str(error) if isinstance(error, Unverifiable) else 'malformed_evidence_or_fixture'}


def mapping_compare(snapshot, expected, expected_context=None):
    """Match rendered import targets and source labels/types, not source identity."""
    verdict = 'rendered_import_mapping_match'
    result = _diagnostic_result(verdict)
    try:
        context = _ready_context(snapshot, 'output_mapping', expected_context)
        mapping = snapshot['wizard']['output_columns']
        if (mapping.get('status') != 'rendered_rows' or mapping.get('complete') is not False
                or mapping.get('settings_applied') is not False or mapping.get('truncated', False) is not False):
            raise Unverifiable('mapping_unobserved_or_truncated')
        fields = mapping['fields']; schema = expected['schema']
        if (not isinstance(fields, list) or not isinstance(schema, list)
                or not 1 <= len(fields) == len(schema) <= 64):
            raise Unverifiable('mapping_count_mismatch')
        wanted = {column['name']: column['type'] for column in schema}
        if len(wanted) != len(schema):
            raise Unverifiable('expected_schema_ambiguous')
        names = set(); rows = set(); source_refs = set()
        for field in fields:
            name = field.get('name'); row = field.get('row_ref')
            if (field.get('status') != 'observed' or field.get('truncated', False) is not False
                    or field.get('redacted', False) is not False or not isinstance(name, str)
                    or name in names or not row or row in rows or not field.get('name_ref') or not field.get('label_ref')):
                raise Unverifiable('mapping_ambiguous_or_duplicate')
            names.add(name); rows.add(row)
            if name not in wanted or field.get('type') != wanted[name]:
                raise Unverifiable('mapping_target_mismatch')
            source = field['source']
            if (source.get('status') != 'rendered_source' or source.get('identity_verified') is not False
                    or source.get('truncated', False) is not False or source.get('redacted', False) is not False
                    or not source.get('cell_ref') or source['cell_ref'] in source_refs):
                raise Unverifiable('mapping_source_unobserved_or_duplicate')
            source_refs.add(source['cell_ref'])
            if source.get('label') != name or source.get('type') != wanted[name]:
                raise Unverifiable('mapping_source_mismatch:' + name)
        return {**result, verdict: True, 'reason': 'rendered_mapping_match', 'context': context,
                'rendered_column_count': len(fields)}
    except (KeyError, TypeError, AttributeError, ValueError, UnicodeError) as error:
        return {**result, 'reason': str(error) if isinstance(error, Unverifiable) else 'malformed_evidence_or_fixture'}


def configured_schema_compare(snapshot, expected, expected_context=None):
    """Validate native bounds for configured columns, never source-file schema.

    The bounds and cells must come from the same immutable native snapshot.
    A detached caller-supplied coverage object is not evidence; diagnose binds
    this comparison through the existing unique call/reply/journal receipts.
    """
    result = {'configured_import_schema_match': False, 'complete': False,
              'source_schema_verified': False, 'package_persistence_verified': False,
              'missing_proofs': ['source_artifact_binding', 'source_schema',
                                 'output_mapping', 'apply_reopen_readback', 'package_persistence']}
    rendered = compare(snapshot, expected, expected_context)
    if not rendered['rendered_import_settings_match']:
        return {**result, 'reason': rendered['reason']}
    try:
        columns = snapshot['wizard']['import_columns']
        coverage = columns.get('definition_coverage')
        keys = {'status', 'count', 'grid_ref', 'container_ref', 'body_ref',
                'first_header_ref', 'last_header_ref', 'source_schema_verified'}
        if not isinstance(coverage, dict) or set(coverage) != keys:
            raise Unverifiable('configured_coverage_missing_or_unknown_shape')
        if coverage['status'] != 'complete_configured_columns' or coverage['source_schema_verified'] is not False:
            raise Unverifiable('configured_coverage_not_complete')
        fields = sorted(columns['fields'], key=lambda field: field['index'])
        if type(coverage['count']) is not int or coverage['count'] != len(fields):
            raise Unverifiable('configured_coverage_count_mismatch')
        structural = [coverage[key] for key in ('grid_ref', 'container_ref', 'body_ref')]
        headers = [field.get('header_ref') for field in fields]
        refs = structural + headers
        if (any(not isinstance(ref, str) or not ref or ref.strip() != ref for ref in refs)
                or len(set(refs)) != len(refs)):
            raise Unverifiable('configured_coverage_refs_missing_or_colliding')
        if coverage['first_header_ref'] != headers[0] or coverage['last_header_ref'] != headers[-1]:
            raise Unverifiable('configured_coverage_endpoints_mismatch')
        return {**result, 'configured_import_schema_match': True, 'reason': 'configured_columns_and_bounds_match',
                'configured_column_count': len(fields), 'context': rendered['context']}
    except (KeyError, TypeError, AttributeError, ValueError, IndexError) as error:
        return {**result, 'reason': str(error) if isinstance(error, Unverifiable) else 'malformed_coverage'}


def configured_mapping_compare(snapshot, expected, expected_context=None):
    """Prove the bounded configured mapping list, never source identities/data."""
    result = {'configured_import_mapping_match': False, 'complete': False,
              'source_identity_verified': False, 'package_persistence_verified': False,
              'missing_proofs': ['source_field_identity', 'apply_reopen_readback',
                                 'package_persistence', 'execution_results']}
    rendered = mapping_compare(snapshot, expected, expected_context)
    if not rendered['rendered_import_mapping_match']:
        return {**result, 'reason': rendered['reason']}
    try:
        mapping = snapshot['wizard']['output_columns']; coverage = mapping.get('definition_coverage')
        keys = {'status', 'count', 'body_ref', 'container_ref', 'first_row_ref', 'last_row_ref',
                'filter_ref', 'table_mode_ref', 'source_identity_verified'}
        if not isinstance(coverage, dict) or set(coverage) != keys:
            raise Unverifiable('mapping_coverage_missing_or_unknown_shape')
        if coverage['status'] != 'complete_configured_rows' or coverage['source_identity_verified'] is not False:
            raise Unverifiable('mapping_coverage_not_complete')
        fields = mapping['fields']
        if type(coverage['count']) is not int or coverage['count'] != len(fields):
            raise Unverifiable('mapping_coverage_count_mismatch')
        auto_sync = mapping.get('auto_sync')
        if (not isinstance(auto_sync, dict) or set(auto_sync) != {'status', 'value', 'ref'}
                or auto_sync['status'] != 'observed' or type(auto_sync['value']) is not bool):
            raise Unverifiable('mapping_auto_sync_unobserved')
        rows = [field['row_ref'] for field in fields]
        refs = rows + [coverage[key] for key in ('body_ref', 'container_ref', 'filter_ref', 'table_mode_ref')] + [auto_sync['ref']]
        if (any(not isinstance(ref, str) or not ref or ref.strip() != ref for ref in refs)
                or len(set(refs)) != len(refs)):
            raise Unverifiable('mapping_coverage_refs_missing_or_colliding')
        if coverage['first_row_ref'] != rows[0] or coverage['last_row_ref'] != rows[-1]:
            raise Unverifiable('mapping_coverage_endpoints_mismatch')
        return {**result, 'configured_import_mapping_match': True, 'reason': 'configured_mapping_and_bounds_match',
                'configured_row_count': len(fields), 'auto_sync': auto_sync['value'], 'context': rendered['context']}
    except (KeyError, TypeError, AttributeError, ValueError, IndexError) as error:
        return {**result, 'reason': str(error) if isinstance(error, Unverifiable) else 'malformed_mapping_coverage'}


def diagnose(evidence, expected, prefix, *, expected_source_path=None):
    observations = []
    for receipt in settings_evidence.bound_receipts(evidence, prefix):
        snapshot = receipt['outcome'].get('output', {})
        if (not isinstance(snapshot, dict) or not isinstance(snapshot.get('wizard'), dict)
                or snapshot['wizard'].get('stage') not in ('text_import_file', 'text_import_format', 'output_mapping')):
            continue
        stage = snapshot['wizard']['stage']
        proof = (source_compare(snapshot, expected, expected_source_path) if stage == 'text_import_file'
                 else mapping_compare(snapshot, expected) if stage == 'output_mapping'
                 else compare(snapshot, expected))
        if stage == 'text_import_format':
            proof = {**proof, 'configured_schema_diagnostics': configured_schema_compare(snapshot, expected)}
        if stage == 'output_mapping':
            proof = {**proof, 'configured_mapping_diagnostics': configured_mapping_compare(snapshot, expected)}
        observations.append({'session_id': receipt['call'].get('session_id'),
                             'tool_call_id': receipt['call'].get('tool_call_id'),
                             'stage': stage,
                             'operation_id': receipt['outcome']['operation_id'],
                             **proof})
        if len(observations) >= 60:
            return {'observations': observations, 'truncated': True, 'complete': False}
    return {'observations': observations, 'truncated': False, 'complete': False}
