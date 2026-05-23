#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

GH="$(command -v gh || true)"
if [[ -z "$GH" ]]; then
  echo "gh (GitHub CLI) をインストールしてください: brew install gh"
  exit 1
fi

if ! "$GH" auth status >/dev/null 2>&1; then
  echo "GitHub CLI にログインしてください:"
  echo "  gh auth login -h github.com -p ssh -s repo,workflow --skip-ssh-key -w"
  exit 1
fi

if ! "$GH" repo view ALiCE0239/mirai-kissa >/dev/null 2>&1; then
  "$GH" repo create mirai-kissa --public --description "未来喫茶 — プロセカ計算機ツール集"
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin git@github.com:ALiCE0239/mirai-kissa.git
fi

git push -u origin main

"$GH" api repos/ALiCE0239/mirai-kissa/pages -X POST -f build_type=workflow 2>/dev/null || true

echo ""
echo "デプロイ完了。1〜3分後に公開されます:"
echo "  https://alice0239.github.io/mirai-kissa/"
echo "Pages 設定: https://github.com/ALiCE0239/mirai-kissa/settings/pages"
