#!/usr/bin/env python3
"""Записать «ИИ Отчет» рядом с пакетом в pdf, docx или md.

Markdown — промежуточный текст. PDF и DOCX собираются стандартной
библиотекой: DOCX как ZIP/XML, PDF со встроенным шрифтом Golos Text.
Неизвестный или пустой формат сохраняется как PDF.
"""

from __future__ import annotations

import argparse
import html
import io
import re
import struct
import zipfile
import zlib
from dataclasses import dataclass
from pathlib import Path

SUPPORTED = ("pdf", "docx", "md")

_HEADING = re.compile(r"^(#{1,4})\s+(.*)$")
_QUOTE = re.compile(r"^>\s?(.*)$")
_BULLET = re.compile(r"^(\s*)\*\s+(.*)$")
_NUMBER = re.compile(r"^(\s*)\d+\.\s+(.*)$")
_BOLD = re.compile(r"\*\*(.+?)\*\*")
_CODE = re.compile(r"`([^`]+)`")


def resolve_format(value: str | None) -> str:
    token = (value or "").strip().lower()
    if token.startswith("."):
        token = token[1:]
    if token == "pdf":
        return "pdf"
    if token in {"docx", "word"}:
        return "docx"
    if token in {"md", "markdown"}:
        return "md"
    return "pdf"


def report_destination(lgp: Path, fmt: str) -> Path:
    return lgp.parent / f"{lgp.stem}.lgp_report.{fmt}"


def markdown_to_html(markdown: str) -> str:
    body: list[str] = []
    lists: list[str] = []

    def close_lists(depth: int = 0) -> None:
        while len(lists) > depth:
            body.append(f"</{lists.pop()}>")

    for raw in markdown.splitlines():
        if not raw.strip():
            close_lists()
            continue
        heading = _HEADING.match(raw.strip())
        if heading:
            close_lists()
            level = len(heading.group(1))
            body.append(f"<h{level}>{_inline(heading.group(2))}</h{level}>")
            continue
        quote = _QUOTE.match(raw.strip())
        if quote:
            close_lists()
            body.append(f"<blockquote><p>{_inline(quote.group(1))}</p></blockquote>")
            continue
        bullet = _BULLET.match(raw)
        number = _NUMBER.match(raw)
        match = bullet or number
        if match:
            kind = "ul" if bullet else "ol"
            depth = len(match.group(1)) // 2 + 1
            if len(lists) >= depth and lists[depth - 1] != kind:
                close_lists(depth - 1)
            close_lists(depth)
            while len(lists) < depth:
                lists.append(kind)
                body.append(f"<{kind}>")
            body.append(f"<li>{_inline(match.group(2))}</li>")
            continue
        close_lists()
        body.append(f"<p>{_inline(raw.strip())}</p>")
    close_lists()
    content = "\n".join(body)
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>ИИ Отчет</title>
<style>
body {{ font-family: "Liberation Serif", "Times New Roman", serif; font-size: 12pt; line-height: 1.45; }}
h1 {{ font-size: 18pt; }}
h2 {{ font-size: 15pt; }}
h3 {{ font-size: 13pt; }}
code {{ font-family: "Liberation Mono", monospace; }}
blockquote {{ margin-left: 1.2em; }}
</style>
</head>
<body>
{content}
</body>
</html>
"""


def emit(markdown: str, lgp: Path, requested_format: str | None) -> Path:
    if not lgp.is_file():
        raise FileNotFoundError(lgp)
    fmt = resolve_format(requested_format)
    destination = report_destination(lgp, fmt)
    destination.parent.mkdir(parents=True, exist_ok=True)
    if fmt == "md":
        text = markdown if markdown.endswith("\n") else markdown + "\n"
        destination.write_text(text, encoding="utf-8")
        return destination
    blocks = parse_blocks(markdown)
    payload = write_pdf(blocks) if fmt == "pdf" else write_docx(blocks)
    destination.write_bytes(payload)
    return destination


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("markdown", type=Path, help="Итоговый Markdown без плейсхолдеров")
    parser.add_argument("--lgp", type=Path, required=True, help="Абсолютный путь к пакету .lgp")
    parser.add_argument(
        "--format",
        default="pdf",
        help="pdf, docx или md. Пустое и неизвестное значение сохраняется как pdf",
    )
    args = parser.parse_args(argv)
    try:
        destination = emit(args.markdown.read_text(encoding="utf-8"), args.lgp, args.format)
    except FileNotFoundError:
        print(f"Пакет не найден: {args.lgp}", flush=True)
        return 1
    except RuntimeError as error:
        print(str(error), flush=True)
        return 1
    print(destination)
    return 0


def _inline(text: str) -> str:
    escaped = html.escape(text)
    escaped = _BOLD.sub(r"<strong>\1</strong>", escaped)
    return _CODE.sub(r"<code>\1</code>", escaped)


@dataclass(frozen=True)
class Run:
    text: str
    bold: bool


@dataclass(frozen=True)
class Block:
    kind: str
    runs: tuple[Run, ...]
    depth: int = 0
    marker: str = ""


def parse_blocks(markdown: str) -> list[Block]:
    blocks: list[Block] = []
    counters: dict[int, int] = {}
    for raw in markdown.splitlines():
        if not raw.strip():
            counters.clear()
            continue
        heading = _HEADING.match(raw.strip())
        if heading:
            counters.clear()
            blocks.append(Block(f"h{len(heading.group(1))}", tuple(_runs(heading.group(2)))))
            continue
        quote = _QUOTE.match(raw.strip())
        if quote:
            counters.clear()
            blocks.append(Block("quote", tuple(_runs(quote.group(1)))))
            continue
        bullet = _BULLET.match(raw)
        number = _NUMBER.match(raw)
        match = bullet or number
        if match:
            depth = len(match.group(1)) // 2 + 1
            for key in list(counters):
                if key > depth:
                    del counters[key]
            if bullet:
                marker = "•"
            else:
                counters[depth] = counters.get(depth, 0) + 1
                marker = f"{counters[depth]}."
            blocks.append(Block("li", tuple(_runs(match.group(2))), depth, marker))
            continue
        counters.clear()
        blocks.append(Block("p", tuple(_runs(raw.strip()))))
    return blocks


def write_docx(blocks: list[Block]) -> bytes:
    paragraphs: list[str] = []
    for block in blocks:
        runs = _heading_runs(block) if block.kind.startswith("h") else block.runs
        indent = 360 * block.depth if block.kind == "li" else 360 if block.kind == "quote" else 0
        style = {"h1": "Heading1", "h2": "Heading2", "h3": "Heading3", "h4": "Heading3"}.get(block.kind)
        props: list[str] = []
        if style:
            props.append(f'<w:pStyle w:val="{style}"/>')
        if indent:
            props.append(f'<w:ind w:left="{indent}"/>')
        ppr = f"<w:pPr>{''.join(props)}</w:pPr>" if props else ""
        body = ""
        if block.marker:
            body += _docx_run(f"{block.marker} ", False)
        body += "".join(_docx_run(run.text, run.bold) for run in runs)
        paragraphs.append(f"<w:p>{ppr}{body}</w:p>")
    document = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
{''.join(paragraphs)}
<w:sectPr>
<w:pgSz w:w="11906" w:h="16838"/>
<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/>
</w:sectPr>
</w:body>
</w:document>
"""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _CONTENT_TYPES)
        archive.writestr("_rels/.rels", _PACKAGE_RELS)
        archive.writestr("word/document.xml", document)
        archive.writestr("word/styles.xml", _STYLES)
        archive.writestr("word/_rels/document.xml.rels", _DOCUMENT_RELS)
    return buffer.getvalue()


def write_pdf(blocks: list[Block]) -> bytes:
    regular = _TrueType.load(_FONT_DIR / "GolosText-Regular.ttf", "GolosText")
    bold = _TrueType.load(_FONT_DIR / "GolosText-Bold.ttf", "GolosText-Bold")
    pages = _layout_pdf(blocks, regular, bold)
    regular.data = _subset_font(regular.data, {gid for _content, glyphs in pages for gid in glyphs["F1"]})
    bold.data = _subset_font(bold.data, {gid for _content, glyphs in pages for gid in glyphs["F2"]})
    return _assemble_pdf(pages, regular, bold)


class _TrueType:
    def __init__(self, data: bytes, name: str, units: int, ascent: int, descent: int, bbox: tuple[int, int, int, int], glyph_of) -> None:
        self.data = data
        self.name = name
        self.units = units
        self.ascent = ascent
        self.descent = descent
        self.bbox = bbox
        self._glyph_of = glyph_of

    @classmethod
    def load(cls, path: Path, name: str) -> _TrueType:
        if not path.is_file():
            raise RuntimeError(f"Не найден шрифт отчёта: {path.name}")
        data = path.read_bytes()
        tables = _ttf_tables(data)
        units, bbox = _head_metrics(tables["head"])
        ascent, descent, metrics = _horizontal_metrics(tables["hhea"], tables["hmtx"])
        glyph_of = _cmap(tables["cmap"])
        font = cls(data, name, units, ascent, descent, bbox, glyph_of)
        if font.glyph("A") == 0 or font.glyph("А") == 0:
            raise RuntimeError(f"Шрифт {name} не содержит нужных букв.")
        font._advances = metrics
        return font

    def glyph(self, char: str) -> int:
        return self._glyph_of(ord(char))

    def width(self, char: str, size: float) -> float:
        gid = self.glyph(char)
        index = gid if gid < len(self._advances) else len(self._advances) - 1
        return self._advances[index] * size / self.units


def _layout_pdf(blocks: list[Block], regular: _TrueType, bold: _TrueType) -> list[tuple[bytes, dict[str, dict[int, str]]]]:
    page_width = 595.28
    page_height = 841.89
    margin = 56.0
    width = page_width - 2 * margin
    y = page_height - margin
    commands: list[str] = []
    pages: list[tuple[list[str], dict[str, dict[int, str]]]] = []
    used: dict[str, dict[int, str]] = {"F1": {}, "F2": {}}

    def new_page() -> None:
        nonlocal y, commands, used
        if commands:
            pages.append((commands, used))
        commands = []
        used = {"F1": {}, "F2": {}}
        y = page_height - margin

    def gap(amount: float) -> None:
        nonlocal y
        if commands and y - amount < margin:
            new_page()
            return
        y -= amount

    for block in blocks:
        size, before, after, indent = _pdf_style(block)
        runs = _heading_runs(block) if block.kind.startswith("h") else block.runs
        chars = [(char, run.bold) for run in runs for char in run.text]
        marker = f"{block.marker} " if block.marker else ""
        marker_width = sum(regular.width(char, size) for char in marker)
        text_width = width - indent - marker_width
        lines = _wrap(chars, text_width, size, regular, bold) or [[]]
        gap(before)
        ascent = regular.ascent * size / regular.units
        leading = size * 1.35
        for index, line in enumerate(lines):
            if y - leading < margin:
                new_page()
            baseline = y - ascent
            x = margin + indent
            if index == 0 and marker:
                commands.append(_pdf_text(regular, "F1", marker, size, x, baseline, used))
                x += marker_width
            commands.append(_pdf_line(line, size, x, baseline, regular, bold, used))
            y -= leading
        gap(after)
    pages.append((commands, used))
    if not any(commands for commands, _glyphs in pages):
        return [(b"\n", {"F1": {}, "F2": {}})]
    return [(("\n".join(commands) + "\n").encode(), glyphs) for commands, glyphs in pages if commands]


def _subset_font(data: bytes, gids: set[int]) -> bytes:
    # Пустые слоты сохраняют исходные номера глифов, поэтому текст PDF не перекодируется.
    tables = _ttf_tables(data)
    loca = _loca_offsets(tables)
    needed = set(gids)
    needed.add(0)
    pending = list(needed)
    while pending:
        gid = pending.pop()
        for component in _composite_components(tables["glyf"], loca[gid], loca[gid + 1]):
            if component in needed:
                continue
            needed.add(component)
            pending.append(component)
    glyph_count = struct.unpack_from(">H", tables["maxp"], 4)[0]
    glyf = bytearray()
    offsets = [0]
    for gid in range(glyph_count):
        if gid in needed:
            glyf += tables["glyf"][loca[gid] : loca[gid + 1]]
        offsets.append(len(glyf))
    glyf += b"\x00" * ((4 - len(glyf) % 4) % 4)
    head = bytearray(tables["head"])
    struct.pack_into(">I", head, 8, 0)
    struct.pack_into(">h", head, 50, 1)
    packed = {
        "OS/2": tables.get("OS/2", b""),
        "cmap": tables["cmap"],
        "glyf": bytes(glyf),
        "head": bytes(head),
        "hhea": tables["hhea"],
        "hmtx": tables["hmtx"],
        "loca": b"".join(struct.pack(">I", offset) for offset in offsets),
        "maxp": tables["maxp"],
        "name": tables.get("name", b""),
        "post": tables.get("post", b""),
    }
    return _pack_ttf({tag: value for tag, value in packed.items() if value})


def _loca_offsets(tables: dict[str, bytes]) -> list[int]:
    glyph_count = struct.unpack_from(">H", tables["maxp"], 4)[0]
    loca = tables["loca"]
    if struct.unpack_from(">h", tables["head"], 50)[0] == 0:
        return [struct.unpack_from(">H", loca, index * 2)[0] * 2 for index in range(glyph_count + 1)]
    return [struct.unpack_from(">I", loca, index * 4)[0] for index in range(glyph_count + 1)]


def _composite_components(glyf: bytes, start: int, end: int) -> list[int]:
    if end < start + 10:
        return []
    contours = struct.unpack_from(">h", glyf, start)[0]
    if contours >= 0:
        return []
    components: list[int] = []
    cursor = start + 10
    while cursor + 4 <= end:
        flags, index = struct.unpack_from(">HH", glyf, cursor)
        components.append(index)
        cursor += 4
        cursor += 4 if flags & 1 else 2
        if flags & 8:
            cursor += 2
        elif flags & 64:
            cursor += 4
        elif flags & 128:
            cursor += 8
        if not flags & 32:
            break
    return components


def _table_checksum(data: bytes) -> int:
    padded = data + b"\x00" * ((4 - len(data) % 4) % 4)
    total = 0
    for offset in range(0, len(padded), 4):
        total = (total + struct.unpack_from(">I", padded, offset)[0]) & 0xFFFFFFFF
    return total


def _pack_ttf(tables: dict[str, bytes]) -> bytes:
    tags = sorted(tables)
    count = len(tags)
    largest = 1
    while largest * 2 <= count:
        largest *= 2
    entry_selector = largest.bit_length() - 1
    search_range = largest * 16
    directory = struct.pack(
        ">IHHHH",
        0x00010000,
        count,
        search_range,
        entry_selector,
        count * 16 - search_range,
    )
    offset = 12 + 16 * count
    records = b""
    blobs = b""
    for tag in tags:
        raw = tables[tag]
        padded = raw + b"\x00" * ((4 - len(raw) % 4) % 4)
        records += struct.pack(">4sIII", tag.encode("latin1"), _table_checksum(padded), offset, len(raw))
        blobs += padded
        offset += len(padded)
    font = bytearray(directory + records + blobs)
    head_record = 12 + 16 * tags.index("head")
    head_offset = struct.unpack_from(">I", font, head_record + 8)[0]
    adjustment = (0xB1B0AFBA - _table_checksum(bytes(font))) & 0xFFFFFFFF
    struct.pack_into(">I", font, head_offset + 8, adjustment)
    return bytes(font)
    if block.kind == "h1":
        return (18, 12, 8, 0)
    if block.kind == "h2":
        return (15, 10, 6, 0)
    if block.kind in {"h3", "h4"}:
        return (13, 8, 4, 0)
    if block.kind == "quote":
        return (11, 2, 6, 16)
    if block.kind == "li":
        return (11, 1, 2, 14 * block.depth)
    return (11, 2, 6, 0)


def _pdf_style(block: Block) -> tuple[float, float, float, float]:
    if block.kind == "h1":
        return (18, 12, 8, 0)
    if block.kind == "h2":
        return (15, 10, 6, 0)
    if block.kind in {"h3", "h4"}:
        return (13, 8, 4, 0)
    if block.kind == "quote":
        return (11, 2, 6, 16)
    if block.kind == "li":
        return (11, 1, 2, 14 * block.depth)
    return (11, 2, 6, 0)


def _wrap(
    chars: list[tuple[str, bool]],
    max_width: float,
    size: float,
    regular: _TrueType,
    bold: _TrueType,
) -> list[list[tuple[str, bool]]]:
    lines: list[list[tuple[str, bool]]] = []
    line: list[tuple[str, bool]] = []
    width = 0.0
    last_space = -1

    def measure(item: tuple[str, bool]) -> float:
        font = bold if item[1] else regular
        return font.width(item[0], size)

    for item in chars:
        item_width = measure(item)
        if item[0] == " ":
            last_space = len(line)
        if line and width + item_width > max_width:
            if last_space > 0:
                lines.append(line[:last_space])
                line = line[last_space + 1 :]
            else:
                lines.append(line)
                line = []
            width = sum(measure(kept) for kept in line)
            last_space = -1
        line.append(item)
        width += item_width
    if line:
        lines.append(line)
    return lines


def _pdf_line(
    line: list[tuple[str, bool]],
    size: float,
    x: float,
    y: float,
    regular: _TrueType,
    bold: _TrueType,
    used: dict[str, dict[int, str]],
) -> str:
    chunks: list[str] = []
    cursor = x
    index = 0
    while index < len(line):
        is_bold = line[index][1]
        end = index + 1
        while end < len(line) and line[end][1] == is_bold:
            end += 1
        text = "".join(char for char, _bold in line[index:end])
        font = bold if is_bold else regular
        key = "F2" if is_bold else "F1"
        chunks.append(_pdf_text(font, key, text, size, cursor, y, used))
        cursor += sum(font.width(char, size) for char in text)
        index = end
    return "\n".join(chunks)


def _pdf_text(
    font: _TrueType,
    key: str,
    text: str,
    size: float,
    x: float,
    y: float,
    used: dict[str, dict[int, str]],
) -> str:
    glyphs: list[str] = []
    for char in text:
        gid = font.glyph(char)
        used[key].setdefault(gid, char)
        glyphs.append(f"{gid:04X}")
    return f"BT /{key} {size:.2f} Tf 1 0 0 1 {x:.2f} {y:.2f} Tm <{''.join(glyphs)}> Tj ET"


def _assemble_pdf(
    pages: list[tuple[bytes, dict[str, dict[int, str]]]],
    regular: _TrueType,
    bold: _TrueType,
) -> bytes:
    # Объекты 3–12 заняты двумя шрифтами. Страницы и их потоки идут следом.
    page_numbers = list(range(13, 13 + len(pages)))
    content_numbers = list(range(13 + len(pages), 13 + 2 * len(pages)))
    merged = {"F1": {}, "F2": {}}
    for _content, glyphs in pages:
        for key, pairs in glyphs.items():
            merged[key].update(pairs)
    objects: list[bytes] = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        (
            f"<< /Type /Pages /Count {len(pages)} /Kids [{' '.join(f'{number} 0 R' for number in page_numbers)}] >>"
        ).encode(),
    ]
    objects.extend(_font_objects(regular, merged["F1"], 3))
    objects.extend(_font_objects(bold, merged["F2"], 8))
    for content_number, (content, _glyphs) in zip(content_numbers, pages):
        objects.append(
            (
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] "
                "/Resources << /Font << /F1 7 0 R /F2 12 0 R >> >> "
                f"/Contents {content_number} 0 R >>"
            ).encode()
        )
    for content, _glyphs in pages:
        objects.append(
            f"<< /Length {len(content)} >>\nstream\n".encode() + content + b"endstream"
        )
    return _pdf_bytes(objects)


def _font_objects(font: _TrueType, used: dict[int, str], first: int) -> list[bytes]:
    compressed = zlib.compress(font.data)
    file_object = (
        f"<< /Length {len(compressed)} /Length1 {len(font.data)} /Filter /FlateDecode >>\nstream\n".encode()
        + compressed
        + b"\nendstream"
    )
    x0, y0, x1, y1 = font.bbox
    descriptor = (
        f"<< /Type /FontDescriptor /FontName /{font.name} /Flags 32 "
        f"/FontBBox [{x0} {y0} {x1} {y1}] /ItalicAngle 0 /Ascent {font.ascent} "
        f"/Descent {font.descent} /CapHeight {font.ascent} /StemV 80 /FontFile2 {first} 0 R >>"
    ).encode()
    widths = " ".join(
        f"{gid} [{round(font._advances[gid if gid < len(font._advances) else -1] * 1000 / font.units)}]"
        for gid in sorted(used)
    )
    cid = (
        f"<< /Type /Font /Subtype /CIDFontType2 /BaseFont /{font.name} "
        f"/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> "
        f"/FontDescriptor {first + 1} 0 R /CIDToGIDMap /Identity /DW 500 /W [{widths}] >>"
    ).encode()
    unicode_map = _to_unicode(used).encode()
    unicode_object = f"<< /Length {len(unicode_map)} >>\nstream\n".encode() + unicode_map + b"endstream"
    type0 = (
        f"<< /Type /Font /Subtype /Type0 /BaseFont /{font.name} /Encoding /Identity-H "
        f"/DescendantFonts [{first + 2} 0 R] /ToUnicode {first + 3} 0 R >>"
    ).encode()
    return [file_object, descriptor, cid, unicode_object, type0]


def _to_unicode(used: dict[int, str]) -> str:
    pairs = sorted(used.items())
    lines = [
        "/CIDInit /ProcSet findresource begin",
        "12 dict begin",
        "begincmap",
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> def",
        "/CMapName /Adobe-Identity-UCS def",
        "/CMapType 2 def",
        "1 begincodespacerange",
        "<0000> <FFFF>",
        "endcodespacerange",
    ]
    for offset in range(0, len(pairs), 100):
        chunk = pairs[offset : offset + 100]
        lines.append(f"{len(chunk)} beginbfchar")
        for gid, char in chunk:
            lines.append(f"<{gid:04X}> <{char.encode('utf-16-be').hex().upper()}>")
        lines.append("endbfchar")
    if not pairs:
        lines.extend(["0 beginbfchar", "endbfchar"])
    lines.extend(["endcmap", "CMapName currentdict /CMap defineresource pop", "end", "end"])
    return "\n".join(lines) + "\n"


def _pdf_bytes(objects: list[bytes]) -> bytes:
    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    chunks = [header]
    offsets = [0]
    cursor = len(header)
    for number, body in enumerate(objects, start=1):
        chunk = f"{number} 0 obj\n".encode() + body + b"\nendobj\n"
        offsets.append(cursor)
        chunks.append(chunk)
        cursor += len(chunk)
    xref = [f"xref\n0 {len(objects) + 1}\n", "0000000000 65535 f \n"]
    xref.extend(f"{offset:010d} 00000 n \n" for offset in offsets[1:])
    trailer = f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{cursor}\n%%EOF\n"
    return b"".join(chunks) + "".join(xref).encode() + trailer.encode()


def _ttf_tables(data: bytes) -> dict[str, bytes]:
    if len(data) < 12:
        raise RuntimeError("Файл шрифта повреждён.")
    count = struct.unpack_from(">H", data, 4)[0]
    tables: dict[str, bytes] = {}
    offset = 12
    for _index in range(count):
        tag = data[offset : offset + 4].decode("latin1")
        start, length = struct.unpack_from(">II", data, offset + 8)
        tables[tag] = data[start : start + length]
        offset += 16
    return tables


def _head_metrics(table: bytes) -> tuple[int, tuple[int, int, int, int]]:
    units = struct.unpack_from(">H", table, 18)[0]
    bbox = struct.unpack_from(">hhhh", table, 36)
    return units, bbox


def _horizontal_metrics(hhea: bytes, hmtx: bytes) -> tuple[int, int, list[int]]:
    ascent, descent = struct.unpack_from(">hh", hhea, 4)
    count = struct.unpack_from(">H", hhea, 34)[0]
    advances = [struct.unpack_from(">H", hmtx, index * 4)[0] for index in range(count)]
    return ascent, descent, advances


def _cmap(table: bytes):
    subtables: list[tuple[int, int, int]] = []
    groups = struct.unpack_from(">H", table, 2)[0]
    for index in range(groups):
        platform, encoding, offset = struct.unpack_from(">HHI", table, 4 + index * 8)
        subtables.append((platform, encoding, offset))
    for platform, encoding, offset in subtables:
        if struct.unpack_from(">H", table, offset)[0] != 12:
            continue
        return _cmap12(table, offset)
    for platform, encoding, offset in subtables:
        if (platform, encoding) == (3, 1) and struct.unpack_from(">H", table, offset)[0] == 4:
            return _cmap4(table, offset)
    raise RuntimeError("В шрифте нет юникодной таблицы cmap.")


def _cmap12(table: bytes, offset: int):
    count = struct.unpack_from(">I", table, offset + 12)[0]
    groups: list[tuple[int, int, int]] = []
    cursor = offset + 16
    for _index in range(count):
        groups.append(struct.unpack_from(">III", table, cursor))
        cursor += 12

    def glyph(code: int) -> int:
        lo = 0
        hi = len(groups) - 1
        while lo <= hi:
            mid = (lo + hi) // 2
            start, end, start_glyph = groups[mid]
            if code < start:
                hi = mid - 1
                continue
            if code > end:
                lo = mid + 1
                continue
            return start_glyph + code - start
        return 0

    return glyph


def _cmap4(table: bytes, offset: int):
    seg_count = struct.unpack_from(">H", table, offset + 6)[0] // 2
    cursor = offset + 14
    ends = list(struct.unpack_from(f">{seg_count}H", table, cursor))
    cursor += seg_count * 2 + 2
    starts = list(struct.unpack_from(f">{seg_count}H", table, cursor))
    cursor += seg_count * 2
    deltas = list(struct.unpack_from(f">{seg_count}h", table, cursor))
    cursor += seg_count * 2
    offsets = list(struct.unpack_from(f">{seg_count}H", table, cursor))
    glyph_array_at = cursor + seg_count * 2

    def glyph(code: int) -> int:
        for index, end in enumerate(ends):
            if code > end:
                continue
            if code < starts[index]:
                return 0
            if offsets[index] == 0:
                return (code + deltas[index]) & 0xFFFF
            array_index = offsets[index] // 2 + (code - starts[index]) - (seg_count - index)
            gid = struct.unpack_from(">H", table, glyph_array_at + array_index * 2)[0]
            if gid == 0:
                return 0
            return (gid + deltas[index]) & 0xFFFF
        return 0

    return glyph


def _runs(text: str) -> list[Run]:
    runs: list[Run] = []
    cursor = 0
    for match in re.finditer(r"\*\*(.+?)\*\*|`([^`]+)`", text):
        if match.start() > cursor:
            runs.append(Run(text[cursor : match.start()], False))
        runs.append(Run(match.group(1) or match.group(2) or "", bool(match.group(1))))
        cursor = match.end()
    if cursor < len(text):
        runs.append(Run(text[cursor:], False))
    return [run for run in runs if run.text]


def _heading_runs(block: Block) -> tuple[Run, ...]:
    return tuple(Run(run.text, True) for run in block.runs)


def _docx_run(text: str, bold: bool) -> str:
    props = "<w:rPr><w:b/></w:rPr>" if bold else ""
    space = ' xml:space="preserve"' if text[:1] == " " or text[-1:] == " " or "  " in text else ""
    escaped = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return f"<w:r>{props}<w:t{space}>{escaped}</w:t></w:r>"


_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

_CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>
"""

_PACKAGE_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
"""

_DOCUMENT_RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
"""

_STYLES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:szCs w:val="30"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="160" w:after="60"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
</w:styles>
"""


if __name__ == "__main__":
    raise SystemExit(main())
