"""Check the independently fetched server package and its assigned scope."""
import hashlib
import json
from pathlib import Path
import re
import sys
from zipfile import ZipFile
from xml.etree import ElementTree

attempt = Path(sys.argv[1])
prompt = (attempt / "prompt.txt").read_text()
assigned = re.search(r"без аналитических узлов по адресу `(/[^\s`]+/eval-[^\s`/]+\.lgp)`", prompt).group(1)
result = json.loads((attempt / "result.json").read_bytes())
assert result['package_path'] == assigned and not result.get('artifact_ambiguous'), 'wrong or ambiguous server artifact'
package = attempt / "artifact/package.lgp"
with ZipFile(package) as z:
    assert not z.testzip(), 'unreadable package'
    names = z.namelist()
    assert len(set(names)) == len(names) and 'PackageInfo.bin' in names and 'PackageInfo.xml' in names
    units = [n for n in names if re.fullmatch(r'Unit_[0-9]+/Unit.xml',n)]
    assert len(units) == 1
    xml = z.read(units[0])
    assert xml == (attempt/'artifact/unpacked'/units[0]).read_bytes()
    assert b'<!DOCTYPE' not in xml and b'<!ENTITY' not in xml
    root = ElementTree.fromstring(xml)
    work = list(root.iter("WorkFlow"))
    assert root.tag == "Unit" and len(work) == 1
    assert work[0].find('Nodes') is not None and not work[0].findall('./Nodes/Item')
    assert work[0].find('Links') is not None and not work[0].findall('./Links/Item')
print(json.dumps({"sha256":hashlib.sha256(package.read_bytes()).hexdigest(),"assignment_path_sha256":hashlib.sha256(assigned.encode()).hexdigest(),"workflows":1,"business_nodes":0,"links":0}))
