#!/usr/bin/env python3
"""Audit run-check model journals, per-stage budgets and recurring patterns (Python 3.9+)."""

import argparse
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from functools import cached_property
import json
import math
from pathlib import Path
import re
import sys


FAILED = {'FAILED', 'NOT_APPLIED', 'AMBIGUOUS', 'REJECTED'}
RECOVERY = ('operation_recover', 'browser_recovery', 'operation_inspect')


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def object_value(value, location):
    if not isinstance(value, dict):
        raise ValueError(f'{location}: expected JSON object')
    return value


def invalid_number(value):
    raise ValueError(f'invalid JSON number: {value}')


DECODER = json.JSONDecoder(parse_constant=invalid_number)


def load_json(text):
    return DECODER.decode(text)


def as_dict(value):
    return value if isinstance(value, dict) else {}


def receipt_blocks(value):
    """The first block is the receipt. Later blocks may carry guidance or verification."""
    if isinstance(value, dict):
        return [value]
    if isinstance(value, list):
        return [block for item in value for block in
                receipt_blocks(item.get('text') if as_dict(item).get('type') == 'text' else item)]
    blocks = []
    if isinstance(value, str):
        tail = value.lstrip()
        while tail.startswith(('{', '[')):
            block, end = DECODER.raw_decode(tail)
            blocks.extend(receipt_blocks(block))
            tail = tail[end:].lstrip()
    return blocks


def journal_events(path):
    with path.open(encoding='utf-8-sig') as stream:
        for line, text in enumerate(stream, 1):
            if not text.strip():
                continue
            try:
                yield line, object_value(load_json(text), f'{path}:{line}')
            except ValueError as error:
                raise ValueError(f'{path}:{line}: {error}') from error


@dataclass
class ToolCall:
    journal: Path
    line: int
    result_line: int
    session: str
    timestamp: int
    tool: str
    state: dict
    result_timestamp: int

    @property
    def data(self):
        return self.state.get('input', {})

    @property
    def action(self):
        return self.tool.removeprefix('loginom_dock_').removeprefix('dock_')

    def receipts(self, strict=False):
        try:
            output = self.state.get('output')
            blocks = receipt_blocks(output) or receipt_blocks(self.state.get('error'))
            if strict and self.tool.startswith('loginom_dock_') and isinstance(output, str) and output.strip() and not blocks:
                raise ValueError('expected a JSON receipt')
            return blocks
        except ValueError as error:
            if strict and self.tool.startswith('loginom_dock_'):
                raise ValueError(f'{self.journal}:{self.result_line}: invalid Loginom JSON receipt') from error
            return []

    @cached_property
    def output(self):
        blocks = self.receipts()
        return blocks[0] if blocks else {}

    @property
    def operation(self):
        return operation_id(self.data) or operation_id(self.output)

    @cached_property
    def guidance(self):
        return next_steps(self.receipts())

    @cached_property
    def code(self):
        return result_code(self.output, self.state.get('error'))


def tool_calls(path, events):
    calls = {}
    for line, event in events:
        kind = event.get('type')
        if kind not in {'tool_use', 'tool_result'}:
            continue
        location = f'{path}:{line}'
        timestamp = event.get('timestamp') or 0
        if isinstance(timestamp, str):
            timestamp = runtime_time(timestamp)
        part = object_value(event.get('part', event), location)
        session = event.get('sessionID') or part.get('sessionID') or event.get('session_id') or ''
        identity = part.get('callID') or part.get('tool_call_id') or part.get('tool_use_id') or part.get('id')
        key = (session, identity) if identity else ('line', line)
        if kind == 'tool_result':
            previous = calls.get(key)
            if previous is None and not session and identity:
                matches = [call for (sess, ident), call in calls.items() if ident == identity and sess != 'line']
                previous = matches[0] if len(matches) == 1 else None
            if previous is not None:
                result = part.get('output', part.get('result', part.get('content')))
                payload = as_dict(result)
                state = part.get('state') or dict(
                    status='error' if any(part.get(key) or payload.get(key)
                                          for key in ('is_error', 'isError', 'error')) else 'completed',
                    output=payload.get('content', result), error=part.get('error'),
                )
                previous.state.update({k: v for k, v in state.items() if k != 'input'})
                previous.result_line = line
                previous.result_timestamp = timestamp
            continue
        tool = part.get('tool') or part.get('name')
        if not isinstance(tool, str) or not tool:
            raise ValueError(f'{location}: tool part must contain tool name')
        state = object_value(part.get('state', {'status': 'pending', 'input': part.get('input', {})}), location)
        if state.get('status') not in {'pending', 'running', 'completed', 'error'}:
            raise ValueError(f'{location}: invalid tool state status')
        object_value(state.get('input', {}), location)
        previous = calls.get(key)
        if previous is None:
            calls[key] = ToolCall(path, line, line, session, timestamp, tool, dict(state), timestamp)
        elif previous.state['status'] not in {'completed', 'error'}:
            previous.state.update(state)
            previous.result_line = line
            previous.result_timestamp = timestamp
    return list(calls.values())


def error_code(output, state_error=None):
    return (output.get('code') or as_dict(output.get('error')).get('code') or
            as_dict(state_error).get('code'))


def operation_id(value):
    return value.get('operation_id') or value.get('operationId')


def next_steps(blocks):
    steps = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if isinstance(block.get('tool'), str) and ('arguments' in block or 'instruction' in block):
            steps.append(block)
        for key in ('next_step', 'next_steps', 'output', 'verification', 'advice'):
            value = block.get(key)
            steps.extend(next_steps(value if isinstance(value, list) else [value]))
    return steps


def result_code(output, state_error=None):
    error = as_dict(output.get('error'))
    reason = output.get('reason')
    message = ' '.join(str(value or '') for value in (
        output.get('refused'), output.get('instruction'), error.get('message'),
        state_error if not output and isinstance(state_error, str) else '',
    )).lower()
    if 'budget' in message and ('exhausted' in message or 'no calls' in message):
        return 'BROWSER_RECOVERY_BUDGET_EXHAUSTED'
    if code := error_code(output, state_error):
        return code
    if isinstance(reason, str) and re.fullmatch(r'[A-Z][A-Z_0-9]+', reason):
        return reason
    if 'stop and report' in message:
        return 'STOP_AND_REPORT'
    if 'another dock operation' in message and any(word in message for word in ('pending', 'unresolved')):
        return 'DOCK_OPERATION_PENDING'
    if output.get('refused'):
        return 'REFUSED'
    return output.get('status') if output.get('status') in FAILED else None


def add_numbers(target, values, location):
    """Preserve all numeric token dimensions, including nested cache counters."""
    for key, value in object_value(values, location).items():
        if isinstance(value, dict):
            if key in target and not isinstance(target[key], dict):
                raise ValueError(f'{location}: incompatible counter {key}')
            add_numbers(target.setdefault(key, {}), value, location)
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
            raise ValueError(f'{location}: invalid numeric counter {key}')
        if isinstance(target.get(key), dict):
            raise ValueError(f'{location}: incompatible counter {key}')
        target[key] = target.get(key, 0) + value


def delivery_paths(value, delivery=False):
    """Only delivery receipts, never arbitrary port samples or readback paths."""
    if isinstance(value, list):
        for item in value:
            yield from delivery_paths(item, delivery)
    if isinstance(value, dict):
        if value.get('upload_completion_verified') is True and isinstance(value.get('destination'), str):
            yield value['destination']
        for key, item in value.items():
            if delivery and key in {'destination', 'path', 'file_path', 'filePath'} and isinstance(item, str):
                yield item
            yield from delivery_paths(item, delivery or key in {'file_artifacts', 'delivered', 'delivery', 'artifact'})


def stage_budget(cases, stage):
    if cases is None:
        return {}
    folder = cases / stage
    if not folder.is_dir():
        raise ValueError(f'{folder}: missing stage case directory')
    path = folder / 'case.json'
    if not path.exists():
        return {}
    config = object_value(load_json(path.read_text(encoding='utf-8')), path)
    budget = object_value(config.get('budget', {}), path)
    if set(budget) - {'max_tool_calls', 'max_errors', 'max_nodes', 'forbid'}:
        raise ValueError(f'{path}: unknown budget key')
    for key in ('max_tool_calls', 'max_errors', 'max_nodes'):
        if key in budget and (type(budget[key]) is not int or budget[key] < 0):
            raise ValueError(f'{path}: {key} must be a nonnegative integer')
    if 'forbid' in budget and (not isinstance(budget['forbid'], list) or
                             any(not isinstance(v, str) or not v for v in budget['forbid'])):
        raise ValueError(f'{path}: forbid must be a list of nonempty strings')
    return budget


def input_strings(value):
    # Search actual strings too: JSON escaping must not hide Windows paths/newlines.
    if isinstance(value, str):
        yield value
    if isinstance(value, dict):
        for key, item in value.items():
            yield key
            yield from input_strings(item)
    if isinstance(value, list):
        for item in value:
            yield from input_strings(item)


def audit_stage(path, cases):
    result = dict(scenario=path.parent.parent.name, stage=path.parent.name,
                  tool_calls=0, loginom_calls=0, errors=0, error_details=[], repeats=0,
                  repeat_details=[], recovery=dict.fromkeys(RECOVERY, 0),
                  nodes=dict(created=0, by_type={}, deleted=0), other_tools=[],
                  delivered_files=[], tokens={}, cost=0, final_text='', session_errors=[],
                  budget=stage_budget(cases, path.parent.name), violations=[], verdict='OK')
    events = list(journal_events(path))
    for line, event in events:
        location = f'{path}:{line}'
        kind = event.get('type')
        if not isinstance(kind, str):
            raise ValueError(f'{location}: missing event type')
        if kind == 'error':
            result['session_errors'].append(event.get('error'))
        if kind == 'text':
            part = object_value(event.get('part'), location)
            if not isinstance(part.get('text'), str):
                raise ValueError(f'{location}: text part must contain text')
            result['final_text'] = part['text'][:200]
        if kind == 'step_finish':
            part = object_value(event.get('part'), location)
            add_numbers(result['tokens'], part.get('tokens', {}), location)
            cost = {}
            add_numbers(cost, {'cost': part.get('cost', 0)}, location)
            result['cost'] += cost['cost']
    if not events:
        raise ValueError(f'{path}: empty event journal')

    seen = Counter()
    created = set()
    deleted = set()
    forbidden_inputs = []
    for call in tool_calls(path, events):
        line, tool, state, data = call.result_line, call.tool, call.state, call.data
        result['tool_calls'] += 1
        is_loginom = tool.startswith('loginom_')
        result['loginom_calls'] += int(is_loginom)
        action = tool.removeprefix('loginom_dock_') if is_loginom else ''
        if action in result['recovery']:
            result['recovery'][action] += 1
        signature = (tool, canonical(data))
        seen[signature] += 1
        if seen[signature] > 1:
            result['repeats'] += 1
            result['repeat_details'].append(dict(tool=tool, input=data, line=line))
        blocks = call.receipts(strict=True)
        output = blocks[0] if blocks else {}
        failure = state['status'] == 'error' or output.get('status') in FAILED or bool(output.get('refused'))
        if failure:
            error = output.get('error')
            state_error = state.get('error')
            code = error_code(output, state_error)
            result['errors'] += 1
            result['error_details'].append(dict(tool=tool, line=line, status=output.get('status', state['status']),
                                               code=code, error=state_error or error))
        if not is_loginom:
            command = next((data[k] for k in ('command', 'filePath', 'file_path', 'path', 'content') if isinstance(data.get(k), str)), canonical(data))
            result['other_tools'].append(dict(tool=tool, line=line, command=command[:120]))
            forbidden_inputs.append((tool, line, [canonical(data), *input_strings(data)]))
        result['delivered_files'].extend(delivery_paths(output))
        node = output.get('node') if isinstance(output.get('node'), dict) else {}
        target = object_value(data.get('target', {}), f'{path}:{line}: target') if action == 'node_apply' else {}
        if action == 'node_apply' and target.get('kind') == 'new':
            if node.get('node_id') or (state['status'] == 'completed' and output.get('status') == 'SUCCEEDED'):
                identity = node.get('node_id') or ('line', line)
                if identity not in created:
                    created.add(identity)
                    node_type = node.get('type') or target.get('type') or 'unknown'
                    result['nodes']['by_type'][node_type] = result['nodes']['by_type'].get(node_type, 0) + 1
        if action == 'node_delete' and state['status'] == 'completed' and output.get('status') == 'SUCCEEDED':
            target = data.get('node') if isinstance(data.get('node'), dict) else {}
            deleted.add(node.get('node_id') or target.get('node_id') or ('line', line))
    result['nodes'].update(created=len(created), deleted=len(deleted))
    result['delivered_files'] = sorted(set(result['delivered_files']))
    for rule, actual in [('max_tool_calls', result['tool_calls']), ('max_errors', result['errors']),
                         ('max_nodes', result['nodes']['created'])]:
        limit = result['budget'].get(rule)
        if limit is not None and actual > limit:
            result['violations'].append(dict(rule=rule, actual=actual, limit=limit))
    for substring in result['budget'].get('forbid', []):
        for tool, line, strings in forbidden_inputs:
            if any(substring in s for s in strings):
                result['violations'].append(dict(rule='forbid', substring=substring, tool=tool, line=line))
        for destination in result['delivered_files']:
            if substring in destination:
                result['violations'].append(dict(rule='forbid', substring=substring, destination=destination))
    if result['violations']:
        result['verdict'] = 'ACTION_BUDGET_EXCEEDED'
    return result


def cell(value):
    return str(value).replace('\\', '\\\\').replace('|', '\\|').replace('\r', '').replace('\n', '<br>')


def markdown(report):
    lines = ['| Сценарий | Этап | Вызовы | Loginom | Ошибки | Повторы | Recovery | Узлы +/- | Чужие инструменты | Вердикт |',
             '|---|---|---:|---:|---:|---:|---|---|---|---|']
    for stage in report['stages']:
        recovery = '/'.join(str(stage['recovery'][k]) for k in RECOVERY)
        others = ', '.join(f"{t['tool']}: {t['command']}" for t in stage['other_tools']) or '—'
        values = [stage['scenario'], stage['stage'], stage['tool_calls'], stage['loginom_calls'], stage['errors'],
                  stage['repeats'], recovery, f"+{stage['nodes']['created']}/-{stage['nodes']['deleted']}", others, stage['verdict']]
        lines.append('| ' + ' | '.join(cell(v) for v in values) + ' |')
    lines += ['', 'Recovery: operation_recover / browser_recovery / operation_inspect.']
    for stage in report['stages']:
        lines += ['', f"### {cell(stage['scenario'])} / {cell(stage['stage'])}", '',
                  f"Токены: {cell(canonical(stage['tokens']))}; стоимость: {stage['cost']:.10g}.",
                  f"Созданные узлы по типу: {cell(canonical(stage['nodes']['by_type']))}.",
                  f"Ответ: {cell(stage['final_text'])}", '', 'Нарушения:']
        lines += ['- ' + cell(canonical(v)) for v in stage['violations']] or ['- Нет.']
        for key, title in [('error_details', 'Ошибки инструментов'), ('repeat_details', 'Повторы'),
                           ('session_errors', 'Ошибки сессии'), ('delivered_files', 'Доставленные файлы')]:
            if stage[key]:
                lines += ['', title + ':'] + ['- ' + cell(canonical(v)) for v in stage[key]]
    return '\n'.join(lines)


PATTERNS = {
    'a': 'wizard_cycle',
    'b': 'node_recreated',
    'c': 'apply_after_recovery',
    'd': 'consecutive_identical',
    'e': 'repeated_delivery_or_lookup',
    'f': 'manual_recovery',
    'g': 'deadlock',
}
RECOVER_CALLS = {'operation_recover', 'abandon_operation'}
OPERATION_KEYS = {'operation_id', 'operationId'}
NODE_PROCEDURE_PHASES = {'source', 'workflow', 'target', 'input_mapping', 'open', 'configure',
                         'output_mapping', 'finish', 'execute', 'read', 'save'}
RUNTIME_PHASES = {
    'node_apply_prepared', 'node_phase_completed', 'node_phase_refused', 'node_checkpoint',
    'node_operation_released', 'operation_abandoned', 'node_step_prepared', 'node_step_completed',
    'node_observation_completed', 'javascript_managed_close_verified', 'javascript_managed_done_settled',
    'browser_recovery_verified',
}


def without_operation_id(data):
    return {key: value for key, value in data.items() if key not in OPERATION_KEYS}


def node_ref(value):
    value = as_dict(value)
    certificate = as_dict(value.get('ref')) or value
    return certificate.get('node_id')


def node_in_receipt(receipt):
    return node_ref(receipt.get('node')) or node_ref(as_dict(receipt.get('output')).get('node'))


def successful(call):
    return call.state['status'] == 'completed' and not (
        call.output.get('status') in FAILED or call.output.get('error') or call.output.get('refused')
    )


def verified_mutation(call):
    if not successful(call) or call.output.get('status') != 'SUCCEEDED':
        return False
    action_key = call.output.get('action_key')
    if call.action in {'node_wait', 'node_status', 'node_cancel'}:
        return action_key in {'node.apply', 'node.delete'}
    if call.action == 'action_run':
        return action_key in {'node.delete', 'node.apply', 'graph.link', 'graph.unlink'}
    return call.action in {'node_apply', 'node_delete', 'node_resume'}


def result_subject(call):
    receipt = call.output
    return (node_in_receipt(receipt) or node_ref(as_dict(call.data.get('target')).get('ref')) or
            node_ref(call.data.get('node')))


def runtime_time(value):
    if not isinstance(value, str):
        return 0
    try:
        return int(datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000)
    except ValueError:
        return 0


@dataclass
class WizardEvent:
    operation: str
    node: str
    event: str
    location: str
    timestamp: int = 0
    verb: str = ''
    kind: str = 'configuration'
    stage: str = ''


def wizard_event(output, verb):
    context = as_dict(output.get('prepared_node_context'))
    wizard = as_dict(output.get('wizard'))
    # Roots/partial reads can omit the wizard. Absence by itself proves nothing.
    if output.get('wizard_open_verified') is True or (
        context.get('verified') is True and context.get('surface') == 'wizard' and wizard.get('status') == 'observed'
    ):
        return 'open'
    if output.get('wizard_close_verified') is True or output.get('wizard_closed') is True:
        return 'close'
    if (output.get('wizard_finish_graph_verified') is True or
            output.get('wizard_finish_verified') is True):
        return 'finish'
    if wizard.get('status') == 'absent' and context.get('verified') is True and context.get('surface') == 'graph':
        return 'finish' if verb in {'finish_wizard', 'execute_wizard'} else 'close'
    return ''


def runtime_evidence(run, paths, warnings):
    operations = defaultdict(dict)
    wizards = []
    for path in paths:
        prepared = {}
        try:
            for line, event in journal_events(path):
                phase = event.get('phase') or event.get('event')
                if phase not in RUNTIME_PHASES:
                    continue
                op = operation_id(event)
                if not op:
                    continue
                info = operations[op]
                location = f'{path.relative_to(run)}:{line}'
                stamp = runtime_time(event.get('recorded_at'))
                outcome = as_dict(event.get('outcome'))
                output = as_dict(outcome.get('output'))
                result = as_dict(event.get('result'))
                receipt = as_dict(event.get('receipt'))
                value = as_dict(receipt.get('value'))
                if phase == 'node_apply_prepared':
                    info['request'] = as_dict(event.get('request'))
                if phase in {'node_phase_completed', 'node_phase_refused'}:
                    step_phase = receipt.get('phase')
                    if step_phase:
                        info.setdefault('phases', set()).add(step_phase)
                    if step_phase == 'target':
                        if node := node_ref(value.get('node')):
                            info['node'] = node
                            target = as_dict(value.get('target'))
                            if isinstance(target.get('created'), bool):
                                info['target_created'] = target['created']
                            if target.get('created') is True:
                                info['created'] = location
                if phase == 'node_checkpoint' and result.get('pending_phase') and result.get('cleanup_complete') is False:
                    info['pending'] = (stamp, location)
                if phase == 'node_checkpoint' and result.get('status') == 'SUCCEEDED':
                    info['completed'] = (stamp, location)
                if phase == 'browser_recovery_verified':
                    info.setdefault('browser_verification', []).append({
                        'timestamp': stamp, 'location': location, 'status': event.get('status'),
                    })
                if phase in {'node_operation_released', 'operation_abandoned'}:
                    info['released'] = (stamp, location)
                    node = node_ref(result.get('node')) or node_ref(receipt.get('before_node')) or info.get('node')
                    if node:
                        wizards.append(WizardEvent(op, node, 'release', location, stamp))
                verb = ''
                if phase in {'node_step_prepared', 'node_step_completed'}:
                    step_id = event.get('internal_operation_id') or (op, canonical(event.get('step')))
                    if phase == 'node_step_prepared':
                        prepared[step_id] = as_dict(event.get('action')).get('verb', '')
                    else:
                        verb = prepared.get(step_id, '')
                if phase in {'node_step_completed', 'node_observation_completed'} and outcome.get('status') == 'SUCCEEDED':
                    transition = wizard_event(output, verb if phase == 'node_step_completed' else '')
                    node = node_ref(output.get('prepared_node_context')) or info.get('node')
                    if transition and node:
                        stage = as_dict(output.get('wizard')).get('stage') or ''
                        kind = stage if stage in {'input_mapping', 'output_mapping'} else 'configuration'
                        wizards.append(WizardEvent(op, node, transition, location, stamp, verb, kind, stage))
                if phase in {'javascript_managed_close_verified', 'javascript_managed_done_settled'}:
                    node = node_ref(event.get('owner')) or info.get('node')
                    if node:
                        transition = 'close' if phase.endswith('close_verified') else 'finish'
                        wizards.append(WizardEvent(op, node, transition, location, stamp, phase))
        except (OSError, ValueError) as error:
            warnings.append(str(error))
    return operations, wizards


def normalized_tool(name):
    return name.removeprefix('loginom_').removeprefix('dock_')


def guidance_matches(step, call):
    if normalized_tool(step['tool']) != normalized_tool(call.tool):
        return False
    instruction = step.get('instruction')
    if (call.operation and call.operation == step.get('original_operation_id') and
            isinstance(instruction, str) and re.search(r'(?:new|fresh) operation_id', instruction, re.I)):
        return False
    return all(call.data.get(key) == value for key, value in as_dict(step.get('arguments')).items())


def result_message(call):
    output = call.output
    return next((v for v in (
        output.get('refused'), as_dict(output.get('error')).get('message'),
        as_dict(call.state.get('error')).get('message'), output.get('instruction'),
        call.state.get('error') if not output else None,
    ) if isinstance(v, str) and v), '')


class PatternAudit:
    def __init__(self, run, calls, operations, wizards, journal_turns):
        self.run = run
        self.calls = calls
        self.operations = operations
        self.wizards = wizards
        self.journal_turns = journal_turns
        self.cases = []
        self.index = {id(call): index for index, call in enumerate(calls)}
        self.results = sorted((call for call in calls if call.state['status'] in {'completed', 'error'}),
                              key=lambda call: (journal_turns[call.journal], call.result_timestamp, call.result_line))
        self.by_operation = defaultdict(list)
        for call in calls:
            if call.operation:
                self.by_operation[call.operation].append(call)

    def location(self, call, result=False):
        return f'{call.journal.relative_to(self.run)}:{call.result_line if result else call.line}'

    def available(self, before, call):
        if not before or self.index[id(before)] >= self.index[id(call)]:
            return False
        return before.journal != call.journal or before.result_line < call.line

    def previous_result(self, call):
        return next((item for item in reversed(self.calls[:self.index[id(call)]])
                     if item.state['status'] in {'completed', 'error'} and self.available(item, call)), None)

    def previous_dock_result(self, call):
        return next((item for item in reversed(self.calls[:self.index[id(call)]])
                     if item.tool.startswith(('loginom_dock_', 'dock_')) and
                     item.state['status'] in {'completed', 'error'} and self.available(item, call)), None)

    def add(self, group, variant, call, *, cause=None, initiator=None, node=None, node_type=None, **details):
        previous = self.previous_result(call)
        # Causal evidence (such as a prior recovery) can precede the immediately previous response.
        related = [item for item in (previous, self.previous_dock_result(call), cause)
                   if item is not None and self.available(item, call)]
        directive = next(((item, step) for item in related for step in item.guidance
                          if guidance_matches(step, call)), None)
        source = (cause if initiator in {'runtime_reported', 'runtime_internal'} else directive[0] if directive else
                  next((item for item in (previous, cause) if item is not None and item.code), cause))
        reason = directive[1].get('reason') if directive else None
        if initiator is None:
            initiator = 'runtime_next_step' if directive else 'model'
        code = (source.code if source else None) or reason or 'NO_CODE'
        target = as_dict(call.data.get('target'))
        step = as_dict(call.output.get('step'))
        if node_type is None:
            node_type = target.get('type') or step.get('node_type')
        self.cases.append(dict(
            run=self.run.name, turn=self.journal_turns[call.journal],
            pattern=group, name=PATTERNS[group], variant=variant,
            location=self.location(call), tool=call.tool, operation_id=call.operation,
            node=node or result_subject(call) or step.get('node_id'), node_type=node_type,
            trigger=dict(code=code, initiator=initiator, location=self.location(source, True) if source else None,
                         previous_result=self.location(previous, True) if previous else None,
                         previous_code=previous.code if previous else None),
            **details,
        ))

    def call_for_operation(self, operation, actions):
        return next((call for call in self.by_operation[operation] if call.action in actions), None)

    def node_for_operation(self, operation):
        return (self.operations.get(operation, {}).get('node') or
                next((node for call in self.by_operation[operation] if (node := result_subject(call))), None))

    def node_type(self, operation):
        call = self.call_for_operation(operation, {'node_apply'})
        request = call.data if call else self.operations.get(operation, {}).get('request', {})
        return as_dict(request.get('target')).get('type')

    def wizard_cycles(self):
        timeline = [event for event in self.wizards if event.operation in self.by_operation]
        for call in self.calls:
            if not call.operation:
                continue
            receipt = call.output
            transition = wizard_event(as_dict(receipt.get('output')), '') or wizard_event(receipt, '')
            verification = as_dict(receipt.get('verification'))
            recovery_output = as_dict(receipt.get('output'))
            verified_release = (call.action in RECOVER_CALLS and successful(call) and (
                recovery_output.get('original_operation_pending') is False or
                recovery_output.get('resolution') in {'operation_abandoned', 'abandoned_after_observation'} or
                call.data.get('strategy') == 'abandon_operation' and receipt.get('phase') == 'resolved'
            )) or (receipt.get('phase') == 'dock' and verification.get('status') == 'continuable')
            if verified_release and not self.operations.get(call.operation, {}).get('released'):
                transition = 'release'
            if transition and (node := self.node_for_operation(call.operation)):
                timeline.append(WizardEvent(call.operation, node, transition, self.location(call, True),
                                            call.result_timestamp))
        active = {}
        closed = {}
        for event in sorted(timeline, key=lambda item: item.timestamp):
            if event.event != 'open':
                if event.node in active:
                    opened = active.pop(event.node)
                    closed[event.node, opened.kind] = (opened, event, event if event.event == 'release' else None)
                elif event.event == 'release':
                    for key, (opening, closing, release) in closed.items():
                        if key[0] == event.node and event.operation in {opening.operation, closing.operation} and not release:
                            closed[key] = (opening, closing, event)
                continue
            if event.node in active:
                continue
            active[event.node] = event
            key = (event.node, event.kind)
            if key not in closed:
                continue
            opening, closing, release = closed.pop(key)
            call = self.call_for_operation(
                event.operation, {'node_apply', 'node_resume', 'node_read', 'action_run', 'workspace_observe'})
            if call is None:
                continue
            node_type = self.node_type(event.operation) or self.node_type(opening.operation)
            breakers = [item for item in self.by_operation[(release or closing).operation] if self.available(item, call)]
            prior = next((item for item in reversed(breakers) if any(
                guidance_matches(step, call) for step in item.guidance)), None)
            cause = prior or next((item for item in reversed(breakers) if item.code), None)
            self.add('a', 'import' if (node_type or '').startswith('imports.') else 'other', call,
                     node=event.node, node_type=node_type, cause=cause,
                     initiator='runtime_internal' if opening.operation == event.operation else None,
                     opened=opening.location, closed=closing.location, reopened=event.location,
                     close_kind=closing.event, reopening_verb=event.verb or None,
                     released=release.location if release else None,
                     wizard_kind=event.kind, opened_stage=opening.stage or None, reopened_stage=event.stage or None,
                     same_operation=opening.operation == event.operation)

    def recreated_nodes(self):
        creations = {}
        deletions = {}
        for call in self.calls:
            action = call.action
            node = result_subject(call)
            delete = action == 'node_delete' or call.output.get('action_key') == 'node.delete'
            if delete and verified_mutation(call) and node in creations:
                create, key = creations.pop(node)
                deletions[key] = (create, call)
                continue
            if action != 'node_apply' or as_dict(call.data.get('target')).get('kind') != 'new':
                continue
            if self.operations.get(call.operation, {}).get('target_created') is False:
                continue
            node = self.node_for_operation(call.operation)
            if not node or node in creations:
                continue
            target = as_dict(call.data.get('target'))
            workflow = as_dict(call.data.get('workflow_ref'))
            key = (call.data.get('document_id'), workflow.get('native_id') or workflow.get('prefix'),
                   target.get('type'))
            if not key[-1]:
                continue
            creations[node] = (call, key)
            if key in deletions:
                create, delete = deletions.pop(key)
                self.add('b', 'same_type', call, cause=delete, node=node, node_type=key[-1],
                         created=self.location(create), deleted=self.location(delete, True),
                         previous_node=self.node_for_operation(create.operation),
                         creation_evidence=self.operations.get(call.operation, {}).get('created'),
                         same_label=as_dict(create.data.get('target')).get('label') == target.get('label'))

    def repeats_after_recovery(self):
        pending = {}
        for call in self.calls:
            if call.action in RECOVER_CALLS and call.operation:
                original = self.call_for_operation(call.operation, {'node_apply'})
                if original:
                    related = [item for item in self.by_operation[call.operation] if self.available(item, call)]
                    failure = next((item for item in reversed(related) if item.code and
                                    item.output.get('phase') in NODE_PROCEDURE_PHASES and
                                    item.output.get('action_key', 'node.apply') == 'node.apply'), original)
                    pending[call.operation] = (original, failure, call)
                continue
            if call.action != 'node_apply':
                continue
            target = as_dict(call.data.get('target'))
            current_node = self.node_for_operation(call.operation)
            for op, (original, failure, recovery) in reversed(list(pending.items())):
                old_target = as_dict(original.data.get('target'))
                old_node = self.node_for_operation(op)
                same_target = ((old_node and old_node == current_node) or target == old_target and
                               call.data.get('document_id') == original.data.get('document_id') and
                               call.data.get('workflow_ref') == original.data.get('workflow_ref'))
                if not same_target or call.data.get('mode') != original.data.get('mode'):
                    continue
                old_explicit, new_explicit = original.data.get('phase'), call.data.get('phase')
                phase = old_explicit or failure.output.get('phase')
                if phase not in NODE_PROCEDURE_PHASES and not old_explicit:
                    phase = None
                visits = self.operations.get(call.operation, {}).get('phases', set())
                observed = {item.output.get('phase') for item in self.by_operation[call.operation]
                            if item.output.get('phase') in NODE_PROCEDURE_PHASES}
                if new_explicit and phase != new_explicit:
                    continue
                evidence = ('explicit_request' if old_explicit and old_explicit == new_explicit else
                            'runtime' if phase in visits else 'model_result' if phase in observed else None)
                if not evidence and (old_explicit or new_explicit or
                                     call.data.get('finish') != original.data.get('finish') or
                                     observed and phase not in observed):
                    continue
                del pending[op]
                directive = next((item for item in reversed(self.by_operation[op])
                                  if self.index[id(item)] >= self.index[id(recovery)] and self.available(item, call)
                                  and any(guidance_matches(step, call) for step in item.guidance)), None)
                variant = 'same_target_and_phase' if evidence else 'same_requested_phase'
                self.add('c', variant, call, cause=directive or (recovery if recovery.code else failure),
                         node=current_node or old_node, original=self.location(original),
                         recovery=self.location(recovery, True), phase=phase or call.data.get('finish'),
                         phase_evidence=evidence or 'matching_mode_and_finish',
                         recovery_code=recovery.code, original_code=failure.code)
                break

    def repeated_calls(self):
        previous = None
        lookups = {}
        deliveries = {}
        by_upload = {}
        confirmed_uploads = set()
        delivery_requests = {}
        for call in self.calls:
            signature = (call.tool, canonical(without_operation_id(call.data)))
            if previous and previous[1] == signature:
                first = previous[0]
                wait = call.action == 'node_wait'
                same_op = call.operation == first.operation
                normal = wait and same_op and first.output.get('state') == 'running' and self.available(first, call)
                variant = 'running_poll' if normal else 'different_wait_operation' if wait and not same_op else 'identical'
                self.add('d', variant, call, cause=first, first=self.location(first), normal=normal,
                         same_operation=same_op)
            previous = (call, signature)
            if call.action in {'prepare', 'action_describe'}:
                args = without_operation_id(call.data)
                if call.action == 'action_describe':
                    args = {key: sorted(value) if isinstance(value, list) and all(isinstance(x, str) for x in value)
                            else value for key, value in args.items()}
                key = (call.tool, canonical(args))
                if first := lookups.get(key):
                    self.add('e', call.action, call, cause=first, first=self.location(first),
                             first_succeeded=successful(first), repeated_succeeded=successful(call),
                             requested_types=args.get('node_types'))
                lookups[key] = call
            if call.action in {'artifact_deliver', 'artifact_delivery_start'}:
                by_upload[call.operation] = call
                artifact = call.data.get('artifact_id') or call.data.get('artifactId')
                if artifact:
                    first = delivery_requests.get(artifact)
                    if (first and first.operation != call.operation and self.available(first, call) and
                            not successful(first)):
                        self.add('e', 'file_delivery_retry', call, cause=first, first=self.location(first, True),
                                 prior_delivery_code=first.code, repeated_succeeded=successful(call))
                    delivery_requests[artifact] = call
            if call.action not in {'artifact_deliver', 'artifact_delivery_start', 'artifact_delivery_resume',
                                   'artifact_delivery_status', 'artifact_delivery_wait'}:
                continue
            upload = by_upload.get(call.operation, call)
            receipt = as_dict(call.output.get('output')) or call.output
            artifact = upload.data.get('artifact_id') or upload.data.get('artifactId')
            confirmed = receipt.get('upload_completion_verified') is True and successful(call)
            if not confirmed:
                continue
            aliases = {(kind, value) for kind, value in (('artifact', artifact), ('sha256', receipt.get('sha256')),
                                                           ('destination', receipt.get('destination'))) if value}
            upload_id = receipt.get('upload_operation_id') or call.operation or self.location(upload)
            if upload_id in confirmed_uploads:
                continue
            confirmed_uploads.add(upload_id)
            first = next((deliveries[key] for key in sorted(aliases) if key in deliveries and
                          deliveries[key][0] != upload_id and
                          (key[0] != 'destination' or not receipt.get('sha256') or
                           receipt.get('sha256') == deliveries[key][2])), None)
            if first:
                self.add('e', 'file_delivery', call, cause=first[1], first=self.location(first[1], True),
                         file_name=str(receipt.get('destination', '')).replace('\\', '/').split('/')[-1] or None,
                         same_destination=as_dict(first[1].output.get('output')).get('destination') ==
                         receipt.get('destination'))
            for key in aliases:
                deliveries[key] = (upload_id, call, receipt.get('sha256'))

    def result_summary(self, call):
        receipt = call.output
        output = as_dict(receipt.get('output'))
        return dict(
            location=self.location(call, True), tool=call.tool, operation_id=call.operation,
            status=receipt.get('status') or call.state['status'], state=receipt.get('state') or output.get('state'),
            phase=receipt.get('phase'), code=call.code, message=result_message(call)[:260] or None,
            cleanup_complete=receipt.get('cleanup_complete'),
            original_operation_pending=output.get('original_operation_pending'),
            verification=as_dict(receipt.get('verification')).get('status'),
            next_tools=list(dict.fromkeys(step['tool'] for step in call.guidance)),
        )

    def later_mutation(self, call):
        # Re-reading an earlier success receipt is not evidence of a new change.
        seen = set()
        after = False
        for item in self.results:
            if verified_mutation(item) and item.operation not in seen:
                if after:
                    return item
                seen.add(item.operation)
            after = after or item is call
        return None

    def manual_recovery(self):
        offers = {}
        offered_operations = set()
        attempts = {}
        without_offer = {}
        tail = self.tail_results()

        def record_attempt(op, start, finish=None, stop=None, offer=None):
            decisive = finish or stop or start
            verification = as_dict(decisive.output.get('verification'))
            returned = bool(finish and finish.output.get('phase') == 'dock' and successful(finish))
            later = self.later_mutation(decisive)
            proof = next((item for item in self.operations.get(op, {}).get('browser_verification', [])
                          if not item['timestamp'] or not finish.result_timestamp or
                          abs(item['timestamp'] - finish.result_timestamp) < 3000), None) if finish else None
            self.add('f', 'start_to_finish' if finish else 'start_without_finish', start, cause=offer,
                     node=self.node_for_operation(op), node_type=self.node_type(op),
                     offered=self.location(offer, True) if offer else None,
                     start_phase=start.output.get('phase'), start_code=start.code,
                     finish=self.location(finish, True) if finish else None,
                     stop=self.location(stop, True) if stop else None,
                     returned_to_dock=returned, continued=bool(returned and later),
                     later_mutation=self.location(later, True) if later else None,
                     outcome=verification.get('status') or decisive.output.get('phase') or decisive.code,
                     runtime_verification=proof['location'] if proof else None,
                     decisive_result=self.result_summary(decisive), **tail)

        for call in self.calls:
            op = call.operation
            suggestion = next((step for step in call.guidance if normalized_tool(step['tool']) ==
                               'browser_recovery' and as_dict(step.get('arguments')).get('action', 'start') ==
                               'start'), None)
            if suggestion:
                offered_op = operation_id(as_dict(suggestion.get('arguments'))) or op
                offers.setdefault(offered_op, call)
                offered_operations.add(offered_op)
                without_offer.pop(offered_op, None)
            elif release_blocker(call) and op not in offers and op not in attempts:
                without_offer[op] = call
            if call.action != 'browser_recovery':
                continue
            action = call.data.get('action')
            if action == 'start':
                offer = offers.get(op) or offers.get(None)
                if self.available(offer, call):
                    del offers[op if op in offers else None]
                else:
                    offer = None
                if offer:
                    self.add('f', 'offered_and_started', call, cause=offer, initiator='runtime_next_step',
                             node=self.node_for_operation(op), node_type=self.node_type(op),
                             offered=self.location(offer, True), start_result=self.result_summary(call))
                if op in attempts:
                    previous_start, previous_finish, previous_offer = attempts.pop(op)
                    record_attempt(op, previous_start, previous_finish, offer=previous_offer)
                if call.output.get('phase') == 'browser' and successful(call):
                    attempts[op] = (call, None, offer)
                else:
                    self.add('f', 'start_refused', call, cause=offer,
                             node=self.node_for_operation(op), node_type=self.node_type(op),
                             offered=self.location(offer, True) if offer else None,
                             decisive_result=self.result_summary(call),
                             continued=bool(self.later_mutation(call)), **tail)
            if action in {'finish', 'stop'} and op in attempts:
                start, previous_finish, offer = attempts[op]
                if action == 'stop' or call.output.get('phase') in {'dock', 'stopped'}:
                    record_attempt(op, start, call if action == 'finish' else previous_finish,
                                   call if action == 'stop' else None, offer)
                    del attempts[op]
                elif action == 'finish':
                    attempts[op] = (start, call, offer)

        for op, (start, finish, offer) in attempts.items():
            record_attempt(op, start, finish, offer=offer)
        for variant, calls in [('offered_no_start', offers), ('release_blocked_no_offer', without_offer)]:
            for op, call in calls.items():
                self.add('f', variant, call, cause=call, initiator='runtime_reported',
                         node=self.node_for_operation(op), node_type=self.node_type(op),
                         previously_offered=op in offered_operations,
                         continued=bool(self.later_mutation(call)), decisive_result=self.result_summary(call), **tail)

    def tail_results(self):
        last = (self.results or self.calls)[-1]
        dock = next((item for item in reversed(self.results) if item.tool.startswith(('loginom_dock_', 'dock_'))),
                    last)
        return dict(last_tool_result=self.result_summary(dock), last_model_tool_result=self.result_summary(last))

    def deadlock(self, terminal_basis):
        pending = {}
        blocker = None
        changed = set()
        for call in self.results:
            op = call.operation
            if verified_mutation(call) and op not in changed:
                changed.add(op)
                blocker = None
                pending.pop(op, None)
            if waiting := pending_operation(call):
                pending[waiting] = call
            if op and released_operation(call):
                was_pending = pending.pop(op, None)
                if blocker and (blocker.operation == op or not pending and was_pending and pending_denial(blocker)):
                    blocker = None
            if deadlock_blocker(call):
                blocker = call
        pending_evidence = []
        for op, calls in self.by_operation.items():
            evidence = self.operations.get(op, {})
            runtime_end = max(filter(None, (evidence.get('released'), evidence.get('completed'))), default=None)
            if runtime_end and op in pending and runtime_end[0] >= pending[op].result_timestamp:
                pending.pop(op)
                if blocker and blocker.operation == op and runtime_end[0] >= blocker.result_timestamp:
                    blocker = None
            runtime_pending = evidence.get('pending')
            if runtime_pending and (not runtime_end or runtime_pending[0] > runtime_end[0]):
                if op not in changed and not any(released_operation(item) for item in calls):
                    pending.setdefault(op, calls[-1])
                    pending_evidence.append(runtime_pending[1])
            completion = evidence.get('completed')
            if blocker and completion and completion[0] > blocker.result_timestamp:
                blocker = None
        if not pending and not blocker:
            return
        cause = blocker or max(pending.values(), key=lambda item: self.index[id(item)])
        self.add('g', 'pending_release' if pending else 'blocker_without_change', cause, cause=cause,
                 initiator='runtime_reported', node=self.node_for_operation(cause.operation),
                 node_type=self.node_type(cause.operation), pending_operations=list(pending),
                 pending_evidence=pending_evidence, blocker=self.result_summary(blocker) if blocker else None,
                 terminal_basis=terminal_basis, **self.tail_results())


def released_operation(call):
    receipt = call.output
    output = as_dict(receipt.get('output'))
    return (receipt.get('phase') in {'node_ready', 'node_released'} and receipt.get('cleanup_complete') is True or
            call.action in RECOVER_CALLS and successful(call) and (
                output.get('original_operation_pending') is False or receipt.get('phase') == 'resolved'
            ) or call.action == 'browser_recovery' and receipt.get('phase') == 'dock' and successful(call))


def pending_operation(call):
    receipt = call.output
    output = as_dict(receipt.get('output'))
    if (output.get('original_operation_pending') is True or
            call.action == 'operation_inspect' and output.get('state') == 'pending'):
        return operation_id(output) or operation_id(receipt) or call.operation
    if (receipt.get('status') in FAILED and receipt.get('effect_possible') is True and
            receipt.get('cleanup_complete') is False and not receipt.get('request_rejected') and
            receipt.get('phase') not in {'request_rejected', 'preconditions'}):
        return operation_id(receipt) or call.operation
    return None


def release_blocker(call):
    message = ' '.join([result_message(call), *(str(step.get('instruction', '')) for step in call.guidance)]).lower()
    if call.action == 'browser_recovery':
        # A successful handoff carries the original refusal as its reason.
        return call.code == 'BROWSER_RECOVERY_BUDGET_EXHAUSTED'
    return (call.code in {'NODE_RELEASE_REFUSED', 'BROWSER_RECOVERY_BUDGET_EXHAUSTED', 'STOP_AND_REPORT'} or
            'stop and report' in message and ('recover' in message or call.action in RECOVER_CALLS))


def pending_denial(call):
    message = result_message(call).lower()
    return (call.code in {'NODE_OPERATION_RUNNING', 'DOCK_OPERATION_PENDING'} or
            'another dock operation' in message and any(word in message for word in ('pending', 'unresolved')))


def deadlock_blocker(call):
    return (release_blocker(call) or pending_denial(call) or
            bool(call.output.get('ui_blocker') or as_dict(call.output.get('output')).get('ui_blocker')))


def model_journals(run):
    return sorted({path for wildcard in ('model.stdout', '*/model.stdout', '*/*/model.stdout')
                   for path in run.glob(wildcard) if path.is_file()})


def pattern_run(run):
    warnings = []
    results = {}
    planned_turns = {}
    terminal_basis = 'archived_journal_end'
    if (run / 'results.json').is_file():
        try:
            root = load_json((run / 'results.json').read_text(encoding='utf-8-sig'))
            if isinstance(root, list):
                results = dict(format='diagnostic_receipts', receipts=len(root))
            else:
                root = object_value(root, 'results.json')
                results = {key: root[key] for key in ('phase', 'finished') if key in root}
                results['scenarios'] = [
                    {key: case[key] for key in ('scenario', 'status', 'failed_phase') if key in case}
                    for case in (root.get('runs') or []) if isinstance(case, dict)
                ]
                for case in root.get('runs') or []:
                    if not isinstance(case, dict) or not isinstance(case.get('scenario'), str):
                        continue
                    for turn in case.get('turns') or []:
                        if (isinstance(turn, dict) and isinstance(turn.get('case'), str)
                                and type(turn.get('turn')) is int and turn['turn'] > 0):
                            planned_turns[run / case['scenario'] / turn['case'] / 'model.stdout'] = turn['turn']
                if results.get('finished') or results.get('phase') == 'complete':
                    terminal_basis = 'results.json'
                elif results.get('phase'):
                    terminal_basis = None
        except (OSError, ValueError) as error:
            warnings.append(f'results.json: {error}')
    journals = model_journals(run)
    grouped = defaultdict(lambda: defaultdict(list))
    journal_order = defaultdict(list)
    for path in journals:
        scenario = path.relative_to(run).parts[0] if path.parent != run else '.'
        first = 0
        try:
            stat = path.stat()
            events = list(journal_events(path))
            stamp = next((e['timestamp'] for _, e in events if e.get('timestamp')), None)
            first = (runtime_time(stamp) if isinstance(stamp, str) else stamp) or stat.st_mtime_ns // 1_000_000
            calls = tool_calls(path, events)
            if stat.st_size == 0:
                warnings.append(f'{path.relative_to(run)}: empty model journal')
        except (OSError, ValueError) as error:
            warnings.append(str(error))
            calls = []
        journal_order[scenario].append((first, path))
        for call in calls:
            grouped[scenario][call.session].append(call)
    journal_turns = {}
    for order in journal_order.values():
        for turn, (_, path) in enumerate(sorted(order), 1):
            journal_turns[path] = planned_turns.get(path, turn)

    cases = []
    runtime_journals = []
    scopes = {path.parent for path in run.glob('*/profile') if path.is_dir()}
    if (run / 'profile').is_dir():
        scopes.add(run)
    for scope in sorted(scopes | {run / scenario for scenario in grouped}):
        paths = sorted(path for path in (scope / 'profile').rglob('execution-events.jsonl') if path.is_file())
        runtime_journals.extend(str(path.relative_to(run)) for path in paths)
        operations, wizards = runtime_evidence(run, paths, warnings)
        for session in grouped[str(scope.relative_to(run))].values():
            calls = sorted(session, key=lambda call: (journal_turns[call.journal], call.timestamp, call.line))
            audit = PatternAudit(run, calls, operations, wizards, journal_turns)
            audit.wizard_cycles()
            audit.recreated_nodes()
            audit.repeats_after_recovery()
            audit.repeated_calls()
            audit.manual_recovery()
            if terminal_basis:
                audit.deadlock(terminal_basis)
            cases.extend(audit.cases)
    counts = Counter((case['location'].rsplit(':', 1)[0], case['pattern']) for case in cases)
    turns = []
    for scenario, order in sorted(journal_order.items()):
        for _, path in sorted(order, key=lambda item: journal_turns[item[1]]):
            journal = str(path.relative_to(run))
            turns.append(dict(scenario=scenario, turn=journal_turns[path], journal=journal,
                              counts={pattern: counts[journal, pattern] for pattern in PATTERNS}))
    return dict(run=run.name, model_journals=[str(path.relative_to(run)) for path in journals],
                runtime_journals=runtime_journals, results=results or None,
                warnings=warnings, cases=cases, turns=turns)


def pattern_report(directories):
    runs = []
    for directory in directories:
        if not directory.is_dir():
            raise ValueError(f'{directory}: run directory does not exist')
        # Accept individual runs as well as the parent of the run directories.
        if (directory / 'results.json').is_file() or model_journals(directory):
            runs.append(directory)
        else:
            children = sorted(path for path in directory.iterdir() if path.is_dir() and not path.name.startswith('.'))
            runs.extend(children or [directory])
    reports = [pattern_run(run) for run in dict.fromkeys(path.resolve() for path in runs)]
    summary = defaultdict(lambda: [0, 0])
    for run in reports:
        for key, count in Counter(
            (case['pattern'], case['variant'], case['trigger']['code'], case['trigger']['initiator'])
            for case in run['cases']
        ).items():
            summary[key][0] += count
            summary[key][1] += 1
    return dict(runs=reports, summary=[
        dict(pattern=group, variant=variant, code=code, initiator=initiator, cases=count, runs=run_count)
        for (group, variant, code, initiator), (count, run_count) in sorted(summary.items())
    ])


def pattern_markdown(report):
    lines = ['| Шаблон | Вариант | Код | Инициатор | Случаи | Прогоны |', '|---|---|---|---|---:|---:|']
    for row in report['summary']:
        lines.append('| ' + ' | '.join(cell(row[key]) for key in
                     ('pattern', 'variant', 'code', 'initiator', 'cases', 'runs')) + ' |')
    present = {row['pattern'] for row in report['summary']}
    lines.extend(f'| {key} | {name} | — | — | 0 | 0 |' for key, name in PATTERNS.items() if key not in present)
    lines += ['', '| Прогон | Сценарий | Ход | a | b | c | d | e | f | g |',
              '|---|---|---:|---:|---:|---:|---:|---:|---:|---:|']
    for run in report['runs']:
        for turn in run['turns']:
            values = [run['run'], turn['scenario'], turn['turn'], *turn['counts'].values()]
            lines.append('| ' + ' | '.join(map(cell, values)) + ' |')
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?', type=Path, help='run-check result directory')
    parser.add_argument('--cases', type=Path, help='case root; each stage uses its own case.json budget')
    parser.add_argument('--patterns', nargs='+', type=Path, metavar='RUN_OR_PARENT',
                        help='audit existing run directories or their parent')
    parser.add_argument('--pattern-output', type=Path, metavar='DIR',
                        help='with --patterns, write per-run JSON and summary.md to this directory')
    parser.add_argument('--json', action='store_true', help='emit JSON instead of Markdown')
    args = parser.parse_args()
    try:
        if args.patterns:
            if args.directory is not None or args.cases is not None:
                parser.error('--patterns cannot be combined with directory or --cases')
            report = pattern_report(args.patterns)
            if args.pattern_output:
                args.pattern_output.mkdir(parents=True, exist_ok=True)
                folder_names = set()
                for entry in report['runs']:
                    folder = args.pattern_output / entry['run']
                    suffix = 2
                    while folder.name in folder_names:
                        folder = args.pattern_output / f"{entry['run']}-{suffix}"
                        suffix += 1
                    folder_names.add(folder.name)
                    folder.mkdir(exist_ok=True)
                    (folder / 'patterns.json').write_text(
                        json.dumps(entry, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
                (args.pattern_output / 'summary.md').write_text(pattern_markdown(report) + '\n', encoding='utf-8')
            print(json.dumps(report, ensure_ascii=False, indent=2) if args.json else pattern_markdown(report))
            return 0
        if args.directory is None or args.pattern_output:
            parser.error('provide a result directory, or use --patterns')
        if not args.directory.is_dir():
            raise ValueError(f'{args.directory}: result directory does not exist')
        if args.cases is not None and not args.cases.is_dir():
            raise ValueError(f'{args.cases}: cases directory does not exist')
        journals = sorted(args.directory.glob('*/*/model.stdout'))
        if not journals:
            raise ValueError(f'{args.directory}: no scenario/stage/model.stdout journals')
        stages = [audit_stage(path, args.cases) for path in journals]
        exceeded = any(s['violations'] for s in stages)
        report = dict(verdict='ACTION_BUDGET_EXCEEDED' if exceeded else 'OK', stages=stages)
        print(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) if args.json else markdown(report))
        return int(exceeded)
    except (OSError, ValueError, TypeError) as error:
        print(f'bughunt-audit: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
