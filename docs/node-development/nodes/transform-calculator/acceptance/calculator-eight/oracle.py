"""Independent summary of the synthetic AB input; never delivered to the model."""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def check():
    with (ROOT / 'data/ab.csv').open() as source:
        rows = list(csv.DictReader(source))
    assert len(rows) == 20000
    summary = dict(Batch='AB test', Rows=len(rows), NA=0, NB=0, YA=0, YB=0,
                   Missing=0, BadGroup=0, BadExtras=0)
    days = {'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'}
    for row in rows:
        converted = row['Converted'] == 'true'
        summary['NA'] += row['TestGroup'] == 'psa'
        summary['NB'] += row['TestGroup'] == 'ad'
        summary['YA'] += row['TestGroup'] == 'psa' and converted
        summary['YB'] += row['TestGroup'] == 'ad' and converted
        summary['Missing'] += any(value == '' for value in row.values())
        summary['BadGroup'] += row['TestGroup'] not in {'ad', 'psa'}
        summary['BadExtras'] += (int(row['TotalAds']) < 0 or not 0 <= int(row['MostAdsHour']) <= 23
                                 or row['MostAdsDay'] not in days)
    expected = json.loads((ROOT / 'expected.json').read_text())['outputs'][0]
    assert expected['rows'] == [summary]
    assert [column['name'] for column in expected['columns']] == list(summary)
    assert [column['type'] for column in expected['columns']] == ['string', 'integer'] + ['real'] * 7


if __name__ == '__main__':
    check()
