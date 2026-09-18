"""Independent primary-corpus calculations from reviewed CSV/node choices.

This does not accept business completeness or simulate a Loginom scenario for
the model. Unsupported choices stop the operator audit for explicit review.
"""
import argparse
from decimal import Decimal
from functools import cmp_to_key
import hashlib
import json
from pathlib import Path

from audit_sales_scenario import require
from corpus_oracles import read_rows
from budget_audit_expectations import aggregate
from audit_scalar_expression import parse_expression, evaluate_expression


def portfolio_filter(row, groups):
    require(isinstance(groups,list) and groups and all(isinstance(g,list) and g for g in groups), 'Explicit nonempty filter groups required')
    def condition(c):
        require(c['field']['kind']=='input_field' and c['type'] in ('integer','real')
                and set(c)=={'field','type','operator','value'}, 'Portfolio numeric comparison audit required')
        name=c['field']['name'];require(name in row and isinstance(row[name],Decimal), 'Filter source differs')
        left,right=row[name],Decimal(str(c['value']));operator=c['operator']
        require(operator in ('=','<>','<','<=','>','>='), 'Unreviewed filter operator')
        return {'=':lambda:left==right,'<>':lambda:left!=right,'<':lambda:left<right,'<=':lambda:left<=right,'>':lambda:left>right,'>=':lambda:left>=right}[operator]()
    # Evaluate every predicate, including branches that would short-circuit, so
    # unsupported clauses cannot silently escape the operator's review.
    return any([all([condition(c) for c in group]) for group in groups])


def unpivot_integer_fields(rows, parameters, columns, keys):
    """Reviewed homogeneous integer Collapse, preserving zeros and exact roles.

    Loginom 7.4.2 integer DataTypes=4 is independently recorded in
    collapse/audit_wide.py; mixed/variant/null inputs remain outside this audit.
    """
    require(set(parameters)=={'information','transposed','ignore_empty'}
            and type(parameters['ignore_empty']) is bool, 'Explicit Collapse roles and empty policy required')
    roles=parameters['information']+parameters['transposed']
    require(all(set(f)=={'kind','name'} and f['kind']=='input_field' for f in roles), 'Unsupported Collapse role reference')
    information=[f['name'] for f in parameters['information']]
    transposed=[f['name'] for f in parameters['transposed']]
    require(transposed and len(set(information+transposed))==len(roles)
            and set(keys)<=set(information), 'Unique Collapse roles must retain row identity')
    definitions={c['name']:c for c in columns}
    require(set(information+transposed)<=definitions.keys()
            and all(definitions[n]['type']=='integer' for n in transposed), 'Only reviewed integer Collapse is supported')
    result=[]
    for row in rows:
        for name in transposed:
            value=row[name]
            require(isinstance(value,Decimal) and value.is_finite() and value==value.to_integral_value(), 'Null/variant Collapse needs separate audit')
            result.append({**{k:row[k] for k in information},'Names':name,
                           'DisplayNames':definitions[name].get('label',name),'Values':value,'DataTypes':Decimal(4)})
    return result,keys+['Names']


def build_tabular_expectations(dataset, plan):
    require(plan['task'] in (19,21,34,38) and plan['operator_reviewed'] is True, 'Reviewed primary tabular plan required')
    source = read_rows(dataset)
    if plan['task']==21:
        names = {'loan_id','customer_age','loan_amount','credit_score','annual_income','default_risk_score','loan_term_months','collateral_value'}
        identifier,count,string_fields='loan_id',300,set()
    elif plan['task']==19:
        names={'campaign_id','channel','budget','impressions','clicks','conversions','revenue','target_audience','duration_days','ctr','conversion_rate','roi'}
        identifier,count,string_fields='campaign_id',500,{'channel','target_audience'}
    elif plan['task']==34:
        names={'order_id','has_electronics','has_clothing','has_books','has_home','has_sports','total_items','order_value','returned'}
        identifier,count,string_fields='order_id',500,set()
        require(all(r[n] in ('0','1') for r in source for n in names if n.startswith('has_') or n=='returned'), 'Binary basket flags required')
    else:
        names={'customer_id','cohort','cohort_month','acquisition_month',*[f'm_{i}' for i in range(1,13)]}
        identifier,count,string_fields='customer_id',596,{'cohort','acquisition_month'}
        require(len({r['cohort'] for r in source})==6 and all(r[f'm_{i}'] in ('0','1') for r in source for i in range(1,13)), 'Six cohorts and binary monthly activity required')
    require(len(source)==count and set(source[0])==names and len({r[identifier] for r in source})==count, 'Reviewed source shape differs')
    nodes = {n['id']:n for n in plan['expected_graph']['nodes']}
    materialized, identities, tables = {}, {}, {}
    for operation in plan['model_operations_for_review']:
        node = operation['node_id'];kind = nodes[node]['type'];p = operation['parameters']
        require((node,0) not in materialized, 'Repeated node edits require independent audit review')
        require(all(m.get('direction')=='output' and m.get('port')==0 and set(m)<= {'direction','port','autosync'}
                    and ('autosync' not in m or type(m['autosync']) is bool) for m in operation['mappings'])
                and len(operation['mappings'])<=1, 'Explicit portfolio mappings require independent review')
        if kind=='exports.text':continue
        if kind=='imports.text':
            # The public import contract defaults source_name to name. Resolve
            # only that default; an explicit source identity must stay intact.
            columns = [dict(c, source_name=c.get('source_name', c['name'])) for c in p['settings']['columns']]
            require(len(columns)==len(names) and {c['source_name'] for c in columns}==names
                    and len({c['name'] for c in columns})==len(names) and all(c.get('used',True) for c in columns), 'All reviewed source fields required')
            for c in columns:
                require(c['type']=='string' if c['source_name'] in string_fields else c['type'] in ('integer','real'), 'Reviewed import type differs')
                require(c['source_name']!='default_risk_score' or c['type']=='real', 'Risk score must remain real')
                if c['type']=='integer':require(all(Decimal(r[c['source_name']])==Decimal(r[c['source_name']]).to_integral_value() for r in source), 'Fractional input imported as integer')
            rows = [{c['name']:r[c['source_name']] if c['type']=='string' else Decimal(r[c['source_name']]) for c in columns} for r in source]
            keys = [c['name'] for c in columns if c['source_name']==identifier]
        else:
            links = [e for e in plan['expected_graph']['links'] if e['target']==node]
            require(len(links)==1 and links[0]['input']==0 and links[0]['output'] in (0,1), 'Single table input required')
            parent = links[0]['source'];rows = [dict(r) for r in materialized[parent,links[0]['output']]];keys = identities[parent]
            if kind=='transform.collapse_columns':
                require(plan['task']==38 and nodes[parent]['type']=='imports.text', 'Only reviewed direct cohort-import Collapse supported')
                imported=next(o for o in plan['model_operations_for_review'] if o['node_id']==parent)
                rows,keys=unpivot_integer_fields(rows,p,imported['parameters']['settings']['columns'],keys)
            elif kind=='transform.calculator':
                expressions = p['expressions'];order = p.get('order',[e['name'] for e in expressions])
                require(len(order)==len(expressions) and set(order)=={e['name'] for e in expressions}, 'Complete unique calculator order required')
                for name in order:
                    expression = next(e for e in expressions if e['name']==name)
                    require(expression['target']['kind']=='new' and expression['replace'] is False
                            and expression['type'] in ('string','integer','real'), 'Unsupported portfolio expression update')
                    tree = parse_expression(expression['formula'])
                    for row in rows:
                        require(name not in row, 'Portfolio expression overwrites an input')
                        value = evaluate_expression(tree,row)
                        require(isinstance(value,str) if expression['type']=='string' else isinstance(value,Decimal) and value.is_finite(), 'Expression output type differs')
                        if expression['type']=='integer':require(value==value.to_integral_value(), 'Fractional integer expression')
                        row[name] = value
            elif kind=='transform.group_data':rows,keys = aggregate(rows,p)
            elif kind=='transform.filter_data':
                selected=[portfolio_filter(row,p['groups']) for row in rows]
                materialized[node,1]=[row for row,keep in zip(rows,selected) if not keep]
                rows=[row for row,keep in zip(rows,selected) if keep]
            elif kind=='transform.sorting':
                require(all(isinstance(r[k['field']['name']],Decimal) for r in rows for k in p['keys']), 'String collation requires explicit audit')
                def compare(a,b):
                    for key in p['keys']:
                        field = key['field']['name'];direction = key['direction']
                        require(direction in ('ASC','DESC'), 'Unknown sort direction')
                        difference = (a[field]>b[field])-(a[field]<b[field])
                        if difference:return difference if direction=='ASC' else -difference
                    return 0
                rows.sort(key=cmp_to_key(compare))
            else:raise ValueError('Unsupported portfolio audit node: '+kind)
        materialized[node,0],identities[node] = rows,keys
        for output in [o for o in plan['outputs'] if o['node_id']==node]:
            if output.get('configuration_only'):
                require(output.get('audit_role')=='intermediate' and output.get('read_omission_reason')
                        and output.get('covered_by') and kind!='imports.text', 'Explicit intermediate audit scope required')
                continue
            require(output['port'] in ((0,1) if kind=='transform.filter_data' else (0,)) and not output.get('configuration_only'), 'Portfolio output differs')
            output_rows=materialized[node,output['port']]
            fields = {f['name']:f['type'] for f in output['schema']}
            require(all(r.keys()==fields.keys() for r in output_rows), 'Computed portfolio fields differ')
            tables[output['name']] = dict(fields=fields,keys=keys,port=output['port'],
                rows=[{k:str(v) if isinstance(v,Decimal) else v for k,v in r.items()} for r in output_rows],
                sorting=[dict(name=k['field']['name'],direction=k['direction']) for k in p['keys']] if kind=='transform.sorting' else [])
    require(tables,'No portfolio tables')
    return dict(operator_reviewed=False,task=plan['task'],run_id=plan['run_id'],dataset_sha256=hashlib.sha256(dataset.read_bytes()).hexdigest(),tables=tables,
                review_required=['Verify saved configuration, graph, persistence and original task coverage separately.',
                                 'Review segment definitions and evidence for recommendations; calculated associations do not establish causes.',
                                 {21:'Risk scores are not observed default rates.',19:'Channel ROI/CTR/conversion require ratios of sums; dates and current-campaign flags are absent.',
                                  34:'Directional co-purchase probabilities have different denominators; association is not causal uplift.',
                                  38:'Review cohort denominators, all monthly columns and weighted versus unweighted mean retention.'}[plan['task']]])


def build_portfolio_expectations(dataset, plan):
    require(plan['task']==21, 'Portfolio task required')
    return build_tabular_expectations(dataset,plan)


def build_campaign_expectations(dataset, plan):
    require(plan['task']==19, 'Campaign task required')
    return build_tabular_expectations(dataset,plan)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    for name in ['dataset','plan','out']:parser.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args();result=build_tabular_expectations(args.dataset,json.loads(args.plan.read_text()))
    with args.out.open('x') as stream:json.dump(result,stream,ensure_ascii=False,indent=2)
