"""Compose original standalone writer and separate path-only cold acceptance.

This is an operator API, not a model tool. It reads original controller/capture
objects and their files; serialized receipts alone cannot admit a trial. Source
and business oracles never become reader arguments or model attachments. The
private baseline stays in this object; public reports contain identities only.
Observed same-UID process/file ownership is not cryptographic writer attestation.
"""
import copy
from datetime import datetime,timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
from artifact_delivery_evidence import verify_delivered_import_output
from javascript_cli_admission import verify_cli_admission
from javascript_cli_candidate import file_sha256,verify_cli_candidate
from javascript_cli_capture import RedactedCliCapture
from javascript_cli_cleanup import native_time,verify_cli_package_cleanup
from javascript_cli_controller import JavascriptProcessController
from javascript_cli_evidence import read_cli_session,value_digest
from javascript_cli_lease import JavascriptAcceptanceLease
from javascript_cli_nodes import cli_public_calls,verify_cli_node_binding
from javascript_cli_reader_freeze import verify_cold_reader
from javascript_cold_evidence import graph_meaning,verify_javascript_cold
from javascript_configuration_evidence import javascript_operation,verify_javascript_configuration
from javascript_output_evidence import verify_javascript_executions,verify_javascript_output
from javascript_read_output_evidence import verify_javascript_read_output
from node_configuration_evidence import verify_configuration_readback


def require_proof(proof,name):
    if proof.get('passed') is not True:
        raise ValueError(name+':'+','.join(proof.get('failures',[])))
    return proof


def private_bytes(path):
    path=Path(path)
    before=path.stat()
    if (not path.is_absolute() or path.resolve()!=path or not path.is_file() or path.is_symlink()
            or before.st_uid!=os.getuid() or before.st_mode & 0o077):
        raise ValueError('javascript_acceptance_private_file')
    content=path.read_bytes()
    after=path.stat()
    if ((before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns)!=
            (after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns)
            or len(content)!=after.st_size or hashlib.sha256(content).hexdigest()!=file_sha256(path)):
        raise ValueError('javascript_acceptance_file_changed_during_read')
    return content,dict(path=str(path),bytes=len(content),sha256=hashlib.sha256(content).hexdigest(),
        device=after.st_dev,inode=after.st_ino)


def captured_events(controller,capture,reader):
    """Closed files and worker must belong to the original factory collection."""
    if (not isinstance(controller,JavascriptProcessController) or not isinstance(capture,RedactedCliCapture)
            or controller.capture is not capture or controller.kind!=capture.mode
            or controller.collection is None or controller.result is None or capture.result is None
            or controller.process.poll()!=0 or capture.worker.poll()!=0
            or controller.failures or capture.failures):
        raise ValueError('javascript_acceptance_original_closed_collection')
    require_proof(controller.collection,'javascript_acceptance_collection')
    require_proof(controller.finish(),'javascript_acceptance_processes')
    require_proof(capture.finish(),'javascript_acceptance_capture')
    if (value_digest(controller.collection['process'])!=value_digest(controller.result)
            or value_digest(controller.collection['capture'])!=value_digest(capture.result)
            or controller.collection['original_deadline_expired'] is not False
            or controller.collection['forced_root_termination'] is not False
            or controller.collection['control']):
        raise ValueError('javascript_acceptance_original_collection_binding')
    candidate,pins=controller.candidate
    require_proof(verify_cold_reader(reader,candidate,pins),'javascript_acceptance_frozen_qa')
    root=Path(reader['root'])/'runtime/tools/loginom-acceptance'
    if Path(__file__).resolve().parent!=root:
        raise ValueError('javascript_acceptance_execute_frozen_auditor')
    worker=root/'javascript-cli-redact-worker.mjs'
    redactor=candidate/'resources/loginom/runtime/client/lib/redact.mjs'
    if (capture.pins!=dict(node=controller.node,
            worker=dict(path=str(worker),sha256=file_sha256(worker)),
            redactor=dict(path=str(redactor),sha256=file_sha256(redactor)))
            or any(file_sha256(Path(pin['path']))!=pin['sha256'] for pin in capture.pins.values())
            or (capture.directory.stat().st_dev,capture.directory.stat().st_ino)!=capture.directory_identity):
        raise ValueError('javascript_acceptance_original_pinned_capture_sources')
    files={}
    for record in capture.result['files']:
        content,pin=private_bytes(capture.directory/record['name'])
        if (pin['bytes']!=record['bytes'] or pin['sha256']!=record['sha256']
                or (pin['device'],pin['inode'])!=capture.file_identities[record['name']]):
            raise ValueError('javascript_acceptance_capture_file_changed')
        files[record['name']]=content
    content=files[capture.output_file]
    if not content or not content.endswith(b'\n'):
        raise ValueError('javascript_acceptance_complete_capture_required')
    return [json.loads(line) for line in content.splitlines()]


def successful_applies(native):
    """Native admission/checkpoint/completion; public binding is checked next."""
    rows=[]
    for position,row in enumerate(native):
        if row.get('phase')!='node_apply_prepared':continue
        operation=row['operation_id']
        ends=[(i,r) for i,r in enumerate(native) if r.get('operation_id')==operation
            and r.get('phase')=='completed' and r.get('outcome',{}).get('status')=='SUCCEEDED']
        points=[r['result'] for r in native if r.get('operation_id')==operation and r.get('phase')=='node_checkpoint']
        if len(ends)==1 and len(points)==1 and position<ends[0][0] and points[0].get('status')=='SUCCEEDED':
            rows.append(dict(position=position,end=ends[0][0],request=row['request'],checkpoint=points[0]))
    return rows


def bound_native_intervals(events,native,operations):
    """Actual native work stays between submission and its public terminal."""
    calls=cli_public_calls(events)
    for operation in set(operations):
        related=[c for c in calls if c['part']['state']['input'].get('operation_id')==operation
            or c['result'] and c['result'].get('operation_id')==operation]
        terminal=[c for c in related if c['result'] and c['result'].get('operation_id')==operation
            and (c['result'].get('status')=='SUCCEEDED' or c['result'].get('output',{}).get('status')=='SUCCEEDED')]
        records=[r for r in native if r.get('operation_id')==operation]
        if not related or not terminal or not records:
            raise ValueError('javascript_acceptance_native_public_time_binding_missing')
        start=min(c['part']['state']['time']['start'] for c in related)
        end=max(c['part']['state']['time']['end'] for c in terminal)
        if any(not start<=native_time(r['recorded_at'])<=end for r in records):
            raise ValueError('javascript_acceptance_native_work_outside_public_operation')


def authored_source(events,native,selected,expected):
    """Done -> preserve Execute is valid, provided actual model bytes match."""
    node=selected['checkpoint']['node']
    candidates=[row for row in successful_applies(native) if row['position']<=selected['position']
        and row['request']['target'].get('type')=='programming.javascript'
        and row['request'].get('mode')=='script' and row['checkpoint'].get('node')==node
        and isinstance(row['request'].get('parameters',{}).get('source_text'),str)]
    if not candidates:raise ValueError('javascript_acceptance_model_authored_source_missing')
    author=candidates[-1]
    if author['request']['operation_id']!=selected['request']['operation_id'] and author['end']>=selected['position']:
        raise ValueError('javascript_acceptance_authoring_before_preserve_execute')
    operation=author['request']['operation_id']
    proof=require_proof(verify_cli_node_binding(events,native,operation,expected),'javascript_acceptance_authored_public_binding')
    source=author['request']['parameters']['source_text'].encode('utf-8')
    if proof['public_source_sha256']!=hashlib.sha256(source).hexdigest():
        raise ValueError('javascript_acceptance_actual_public_authored_bytes')
    return source,operation


def native_writer_baseline(native,request,source,execution_ids,package_path,finished_at,*,expected_target=None,expected_origin=None):
    operation=javascript_operation(native,request,expected_target=expected_target,expected_origin=expected_origin)
    node=operation['node']
    graphs=[r['target_state']['final_graph'] for r in operation['rows']
        if r.get('phase')=='node_target_checkpoint' and r.get('internal_provenance')=='node_target_v1'
        and r.get('target_state',{}).get('completed') is True]
    if not graphs:raise ValueError('javascript_acceptance_native_guid_graph_missing')
    graph_meaning(graphs[-1],node)
    settings=[r for r in operation['rows'] if r.get('phase')=='javascript_managed_source_settings_observed']
    if not settings or value_digest(settings[-1]['settings'])!=settings[-1]['settings_sha256']:
        raise ValueError('javascript_acceptance_native_writer_settings')
    return dict(operation_id=request['operation_id'],source=source,node=copy.deepcopy(node),
        schema_mode=request['parameters']['schema_mode'],package_path=package_path,graph=copy.deepcopy(graphs[-1]),
        prefix=request['workflow_ref']['prefix'],settings_sha256=settings[-1]['settings_sha256'],
        mappings={direction:copy.deepcopy(operation['phases'][direction+'_mapping']['value']['native_mapping'])
            for direction in ('input','output')},execution_ids=execution_ids,
        finished_at=datetime.fromtimestamp(finished_at/1000,timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z'))


def writer_business_output(events,native,request,baseline,expected,columns,rows):
    """A model-delivered full apply OR a model-delivered full late read."""
    origin=dict(expected_target=expected['target'],expected_origin='http://logi-test-plan.bg.local')
    direct=verify_javascript_output(native,request,columns,rows,**origin)
    if direct['passed']:return request['operation_id'],direct
    candidates=[r['request'] for r in successful_applies(native)
        if r['request'].get('mode')=='read_existing_output'
        and r['request'].get('parameters',{}).get('source_operation_id')==request['operation_id']]
    for read in reversed(candidates):
        binding=verify_cli_node_binding(events,native,read['operation_id'],expected,source_operation_id=request['operation_id'])
        if not binding['passed']:continue
        proof=verify_javascript_read_output(native,read,baseline,columns,rows,**origin)
        if proof['passed']:return read['operation_id'],proof
    raise ValueError('javascript_acceptance_model_delivered_full_business_output')


def delivered_input(events,native,request,baseline,expected,source_bytes):
    inputs=request['inputs']
    if len(inputs)!=1 or inputs[0]['input']!=0 or inputs[0]['output']!=0:
        raise ValueError('javascript_acceptance_business_input_edge')
    source=inputs[0]['source']
    candidates=[r for r in successful_applies(native) if r['end']<next(i for i,v in enumerate(native)
        if v.get('operation_id')==request['operation_id'] and v.get('phase')=='node_apply_prepared')
        and r['checkpoint'].get('node')==source and r['request']['target'].get('type')=='imports.text'
        and r['request'].get('finish')=='execute']
    if not candidates:raise ValueError('javascript_acceptance_executed_import_missing')
    imported=candidates[-1]['request']
    require_proof(verify_cli_node_binding(events,native,imported['operation_id'],expected),'javascript_acceptance_import_public_binding')
    require_proof(verify_configuration_readback(native,imported),'javascript_acceptance_import_configuration')
    upload=imported['parameters']['source']['upload_operation_id']
    deliveries=[c['result'] for c in cli_public_calls(events) if c['part']['tool'] in (
        'loginom_dock_artifact_deliver','loginom_dock_artifact_delivery_status') and c['result']
        and c['result'].get('state')=='settled' and c['result'].get('output',{}).get('upload_operation_id')==upload]
    if not deliveries:raise ValueError('javascript_acceptance_public_input_delivery_missing')
    delivered=deliveries[-1]
    view=dict(state=delivered['state'],phase='completed',error=delivered.get('error'),
        operation_id=delivered['operation_id'],upload_operation_id=upload,outcome=delivered['output'])
    bound_native_intervals(events,native,[delivered['operation_id']])
    require_proof(verify_delivered_import_output(native,imported,source_bytes,view,expected['runtime_revision']),
        'javascript_acceptance_delivered_input_bytes_and_execution')
    edge=dict(source=source['node_id'],output=0,target=baseline['node']['node_id'],input=0)
    if edge not in baseline['graph']['links']:
        raise ValueError('javascript_acceptance_native_import_to_javascript_edge')
    return imported['operation_id'],upload


def verified_source_review(pin,source,assignment):
    """Bind an independent full-source assessment; never infer semantics by hash.

The operator records substantive inspection, not a regex or a model assertion.
Line anchors bind its reasoning to exact bytes. This is review evidence, not a
proof of program equivalence or cryptographic reviewer authentication.
"""
    if not isinstance(pin,dict) or set(pin)!={'path','sha256'}:
        raise ValueError('javascript_acceptance_independent_source_review_required')
    content,identity=private_bytes(pin['path'])
    if identity['sha256']!=pin['sha256']:raise ValueError('javascript_acceptance_source_review_pin')
    review=json.loads(content)
    if (set(review)!=set(assignment)|{'format','decision','reviewed_at','checks','source_sha256','source_utf8_bytes'}
            or any(value_digest(review.get(key))!=value_digest(value) for key,value in assignment.items())
            or review.get('format')!='javascript-cli-source-review-v1' or review.get('decision')!='VERIFIED'
            or review.get('source_sha256')!=hashlib.sha256(source).hexdigest()
            or review.get('source_utf8_bytes')!=len(source) or type(review.get('source_utf8_bytes')) is not int):
        raise ValueError('javascript_acceptance_source_review_assignment_or_bytes')
    count=source.decode('utf-8').count('\n')+1
    lines=source.decode('utf-8').split('\n')
    checks=review['checks']
    if (not isinstance(checks,list) or len(checks)!=5
            or {c.get('kind') for c in checks}!={'input_rows','row_values','net_cents','status','no_injected_answers'}):
        raise ValueError('javascript_acceptance_source_review_complete_assessment')
    for check in checks:
        span=check.get('source_lines')
        if (set(check)!={'kind','reason','source_lines','source_excerpt_sha256'}
                or not isinstance(check['reason'],str) or not check['reason'].strip() or len(check['reason'])>4000
                or not isinstance(span,list) or len(span)!=2 or any(type(v) is not int for v in span)
                or not 1<=span[0]<=span[1]<=count
                or check.get('source_excerpt_sha256')!=hashlib.sha256('\n'.join(lines[span[0]-1:span[1]]).encode()).hexdigest()
                or check['kind']=='no_injected_answers' and span!=[1,count]):
            raise ValueError('javascript_acceptance_source_review_anchored_reasoning')
    return dict(passed=True,reviewed_at=native_time(review['reviewed_at']),file=identity,
        scope='independent_full_source_review_attestation_bound_to_exact_model_source_task_input_and_candidate',
        program_equivalence_proved=False,reviewer_cryptographically_authenticated=False)


class JavascriptCliAcceptance:
    def __init__(self,writer,capture,*,reader,expected,prompt,data_filename,input_columns,output_columns,expected_rows,source_review=None):
        self.writer,self.capture=writer,capture
        self.reader,self.expected=copy.deepcopy(reader),copy.deepcopy(expected)
        self.prompt,self.data_filename=prompt,data_filename
        self.input_columns,self.output_columns,self.rows=copy.deepcopy(input_columns),copy.deepcopy(output_columns),copy.deepcopy(expected_rows)
        self.source_review=copy.deepcopy(source_review)
        self.baseline,self.cleanup,self.writer_report,self.result=None,None,None,None
        self.cold,self.cold_capture,self.terminal_sha256=None,None,None
        self.failures=set()

    def audit_writer(self):
        stages={}
        try:
            writer=self.writer
            if (not isinstance(writer,JavascriptProcessController) or writer.kind!='cli' or writer.candidate is None
                    or writer.launch.get('transport')!='normal_standalone_run'
                    or writer.launch.get('profile')!=str(writer.owner.profile)
                    or writer.launch.get('headed') is not True or writer.launch.get('model')!='openai/gpt-6-sol'
                    or writer.launch.get('variant')!='low' or writer.launch.get('prompt_sha256')!=value_digest(self.prompt)
                    or self.expected.get('schema_mode') not in ('code','declared')):
                raise ValueError('javascript_acceptance_original_normal_sol_low_writer')
            if (not isinstance(writer.lease,JavascriptAcceptanceLease) or writer.lease.observed_at>writer.submitted_at
                    or str(writer.owner.profile)!=writer.lease.expected['cli_profile'] or 'cli' not in writer.lease.used):
                raise ValueError('javascript_acceptance_original_prelaunch_lease')
            stages['lease']=writer.lease.revalidate()
            candidate,pins=writer.candidate
            stages['candidate']=require_proof(verify_cli_candidate(candidate,pins),'javascript_acceptance_candidate')
            events=captured_events(writer,self.capture,self.reader)
            stages['native_artifacts']=require_proof(writer.freeze_native(events,self.expected),'javascript_acceptance_native_origin')
            if not writer.native_watch.revalidate():raise ValueError('javascript_acceptance_sealed_native_changed')
            native,receipt=writer.native_watch.sealed['events'],writer.native_watch.sealed['receipt']
            projection=read_cli_session(writer.owner.profile,self.expected['cli_session_id'])
            users=[m['message_id'] for m in projection['models'] if m['role']=='user']
            if (len(users)!=1 or projection['user_prompts']!=[dict(part_id=projection['user_prompts'][0]['part_id'],
                    message_id=users[0],bytes=len(self.prompt.encode('utf-8')),sha256=hashlib.sha256(self.prompt.encode('utf-8')).hexdigest())]):
                raise ValueError('javascript_acceptance_original_user_prompt_snapshot')
            files=[dict(filename=r['name'],bytes=r['bytes'],sha256=r['sha256']) for r in writer.launch['files']]
            for item in files:
                path=Path(writer.launch['directory'])/item['filename']
                if path.resolve()!=path or path.stat().st_size!=item['bytes'] or file_sha256(path)!=item['sha256']:
                    raise ValueError('javascript_acceptance_original_input_changed')
            stages['admission']=require_proof(verify_cli_admission(events,projection,files,native,self.expected,
                submitted_at=writer.submitted_at,deadline_at=writer.deadline_at,directory=writer.launch['directory']),
                'javascript_acceptance_original_admission')
            self._knowledge(events,candidate)
            applies=successful_applies(native)
            choices=[r for r in applies if r['request']['target'].get('type')=='programming.javascript'
                and r['request'].get('mode')=='script' and r['request'].get('finish')=='execute'
                and r['request'].get('parameters',{}).get('schema_mode')==self.expected['schema_mode']]
            if not choices:raise ValueError('javascript_acceptance_successful_javascript_execute_missing')
            selected=choices[-1]
            request=selected['request']
            stages['public_execute']=require_proof(verify_cli_node_binding(events,native,request['operation_id'],self.expected),
                'javascript_acceptance_original_execute_binding')
            source,author=authored_source(events,native,selected,self.expected)
            data_files=[f for f in files if f['filename']==self.data_filename]
            if len(data_files)!=1:raise ValueError('javascript_acceptance_original_data_attachment')
            stages['source_review']=verified_source_review(self.source_review,source,
                dict(owner_task_id=writer.lease.expected['owner_task_id'],cli_session_id=self.expected['cli_session_id'],
                    candidate_manifest_sha256=pins['manifest_sha256'],schema_mode=self.expected['schema_mode'],
                    prompt_sha256=hashlib.sha256(self.prompt.encode('utf-8')).hexdigest(),input=data_files[0]))
            review_path=Path(self.source_review['path'])
            if any(review_path.is_relative_to(parent) for parent in
                    (candidate,writer.owner.profile,Path(writer.launch['directory']),Path(self.reader['root']))):
                raise ValueError('javascript_acceptance_operator_source_review_isolation')
            if stages['source_review']['reviewed_at']<writer.result['finished_at']:
                raise ValueError('javascript_acceptance_source_review_after_actual_writer')
            origin=dict(expected_target=self.expected['target'],expected_origin='http://logi-test-plan.bg.local')
            stages['configuration']=require_proof(verify_javascript_configuration(native,request,source,
                self.input_columns,self.output_columns,**origin),'javascript_acceptance_full_configuration')
            stages['executions']=require_proof(verify_javascript_executions(native,request,**origin),'javascript_acceptance_two_fresh_executions')
            ids=[stages['executions'][key] for key in ('materialization_execution_id','execution_id')]
            baseline=native_writer_baseline(native,request,source,ids,self.expected['package_path'],writer.result['finished_at'],**origin)
            output,stages['business_output']=writer_business_output(events,native,request,baseline,self.expected,self.output_columns,self.rows)
            if stages['business_output']['execution_id'] not in ids:baseline['execution_ids'].append(stages['business_output']['execution_id'])
            data=Path(writer.launch['directory'])/self.data_filename
            if self.data_filename not in {f['filename'] for f in files}:raise ValueError('javascript_acceptance_original_data_attachment')
            imported,upload=delivered_input(events,native,request,baseline,self.expected,data.read_bytes())
            cleanup=dict(events=events,native_events=native,source_operation_id=request['operation_id'],
                final_path=self.expected['package_path'],revisions=self.expected['revisions'],expected=self.expected,
                receipt=receipt,projection=projection)
            stages['cleanup']=require_proof(verify_cli_package_cleanup(**cleanup),'javascript_acceptance_last_save_native_close')
            bound_native_intervals(events,native,[author,request['operation_id'],output,imported,
                stages['cleanup']['save_operation_id']])
            if not writer.submitted_at<=native_time(receipt['started_at'])<=native_time(receipt['completed_at'])<=writer.result['finished_at']:
                raise ValueError('javascript_acceptance_cleanup_original_process_order')
            self.baseline,self.cleanup=baseline,cleanup
            identities=dict(source_operation_id=request['operation_id'],authored_operation_id=author,
                output_operation_id=output,import_operation_id=imported,upload_operation_id=upload,
                package_path=self.expected['package_path'],source_sha256=hashlib.sha256(source).hexdigest(),
                execution_ids=baseline['execution_ids'])
        except (OSError,ValueError,KeyError,IndexError,TypeError,AttributeError,UnicodeError,OverflowError,StopIteration,subprocess.SubprocessError) as error:
            self.failures.add(str(error) if isinstance(error,ValueError) else 'javascript_acceptance_writer_missing_or_malformed')
            identities={}
        self.writer_report=dict(version=1,passed=not self.failures,failures=sorted(self.failures),stages=stages,**identities,
            scope='original_normal_cli_writer_model_delivery_native_business_save_close_and_processes',
            cold_persistence_verified=False,cli_acceptance_verified=False)
        return copy.deepcopy(self.writer_report)

    def _knowledge(self,events,candidate):
        # Fixed inert export only; neither model source nor operator oracle is
        # evaluated. The executable and asset are already candidate-pinned.
        asset=candidate/'resources/loginom/runtime/client/lib/javascript-knowledge.mjs'
        code="import {pathToFileURL} from 'node:url'; const m=await import(pathToFileURL(process.argv[1])); process.stdout.write(m.JAVASCRIPT_KNOWLEDGE_SHA256);"
        result=subprocess.run([self.writer.node['path'],'--input-type=module','-e',code,str(asset)],
            stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=10,check=False)
        if result.returncode!=0 or len(result.stdout)!=64:raise ValueError('javascript_acceptance_candidate_knowledge_export')
        prepare=next(c['result'] for c in cli_public_calls(events) if c['part']['tool']=='loginom_dock_prepare'
            and c['result'] and c['result'].get('prepared') is True)
        cards=[c for c in prepare['knowledge']['node_types'] if c.get('type')=='programming.javascript']
        if (len(cards)!=1 or cards[0].get('knowledge_sha256')!=result.stdout.decode('ascii')
                or cards[0].get('candidate_node_apply_available') is not True
                or cards[0].get('validated_for',{}).get('loginom_build')!='7.4.2'):
            raise ValueError('javascript_acceptance_actual_candidate_knowledge_delivery')

    def launch_cold(self,config,profile,evidence,*,environment):
        require_proof(self.audit_writer(),'javascript_acceptance_writer_before_cold')
        return JavascriptProcessController.launch_cold(self.writer,self.cleanup,self.reader,config,profile,evidence,environment=environment)

    def finish(self,cold,capture):
        stages={}
        self.cold,self.cold_capture=cold,capture
        try:
            stages['writer']=require_proof(self.audit_writer(),'javascript_acceptance_writer')
            writer=self.writer
            if (not isinstance(cold,JavascriptProcessController) or cold.kind!='cold' or cold.candidate!=writer.candidate
                    or cold.lease is not writer.lease or cold.launch.get('writer_pid')!=writer.process.pid
                    or cold.launch.get('transport')!='separate_path_only_reader' or cold.launch.get('headed') is not True
                    or cold.launch.get('package_path')!=self.baseline['package_path']
                    or cold.launch.get('reader')!=self.reader or cold.reader_freeze!=self.reader
                    or str(cold.owner.profile)!=writer.lease.expected['cold_profile'] or 'cold' not in writer.lease.used
                    or cold.submitted_at<=writer.result['finished_at']):
                raise ValueError('javascript_acceptance_original_separate_cold')
            if stages['writer']['stages']['source_review']['reviewed_at']>cold.submitted_at:
                raise ValueError('javascript_acceptance_source_review_before_cold')
            summary=captured_events(cold,capture,self.reader)
            if len(summary)!=1:raise ValueError('javascript_acceptance_one_cold_summary')
            directory=Path(cold.launch['evidence'])
            report_bytes,report_pin=private_bytes(directory/'report.json')
            journal_bytes,journal_pin=private_bytes(directory/'execution-events.jsonl')
            if not journal_bytes or not journal_bytes.endswith(b'\n'):raise ValueError('javascript_acceptance_complete_cold_journal')
            report=json.loads(report_bytes)
            native=[json.loads(line) for line in journal_bytes.splitlines()]
            if (summary[0]!=dict(status=report.get('status'),work_stage=report.get('work_stage'),
                    report=str(directory/'report.json'),cleanup=report.get('cleanup'))
                    or report.get('host_process',{}).get('pid')!=cold.process.pid
                    or report['host_process'].get('profile')!=str(cold.owner.profile)
                    or not cold.submitted_at<=native_time(report['host_process']['started_at'])<=native_time(report['started_at'])
                    or native_time(report['finished_at'])>cold.result['finished_at']
                    or report.get('node')!=cold.candidate[1]['node_version']
                    or any(report.get('cleanup',{}).get(key) is not True for key in ('package_closed','logged_out','browser_closed'))
                    or report.get('cleanup',{}).get('failure')):
                raise ValueError('javascript_acceptance_cold_summary_original_process_cleanup')
            expected=dict(account=self.expected['account'],package_path=self.baseline['package_path'],
                journal=dict(session_id='javascript-g2',runtime_revision='operator-source',
                    target=dict(origin='http://logi-test-plan.bg.local',loginom_build='7.4.2')),
                preparation_target=dict(profile_id='javascript-ubuntu',loginom_build='7.4.2',platform='linux',browser='chromium'),
                preparation_session_id='javascript-cold')
            stages['cold']=require_proof(verify_javascript_cold(report,native,self.baseline,expected,self.output_columns,self.rows),
                'javascript_acceptance_saved_source_settings_guid_graph_full_output')
            self.writer.lease.revalidate()
            if not self.writer.native_watch.revalidate():raise ValueError('javascript_acceptance_writer_artifacts_changed_after_cold')
            files=[report_pin,journal_pin,stages['writer']['stages']['source_review']['file']]
        except (OSError,ValueError,KeyError,IndexError,TypeError,AttributeError,UnicodeError,OverflowError,StopIteration) as error:
            self.failures.add(str(error) if isinstance(error,ValueError) else 'javascript_acceptance_cold_missing_or_malformed')
            files=[]
        self.result=dict(version=1,passed=not self.failures,failures=sorted(self.failures),stages=stages,files=files,
            schema_mode=self.expected.get('schema_mode'),package_path=self.expected.get('package_path'),
            scope='one_original_normal_sol_low_cli_writer_and_separate_path_only_cold_trial',
            cli_acceptance_verified=not self.failures,cold_persistence_verified=not self.failures,
            exclusive_writer_identity_verified=False,host_lease_release_verified=False)
        self.terminal_sha256=value_digest(self.result)
        return copy.deepcopy(self.result)


def verify_javascript_cli_pair(trials):
    """Two original terminal objects; reread files, not released manual leases."""
    failures=[]
    try:
        if (not isinstance(trials,(list,tuple)) or len(trials)!=2
                or any(not isinstance(trial,JavascriptCliAcceptance) for trial in trials)
                or {trial.expected['schema_mode'] for trial in trials}!={'code','declared'}):
            raise ValueError('javascript_acceptance_two_original_mode_trials')
        for trial in trials:
            require_proof(trial.result,'javascript_acceptance_terminal_trial')
            if value_digest(trial.result)!=trial.terminal_sha256:
                raise ValueError('javascript_acceptance_terminal_result_changed')
            captured_events(trial.writer,trial.capture,trial.reader)
            captured_events(trial.cold,trial.cold_capture,trial.reader)
            if not trial.writer.native_watch.revalidate():raise ValueError('javascript_acceptance_terminal_native_changed')
            for record in trial.result['files']:
                _,current=private_bytes(record['path'])
                if current!=record:raise ValueError('javascript_acceptance_terminal_cold_file_changed')
        first,second=trials
        if (first.writer.candidate!=second.writer.candidate or first.reader!=second.reader
                or first.expected['cli_session_id']==second.expected['cli_session_id']
                or first.expected['runtime_session_id']==second.expected['runtime_session_id']
                or first.expected['package_path']==second.expected['package_path']
                or first.writer.lease.expected['lease_id']==second.writer.lease.expected['lease_id']):
            raise ValueError('javascript_acceptance_independent_sessions_paths_leases_same_candidate')
        controllers=[controller for trial in trials for controller in (trial.writer,trial.cold)]
        if len({(controller.owner.root['pid'],controller.owner.root['start_ticks']) for controller in controllers})!=4:
            raise ValueError('javascript_acceptance_four_original_processes')
        profiles=[controller.owner.profile for controller in controllers]
        if any(a.is_relative_to(b) or b.is_relative_to(a) for i,a in enumerate(profiles) for b in profiles[i+1:]):
            raise ValueError('javascript_acceptance_four_disjoint_profiles')
    except (OSError,ValueError,KeyError,IndexError,TypeError,AttributeError,UnicodeError,OverflowError) as error:
        failures.append(str(error) if isinstance(error,ValueError) else 'javascript_acceptance_pair_missing_or_malformed')
    return dict(version=1,passed=not failures,failures=sorted(set(failures)),
        scope='two_independent_original_normal_sol_low_mode_trials_same_frozen_candidate',
        cli_acceptance_verified=not failures,exclusive_writer_identity_verified=False,host_lease_release_verified=False)
