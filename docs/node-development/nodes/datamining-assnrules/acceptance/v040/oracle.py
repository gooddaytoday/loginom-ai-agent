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
    # A single possible missing item eliminates recommendation ranking ambiguity.
    candidates = [dict(transaction=t, item='A') for t, b in holdout.items()
                  if {'B', 'C'} <= b and 'A' not in b]
    assert candidates == [dict(transaction='H1', item='A')]
    return dict(status='proposal_not_stock_expected', columns='technical schema to bind from live UI',
                thresholds=dict(min_support_pct=50, min_confidence_pct=60, max_items=3),
                single_consequent=base, two_consequents=extended, min_lift_1_2=filtered,
                recommendations=dict(allowed_consequents=['A'], holdout=candidates,
                                     rule_metrics='from saved train model; never from holdout'),
                holdout_retraining_would_change_rules=rules(holdout, Fraction(0), 2) != extended,
                unresolved=['native RuleID order', 'auxiliary field roles and filter semantics',
                            'native recommendation table and padding for two consequences'])


if __name__ == '__main__':
    value = expected()
    if sys.argv[1:] == ['--check']:
        assert json.loads(Path(__file__).with_name('expected.json').read_text()) == value
        print('PASS: exhaustive subsets, lift, multi-consequence and holdout sensitivity')
    else:
        assert not sys.argv[1:]
        print(json.dumps(value, ensure_ascii=False, indent=2))
