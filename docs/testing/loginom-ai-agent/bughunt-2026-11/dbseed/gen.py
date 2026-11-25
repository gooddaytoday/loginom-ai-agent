#!/usr/bin/env python3
"""Deterministic test data for Loginom DB connection cases: sales schema (customers, products, orders, order_items).

python3 gen.py OUT_DIR  -> customers.csv, products.csv, orders.csv, order_items.csv (UTF-8, comma, header, empty = NULL)
"""
import csv, datetime, random, sys
from pathlib import Path

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
rnd = random.Random(20261125)
regions = ['Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань', 'Нижний Новгород', 'Самара', 'Алтай']
segments = ['Розница', 'Опт', 'Корпоративный']
first = ['Иван', 'Анна', 'Пётр', 'Мария', 'Сергей', 'Ольга', 'Дмитрий', 'Елена', 'Алексей', 'Наталья']
last = ['Иванов', 'Петрова', 'Сидоров', 'Кузнецова', 'Смирнов', 'Попова', 'Волков', 'Соколова', 'Лебедев', 'Морозова']
categories = {'Электроника': (1500, 90000), 'Бытовая техника': (2000, 60000), 'Книги': (150, 2500), 'Продукты': (50, 1500), 'Одежда': (500, 15000)}

def write(name, header, rows):
    with open(out / name, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f); w.writerow(header); w.writerows(rows)

customers = []
for i in range(1, 1001):
    signup = datetime.date(2023, 1, 1) + datetime.timedelta(days=rnd.randrange(0, 1000))
    email = '' if rnd.random() < 0.08 else f'client{i}@example.ru'
    customers.append([i, f'{rnd.choice(first)} {rnd.choice(last)}', rnd.choice(regions), rnd.choice(segments), signup.isoformat(), email])
write('customers.csv', ['customer_id', 'full_name', 'region', 'segment', 'signup_date', 'email'], customers)

products = []
for i in range(1, 201):
    cat = rnd.choice(list(categories)); lo, hi = categories[cat]
    products.append([i, f'{cat} — товар {i}', cat, f'{rnd.uniform(lo, hi):.2f}'])
write('products.csv', ['product_id', 'product_name', 'category', 'list_price'], products)

orders, items = [], []
statuses = ['Выполнен'] * 8 + ['Отменён', 'Возврат']
item_id = 0
for i in range(1, 20001):
    c = customers[rnd.randrange(len(customers))]
    start = datetime.date.fromisoformat(c[4])
    day = start + datetime.timedelta(days=rnd.randrange(0, max(1, (datetime.date(2026, 10, 31) - start).days)))
    orders.append([i, c[0], day.isoformat(), rnd.choice(statuses)])
    for _ in range(rnd.randint(1, 5)):
        item_id += 1
        p = products[rnd.randrange(len(products))]
        price = float(p[3]) * rnd.choice([1, 1, 1, 0.9, 0.85])
        discount = '' if rnd.random() < 0.6 else f'{rnd.choice([5, 10, 15]):d}'
        items.append([item_id, i, p[0], rnd.randint(1, 10), f'{price:.2f}', discount])
write('orders.csv', ['order_id', 'customer_id', 'order_date', 'status'], orders)
write('order_items.csv', ['item_id', 'order_id', 'product_id', 'quantity', 'unit_price', 'discount_pct'], items)
print(len(customers), len(products), len(orders), len(items))
