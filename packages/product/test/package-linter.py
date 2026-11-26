"""Regression checks for the bundled package-linter (Python 3.9–3.11 and lxml)."""

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from xml.etree import ElementTree
from zipfile import ZipFile

product = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(product / "skills/package-linter/scripts"))

import package_linter
import scoring


class PackageLinterTest(unittest.TestCase):
    def test_module_order_and_ownership_of_evidence(self):
        with TemporaryDirectory() as directory:
            source = Path(directory).resolve() / "modules.lgp"
            with ZipFile(source, "w") as archive:
                archive.writestr("PackageIndex.xml", '''
                    <PackageIndex><Units>
                        <Item BasePath="Sales#2026/Unit_2"/>
                        <Item BasePath="Sales#2026/Unit_10"/>
                    </Units></PackageIndex>''')
                for folder in ("Sales#2026/Unit_2", "Sales#2026/Unit_10"):
                    archive.writestr(folder + "/Unit.xml", "<Unit><WorkFlow/></Unit>")

            evidence = package_linter.inspect(source)
            first, second = (module["id"] for module in evidence["modules"])
            self.assertEqual(first, "Sales#2026/Unit_2/Unit.xml#/Unit")
            self.assertEqual(second, "Sales#2026/Unit_10/Unit.xml#/Unit")
            assessment = self.assessment(evidence)
            output = package_linter.report(source, assessment)
            content = output.read_text(encoding="utf-8")
            self.assertIn("## Заключение\n\nКраткое заключение.\n", content)
            with self.assertRaisesRegex(ValueError, "Output already exists"):
                package_linter.report(source, assessment)
            self.assertEqual(output.read_text(encoding="utf-8"), content)

            assessment["modules"][0]["criteria"][0]["evidence"] = [second]
            with self.assertRaisesRegex(ValueError, "own-module evidence"):
                package_linter.check_assessment(assessment, evidence)

    def test_native_views_and_references(self):
        with TemporaryDirectory() as directory:
            source = Path(directory).resolve() / "views.lgp"
            with ZipFile(source, "w") as archive:
                archive.writestr("Unit_0/Unit.xml", '''
                    <Unit><WorkFlow/><ModelViews><Nodes>
                        <Item Guid="00000000-0000-0000-0000-000000000001" DisplayName="Preview"/>
                    </Nodes></ModelViews></Unit>''')
                archive.writestr("References.xml", '''
                    <References><Item Guid="00000000-0000-0000-0000-000000000002" HintPath="other.lgp">
                        <Name Guid="00000000-0000-0000-0000-000000000003" Name="Other"/>
                    </Item></References>''')

            evidence = package_linter.inspect(source)
            self.assertEqual(evidence["calculated"]["package"]["structure"]["metrics"]["total"], 0)
            view, = evidence["view_nodes"]
            self.assertEqual(view["label"], "Preview")
            self.assertIn(view["locator"], evidence["locators"])
            reference, = evidence["declared_references"]
            self.assertEqual(reference["package_guid"], "00000000-0000-0000-0000-000000000003")

    def test_missing_output_port_does_not_confirm_topology(self):
        fixture = product.parent / "loginom-host/test/fixtures/package-docs/demo.lgp"
        member = "Unit_0/Unit.xml"
        baseline = package_linter.inspect(fixture)
        self.assertEqual(baseline["links"][0]["status"], "resolved")

        with TemporaryDirectory() as directory:
            source = Path(directory).resolve() / "missing-port.lgp"
            with ZipFile(fixture) as original, ZipFile(source, "w") as archive:
                root = ElementTree.fromstring(original.read(member))
                root.find("WorkFlow/Links/Item/SourcePort").set("PortGuid", "00000000-0000-0000-0000-000000000001")
                archive.writestr(member, ElementTree.tostring(root))

            evidence = package_linter.inspect(source)
            link, = evidence["links"]
            self.assertEqual(link["status"], "unresolved_or_ambiguous")
            self.assertEqual([node["topology"] for node in evidence["nodes"]], ["unknown", "unknown"])
            self.assertEqual([len(group["members"]) for group in evidence["groups"]], [1, 1])

    @staticmethod
    def assessment(evidence):
        def criteria(locator):
            return [
                dict(id=key, status="unavailable", rationale="Нет наблюдений.", evidence=[locator],
                     decisions=[
                         dict(id=decision, value={"adequacy": True, "substance": False}.get(decision),
                              rationale="Нет наблюдений.", evidence=[locator])
                         for decision in scoring.DECISIONS[key]
                     ])
                for key in scoring.DECISIONS
            ]

        locator = evidence["modules"][0]["id"]
        return dict(
            format_version=3, source_sha256=evidence["source"]["sha256"], summary="    Краткое заключение.",
            structure=[dict(text="Два модуля.", evidence=[locator])], strengths=[], findings=[], recommendations=[],
            criteria=criteria(locator), modules=[
                dict(id=module["id"], summary="Пустой модуль.", criteria=criteria(module["id"]), recommendations=[])
                for module in evidence["modules"]
            ],
        )


if __name__ == "__main__":
    unittest.main()
