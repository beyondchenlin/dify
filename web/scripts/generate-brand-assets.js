import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const sourceArg = process.argv[2]

if (!sourceArg) {
  console.error('Usage: node ./scripts/generate-brand-assets.js <source-image>')
  process.exit(1)
}

const source = path.resolve(process.cwd(), sourceArg)
const publicDir = path.join(__dirname, '../public')
const logoDir = path.join(publicDir, 'logo')

if (!fs.existsSync(source)) {
  console.error(`Source image not found: ${source}`)
  process.exit(1)
}

fs.mkdirSync(logoDir, { recursive: true })

const pngOptions = {
  compressionLevel: 9,
  adaptiveFiltering: true,
}

async function avatarBuffer(size) {
  return sharp(source)
    .resize(size, size, {
      fit: 'contain',
      kernel: sharp.kernel.lanczos3,
    })
    .png(pngOptions)
    .toBuffer()
}

async function squarePng(file, size) {
  const buffer = await avatarBuffer(size)
  fs.writeFileSync(path.join(publicDir, file), buffer)
}

async function logoPng(file, width, height, imageSize = Math.min(width, height)) {
  const avatar = await avatarBuffer(imageSize)
  const left = Math.round((width - imageSize) / 2)
  const top = Math.round((height - imageSize) / 2)
  const buffer = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: avatar, left, top }])
    .png(pngOptions)
    .toBuffer()

  fs.writeFileSync(path.join(logoDir, file), buffer)
}

function buildIco(pngImages) {
  const count = pngImages.length
  const headerSize = 6
  const entrySize = 16
  const directorySize = headerSize + (entrySize * count)
  const totalSize = directorySize + pngImages.reduce((sum, image) => sum + image.buffer.length, 0)
  const ico = Buffer.alloc(totalSize)

  ico.writeUInt16LE(0, 0)
  ico.writeUInt16LE(1, 2)
  ico.writeUInt16LE(count, 4)

  let imageOffset = directorySize
  pngImages.forEach((image, index) => {
    const entryOffset = headerSize + (index * entrySize)
    ico.writeUInt8(image.size >= 256 ? 0 : image.size, entryOffset)
    ico.writeUInt8(image.size >= 256 ? 0 : image.size, entryOffset + 1)
    ico.writeUInt8(0, entryOffset + 2)
    ico.writeUInt8(0, entryOffset + 3)
    ico.writeUInt16LE(1, entryOffset + 4)
    ico.writeUInt16LE(32, entryOffset + 6)
    ico.writeUInt32LE(image.buffer.length, entryOffset + 8)
    ico.writeUInt32LE(imageOffset, entryOffset + 12)
    image.buffer.copy(ico, imageOffset)
    imageOffset += image.buffer.length
  })

  return ico
}

async function favicon() {
  const sizes = [16, 32, 48, 64, 128, 256]
  const images = []

  for (const size of sizes)
    images.push({ size, buffer: await avatarBuffer(size) })

  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), buildIco(images))
}

async function svgWithEmbeddedPng(file, width, height, imageSize) {
  const png = await avatarBuffer(512)
  const base64 = png.toString('base64')
  const x = (width - imageSize) / 2
  const y = (height - imageSize) / 2
  const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <image href="data:image/png;base64,${base64}" x="${x}" y="${y}" width="${imageSize}" height="${imageSize}" preserveAspectRatio="xMidYMid meet"/>
</svg>
`

  fs.writeFileSync(path.join(logoDir, file), svg, 'utf8')
}

async function main() {
  const iconSizes = [72, 96, 128, 144, 152, 192, 256, 384, 512]

  for (const size of iconSizes)
    await squarePng(`icon-${size}x${size}.png`, size)

  await squarePng('apple-touch-icon.png', 180)
  await favicon()

  await logoPng('logo-embedded-chat-header.png', 48, 48)
  await logoPng('logo-embedded-chat-header@2x.png', 96, 96)
  await logoPng('logo-embedded-chat-header@3x.png', 144, 144)
  await logoPng('logo-embedded-chat-avatar.png', 80, 80)

  await logoPng('logo-site.png', 192, 84, 84)
  await logoPng('logo-site-dark.png', 192, 86, 86)
  await logoPng('logo.png', 92, 100, 92)

  await svgWithEmbeddedPng('logo.svg', 64, 28, 28)
  await svgWithEmbeddedPng('logo-monochrome-white.svg', 64, 28, 28)

  console.log(`Generated Dify brand assets from ${source}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
