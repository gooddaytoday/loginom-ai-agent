#!/usr/bin/env python3
"""Calculate H1 expectations from CSV bytes, independently of the generator and Loginom."""

import argparse
import csv
import json
from collections import Counter, defaultdict
from datetime import date, timedelta
from decimal import Decimal
from math import sqrt
from pathlib import Path
from statistics import mean, pvariance


def records(data, filename, fields, identifier=None):
    """Yield selected nonempty fields after deduplication."""
    with (data / filename).open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.reader(stream, delimiter=';')
        header = next(reader)
        positions = [header.index(field) for field in fields]
        id_position = header.index(identifier) if identifier is not None else None
        seen = set()
        for row in reader:
            key = tuple(row) if id_position is None else row[id_position]
            if key in seen:
                continue
            seen.add(key)
            result = tuple(row[position] for position in positions)
            if all(result):
                yield result


def parse_date(value):
    if '-' in value:
        return date.fromisoformat(value)
    day, month, year = map(int, value.split('.'))
    return date(year, month, day)


def decimal(value):
    return Decimal(value.replace(',', '.'))


def abc(data):
    revenue = defaultdict(Decimal)
    for product, value in records(data, 'products.csv', ('Товар', 'Выручка')):
        revenue[product] += decimal(value)
    total = sum(revenue.values())
    running = Decimal(0)
    for product, amount in sorted(revenue.items(), key=lambda pair: (-pair[1], pair[0])):
        before = running / total
        group = 'A' if before < Decimal('0.80') else 'B' if before < Decimal('0.95') else 'C'
        running += amount
        yield product, amount, amount / total, running / total, group


def rfm(data):
    reference = date(2026, 7, 1)
    frequency = Counter()
    monetary = defaultdict(Decimal)
    recency = {}
    for customer, paid, amount in records(data, 'orders.csv', ('Клиент', 'Дата оплаты', 'Сумма'), 'Заказ'):
        days = (reference - parse_date(paid)).days
        recency[customer] = min(recency.get(customer, days), days)
        frequency[customer] += 1
        monetary[customer] += decimal(amount)

    def quintiles(metric, sign=1):
        ordered = sorted(frequency, key=lambda customer: (sign * metric[customer], customer))
        return {customer: 1 + 5 * index // len(ordered) for index, customer in enumerate(ordered)}

    r_score, f_score, m_score = quintiles(recency, -1), quintiles(frequency), quintiles(monetary)
    for customer in sorted(frequency):
        r, f, m = r_score[customer], f_score[customer], m_score[customer]
        if min(r, f, m) >= 4:
            segment = 'VIP'
        elif r <= 2 and max(f, m) >= 4:
            segment = 'Риск'
        else:
            segment = 'Обычные'
        yield customer, recency[customer], frequency[customer], monetary[customer], r, f, m, segment


def retention(data):
    visits = defaultdict(set)
    for customer, purchased in records(data, 'purchases.csv', ('Клиент', 'Дата покупки')):
        moment = parse_date(purchased)
        visits[customer].add(moment.year * 12 + moment.month - 1)

    cohorts = Counter()
    active = Counter()
    last_month = max(max(months) for months in visits.values())
    for months in visits.values():
        first = min(months)
        cohorts[first] += 1
        active.update((first, month) for month in months)

    for first, size in sorted(cohorts.items()):
        year, month_index = divmod(first, 12)
        for current in range(first, last_month + 1):
            buyers = active[(first, current)]
            yield f'{year:04d}-{month_index + 1:02d}', current - first, size, buyers, buyers / size


def weekly(data):
    weeks = defaultdict(lambda: defaultdict(Decimal))
    for store, sold, amount in records(data, 'stores.csv', ('Магазин', 'Дата продажи', 'Выручка'), 'Продажа'):
        moment = parse_date(sold)
        weeks[store][moment - timedelta(days=moment.weekday())] += decimal(amount)

    start, end = date(2026, 1, 5), date(2026, 6, 29)
    calendar = [start + timedelta(weeks=i) for i in range((end - start).days // 7 + 1)]
    for store, revenue in sorted(weeks.items()):
        for index, monday in enumerate(calendar):
            window = calendar[max(0, index - 3):index + 1]
            yield store, monday.isoformat(), revenue[monday], sum(revenue[d] for d in window) / len(window)


def cross(data):
    sums = defaultdict(lambda: defaultdict(Decimal))
    counts = defaultdict(Counter)
    for region, sold, amount in records(data, 'regions.csv', ('Регион', 'Дата продажи', 'Сумма'), 'Операция'):
        month = parse_date(sold).month
        sums[region][month] += decimal(amount)
        counts[region][month] += 1
    for region in sorted(sums):
        cells = [value for month in range(1, 7) for value in (sums[region][month], counts[region][month])]
        yield region, *cells


def sensors(data):
    readings = defaultdict(list)
    for sensor, identifier, measured, reading in records(
        data, 'sensors.csv', ('Датчик', 'Замер', 'Время замера', 'Показание'), 'Замер'
    ):
        day, time = measured.split()
        readings[sensor].append((int(identifier), f'{parse_date(day)} {time}', decimal(reading)))

    for sensor, measurements in sorted(readings.items()):
        values = [reading for _, _, reading in measurements]
        center, spread = mean(values), sqrt(pvariance(values))
        if spread > 0:
            for identifier, timestamp, reading in sorted(measurements):
                z_score = float(reading - center) / spread
                if abs(z_score) > 3:
                    yield sensor, identifier, timestamp, reading, z_score


MATRICES = {
    'bh-h101': (abc, 'Product:s Revenue:r Share:r CumulativeShare:r Class:s'),
    'bh-h102': (rfm, 'Customer:s Recency:i Frequency:i Monetary:r R:i F:i M:i Segment:s'),
    'bh-h103': (retention, 'Cohort:s Age:i CohortSize:i Active:i Retention:r'),
    'bh-h104': (weekly, 'Store:s WeekStart:s Revenue:r MovingAverage4:r'),
    'bh-h105': (cross, 'Region:s ' + ' '.join(f'Sum{month:02}:r Count{month:02}:i' for month in range(1, 7))),
    'bh-h106': (sensors, 'Sensor:s Measurement:i MeasuredAt:s Reading:r ZScore:r'),
}
TYPES = {'s': 'string', 'i': 'integer', 'r': 'real'}


def expectation(case, data):
    calculate, schema = MATRICES[case]
    columns = []
    for field in schema.split():
        name, kind = field.split(':')
        column = {'name': name, 'label_any': True, 'type': TYPES[kind]}
        if kind == 'r':
            column['tolerance'] = {'abs': 1e-8, 'rel': 1e-10}
        columns.append(column)
    names = [column['name'] for column in columns]
    rows = [
        dict(zip(names, (float(value) if isinstance(value, Decimal) else value for value in row)))
        for row in calculate(data)
    ]
    return {
        'nodes': [{'type': 'imports.text', 'label_any': True}],
        'outputs': [{
            'output_node_type': 'export_input',
            'export_destination': f'{case}-result.csv',
            'ordered': True,
            'column_order': 'exact',
            'columns': columns,
            'rows': rows,
        }],
    }


def main():
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--case', choices=MATRICES, default=here.name if here.name in MATRICES else None)
    parser.add_argument('--data', type=Path, default=here / 'data')
    parser.add_argument('--check', action='store_true', help='compare with expected.json alongside data/')
    args = parser.parse_args()
    if args.case is None:
        parser.error('--case is required when running from the source directory')
    expected = expectation(args.case, args.data)
    if args.check:
        path = args.data.parent / 'expected.json'
        if expected != json.loads(path.read_text(encoding='utf-8')):
            parser.exit(1, f'{path}: expectations differ from the CSV oracle\n')
    else:
        print(json.dumps(expected, ensure_ascii=False, indent=2, allow_nan=False))


if __name__ == '__main__':
    main()
