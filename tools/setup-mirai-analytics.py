#!/usr/bin/env python3
"""未来喫茶 — Supabase アナリティクス一括セットアップ（Python版）"""
import json
import os
import re
import secrets
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT / ".env.analytics.local"
SQL_PATH = ROOT / "data" / "analytics-supabase.sql"
CONFIG_PATH = ROOT / "js" / "analytics-config.js"
API = "https://api.supabase.com/v1"


def load_env():
    if not ENV_PATH.exists():
        print("❌ .env.analytics.local がありません", file=sys.stderr)
        sys.exit(1)
    env = {}
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def mgmt(token, path, method="GET", body=None):
    url = API + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "mirai-kissa-setup/1.0",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            raw = res.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            err = json.loads(raw)
            msg = err.get("message") or err.get("error") or raw
        except json.JSONDecodeError:
            msg = raw or e.reason
        raise RuntimeError(f"Management API {path} → {e.code}: {msg}") from e


def wait_healthy(token, ref, max_min=12):
    end = time.time() + max_min * 60
    while time.time() < end:
        h = mgmt(token, f"/projects/{ref}/health?services=db")
        if isinstance(h, list):
            db = next((x for x in h if x.get("name") == "db"), None)
            if db and db.get("healthy"):
                return
        print(".", end="", flush=True)
        time.sleep(8)
    raise RuntimeError("プロジェクト起動タイムアウト")


def pick_keys(api_keys):
    lst = api_keys if isinstance(api_keys, list) else api_keys.get("api_keys", [])
    anon = service = ""
    for k in lst:
        name = (k.get("name") or k.get("type") or "").lower()
        key = k.get("api_key") or k.get("key") or ""
        if name in ("anon", "publishable"):
            anon = key
        if name in ("service_role", "secret"):
            service = key
    return anon, service


def run_sql(token, ref, sql_text):
    # コメント行を除き、ファイル全体を一度に実行（; 分割は CHECK 句で誤分割するため不可）
    lines = []
    for line in sql_text.splitlines():
        s = line.strip()
        if s.startswith("--"):
            continue
        lines.append(line)
    query = "\n".join(lines).strip()
    mgmt(token, f"/projects/{ref}/database/query", "POST", {"query": query})


def create_admin(project_url, service_key, email, password):
    url = project_url.rstrip("/") + "/auth/v1/admin/users"
    body = json.dumps({"email": email, "password": password, "email_confirm": True}).encode()
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            res.read()
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        if not re.search(r"already|exists|registered", raw, re.I):
            raise RuntimeError(f"管理者ユーザー作成: {raw}") from e


def write_config(url, anon_key):
    CONFIG_PATH.write_text(
        f"""/**
 * アナリティクス設定（setup-mirai-analytics.py で生成）
 */
window.MIRAI_ANALYTICS_CONFIG = {{
  enabled: true,
  supabaseUrl: '{url}',
  supabaseAnonKey: '{anon_key}',
}};
""",
        encoding="utf-8",
    )
    print("✅ js/analytics-config.js を更新しました")


def main():
    env = load_env()
    token = env.get("SUPABASE_ACCESS_TOKEN", "")
    admin_email = env.get("ADMIN_EMAIL", "")
    admin_password = env.get("ADMIN_PASSWORD", "")
    if not token:
        print("❌ SUPABASE_ACCESS_TOKEN が必要です", file=sys.stderr)
        sys.exit(1)
    create_admin_user = bool(admin_email and admin_password)

    ref = env.get("SUPABASE_PROJECT_REF", "")
    project_url = env.get("SUPABASE_URL", "")

    if not ref:
        print("📦 組織一覧を取得…")
        orgs = mgmt(token, "/organizations")
        if not orgs:
            raise RuntimeError("組織が見つかりません")
        org_slug = orgs[0].get("slug") or orgs[0].get("id")
        db_pass = env.get("DB_PASSWORD") or secrets.token_urlsafe(24)
        name = env.get("PROJECT_NAME", "mirai-kissa-analytics")
        print(f"📦 プロジェクト「{name}」を作成中…")
        created = mgmt(
            token,
            "/projects",
            "POST",
            {
                "name": name,
                "organization_slug": org_slug,
                "db_pass": db_pass,
                "region_selection": {"type": "smartGroup", "code": env.get("REGION", "apac")},
            },
        )
        ref = created.get("id") or created.get("ref")
        project_url = f"https://{ref}.supabase.co"
        print("   ref:", ref)
        print("   URL:", project_url)
        if "DB_PASSWORD" not in env:
            print("   ※ DB パスワード（控えてください）:", db_pass)
        print("⏳ DB 起動待ち", end="", flush=True)
        wait_healthy(token, ref)
        print(" OK")
    elif not project_url:
        project_url = f"https://{ref}.supabase.co"

    print("🔑 API キー取得…")
    keys = mgmt(token, f"/projects/{ref}/api-keys?reveal=true")
    anon, service = pick_keys(keys)
    if not anon or not service:
        raise RuntimeError("anon / service_role キーが取得できませんでした")

    print("🗄️ SQL 実行…")
    run_sql(token, ref, SQL_PATH.read_text(encoding="utf-8"))

    if create_admin_user:
        print("👤 管理者ユーザー作成…")
        create_admin(project_url, service, admin_email, admin_password)
    else:
        print("⏭️ 管理者は Supabase → Authentication → Users で追加してください")

    write_config(project_url, anon)
    print("\n========================================")
    print("  セットアップ完了")
    print("========================================")
    if create_admin_user:
        print("ログイン:", admin_email)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("❌", e, file=sys.stderr)
        sys.exit(1)
