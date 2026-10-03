"""Check the documentation coverage graph without executing product code."""
import re
from collections import Counter
from datetime import date
from html import escape


def validate_coverage(data, registry_nodes, root):
    """Return errors; documentation coverage never changes runtime readiness."""
    errors = _validate_shape(data)
    if errors:
        return errors

    registry = {node['component_id']: node for node in registry_nodes}
    components = [node['component_id'] for node in data['nodes']]
    for component in _duplicates(components):
        errors.append('coverage duplicate component ID ' + component)
    if set(components) != set(registry):
        errors.append('coverage registry IDs differ: ' + str(sorted(set(components) ^ set(registry))))

    owners = data['nodes'] + data['foundations']
    for slug in _duplicates([owner['slug'] for owner in owners]):
        errors.append('coverage duplicate slug ' + slug)
    stages = [stage for owner in owners for stage in owner['stages']]
    stage_ids = [stage['id'] for stage in stages]
    for stage_id in _duplicates(stage_ids):
        errors.append('coverage duplicate stage ID ' + stage_id)
    requirements = [requirement for node in data['nodes'] for requirement in node['requirements']]
    for requirement_id in _duplicates([requirement['id'] for requirement in requirements]):
        errors.append('coverage duplicate requirement ID ' + requirement_id)

    for node in data['nodes']:
        entry = registry.get(node['component_id'])
        if entry and entry['slug'] != node['slug']:
            errors.append('coverage registry slug differs: ' + node['component_id'])
        if entry and entry.get('plan') != node['plan']:
            errors.append('coverage registry plan differs: ' + node['component_id'])
        if entry and entry.get('card') != f"nodes/{node['slug']}/README.md":
            errors.append('coverage registry card differs: ' + node['component_id'])
        if not (root / f"nodes/{node['slug']}/README.md").is_file():
            errors.append('coverage missing card ' + node['slug'])
        source_ids = [source['id'] for source in node['sources']]
        for source_id in _duplicates(source_ids):
            errors.append('coverage duplicate source ID ' + node['slug'] + ': ' + source_id)
        own_stages = {stage['id']: stage for stage in node['stages']}
        own_requirements = {requirement['id']: requirement for requirement in node['requirements']}
        for requirement in node['requirements']:
            for source_id in requirement['source_refs']:
                if source_id not in source_ids:
                    errors.append('coverage unknown source ' + requirement['id'] + ': ' + source_id)
            stage = own_stages.get(requirement['stage'])
            if not stage:
                errors.append('coverage unknown requirement stage ' + requirement['id'] + ': ' + requirement['stage'])
            elif requirement['id'] not in stage['covers']:
                errors.append('coverage uncovered requirement ' + requirement['id'])
        for stage in node['stages']:
            for requirement_id in stage['covers']:
                requirement = own_requirements.get(requirement_id)
                if not requirement:
                    errors.append('coverage unknown requirement ' + stage['id'] + ': ' + requirement_id)
                elif requirement['stage'] != stage['id']:
                    errors.append('coverage requirement stage mismatch ' + stage['id'] + ': ' + requirement_id)

    for owner in owners:
        plan = root / owner['plan']
        if not plan.is_file():
            errors.append('coverage missing plan ' + owner['plan'])
            continue
        text = plan.read_text()
        for item in owner['stages'] + owner.get('requirements', []):
            if not re.search(r'(?<![\w:-])' + re.escape(item['id']) + r'(?![\w:-])', text):
                errors.append('coverage plan missing ID ' + owner['plan'] + ': ' + item['id'])
        if owner in data['foundations']:
            for stage in owner['stages']:
                if stage['covers']:
                    errors.append('coverage foundation cannot claim node requirements ' + stage['id'])

    known_stages = set(stage_ids)
    for stage in stages:
        for field in ['hard_requires', 'recommended_after']:
            for dependency in stage[field]:
                if dependency == stage['id']:
                    errors.append('coverage self dependency ' + stage['id'] + ': ' + field)
                if dependency not in known_stages:
                    errors.append('coverage unknown stage ' + stage['id'] + ': ' + dependency)
    graph = {stage['id']: set(stage['hard_requires']) & known_stages for stage in stages}
    # Remove ready stages iteratively: handles large catalogs without recursion limits.
    remaining = set(graph)
    while remaining:
        ready = {stage_id for stage_id in remaining if not graph[stage_id] & remaining}
        if not ready:
            errors.append('coverage dependency cycle: ' + ', '.join(sorted(remaining)))
            break
        remaining -= ready

    order = data['roadmap_order']
    if len(order) != len(stage_ids) or set(order) != known_stages or len(order) != len(set(order)):
        errors.append('coverage roadmap must contain every stage exactly once')
    positions = {stage_id: position for position, stage_id in enumerate(order)}
    for stage in stages:
        for dependency in stage['hard_requires']:
            if dependency in positions and stage['id'] in positions and positions[dependency] >= positions[stage['id']]:
                errors.append('coverage roadmap prerequisite follows consumer ' + dependency + ' -> ' + stage['id'])
    return errors


def render_stages(data):
    """Render validated stages in the authored roadmap_order, without reordering."""
    stages = {
        stage['id']: (stage, owner['plan'])
        for owner in data['nodes'] + data['foundations']
        for stage in owner['stages']
    }
    lines = [
        '| № | Этап | Приоритет | Обязательные зависимости | Рекомендуется после | Условия среды |',
        '| --- | --- | --- | --- | --- | --- |',
    ]
    for number, stage_id in enumerate(data['roadmap_order'], 1):
        stage, plan = stages[stage_id]
        dependencies = [
            '<br>'.join(f'[{dependency}]({stages[dependency][1]})' for dependency in stage[field]) or '—'
            for field in ['hard_requires', 'recommended_after']
        ]
        conditions = '<br>'.join(_table_text(value) for value in stage['environment_gates']) or '—'
        lines.append(
            f"| {number} | [{_table_text(stage['title'])}]({plan})<br>`{stage_id}` | {stage['priority']} | "
            f'{dependencies[0]} | {dependencies[1]} | {conditions} |'
        )
    return '\n'.join(lines)


def check_roadmap(data, path, render_view=False):
    """Check or replace only the generated region; callers first validate coverage."""
    if not path.is_file():
        return ['coverage missing roadmap ' + path.name]
    text = path.read_text()
    start = '<!-- coverage-stages:start -->'
    end = '<!-- coverage-stages:end -->'
    if any(text.count(marker) != 1 or not re.search(r'^' + re.escape(marker) + r'$', text, re.M) for marker in [start, end]):
        return ['coverage roadmap markers must each appear once on separate lines']
    if text.index(start) >= text.index(end):
        return ['coverage roadmap markers are reversed']
    expected = (
        text[:text.index(start) + len(start)] + '\n\n' + render_stages(data)
        + '\n\n' + text[text.index(end):]
    )
    if render_view:
        if text != expected:
            path.write_text(expected)
        return []
    if text != expected:
        return ['coverage roadmap stages are stale; run --render']
    return []


def _table_text(value):
    return escape(value, quote=False).replace('|', r'\|').replace('[', r'\[').replace(']', r'\]').replace('\r\n', '\n').replace('\n', '<br>')


def _validate_shape(data):
    errors = []
    if not isinstance(data, dict):
        return ['coverage root must be an object']
    if type(data.get('schema_version')) is not int or data['schema_version'] != 1:
        errors.append('coverage schema_version must be 1')
    _date(data.get('snapshot_date'), 'snapshot_date', errors)
    if not isinstance(data.get('source_commit'), str) or not re.fullmatch(r'[0-9a-f]{40}', data['source_commit']):
        errors.append('coverage source_commit must be a full SHA')
    _strings(data, ['help_version'], 'root', errors)
    _string_list(data.get('roadmap_order'), 'roadmap_order', errors)
    for collection in ['nodes', 'foundations']:
        if not isinstance(data.get(collection), list) or (collection == 'nodes' and not data[collection]):
            errors.append('coverage ' + collection + ' must be an array' + (' with nodes' if collection == 'nodes' else ''))
            continue
        for index, owner in enumerate(data[collection]):
            location = f'{collection}[{index}]'
            if not isinstance(owner, dict):
                errors.append('coverage ' + location + ' must be an object')
                continue
            _strings(owner, ['slug', 'plan'], location, errors)
            slug = owner.get('slug', '')
            if not isinstance(slug, str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug):
                errors.append('coverage invalid slug ' + location)
                slug = ''
            if owner.get('plan') != f'{collection}/{slug}/plan.md':
                errors.append('coverage invalid plan path ' + location)
            if collection == 'nodes':
                _strings(owner, ['component_id'], location, errors)
                if owner.get('catalog_status') not in ['current_help', 'historical_only', 'source_discrepancy']:
                    errors.append('coverage invalid catalog_status ' + location)
                _validate_sources(owner.get('sources'), location, errors)
                _validate_requirements(owner.get('requirements'), slug, location, errors)
            if not isinstance(owner.get('stages'), list) or not owner['stages']:
                errors.append('coverage stages must be a nonempty array ' + location)
                continue
            for index, stage in enumerate(owner['stages']):
                location_stage = f'{location}.stages[{index}]'
                if not isinstance(stage, dict):
                    errors.append('coverage ' + location_stage + ' must be an object')
                    continue
                _strings(stage, ['id', 'title'], location_stage, errors)
                stage_pattern = r'foundation:[a-z0-9]+(?:-[a-z0-9]+)*' if collection == 'foundations' else re.escape(slug) + r':s[0-9]+'
                if not isinstance(stage.get('id'), str) or not re.fullmatch(stage_pattern, stage['id']):
                    errors.append('coverage invalid stage ID ' + location_stage)
                if stage.get('status') not in ['discovery_required', 'accepted_scope_maintenance']:
                    errors.append('coverage invalid stage status ' + location_stage)
                if type(stage.get('priority')) is not int or not 0 <= stage['priority'] <= 5:
                    errors.append('coverage stage priority must be an integer 0..5 ' + location_stage)
                for field in ['covers', 'hard_requires', 'recommended_after', 'environment_gates']:
                    _string_list(stage.get(field), location_stage + '.' + field, errors)
    return errors


def _validate_sources(sources, location, errors):
    if not isinstance(sources, list) or not sources:
        errors.append('coverage sources must be a nonempty array ' + location)
        return
    for index, source in enumerate(sources):
        location_source = f'{location}.sources[{index}]'
        if not isinstance(source, dict):
            errors.append('coverage ' + location_source + ' must be an object')
            continue
        _strings(source, ['id', 'url', 'title', 'version'], location_source, errors)
        url = source.get('url')
        if not isinstance(url, str) or not re.match(r'^https?://[^/\s]+(?:/[^\s]*)?$', url):
            errors.append('coverage source URL must be absolute HTTP(S) ' + location_source)
        _date(source.get('accessed_on'), location_source + '.accessed_on', errors)


def _validate_requirements(requirements, slug, location, errors):
    if not isinstance(requirements, list) or not requirements:
        errors.append('coverage requirements must be a nonempty array ' + location)
        return
    for index, requirement in enumerate(requirements):
        location_requirement = f'{location}.requirements[{index}]'
        if not isinstance(requirement, dict):
            errors.append('coverage ' + location_requirement + ' must be an object')
            continue
        _strings(requirement, ['id', 'title', 'stage', 'verification'], location_requirement, errors)
        if not isinstance(requirement.get('id'), str) or not re.fullmatch(re.escape(slug) + r':r[0-9]+', requirement['id']):
            errors.append('coverage invalid requirement ID ' + location_requirement)
        _string_list(requirement.get('source_refs'), location_requirement + '.source_refs', errors, nonempty=True)


def _strings(record, keys, location, errors):
    for key in keys:
        if not isinstance(record.get(key), str) or not record[key].strip():
            errors.append('coverage ' + location + '.' + key + ' must be a nonempty string')


def _string_list(value, location, errors, nonempty=False):
    if not isinstance(value, list) or any(not isinstance(item, str) or not item.strip() for item in value) or (nonempty and not value):
        errors.append('coverage ' + location + ' must be an array of nonempty strings')
        return
    if len(value) != len(set(value)):
        errors.append('coverage duplicate values in ' + location)


def _date(value, location, errors):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}', value):
        errors.append('coverage ' + location + ' must be an ISO date')
        return
    try:
        date.fromisoformat(value)
    except ValueError:
        errors.append('coverage invalid date ' + location)


def _duplicates(values):
    return [value for value, count in Counter(values).items() if count > 1]
