"""Create and verify a curated baseline archive without extracting untrusted paths."""
import hashlib
import json
import pathlib
import sys
import tarfile


def sha(value):
    return hashlib.sha256(value).hexdigest()


def verify(archive, expected):
    if sha(archive.read_bytes()) != expected:
        raise ValueError("ARCHIVE_HASH_CHANGED")
    with tarfile.open(archive, "r:gz") as stream:
        members = stream.getmembers()
        names = [item.name for item in members]
        if len(names) != len(set(names)) or sum(item.size for item in members) > 2 * 1024**3:
            raise ValueError("ARCHIVE_MEMBERS_REFUSED")
        for item in members:
            name = pathlib.PurePosixPath(item.name)
            if not item.isfile() or name.is_absolute() or any(part in ("..", ".") for part in name.parts) or str(name) != item.name:
                raise ValueError("ARCHIVE_PATH_REFUSED")
        manifest = json.load(stream.extractfile("delivery-manifest.json"))
        expected_names = [item["path"] for item in manifest["files"]] + ["delivery-manifest.json"]
        if manifest["version"] != 1 or sorted(expected_names) != sorted(names):
            raise ValueError("DELIVERY_MANIFEST_CHANGED")
        for item in manifest["files"]:
            if sha(stream.extractfile(item["path"]).read()) != item["sha256"]:
                raise ValueError("DELIVERY_FILE_CHANGED")
    return {"verified": True, "baselineId": manifest["baselineId"], "files": names}


if sys.argv[1] == "create":
    source = pathlib.Path(sys.argv[2])
    with tarfile.open(sys.argv[3], "x:gz") as stream:
        for file in sorted(source.rglob("*")):
            if file.is_symlink():
                raise ValueError("SYMLINK_REFUSED")
            if file.is_file():
                stream.add(file, arcname=str(file.relative_to(source)), recursive=False)
elif sys.argv[1] == "verify":
    print(json.dumps(verify(pathlib.Path(sys.argv[2]), sys.argv[3])))
else:
    raise ValueError("UNKNOWN_COMMAND")
