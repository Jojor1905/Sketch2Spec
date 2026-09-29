import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three"

export type ProceduralTextureStyle =
  | "paint"
  | "concrete"
  | "brick"
  | "wood-panel"
  | "stone"
  | "door-white"
  | "door-oak"
  | "door-metal"
  | "glass-clear"
  | "glass-black"
  | "glass-wood"
  | "tile-light"
  | "tile-dark"
  | "floor-oak"
  | "floor-concrete"
  | "wallpaper-linen"
  | "wallpaper-geometric"
  | "wallpaper-botanical"
  | "ceiling-plaster"
  | "ceiling-grid"
  | "fabric"
  | "leather"

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "")
  const chunk = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized
  const value = Number.parseInt(chunk, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  }
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"))
    .join("")}`
}

function mix(colorA: string, colorB: string, amount: number) {
  const a = hexToRgb(colorA)
  const b = hexToRgb(colorB)
  const t = clamp(amount, 0, 1)
  return rgbToHex(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  )
}

function lighten(color: string, amount: number) {
  return mix(color, "#ffffff", amount)
}

function darken(color: string, amount: number) {
  return mix(color, "#000000", amount)
}

function hashNoise(x: number, y: number, seed = 1) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 101.3) * 43758.5453
  return value - Math.floor(value)
}

function createCanvas(size = 512) {
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Cannot create canvas context")
  return { canvas, ctx, size }
}

function noiseLayer(ctx: CanvasRenderingContext2D, size: number, opacity = 0.08, step = 4) {
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const value = hashNoise(x / step, y / step)
      const light = Math.round(255 * value)
      ctx.fillStyle = `rgba(${light},${light},${light},${opacity})`
      ctx.fillRect(x, y, step, step)
    }
  }
}

function drawPaint(baseColor: string, size = 512) {
  const { canvas, ctx } = createCanvas(size)
  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, size, size)
  noiseLayer(ctx, size, 0.06, 3)
  for (let i = 0; i < 120; i += 1) {
    const x = hashNoise(i, 1) * size
    const y = hashNoise(i, 2) * size
    const radius = 4 + hashNoise(i, 3) * 10
    ctx.fillStyle = i % 2 === 0 ? lighten(baseColor, 0.08) : darken(baseColor, 0.06)
    ctx.globalAlpha = 0.06
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  return canvas
}

function drawConcrete(baseColor: string, size = 512) {
  const { canvas, ctx } = createCanvas(size)
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, lighten(baseColor, 0.06))
  gradient.addColorStop(1, darken(baseColor, 0.08))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  noiseLayer(ctx, size, 0.12, 3)
  for (let i = 0; i < 380; i += 1) {
    const x = hashNoise(i, 7) * size
    const y = hashNoise(i, 8) * size
    const radius = 1 + hashNoise(i, 9) * 2.5
    const tint = i % 3 === 0 ? lighten(baseColor, 0.15) : darken(baseColor, 0.18)
    ctx.fillStyle = tint
    ctx.globalAlpha = 0.18
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  return canvas
}

function drawBrick(baseColor: string, size = 512) {
  const { canvas, ctx } = createCanvas(size)
  ctx.fillStyle = lighten(baseColor, 0.06)
  ctx.fillRect(0, 0, size, size)
  const brickW = 96
  const brickH = 42
  const gap = 6
  const mortar = "#d9d2cb"
  ctx.fillStyle = mortar
  ctx.fillRect(0, 0, size, size)
  for (let row = 0; row < Math.ceil(size / (brickH + gap)); row += 1) {
    const y = row * (brickH + gap)
    const offset = row % 2 === 0 ? 0 : brickW / 2
    for (let col = -1; col < Math.ceil(size / brickW) + 1; col += 1) {
      const x = col * brickW + offset
      const tone = mix(lighten(baseColor, hashNoise(row, col) * 0.1), darken(baseColor, hashNoise(col, row) * 0.14), 0.45)
      ctx.fillStyle = tone
      ctx.fillRect(x + gap / 2, y + gap / 2, brickW - gap, brickH - gap)
      ctx.strokeStyle = darken(tone, 0.18)
      ctx.globalAlpha = 0.3
      ctx.strokeRect(x + gap / 2, y + gap / 2, brickW - gap, brickH - gap)
      ctx.globalAlpha = 1
    }
  }
  noiseLayer(ctx, size, 0.05, 4)
  return canvas
}

function drawWood(baseColor: string, size = 512, boardCount = 8, vertical = true) {
  const { canvas, ctx } = createCanvas(size)
  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, size, size)
  const boardW = size / boardCount
  for (let i = 0; i < boardCount; i += 1) {
    const start = i * boardW
    const tone = i % 2 === 0 ? lighten(baseColor, 0.06) : darken(baseColor, 0.08)
    ctx.fillStyle = tone
    if (vertical) ctx.fillRect(start, 0, boardW, size)
    else ctx.fillRect(0, start, size, boardW)

    ctx.strokeStyle = darken(baseColor, 0.25)
    ctx.globalAlpha = 0.4
    ctx.lineWidth = 2
    if (vertical) {
      ctx.beginPath(); ctx.moveTo(start, 0); ctx.lineTo(start, size); ctx.stroke()
    } else {
      ctx.beginPath(); ctx.moveTo(0, start); ctx.lineTo(size, start); ctx.stroke()
    }
    ctx.globalAlpha = 1
  }
  ctx.strokeStyle = darken(baseColor, 0.12)
  ctx.lineWidth = 1.5
  for (let i = 0; i < 90; i += 1) {
    const offset = (i / 90) * size
    const variance = hashNoise(i, 12) * 16
    ctx.beginPath()
    if (vertical) {
      ctx.moveTo(offset, 0)
      for (let y = 0; y <= size; y += 32) {
        ctx.lineTo(offset + Math.sin((y + variance) / 25) * 4, y)
      }
    } else {
      ctx.moveTo(0, offset)
      for (let x = 0; x <= size; x += 32) {
        ctx.lineTo(x, offset + Math.sin((x + variance) / 25) * 4)
      }
    }
    ctx.globalAlpha = 0.18
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  return canvas
}

function drawStone(baseColor: string, size = 512) {
  const { canvas, ctx } = createCanvas(size)
  ctx.fillStyle = darken(baseColor, 0.08)
  ctx.fillRect(0, 0, size, size)
  const rows = 6
  const cols = 4
  const mortar = "#c3beb7"
  for (let row = 0; row < rows; row += 1) {
    const h = size / rows
    const offset = row % 2 === 0 ? 0 : (size / cols) * 0.35
    for (let col = -1; col < cols + 1; col += 1) {
      const w = size / cols
      const x = col * w + offset + 6
      const y = row * h + 6
      const width = w - 12 - hashNoise(row, col, 2) * 18
      const height = h - 12 - hashNoise(col, row, 3) * 14
      ctx.fillStyle = mix(lighten(baseColor, hashNoise(row, col, 4) * 0.16), darken(baseColor, hashNoise(col, row, 5) * 0.18), 0.45)
      roundRect(ctx, x, y, width, height, 10)
      ctx.fill()
      ctx.strokeStyle = mortar
      ctx.globalAlpha = 0.35
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }
  noiseLayer(ctx, size, 0.08, 3)
  return canvas
}

function drawTile(baseColor: string, size = 512, dark = false) {
  const { canvas, ctx } = createCanvas(size)
  const grout = dark ? "#afb5bb" : "#cfc8bc"
  ctx.fillStyle = grout
  ctx.fillRect(0, 0, size, size)
  const tileSize = 64
  const gap = 4
  for (let y = 0; y < size; y += tileSize) {
    for (let x = 0; x < size; x += tileSize) {
      const tone = dark
        ? mix(baseColor, lighten(baseColor, hashNoise(x, y) * 0.12), 0.45)
        : mix(baseColor, darken(baseColor, hashNoise(x, y) * 0.1), 0.45)
      ctx.fillStyle = tone
      ctx.fillRect(x + gap / 2, y + gap / 2, tileSize - gap, tileSize - gap)
      const shine = ctx.createLinearGradient(x, y, x + tileSize, y + tileSize)
      shine.addColorStop(0, "rgba(255,255,255,0.14)")
      shine.addColorStop(1, "rgba(0,0,0,0.04)")
      ctx.fillStyle = shine
      ctx.fillRect(x + gap / 2, y + gap / 2, tileSize - gap, tileSize - gap)
    }
  }
  return canvas
}

function drawGlass(baseColor: string, size = 512, frameColor: string) {
  const { canvas, ctx } = createCanvas(size)
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, lighten(baseColor, 0.25))
  gradient.addColorStop(0.55, baseColor)
  gradient.addColorStop(1, darken(baseColor, 0.12))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = frameColor
  ctx.lineWidth = 24
  ctx.strokeRect(12, 12, size - 24, size - 24)
  ctx.lineWidth = 10
  ctx.globalAlpha = 0.8
  ctx.beginPath(); ctx.moveTo(size / 2, 24); ctx.lineTo(size / 2, size - 24); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(24, size / 2); ctx.lineTo(size - 24, size / 2); ctx.stroke()
  ctx.globalAlpha = 1
  const highlight = ctx.createLinearGradient(0, 0, size * 0.7, size * 0.7)
  highlight.addColorStop(0, "rgba(255,255,255,0.38)")
  highlight.addColorStop(1, "rgba(255,255,255,0)")
  ctx.fillStyle = highlight
  ctx.fillRect(0, 0, size, size)
  return canvas
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

export type ProceduralTextureBundle = {
  colorMap: CanvasTexture
  bumpMap: CanvasTexture
  roughnessMap: CanvasTexture
}

function makeTexture(canvas: HTMLCanvasElement, repeatX: number, repeatY: number) {
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(Math.max(0.25, repeatX), Math.max(0.25, repeatY))
  texture.anisotropy = 4
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function toGrayCanvas(source: HTMLCanvasElement, contrast = 1) {
  const { canvas, ctx, size } = createCanvas(source.width)
  ctx.drawImage(source, 0, 0)
  const image = ctx.getImageData(0, 0, size, size)
  const data = image.data
  for (let index = 0; index < data.length; index += 4) {
    const gray = clamp(((data[index] + data[index + 1] + data[index + 2]) / 3 - 128) * contrast + 128, 0, 255)
    data[index] = gray
    data[index + 1] = gray
    data[index + 2] = gray
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}


function drawWallpaperLinen(baseColor: string, size = 512) {
  const { canvas, ctx } = createCanvas(size)
  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = darken(baseColor, 0.16)
  ctx.globalAlpha = 0.22
  ctx.lineWidth = 1
  for (let i = 0; i < size; i += 5) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke()
  }
  ctx.globalAlpha = 1
  noiseLayer(ctx, size, 0.035, 3)
  return canvas
}

function drawWallpaperGeometric(baseColor: string, size = 512) {
  const { canvas, ctx } = createCanvas(size)
  ctx.fillStyle = lighten(baseColor, 0.18)
  ctx.fillRect(0, 0, size, size)
  const step = 72
  ctx.lineWidth = 5
  for (let y = -step; y < size + step; y += step) {
    for (let x = -step; x < size + step; x += step) {
      ctx.strokeStyle = ((x + y) / step) % 2 === 0 ? darken(baseColor, 0.16) : lighten(baseColor, 0.12)
      ctx.beginPath()
      ctx.moveTo(x, y + step / 2)
      ctx.lineTo(x + step / 2, y)
      ctx.lineTo(x + step, y + step / 2)
      ctx.lineTo(x + step / 2, y + step)
      ctx.closePath()
      ctx.globalAlpha = 0.48
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
  return canvas
}

function drawWallpaperBotanical(baseColor: string, size = 512) {
  const { canvas, ctx } = createCanvas(size)
  ctx.fillStyle = lighten(baseColor, 0.35)
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 36; i += 1) {
    const x = hashNoise(i, 41) * size
    const y = hashNoise(i, 42) * size
    const length = 30 + hashNoise(i, 43) * 55
    const angle = hashNoise(i, 44) * Math.PI * 2
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.fillStyle = i % 2 ? darken(baseColor, 0.12) : lighten(baseColor, 0.08)
    ctx.globalAlpha = 0.45
    ctx.beginPath()
    ctx.ellipse(0, 0, length * 0.48, length * 0.16, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.globalAlpha = 1
  return canvas
}

function drawCeilingGrid(baseColor: string, size = 512) {
  const { canvas, ctx } = createCanvas(size)
  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = darken(baseColor, 0.22)
  ctx.lineWidth = 6
  for (let i = 0; i <= size; i += 96) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke()
  }
  noiseLayer(ctx, size, 0.04, 4)
  return canvas
}

function drawFabric(baseColor: string, size = 512) {
  const { canvas, ctx } = createCanvas(size)
  ctx.fillStyle = baseColor
  ctx.fillRect(0, 0, size, size)
  ctx.strokeStyle = lighten(baseColor, 0.18)
  ctx.globalAlpha = 0.22
  for (let i = -size; i < size * 2; i += 6) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(i, size); ctx.lineTo(i + size, 0); ctx.stroke()
  }
  ctx.globalAlpha = 1
  noiseLayer(ctx, size, 0.06, 2)
  return canvas
}

function drawLeather(baseColor: string, size = 512) {
  const { canvas, ctx } = createCanvas(size)
  const gradient = ctx.createRadialGradient(size * 0.4, size * 0.35, 20, size * 0.5, size * 0.5, size * 0.8)
  gradient.addColorStop(0, lighten(baseColor, 0.12))
  gradient.addColorStop(1, darken(baseColor, 0.14))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  noiseLayer(ctx, size, 0.08, 3)
  for (let i = 0; i < 180; i += 1) {
    const x = hashNoise(i, 70) * size
    const y = hashNoise(i, 71) * size
    ctx.strokeStyle = lighten(baseColor, 0.22)
    ctx.globalAlpha = 0.08
    ctx.beginPath(); ctx.arc(x, y, 2 + hashNoise(i, 72) * 4, 0, Math.PI * 2); ctx.stroke()
  }
  ctx.globalAlpha = 1
  return canvas
}

function buildCanvas(style: ProceduralTextureStyle, baseColor: string) {
  switch (style) {
    case "paint": return drawPaint(baseColor)
    case "concrete": return drawConcrete(baseColor)
    case "brick": return drawBrick(baseColor)
    case "wood-panel": return drawWood(baseColor, 512, 7, true)
    case "stone": return drawStone(baseColor)
    case "door-white": return drawWood(baseColor, 512, 4, true)
    case "door-oak": return drawWood(baseColor, 512, 5, true)
    case "door-metal": return drawConcrete(baseColor)
    case "glass-clear": return drawGlass(baseColor, 512, "#c5d2da")
    case "glass-black": return drawGlass(baseColor, 512, "#2a2f36")
    case "glass-wood": return drawGlass(baseColor, 512, "#9d6f42")
    case "tile-light": return drawTile(baseColor, 512, false)
    case "tile-dark": return drawTile(baseColor, 512, true)
    case "floor-oak": return drawWood(baseColor, 512, 8, false)
    case "floor-concrete": return drawConcrete(baseColor)
    case "wallpaper-linen": return drawWallpaperLinen(baseColor)
    case "wallpaper-geometric": return drawWallpaperGeometric(baseColor)
    case "wallpaper-botanical": return drawWallpaperBotanical(baseColor)
    case "ceiling-plaster": return drawPaint(baseColor)
    case "ceiling-grid": return drawCeilingGrid(baseColor)
    case "fabric": return drawFabric(baseColor)
    case "leather": return drawLeather(baseColor)
    default: return drawPaint(baseColor)
  }
}

export function createProceduralPreviewDataUrl(
  style: ProceduralTextureStyle,
  baseColor: string,
) {
  const canvas = buildCanvas(style, baseColor)
  return canvas.toDataURL("image/png")
}

export function createProceduralTextures(
  style: ProceduralTextureStyle,
  baseColor: string,
  repeatX: number,
  repeatY: number,
): ProceduralTextureBundle {
  const colorCanvas = buildCanvas(style, baseColor)
  const bumpCanvas = toGrayCanvas(colorCanvas, 1.3)
  const roughnessCanvas = toGrayCanvas(colorCanvas, 0.85)
  return {
    colorMap: makeTexture(colorCanvas, repeatX, repeatY),
    bumpMap: makeTexture(bumpCanvas, repeatX, repeatY),
    roughnessMap: makeTexture(roughnessCanvas, repeatX, repeatY),
  }
}
