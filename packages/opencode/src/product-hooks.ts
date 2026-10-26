import { installationNode } from "./product/installation"
import { toolPolicy } from "./product/tool-policy"
import { skillSource } from "./product/skill-source"

// Fork-owned seams between upstream files and Loginom code. Upstream files call
// these members instead of carrying the product behavior inline; the
// implementations live under ./product and are the default, so no composition
// root has to wire them. See docs/upstream-sync/adr-0001-modular-integration.md.
export const ProductHooks = {
  installationNode,
  skillSource,
  toolPolicy,
} as const
