from pathlib import Path
from fractions import Fraction
from decimal import Decimal, localcontext, ROUND_HALF_UP
import csv
from collections import defaultdict, Counter
HERE=Path(__file__).resolve().parent
def read(name):
    with (HERE/'data'/name).open(newline='',encoding='utf-8') as f: return list(csv.DictReader(f))
def fmt(x):
    if x is None: return ''
    with localcontext() as c:
        c.prec=50
        return format((Decimal(x.numerator)/Decimal(x.denominator)).quantize(Decimal('0.000001'),rounding=ROUND_HALF_UP),'f')
training=defaultdict(list); tests=defaultdict(list)
for r in read('mase_training.csv'): training[r['series_id']].append((int(r['t']),Fraction(r['value'])))
for r in read('mase_forecasts.csv'): tests[r['series_id']].append(r)
with (HERE/'oracle.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f,lineterminator='\n')
    w.writerow(['series_id','train_pairs','test_points','train_naive_mae','test_mae','mase','status'])
    for series,points in sorted(training.items()):
        points=sorted(points)
        diffs=[abs(b[1]-a[1]) for a,b in zip(points,points[1:])]
        scale=sum(diffs,Fraction(0))/len(diffs)
        errors=[abs(Fraction(r['actual'])-Fraction(r['predicted'])) for r in tests[series]]
        mae=sum(errors,Fraction(0))/len(errors)
        mase=None if scale==0 else mae/scale
        w.writerow([series,len(diffs),len(errors),fmt(scale),fmt(mae),fmt(mase),'undefined' if mase is None else 'ok'])
