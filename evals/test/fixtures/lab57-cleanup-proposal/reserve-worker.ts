import { reserveRecordArchive } from "../../../src/lab57-record-archive"
const reservation=await reserveRecordArchive(await Bun.file(Bun.argv[2]!).json())
await Bun.write(Bun.argv[3]!,JSON.stringify(reservation),{mode:0o600})
process.exit(17) // End the original operation after durable reservation, before archive.
