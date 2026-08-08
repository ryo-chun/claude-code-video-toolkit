/**
 * TikTokスライド自動生成ツール
 *
 *   node slides/build.js day01          # 通常出力
 *   node slides/build.js day01 --guide  # TikTok UIセーフゾーンを重ねて確認
 *
 * specs/<id>.json を読んで 1080x1920 の PNG を out/<id>/ に書き出す。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const W = 1080, H = 1920;

// TikTok UIに隠れない安全領域（実測ベース）
// right が広いのは、いいね/コメント/シェアのボタン列が右端に重なるため
const SAFE = { top: 220, bottom: 420, left: 90, right: 155 };

const BG = {
  black: { bg: '#0a0a0a', fg: '#ffffff', sub: '#8a8a8a' },
  white: { bg: '#f7f6f2', fg: '#111111', sub: '#6b6b6b' },
  red:   { bg: '#c0392b', fg: '#ffffff', sub: '#ffd9d4' },
  green: { bg: '#12805c', fg: '#ffffff', sub: '#c9f0e1' },
};

const ACCENT = {
  red: '#ff5a4e', green: '#3ddc9a', yellow: '#ffd43b',
  blue: '#5aa9ff', dim: null, // null = テーマのsub色にフォールバック
};

const SIZE = { small: 54, normal: 92, large: 128, huge: 190 };

function esc(s) {
  return String(s)
    .replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    .replace(/\n/g, '<br>');
}

function lineHTML(line, theme) {
  const size = SIZE[line.size || 'normal'];
  let color = theme.fg;
  if (line.accent) {
    color = line.accent in ACCENT ? (ACCENT[line.accent] ?? theme.sub) : line.accent;
  }
  const weight = line.size === 'small' ? 500 : 700;
  const mt = line.gap ? `margin-top:${line.gap}px;` : '';
  const box = line.box
    ? `border:6px solid ${color};border-radius:20px;padding:34px 44px;`
    : '';
  // nowrap + 自動縮小で、改行は spec の \n だけが決める
  return `<div style="${mt}"><span class="ln" style="display:inline-block;white-space:nowrap;font-size:${size}px;font-weight:${weight};color:${color};line-height:1.36;letter-spacing:0.01em;${box}">${esc(line.t)}</span></div>`;
}

function slideHTML(slide, guide) {
  const theme = BG[slide.bg] || BG.black;
  const body = (slide.lines || []).map(l => lineHTML(l, theme)).join('\n');
  // 制作メモは確認用（--guide）のみ。本番PNGには焼き込まない
  const note = (guide && slide.note)
    ? `<div style="position:absolute;left:0;right:0;bottom:${SAFE.bottom - 90}px;text-align:center;font-size:40px;color:#ffd43b;font-weight:500">MEMO: ${esc(slide.note)}</div>`
    : '';
  const overlay = guide ? `
    <div style="position:absolute;inset:0;pointer-events:none">
      <div style="position:absolute;top:0;left:0;right:0;height:${SAFE.top}px;background:rgba(255,0,0,.22)"></div>
      <div style="position:absolute;bottom:0;left:0;right:0;height:${SAFE.bottom}px;background:rgba(255,0,0,.22)"></div>
      <div style="position:absolute;top:0;bottom:0;right:0;width:${SAFE.right}px;background:rgba(255,0,0,.14)"></div>
    </div>` : '';

  return `<!doctype html><html lang="ja"><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;overflow:hidden;
       font-family:"Noto Sans JP","Yu Gothic UI","Hiragino Kaku Gothic ProN","Meiryo",sans-serif;
       -webkit-font-smoothing:antialiased}
  .stage{position:relative;width:${W}px;height:${H}px;background:${theme.bg}}
  .safe{position:absolute;top:${SAFE.top}px;bottom:${SAFE.bottom}px;left:${SAFE.left}px;right:${SAFE.right}px;
        display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:18px}
</style>
<body><div class="stage"><div class="safe">${body}</div>${note}${overlay}</div></body></html>`;
}

(async () => {
  const id = process.argv[2];
  const guide = process.argv.includes('--guide');
  if (!id) { console.error('usage: node slides/build.js <specId> [--guide]'); process.exit(1); }

  const specPath = path.join(__dirname, 'specs', `${id}.json`);
  if (!fs.existsSync(specPath)) { console.error(`spec not found: ${specPath}`); process.exit(1); }
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

  const outDir = path.join(__dirname, 'out', id + (guide ? '_guide' : ''));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

  for (let i = 0; i < spec.slides.length; i++) {
    const s = spec.slides[i];
    await page.setContent(slideHTML(s, guide), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    // セーフゾーンに収まるまで自動縮小（横→縦の順）
    const shrunk = await page.evaluate(() => {
      const safe = document.querySelector('.safe');
      const lines = [...document.querySelectorAll('.ln')];
      const changed = [];
      for (const el of lines) {
        let fs = parseFloat(getComputedStyle(el).fontSize);
        const start = fs;
        while (el.offsetWidth > safe.clientWidth && fs > 30) {
          fs -= 4; el.style.fontSize = fs + 'px';
        }
        if (fs !== start) changed.push(`${el.textContent.slice(0, 12)}… ${start}→${fs}px`);
      }
      let guard = 0;
      while (safe.scrollHeight > safe.clientHeight && guard++ < 80) {
        for (const el of lines) {
          el.style.fontSize = (parseFloat(getComputedStyle(el).fontSize) - 4) + 'px';
        }
      }
      if (guard > 0) changed.push(`縦あふれ補正 -${guard * 4}px`);
      return changed;
    });
    const n = String(i + 1).padStart(2, '0');
    const file = path.join(outDir, `${n}.png`);
    await page.screenshot({ path: file });
    console.log(`${n}.png  [${s.bg}]  ${s.sec || ''}${s.note ? '   MEMO: ' + s.note : ''}`);
    if (shrunk.length) console.log(`        auto-fit: ${shrunk.join(' / ')}`);
  }

  await browser.close();
  console.log(`\n${spec.slides.length} slides -> ${outDir}`);
})().catch(e => { console.error(e); process.exit(1); });
