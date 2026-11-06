// Удаляет диагностические runtime attempts профиля CLI функцией eval-harness. Авторизация, БД сессий и stores остаются.
import { existsSync } from "node:fs"
import path from "node:path"
import { readSettings } from "./settings"

const settings = readSettings("AGENT_REPO", "PROFILE")
const writer = path.join(settings.PROFILE, ".writer")
// pruneRuntimeAttempts снимает оставшийся .writer, а skill оставляет это решение пользователю
if (existsSync(writer)) {
  console.error(`профиль занят: ${writer}`)
  process.exit(3)
}
const { pruneRuntimeAttempts } = await import(path.join(settings.AGENT_REPO, "evals/src/profile.ts"))
console.log(`удалено каталогов attempts: ${await pruneRuntimeAttempts(settings.PROFILE)}`)
