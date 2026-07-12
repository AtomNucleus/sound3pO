import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

mkdirSync('/tmp/shots', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text());
});
await page.goto('http://localhost:4173/v1/', { waitUntil: 'networkidle' });
// Dismiss power overlay so it doesn't obscure the product shot
const power = page.locator('#power');
if (await power.isVisible()) await power.click();
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/shots/iter2.png' });
console.log(errors.length ? errors.join('\n') : 'no page errors');
await browser.close();
