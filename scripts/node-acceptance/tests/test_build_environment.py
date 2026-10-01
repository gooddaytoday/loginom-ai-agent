import json
import os
import pathlib
import subprocess
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "build-environment.sh"
NAMES = ("TMPDIR", "BUN_INSTALL_CACHE_DIR", "npm_config_cache")


class BuildEnvironment(unittest.TestCase):
    def check_paths(self, overrides):
        # All three real write/fsync operations run under the selected env,
        # without installing dependencies or touching any other slot.
        with tempfile.TemporaryDirectory(dir=os.environ["TMPDIR"]) as directory:
            root = pathlib.Path(directory)
            env = {key: value for key, value in os.environ.items() if key not in NAMES}
            env.update(overrides(root))
            result = subprocess.run(
                ["bash", "-c", '''set -eu
source "$1"
configure_build_environment "$2"
python3 - <<'PY'
import json, os, pathlib
names = ('TMPDIR', 'BUN_INSTALL_CACHE_DIR', 'npm_config_cache')
for name in names:
    with (pathlib.Path(os.environ[name]) / 'io-control').open('wb') as stream:
        stream.write(b'candidate build I/O control')
        stream.flush()
        os.fsync(stream.fileno())
print(json.dumps({name: os.environ[name] for name in (*names, 'HOME')}))
PY
''', "build-control", str(SCRIPT), str(root / "build")],
                env=env, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            paths = json.loads(result.stdout)
            self.assertEqual(paths["HOME"], os.environ["HOME"])
            for name, suffix in zip(NAMES, ("tmp", "cache/bun", "cache/npm")):
                expected = env.get(name)
                if expected is None or expected.startswith("/tmp/"):
                    expected = str(root / "build" / suffix)
                self.assertEqual(paths[name], expected)
                self.assertEqual((pathlib.Path(expected) / "io-control").read_bytes(), b"candidate build I/O control")

    def test_defaults_write_all_three_locations(self):
        self.check_paths(lambda root: {})

    def test_explicit_disk_locations_preserved(self):
        self.check_paths(lambda root: {name: str(root / name) for name in NAMES})

    def test_tmpfs_locations_replaced(self):
        self.check_paths(lambda root: {name: "/tmp/unsafe-build-control" for name in NAMES})

    def test_tmpfs_build_root_refuses_before_creating_directories(self):
        result = subprocess.run(
            ["bash", "-c", 'source "$1"; configure_build_environment "$2"',
             "build-control", str(SCRIPT), "/tmp/unsafe-build-control"],
            capture_output=True, text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("outside quota-limited /tmp", result.stderr)


if __name__ == "__main__":
    unittest.main()
