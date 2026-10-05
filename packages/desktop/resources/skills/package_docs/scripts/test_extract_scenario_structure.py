#!/usr/bin/env python3
"""Проверки разбора и каркаса отчёта package_docs без сети.

Запуск: python3 packages/desktop/resources/skills/package_docs/scripts/test_extract_scenario_structure.py
"""

from __future__ import annotations

import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from emit_report import emit, markdown_to_html, report_destination, resolve_format
from extract_scenario_structure import extract_package
from render_report_skeleton import render


def _write_minimal_lgp(path: Path) -> None:
    package_info = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<PackageInfo Guid="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" '
        'Name="demo" ApplicationVersion="7.4.0" />'
    )
    package_index = """<?xml version="1.0" encoding="UTF-8"?>
<PackageIndex>
  <Units>
    <Item BasePath="\\Unit_0">
      <Info XMLFile="\\Unit_0\\Info.xml" />
      <Unit XMLFile="\\Unit_0\\Unit.xml" />
    </Item>
  </Units>
</PackageIndex>
"""
    unit_info = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Info Guid="11111111-1111-1111-1111-111111111111" Name="Unit1" DisplayName="Демо" />'
    )
    unit_xml = """<?xml version="1.0" encoding="UTF-8"?>
<Unit xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <WorkFlow>
    <Nodes>
      <Item Guid="aaaaaaaa-0000-0000-0000-000000000001" DisplayName="Источник" VendorGuid="35a6e054-ee0c-42f6-bda6-af10b57a36aa">
        <InputPorts />
        <OutputPorts>
          <Item Guid="58f7e6c3-511e-39d7-8853-036e0a1a7612" Name="DataSet" DisplayName="DataSet" />
        </OutputPorts>
        <Component>
          <Engine xsi:type="TBGImportNative" FileName="data.lgd" />
        </Component>
      </Item>
      <Item Guid="aaaaaaaa-0000-0000-0000-000000000002" DisplayName="Калькулятор" VendorGuid="c7b69712-557f-4e51-bba5-db9cc2659e7a">
        <InputPorts>
          <Item Guid="9dc72a3f-56bf-3bfc-84ec-f979daf4da6b" Name="DataSource" DisplayName="DataSource" />
        </InputPorts>
        <OutputPorts>
          <Item Guid="58f7e6c3-511e-39d7-8853-036e0a1a7612" Name="DataSet" DisplayName="DataSet" />
        </OutputPorts>
        <Component>
          <Engine xsi:type="TBGCalcData" />
        </Component>
      </Item>
    </Nodes>
    <Links>
      <Item>
        <SourcePort NodeGuid="aaaaaaaa-0000-0000-0000-000000000001" PortGuid="58f7e6c3-511e-39d7-8853-036e0a1a7612" />
        <TargetPort NodeGuid="aaaaaaaa-0000-0000-0000-000000000002" PortGuid="9dc72a3f-56bf-3bfc-84ec-f979daf4da6b" />
      </Item>
    </Links>
    <Annotations />
  </WorkFlow>
</Unit>
"""
    refs = '<?xml version="1.0" encoding="UTF-8"?><References />'
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("PackageInfo.xml", package_info)
        zf.writestr("PackageIndex.xml", package_index)
        zf.writestr("References.xml", refs)
        zf.writestr("Unit_0/Info.xml", unit_info)
        zf.writestr("Unit_0/Unit.xml", unit_xml)


class ExtractTests(unittest.TestCase):
    def test_minimal_synthetic_package(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            lgp = Path(tmp) / "demo.lgp"
            _write_minimal_lgp(lgp)
            data = extract_package(lgp)
            self.assertEqual(data["package"]["name"], "demo")
            self.assertEqual(data["package"]["application_version"], "7.4.0")
            self.assertEqual(data["stats"]["modules"], 1)
            self.assertEqual(data["stats"]["nodes"], 2)
            mod = data["modules"][0]
            self.assertEqual(mod["display_name"], "Демо")
            self.assertEqual(len(mod["workflow_nodes"]), 2)
            self.assertTrue(any(h.get("Source") and h.get("Target") for h in mod["hierarchy"]))
            self.assertIn("TBGImportNative", data["unique_engine_types"])
            self.assertIn("TBGCalcData", data["unique_engine_types"])
            src = next(n for n in mod["workflow_nodes"] if n["label"] == "Источник")
            self.assertEqual(src["settings_main"].get("FileName"), "data.lgd")

    def test_render_skeleton_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            lgp = Path(tmp) / "demo.lgp"
            _write_minimal_lgp(lgp)
            data = extract_package(lgp)
            md = render(data)
            self.assertIn("Версия сервиса «ИИ Отчет»", md)
            self.assertNotIn("Используемая модель:", md)
            self.assertIn("Отчет о пакете «demo.lgp»", md)
            self.assertIn("PLACEHOLDER_PACKAGE_DESCRIPTION", md)
            self.assertIn("## Модуль 1. «Демо»", md)
            self.assertIn("PLACEHOLDER_MODULE_1_DESCRIPTION", md)
            self.assertIn("Количество модулей", md)
            self.assertNotIn("Источники:", md)


class EmitTests(unittest.TestCase):
    def test_missing_or_unknown_format_is_pdf(self) -> None:
        self.assertEqual(resolve_format(None), "pdf")
        self.assertEqual(resolve_format(""), "pdf")
        self.assertEqual(resolve_format("  "), "pdf")
        self.assertEqual(resolve_format(".PDF"), "pdf")
        self.assertEqual(resolve_format("docx"), "docx")
        self.assertEqual(resolve_format("Word"), "docx")
        self.assertEqual(resolve_format(".md"), "md")
        self.assertEqual(resolve_format("markdown"), "md")
        self.assertEqual(resolve_format("xlsx"), "pdf")
        self.assertEqual(resolve_format("doc"), "pdf")
        self.assertEqual(resolve_format("txt"), "pdf")

    def test_destination_uses_package_stem(self) -> None:
        self.assertEqual(
            report_destination(Path("/data/demo.lgp"), "pdf"),
            Path("/data/demo.lgp_report.pdf"),
        )

    def test_markdown_keeps_russian_structure(self) -> None:
        html = markdown_to_html("# Отчет\n\n* **Модулей**: `1`\n\n> Описание\n")
        self.assertIn("<h1>Отчет</h1>", html)
        self.assertIn("<strong>Модулей</strong>", html)
        self.assertIn("<code>1</code>", html)
        self.assertIn("<blockquote><p>Описание</p></blockquote>", html)
        self.assertNotIn("<script>", html)

    def test_emit_md_copies_narrative(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lgp = root / "demo.lgp"
            lgp.write_bytes(b"lgp")
            destination = emit("# Отчет\n", lgp, "md")
            self.assertEqual(destination, root / "demo.lgp_report.md")
            self.assertEqual(destination.read_text(encoding="utf-8"), "# Отчет\n")

    def test_emit_pdf_and_docx(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            lgp = root / "demo.lgp"
            lgp.write_bytes(b"lgp")
            narrative = "# Отчет о пакете «demo.lgp»\n\n> Краткое **описание**.\n\n* Пункт\n"
            pdf = emit(narrative, lgp, "xlsx")
            docx = emit(narrative, lgp, "docx")
            pdf_bytes = pdf.read_bytes()
            self.assertEqual(pdf.name, "demo.lgp_report.pdf")
            self.assertTrue(pdf_bytes.startswith(b"%PDF"))
            for char in "ОтчетописаниеПункт":
                self.assertIn(char.encode("utf-16-be").hex().upper().encode(), pdf_bytes)
            self.assertEqual(docx.suffix, ".docx")
            xml = zipfile.ZipFile(docx).read("word/document.xml").decode("utf-8")
            self.assertIn("Отчет", xml)
            self.assertIn("описание", xml)
            self.assertIn("<w:b/>", xml)
            self.assertIn("Пункт", xml)


if __name__ == "__main__":
    unittest.main()
