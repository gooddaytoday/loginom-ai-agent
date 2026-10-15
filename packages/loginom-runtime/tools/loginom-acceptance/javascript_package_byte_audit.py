"""Independent read-only audit of one already verified JavaScript writer/cold pair.

The persistence audit owns source, mappings and fresh execution. This auditor
adds exact saved-package bytes and never drives Loginom or executes JavaScript.
"""

import argparse
import hashlib
import io
import json
import os
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree


PACKAGE = re.compile(
    r"/jsteach/js-g2-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/"
    r"JavaScript-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.lgp\Z"
)
XSI_TYPE = "{http://www.w3.org/2001/XMLSchema-instance}type"


def require(condition, message):
    if not condition:
        raise ValueError("JavaScript package audit: " + message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, "duplicate JSON key")
        result[key] = value
    return result


def load_json(path):
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_pairs)


def complete(report):
    return report.get("status") == "OBSERVED" and report.get("headless") is False and all(
        report.get("cleanup", {}).get(key) is True
        for key in ("package_closed", "logged_out", "browser_closed")
    ) and not report.get("failure") and not report.get("cleanup", {}).get("failure")


def audit(persistence_audit_path, read_directory):
    audit_bytes = persistence_audit_path.read_bytes()
    base = json.loads(audit_bytes, object_pairs_hook=unique_pairs)
    require(base.get("status") == "VERIFIED" and base.get("full_source_verified") is True
            and base.get("settings_verified") is True and base.get("mappings_verified") is True
            and base.get("graph_verified") is True and base.get("cold_execution_verified") is True,
            "writer/cold persistence audit not verified")
    mode, path = base.get("schema_mode"), base.get("path")
    case_id = base.get("case_id", "persistence-" + str(mode))
    require(mode in ("code", "declared") and isinstance(path, str) and PACKAGE.fullmatch(path),
            "fixed schema mode and saved path required")
    require(case_id in ("persistence-code", "persistence-declared", "persistence-usage")
            and (case_id != "persistence-code") == (mode == "declared"),
            "fixed persistence case and schema mode required")
    files = base.get("files")
    require(isinstance(files, list) and len(files) == 4, "four pinned persistence files required")
    pinned = []
    for entry in files:
        location = Path(entry.get("path", ""))
        require(location.is_absolute() and re.fullmatch(r"[0-9a-f]{64}", entry.get("sha256", "")),
                "invalid persistence file pin")
        data = location.read_bytes()
        require(digest(data) == entry["sha256"], "persistence source file changed")
        pinned.append(data)
    writer, cold = [json.loads(data, object_pairs_hook=unique_pairs) for data in pinned[:2]]
    require(complete(writer) and complete(cold), "writer/cold cleanup not verified")
    dirty_verified = base.get("dirty_state_verified") is True
    if dirty_verified:
        saves = writer.get("persistence", {}).get("saves", [])
        writer_events = [json.loads(line, object_pairs_hook=unique_pairs)
                         for line in pinned[2].decode("utf-8").splitlines() if line]
        dirty_events = [(index, event) for index, event in enumerate(writer_events)
                        if event.get("phase") == "persistence_dirty_state_observed"]
        save_events = [(index, event) for index, event in enumerate(writer_events)
                       if event.get("phase") == "persistence_save_confirmed"]
        require(len(saves) == len(dirty_events) == len(save_events) == 2,
                "two post-save dirty-state observations required")
        for index, save in enumerate(saves):
            state = save.get("dirty_state", {})
            receipt = save.get("receipt", {})
            event_index, event = dirty_events[index]
            save_index, save_event = save_events[index]
            require(save.get("revision") == index + 1
                    and receipt.get("status") == "SUCCEEDED"
                    and receipt.get("output", {}).get("save_completed") is True
                    and state == event.get("dirty_state")
                    and state.get("modified") is False
                    and state.get("read_only") is True
                    and state.get("observation") == "after_confirmed_save"
                    and state.get("document_id") == save.get("document_id")
                    and state.get("workflow_id") == save.get("workflow_ref", {}).get("workflow_id")
                    and state.get("package_path") == save.get("path") == base.get("path")
                    and event.get("revision") == index + 1
                    and event.get("path") == base.get("path")
                    and event.get("save_operation_id") == receipt.get("operation_id")
                    and save_event.get("revision") == index + 1
                    and save_event.get("receipt") == receipt
                    and save_index < event_index
                    and (index == 1 or event_index < save_events[1][0]),
                    "post-save dirty-state receipt differs")
    final = writer["persistence"]["final"]["source"]
    source = final["source"]
    require(writer["persistence"]["schema_mode"] == mode
            and writer["persistence"].get("case_id", "persistence-" + mode) == case_id
            and writer["persistence"]["saves"][-1]["path"] == path
            and cold["cold"]["path"] == path
            and cold["cold"]["prepared"]["package_ref"]["path"] == path,
            "writer/cold saved package identity differs")
    require(cold["cold"]["source"]["source_text"] == source
            and digest(source.encode("utf-8")) == final["source_sha256"]
            == cold["cold"]["source"]["source_sha256"] == base.get("source_sha256"),
            "final source identity differs")

    report_path = read_directory / "report.json"
    journal_path = read_directory / "execution-events.jsonl"
    report_bytes, journal_bytes = report_path.read_bytes(), journal_path.read_bytes()
    report, events = json.loads(report_bytes, object_pairs_hook=unique_pairs), [
        json.loads(line, object_pairs_hook=unique_pairs)
        for line in journal_bytes.decode("utf-8").splitlines() if line
    ]
    require(complete(report) and report.get("explicit_execution_limit") == 0
            and report.get("scope") == "private G7 saved-package byte audit",
            "read-only headed observation incomplete")
    require([event.get("phase") for event in events]
            == ["package_file_workspace_prepared", "package_file_bytes_verified"],
            "read-only journal phases differ")
    prepared, receipt = events[0]["prepared"], report["package_file"]
    require(prepared.get("status") == "READY" and prepared.get("target_verified") is True
            and prepared["package_ref"]["path"] == path
            and prepared["package_ref"]["persisted"] is True
            and prepared["document_id"] == receipt.get("document_id")
            and events[1].get("receipt") == receipt,
            "read-only saved package receipt differs")
    require(receipt.get("kind") == "javascript_saved_package_bytes_v1"
            and receipt.get("path") == path
            and receipt.get("stream_released") is True and receipt.get("disposed") is True,
            "native file stream unconfirmed")
    pins = load_json(Path(__file__).parent / "collapse" / "native-gates" / "native-functions.json")
    require(pins.get("build") == "7.4.2"
            and {key: digest(value.encode("utf-8")) for key, value in pins["functions"].items()}
            == pins.get("sha256") == receipt.get("native_function_sha256"),
            "native file reader function pins differ")
    local = (read_directory / "package-bytes" / Path(path).name).resolve()
    require(Path(receipt.get("local_file", "")).resolve() == local
            and local.parent == (read_directory / "package-bytes").resolve(),
            "download file outside exact evidence directory")
    package = local.read_bytes()
    require(0 < len(package) <= 262144 and len(package) == receipt.get("bytes")
            and digest(package) == receipt.get("sha256"), "package bytes/receipt differ")

    with zipfile.ZipFile(io.BytesIO(package)) as archive:
        members = archive.infolist()
        names = [member.filename for member in members]
        require(len(names) == len(set(names)) and 0 < len(names) <= 64
                and all(not name.startswith("/") and ".." not in Path(name).parts for name in names)
                and all(member.file_size <= 1048576 for member in members)
                and sum(member.file_size for member in members) <= 4194304
                and archive.testzip() is None, "unsafe or corrupt package ZIP")
        info = ElementTree.fromstring(archive.read("PackageInfo.xml"))
        root = ElementTree.fromstring(archive.read("Unit_0/Unit.xml"))
    require(info.tag == "PackageInfo"
            and info.attrib.get("Name") == cold["cold"]["prepared"]["package_ref"]["name"],
            "package name differs")
    parents = {child: parent for parent in root.iter() for child in parent}
    engines = [node for node in root.iter("Engine")
               if node.attrib.get(XSI_TYPE) == "TBGJavaScriptEngine"]
    require(len(engines) == 1, "one JavaScript engine required")
    engine = engines[0]
    item = parents.get(parents.get(engine))
    require(item is not None and item.tag == "Item"
            and item.attrib.get("Guid") == writer["owned_node"]["id"]
            == cold["owned_node"]["id"], "JavaScript node GUID differs")
    require(engine.attrib.get("Code") == source, "ZIP decoded JavaScript source differs")
    columns = engine.find("ColumnDefs")
    require(columns is not None, "JavaScript column definitions absent")
    if mode == "code":
        require(engine.attrib.get("CodeConfigurableColumns") == "true"
                and not list(columns), "code-generated schema mode differs")
    else:
        actual = [(item.attrib.get("Name"), item.attrib.get("DataType")) for item in columns]
        require(engine.attrib.get("CodeConfigurableColumns") != "true"
                and actual == [("ObservedID", "dtInteger"), ("PhaseMarker", "dtString")],
                "declared schema differs")
        if case_id == "persistence-usage":
            require(list(columns)[0].attrib.get("DefaultUsageType") == "utPredicted",
                    "saved output usage differs")
    return {
        "version": 1, "status": "VERIFIED", "case_id": case_id, "schema_mode": mode,
        "package_path": path, "package_bytes": len(package), "package_sha256": digest(package),
        "source_sha256": digest(source.encode("utf-8")), "zip_members": len(names),
        "package_bytes_verified": True, "dirty_state_verified": dirty_verified,
        "public_handler_verified": False,
        "files": [{"path": str(location), "sha256": digest(data)}
                  for location, data in zip((persistence_audit_path, report_path, journal_path, local),
                                            (audit_bytes, report_bytes, journal_bytes, package))],
        "scope": "private saved-package bytes linked to verified writer/cold pair",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--persistence-audit", type=Path, required=True)
    parser.add_argument("--read", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    require(all(path.is_absolute() for path in
                (args.persistence_audit, args.read, args.output)), "absolute paths required")
    result = audit(args.persistence_audit, args.read)
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        json.dump(result, output, ensure_ascii=False, indent=2)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())
    print(json.dumps({"status": result["status"], "schema_mode": result["schema_mode"],
                      "output": str(args.output)}))
