const codes = new Set([
  "LOGINOM_SCOPE_DENIED",
  "LOGINOM_RECOVERY_REQUIRED",
  "LOGINOM_CALL_UNCERTAIN",
  "LOGINOM_CALL_BUSY",
  "LOGINOM_CANDIDATE_INVALID",
  "LOGINOM_SAVE_INVALID",
  "LOGINOM_CANCEL_INVALID",
  "LOGINOM_RECOVERY_INVALID",
  "LOGINOM_API_KEY_REQUIRED",
  "LOGINOM_CONFIG_REQUIRED",
  "LOGINOM_CONNECTION_NOT_READY",
  "LOGINOM_URL_INVALID",
  "LOGINOM_USERNAME_INVALID",
  "LOGINOM_REVISION_CONFLICT",
  "LOGINOM_APPLICATION_PENDING",
  "LOGINOM_APPLICATION_COMMITTING",
  "LOGINOM_RECOVERY_BUSY",
  "LOGINOM_RECOVERY_CONFLICT",
  "LOGINOM_RECOVERY_UNAVAILABLE",
  "LOGINOM_VALIDATION_EXPIRED",
  "LOGINOM_CONNECTION_CHECK_FAILED",
  "LOGINOM_KNOWLEDGE_AUTH_FAILED",
  "LOGINOM_KNOWLEDGE_UNAVAILABLE",
  "LOGINOM_KNOWLEDGE_FAILED",
  "LOGINOM_KNOWLEDGE_TOOL_DENIED",
  "LOGINOM_KNOWLEDGE_INTERRUPTED",
  "LOGINOM_KNOWLEDGE_REQUEST_INVALID",
  "LOGINOM_KNOWLEDGE_REQUEST_BUSY",
  "LOGINOM_KNOWLEDGE_CATALOG_INVALID",
  "LOGINOM_KNOWLEDGE_CLOSED",
  "LOGINOM_LOGIN_REJECTED",
  "LOGINOM_ACCOUNT_MISMATCH",
  "LOGINOM_LOGIN_UNAVAILABLE",
  "LOGINOM_BROWSER_START_FAILED",
  "LOGINOM_RUNTIME_START_FAILED",
  "LOGINOM_RUNTIME_UNAVAILABLE",
  "LOGINOM_STORE_READ_FAILED",
  "LOGINOM_STORE_WRITE_FAILED",
  "LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE",
  "LOGINOM_CREDENTIAL_FORMAT_INVALID",
  "LOGINOM_HOST_CLOSED",
  "LOGINOM_HOST_NOT_READY",
  "LOGINOM_HOST_CLEANUP_FAILED",
  "LOGINOM_HANDSHAKE_INVALID",
  "LOGINOM_METHOD_INVALID",
  "LOGINOM_INPUT_INVALID",
  "LOGINOM_INPUT_IDENTITY_CONFLICT",
  "LOGINOM_FILE_TOO_LARGE",
  "LOGINOM_FILE_NOT_FOUND",
  "LOGINOM_FILE_NOT_REGULAR",
  "LOGINOM_FILE_ACCESS_DENIED",
  "LOGINOM_FILE_CHANGED",
  "LOGINOM_UPLOAD_CANCELLED",
  "LOGINOM_UPLOAD_UNCERTAIN",
])

export function hostError(value: unknown) {
  const code =
    value instanceof Error
      ? value.message
      : value && typeof value === "object" && "error" in value
        ? value.error
        : value
  return typeof code === "string" && codes.has(code) ? code : "LOGINOM_HOST_REQUEST_FAILED"
}

const reasons: Record<string, string> = {
  LOGINOM_FILE_TOO_LARGE: "Файл превышает лимит этого способа передачи.",
  LOGINOM_FILE_NOT_FOUND: "Файл не найден. Укажите существующий путь.",
  LOGINOM_FILE_NOT_REGULAR: "Нужен обычный файл, а не каталог или специальный файл.",
  LOGINOM_FILE_ACCESS_DENIED: "Доступ к файлу запрещён. Не повторяйте чтение обходным путём.",
  LOGINOM_FILE_CHANGED: "Файл изменился. Заново выберите и подтвердите актуальный файл.",
  LOGINOM_UPLOAD_CANCELLED: "Загрузка отменена.",
  LOGINOM_UPLOAD_UNCERTAIN: "Остановка или уборка загрузки не подтверждена. Не отправляйте файл повторно.",
}

// Private IPC carries only these fields. Never forward an exception's message,
// path, cause, stack, file bytes or arbitrary details across the trust boundary.
export function hostFailure(value: unknown) {
  const error = hostError(value)
  const reason = reasons[error]
  if (!reason) return { error }
  const source = value && typeof value === "object" && "details" in value ? value.details : undefined
  const details: { reason: string; actual?: number; limit?: number; hint?: string } = { reason }
  if (error === "LOGINOM_FILE_TOO_LARGE") {
    for (const key of ["actual", "limit"] as const) {
      const number = source && typeof source === "object" ? Reflect.get(source, key) : undefined
      if (typeof number === "number" && Number.isSafeInteger(number) && number >= 0) details[key] = number
    }
    details.hint = "Укажите путь; для больших файлов будет профиль и выборка. Сейчас выберите файл меньшего размера."
  }
  return { error, details }
}

export function hostException(value: unknown) {
  const failure = hostFailure(value)
  return Object.assign(new Error(failure.error), failure.details ? { details: failure.details } : {})
}

export function hostErrorText(value: unknown) {
  const failure = hostFailure(value)
  return failure.error + (failure.details ? ": " + JSON.stringify(failure.details) : "")
}

export function fileError(value: unknown) {
  const code = value && typeof value === "object" && "code" in value ? value.code : undefined
  const reason = value && typeof value === "object" && "reason" in value ? value.reason : undefined
  const tag = reason && typeof reason === "object" && "_tag" in reason ? reason._tag : undefined
  return hostException(
    ["ENOENT", "ENOTDIR"].includes(String(code)) || tag === "NotFound"
      ? "LOGINOM_FILE_NOT_FOUND"
      : ["EACCES", "EPERM"].includes(String(code)) || tag === "PermissionDenied"
        ? "LOGINOM_FILE_ACCESS_DENIED"
        : code === "EISDIR"
          ? "LOGINOM_FILE_NOT_REGULAR"
          : value,
  )
}
