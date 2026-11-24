#!/usr/bin/env python3
"""Exercise the actual refusal recognizer with different business wording."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('refusal_check', Path(__file__).with_name('refusal-check.py'))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class RefusalWording(unittest.TestCase):
    def test_xml_reasons(self):
        for answer in [
            'Этот XML-файл нельзя прочитать в Loginom напрямую.',
            'Импорта XML в этой сборке нет среди доступных узлов.',
            'Нативный импорт XML недоступен.',
            'XML не поддерживается.',
        ]:
            with self.subTest(answer=answer):
                self.assertEqual(checker.check(answer, 'bh-a14'), 'PASS')

    def test_xml_subject_alone_is_insufficient(self):
        for answer in [
            'XML успешно импортирован.',
            'XML — это формат данных.',
            'Не удалось сохранить пакет. XML импортирован.',
            'Не поддерживается XLS, но XML импортирован.',
        ]:
            with self.subTest(answer=answer):
                self.assertEqual(checker.check(answer, 'bh-a14'), 'REVIEW_REQUIRED')

    def test_json_root_limitation(self):
        self.assertEqual(checker.check(
            'Корневой массив JSON не поддерживается: требуется один объект.', 'bh-a17'), 'PASS')
        self.assertEqual(checker.check('JSON импортирован как таблица.', 'bh-a17'), 'REVIEW_REQUIRED')


if __name__ == '__main__':
    unittest.main()
