"""Exhaustive small-basket oracle; no Loginom, FP-Growth or actual output."""
import csv
import itertools
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIN_SUPPORT, MIN_CONFIDENCE, MAX_SUPPORT = Fraction(1, 2), Fraction(3, 5), Fraction(9, 10)


def baskets(name):
    result = {}
    with (ROOT / 'fixtures/v040' / name).open(newline='', encoding='utf-8') as stream:
        for row in csv.DictReader(stream):
            assert row['Transaction'] and row['Item']
            result.setdefault(row['Transaction'], set()).add(row['Item'])
    return result


def selected_items(name):
    with (ROOT / 'fixtures/v040' / name).open(newline='', encoding='utf-8') as stream:
        return sorted({row['Item'] for row in csv.DictReader(stream)})


def support_of(source):
    return lambda s: Fraction(sum(set(s) <= b for b in source.values()), len(source))


def itemsets(source, max_items=3, selected=(), exclude_above=None):
    """Frequent sets of 1..max_items items, optionally only sets with a selected item
    and without items whose own support is above exclude_above."""
    support = support_of(source)
    items = sorted(set.union(*source.values()))
    if exclude_above is not None:
        items = [x for x in items if support([x]) <= exclude_above]
    return [dict(items=list(union), support=float(support(union)))
            for width in range(1, max_items + 1)
            for union in itertools.combinations(items, width)
            if support(union) >= MIN_SUPPORT and (not selected or set(union) & set(selected))]


def rules(source, lift, consequences, max_items=3, selected=(), exclude_above=None):
    support = support_of(source)
    result = []
    for found in itemsets(source, max_items, selected, exclude_above):
        union = tuple(found['items'])
        probability = support(union)
        for size in range(1, min(consequences, len(union) - 1) + 1):
            for right in itertools.combinations(union, size):
                left = tuple(x for x in union if x not in right)
                confidence = probability / support(left)
                ratio = confidence / support(right)
                if confidence >= MIN_CONFIDENCE and ratio >= lift:
                    result.append(dict(antecedent=list(left), consequent=list(right),
                                       support=float(probability), confidence=float(confidence), lift=float(ratio)))
    return sorted(result, key=lambda r: (r['antecedent'], r['consequent']))


def expected():
    source, holdout = baskets('train.csv'), baskets('holdout.csv')
    base = rules(source, Fraction(0), 1)
    extended = rules(source, Fraction(0), 2)
    filtered = rules(source, Fraction(6, 5), 2)
    assert len(extended) > len(base) and len(filtered) < len(extended)
    assert any(r['consequent'] == ['B', 'C'] and r['antecedent'] == ['A'] for r in extended)
    # Selected item B (decision 3 of LAB-1119); excluding support > 90% removes A (4/4) and leaves a non-empty result.
    selected = selected_items('selected-items.csv')
    assert selected == ['B']
    selected_sets = itemsets(source, selected=selected)
    selected_rules = rules(source, Fraction(0), 2, selected=selected)
    excluded_sets = itemsets(source, selected=selected, exclude_above=MAX_SUPPORT)
    excluded_rules = rules(source, Fraction(0), 2, selected=selected, exclude_above=MAX_SUPPORT)
    assert (len(selected_sets), len(selected_rules)) == (4, 10)
    assert [s['items'] for s in excluded_sets] == [['B'], ['B', 'C']]
    assert [(r['antecedent'], r['consequent']) for r in excluded_rules] == [(['B'], ['C']), (['C'], ['B'])]
    # A dedicated pair model leaves exactly one applicable rule for H1.
    rec_train = baskets('recommend-train.csv')
    rec_holdout = baskets('recommend-holdout.csv')
    rec_rules = rules(rec_train, Fraction(0), 1, max_items=2)
    candidates = [dict(transaction=t, item=r['consequent'][0],
                       support=r['support'], confidence=r['confidence'], lift=r['lift'])
                  for t, b in rec_holdout.items() for r in rec_rules
                  if set(r['antecedent']) <= b and not set(r['consequent']) & b]
    assert candidates == [dict(transaction='H1', item='B', support=.75, confidence=.75, lift=1.)]
    # Retraining on recommend-holdout would yield no rules at all: any rule in the output proves the saved model was used.
    holdout_retraining = rules(rec_holdout, Fraction(0), 1, max_items=2)
    assert holdout_retraining == []
    return dict(status='proposal_not_stock_expected', columns='technical schema to bind from live UI',
                thresholds=dict(min_support_pct=50, min_confidence_pct=60, max_items=3),
                single_consequent=base, two_consequents=extended, min_lift_1_2=filtered,
                selected_items=selected,
                selected_item_B=dict(sets=selected_sets, rules=selected_rules),
                selected_item_B_then_exclude_support_above_90=dict(sets=excluded_sets, rules=excluded_rules),
                recommendations=dict(max_items=2, max_consequents=1, source='recommend-train.csv', holdout_source='recommend-holdout.csv', rules=rec_rules, holdout=candidates,
                                     retraining_on_holdout_rules=holdout_retraining,
                                     rule_metrics='from saved train model; never from holdout'),
                holdout_retraining_would_change_rules=rules(holdout, Fraction(0), 2) != extended,
                unresolved=['native RuleID order', 'numerical effect of restrictive auxiliary item values',
                            'native recommendation table and padding for two consequences'])


def consequents_expected(lift):
    source = baskets('train.csv')
    # Native reader binding for this fixture on Loginom 7.4.2. These lists
    # bind enumeration only; all membership and metrics come from Fraction.
    native_sets = ['A', 'B', 'AB', 'C', 'AC', 'BC', 'ABC']
    native_rules = [('A', 'B'), ('B', 'A'), ('A', 'C'), ('C', 'A'),
                    ('B', 'C'), ('C', 'B'), ('AB', 'C'), ('AC', 'B'),
                    ('BC', 'A'), ('C', 'AB'), ('B', 'AC'), ('A', 'BC')]
    sets = sorted(itemsets(source), key=lambda s: native_sets.index(''.join(s['items'])))
    found = sorted(rules(source, lift, 2),
                   key=lambda r: native_rules.index((''.join(r['antecedent']), ''.join(r['consequent']))))
    assert len(sets) == 7 and len(found) == (12 if lift == 0 else 6)
    column = lambda name, kind: dict(name=name, type=kind, label_any=True,
        **(dict(tolerance=dict(abs=1e-10, rel=1e-10)) if kind == 'real' else {}))
    output = lambda port, columns, rows: dict(output_node_type='datamining.assn_rules', output_port=port,
        ordered=False, column_order='exact', columns=columns, rows=rows)
    set_columns = [column('ItemsetID', 'integer'), column('Width', 'integer'), column('Support', 'real')]
    set_columns += [column('Item_' + str(i), 'string') for i in range(3)]
    rule_columns = [column('RuleID', 'integer')] + [column(n, 'real') for n in ['Support', 'Confidence', 'Lift']]
    rule_columns += [column('Item_' + str(i) + '_' + side, 'string') for i in range(2) for side in ['A', 'C']]
    return [output(0, set_columns, [dict(ItemsetID=index, Width=len(s['items']), Support=s['support'],
        **{'Item_' + str(i): s['items'][i] if i < len(s['items']) else None for i in range(3)})
        for index, s in enumerate(sets, 1)]),
        output(1, rule_columns, [dict(RuleID=index, Support=r['support'], Confidence=r['confidence'], Lift=r['lift'],
            **{'Item_' + str(i) + '_' + side: r[key][i] if i < len(r[key]) else None
               for i in range(2) for side, key in [('A', 'antecedent'), ('C', 'consequent')]})
            for index, r in enumerate(found, 1)])]


def consequents_artifacts():
    base = dict(package_path='{{PACKAGE_PATH}}', nodes=[dict(type=t) for t in
        ['imports.text', 'datamining.assn_rules', 'exports.text']])
    final = consequents_expected(Fraction(6, 5))
    return {'expected-consequents.json': dict(base, outputs=consequents_expected(Fraction(0)) + final),
            'expected-consequents-cold.json': dict(base, outputs=final)}


if __name__ == '__main__' and sys.argv[1:] in (['--write-consequents'], ['--check-consequents']):
    for name, value in consequents_artifacts().items():
        path = Path(__file__).with_name(name)
        if sys.argv[1:] == ['--write-consequents']:
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        else:
            assert json.loads(path.read_text(encoding='utf-8')) == value, name
    print('PASS: independent consequent tables, native enumeration, NULL padding and final cold expectations')
elif __name__ == '__main__':
    value = expected()
    if sys.argv[1:] == ['--check']:
        assert json.loads(Path(__file__).with_name('expected.json').read_text()) == value
        print('PASS: exhaustive subsets, lift, multi-consequence, selected-item exclusion and holdout sensitivity')
    else:
        assert not sys.argv[1:]
        print(json.dumps(value, ensure_ascii=False, indent=2))
