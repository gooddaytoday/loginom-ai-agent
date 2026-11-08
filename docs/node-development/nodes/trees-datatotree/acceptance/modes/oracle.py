#!/usr/bin/env python3
"""Stage-0 proposals, independently calculated with Python stdlib only.

This is a proposal generator, not a run-check adapter or a native-result matcher.
No runtime imports, network access, Loginom output or expected input is used.
"""
import argparse
import csv
import json
from datetime import datetime
from pathlib import Path

NODES = Path(__file__).resolve().parents[3]
SLUGS = ('trees-datatotree', 'trees-treetojson', 'trees-jsontotree', 'trees-treetodata')


def load(slug, name):
    return json.loads((NODES / slug / 'fixtures/modes' / name).read_text(encoding='utf-8'))


def typed(value, path='', types=None):
    """Oracle AST, deliberately independent of the production wire schema."""
    if isinstance(value, dict):
        return dict(path=path, type='object', children=[
            typed(v, path + '/' + k.replace('~', '~0').replace('/', '~1'), types)
            for k, v in value.items()])
    if isinstance(value, list):
        return dict(path=path, type='array', children=[
            typed(v, path + '/' + str(i), types) for i, v in enumerate(value)])
    kind = ('null' if value is None else 'boolean' if type(value) is bool
            else 'integer' if type(value) is int else 'real' if type(value) is float else 'string')
    schema_path = '/'.join(p for p in path.split('/') if not p.isdecimal())
    declared = (types or {}).get(schema_path)
    kind = declared if declared and declared != 'variant' and value is not None else kind
    return dict(path=path, type=kind, value=str(value) if kind in ('integer', 'real') else value,
                **({'schema_type':'variant'} if declared == 'variant' else {}))


def tree(value, types=None):
    schema = {}
    def walk(v, path=''):
        if path not in schema:
            sample = v[0] if isinstance(v,list) and v else v
            kind = ('object' if isinstance(sample, (dict,list)) else 'boolean' if type(sample) is bool
                    else 'integer' if type(sample) is int else 'real' if type(sample) is float else 'string')
            schema[path] = dict(path=path, name=path.rsplit('/',1)[-1].replace('~1','/').replace('~0','~') if path else 'Root',
                                label_any=True, type=(types or {}).get(path,kind),
                                is_array=isinstance(v,list), is_container=isinstance(sample,(dict,list)))
        if isinstance(v,dict):
            for k,x in v.items():
                walk(x,path+'/'+k.replace('~','~0').replace('/','~1'))
        if isinstance(v,list):
            for x in v:
                if isinstance(x,dict):
                    for k,y in x.items():
                        walk(y,path+'/'+k.replace('~','~0').replace('/','~1'))
                elif isinstance(x,list):
                    raise ValueError('Array-of-array schema needs a separate native proposal')
    walk(value)
    return dict(port=0, port_kind='tree', schema=list(schema.values()),
                document=typed(value, types=types), ordered=True)


def table(columns, rows):
    return dict(port=0, port_kind='table', columns=columns, rows=rows, ordered=True)


def case(name, output=None, **settings):
    return dict(id=name, native_status='not_checked', settings_proposal=settings,
                **({'output': output} if output is not None else {}))


def proposals(slug):
    if slug == SLUGS[0]:
        f = load(slug, 'input.json')
        with (NODES / slug / 'fixtures/modes/rows.csv').open(newline='', encoding='utf-8') as source:
            rows = list(csv.DictReader(source))
        with (NODES / slug / 'fixtures/modes/empty.csv').open(newline='', encoding='utf-8') as source:
            empty = csv.DictReader(source)
            assert empty.fieldnames == list(rows[0]) and list(empty) == []
        assert len(rows) == len(f['variant_cells']) == 3
        scalar = [dict(Code=r['Code'], Qty=None if r['Qty'] == '?' else int(r['Qty'])) for r in rows]
        groups = {}
        for r, item in zip(rows, scalar):
            groups.setdefault(r['Group'], []).append(item)
        grouped = dict(groups=[dict(Group=k, items=v) for k, v in groups.items()])
        flat = dict(items=[dict(Group=r['Group'], **item) for r, item in zip(rows, scalar)])
        variant_values = [int(f['variant_cells'][0]['value']),f['variant_cells'][1]['value'],f['variant_cells'][2]['value']]
        dated = dict(items=[dict(When=r['When'],Value=v) for r,v in zip(rows,variant_values)])
        variants = [dict(path='/items/' + str(i) + '/Value', **v) for i, v in enumerate(f['variant_cells'])]
        deep = {'Code': rows[0]['Code']}
        for name in ('level4', 'level3', 'level2', 'level1'):
            deep = {name: deep}
        return [
            case('arrays', tree(flat), grouping=False, structure='Root/items[]/{Group,Code,Qty}',
                 sibling_output=tree({'codes':[{'Code':r['Code']} for r in rows], 'quantities':[{'Qty':s['Qty']} for s in scalar]}),
                 scalar_array_output=tree({'codes':[r['Code'] for r in rows]}),
                 scalar_array_contract='not approved: current native tree reader requires arrays to be containers'),
            case('grouping', tree(grouped), grouping=True, group_keys=['Group'], grouping_rule='first occurrence, A/B/A becomes A[x,z], B[y]'),
            case('dates-variant', dict(tree(dated, {'/items/When':'datetime','/items/Value':'variant'}), variant_cells=variants), datetime='civil milliseconds', variant='per-cell subtype exact; no string-only CSV inference'),
            case('empty', dict(tree({'items': []}), schema=tree(flat)['schema']), source='empty.csv', preserve_declared_schema=True),
            case('editor-depth', tree(deep), depth=5, sequence='add child; rename/label; move; Save; reopen; same structure'),
        ]
    if slug == SLUGS[1]:
        f = load(slug, 'input.json')
        base = {k:v for k,v in f['document'].items() if k != 'when'}
        labels = f['labels']
        def rename(v):
            if isinstance(v, dict):
                return {labels[k]: rename(x) for k,x in v.items()}
            return [rename(x) for x in v] if isinstance(v, list) else v
        def json_rows(values):
            return table([dict(name='JSON', name_any=True, label_any=True, type='string', comparison='json_ast')],
                         [{'JSON': json.dumps(v, ensure_ascii=False, separators=(',', ':'))} for v in values])
        moment = datetime.fromisoformat(f['document']['when'])
        assert moment.tzinfo is None
        custom = moment.strftime('%d.%m.%Y %H:%M:%S.') + str(moment.microsecond // 1000).zfill(3)
        return [
            case('root-array', json_rows([f['root_array']]), exclude_root=True, multi_row=False),
            case('split', json_rows(f['root_array']), exclude_root=True, multi_row=True),
            case('pretty-labels', json_rows([rename(base)]), pretty=True, keys='labels', formatting='valid JSON with a line break outside string tokens; indentation not specified'),
            case('dates', json_rows([f['document']]), datetime='iso8601', custom_date='DD.MM.YYYY', custom_time='hh:mm:ss.zzz',
                 custom_output=json_rows([dict(f['document'],when=custom)]), timezone='none; custom exact spelling pending UI probe'),
            case('siblings', json_rows([base]), sibling_arrays='preserve independent array lengths 2 and 3; no flattening'),
            case('empty', json_rows([f['empty_root_array']]), multi_row_false_document_count=1,
                 multi_row_true_output=json_rows([]), empty_object_output=json_rows([{}]),
                 zero_root_instances='not_checked; distinct from a present empty root array/object'),
        ]
    if slug == SLUGS[2]:
        doc = load(slug, 'document.json')
        manual = load(slug, 'manual-schema.json')
        stripped = {k:v for k,v in doc.items() if k not in ('when', 'tags')}
        scalar_doc = {'rows': [{'id':9007199254740993,'code':'x'}]}
        return [
            case('nested', tree(stripped), auto_structure=True, nested_containers='details object and parts array inside repeated records'),
            case('manual-strict', dict(tree(manual['valid']),declared_schema=manual['nodes']), nodes=manual['nodes'], strict=True,
                 mismatch=dict(input=manual['mismatch'], outcome='native error, no successful partial output; message not invented'),
                 strict_false_input=manual['strict_false_probe'], strict_false_output=tree({'rows':[{'id':0,'code':'x'}]})),
            case('forced-root', tree([scalar_doc]), root_mode='always_array', other_state=dict(root_mode='always_not_array', output=tree(scalar_doc))),
            case('dates', tree({'when':doc['when']}, {'/when':'datetime'}), date_format='YYYY-MM-DDThh:mm:ss.zzz', timezone='none; milliseconds exact'),
            case('siblings', tree({k:v for k,v in doc.items() if k != 'when'}), preserve_each_array=True),
            case('file', tree(doc, {'/when':'datetime'}), source='admitted UTF-8 document.json file, not inline reconstruction', date_format='YYYY-MM-DDThh:mm:ss.zzz'),
        ]
    f = load(slug, 'input.json')
    d, labels = f['document'], f['labels']
    rows = [dict(batch=d['batch'], code=item['code'], qty=item['qty']) for item in d['items']]
    columns = [dict(name=k, label_any=True, type=t) for k,t in [('batch','string'),('code','string'),('qty','integer')]]
    indexed = [dict(item_index=i, **r) for i,r in enumerate(rows, start=f['index_base_proposal'])]
    composite = [{'items_code':r['code'],'items_qty':r['qty']} for r in rows]
    wide_names = ['f' + str(i).zfill(2) for i in range(f['wide_fields'])]
    wide = {k:i for i,k in enumerate(wide_names)}
    local_rows = [(g['group'],item['code'],i) for g in f['grouped_document']['groups'] for i,item in enumerate(g['items'],start=f['index_base_proposal'])]
    # Native TreeToData has one global index leaf per array and no per-parent index (wizard observation, LAB-1112).
    global_rows = [dict(group=g,code=code,global_index=global_i)
                   for global_i,(g,code,_i) in enumerate(local_rows,start=f['index_base_proposal'])]
    return [
        case('indices', table([dict(name='item_index',name_any=True,label_any=True,type='integer'),*columns], indexed),
             global_index_paths=['/items'], index_base=f['index_base_proposal'], global_index_proposal='zero-based across all items, not reset for a new parent',
             global_output=table([dict(name='group',label_any=True,type='string'),dict(name='code',label_any=True,type='string'),
                                  dict(name='global_index',name_any=True,label_any=True,type='integer')],global_rows),
             index_metadata='native generated names need readback; no UI row index substitution'),
        case('composite', table([dict(name='items_code',label='Позиции.Код',type='string'),dict(name='items_qty',label='Позиции.Количество',type='integer')], composite),
             composite_names=True, composite_labels=True, label_separator='.',
             native_name_and_separator_status='technical name spelling and inclusion of Root pending native observation'),
        case('wide', table([dict(name=k,label_any=True,type='integer') for k in wide_names], [wide]), selected_field_count=f['wide_fields'], tree_input={'rows':[wide]}),
        case('siblings', table([*columns,dict(name='tag',label_any=True,type='string')],
             [dict(**r,tag=t['tag']) for r in rows for t in d['tags']]), multiplication=f['sibling_policy_proposal']),
    ]


def result(slug):
    cases = proposals(slug)
    # Sanity checks protect the independent arithmetic, not native behavior.
    assert len({c['id'] for c in cases}) == len(cases)
    if slug == SLUGS[0]:
        assert [n['value'] for n in cases[0]['output']['document']['children'][0]['children'][0]['children'] if n['path'].endswith('/Qty')] == ['2']
    if slug == SLUGS[3]:
        assert len(cases[2]['output']['columns']) == 70
        assert len(cases[3]['output']['rows']) == 6
    limits = None
    if slug == SLUGS[2]:
        bounds = load(slug,'limits.json')['limits']
        assert bounds == dict(max_nodes=256,max_depth=16,max_bytes=1048576)
        at_nodes = {'rows':[{'x':0} for _ in range(127)]}
        over_nodes = dict(at_nodes, extra=0)
        def size(v):
            return 1+sum(size(x) for x in (v.values() if isinstance(v,dict) else v if isinstance(v,list) else []))
        def deep(depth):
            v=0
            for i in reversed(range(depth)):
                v={'n'+str(i):v}
            return v
        assert size(at_nodes)==256 and size(over_nodes)==257
        limits=dict(nodes_at_256=dict(recipe='rows = 127 objects with x=0',count=size(at_nodes)),
                    nodes_over_257=dict(recipe='same rows plus root extra=0',count=size(over_nodes),outcome='refusal; no truncation'),
                    depth_at_16=tree(deep(16)),depth_over_17=dict(input=deep(17),outcome='refusal; no truncation'),
                    input_bytes=dict(encoding='UTF-8',at=1048576,over=1048577,recipe='Pad one JSON string with ASCII x to exact encoded input bytes; never change limits.',
                                     distinction='Reader response JSON has independent 1 MiB bound and can overflow before input. Source-byte acceptance is not proof of reader-byte acceptance.'))
    return dict(status='PROPOSAL; owner decision and native data probes required before implementation',
                package_path='{{PACKAGE_PATH}}', node=slug, limits=dict(max_nodes=256,max_depth=16,max_bytes=1048576),
                acceptance='Existing typed main/CSV/Save/cold/cleanup standard; new comparisons require owner approval.',
                cases=cases,**({'boundary_proposals':limits} if limits else {}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--node', choices=SLUGS)
    args = parser.parse_args()
    for slug in (args.node,) if args.node else SLUGS:
        output = result(slug)
        target = NODES / slug / 'acceptance/modes/expected.json'
        text = json.dumps(output, ensure_ascii=False, indent=2) + '\n'
        if args.check:
            assert target.read_text(encoding='utf-8') == text, str(target)
        else:
            target.write_text(text, encoding='utf-8')
        print(slug + ': ' + str(len(output['cases'])) + ' independent proposals; native not_checked')
