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
groups=defaultdict(list)
for row in read('kappa_ratings.csv'): groups[row['site_id']].append(row)
with (HERE/'oracle.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f,lineterminator='\n')
    w.writerow(['site_id','items','observed_agreement','chance_agreement','kappa','status'])
    for site,rows in sorted(groups.items()):
        n=len(rows)
        a=Counter(r['rater_a'] for r in rows); b=Counter(r['rater_b'] for r in rows)
        observed=Fraction(sum(r['rater_a']==r['rater_b'] for r in rows),n)
        chance=sum((Fraction(a[c]*b[c],n*n) for c in 'ABC'),Fraction(0))
        kappa=None if chance==1 else (observed-chance)/(1-chance)
        w.writerow([site,n,fmt(observed),fmt(chance),fmt(kappa),'undefined' if kappa is None else 'ok'])
