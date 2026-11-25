#!/usr/bin/env python3
"""Stage deterministic H1 inputs and case metadata for run-check --cases."""

import argparse
import csv
from datetime import date, datetime, timedelta
from pathlib import Path
from random import Random
from shutil import copyfile


WEEK_START = date(2026, 1, 5)
REGIONS = (
    'Алтай', 'Волга', 'Дон', 'Карелия', 'Москва', 'Нева',
    'Поморье', 'Приамурье', 'Сибирь', 'Урал',
)


def day(value, index):
    return value.isoformat() if index % 2 else value.strftime('%d.%m.%Y')


def money(cents):
    return f'{cents // 100},{cents % 100:02d}'


def abc(rng, index):
    product = min(rng.randrange(64), rng.randrange(64), rng.randrange(64))
    price = 2500 + 175 * (63 - product) + rng.randrange(1000)
    sold = date(2026, 1, 1) + timedelta(days=rng.randrange(181))
    return (
        '' if index % 401 == 0 else f'T-{product + 1:03d}',
        day(sold, index),
        '' if index % 173 == 0 else money(price * rng.randint(1, 8)),
    )


def rfm(rng, index):
    customer = min(rng.randrange(250), rng.randrange(250))
    active_days = 72 if customer % 7 == 0 else 180 - customer // 4
    sold = date(2026, 1, 1) + timedelta(days=rng.randrange(active_days))
    return (
        '' if index % 353 == 0 else f'K-{customer + 1:03d}',
        '' if index % 271 == 0 else day(sold, index),
        '' if index % 149 == 0 else money(rng.randrange(5000, 85000)),
    )


def retention(rng, index):
    customer = rng.randrange(2400)
    first = customer % 12
    if index <= 2400:
        customer = index - 1
        first = customer % 12
        month = first
    else:
        lifespan = min(12 - first, 1 + (customer // 12) % 10)
        month = first + min(rng.randrange(lifespan), rng.randrange(lifespan))
    if month == 9 and first == 4:  # A mature cohort has a zero-retention month.
        month = 8
    purchased = date(2025 + (month + 8) // 12, (month + 8) % 12 + 1, rng.randint(1, 28))
    return (
        '' if index % 419 == 0 else f'K-{customer + 1:04d}',
        '' if index % 283 == 0 else day(purchased, index),
        '' if index % 137 == 0 else money(rng.randrange(3000, 60000)),
    )


def weekly(rng, index):
    store = rng.randrange(12)
    week = rng.randrange(26)
    if (store, week) in {(0, 1), (0, 2), (2, 0), (11, 25)}:
        week = (week + 3) % 26
    sold = WEEK_START + timedelta(days=week * 7 + rng.randrange(7))
    return (
        '' if index % 367 == 0 else f'M-{store + 1:02d}',
        '' if index % 239 == 0 else day(sold, index),
        '' if index % 151 == 0 else money(rng.randrange(3300, 77000)),
    )


def cross(rng, index):
    region = rng.choice(REGIONS)
    month = rng.randint(1, 6)
    if (region, month) in {('Алтай', 2), ('Дон', 4), ('Урал', 6)}:
        month = 1
    sold = date(2026, month, rng.randint(1, 28))
    return (
        '' if index % 317 == 0 else region,
        '' if index % 233 == 0 else day(sold, index),
        '' if index % 127 == 0 else money(rng.randrange(8000, 99000)),
    )


def sensors(rng, index):
    sensor = rng.randrange(16)
    moment = datetime(2026, 6, 1) + timedelta(minutes=index)
    baseline = 1125 + sensor * 25
    reading = baseline if sensor == 15 else baseline + rng.randint(-55, 55)
    if sensor != 15 and index % 613 == 0:
        reading += 420 if index % 2 else -420
    return (
        '' if index % 397 == 0 else f'D-{sensor + 1:02d}',
        day(moment.date(), index) + moment.strftime(' %H:%M:%S'),
        '' if index % 131 == 0 else money(reading),
    )


FIXTURES = {
    'bh-h101': ('products.csv', 56000, 'Строка;Товар;Дата продажи;Выручка', abc),
    'bh-h102': ('orders.csv', 68000, 'Заказ;Клиент;Дата оплаты;Сумма', rfm),
    'bh-h103': ('purchases.csv', 78000, 'Покупка;Клиент;Дата покупки;Сумма', retention),
    'bh-h104': ('stores.csv', 92000, 'Продажа;Магазин;Дата продажи;Выручка', weekly),
    'bh-h105': ('regions.csv', 103000, 'Операция;Регион;Дата продажи;Сумма', cross),
    'bh-h106': ('sensors.csv', 64000, 'Замер;Датчик;Время замера;Показание', sensors),
}


def generate(name, out):
    fixture, size, header, make_values = FIXTURES[name]
    source = Path(__file__).resolve().parent
    case = out / name
    data = case / 'data'
    data.mkdir(parents=True, exist_ok=True)
    for filename in ('task.md', 'case.json', 'expected.json'):
        copyfile(source / 'cases' / name / filename, case / filename)
    copyfile(source / 'oracle.py', case / 'oracle.py')

    rng = Random(int(name[-3:]))
    with (data / fixture).open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream, delimiter=';', lineterminator='\n')
        writer.writerow(header.split(';'))
        for index in range(1, size + 1):
            # Duplicate full rows, including their original identifier.
            if index % 113 != 0:
                row = (index, *make_values(rng, index))
            writer.writerow(row)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('cases', nargs='*', metavar='CASE')
    args = parser.parse_args()
    for name in args.cases or FIXTURES:
        if name not in FIXTURES:
            parser.error(f'unknown case: {name}')
        generate(name, args.out)


if __name__ == '__main__':
    main()
