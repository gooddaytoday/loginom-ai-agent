#!/usr/bin/env python3
"""Independent pandas answers and subprocess checks of exported CSV oracles.

Run with --write-expected to explicitly refresh checked-in expected files.
No oracle, generator or product code is imported. Temporary exports are removed.
"""
import argparse
import io
import json
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--write-expected', action='store_true')
args = parser.parse_args()


def load(case, name):
    return pd.read_csv(ROOT / f'n{case}/data/{name}.csv', dtype=str, keep_default_na=False)


def check(case, frame, directory, label, accept):
    exported = directory / f'n{case}-{label}.csv'
    frame.to_csv(exported, index=False, lineterminator='\n')
    result = subprocess.run([sys.executable, str(ROOT / f'n{case}/oracle.py'), str(exported)],
                            capture_output=True, text=True)
    if accept:
        assert result.returncode == 0 and result.stdout.strip() == 'PASS', (
            case, label, result.returncode, result.stdout, result.stderr)
    else:
        assert result.returncode != 0 and result.stderr.startswith('FAIL:'), (
            case, label, 'incorrect CSV accepted or unexpected crash', result.stdout, result.stderr)
    return result.returncode


with tempfile.TemporaryDirectory(prefix='stability-n13-n20-') as temporary:
    directory = Path(temporary)
    for case in range(13, 21):
        if case == 13:
            source = load(case, 'rentals').astype({'Quantity': int})
            frame = source.pivot_table(index='Shop', columns='Month', values='Quantity',
                                       aggfunc='sum', fill_value=0).reindex(columns=['Sep', 'Oct', 'Nov'])
            frame = frame.reset_index().sort_values('Shop').reset_index(drop=True)
            wrong = frame.copy()
            wrong.loc[0, 'Nov'] += 1
        if case == 14:
            orders = load(case, 'orders').astype({'OrderID': int, 'Quantity': int})
            fees = load(case, 'fees').astype({'UnitFee': int})
            frame = orders.merge(fees, on=['Product', 'Warehouse'], how='left', validate='many_to_one')
            frame['Fee'] = frame['Quantity'] * frame['UnitFee']
            frame = frame.sort_values('OrderID').reset_index(drop=True)
            # A realistic mistake: product-only join inflates rows and uses the wrong warehouse.
            wrong = orders.merge(fees[['Product', 'UnitFee']], on='Product', how='left')
            wrong['Fee'] = wrong['Quantity'] * wrong['UnitFee']
            wrong = wrong.sort_values('OrderID').reset_index(drop=True)
        if case == 15:
            frame = pd.concat([load(case, 'morning'), load(case, 'evening')], ignore_index=True,
                              sort=False).fillna('')
            frame['Ticket'] = frame['Ticket'].astype(int)
            frame = frame[['Ticket', 'Name', 'Email', 'Phone']].sort_values('Ticket').reset_index(drop=True)
            wrong = frame.drop_duplicates().reset_index(drop=True)
        if case == 16:
            source = load(case, 'returns')
            due = pd.to_datetime(source['Due'], format='%Y-%m-%d')
            returned = pd.to_datetime(source['Returned'], format='%Y-%m-%d')
            frame = pd.DataFrame({'LoanID': source['LoanID'].astype(int),
                                  'DaysLate': (returned - due).dt.days.clip(lower=0),
                                  'Label': source['Reader'].str.strip().str.upper() + '-' + due.dt.strftime('%Y%m')})
            frame = frame.sort_values('LoanID').reset_index(drop=True)
            wrong = frame.copy()
            wrong['DaysLate'] = wrong['DaysLate'] + 1
        if case == 17:
            source = load(case, 'parcels').astype({'ParcelID': int, 'Priority': int})
            frame = source.sort_values(['Priority', 'Due'], ascending=[False, True]).reset_index(drop=True)
            wrong = source.sort_values(['Priority', 'Due'], ascending=[False, False]).reset_index(drop=True)
        if case == 18:
            source = load(case, 'baskets').astype({'OrderID': int})
            # Vectorized explode/groupby path differs from oracle's per-row Counter.
            items = source[['OrderID', 'Items']].assign(Part=source['Items'].str.split('|')).explode('Part')
            parts = items['Part'].str.split(':', expand=True)
            items['Code'] = parts[0]
            items['Units'] = parts[1].astype(int)
            counts = items.groupby(['OrderID', 'Code'], sort=True)['Units'].sum().reset_index()
            counts['Token'] = counts['Code'] + ':' + counts['Units'].astype(str)
            compact = counts.groupby('OrderID', sort=True).agg(Compact=('Token', '|'.join), TotalUnits=('Units', 'sum'))
            frame = source.merge(compact, on='OrderID').sort_values('OrderID').reset_index(drop=True)
            wrong = frame.copy()
            wrong['Compact'] = wrong['Items']
        if case == 19:
            frame = load(case, 'workshops').astype({'ID': int, 'Hours': float, 'Materials': float})
            # Three separated populations have equal sizes; quantiles give a reference partition.
            frame['Group'] = pd.qcut(frame['Hours'], 3, labels=['small', 'medium', 'large']).astype(str)
            frame = frame.sort_values('ID').reset_index(drop=True)
            wrong = frame.copy()
            wrong['Group'] = 'one-group'
        if case == 20:
            frame = load(case, 'deliveries').astype({'ID': int, 'Hours': float, 'Distance': float, 'Cost': float})
            design = np.column_stack([np.ones(len(frame)), frame['Hours'], frame['Distance']])
            coefficients = np.linalg.lstsq(design, frame['Cost'].to_numpy(), rcond=None)[0]
            frame['Forecast'] = design @ coefficients
            frame = frame.sort_values('ID').reset_index(drop=True)
            wrong = frame.copy()
            wrong['Forecast'] = wrong['Cost']

        expected = ROOT / f'n{case}/expected/reference.csv'
        serialized = frame.to_csv(index=False, lineterminator='\n')
        if args.write_expected:
            expected.parent.mkdir(parents=True, exist_ok=True)
            expected.write_text(serialized, encoding='utf-8')
        # Floating-point text can vary in the last digit across BLAS/platforms.
        pd.testing.assert_frame_equal(pd.read_csv(expected, keep_default_na=False),
                                      pd.read_csv(io.StringIO(serialized), keep_default_na=False),
                                      check_dtype=False, check_exact=False, rtol=1e-9, atol=1e-10)
        good_code = check(case, frame, directory, 'reference', True)
        bad_code = check(case, wrong, directory, 'wrong', False)
        check(case, frame.iloc[:-1], directory, 'missing-row', False)
        check(case, frame.assign(Unrequested='extra'), directory, 'extra-column', False)
        numeric = {13: 'Sep', 14: 'Quantity', 15: 'Ticket', 16: 'DaysLate',
                   17: 'Priority', 18: 'TotalUnits', 19: 'Hours', 20: 'Forecast'}[case]
        invalid = frame.copy()
        invalid[numeric] = invalid[numeric].astype(object)
        invalid.loc[0, numeric] = 'NaN'
        check(case, invalid, directory, 'nan', False)
        invalid.loc[0, numeric] = 'Infinity'
        check(case, invalid, directory, 'infinity', False)

        if case == 19:
            relabeled = frame.copy()
            relabeled['Group'] = relabeled['Group'].map({'small': '99', 'medium': '7', 'large': '42'})
            check(case, relabeled.sample(frac=1, random_state=19), directory, 'label-permutation', True)
            criteria = dict(groups=3, centroid_distance_max=.6, radius_max=1.2,
                            source_coordinate_abs_tolerance=1e-6, labels='arbitrary', row_order='any')
            if args.write_expected:
                (expected.parent / 'criteria.json').write_text(json.dumps(criteria, indent=2) + '\n', encoding='utf-8')
        if case == 20:
            perturbed = frame.copy()
            perturbed['Forecast'] += .01
            check(case, perturbed, directory, 'within-tolerance', True)
            perturbed['Forecast'] += .02
            check(case, perturbed, directory, 'outside-tolerance', False)
            if args.write_expected:
                (expected.parent / 'criteria.json').write_text(json.dumps(dict(forecast_abs_tolerance=.02,
                    forecast_rel_tolerance=1e-9, source_abs_tolerance=1e-8), indent=2) + '\n', encoding='utf-8')
        print(f'n{case}: reference PASS (exit {good_code}); wrong REJECT (exit {bad_code}); structural/nonfinite checks PASS')
    print(f'Python {sys.version.split()[0]}; pandas {pd.__version__}; numpy {np.__version__}')
