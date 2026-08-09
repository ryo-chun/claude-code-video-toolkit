/**
 * TikTokプロフィール画像ジェネレータ
 *
 *   node slides/avatar.js            # 全案を出力
 *   node slides/avatar.js --circle   # 円形クロップのプレビューを重ねて出力
 *   node slides/avatar.js --small    # 60px相当に縮小した検証用も併せて出力
 *
 * TikTokのアイコン規定に合わせて 720x720 の PNG を slides/out/avatar/ に書き出す。
 * 円形に切り抜かれるので四隅には何も置かない。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const S = 720;
const circle = process.argv.includes('--circle');
const small = process.argv.includes('--small');

const R = 302;            // リング半径
const SW = 26;            // リングの線幅

/** 電源ボタン型のリング（上に切れ目 + 縦線）。ガジェット感を出す */
function powerRing(color) {
  const c = 2 * Math.PI * R;
  const gap = 0.13;       // 切れ目の割合
  return `<svg width="${S}" height="${S}" style="position:absolute;inset:0">
    <g transform="rotate(${-90 + (gap * 360) / 2} ${S / 2} ${S / 2})">
      <circle cx="${S / 2}" cy="${S / 2}" r="${R}" fill="none" stroke="${color}" stroke-width="${SW}"
              stroke-linecap="round" stroke-dasharray="${c * (1 - gap)} ${c * gap}"/>
    </g>
    <line x1="${S / 2}" y1="${S / 2 - R - SW / 2}" x2="${S / 2}" y2="${S / 2 - R + SW * 2.1}"
          stroke="${color}" stroke-width="${SW}" stroke-linecap="round"/>
  </svg>`;
}

/** タイマー型のリング（残り時間の弧） */
function timerRing(color, pct) {
  const c = 2 * Math.PI * R;
  return `<svg width="${S}" height="${S}" style="position:absolute;inset:0;transform:rotate(-90deg)">
    <circle cx="${S / 2}" cy="${S / 2}" r="${R}" fill="none" stroke="${color}" stroke-opacity="0.18" stroke-width="${SW}"/>
    <circle cx="${S / 2}" cy="${S / 2}" r="${R}" fill="none" stroke="${color}" stroke-width="${SW}"
            stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>
  </svg>`;
}

/** ずんぐりした美容デバイスのシルエット。細部を削って60pxでも形が残るようにする */
function deviceMark(fg, accent) {
  return `<svg width="${S}" height="${S}" style="position:absolute;inset:0">
    <circle cx="${S / 2}" cy="252" r="96" fill="${accent}"/>
    <rect x="${S / 2 - 62}" y="316" width="124" height="230" rx="62" fill="${fg}"/>
  </svg>`;
}

const variants = [
  { name: '01_power-green',  bg: '#0a0a0a', fg: '#ffffff', accent: '#3ddc9a', mark: 'power', text: '時短' },
  { name: '02_power-pink',   bg: '#0a0a0a', fg: '#ffffff', accent: '#ff5f9e', mark: 'power', text: '時短' },
  { name: '03_timer-green',  bg: '#0a0a0a', fg: '#ffffff', accent: '#3ddc9a', mark: 'timer', text: '時短' },
  { name: '04_power-5min',   bg: '#0a0a0a', fg: '#ffffff', accent: '#3ddc9a', mark: 'power', text: '5分' },
  { name: '05_device-bold',  bg: '#0a0a0a', fg: '#ffffff', accent: '#3ddc9a', mark: 'device', text: null },
  { name: '06_power-white',  bg: '#f7f6f2', fg: '#111111', accent: '#12805c', mark: 'power', text: '時短' },
];

function html(v) {
  const mark =
    v.mark === 'power' ? powerRing(v.accent) :
    v.mark === 'timer' ? timerRing(v.accent, 0.25) :
    deviceMark(v.fg, v.accent);

  const text = v.text
    ? `<div style="position:relative;font-size:250px;font-weight:700;color:${v.fg};line-height:1;letter-spacing:0.02em;text-indent:0.02em">${v.text}</div>`
    : '';

  const overlay = circle
    ? `<div style="position:absolute;inset:0;background:rgba(255,0,0,.30);
         -webkit-mask:radial-gradient(circle at 50% 50%, transparent 0 ${S / 2}px, #000 ${S / 2}px);
         mask:radial-gradient(circle at 50% 50%, transparent 0 ${S / 2}px, #000 ${S / 2}px)"></div>`
    : '';

  return `<!doctype html><html lang="ja"><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${S}px;height:${S}px;overflow:hidden;
       font-family:"Noto Sans JP","Yu Gothic UI","Hiragino Kaku Gothic ProN","Meiryo",sans-serif;
       -webkit-font-smoothing:antialiased}
  .st{position:relative;width:${S}px;height:${S}px;background:${v.bg};
      display:flex;align-items:center;justify-content:center}
</style>
<body><div class="st">${mark}${text}${overlay}</div></body></html>`;
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

    if (small) {
      // フィード表示の実寸（約60px）に落として、潰れないか確認する
      await page.setViewportSize({ width: 60, height: 60 });
      await page.evaluate((s) => {
        document.querySelector('.st').style.transform = `scale(${60 / s})`;
        document.querySelector('.st').style.transformOrigin = 'top left';
      }, S);
      await page.screenshot({ path: path.join(outDir, `${v.name}_60px.png`) });
      await page.setViewportSize({ width: S, height: S });
    }
    console.log(`${v.name}.png`);
  }

  await browser.close();
  console.log(`\n${variants.length} 案 -> ${outDir}`);
})().catch(e => { console.error(e); process.exit(1); });
