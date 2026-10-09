import copy
import unittest
import oracle


class OracleGuards(unittest.TestCase):
    def setUp(self):
        self.want = oracle.expected('/LAB64-calculator/test.lgp')
        self.execution = dict(status='completed', execution_id='fresh-1', verified=True, owner_verified=True)
        sample = []
        for row in self.want['rows']:
            cells = []
            for column in oracle.COLUMNS:
                value = row[column['name']]
                cell = dict(type=column['type'], value=str(value) if column['type'] == 'integer' else value,
                            is_null=value is None)
                if column['type'] == 'datetime':
                    cell.update(precision='millisecond', representation='local_datetime', timezone='unspecified')
                cells.append(cell)
            sample.append(cells)
        self.port = dict(execution_id='fresh-1', fresh=True, row_count=6, sample_complete=True,
                         precision=dict(numbers_verified=True), schema=oracle.COLUMNS, sample=sample)

    def test_exact_values_and_row_permutation(self):
        oracle.verify_table(self.port, self.want, self.execution)
        self.port['sample'].reverse()
        oracle.verify_table(self.port, self.want, self.execution)

    def test_rejects_stale_substituted_missing_and_wrong_schema(self):
        changes = [lambda p: p.update(execution_id='old'), lambda p: p.update(fresh=False),
                   lambda p: p['sample'][0][2].update(value=75.0),
                   lambda p: p['sample'][0][7].update(value=None, is_null=True),
                   lambda p: p['sample'].pop(), lambda p: p['schema'].reverse()]
        for change in changes:
            with self.subTest(change=change):
                port = copy.deepcopy(self.port)
                change(port)
                with self.assertRaises(ValueError):
                    oracle.verify_table(port, self.want, self.execution)

    def test_cold_requires_identity_and_confirmed_cleanup(self):
        node = dict(document_id='d', workflow_id='w', node_id='n')
        cold_port = copy.deepcopy(self.port)
        del cold_port['fresh'], cold_port['execution_id']
        result = dict(status='PASS', phase='independent_cold_reopen_readback', path=self.want['package_path'], settingsReapplied=False,
                      cleanup=dict(package_closed=True, logged_out=True),
                      node=node, execution=dict(self.execution, node=dict(node)), output=dict(ports=[cold_port]))
        oracle.verify_cold(result, self.want['package_path'])
        for change in [lambda r: r['cleanup'].update(logged_out=False),
                       lambda r: r['execution'].update(owner_verified=False),
                       lambda r: r.update(path='/foreign.lgp'),
                       lambda r: r['execution']['node'].update(node_id='foreign')]:
            bad = copy.deepcopy(result)
            change(bad)
            with self.assertRaises(ValueError):
                oracle.verify_cold(bad, self.want['package_path'])

    def test_transcript_observation_freshness_and_save_order(self):
        node = dict(document_id='d', workflow_id='w', node_id='calculator')
        source = dict(document_id='d', workflow_id='w', node_id='import')
        observed = dict(node=node, values_are='observed_ui_values',
                        expressions=[dict(e, intermediate=False, cached=False, description='') for e in oracle.EXPRESSIONS],
                        input_mapping=dict(autosync=False, fields=[dict(source_name=s, name=n, label=l) for s, n, l in
                            [('Id', 'Id', 'Id'), ('Region', 'Region', 'Region'), ('Quantity', 'Qty', 'Количество'),
                             ('UnitPrice', 'UnitPrice', 'UnitPrice'), ('Comment', 'Comment', 'Comment')]]),
                        output_mapping=dict(autosync=False, fields=[dict(c, excluded=False) for c in oracle.COLUMNS]
                            + [dict(name='Region', excluded=True)]))
        request = dict(operation_id='calc', mode='expression', target=dict(type='transform.calculator'), inputs=[dict(source=source)])
        reply = dict(operation_id='calc', state='settled', status='SUCCEEDED', cleanup_complete=True, node=node,
                     configuration=dict(readback=observed), execution=dict(self.execution, node=dict(node)), output=dict(ports=[self.port]))
        def event(tool, identity, request, reply):
            return dict(type='tool_use', part=dict(tool=tool, id=identity,
                        state=dict(status='completed', input=request, output=reply)))
        events = [event('loginom_mcp_find', 'find', {}, 'ordinary knowledge text'),
                  event('loginom_dock_node_apply', 'import', dict(operation_id='import', target=dict(type='imports.text')),
                        dict(operation_id='import', state='settled', status='SUCCEEDED', node=source)),
                  event('loginom_dock_node_apply', 'calc', request, reply),
                  event('loginom_dock_action_run', 'save', dict(action_key='package.save_as', parameters=dict(path=self.want['package_path'])),
                        dict(status='SUCCEEDED'))]
        oracle.verify_events(events, self.want['package_path'])
        bad = copy.deepcopy(events)
        bad[2]['part']['state']['output']['execution']['node']['node_id'] = 'foreign'
        with self.assertRaises(ValueError):
            oracle.verify_events(bad, self.want['package_path'])
        with self.assertRaises(ValueError):
            oracle.verify_events([events[0], events[1], events[3], events[2]], self.want['package_path'])


if __name__ == '__main__':
    unittest.main()
