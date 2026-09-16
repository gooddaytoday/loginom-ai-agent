"""Independent declared sales goal: decimal arithmetic and fixed graph semantics."""
import csv
import hashlib
import io
import re
from collections import defaultdict
from decimal import Decimal
from sales_upload_probe import FIXTURE_SHA

NAMES={'Product':('По товарам','Рейтинг товаров'),'Region':('По регионам','Рейтинг регионов')}
COLUMNS=[dict(name=n,label=n,type=t,data_kind='Дискретный' if t=='string' else 'Непрерывный')
         for n,t in [('Id','integer'),('Product','string'),('Region','string'),('Quantity','integer'),('UnitPrice','real'),('Revenue','real')]]

def sales_rows(source):
    if hashlib.sha256(source).hexdigest()!=FIXTURE_SHA:raise ValueError('sales_fixture_sha')
    raw=list(csv.DictReader(io.StringIO(source.decode('utf-8'))))
    rows=[[int(r['Id']),r['Product'],r['Region'],int(r['Quantity']),r['UnitPrice'],str(Decimal(r['Quantity'])*Decimal(r['UnitPrice']))] for r in raw]
    return COLUMNS,rows

def branch_rows(source,key):
    columns,rows=sales_rows(source);index=[c['name'] for c in columns].index(key);groups=defaultdict(Decimal)
    for row in rows:groups[row[index]]+=Decimal(row[-1])
    return [dict(name=key,label=key,type='string',data_kind='Дискретный'),dict(name='Total',label='Total',type='real',data_kind='Непрерывный')], [[k,str(v)] for k,v in sorted(groups.items(),key=lambda item:(-item[1],item[0]))]

def branch_key(request,results):
    rb=results[request['operation_id']]['configuration']['readback']
    if request['mode']=='keys':key=rb['keys'][1]['name']
    else:key=rb['group_by'][0]['name']
    if key not in NAMES:raise ValueError('sales_branch_key')
    return key

def sales_graph(requests):
    nodes=[r['target']['label'] for r in requests];ports=[];links=[]
    for r,label in zip(requests,nodes):
        tid=re.sub(r'\s','_',label).replace(',','')
        if r['target']['type']=='imports.text':suffixes=['Input_Connection[0]','Input_Var[0]','Output_Data[0]']
        elif r['target']['type']=='transform.calculator':suffixes=['Input_Data[0]','Input_Var[0]','Output_Data[0]']
        else:suffixes=['Input_Data[0]','Output_Data[0]']
        ports.append(dict(node_label=tid,tids=[tid+';'+s for s in suffixes]))
        parent='Продажи' if label=='Выручка' else 'Выручка' if label in ('По товарам','По регионам') else next((v[0] for v in NAMES.values() if label==v[1]),None)
        if parent:links.append(re.sub(r'\s','_',parent)+'|Output_Data[0]|'+tid+'|Input_Data[0]')
    return dict(nodes=sorted(re.sub(r'\s','_',n).replace(',','') for n in nodes),ports=sorted(ports,key=lambda p:p['node_label']),links=sorted(links))

def verify_sales_goal(initial,reopened,results,source):
    failures=[]
    def need(condition,name):
        if not condition:failures.append(name)
    try:
        sales_rows(source)
        seed,calc,*branches=initial
        need(len(initial)==6 and len(reopened)==2,'six_nodes_two_reexecutions')
        need(all(r['target']['kind']=='new' and r['finish']=='execute' and r['read']['ports']==[0] and r['read']['sample_rows']>=(10 if r['mode'] in ('delimited','expression') else 4) and r['read']['require_exact_numbers'] is True for r in initial),'new_nodes_full_read')
        need((seed['target']['type'],seed['target']['label'],seed['mode'])==('imports.text','Продажи','delimited'),'sales_import')
        settings=seed['parameters']['settings']
        need([{k:v for k,v in c.items() if k!='source_name' or v!=c.get('name')} for c in settings['columns']]==[dict(c,used=True) for c in COLUMNS[:5]],'sales_import_columns')
        need(settings['format']==dict(delimiter=',',text_qualifier='"',decimal_separator='.',null_marker='\\N'),'sales_import_format')
        need(all(settings['source'].get(k)==v for k,v in dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True).items()),'sales_import_options')
        need(seed['inputs']==[],'sales_import_inputs')
        need((calc['target']['type'],calc['target']['label'],calc['mode'])==('transform.calculator','Выручка','expression'),'sales_calculator')
        need(calc['inputs']==[dict(source=results[seed['operation_id']]['node'],input=0,output=0)],'sales_calculator_source')
        expressions=results[calc['operation_id']]['configuration']['readback']['expressions']
        need(len(expressions)==1 and expressions[0]['name']=='Revenue' and expressions[0]['type']=='real' and expressions[0]['replace'] is False,'sales_single_revenue')
        formula=re.sub(r'\s','',expressions[0]['formula'])
        need(formula in ('Quantity*UnitPrice','UnitPrice*Quantity'),'sales_revenue_formula')
        active=[f for f in results[calc['operation_id']]['configuration']['readback']['output_mapping']['fields'] if not f['excluded']]
        need([f['name'] for f in active]==[c['name'] for c in COLUMNS],'sales_calculator_field_order')
        seen=set();sorted_nodes={}
        for group,sort in (branches[:2],branches[2:]):
            key=group['parameters']['group_by'][0]['name'];need(key in NAMES and key not in seen,'sales_two_distinct_branches');seen.add(key)
            need((group['target']['type'],group['target']['label'],group['mode'])==('transform.group_data',NAMES[key][0],'aggregate'),'sales_group_target')
            need(group['parameters']==dict(group_by=[dict(kind='input_field',name=key)],measures=[dict(field=dict(kind='input_field',name='Revenue'),function='sum',name='Total',label='Total')]),'sales_group_settings')
            need(group['inputs']==[dict(source=results[calc['operation_id']]['node'],input=0,output=0)],'sales_group_source')
            need((sort['target']['type'],sort['target']['label'],sort['mode'])==('transform.sorting',NAMES[key][1],'keys'),'sales_sort_target')
            need(sort['parameters']==dict(keys=[dict(field=dict(kind='input_field',name='Total'),direction='DESC'),dict(field=dict(kind='input_field',name=key),direction='ASC',case_sensitive=True)],compare_with_locale=False),'sales_sort_settings')
            need(sort['inputs']==[dict(source=results[group['operation_id']]['node'],input=0,output=0)],'sales_sort_source')
            sorted_nodes[key]=results[sort['operation_id']]['node']
        need(len({r['node']['node_id'] for r in (results[q['operation_id']] for q in initial)})==6,'sales_unique_node_ids')
        keys=[]
        for r in reopened:
            key=branch_key(r,results);keys.append(key)
            need(r['target']['kind']=='existing' and r['target']['type']=='transform.sorting' and r['target']['ref']['node_id']==sorted_nodes[key]['node_id'],'sales_restored_sort_identity')
            need(r['parameters']=={} and r['mappings']==[] and r['inputs']==[] and r['finish']=='execute','sales_unchanged_reexecution')
            need(r['read']['sample_rows']>=4 and r['read']['require_exact_numbers'] is True,'sales_reexecution_full_read')
        need(set(keys)==set(NAMES),'sales_both_branches_reexecuted')
    except (KeyError,TypeError,ValueError,IndexError):failures.append('sales_malformed_goal')
    return dict(passed=not failures,failures=sorted(set(failures)))
