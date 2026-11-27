export const providerPrefix = "loginom-model-server-"

export function isModelServerID(id: string) {
  return (
    id.startsWith(providerPrefix) &&
    /^(?:[a-f\d]{64}|[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12})$/u.test(id.slice(providerPrefix.length))
  )
}
