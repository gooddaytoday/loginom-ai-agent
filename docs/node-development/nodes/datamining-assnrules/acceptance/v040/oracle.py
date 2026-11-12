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


def support_of(source):
    return lambda s: Fraction(sum(set(s) <= b for b in source.values()), len(source))


def itemsets(source, max_items=3, exclude_above=None):
    """Frequent sets excluding items whose support exceeds the inclusive maximum."""
    support = support_of(source)
    items = sorted(set.union(*source.values()))
    if exclude_above is not None:
        items = [x for x in items if support([x]) <= exclude_above]
    return [dict(items=list(union), support=float(support(union)))
            for width in range(1, max_items + 1)
            for union in itertools.combinations(items, width)
            if support(union) >= MIN_SUPPORT]


def rules(source, lift, consequences, max_items=3, exclude_above=None):
    support = support_of(source)
    result = []
    for found in itemsets(source, max_items, exclude_above):
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
    excluded_sets = itemsets(source, exclude_above=MAX_SUPPORT)
    excluded_rules = rules(source, Fraction(0), 2, exclude_above=MAX_SUPPORT)
    assert [s['items'] for s in excluded_sets] == [['B'], ['C'], ['B', 'C']]
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
                exclude_support_above_90=dict(sets=excluded_sets, rules=excluded_rules),
                recommendations=dict(max_items=2, max_consequents=1, source='recommend-train.csv', holdout_source='recommend-holdout.csv', rules=rec_rules, holdout=candidates,
                                     retraining_on_holdout_rules=holdout_retraining,
                                     rule_metrics='from saved train model; never from holdout'),
                holdout_retraining_would_change_rules=rules(holdout, Fraction(0), 2) != extended,
                unresolved=['native RuleID order',
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
    # Fresh max_items=3 node: Teach, Execute, Save, cold and lift retraining
    # retain grouped A/A/C/C columns (LAB-1239 native cycle 2). Metrics below
    # remain independent of this native schema binding.
    rule_columns += [column('Item_' + str(i) + '_' + side, 'string') for side in ['A', 'C'] for i in range(2)]
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


def recommend_artifact():
    source = baskets('recommend-train.csv')
    found = rules(source, Fraction(0), 1, max_items=2)
    assert [(r['antecedent'], r['consequent']) for r in found] == [(['A'], ['B']), (['B'], ['A'])]
    column = lambda name, kind: dict(name=name, type=kind, label_any=True,
        **(dict(tolerance=dict(abs=1e-10, rel=1e-10)) if kind == 'real' else {}))
    # Native source-field inventory of a fresh recommendations port places
    # Transaction first. Rule IDs share port 1 enumeration; metrics are Fraction-derived.
    columns = [column('RuleID', 'integer')] + [column(n, 'real') for n in ['Support', 'Confidence', 'Lift']]
    items = [column('Item_0_' + side, 'string') for side in ['A', 'C']]
    row = lambda index, r: dict(RuleID=index, Support=r['support'], Confidence=r['confidence'],
        Lift=r['lift'], Item_0_A=r['antecedent'][0], Item_0_C=r['consequent'][0])
    recommendations = [dict(row(index, r), Transaction=t)
        for t, basket in source.items() for index, r in enumerate(found, 1)
        if set(r['antecedent']) <= basket and not set(r['consequent']) & basket]
    assert recommendations == [dict(RuleID=1, Support=.75, Confidence=.75, Lift=1.,
        Transaction='T4', Item_0_A='A', Item_0_C='B')]
    output = lambda port, schema, rows: dict(output_node_type='datamining.assn_rules', output_port=port,
        ordered=False, column_order='exact', columns=schema, rows=rows)
    return dict(package_path='{{PACKAGE_PATH}}', nodes=[dict(type=t) for t in
        ['imports.text', 'datamining.assn_rules', 'exports.text']], outputs=[
        output(1, columns + items, [row(i, r) for i, r in enumerate(found, 1)]),
        output(2, [column('Transaction', 'string')] + columns + items, recommendations)])


def holdout_artifact():
    # Fixed train rules; only the transaction baskets change. Relearning must
    # fail this oracle because holdout alone produces no rules.
    artifact = recommend_artifact()
    found = rules(baskets('recommend-train.csv'), Fraction(0), 1, max_items=2)
    assert rules(baskets('recommend-holdout.csv'), Fraction(0), 1, max_items=2) == []
    rows = [dict(artifact['outputs'][0]['rows'][index], Transaction=t)
        for t, basket in baskets('recommend-holdout.csv').items() for index, rule in enumerate(found)
        if set(rule['antecedent']) <= basket and not set(rule['consequent']) & basket]
    assert rows == [dict(RuleID=1, Support=.75, Confidence=.75, Lift=1.,
        Transaction='H1', Item_0_A='A', Item_0_C='B')]
    artifact['outputs'][1]['rows'] = rows
    return artifact


def exclude_artifacts():
    source = baskets('train.csv')
    sets = itemsets(source, exclude_above=MAX_SUPPORT)
    found = rules(source, Fraction(0), 2, exclude_above=MAX_SUPPORT)
    tables = consequents_expected(Fraction(0))
    tables[0]['rows'] = [row for row in tables[0]['rows'] if any(
        [row['Item_' + str(i)] for i in range(3) if row['Item_' + str(i)] is not None] == value['items'] for value in sets)]
    tables[1]['rows'] = [row for row in tables[1]['rows'] if any(
        [row['Item_' + str(i) + '_A'] for i in range(2) if row['Item_' + str(i) + '_A'] is not None] == value['antecedent'] and
        [row['Item_' + str(i) + '_C'] for i in range(2) if row['Item_' + str(i) + '_C'] is not None] == value['consequent'] for value in found)]
    for table, key in zip(tables, ['ItemsetID', 'RuleID']):
        for index, row in enumerate(table['rows'], 1):
            row[key] = index
    assert [len(t['rows']) for t in tables] == [3, 2]
    artifact = dict(package_path='{{PACKAGE_PATH}}', nodes=[dict(type=t) for t in
        ['imports.text', 'datamining.assn_rules', 'exports.text']], outputs=tables)
    # Owner decision 12.11: native 7.4.2 Save/Open preserves settings/rules,
    # but restores the excluded singleton without Teach. Main stays strict 3/2.
    cold = dict(artifact, outputs=[tables[1]],
                assnrules_exclusion=dict(exclude_support_above_pct=90))
    return {'expected-exclude.json': artifact, 'expected-exclude-cold.json': cold}


if __name__ == '__main__' and sys.argv[1:] in (['--write-consequents'], ['--check-consequents'], ['--write-exclude'], ['--check-exclude']):
    artifacts = exclude_artifacts() if sys.argv[1].endswith('exclude') else consequents_artifacts()
    for name, value in artifacts.items():
        path = Path(__file__).with_name(name)
        if sys.argv[1].startswith('--write-'):
            path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        else:
            assert json.loads(path.read_text(encoding='utf-8')) == value, name
    print('PASS: independent consequent tables, native enumeration, NULL padding and final cold expectations')
elif __name__ == '__main__':
    value = expected()
    if sys.argv[1:] == ['--write-recommend']:
        Path(__file__).with_name('expected-recommend.json').write_text(json.dumps(recommend_artifact(), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    elif sys.argv[1:] == ['--write-holdout']:
        Path(__file__).with_name('expected-holdout.json').write_text(json.dumps(holdout_artifact(), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    elif sys.argv[1:] == ['--check']:
        for name, artifact in exclude_artifacts().items():
            assert json.loads(Path(__file__).with_name(name).read_text()) == artifact, name
        assert json.loads(Path(__file__).with_name('expected-holdout.json').read_text()) == holdout_artifact()
        assert json.loads(Path(__file__).with_name('expected-recommend.json').read_text()) == recommend_artifact()
        task = Path(__file__).with_name('task-recommend.md').read_text()
        assert 'recommend-train.csv' in task and 'recommend-holdout.csv' not in task
        assert 'T4' not in task and '.75' not in task
        assert json.loads(Path(__file__).with_name('expected.json').read_text()) == value
        print('PASS: exhaustive subsets, lift, multi-consequence, maximum-support exclusion and holdout sensitivity')
    else:
        assert not sys.argv[1:]
        print(json.dumps(value, ensure_ascii=False, indent=2))
