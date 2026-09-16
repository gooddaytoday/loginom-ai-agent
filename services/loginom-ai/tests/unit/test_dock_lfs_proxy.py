"""Transport-only regression checks for legacy GitLab LFS object origins."""

import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "dock_lfs_proxy", Path(__file__).parents[2] / "deploy/loginom-dock/gitlab-lfs-proxy.py"
)
proxy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(proxy)


class TestLFSOrigins(unittest.TestCase):
    def test_rewrites_legacy_origin_preserving_object_path_and_auth(self):
        action = {
            "href": "http://git.basegroup.ru/testing/e2e-tests.git/gitlab-lfs/objects/abc?x=1",
            "header": {"Authorization": "test-object-credential"},
        }
        result = proxy.rewrite_download_urls({"objects": [{"actions": {"download": action}}]})
        self.assertEqual(
            result["objects"][0]["actions"]["download"]["href"],
            "https://git.basegroup.ru/testing/e2e-tests.git/gitlab-lfs/objects/abc?x=1",
        )
        self.assertEqual(action["header"]["Authorization"], "test-object-credential")

    def test_rejects_redirects_outside_private_route(self):
        for url in (
            "https://evil.example/a",
            "http://git.basegroup.ru:9999/a",
            "https://user:password@git.basegroup.ru/a",
            "file:///etc/passwd",
            "https://git.basegroup.ru/unrelated/project.git/object",
        ):
            with self.subTest(url=url), self.assertRaises(ValueError):
                proxy.rewrite_download_urls({"objects": [{"actions": {"download": {"href": url}}}]})

    def test_missing_object_remains_an_error(self):
        payload = {"objects": [{"oid": "missing", "error": {"code": 404}}]}
        self.assertEqual(proxy.rewrite_download_urls(payload), payload)
