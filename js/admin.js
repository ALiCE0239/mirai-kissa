/**
 * 未来喫茶 — 管理者ページ
 * - Supabase 認証 + アナリティクス
 * - Firebase 認証 + ユーザー特典（カードデザイン・称号）配布
 */
const AdminPage = (function () {
  'use strict';

  const TOKEN_KEY = 'miraiKissaAdminToken';
  /** Supabase 側の管理者メール（画面には出さない） */
  const ADMIN_EMAIL = 'admin@mirai-kissa.local';

  const PATH_LABELS = {
    '/': 'ホーム',
    '/amatsuyu': 'あまつゆ',
    '/event': 'イベントPt',
    '/exec': '実効値',
    '/adjust': 'ポイント調整',
    '/adjust-next': 'ポイント調整NEXT',
    '/kizuna': 'キズナ',
    '/diagnosis': 'イベラン診断',
  };

  let activeTab = 'analytics';
  let currentUserCtx = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function cfg() {
    return window.MIRAI_ANALYTICS_CONFIG || {};
  }

  function adminCfg() {
    return window.MIRAI_ADMIN_CONFIG || {};
  }

  function baseUrl() {
    return (cfg().supabaseUrl || '').replace(/\/$/, '');
  }

  function anonKey() {
    return cfg().supabaseAnonKey || '';
  }

  function formatNum(n) {
    if (typeof window.fmtNum === 'function') return window.fmtNum(n);
    return Number(n).toLocaleString('ja-JP');
  }

  function authHeaders() {
    const key = anonKey();
    return {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
    };
  }

  function loginErrorMessage(data, status) {
    const code = data.error_code || data.code || '';
    const msg = data.error_description || data.msg || data.message || '';
    if (code === 'invalid_credentials' || /invalid login/i.test(msg)) {
      return 'パスワードが違います。';
    }
    if (status === 0 || /failed to fetch|network/i.test(String(msg))) {
      return '通信できません。公開サイト（https://39cafe.fictionscale.jp/#/admin）から開いてください。ローカルファイル（file://）ではログインできません。';
    }
    return msg || 'ログインに失敗しました（' + status + '）';
  }

  function startOfTodayIso() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }

  function daysAgoIso(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString();
  }

  function getToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch (e) {
      return null;
    }
  }

  function setToken(token) {
    try {
      if (token) sessionStorage.setItem(TOKEN_KEY, token);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* ignore */ }
  }

  async function fb() {
    return window.MiraiFirebaseReady ? await window.MiraiFirebaseReady : null;
  }

  function normalizePublicId(raw) {
    if (window.MiraiFriends && typeof window.MiraiFriends.normalizePublicId === 'function') {
      return window.MiraiFriends.normalizePublicId(raw);
    }
    return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  }

  async function fetchFirestoreAdminUidsOnly() {
    const f = await fb();
    if (!f || !f.configured) {
      return { uids: [], exists: false, formatError: null };
    }
    try {
      const { doc, getDoc } = f.dbFns;
      const snap = await getDoc(doc(f.db, 'config', 'admins'));
      if (!snap.exists()) return { uids: [], exists: false, formatError: null };
      const uids = snap.data().uids;
      if (Array.isArray(uids)) return { uids, exists: true, formatError: null };
      return { uids: [], exists: true, formatError: 'uids フィールドが配列ではありません（Console で array 型にしてください）' };
    } catch (e) {
      return { uids: [], exists: false, formatError: e.message || String(e) };
    }
  }

  async function getAdminDiagnosticState() {
    const user = await getFirebaseUser();
    const firestore = await fetchFirestoreAdminUidsOnly();
    const fallback = Array.isArray(adminCfg().firebaseAdminUids) ? adminCfg().firebaseAdminUids : [];
    const uid = user ? user.uid : '';
    const inFirestore = !!(user && firestore.exists && isFirebaseAdminUid(uid, firestore.uids));
    const inFallback = !!(user && isFirebaseAdminUid(uid, fallback));
    return {
      user,
      firestore,
      fallback,
      inFirestore,
      inFallback,
      isAdmin: inFirestore || inFallback,
    };
  }

  function adminDiagnosticHtml(state) {
    if (!state || !state.user) return '';
    const uid = state.user.uid;
    const email = state.user.email || '（メールなし）';
    const firestoreUids = state.firestore.exists ? state.firestore.uids.join(', ') : '（ドキュメントなし）';
    const status = state.inFirestore
      ? 'Firestore config/admins に登録済み ✓'
      : state.inFallback
        ? 'js/admin-config.js の UID で一致（Firestore 未登録）'
        : 'どちらにも未登録 ✗';
    return (
      '<div class="card admin-card mt-2 admin-diagnostic">' +
      '<h3 class="admin-card__heading">管理者 UID 診断</h3>' +
      '<dl class="admin-user-meta">' +
      '<div><dt>Google ログイン</dt><dd>' + esc(email) + '</dd></div>' +
      '<div><dt>Firebase UID</dt><dd><code id="adminDiagUid">' + esc(uid) + '</code> ' +
      '<button type="button" class="btn btn-secondary btn-sm" id="adminCopyUidBtn">コピー</button></dd></div>' +
      '<div><dt>config/admins</dt><dd>' + esc(state.firestore.exists ? 'あり' : 'なし') +
      (state.firestore.formatError ? ' — ' + esc(state.firestore.formatError) : '') + '</dd></div>' +
      '<div><dt>登録 UID 一覧</dt><dd><code>' + esc(firestoreUids || '—') + '</code></dd></div>' +
      '<div><dt>判定</dt><dd><strong>' + esc(status) + '</strong></dd></div>' +
      '</dl>' +
      (!state.inFirestore
        ? '<p class="form-hint mt-2">Firestore → データ → コレクション <code>config</code> → ドキュメント <code>admins</code> → フィールド <code>uids</code>（配列）に上の UID を追加してください。</p>'
        : '') +
      '</div>'
    );
  }

  function bindAdminDiagnostic(root) {
    const btn = root.querySelector('#adminCopyUidBtn');
    const code = root.querySelector('#adminDiagUid');
    if (!btn || !code || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      const text = code.textContent || '';
      try { navigator.clipboard.writeText(text); } catch (e) { /* ignore */ }
      const label = btn.textContent;
      btn.textContent = 'コピー済';
      setTimeout(() => { btn.textContent = label; }, 1200);
    });
  }

  async function fetchFirebaseAdminUids() {
    const f = await fb();
    const fallback = Array.isArray(adminCfg().firebaseAdminUids) ? adminCfg().firebaseAdminUids : [];
    if (!f || !f.configured) return fallback;
    try {
      const { doc, getDoc } = f.dbFns;
      const snap = await getDoc(doc(f.db, 'config', 'admins'));
      if (snap.exists()) {
        const uids = snap.data().uids;
        if (Array.isArray(uids) && uids.length) return uids;
      }
    } catch (e) {
      console.warn('admin uids fetch failed', e);
    }
    return fallback;
  }

  function isFirebaseAdminUid(uid, uids) {
    return !!(uid && Array.isArray(uids) && uids.includes(uid));
  }

  async function getFirebaseUser() {
    if (typeof MiraiAuth !== 'undefined' && typeof MiraiAuth.waitForUser === 'function') {
      return MiraiAuth.waitForUser(3000);
    }
    const f = await fb();
    if (!f || !f.configured || !f.auth) return null;
    return f.auth.currentUser || null;
  }

  async function signInWithPopup() {
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase が未設定です。');
    const { signInWithPopup, GoogleAuthProvider } = f.authFns;
    return signInWithPopup(f.auth, new GoogleAuthProvider());
  }

  async function signIn(email, password) {
    const url = baseUrl() + '/auth/v1/token?grant_type=password';
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ email, password }),
      });
    } catch (e) {
      throw new Error(loginErrorMessage({}, 0));
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(loginErrorMessage(data, res.status));
    }
    setToken(data.access_token);
    return data.access_token;
  }

  async function countRows(token, filters) {
    let q = baseUrl() + '/rest/v1/analytics_events?select=id';
    if (filters.event_type) q += '&event_type=eq.' + encodeURIComponent(filters.event_type);
    if (filters.since) q += '&created_at=gte.' + encodeURIComponent(filters.since);
    const res = await fetch(q, {
      headers: {
        apikey: anonKey(),
        Authorization: 'Bearer ' + token,
        Prefer: 'count=exact',
      },
    });
    if (!res.ok) {
      const err = new Error('集計の取得に失敗しました（' + res.status + '）');
      err.status = res.status;
      throw err;
    }
    const range = res.headers.get('content-range') || '';
    const m = range.match(/\/(\d+)$/);
    return m ? parseInt(m[1], 10) : 0;
  }

  async function fetchRecent(token, sinceIso, limit) {
    let q = baseUrl() + '/rest/v1/analytics_events?select=event_type,path,tool,visitor_id,created_at';
    q += '&created_at=gte.' + encodeURIComponent(sinceIso);
    q += '&order=created_at.desc&limit=' + (limit || 8000);
    const res = await fetch(q, {
      headers: {
        apikey: anonKey(),
        Authorization: 'Bearer ' + token,
      },
    });
    if (!res.ok) {
      const err = new Error('データの取得に失敗しました（' + res.status + '）');
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  function aggregateBreakdown(rows, days) {
    const since = new Date(daysAgoIso(days)).getTime();
    const pageCounts = {};
    const toolCounts = {};
    const visitors = new Set();

    rows.forEach((row) => {
      const t = new Date(row.created_at).getTime();
      if (t < since) return;
      if (row.visitor_id) visitors.add(row.visitor_id);
      if (row.event_type === 'page_view' && row.path) {
        pageCounts[row.path] = (pageCounts[row.path] || 0) + 1;
      }
      if (row.event_type === 'tool_use' && row.tool) {
        toolCounts[row.tool] = (toolCounts[row.tool] || 0) + 1;
      }
    });

    const sortObj = (obj) =>
      Object.entries(obj)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => ({ key: k, count: v }));

    return {
      pages: sortObj(pageCounts),
      tools: sortObj(toolCounts),
      uniqueVisitors: visitors.size,
    };
  }

  function renderTable(tbody, items, labelFn) {
    tbody.innerHTML = '';
    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="2" class="text-muted">データなし</td></tr>';
      return;
    }
    items.forEach((item) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + labelFn(item.key) + '</td><td class="admin-stat-num">' + formatNum(item.count) + '</td>';
      tbody.appendChild(tr);
    });
  }

  async function checkFirebaseAdmin() {
    const state = await getAdminDiagnosticState();
    return state.isAdmin;
  }

  function switchTab(root, tab) {
    activeTab = tab;
    root.querySelectorAll('[data-admin-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.adminTab === tab);
    });

    const analytics = root.querySelector('#adminAnalyticsPanel');
    const users = root.querySelector('#adminUsersPanel');
    const rankings = root.querySelector('#adminRankingsPanel');
    const refresh = root.querySelector('#adminRefreshBtn');

    if (analytics) analytics.hidden = tab !== 'analytics';
    if (users) users.hidden = tab !== 'users';
    if (rankings) rankings.hidden = tab !== 'rankings';
    if (refresh) refresh.disabled = tab !== 'analytics';

    if (tab === 'users' || tab === 'rankings') {
      refreshFirebaseState(root);
    }
  }

  async function updateRankingsBadge(root) {
    const badge = root.querySelector('#adminRankingsBadge');
    if (!badge || !window.MiraiRanking) return;
    try {
      const isAdmin = await checkFirebaseAdmin();
      if (!isAdmin) {
        badge.hidden = true;
        return;
      }
      const pending = await MiraiRanking.fetchPendingEntries();
      const count = pending.length;
      if (count > 0) {
        badge.textContent = String(count);
        badge.hidden = false;
      } else {
        badge.hidden = true;
      }
    } catch (e) {
      badge.hidden = true;
    }
  }

  async function refreshFirebaseState(root) {
    const gate = root.querySelector('#adminFirebaseGate');
    const rankingsList = root.querySelector('#adminRankingsList');
    const errEl = root.querySelector('#adminFirebaseLoginError');
    const diagHost = root.querySelector('#adminFirebaseDiagnostic');
    const state = await getAdminDiagnosticState();

    if (activeTab === 'rankings') {
      if (gate) {
        if (!state.user) {
          gate.hidden = false;
          if (diagHost) diagHost.innerHTML = '';
        } else if (!state.isAdmin) {
          gate.hidden = false;
          if (diagHost) {
            diagHost.innerHTML = adminDiagnosticHtml(state);
            bindAdminDiagnostic(root);
          }
          if (rankingsList) {
            rankingsList.innerHTML = '<p class="text-muted">上の UID を Firestore の config/admins に登録するか、登録済みの Google アカウントでログインし直してください。</p>';
          }
        } else {
          gate.hidden = true;
          if (diagHost) diagHost.innerHTML = '';
          const user = state.user;
          if (user) await loadRankingsQueue(root, user.uid);
        }
      }
      if (errEl && state.isAdmin) errEl.hidden = true;
    } else if (gate) {
      gate.hidden = true;
      if (diagHost) diagHost.innerHTML = '';
    }

    if (activeTab === 'users' && currentUserCtx) {
      renderUserDetail(root, currentUserCtx.hub, currentUserCtx.rewards, state.isAdmin);
    }

    updateRankingsBadge(root);
  }

  async function refreshUsersPanel(root) {
    await refreshFirebaseState(root);
  }

  async function loadRankingsQueue(root, adminUid) {
    const listEl = root.querySelector('#adminRankingsList');
    const errEl = root.querySelector('#adminRankingsError');
    if (!listEl || !window.MiraiRanking) return;
    errEl.hidden = true;
    root.querySelectorAll('#adminRankingsContent .admin-diagnostic').forEach((node) => node.remove());
    listEl.innerHTML = '<p class="text-muted">読み込み中…</p>';
    try {
      const pending = await MiraiRanking.fetchPendingEntries();
      if (!pending.length) {
        listEl.innerHTML = '<p class="text-muted">審査待ちの申請はありません。</p>';
        return;
      }
      listEl.innerHTML = pending.map((entry) => {
        const meta = MiraiRanking.typeMeta(entry.type);
        const typeLabel = meta ? meta.label : entry.type;
        const scoreLabel = meta ? meta.scoreLabel : 'スコア';
        return (
          '<article class="card admin-card admin-ranking-review">' +
          '<div class="admin-ranking-review__head">' +
          '<h3>' + esc(typeLabel) + '</h3>' +
          '<span class="admin-ranking-review__status">審査中</span></div>' +
          '<dl class="admin-user-meta">' +
          '<div><dt>名前</dt><dd>' + esc(entry.playerName || entry.authorName) + '</dd></div>' +
          '<div><dt>キャラ</dt><dd>' + esc(entry.characterName || entry.characterKey) + '</dd></div>' +
          '<div><dt>' + esc(scoreLabel) + '</dt><dd>' + esc(String(entry.score)) + '</dd></div>' +
          '<div><dt>ID</dt><dd><code>' + esc(entry.authorPublicId || '—') + '</code></dd></div>' +
          (entry.note ? '<div><dt>補足</dt><dd>' + esc(entry.note) + '</dd></div>' : '') +
          (entry.proofURL ? '<div><dt>証拠</dt><dd><a href="' + esc(entry.proofURL) + '" target="_blank" rel="noopener noreferrer">画像を確認</a></dd></div>' : '') +
          '</dl>' +
          '<div class="admin-ranking-review__actions">' +
          '<button type="button" class="btn btn-primary btn-sm" data-ranking-approve="' + esc(entry.id) + '">承認</button>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-ranking-reject="' + esc(entry.id) + '">却下</button>' +
          '</div></article>'
        );
      }).join('');

      listEl.querySelectorAll('[data-ranking-approve]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('この申請を承認してランキングに掲載しますか？')) return;
          btn.disabled = true;
          try {
            await MiraiRanking.moderateEntry(btn.dataset.rankingApprove, 'approve', adminUid);
            await loadRankingsQueue(root, adminUid);
            updateRankingsBadge(root);
          } catch (e) {
            errEl.textContent = e.message || String(e);
            errEl.hidden = false;
          }
        });
      });

      listEl.querySelectorAll('[data-ranking-reject]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const reason = prompt('却下理由（ユーザーに表示されます）', '証拠画像を確認できませんでした');
          if (reason === null) return;
          btn.disabled = true;
          try {
            await MiraiRanking.moderateEntry(btn.dataset.rankingReject, 'reject', adminUid, reason);
            await loadRankingsQueue(root, adminUid);
            updateRankingsBadge(root);
          } catch (e) {
            errEl.textContent = e.message || String(e);
            errEl.hidden = false;
          }
        });
      });
    } catch (e) {
      listEl.innerHTML = '';
      errEl.textContent = e.message || String(e);
      errEl.hidden = false;
      const state = await getAdminDiagnosticState();
      if (state.user) {
        errEl.insertAdjacentHTML('afterend', adminDiagnosticHtml(state));
        bindAdminDiagnostic(root);
      }
    }
  }

  function themeCheckboxGroups(rewards) {
    const mp = window.MiraiMyPage;
    if (!mp) return '<p class="text-muted">MiraiMyPage が読み込まれていません。</p>';

    const themes = mp.getSpecialCardThemes();
    const keys = Object.keys(themes);
    if (!keys.length) {
      return '<p class="form-hint">特殊カラーはまだ登録されていません（準備中）。キャラクターカラーは全ユーザーが標準で利用できます。</p>';
    }

    const groups = mp.getSpecialCardThemeGroups();
    const granted = new Set(mp.resolveUnlockedSpecialThemeKeys(rewards || null));

    return groups.map((g) => {
      const groupKeys = keys.filter((k) => themes[k].group === g.id);
      if (!groupKeys.length) return '';
      const items = groupKeys.map((k) => {
        const t = themes[k];
        const checked = granted.has(k) ? ' checked' : '';
        return (
          '<label class="admin-theme-check">' +
          '<input type="checkbox" name="adminTheme" value="' + esc(k) + '"' + checked + '>' +
          '<span class="admin-theme-check__swatch" style="--swatch-bg:' + esc(t.bg) + ';--swatch-accent:' + esc(t.accent) + '"></span>' +
          '<span>' + esc(t.name) + '</span>' +
          '</label>'
        );
      }).join('');
      return '<div class="admin-theme-group"><p class="admin-theme-group__label">' + esc(g.label) + '</p><div class="admin-theme-grid">' + items + '</div></div>';
    }).join('');
  }

  function renderUserDetail(root, hub, rewards, isAdmin) {
    const detail = root.querySelector('#adminUserDetail');
    if (!detail) return;

    const mp = window.MiraiMyPage;
    const themes = mp ? mp.getAllCardThemes() : {};
    const cardThemeKey = mp ? mp.resolveEffectiveProfileCardThemeKey(hub, rewards) : 'kaito';
    const cardThemeName = themes[cardThemeKey] ? themes[cardThemeKey].name : cardThemeKey;
    const grantedTitles = mp ? mp.resolveGrantedTitles(rewards) : [];
    const displayTitles = mp ? mp.resolveProfileCardDisplayTitles(hub, rewards) : [];

    const rewardsBlock = isAdmin
      ? '<form id="adminRewardsForm" class="card admin-card mt-3">' +
        '<h2 class="admin-card__heading">特典を配布</h2>' +
        '<p class="form-hint">キャラクターカラーは全員が標準で利用できます。特殊カラーのみ個別に付与できます。</p>' +
        '<div class="admin-theme-groups mt-2">' + themeCheckboxGroups(rewards) + '</div>' +
        '<div class="mt-3">' +
        '<label class="form-label" for="adminGrantedTitles">称号（1行に1つ）</label>' +
        '<textarea id="adminGrantedTitles" class="form-input" rows="4" placeholder="例: 未来喫茶常連&#10;イベラン王者">' + esc(grantedTitles.join('\n')) + '</textarea>' +
        '<p class="form-hint mt-1">ユーザーは付与された称号の中からカードに表示するものを選べます。</p>' +
        '</div>' +
        '<div class="mt-3">' +
        '<label class="form-label" for="adminNote">管理者メモ（ユーザーには見えません）</label>' +
        '<textarea id="adminNote" class="form-input" rows="2" placeholder="配布理由・イベント名など">' + esc((rewards && rewards.adminNote) || '') + '</textarea>' +
        '</div>' +
        '<p id="adminRewardsError" class="form-error mt-2" hidden></p>' +
        '<p id="adminRewardsSaved" class="community-saved mt-2" hidden>保存しました ✓</p>' +
        '<button type="submit" class="btn btn-primary mt-3">特典を保存</button>' +
        '</form>'
      : '<div class="card admin-card mt-3 admin-rewards-gate">' +
        '<h2 class="admin-card__heading">特典を配布</h2>' +
        '<p class="form-hint">カードデザインや称号を保存するには、Firebase 管理者として Google ログインしてください。</p>' +
        '<button type="button" class="btn btn-primary mt-3 js-admin-firebase-login">Google でログイン</button>' +
        '</div>';

    detail.innerHTML =
      '<section class="card admin-card admin-user-detail">' +
      '<div class="admin-user-detail__head">' +
      (hub.avatarURL
        ? '<img src="' + esc(hub.avatarURL) + '" alt="" class="admin-user-detail__avatar" decoding="async">'
        : '<div class="admin-user-detail__avatar admin-user-detail__avatar--placeholder">' + esc((hub.displayName || '?').slice(0, 1)) + '</div>') +
      '<div><h2 class="admin-user-detail__name">' + esc(hub.displayName || '未設定') + '</h2>' +
      '<p class="form-hint">未来喫茶ID: <code>' + esc(hub.publicId) + '</code></p>' +
      '<p class="form-hint">UID: <code>' + esc(hub.uid) + '</code></p>' +
      '<p class="form-hint mt-1"><a href="#/p/' + esc(hub.publicId) + '" data-link>セカイノートを開く</a></p></div></div>' +
      '<dl class="admin-user-meta">' +
      '<div><dt>表示名</dt><dd>' + esc(hub.displayName || '—') + '</dd></div>' +
      '<div><dt>見出し</dt><dd>' + esc(hub.headline || '—') + '</dd></div>' +
      '<div><dt>自己紹介</dt><dd>' + esc(hub.bio || '—') + '</dd></div>' +
      '<div><dt>リンク数</dt><dd>' + formatNum((hub.links || []).length) + '</dd></div>' +
      '<div><dt>ノート数</dt><dd>' + formatNum((hub.notes || []).length) + '</dd></div>' +
      '<div><dt>現在のカードカラー</dt><dd>' + esc(cardThemeName) + '</dd></div>' +
      '<div><dt>表示中の称号</dt><dd>' + esc(displayTitles.length ? displayTitles.join(' / ') : 'なし（MEMBERS CARD のみ）') + '</dd></div>' +
      '</dl></section>' +
      rewardsBlock;

    detail.hidden = false;
    currentUserCtx = { hub, rewards: rewards || {} };

    const loginBtn = detail.querySelector('.js-admin-firebase-login');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => doFirebaseAdminLogin(root));
    }

    const form = detail.querySelector('#adminRewardsForm');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = detail.querySelector('#adminRewardsError');
      const savedEl = detail.querySelector('#adminRewardsSaved');
      errEl.hidden = true;
      savedEl.hidden = true;

      try {
        const adminUser = await getFirebaseUser();
        const adminUids = await fetchFirebaseAdminUids();
        if (!adminUser || !isFirebaseAdminUid(adminUser.uid, adminUids)) {
          throw new Error('管理者としてログインし直してください。');
        }
        if (!mp || typeof mp.saveUserRewards !== 'function') {
          throw new Error('保存機能が利用できません。');
        }

        const specialThemes = mp.getSpecialCardThemes();
        const checked = [...form.querySelectorAll('input[name="adminTheme"]:checked')].map((el) => el.value);
        const unlockedCardThemes = checked.filter((k) => specialThemes[k]);
        const grantedTitles = String(form.querySelector('#adminGrantedTitles').value || '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);
        const adminNote = String(form.querySelector('#adminNote').value || '').trim();

        await mp.saveUserRewards(hub.uid, { unlockedCardThemes, grantedTitles, adminNote }, adminUser.uid);
        const freshRewards = await mp.loadUserRewards(hub.uid);
        currentUserCtx.rewards = freshRewards || {};
        renderUserDetail(root, hub, freshRewards, await checkFirebaseAdmin());
        const savedElFresh = root.querySelector('#adminRewardsSaved');
        if (savedElFresh) {
          savedElFresh.hidden = false;
          setTimeout(() => { savedElFresh.hidden = true; }, 2400);
        }
      } catch (err) {
        errEl.textContent = err.message || String(err);
        errEl.hidden = false;
      }
    });
  }

  async function searchUserById(root, publicId) {
    const errEl = root.querySelector('#adminUserSearchError');
    const detail = root.querySelector('#adminUserDetail');
    errEl.hidden = true;
    if (detail) detail.hidden = true;
    currentUserCtx = null;

    const id = normalizePublicId(publicId);
    if (!id || id.length !== 8) {
      errEl.textContent = 'IDは半角英数字8文字で入力してください。';
      errEl.hidden = false;
      return;
    }

    const mp = window.MiraiMyPage;
    if (!mp || typeof mp.loadHub !== 'function') {
      errEl.textContent = 'ユーザー検索機能が読み込まれていません。';
      errEl.hidden = false;
      return;
    }

    try {
      const hub = await mp.loadHub(id);
      if (!hub || !hub.uid) {
        errEl.textContent = '該当するユーザーが見つかりませんでした。マイページでプロフィールを保存済みか確認してください。';
        errEl.hidden = false;
        return;
      }

      let rewards = null;
      try {
        rewards = await mp.loadUserRewards(hub.uid);
      } catch (e) {
        console.warn('userRewards load failed', e);
        errEl.textContent = 'プロフィールは表示できますが、特典情報の取得に失敗しました。Firestore の config/admins に管理者 UID が登録されているか確認してください。';
        errEl.hidden = false;
      }
      renderUserDetail(root, hub, rewards, await checkFirebaseAdmin());
    } catch (err) {
      errEl.textContent = err.message || 'ユーザー情報の取得に失敗しました。';
      errEl.hidden = false;
    }
  }

  async function loadDashboard(root) {
    const token = getToken();
    const errEl = root.querySelector('#adminError');
    const bodyEl = root.querySelector('#adminDashboard');
    errEl.hidden = true;
    bodyEl.hidden = true;

    const today = startOfTodayIso();
    const d7 = daysAgoIso(7);
    const d30 = daysAgoIso(30);

    try {
      const [pvToday, pv7, pv30, pvAll, toolToday, tool7, toolAll] = await Promise.all([
        countRows(token, { event_type: 'page_view', since: today }),
        countRows(token, { event_type: 'page_view', since: d7 }),
        countRows(token, { event_type: 'page_view', since: d30 }),
        countRows(token, { event_type: 'page_view' }),
        countRows(token, { event_type: 'tool_use', since: today }),
        countRows(token, { event_type: 'tool_use', since: d7 }),
        countRows(token, { event_type: 'tool_use' }),
      ]);

      const rows = await fetchRecent(token, d30, 8000);
      const breakdown = aggregateBreakdown(rows, 7);

      root.querySelector('#statPvToday').textContent = formatNum(pvToday);
      root.querySelector('#statPv7').textContent = formatNum(pv7);
      root.querySelector('#statPv30').textContent = formatNum(pv30);
      root.querySelector('#statPvAll').textContent = formatNum(pvAll);
      root.querySelector('#statToolToday').textContent = formatNum(toolToday);
      root.querySelector('#statTool7').textContent = formatNum(tool7);
      root.querySelector('#statToolAll').textContent = formatNum(toolAll);
      root.querySelector('#statUv7').textContent = formatNum(breakdown.uniqueVisitors);

      renderTable(root.querySelector('#adminPagesBody'), breakdown.pages, (path) => {
        return PATH_LABELS[path] || path;
      });
      renderTable(root.querySelector('#adminToolsBody'), breakdown.tools, (tool) => {
        return (MiraiAnalytics && MiraiAnalytics.toolLabel(tool)) || tool;
      });

      bodyEl.hidden = false;
      switchTab(root, activeTab);
      updateRankingsBadge(root);
    } catch (err) {
      errEl.textContent = err.message || String(err);
      errEl.hidden = false;
      if (err.status === 401 || err.status === 403) {
        setToken(null);
        showLogin(root);
      }
    }
  }

  function setDashboardLayout(root, visible) {
    const pageTitle = root.querySelector('.admin-page__title');
    const pageLead = root.querySelector('.admin-page__lead');
    const homeLink = root.querySelector('.admin-page__home-link');
    if (pageTitle) pageTitle.hidden = visible;
    if (pageLead) pageLead.hidden = visible;
    if (homeLink) homeLink.hidden = visible;
    root.querySelector('.admin-page__inner')?.classList.toggle('admin-page__inner--dashboard', visible);
  }

  function showLogin(root) {
    setDashboardLayout(root, false);
    root.querySelector('#adminLogin').hidden = false;
    root.querySelector('#adminDashboard').hidden = true;
    root.querySelector('#adminSetup').hidden = true;
  }

  function showSetup(root) {
    setDashboardLayout(root, false);
    root.querySelector('#adminSetup').hidden = false;
    root.querySelector('#adminLogin').hidden = true;
    root.querySelector('#adminDashboard').hidden = true;
  }

  function showDashboard(root) {
    setDashboardLayout(root, true);
    root.querySelector('#adminLogin').hidden = true;
    root.querySelector('#adminSetup').hidden = true;
    loadDashboard(root);
  }

  async function doFirebaseAdminLogin(root) {
    const errEl = root.querySelector('#adminFirebaseLoginError');
    const userErr = root.querySelector('#adminUserSearchError');
    if (errEl) errEl.hidden = true;
    try {
      if (typeof MiraiAuth !== 'undefined' && typeof MiraiAuth.signInWithGoogle === 'function') {
        await MiraiAuth.signInWithGoogle();
      } else {
        await signInWithPopup();
      }
      await refreshFirebaseState(root);
    } catch (err) {
      const msg = err.message || String(err);
      if (errEl) {
        errEl.textContent = msg;
        errEl.hidden = false;
      }
      if (activeTab === 'users' && userErr) {
        userErr.textContent = msg;
        userErr.hidden = false;
      }
    }
  }

  function bindEvents(root) {
    const form = root.querySelector('#adminLoginForm');
    if (form && form.dataset.bound !== '1') {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = root.querySelector('#adminLoginError');
        errEl.hidden = true;
        const password = root.querySelector('#adminPassword').value;
        try {
          await signIn(ADMIN_EMAIL, password);
          showDashboard(root);
        } catch (err) {
          errEl.textContent = err.message;
          errEl.hidden = false;
        }
      });
    }

    const logout = root.querySelector('#adminLogoutBtn');
    if (logout && logout.dataset.bound !== '1') {
      logout.dataset.bound = '1';
      logout.addEventListener('click', () => {
        setToken(null);
        showLogin(root);
      });
    }

    const refresh = root.querySelector('#adminRefreshBtn');
    if (refresh && refresh.dataset.bound !== '1') {
      refresh.dataset.bound = '1';
      refresh.addEventListener('click', () => loadDashboard(root));
    }

    root.querySelectorAll('[data-admin-tab]').forEach((btn) => {
      if (btn.dataset.bound === '1') return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => switchTab(root, btn.dataset.adminTab));
    });

    const firebaseLogin = root.querySelector('#adminFirebaseLoginBtn');
    if (firebaseLogin && firebaseLogin.dataset.bound !== '1') {
      firebaseLogin.dataset.bound = '1';
      firebaseLogin.addEventListener('click', () => doFirebaseAdminLogin(root));
    }

    const searchForm = root.querySelector('#adminUserSearchForm');
    if (searchForm && searchForm.dataset.bound !== '1') {
      searchForm.dataset.bound = '1';
      searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = root.querySelector('#adminUserSearchId');
        await searchUserById(root, input ? input.value : '');
      });
    }
  }

  function init() {
    const root = document.getElementById('app');
    if (!root) return;

    bindEvents(root);

    if (typeof MiraiAuth !== 'undefined' && typeof MiraiAuth.onChange === 'function') {
      MiraiAuth.onChange(() => {
        const root = document.getElementById('app');
        if (!root) return;
        if (activeTab === 'users' || activeTab === 'rankings') {
          refreshFirebaseState(root);
        } else {
          updateRankingsBadge(root);
        }
      });
    }

    if (!MiraiAnalytics.isEnabled()) {
      showSetup(root);
      return;
    }

    if (getToken()) showDashboard(root);
    else showLogin(root);
  }

  return { init };
})();
