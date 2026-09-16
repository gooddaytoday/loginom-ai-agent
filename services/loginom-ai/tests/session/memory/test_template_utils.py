# Copyright (c) 2026 Beijing Volcano Engine Technology Co., Ltd.
# SPDX-License-Identifier: AGPL-3.0

from types import SimpleNamespace

from openviking.session.memory.utils.template_utils import TemplateUtils


class TestTemplateUtils:
    def test_render_supports_extract_context(self):
        extract_context = SimpleNamespace(get_year=lambda ranges: "2026")

        rendered = TemplateUtils.render(
            "  {{ title }} {{ extract_context.get_year(ranges) }}  ",
            {"title": "Trip", "ranges": "0-1"},
            extract_context=extract_context,
        )

        assert rendered == "Trip 2026"

    def test_find_missing_variables_ignores_extract_context(self):
        missing = TemplateUtils.find_missing_variables(
            "{{ missing_field }} {{ extract_context.get_year(ranges) }} {{ content }}",
            {"content": "Trip summary", "ranges": "0-1"},
        )

        assert missing == {"missing_field"}

    def test_render_plain_text_without_template_syntax(self):
        rendered = TemplateUtils.render("plain text", {"unused": "value"})

        assert rendered == "plain text"

    def test_dock_event_sources_refer_to_original_messages_after_chunking(self):
        from pathlib import Path

        import yaml

        from openviking.message import Message
        from openviking.message.part import TextPart
        from openviking.session.memory.memory_updater import ExtractContext

        root = Path(__file__).resolve().parents[3]
        template = yaml.safe_load(
            (root / 'deploy/loginom-dock/memory-templates/events.yaml').read_text()
        )
        messages = [
            Message(id='request-identity', role='user', parts=[TextPart('Import requested. ' * 30)]),
            Message(id='result-identity', role='assistant', parts=[TextPart('Import blocked. ' * 30)]),
        ]
        context = ExtractContext(messages)
        assert len(context.messages) > len(messages)
        rendered = TemplateUtils.render(
            template['content_template'],
            {'summary': 'Import was blocked.', 'ranges': f'0-{len(context.messages) - 1}'},
            context,
        )
        source_ids = rendered.split('# Source message IDs', 1)[1]
        assert '`request-identity` (user)' in source_ids
        assert '`result-identity` (assistant)' in source_ids
        assert '#chunk_' not in source_ids
        empty = TemplateUtils.render(template['content_template'], {'summary': '', 'ranges': ''}, context)
        assert 'request-identity' not in empty and 'result-identity' not in empty
