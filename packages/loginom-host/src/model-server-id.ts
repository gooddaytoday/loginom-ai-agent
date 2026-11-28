export const providerPrefix = "loginom-model-server-"

export function isModelServerID(id: string) {
  return id.startsWith(providerPrefix) && /^[a-f\d]{64}$/u.test(id.slice(providerPrefix.length))
}
