# Package documentation fixtures

Synthetic two-node package and Python oracle saved before product changes at
fc3d97dbf695c2ed8dba942feb6fe83591a33944 (2026-10-06). The extractor contract is
package_docs.structure.v1. Compare normalized structure and report text;
ZIP/PDF byte identity and the skeleton generation timestamp are not required.

Nested and ZIP case/backslash variants use the frozen Python extractor from the
same SHA (source SHA-256 a9e18aa779dc48fe560a5790ba9275bb08f48df0080dd9b02e7d9f8a708c2bff).
`deep.lgp` has eight nodes, three submodels and four workflow levels. Its full
statistics are asserted independently because the Python default depth limit
omits the last descendants. All variants use ZIP deflate.
`missing-unit.lgp` retains the indexed module while omitting its Unit.xml;
this has an independent error expectation, not the permissive Python output.
`notes.lgp` exercises direct annotation text, attributes, duplicate values and
nested notes against the frozen Python oracle.
`references.lgp` exercises external dependency names, display names, paths,
duplicates and XML order. `views.lgp` adds visualizer identities and labels;
visualizers do not change workflow statistics. Both use the same frozen oracle.

Skeleton Markdown variants were rendered by the unchanged Python source at
the same baseline SHA (source SHA-256 0bbb539bc8981f0b7eb7ca712ee84873df230a173844b596620186be9d89e0a9).
Only the generation timestamp is normalized during comparison.

`demo.report.md` and `demo.word-document.xml` retain the saved baseline output.
Formatting and nested report/Word XML variants use the unchanged baseline
emit_report.py (source SHA-256 098deb4455a5e428c4aab6544bbeaa13dc0c2081525675ee38c61ec3fde70426).
DOCX archive timestamps/bytes are not compared.
