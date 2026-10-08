#!/usr/bin/env python3
"""Read-only graph/CSV check: <case_dir> <package.lgp> [result.csv].

Ported from loginom-eval-case; current files only. AGENT_REPO selects the
compatible harness providing compareCsv. Lifecycle/native proof stays with
check-node-artifacts.ts; this static check cannot replace it.
"""
import json
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

sys.dont_write_bytecode = True

XSI_TYPE = "{http://www.w3.org/2001/XMLSchema-instance}type"


def main(argv):
    case = Path(argv[1])
    task = json.loads((case / "task.json").read_text(encoding="utf-8"))
    acceptance = json.loads((case / "acceptance.json").read_text(encoding="utf-8"))
    package = Path(argv[2])
    results = [argv[3]] if len(argv) > 3 else []
    problems = validate_acceptance(acceptance)
    nodes, package_problems = check_package(acceptance, package)
    problems += package_problems
    oracle = case / "oracle.csv"
    if oracle.is_file():
        if len(results) != 1:
            problems.append(f"для oracle нужен ровно один файл *.result.csv, получено {len(results)}: {results}")
        else:
            problems += compare_result(oracle, Path(results[0]), task.get("oracle_tolerance", 0.01))
    report = {"case": case.name, "pass": not problems, "problems": problems, "nodes": nodes}
    text = json.dumps(report, ensure_ascii=False, indent=2)
    print(text)
    return 1 if problems else 0


def validate_acceptance(acceptance):
    known = {"required_type_fragments", "linked_nodes", "path", "inputs", "forbidden_literals"}
    problems = [
        "блок result в acceptance.json больше не используется: сверку задают oracle.csv и oracle_tolerance в task.json"
        if key == "result"
        else f"неизвестный ключ acceptance.json: {key}"
        for key in acceptance
        if key not in known
    ]
    fragments = list(acceptance.get("required_type_fragments", []))
    if acceptance.get("path"):
        fragments += [acceptance["path"].get("from"), acceptance["path"].get("to")]
    if acceptance.get("inputs"):
        fragments.append(acceptance["inputs"].get("type_fragment"))
        fragments += acceptance["inputs"].get("suffixes", [])
    fragments += acceptance.get("forbidden_literals", [])
    if any(not isinstance(value, str) or not value for value in fragments):
        problems.append("в acceptance.json есть пустой фрагмент, суффикс или литерал")
    return problems


def check_package(acceptance, package):
    if not package.is_file():
        return [], [f"нет пакета {package}"]
    with zipfile.ZipFile(package) as archive:
        units = sorted(name for name in archive.namelist() if re.fullmatch(r"Unit_\d+/Unit\.xml", name))
        texts = [archive.read(unit).decode("utf-8-sig") for unit in units]
    if not texts:
        return [], ["в пакете нет Unit_*/Unit.xml"]
    nodes, links = [], []
    for text in texts:
        workflow = ET.fromstring(text).find("WorkFlow")
        if workflow is None:
            continue
        nodes += [describe(item) for item in workflow.findall("Nodes/Item")]
        links += [
            (link.find("SourcePort").get("NodeGuid"), link.find("TargetPort").get("NodeGuid"))
            for link in workflow.findall("Links/Item")
        ]
    problems = [
        f"нет узла с типом, содержащим {fragment}"
        for fragment in acceptance.get("required_type_fragments", [])
        if not any(contains(node, fragment) for node in nodes)
    ]
    if acceptance.get("linked_nodes", True):
        linked = {guid for link in links for guid in link}
        problems += [f"узел без связей: {node['name']}" for node in nodes if node["guid"] not in linked]
    path = acceptance.get("path")
    if path and not reaches(nodes, links, path["from"], path["to"]):
        problems.append(f"нет пути по связям от {path['from']} к {path['to']}")
    inputs = acceptance.get("inputs")
    if inputs:
        names = [name for node in nodes if contains(node, inputs["type_fragment"]) for name in node["files"]]
        problems += [
            f"вход не читает файл с суффиксом {suffix}: {names}"
            for suffix in inputs.get("suffixes", [])
            if not any(name.endswith(suffix) for name in names)
        ]
    joined = "".join(texts)
    problems += [f"в пакете есть литерал {value}" for value in acceptance.get("forbidden_literals", []) if value in joined]
    return nodes, problems


def describe(item):
    types = sorted({element.get(XSI_TYPE) for element in item.iter() if element.get(XSI_TYPE)})
    return {
        "guid": item.get("Guid"),
        "name": item.get("DisplayName"),
        "types": [value for value in types if not value.endswith("Socket")],
        "files": [element.get("FileName") for element in item.iter() if element.get("FileName")],
    }


def contains(node, fragment):
    return any(fragment in value for value in node["types"])


def reaches(nodes, links, source_fragment, target_fragment):
    targets = {node["guid"] for node in nodes if contains(node, target_fragment)}
    frontier = [node["guid"] for node in nodes if contains(node, source_fragment)]
    seen = set(frontier)
    while frontier:
        current = frontier.pop()
        if current in targets:
            return True
        for source, target in links:
            if source == current and target not in seen:
                seen.add(target)
                frontier.append(target)
    return False


def compare_result(oracle, result, tolerance):
    if not result.is_file():
        return [f"нет файла результата {result}"]
    compared = subprocess.run(
        ["bun", str(Path(__file__).resolve().parent / "compare_csv.ts"), os.environ["AGENT_REPO"], str(oracle), str(result), str(tolerance)],
        capture_output=True,
        text=True,
    )
    if compared.returncode != 0:
        return [f"сверка с oracle.csv не выполнена: {compared.stderr.strip()[-500:]}"]
    verdict = json.loads(compared.stdout.strip().splitlines()[-1])
    return [] if verdict["passed"] else [verdict["error"]]


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        raise SystemExit("usage: check_reference.py <case_dir> <package.lgp> [result.csv]")
    try:
        if not os.environ.get("AGENT_REPO"):
            raise ValueError("AGENT_REPO required")
        sys.exit(main(sys.argv))
    except (OSError, ValueError, KeyError, ET.ParseError, zipfile.BadZipFile) as error:
        print(json.dumps({"pass": False, "error": str(error)}, ensure_ascii=False))
        sys.exit(2)
