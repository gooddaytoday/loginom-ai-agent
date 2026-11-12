export {}

const chunks: Buffer[] = []
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk))
await Bun.write(process.env.LOGINOM_DESKTOP_INPUT_REPORT!, Buffer.concat(chunks))
