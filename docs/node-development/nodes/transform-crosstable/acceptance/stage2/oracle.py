"""Independent stage 2 aggregation; no runtime/handler imports.

Input order is preserved for First/Last, including NULL. Count includes NULL,
distinct excludes NULL, empty intersections stay NULL, and StdDev uses n-1
(one non-null observation gives zero). Dates aggregate in native day units.
"""
import csv
import math
from datetime import datetime, timedelta
from pathlib import Path

TYPES = {'Region': 'string', 'Month': 'string', 'Category': 'string',
         'Channel': 'string', 'Amount': 'real', 'Units': 'integer',
         'Text': 'string', 'Flag': 'boolean', 'When': 'datetime'}
FUNCTIONS = ('sum', 'count', 'min', 'max', 'avg', 'stddev', 'sum_squares',
             'unique_count', 'null_count', 'first', 'last')

def read(path):
    def decode(name, value):
        if value == '?': return None
        kind = TYPES[name]
        if kind == 'real': return float(value)
        if kind == 'integer': return int(value)
        if kind == 'boolean':
            if value not in ('true', 'false'): raise ValueError(value)
            return value == 'true'
        if kind == 'datetime': return datetime.fromisoformat(value)
        return value
    with Path(path).open(newline='', encoding='utf-8') as source:
        return [{k: decode(k, v) for k, v in row.items()} for row in csv.DictReader(source)]

def aggregate(values, function):
    if not values: return None
    valid = [v for v in values if v is not None]
    if function == 'count': return len(values)
    if function == 'null_count': return len(values) - len(valid)
    if function == 'unique_count': return len(set(valid))
    if function == 'first': return values[0]
    if function == 'last': return values[-1]
    if not valid: return None
    if function == 'min': return min(valid)
    if function == 'max': return max(valid)
    date = isinstance(valid[0], datetime)
    origin = datetime(1899, 12, 30)
    numbers = [(v-origin).total_seconds()/86400 for v in valid] if date else valid
    if function == 'sum': return sum(numbers)
    if function == 'sum_squares': return sum(v*v for v in numbers)
    mean = sum(numbers)/len(numbers)
    if function == 'avg': return origin+timedelta(days=mean) if date else mean
    if function == 'stddev':
        return math.sqrt(sum((v-mean)**2 for v in numbers)/(len(numbers)-1)) if len(numbers)>1 else 0.0
    raise ValueError(function)

def pivot(rows, keys, dimensions, fact, function):
    groups = {}
    for row in rows:
        identity = (tuple(row[k] for k in keys), tuple(row[d] for d in dimensions))
        groups.setdefault(identity, []).append(row[fact])
    return {identity: aggregate(values, function) for identity, values in groups.items()}

if __name__ == '__main__':
    import unittest
    class OracleChecks(unittest.TestCase):
        def test_numeric_and_null(self):
            values = [1, 3, 5, None]
            self.assertEqual([aggregate(values, f) for f in FUNCTIONS],
                             [9, 4, 1, 5, 3, 2, 35, 3, 1, 1, None])
            self.assertEqual([aggregate([None], f) for f in FUNCTIONS],
                             [None, 1, None, None, None, None, None, 0, 1, None, None])
            self.assertTrue(all(aggregate([], f) is None for f in FUNCTIONS))
        def test_order_and_typed_values(self):
            self.assertEqual(aggregate(['z', 'a', None], 'first'), 'z')
            self.assertIsNone(aggregate(['z', 'a', None], 'last'))
            self.assertEqual(aggregate([True, False, None], 'min'), False)
            dates = [datetime(2026,1,d) for d in [1,3,5]] + [None]
            self.assertEqual(aggregate(dates, 'avg'), datetime(2026,1,3))
            self.assertEqual(aggregate(dates, 'stddev'), 2)
        def test_dimensions(self):
            rows = read(Path(__file__).with_name('typed.csv'))
            actual = pivot(rows, ['Region','Month'], ['Category','Channel'], 'Amount', 'count')
            self.assertEqual(actual[(('North','Sep'),('A','web'))], 4)
            self.assertEqual(actual[((None,'Oct'),('B',None))], 1)
            self.assertNotIn((('North','Sep'),('B',None)), actual)
    unittest.main()
