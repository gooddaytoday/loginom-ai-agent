"""Read native package XML without extracting archive paths or executing its content."""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

TYPE = "{http://www.w3.org/2001/XMLSchema-instance}type"


def inspect(package, unpacked):
    nodes, links = [], []
    with zipfile.ZipFile(package) as archive:
        names = archive.namelist()
        units = [name for name in names if re.fullmatch(r"Unit_[0-9]+/Unit.xml", name)]
        if not units or len(names) != len(set(names)):
            raise ValueError("missing or duplicate package XML")
        for unit in units:
            content = archive.read(unit)
            local = Path(unpacked) / unit
            if not local.is_file() or local.read_bytes() != content:
                raise ValueError("unpacked XML differs from package")
            if b"<!DOCTYPE" in content or b"<!ENTITY" in content:
                raise ValueError("XML entities are unsupported")
            root = ET.fromstring(content)
            for index, workflow in enumerate(root.iter("WorkFlow")):
                scope = f"{unit}:{index}"
                for item in workflow.findall("./Nodes/Item"):
                    engine = item.find("./Component/Engine")
                    if engine is None:
                        raise ValueError("node without engine")
                    columns = []
                    column_path = "./ColumnDefs/Item" if engine.get(TYPE) == "TBGImportTextFile" else "./Component/InputSockets/Item[@Name='DataSource']/Socket/DataSource/ColumnDefs/Item"
                    for col in (engine if engine.get(TYPE) == "TBGImportTextFile" else item).findall(column_path):
                        ext = col.find("./Extensions/Item/Extension[@" + TYPE + "='TBGCrossTabColumnDefExtension']")
                        columns.append({**col.attrib, "extension": ext.attrib if ext is not None else {}})
                    output_columns = []
                    for col in item.findall("./Component/OutputSockets/Item[@Name='DataSource']/Socket/DataSource/ColumnDefs/Item"):
                        mapping = col.find("./Extensions/Item/Extension[@" + TYPE + "='TBGColumnDefMappingExtension']/Mapping")
                        output_columns.append({**col.attrib, "source": mapping.get("Source") if mapping is not None else None})
                    nodes.append({"scope": scope, "id": item.get("Guid"), "type": engine.get(TYPE),
                                  "engine": engine.attrib, "columns": columns, "output_columns": output_columns,
                                  "inputs": {p.get("Guid"): p.get("Name") for p in item.findall("./InputPorts/Item")},
                                  "outputs": {p.get("Guid"): p.get("Name") for p in item.findall("./OutputPorts/Item")},
                                  "variables": [v.attrib for v in item.findall("./Component/InputSockets/Item[@Name='ControlVariables']/Socket/Variables/Elements/Item")]})
                for item in workflow.findall("./Links/Item"):
                    source, target = item.find("SourcePort"), item.find("TargetPort")
                    if source is None or target is None:
                        raise ValueError("link without endpoints")
                    links.append({"scope": scope, "source": source.attrib, "target": target.attrib})
    if len({(n['scope'], n['id']) for n in nodes}) != len(nodes):
        raise ValueError("duplicate node GUID")
    return {"nodes": nodes, "links": links}


if __name__ == "__main__":
    try:
        print(json.dumps(inspect(sys.argv[1], sys.argv[2])))
    except (ValueError, ET.ParseError, zipfile.BadZipFile, KeyError) as error:
        print(json.dumps({"invalid": str(error)}))
