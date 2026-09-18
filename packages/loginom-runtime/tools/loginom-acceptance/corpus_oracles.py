"""Independent audit calculations. Never included in a Hermes task prompt."""
import csv
from collections import defaultdict
from datetime import date
from decimal import Decimal
from itertools import permutations


def read_rows(dataset):
    with dataset.open(newline='', encoding='utf-8-sig') as stream:
        return list(csv.DictReader(stream))


def grouped(rows, keys):
    groups = defaultdict(list)
    for row in rows:
        groups[tuple(row[key] for key in keys)].append(row)
    return groups


def total(rows, field):
    return sum((Decimal(row[field]) for row in rows), Decimal(0))


def ratio(numerator, denominator):
    return None if not denominator else str(Decimal(numerator) / Decimal(denominator))


def budget_variance(dataset):
    rows = read_rows(dataset)
    def summary(group):
        budget, actual = total(group, 'budgeted'), total(group, 'actual')
        percentages = [(Decimal(r['actual'])-Decimal(r['budgeted']))/Decimal(r['budgeted'])*100 for r in group]
        return dict(count=len(group), budget=str(budget), actual=str(actual), variance=str(actual-budget),
                    aggregate_variance_percent=ratio((actual-budget)*100, budget),
                    mean_exact_row_percent=str(sum(percentages)/len(group)),
                    mean_provided_rounded_percent=ratio(total(group, 'variance_pct'), len(group)))
    return dict(overall=summary(rows), tables={name: [dict(keys=list(key), **summary(group))
                for key, group in sorted(grouped(rows, keys).items())]
                for name, keys in {'categories':['category'], 'quarters':['quarter'],
                                  'category_quarters':['category','quarter'], 'departments':['department']}.items()})


def campaign_efficiency(dataset):
    rows = read_rows(dataset)
    def summary(group):
        budget, revenue = total(group, 'budget'), total(group, 'revenue')
        clicks, impressions, conversions = (total(group, k) for k in ('clicks','impressions','conversions'))
        return dict(count=len(group), budget=str(budget), revenue=str(revenue), clicks=str(clicks),
                    impressions=str(impressions), conversions=str(conversions),
                    roi_percent=ratio((revenue-budget)*100,budget), ctr_percent=ratio(clicks*100,impressions),
                    conversion_percent=ratio(conversions*100,clicks))
    return dict(overall=summary(rows), tables={name:[dict(keys=list(key), **summary(group))
                for key, group in sorted(grouped(rows, keys).items())]
                for name, keys in {'channels':['channel'],'audiences':['target_audience'],
                                  'channel_audiences':['channel','target_audience']}.items()},
                limitations=['Budget impact requires auditing the model-chosen comparison; aggregates alone do not establish causality.',
                             'Dataset has no campaign dates or active flag; period/current status cannot be independently filtered.'])


def cohort_retention(dataset):
    rows=read_rows(dataset); cohorts=grouped(rows,['cohort']); matrix=[]
    for (cohort,), group in sorted(cohorts.items()):
        for month in range(1,13):
            active=total(group,f'm_{month}')
            matrix.append(dict(cohort=cohort,month=month,customers=len(group),active=int(active),retention=ratio(active,len(group))))
    curve=[]
    for month in range(1,13):
        selected=[r for r in matrix if r['month']==month]
        curve.append(dict(month=month,weighted=ratio(sum(r['active'] for r in selected),len(rows)),
                          unweighted=str(sum(Decimal(r['retention']) for r in selected)/len(selected))))
    return dict(customers=len(rows),matrix=matrix,curve=curve)


def cross_sell(dataset):
    rows=read_rows(dataset); categories=['electronics','clothing','books','home','sports']; pairs=[]
    for source,target in permutations(categories,2):
        source_count=sum(int(r['has_'+source]) for r in rows)
        joint=sum(int(r['has_'+source])*int(r['has_'+target]) for r in rows)
        pairs.append(dict(source=source,target=target,source_orders=source_count,joint_orders=joint,
                          support=ratio(joint,len(rows)),confidence=ratio(joint,source_count)))
    baskets=defaultdict(list)
    for row in rows:baskets[sum(int(row['has_'+category]) for category in categories)].append(row)
    return dict(orders=len(rows),pairs=pairs,baskets=[dict(category_count=n,orders=len(group),
                mean_order_value=ratio(total(group,'order_value'),len(group))) for n,group in sorted(baskets.items())],
                limitations=['Order values include returned orders; alternate return treatment must be explicit and audited.'])


def loan_portfolio(dataset):
    rows=read_rows(dataset)
    fields=['loan_amount','annual_income','default_risk_score','collateral_value','customer_age','credit_score','loan_term_months']
    return dict(loans=len(rows),summary={field:dict(sum=str(total(rows,field)),mean=ratio(total(rows,field),len(rows)),
                minimum=str(min(Decimal(r[field]) for r in rows)),maximum=str(max(Decimal(r[field]) for r in rows))) for field in fields},
                limitations=['Age/income/risk bins are chosen by the model and must be independently checked for full non-overlapping coverage.'])


def sales_2024(dataset):
    totals = {name: defaultdict(Decimal) for name in ('categories', 'regions', 'category_regions')}
    source_rows = period_rows = 0
    with dataset.open(newline='', encoding='utf-8-sig') as stream:
        for row in csv.DictReader(stream):
            source_rows += 1
            if date.fromisoformat(row['date']).year != 2024:
                continue
            period_rows += 1
            amount = Decimal(row['total'])
            totals['categories'][(row['category'],)] += amount
            totals['regions'][(row['region'],)] += amount
            totals['category_regions'][(row['category'], row['region'])] += amount
    # Sorted tables express the requested revenue ranking without prescribing
    # whether the saved scenario also materializes a numerical rank column.
    tables = {name: [{'keys': list(keys), 'revenue': str(value)}
                     for keys, value in sorted(values.items(), key=lambda item: (-item[1], item[0]))]
              for name, values in totals.items()}
    return dict(source_rows=source_rows, period_rows=period_rows,
                revenue=str(sum(totals['categories'].values(), Decimal(0))), tables=tables)


def compare_revenue_table(actual, expected, *, ranked=False, tolerance=Decimal('0.0000001')):
    """Compare every normalized row, preserving duplicate/missing-row failures.

    Actual rows must come from the independent reopened package reader. This
    function does not infer persistence or verify the reader's binding itself.
    """
    def normalize(rows):
        result = []
        seen = set()
        for row in rows:
            key = tuple(row['keys'])
            if key in seen:
                raise ValueError('Duplicate result key')
            seen.add(key)
            amount = Decimal(str(row['revenue']))
            if not amount.is_finite():
                raise ValueError('Non-finite revenue')
            result.append((key, amount))
        return result
    tolerance=Decimal(tolerance)
    if not tolerance.is_finite() or tolerance<0 or tolerance>Decimal('0.000001'):
        raise ValueError('Revenue tolerance must be finite and at most one millionth')
    observed, reference = normalize(actual), normalize(expected)
    found,wanted=dict(observed),dict(reference)
    if found.keys()!=wanted.keys() or any(abs(found[key]-value)>tolerance for key,value in wanted.items()):
        raise ValueError('Complete revenue table differs')
    if ranked and any(left[1] < right[1] for left, right in zip(observed, observed[1:])):
        raise ValueError('Revenue ranking is not descending')
    return {'rows_checked': len(reference), 'values_equal': True, 'ranking_checked': ranked,
            'absolute_tolerance':str(tolerance),'maximum_absolute_difference':str(max((abs(found[key]-value) for key,value in wanted.items()),default=Decimal(0)))}


def monthly_sales_descriptive(dataset):
    """Task04 audit quantities, without claiming seasonality or causality."""
    rows = read_rows(dataset)
    months = [date.fromisoformat(r['month']+'-01') for r in rows]
    if not rows or len(set(months)) != len(rows):
        raise ValueError('Unique nonempty monthly observations required')
    enriched = [dict(r, year=str(m.year), month_number=str(m.month)) for r,m in zip(rows,months)]
    if any(r['holidays'] not in ('0','1') for r in rows):
        raise ValueError('Binary holiday flag required')
    def summary(group):
        sales=total(group,'sales');budget=total(group,'advertising_budget')
        return dict(months=len(group),sales=str(sales),mean_sales=ratio(sales,len(group)),advertising_budget=str(budget))
    ranked=sorted(rows,key=lambda r:(-Decimal(r['sales']),r['month']))
    return dict(overall=summary(rows),monthly_ranking=[dict(month=r['month'],sales=r['sales']) for r in ranked],
        tables={name:[dict(keys=list(key),**summary(g)) for key,g in sorted(grouped(enriched,keys).items())]
                for name,keys in {'years':['year'],'calendar_months':['month_number'],'holidays':['holidays']}.items()},
        limitations=['Descriptive averages do not isolate trend from seasonality or establish advertising/holiday causality.',
                    'Budget influence must be checked against the model-chosen comparison separately.'])


def geographic_sales_efficiency(dataset):
    """Task17 audit quantities; retain both explicit aggregation meanings."""
    rows=read_rows(dataset)
    if not rows or len({r['store_id'] for r in rows})!=len(rows):
        raise ValueError('Unique nonempty store identity required')
    if any(Decimal(r['store_area'])<=0 for r in rows):
        raise ValueError('Positive store area required')
    def summary(group):
        sales,area=total(group,'monthly_sales'),total(group,'store_area')
        individual=[Decimal(r['monthly_sales'])/Decimal(r['store_area']) for r in group]
        return dict(stores=len(group),sales=str(sales),area=str(area),mean_store_sales=ratio(sales,len(group)),
                    sales_per_total_area=ratio(sales,area),mean_store_sales_per_area=ratio(sum(individual),len(group)))
    return dict(overall=summary(rows),stores=[dict(store_id=r['store_id'],sales_per_area=ratio(r['monthly_sales'],r['store_area'])) for r in rows],
        tables={name:[dict(keys=list(key),**summary(g)) for key,g in sorted(grouped(rows,keys).items())]
                for name,keys in {'cities':['city'],'regions':['region'],'city_regions':['city','region']}.items()},
        limitations=['Group labels are taken from the dataset, not inferred geographic relationships.',
                    'Population/income/traffic/competition effects need the separately reviewed model comparison; no causal inference from these summaries.'])
