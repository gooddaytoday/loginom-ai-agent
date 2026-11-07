"""Exhaustive small-basket oracle; no Loginom, FP-Growth or actual output."""
import csv
import itertools
import json
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def baskets(name):
    result = {}
    with (ROOT / 'fixtures/v040' / name).open(newline='', encoding='utf-8') as stream:
        for row in csv.DictReader(stream):
            assert row['Transaction'] and row['Item']
            result.setdefault(row['Transaction'], set()).add(row['Item'])
    return result


def rules(source, lift, consequences):
    items = sorted(set.union(*source.values()))
    support = lambda s: Fraction(sum(set(s) <= b for b in source.values()), len(source))
    result = []
    for width in (2, 3):
        for union in itertools.combinations(items, width):
            for size in range(1, min(consequences, width - 1) + 1):
                for right in itertools.combinations(union, size):
                    left = tuple(x for x in union if x not in right)
                    probability = support(union)
                    if probability < Fraction(1, 2):
                        continue
                    confidence = probability / support(left)
                    ratio = confidence / support(right)
                    if probability >= Fraction(1, 2) and confidence >= Fraction(3, 5) and ratio >= lift:
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
    # A dedicated pair model leaves exactly one applicable rule for H1.
    rec_train = baskets('recommend-train.csv')
    rec_holdout = baskets('recommend-holdout.csv')
    rec_rules = rules(rec_train, Fraction(0), 1)
    candidates = [dict(transaction=t, item=r['consequent'][0],
                       support=r['support'], confidence=r['confidence'], lift=r['lift'])
                  for t, b in rec_holdout.items() for r in rec_rules
                  if set(r['antecedent']) <= b and not set(r['consequent']) & b]
    assert candidates == [dict(transaction='H1', item='B', support=.75, confidence=.75, lift=1.)]
    return dict(status='proposal_not_stock_expected', columns='technical schema to bind from live UI',
                thresholds=dict(min_support_pct=50, min_confidence_pct=60, max_items=3),
                single_consequent=base, two_consequents=extended, min_lift_1_2=filtered,
                selected_item_A_rules=[r for r in extended if 'A' in r['antecedent'] + r['consequent']],
                selected_item_A_then_exclude_support_above_90=[],
                recommendations=dict(max_items=2, max_consequents=1, source='recommend-train.csv', holdout_source='recommend-holdout.csv', rules=rec_rules, holdout=candidates,
                                     rule_metrics='from saved train model; never from holdout'),
                holdout_retraining_would_change_rules=rules(holdout, Fraction(0), 2) != extended,
                unresolved=['native RuleID order', 'numerical effect of restrictive auxiliary item values',
                            'native recommendation table and padding for two consequences'])


if __name__ == '__main__':
    value = expected()
    if sys.argv[1:] == ['--check']:
        assert json.loads(Path(__file__).with_name('expected.json').read_text()) == value
        print('PASS: exhaustive subsets, lift, multi-consequence and holdout sensitivity')
    else:
        assert not sys.argv[1:]
        print(json.dumps(value, ensure_ascii=False, indent=2))
