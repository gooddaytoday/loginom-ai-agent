export type ResourceBound = { scope: string; metric: string; minimum: number | null; maximum: number | null }

export function validResourceBound(value: unknown): value is ResourceBound {
  const bound = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return typeof bound.scope === "string" && Boolean(bound.scope.trim()) && typeof bound.metric === "string" && Boolean(bound.metric.trim()) &&
    [bound.minimum, bound.maximum].every(value => value === null || typeof value === "number" && Number.isFinite(value) && value >= 0) &&
    (bound.minimum !== null || bound.maximum !== null) && (bound.minimum === null || bound.maximum === null || Number(bound.minimum) <= Number(bound.maximum))
}
