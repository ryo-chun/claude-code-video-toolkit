# スライド自動生成ツール

JSONを書くと 1080×1920 の PNG が出ます。CapCutにそのまま並べられます。

## 使い方

```bash
node slides/build.js day01
```

→ `slides/out/day01/01.png 〜 07.png`

TikTokのUI（いいねボタン・キャプション欄）と文字が重ならないか確認する場合：

```bash
node slides/build.js day01 --guide
```

→ `slides/out/day01_guide/` に赤いオーバーレイ付きで出力。赤い部分に文字が入っていなければOK。

## 新しい動画を作る

`slides/specs/day02.json` を作って `node slides/build.js day02` を実行するだけです。

## spec の書き方

```json
{
  "id": "day02",
  "slides": [
    {
      "sec": "0-4",
      "bg": "black",
      "note": "編集メモ（PNGには出ません）",
      "lines": [
        { "t": "小さい前置き", "size": "small" },
        { "t": "強調したい言葉", "size": "large", "accent": "red", "gap": 24 }
      ]
    }
  ]
}
```

### スライド単位

| キー | 値 | 説明 |
|------|-----|------|
| `bg` | `black` / `white` / `red` / `green` | 背景色。文字色は自動で決まる |
| `sec` | `"0-4"` | 表示秒数。ビルド時のログに出るだけ |
| `note` | 文字列 | 編集メモ。**本番PNGには焼き込まれない**（`--guide`時のみ表示） |
| `lines` | 配列 | 表示する行 |

### 行単位

| キー | 値 | 説明 |
|------|-----|------|
| `t` | 文字列 | 本文。`\n` で改行できる |
| `size` | `small`(54) / `normal`(92) / `large`(128) / `huge`(190) | 文字サイズ |
| `accent` | `red` `green` `yellow` `blue` `dim` または `"#c0392b"` | 文字色。省略で背景に応じた既定色 |
| `gap` | 数値 | 上の行との間隔(px) |
| `box` | `true` | 枠で囲む（プロンプト文の引用などに） |

## 自動でやってくれること

- **はみ出しの自動縮小** — 文字が長すぎるとセーフゾーンに収まるまでフォントを縮める。縮めた場合はビルドログに出る
- **セーフゾーン配置** — 上220px / 下420px / 左90px / 右155px を避けて中央に配置
- **改行の固定** — 勝手な折り返しをせず、`\n` を書いた位置だけで改行する

## 前提

`playwright` と Chromium が必要です（導入済み）。入っていない環境では：

```bash
npm install && npx playwright install chromium
```
