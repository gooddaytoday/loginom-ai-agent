#!/usr/bin/env python3
"""Детерминированный CSV и манифест по JSON-спецификации тестовых данных.

Код выхода 2 — спецификация или отказ перезаписи, файл не пишется.
Код выхода 1 — записанный CSV не сошёлся с планом при повторном чтении.
Код выхода 0 — в stdout краткая JSON-сводка.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path

MAX_ROWS = 1_000_000
MAX_COLUMNS = 1000
LONG_TEXT_LENGTH = 240
NAME_LIMIT = 120
DATA_KINDS = ("Неопределенное", "Непрерывный", "Дискретный")
DEFAULT_DATA_KIND = {
    "integer": "Дискретный",
    "real": "Непрерывный",
    "string": "Дискретный",
    "boolean": "Дискретный",
    "datetime": "Непрерывный",
}
TYPES = set(DEFAULT_DATA_KIND)
GENERATOR_TYPES = {
    "sequence": {"integer"},
    "uuid": {"string"},
    "number": {"integer", "real"},
    "date_range": {"datetime"},
    "date_offset": {"datetime"},
    "choice": {"string"},
    "pattern": {"string"},
    "boolean": {"boolean"},
}
UNIQUE_GENERATORS = {"sequence", "uuid"}
BAD_NUMBER = "BAD"
BAD_DATE = "not-a-date"
TRUE_TEXT = "True"
FALSE_TEXT = "False"


class SpecError(Exception):
    """Спецификация отвергнута до записи файла."""


class VerificationError(Exception):
    """Повторное чтение CSV не совпало с планом."""


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Сгенерировать тестовый CSV и манифест по JSON-спецификации.")
    parser.add_argument("spec", help="Путь к JSON-спецификации")
    parser.add_argument("--output-dir", required=True, help="Каталог для CSV и манифеста")
    parser.add_argument("--overwrite", action="store_true", help="Разрешить замену существующих файлов")
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        code = exc.code
        return code if isinstance(code, int) else 2
    try:
        summary = generate(Path(args.spec), Path(args.output_dir), args.overwrite)
    except SpecError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except VerificationError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


def generate(spec_path: Path, output_dir: Path, overwrite: bool) -> dict:
    spec = load_spec(spec_path)
    rng_seed = spec["seed"]
    # Планирование строк и генерация делят один поток Random: тот же seed даёт те же байты.
    rng = random_of(rng_seed)
    assign_rows(rng, spec)
    columns = spec["columns"]
    table = generate_table(rng, spec)
    apply_anomalies(table, spec)
    expected = [list(row) for row in table]
    check_counts(expected, spec, "План генерации")

    output_dir = output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = output_dir / f"{spec['name']}.csv"
    manifest_path = output_dir / f"{spec['name']}.manifest.json"
    refuse_existing(csv_path, overwrite)
    refuse_existing(manifest_path, overwrite)

    write_csv(csv_path, spec, expected)
    header, reread = read_csv(csv_path, spec)
    if header != [column["name"] for column in columns]:
        csv_path.unlink(missing_ok=True)
        raise VerificationError("Заголовок CSV не совпал с именами колонок спецификации.")
    if reread != expected:
        csv_path.unlink(missing_ok=True)
        raise VerificationError("Повторное чтение CSV не совпало с записанной таблицей.")
    try:
        check_counts(reread, spec, "Повторное чтение CSV")
    except VerificationError:
        csv_path.unlink(missing_ok=True)
        raise

    manifest = build_manifest(spec, csv_path, manifest_path, reread)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "csv": str(csv_path),
        "manifest": str(manifest_path),
        "rows": spec["rows"],
        "clean_rows": clean_row_count(spec),
        "seed": spec["seed"],
        "anomalies": [
            {
                "column": anomaly.get("column"),
                "kind": anomaly["kind"],
                "requested": anomaly["count"],
                "actual": anomaly["count"],
            }
            for anomaly in spec["anomalies"]
        ],
    }


def random_of(seed: int):
    import random

    return random.Random(seed)


def load_spec(path: Path) -> dict:
    if not path.is_file():
        raise SpecError(f"Файл спецификации не найден: {path}")
    try:
        raw = json.loads(path.read_text(encoding="utf-8"), parse_float=Decimal)
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise SpecError(f"Спецификация не читается как JSON: {exc}") from exc
    return normalize_spec(raw)


def normalize_spec(raw: object) -> dict:
    require_object(raw, "Спецификация")
    require_keys(raw, {"name", "rows", "seed", "csv", "columns", "anomalies", "overlap", "key_column"}, {"name", "rows", "columns"}, "Спецификация")
    name = require_ident(raw["name"], "Имя набора")
    rows = require_int(raw["rows"], "rows", 1, MAX_ROWS)
    seed = 42 if "seed" not in raw else require_int(raw["seed"], "seed", None, None)
    overlap = raw.get("overlap", "disjoint")
    if overlap not in ("disjoint", "independent"):
        raise SpecError("Поле overlap должно быть disjoint или independent.")
    csv_settings = normalize_csv(raw.get("csv", {}))
    columns = normalize_columns(raw["columns"], csv_settings)
    names = [column["name"] for column in columns]
    key_column = raw.get("key_column", names[0])
    if key_column not in names:
        raise SpecError(f"Колонка ключа «{key_column}» не найдена.")
    anomalies = normalize_anomalies(raw.get("anomalies", []), columns, rows, overlap, csv_settings)
    spec = {
        "name": name,
        "rows": rows,
        "seed": seed,
        "overlap": overlap,
        "key_column": key_column,
        "csv": csv_settings,
        "columns": columns,
        "anomalies": anomalies,
    }
    validate_anomaly_compatibility(spec)
    return spec


def normalize_csv(raw: object) -> dict:
    if raw == {}:
        raw = {}
    require_object(raw, "Блок csv")
    require_keys(
        raw,
        {"delimiter", "decimal_separator", "null_marker", "text_qualifier", "encoding"},
        set(),
        "Блок csv",
    )
    delimiter = raw.get("delimiter", ";")
    decimal_separator = raw.get("decimal_separator", ".")
    null_marker = raw.get("null_marker", "")
    text_qualifier = raw.get("text_qualifier", '"')
    encoding = raw.get("encoding", "UTF-8")
    if not isinstance(delimiter, str) or len(delimiter) != 1 or delimiter in "\r\n":
        raise SpecError("Разделитель CSV должен быть одним символом и не переводом строки.")
    if decimal_separator not in (".", ","):
        raise SpecError("Десятичный разделитель должен быть точкой или запятой.")
    if delimiter == decimal_separator:
        raise SpecError("Разделитель CSV и десятичный разделитель не должны совпадать.")
    if not isinstance(text_qualifier, str) or len(text_qualifier) != 1:
        raise SpecError("Ограничитель текста должен быть одним символом.")
    if text_qualifier == delimiter:
        raise SpecError("Ограничитель текста не должен совпадать с разделителем CSV.")
    if not isinstance(null_marker, str) or len(null_marker) > 256 or "\n" in null_marker or "\r" in null_marker:
        raise SpecError("Маркер NULL должен быть строкой не длиннее 256 символов без перевода строки.")
    if null_marker != null_marker.strip():
        raise SpecError("Маркер NULL не должен начинаться или заканчиваться пробелом: иначе он совпадёт с аномалией whitespace.")
    if encoding != "UTF-8":
        raise SpecError("В этой версии кодировка только UTF-8.")
    if null_marker in (BAD_NUMBER, BAD_DATE, TRUE_TEXT, FALSE_TEXT):
        raise SpecError(f"Маркер NULL «{null_marker}» совпадает со служебным значением генератора.")
    return {
        "delimiter": delimiter,
        "decimal_separator": decimal_separator,
        "null_marker": null_marker,
        "text_qualifier": text_qualifier,
        "encoding": encoding,
    }


def normalize_columns(raw: object, csv_settings: dict) -> list[dict]:
    if not isinstance(raw, list) or not raw or len(raw) > MAX_COLUMNS:
        raise SpecError(f"Нужен список колонок от 1 до {MAX_COLUMNS}.")
    columns = []
    seen = set()
    for index, item in enumerate(raw, start=1):
        require_object(item, f"Колонка {index}")
        require_keys(item, {"name", "label", "type", "data_kind", "generator"}, {"name", "label", "type", "generator"}, f"Колонка {index}")
        name = require_ident(item["name"], f"Имя колонки {index}")
        if name in seen:
            raise SpecError(f"Имя колонки «{name}» повторяется.")
        seen.add(name)
        label = item["label"]
        if not isinstance(label, str) or not label.strip() or len(label) > NAME_LIMIT:
            raise SpecError(f"Подпись колонки «{name}» должна быть непустой строкой до {NAME_LIMIT} символов.")
        column_type = item["type"]
        if column_type not in TYPES:
            raise SpecError(f"Колонка «{name}»: неизвестный тип «{column_type}».")
        data_kind = item.get("data_kind", DEFAULT_DATA_KIND[column_type])
        if data_kind not in DATA_KINDS:
            raise SpecError(f"Колонка «{name}»: вид данных должен быть одним из: {', '.join(DATA_KINDS)}.")
        generator = normalize_generator(item["generator"], name, column_type)
        columns.append(
            {
                "name": name,
                "label": label,
                "type": column_type,
                "data_kind": data_kind,
                "generator": generator,
            }
        )
    by_name = {column["name"]: column for column in columns}
    for column in columns:
        generator = column["generator"]
        if generator["kind"] != "date_offset":
            continue
        base = by_name.get(generator["base"])
        if base is None:
            raise SpecError(f"Колонка «{column['name']}»: база date_offset «{generator['base']}» не найдена.")
        if base["type"] != "datetime":
            raise SpecError(f"База date_offset «{generator['base']}» должна иметь тип datetime.")
        if base["name"] == column["name"]:
            raise SpecError(f"Колонка «{column['name']}» не может сдвигать саму себя.")
    if cycle_in_offsets(columns):
        raise SpecError("Колонки date_offset образуют цикл.")
    for column in columns:
        if column["generator"]["kind"] == "choice" and csv_settings["null_marker"] in column["generator"]["values"]:
            raise SpecError(f"Колонка «{column['name']}»: значение списка совпадает с маркером NULL.")
    return columns


def normalize_generator(raw: object, column: str, column_type: str) -> dict:
    require_object(raw, f"Генератор колонки «{column}»")
    kind = raw.get("kind")
    if kind not in GENERATOR_TYPES:
        raise SpecError(f"Колонка «{column}»: неизвестный генератор «{kind}».")
    if column_type not in GENERATOR_TYPES[kind]:
        raise SpecError(f"Колонка «{column}»: генератор {kind} не подходит типу {column_type}.")
    where = f"Генератор колонки «{column}»"
    if kind == "sequence":
        require_keys(raw, {"kind", "start", "step"}, {"kind"}, where)
        start = 1 if "start" not in raw else require_int(raw["start"], f"{where}: start", None, None)
        step = 1 if "step" not in raw else require_int(raw["step"], f"{where}: step", None, None)
        if step == 0:
            raise SpecError(f"{where}: шаг sequence не может быть 0.")
        return {"kind": kind, "start": start, "step": step}
    if kind == "uuid":
        require_keys(raw, {"kind"}, {"kind"}, where)
        return {"kind": kind}
    if kind == "number":
        require_keys(raw, {"kind", "min", "max", "distribution", "decimals"}, {"kind", "min", "max"}, where)
        distribution = raw.get("distribution", "uniform")
        if distribution not in ("uniform", "normal", "lognormal"):
            raise SpecError(f"{where}: распределение должно быть uniform, normal или lognormal.")
        low = require_decimal(raw["min"], f"{where}: min")
        high = require_decimal(raw["max"], f"{where}: max")
        if low > high:
            raise SpecError(f"{where}: min больше max.")
        if column_type == "integer":
            if "decimals" in raw and raw["decimals"] not in (0, None):
                raise SpecError(f"{where}: у целой колонки не задают decimals.")
            if low != low.to_integral_value() or high != high.to_integral_value():
                raise SpecError(f"{where}: границы целой колонки должны быть целыми.")
            decimals = None
        else:
            decimals = 2 if "decimals" not in raw else require_int(raw["decimals"], f"{where}: decimals", 0, 8)
        if distribution == "lognormal" and low <= 0:
            raise SpecError(f"{where}: lognormal требует min больше 0.")
        return {
            "kind": kind,
            "min": json_number(low, column_type == "integer"),
            "max": json_number(high, column_type == "integer"),
            "distribution": distribution,
            "decimals": decimals,
        }
    if kind == "date_range":
        require_keys(raw, {"kind", "from", "to", "with_time"}, {"kind", "from", "to"}, where)
        start = require_date(raw["from"], f"{where}: from")
        end = require_date(raw["to"], f"{where}: to")
        if start > end:
            raise SpecError(f"{where}: from позже to.")
        with_time = infer_with_time(raw, start, end)
        return {"kind": kind, "from": format_date(start, with_time), "to": format_date(end, with_time), "with_time": with_time}
    if kind == "date_offset":
        require_keys(raw, {"kind", "base", "min_days", "max_days", "with_time"}, {"kind", "base"}, where)
        base = raw["base"]
        if not isinstance(base, str) or not base:
            raise SpecError(f"{where}: поле base должно называть колонку.")
        min_days = 0 if "min_days" not in raw else require_int(raw["min_days"], f"{where}: min_days", None, None)
        max_days = 30 if "max_days" not in raw else require_int(raw["max_days"], f"{where}: max_days", None, None)
        if min_days > max_days:
            raise SpecError(f"{where}: min_days больше max_days.")
        result = {"kind": kind, "base": base, "min_days": min_days, "max_days": max_days}
        if "with_time" in raw:
            if not isinstance(raw["with_time"], bool):
                raise SpecError(f"{where}: with_time должен быть логическим.")
            result["with_time"] = raw["with_time"]
        return result
    if kind == "choice":
        require_keys(raw, {"kind", "values", "weights"}, {"kind", "values"}, where)
        values = raw["values"]
        if not isinstance(values, list) or not values or len(values) > 200:
            raise SpecError(f"{where}: values должен содержать от 1 до 200 строк.")
        texts = []
        for value in values:
            if not isinstance(value, str) or value == "" or len(value) >= 200:
                raise SpecError(f"{where}: каждое значение — непустая строка короче 200 символов.")
            if value != value.strip():
                raise SpecError(f"{where}: значение не должно начинаться или заканчиваться пробелом.")
            texts.append(value)
        if len(set(texts)) != len(texts):
            raise SpecError(f"{where}: значения списка повторяются.")
        weights = None
        if "weights" in raw:
            weights = raw["weights"]
            if not isinstance(weights, list) or len(weights) != len(texts):
                raise SpecError(f"{where}: длина weights должна совпадать с values.")
            parsed = []
            for weight in weights:
                number = require_decimal(weight, f"{where}: weight")
                if number <= 0:
                    raise SpecError(f"{where}: веса должны быть больше 0.")
                parsed.append(float(number))
            weights = parsed
        result = {"kind": kind, "values": texts}
        if weights is not None:
            result["weights"] = weights
        return result
    if kind == "pattern":
        require_keys(raw, {"kind", "template"}, {"kind", "template"}, where)
        template = raw["template"]
        if not isinstance(template, str) or "#" not in template or len(template) > 80:
            raise SpecError(f"{where}: шаблон должен содержать # и быть не длиннее 80 символов.")
        return {"kind": kind, "template": template}
    require_keys(raw, {"kind", "true_weight"}, {"kind"}, where)
    true_weight = 0.5 if "true_weight" not in raw else require_decimal(raw["true_weight"], f"{where}: true_weight")
    if true_weight < 0 or true_weight > 1:
        raise SpecError(f"{where}: true_weight должен быть от 0 до 1.")
    return {"kind": kind, "true_weight": float(true_weight)}


def normalize_anomalies(raw: object, columns: list[dict], rows: int, overlap: str, csv_settings: dict) -> list[dict]:
    if raw is None:
        raw = []
    if not isinstance(raw, list):
        raise SpecError("Поле anomalies должно быть списком.")
    by_name = {column["name"]: column for column in columns}
    anomalies = []
    seen = set()
    for index, item in enumerate(raw, start=1):
        where = f"Аномалия {index}"
        require_object(item, where)
        require_keys(item, {"column", "kind", "share", "count"}, {"kind"}, where)
        kind = item["kind"]
        if kind not in ANOMALY_COLUMNS:
            raise SpecError(f"{where}: неизвестный вид «{kind}».")
        column_name = item.get("column")
        if kind == "duplicate_row":
            if column_name is not None:
                raise SpecError(f"{where}: duplicate_row задаётся на всю строку, без column.")
            column = None
        else:
            if not isinstance(column_name, str) or column_name not in by_name:
                raise SpecError(f"{where}: колонка «{column_name}» не найдена.")
            column = by_name[column_name]
            if column["type"] not in ANOMALY_COLUMNS[kind]:
                raise SpecError(f"Аномалия {kind} неприменима к колонке «{column_name}» типа {column['type']}.")
        identity = (column_name, kind)
        if identity in seen:
            raise SpecError(f"{where}: сочетание {kind} и «{column_name}» уже задано.")
        seen.add(identity)
        count, share = resolve_count(item, rows, where)
        anomaly = {"kind": kind, "count": count, "rows": []}
        if column_name is not None:
            anomaly["column"] = column_name
        if share is not None:
            anomaly["share"] = share
        anomalies.append(anomaly)
    if any(item["kind"] == "empty" for item in anomalies) and csv_settings["null_marker"] == "":
        raise SpecError("Аномалия empty невозможна: маркер NULL уже пустой, пустое поле неотличимо от NULL.")
    total = sum(item["count"] for item in anomalies)
    if overlap == "disjoint" and total > rows:
        raise SpecError(f"Сумма аномалий ({total}) больше числа строк ({rows}) в режиме disjoint.")
    per_column: dict[str, int] = defaultdict(int)
    full = sum(item["count"] for item in anomalies if item["kind"] == "duplicate_row")
    for item in anomalies:
        if item["kind"] == "duplicate_row":
            continue
        per_column[item["column"]] += item["count"]
    for column_name, count in per_column.items():
        if count + full > rows:
            raise SpecError(f"Для колонки «{column_name}» не хватает строк под аномалии: нужно {count + full}, всего строк {rows}.")
    if full > rows:
        raise SpecError(f"Аномалия duplicate_row просит {full} строк при доступных {rows}.")
    duplicate_keys = [item for item in anomalies if item["kind"] == "duplicate_key"]
    duplicate_rows = [item for item in anomalies if item["kind"] == "duplicate_row"]
    if len(columns) == 1 and duplicate_keys and duplicate_rows:
        raise SpecError("На таблице из одной колонки duplicate_key уже создаёт полные дубли. Не сочетайте её с duplicate_row.")
    return anomalies


# Виды аномалий и типы колонок, к которым они применимы. duplicate_row колонки не имеет.
ANOMALY_COLUMNS = {
    "null": TYPES,
    "empty": TYPES,
    "negative": {"integer", "real"},
    "zero": {"integer", "real"},
    "outlier": {"integer", "real", "datetime"},
    "out_of_range": {"integer", "real", "datetime"},
    "boundary": {"integer", "real", "datetime"},
    "future_date": {"datetime"},
    "bad_format": {"integer", "real", "datetime"},
    "unknown_category": {"string"},
    "whitespace": {"string"},
    "case_variant": {"string"},
    "long_text": {"string"},
    "duplicate_key": {"integer", "string"},
    "duplicate_row": set(),
}


def resolve_count(item: dict, rows: int, where: str) -> tuple[int, float | None]:
    has_share = "share" in item
    has_count = "count" in item
    if has_share == has_count:
        raise SpecError(f"{where}: укажите ровно одно из полей share и count.")
    if has_count:
        count = require_int(item["count"], f"{where}: count", 1, rows)
        return count, None
    share = require_decimal(item["share"], f"{where}: share")
    if share <= 0 or share > 1:
        raise SpecError(f"{where}: доля share должна быть больше 0 и не больше 1.")
    count = int((share * rows).to_integral_value(rounding=ROUND_HALF_UP))
    if count < 1:
        raise SpecError(f"{where}: доля округляется к нулю строк. Увеличьте share или rows.")
    if count > rows:
        raise SpecError(f"{where}: доля даёт {count} строк при доступных {rows}.")
    return count, float(share)


def validate_anomaly_compatibility(spec: dict) -> None:
    columns = {column["name"]: column for column in spec["columns"]}
    null_marker = spec["csv"]["null_marker"]
    for anomaly in spec["anomalies"]:
        kind = anomaly["kind"]
        if kind == "duplicate_row":
            continue
        column = columns[anomaly["column"]]
        generator = column["generator"]
        where = f"Колонка «{column['name']}», аномалия {kind}"
        if kind == "duplicate_key" and generator["kind"] not in UNIQUE_GENERATORS:
            raise SpecError(f"{where}: нужен генератор sequence или uuid, иначе дубли ключа неоднозначны.")
        if kind in ("unknown_category", "case_variant") and generator["kind"] != "choice":
            raise SpecError(f"{where}: нужна колонка со списком choice.")
        if kind == "case_variant" and not any(value.casefold() != value or value.upper() != value for value in generator["values"]):
            varied = [vary_case(value) for value in generator["values"]]
            if all(item == source for item, source in zip(varied, generator["values"])):
                raise SpecError(f"{where}: ни одно значение списка не меняется по регистру.")
        if kind == "boundary" and generator["kind"] not in ("number", "date_range", "date_offset"):
            raise SpecError(f"{where}: boundary поддерживается для number, date_range и date_offset.")
        if kind in ("outlier", "out_of_range") and generator["kind"] not in ("number", "sequence", "date_range", "date_offset"):
            raise SpecError(f"{where}: для этого генератора нет числового или временного диапазона.")
        if kind == "future_date" and generator["kind"] not in ("date_range", "date_offset"):
            raise SpecError(f"{where}: future_date поддерживается для date_range и date_offset.")
        if kind == "negative":
            ensure_positive_domain(column, where, spec["rows"])
        if kind == "zero":
            ensure_not_only_zero(column, where, spec["rows"])
        if kind == "boundary":
            ensure_boundary_room(column, where)
        if generator["kind"] == "number" and null_marker == format_number(Decimal(0), column, spec["csv"]["decimal_separator"]) and kind == "zero":
            raise SpecError(f"{where}: маркер NULL совпадает с нулём.")
        if kind == "zero" and kind_pair(spec, column["name"], "boundary") and boundary_includes_zero(column):
            raise SpecError(f"{where}: граница диапазона равна нулю, zero и boundary неразличимы.")


def ensure_positive_domain(column: dict, where: str, rows: int) -> None:
    generator = column["generator"]
    if generator["kind"] == "number" and Decimal(str(generator["min"])) < 0:
        raise SpecError(f"{where}: генератор уже может давать отрицательные значения, доля negative неоднозначна.")
    if generator["kind"] == "number" and Decimal(str(generator["max"])) <= 0:
        raise SpecError(f"{where}: в диапазоне нет положительного чистого значения.")
    if generator["kind"] == "sequence":
        low, _high = sequence_bounds(generator, rows)
        if low < 0:
            raise SpecError(f"{where}: sequence уходит в отрицательные значения. Поднимите start.")


def ensure_not_only_zero(column: dict, where: str, rows: int) -> None:
    generator = column["generator"]
    if generator["kind"] == "number" and Decimal(str(generator["min"])) == 0 and Decimal(str(generator["max"])) == 0:
        raise SpecError(f"{where}: диапазон состоит только из нуля.")
    if generator["kind"] == "sequence":
        low, high = sequence_bounds(generator, rows)
        if low <= 0 <= high:
            raise SpecError(f"{where}: sequence проходит через 0, доля zero неоднозначна.")


def ensure_boundary_room(column: dict, where: str) -> None:
    generator = column["generator"]
    if generator["kind"] == "number" and Decimal(str(generator["min"])) == Decimal(str(generator["max"])):
        raise SpecError(f"{where}: min равен max, внутренней точки диапазона нет.")
    if generator["kind"] == "date_range" and generator["from"] == generator["to"]:
        raise SpecError(f"{where}: from равен to, внутренней даты нет.")
    if generator["kind"] == "date_offset" and generator["min_days"] == generator["max_days"]:
        raise SpecError(f"{where}: min_days равен max_days, внутреннего сдвига нет.")


def boundary_includes_zero(column: dict) -> bool:
    generator = column["generator"]
    if generator["kind"] != "number":
        return False
    return Decimal(str(generator["min"])) == 0 or Decimal(str(generator["max"])) == 0


def kind_pair(spec: dict, column: str, kind: str) -> bool:
    return any(item["kind"] == kind and item.get("column") == column for item in spec["anomalies"])


def assign_rows(rng, spec: dict) -> None:
    rows = spec["rows"]
    used: set[int] = set()
    used_by_column: dict[str, set[int]] = defaultdict(set)
    full_rows: set[int] = set()
    for anomaly in spec["anomalies"]:
        if spec["overlap"] == "disjoint":
            blocked = used
        elif anomaly["kind"] == "duplicate_row":
            blocked = set(full_rows)
            for rows_of_column in used_by_column.values():
                blocked.update(rows_of_column)
        else:
            blocked = set(used_by_column[anomaly["column"]]) | full_rows
        available = [index for index in range(rows) if index not in blocked]
        if len(available) < anomaly["count"]:
            target = anomaly.get("column", "строка")
            raise SpecError(f"Не хватает свободных строк для аномалии {anomaly['kind']} ({target}): нужно {anomaly['count']}, свободно {len(available)}.")
        chosen = rng.sample(available, anomaly["count"])
        anomaly["rows"] = sorted(chosen)
        used.update(chosen)
        if anomaly["kind"] == "duplicate_row":
            full_rows.update(chosen)
        else:
            used_by_column[anomaly["column"]].update(chosen)
    if any(item["kind"] in ("duplicate_key", "duplicate_row") for item in spec["anomalies"]):
        if len(used) >= rows:
            raise SpecError("Не осталось чистой строки, чтобы взять исходное значение для дублирования.")


def generate_table(rng, spec: dict) -> list[list[str]]:
    columns = spec["columns"]
    order = generation_order(columns)
    index_by_name = {column["name"]: index for index, column in enumerate(columns)}
    table = [[""] * len(columns) for _ in range(spec["rows"])]
    blocked = blocked_patterns(spec)
    for row_index in range(spec["rows"]):
        values: dict[str, str] = {}
        for column in order:
            values[column["name"]] = generate_cell(rng, column, values, row_index, spec, blocked.get(column["name"], set()))
        for name, value in values.items():
            table[row_index][index_by_name[name]] = value
    return table


def blocked_patterns(spec: dict) -> dict[str, set[str]]:
    """Тексты, которые чистая строка не имеет права выдать, иначе счётчик аномалии разъедется."""
    blocked: dict[str, set[str]] = defaultdict(set)
    null_marker = spec["csv"]["null_marker"]
    for column in spec["columns"]:
        kinds = {item["kind"] for item in spec["anomalies"] if item.get("column") == column["name"]}
        if "null" in kinds:
            blocked[column["name"]].add(null_marker)
        if "empty" in kinds:
            blocked[column["name"]].add("")
        if "bad_format" in kinds:
            blocked[column["name"]].add(BAD_DATE if column["type"] == "datetime" else BAD_NUMBER)
        if "long_text" in kinds:
            blocked[column["name"]].add(long_text_value())
        if "unknown_category" in kinds:
            blocked[column["name"]].add(unknown_token(column, null_marker))
    return blocked


def generate_cell(rng, column: dict, ready: dict[str, str], row_index: int, spec: dict, blocked: set[str]) -> str:
    generator = column["generator"]
    kind = generator["kind"]
    separator = spec["csv"]["decimal_separator"]
    kinds = {item["kind"] for item in spec["anomalies"] if item.get("column") == column["name"]}
    if kind == "sequence":
        value = generator["start"] + generator["step"] * row_index
        return ensure_clean(str(value), column, blocked, kinds)
    if kind == "uuid":
        return ensure_clean(str(uuid.UUID(int=rng.getrandbits(128))), column, blocked, kinds)
    if kind == "boolean":
        text = TRUE_TEXT if rng.random() < generator["true_weight"] else FALSE_TEXT
        return ensure_clean(text, column, blocked, kinds)
    if kind == "choice":
        weights = generator.get("weights")
        text = rng.choices(generator["values"], weights=weights, k=1)[0]
        return ensure_clean(text, column, blocked, kinds)
    if kind == "pattern":
        chars = [str(rng.randrange(10)) if char == "#" else char for char in generator["template"]]
        return ensure_clean("".join(chars), column, blocked, kinds)
    if kind == "date_range":
        return draw_date_range(rng, column, kinds, blocked)
    if kind == "date_offset":
        return draw_date_offset(rng, column, ready, kinds, blocked)
    return draw_number(rng, column, separator, kinds, blocked)


def ensure_clean(text: str, column: dict, blocked: set[str], kinds: set[str]) -> str:
    if text in blocked or ( "whitespace" in kinds and text != text.strip()) or ("long_text" in kinds and len(text) >= 200):
        raise SpecError(f"Чистое значение колонки «{column['name']}» совпало с аномалией. Измените генератор или маркер NULL.")
    return text


def draw_number(rng, column: dict, separator: str, kinds: set[str], blocked: set[str]) -> str:
    generator = column["generator"]
    low = Decimal(str(generator["min"]))
    high = Decimal(str(generator["max"]))
    avoid_ends = "boundary" in kinds
    if column["type"] == "integer" and generator["distribution"] == "uniform":
        lo = int(low) + (1 if avoid_ends else 0)
        hi = int(high) - (1 if avoid_ends else 0)
        if "negative" in kinds:
            lo = max(lo, 1)
        if lo > hi:
            raise SpecError(f"Колонка «{column['name']}»: после исключений аномалий не осталось целых значений.")
        for _ in range(1000):
            candidate = lo if lo == hi else rng.randint(lo, hi)
            if "zero" in kinds and candidate == 0:
                continue
            text = str(candidate)
            if text not in blocked:
                return text
        raise SpecError(f"Колонка «{column['name']}»: не удалось получить чистое целое значение.")
    for _ in range(1000):
        raw = sample_distribution(rng, generator, low, high)
        if column["type"] == "integer":
            raw = raw.to_integral_value(rounding=ROUND_HALF_UP)
        if raw < low or raw > high:
            continue
        text = format_number(raw, column, separator)
        parsed = parse_number(text, separator)
        if parsed < low or parsed > high:
            continue
        if avoid_ends and (parsed == low or parsed == high):
            continue
        if "zero" in kinds and parsed == 0:
            continue
        if "negative" in kinds and parsed <= 0:
            continue
        if text in blocked or len(text) >= 200:
            continue
        return text
    raise SpecError(f"Колонка «{column['name']}»: не удалось получить чистое число в заданном диапазоне.")


def sample_distribution(rng, generator: dict, low: Decimal, high: Decimal) -> Decimal:
    distribution = generator["distribution"]
    if distribution == "uniform":
        return Decimal(str(rng.uniform(float(low), float(high))))
    if distribution == "normal":
        mu = float((low + high) / 2)
        sigma = float((high - low) / 6) or 1.0
        return Decimal(str(rng.gauss(mu, sigma)))
    mu = (math.log(float(low)) + math.log(float(high))) / 2
    sigma = (math.log(float(high)) - math.log(float(low))) / 6 or 0.1
    return Decimal(str(rng.lognormvariate(mu, sigma)))


def draw_date_range(rng, column: dict, kinds: set[str], blocked: set[str]) -> str:
    generator = column["generator"]
    start = parse_date(generator["from"])
    end = parse_date(generator["to"])
    avoid_ends = "boundary" in kinds
    span = int((end - start).total_seconds())
    if avoid_ends and span < 1:
        raise SpecError(f"Колонка «{column['name']}»: в диапазоне нет внутренней даты.")
    for _ in range(1000):
        if generator["with_time"]:
            offset = rng.randrange(1, span) if avoid_ends else rng.randrange(span + 1)
            moment = start + timedelta(seconds=offset)
        else:
            lo = start.toordinal() + (1 if avoid_ends else 0)
            hi = end.toordinal() - (1 if avoid_ends else 0)
            if lo > hi:
                raise SpecError(f"Колонка «{column['name']}»: в диапазоне нет внутренней даты.")
            moment = datetime.fromordinal(rng.randint(lo, hi))
        text = format_date(moment, generator["with_time"])
        if text not in blocked:
            return text
    raise SpecError(f"Колонка «{column['name']}»: не удалось получить чистую дату.")


def draw_date_offset(rng, column: dict, ready: dict[str, str], kinds: set[str], blocked: set[str]) -> str:
    generator = column["generator"]
    base = parse_date(ready[generator["base"]])
    with_time = generator.get("with_time", "T" in ready[generator["base"]])
    low = generator["min_days"]
    high = generator["max_days"]
    if "boundary" in kinds:
        low += 1
        high -= 1
    if low > high:
        raise SpecError(f"Колонка «{column['name']}»: после исключения границ не осталось сдвига.")
    for _ in range(100):
        days = low if low == high else rng.randint(low, high)
        moment = base + timedelta(days=days)
        if with_time and generator.get("with_time"):
            moment = moment.replace(hour=rng.randrange(24), minute=rng.randrange(60), second=rng.randrange(60))
        text = format_date(moment, with_time)
        if text not in blocked and (parse_date(text) >= base or generator["min_days"] < 0):
            return text
    raise SpecError(f"Колонка «{column['name']}»: не удалось получить сдвиг даты.")


def apply_anomalies(table: list[list[str]], spec: dict) -> None:
    columns = spec["columns"]
    index_by_name = {column["name"]: index for index, column in enumerate(columns)}
    used = {row for anomaly in spec["anomalies"] for row in anomaly["rows"]}
    sources = [index for index in range(spec["rows"]) if index not in used]
    cell_anomalies = [item for item in spec["anomalies"] if item["kind"] not in ("duplicate_key", "duplicate_row")]
    for anomaly in cell_anomalies:
        column = columns[index_by_name[anomaly["column"]]]
        column_index = index_by_name[anomaly["column"]]
        for position, row_index in enumerate(anomaly["rows"]):
            table[row_index][column_index] = anomaly_value(table, spec, anomaly, column, position, row_index)
    for anomaly in spec["anomalies"]:
        if anomaly["kind"] != "duplicate_key":
            continue
        column_index = index_by_name[anomaly["column"]]
        pairs = []
        for position, row_index in enumerate(anomaly["rows"]):
            source = sources[position % len(sources)]
            table[row_index][column_index] = table[source][column_index]
            pairs.append((row_index, source))
        anomaly["pairs"] = pairs
    duplicate_rows = [item for item in spec["anomalies"] if item["kind"] == "duplicate_row"]
    if duplicate_rows and len(columns) > 1:
        seen = {tuple(row) for row in table}
        if len(seen) != len(table):
            raise SpecError("Строки совпали целиком ещё до duplicate_row, поэтому число дублей было бы неоднозначным. Добавьте уникальную колонку.")
    for anomaly in duplicate_rows:
        pairs = []
        for position, row_index in enumerate(anomaly["rows"]):
            source = sources[position % len(sources)]
            table[row_index] = list(table[source])
            pairs.append((row_index, source))
        anomaly["pairs"] = pairs


def anomaly_value(table, spec: dict, anomaly: dict, column: dict, position: int, row_index: int) -> str:
    kind = anomaly["kind"]
    separator = spec["csv"]["decimal_separator"]
    generator = column["generator"]
    if kind == "null":
        return spec["csv"]["null_marker"]
    if kind == "empty":
        return ""
    if kind == "bad_format":
        return BAD_DATE if column["type"] == "datetime" else BAD_NUMBER
    if kind == "long_text":
        return long_text_value()
    if kind == "unknown_category":
        return unknown_token(column, spec["csv"]["null_marker"])
    if kind == "whitespace":
        return f"  {table[row_index][column_index_of(spec, column['name'])]}  "
    if kind == "case_variant":
        return vary_case(table[row_index][column_index_of(spec, column["name"])])
    if kind == "negative":
        current = parse_number(table[row_index][column_index_of(spec, column["name"])], separator)
        negated = -abs(current)
        if negated == 0:
            negated = Decimal(-1)
        return format_number(negated, column, separator)
    if kind == "zero":
        return format_number(Decimal(0), column, separator)
    if kind == "boundary":
        return boundary_text(table, spec, column, row_index, position)
    if kind == "out_of_range":
        return outside_text(table, spec, column, row_index, gap=1)
    if kind == "outlier":
        return outside_text(table, spec, column, row_index, gap=1000)
    if kind == "future_date":
        return future_text(table, spec, column, row_index)
    raise SpecError(f"Не удалось построить аномалию {kind}.")


def boundary_text(table, spec: dict, column: dict, row_index: int, position: int) -> str:
    use_min = position % 2 == 0
    generator = column["generator"]
    separator = spec["csv"]["decimal_separator"]
    if generator["kind"] == "number":
        raw = Decimal(str(generator["min"] if use_min else generator["max"]))
        return format_number(raw, column, separator)
    if generator["kind"] == "date_range":
        return generator["from"] if use_min else generator["to"]
    base = parse_date(table[row_index][column_index_of(spec, generator["base"])])
    days = generator["min_days"] if use_min else generator["max_days"]
    with_time = generator.get("with_time", "T" in table[row_index][column_index_of(spec, generator["base"])])
    return format_date(base + timedelta(days=days), with_time)


def outside_text(table, spec: dict, column: dict, row_index: int, gap: int) -> str:
    generator = column["generator"]
    separator = spec["csv"]["decimal_separator"]
    if generator["kind"] == "number":
        high = Decimal(str(generator["max"]))
        return format_number(high + Decimal(gap), column, separator)
    if generator["kind"] == "sequence":
        _low, high = sequence_bounds(generator, spec["rows"])
        return str(high + gap)
    if generator["kind"] == "date_range":
        end = parse_date(generator["to"])
        return format_date(end + timedelta(days=gap), generator["with_time"])
    base_index = column_index_of(spec, generator["base"])
    base = parse_date(table[row_index][base_index])
    with_time = generator.get("with_time", "T" in table[row_index][base_index])
    return format_date(base + timedelta(days=generator["max_days"] + gap), with_time)


def future_text(table, spec: dict, column: dict, row_index: int) -> str:
    generator = column["generator"]
    if generator["kind"] == "date_range":
        end = parse_date(generator["to"])
        return format_date(end + timedelta(days=30), generator["with_time"])
    base_index = column_index_of(spec, generator["base"])
    base = parse_date(table[row_index][base_index])
    with_time = generator.get("with_time", "T" in table[row_index][base_index])
    return format_date(base + timedelta(days=generator["max_days"] + 30), with_time)


def check_counts(table: list[list[str]], spec: dict, source: str) -> None:
    duplicate_row_count = sum(item["count"] for item in spec["anomalies"] if item["kind"] == "duplicate_row")
    for anomaly in spec["anomalies"]:
        actual = phenomenon_count(table, spec, anomaly, duplicate_row_count)
        if actual != anomaly["count"]:
            column = anomaly.get("column", "")
            place = f"колонки «{column}»" if column else "таблицы"
            raise VerificationError(
                f"{source}: аномалия {anomaly['kind']} {place} встретилась {actual} раз, ожидалось {anomaly['count']}."
            )


def phenomenon_count(table: list[list[str]], spec: dict, anomaly: dict, duplicate_row_count: int) -> int:
    kind = anomaly["kind"]
    if kind == "duplicate_row":
        extras = len(table) - len({tuple(row) for row in table})
        duplicate_key_count = sum(item["count"] for item in spec["anomalies"] if item["kind"] == "duplicate_key")
        if len(spec["columns"]) == 1:
            return extras - duplicate_key_count
        return extras
    column_index = column_index_of(spec, anomaly["column"])
    column = spec["columns"][column_index]
    separator = spec["csv"]["decimal_separator"]
    values = [row[column_index] for row in table]
    if kind == "duplicate_key":
        extras = len(values) - len(set(values))
        return extras - duplicate_row_count
    if kind == "null":
        return sum(value == spec["csv"]["null_marker"] for value in values)
    if kind == "empty":
        return sum(value == "" for value in values)
    if kind == "bad_format":
        token = BAD_DATE if column["type"] == "datetime" else BAD_NUMBER
        return sum(value == token for value in values)
    if kind == "long_text":
        return sum(len(value) >= 200 for value in values)
    if kind == "unknown_category":
        token = unknown_token(column, spec["csv"]["null_marker"])
        return sum(value == token for value in values)
    if kind == "whitespace":
        return sum(value != value.strip() for value in values)
    if kind == "case_variant":
        choices = column["generator"]["values"]
        folded = {item.casefold(): item for item in choices}
        return sum(value.casefold() in folded and value not in choices for value in values)
    if kind == "negative":
        return sum(is_number(value, separator) and parse_number(value, separator) < 0 for value in values)
    if kind == "zero":
        return sum(is_number(value, separator) and parse_number(value, separator) == 0 for value in values)
    if kind == "boundary":
        return sum(is_boundary(table, spec, column, row_index, value) for row_index, value in enumerate(values))
    if kind == "out_of_range":
        return sum(is_outside(table, spec, column, row_index, value, gap=1) for row_index, value in enumerate(values))
    if kind == "outlier":
        return sum(is_outside(table, spec, column, row_index, value, gap=1000) for row_index, value in enumerate(values))
    if kind == "future_date":
        return sum(is_future(table, spec, column, row_index, value) for row_index, value in enumerate(values))
    return 0


def is_boundary(table, spec, column, row_index: int, value: str) -> bool:
    generator = column["generator"]
    separator = spec["csv"]["decimal_separator"]
    if generator["kind"] == "number":
        ends = {
            format_number(Decimal(str(generator["min"])), column, separator),
            format_number(Decimal(str(generator["max"])), column, separator),
        }
        return value in ends
    if generator["kind"] == "date_range":
        return value in (generator["from"], generator["to"])
    if not is_date(value) or not is_date(table[row_index][column_index_of(spec, generator["base"])]):
        return False
    delta = (parse_date(value) - parse_date(table[row_index][column_index_of(spec, generator["base"])])).days
    return delta in (generator["min_days"], generator["max_days"])


def is_outside(table, spec, column, row_index: int, value: str, gap: int) -> bool:
    generator = column["generator"]
    separator = spec["csv"]["decimal_separator"]
    if generator["kind"] == "number":
        return value == format_number(Decimal(str(generator["max"])) + Decimal(gap), column, separator)
    if generator["kind"] == "sequence":
        _low, high = sequence_bounds(generator, spec["rows"])
        return value == str(high + gap)
    if generator["kind"] == "date_range":
        expected = format_date(parse_date(generator["to"]) + timedelta(days=gap), generator["with_time"])
        return value == expected
    base_text = table[row_index][column_index_of(spec, generator["base"])]
    if not is_date(value) or not is_date(base_text):
        return False
    return (parse_date(value) - parse_date(base_text)).days == generator["max_days"] + gap


def is_future(table, spec, column, row_index: int, value: str) -> bool:
    generator = column["generator"]
    if generator["kind"] == "date_range":
        expected = format_date(parse_date(generator["to"]) + timedelta(days=30), generator["with_time"])
        return value == expected
    base_text = table[row_index][column_index_of(spec, generator["base"])]
    if not is_date(value) or not is_date(base_text):
        return False
    return (parse_date(value) - parse_date(base_text)).days == generator["max_days"] + 30


def write_csv(path: Path, spec: dict, table: list[list[str]]) -> None:
    settings = spec["csv"]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(
            handle,
            delimiter=settings["delimiter"],
            quotechar=settings["text_qualifier"],
            lineterminator="\n",
            quoting=csv.QUOTE_MINIMAL,
        )
        writer.writerow([column["name"] for column in spec["columns"]])
        writer.writerows(table)


def read_csv(path: Path, spec: dict) -> tuple[list[str], list[list[str]]]:
    settings = spec["csv"]
    with path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter=settings["delimiter"], quotechar=settings["text_qualifier"])
        rows = list(reader)
    if not rows:
        raise VerificationError("CSV пуст.")
    return rows[0], rows[1:]


def build_manifest(spec: dict, csv_path: Path, manifest_path: Path, table: list[list[str]]) -> dict:
    key_index = column_index_of(spec, spec["key_column"])
    anomalies = []
    for anomaly in spec["anomalies"]:
        record = {
            "column": anomaly.get("column"),
            "kind": anomaly["kind"],
            "requested": anomaly["count"],
            "actual": anomaly["count"],
            "rows": [row + 1 for row in anomaly["rows"]],
            "keys": [table[row][key_index] for row in anomaly["rows"]],
        }
        if "share" in anomaly:
            record["share"] = anomaly["share"]
        if "pairs" in anomaly:
            record["source_rows"] = [source + 1 for _dest, source in anomaly["pairs"]]
        anomalies.append(record)
    return {
        "schema_version": "test_data.manifest.v1",
        "seed": spec["seed"],
        "rows": spec["rows"],
        "clean_rows": clean_row_count(spec),
        "spec": public_spec(spec),
        "files": {"csv": str(csv_path), "manifest": str(manifest_path)},
        "loginom_import": {
            "source": {"encoding": "UTF-8", "rows_to_skip": 0, "first_line_as_title": True},
            "format": {
                "delimiter": spec["csv"]["delimiter"],
                "decimal_separator": spec["csv"]["decimal_separator"],
                "null_marker": spec["csv"]["null_marker"],
                "text_qualifier": spec["csv"]["text_qualifier"],
            },
            "columns": [
                {
                    "name": column["name"],
                    "label": column["label"],
                    "type": column["type"],
                    "data_kind": column["data_kind"],
                    "used": True,
                }
                for column in spec["columns"]
            ],
        },
        "anomalies": anomalies,
        "column_stats": column_stats(table, spec),
    }


def public_spec(spec: dict) -> dict:
    anomalies = []
    for anomaly in spec["anomalies"]:
        item = {"kind": anomaly["kind"], "count": anomaly["count"]}
        if "column" in anomaly:
            item["column"] = anomaly["column"]
        if "share" in anomaly:
            item["share"] = anomaly["share"]
        anomalies.append(item)
    return {
        "name": spec["name"],
        "rows": spec["rows"],
        "seed": spec["seed"],
        "overlap": spec["overlap"],
        "key_column": spec["key_column"],
        "csv": dict(spec["csv"]),
        "columns": [
            {
                "name": column["name"],
                "label": column["label"],
                "type": column["type"],
                "data_kind": column["data_kind"],
                "generator": column["generator"],
            }
            for column in spec["columns"]
        ],
        "anomalies": anomalies,
    }


def column_stats(table: list[list[str]], spec: dict) -> dict:
    separator = spec["csv"]["decimal_separator"]
    stats = {}
    for index, column in enumerate(spec["columns"]):
        values = [row[index] for row in table]
        item = {"nulls": sum(value == spec["csv"]["null_marker"] for value in values)}
        if column["type"] in ("integer", "real"):
            numbers = [parse_number(value, separator) for value in values if is_number(value, separator)]
            if numbers:
                item["min"] = format_number(min(numbers), column, separator)
                item["max"] = format_number(max(numbers), column, separator)
        elif column["type"] == "datetime":
            dated = sorted(value for value in values if is_date(value))
            if dated:
                item["min"] = dated[0]
                item["max"] = dated[-1]
        else:
            item["distinct"] = len(set(values))
        stats[column["name"]] = item
    return stats


def clean_row_count(spec: dict) -> int:
    used = {row for anomaly in spec["anomalies"] for row in anomaly["rows"]}
    return spec["rows"] - len(used)


def generation_order(columns: list[dict]) -> list[dict]:
    pending = list(columns)
    done: list[dict] = []
    done_names: set[str] = set()
    while pending:
        ready = [
            column
            for column in pending
            if column["generator"]["kind"] != "date_offset" or column["generator"]["base"] in done_names
        ]
        if not ready:
            raise SpecError("Колонки date_offset образуют цикл.")
        done.append(ready[0])
        done_names.add(ready[0]["name"])
        pending.remove(ready[0])
    return done


def cycle_in_offsets(columns: list[dict]) -> bool:
    try:
        generation_order(columns)
    except SpecError:
        return True
    return False


def column_index_of(spec: dict, name: str) -> int:
    for index, column in enumerate(spec["columns"]):
        if column["name"] == name:
            return index
    raise SpecError(f"Колонка «{name}» не найдена.")


def sequence_bounds(generator: dict, rows: int) -> tuple[int, int]:
    start = generator["start"]
    end = start + generator["step"] * (rows - 1)
    return min(start, end), max(start, end)


def format_number(value: Decimal, column: dict, separator: str) -> str:
    decimals = column["generator"].get("decimals") if column["generator"]["kind"] == "number" else None
    if column["type"] == "integer" or decimals is None:
        text = str(value.to_integral_value(rounding=ROUND_HALF_UP))
    else:
        quant = Decimal("1").scaleb(-decimals)
        text = f"{value.quantize(quant, rounding=ROUND_HALF_UP):.{decimals}f}"
    if separator != ".":
        text = text.replace(".", separator)
    return text


def parse_number(text: str, separator: str) -> Decimal:
    return Decimal(text.replace(separator, "."))


def is_number(text: str, separator: str) -> bool:
    try:
        parse_number(text, separator)
    except InvalidOperation:
        return False
    return True


def format_date(value: datetime, with_time: bool) -> str:
    if with_time:
        return value.strftime("%Y-%m-%dT%H:%M:%S")
    return value.strftime("%Y-%m-%d")


def parse_date(text: str) -> datetime:
    if "T" in text:
        return datetime.strptime(text, "%Y-%m-%dT%H:%M:%S")
    return datetime.strptime(text, "%Y-%m-%d")


def is_date(text: str) -> bool:
    try:
        parse_date(text)
    except ValueError:
        return False
    return True


def require_date(value: object, where: str) -> datetime:
    if not isinstance(value, str):
        raise SpecError(f"{where}: ожидается дата ISO, например 2026-01-01 или 2026-01-01T08:00:00.")
    try:
        return parse_date(value)
    except ValueError as exc:
        raise SpecError(f"{where}: ожидается дата ISO, например 2026-01-01 или 2026-01-01T08:00:00.") from exc


def infer_with_time(raw: dict, start: datetime, end: datetime) -> bool:
    if "with_time" in raw:
        if not isinstance(raw["with_time"], bool):
            raise SpecError("Поле with_time должно быть логическим.")
        return raw["with_time"]
    return start.time() != datetime.min.time() or end.time() != datetime.min.time() or "T" in raw["from"] or "T" in raw["to"]


def long_text_value() -> str:
    return ("значение " * 30).strip()


def unknown_token(column: dict, null_marker: str) -> str:
    choices = {value.casefold() for value in column["generator"].get("values", [])}
    exact = set(column["generator"].get("values", []))
    for candidate in ("UNKNOWN", "UNKNOWN_2", "UNKNOWN_3"):
        if candidate not in exact and candidate.casefold() not in choices and candidate != null_marker:
            return candidate
    raise SpecError(f"Колонка «{column['name']}»: не нашлось значения вне списка категорий.")


def vary_case(value: str) -> str:
    upper = value.upper()
    if upper != value:
        return upper
    lower = value.lower()
    if lower != value:
        return lower
    raise SpecError(f"Значение «{value}» не меняется по регистру.")


def refuse_existing(path: Path, overwrite: bool) -> None:
    if path.exists() and not overwrite:
        raise SpecError(f"Файл уже существует: {path}. Повторите запуск с --overwrite.")


def require_object(value: object, where: str) -> None:
    if not isinstance(value, dict):
        raise SpecError(f"{where}: ожидается объект JSON.")


def require_keys(value: dict, allowed: set[str], required: set[str], where: str) -> None:
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise SpecError(f"{where}: неизвестное поле «{unknown[0]}».")
    missing = sorted(required - set(value))
    if missing:
        raise SpecError(f"{where}: нет поля «{missing[0]}».")


def require_ident(value: object, where: str) -> str:
    if not isinstance(value, str) or not ident_ok(value):
        raise SpecError(f"{where} должно быть ASCII: буква или _, затем буквы, цифры и _, не длиннее {NAME_LIMIT} символов.")
    return value


def ident_ok(value: str) -> bool:
    if not value or len(value) > NAME_LIMIT:
        return False
    first, rest = value[0], value[1:]
    return (first.isascii() and (first.isalpha() or first == "_")) and all(char.isascii() and (char.isalnum() or char == "_") for char in rest)


def require_int(value: object, where: str, low: int | None, high: int | None) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise SpecError(f"{where} должно быть целым числом.")
    if low is not None and value < low or high is not None and value > high:
        bounds = f" от {low}" if low is not None else ""
        upper = f" до {high}" if high is not None else ""
        raise SpecError(f"{where} должно быть целым{bounds}{upper}.")
    return value


def require_decimal(value: object, where: str) -> Decimal:
    if isinstance(value, bool) or not isinstance(value, (int, Decimal)):
        raise SpecError(f"{where} должно быть числом.")
    return Decimal(value)


def json_number(value: Decimal, integer: bool):
    if integer or value == value.to_integral_value():
        return int(value)
    return float(value)


if __name__ == "__main__":
    sys.exit(main())
