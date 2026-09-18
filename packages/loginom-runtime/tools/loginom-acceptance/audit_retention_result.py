"""Independent task38 goal checks. Operator-only; never included in Hermes inputs.

The graph auditor checks what the chosen graph computes. This module separately
checks whether its complete outputs contain the required cohort matrix and curve.
Bindings and curve weighting must be reviewed from actual saved settings.
"""
from decimal import Decimal
from audit_sales_scenario import require, typed_rows
from corpus_oracles import cohort_retention


def project(table, fields):
    require(len(fields) == len(set(fields)), 'Repeated goal field binding')
    names = [f['name'] for f in table['schema']]
    require(len(names) == len(set(names)) and all(f in names for f in fields), 'Missing or duplicate goal fields')
    indexes = [names.index(f) for f in fields]
    require(all(len(row) == len(names) for row in table['rows']), 'Incomplete source row')
    return typed_rows(dict(table, schema=[table['schema'][i] for i in indexes],
                           rows=[[row[i] for i in indexes] for row in table['rows']]))


def months(binding):
    fields = binding['months']
    require(set(fields) == {str(m) for m in range(1, 13)}, 'All twelve months are required')
    return [fields[str(m)] for m in range(1, 13)]


def number(value, scale):
    require(scale in (1, 100), 'Explicit ratio/percentage scale required')
    require(isinstance(value, Decimal) and value.is_finite(), 'Exact finite retention value required')
    return value / scale


def tolerance(binding):
    # Only an operator-reviewed rounding rule from saved formulas may relax
    # comparison; ordinary rounded UI display never supplies this proof.
    digits = binding.get('rounding_decimals')
    if digits is None:
        return Decimal('0.0000001')
    require(type(digits) is int and 0 <= digits <= 12 and binding['scale'] in (1, 100),
            'Invalid reviewed rounding rule')
    return Decimal('0.5') * Decimal(10) ** -digits / binding['scale'] + Decimal('1e-12')


def check_values(found, expected, allowed):
    require(found.keys() == expected.keys(), 'Missing or extra cohort/month combinations')
    differences = [abs(found[k] - Decimal(value)) for k, value in expected.items()]
    require(all(delta <= allowed for delta in differences), 'Retention values differ from dataset')
    return str(max(differences, default=Decimal(0)))


def audit_matrix(table, binding, oracle):
    found = {}; cohort = binding['cohort']; scale = binding['scale']
    if binding['layout'] == 'wide':
        columns = months(binding)
        names = [f['name'] for f in table['schema']]
        require([names.index(f) for f in columns] == sorted(names.index(f) for f in columns),
                'Matrix month columns are not chronological')
        rows = project(table, [cohort] + columns)
        for row in rows:
            for month, field in enumerate(columns, 1):
                key = (row[cohort], month)
                require(key not in found, 'Duplicate cohort row')
                found[key] = number(row[field], scale)
    else:
        require(binding['layout'] == 'long', 'Unsupported matrix layout')
        month_field, value_field = binding['month'], binding['retention']
        rows = project(table, [cohort, month_field, value_field]); previous = {}
        for row in rows:
            month = row[month_field]
            require(isinstance(month, Decimal) and month == month.to_integral_value() and 1 <= month <= 12,
                    'Month must be an exact integer from 1 to 12')
            key = (row[cohort], int(month))
            require(key not in found, 'Duplicate cohort/month')
            require(month > previous.get(row[cohort], 0), 'Matrix months are not chronological')
            previous[row[cohort]] = month
            found[key] = number(row[value_field], scale)
    expected = {(r['cohort'], r['month']): r['retention'] for r in oracle['matrix']}
    return dict(cells_checked=len(found), maximum_absolute_difference=check_values(found, expected, tolerance(binding)), tolerance=str(tolerance(binding)),
                zero_activity_months_checked=True, chronological_order_checked=True)


def audit_curve(table, binding, oracle):
    require(binding['weighting'] in ('weighted', 'unweighted'), 'Reviewed curve weighting required')
    found = {}; scale = binding['scale']
    if binding['layout'] == 'wide':
        columns = months(binding); rows = project(table, columns)
        require(len(rows) == 1, 'Overall curve must have one wide row')
        found = {m: number(rows[0][field], scale) for m, field in enumerate(columns, 1)}
    else:
        require(binding['layout'] == 'long', 'Unsupported curve layout')
        month_field, value_field = binding['month'], binding['retention']
        rows = project(table, [month_field, value_field]); last = 0
        for row in rows:
            month = row[month_field]
            require(isinstance(month, Decimal) and month == month.to_integral_value() and last < month <= 12,
                    'Curve months must be unique and chronological')
            last = month; found[int(month)] = number(row[value_field], scale)
    expected = {r['month']: r[binding['weighting']] for r in oracle['curve']}
    return dict(months_checked=len(found), weighting=binding['weighting'],
                maximum_absolute_difference=check_values(found, expected, tolerance(binding)), tolerance=str(tolerance(binding)))


def audit_retention(dataset, matrix, curve, matrix_binding, curve_binding):
    oracle = cohort_retention(dataset)
    return dict(status='PASS', scope='complete_retention_matrix_and_mean_curve',
                matrix=audit_matrix(matrix, matrix_binding, oracle),
                curve=audit_curve(curve, curve_binding, oracle),
                remaining_reviews=['Saved graph/configuration and provenance',
                                   'Comparison at months 3 and 6, stickiest cohorts, and recommendations'])
