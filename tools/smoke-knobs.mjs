import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--window-size=1600,1400'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1600, height: 1400, deviceScaleFactor: 1 })

const errors = []
page.on('pageerror', (e) => errors.push(e.message))

await page.goto('http://localhost:4173/', { waitUntil: 'networkidle0', timeout: 30000 })
await new Promise((r) => setTimeout(r, 600))

// Click play to power audio
const play = await page.$('.hot-button.transport')
if (play) await play.click()
await new Promise((r) => setTimeout(r, 200))

const knobs = await page.$$('.hot-knob')
console.log('knobCount', knobs.length)

const before = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('.hot-knob')).slice(0, 6).map((k) => {
    const face = k.querySelector('.hot-knob-face')
    const tick = k.querySelector('.hot-knob-tick')
    const style = face ? getComputedStyle(face).transform : null
    return {
      hasFace: !!face,
      hasTick: !!tick,
      transform: style,
      label: k.getAttribute('aria-label'),
    }
  })
})
console.log('before', JSON.stringify(before, null, 2))

// Drag the first few knobs circularly and verify angle changes
const results = []
for (let i = 0; i < Math.min(4, knobs.length); i++) {
  const box = await knobs[i].boundingBox()
  if (!box) continue
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const beforeAngle = await page.evaluate((idx) => {
    const face = document.querySelectorAll('.hot-knob')[idx]?.querySelector('.hot-knob-face')
    return face?.style.transform || ''
  }, i)

  await page.mouse.move(cx, cy - box.height * 0.35)
  await page.mouse.down()
  // sweep around the knob
  for (const a of [30, 60, 90, 120, 150]) {
    const rad = ((a - 90) * Math.PI) / 180
    await page.mouse.move(cx + Math.cos(rad) * box.width * 0.4, cy + Math.sin(rad) * box.height * 0.4, { steps: 3 })
  }
  await page.mouse.up()
  await new Promise((r) => setTimeout(r, 80))

  const afterAngle = await page.evaluate((idx) => {
    const face = document.querySelectorAll('.hot-knob')[idx]?.querySelector('.hot-knob-face')
    return face?.style.transform || ''
  }, i)
  results.push({ i, beforeAngle, afterAngle, changed: beforeAngle !== afterAngle })
}
console.log('dragResults', JSON.stringify(results, null, 2))

// Check ENV handles exist and have top style
const envHandles = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('.env-fader-handle')).map((h) => ({
    top: h.style.top,
    display: getComputedStyle(h).display,
  }))
})
console.log('envHandles', JSON.stringify(envHandles))

await page.screenshot({ path: '/opt/cursor/artifacts/assets/knobs-interactive.png', fullPage: false })
console.log('ERRORS', JSON.stringify(errors))
await browser.close()
