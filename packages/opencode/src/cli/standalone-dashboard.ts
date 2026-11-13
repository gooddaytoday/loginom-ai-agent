const conflicts = ["--dir", "--attach", "--continue", "-c", "--session", "-s", "--fork", "--command"]

export function dashboardFlag(args: string[], mode: "run" | "tui") {
  const boundary = args.indexOf("--") < 0 ? args.length : args.indexOf("--")
  const index = args.findIndex(
    (value, position) => position < boundary && (value === "--dashboard" || value.startsWith("--dashboard=")),
  )
  if (index < 0) return
  const inline = args[index]!.startsWith("--dashboard=")
  const id = inline ? args[index]!.slice("--dashboard=".length) : args[index + 1]
  const flags = args.slice(0, boundary)
  if (
    mode !== "run" ||
    !id ||
    id.startsWith("-") ||
    flags.some((value) => conflicts.some((option) => value === option || value.startsWith(option + "=")))
  )
    return "invalid" as const
  return { id, rest: args.toSpliced(index, inline ? 1 : 2) }
}
