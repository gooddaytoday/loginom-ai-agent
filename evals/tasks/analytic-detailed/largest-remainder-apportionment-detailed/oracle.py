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
pools={r['pool_id']:int(r['units']) for r in read('apportion_pools.csv')}
weights=defaultdict(list)
for r in read('apportion_weights.csv'): weights[r['pool_id']].append((r['recipient_id'],Fraction(r['weight'])))
with (HERE/'oracle.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f,lineterminator='\n')
    w.writerow(['pool_id','recipient_id','quota','base_units','extra_unit','allocated_units'])
    for pool,people in sorted(weights.items()):
        total=sum((weight for _,weight in people),Fraction(0))
        quotas={person:Fraction(pools[pool])*weight/total for person,weight in people}
        bases={person:q.numerator//q.denominator for person,q in quotas.items()}
        leftover=pools[pool]-sum(bases.values())
        priority=sorted(quotas,key=lambda person:(-(quotas[person]-bases[person]),person))
        winners=set(priority[:leftover])
        assert sum(bases[p]+int(p in winners) for p in quotas)==pools[pool]
        for person in sorted(quotas):
            extra=int(person in winners)
            w.writerow([pool,person,fmt(quotas[person]),bases[person],extra,bases[person]+extra])
