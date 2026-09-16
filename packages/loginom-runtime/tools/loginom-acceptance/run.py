#!/usr/bin/env python3
"""Isolated source acceptance. --preflight never starts MCP, browser or model."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
from urllib.parse import urlsplit, parse_qsl
import signal
import subprocess
import sys
import time
import uuid

from evidence import export_history, clean
from preflight import preflight, runtime_pin
from destinations import storage_segments, render_goal
import upload_probe
import duplicates_upload_probe
import missing_values_goal
import collapse_acceptance
import rc_combined_goal
from text_export_readiness import require_reject_baseline_reader,REJECT_BASELINE_BLOCKER,isolated_user_config
import text_export_upload_probe
import union_upload_probe
import replacement_upload_probe
import union_review_upload_probe
import join_upload_probe
import join_review_upload_probe
import grouping_upload_probe
import reform_upload_probe
import filter_upload_probe
import sales_upload_probe
import data_pipeline
from hermes_auth_guard import POLICY as AUTH_POLICY
from hermes_runtime_guard import POLICY as MODEL_POLICY
from node_efficiency import USAGE_KEYS, node_efficiency

WORK = Path(__file__).resolve().parent
REPO = WORK.parents[1]
GOAL = WORK / "goals/basic-graph.txt"
NATIVE_SKILL = REPO / "plugins/loginom-dock-hermes/skills/loginom/SKILL.md"
MANIFEST_ROOT = "viking://resources/loginom-dock/catalogs/executor-preview/releases/"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def harness_unchanged(inputs):
    return all((WORK / name).is_file() and sha(WORK / name) == digest for name, digest in inputs.items())


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    data = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    # Evidence is append-by-artifact: never overwrite a previous attempt.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        output.write(data)


def connection(home):
    # Read only the already connected Hermes subscription, never Codex CLI auth.
    state = json.loads((home / "auth.json").read_text()).get("providers", {}).get("openai-codex", {})
    tokens = state.get("tokens", {})
    if state.get("auth_mode") != "chatgpt" or not all(isinstance(tokens.get(k), str) and tokens[k]
            for k in ("access_token", "refresh_token")):
        raise ValueError("Existing Hermes ChatGPT subscription required; fallback is forbidden")
    try:
        payload = json.loads(base64.urlsafe_b64decode(tokens["access_token"].split(".")[1] + "==="))
        valid = payload["exp"] > time.time() + 4200
    except (ValueError, KeyError, IndexError, TypeError):
        valid = False
    if not valid:
        raise ValueError("Refresh the existing Hermes subscription before acceptance; isolated copies must not rotate shared refresh tokens")
    return {"version": 1, "active_provider": "openai-codex", "providers": {"openai-codex": {
        "auth_mode": "chatgpt", "tokens": tokens, "last_refresh": state.get("last_refresh")}}}


def xiaomi_connection(home):
    # Read only the explicitly selected existing Hermes key. Do not load the
    # whole .env, interpolate variables, or inherit backup provider credentials.
    values=[]
    for line in (home / '.env').read_text().splitlines():
        stripped=line.strip()
        if stripped.startswith('export '):stripped=stripped[7:].lstrip()
        name,sep,value=stripped.partition('=')
        if sep and name.strip()=='XIAOMI_API_KEY':
            parts=shlex.split(value,comments=True,posix=True)
            if len(parts)!=1 or not parts[0] or any(c.isspace() for c in parts[0]):
                raise ValueError('Existing Hermes Xiaomi key is malformed')
            values.append(parts[0])
    if len(values)!=1:raise ValueError('Exactly one existing Hermes Xiaomi key is required')
    # Subscription keys use the endpoint attached to the existing Hermes pool
    # entry, not Xiaomi's pay-as-you-go API default.
    auth=json.loads((home / 'auth.json').read_text())
    pool=auth.get('credential_pool',{}).get('xiaomi',[])
    matches=[entry for entry in pool if isinstance(entry,dict) and entry.get('source')=='env:XIAOMI_API_KEY'] if isinstance(pool,list) else []
    if len(matches)!=1:raise ValueError('One existing Xiaomi subscription connection is required')
    endpoint=matches[0].get('base_url','');url=urlsplit(endpoint)
    if (url.scheme!='https' or not re.fullmatch(r'token-plan(?:-[a-z]+)?\.xiaomimimo\.com',url.hostname or '')
        or url.username or url.password or url.port or url.query or url.fragment or url.path.rstrip('/')!='/v1'):
        raise ValueError('Existing Xiaomi connection is not a supported subscription endpoint')
    return {'XIAOMI_API_KEY':values[0],'XIAOMI_BASE_URL':endpoint}



def environment(connection_values, home, run):
    # Only OS/runtime variables and the existing approved connection are inherited.
    allowed = ("PATH", "HOME", "USER", "LOGNAME", "SHELL", "TMPDIR", "LANG", "LC_ALL", "TERM",
               "SSL_CERT_FILE", "SSL_CERT_DIR", "REQUESTS_CA_BUNDLE", "DISPLAY",
               "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
               "http_proxy", "https_proxy", "all_proxy", "no_proxy")
    result = {key: os.environ[key] for key in allowed if key in os.environ}
    if sys.platform == 'linux':
        for key in ('DISPLAY', 'XAUTHORITY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'XDG_SESSION_TYPE', 'XDG_CURRENT_DESKTOP'):
            value = os.environ.get(key)
            if value and not value.startswith('()'):
                result[key] = value
            else:
                result.pop(key, None)
    result.update(connection_values)
    result.update(HERMES_HOME=str(home), HERMES_CWD=str(run), PYTHONDONTWRITEBYTECODE="1")
    return result


def exported_events(dock_home, secrets):
    paths = sorted(dock_home.glob("sessions/*/execution-events.jsonl"))
    events = []
    for path in paths:
        for line in path.read_text().splitlines():
            if line.strip():
                events.append(clean(json.loads(line), secrets))
    return events


def validate_loginom_url(value):
    target = urlsplit(value)
    if (target.scheme not in ('http', 'https') or not target.hostname or target.username or target.password
            or target.fragment or any(re.search(r'token|password|secret|auth|api.?key', k, re.I) for k, _ in parse_qsl(target.query, keep_blank_values=True))):
        raise ValueError('Loginom target must be an HTTP(S) URL without credentials')
    return value


def validate_inputs(args):
    if getattr(args, 'goal', None) in rc_combined_goal.GOALS:
        rc_combined_goal.validate(args)
    if getattr(args, "goal", None)=="text-export-node-complete" and getattr(args, "run", False):
        require_reject_baseline_reader()
    if getattr(args, 'goal', None) in ('duplicates-node-complete','union-node-complete','union-review-complete') and not getattr(args, 'loginom_url', None):
        raise ValueError('This node acceptance requires an explicit Loginom target')
    if getattr(args, 'loginom_url', None) is not None:
        validate_loginom_url(args.loginom_url)
    if sys.platform not in ('darwin', 'linux'):
        raise ValueError('Acceptance supports macOS and Linux; other platforms require separate validation')
    profile=getattr(args,'model_profile','chatgpt-sol')
    if profile not in ('chatgpt-sol','xiaomi-mimo') or profile=='xiaomi-mimo' and getattr(args,'goal',None)!='data-pipeline':
        raise ValueError('Xiaomi comparison is authorized only for the full data-pipeline goal')
    if getattr(args,'goal',None)=='text-export-node-complete':
        text_export_upload_probe.validate_catalog(args.manifest_uri,args.manifest_sha256,args.storage_directory)
        if args.loginom_user!='test-2' or args.loginom_url!='http://logi-test-plan.bg.local/app/?testable=true':raise ValueError('Node17 fixed live identity required')
        text_export_upload_probe.verify_expected()
    max_turns_limit=300 if getattr(args,'goal','basic-graph') in ('data-pipeline','calculator-roundtrip','missing-values-complete') else 100
    timeout_limit = 14400 if getattr(args, 'goal', None) == 'date-time-sales' else 3600
    if getattr(args,'goal',None)==collapse_acceptance.GOAL_ID:
        timeout_limit=7200;max_turns_limit=140
    if not 30 <= args.timeout <= timeout_limit or not 1 <= args.max_turns <= max_turns_limit:
        raise ValueError("Invalid acceptance budget")
    if args.manifest_uri is not None and not re.fullmatch(re.escape(MANIFEST_ROOT) + r"[0-9A-Za-z.+-]+/manifest\.json", args.manifest_uri):
        raise ValueError("Invalid candidate manifest URI")
    if args.manifest_sha256 is not None and not re.fullmatch(r"[a-f0-9]{64}", args.manifest_sha256):
        raise ValueError("Invalid candidate digest")
    if getattr(args,'goal',None) in ('duplicates-node-complete','replacement-node-complete','join-node-complete','join-review-complete','union-node-complete','union-review-complete'):
        (duplicates_upload_probe if args.goal=='duplicates-node-complete' else replacement_upload_probe if args.goal=='replacement-node-complete' else join_upload_probe).validate_catalog(args.manifest_uri,args.manifest_sha256,args.storage_directory)
    if getattr(args,'goal',None)=='missing-values-complete':
        if args.loginom_user!='test-4' or args.loginom_url!='http://logi-test-plan.bg.local/app/?testable=true' or profile!='chatgpt-sol':raise ValueError('Node14 target/profile differs')
        missing_values_goal.fixtures()
        if args.run or args.manifest_uri or args.manifest_sha256:missing_values_goal.validate_catalog(args.manifest_uri,args.manifest_sha256,args.storage_directory)
    if args.run:
        storage_segments(getattr(args,'storage_directory',None))
        login=getattr(args,'loginom_user',None)
        if not isinstance(login,str) or not login.strip() or len(login)>200 or re.search(r'[\x00-\x1f\x7f]',login):
            raise ValueError('Run requires an explicit Loginom account; no username default is assumed')
    if args.run and (not args.manifest_uri or not args.manifest_sha256):
        raise ValueError("Run requires exact candidate URI and SHA")


def execute(args):
    os.umask(0o077)
    date_admission = None
    if getattr(args, 'goal', None) == 'date-time-sales':
        from date_time_launch import guard
        date_admission = guard(args)
    if getattr(args,'goal',None)==collapse_acceptance.GOAL_ID:
        # Deliberately before auth/config reads, dependency checks and subprocesses.
        admission=collapse_acceptance.admission(args)
        if not args.run and not admission['ready']:
            write(args.output,admission)
            print(json.dumps({k:v for k,v in admission.items() if k!='harness_inputs'}))
            return 0
        collapse_acceptance.require_admission(args)
    validate_inputs(args)
    profile=getattr(args,'model_profile','chatgpt-sol')
    provider,model=('xiaomi','mimo-v2.5') if profile=='xiaomi-mimo' else ('openai-codex','gpt-5.6-sol')
    reasoning = 'medium' if profile == 'xiaomi-mimo' else 'low'
    model_env=xiaomi_connection(args.hermes_home) if profile=='xiaomi-mimo' else {}
    connection_values = connection(args.hermes_home) if profile=='chatgpt-sol' else {'version':1,'providers':{}}
    dock = json.loads(args.dock_config.read_text())
    if getattr(args,'goal',None)==collapse_acceptance.GOAL_ID:collapse_acceptance.require_user_profile(dock)
    loginom_url = getattr(args, 'loginom_url', None) or dock.get('loginom_url')
    if loginom_url is not None:
        validate_loginom_url(loginom_url)
    secrets = [*connection_values.get("providers",{}).get("openai-codex",{}).get("tokens",{}).values(), model_env.get("XIAOMI_API_KEY"), dock.get("api_key")]
    goal_id = getattr(args, "goal", "basic-graph")
    join_probe=text_export_upload_probe if goal_id=="text-export-node-complete" else duplicates_upload_probe if goal_id=="duplicates-node-complete" else replacement_upload_probe if goal_id=="replacement-node-complete" else union_review_upload_probe if goal_id=="union-review-complete" else union_upload_probe if goal_id=="union-node-complete" else join_review_upload_probe if goal_id=="join-review-complete" else join_upload_probe
    join_fixture_dir="fixtures/text-export/input" if goal_id=="text-export-node-complete" else "fixtures/duplicates" if goal_id=="duplicates-node-complete" else "fixtures/replacement" if goal_id=="replacement-node-complete" else "fixtures/union-review" if goal_id=="union-review-complete" else "fixtures/union" if goal_id=="union-node-complete" else "fixtures/join-review" if goal_id=="join-review-complete" else "fixtures/join"
    goal = WORK / "goals" / (goal_id + ".txt")
    if goal_id != "basic-graph" and getattr(args, "fault", "none") != "none":
        raise ValueError("Auto-link goals require no fault injection")
    source = preflight(REPO)
    frozen = source["runtime"]
    fault = getattr(args, "fault", "none")
    dependencies = subprocess.run([str(args.node), str(WORK / "runtime-check.mjs"), str(REPO), str(args.browsers)],
                                  capture_output=True, text=True, check=True, timeout=30)
    dependencies = json.loads(dependencies.stdout)
    # Version command is local, receives an empty isolated home and no model keys.
    import tempfile
    with tempfile.TemporaryDirectory(prefix="dock-hermes-version-") as temp:
        version = subprocess.run([str(args.hermes), "--version"], capture_output=True, text=True, check=True, timeout=30,
                                 env=environment({}, Path(temp), Path(temp)))
    match = re.search(r"(?<![0-9.])v?0\.21\.0(?![0-9.])", version.stdout)
    if not match:
        raise ValueError("Hermes version differs from approved 0.21.0")
    harness_inputs = {p.relative_to(WORK).as_posix(): sha(p) for p in sorted(WORK.glob("*.py"))}
    harness_inputs.update({p.name: sha(p) for p in sorted(WORK.glob("*.mjs"))})
    harness_inputs["goals/" + goal_id + ".txt"] = sha(goal)
    probe=filter_upload_probe if goal_id=='filter-node-complete' else reform_upload_probe if goal_id=='reform-node-complete' else sales_upload_probe if goal_id=='sales-sorting-complete' else grouping_upload_probe if goal_id=='grouping-node-complete' else upload_probe
    if goal_id in ('file-upload-probe','file-upload-verify','data-pipeline','import-roundtrip','calculator-roundtrip','node-import-roundtrip','node-apply-complete','calculator-node-complete','grouping-node-complete','sales-sorting-complete','reform-node-complete','filter-node-complete'):
        fixture=WORK / probe.FIXTURE
        if sha(fixture)!=probe.FIXTURE_SHA or fixture.stat().st_size!=getattr(probe,'FIXTURE_BYTES',230):
            raise ValueError('Upload probe fixture changed')
        harness_inputs[probe.FIXTURE]=sha(fixture)
    if goal_id in ('data-pipeline','import-roundtrip','calculator-roundtrip','node-import-roundtrip','node-apply-complete','calculator-node-complete'):
        harness_inputs.update({name:sha(WORK / name) for name in data_pipeline.FIXTURES})
    if goal_id in ('text-export-node-complete','duplicates-node-complete','replacement-node-complete','join-node-complete','join-review-complete','union-node-complete','union-review-complete'):
        for name,(expected_sha,expected_bytes) in join_probe.FIXTURES.items():
            fixture=WORK / join_fixture_dir / name
            if sha(fixture)!=expected_sha or fixture.stat().st_size!=expected_bytes:raise ValueError('Join fixture changed')
            harness_inputs[join_fixture_dir+'/'+name]=sha(fixture)
    if goal_id == 'replacement-node-complete':
        for fixture in sorted((WORK / 'fixtures/replacement').glob('*.json')):
            harness_inputs[fixture.relative_to(WORK).as_posix()] = sha(fixture)
    if date_admission is not None:
        from date_time_goal_oracle import FIXTURES
        from date_time_admission import INPUTS
        for name in ('sales.csv', 'expected.json', 'inputs.json', 'admission.pending.json'):
            harness_inputs['fixtures/date-time/'+name] = sha(FIXTURES/name)
    if goal_id=='missing-values-complete':
        for name in [*missing_values_goal.FILES,'acceptance-pins.json']:
            harness_inputs['fixtures/missing-values/'+name]=sha(WORK/'fixtures/missing-values'/name)
        for name in ('fixtures/missing-values-refusal-live.json.gz','node14/refusal-live.mjs','fixtures/import-placement-refusal-live.json.gz','node14/import-refusal-live.mjs'):
            harness_inputs[name]=sha(WORK/name)
    if goal_id==collapse_acceptance.GOAL_ID:
        harness_inputs.update(collapse_acceptance.harness_pins())
    if goal_id in rc_combined_goal.GOALS:
        harness_inputs.update(rc_combined_goal.fixture_pins())
    if goal_id=="text-export-node-complete":
        harness_inputs.update({p.relative_to(WORK).as_posix():sha(p) for p in sorted((WORK/"fixtures/text-export").rglob("*")) if p.is_file()})
    info = {"schema_version": 2, "loginom_url": loginom_url, "loginom_user":args.loginom_user, "storage_directory":getattr(args,"storage_directory",None), "scope": "source_runtime", "model_started": False,
            "provider": provider, "model": model, "reasoning_effort": reasoning, "hermes_version": "0.21.0",
            "model_profile": profile, "provider_selection": "explicit CLI; effective usage identity checked after the run",
            "fallback_allowed": False, "dependencies": dependencies,
            "runtime_source_pin": frozen, "source_inventory": source["source"],
            "harness_inputs": harness_inputs, "goal_id": goal_id, "goal_sha256": sha(goal),
            "native_skill": {"name": "loginom", "source": NATIVE_SKILL.relative_to(REPO).as_posix(),
                             "sha256": sha(NATIVE_SKILL), "activation": "Hermes --skills loginom"},
            "fault_injection": False if fault == "none" else fault,
            "require_knowledge_recovery": getattr(args, "require_knowledge_recovery", False),
            "allow_manual_reopen": getattr(args,"allow_manual_reopen",False),
            "require_verification": getattr(args, "require_verification", False),
            "require_delivered_context": getattr(args, "require_delivered_context", False),
            "budget": {"timeout_seconds": args.timeout, "max_turns": args.max_turns},
            "series": {"planned_attempts": 1, "variant": fault, "pass_criteria": "text_export_acceptance.py full declared scenario plus independent fresh-session gates" if goal_id=="text-export-node-complete" else "duplicates_node_acceptance.py full scenario contract" if goal_id=="duplicates-node-complete" else "replacement_acceptance.py full declared scenario and reopening" if goal_id=="replacement-node-complete" else "union_review_acceptance.py full scenario contract" if goal_id=="union-review-complete" else "union_node_acceptance.py full scenario contract" if goal_id=="union-node-complete" else "join_node_acceptance.py full scenario contract" if goal_id in ("join-node-complete","join-review-complete") else "filter_node_acceptance.py full scenario contract" if goal_id == 'filter-node-complete' else "reform_node_acceptance.py full scenario contract" if goal_id == 'reform-node-complete' else "sales_sorting_acceptance.py full scenario contract" if goal_id == 'sales-sorting-complete' else "grouping_node_acceptance.py full scenario contract" if goal_id == 'grouping-node-complete' else "calculator_node_acceptance.py full scenario contract" if goal_id == 'calculator-node-complete' else "node_apply_acceptance.py full scenario contract" if goal_id == 'node-apply-complete' else "audit.py declared variant contract"},
            "manifest_uri": args.manifest_uri, "manifest_sha256": args.manifest_sha256}
    if date_admission is not None:
        info['acceptance_inputs_sha256'] = sha(INPUTS)
        info['series']['pass_criteria'] = 'date_time_sales_acceptance.py including independent post-run diagnostics'
    if goal_id=='missing-values-complete':info['series']['pass_criteria']='missing_values_acceptance.py full goal plus independent reopen/full rows'
    if goal_id in rc_combined_goal.GOALS:
        info['series']['pass_criteria']='rc_combined_acceptance.py: declared graph, independent expected values, public results, save and independent reopen'
        info['result_profile']='user-v1'
    if goal_id==collapse_acceptance.GOAL_ID:
        info['collapse_admission']=admission
        info['series']['pass_criteria']='collapse_node_acceptance.py FULL goal + independent new session; CASE_PASS is insufficient'
    if profile == 'chatgpt-sol':
        info['auth_policy'] = AUTH_POLICY
        info['effective_model_policy'] = MODEL_POLICY
        with tempfile.TemporaryDirectory(prefix='dock-auth-guard-') as guard_temp:
            guarded_version = subprocess.run([str(args.hermes_python), str(WORK / 'hermes_auth_guard.py'),
                str(args.hermes_source), str(Path(guard_temp) / 'receipt.json'),
                '--version'], capture_output=True, text=True, timeout=30,
                env=environment({}, Path(guard_temp), Path(guard_temp)))
        if guarded_version.returncode or not re.search(r'(?<![0-9.])v?0\.21\.0(?![0-9.])', guarded_version.stdout):
            raise ValueError('Guarded Hermes version check failed')
    if not args.run:
        write(args.output, info)
        print(json.dumps({"preflight": "passed", "model_started": False, "hermes_version": "0.21.0",
                          "provider": provider, "model": model, "reasoning_effort": reasoning, "client_revision": frozen["client_revision"]}))
        return 0
    run_id = date_admission["run_id"] if date_admission is not None else time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:8]
    run = args.runs_root.resolve() / run_id
    run.mkdir(parents=True, exist_ok=False, mode=0o700)
    hermes_home = run / "private/hermes-home"
    dock_home = run / "private/dock-state"
    for path in (hermes_home, dock_home / "runtime"):
        path.mkdir(parents=True, mode=0o700)
    (dock_home / "runtime/browsers").symlink_to(args.browsers.resolve(), target_is_directory=True)
    native_skill_copy = hermes_home / "skills/loginom/SKILL.md"
    native_skill_copy.parent.mkdir(parents=True, mode=0o700)
    write(native_skill_copy, NATIVE_SKILL.read_text())
    package = args.storage_directory + "/packages/Dock-acceptance-" + run_id + ".lgp"
    if date_admission is not None:
        package = '/test-3/packages/Dock-date-time-'+run_id+'.lgp'
    if goal_id==collapse_acceptance.GOAL_ID:package=args.storage_directory+'/Dock-acceptance-'+run_id+'.lgp'
    info.update(run_id=run_id, package_path=package)
    prompt = render_goal(goal.read_text(),package,args.storage_directory)
    if goal_id in ('file-upload-probe','file-upload-verify','data-pipeline','import-roundtrip','calculator-roundtrip','node-import-roundtrip','node-apply-complete','calculator-node-complete','grouping-node-complete','sales-sorting-complete','reform-node-complete','filter-node-complete'):
        info['input_artifact']=probe.descriptor(run_id,args.storage_directory)
        prompt=probe.prompt(goal.read_text(),package,args.storage_directory,run_id)
    if goal_id in ('text-export-node-complete','duplicates-node-complete','replacement-node-complete','join-node-complete','join-review-complete','union-node-complete','union-review-complete'):
        info['input_artifacts']=join_probe.descriptors(run_id,args.storage_directory)
        prompt=join_probe.prompt(goal.read_text(),package,args.storage_directory,run_id)
    if goal_id == 'data-pipeline':
        prompt=data_pipeline.prompt(goal.read_text(),package,args.storage_directory,run_id)
    if date_admission is not None:
        from date_time_goal_oracle import artifact, render
        info['input_artifact'] = artifact(run_id)
        prompt = render(run_id)
    if goal_id=='missing-values-complete':
        info['input_artifacts']=missing_values_goal.descriptors(run_id,args.storage_directory)
        prompt=missing_values_goal.prompt(goal.read_text(),package,args.storage_directory,run_id)
    if goal_id==collapse_acceptance.GOAL_ID:
        info['input_artifacts']=collapse_acceptance.fixtures(run_id,args.storage_directory)
        prompt=collapse_acceptance.prompt(package,args.storage_directory,run_id)
    if goal_id in rc_combined_goal.GOALS:
        info['input_artifacts']=rc_combined_goal.descriptors(goal_id,run_id,args.storage_directory)
        prompt=rc_combined_goal.prompt(goal_id,goal.read_text(),package,args.storage_directory,run_id)
    write(run / "scenario.txt", prompt)
    write(run / "request.json", info)
    # No key is persisted in the child config. Dock reads its own explicit config.
    entry = REPO / "client/bin/loginom-dock.mjs" if fault == "none" else WORK / {"lost_receipt": "lost-receipt-client.mjs", "rename": "rename-client.mjs", "partial_link": "partial-link-client.mjs", "position": "position-client.mjs", "save_reopen": "save-reopen-client.mjs"}[fault]
    if goal_id=='missing-values-complete':entry=WORK/'missing-values-client.mjs'
    if goal_id=='text-export-node-complete':entry=WORK/'text-export-observer-client.mjs'
    launch_config=isolated_user_config(args.dock_config.resolve(),run/'private/user-v1-config.json') if goal_id=='text-export-node-complete' else args.dock_config.resolve()
    command = [str(entry), "--config", str(launch_config),
               "--state-dir", str(dock_home), "--agent", "hermes", "--adapter-revision", "0.1.0-rc.4-acceptance",
               "--mode", "executor-replay", "--action-manifest-uri", args.manifest_uri,
               "--action-manifest-sha256", args.manifest_sha256, "--replay-bootstrap", "--replay-login-user", args.loginom_user]
    if getattr(args, 'loginom_url', None):
        command.extend(['--replay-loginom-url', args.loginom_url])
    if goal_id in ('file-upload-probe','file-upload-verify','data-pipeline','import-roundtrip','calculator-roundtrip','node-import-roundtrip','node-apply-complete','calculator-node-complete','grouping-node-complete','sales-sorting-complete','reform-node-complete','filter-node-complete'):
        command.extend(['--input-artifact',json.dumps({**info['input_artifact'],'sourcePath':str(WORK / probe.FIXTURE)},ensure_ascii=False)])
    if goal_id in ('text-export-node-complete','duplicates-node-complete','replacement-node-complete','join-node-complete','join-review-complete','union-node-complete','union-review-complete'):
        for file,artifact in zip(join_probe.FIXTURES,info['input_artifacts']):
            command.extend(['--input-artifact',json.dumps({**artifact,'sourcePath':str(WORK / join_fixture_dir / file)},ensure_ascii=False)])
    if date_admission is not None:
        command.extend(['--input-artifact', json.dumps({**info['input_artifact'],
            'sourcePath': str(FIXTURES/'sales.csv')}, ensure_ascii=False)])
    if goal_id=='missing-values-complete':
        for name,artifact in zip(missing_values_goal.FILES,info['input_artifacts']):
            command.extend(['--input-artifact',json.dumps({**artifact,'sourcePath':str(WORK/'fixtures/missing-values'/name)},ensure_ascii=False)])
    if goal_id==collapse_acceptance.GOAL_ID:
        for path,artifact in zip(collapse_acceptance.fixture_paths(),info['input_artifacts']):
            command.extend(['--input-artifact',json.dumps({**artifact,'sourcePath':str(path)},ensure_ascii=False)])
    if goal_id in rc_combined_goal.GOALS:
        command.extend(['--acceptance-cleanup-package', package])
        for name,artifact in zip(rc_combined_goal.GOALS[goal_id],info['input_artifacts']):
            command.extend(['--input-artifact',json.dumps({**artifact,'sourcePath':str(rc_combined_goal.FIXTURES/name)},ensure_ascii=False)])
    # Hermes oneshot otherwise snapshots tools after 15s, even while this
    # server is still connecting. A measured cold start took 16.5s; use the
    # same bounded wait as the declared MCP connection budget.
    config = {"fallback_providers": [], "mcp_single_query_discovery_timeout": 180,
              "mcp_servers": {"loginom-dock": {"command": str(args.node), "args": command,
              "connect_timeout": 180, "timeout": 360, "enabled": True,
              "env": {"DOCK_ACCEPTANCE_RUN_DIR": str(run),
                      "DOCK_ACCEPTANCE_DEADLINE_EPOCH_MS": str(int(time.time()*1000)+args.timeout*1000),
                      "DOCK_ACCEPTANCE_EXECUTOR_SHA256": frozen["inputs"]["client/lib/executor.mjs"]}}},
              "agent": {"max_turns": args.max_turns, "reasoning_effort": reasoning},
              # Keep the small Dock-only surface as direct typed tools. The
              # generic discovery router otherwise discards the target schema
              # and permits malformed calls without an instrument name.
              "tools": {"tool_search": {"enabled": "off"}},
              "memory": {"provider": "none"}, "plugins": {"enabled": []},
              "display": {"compact": True}, "checkpoints": {"enabled": False}}
    write(hermes_home / "config.yaml", config)
    status = "FAILED_BEFORE_MODEL"; started = False
    print(json.dumps({"run_id": run_id, "stage": "tool_precheck", "evidence_directory": str(run)}), flush=True)
    try:
        if runtime_pin(REPO) != frozen or not harness_unchanged(harness_inputs):
            raise ValueError("Source changed before tool precheck")
        precheck = subprocess.run([str(args.node), str(WORK / "check-tools.mjs"), str(hermes_home / "config.yaml")],
                                 capture_output=True, text=True, timeout=210)
        tool_check = json.loads(precheck.stdout)
        write(run / "tool-precheck.json", clean(tool_check, secrets))
        if precheck.returncode or tool_check.get("available") is not True:
            raise ValueError("MCP tool precheck failed")
        if runtime_pin(REPO) != frozen or not harness_unchanged(harness_inputs):
            raise ValueError("Source changed before model launch")
        if date_admission is not None:
            guard(args)
        if goal_id==collapse_acceptance.GOAL_ID:collapse_acceptance.require_admission(args)
        write(hermes_home / "auth.json", connection_values)
        env = environment(model_env, hermes_home, run)
        argv = [str(args.hermes), "--provider", provider, "--model", model, "--reasoning", reasoning,
                "--toolsets", "loginom-dock", "--skills", "loginom", "--usage-file", str(run / "private/usage.json"), "-z", prompt]
        if profile == 'chatgpt-sol':
            argv = [str(args.hermes_python), str(WORK / 'hermes_runtime_guard.py'), str(args.hermes_source),
                    str(run / 'private/auth-guard.json'), str(run / 'private/model-policy.json'),
                    str(run / 'private/usage.json'), 'chat', '--provider', provider, '--model', model,
                    '--reasoning', reasoning, '--max-turns', str(args.max_turns),
                    '--toolsets', 'loginom-dock', '--skills', 'loginom', '-q', prompt]
        child = subprocess.Popen(argv, cwd=run, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        started = True
        status = "FAILED_MODEL_OR_EXPORT"
        print(json.dumps({"run_id": run_id, "stage": "model_started", "pid": child.pid, "provider": provider, "model": model, "reasoning_effort": reasoning}), flush=True)
        timed_out = False
        try:
            child.wait(timeout=args.timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=15)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL); child.wait(timeout=15)
        usage_path = run / "private/usage.json"
        usage = json.loads(usage_path.read_text()) if usage_path.exists() else {}
        calls, tool_results = export_history(hermes_home, secrets, retain_raw_tools=goal_id==collapse_acceptance.GOAL_ID)
        evidence = {"schema_version": 1, "run_id": run_id, "export_complete": True,
                    "runtime_source_unchanged": runtime_pin(REPO) == frozen,
                    "harness_unchanged": harness_unchanged(harness_inputs),
                    "reasoning_effort": reasoning,
                    "native_skill_unchanged": sha(native_skill_copy) == info["native_skill"]["sha256"],
                    "process": {"returncode": child.returncode, "timed_out": timed_out,
                                "usage": {key: usage.get(key) for key in USAGE_KEYS}},
                    "tools": tool_results, "calls": calls,
                    "events": exported_events(dock_home, secrets)}
        if profile == 'chatgpt-sol':
            policy_path = run / 'private/model-policy.json'
            policy = json.loads(policy_path.read_text()) if policy_path.exists() else {}
            evidence['effective_model_policy'] = policy
            write(run / 'model-policy.json', policy)
            if (policy.get('constructor_verified') is not True or policy.get('blocked') is not False
                    or not policy.get('wire_requests_verified', 0)):
                raise ValueError('Effective Hermes model policy was not verified')
        receipt = dock_home / "fault-receipt.json"
        if goal_id in rc_combined_goal.GOALS:
            evidence['package_cleanup'] = []
            for metadata_path in sorted((dock_home/'sessions').glob('*/session.json')):
                metadata = json.loads(metadata_path.read_text())
                if not metadata.get('workspacePreparation',{}).get('attempted'):
                    continue  # listTools precheck never opens Loginom or a package
                cleanup_path = metadata_path.parent/'package-cleanup.json'
                cleanup = json.loads(cleanup_path.read_text()) if cleanup_path.is_file() else {'status':'MISSING'}
                evidence['package_cleanup'].append({'session_id':metadata.get('sessionId'),
                    'profile_owned':metadata.get('sessionId')==metadata_path.parent.name and metadata.get('profile')==str(metadata_path.parent/'browser-profile'),
                    'receipt':cleanup})
        if profile == 'chatgpt-sol':
            guard = run / 'private/auth-guard.json'
            evidence['auth_guard'] = json.loads(guard.read_text()) if guard.is_file() else {}
            evidence['auth_connection_unchanged'] = json.loads((hermes_home / 'auth.json').read_text()).get(
                'providers', {}).get('openai-codex', {}).get('tokens') == connection_values['providers']['openai-codex']['tokens']
        if receipt.is_file():
            evidence["operator_fault_receipt"] = clean(json.loads(receipt.read_text()), secrets)
        if args.goal in ('text-export-node-complete','missing-values-complete','duplicates-node-complete','replacement-node-complete','union-review-complete','union-node-complete','join-review-complete','join-node-complete','node-apply-complete','calculator-node-complete','grouping-node-complete','sales-sorting-complete','reform-node-complete','filter-node-complete'):
            evidence['efficiency'] = node_efficiency(evidence)
            write(run / 'efficiency.json', evidence['efficiency'])
        write(run / "evidence.json", clean(evidence, secrets))
        if goal_id==collapse_acceptance.GOAL_ID:
            import collapse_node_acceptance
            write(run/'collapse-audit.json',collapse_node_acceptance.audit(info,evidence,prompt,None))
        status = "EXPORTED_PENDING_AUDIT"
        return 0
    finally:
        write(run / "attempt.json", {"run_id": run_id, "status": status, "model_started": started})
        print(json.dumps({"run_id": run_id, "status": status, "model_started": started}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--preflight", action="store_true")
    mode.add_argument("--run", action="store_true")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--runs-root", type=Path, default=REPO / ".dock/post-mvp-p0/runs")
    parser.add_argument("--hermes-home", type=Path, default=Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes"))))
    parser.add_argument("--hermes", type=Path, default=Path.home() / ".local/bin/hermes")
    parser.add_argument('--hermes-python', type=Path, default=Path.home() / '.hermes/hermes-agent/venv/bin/python')
    parser.add_argument('--hermes-source', type=Path, default=Path.home() / '.hermes/hermes-agent')
    parser.add_argument("--node", type=Path, default=Path.home() / ".loginom-dock/current/runtime/node")
    parser.add_argument("--browsers", type=Path, default=Path.home() / ".loginom-dock/runtime/browsers")
    parser.add_argument("--dock-config", type=Path, default=Path.home() / ".loginom-dock/config.json")
    parser.add_argument("--loginom-user", help="Explicit operator-approved passwordless Loginom account for replay")
    parser.add_argument("--loginom-url", help="Explicit replay target; keeps the original Dock credential file unchanged")
    parser.add_argument("--storage-directory", help="Explicit Loginom storage directory observed or selected for this run")
    parser.add_argument("--manifest-uri")
    parser.add_argument("--manifest-sha256")
    parser.add_argument("--timeout", type=int, default=1200)
    parser.add_argument("--max-turns", type=int, default=60)
    parser.add_argument("--fault", choices=["none", "lost_receipt", "rename", "partial_link", "position", "save_reopen"], default="none",
                        help="Only variants with a supported independent auditor may run")
    parser.add_argument("--require-knowledge-recovery", action="store_true",
                        help="Require observed failure, scoped retrieval and reads of E2E and Help before continuation")
    parser.add_argument("--require-verification", action="store_true")
    parser.add_argument("--require-delivered-context", action="store_true",
                        help="Require automatic E2E/Help delivery bound to a failure and journal before successful continuation")
    parser.add_argument("--model-profile",choices=["chatgpt-sol","xiaomi-mimo"],default="chatgpt-sol")
    parser.add_argument("--goal", choices=[*rc_combined_goal.GOALS, "text-export-node-complete", "collapse-node-complete", "missing-values-complete", "duplicates-node-complete", "replacement-node-complete", "union-review-complete", "union-node-complete", "join-review-complete", "join-node-complete", "prepare-workspace", "basic-graph", "auto-link-retain", "auto-link-remove", "palette-inventory", "checkbox-roundtrip", "context-menu-checkbox", "root-checkbox", "file-storage-inspect", "file-upload-probe", "file-upload-verify", "data-pipeline", "import-roundtrip", "calculator-roundtrip", "node-import-roundtrip", "node-apply-complete", "calculator-node-complete", "grouping-node-complete", "sales-sorting-complete", "reform-node-complete", "filter-node-complete"], default="basic-graph")
    parser.add_argument("--allow-manual-reopen", action="store_true")
    args = parser.parse_args()
    if args.fault=="save_reopen" and not args.allow_manual_reopen:
        parser.error("save_reopen requires --allow-manual-reopen")
    if args.preflight and args.output is None:
        parser.error("--preflight requires --output")
    return execute(args)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        # Provider/config exception bodies can contain credentials.
        print(json.dumps({"error": type(exc).__name__, "message": "Acceptance preflight/run failed; no provider fallback."}), file=sys.stderr)
        raise SystemExit(2)
