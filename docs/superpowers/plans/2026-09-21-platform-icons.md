# Platform icon implementation

Spec: [approved design](../specs/2026-09-21-platform-icons-design.md).

- [x] Preserve the supplied source; create full/compact SVG mark layers and native tile layers.
- [x] Add reproducible generation, container validation and a local visual comparison.
- [x] Integrate Desktop, shared UI, browser app and landing-page resources.
- [x] Run binary/visual checks, package typechecks/tests and both web builds.
- [x] Commit scoped inputs and build/verify DEB and AppImage from a clean snapshot.
- [x] Install Desktop, verify installed resources and isolated GUI, and record evidence.

Keep prod/beta/dev artwork identical. Preserve macOS 14+, Desktop version 0.1.6,
all user profiles, the installed CLI and other tasks' changes. No publication.

Результаты: [installed acceptance](../../testing/loginom-ai-agent/reports/2026-09-21-platform-icons/report.md).
