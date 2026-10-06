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
