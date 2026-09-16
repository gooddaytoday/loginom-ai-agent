"""Node16 preparation/admission. No credentials, network, browser or model calls."""
import hashlib,json,re,shutil
from pathlib import Path
from destinations import storage_segments
from preflight import runtime_pin
WORK=Path(__file__).resolve().parent;ROOT=WORK.parents[1]
KIT=WORK/'collapse/acceptance-kit'
GOAL_ID='collapse-node-complete'
# Coordinator-approved exact Null-marker transfer from node14 (814f3146).
# The original kit's source metadata remains historical; cases/fixtures unchanged.
SOURCE='8cd5c2811a216b45ae50a16a4ed1930e4e87fa59'
RUNTIME='17b0ede0035452a2e9481a3ba007b97a8d1b1b47fdd13ffd4e9153b90dc8daed'
# Native per-session raw bytes/topology producer; bare receipt documents remain unsupported.
READONLY_PRODUCER='collapse_native_sessions_v1'
CANDIDATE_URI='viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.14-node16-8cd5c281-candidate/manifest.json'
CANDIDATE_SHA='0badbd69238af677d85da3ac9bc8a52fc889f303fcdd8c06bb75ff8773ee5514'
SLOT='node16-hermes-20260914-0badbd69'
REHEARSAL=ROOT/'.dock/node16/candidate4-rehearsal-20260914'
STAGE=WORK/'collapse/runner-integration/candidate-stage.json'

def verified_candidate():
    stage=json.loads(STAGE.read_text())
    if stage['source_commit']!=SOURCE or stage['stage']['manifest_sha256']!=CANDIDATE_SHA or not stage['stage']['staged'] or stage['activated'] is not False:raise ValueError('Candidate stage differs')
    if len(stage['files'])!=4 or not all(f['readback_equal'] for f in stage['files']):raise ValueError('Candidate readback incomplete')
    raw=json.loads((REHEARSAL/'operator-1.json').read_text())
    if raw.get('isError'):raise ValueError('Candidate prepare failed')
    prep=json.loads(raw['content'][0]['text'])
    if prep.get('result_version')!='user-v1':raise ValueError('Candidate rehearsal must use real user-v1 MCP')
    manifest=prep['knowledge']['session_manifest'];workspace=prep['workspace']
    if not prep['prepared'] or workspace['status']!='READY' or not workspace['target_verified'] or workspace['target']['loginom_build']!='7.4.2':raise ValueError('Real candidate preparation missing')
    if manifest['actionManifestDigest']!=CANDIDATE_SHA or manifest['actionCatalogDigest']!=stage['stage']['action_catalog_sha256'] or manifest['selectorCatalogDigest']!=stage['stage']['selector_catalog_sha256']:raise ValueError('Prepared candidate pins differ')
    session=REHEARSAL/'dock-state/sessions'/prep['sessionId']
    metadata=json.loads((session/'session.json').read_text());browser=json.loads((session/'playwright.json').read_text())['browser']
    if metadata['clientRevision']!=RUNTIME or metadata.get('resultProfile')!='user-v1' or browser['contextOptions']['viewport'] is not None or '--start-maximized' not in browser['launchOptions']['args']:raise ValueError('Candidate runtime/profile/window config differs')
    window=workspace['window']
    if window['width']<window['available_width']*.9 or window['outer_height']<window['available_height']*.9:raise ValueError('Actual candidate window not expanded')
    describe=json.loads(json.loads((REHEARSAL/'operator-3.json').read_text())['content'][0]['text'])
    save=next(x for x in describe['actions'] if x['action_key']=='package.save_checkpoint')
    if save['effect']['allowed_roots']!=['/test-1/node16-20260913-a56c2488']:raise ValueError('Candidate storage roots differ')
    card=next(x for x in describe['node_types'] if x['type']=='transform.collapse_columns')
    if card['candidate_node_apply_available'] is not True or card['candidate_modes']!=['unpivot']:raise ValueError('Candidate Collapse unavailable')
    return dict(manifest_uri=CANDIDATE_URI,manifest_sha256=CANDIDATE_SHA,slot=SLOT,session_id=prep['sessionId'],model_started=False)


def current_slot():
    state=ROOT.parents[1]/'.dock/node-streams-20260912/state.json'
    slot=json.loads(state.read_text()).get('hermes_slot')
    if not isinstance(slot,dict) or slot.get('node')!=16 or slot.get('thread_id')!='01a0992c-6ce0-7f10-bd53-9bf92ed7ae8a' or slot.get('candidate_sha256')!=CANDIDATE_SHA or slot.get('provider')!='openai-codex' or slot.get('model')!='gpt-5.6-sol' or slot.get('reasoning')!='low' or slot.get('status') in ('released','completed','failed'):
        raise ValueError('Coordinator slot is not currently reserved for node16')
    return slot

def require_user_profile(config):
    profile=config.get('hermes_profile')
    if not isinstance(profile,dict) or profile.get('version')!=1 or profile.get('result_profile')!='user-v1' or profile.get('mode')!='executor-replay':
        raise ValueError('Collapse acceptance requires an explicit private Hermes user-v1 profile')

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def frozen():
    m=json.loads((KIT/'manifest.json').read_text())
    for name,digest in m['kit_files'].items():
        path=(KIT/name).resolve()
        if not path.is_relative_to(KIT.resolve()) or sha(path)!=digest:raise ValueError('Collapse frozen kit changed: '+name)
    if (WORK/'goals/collapse-node-complete.txt').read_bytes()!=(KIT/'hermes-goal.md').read_bytes():raise ValueError('Collapse goal changed')
    return json.loads((KIT/'goal.json').read_text())
def harness_pins():
    paths=[*WORK.glob('*.py'),*WORK.glob('*.mjs'),WORK/'goals/collapse-node-complete.txt']
    paths += [KIT.parent/'exact-wiring/public-audit.py',KIT.parent/'review-fix/provenance.json',KIT.parent/'runner-integration/readonly-source.schema.json',KIT.parent/'runner-integration/candidate-stage.json']
    paths += [p for p in KIT.rglob('*') if p.is_file() and '__pycache__' not in p.parts]
    paths += [p for folder in ['native-gates','existing-input-preflight'] for p in (KIT.parent/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts]
    return {p.relative_to(WORK).as_posix():sha(p) for p in sorted(paths)}
def fixtures(run_id,directory):
    frozen();storage_segments(directory)
    if not re.fullmatch(r'\d{8}-\d{6}-[a-f0-9]{8}',run_id):raise ValueError('Invalid Collapse run identity')
    return [dict(name='Dock-collapse-'+run_id+'-'+p.name,bytes=p.stat().st_size,sha256=sha(p),upload=dict(directory=directory,overwrite='replace')) for p in sorted((KIT/'fixtures').glob('*.csv'))]
def fixture_paths():return sorted((KIT/'fixtures').glob('*.csv'))
def prompt(package,directory,run_id):
    text=(KIT/'hermes-goal.md').read_text()
    text=text.replace('# Замороженное задание будущего запуска — не запускать до допуска', '# Выполните полное задание в Loginom сейчас',1)
    text='Допуск оператора уже выдан: кандидат '+CANDIDATE_SHA+' проверен, эксклюзивный слот выделен. Выполните все действия ниже сейчас, без дополнительного подтверждения. Историческое условие ожидания допуска выполнено.\n\n'+text
    for p,a in zip(fixture_paths(),fixtures(run_id,directory)):text=text.replace(p.name,a['name'])
    text+='\nИдентификаторы итоговых операций: '+', '.join(run_id+':'+k for k in json.loads((KIT/'expected.json').read_text()))+'. Отдельные операции: '+', '.join(run_id+':'+k for k in ['done','close','negative-conflict','negative-missing','negative-empty','loss'])+'. Для отрицательного отсутствующего поля используйте __MissingField__. При потере ответа сохраняйте исходную операцию.\n'
    text+='\nДля независимого открытия сохраните каждый из десяти итоговых вариантов отдельным пакетом в этом каталоге: Dock-collapse-'+run_id+'-<имя случая>.lgp. В каждом пакете один сценарий с одной парой текстовый импорт → Свёртка; промежуточные варианты не должны перезаписывать окончательные сохранённые случаи. Идентификаторы финального сохранения: '+', '.join(run_id+':save-'+k for k in json.loads((KIT/'expected.json').read_text()))+'.\n'
    text+='\nОбычное итоговое сохранение каждого случая выполняйте через dock_action_run с action_key package.save_checkpoint: это сохраняет открытый сценарий. package.save_as с переоткрытием используйте только при отдельном требовании переоткрыть пакет. Для разных исходных CSV создавайте новый пакет с одной новой парой Текстовый импорт → Свёртка; существующую Свёртку изменяйте в предусмотренном заданием случае reconfigured. При добавлении нового поля в настройки существующего импорта задавайте полностью name, label, type, data_kind, used. Сохраняйте заданные типы, одинаковые метки, порядок и формат источника; это не сокращает десять случаев, полное чтение 470 ячеек и отрицательные проверки.\n'
    return text+'\nКаталог: '+directory+'\nОсновной пакет: '+package+'\nRun ID: '+run_id+'\nНачинайте operation_id с '+run_id+'; каждому действию — новый суффикс.\n'
def admission(args):
    errors=[]
    try:g=frozen();gates={k:v for k,v in g['gates'].items() if k!='autonomous-audit'}
    except (OSError,ValueError,KeyError) as e:gates={'freeze':'OPEN'};errors.append(str(e))
    gates['runner-collapse-goal-integration']='IMPLEMENTED_NOT_ADMITTED'
    gates['new-session-readonly-source-proof']='IMPLEMENTED_LIVE_VERIFIED_DIAGNOSTIC'
    for key in ['header-only','empty-ignore','all-null','all-null-ignore','other-full-scope-live']:
        gates[key]='DIAGNOSTIC_PASS_RUNTIME51_CURRENT_TARGETED_FIX_PASS'
    gates['candidate-stage-and-readback']='OPEN_NO_ADMITTED_ATTESTATION'
    gates['candidate-source-rehearsal']='OPEN'
    gates['independent-topology-readback-producers']='IMPLEMENTED_LIVE_VERIFIED_DIAGNOSTIC'
    gates['loss-native-evidence-bridge']='IMPLEMENTED_DIAGNOSTIC_PASS_CURRENT_RUN_REQUIRED'
    gates['coordinator-hermes-slot']='OPEN'
    free=shutil.disk_usage(ROOT).free
    # Space alone never grants a slot/resource reservation across active streams.
    gates['resource']='OPEN_RESERVATION_REQUIRED' if free>=10*1024**3 else 'OPEN_INSUFFICIENT_10_GIB'
    try:
        pin=runtime_pin(ROOT)
        if pin['client_revision']!=RUNTIME:gates['source-runtime']='OPEN_MISMATCH'
    except (OSError,ValueError):gates['source-runtime']='OPEN_UNVERIFIED'
    verified=None
    try:
        verified=verified_candidate()
        if args is not None and (getattr(args,'manifest_uri',None)!=CANDIDATE_URI or getattr(args,'manifest_sha256',None)!=CANDIDATE_SHA):raise ValueError('Exact coordinator candidate arguments required')
        if args is not None and getattr(args,'model_profile','chatgpt-sol')!='chatgpt-sol':raise ValueError('Only approved Sol profile allowed')
        gates['candidate-stage-and-readback']='PASS';gates['candidate-source-rehearsal']='PASS'
        slot=current_slot();verified['slot']=slot['slot_id']
        gates['coordinator-hermes-slot']='RESERVED:'+slot['slot_id']
        gates['resource']='PASS' if free>=10*1024**3 else 'OPEN_INSUFFICIENT_10_GIB'
        gates['runner-collapse-goal-integration']='ADMITTED_FOR_CURRENT_CANDIDATE'
    except (OSError,ValueError,KeyError,TypeError,StopIteration) as ex:errors.append(str(ex))
    ready=not errors and free>=10*1024**3 and not any(str(v).startswith('OPEN') for v in gates.values())
    return dict(goal_id=GOAL_ID,status='READY_FOR_MODEL' if ready else 'BLOCKED',ready=ready,model_started=False,candidate=verified,source_sha=SOURCE,runtime=RUNTIME,
                provider='openai-codex',model='gpt-5.6-sol',reasoning_effort='low',fallback_allowed=False,
                gates=gates,errors=errors,free_bytes=free,minimum_hermes_free_bytes=10*1024**3,
                readonly_producer=READONLY_PRODUCER,harness_inputs=harness_pins())
def require_admission(args):
    result=admission(args)
    if not result['ready']:raise ValueError('Collapse admission blocked: '+', '.join(result['gates']))
    return result
