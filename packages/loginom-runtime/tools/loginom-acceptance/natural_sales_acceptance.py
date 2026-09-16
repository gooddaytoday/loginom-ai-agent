"""Independent audit of the unchanged natural sales request, with no fixed node labels."""
import csv,io,json,re,sys,hashlib
from pathlib import Path
from decimal import Decimal
from collections import defaultdict
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'tools/loginom-acceptance'))
from evidence import PREFIX
from node_configuration_evidence import verify_configuration_readback
from import_output_evidence import verify_text_import_output
from artifact_delivery_evidence import verify_delivered_import_output
from calculator_configuration_evidence import verify_calculator_configuration
from calculator_output_evidence import verify_calculator_output
from grouping_configuration_evidence import verify_grouping_configuration
from grouping_output_evidence import verify_grouping_output
from sorting_configuration_evidence import verify_sorting_configuration
from sorting_output_evidence import verify_sorting_output
from node_public_acceptance_evidence import verify_public_nodes_and_saves
from node_apply_reopen_binding import verify_reopen_binding
from natural_sales_save_evidence import verify_checkpoint_schedule

def described_save_contracts(tools):
 contracts=[]
 for tool in tools:
  if tool.get('tool')!=PREFIX+'dock_action_describe':continue
  result=tool.get('result',{})
  actions=result.get('actions',[result['action']] if 'action' in result else [])
  if not isinstance(actions,list) or 'actions' in result and 'action' in result:raise ValueError('ambiguous_action_description')
  for action in actions:
   if action.get('action_key')=='package.save_as':
    contract=dict(action=action,session_manifest=result['session_manifest'])
    if contract not in contracts:contracts.append(contract)
 return contracts

def oracle(source):
 rows=list(csv.DictReader(io.StringIO(source.decode('utf-8')),delimiter=';'))
 if not rows or set(rows[0])!={'id','region','product','quantity','price'}:raise ValueError('input_schema')
 totals={k:defaultdict(Decimal) for k in ('product','region')}
 for r in rows:
  r['revenue']=Decimal(r['quantity'])*Decimal(r['price'])
  for k in totals:totals[k][r[k]]+=r['revenue']
 return rows,{k:sorted(v.items(),key=lambda t:(-t[1],t[0])) for k,v in totals.items()}

def audit(request,e,source,prompt,user_prompt,final_answer):
 checks={}
 def check(k,v,**details):checks[k]={'passed':bool(v),**details}
 def need(v,m):
  if not v:raise ValueError(m)
 def columns(result):return [{k:c[k] for k in ('name','label','type','data_kind')} for c in result['output']['ports'][0]['schema']]
 def report():return dict(passed=bool(checks) and all(c['passed'] for c in checks.values()),checks=checks,scope='natural_sales_description_and_dataset',sample_limit='Import/calculator individual cells are sampled (up to 10/12); both aggregate rankings must be complete.')
 try:
  rows,totals=oracle(source);events=e['events'];usage=e['process']['usage']
  check('model',usage['provider']=='openai-codex' and usage['model']=='gpt-5.6-sol' and request['reasoning_effort']=='low' and request['fallback_allowed'] is False and usage['completed'] is True and usage['failed'] is False)
  check('source_unchanged',e['runtime_source_unchanged'] and e['harness_unchanged'])
  check('auth_guard',e['auth_guard']['installed'] is True and e['auth_guard']['blocked_attempts']==0)
  check('source_attachment',hashlib.sha256(source).hexdigest()==request['input_artifact']['sha256'])
  expected_prompt=user_prompt.rstrip()+'\n\n<attachment filename="sales.csv">\n'+source.decode().rstrip()+'\n</attachment>\n'
  check('natural_prompt',prompt==expected_prompt and hashlib.sha256(prompt.encode()).hexdigest()==request['prompt_sha256'])
  declarations=[r['request'] for r in events if r.get('phase')=='node_apply_prepared']
  checkpoints=[r for r in events if r.get('phase')=='node_checkpoint'];results={r['operation_id']:r['result'] for r in checkpoints}
  check('unique_completed_operations',len(results)==len(checkpoints) and len({r['operation_id'] for r in declarations})==len(declarations) and all(r['operation_id'] in results for r in declarations))
  new=[r for r in declarations if r['target']['kind']=='new'];existing=[r for r in declarations if r['target']['kind']=='existing']
  seed=next(r for r in new if r['target']['type']=='imports.text');calc=next(r for r in new if r['target']['type']=='transform.calculator')
  seed_result=results[seed['operation_id']];calc_result=results[calc['operation_id']]
  checks['import_configuration']=verify_configuration_readback(events,seed);checks['import_output']=verify_text_import_output(events,seed,source)
  deliveries=[t['result'] for t in e['tools'] if t.get('tool')==PREFIX+'dock_artifact_deliver' and isinstance(t.get('result'),dict)]
  check('one_delivery',len(deliveries)==1)
  if len(deliveries)==1:checks['delivered_exact_bytes']=verify_delivered_import_output(events,seed,source,deliveries[0],request['runtime_source_pin']['client_revision'])
  checks['calculator_configuration']=verify_calculator_configuration(events,calc)
  expr=calc_result['configuration']['readback']['expressions'];need(len(expr)==1,'one_revenue_expression');expr=expr[0]
  check('revenue_formula',re.sub(r'\s','',expr['formula']) in ('quantity*price','price*quantity'))
  check('calculator_source',calc['inputs']==[dict(source=seed_result['node'],output=0,input=0)])
  cols=columns(calc_result);need(len(cols)==6 and {c['name'] for c in cols}=={'id','region','product','quantity','price',expr['name']},'calculator_fields')
  values=[[str(r['revenue']) if c['name']==expr['name'] else int(r['id']) if c['name']=='id' else r[c['name']] for c in cols] for r in rows]
  checks['calculator_values']=verify_calculator_output(events,calc,cols,values)
  groups=[r for r in new if r['target']['type']=='transform.group_data'];sorts=[r for r in new if r['target']['type']=='transform.sorting']
  check('six_nodes_two_branches',len(new)==6 and len(groups)==len(sorts)==2)
  need(len(groups)==len(sorts)==2,'both_complete_branches')
  branch_info={};used_keys=set()
  for g in groups:
   key=g['parameters']['group_by'][0]['name'];need(key in totals and key not in used_keys,'distinct_group_keys');used_keys.add(key)
   gr=results[g['operation_id']];gc=columns(gr)
   measures=g['parameters']['measures'];need(len(measures)==1,'one_revenue_measure');m=measures[0]
   check(key+'_group_semantics',g['parameters']['group_by']==[{'kind':'input_field','name':key}] and m['function']=='sum' and m['field']=={'kind':'input_field','name':expr['name']} and g['inputs']==[dict(source=calc_result['node'],output=0,input=0)])
   need(len(gc)==2 and {c['name'] for c in gc}=={key,m['name']},'group_schema')
   expected=[[k if c['name']==key else str(v) for c in gc] for k,v in totals[key]]
   checks[key+'_group_configuration']=verify_grouping_configuration(events,g);checks[key+'_group_values']=verify_grouping_output(events,g,gc,expected)
   s=next(r for r in sorts if r['inputs']==[dict(source=gr['node'],output=0,input=0)])
   sr=results[s['operation_id']];sc=columns(sr);need(sorted(sc,key=lambda c:c['name'])==sorted(gc,key=lambda c:c['name']),'sort_preserves_fields');expected=[[k if c['name']==key else str(v) for c in sc] for k,v in totals[key]]
   key0=sr['configuration']['readback']['keys'][0]
   check(key+'_descending_revenue',key0['name']==m['name'] and key0['direction']=='DESC')
   checks[key+'_sort_configuration']=verify_sorting_configuration(events,s);checks[key+'_ranking']=verify_sorting_output(events,s,sc,expected,expected)
   branch_info[key]=(s,expected,sc)
  saves=[r for r in events if r.get('phase')=='completed' and r.get('action_key') in ('package.save_as','package.save_checkpoint')]
  check('saved_package',bool(saves));need(bool(saves),'no_save')
  save=saves[-1];out=save['outcome'];path=out['output']['package_ref']['path'];trace=out['trace']
  described=described_save_contracts(e['tools'])
  need(len(described)==1,'one_save_contract');description=described[0]
  check('admitted_save_contract',description['action']['revision']=='2' and description['session_manifest']['actionManifestDigest']=='936ef73d933e85bfd8429b8b0f2b515c543ca415a2b22ba57e108232c54ddf44')
  roots=description['action']['effect']['allowed_roots']
  checks['intermediate_package_saves']=verify_checkpoint_schedule(events,declarations,roots,{'package.save_checkpoint':'2','package.save_as':'2'})
  check('currency_not_invented',bool(final_answer.strip()) and not re.search(r'₽|[$€£¥]|\b(?:RUB|USD|EUR|руб\w*|доллар\w*)\b',final_answer,re.I))
  check('final_reopen',save['action_key']=='package.save_as' and save['action_revision']=='2' and out['status']=='SUCCEEDED' and out['cleanup_complete'] is True and out['output']['reopened'] is True and any(path.startswith(root.rstrip('/')+'/') for root in roots) and path.endswith('.lgp'))
  identity=lambda label:re.sub(r'\s','_',label).replace(',','')
  ids={results[r['operation_id']]['node']['node_id']:identity(r['target']['label']) for r in new}
  nodes=[];ports=[];links=[]
  for r in new:
   label=ids[results[r['operation_id']]['node']['node_id']];nodes.append(label)
   suffix=['Input_Connection[0]','Input_Var[0]','Output_Data[0]'] if r is seed else ['Input_Data[0]','Input_Var[0]','Output_Data[0]'] if r is calc else ['Input_Data[0]','Output_Data[0]']
   ports.append(dict(node_label=label,tids=[label+';'+s for s in suffix]))
   for source in r['inputs']:links.append(ids[source['source']['node_id']]+'|Output_Data[0]|'+label+'|Input_Data[0]')
  graph=dict(nodes=sorted(nodes),ports=sorted(ports,key=lambda p:p['node_label']),links=sorted(links))
  names=['save_requested','saved_package_closed','package_open_command_ready','reopened_package_observed','postcondition_verified']
  selected=[]
  for name in names:
   found=[(i,t) for i,t in enumerate(trace) if t.get('event')==name];need(len(found)==1,'save_trace_'+name);selected.append(found[0])
  check('save_trace_order',[i for i,_ in selected]==sorted(i for i,_ in selected))
  observed=selected[-2][1];post=selected[-1][1]
  check('saved_reopened_full_graph',save['checkpoint']['graph']==graph and selected[0][1]['path']==path and observed['requested_path']==observed['actual_path']==path and observed['path_matches'] is True and observed['graph_matches'] is True and observed['graph']==post['graph']==graph and post['package_path']==path and post['reopened'] is True)
  checks['public_nodes_saves']=verify_public_nodes_and_saves(e,{r['operation_id']:r for r in declarations},[s['operation_id'] for s in saves],allow_validation_refusals=True)
  for key,(s,expected,sc) in branch_info.items():
   original=results[s['operation_id']]
   later=[r for r in existing if r['target']['ref']['node_id']==original['node']['node_id'] and r['target']['type']=='transform.sorting']
   check(key+'_verified_after_reopen',len(later)==1)
   if len(later)!=1:continue
   r=later[0];rr=results[r['operation_id']]
   checks[key+'_reopen_binding']=verify_reopen_binding(e,s,r,save['operation_id'],path,sorting=True)
   checks[key+'_reopened_configuration']=verify_sorting_configuration(events,r)
   rc=columns(rr);need(sorted(rc,key=lambda c:c['name'])==sorted(sc,key=lambda c:c['name']),'reopened_fields');rv=[[k if c['name']==key else str(v) for c in rc] for k,v in totals[key]]
   checks[key+'_reopened_ranking']=verify_sorting_output(events,r,rc,rv,rv)
   semantics=lambda result:{k:v for k,v in result['configuration']['readback'].items() if k not in ('node','receipt_ids')}
   a,b=semantics(original),semantics(rr);order_preserved=a==b
   for value in (a,b):
    for field in ('input_mapping','output_mapping'):
     value[field]=dict(value[field])
     if value[field]['autosync'] is True:value[field]['fields']=sorted([{k:v for k,v in f.items() if k!='index'} for f in value[field]['fields']],key=lambda f:f['name'])
   check(key+'_stable_output_columns',rc==sc and a['output_mapping']==b['output_mapping'] and b['output_mapping']['autosync'] is False)
   check(key+'_persisted_keys_and_field_definitions',a==b and original['execution']['execution_id']!=rr['execution']['execution_id'],column_order_preserved=order_preserved)
  check('journal_runtime',all(r.get('runtime_revision')==request['runtime_source_pin']['client_revision'] for r in events))
  result=report();result['package_path']=path;result['leaders']={k:[v[0][0],str(v[0][1])] for k,v in totals.items()};return result
 except (KeyError,TypeError,IndexError,ValueError,StopIteration) as error:
  checks['incomplete_or_invalid_evidence']={'passed':False,'reason':str(error),'type':type(error).__name__};return report()

if __name__=='__main__':
 p=Path(sys.argv[1]);e=json.loads((p/('evidence.json' if (p/'evidence.json').exists() else 'evidence-recovered.json')).read_text())
 result=audit(json.loads((p/'request.json').read_text()),e,(p/'sales.csv').read_bytes(),(p/'submitted-prompt.txt').read_text(),(p/'user-prompt.txt').read_text(),(p/'hermes-final.txt').read_text())
 (p/'natural-sales-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'passed':result['passed'],'checks':len(result['checks']),'failures':{k:v for k,v in result['checks'].items() if not v['passed']}},ensure_ascii=False))
 sys.exit(0 if result['passed'] else 1)
