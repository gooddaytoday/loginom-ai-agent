"""Независимый Decimal-ledger по исходным счетам; экспорт Loginom не используется."""
import csv
from decimal import Decimal
from pathlib import Path

root = Path(__file__).resolve().parent

def read(name):
    with (root / "data" / name).open(encoding="utf-8", newline="") as source:
        return list(csv.DictReader(source, delimiter=";"))

invoices = read("invoices.csv")
payments = read("payments.csv")
credits = read("credit_notes.csv")
rows = []
for customer in sorted({invoice["customer_id"] for invoice in invoices}):
    issued = [invoice for invoice in invoices if invoice["customer_id"] == customer]
    ids = {invoice["invoice_id"] for invoice in issued}
    invoiced = sum((Decimal(invoice["invoice_amount"]) for invoice in issued), Decimal(0))
    paid = sum((Decimal(payment["amount"]) for payment in payments if payment["invoice_id"] in ids and payment["status"] == "posted"), Decimal(0))
    credited = sum((Decimal(credit["amount"]) for credit in credits if credit["invoice_id"] in ids and credit["status"] == "posted"), Decimal(0))
    rows.append([customer, len(issued), invoiced, paid, credited, invoiced - paid - credited])

with (root / "oracle.csv").open("w", encoding="utf-8", newline="") as target:
    writer = csv.writer(target, delimiter=";", lineterminator="\n")
    writer.writerow(["customer_id", "invoices", "invoiced", "paid", "credited", "balance"])
    writer.writerows([*row[:2], *(format(value, ".2f") for value in row[2:])] for row in rows)
