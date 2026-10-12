"""Addressed CLI/pagination/relation doubles, not a native or deletion verdict."""
import contextlib
import datetime
import json
import subprocess
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import patch

import artifacts as a


CTX = {'workspace': str(uuid.UUID(int=1)), 'owner': str(uuid.UUID(int=2)), 'server': 'https://cli-source-double.invalid'}


def issue(number=3, **extra):
    return dict(id=str(uuid.UUID(int=number)), status='in_progress', description='checkpoint', **extra)


def page(rows, offset=0, total=None, more=False):
    return dict(issues=rows, offset=offset, total=len(rows) if total is None else total, limit=100, has_more=more)


class LegacyReferencesTest(unittest.TestCase):
    def test_cli_command_preserves_workspace_and_full_json(self):
        result = subprocess.CompletedProcess([], 0, '{"value": 0}', '')
        with patch.object(a.subprocess, 'run', return_value=result) as run:
            self.assertEqual(a.legacy_cli(CTX, 'issue', 'list'), {'value': 0})
        args, kwargs = run.call_args
        self.assertEqual(args[0], ['multica', 'issue', 'list', '--output', 'json'])
        self.assertEqual(kwargs['env']['MULTICA_WORKSPACE_ID'], CTX['workspace'])
        self.assertEqual(kwargs['env']['MULTICA_SERVER_URL'], CTX['server'])
        self.assertTrue(kwargs['check'])
        self.assertNotIn('timeout', kwargs)

    def test_nonzero_body_failure_preserves_original_process_cause(self):
        failure = subprocess.CalledProcessError(1, ['multica'], output='partial', stderr='TimeoutError')
        with patch.object(a.subprocess, 'run', side_effect=failure) as run:
            with self.assertRaises(a.DeliveryError) as caught:
                a.legacy_cli(CTX, 'issue', 'list')
        self.assertIs(caught.exception.__cause__, failure)
        self.assertEqual(failure.output, 'partial')
        self.assertEqual(run.call_count, 1)

    def test_launch_failure_preserves_original_cause(self):
        failure = FileNotFoundError('test-double')
        with patch.object(a.subprocess, 'run', side_effect=failure):
            with self.assertRaises(a.DeliveryError) as caught:
                a.legacy_cli(CTX, 'issue', 'list')
        self.assertIs(caught.exception.__cause__, failure)

    def test_cursor_warning_is_refusal_with_original_output(self):
        result = subprocess.CompletedProcess(['multica'], 0, '[]', 'Next reply cursor: test-double')
        with patch.object(a.subprocess, 'run', return_value=result):
            with self.assertRaises(a.DeliveryError) as caught:
                a.legacy_cli(CTX, 'issue', 'list')
        self.assertEqual(caught.exception.__cause__.stderr, result.stderr)
        self.assertEqual(caught.exception.__cause__.stdout, result.stdout)

    def test_partial_body_refuses_with_parser_cause(self):
        with patch.object(a.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '{', '')):
            with self.assertRaises(a.DeliveryError) as caught:
                a.legacy_cli(CTX, 'issue', 'list')
        self.assertIsInstance(caught.exception.__cause__, json.JSONDecodeError)

    def test_complete_single_page_and_empty_workspace(self):
        for rows in ([], [issue()]):
            with self.subTest(rows=len(rows)), patch.object(a, 'legacy_cli', return_value=page(rows)):
                self.assertEqual(a.legacy_issues(CTX), rows)

    def test_short_page_advances_by_actual_count_and_keeps_all_fields(self):
        rows = [issue(), issue(4), issue(5)]
        with patch.object(a, 'legacy_cli', side_effect=[page(rows[:1], total=3, more=True), page(rows[1:], offset=1, total=3)]) as cli:
            self.assertEqual(a.legacy_issues(CTX), rows)
        self.assertEqual(cli.call_args_list[1].args[-1], '1')

    def test_more_than_default_fifty_is_not_silently_truncated(self):
        rows = [issue(n) for n in range(3, 105)]
        with patch.object(a, 'legacy_cli', side_effect=[page(rows[:100], total=102, more=True), page(rows[100:], offset=100, total=102)]):
            self.assertEqual(len(a.legacy_issues(CTX)), 102)

    def test_incomplete_metadata_and_falsy_types_refuse(self):
        for field in ('issues', 'offset', 'total', 'limit', 'has_more'):
            p = page([issue()]); del p[field]
            with self.subTest(missing=field), patch.object(a, 'legacy_cli', return_value=p):
                with self.assertRaises(a.DeliveryError): a.legacy_issues(CTX)
        for field, value in [('offset', False), ('total', True), ('limit', 50), ('has_more', 0), ('issues', None), ('total', -1)]:
            p = page([issue()]); p[field] = value
            with self.subTest(field=field, value=value), patch.object(a, 'legacy_cli', return_value=p):
                with self.assertRaises(a.DeliveryError): a.legacy_issues(CTX)

    def test_early_end_no_progress_and_wrong_offset_refuse(self):
        for p in (page([issue()], total=2), page([], total=2, more=True), page([issue()], more=True), page([issue()], offset=1)):
            with self.subTest(page=p), patch.object(a, 'legacy_cli', return_value=p):
                with self.assertRaises(a.DeliveryError): a.legacy_issues(CTX)

    def test_changed_total_and_overlap_refuse(self):
        for second in (page([issue(4)], offset=1, total=3), page([issue()], offset=1, total=2)):
            with patch.object(a, 'legacy_cli', side_effect=[page([issue()], total=2, more=True), second]):
                with self.assertRaises(a.DeliveryError): a.legacy_issues(CTX)

    def test_invalid_issue_identity_status_and_description_refuse(self):
        for field, value in [('id', 'bad'), ('status', None), ('status', ''), ('description', 0), ('description', False)]:
            row = issue(); row[field] = value
            with self.subTest(field=field, value=value), patch.object(a, 'legacy_cli', return_value=page([row])):
                with self.assertRaises(a.DeliveryError): a.legacy_issues(CTX)
        row = issue(); del row['description']
        with patch.object(a, 'legacy_cli', return_value=page([row])):
            with self.assertRaises(a.DeliveryError): a.legacy_issues(CTX)

    def relations(self):
        comment = dict(id=str(uuid.UUID(int=30)), issue_id=issue()['id'], content='recent-reference', created_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
        run = dict(id=str(uuid.UUID(int=40)), issue_id=issue()['id'], status='running', trigger_comment_id=comment['id'])
        return [comment], [run]

    def test_full_relation_commands_and_identity(self):
        comments, runs = self.relations()
        with patch.object(a, 'legacy_cli', side_effect=[comments, runs]) as cli:
            self.assertEqual(a.legacy_relations(CTX, issue()), (comments, runs))
        self.assertEqual(cli.call_args_list[0].args[1:], ('issue', 'comment', 'list', issue()['id'], '--full'))
        self.assertEqual(cli.call_args_list[1].args[1:], ('issue', 'runs', issue()['id']))

    def test_relation_foreign_duplicate_folded_and_partial_refuse(self):
        for field, value in [('issue_id', issue(6)['id']), ('id', 'bad'), ('content_truncated', True), ('folded_reply_count', 2), ('content', None), ('created_at', '2026-10-12')]:
            comments, runs = self.relations(); comments[0][field] = value
            with self.subTest(field=field), patch.object(a, 'legacy_cli', side_effect=[comments, runs]):
                with self.assertRaises(a.DeliveryError): a.legacy_relations(CTX, issue())
        comments, runs = self.relations()
        with patch.object(a, 'legacy_cli', side_effect=[comments * 2, runs]):
            with self.assertRaises(a.DeliveryError): a.legacy_relations(CTX, issue())

    def test_missing_or_wrong_relation_shape_and_run_references_refuse(self):
        for comments, runs in [({}, []), ([], {}), ([], [dict(id=str(uuid.UUID(int=40)))]), ([], [dict(id=str(uuid.UUID(int=40)), status='running', delivered_comment_ids='not-list')])]:
            with patch.object(a, 'legacy_cli', side_effect=[comments, runs]):
                with self.assertRaises(a.DeliveryError): a.legacy_relations(CTX, issue())
        for fields in ({'trigger_comment_id': 0}, {'trigger_comment_id': 'bad'}, {'planned_comment_ids': ['bad']}, {'delivered_comment_ids': [False]}):
            comments, runs = self.relations(); runs[0].update(fields)
            with self.subTest(fields=fields), patch.object(a, 'legacy_cli', side_effect=[comments, runs]):
                with self.assertRaises(a.DeliveryError): a.legacy_relations(CTX, issue())

    def test_relation_failure_does_not_return_checkpoint_only_partial_set(self):
        failure = a.DeliveryError('read-double failed')
        with patch.object(a, 'legacy_issues', return_value=[issue()]), patch.object(a, 'legacy_relations', side_effect=failure):
            with self.assertRaises(a.DeliveryError) as caught: a.legacy_references(CTX)
        self.assertIs(caught.exception, failure)

    def test_complete_reference_policy_keeps_active_old_and_recent_comments(self):
        comments, runs = self.relations()
        old = dict(comments[0], id=str(uuid.UUID(int=31)), created_at='2020-01-01T00:00:00+00:00', content='old-active')
        inactive = dict(old, id=str(uuid.UUID(int=32)), content='old-inactive')
        runs[0]['planned_comment_ids'] = [old['id']]
        terminal = dict(issue(6), status='done')
        with patch.object(a, 'legacy_issues', return_value=[issue(), terminal]), patch.object(a, 'legacy_relations', return_value=(comments + [old, inactive], runs)) as read:
            text = a.legacy_references(CTX)
        self.assertEqual(read.call_count, 1)
        self.assertEqual(text, 'checkpoint\nrecent-reference\nold-active')

    def test_cleanup_refuses_before_second_catalog_lock_inspection_or_apply(self):
        @contextlib.contextmanager
        def catalog(ctx):
            yield {'records': {'test-double': dict(legacy_released_at=1, state='retired')}}, None
        with patch.object(a, 'catalog', side_effect=catalog) as cat, patch.object(a.shutil, 'disk_usage', return_value=SimpleNamespace(free=1)), patch.object(a, 'legacy_references', side_effect=a.DeliveryError('partial-double')), patch.object(a, 'lock') as lock, patch.object(a, 'safety') as safety, patch.object(a.shutil, 'rmtree') as delete:
            ctx = dict(CTX, root=a.Path.home())
            with self.assertRaises(a.DeliveryError): a.cleanup(ctx, SimpleNamespace(apply=True))
        self.assertEqual(cat.call_count, 1)
        lock.assert_not_called(); safety.assert_not_called(); delete.assert_not_called()


if __name__ == '__main__':
    unittest.main()
