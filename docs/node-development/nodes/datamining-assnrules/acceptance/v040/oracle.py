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
    assert rules(rec_holdout, Fraction(0), 1, max_items=2) == []
    return dict(status='proposal_not_stock_expected', columns='technical schema to bind from live UI',
                thresholds=dict(min_support_pct=50, min_confidence_pct=60, max_items=3),
                single_consequent=base, two_consequents=extended, min_lift_1_2=filtered,
                selected_items=selected,
                selected_item_B=dict(sets=selected_sets, rules=selected_rules),
                selected_item_B_then_exclude_support_above_90=dict(sets=excluded_sets, rules=excluded_rules),
                recommendations=dict(max_items=2, max_consequents=1, source='recommend-train.csv', holdout_source='recommend-holdout.csv', rules=rec_rules, holdout=candidates,
                                     retraining_on_holdout_rules=[],
                                     rule_metrics='from saved train model; never from holdout'),
                holdout_retraining_would_change_rules=rules(holdout, Fraction(0), 2) != extended,
                unresolved=['native RuleID order', 'numerical effect of restrictive auxiliary item values',
                            'native recommendation table and padding for two consequences'])


if __name__ == '__main__':
    value = expected()
    if sys.argv[1:] == ['--check']:
        assert json.loads(Path(__file__).with_name('expected.json').read_text()) == value
        print('PASS: exhaustive subsets, lift, multi-consequence, selected-item exclusion and holdout sensitivity')
    else:
        assert not sys.argv[1:]
        print(json.dumps(value, ensure_ascii=False, indent=2))
