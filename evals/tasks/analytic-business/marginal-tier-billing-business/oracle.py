"""Compute the tariff table directly from input records using exact decimals."""
import csv
from collections import defaultdict
from decimal import Decimal
from pathlib import Path


def calculate(data):
    def read(name):
        with (data / name).open(encoding='utf-8', newline='') as stream:
            return list(csv.DictReader(stream))

    accounts = read('tier_accounts.csv')
    assert len({row['account_id'] for row in accounts}) == len(accounts)
    quantities = defaultdict(Decimal)
    for row in read('tier_readings.csv'):
        quantities[row['account_id']] += Decimal(row['quantity'])
    rates = defaultdict(list)
    for row in read('tier_rates.csv'):
        rates[row['plan_id']].append(tuple(Decimal(row[key]) for key in ['lower_qty', 'upper_qty', 'unit_rate']))
    output = []
    for account in sorted(accounts, key=lambda row: row['account_id']):
        quantity = quantities[account['account_id']]
        fee = Decimal(account['fixed_fee'])
        cost = sum(max(Decimal(0), min(quantity, upper) - lower) * price
                   for lower, upper, price in rates[account['plan_id']])
        output.append([account['account_id']] + [format(value, '.6f') for value in [quantity, cost, fee, cost + fee]])
    return output


if __name__ == '__main__':
    case = Path(__file__).resolve().parent
    with (case / 'oracle.csv').open('w', encoding='utf-8', newline='') as stream:
        writer = csv.writer(stream, lineterminator='\n')
        writer.writerow(['account_id', 'quantity', 'variable_charge', 'fixed_fee', 'total_charge'])
        writer.writerows(calculate(case / 'data'))
