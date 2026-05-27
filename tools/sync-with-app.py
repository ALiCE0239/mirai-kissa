#!/usr/bin/env python3
"""
未来喫茶 Web ↔ プロセカアプリ — 共有ファイル同期

使い方:
  python3 tools/sync-with-app.py push      # データ + sync/メモ一式 → アプリ
  python3 tools/sync-with-app.py pull      # アプリ → Web（pathMap 逆）
  python3 tools/sync-with-app.py diff      # 差分確認
  python3 tools/sync-with-app.py status    # 機能対応表のサマリー表示
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


def load_config() -> dict:
    if not CONFIG.exists():
        print("❌ sync/sync-config.local.json がありません")
        print(f"   cp {CONFIG_EXAMPLE.relative_to(ROOT)} {CONFIG.relative_to(ROOT)}")
        sys.exit(1)
    return load_json(CONFIG)


def app_root(cfg: dict) -> Path:
    root = Path(cfg.get("appProjectPath", "")).expanduser()
    if not root or not str(root).strip():
        raise SystemExit("❌ sync/sync-config.local.json の appProjectPath を設定してください")
    if not root.is_dir():
        raise SystemExit(f"❌ アプリ側フォルダが見つかりません: {root}")
    return root


def resolve_pairs(cfg: dict) -> list[tuple[Path, Path]]:
    root = app_root(cfg)
    manifest = load_json(MANIFEST)
    path_map: dict[str, str] = cfg.get("pathMap") or {}
    pairs: list[tuple[Path, Path]] = []
    for rel in manifest.get("files") or []:
        rel = rel.replace("\\", "/")
        app_rel = path_map.get(rel, rel)
        pairs.append((ROOT / rel, root / app_rel))
    return pairs


def resolve_dir_pairs(cfg: dict) -> list[tuple[Path, Path, list[str]]]:
    root = app_root(cfg)
    manifest = load_json(MANIFEST)
    out: list[tuple[Path, Path, list[str]]] = []
    for item in manifest.get("syncDirs") or []:
        web_dir = ROOT / item["web"]
        app_dir = root / item["app"]
        exclude = item.get("exclude") or []
        out.append((web_dir, app_dir, exclude))
    return out


def should_copy(src: Path, dst: Path, force: bool, newer_only: bool) -> bool:
    if not src.is_file():
        return False
    if force or not dst.exists():
        return True
    if newer_only:
        return src.stat().st_mtime > dst.stat().st_mtime
    return True


def copy_file(src: Path, dst: Path, dry_run: bool) -> None:
    if not dry_run:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def sync_files(
    direction: str,
    pairs: list[tuple[Path, Path]],
    dry_run: bool,
    force: bool,
    newer_only: bool,
) -> tuple[int, int, int]:
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
        copy_file(src, dst, dry_run)
        copied += 1
    return copied, skipped, missing


def sync_dirs(
    direction: str,
    dir_pairs: list[tuple[Path, Path, list[str]]],
    dry_run: bool,
    force: bool,
    newer_only: bool,
) -> tuple[int, int, int]:
    copied = skipped = missing = 0
    for web_dir, app_dir, exclude in dir_pairs:
        if direction == "push":
            src_root, dst_root = web_dir, app_dir
        else:
            src_root, dst_root = app_dir, web_dir
        if not src_root.is_dir():
            print(f"  スキップ（フォルダなし）: {src_root}")
            missing += 1
            continue
        for src in src_root.rglob("*"):
            if not src.is_file():
                continue
            rel = src.relative_to(src_root).as_posix()
            if rel in exclude or any(rel.startswith(e.rstrip("/") + "/") for e in exclude if e.endswith("/")):
                continue
            if rel.split("/")[-1] in exclude:
                continue
            dst = dst_root / rel
            label = f"{src} → {dst}"
            if not should_copy(src, dst, force, newer_only):
                skipped += 1
                continue
            print(f"  {'[dry-run] ' if dry_run else ''}同期: {label}")
            copy_file(src, dst, dry_run)
            copied += 1
    return copied, skipped, missing


def run(direction: str, dry_run: bool, force: bool, newer_only: bool) -> int:
    cfg = load_config()
    f_pairs = resolve_pairs(cfg)
    d_pairs = resolve_dir_pairs(cfg)

    c1, s1, m1 = sync_files(direction, f_pairs, dry_run, force, newer_only)
    print()
    print("--- sync/ メモ・仕様 ---")
    c2, s2, m2 = sync_dirs(direction, d_pairs, dry_run, force, newer_only)

    total_c, total_s, total_m = c1 + c2, s1 + s2, m1 + m2
    print()
    print(f"完了 ({direction}): 同期 {total_c} / スキップ {total_s} / 元なし {total_m}")
    if direction == "pull" and total_c and not dry_run:
        manifest = load_json(MANIFEST)
        for item in manifest.get("webOnlyAfterPull") or []:
            when = item.get("when")
            if when and (ROOT / when).exists():
                print(f"  ※ Web 側: {item.get('command')} （{when}）")
    if direction == "push" and c2 and not dry_run:
        print("  ※ アプリ Cursor: docs/Web同期/開発メモ.md を読んで実装依頼できます")
    return 0


def run_diff() -> int:
    cfg = load_config()
    for web_path, app_path in resolve_pairs(cfg):
        _diff_one(web_path, app_path)
    for web_dir, app_dir, exclude in resolve_dir_pairs(cfg):
        if not web_dir.is_dir():
            continue
        for src in web_dir.rglob("*"):
            if not src.is_file():
                continue
            rel = src.relative_to(web_dir).as_posix()
            if rel in exclude or rel.split("/")[-1] in exclude:
                continue
            _diff_one(web_dir / rel, app_dir / rel)


def _diff_one(web_path: Path, app_path: Path) -> None:
    w_ok = web_path.is_file()
    a_ok = app_path.is_file()
    label = web_path.relative_to(ROOT) if w_ok else app_path
    if not w_ok and not a_ok:
        return
    if w_ok != a_ok:
        print(f"  片方のみ: Web={'あり' if w_ok else 'なし'} App={'あり' if a_ok else 'なし'} — {label}")
        return
    if web_path.read_bytes() == app_path.read_bytes():
        print(f"  同一: {web_path.relative_to(ROOT)}")
    elif web_path.stat().st_mtime > app_path.stat().st_mtime:
        print(f"  Web が新しい: {web_path.relative_to(ROOT)}")
    else:
        print(f"  アプリが新しい: {web_path.relative_to(ROOT)}")


def run_status() -> int:
    path = ROOT / "sync" / "機能対応表.json"
    if not path.exists():
        print("sync/機能対応表.json がありません")
        return 1
    data = load_json(path)
    print(f"更新: {data.get('updated', '—')}\n")
    for f in data.get("features") or []:
        st = f.get("status", "?")
        mark = {"synced": "✓", "web_only": "Webのみ", "app_only": "Appのみ", "partial": "一部"}.get(st, st)
        print(f"  [{mark}] {f.get('name')} (id={f.get('id')})")
        if f.get("notes"):
            print(f"         {f['notes']}")
    print("\n--- Web のみ ---")
    for x in data.get("features") or []:
        if x.get("status") == "web_only":
            print(f"  · {x.get('name')}")
    print("\n--- アプリのみの拡張 ---")
    for line in data.get("appOnlyFeatures") or []:
        print(f"  · {line}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="未来喫茶 ↔ プロセカアプリ 同期")
    parser.add_argument(
        "direction",
        choices=["push", "pull", "diff", "status"],
        help="push=Web→アプリ, pull=アプリ→Web, status=機能対応表",
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--no-newer-only", action="store_true")
    args = parser.parse_args()

    if args.direction == "status":
        return run_status()
    if args.direction == "diff":
        return run_diff()
    return run(args.direction, args.dry_run, args.force, newer_only=not args.no_newer_only)


if __name__ == "__main__":
    sys.exit(main())
