"""Independent mathematical oracle for the explicit Row Filter golden fixture.

Reads fixture bytes, never handler receipts as expected values. Null predicates
and OR-of-AND semantics follow the pinned Loginom Help. UI execution evidence
must be checked separately; this module cannot establish freshness or ownership.
"""
import csv
from collections import Counter
from datetime import datetime
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).parent / "fixtures" / "row-filter"
TYPES = {"Id": "integer", "Amount": "real", "Flag": "boolean", "When": "datetime", "Text": "string"}


def load_rows(path=ROOT / "golden.csv"):
    def value(name, raw):
        if raw == "NULL":
            return None
        kind = TYPES[name]
        if kind == "integer":
            return int(raw)
        if kind == "real":
            return Decimal(raw)
        if kind == "boolean":
            assert raw in ("true", "false")
            return raw == "true"
        if kind == "datetime":
            return datetime.strptime(raw, "%d.%m.%Y %H:%M:%S")
        return raw
    with path.open(encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream, delimiter=";")
        assert reader.fieldnames == list(TYPES)
        return [{name: value(name, raw) for name, raw in row.items()} for row in reader]


def matches(row, position, condition):
    field, operator, kind = condition["field"], condition["operator"], condition["type"]
    actual = position if field["kind"] == "row_number" else row[field["name"]]
    if operator == "is_null":
        return actual is None
    if operator == "not_null":
        return actual is not None
    if actual is None:
        return False
    if operator in ("is_true", "is_false"):
        return actual is (operator == "is_true")

    def normalize(value):
        if kind == "real":
            return Decimal(str(value))
        if kind == "datetime":
            return value if isinstance(value, datetime) else datetime.fromisoformat(value)
        if kind == "string" and not condition["case_sensitive"]:
            return value.casefold()
        return value

    # Fixture-only Latin ordering, with lowercase first for case variants.
    # Independent native filter probes establish alpha < Alpha and preTAIL >
    # preTail. E2E's upper-first list display ordering is a different operation.
    # Equality remains literal (or case-folded) independently of order.
    def order(value):
        if kind == 'string':
            if not value.isascii():raise ValueError('golden_string_order_outside_ascii_fixture')
            return (value.casefold(), tuple(int(c.isupper()) for c in value))
        return value

    actual = normalize(actual)
    if operator in ("between", "not_between"):
        result = order(normalize(condition["lower"])) <= order(actual) <= order(normalize(condition["upper"]))
        return result if operator == "between" else not result
    if operator in ("in", "not_in"):
        result = actual in map(normalize, condition["values"])
        return result if operator == "in" else not result
    value = normalize(condition["value"])
    comparisons = {"=": lambda: actual == value, "<>": lambda: actual != value,
                   "<": lambda: order(actual) < order(value), "<=": lambda: order(actual) <= order(value),
                   ">": lambda: order(actual) > order(value), ">=": lambda: order(actual) >= order(value)}
    if operator in comparisons:
        return comparisons[operator]()
    negate = operator.startswith("not_")
    base = operator[4:] if negate else operator
    result = {"contains": lambda: value in actual,
              "starts_with": lambda: actual.startswith(value),
              "ends_with": lambda: actual.endswith(value)}[base]()
    return not result if negate else result


def partition(rows, groups):
    assert groups and all(groups)
    ports = [[], []]
    for position, row in enumerate(rows, 1):
        keep = any(all(matches(row, position, c) for c in group) for group in groups)
        ports[0 if keep else 1].append(row)
    return ports


def canonical(row):
    return tuple(row[name] for name in TYPES)


def assert_partition(rows, ports):
    assert len(ports) == 2
    assert sum(map(len, ports)) == len(rows)
    assert Counter(map(canonical, rows)) == Counter(canonical(row) for port in ports for row in port)


def verify_golden_ports(ports, groups):
    """Value-only golden check; does not claim native execution or persistence."""
    rows = load_rows()
    expected = partition(rows, groups)
    if len(ports) != 2 or {p.get('port') for p in ports} != {0, 1}:
        raise ValueError('golden_two_ports')
    actual = [[], []]
    for port in ports:
        if (port.get('sample_complete') is not True or port.get('filter_enabled') is not False
                or port.get('row_count') != len(port.get('sample', []))
                or port.get('precision', {}).get('numbers_verified') is not True
                or [(c['name'], c['type']) for c in port['schema']] != list(TYPES.items())):
            raise ValueError('golden_complete_exact_schema')
        for sample in port['sample']:
            if len(sample) != len(TYPES):
                raise ValueError('golden_row_shape')
            row = {}
            for (name, kind), cell in zip(TYPES.items(), sample):
                value = cell.get('value')
                if cell.get('type') != kind or type(cell.get('is_null')) is not bool:
                    raise ValueError('golden_cell_type')
                if cell['is_null']:
                    if value is not None or cell.get('precision') != 'exact_null':
                        raise ValueError('golden_null')
                elif kind == 'integer':
                    if type(value) is not str or cell.get('precision') != 'exact_integer':
                        raise ValueError('golden_integer_precision')
                    value = int(value)
                elif kind == 'real':
                    if type(value) not in (int, float) or cell.get('precision') != '17_significant_digits':
                        raise ValueError('golden_real_precision')
                    value = Decimal(str(value))
                elif kind == 'boolean':
                    if type(value) is not bool or cell.get('precision') != 'exact_boolean':
                        raise ValueError('golden_boolean')
                elif kind == 'datetime':
                    if cell.get('precision') != 'millisecond' or cell.get('timezone') != 'unspecified':
                        raise ValueError('golden_datetime_precision')
                    value = datetime.fromisoformat(value)
                elif type(value) is not str:
                    raise ValueError('golden_string')
                row[name] = value
            actual[port['port']].append(row)
    if actual != expected:
        raise ValueError('golden_expected_partition')
    assert_partition(rows, actual)
    return {'passed': True, 'row_counts': list(map(len, actual)), 'scope': 'complete_golden_values_and_duplicate_partition',
            'execution_verified': False, 'package_persistence_verified': False}
