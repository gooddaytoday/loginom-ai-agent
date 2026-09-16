"""Frozen business oracle; no client/handler imports and no observed output inputs."""
import csv
from datetime import datetime
import hashlib
import io
import json
from pathlib import Path
from date_time_oracle import calendar_value

WORK = Path(__file__).resolve().parent
FIXTURES = WORK / 'fixtures/date-time'
GOAL = WORK / 'goals/date-time-sales.txt'
OPS = ('date', 'month_end', 'month_start', 'quarter_end', 'quarter_start',
       'year_end', 'year_start', 'hour', 'day_of_month', 'month', 'quarter', 'year')
NUMERIC = {'hour', 'day_of_month', 'month', 'quarter', 'year'}
IMPORT_SCHEMA = [dict(name=n, label=n, type=t) for n, t in
                 [('Id', 'integer'), ('DateA', 'datetime'), ('DateB', 'datetime'), ('Amount', 'integer')]]


def source_rows(data):
    reader = csv.DictReader(io.StringIO(data.decode('utf-8')), delimiter=';')
    if reader.fieldnames != [c['name'] for c in IMPORT_SCHEMA]:
        raise ValueError('source_header')
    rows = []
    for r in reader:
        if set(r) != set(reader.fieldnames) or any(v is None for v in r.values()):
            raise ValueError('source_width')
        rows.append({c['name']: None if r[c['name']] == 'NULL' else
                     int(r[c['name']]) if c['type'] == 'integer' else
                     datetime.fromisoformat(r[c['name']]).isoformat(timespec='milliseconds')
                     for c in IMPORT_SCHEMA})
    if len({r['Id'] for r in rows}) != len(rows) or any(r['Id'] <= 0 for r in rows):
        raise ValueError('unique_positive_ids')
    return rows


def projection(final=True):
    fields = [dict(name='RowId' if final else 'Id', label='Идентификатор строки' if final else 'Id', type='integer', input='Id'),
              dict(name='SalesAmount' if final else 'Amount', label='Сумма продаж' if final else 'Amount', type='integer', input='Amount')]
    for prefix, source in [('A', 'DateA'), ('B', 'DateB')]:
        for op in OPS:
            renamed = final and prefix == 'A' and op == 'year'
            fields.append(dict(name='SavedYearA' if renamed else prefix+'_'+op,
                               label='Год сохранённой даты A' if renamed else prefix+' '+op,
                               type='integer' if op in NUMERIC else 'datetime', input=source, operation=op))
    return fields + [dict(name='DateA', label='Дата', type='datetime', input='DateA')]


def table(fields, rows):
    return dict(schema=[{k: f[k] for k in ('name', 'label', 'type')} for f in fields],
                rows=[[calendar_value(r[f['input']], f['operation']) if f.get('operation') else r[f['input']]
                      for f in fields] for r in rows])


def expected(data):
    rows = source_rows(data)
    result = dict(source=dict(schema=IMPORT_SCHEMA, rows=[[r[c['name']] for c in IMPORT_SCHEMA] for r in rows]),
                  initial=table(projection(False), rows), calendar=table(projection(), rows),
                  empty=table(projection(), []), excluded=[dict(name='DateB', label='DateB', type='datetime', excluded=True)],
                  excluded_sources=[dict(name='DateB', label='Дата', type='datetime')])
    for period in ('month', 'quarter'):
        groups = {}
        for row in rows:
            key = (calendar_value(row['DateA'], 'year'), calendar_value(row['DateA'], period))
            groups[key] = groups.get(key, 0) + row['Amount']
        result[period] = dict(schema=[dict(name='Year', label='Год', type='integer'),
            dict(name='Month' if period == 'month' else 'Quarter', label='Месяц' if period == 'month' else 'Квартал', type='integer'),
            dict(name='Total', label='Сумма продаж', type='real')],
            rows=[[*key, total] for key, total in sorted(groups.items(), key=lambda x: tuple(-1 if v is None else v for v in x[0]))])
    return result


def frozen():
    stored = json.loads((FIXTURES/'expected.json').read_text())
    if stored != expected((FIXTURES/'sales.csv').read_bytes()):
        raise ValueError('frozen_expected_differs_from_independent_recalculation')
    return stored


def artifact(run_id):
    import re
    if not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}', run_id):
        raise ValueError('run_id')
    data = (FIXTURES/'sales.csv').read_bytes()
    return dict(name='Dock-date-time-'+run_id+'-sales.csv', bytes=len(data),
                sha256=hashlib.sha256(data).hexdigest(), upload=dict(directory='/test-3', overwrite='reject'))


def render(run_id):
    return GOAL.read_text().replace('__CSV__', artifact(run_id)['name']).replace(
        '__PACKAGE__', '/test-3/packages/Dock-date-time-'+run_id+'.lgp')


if __name__ == '__main__':
    print(json.dumps(frozen(), ensure_ascii=False, indent=2))
