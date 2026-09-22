import { expect, test } from "bun:test"
import { resolve } from "node:path"
import sharp from "sharp"

const root = resolve(import.meta.dir, "../../..")
const icons = resolve(root, "packages/desktop/icons")
const web = resolve(root, "packages/ui/src/assets/loginom")

test("every Windows ICO frame decodes at its declared size with transparent corners", async () => {
  const ico = Buffer.from(await Bun.file(resolve(icons, "prod/icon.ico")).arrayBuffer())
  expect(ico.readUInt16LE(0)).toBe(0)
  expect(ico.readUInt16LE(2)).toBe(1)
  expect(ico.readUInt16LE(4)).toBe(7)
  await Promise.all(
    [16, 24, 32, 48, 64, 128, 256].map(async (size, index) => {
      const entry = 6 + index * 16
      expect(ico[entry] || 256).toBe(size)
      expect(ico[entry + 1] || 256).toBe(size)
      const offset = ico.readUInt32LE(entry + 12)
      const bytes = ico.readUInt32LE(entry + 8)
      expect(offset + bytes).toBeLessThanOrEqual(ico.length)
      await checkPng(ico.subarray(offset, offset + bytes), size, size <= 32)
    }),
  )
})

test("ICNS has decodable classic and Retina slots with compact artwork at small logical sizes", async () => {
  const icns = Buffer.from(await Bun.file(resolve(icons, "prod/icon.icns")).arrayBuffer())
  expect(icns.toString("ascii", 0, 4)).toBe("icns")
  expect(icns.readUInt32BE(4)).toBe(icns.length)
  const expected = new Map([
    ["icp4", 16],
    ["icp5", 32],
    ["icp6", 64],
    ["ic07", 128],
    ["ic08", 256],
    ["ic09", 512],
    ["ic10", 1024],
    ["ic11", 32],
    ["ic12", 64],
    ["ic13", 256],
    ["ic14", 512],
  ])
  let offset = 8
  while (offset < icns.length) {
    const type = icns.toString("ascii", offset, offset + 4)
    const length = icns.readUInt32BE(offset + 4)
    const size = expected.get(type)
    expect(size).toBeDefined()
    expect(length).toBeGreaterThan(8)
    expect(offset + length).toBeLessThanOrEqual(icns.length)
    const frame = icns.subarray(offset + 8, offset + length)
    await checkPng(frame, size!, ["icp4", "icp5", "ic11", "ic12"].includes(type))
    if (type === "ic10")
      expect(frame.equals(Buffer.from(await Bun.file(resolve(icons, "prod/dock.png")).arrayBuffer()))).toBe(true)
    expected.delete(type)
    offset += length
  }
  expect(offset).toBe(icns.length)
  expect(expected.size).toBe(0)
})

test("Linux sizes and active channel resources are identical across prod, beta and dev", async () => {
  const names = [
    "icon.png",
    "icon.ico",
    "icon.icns",
    "dock.png",
    ...[16, 24, 32, 48, 64, 96, 128, 256, 512].map((size) => `linux/${size}x${size}.png`),
  ]
  await Promise.all(
    names.map(async (name) => {
      const prod = Buffer.from(await Bun.file(resolve(icons, "prod", name)).arrayBuffer())
      await Promise.all(
        ["beta", "dev"].map(async (channel) =>
          expect(Buffer.from(await Bun.file(resolve(icons, channel, name)).arrayBuffer()).equals(prod)).toBe(true),
        ),
      )
      const size = Number(name.match(/linux\/(\d+)x/)?.[1])
      if (size) await checkPng(prod, size, size <= 32)
    }),
  )
})

test("web copies match, manifests have separate any/maskable icons and all links resolve", async () => {
  for await (const name of new Bun.Glob("*").scan(web)) {
    const source = Buffer.from(await Bun.file(resolve(web, name)).arrayBuffer())
    await Promise.all(
      ["packages/app/public", "packages/app/public-static"].map(async (directory) =>
        expect(Buffer.from(await Bun.file(resolve(root, directory, name)).arrayBuffer()).equals(source)).toBe(true),
      ),
    )
  }
  await Promise.all(
    [
      ["packages/app/index.html", "packages/app/public-static", "Loginom AI Agent"],
      ["apps/loginom-site/index.html", "apps/loginom-site", "Loginom Dock"],
    ].map(async ([html, directory, name]) => {
      const page = await Bun.file(resolve(root, html!)).text()
      const paths = [...page.matchAll(/href="([^"]*loginom-(?:favicon|apple-touch|app|site)[^"]*)"/g)].map(
        (match) => match[1]!,
      )
      expect(paths.length).toBe(5)
      await Promise.all(
        paths.map(async (path) => expect(await Bun.file(resolve(root, directory!, path.slice(1))).exists()).toBe(true)),
      )
      const manifest = await Bun.file(
        resolve(root, directory!, paths.find((path) => path.endsWith(".webmanifest"))!.slice(1)),
      ).json()
      expect(manifest.name).toBe(name)
      expect(manifest.icons.map((icon: { purpose: string }) => icon.purpose)).toEqual([
        "any",
        "maskable",
        "any",
        "maskable",
      ])
      await Promise.all(
        manifest.icons.map(async (icon: { src: string }) =>
          expect(await Bun.file(resolve(root, directory!, icon.src.slice(1))).exists()).toBe(true),
        ),
      )
    }),
  )
})

test("maskable artwork fits the 80% safe circle; home-screen images are opaque", async () => {
  await Promise.all(
    [192, 512].map(async (size) => {
      const image = await sharp(resolve(web, `loginom-app-${size}-maskable-v1.png`))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      expect(image.info.width).toBe(size)
      expect(image.info.height).toBe(size)
      const pixels = Array.from({ length: size * size }, (_, index) => index)
      expect(pixels.every((index) => image.data[index * 4 + 3] === 255)).toBe(true)
      const foreground = pixels.filter((index) => Math.min(...image.data.subarray(index * 4, index * 4 + 3)) < 180)
      expect(foreground.length).toBeGreaterThan(0)
      expect(
        foreground.every(
          (index) =>
            Math.hypot((index % size) + 0.5 - size / 2, Math.floor(index / size) + 0.5 - size / 2) <= size * 0.4,
        ),
      ).toBe(true)
    }),
  )
  const apple = await sharp(resolve(web, "loginom-apple-touch-v1.png")).ensureAlpha().raw().toBuffer()
  expect(
    Array.from(apple)
      .filter((_, index) => index % 4 === 3)
      .every((alpha) => alpha === 255),
  ).toBe(true)
})

async function checkPng(png: Buffer, size: number, compact: boolean) {
  const image = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  expect(image.info.width).toBe(size)
  expect(image.info.height).toBe(size)
  ;[0, size - 1, size * (size - 1), size * size - 1].forEach((index) => expect(image.data[index * 4 + 3]).toBe(0))
  const ink = Array.from({ length: size * size }, (_, index) => index).filter(
    (index) => image.data[index * 4 + 3]! > 240 && Math.max(...image.data.subarray(index * 4, index * 4 + 3)) < 110,
  ).length
  expect(ink === 0).toBe(compact)
}
