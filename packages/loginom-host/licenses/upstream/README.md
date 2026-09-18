# Supplemental upstream license texts

Exact package versions map either to the gitHead published in npm metadata, or
to an official version tag resolved to a commit with matching package.json name
and version. Drizzle uses npm-published provenance: the registry integrity and
actual tarball digest match its subject; the provenance signature was not independently
verified. sources.json distinguishes these evidence kinds and records their limits.
Most texts are copied verbatim from immutable URLs. abstract-logging uses a derived
supplement from the linked service's MIT template and explicit author copyright
field, with no inferred year; its transformation and both sources are recorded.
SHA256 is verified
before copying at build time, without network access. Some upstream LICENSE files
contain copyright and license references rather than the full standard license.
This supplies missing root notices only; complete license texts and native,
transitive and nested notices still need separate audit.

SPDX and AWS supplements concatenate verbatim package attribution/metadata with
the declared standard license text from a pinned SPDX data commit. AWS tarball
integrity and byte identity of installed package metadata/README were verified;
no absent gitHead or copyright holder is inferred. Sources record transformations.
