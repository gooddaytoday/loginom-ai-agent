#!/usr/bin/env python3
"""Validate node documentation and render the registry view; does not execute Loginom."""
import argparse
import hashlib
import json
import re
import zipfile
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
LAYERS = ['implementation','historical_acceptance','client_technical_validation','analytical_validation','integration','release']
REQUIRED = ['README.md','workflow/orchestrator.md','workflow/single-node.md','workflow/lifecycle.md','workflow/acceptance-cli.md','workflow/new-node-plan.md',
            'registry.json','inventory.md','validation.md','provenance.json','history/README.md',
            'templates/assignment.md','templates/checkpoint.md','templates/completion.md',
            'templates/node-plan.md','templates/cross-table-plan-example.md','templates/campaign.json','templates/event.json','templates/host-resources.json',
            'history/unavailable.md','history/unavailable.json','history/references.json']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def links(path):
    text = re.sub(r'```.*?```', '', path.read_text(), flags=re.S)
    for value in re.findall(r'\]\(([^\n)]+)\)', text):
        value=value.strip().strip('<>')
        if re.match(r'^[a-zA-Z][\w+.-]*:',value) or value.startswith('#'):
            continue
        value=unquote(value.split('#',1)[0])
        if value: yield value, (path.parent/value).resolve()


def render(data):
    counts=Counter(n['queue_class'] for n in data['nodes'])
    out=['# Реестр узлов — обзор','',
         'Сформирован из [registry.json](registry.json). Не редактировать сводные числа вручную.', '',
         f"Исторический каталог: **{len(data['nodes'])}** компонентов. Обработчики: **{counts['implemented']}**; обычный остаток: **{counts['backlog']}**; условный резерв: **{counts['conditional_reserve']}**.", '',
         'Реализация и историческая приёмка не равны повторной аналитической приёмке текущего CLI. Старые номера 01/02 — инфраструктура, а не дополнительные типы узлов.', '',
         '## Реализованные обработчики','',
         '| № | Узел | Runtime type / режимы | Историческая приёмка | Проверка нового клиента |',
         '| --- | --- | --- | --- | --- |']
    for n in data['nodes']:
        if n['queue_class']!='implemented':continue
        h=n['handler']; modes=', '.join(h['modes'])
        title=f"[{n['name']}]({n['card']})"
        out.append(f"| {n['legacy_subplan']} | {title} | `{h['type']}` / {modes} | {n['readiness']['historical_acceptance']['status']} | {n['readiness']['client_technical_validation']['status']}; аналитика: {n['readiness']['analytical_validation']['status']} |")
    out+=['','## Компоненты без полного обработчика','',
          'Список не является разрешённой очередью. При назначении применяется [создание подплана](workflow/new-node-plan.md). [Подплан Кросс-таблицы](nodes/transform-crosstable/plan.md) требует исследования; остальные карточки roadmap не заменяют самостоятельный подплан.', '',
          '| Component ID | Узел | Категория | Следующее действие |','| --- | --- | --- | --- |']
    for n in data['nodes']:
        if n['queue_class']=='implemented':continue
        out.append(f"| `{n['component_id']}` | {n['name']} | {n['queue_class']} | {str(n['next_action']).replace('|','/')} |")
    out+=['','Источники, ограничения, версии и SHA перечислены в реестре и [историческом manifest](provenance.json). Готовность не изменяется от назначения владельца или переключения параллельности.','']
    return '\n'.join(out)


def check(render_view=False, source_archive=None):
    errors=[]
    for name in REQUIRED:
        if not (ROOT/name).is_file() and not (render_view and name=='inventory.md'):
            errors.append('missing '+name)
    data=json.loads((ROOT/'registry.json').read_text())
    nodes=data['nodes'];ids=[n['component_id'] for n in nodes]
    if len(ids)!=len(set(ids)):errors.append('duplicate component IDs')
    counts=Counter(n['queue_class'] for n in nodes)
    if len(nodes)!=data['historical_catalog']['component_count']:
        errors.append('catalog size differs from its source declaration')
    if set(counts)-{'implemented','backlog','conditional_reserve'}:
        errors.append('unknown queue classification')
    runtime=(REPO/'packages/loginom-runtime/client/lib/node-support.mjs').read_text()
    # Read the explicit type dispatch without importing or running product code.
    registered=set(re.findall(r"if\(type===['\"]([^'\"]+)['\"]\)",runtime))
    declared={n['handler']['type'] for n in nodes if n.get('handler')}
    if registered!=declared:errors.append('runtime handlers differ: '+str(sorted(registered^declared)))
    if len(declared)!=sum(bool(n.get('handler')) for n in nodes):errors.append('duplicate runtime type')
    historical=json.loads((ROOT/data['evidence_catalog']['historical-catalog']['path']).read_text())
    historical_ids=set(re.findall(r'component\.[A-Za-z0-9_.]+',json.dumps(historical)))
    if historical_ids!=set(ids):errors.append('historical catalog IDs differ: '+str(sorted(historical_ids^set(ids))))
    evidence=data['evidence_catalog']
    for key,e in evidence.items():
        if not all(k in e for k in ['path','sha256','scope','platform','availability']):errors.append('evidence fields '+key)
        if e.get('path'):
            p=ROOT/e['path']
            if not p.is_file(): errors.append('evidence missing '+key+': '+e['path'])
            elif e.get('sha256') and sha(p.read_bytes())!=e['sha256']:errors.append('evidence hash '+key)
    for n in nodes:
        for key in ['component_id','name','legacy_subplan','handler','card','limitations','readiness','next_action','queue_class']:
            if key not in n:errors.append('node field '+n.get('component_id','?')+': '+key)
        for layer in LAYERS:
            v=n['readiness'].get(layer)
            if not isinstance(v,dict) or 'status' not in v or 'evidence' not in v:
                errors.append('layer '+n['component_id']+': '+layer);continue
            for ref in v['evidence']:
                if ref not in evidence:errors.append('unknown evidence '+ref)
        if n['queue_class']=='implemented':
            if not n['card'] or not (ROOT/n['card']).is_file():errors.append('missing card '+n['component_id'])
            if not n['handler']['modes']:errors.append('missing modes '+n['component_id'])
        if n['queue_class']=='implemented' or n['component_id']=='component.transform.CrossTable':
            if n.get('card')!=f"nodes/{n['slug']}/README.md":errors.append('card structure '+n['component_id'])
            if n.get('plan')!=f"nodes/{n['slug']}/plan.md" or not (ROOT/n.get('plan','missing')).is_file():
                errors.append('missing adapted plan '+n['component_id'])
        if bool(n.get('handler'))!=(n['queue_class']=='implemented'):
            errors.append('handler classification mismatch '+n['component_id'])
        h=n.get('handler')
        if h:
            paths=h['source'] if isinstance(h['source'],list) else [h['source']]
            for p in paths:
                if not (ROOT/p).is_file() and not (REPO/p).is_file():errors.append('missing handler source '+p)
    expected=render(data)
    if render_view:(ROOT/'inventory.md').write_text(expected)
    elif not (ROOT/'inventory.md').is_file() or (ROOT/'inventory.md').read_text()!=expected:
        errors.append('inventory is stale; run --render')
    prov=json.loads((ROOT/'provenance.json').read_text())
    if prov.get('schema_version')!=2:errors.append('provenance must distinguish original and adapted bytes')
    sources=[e['source_path'] for e in prov['files']]
    if len(sources)!=len(set(sources)):errors.append('duplicate historical source')
    for entry in prov['files']:
        p=ROOT/entry['path']
        if not p.is_file() or sha(p.read_bytes())!=entry['adapted_sha256']:errors.append('adapted historical hash '+entry['path'])
        if not re.fullmatch('[0-9a-f]{64}',entry.get('source_sha256','')):errors.append('missing original checksum '+entry['path'])
    for entry in prov.get('related_documents',[]):
        p=ROOT/entry['path']
        if not p.is_file() or sha(p.read_bytes())!=entry['adapted_sha256']:errors.append('related historical hash '+entry['path'])
    if source_archive:
        archive_path=Path(source_archive)
        if sha(archive_path.read_bytes())!=prov['source_archive']['sha256']:errors.append('original ZIP checksum changed')
        with zipfile.ZipFile(archive_path) as archive:
            for entry in prov['files']:
                if sha(archive.read(entry['original_archive_entry']))!=entry['source_sha256']:
                    errors.append('original historical source changed '+entry['source_path'])
            original_registry=json.loads(archive.read('loginom-ai-agent/docs/node-development/registry.json'))
            original_state={n['component_id']:n['readiness'] for n in original_registry['nodes']}
            if {n['component_id']:n['readiness'] for n in nodes}!=original_state:
                errors.append('readiness changed during documentation migration')
    active=[p for p in ROOT.rglob('*.md') if not p.is_relative_to(ROOT/'history/loginom-dock')]
    historical_paths=[(ROOT/e['path']).resolve() for e in prov['files']+prov.get('related_documents',[])]
    all_markdown=set(active)|{p for p in historical_paths if p.suffix=='.md'}
    artifacts=json.loads((ROOT/'history/unavailable.json').read_text())['artifacts']
    artifact_ids={e['id'] for e in artifacts}
    references=json.loads((ROOT/'history/references.json').read_text())['references']
    reference_ids={e['id'] for e in references}
    for e in references:
        if not (ROOT/e['resolved_path']).exists():errors.append('missing reference navigation '+e['id'])
    for p in all_markdown:
        for label,target in links(p):
            if not target.exists():errors.append(f'broken link {p.relative_to(REPO)} -> {label}')
        for ref in re.findall(r'unavailable:(artifact-[0-9a-f]{16})',p.read_text()):
            if ref not in artifact_ids:errors.append('unknown unavailable artifact '+ref)
    all_documents={p for p in ROOT.rglob('*') if p.suffix in ['.json','.md'] and not p.is_relative_to(ROOT/'history/loginom-dock')}|set(historical_paths)
    for p in all_documents:
        if p.suffix!='.json':continue
        try:json.loads(p.read_text())
        except ValueError:errors.append('invalid JSON '+str(p.relative_to(REPO)))
    for p in all_documents:
        t=p.read_text()
        for ref in re.findall(r'historical-ref:(ref-[0-9a-f]{16})',t):
            if ref not in reference_ids:errors.append('unknown historical reference '+ref)
        for ref in re.findall(r'unavailable:(artifact-[0-9a-f]{16})',t):
            if ref not in artifact_ids:errors.append('unknown unavailable artifact '+ref)
        if re.search(r'(?:/Users/[^/]+/Git/|~/Git/)loginom-dock',t):
            errors.append('old checkout path '+str(p.relative_to(REPO)))
        if re.search(r'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bsk-[A-Za-z0-9_-]{32,}|\bAKIA[A-Z0-9]{16}\b',t):
            errors.append('possible secret '+str(p.relative_to(REPO)))
    campaign=json.loads((ROOT/'templates/campaign.json').read_text())
    if campaign['authorized_nodes'] or campaign['acceptance_slots']!=1 or campaign['memory']['status']!='not_enrolled':
        errors.append('template inadvertently authorizes execution or memory')
    if not campaign['resources'].get('host_registry'):
        errors.append('missing shared host resource registry')
    return {'status':'FAIL' if errors else 'PASS','registry_components':len(nodes),'counts':dict(counts),'handler_types':len(registered),'historical_files_verified':len(prov['files']),'active_markdown_checked':len(active),'all_markdown_checked':len(all_markdown),'unavailable_artifacts_classified':len(artifact_ids),'original_archive_verified':bool(source_archive),'errors':errors}


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--render',action='store_true');parser.add_argument('--source-archive',type=Path);args=parser.parse_args()
    result=check(args.render,args.source_archive);print(json.dumps(result,ensure_ascii=False,indent=2));raise SystemExit(bool(result['errors']))
