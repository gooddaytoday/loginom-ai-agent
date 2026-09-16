import unittest
from import_source_binding import source_ordered_settings


class SourceBindingTests(unittest.TestCase):
    def settings(self):
        return dict(source=dict(encoding='UTF-8', rows_to_skip=0, first_line_as_title=True),
                    format=dict(delimiter=';', text_qualifier='"'),
                    columns=[dict(name='Renamed', source_name='B'), dict(name='A')])

    def test_field_references_bind_to_bytes_not_request_list_order(self):
        settings = self.settings()
        result = source_ordered_settings(settings, b'A;B\n1;2\n')
        self.assertEqual([c['name'] for c in result['columns']], ['A', 'Renamed'])
        self.assertEqual(settings['columns'][0]['name'], 'Renamed')

    def test_missing_duplicate_and_foreign_source_fields_fail(self):
        for data in [b'A;A\n1;2\n', b'A;C\n1;2\n', b'A\n1\n', b'']:
            with self.assertRaises(ValueError): source_ordered_settings(self.settings(), data)
        settings = self.settings(); settings['columns'][0]['source_name'] = 'A'
        with self.assertRaises(ValueError): source_ordered_settings(settings, b'A;B\n1;2\n')

    def test_headerless_source_positions_use_loginom_generated_names(self):
        settings = self.settings(); settings['source']['first_line_as_title'] = False
        settings['columns'] = [dict(name='Second', source_name='COL2'), dict(name='First', source_name='COL1')]
        result = source_ordered_settings(settings, b'1;2\n')
        self.assertEqual([c['name'] for c in result['columns']], ['First', 'Second'])
