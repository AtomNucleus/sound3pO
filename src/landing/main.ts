/**
 * Landing page — MOD DESK variant index (plain DOM, no three.js).
 */

interface VariantCard {
  href: string;
  code: string;
  name: string;
  blurb: string;
  swatches: string[];
}

const VARIANTS: VariantCard[] = [
  {
    href: '/v1/',
    code: 'V1',
    name: 'Product Shot',
    blurb: 'Photo-faithful fixed camera, soft studio light, signature red cable.',
    swatches: ['#EFEAE2', '#3BA8A0', '#E8762C', '#D94F2B', '#E23B2E'],
  },
  {
    href: '/v2/',
    code: 'V2',
    name: 'On the Desk',
    blurb: 'Photoreal orbit + real cable repatching into the signal path.',
    swatches: ['#E8E2D8', '#2A2A28', '#C4B8A8', '#E23B2E', '#3BA8A0'],
  },
  {
    href: '/v3/',
    code: 'V3',
    name: 'Toy',
    blurb: 'Clay & bouncy proportions — chunky knobs, soft toon materials.',
    swatches: ['#F2EDE4', '#7EC8A3', '#F0D35A', '#E8762C', '#D94F2B'],
  },
  {
    href: '/v4/',
    code: 'V4',
    name: 'Night Mode',
    blurb: 'Neon LCDs + 16-step sequencer under low-key lighting.',
    swatches: ['#0E1A14', '#5CFF9A', '#3BA8A0', '#D94F2B', '#2A2A28'],
  },
  {
    href: '/v5/',
    code: 'V5',
    name: 'Exploded',
    blurb: 'Pull the modules apart — hover to inspect every part.',
    swatches: ['#DDD8D0', '#3BA8A0', '#E8762C', '#D9A82C', '#D94F2B'],
  },
];

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

app.innerHTML = `
  <main class="page">
    <header class="hero">
      <p class="eyebrow">three.js · modular · interactive</p>
      <h1>MOD DESK</h1>
      <p class="sub">three.js variations of a desktop modular synthesizer</p>
    </header>
    <section class="grid" aria-label="Variants">
      ${VARIANTS.map(
        (v) => `
        <a class="card" href="${v.href}">
          <div class="swatches" aria-hidden="true">
            ${v.swatches.map((c) => `<span style="background:${c}"></span>`).join('')}
          </div>
          <div class="meta">
            <span class="code">${v.code}</span>
            <h2>${v.name}</h2>
            <p>${v.blurb}</p>
          </div>
        </a>`,
      ).join('')}
    </section>
    <footer class="foot">Built on a shared procedural core — device, cables, audio, screens.</footer>
  </main>
`;
