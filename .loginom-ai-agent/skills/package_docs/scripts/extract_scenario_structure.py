#!/usr/bin/env python3
"""Извлечь структуру модулей пакета Loginom (.lgp) для «ИИ Отчета».

Читает только ZIP/XML, без BGB. JSON потребляет render_report_skeleton.py
и текст отчёта на русском в структуре эталона tools.loginom.ru.
"""

from __future__ import annotations

import argparse
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

XSI_TYPE = "{http://www.w3.org/2001/XMLSchema-instance}type"
SUBMODEL_ENGINE = "TBGModelGenericComponentEngine"
MAX_SUBMODEL_DEPTH = 2

# Известные GUID портов Loginom и их отображаемые имена.
PORT_GUID_NAMES: dict[str, str] = {
    "58f7e6c3-511e-39d7-8853-036e0a1a7612": "DataSet",
    "9dc72a3f-56bf-3bfc-84ec-f979daf4da6b": "DataSource",
    "4ba0e2c2-69ad-3a32-bbdc-75714efe7a51": "DataSource",
    "00bd0b43-e4b5-3ac1-b95a-ac1bee14f858": "SynchronizationInputPort",
    "ca080ff0-2342-32b0-b480-586f9747bace": "SynchronizationOutputPort",
    "d252e390-f72d-36c4-97fc-60d86186c3c6": "Variables",
    "b671426b-642b-3e7c-b9a9-9653573f3199": "Variables",
    "455b65c3-0587-3a9c-b47e-9b0d285bff3c": "ControlVariables",
    "78ce58f4-e818-3754-bc2e-6af868677420": "Connection",
}


def local_name(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def strip_namespaces(root: ET.Element) -> ET.Element:
    for el in root.iter():
        el.tag = local_name(el.tag)
        rewritten: dict[str, str] = {}
        for key, value in list(el.attrib.items()):
            if key == XSI_TYPE or key.endswith("}type"):
                rewritten["type"] = value
            elif "}" in key:
                rewritten[local_name(key)] = value
            else:
                rewritten[key] = value
        el.attrib.clear()
        el.attrib.update(rewritten)
    return root


def parse_xml_bytes(raw: bytes) -> ET.Element:
    text = raw.decode("utf-8-sig")
    return strip_namespaces(ET.fromstring(text))


def child_items(parent: ET.Element | None, section: str) -> list[ET.Element]:
    if parent is None:
        return []
    found = parent.find(section)
    if found is None:
        return []
    return [c for c in list(found) if local_name(c.tag) == "Item"]


def ports(node: ET.Element, section: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for item in child_items(node, section):
        guid = item.attrib.get("Guid", "")
        name = item.attrib.get("Name", "") or PORT_GUID_NAMES.get(guid.lower(), "")
        out.append(
            {
                "guid": guid,
                "name": name,
                "display_name": item.attrib.get("DisplayName", "") or name,
            }
        )
    return out


def engine_type(node: ET.Element) -> str:
    component = node.find("Component")
    if component is None:
        return ""
    engine = component.find("Engine")
    if engine is not None:
        return engine.attrib.get("type", "") or ""
    return component.attrib.get("type", "") or ""


def engine_attrs(node: ET.Element) -> dict[str, str]:
    component = node.find("Component")
    if component is None:
        return {}
    engine = component.find("Engine")
    target = engine if engine is not None else component
    skip = {"type", "Guid"}
    return {
        key: value
        for key, value in target.attrib.items()
        if key not in skip and value and len(value) < 500
    }


def node_label(node: ET.Element) -> str:
    return (
        node.attrib.get("DisplayName")
        or node.attrib.get("Name")
        or engine_type(node)
        or node.attrib.get("Guid", "")[:8]
    )


def service_name(node: ET.Element) -> str:
    et = engine_type(node)
    if et == SUBMODEL_ENGINE:
        return "Подмодель"
    if et.startswith("TBG"):
        return et[3:]
    return et or node.attrib.get("Name", "") or "Узел"


def hierarchy_token(node: ET.Element) -> str:
    # tools-loginom style: 'label':'service':'guid'
    return f"{node_label(node)}:{service_name(node)}:{node.attrib.get('Guid', '')}"


def extract_notes(workflow: ET.Element | None) -> list[str]:
    if workflow is None:
        return []
    notes: list[str] = []
    annotations = workflow.find("Annotations")
    if annotations is None:
        return notes
    for item in list(annotations):
        texts: list[str] = []
        for el in item.iter():
            if local_name(el.tag) in {"Text", "Caption", "Comment", "Description"}:
                if el.text and el.text.strip():
                    texts.append(el.text.strip())
            for key in ("Text", "Caption", "Comment", "Description"):
                val = el.attrib.get(key, "")
                if val.strip():
                    texts.append(val.strip())
        # Some packages store note body as element text on Item
        if item.text and item.text.strip():
            texts.append(item.text.strip())
        blob = " ".join(dict.fromkeys(texts)).strip()
        if blob:
            notes.append(blob)
    return notes


def parse_link(item: ET.Element) -> dict[str, Any] | None:
    src = item.find("SourcePort")
    tgt = item.find("TargetPort")
    if src is None and tgt is None:
        return None
    return {
        "source_node_guid": src.attrib.get("NodeGuid", "") if src is not None else "",
        "source_port_guid": src.attrib.get("PortGuid", "") if src is not None else "",
        "target_node_guid": tgt.attrib.get("NodeGuid", "") if tgt is not None else "",
        "target_port_guid": tgt.attrib.get("PortGuid", "") if tgt is not None else "",
    }


def resolve_port_name(node_map: dict[str, dict[str, Any]], node_guid: str, port_guid: str) -> str:
    if not port_guid:
        return ""
    known = PORT_GUID_NAMES.get(port_guid.lower(), "")
    node = node_map.get(node_guid)
    if node is None:
        return known
    for section in ("input_ports", "output_ports", "service_input_ports", "service_output_ports"):
        for port in node.get(section, []):
            if port.get("guid", "").lower() == port_guid.lower():
                return port.get("display_name") or port.get("name") or known
    return known


def walk_workflow(
    workflow: ET.Element | None,
    *,
    depth: int,
    max_depth: int,
    path_prefix: str,
) -> dict[str, Any]:
    nodes_out: list[dict[str, Any]] = []
    links_out: list[dict[str, Any]] = []
    hierarchy: list[dict[str, str | None]] = []
    submodels: list[dict[str, Any]] = []
    notes = extract_notes(workflow)

    if workflow is None:
        return {
            "workflow_nodes": nodes_out,
            "links": links_out,
            "hierarchy": hierarchy,
            "notes": notes,
            "submodels": submodels,
        }

    raw_nodes = child_items(workflow, "Nodes")
    node_map: dict[str, dict[str, Any]] = {}
    for node in raw_nodes:
        guid = node.attrib.get("Guid", "")
        et = engine_type(node)
        entry = {
            "guid": guid,
            "name": node.attrib.get("Name", ""),
            "display_name": node.attrib.get("DisplayName", ""),
            "label": node_label(node),
            "service_name": service_name(node),
            "engine_type": et,
            "vendor_guid": node.attrib.get("VendorGuid", ""),
            "input_ports": ports(node, "InputPorts"),
            "output_ports": ports(node, "OutputPorts"),
            "service_input_ports": ports(node, "ServiceInputPorts"),
            "service_output_ports": ports(node, "ServiceOutputPorts"),
            "settings_main": engine_attrs(node),
            "path": path_prefix,
            "depth": depth,
            "hierarchy_token": hierarchy_token(node),
        }
        nodes_out.append(entry)
        if guid:
            node_map[guid] = entry

        if et == SUBMODEL_ENGINE and depth < max_depth:
            component = node.find("Component")
            engine = component.find("Engine") if component is not None else None
            model_unit = engine.find("ModelUnit") if engine is not None else None
            inner_wf = model_unit.find("WorkFlow") if model_unit is not None else None
            inner = walk_workflow(
                inner_wf,
                depth=depth + 1,
                max_depth=max_depth,
                path_prefix=f"{path_prefix}/{entry['label']}",
            )
            submodels.append(
                {
                    "label": entry["label"],
                    "guid": guid,
                    "depth": depth + 1,
                    "path": f"{path_prefix}/{entry['label']}",
                    **inner,
                }
            )

    for item in child_items(workflow, "Links") + child_items(workflow, "ServiceLinks"):
        link = parse_link(item)
        if link is None:
            continue
        src_guid = link["source_node_guid"]
        tgt_guid = link["target_node_guid"]
        src_node = node_map.get(src_guid)
        tgt_node = node_map.get(tgt_guid)
        src_port = resolve_port_name(node_map, src_guid, link["source_port_guid"])
        tgt_port = resolve_port_name(node_map, tgt_guid, link["target_port_guid"])
        enriched = {
            **link,
            "source_label": src_node["label"] if src_node else "",
            "target_label": tgt_node["label"] if tgt_node else "",
            "source_port_name": src_port,
            "target_port_name": tgt_port,
            "readable": (
                f"{src_node['label'] if src_node else src_guid}."
                f"{src_port or '?'} → "
                f"{tgt_node['label'] if tgt_node else tgt_guid}."
                f"{tgt_port or '?'}"
            ),
        }
        links_out.append(enriched)
        hierarchy.append(
            {
                "Source": src_node["hierarchy_token"] if src_node else None,
                "Target": tgt_node["hierarchy_token"] if tgt_node else None,
            }
        )

    # Terminal / initial markers (tools-loginom convention)
    linked_src = {h["Source"] for h in hierarchy if h["Source"]}
    linked_tgt = {h["Target"] for h in hierarchy if h["Target"]}
    for entry in nodes_out:
        token = entry["hierarchy_token"]
        if token not in linked_tgt:
            hierarchy.append({"Source": None, "Target": token})
        if token not in linked_src:
            hierarchy.append({"Source": token, "Target": None})

    return {
        "workflow_nodes": nodes_out,
        "links": links_out,
        "hierarchy": hierarchy,
        "notes": notes,
        "submodels": submodels,
    }


def extract_views(unit_root: ET.Element) -> list[dict[str, Any]]:
    views: list[dict[str, Any]] = []
    model_views = unit_root.find("ModelViews")
    if model_views is None:
        return views
    for node in child_items(model_views, "Nodes"):
        views.append(
            {
                "guid": node.attrib.get("Guid", ""),
                "label": node_label(node),
                "engine_type": engine_type(node),
                "service_name": service_name(node),
            }
        )
    return views


def count_tree(module_body: dict[str, Any]) -> dict[str, int]:
    notes_count = 0
    nodes_count = 0
    submodels_count = 0
    prog = 0
    refs = 0
    derived = 0
    max_depth = 0

    def classify(nodes: list[dict[str, Any]]) -> None:
        nonlocal prog, refs, derived
        for n in nodes:
            et = n.get("engine_type", "")
            if "JavaScript" in et or "Python" in et or et.endswith("JS"):
                prog += 1
            if "Reference" in et or "LinkNode" in et:
                refs += 1
            if "Derived" in et:
                derived += 1

    def walk(body: dict[str, Any], depth: int) -> None:
        nonlocal notes_count, nodes_count, submodels_count, max_depth
        max_depth = max(max_depth, depth)
        nodes = list(body.get("workflow_nodes") or [])
        nodes_count += len(nodes)
        notes_count += len(body.get("notes") or [])
        classify(nodes)
        for sub in body.get("submodels") or []:
            submodels_count += 1
            walk(sub, depth + 1)

    walk(module_body, 1 if module_body.get("workflow_nodes") else 0)

    return {
        "notes": notes_count,
        "nodes": nodes_count,
        "submodels": submodels_count,
        "programming_nodes": prog,
        "reference_nodes": refs,
        "derived_nodes": derived,
        "nesting_depth": max_depth,
    }


def zip_read(zf: zipfile.ZipFile, name: str) -> bytes | None:
    # Loginom uses both / and \ in index; zip members usually use /
    candidates = [name, name.replace("\\", "/").lstrip("/"), name.replace("/", "\\")]
    namelist = zf.namelist()
    for cand in candidates:
        if cand in namelist:
            return zf.read(cand)
    # case-insensitive fallback
    lower = {n.lower(): n for n in namelist}
    for cand in candidates:
        key = cand.lower().lstrip("/")
        if key in lower:
            return zf.read(lower[key])
    return None


def extract_package(lgp_path: Path, *, max_depth: int = MAX_SUBMODEL_DEPTH) -> dict[str, Any]:
    if not lgp_path.is_file():
        raise FileNotFoundError(f"package not found: {lgp_path}")
    with zipfile.ZipFile(lgp_path) as zf:
        info_raw = zip_read(zf, "PackageInfo.xml")
        if not info_raw:
            raise ValueError("PackageInfo.xml missing")
        info = parse_xml_bytes(info_raw)

        refs_raw = zip_read(zf, "References.xml")
        external: list[str] = []
        if refs_raw:
            refs_root = parse_xml_bytes(refs_raw)
            for item in refs_root.iter():
                if local_name(item.tag) != "Item":
                    continue
                name = item.attrib.get("Name") or item.attrib.get("DisplayName") or item.attrib.get("Path")
                if name:
                    external.append(name)

        index_raw = zip_read(zf, "PackageIndex.xml")
        unit_paths: list[str] = []
        if index_raw:
            index = parse_xml_bytes(index_raw)
            units = index.find("Units")
            if units is not None:
                for item in list(units):
                    if local_name(item.tag) != "Item":
                        continue
                    base = item.attrib.get("BasePath", "").replace("\\", "/").strip("/")
                    if base:
                        unit_paths.append(base)
        if not unit_paths:
            # fallback: discover Unit_*/Unit.xml
            for name in zf.namelist():
                norm = name.replace("\\", "/")
                m = re.match(r"^(Unit_\d+)/Unit\.xml$", norm)
                if m:
                    unit_paths.append(m.group(1))
            unit_paths = sorted(set(unit_paths))

        modules: list[dict[str, Any]] = []
        for idx, base in enumerate(unit_paths, start=1):
            info_xml = zip_read(zf, f"{base}/Info.xml")
            unit_xml = zip_read(zf, f"{base}/Unit.xml")
            mod_name = f"Unit{idx}"
            mod_display = f"Модуль{idx}"
            mod_guid = ""
            if info_xml:
                info_el = parse_xml_bytes(info_xml)
                mod_name = info_el.attrib.get("Name", mod_name)
                mod_display = info_el.attrib.get("DisplayName", mod_display)
                mod_guid = info_el.attrib.get("Guid", "")
            body: dict[str, Any] = {
                "workflow_nodes": [],
                "links": [],
                "hierarchy": [],
                "notes": [],
                "submodels": [],
            }
            views: list[dict[str, Any]] = []
            if unit_xml:
                unit_root = parse_xml_bytes(unit_xml)
                body = walk_workflow(
                    unit_root.find("WorkFlow"),
                    depth=0,
                    max_depth=max_depth,
                    path_prefix=base,
                )
                views = extract_views(unit_root)
            stats = count_tree(body)
            modules.append(
                {
                    "id": base.replace("\\", "/").split("/")[-1],
                    "index": idx,
                    "name": mod_name,
                    "display_name": mod_display,
                    "guid": mod_guid,
                    "stats": stats,
                    "view_nodes": views,
                    **body,
                }
            )

    package = {
        "file_name": lgp_path.name,
        "name": info.attrib.get("Name", lgp_path.stem),
        "application_version": info.attrib.get("ApplicationVersion", ""),
        "guid": info.attrib.get("Guid", ""),
        "external_references": external,
    }

    totals = {
        "modules": len(modules),
        "notes": sum(m["stats"]["notes"] for m in modules),
        "nodes": sum(m["stats"]["nodes"] for m in modules),
        "submodels": sum(m["stats"]["submodels"] for m in modules),
        "programming_nodes": sum(m["stats"]["programming_nodes"] for m in modules),
        "reference_nodes": sum(m["stats"]["reference_nodes"] for m in modules),
        "derived_nodes": sum(m["stats"]["derived_nodes"] for m in modules),
    }

    def collect_engine_types(body: dict[str, Any]) -> set[str]:
        found: set[str] = set()
        for n in body.get("workflow_nodes") or []:
            et = n.get("engine_type")
            if et:
                found.add(et)
        for sub in body.get("submodels") or []:
            found |= collect_engine_types(sub)
        return found

    engine_types = sorted(
        {et for m in modules for et in collect_engine_types(m)}
    )

    return {
        "schema_version": "package_docs.structure.v1",
        "package": package,
        "stats": totals,
        "modules": modules,
        "unique_engine_types": engine_types,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lgp", type=Path, help="Path to .lgp package")
    parser.add_argument("-o", "--output", type=Path, help="Write JSON to file (default: stdout)")
    parser.add_argument(
        "--max-depth",
        type=int,
        default=MAX_SUBMODEL_DEPTH,
        help=f"Max submodel nesting depth (default {MAX_SUBMODEL_DEPTH})",
    )
    args = parser.parse_args(argv)
    data = extract_package(args.lgp, max_depth=args.max_depth)
    text = json.dumps(data, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
