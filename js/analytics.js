/**
 * 未来喫茶 — アクセス・利用回数の送信（Supabase REST）
 */
const MiraiAnalytics = (function () {
  'use strict';

  const VISITOR_KEY = 'miraiKissaVisitorId';

  const TOOL_LABELS = {
    amatsuyu: 'あまつゆ',
    event: 'イベントPt',
    exec: '実効値',
    adjust: 'ポイント調整',
    'adjust-next': 'ポイント調整NEXT',
    kizuna: 'キズナ',
    diagnosis: 'イベラン診断',
  };

  function config() {
    return window.MIRAI_ANALYTICS_CONFIG || {};
  }

  function isEnabled() {
    const c = config();
    return !!(c.enabled && c.supabaseUrl && c.supabaseAnonKey);
  }

  function visitorId() {
    try {
      let id = localStorage.getItem(VISITOR_KEY);
      if (!id) {
        id = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(VISITOR_KEY, id);
      }
      return id;
    } catch (e) {
      return 'v_anon';
    }
  }

  function insert(row) {
    if (!isEnabled()) return Promise.resolve();
    const c = config();
    const url = c.supabaseUrl.replace(/\/$/, '') + '/rest/v1/analytics_events';
    return fetch(url, {
      method: 'POST',
      headers: {
        apikey: c.supabaseAnonKey,
        Authorization: 'Bearer ' + c.supabaseAnonKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        event_type: row.event_type,
        path: row.path || null,
        tool: row.tool || null,
        visitor_id: visitorId(),
      }),
    }).catch((err) => {
      console.warn('[未来喫茶] analytics:', err);
    });
  }

  function trackPageView(path) {
    if (!path || path === '/admin') return;
    insert({ event_type: 'page_view', path: path });
  }

  function trackToolUse(toolId) {
    if (!toolId) return;
    insert({ event_type: 'tool_use', tool: toolId, path: location.hash.slice(1) || '/' });
  }

  function toolLabel(toolId) {
    return TOOL_LABELS[toolId] || toolId;
  }

  return {
    isEnabled,
    config,
    trackPageView,
    trackToolUse,
    toolLabel,
    TOOL_LABELS,
  };
})();
