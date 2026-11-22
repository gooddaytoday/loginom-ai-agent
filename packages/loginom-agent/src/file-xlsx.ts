// Placeholder for 0.4 `packages/opencode/src/tool/loginom-file-xlsx.ts` (XLSX profiles, scans and samples), which stage
// B2.5b2 ports. `file-profile-core.ts` dispatches a ZIP workbook here exactly as in 0.4; until then every workbook is
// refused. The options type is 0.4's.
export type XlsxOptions = {
  sheet_name?: string
  header_rows?: number
  blank_rows?: "import" | "skip"
  first_line_as_title?: boolean
  rows_to_skip?: number
  signal?: AbortSignal
  authorized_path?: string
}

function unsupported(): never {
  throw Error("LOGINOM_FILE_XLSX_UNSUPPORTED: XLSX workbooks are not supported in this build")
}

export async function profileXlsx(_path: string, _dir: string, _options: XlsxOptions = {}): Promise<never> {
  return unsupported()
}

export async function pageXlsx(_id: string, _dir: string, _continuation = "0"): Promise<never> {
  return unsupported()
}

export async function scanXlsx(_id: string, _dir: string, _options: { signal?: AbortSignal } = {}): Promise<never> {
  return unsupported()
}

export async function sampleXlsx(
  _id: string,
  _dir: string,
  _options: { seed?: number; max_records?: number; max_bytes?: number; signal?: AbortSignal } = {},
): Promise<never> {
  return unsupported()
}
