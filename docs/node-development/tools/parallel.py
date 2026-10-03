"""Validate and render a static execution proposal; never contact a scheduler."""
import re
from collections import Counter
from html import escape

PHASES = ['development', 'integration', 'model', 'oracle']
CROSSTABLE_STAGES = {
    'foundation:oracle-crosstable', 'foundation:file-artifacts',
    'foundation:dynamic-schema', 'transform-crosstable:s1',
}


def validate_parallel(data, coverage, root):
    """Return proposal errors; coverage must already pass its own validation."""
    errors = _shape(data)
    if errors:
        return errors
    if data['source_commit'] != coverage['source_commit']:
        errors.append('parallel source_commit differs from coverage source_commit')
    owners = coverage['nodes'] + coverage['foundations']
    stages = {stage['id']: (stage, owner) for owner in owners for stage in owner['stages']}
    proposal = {stage['stage_id']: stage for stage in data['stages']}
    if set(proposal) != set(stages):
        errors.append('parallel stage coverage differs: ' + str(sorted(set(proposal) ^ set(stages))))
    for collection, key in [('profiles', 'id'), ('lanes', 'id'), ('resources', 'id'), ('stages', 'stage_id'), ('bundles', 'id')]:
        for value, count in Counter(item[key] for item in data[collection]).items():
            if count > 1:
                errors.append(f'parallel duplicate {collection} {value}')
    lanes = {lane['id'] for lane in data['lanes']}
    resources = {resource['id']: resource for resource in data['resources']}
    for resource in data['resources']:
        if resource['id'] == 'legacy-oauth':
            if resource['phase'] != 'model' or resource['capacity'] != 1 or resource['applies_when'] != 'legacy_oauth':
                errors.append('parallel legacy-oauth must be conditional model capacity 1')
        elif resource['applies_when'] != 'always':
            errors.append('parallel conditional resource must be legacy-oauth ' + resource['id'])
    for profile in data['profiles']:
        if profile['daemon_capacity'] < profile['generator'] + profile['worker'] + profile['reviewer']:
            errors.append('parallel insufficient daemon_capacity ' + profile['id'])
        if not profile['requires_shared_oauth'] and profile['model_slots'] != 1:
            errors.append('parallel model_slots requires shared OAuth ' + profile['id'])
    bundle_owners = {}
    crosstable = []
    for bundle in data['bundles']:
        if bundle['id'] in {owner['slug'] for owner in owners}:
            errors.append('parallel bundle ID collides with owner slug ' + bundle['id'])
        if CROSSTABLE_STAGES & set(bundle['stages']):
            crosstable.append(bundle)
            if set(bundle['stages']) != CROSSTABLE_STAGES:
                errors.append('parallel CrossTable bundle must contain exactly its four stages')
        positions = {stage_id: index for index, stage_id in enumerate(bundle['stages'])}
        for stage_id in bundle['stages']:
            if stage_id in bundle_owners:
                errors.append('parallel stage belongs to multiple bundles ' + stage_id)
            bundle_owners[stage_id] = bundle['id']
            if stage_id not in stages:
                errors.append('parallel unknown bundle stage ' + stage_id)
                continue
            for dependency in stages[stage_id][0]['hard_requires']:
                if dependency in positions and positions[dependency] >= positions[stage_id]:
                    errors.append('parallel bundle prerequisite follows consumer ' + dependency + ' -> ' + stage_id)
    if len(crosstable) != 1:
        errors.append('parallel requires exactly one CrossTable bundle')
    for stage in data['stages']:
        stage_id = stage['stage_id']
        if stage['lane'] not in lanes:
            errors.append('parallel unknown lane ' + stage_id + ': ' + stage['lane'])
        if stage_id in stages:
            group = bundle_owners.get(stage_id, stages[stage_id][1]['slug'])
            if stage['card_group'] != group:
                errors.append('parallel invalid card_group ' + stage_id + ': expected ' + group)
        for phase in PHASES:
            for resource_id in stage[phase + '_locks']:
                resource = resources.get(resource_id)
                if not resource:
                    errors.append('parallel unknown resource ' + stage_id + ': ' + resource_id)
                elif resource['phase'] != phase:
                    errors.append('parallel resource phase mismatch ' + stage_id + ': ' + resource_id)
    for owner in owners:
        if not (root / owner['plan']).is_file():
            errors.append('parallel missing owner plan ' + owner['plan'])
    return errors


def render_plan_section(data, owner):
    """Describe planned ownership and resources without implying running work."""
    stages = {stage['stage_id']: stage for stage in data['stages']}
    lanes = {lane['id']: lane['title'] for lane in data['lanes']}
    resources = {resource['id']: resource for resource in data['resources']}
    lines = [
        '## Параллельная работа', '',
        'При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. '
        'При назначении используются [правила Multica](../../workflow/multica-parallel.md); '
        'наличие строки не подтверждает доступность ресурса или готовность этапа.', '',
        '| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ]
    for entry in owner['stages']:
        stage = stages[entry['id']]
        locks = [
            '<br>'.join(_text(value) + (' (legacy OAuth)' if resources[value]['applies_when'] == 'legacy_oauth' else '') for value in stage[phase + '_locks']) or '—'
            for phase in PHASES
        ]
        lines.append(
            f"| `{entry['id']}` | {_text(lanes[stage['lane']])} | {_text(stage['card_group'])} | "
            + ' | '.join(locks) + ' | ' + _text(stage['note']) + ' |'
        )
    return '\n'.join(lines)


def render_lanes(data, coverage):
    stages = {stage['stage_id']: stage for stage in data['stages']}
    lines = [
        '| Направление | Назначение | Подпланы узлов | Общие подпланы |',
        '| --- | --- | --- | --- |',
    ]
    for lane in data['lanes']:
        plans = [
            '<br>'.join(
                f"[{_text(owner['slug'])}](../{owner['plan']})"
                for owner in coverage[collection]
                if any(stages[stage['id']]['lane'] == lane['id'] for stage in owner['stages'])
            ) or '—'
            for collection in ['nodes', 'foundations']
        ]
        lines.append(f"| {_text(lane['title'])}<br>`{_text(lane['id'])}` | {_text(lane['description'])} | {plans[0]} | {plans[1]} |")
    return '\n'.join(lines)


def check_parallel_views(data, coverage, root, render_view=False):
    """Only render validated maps, preserving all authored text outside markers."""
    errors = []
    for owner in coverage['nodes'] + coverage['foundations']:
        errors.extend(_check_region(
            root / owner['plan'], 'parallel-execution', render_plan_section(data, owner), render_view, allow_append=True,
        ))
    errors.extend(_check_region(
        root / 'workflow/multica-parallel.md', 'parallel-lanes', render_lanes(data, coverage), render_view,
    ))
    return errors


def _check_region(path, marker, content, render_view, allow_append=False):
    if not path.is_file():
        return ['parallel missing document ' + str(path)]
    text = path.read_text()
    start = '<!-- ' + marker + ':start -->'
    end = '<!-- ' + marker + ':end -->'
    if not re.search(r'<!--\s*' + re.escape(marker) + ':', text) and allow_append:
        if not render_view:
            return ['parallel missing generated section ' + str(path)]
        path.write_text(text + ('\n' if text.endswith('\n') else '\n\n') + start + '\n\n' + content + '\n\n' + end + '\n')
        return []
    if any(text.count(value) != 1 or not re.search(r'^' + re.escape(value) + r'$', text, re.M) for value in [start, end]):
        return ['parallel invalid markers ' + str(path)]
    if text.index(start) >= text.index(end):
        return ['parallel reversed markers ' + str(path)]
    expected = text[:text.index(start) + len(start)] + '\n\n' + content + '\n\n' + text[text.index(end):]
    if render_view:
        if text != expected:
            path.write_text(expected)
        return []
    if text != expected:
        return ['parallel stale generated section ' + str(path) + '; run --render']
    return []


def _shape(data):
    errors = []
    if not isinstance(data, dict):
        return ['parallel root must be an object']
    if type(data.get('schema_version')) is not int or data['schema_version'] != 1:
        errors.append('parallel schema_version must be 1')
    if data.get('status') != 'proposal_not_deployed':
        errors.append('parallel status must be proposal_not_deployed')
    for field in ['source_commit', 'multica_source_commit', 'operations_source_commit']:
        if not isinstance(data.get(field), str) or not re.fullmatch(r'[0-9a-f]{40}', data[field]):
            errors.append('parallel ' + field + ' must be a full SHA')
    for collection in ['profiles', 'lanes', 'resources', 'stages', 'bundles']:
        if not isinstance(data.get(collection), list) or not data[collection]:
            errors.append('parallel ' + collection + ' must be a nonempty array')
            continue
        for index, item in enumerate(data[collection]):
            location = f'{collection}[{index}]'
            if not isinstance(item, dict):
                errors.append('parallel ' + location + ' must be an object')
                continue
            if collection == 'profiles':
                _strings(item, ['id'], location, errors)
                for field in ['generator', 'worker', 'reviewer', 'daemon_capacity', 'card_wip', 'model_slots']:
                    value = item.get(field)
                    if type(value) is not int or value < 1 or (field in ['worker', 'reviewer', 'model_slots'] and value > 50) or (field == 'generator' and value != 1):
                        errors.append('parallel invalid profile capacity ' + location + '.' + field)
                if type(item.get('requires_shared_oauth')) is not bool:
                    errors.append('parallel requires_shared_oauth must be Boolean ' + location)
            if collection == 'lanes':
                _strings(item, ['id', 'title', 'description'], location, errors)
            if collection == 'resources':
                _strings(item, ['id', 'title', 'scope'], location, errors)
                if item.get('phase') not in PHASES:
                    errors.append('parallel unknown resource phase ' + location)
                if item.get('applies_when') not in ['always', 'legacy_oauth']:
                    errors.append('parallel invalid applies_when ' + location)
                if type(item.get('capacity')) is not int or item['capacity'] < 1:
                    errors.append('parallel resource capacity must be positive ' + location)
            if collection == 'stages':
                _strings(item, ['stage_id', 'lane', 'card_group', 'note'], location, errors)
                for phase in PHASES:
                    _string_list(item.get(phase + '_locks'), location + '.' + phase + '_locks', errors)
            if collection == 'bundles':
                _strings(item, ['id', 'title', 'reason'], location, errors)
                _string_list(item.get('stages'), location + '.stages', errors, nonempty=True)
    return errors


def _strings(item, fields, location, errors):
    for field in fields:
        if not isinstance(item.get(field), str) or not item[field].strip():
            errors.append('parallel ' + location + '.' + field + ' must be a nonempty string')


def _string_list(value, location, errors, nonempty=False):
    if not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value) or (nonempty and not value):
        errors.append('parallel ' + location + ' must be an array of nonempty strings')
        return
    if len(value) != len(set(value)):
        errors.append('parallel duplicate values ' + location)


def _text(value):
    return escape(value, quote=False).replace('|', r'\|').replace('[', r'\[').replace(']', r'\]').replace('\r\n', '\n').replace('\n', '<br>')
