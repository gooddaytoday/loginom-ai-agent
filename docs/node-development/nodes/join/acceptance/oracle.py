"""Independent nested-loop Join oracle. Null equality was observed on 7.4.2.

No Loginom output, handler code or saved package participates in this computation.
Row order is intentionally not a contract; multiplicity is.
"""
import csv
import io

def read_csv(raw):
    rows=list(csv.reader(io.StringIO(raw.decode('utf-8')),delimiter=';'))
    names=rows[0]
    if len(set(names))!=len(names):raise ValueError('duplicate headers')
    values=[]
    for row in rows[1:]:
        if len(row)!=len(names):raise ValueError('ragged fixture')
        values.append({name:None if value=='NULL' else int(value) if name in ('Part','PartR') else value for name,value in zip(names,row)})
    return names,values

def expected(left,right,keys,mode,case_sensitive,include_joined_keys):
    ln,ls=read_csv(left);rn,rs=read_csv(right)
    if mode not in ('inner','left') or not keys:raise ValueError('unsupported join')
    if any(a not in ln or b not in rn for a,b in keys):raise ValueError('missing key')
    right_keys={b for _,b in keys};out_right=[n for n in rn if include_joined_keys or n not in right_keys]
    names=ln+out_right
    if len(set(names))!=len(names):raise ValueError('name conflict')
    def same(a,b):
        if a is None or b is None:return a is b
        if type(a)!=type(b):raise ValueError('incompatible keys')
        return a==b if case_sensitive or not isinstance(a,str) else a.lower()==b.lower()
    result=[]
    for l in ls:
        hits=[r for r in rs if all(same(l[a],r[b]) for a,b in keys)]
        for r in hits:result.append([l[n] for n in ln]+[r[n] for n in out_right])
        if not hits and mode=='left':result.append([l[n] for n in ln]+[None]*len(out_right))
    columns=[dict(name=n,label=n,type='integer' if n in ('Part','PartR') else 'string',data_kind='Дискретный') for n in names]
    return columns,result


if __name__ == '__main__':
    import hashlib
    import json
    from pathlib import Path

    root = Path(__file__).resolve().parent
    data = root / 'data'
    pins = json.loads((root / 'fixture-pins.json').read_text())
    manifest = []
    for name, digest in sorted(pins.items()):
        raw = (data / name).read_bytes()
        assert hashlib.sha256(raw).hexdigest() == digest, f'changed fixture: {name}'
        names, records = read_csv(raw)
        manifest.append(dict(file=name, bytes=len(raw), sha256=digest,
                             records=len(records), encoding='UTF-8', delimiter=';',
                             null_marker='NULL', columns=names,
                             types=['integer' if n in ('Part', 'PartR') else 'string' for n in names]))
    matrix = {}
    for scenario, left, right in [('main', 'left.csv', 'right.csv'),
                                  ('case', 'case-left.csv', 'case-right.csv'),
                                  ('empty', 'left.csv', 'empty.csv')]:
        for mode in ('inner', 'left'):
            for sensitive in (True, False):
                for joined_keys in (True, False):
                    columns, rows = expected((data / left).read_bytes(), (data / right).read_bytes(),
                                             [('LKey', 'RKey'), ('Part', 'PartR')],
                                             mode, sensitive, joined_keys)
                    matrix[f'{scenario}-{mode}-{sensitive}-{joined_keys}'] = dict(columns=columns, rows=rows)
    outputs = []
    for mode, label in [('inner', 'Операции с деталями'), ('left', 'Все операции')]:
        entry = matrix[f'main-{mode}-True-True']
        names = [c['name'] for c in entry['columns']]
        outputs.append(dict(output_node_type='transform.join_data', output_node_label=label,
                            columns=entry['columns'], rows=[dict(zip(names, r)) for r in entry['rows']]))
    result = dict(package_path='{{PACKAGE_PATH}}',
                  nodes=[dict(type='imports.text'), dict(type='transform.join_data')], outputs=outputs)
    for name, value in [('expected.json', result), ('matrix-expected.json', matrix),
                        ('fixture-manifest.json', manifest)]:
        (root / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
