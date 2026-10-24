import copy
import unittest
from full_read_evidence import verify_full_read


class FullPortConsumerTests(unittest.TestCase):
    def test_ordinary_port_does_not_need_table_filter_state(self):
        from test_full_read_evidence import FullReadTests
        request, events = FullReadTests().fixture()
        del events[0]['result']['output']['ports'][0]['filter_enabled']
        self.assertTrue(verify_full_read(events, request, 8)['passed'])


class ImportPortConsumerTests(unittest.TestCase):
    def fixture(self):
        from test_import_output_evidence import PortOutputEvidenceTests
        fixture = PortOutputEvidenceTests(); fixture.setUp()
        columns = [dict(c, used=True) for c in fixture.columns]
        request = dict(target=dict(kind='existing'), mappings=[], read=dict(ports=[0], sample_rows=2),
            parameters=dict(settings=dict(columns=columns,source=dict(encoding='UTF-8',rows_to_skip=0,first_line_as_title=True),
                format=dict(delimiter=';',text_qualifier='"',null_marker='NULL',decimal_separator='.'))))
        import csv, io
        stream = io.StringIO(newline=''); writer = csv.writer(stream,delimiter=';',lineterminator='\n')
        writer.writerow([c['name'] for c in columns]); writer.writerows([['NULL' if v is None else v for v in row] for row in fixture.rows])
        checkpoint = dict(execution=dict(execution_id='execution'),output=dict(ports=[fixture.port]))
        return request, stream.getvalue().encode(), checkpoint

    def audit(self, request, source, checkpoint, events=None):
        from import_output_evidence import verify_import_port_output
        if events is None:
            events=[dict(operation_id='import',phase='node_port_output_read',outcome=dict(output=copy.deepcopy(checkpoint['output']['ports'][0])))]
        return verify_import_port_output(events, 'import', request, source, checkpoint, 'execution')

    def test_import_compares_csv_with_port_without_table_actions(self):
        request, source, checkpoint = self.fixture()
        self.assertEqual(self.audit(request, source, checkpoint), [])

    def test_import_refuses_stale_port_schema_and_insufficient_requested_rows(self):
        request, source, checkpoint = self.fixture()
        for change in (lambda p:p.update(port=1), lambda p:p.update(execution_id='old'),
                lambda p:p['schema'][0].update(name='Foreign'), lambda p:p.update(sample_complete=False),
                lambda p:p['sample'][0][0].update(value='9007199254740992'),
                lambda p:p.update(sample=[],sample_rows=0,sample_complete=False)):
            changed=copy.deepcopy(checkpoint);change(changed['output']['ports'][0])
            self.assertTrue(self.audit(request,source,changed))

    def test_import_keeps_output_mapping_and_source_encoding_independent(self):
        request,source,checkpoint=self.fixture()
        fields=[dict(source=dict(kind='configured_field',name=c['name'])) for c in request['parameters']['settings']['columns']]
        fields[0].update(name='Renamed',label='New label')
        request['mappings']=[dict(direction='output',port=0,fields=fields)]
        checkpoint['output']['ports'][0]['schema'][0].update(name='Renamed',label='New label')
        self.assertEqual(self.audit(request,source,checkpoint),[])
        request['parameters']['settings']['source']['encoding']='UTF-16 LE'
        self.assertEqual(self.audit(request,source.decode().encode('utf-16-le'),checkpoint),[])
        self.assertTrue(self.audit(request,source,checkpoint))


    def test_import_checkpoint_requires_the_actual_port_read(self):
        request,source,checkpoint=self.fixture()
        self.assertTrue(self.audit(request,source,checkpoint,[]))
        events=[dict(operation_id='import',phase='node_port_output_read',outcome=dict(output=copy.deepcopy(checkpoint['output']['ports'][0])))]
        events[0]['outcome']['output']['sample'][0][0]['value']='foreign'
        self.assertTrue(self.audit(request,source,checkpoint,events))


class FilterPortConsumerTests(unittest.TestCase):
    def fixture(self):
        from test_import_output_evidence import PortOutputEvidenceTests
        from node_procedure_evidence import digest
        data=PortOutputEvidenceTests();data.setUp()
        node=dict(verified=True,document_id='doc',workflow_id='flow',node_id='node')
        request=dict(operation_id='filter',read=dict(ports=[1,0],sample_rows=2))
        ports=[dict(copy.deepcopy(data.port),port=i,port_guid='port-'+str(i),execution_id='doc:root:1') for i in (1,0)]
        def state(rows,elements):
            return dict(dom_epoch=dict(document='doc',revision=1),workflow_ref=dict(workflow_id='flow'),origin='https://test',loginom_build='7.4.2',
                scan=dict(complete=True),ui=dict(dialogs=[],masks=[],elements=elements),wizard=dict(status='absent'),
                prepared_node_context=node,node_outputs=dict(verified=True,node_selected=True,surface='graph',node_context=node),
                node_processes=dict(verified=True,inventory_complete=True,show_completed=True,root_id='root',node_context=node,processes=rows))
        def process(identity,parent=None):
            return dict(process_id=identity,record_id='r'+identity,parent_id=parent,state='completed',error=False,children_loaded=True,rendered=True,selected=parent is not None)
        states=[state([],[dict(ref='launch',allowed_actions=['execute_graph_node'],graph_execution=dict(node_id='node',source='native_selected_graph_node'))]),
            state([process('1'),process('1.1','1')],[dict(ref='go',allowed_actions=['show_process_node'],process_menu=dict(action='mniShowNodeToProcess',process=dict(record_id='r1.1')))]),
            state([process('1'),process('1.1','1')],[])]
        events=[]
        def entry(phase,**details):
            events.append(dict(session_id='test',runtime_revision='test',target=dict(origin='https://test',build='7.4.2'),operation_id='filter',
                phase=phase,internal_provenance='client_node_procedure_v1',**details))
        for step,s in zip((1,3,5),states):
            outcome=dict(status='SUCCEEDED',output=s)
            for sample in range(4):entry('node_observation_sample',step=step,internal_operation_id='filter:n'+str(step),sample=sample,outcome=outcome)
            entry('node_observation_completed',step=step,internal_operation_id='filter:n'+str(step),outcome=outcome)
            if step==5:continue
            action=dict(verb='execute_graph_node' if step==1 else 'show_process_node',ref='launch' if step==1 else 'go');identity='filter:n'+str(step+1)
            entry('node_step_prepared',step=step+1,internal_operation_id=identity,action=action,observation_sha256=digest(s),signature=digest([identity,action,s]))
            trace=[dict(event='ui_preconditions_verified',verb='execute_graph_node',refs=['launch']),dict(event='ui_gesture_applied',verb='execute_graph_node')] if step==1 else []
            entry('node_step_completed',step=step+1,internal_operation_id=identity,
                outcome=dict(status='SUCCEEDED',cleanup_complete=True,operation_id=identity,action_key='ui.act',output=dict(gesture_applied=True),trace=trace))
        for port in ports:entry('node_port_output_read',outcome=dict(verified=True,cleanup_complete=True,node_context=node,output=port))
        checkpoint=dict(status='SUCCEEDED',node=node,execution=dict(status='completed',execution_id='doc:root:1'),output=dict(ports=ports))
        events.append(dict(operation_id='filter',phase='node_checkpoint',result=checkpoint))
        return request,events,data.columns,[data.rows,data.rows]

    def test_filter_uses_requested_distinct_ports_and_independent_business_rows(self):
        from row_filter_output_evidence import verify_filter_output
        request,events,columns,rows=self.fixture()
        result=verify_filter_output(events,request,columns,rows)
        self.assertTrue(result['passed'],result)

    def test_filter_refuses_changed_port_execution_schema_and_short_unlimited_sample(self):
        from row_filter_output_evidence import verify_filter_output
        request,events,columns,rows=self.fixture()
        for change in (lambda p:p.update(port=0),lambda p:p.update(execution_id='old'),lambda p:p.update(port_guid='port-0'),
                lambda p:p['schema'][0].update(type='real'),lambda p:p.update(sample_complete=False),
                lambda p:p['sample'][0][0].update(value='42'),lambda p:p.update(sample=[],sample_rows=0,sample_complete=False)):
            changed=copy.deepcopy(events);change(changed[-1]['result']['output']['ports'][0])
            self.assertFalse(verify_filter_output(changed,request,columns,rows)['passed'])
        changed=copy.deepcopy(events);port=changed[-1]['result']['output']['ports'][0]
        port.update(sample=port['sample'][:1],sample_rows=1,sample_complete=False,read_limit='preview_cell_or_byte_budget')
        self.assertTrue(verify_filter_output(changed,request,columns,rows)['passed'])
        changed=copy.deepcopy(events);changed[0]['outcome']['status']='FAILED'
        self.assertFalse(verify_filter_output(changed,request,columns,rows)['passed'])
        changed=copy.deepcopy(events);changed[-1]['result']['execution']['execution_id']='old'
        self.assertFalse(verify_filter_output(changed,request,columns,rows)['passed'])

    def test_filter_checkpoint_must_match_actual_port_read_receipts(self):
        from row_filter_output_evidence import verify_filter_output
        request,events,columns,rows=self.fixture()
        receipt=next(e for e in events if e['phase']=='node_port_output_read')
        receipt['outcome']['output']=copy.deepcopy(receipt['outcome']['output'])
        receipt['outcome']['output']['sample'][0][0]['value']='foreign'
        self.assertFalse(verify_filter_output(events,request,columns,rows)['passed'])
