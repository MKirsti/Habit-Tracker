/**
 * Erzeugt die PNG-Icons der PWA aus dem Wappen in public/favicon.svg.
 *
 * Nutzung (bewusst ohne npm-Script, nur nach Änderungen am Wappen nötig):
 *
 *     node scripts/generate-icons.cjs
 *
 * Voraussetzung: Playwright mit Chromium ist verfügbar (`require('playwright')`, z. B. global
 * installiert). Die erzeugten Dateien werden ins Repository eingecheckt:
 *
 *   public/pwa-192x192.png        Standard-Icon (abgerundetes Quadrat, transparente Ecken)
 *   public/pwa-512x512.png        Standard-Icon groß
 *   public/maskable-512x512.png   „maskable“: vollflächiger Hintergrund, Wappen in der sicheren Zone
 *   public/apple-touch-icon.png   iOS-Homescreen (180 × 180, vollflächig – iOS rundet selbst ab)
 *
 * Das SVG muss die IDs `backdrop` (Hintergrund-Rechteck), `frame` (Zierrahmen) und `crest`
 * (Wappen-Gruppe) enthalten; für die vollflächigen Varianten werden sie per CSS angepasst.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('playwright')

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public')
const SOURCE = path.join(PUBLIC_DIR, 'favicon.svg')

/**
 * crestScale = Skalierung des Wappens im 512er-Raster (im favicon.svg selbst: 1.1).
 * Für „maskable“ muss das Wappen in den Kreis mit 80 % Durchmesser passen (Radius 204,8 px):
 * Der entfernteste Punkt (obere Schildecken) liegt bei Skalierung 1 ca. 211 px vom Mittelpunkt
 * entfernt → 0,88 lässt rundum Luft.
 */
const TARGETS = [
  { file: 'pwa-192x192.png', size: 192, mode: 'rounded' },
  { file: 'pwa-512x512.png', size: 512, mode: 'rounded' },
  { file: 'maskable-512x512.png', size: 512, mode: 'full-bleed', crestScale: 0.88 },
  { file: 'apple-touch-icon.png', size: 180, mode: 'full-bleed', crestScale: 1.0 },
]

/** CSS, das das SVG für eine vollflächige Variante umbaut. */
function fullBleedCss(crestScale) {
  return `
    #backdrop { rx: 0; ry: 0; }
    #frame { display: none; }
    #crest { transform: translate(256px, 256px) scale(${crestScale}) translate(-256px, -262px); }
  `
}

function pageHtml(svg, size, extraCss) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; padding: 0; background: transparent; }
      svg { display: block; width: ${size}px; height: ${size}px; }
      ${extraCss}
    </style>
  </head>
  <body>${svg}</body>
</html>`
}

async function main() {
  const svg = fs.readFileSync(SOURCE, 'utf8')
  for (const id of ['backdrop', 'frame', 'crest']) {
    if (!svg.includes(`id="${id}"`)) throw new Error(`favicon.svg: Element mit id="${id}" fehlt`)
  }

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 })
    for (const target of TARGETS) {
      const css = target.mode === 'full-bleed' ? fullBleedCss(target.crestScale) : ''
      await page.setViewportSize({ width: target.size, height: target.size })
      await page.setContent(pageHtml(svg, target.size, css))
      const output = path.join(PUBLIC_DIR, target.file)
      await page.screenshot({
        path: output,
        omitBackground: true,
        clip: { x: 0, y: 0, width: target.size, height: target.size },
      })
      console.log(`✔ ${path.relative(process.cwd(), output)} (${target.size}×${target.size}, ${target.mode})`)
    }
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
