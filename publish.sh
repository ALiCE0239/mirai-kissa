#!/usr/bin/env bash
# GitHub Pages 公開（gh 不要版）
# 1. ブラウザでリポジトリを作成 → 2. このスクリプトで push → 3. Pages 設定
set -euo pipefail
cd "$(dirname "$0")"

REPO="mirai-kissa"
OWNER="ALiCE0239"
REMOTE="git@github.com:${OWNER}/${REPO}.git"
PAGES_URL="https://$(echo "$OWNER" | tr '[:upper:]' '[:lower:]').github.io/${REPO}/"

if ! git ls-remote "$REMOTE" HEAD &>/dev/null; then
  echo "=========================================="
  echo "  リポジトリがまだありません"
  echo "=========================================="
  echo ""
  echo "次の URL をブラウザで開き、「Create repository」を押してください。"
  echo "  ※ README / .gitignore / license はすべて付けない"
  echo ""
  echo "  https://github.com/new?name=${REPO}&visibility=public"
  echo ""
  read -r -p "作成が終わったら Enter を押してください… "
  if ! git ls-remote "$REMOTE" HEAD &>/dev/null; then
    echo "エラー: まだ ${OWNER}/${REPO} が見つかりません。名前と公開設定を確認してください。"
    exit 1
  fi
fi

if ! git remote get-url origin &>/dev/null; then
  git remote add origin "$REMOTE"
elif [[ "$(git remote get-url origin)" != "$REMOTE" ]]; then
  git remote set-url origin "$REMOTE"
fi

echo "push しています…"
git push -u origin main

echo ""
echo "=========================================="
echo "  push 完了"
echo "=========================================="
echo ""
echo "あと 1 手順: GitHub Pages の公開元を設定（ブラウザ）"
echo ""
echo "  https://github.com/${OWNER}/${REPO}/settings/pages"
echo ""
echo "  Build and deployment → Source:"
echo "    「Deploy from a branch」"
echo "    Branch: gh-pages  /  Folder: / (root)"
echo "    → Save"
echo ""
echo "  （main に push すると Actions が gh-pages ブランチを更新します）"
echo ""
echo "公開 URL:"
echo "  ${PAGES_URL}"
echo ""

GH="$(command -v gh 2>/dev/null || true)"
if [[ -n "$GH" ]] && "$GH" auth status &>/dev/null 2>&1; then
  "$GH" api "repos/${OWNER}/${REPO}/pages" -X POST -f build_type=workflow 2>/dev/null \
    && echo "（gh 認証済みのため Pages を API で設定しました）" || true
fi
