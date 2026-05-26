/**
 * 未来喫茶 — 管理者ページ（Supabase 認証 + 集計表示）
 */
const AdminPage = (function () {
  'use strict';

  const TOKEN_KEY = 'miraiKissaAdminToken';

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

  function cfg() {
    return window.MIRAI_ANALYTICS_CONFIG || {};
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
      return 'メールまたはパスワードが違います。Supabase の Users にユーザーがあるか確認してください。';
    }
    if (status === 0 || /failed to fetch|network/i.test(String(msg))) {
      return '通信できません。公開サイト（https://alice0239.github.io/mirai-kissa/#/admin）から開いてください。ローカルファイル（file://）ではログインできません。';
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
    } catch (err) {
      errEl.textContent = err.message || String(err);
      errEl.hidden = false;
      if (err.status === 401 || err.status === 403) {
        setToken(null);
        showLogin(root);
      }
    }
  }

  function showLogin(root) {
    root.querySelector('#adminLogin').hidden = false;
    root.querySelector('#adminDashboard').hidden = true;
    root.querySelector('#adminSetup').hidden = true;
  }

  function showSetup(root) {
    root.querySelector('#adminSetup').hidden = false;
    root.querySelector('#adminLogin').hidden = true;
    root.querySelector('#adminDashboard').hidden = true;
  }

  function showDashboard(root) {
    root.querySelector('#adminLogin').hidden = true;
    root.querySelector('#adminSetup').hidden = true;
    loadDashboard(root);
  }

  function bindEvents(root) {
    const form = root.querySelector('#adminLoginForm');
    if (form && form.dataset.bound !== '1') {
      form.dataset.bound = '1';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errEl = root.querySelector('#adminLoginError');
        errEl.hidden = true;
        const email = root.querySelector('#adminEmail').value.trim();
        const password = root.querySelector('#adminPassword').value;
        try {
          await signIn(email, password);
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
  }

  function init() {
    const root = document.getElementById('app');
    if (!root) return;

    bindEvents(root);

    if (!MiraiAnalytics.isEnabled()) {
      showSetup(root);
      return;
    }

    if (getToken()) showDashboard(root);
    else showLogin(root);
  }

  return { init };
})();
