# Cold replay planner fixture

Read-only copies of `sales-by-category/reference.lgp` and `data/dataset.csv`
from the accepted agent-validation snapshot
`d5fb8031356ecf17a08c73f5d15a0b2df52af8b6`. The input is generated test data.

- `sales.lgp`: `ad9e8e3b8e63597d724a26fc88f1fa17dc0c9b396ada0624a2756d13238b3790`.
- `dataset.csv`: `673fc3a6482c19baf96a2221a3964c151716a9c5e66837601df3d8de6316d1a8`.

Tests exercise the public replay planner with a real saved graph, export GUID
and original input binding. They never connect to Loginom or execute the package.
These files are outside product resources and the evaluated agent's mounts.
