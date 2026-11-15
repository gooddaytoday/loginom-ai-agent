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
families={r['family_id']:Fraction(r['alpha']) for r in read('bh_families.csv')}
groups=defaultdict(list)
for r in read('bh_tests.csv'): groups[r['family_id']].append((r['hypothesis_id'],Fraction(r['p_value'])))
with (HERE/'oracle.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f,lineterminator='\n')
    w.writerow(['family_id','hypothesis_id','p_value','bh_adjusted_p','reject_fdr'])
    for family,rows in sorted(groups.items()):
        ordered=sorted(rows,key=lambda r:(r[1],r[0])); m=len(ordered)
        adjusted={}; running=Fraction(1)
        for position in range(m-1,-1,-1):
            hypothesis,p=ordered[position]
            running=min(running,Fraction(m)*p/(position+1))
            adjusted[hypothesis]=running
        for hypothesis,p in sorted(rows):
            q=adjusted[hypothesis]
            w.writerow([family,hypothesis,fmt(p),fmt(q),int(q<=families[family])])
