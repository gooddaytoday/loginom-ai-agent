#!/usr/bin/env python3
"""Keep GitLab LFS download URLs inside Dock's verified private HTTPS route.

The legacy GitLab advertises HTTP object URLs even behind an HTTPS proxy. Only
its download batch response is adapted; Git clone and LFS objects use the normal
reverse proxy. No repository import, credentials storage, or TLS bypass happens here.
"""

import http.client
import json
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, urlunsplit

SOCKET = "/run/dock-tunnel/gitlab.sock"
REPOSITORIES = ("testing/ai-skills", "testing/e2e-tests", "support/loginom-help")
BATCH_PATHS = {f"/{repo}.git/info/lfs/objects/batch" for repo in REPOSITORIES}
MAX_BODY = 4 * 1024 * 1024


def rewrite_download_urls(payload):
    for obj in payload.get("objects", []):
        action = obj.get("actions", {}).get("download")
        if action is None:
            continue
        url = urlsplit(action["href"])
        if (
            url.scheme not in ("http", "https")
            or url.hostname != "git.basegroup.ru"
            or url.username is not None
            or url.password is not None
            or url.port not in (None, 80 if url.scheme == "http" else 443)
            or url.fragment
            or not any(url.path.startswith(f"/{repo}.git/") for repo in REPOSITORIES)
        ):
            raise ValueError("LFS object URL outside the approved GitLab origin or repositories")
        action["href"] = urlunsplit(("https", "git.basegroup.ru", url.path, url.query, ""))
    return payload


class UnixHTTPConnection(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(SOCKET)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        # Requests and errors can contain object credentials. Never log them.
        pass

    def do_POST(self):
        if self.path not in BATCH_PATHS:
            self.send_error(404)
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= MAX_BODY:
                self.send_error(413)
                return
            body = self.rfile.read(size)
            if json.loads(body).get("operation") != "download":
                self.send_error(403)
                return
            headers = {
                "Host": "git.basegroup.ru",
                "Accept-Encoding": "identity",
                "Content-Type": "application/vnd.git-lfs+json",
                "Accept": "application/vnd.git-lfs+json",
            }
            if self.headers.get("Authorization"):
                headers["Authorization"] = self.headers["Authorization"]
            connection = UnixHTTPConnection("git.basegroup.ru", timeout=45)
            try:
                connection.request("POST", self.path, body, headers)
                response = connection.getresponse()
                data = response.read(MAX_BODY + 1)
                status = response.status
                if len(data) > MAX_BODY:
                    raise ValueError("Oversized LFS batch response")
                if status == 200:
                    data = json.dumps(rewrite_download_urls(json.loads(data))).encode()
            finally:
                connection.close()
            self.send_response(status)
            self.send_header("Content-Type", "application/vnd.git-lfs+json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception:
            self.send_error(502, "GitLab LFS batch route unavailable or invalid")


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8080), Handler).serve_forever()
