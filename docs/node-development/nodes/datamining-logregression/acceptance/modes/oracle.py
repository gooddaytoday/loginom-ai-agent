#!/usr/bin/env python3
"""Independent proposed expectations. Stdlib only; no Loginom/runtime imports.

Log likelihood is a SUM. Intercept is unpenalized; slope penalty is
lambda_l1*abs(b) + lambda_l2*b*b/2. Inputs, not UI results, determine numbers.
Run with --check to compare authored JSON without modifying it.
"""
import argparse
import csv
import json
import math
from pathlib import Path
from statistics import NormalDist, mean, stdev

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def source(name):
    with (ROOT / 'fixtures' / name).open() as f:
        return [{k: None if v == '?' else float(v) if k in ('X','Weight') else
                 int(v) if k in ('RowID', 'Fold', 'Split') else v
                 for k, v in r.items()} for r in csv.DictReader(f)]


def sigmoid(z):
    return 1 / (1 + math.exp(-z))


def fit(rows, weighted=False):
    a = b = 0.0
    for _ in range(100):
        g0 = g1 = h00 = h01 = h11 = 0.0
        for r in rows:
            x, y, w = r['X'], int(r['Target'] == 'yes'), r['Weight'] if weighted else 1
            p = sigmoid(a + b*x)
            g0 += w*(y-p)
            g1 += w*x*(y-p)
            h00 += w*p*(1-p)
            h01 += w*x*p*(1-p)
            h11 += w*x*x*p*(1-p)
        det = h00*h11-h01*h01
        assert det > 0
        da, db = (h11*g0-h01*g1)/det, (h00*g1-h01*g0)/det
        a, b = a+da, b+db
        if max(abs(da), abs(db)) < 1e-13:
            return a, b
    raise AssertionError('nonconvergence')


def penalized(rows, l1=0, l2=0):
    # This symmetric fixture has intercept exactly zero and nonnegative slope.
    def score(b):
        return sum(r['X']*((r['Target']=='yes')-sigmoid(b*r['X'])) for r in rows)-l1-l2*b
    if score(0) <= 0:
        return 0.0, 0.0
    lo, hi = 0.0, 8.0
    assert score(hi) < 0
    for _ in range(100):
        mid = (lo+hi)/2
        if score(mid) > 0:
            lo = mid
        else:
            hi = mid
    return 0.0, (lo+hi)/2


def output(rows, coefficients, extras=()):
    a, b = coefficients
    fields = [('PredictionEvent','boolean'),('PredictionProbability','real'),
              ('ActualEvent','boolean'),('Target_predicted','string'),
              ('X','real'),('Target','string'),('RowID','integer'),('Note','string'), *extras]
    values = []
    for r in rows:
        p = sigmoid(a+b*r['X'])
        # Rational boundary avoids a fitted roundoff changing p >= threshold.
        if abs(p-.8) < 1e-13:
            p = .8
        yes = p >= .8
        values.append([yes,p,None if r['Target'] is None else r['Target']=='yes',
                       'yes' if yes else 'no',r['X'],r['Target'],r['RowID'],r['Note'],
                       *[r[k] for k, _ in extras]])
    return {'output_node_type':'datamining.log_regression','output_port':0,'ordered':True,'column_order':'exact',
            'columns':[{'name':n,'type':t,'label_any':True,
                        **({'tolerance':{'abs':1e-8,'rel':1e-10}} if t=='real' else {})}
                       for n,t in fields], 'rows':[dict(zip([n for n,_ in fields],r)) for r in values]}


def expectations():
    rows = source('train.csv')
    a,b = fit(rows)
    assert abs(a)<1e-12 and abs(b-math.log(3))<1e-12
    result = {}
    def table_case(name, data, coefficients, extras=()):
        result[name] = {'package_path':'{{PACKAGE_PATH}}',
                        'nodes':[{'type':t} for t in ['imports.text','datamining.log_regression','exports.text']],
                        'outputs':[output(data,coefficients,extras)]}
    table_case('apply',source('modes/holdout.csv'),(a,b))
    table_case('weights',source('modes/weighted.csv'),fit(source('modes/weighted.csv'),True),[('Weight','real')])
    wa,wb = fit(source('modes/weighted.csv'),True)
    assert abs(wa-math.log(3))<1e-12 and abs(wb-math.log(3))<1e-12
    for name,l1,l2 in [('ridge',0,1),('lasso',1,0),('elastic-net',1,1)]:
        table_case(name,rows,penalized(rows,l1,l2))
    normalized=source('modes/normalization.csv')
    na,nb=fit(normalized)
    assert abs(na+5*math.log(3))<1e-10 and abs(nb-math.log(3)/2)<1e-12
    table_case('normalization',normalized,(na,nb))
    partition=source('modes/partition.csv')
    for name in ['partition-sequential','partition-column']:
        table_case(name,partition,fit(partition[:32]),[('Split','integer'),('Fold','integer')])
    # Three identical blocks; sequential folds have identical MLEs. No PRNG copy.
    cv=source('modes/validation.csv')
    for k in range(3):
        ca,cb=fit([r for r in cv if r['Fold']!=k])
        assert abs(ca-a)<1e-12 and abs(cb-b)<1e-12
    table_case('validation-kfold',cv,(a,b),[('Fold','integer')])
    h00=sum(sigmoid(a+b*r['X'])*(1-sigmoid(a+b*r['X'])) for r in rows)
    h11=sum(r['X']**2*sigmoid(a+b*r['X'])*(1-sigmoid(a+b*r['X'])) for r in rows)
    se0,se1=1/math.sqrt(h00),1/math.sqrt(h11)
    z=NormalDist().inv_cdf(.975)
    fields=[('Name','string'),('DisplayName','string'),('UniqueValues','string'),
            *[(f'Target_{n}','real') for n in ['coefficients','stdError','wald','waldPValue','oddsRatio','lowerBound','upperBound']]]
    coeff=[['<Константа>',None,None,0,se0,0,1,None,None,None],
           ['X','X',None,b,se1,(b/se1)**2,math.erfc(abs(b/se1)/math.sqrt(2)),math.exp(b),math.exp(b-z*se1),math.exp(b+z*se1)]]
    result['coefficients']={'package_path':'{{PACKAGE_PATH}}',
        'nodes':[{'type':t} for t in ['imports.text','datamining.log_regression','exports.text']], 'outputs':[{
        'output_node_type':'datamining.log_regression','output_port':1,'ordered':True,'column_order':'exact',
        'columns':[{'name':n,'type':t,'label_any':True,**({'tolerance':{'abs':1e-7,'rel':1e-8}} if t=='real' else {})} for n,t in fields],
        'rows':[dict(zip([n for n,_ in fields],r)) for r in coeff]}]}
    # Owner decision v040-native-semantics-0711: port 1 uses standardized
    # factors regardless of denormalize. Derive everything from source X',
    # never from native observed coefficients. Port 0 remains the original fit.
    mu,sd=mean(r['X'] for r in normalized),stdev(r['X'] for r in normalized)
    za,zb=na+nb*mu,nb*sd
    standardized=[{**r,'X':(r['X']-mu)/sd} for r in normalized]
    fa,fb=fit(standardized)
    assert abs(fa-za)<1e-12 and abs(fb-zb)<1e-12
    h00=h01=h11=0.0
    for r in standardized:
        x=r['X'];p=sigmoid(za+zb*x);v=p*(1-p)
        h00+=v;h01+=x*v;h11+=x*x*v
    det=h00*h11-h01*h01
    s0,s1=math.sqrt(h11/det),math.sqrt(h00/det)
    norm_coeff=[['<Константа>',None,None,za,s0,(za/s0)**2,math.erfc(abs(za/s0)/math.sqrt(2)),None,None,None],
                ['X','X',None,zb,s1,(zb/s1)**2,math.erfc(abs(zb/s1)/math.sqrt(2)),math.exp(zb),math.exp(zb-z*s1),math.exp(zb+z*s1)]]
    norm_columns=json.loads(json.dumps(result['coefficients']['outputs'][0]['columns']))
    # New derived statistics propagate the established beta/SE error envelope.
    # In particular exp(beta+z*SE) amplifies absolute errors in both operands.
    # Existing expectations and prediction tolerances are unchanged.
    eps=1e-7
    derived={
        'wald':max(abs(((zb+eps)/(s1-eps))**2-(zb/s1)**2),abs(((zb-eps)/(s1+eps))**2-(zb/s1)**2)),
        'oddsRatio':math.exp(zb)*math.expm1(eps),
        'lowerBound':math.exp(zb-z*s1)*math.expm1((1+z)*eps),
        'upperBound':math.exp(zb+z*s1)*math.expm1((1+z)*eps)}
    for col in norm_columns:
        suffix=col['name'].removeprefix('Target_')
        if suffix in derived:
            col['tolerance']={'abs':max(eps,derived[suffix]),'rel':1e-8}
    result['normalization']['outputs'].append({**result['coefficients']['outputs'][0], 'columns':norm_columns,
        'rows':[dict(zip([n for n,_ in fields],r)) for r in norm_coeff]})
    # Cold retains the original exact field order; main has the independently
    # observed native order. Only columns move; values/types/tolerances do not.
    result['normalization/cold']=json.loads(json.dumps(result['normalization']))
    cols=result['normalization']['outputs'][0]['columns']
    result['normalization']['outputs'][0]['columns']=cols[:4]+[cols[6],cols[4],cols[5],cols[7]]
    dev=-2*sum(math.log(sigmoid(a+b*r['X']) if r['Target']=='yes' else 1-sigmoid(a+b*r['X'])) for r in rows)
    null=2*len(rows)*math.log(2);n=len(rows);p=2
    summary={'TotalSamples':n,'TotalSelectedSamples':n,'TrainSamples':n,
             'TrainRMSError':math.sqrt(sum(((r['Target']=='yes')-sigmoid(a+b*r['X']))**2 for r in rows)/n),
             'TrainClsErrorPercentage':100*sum((sigmoid(a+b*r['X'])>=.8)!=(r['Target']=='yes') for r in rows)/n,
             'TrainAvgCE':dev/(2*n*math.log(2)),'TrainThreshold':.8,
             'NullMinusTwoLogL':null,'MinusTwoLogL':dev,'R2':1-dev/null,
             'AdjustedR2':1-(dev+2*p)/null,'DFE':n-p,'ModelDF':p-1,'Chi2':null-dev,
             'AIC':(dev+2*p)/n,'AICc':(dev+2*p+2*p*(p+1)/(n-p-1))/n,
             'BIC':(dev+p*math.log(n))/n,'HQC':(dev+2*p*math.log(math.log(n)))/n,
             'ModelPValue':math.erfc(math.sqrt((null-dev)/2))}
    # RED proposal: ordinary misclassification is 25%, native returned 6.25%.
    # Preserve the independent result; do not silently bless the native value.
    result['summary']={'package_path':'{{PACKAGE_PATH}}',
        'nodes':[{'type':t} for t in ['imports.text','datamining.log_regression']],
        'outputs':[], 'variable_inventory':{'outputs':[{
            'node':{'type':'datamining.log_regression'},'port':2,'ordered':True,
            'variables':[{'name':k,'type':'integer' if isinstance(v,int) else 'real',
                          'value':v,**({'tolerance':{'abs':1e-7,'rel':1e-8}} if not isinstance(v,int) else {})}
                         for k,v in summary.items()]}]}}
    return result


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    values=expectations()
    for name,value in values.items():
        path=HERE/name/'expected.json'
        text=json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
        if args.check:
            assert path.read_text()==text, path
        else:
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(text)
    print(f'{len(values)} independent proposals: '+('checked' if args.check else 'written'))
