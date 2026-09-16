"""Independent marking oracle; group numbers may change, memberships may not.

This verifies a complete typed table supplied by an independently bound reader.
It does not establish journal authenticity, execution identity or persistence.
"""
SERVICES = {'Duplicate', 'DuplicateGroup', 'Contradiction', 'ContradictionGroup'}
DIAGNOSTIC_DUPLICATES = [{1, 2}, {4, 5, 6}, {9, 10}]
DIAGNOSTIC_CONTRADICTIONS = [{1, 2, 3}, {11, 12}]
KEY_ONLY_DUPLICATES = [{1, 2, 3}, {4, 5, 6}, {9, 10}, {11, 12}]


def verify_marking(source_rows, output_rows, duplicate_groups, contradiction_groups, identity='Id'):
    """Rows are dictionaries with decoded exact scalar values and explicit None."""
    failures = []
    def need(value, reason):
        if not value:
            raise ValueError(reason)
    try:
        need(isinstance(source_rows, list) and isinstance(output_rows, list), 'complete_rows_required')
        need(len(source_rows) == len(output_rows), 'original_multiplicity')
        source = {row[identity]: row for row in source_rows}
        output = {row[identity]: row for row in output_rows}
        need(len(source) == len(source_rows) and len(output) == len(output_rows), 'unique_row_identity')
        need(source.keys() == output.keys(), 'original_identities')
        for key, row in source.items():
            need(not SERVICES.intersection(row), 'source_service_collision')
            actual = output[key]
            need(set(actual) == set(row) | SERVICES, 'complete_columns')
            need(all(type(actual[name]) is type(value) and actual[name] == value for name, value in row.items()), 'original_values')
        for flag, group, expected in [('Duplicate', 'DuplicateGroup', duplicate_groups),
                                      ('Contradiction', 'ContradictionGroup', contradiction_groups)]:
            expected = {frozenset(members) for members in expected}
            need(all(len(members) > 1 and members <= source.keys() for members in expected), 'oracle_membership')
            actual_groups = {}
            for key, row in output.items():
                need(type(row[flag]) is bool, 'typed_flag:' + flag)
                if row[flag]:
                    need(type(row[group]) is int and row[group] >= 1, 'positive_group:' + group)
                    actual_groups.setdefault(row[group], set()).add(key)
                else:
                    need(row[group] is None, 'unmarked_group_is_null:' + group)
            need({frozenset(members) for members in actual_groups.values()} == expected, 'group_membership:' + group)
        return {'passed': True, 'row_count': len(output_rows),
                'duplicate_rows': sum(row['Duplicate'] for row in output_rows),
                'contradiction_rows': sum(row['Contradiction'] for row in output_rows)}
    except (KeyError, TypeError, ValueError) as error:
        failures.append(str(error))
        return {'passed': False, 'failures': failures}
