"""Portable ZIP/report fixtures for the independent JavaScript package auditor."""

import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from xml.etree import ElementTree

from javascript_package_byte_audit import audit, XSI_TYPE


def sha(data):
    return hashlib.sha256(data).hexdigest()


class SavedPackageAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = "/jsteach/js-g2-12345678-1234-1234-1234-123456789abc/JavaScript-12345678-1234-1234-1234-123456789abc.lgp"
        self.source = 'const text = "Сумма & <😀>";\n'
        self.node = "node-1"
        self.name = "Saved_JS"
        self.mode = "code"
        self.writer = self.root / "writer"
        self.cold = self.root / "cold"
        self.read = self.root / "read"
        for directory in (self.writer, self.cold, self.read / "package-bytes"):
            directory.mkdir(parents=True)
        self.package = self.read / "package-bytes" / Path(self.path).name
        self.audit_path = self.root / "persistence-audit.json"
        self.write_fixture()

    def write_json(self, path, value):
        path.write_text(json.dumps(value, ensure_ascii=False) + "\n", encoding="utf-8")

    def write_package(self, *, source=None, mode=None, guid=None, name=None):
        root = ElementTree.Element("Unit")
        item = ElementTree.SubElement(ElementTree.SubElement(ElementTree.SubElement(root, "WorkFlow"), "Nodes"), "Item", Guid=guid or self.node)
        engine = ElementTree.SubElement(ElementTree.SubElement(item, "Component"), "Engine", {XSI_TYPE: "TBGJavaScriptEngine", "Code": self.source if source is None else source})
        actual = self.mode if mode is None else mode
        if actual == "code":
            engine.attrib["CodeConfigurableColumns"] = "true"
        columns = ElementTree.SubElement(engine, "ColumnDefs")
        if actual == "declared":
            ElementTree.SubElement(columns, "Item", Name="ObservedID", DataType="dtInteger")
            ElementTree.SubElement(columns, "Item", Name="PhaseMarker", DataType="dtString")
        with zipfile.ZipFile(self.package, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("PackageInfo.xml", ElementTree.tostring(ElementTree.Element("PackageInfo", Name=name or self.name)))
            archive.writestr("Unit_0/Unit.xml", ElementTree.tostring(root))
            archive.writestr("Unit_0/Unit.bin", b"package data")

    def write_fixture(self):
        self.write_package()
        complete = {"status": "OBSERVED", "headless": False,
                    "cleanup": {"package_closed": True, "logged_out": True, "browser_closed": True}}
        writer = {**complete, "owned_node": {"id": self.node}, "persistence": {
            "schema_mode": self.mode, "saves": [{"path": self.path}],
            "final": {"source": {"source": self.source, "source_sha256": sha(self.source.encode())}}}}
        cold = {**complete, "owned_node": {"id": self.node}, "cold": {
            "path": self.path, "prepared": {"package_ref": {"path": self.path, "name": self.name}},
            "source": {"source_text": self.source, "source_sha256": sha(self.source.encode())}}}
        writer_path, cold_path = self.writer / "report.json", self.cold / "report.json"
        self.write_json(writer_path, writer)
        self.write_json(cold_path, cold)
        for directory in (self.writer, self.cold):
            (directory / "execution-events.jsonl").write_text("{}\n", encoding="utf-8")
        files = [writer_path, cold_path, self.writer / "execution-events.jsonl", self.cold / "execution-events.jsonl"]
        self.write_json(self.audit_path, {
            "status": "VERIFIED", "schema_mode": self.mode, "path": self.path,
            "full_source_verified": True, "settings_verified": True, "mappings_verified": True,
            "graph_verified": True, "cold_execution_verified": True,
            "source_sha256": sha(self.source.encode()),
            "files": [{"path": str(path), "sha256": sha(path.read_bytes())} for path in files]})
        self.refresh_read_receipt()

    def refresh_read_receipt(self):
        data = self.package.read_bytes()
        pins = json.loads((Path(__file__).parent / "collapse" / "native-gates" / "native-functions.json").read_text())
        receipt = {"kind": "javascript_saved_package_bytes_v1", "document_id": "read-doc",
                   "path": self.path, "bytes": len(data), "sha256": sha(data),
                   "local_file": str(self.package), "stream_released": True, "disposed": True,
                   "native_function_sha256": pins["sha256"]}
        self.write_json(self.read / "report.json", {
            "status": "OBSERVED", "headless": False,
            "scope": "private G7 saved-package byte audit", "explicit_execution_limit": 0,
            "cleanup": {"package_closed": True, "logged_out": True, "browser_closed": True},
            "package_file": receipt})
        with (self.read / "execution-events.jsonl").open("w", encoding="utf-8") as journal:
            journal.write(json.dumps({"phase": "package_file_workspace_prepared", "prepared": {
                "status": "READY", "target_verified": True, "document_id": "read-doc",
                "package_ref": {"path": self.path, "persisted": True}}}) + "\n")
            journal.write(json.dumps({"phase": "package_file_bytes_verified", "receipt": receipt}) + "\n")

    def test_code_and_declared_modes_and_once_only_cli(self):
        for mode in ("code", "declared"):
            with self.subTest(mode=mode):
                self.mode = mode
                self.write_fixture()
                result = audit(self.audit_path, self.read)
                self.assertTrue(result["package_bytes_verified"])
                self.assertFalse(result["dirty_state_verified"])
                self.assertEqual(result["source_sha256"], sha(self.source.encode()))
        output = self.root / "audit.json"
        args = [sys.executable, str(Path(__file__).with_name("javascript_package_byte_audit.py")),
                "--persistence-audit", str(self.audit_path), "--read", str(self.read),
                "--output", str(output)]
        first = subprocess.run(args, capture_output=True, text=True, check=False)
        self.assertEqual(first.returncode, 0, first.stderr)
        saved = output.read_bytes()
        second = subprocess.run(args, capture_output=True, text=True, check=False)
        self.assertNotEqual(second.returncode, 0)
        self.assertEqual(output.read_bytes(), saved)

    def test_rejects_source_schema_owner_and_stream_tampering(self):
        for change in ("source", "schema", "owner", "stream", "pin"):
            with self.subTest(change=change):
                self.mode = "code"
                self.write_fixture()
                if change == "source":
                    self.write_package(source=self.source + " ")
                if change == "schema":
                    self.write_package(mode="declared")
                if change == "owner":
                    self.write_package(guid="foreign")
                if change == "stream":
                    report = json.loads((self.read / "report.json").read_text())
                    report["package_file"]["stream_released"] = False
                    self.write_json(self.read / "report.json", report)
                if change == "pin":
                    report = json.loads((self.read / "report.json").read_text())
                    report["package_file"]["native_function_sha256"]["OpenFile"] = "0" * 64
                    self.write_json(self.read / "report.json", report)
                if change not in ("stream", "pin"):
                    self.refresh_read_receipt()
                if change in ("stream", "pin"):
                    events = [json.loads(line) for line in (self.read / "execution-events.jsonl").read_text().splitlines()]
                    events[1]["receipt"] = json.loads((self.read / "report.json").read_text())["package_file"]
                    (self.read / "execution-events.jsonl").write_text("\n".join(json.dumps(event) for event in events) + "\n")
                with self.assertRaises(ValueError):
                    audit(self.audit_path, self.read)

    def test_refuses_changed_persistence_pin_and_corrupt_zip(self):
        (self.writer / "report.json").write_text("{}\n", encoding="utf-8")
        with self.assertRaisesRegex(ValueError, "persistence source file changed"):
            audit(self.audit_path, self.read)
        self.write_fixture()
        self.package.write_bytes(self.package.read_bytes()[:-20])
        self.refresh_read_receipt()
        with self.assertRaises((ValueError, zipfile.BadZipFile)):
            audit(self.audit_path, self.read)


if __name__ == "__main__":
    unittest.main()
