/**
 * スライドPNG + 音声 → 完成MP4（1080x1920 / 30fps）
 *
 *   node video/build.js day01                          # 無音プレビュー（尺の確認用）
 *   node video/build.js day01 --voice rec.m4a          # 地声を乗せる
 *   node video/build.js day01 --voice rec.m4a --bgm lofi.mp3
 *   node video/build.js day01 --voice rec.m4a --fit    # 音声の実尺にスライドを自動フィット
 *
 * スライドの表示秒数は slides/specs/<id>.json の "sec": "0-4" から読む。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BGM_DB = -18;          // ボイス優先
const BGM_FADE = 3;          // 終端フェードアウト秒
const FPS = 30;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : null;
}
const has = n => process.argv.includes(n);

function probeDuration(file) {
  const out = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', file,
  ]).toString().trim();
  const d = parseFloat(out);
  if (!isFinite(d)) throw new Error(`音声の長さを取得できません: ${file}`);
  return d;
}

const id = process.argv[2];
if (!id) { console.error('usage: node video/build.js <specId> [--voice f] [--bgm f] [--fit]'); process.exit(1); }

const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'slides', 'specs', `${id}.json`), 'utf8'));
const pngDir = path.join(ROOT, 'slides', 'out', id);
if (!fs.existsSync(pngDir)) {
  console.error(`スライドがありません。先に実行してください:\n  node slides/build.js ${id}`);
  process.exit(1);
}

// spec の "sec": "0-4" から各スライドの尺を出す
let durations = spec.slides.map((s, i) => {
  const m = /^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/.exec(s.sec || '');
  if (!m) throw new Error(`slide ${i + 1}: "sec" が不正です（例 "0-4"）`);
  const d = parseFloat(m[2]) - parseFloat(m[1]);
  if (d <= 0) throw new Error(`slide ${i + 1}: 尺が0以下です`);
  return d;
});

const voice = arg('--voice');
const bgm = arg('--bgm');
for (const f of [voice, bgm]) {
  if (f && !fs.existsSync(f)) { console.error(`ファイルが見つかりません: ${f}`); process.exit(1); }
}

// --fit: 実際の録音尺にスライド配分を比例で合わせる
let specTotal = durations.reduce((a, b) => a + b, 0);
if (voice && has('--fit')) {
  const vd = probeDuration(voice);
  const k = vd / specTotal;
  durations = durations.map(d => d * k);
  console.log(`--fit: 録音 ${vd.toFixed(2)}s に合わせて各スライドを ${k.toFixed(3)}倍`);
  specTotal = vd;
}
const total = specTotal;

// concat demuxer 用のリスト（最後のファイルは仕様上もう一度書く）
const files = durations.map((_, i) => path.join(pngDir, `${String(i + 1).padStart(2, '0')}.png`));
for (const f of files) if (!fs.existsSync(f)) { console.error(`PNGがありません: ${f}`); process.exit(1); }

const listPath = path.join(ROOT, 'video', `.${id}.concat.txt`);
const list = files.map((f, i) => `file '${f.replace(/\\/g, '/')}'\nduration ${durations[i].toFixed(3)}`).join('\n')
  + `\nfile '${files[files.length - 1].replace(/\\/g, '/')}'\n`;
fs.writeFileSync(listPath, list);

// ---- ffmpeg 組み立て ----
const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath];
let aIdx = 1;
let voiceIdx = null, bgmIdx = null;
if (voice) { args.push('-i', voice); voiceIdx = aIdx++; }
if (bgm) { args.push('-stream_loop', '-1', '-i', bgm); bgmIdx = aIdx++; }

const filters = [];
let amap = null;
if (voiceIdx !== null && bgmIdx !== null) {
  const gain = Math.pow(10, BGM_DB / 20).toFixed(4);
  const st = Math.max(0, total - BGM_FADE).toFixed(2);
  filters.push(`[${bgmIdx}:a]volume=${gain},afade=t=out:st=${st}:d=${BGM_FADE}[bg]`);
  filters.push(`[${voiceIdx}:a][bg]amix=inputs=2:normalize=0:duration=first[aout]`);
  amap = '[aout]';
} else if (voiceIdx !== null) {
  amap = `${voiceIdx}:a`;
} else if (bgmIdx !== null) {
  const gain = Math.pow(10, BGM_DB / 20).toFixed(4);
  const st = Math.max(0, total - BGM_FADE).toFixed(2);
  filters.push(`[${bgmIdx}:a]volume=${gain},afade=t=out:st=${st}:d=${BGM_FADE}[aout]`);
  amap = '[aout]';
}

if (filters.length) args.push('-filter_complex', filters.join(';'));
args.push('-map', '0:v');
if (amap) args.push('-map', amap, '-c:a', 'aac', '-b:a', '192k');
args.push(
  '-r', String(FPS), '-vsync', 'cfr',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-t', total.toFixed(3),
);

const outDir = path.join(ROOT, 'video', 'out');
fs.mkdirSync(outDir, { recursive: true });
const suffix = voice ? '' : '_preview';
const outFile = path.join(outDir, `${id}${suffix}.mp4`);
args.push(outFile);

console.log(`スライド ${files.length}枚 / 合計 ${total.toFixed(1)}秒`);
durations.forEach((d, i) => console.log(`  ${String(i + 1).padStart(2, '0')}.png  ${d.toFixed(2)}s`));
console.log(`音声: ${voice ? path.basename(voice) : 'なし（無音プレビュー）'}${bgm ? ` + BGM ${path.basename(bgm)} (${BGM_DB}dB)` : ''}`);

try {
  execFileSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
} catch (e) {
  console.error('\nffmpeg 失敗:\n' + (e.stderr ? e.stderr.toString().split('\n').slice(-25).join('\n') : e.message));
  process.exit(1);
} finally {
  fs.unlinkSync(listPath);
}

const size = (fs.statSync(outFile).size / 1024 / 1024).toFixed(1);
console.log(`\n完成: ${outFile}  (${size} MB)`);
if (!voice) console.log('※ 無音プレビューです。録音ができたら --voice を付けて再実行してください。');
