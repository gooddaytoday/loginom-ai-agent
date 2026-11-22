export const available = true

export async function resolveBinary() {
  return process.env.LOGINOM_AI_AGENT_PTY_BIN || "loginom-ai-agent-pty"
}
