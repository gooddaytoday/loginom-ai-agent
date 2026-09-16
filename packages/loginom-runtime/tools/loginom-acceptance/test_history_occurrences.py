"""Storage copies are not retry successes; all examples are synthetic."""
import json
from itertools import product
from pathlib import Path
import sqlite3
import tempfile
import unittest
from evidence import export_history, PREFIX

class HistoryOccurrences(unittest.TestCase):
    def test_duplicate_read_marker_requires_archived_same_session_exact_witness(self):
        for suffix,mode in product(('read','dock_operation_inspect','dock_workspace_observe','dock_ui_action'),
                ('valid','no_witness','different_content','foreign_session','new_timestamp','not_archived','no_boundary')):
            with self.subTest(tool=suffix,mode=mode),tempfile.TemporaryDirectory() as temp:
                home=Path(temp);db=sqlite3.connect(home/'state.db')
                db.execute('CREATE TABLE messages(id INTEGER,session_id TEXT,role TEXT,tool_call_id TEXT,tool_name TEXT,content TEXT,tool_calls TEXT,timestamp REAL,active INTEGER,_compressed_summary INTEGER)')
                name=PREFIX+suffix;body='verified source '+('x'*2000)
                def call(key):return json.dumps([{'id':key,'function':{'name':name,'arguments':json.dumps({'uris':['viking://resources/source.md']})}}])
                rows=[(1,'s','assistant',None,None,'',call('a'),1,0,0),
                      (2,'s','tool','a',name,body,None,2,0,0),
                      (3,'s','assistant',None,None,'',call('b'),3,0,0),
                      (4,'other' if mode=='foreign_session' else 's','tool','b',name,body+'changed' if mode=='different_content' else body,None,4,1 if mode=='not_archived' else 0,0),
                      (5,'s','assistant',None,None,'',None,5,1,0 if mode=='no_boundary' else 1),
                      (6,'s','assistant',None,None,'',call('a'),1,1,0),
                      (7,'s','tool','a',name,'[Duplicate tool output — same content as a more recent call]',None,9 if mode=='new_timestamp' else 2,1,0)]
                if mode=='no_witness':rows=[r for r in rows if r[0]!=4]
                db.executemany('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?)',rows);db.commit();db.close()
                calls,tools=export_history(home,[])
                aliases=[copy for t in tools for copy in t.get('storage_copies',[]) if copy['kind'] in ('exact_duplicate_read_marker_after_compression','exact_duplicate_tool_marker_after_compression')]
                self.assertEqual(len(aliases),int(mode=='valid'))
                if mode=='valid':self.assertEqual((len(calls),len(tools)),(2,2))

    def export(self, *, stamp=10, boundary=True, summary=False, changed=False, archived=True, retained=False, direct=True, later_compaction=False):
        with tempfile.TemporaryDirectory() as temp:
            home=Path(temp);db=sqlite3.connect(home/'state.db')
            db.execute('CREATE TABLE messages(id INTEGER,session_id TEXT,role TEXT,tool_call_id TEXT,tool_name TEXT,content TEXT,tool_calls TEXT,timestamp REAL,active INTEGER,_compressed_summary INTEGER)')
            args={'name':PREFIX+'dock_workspace_observe','arguments':{}}
            call=json.dumps([{'id':'same','function':{'name':'tool_call','arguments':json.dumps(args)}}])
            if retained and direct:
                args={}
                call=json.dumps([{'id':'same','function':{'name':PREFIX+'dock_prepare','arguments':'{}'}}])
            transport=PREFIX+'dock_prepare' if retained and direct else 'tool_call'
            reply=json.dumps({'status':'SUCCEEDED','output':{'observation_id':'one'}})
            other=reply if not changed else json.dumps({'status':'FAILED'})
            if summary:
                other=f'[{transport}]'+''.join(f' {k}={str(v)[:40]}' for k,v in args.items())+f' ({len(reply):,} chars result)'
            rows=[(1,'s','assistant',None,None,'HIDDEN_REASONING',call,9,0 if archived else 1,0),
                  (2,'s','tool','same',transport,reply,None,10,0 if archived else 1,0),
                  (3,'s','assistant',None,None,'HIDDEN_SUMMARY',None,20,1,int(boundary)),
                  (4,'s','assistant',None,None,'HIDDEN_REASONING',call,9 if stamp==10 else stamp-1,1,0),
                  (5,'s','tool','same',transport,other,None,stamp,1,0)]
            if retained:
                rows=[rows[0],rows[1],(3,*rows[3][1:]),(4,*rows[4][1:]),(5,*rows[2][1:])]
            if later_compaction:
                rows=[(*row[:8],0,row[9]) for row in rows]
                rows.append((6,'s','user',None,None,'HIDDEN_SECOND_SUMMARY',None,30,1,1))
            db.executemany('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?,?,?)',rows);db.commit();db.close()
            return export_history(home,[])
    def test_retained_direct_prepare_before_summary_is_exact_alias(self):
        calls,tools=self.export(retained=True,summary=True)
        self.assertEqual((len(calls),len(tools)),(1,1))
        self.assertEqual(calls[0]['storage_copies'][0]['row'],3)
        self.assertEqual(tools[0]['storage_copies'][0]['row'],4)
        self.assertNotIn('HIDDEN',json.dumps([calls,tools]))
    def test_retained_prepare_archived_by_later_compaction_remains_an_exact_copy(self):
        calls,tools=self.export(retained=True,summary=True,later_compaction=True)
        self.assertEqual((len(calls),len(tools)),(1,1))
        self.assertEqual(tools[0]['storage_copies'][0]['row'],4)
        self.assertNotIn('HIDDEN',json.dumps([calls,tools]))
        for options in ({'stamp':30},{'boundary':False},{'changed':True,'summary':False}):
            with self.subTest(options=options):
                calls,tools=self.export(**{'retained':True,'summary':True,'later_compaction':True,**options})
                self.assertEqual((len(calls),len(tools)),(2,2))
    def test_retained_prepare_requires_exact_archived_pair_and_marker(self):
        for options in ({'stamp':30},{'boundary':False},{'archived':False},{'changed':True},{'direct':False}):
            with self.subTest(options=options):
                calls,tools=self.export(retained=True,**options)
                self.assertEqual((len(calls),len(tools)),(2,2))
    def test_exact_archived_copies_are_explicit_aliases(self):
        calls,tools=self.export()
        self.assertEqual((len(calls),len(tools)),(1,1))
        self.assertEqual(calls[0]['storage_copies'][0]['row'],4)
        self.assertEqual(tools[0]['storage_copies'][0]['row'],5)
        self.assertEqual(tools[0]['provider_tool_call_id'],'same')
        self.assertEqual(calls[0]['tool_call_id'],tools[0]['tool_call_id'])
        self.assertNotIn('HIDDEN',json.dumps([calls,tools]))
    def test_verified_generic_summary_retains_original_receipt_and_copy(self):
        calls,tools=self.export(summary=True)
        self.assertEqual(len(tools),1)
        self.assertEqual(tools[0]['result']['status'],'SUCCEEDED')
        self.assertEqual(tools[0]['storage_copies'][0]['kind'],'exact_generic_summary_after_compression')
    def test_same_id_on_new_timestamp_is_a_separate_occurrence(self):
        calls,tools=self.export(stamp=30)
        self.assertEqual((len(calls),len(tools)),(2,2))
        self.assertNotEqual(calls[0]['tool_call_id'],calls[1]['tool_call_id'])
        self.assertEqual([c['tool_call_id'] for c in calls],[t['tool_call_id'] for t in tools])
    def test_no_boundary_or_no_archive_never_collapses_calls(self):
        for options in ({'boundary':False},{'archived':False}):
            calls,tools=self.export(**options)
            self.assertEqual((len(calls),len(tools)),(2,2))
    def test_conflicting_reply_is_preserved_and_pairing_cannot_pass(self):
        calls,tools=self.export(changed=True)
        self.assertEqual(len(calls),1);self.assertEqual(len(tools),2)
        self.assertEqual(tools[1]['result']['status'],'FAILED')
        self.assertEqual(tools[0]['tool_call_id'],tools[1]['tool_call_id'])

if __name__=='__main__':unittest.main()
