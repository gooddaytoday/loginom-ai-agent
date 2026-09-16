# Product build inputs

`src/index.ts` owns application names, channels, paths and update policy. `loginom-release.json` pins the managed Linux runtime and its input hashes.

`models.json` is a public snapshot of https://models.dev/api.json retrieved on 2026-09-16. Desktop builds consume this committed snapshot through the existing MODELS_DEV_API_JSON build option. Update the snapshot and its modelsSha256 together, then rebuild and validate the artifacts. Runtime provider configuration and normal model connections are unchanged.

Do not format the snapshot without updating its hash. Credentials do not belong in these files. A production update feed remains disabled until its separate acceptance succeeds.
