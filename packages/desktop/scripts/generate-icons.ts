import { resolve } from "node:path"
import sharp from "sharp"

const root = resolve(import.meta.dir, "../../..")
const icons = "packages/desktop/icons"
const web = "packages/ui/src/assets/loginom"
const sizes = [16, 24, 32, 48, 64, 96, 128, 256, 512]
const platforms = ["windows", "linux", "macos"] as const

export async function generateIcons(options: { check?: boolean; preview?: boolean } = {}) {
  const files = new Map<string, Uint8Array | string>()
  const masters = Object.fromEntries(
    await Promise.all(
      [...platforms, "web", "mark", "mark-small"].map(async (name) => [
        name,
        (await Bun.file(resolve(root, icons, "masters", `${name}.svg`)).text())
          .replace(/^<svg[^>]*>/, "")
          .replace(/<\/svg>\s*$/, ""),
      ]),
    ),
  )
  const svg = (platform: string, small = false, maskable = false) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">${masters[platform]}<g${maskable ? ' transform="translate(51.2 51.2) scale(.9)"' : ""}>${masters[small ? "mark-small" : "mark"]}</g></svg>\n`
  const png = (platform: string, size: number, small = size <= 32, maskable = false) =>
    sharp(Buffer.from(svg(platform, small, maskable)))
      .resize(size, size)
      .png()
      .toBuffer()
  const rendered = new Map<string, Buffer>()
  await Promise.all(
    platforms.flatMap((platform) =>
      [...sizes, 1024].map(async (size) => {
        const buffer = await png(platform, size)
        rendered.set(`${platform}-${size}`, buffer)
        files.set(`${icons}/preview/${platform}-${size}.png`, buffer)
      }),
    ),
  )
  const image = (platform: string, size: number) => {
    const buffer = rendered.get(`${platform}-${size}`)
    if (!buffer) throw Error(`Missing icon: ${platform} ${size}`)
    return buffer
  }
  const ico = encodeIco([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: image("windows", size) })))
  const icns = encodeIcns([
    ...(["icp4", "icp5", "icp6", "ic07", "ic08", "ic09", "ic10"] as const).map((type, index) => ({
      type,
      png: image("macos", [16, 32, 64, 128, 256, 512, 1024][index]!),
    })),
    // Retina 16pt/32pt slots retain the compact artwork even at 32/64 physical pixels.
    { type: "ic11", png: await png("macos", 32, true) },
    { type: "ic12", png: await png("macos", 64, true) },
    { type: "ic13", png: image("macos", 256) },
    { type: "ic14", png: image("macos", 512) },
  ])
  ;["prod", "beta", "dev"].forEach((channel) => {
    files.set(`${icons}/${channel}/icon.ico`, ico)
    files.set(`${icons}/${channel}/icon.icns`, icns)
    files.set(`${icons}/${channel}/icon.png`, image("linux", 512))
    files.set(`${icons}/${channel}/dock.png`, image("macos", 1024))
    sizes.forEach((size) => files.set(`${icons}/${channel}/linux/${size}x${size}.png`, image("linux", size)))
    ;[32, 64, 128].forEach((size) => files.set(`${icons}/${channel}/${size}x${size}.png`, image("linux", size)))
    files.set(`${icons}/${channel}/128x128@2x.png`, image("linux", 256))
  })

  const favicons = await Promise.all(
    [16, 32, 48].map(async (size) => ({ size, png: await png("windows", size, true) })),
  )
  const assets = new Map<string, Uint8Array | string>([
    ["loginom-icon.svg", svg("linux")],
    ["loginom-icon.png", image("linux", 128)],
    ["loginom-favicon-v1.svg", svg("windows", true)],
    ["loginom-favicon-v1.ico", encodeIco(favicons)],
    ["loginom-apple-touch-v1.png", await png("web", 180, false)],
  ])
  await Promise.all(
    [16, 32, 96].map(async (size) => assets.set(`loginom-favicon-${size}-v1.png`, await png("windows", size, true))),
  )
  await Promise.all(
    [192, 512].flatMap((size) =>
      [false, true].map(async (maskable) =>
        assets.set(
          `loginom-app-${size}${maskable ? "-maskable" : ""}-v1.png`,
          await png(maskable ? "web" : "linux", size, false, maskable),
        ),
      ),
    ),
  )
  assets.forEach((buffer, name) => {
    ;[web, "packages/app/public", "packages/app/public-static", "apps/loginom-site/assets"].forEach((directory) =>
      files.set(`${directory}/${name}`, buffer),
    )
  })
  const manifest = (landing: boolean) =>
    JSON.stringify(
      {
        name: landing ? "Loginom Dock" : "Loginom AI Agent",
        short_name: landing ? "Loginom Dock" : "Loginom AI",
        id: "/",
        start_url: "/",
        scope: "/",
        icons: [192, 512].flatMap((size) =>
          [false, true].map((maskable) => ({
            src: `${landing ? "/assets" : ""}/loginom-app-${size}${maskable ? "-maskable" : ""}-v1.png`,
            sizes: `${size}x${size}`,
            type: "image/png",
            purpose: maskable ? "maskable" : "any",
          })),
        ),
        theme_color: "#fafafa",
        background_color: "#fafafa",
        display: landing ? "browser" : "standalone",
      },
      null,
      2,
    ) + "\n"
  ;[web, "packages/app/public", "packages/app/public-static"].forEach((directory) =>
    files.set(`${directory}/loginom-app-v1.webmanifest`, manifest(false)),
  )
  files.set("apps/loginom-site/assets/loginom-site-v1.webmanifest", manifest(true))
  files.set(
    `${icons}/preview/source.png`,
    new Uint8Array(await Bun.file(resolve(root, icons, "source.png")).arrayBuffer()),
  )
  files.set(`${icons}/preview/index.html`, previewHtml())
  const selected = [...files].filter(([name]) => !options.preview || name.startsWith(`${icons}/preview/`))
  await Promise.all(
    selected.map(async ([name, buffer]) => {
      const path = resolve(root, name)
      if (!options.check) return Bun.write(path, buffer)
      if (!(await Bun.file(path).exists())) throw Error(`Missing generated icon: ${name}`)
      if (!Buffer.from(await Bun.file(path).arrayBuffer()).equals(Buffer.from(buffer)))
        throw Error(`Stale generated icon: ${name}`)
    }),
  )
  console.log(`${options.check ? "Verified" : "Generated"} ${selected.length} icon assets`)
}

// Windows 11 accepts PNG payloads at every ICO size. Each frame is independently drawn.
function encodeIco(frames: { size: number; png: Buffer }[]) {
  const header = Buffer.alloc(6 + frames.length * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)
  frames.forEach((frame, index) => {
    const offset = 6 + index * 16
    header.writeUInt8(frame.size === 256 ? 0 : frame.size, offset)
    header.writeUInt8(frame.size === 256 ? 0 : frame.size, offset + 1)
    header.writeUInt16LE(1, offset + 4)
    header.writeUInt16LE(32, offset + 6)
    header.writeUInt32LE(frame.png.length, offset + 8)
    header.writeUInt32LE(
      header.length + frames.slice(0, index).reduce((sum, item) => sum + item.png.length, 0),
      offset + 12,
    )
  })
  return Buffer.concat([header, ...frames.map((frame) => frame.png)])
}

function encodeIcns(frames: { type: string; png: Buffer }[]) {
  const blocks = frames.map((frame) => {
    const header = Buffer.alloc(8)
    header.write(frame.type)
    header.writeUInt32BE(frame.png.length + 8, 4)
    return Buffer.concat([header, frame.png])
  })
  const header = Buffer.alloc(8)
  header.write("icns")
  header.writeUInt32BE(8 + blocks.reduce((sum, block) => sum + block.length, 0), 4)
  return Buffer.concat([header, ...blocks])
}

function previewHtml() {
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Loginom AI — иконки</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f4f3f0;color:#252830;font:15px system-ui}main{max-width:1220px;margin:auto;padding:32px}h1{font-size:30px;margin:0}p{line-height:1.6;color:#65666c}header{margin-bottom:26px}.controls{display:flex;gap:8px;margin:20px 0}button{font:inherit;border:1px solid #bbb;border-radius:6px;background:white;padding:8px 16px;cursor:pointer}button[aria-pressed=true]{background:#252830;color:white}.comparison{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:#bcbec1;border:1px solid #bcbec1;border-radius:10px;overflow:hidden}.sample{padding:22px;text-align:center;background:var(--surface,#fff);color:var(--ink,#252830)}.sample h2{font-size:16px;font-weight:500}.hero{width:100%;max-width:210px;aspect-ratio:1;object-fit:contain}.sizes{display:flex;align-items:center;gap:20px;min-height:80px;flex-wrap:wrap}.row{padding:20px 0;border-bottom:1px solid #cecece}.row h2{font-size:16px}.small{display:grid;justify-items:center;gap:9px;font:12px ui-monospace}.strip{background:var(--surface,#fff);color:var(--ink,#252830);padding:18px;border-radius:8px}body[data-bg=dark]{--surface:#22242b;--ink:#eee}body[data-bg=color]{--surface:#42706e;--ink:#fff}.note{font-size:13px}footer{margin-top:25px}@media(max-width:700px){.comparison{grid-template-columns:repeat(2,1fr)}main{padding:18px}}</style>
<main><header><h1>Loginom AI — семейство иконок</h1><p>Один знак, три подложки. Вокруг плитки — прозрачность.<br>В малых размерах остаётся красная L, крупные сохраняют полную композицию.</p></header>
<div class="controls" aria-label="Фон предпросмотра">${["Светлый", "Тёмный", "Цветной"].map((name, index) => `<button aria-pressed="${index === 0}" data-bg="${["light", "dark", "color"][index]}">${name}</button>`).join("")}</div>
<section class="comparison"><article class="sample"><h2>Исходник</h2><img class="hero" src="source.png" alt="Исходное изображение"><div class="note">Непрозрачный внешний фон</div></article>${platforms.map((platform) => `<article class="sample"><h2>${platform === "macos" ? "macOS" : platform === "linux" ? "Linux" : "Windows"}</h2><img class="hero" src="${platform}-512.png" alt="Иконка ${platform}"><div class="note">Прозрачность за краем плитки</div></article>`).join("")}</section>
${platforms.map((platform) => `<section class="row"><h2>${platform === "macos" ? "macOS" : platform === "linux" ? "Linux" : "Windows"} · реальные размеры</h2><div class="strip sizes">${[16, 24, 32, 48, 64, 128].map((size) => `<div class="small"><img width="${size}" height="${size}" src="${platform}-${size}.png" alt="${size} пикселей"><span>${size}px</span></div>`).join("")}</div></section>`).join("")}
<footer><p class="note">Это предпросмотр ресурсов, а не доказательство внешнего вида установленного приложения на Windows/macOS. Для этих ОС требуется нативная проверка.</p></footer></main>
<script>document.querySelectorAll('button[data-bg]').forEach(button=>button.addEventListener('click',()=>{document.body.dataset.bg=button.dataset.bg;document.querySelectorAll('button[data-bg]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)))}))</script></html>\n`
}

if (import.meta.main)
  await generateIcons({ check: process.argv.includes("--check"), preview: process.argv.includes("--preview") })
