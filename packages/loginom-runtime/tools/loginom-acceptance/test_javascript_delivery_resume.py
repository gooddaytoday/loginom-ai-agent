"""Pinned Code10 diagnostic regression, never an original-trial PASS."""
import copy
import hashlib
import json
import os
from pathlib import Path
import unittest
from artifact_delivery_evidence import preupload_delivery_restarts
from javascript_cli_nodes import cli_public_calls,verify_cli_node_binding
from javascript_node_acceptance import bound_native_intervals,delivered_input


class PreuploadNativeBoundaryTests(unittest.TestCase):
    def setUp(self):
        owner=dict(session_id='session',runtime_revision='r',manifest_sha256='m',target={'profile_id':'fixture'})
        start=dict(owner,operation_id='delivery',phase='artifact_delivery_prepared',internal_provenance='artifact_delivery_v1',
            artifact_id='artifact',destination='/fixture/data.csv',bytes=5,sha256='a'*64,overwrite='reject',
            recorded_at='2026-10-02T00:00:00.000Z',deadline_at=10000)
        observed=dict(owner,operation_id='observe',phase='observation_completed',outcome=dict(status='SUCCEEDED',
            action_key='workspace.observe',output=dict(dom_epoch={'document':'own-document'})))
        checkpoint=dict(owner,operation_id='delivery',phase='artifact_delivery_preupload_checkpoint',
            internal_provenance='artifact_delivery_v1',upload_started=False,document='own-document',navigation_step=1,
            recorded_at='2026-10-02T00:00:01.000Z')
        self.events=[start,observed,checkpoint,dict(start,recorded_at='2026-10-02T00:00:02.000Z'),
            copy.deepcopy(observed),dict(owner,operation_id='delivery:upload',phase='prepared')]

    def test_navigation_checkpoint_and_restart_preserve_exact_identity(self):
        self.assertEqual(len(preupload_delivery_restarts(self.events,'delivery')),1)
        self.events.insert(5,dict(self.events[2],recorded_at='2026-10-02T00:00:03.000Z'))
        self.events.insert(6,dict(self.events[0],recorded_at='2026-10-02T00:00:04.000Z'))
        self.events.insert(7,copy.deepcopy(self.events[1]))
        self.assertEqual(len(preupload_delivery_restarts(self.events,'delivery')),2)

    def test_missing_checkpoint_changed_identity_and_early_upload_refuse(self):
        for kind in ('checkpoint','identity','early-upload','order'):
            events=copy.deepcopy(self.events)
            if kind=='checkpoint':events.pop(2)
            if kind=='identity':events[3]['sha256']='b'*64
            if kind=='early-upload':events.insert(1,copy.deepcopy(events[-1]))
            if kind=='order':events[2]['recorded_at']='2026-10-02T00:00:03.000Z'
            with self.subTest(kind=kind):
                with self.assertRaises(ValueError):preupload_delivery_restarts(events,'delivery')

    def test_single_preparation_adds_no_restart_claim(self):
        self.assertEqual(preupload_delivery_restarts([self.events[0],self.events[-1]],'delivery'),[])


@unittest.skipUnless(os.environ.get('LOGINOM_JAVASCRIPT_RESUME_ROOT'),'private Code10 capture not supplied')
class JavascriptDeliveryResumeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root=Path(os.environ['LOGINOM_JAVASCRIPT_RESUME_ROOT'])
        pins={'evidence/events.jsonl':'4df6babb8039a4d882034c6fa6c2fe8bc7988edfe650d66bd97856314f235597',
            'native-origin.json':'07b51287d372033ce47063dcf656f1ca53410d11829c34b64bb2d34f85d5334d',
            'writer-audit.json':'cdcc21aa8618f177000e1f624077bbec643c581c8540412af93cd7e4325f6fb0'}
        files={name:(root/name).read_bytes() for name in pins}
        for name,digest in pins.items():
            if hashlib.sha256(files[name]).hexdigest()!=digest:raise ValueError('Code10 capture changed: '+name)
        native=next(f for f in json.loads(files['native-origin.json'])['files'] if f['name']=='execution-events.jsonl')
        content=Path(native['path']).read_bytes()
        if hashlib.sha256(content).hexdigest()!=native['sha256']:raise ValueError('Code10 native changed')
        cls.original_native=[json.loads(line) for line in content.splitlines()]
        cls.original_events=[json.loads(line) for line in files['evidence/events.jsonl'].splitlines()]
        cls.original_audit=json.loads(files['writer-audit.json'])
        cls.expected=dict(cli_session_id='ses_f01d65aa4ffeihNJeEK5PnXjeq',
            runtime_session_id='5f22feb8-7563-49d2-a484-dc34e9ef0b74',
            runtime_revision='5de72bd14d1b22ddef8c74e9dfddd546e37431f8a4fd2206d07909050fc16cbf',
            action_manifest_sha256='17764f9a8137b199e4d89d4bdeea1a004778f825d50bfba6b68d64a9f5a588a4',
            target=dict(profile_id='loginom-7.4.2-linux-chromium-ru',loginom_build='7.4.2',platform='linux',browser='chromium'))
        cls.request=next(r['request'] for r in cls.original_native if r.get('phase')=='node_apply_prepared'
            and r.get('operation_id')=='javascript-sales')
        cls.baseline=dict(node=next(r['result']['node'] for r in cls.original_native
            if r.get('phase')=='node_checkpoint' and r.get('operation_id')=='javascript-sales'),
            graph=next(r['target_state']['final_graph'] for r in cls.original_native
                if r.get('phase')=='node_target_checkpoint' and r.get('operation_id')=='javascript-sales'
                and r.get('target_state',{}).get('completed') is True))
        cls.data=(root/'workspace/sales.csv').read_bytes()
        if hashlib.sha256(cls.data).hexdigest()!='4fce338d2edd2901ba35732ed148a1a80eba4a5fbf927f2828f3cdbe6b8fa09e':
            raise ValueError('Code10 original input changed')

    def setUp(self):
        self.native=copy.deepcopy(self.original_native)
        self.events=copy.deepcopy(self.original_events)

    def binding(self):
        return verify_cli_node_binding(self.events,self.native,'import-sales',self.expected)

    def test_actual_resume_receipt_is_decoded_and_bound(self):
        self.assertTrue(any(c['part']['tool']=='loginom_dock_artifact_delivery_resume' and c['result']
            for c in cli_public_calls(self.events)))
        self.assertTrue(self.binding()['passed'],self.binding())
        self.assertFalse(self.original_audit['passed'])

    def test_full_delivery_import_bytes_configuration_execution_and_parent_intervals(self):
        self.assertEqual(delivered_input(self.events,self.native,self.request,self.baseline,self.expected,self.data),
            ('import-sales','upload-sales:upload'))
        bound_native_intervals(self.events,self.native,['upload-sales','upload-sales:upload','import-sales'])

    def test_native_preparation_identity_changes_are_rejected(self):
        for key,value in [('artifact_id','foreign'),('destination','/jsteach/other.csv'),('bytes',158),('sha256','f'*64),
                ('overwrite','replace'),('session_id','foreign'),('runtime_revision','f'*64),('manifest_sha256','f'*64)]:
            with self.subTest(key=key):
                self.native=copy.deepcopy(self.original_native)
                starts=[r for r in self.native if r.get('operation_id')=='upload-sales' and r.get('phase')=='artifact_delivery_prepared']
                starts[1][key]=value
                self.assertFalse(self.binding()['passed'])

    def test_checkpoint_truth_owner_document_and_order_are_required(self):
        for key,value in [('upload_started',True),('document','foreign'),('session_id','foreign'),
                ('navigation_step',-1),('navigation_step',True),('internal_provenance','foreign')]:
            with self.subTest(key=key,value=value):
                self.native=copy.deepcopy(self.original_native)
                row=next(r for r in self.native if r.get('phase')=='artifact_delivery_preupload_checkpoint')
                row[key]=value
                self.assertFalse(self.binding()['passed'])
        self.native=[r for r in self.original_native if r.get('phase')!='artifact_delivery_preupload_checkpoint']
        self.assertFalse(self.binding()['passed'])

    def test_upload_before_restart_is_never_accepted_as_navigation_only(self):
        upload=copy.deepcopy(next(r for r in self.native if r.get('operation_id')=='upload-sales:upload' and r.get('phase')=='prepared'))
        self.native.insert(2,upload)
        self.assertFalse(self.binding()['passed'])

    def test_post_upload_observation_cannot_prove_restart_document(self):
        start=[i for i,r in enumerate(self.native) if r.get('operation_id')=='upload-sales'
            and r.get('phase')=='artifact_delivery_prepared'][-1]
        upload=next(i for i,r in enumerate(self.native) if r.get('operation_id')=='upload-sales:upload')
        self.native=[r for i,r in enumerate(self.native) if not start < i < upload or r.get('phase')!='observation_completed']
        self.assertFalse(self.binding()['passed'])

    def test_public_resume_is_owned_and_cannot_change_operation_or_deadline(self):
        for key,value in [('operation_id','foreign'),('resume_id',''),('resume_id','invalid/id'),('budget_ms',1800001),('budget_ms',1000)]:
            with self.subTest(key=key):
                self.events=copy.deepcopy(self.original_events)
                part=next(e['part'] for e in self.events if e.get('part',{}).get('tool')=='loginom_dock_artifact_delivery_resume')
                part['state']['input'][key]=value
                self.assertFalse(self.binding()['passed'])
        self.events=copy.deepcopy(self.original_events)
        next(e['part'] for e in self.events if e.get('part',{}).get('tool')=='loginom_dock_artifact_delivery_resume')['sessionID']='foreign'
        self.assertFalse(self.binding()['passed'])

    def test_missing_public_no_upload_refusal_is_rejected(self):
        self.events=[e for e in self.events if e.get('part',{}).get('tool') not in
            ('loginom_dock_artifact_deliver','loginom_dock_artifact_delivery_status')]
        self.assertFalse(self.binding()['passed'])

    def test_changed_public_destination_cannot_replace_native_receipt(self):
        part=next(e['part'] for e in self.events if e.get('part',{}).get('tool')=='loginom_dock_artifact_delivery_resume')
        value=json.loads(part['state']['output']);value['output']['destination']='/jsteach/other.csv'
        part['state']['output']=json.dumps(value)
        self.assertIn('cli_node_delivery_path_receipt',self.binding()['failures'])

    def test_duplicate_upload_or_wrong_original_bytes_fail_full_audit(self):
        upload=copy.deepcopy(next(r for r in self.native if r.get('operation_id')=='upload-sales:upload' and r.get('phase')=='prepared'))
        self.native.append(upload)
        with self.assertRaises(ValueError):delivered_input(self.events,self.native,self.request,self.baseline,self.expected,self.data)
        with self.assertRaises(ValueError):delivered_input(self.events,self.original_native,self.request,self.baseline,self.expected,self.data+b'x')


if __name__=='__main__':unittest.main()
