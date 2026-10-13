import type { SlotFile } from "./slots"
import { EvalFailure } from "./fail"

const ownerNonce = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

export const pairImages = {
  server: "sha256:d138ce018adb4959282e65f5e5b7fe58265706d6c8c5a432022e4400ca387d1a",
  studio: "sha256:69ce44ac1002dea3d3a78b5e35eb9175a352530ecd3f05bdb727d63895004e28",
}

export function planPair(server: SlotFile["server"], purpose: "acceptance" | "research", nonce: string) {
  const url = URL.parse(server.url)
  if (!url || url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port === "0" || url.username || url.password || url.hash || url.search ||
    server.network === "loginom-net" || server.container === server.studioContainer ||
    [server.container, server.studioContainer, server.network, server.alias].some(name => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(name)) ||
    !["acceptance", "research"].includes(purpose) || !ownerNonce.test(nonce)) throw new EvalFailure("PAIR_CONFIGURATION", 2)
  const labels = ["--label", "loginom.evals.kind=users", "--label", `loginom.evals.purpose=${purpose}`, "--label", `loginom.evals.nonce=${nonce}`]
  return {
    network: ["network", "create", ...labels, server.network],
    server: ["create", "--name", server.container, ...labels, "--restart=no", `--network=${server.network}`, `--network-alias=${server.alias}`, pairImages.server],
    studio: ["create", "--name", server.studioContainer, ...labels, "--restart=no", `--network=${server.network}`, "--publish", `127.0.0.1:${url.port || "80"}:80`, pairImages.studio],
  }
}

export function usersMarker(containerId: string, nonce: string) {
  if (!/^[a-f0-9]{64}$/.test(containerId) || !ownerNonce.test(nonce)) throw new EvalFailure("PAIR_MARKER", 2)
  return { kind: "loginom-evals-users" as const, version: 2 as const, container_id: containerId, owner_nonce: nonce,
    roots: ["/workdir/UserStorage", "/workdir/SessionBackup"], inventory: [] as { username: string; storage_dir: string; owner_nonce: string }[] }
}
