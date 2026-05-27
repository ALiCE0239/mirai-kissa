# 未来喫茶 UI デザイン仕様（Web → アプリ統一用）

Web の `css/style.css` とアプリの `MiraiKissaTheme.swift` を揃えるためのメモです。  
色・角丸を変えたら **両方** を更新してください。

## カラーパレット

| 名前 | CSS 変数 | 値 | Swift（MiraiPalette） |
|------|----------|-----|------------------------|
| 緑 | `--brand-green` | `#10b981` | `brandGreen` |
| 青 | `--brand-blue` | `#0ea5e9` | `brandBlue` |
| ティール | `--brand-teal` | `#14b8a6` | `brandTeal` |
| 本文 | `--text-primary` | `#1e293b` | `textPrimary` |
| 副文 | `--text-secondary` | `#64748b` | `textSecondary` |
| 薄文 | `--text-muted` | `#a8b4c4` | `textMuted` |
| 背景 | `--bg-primary` | `#ffffff` | ページ白 |
| 副背景 | `--bg-secondary` | `#f4fbf9` | — |

## 角丸

| 用途 | CSS | 目安 |
|------|-----|------|
| 小 | `--radius-sm` | 8px |
| 中 | `--radius-md` | 12px |
| 大 | `--radius-lg` | 20px |
| カード外枠 | `--radius-xl` | 28px |
| ピル | `--radius-pill` | 9999px |

## 計算機カード（ホーム）

Web: `.tool-card`, `.tool-card--green` など  
App: `MiraiToolCard`, `CalculatorTool.accent`

| 機能 | Web クラス | App category / accent |
|------|------------|------------------------|
| あまつゆ | green | マイセカイ / green |
| イベントPt | blue | イベント / blue |
| 実効値 | cyan | 編成 / teal |
| ポイント調整 | yellow | ポ調（要 Web と統一） |
| ポイント調整NEXT | yellow + 強調枠 | （未） |
| キズナ | green | キズナ / green |
| イベラン診断 | blue | イベント / blue |

## コンポーネント対応

| Web | アプリ |
|-----|--------|
| `.btn-primary` | `MiraiPrimaryButton` |
| `.form-input` | `MiraiTextField` 系 |
| `.result-panel` | `MiraiResultPanel` / `CalculatorPageScaffold` |
| `.info-box` | `MiraiInfoBox` |
| `.section-heading` | `MiraiSectionHeading` |
| ナビ `.nav` | `TabView` + `NavigationStack` |

## フォント

- 本文: Zen Kaku Gothic New（Web `@import` / iOS システム丸ゴシック近傍）
- 数値強調: Orbitron（Web）/ アプリは `.rounded` や太字で代用可
