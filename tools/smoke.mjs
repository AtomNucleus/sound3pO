import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--window-size=1600,1400'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1400, deviceScaleFactor: 1 })

const errors = []
const logs = []
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('requestfailed', (r) => errors.push('reqfail: ' + r.url() + ' ' + (r.failure()?.errorText || '')))

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise((r) => setTimeout(r, 800))

// Try to start audio + interact with chord field
const info = await page.evaluate(() => {
  const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => ({
    w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight,
  }))
  const text = document.body.innerText.slice(0, 400)
  const buttons = Array.from(document.querySelectorAll('button')).map((b) => (b.textContent || '').trim()).filter(Boolean).slice(0, 40)
  return { canvases, text, buttons }
})

// click first transport (play) if present, then screenshot
try {
  const playBtn = await page.$('.hot-button.transport')
  if (playBtn) await playBtn.click()
} catch {}
await new Promise((r) => setTimeout(r, 500))

// interact with a chord field canvas: click center
const cf = await page.$('canvas')
if (cf) {
  const box = await cf.boundingBox()
  if (box) {
    await page.mouse.click(box.x + box.width * 0.34, box.y + box.height * 0.46)
    await new Promise((r) => setTimeout(r, 300))
  }
}

await page.screenshot({ path: '/opt/cursor/artifacts/assets/chordfield-smoke.png', fullPage: true })

console.log('CANVASES', JSON.stringify(info.canvases))
console.log('BUTTONS', JSON.stringify(info.buttons))
console.log('ERRORS', JSON.stringify(errors, null, 2))
console.log('CONSOLE_ERR', JSON.stringify(logs.filter((l) => l.startsWith('[error]')), null, 2))
await browser.close()
