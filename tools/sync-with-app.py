#!/usr/bin/env python3
"""
未来喫茶 Web ↔ プロセカアプリ — 共有ファイル同期

使い方:
  1. sync/sync-config.example.json を sync/sync-config.local.json にコピー
  2. appProjectPath と pathMap を編集
  3. 未来喫茶フォルダで:
       python3 tools/sync-with-app.py push   # Web → アプリ
       python3 tools/sync-with-app.py pull   # アプリ → Web
       python3 tools/sync-with-app.py diff   # 差分確認のみ

  --dry-run … コピーせず表示のみ
  --newer-only … 更新が新しい方だけ上書き（デフォルト）
  --force … 常にコピー先を上書き
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "sync" / "manifest.json"
CONFIG = ROOT / "sync" / "sync-config.local.json"
CONFIG_EXAMPLE = ROOT / "sync" / "sync-config.example.json"


def load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def resolve_pairs(cfg: dict) -> list[tuple[Path, Path]]:
    app_root = Path(cfg.get("appProjectPath", "")).expanduser()
    if not app_root or not str(app_root).strip():
        raise SystemExit("❌ sync/sync-config.local.json の appProjectPath を設定してください")
    if not app_root.is_dir():
        raise SystemExit(f"❌ アプリ側フォルダが見つかりません: {app_root}")

    manifest = load_json(MANIFEST)
    files = manifest.get("files") or []
    path_map: dict[str, str] = cfg.get("pathMap") or {}

    pairs: list[tuple[Path, Path]] = []
    for rel in files:
        rel = rel.replace("\\", "/")
        app_rel = path_map.get(rel, rel)
        web_path = ROOT / rel
        app_path = app_root / app_rel
        pairs.append((web_path, app_path))
    return pairs


def should_copy(src: Path, dst: Path, force: bool, newer_only: bool) -> bool:
    if not src.is_file():
        return False
    if force or not dst.exists():
        return True
    if newer_only:
        return src.stat().st_mtime > dst.stat().st_mtime
    return True


def run(direction: str, dry_run: bool, force: bool, newer_only: bool) -> int:
    cfg = load_json(CONFIG)
    if not CONFIG.exists():
        print("❌ sync/sync-config.local.json がありません")
        print(f"   cp {CONFIG_EXAMPLE.relative_to(ROOT)} {CONFIG.relative_to(ROOT)}")
        return 1

    pairs = resolve_pairs(cfg)
    copied = skipped = missing = 0

    for web_path, app_path in pairs:
        if direction == "push":
            src, dst = web_path, app_path
        else:
            src, dst = app_path, web_path

        label = f"{src} → {dst}"

        if not src.is_file():
            print(f"  スキップ（元なし）: {label}")
            missing += 1
            continue

        if not should_copy(src, dst, force, newer_only):
            print(f"  変更なし: {label}")
            skipped += 1
            continue

        print(f"  {'[dry-run] ' if dry_run else ''}同期: {label}")
        if not dry_run:
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
        copied += 1

    print()
    print(f"完了 ({direction}): 同期 {copied} / スキップ {skipped} / 元なし {missing}")
    if direction == "pull" and copied and not dry_run:
        manifest = load_json(MANIFEST)
        for item in manifest.get("webOnlyAfterPull") or []:
            when = item.get("when")
            if when and (ROOT / when).exists():
                print(f"  ※ Web 側の追加作業: {item.get('command')} （{when} 更新時）")
    return 0


def run_diff() -> int:
    cfg = load_json(CONFIG)
    if not CONFIG.exists():
        print("❌ sync/sync-config.local.json がありません")
        return 1
    pairs = resolve_pairs(cfg)
    for web_path, app_path in pairs:
        w_ok = web_path.is_file()
        a_ok = app_path.is_file()
        if not w_ok and not a_ok:
            print(f"  両方なし: {web_path.name}")
            continue
        if w_ok != a_ok:
            print(f"  片方のみ: Web={'あり' if w_ok else 'なし'} App={'あり' if a_ok else 'なし'} — {web_path.relative_to(ROOT)}")
            continue
        w_t = web_path.stat().st_mtime
        a_t = app_path.stat().st_mtime
        if abs(w_t - a_t) < 0.5 and web_path.read_bytes() == app_path.read_bytes():
            print(f"  同一: {web_path.relative_to(ROOT)}")
        elif w_t > a_t:
            print(f"  Web が新しい: {web_path.relative_to(ROOT)}")
        else:
            print(f"  アプリが新しい: {web_path.relative_to(ROOT)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="未来喫茶 ↔ プロセカアプリ ファイル同期")
    parser.add_argument("direction", choices=["push", "pull", "diff"], help="push=Web→アプリ, pull=アプリ→Web")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="常に上書き")
    parser.add_argument("--no-newer-only", action="store_true", help="新しい方だけ、を無効化")
    args = parser.parse_args()

    if args.direction == "diff":
        return run_diff()
    return run(
        args.direction,
        args.dry_run,
        args.force,
        newer_only=not args.no_newer_only,
    )


if __name__ == "__main__":
    sys.exit(main())
