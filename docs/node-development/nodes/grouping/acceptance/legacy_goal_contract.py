"""Independent small-table oracle for the Grouping acceptance fixtures.

No client modules or node result values participate in aggregate calculation.
String extrema fixtures use ASCII so they do not depend on system collation.
"""
import csv
import io


def expected_grouping(source_bytes, columns, keys, measures):
    rows = list(csv.DictReader(io.StringIO(source_bytes.decode('utf-8')), delimiter=';'))
    by_name = {c['name']: c for c in columns}
    if len(by_name) != len(columns) or not keys or not measures:
        raise ValueError('grouping_oracle_schema')
    def parse(name, value):
        kind = by_name[name]['type']
        if value == '\\N' or value == '' and kind != 'string':
            return None
        if kind == 'integer': return int(value)
        if kind == 'real': return float(value)
        if kind == 'string': return value
        raise ValueError('grouping_oracle_type')
    groups = {}
    for raw in rows:
        row = {name: parse(name, raw[name]) for name in by_name}
        groups.setdefault(tuple(row[name] for name in keys), []).append(row)
    result = []
    for key, records in groups.items():
        values = list(key)
        for measure in measures:
            name, function = measure['field'], measure['function']
            present = [r[name] for r in records if r[name] is not None]
            if function == 'count': value = len(records)  # Includes null/empty.
            elif function == 'sum': value = sum(present, 0.0) if present else None
            elif function == 'avg': value = sum(present) / len(present) if present else None
            elif function == 'min': value = min(present) if present else None
            elif function == 'max': value = max(present) if present else None
            else: raise ValueError('grouping_oracle_function')
            values.append(value)
        result.append(values)
    schema = [dict(by_name[name]) for name in keys]
    for m in measures:
        kind = 'integer' if m['function'] == 'count' else 'real' if m['function'] in {'sum','avg'} else by_name[m['field']]['type']
        schema.append(dict(name=m['name'], label=m['label'], type=kind,
                           data_kind='Дискретный' if kind=='string' else 'Непрерывный'))
    return schema, result

IMPORT_COLUMNS=[dict(name=n,label=n,type=t,data_kind='Дискретный' if t=='string' else 'Непрерывный',used=True)
    for n,t in [('Group','string'),('Segment','string'),('Amount','real'),('Other','integer'),('Text','string')]]
INITIAL_MEASURES=[dict(field=field,function=fn,name=name,label=label) for field,fn,name,label in [
    ('Amount','sum','Total','Сумма'),('Amount','count','Rows','Строки'),('Amount','avg','Average','Среднее'),
    ('Amount','min','Minimum','Минимум'),('Amount','max','Maximum','Максимум'),('Text','count','TextRows','Количество строк')]]
FINAL_MEASURES=[dict(field=field,function=fn,name=name,label=label) for field,fn,name,label in [
    ('Other','sum','OtherTotal','Сумма'),('Amount','avg','MeanAmount','Сумма'),('Text','count','TextRows','Количество строк')]]

def goal_output(source,final=False):
    columns=[{k:v for k,v in c.items() if k!='used'} for c in IMPORT_COLUMNS]
    schema,rows=expected_grouping(source,columns,['Segment','Group'] if final else ['Group'],FINAL_MEASURES if final else INITIAL_MEASURES)
    return (schema[1:],[r[1:] for r in rows]) if final else (schema,rows)

def verify_goal(seed,initial,changed,source):
    import hashlib
    from grouping_upload_probe import FIXTURE_SHA
    failures=[]
    try:
        if hashlib.sha256(source).hexdigest()!=FIXTURE_SHA:raise ValueError('grouping_goal_fixture')
        if (seed['target']['kind'],seed['target']['type'],seed['target']['label'],seed['mode'],seed['finish'])!=('new','imports.text','Данные','delimited','execute'):failures.append('grouping_goal_import')
        settings=seed['parameters']['settings']
        columns=[{k:v for k,v in c.items() if k!='source_name' or v!=c.get('name')} for c in settings['columns']]
        if columns!=IMPORT_COLUMNS:failures.append('grouping_goal_import_columns')
        if settings['format']!=dict(delimiter=';',text_qualifier='"',decimal_separator='.',null_marker='\\N'):failures.append('grouping_goal_import_format')
        if any(settings['source'].get(k)!=v for k,v in dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True).items()):failures.append('grouping_goal_import_options')
        def identity_mappings(mappings,allowed):
            seen=set()
            for mapping in mappings:
                direction=mapping.get('direction')
                if direction not in allowed or direction in seen or mapping.get('port')!=0 or mapping.get('autosync') is not True:return False
                seen.add(direction)
                expected=allowed[direction]
                fields=mapping.get('fields',[])
                if len(fields)!=len(expected):return False
                for field,column in zip(fields,expected):
                    name,label=column['name'],column['label']
                    if field.get('source')!=dict(kind='configured_field',name=name) or field.get('name',name)!=name or field.get('label',label)!=label or field.get('excluded',False) is not False:return False
            return True
        if not identity_mappings(seed['mappings'],{'output':IMPORT_COLUMNS}) or seed['inputs']:failures.append('grouping_goal_import_mapping')
        for r,kind,keys,measures in [(initial,'new',['Group'],INITIAL_MEASURES),(changed,'existing',['Segment','Group'],FINAL_MEASURES)]:
            if (r['target']['kind'],r['target']['type'],r['mode'],r['finish'])!=(kind,'transform.group_data','aggregate','execute'):failures.append('grouping_goal_target')
            expected=dict(group_by=[dict(kind='input_field',name=n) for n in keys],measures=[dict(m,field=dict(kind='input_field',name=m['field'])) for m in measures])
            if r['parameters']!=expected:failures.append('grouping_goal_parameters')
        if initial['target'].get('label')!='Итоги' or not identity_mappings(initial['mappings'],{'input':IMPORT_COLUMNS,'output':goal_output(source)[0]}):failures.append('grouping_goal_initial_mapping')
        mapping=changed['mappings']
        if len(mapping)!=1 or mapping[0]['direction']!='output' or mapping[0]['port']!=0 or mapping[0]['autosync'] is not False:raise ValueError('grouping_goal_mapping')
        active=[f for f in mapping[0]['fields'] if not f.get('excluded')];excluded=[f for f in mapping[0]['fields'] if f.get('excluded')]
        if [f['source'] for f in active]!=[dict(kind='configured_field',name=n) for n in ['Group','OtherTotal','MeanAmount','TextRows']] or [f['source'] for f in excluded]!=[dict(kind='configured_field',name='Segment')]:failures.append('grouping_goal_output_order')
        labels={'Group':'Group','Segment':'Segment',**{m['name']:m['label'] for m in FINAL_MEASURES}}
        for f in mapping[0]['fields']:
            n=f['source']['name']
            if f.get('name',n)!=n or f.get('label',labels[n])!=labels[n]:failures.append('grouping_goal_names')
        for r in (seed,initial,changed):
            if r['read']['ports']!=[0] or not 8<=r['read']['sample_rows']<=10 or r['read']['require_exact_numbers'] is not True:failures.append('grouping_goal_full_read')
    except (KeyError,IndexError,TypeError,ValueError) as error:failures.append(str(error))
    return dict(passed=not failures,failures=sorted(set(failures)),scope='grouping_declared_task')
