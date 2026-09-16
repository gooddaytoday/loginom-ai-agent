"""Independent expected semantics for the declared calculator acceptance task."""
import csv
import io
import re
from upload_probe import FIXTURE_SHA
import hashlib

IMPORT_COLUMNS=[dict(name=n,label=n,type=t,data_kind='Дискретный' if t=='string' else 'Непрерывный',used=True)
    for n,t in [('Id','integer'),('Region','string'),('Quantity','integer'),('UnitPrice','real'),('Comment','string')]]
EXPRESSIONS=[dict(name=n,label=l,type=t,formula=f,replace=r) for n,l,t,f,r in [
    ('Revenue','Сумма','real','Qty * UnitPrice',False),('Adjusted','Сумма','real','Revenue + 0.0001',False),
    ('UnitPrice','UnitPrice','real','UnitPrice * 2',True),('Note','Комментарий','string','If(IsNull(Comment), "missing", Concat(Comment, "!"))',False),
    ('Moment','Дата','datetime','EncodeDate(2024, 2, 29)',False)]]
OUTPUT_NAMES=['Id','Qty','Revenue','Adjusted','UnitPrice','Note','Moment','Comment']
OUTPUT_COLUMNS=[dict(name=n,label=l,type=t,data_kind=k) for n,l,t,k in [
    ('Id','Id','integer','Непрерывный'),('Qty','Количество','integer','Непрерывный'),
    ('Revenue','Сумма','real','Непрерывный'),('Adjusted','Сумма','real','Непрерывный'),
    ('UnitPrice','UnitPrice','real','Непрерывный'),('Note','Комментарий','string','Дискретный'),
    ('Moment','Дата','datetime','Непрерывный'),('Comment','Comment','string','Дискретный')]]


def formula_tokens(text):
    # Compare only token spelling/spacing; never evaluate a Loginom expression.
    return re.findall(r'"(?:[^"]|"")*"|\S',text) if isinstance(text,str) else None


def expected_rows(source):
    if hashlib.sha256(source).hexdigest()!=FIXTURE_SHA:raise ValueError('calculator_goal_fixture')
    rows=list(csv.DictReader(io.StringIO(source.decode('utf-8')),delimiter=';'))
    result=[]
    for r in rows:
        quantity=int(r['Quantity']);price=float(r['UnitPrice']);revenue=quantity*price
        comment=None if r['Comment']=='\\N' else r['Comment']
        result.append([r['Id'],str(quantity),repr(revenue),repr(revenue+0.0001),repr(price*2),
            'missing' if comment is None else comment+'!','2024-02-29 00:00:00.000',comment])
    return result


def verify_goal(seed,calculator,source):
    failures=[]
    try:
        expected_rows(source)
        if (seed['target']['kind'],seed['target']['type'],seed['target']['label'],seed['mode'],seed['finish'])!=('new','imports.text','Продажи','delimited','execute'):
            failures.append('goal_import')
        settings=seed['parameters']['settings']
        columns=[{k:v for k,v in c.items() if k!='source_name' or v!=c.get('name')} for c in settings['columns']]
        if sorted(columns,key=lambda c:c['name'])!=sorted(IMPORT_COLUMNS,key=lambda c:c['name']):failures.append('goal_import_columns')
        if settings['format']!=dict(delimiter=';',text_qualifier='"',decimal_separator='.',null_marker='\\N'):failures.append('goal_import_format')
        if any(settings['source'].get(k)!=v for k,v in dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True).items()):failures.append('goal_import_source_options')
        if seed.get('mappings') or seed.get('inputs'):failures.append('goal_import_mapping')
        if (calculator['target']['kind'],calculator['target']['type'],calculator['target']['label'],calculator['mode'],calculator['finish'])!=('new','transform.calculator','Расчёт','expression','execute'):
            failures.append('goal_calculator')
        actual=calculator['parameters']['expressions'];order=calculator['parameters'].get('order')
        if order is not None:actual=sorted(actual,key=lambda e:order.index(e['name']))
        if len(actual)!=len(EXPRESSIONS):failures.append('goal_expression_count')
        for a,e in zip(actual,EXPRESSIONS):
            if (a.get('target')!={'kind':'new'} or any(a.get(k)!=v for k,v in e.items() if k!='formula')
                    or formula_tokens(a.get('formula'))!=formula_tokens(e['formula'])):failures.append('goal_expression_semantics')
        mappings={m['direction']:m for m in calculator['mappings']}
        if set(mappings)!={'input','output'} or len(calculator['mappings'])!=2:raise ValueError('goal_two_mappings')
        for m in mappings.values():
            if m['port']!=0 or m.get('autosync') is not False:failures.append('goal_mapping_options')
        input_fields=mappings['input']['fields']
        if any(f['source'].get('kind')!='configured_field' or f.get('excluded',False) for f in input_fields):failures.append('goal_input_mapping_source')
        expected_input=[('Id','Id','Id'),('Region','Region','Region'),('Quantity','Qty','Количество'),('UnitPrice','UnitPrice','UnitPrice'),('Comment','Comment','Comment')]
        if [(f['source']['name'],f.get('name',f['source']['name']),f.get('label',f['source']['name'])) for f in input_fields]!=expected_input:failures.append('goal_input_mapping')
        output=mappings['output']['fields']
        if ([f['source']['name'] for f in output if not f.get('excluded')]!=OUTPUT_NAMES
                or [f['source']['name'] for f in output if f.get('excluded')]!=['Region']
                or len(output)!=9):
            failures.append('goal_output_mapping')
        labels={c['name']:c['label'] for c in OUTPUT_COLUMNS}|{'Region':'Region'}
        for f in output:
            name=f['source']['name']
            if f['source'].get('kind')!='configured_field' or f.get('name',name)!=name or f.get('label',labels.get(name))!=labels.get(name):failures.append('goal_output_names')
        for r in (seed,calculator):
            if r['read'].get('ports')!=[0] or not 6<=r['read'].get('sample_rows',-1)<=10 or r['read'].get('require_exact_numbers') is not True:
                failures.append('goal_complete_sample')
    except (KeyError,IndexError,ValueError,TypeError,AttributeError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'goal_malformed')
    return dict(passed=not failures,failures=sorted(set(failures)),scope='calculator_declared_task_only')
