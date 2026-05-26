#!/usr/bin/env node
/**
 * 未来喫茶 — Supabase アナリティクス一括セットアップ
 *
 * 事前準備:
 *   1. https://supabase.com で無料アカウント作成
 *   2. Account → Access Tokens → Generate new token
 *   3. .env.analytics.local を作成（.env.analytics.local.example を参照）
 *
 * 実行: node tools/setup-mirai-analytics.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomBytes } from 'crypto';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env.analytics.local');
const SQL_PATH = join(ROOT, 'data', 'analytics-supabase.sql');
const CONFIG_PATH = join(ROOT, 'js', 'analytics-config.js');
const API = 'https://api.supabase.com/v1';

function loadEnv() {
  if (!existsSync(ENV_PATH)) {
    console.error('❌ .env.analytics.local がありません。');
    console.error('   .env.analytics.local.example をコピーして値を入れてください。');
    process.exit(1);
  }
  const env = {};
  readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith('#')) return;
      const i = t.indexOf('=');
      if (i < 1) return;
      env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    });
  return env;
}

async function mgmt(token, path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'User-Agent': 'mirai-kissa-setup/1.0',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || data?.error || res.statusText || text;
    throw new Error(`Management API ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

async function waitHealthy(token, ref, maxMin = 12) {
  const end = Date.now() + maxMin * 60 * 1000;
  while (Date.now() < end) {
    const h = await mgmt(token, `/projects/${ref}/health`);
    const db = Array.isArray(h) ? h.find((x) => x.name === 'db') : null;
    if (db?.healthy) return;
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 8000));
  }
  throw new Error('プロジェクトの起動がタイムアウトしました。しばらく待って再実行してください。');
}

function pickKeys(apiKeys) {
  const list = Array.isArray(apiKeys) ? apiKeys : apiKeys?.api_keys || [];
  let anon = '';
  let service = '';
  for (const k of list) {
    const name = (k.name || k.type || '').toLowerCase();
    if (name === 'anon' || name === 'publishable') anon = k.api_key || k.key || '';
    if (name === 'service_role' || name === 'secret') service = k.api_key || k.key || '';
  }
  return { anon, service };
}

async function runSql(token, ref, sql) {
  const query = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .trim();
  await mgmt(token, `/projects/${ref}/database/query`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

async function createAdminUser(projectUrl, serviceKey, email, password) {
  const res = await fetch(projectUrl.replace(/\/$/, '') + '/auth/v1/admin/users', {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !/already|exists|registered/i.test(JSON.stringify(data))) {
    throw new Error('管理者ユーザー作成: ' + (data.msg || data.message || res.status));
  }
}

function writeConfig(url, anonKey) {
  const body = `/**
 * アナリティクス設定（setup-mirai-analytics.mjs で生成）
 */
window.MIRAI_ANALYTICS_CONFIG = {
  enabled: true,
  supabaseUrl: '${url}',
  supabaseAnonKey: '${anonKey}',
};
`;
  writeFileSync(CONFIG_PATH, body, 'utf8');
  console.log('✅ js/analytics-config.js を更新しました');
}

async function main() {
  const env = loadEnv();
  const token = env.SUPABASE_ACCESS_TOKEN;
  const adminEmail = env.ADMIN_EMAIL || '';
  const adminPassword = env.ADMIN_PASSWORD || '';
  if (!token) {
    console.error('❌ SUPABASE_ACCESS_TOKEN が必要です');
    process.exit(1);
  }
  const createAdmin = !!(adminEmail && adminPassword);

  let ref = env.SUPABASE_PROJECT_REF || '';
  let projectUrl = env.SUPABASE_URL || '';

  if (!ref) {
    console.log('📦 組織一覧を取得…');
    const orgs = await mgmt(token, '/organizations');
    const org = orgs?.[0];
    if (!org?.slug && !org?.id) throw new Error('組織が見つかりません。Supabase ダッシュボードで組織を作成してください。');
    const orgSlug = org.slug || org.id;
    const dbPass = env.DB_PASSWORD || randomBytes(24).toString('base64url');
    const projectName = env.PROJECT_NAME || 'mirai-kissa-analytics';
    console.log(`📦 プロジェクト「${projectName}」を作成中（数分かかります）…`);
    const created = await mgmt(token, '/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: projectName,
        organization_slug: orgSlug,
        db_pass: dbPass,
        region_selection: { type: 'smartGroup', code: env.REGION || 'apac' },
      }),
    });
    ref = created.id || created.ref;
    projectUrl = 'https://' + ref + '.supabase.co';
    console.log('   ref:', ref);
    console.log('   URL:', projectUrl);
    if (!env.DB_PASSWORD) {
      console.log('   ※ DB パスワード（控えてください）:', dbPass);
    }
    process.stdout.write('⏳ DB 起動待ち');
    await waitHealthy(token, ref);
    console.log(' OK');
  } else if (!projectUrl) {
    projectUrl = 'https://' + ref + '.supabase.co';
  }

  console.log('🔑 API キー取得…');
  const keys = await mgmt(token, `/projects/${ref}/api-keys?reveal=true`);
  const { anon, service } = pickKeys(keys);
  if (!anon || !service) throw new Error('anon / service_role キーが取得できませんでした');

  console.log('🗄️ SQL 実行…');
  const sql = readFileSync(SQL_PATH, 'utf8');
  await runSql(token, ref, sql);

  if (createAdmin) {
    console.log('👤 管理者ユーザー作成…');
    await createAdminUser(projectUrl, service, adminEmail, adminPassword);
  } else {
    console.log('⏭️ ADMIN_EMAIL / ADMIN_PASSWORD 未設定 → 管理者はダッシュボードで追加してください');
  }

  writeConfig(projectUrl, anon);

  console.log('\n========================================');
  console.log('  セットアップ完了');
  console.log('========================================');
  console.log('管理者ページ: （公開URL）/#/admin');
  if (createAdmin) console.log('ログイン:', adminEmail);
  else {
    console.log('ログイン: Supabase → Authentication → Users → Add user');
    console.log('  （メール・パスワードを設定し #/admin でログイン）');
  }
  console.log('\n次: git add js/analytics-config.js && git commit && git push');
}

main().catch((err) => {
  console.error('❌', err.message || err);
  process.exit(1);
});
