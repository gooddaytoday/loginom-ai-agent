"""Measured node phase intervals, public calls and reported model usage."""
from collections import Counter, defaultdict
from datetime import datetime

TOKEN_KEYS = ('input_tokens', 'output_tokens', 'total_tokens', 'cache_read_tokens',
              'cache_write_tokens', 'reasoning_tokens')
USAGE_KEYS = ('provider', 'model', 'api_calls', 'completed', 'failed') + TOKEN_KEYS


def node_efficiency(evidence):
    usage = evidence.get('process', {}).get('usage', {})
    tokens = {key: value if type(value := usage.get(key)) is int and value >= 0 else None
              for key in TOKEN_KEYS}
    phases = defaultdict(lambda: {'starts': [], 'ends': []})
    for event in evidence.get('events', []):
        phase = event.get('phase')
        if phase not in ('node_phase_prepared', 'node_phase_completed'):
            continue
        receipt = event.get('receipt', {})
        key = (event.get('operation_id'), receipt.get('phase'), receipt.get('receipt_id'))
        phases[key]['starts' if phase == 'node_phase_prepared' else 'ends'].append(event)
    intervals, errors = [], []
    for (operation, phase, receipt), pair in phases.items():
        row = dict(operation_id=operation, phase=phase, receipt_id=receipt, duration_ms=None)
        try:
            if not all(isinstance(v, str) and v for v in (operation, phase, receipt)) or any(len(v) != 1 for v in pair.values()):
                raise ValueError('phase_pair')
            start, end = [datetime.fromisoformat(pair[k][0]['recorded_at'].replace('Z', '+00:00')) for k in ('starts', 'ends')]
            if start.utcoffset() is None or end.utcoffset() is None or end < start:
                raise ValueError('phase_clock')
            row['duration_ms'] = round((end-start).total_seconds()*1000, 3)
        except (ValueError, KeyError, TypeError, AttributeError):
            errors.append(dict(operation_id=operation, phase=phase, error='unmeasurable_phase_interval'))
        intervals.append(row)
    counts = Counter(call.get('tool', '<missing>') for call in evidence.get('calls', []))
    return dict(scope='reported_usage_and_journal_timing', usage_counts=tokens,
                usage_complete=all(tokens[k] is not None for k in ('input_tokens', 'output_tokens', 'total_tokens')),
                model_api_calls=usage.get('api_calls') if type(usage.get('api_calls')) is int and usage['api_calls'] >= 0 else None,
                public_calls=sum(counts.values()), public_calls_by_tool=dict(sorted(counts.items())),
                node_phase_intervals=intervals, phase_measurement_errors=errors,
                phases_complete=bool(intervals) and not errors,
                timing_note='Journal wall-clock intervals include local waits and transport; phases are not model latency.',
                counter_note='Provider-reported counters; cache and reasoning counters may overlap other token counts.')
