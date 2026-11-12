import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "update.py"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
spec = importlib.util.spec_from_file_location("update", SCRIPT)
update = importlib.util.module_from_spec(spec)
spec.loader.exec_module(update)


def run(*args):
    return subprocess.run([sys.executable, "-I", str(SCRIPT), *map(str, args)], capture_output=True, text=True)


def snapshot(out):
    return {file.relative_to(out).as_posix(): file.read_bytes() for file in sorted(out.rglob("*")) if file.is_file()}


class Extraction(unittest.TestCase):
    pages = update.build(FIXTURES)

    def test_corpus_paths_follow_gitbook_layout(self):
        self.assertEqual(sorted(self.pages), ["README.md", "processors/calc/README.md", "processors/calc/expression.md"])

    def test_markdown_structure(self):
        page = self.pages["README.md"]
        self.assertTrue(page.startswith("# Loginom\n\n"))
        self.assertIn("\n## Таблица\n", page)
        self.assertIn("\nПараметр | Описание\n**Имя** | Имя поля, см. [Калькулятор](processors/calc/README.md)\n", page)
        self.assertIn("\nТочность | 2^53 и $k=10$\n", page)
        self.assertIn('\n```javascript\nif (a < b) {\n    return "x";\n}\n```\n', page)
        self.assertIn("\n> **Примечание:** выражения вычисляются [построчно](processors/calc/expression.md).\n", page)
        self.assertIn("\n- Первый пункт\n- Второй пункт\n  - вложенный\n", page)
        self.assertTrue(page.endswith("вложенный\n") and not page.endswith("\n\n"))

    def test_help_links_become_relative_md_links(self):
        self.assertIn("Узел [Калькулятор](processors/calc/README.md) считает [выражения](processors/calc/expression.md)",
                      self.pages["README.md"])
        self.assertIn("Вернуться к [началу](../../README.md); синтаксис — [Выражение](expression.md)",
                      self.pages["processors/calc/README.md"])
        self.assertIn("узле [Калькулятор](README.md) и [Калькулятор (абсолютная ссылка)](README.md)",
                      self.pages["processors/calc/expression.md"])

    def test_other_links_keep_only_text(self):
        page = self.pages["README.md"]
        self.assertIn("см. вики, администрирование, старую страницу и таблицу.", page)
        for gone in ("http", "missing", "#tablitsa", "#syntax"):
            self.assertNotIn(gone, page)
        self.assertIn("пример — Sales.txt.", self.pages["processors/calc/README.md"])

    def test_images_and_gitbook_chrome_are_dropped(self):
        text = "".join(self.pages.values())
        for gone in ("Скачать в PDF", ".pdf", "Логотип", "[img", "Картинка без подписи", "Сценарий целиком", "gitbook", "lg-jsadv",
                     "Вкладка формулы"):
            self.assertNotIn(gone, text)
        self.assertTrue(self.pages["processors/calc/expression.md"].endswith("\n\n**Пример:**\n\n`Val(\"1\")`\n"))
        self.assertIn("\n[Рисунок: Рисунок 1. Пример сценария]\n", self.pages["README.md"])
        self.assertIn("Кнопка Сохранить и Ctrl+S.", self.pages["README.md"])

    def test_rejects_page_over_byte_limit(self):
        with self.assertRaises(SystemExit) as error:
            update.check({"a.md": "я" * 25_001 + "\n"})
        self.assertIn("a.md: 50003 байт", str(error.exception.code))

    def test_rejects_link_outside_corpus(self):
        with self.assertRaises(SystemExit) as error:
            update.check({"a/b.md": "[x](../../c.md)\n", "a/c.md": "[y](b.md)\n"})
        self.assertIn("a/b.md: ссылка ../../c.md ведёт вне корпуса", str(error.exception.code))


class Command(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp)

    def test_rebuild_from_same_html_is_byte_identical(self):
        out = self.tmp / "help"
        first = run("--from-dir", FIXTURES, "--out", out, "--fetched-at", "2026-11-12T10:54:15Z",
                    "--last-modified", "Mon, 09 Nov 2026 10:53:23 GMT")
        self.assertEqual(first.returncode, 0, first.stderr)
        before = snapshot(out)
        second = run("--from-dir", FIXTURES, "--out", out)  # source metadata comes from the previous manifest
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(snapshot(out), before)
        self.assertIn("Изменений в страницах нет.", second.stdout)

        manifest = json.loads(before["help-manifest.json"])
        self.assertEqual(list(manifest), ["protocol", "source", "loginom_version", "pages", "bytes", "files"])
        self.assertEqual(manifest["source"], {"kind": "site", "url": "https://help.loginom.ru/userguide/",
                                              "last_modified": "Mon, 09 Nov 2026 10:53:23 GMT", "fetched_at": "2026-11-12T10:54:15Z"})
        self.assertEqual([file["path"] for file in manifest["files"]],
                         ["data/README.md", "data/processors/calc/README.md", "data/processors/calc/expression.md"])
        for file in manifest["files"]:
            body = before["loginom-help/" + file["path"]]
            self.assertEqual(file["sha256"], hashlib.sha256(body).hexdigest())
            self.assertEqual(file["bytes"], len(body))
            self.assertTrue(body.endswith(b"\n") and not body.endswith(b"\n\n") and b"\r" not in body)
        self.assertEqual((manifest["pages"], manifest["bytes"]), (3, sum(file["bytes"] for file in manifest["files"])))
        self.assertTrue(before["help-manifest.json"].endswith(b"}\n"))

    def test_removed_page_disappears_and_is_reported(self):
        source, out = self.tmp / "html", self.tmp / "help"
        shutil.copytree(FIXTURES, source)
        self.assertEqual(run("--from-dir", source, "--out", out, "--fetched-at", "t", "--last-modified", "m").returncode, 0)
        (source / "processors/calc/expression.html").unlink()
        result = run("--from-dir", source, "--out", out)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse((out / "loginom-help/data/processors/calc/expression.md").exists())
        self.assertIn("| `processors/calc/expression.md` | удалена |", result.stdout)
        self.assertIn("| `processors/calc/README.md` | изменена |", result.stdout)

    def test_rejects_oversized_page_and_keeps_previous_corpus(self):
        source, out = self.tmp / "html", self.tmp / "help"
        shutil.copytree(FIXTURES, source)
        self.assertEqual(run("--from-dir", source, "--out", out, "--fetched-at", "t", "--last-modified", "m").returncode, 0)
        before = snapshot(out)
        lines = "".join(f"<p>строка {number}</p>\n" for number in range(2100))
        (source / "big.html").write_text(f'<section class="normal markdown-section">{lines}</section>', encoding="utf-8")
        result = run("--from-dir", source, "--out", out)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("big.md:", result.stderr)
        self.assertEqual(snapshot(out), before)

    def test_rejects_empty_corpus(self):
        result = run("--from-dir", self.tmp, "--out", self.tmp / "help", "--fetched-at", "t", "--last-modified", "m")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Пустой корпус", result.stderr)
        self.assertFalse((self.tmp / "help").exists())


if __name__ == "__main__":
    unittest.main()
