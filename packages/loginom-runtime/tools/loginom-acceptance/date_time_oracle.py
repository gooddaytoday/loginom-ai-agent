"""Independent Gregorian oracle; no JS handler or native enum imports."""
from datetime import datetime
from calendar import monthrange

ROWS = [
    dict(Id=1, DateA='2023-12-31T23:59:59.000', DateB='2024-02-29T12:34:56.000', Amount=10),
    dict(Id=2, DateA='2024-02-29T08:12:34.000', DateB='2023-02-28T00:00:00.000', Amount=20),
    dict(Id=3, DateA='2024-04-01T00:00:00.000', DateB='2024-03-31T23:59:59.000', Amount=30),
    dict(Id=4, DateA=None, DateB=None, Amount=40),
]

def calendar_value(value, operation):
    if value is None:
        return None
    d = datetime.fromisoformat(value)
    q = (d.month - 1) // 3
    numeric = dict(year=d.year, quarter=q + 1, month=d.month, day_of_month=d.day, hour=d.hour)
    if operation in numeric:
        return numeric[operation]
    periods = dict(year_start=(1, 1), year_end=(12, 31),
                   quarter_start=(q * 3 + 1, 1),
                   quarter_end=(q * 3 + 3, monthrange(d.year, q * 3 + 3)[1]),
                   month_start=(d.month, 1), month_end=(d.month, monthrange(d.year, d.month)[1]),
                   date=(d.month, d.day))
    month, day = periods[operation]
    return datetime(d.year, month, day).isoformat(timespec='milliseconds')

def verify_output(port, projection, rows=ROWS):
    if port.get('sample_complete') is not True or port.get('sample_rows') != len(rows) or port.get('row_count') != len(rows):
        raise ValueError('date_time_incomplete_output')
    if [f['name'] for f in port['schema']] != [f['name'] for f in projection]:
        raise ValueError('date_time_output_order')
    for field, expected in zip(port['schema'], projection):
        if field['type'] != expected['type'] or field['label'] != expected['label']:
            raise ValueError('date_time_output_schema')
    expected_rows = [[calendar_value(row[f['input']], f['operation']) if f.get('operation') else row[f['input']]
                      for f in projection] for row in rows]
    actual = []
    for raw in port['sample']:
        if len(raw) != len(projection):
            raise ValueError('date_time_output_width')
        values = []
        for cell, field in zip(raw, projection):
            if cell['type'] != field['type']:
                raise ValueError('date_time_cell_type')
            if cell['is_null']:
                if cell.get('value') is not None:
                    raise ValueError('date_time_false_null')
                values.append(None)
            elif cell['type'] == 'datetime':
                if cell.get('precision') != 'millisecond' or cell.get('timezone') != 'unspecified' or cell.get('representation') != 'local_datetime':
                    raise ValueError('date_time_unverified_precision')
                values.append(cell['value'])
            else:
                if cell.get('precision') != 'exact_integer':
                    raise ValueError('date_time_unverified_number')
                values.append(int(cell['value']))
        actual.append(values)
    if actual != expected_rows:
        raise ValueError('date_time_values_or_row_order')
    return dict(passed=True, rows=len(rows), columns=len(projection), full_values_verified=True)
