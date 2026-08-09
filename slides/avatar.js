/**
 * TikTokプロフィール画像ジェネレータ
 *
 *   node slides/avatar.js            # 全案を出力
 *   node slides/avatar.js --circle   # 円形クロップのプレビューを重ねて出力
 *
 * 1024x1024 の PNG を slides/out/avatar/ に書き出す。
 * TikTokは円形に切り抜くので、四隅には何も置かない設計。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const S = 1024;
const circle = process.argv.includes('--circle');

// タイマーの残り時間を表すリング（時短の視覚化）
function ring(color, pct) {
  const r = 430, c = 2 * Math.PI * r;
  return `<svg width="${S}" height="${S}" style="position:absolute;inset:0;transform:rotate(-90deg)">
    <circle cx="${S / 2}" cy="${S / 2}" r="${r}" fill="none" stroke="${color}" stroke-opacity="0.18" stroke-width="34"/>
    <circle cx="${S / 2}" cy="${S / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="34"
            stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
  </svg>`;
}

const variants = [
  {
    name: '01_black-green',
    bg: '#0a0a0a', fg: '#ffffff', accent: '#3ddc9a', pct: 0.25,
    main: '時短', sub: '美容',
  },
  {
    name: '02_white-red',
    bg: '#f7f6f2', fg: '#111111', accent: '#e2483c', pct: 0.25,
    main: '時短', sub: '美容',
  },
  {
    name: '03_green-white',
    bg: '#12805c', fg: '#ffffff', accent: '#ffffff', pct: 0.25,
    main: '時短', sub: '美容',
  },
  {
    name: '04_black-nosub',
    bg: '#0a0a0a', fg: '#ffffff', accent: '#3ddc9a', pct: 0.25,
    main: '時短', sub: null,
  },
];

function html(v) {
  const overlay = circle
    ? `<div style="position:absolute;inset:0;background:rgba(255,0,0,.30);
         -webkit-mask:radial-gradient(circle at 50% 50%, transparent 0 ${S / 2}px, #000 ${S / 2}px);
         mask:radial-gradient(circle at 50% 50%, transparent 0 ${S / 2}px, #000 ${S / 2}px)"></div>`
    : '';
  const sub = v.sub
    ? `<div style="font-size:112px;font-weight:700;color:${v.accent};letter-spacing:0.16em;margin-top:6px;text-indent:0.16em">${v.sub}</div>`
    : '';
  return `<!doctype html><html lang="ja"><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${S}px;height:${S}px;overflow:hidden;
       font-family:"Noto Sans JP","Yu Gothic UI","Hiragino Kaku Gothic ProN","Meiryo",sans-serif;
       -webkit-font-smoothing:antialiased}
  .st{position:relative;width:${S}px;height:${S}px;background:${v.bg};
      display:flex;flex-direction:column;align-items:center;justify-content:center}
</style>
<body><div class="st">
  ${ring(v.accent, v.pct)}
  <div style="position:relative;display:flex;flex-direction:column;align-items:center">
    <div style="font-size:${v.sub ? 300 : 380}px;font-weight:700;color:${v.fg};line-height:1;letter-spacing:0.02em;text-indent:0.02em">${v.main}</div>
    ${sub}
  </div>
  ${overlay}
</div></body></html>`;
}

(async () => {
  const outDir = path.join(__dirname, 'out', 'avatar' + (circle ? '_circle' : ''));
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: S, height: S }, deviceScaleFactor: 1 });
  for (const v of variants) {
    await page.setContent(html(v), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(outDir, `${v.name}.png`) });
    console.log(`${v.name}.png`);
  }
  await browser.close();
  console.log(`\n${variants.length} 案 -> ${outDir}`);
})().catch(e => { console.error(e); process.exit(1); });
