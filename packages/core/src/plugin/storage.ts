export function storageNamespace(pluginID: string) {
  return `plugin:${pluginID
    .split("")
    .map((value) => value.charCodeAt(0).toString(16).padStart(4, "0"))
    .join("")}:`
}
