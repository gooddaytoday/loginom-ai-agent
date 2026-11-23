#!/usr/bin/env python3
"""Rebuild the bundled Loginom help corpus from https://help.loginom.ru/userguide/ (GitBook legacy).

    python3 -I scripts/loginom-help/update.py [--from-dir <saved html>] [--out packages/product/help]

Without --from-dir the pages listed in sitemap.xml are downloaded one by one into a temporary directory
(its path is printed) and the corpus is built from there. Page paths follow the GitBook source layout:
X.html -> X.md, X/ (X/index.html) -> X/README.md, the site root -> README.md.
"""
import argparse
import hashlib
import html
import http.client
import json
import posixpath
import re
import shutil
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path

BASE = "https://help.loginom.ru/userguide/"
USER_AGENT = "loginom-help-update"
# The product line the site documents; change by hand when the site moves to a new Loginom line.
LOGINOM_VERSION = "7.4"
MAX_BYTES = 50_000
MAX_LINES = 2000
RETRIES = 3
VOID = {"br", "img", "hr", "input", "meta", "link", "col", "source", "wbr"}
BLOCK = {"p", "div", "ul", "ol", "li", "table", "pre", "blockquote", "figure", "figcaption", "hr",
         "h1", "h2", "h3", "h4", "h5", "h6", "dl", "dt", "dd", "details", "summary", "section", "thead", "tbody", "tr"}


def main(argv=None):
    parser = argparse.ArgumentParser(description="Обновляет локальную справку Loginom из help.loginom.ru/userguide/")
    parser.add_argument("--from-dir", type=Path, help="каталог ранее сохранённых html (пути как в URL); сеть не используется")
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[2] / "packages/product/help")
    parser.add_argument("--fetched-at", help="с --from-dir: время скачивания html (ISO UTC); иначе из прежнего манифеста")
    parser.add_argument("--last-modified", help="с --from-dir: HTTP Last-Modified главной; иначе из прежнего манифеста")
    args = parser.parse_args(argv)
    if not args.from_dir and (args.fetched_at or args.last_modified):
        parser.error("--fetched-at и --last-modified имеют смысл только с --from-dir")

    manifest_file = args.out / "help-manifest.json"
    previous = json.loads(manifest_file.read_bytes()) if manifest_file.exists() else None
    if args.from_dir:
        old = (previous or {}).get("source", {})
        source_dir = args.from_dir
        source = {"last_modified": args.last_modified or old.get("last_modified"),
                  "fetched_at": args.fetched_at or old.get("fetched_at")}
        if not all(source.values()):
            sys.exit("--from-dir без прежнего манифеста требует --fetched-at и --last-modified")
    else:
        source_dir, source = download()
    manifest = write(args.out, build(source_dir), source)
    print(report(previous, manifest))


def download():
    raw = Path(tempfile.mkdtemp(prefix="loginom-help-"))
    print(f"Сырые html: {raw}", file=sys.stderr)
    sitemap = fetch(BASE + "sitemap.xml")[0].decode("utf-8")
    urls = [url for url in map(html.unescape, re.findall(r"<loc>\s*(.*?)\s*</loc>", sitemap)) if url.startswith(BASE)]
    last_modified = None
    for number, url in enumerate(urls, 1):
        rel = urllib.parse.unquote(url[len(BASE):])
        if rel and not rel.endswith(("/", ".html")):
            continue
        if rel.startswith("/") or ".." in rel.split("/"):
            sys.exit(f"Подозрительный путь в sitemap: {url}")
        body, headers = fetch(url)
        if rel == "":
            last_modified = headers.get("Last-Modified")
        file = raw / (rel + "index.html" if rel == "" or rel.endswith("/") else rel)
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(body)
        print(f"{number}/{len(urls)} {url}", file=sys.stderr)
    if not last_modified:
        sys.exit("Главной страницы нет в sitemap или у неё нет Last-Modified")
    return raw, {"last_modified": last_modified, "fetched_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(RETRIES + 1):
        time.sleep(1 + attempt)  # не быстрее одного запроса в секунду, повторы реже
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read(), response.headers
        except (OSError, http.client.HTTPException) as error:  # URLError, HTTPError, таймауты, оборванный ответ
            code = getattr(error, "code", None)
            if attempt == RETRIES or (code is not None and code != 429 and code < 500):
                sys.exit(f"Не удалось скачать {url}: {error}")


def build(source_dir):
    """Render every saved page; return {corpus path: markdown} or exit when the corpus is unusable."""
    sources = {md_path(file.relative_to(source_dir).as_posix()): file.relative_to(source_dir).as_posix()
               for file in sorted(source_dir.rglob("*.html"))}
    if not sources:
        sys.exit(f"Пустой корпус: в {source_dir} нет html")
    pages = {path: render_page((source_dir / rel).read_text(encoding="utf-8"), rel, sources) for path, rel in sources.items()}
    check(pages)
    return pages


def md_path(rel):
    """URL path below BASE -> corpus page path."""
    if rel == "" or rel.endswith("/"):
        return rel + "README.md"
    if rel == "index.html" or rel.endswith("/index.html"):
        return rel[:-len("index.html")] + "README.md"
    if rel.endswith(".html"):
        return rel[:-len(".html")] + ".md"
    if "." not in rel.rsplit("/", 1)[-1]:  # каталог без завершающего слеша
        return rel + "/README.md"
    return rel


def render_page(text, rel, corpus):
    tree = Tree()
    tree.feed(text)
    tree.close()
    if tree.root is None:
        sys.exit(f'{rel}: нет <section class="normal markdown-section">')
    out = []
    Page(rel, corpus).children(tree.root, out, "")
    return "\n".join(trim(out)) + "\n"


def check(pages):
    errors = [f"{path}: {len(text.encode('utf-8'))} байт, {text.count(chr(10))} строк (предел {MAX_BYTES} байт, {MAX_LINES} строк)"
              for path, text in pages.items() if len(text.encode("utf-8")) > MAX_BYTES or text.count("\n") > MAX_LINES]
    errors += [f"{path}: ссылка {target} ведёт вне корпуса"
               for path, text in pages.items() for target in re.findall(r"\]\(([^()\s:]+\.md)\)", text)
               if posixpath.normpath(posixpath.join(posixpath.dirname(path), target)) not in pages]
    if errors:
        sys.exit("\n".join(["Корпус отклонён:", *errors]))


def write(out, pages, source):
    data = out / "loginom-help" / "data"
    if data.exists():
        shutil.rmtree(data)
    files = []
    for path, text in sorted(pages.items()):
        body = text.encode("utf-8")
        (data / path).parent.mkdir(parents=True, exist_ok=True)
        (data / path).write_bytes(body)
        files.append({"path": f"data/{path}", "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body)})
    manifest = {"protocol": 1,
                "source": {"kind": "site", "url": BASE, "last_modified": source["last_modified"], "fetched_at": source["fetched_at"]},
                "loginom_version": LOGINOM_VERSION, "pages": len(files), "bytes": sum(file["bytes"] for file in files), "files": files}
    (out / "help-manifest.json").write_bytes((json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return manifest


def report(previous, manifest):
    head = (f"Справка Loginom {manifest['loginom_version']}: {manifest['pages']} страниц, {manifest['bytes']} байт; "
            f"сайт от {manifest['source']['last_modified']}, скачан {manifest['source']['fetched_at']}.")
    if previous is None:
        return head + "\nПрежнего манифеста нет, отчёт изменений не строится."
    old = {file["path"]: file for file in previous["files"]}
    new = {file["path"]: file for file in manifest["files"]}
    rows = sorted([(path, "добавлена", "—", new[path]["bytes"]) for path in new.keys() - old.keys()]
                  + [(path, "удалена", old[path]["bytes"], "—") for path in old.keys() - new.keys()]
                  + [(path, "изменена", old[path]["bytes"], new[path]["bytes"])
                     for path in new.keys() & old.keys() if new[path]["sha256"] != old[path]["sha256"]])
    head += f"\nБыло: {previous['pages']} страниц, {previous['bytes']} байт."
    if not rows:
        return head + "\nИзменений в страницах нет."
    table = ["| Страница | Изменение | Байт было | Байт стало |", "|---|---|---:|---:|"]
    return "\n".join([head, "", *table, *(f"| `{path[len('data/'):]}` | {kind} | {before} | {after} |" for path, kind, before, after in rows)])


class Node:
    __slots__ = ("tag", "attrs", "kids")

    def __init__(self, tag, attrs):
        self.tag, self.attrs, self.kids = tag, attrs, []


class Tree(HTMLParser):
    """Builds a tree of the first <section class="normal markdown-section"> only."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root, self.stack, self.depth = None, [], 0

    def handle_starttag(self, tag, attrs):
        attrs = {key: value or "" for key, value in attrs}
        if not self.depth:
            if tag == "section" and attrs.get("class", "").strip() == "normal markdown-section" and self.root is None:
                self.depth, self.root = 1, Node("section", attrs)
                self.stack = [self.root]
            return
        if tag == "section":
            self.depth += 1
        node = Node(tag, attrs)
        self.stack[-1].kids.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if self.depth and tag not in VOID and self.stack and self.stack[-1].tag == tag:
            self.stack.pop()

    def handle_endtag(self, tag):
        if not self.depth:
            return
        if tag == "section":
            self.depth -= 1
            if not self.depth:
                self.stack = []
                return
        # закрываем до парного тега: GitBook оставляет незакрытые <p>/<li>
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                return

    def handle_data(self, data):
        if self.depth and self.stack:
            self.stack[-1].kids.append(data)


class Page:
    """Renders one content section to markdown; help links resolve against this page and the corpus."""

    def __init__(self, rel, corpus):
        self.rel, self.path, self.corpus = rel, md_path(rel), corpus

    def block(self, node, out, indent):
        if isinstance(node, str):
            text = squash(node)
            if text:
                out.append(indent + text)
            return
        if service(node) or node.tag == "img":
            return
        tag = node.tag
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            text = self.text(node)
            if text:
                out.extend(["", "#" * int(tag[1]) + " " + text, ""])
            return
        if tag == "pre":
            lang = next((match.group(1) for item in [node, *elements(node)]
                         if (match := re.search(r"language-(\S+)", item.attrs.get("class", ""))) and match.group(1) != "undefined"), "")
            out.extend(["", "```" + lang, *raw_text(node).replace("\r", "").strip("\n").split("\n"), "```", ""])
            return
        if tag == "table":
            out.append("")
            out.extend((indent + " | ".join(self.text(cell) for cell in elements(row) if cell.tag in ("td", "th"))).rstrip()
                       for row in descendants(node, "tr"))
            out.append("")
            return
        if tag in ("ul", "ol"):
            self.list(node, out, indent)
            return
        if tag == "blockquote":
            sub = []
            self.children(node, sub, "")
            out.extend(["", *("> " + line if line.strip() else ">" for line in trim(sub)), ""])
            return
        if tag == "figure":
            caption = next(descendants(node, "figcaption"), None)
            text = self.text(caption) if caption else ""
            if text:
                out.extend(["", indent + f"[Рисунок: {text}]", ""])
            return
        if tag == "hr":
            out.extend(["", "---", ""])
            return
        if tag == "b" and "spoiler_title" in node.attrs.get("class", ""):
            out.extend(["", indent + "**" + self.text(node) + "**"])
            return
        if tag in BLOCK or has_block(node):
            if tag in BLOCK and tag not in ("li", "div", "section", "dd", "tbody", "thead"):
                out.append("")
            self.children(node, out, indent)
            if tag in ("p", "div", "dl", "details"):
                out.append("")
            return
        out.extend(indent + line for line in squash(self.inline(node)).split("\n") if line)

    def list(self, node, out, indent):
        number = 0
        for item in elements(node):
            if item.tag != "li":
                self.block(item, out, indent)
                continue
            number += 1
            sub = []
            self.children(item, sub, indent + "  ")
            sub = [line for line in sub if line.strip()]
            if sub:
                out.append(indent + (f"{number}. " if node.tag == "ol" else "- ") + sub[0].lstrip())
                out.extend(sub[1:])
        out.append("")

    def children(self, node, out, indent):
        """Group consecutive inline children into one paragraph; recurse into blocks."""
        run = []
        for kid in [*node.kids, None]:
            if kid is not None and (isinstance(kid, str) or (kid.tag not in BLOCK and not service(kid) and not has_block(kid))):
                run.append(kid)
                continue
            out.extend(indent + line for line in squash("".join(self.inline(item) for item in run)).split("\n") if line)
            run = []
            if kid is not None:
                self.block(kid, out, indent)

    def inline(self, node):
        if isinstance(node, str):
            return node
        if service(node) or node.tag == "img":
            return ""
        if node.tag == "br":
            return "\n"
        if node.tag == "span" and "mjx-chtml" in node.attrs.get("class", ""):
            # MathJax уже отрисован в span-ы по символам; TeX-исходник есть только в aria-label
            label = next((item.attrs["aria-label"] for item in descendants(node) if item.attrs.get("aria-label")), "")
            return f"${label}$" if label else ""
        inner = "".join(self.inline(kid) for kid in node.kids)
        if not inner.strip():
            return inner
        if node.tag == "code":
            return f"`{inner}`"
        if node.tag in ("strong", "b"):
            return f"**{inner.strip()}**"
        if node.tag == "sup":
            return "^" + inner
        if node.tag == "sub":
            return "_" + inner
        if node.tag == "a":
            target = self.target(node.attrs.get("href", ""))
            if target:
                return (" " if inner[0].isspace() else "") + f"[{' '.join(inner.split())}]({target})" + (" " if inner[-1].isspace() else "")
        return inner

    def target(self, href):
        """Relative corpus path for a help link; None for anchors, external links and pages outside the corpus."""
        if href.startswith("#"):
            return None
        url = urllib.parse.urldefrag(urllib.parse.urljoin(BASE + self.rel, href)).url.split("?")[0]
        if not url.startswith(BASE):
            return None
        path = md_path(urllib.parse.unquote(url[len(BASE):]))
        if path not in self.corpus or path == self.path:
            return None
        return posixpath.relpath(path, posixpath.dirname(self.path) or ".")

    def text(self, node):
        return re.sub(r"\s+", " ", self.inline(node)).strip()


def service(node):
    """GitBook chrome inside the content: heading anchors, «Скачать в PDF», icons, simpletabs headers, buttons, scripts."""
    cls = node.attrs.get("class", "")
    return (node.tag in {"script", "style", "svg", "noscript", "button"}
            or (node.tag == "a" and ("plugin-anchor" in cls or "page-download-link" in cls))
            or (node.tag == "i" and "fa" in cls.split())
            or (node.tag == "ul" and "nav-tabs" in cls.split()))


def elements(node):
    return [kid for kid in node.kids if not isinstance(kid, str)]


def has_block(node):
    return any(kid.tag in BLOCK for kid in elements(node))


def descendants(node, tag=None):
    for kid in elements(node):
        if tag is None or kid.tag == tag:
            yield kid
        if tag is None or kid.tag != tag:
            yield from descendants(kid, tag)


def raw_text(node):
    if isinstance(node, str):
        return node
    if node.tag == "br":
        return "\n"
    return "".join(raw_text(kid) for kid in node.kids)


def squash(text):
    return "\n".join(re.sub(r"[ \t\r\f\v ]+", " ", line).strip() for line in text.split("\n")).strip()


def trim(lines):
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip("\n").split("\n")


if __name__ == "__main__":
    main()
