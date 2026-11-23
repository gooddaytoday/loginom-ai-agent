"""Independent oracle for imports-database stage 1 (SQLite). Not Loginom.

Builds people.db from fixtures/people.sql in a temporary directory with
Python sqlite3, runs each case's SQL and prints expected.json to stdout.
Loginom types/data kinds are the ones observed on stage 0 (discovery.md);
SQLite values are mapped by declared column type: BOOLEAN -> bool,
DATETIME -> ISO-8601 with milliseconds. NULL stays null; '' stays ''.

Usage: python3 -I oracle.py > expected.json
"""
import datetime, json, pathlib, sqlite3, sys, tempfile

HERE = pathlib.Path(__file__).resolve().parent
SQL = (HERE.parent / 'fixtures' / 'people.sql').read_text(encoding='utf-8')
COLUMNS = {  # observed in DBImportWizard / ColumnsMappingEngineOutputPortWizard
    'Id': ('integer', 'continuous'), 'Label': ('string', 'discrete'),
    'Amount': ('real', 'continuous'), 'Active': ('boolean', 'discrete'),
    'Occurred': ('datetime', 'continuous'),
}
CASES = [
    dict(id='table', mode='table', source='People',
         sql='SELECT Id, Label, Amount, Active, Occurred FROM People', order_by='Id'),
    dict(id='view', mode='table', source='PeopleView',
         sql='SELECT Id, Label, Amount, Active, Occurred FROM PeopleView', order_by='Id'),
    dict(id='sql', mode='sql', ordered=True,
         sql='SELECT Amount, Id, Label FROM People WHERE Active = 1 ORDER BY Id DESC'),
    dict(id='empty', mode='sql', ordered=True,
         sql='SELECT Id, Label, Amount FROM People WHERE Id > 100 ORDER BY Id'),
]


def cell(name, value):
    kind = COLUMNS[name][0]
    if value is None:
        return None
    if kind == 'boolean':
        return bool(value)
    if kind == 'datetime':
        return datetime.datetime.fromisoformat(value).strftime('%Y-%m-%dT%H:%M:%S.000')
    if kind == 'real':
        return float(value)
    return value


def main():
    with tempfile.TemporaryDirectory() as tmp:
        con = sqlite3.connect(pathlib.Path(tmp) / 'people.db')
        con.executescript(SQL)
        out = {'proposal': True, 'package_path': '{{PACKAGE_PATH}}',
               'nodes': [{'type': 'imports.database', 'label_any': True}], 'cases': []}
        for case in CASES:
            query = case['sql'] + (f" ORDER BY {case['order_by']}" if 'order_by' in case else '')
            cur = con.execute(query)
            names = [d[0] for d in cur.description]
            rows = [[cell(n, v) for n, v in zip(names, r)] for r in cur.fetchall()]
            out['cases'].append({
                'id': case['id'], 'mode': case['mode'],
                **({'source': case['source']} if 'source' in case else {'sql': case['sql']}),
                'output_port': 0,
                # table mode has no ORDER BY in Loginom; rows compared as a set
                'ordered': case.get('ordered', False), 'column_order': 'exact',
                'columns': [{'name': n, 'label': n, 'type': COLUMNS[n][0], 'data_kind': COLUMNS[n][1],
                             **({'tolerance': {'abs': 0, 'rel': 0}} if COLUMNS[n][0] == 'real' else {}),
                             **({'tolerance': {'abs_ms': 0}} if COLUMNS[n][0] == 'datetime' else {})}
                            for n in names],
                'row_count': len(rows), 'rows': rows})
        con.close()
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write('\n')


if __name__ == '__main__':
    main()
