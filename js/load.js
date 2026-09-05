/**
 * 未来喫茶 — 必要なスクリプトだけ後から読む
 */
const MiraiLoad = (function () {
  'use strict';

  const pending = {};

  const BUNDLES = {
    engine: ['js/pjsk-engine.js'],
    calc: [
      'js/pjsk-engine.js',
      'js/song-kiso-data.js',
      'js/song-kiso.js',
      'js/calculators.js',
    ],
    diagnosis: [
      'js/pjsk-engine.js',
      'js/song-kiso-data.js',
      'js/song-kiso.js',
      'js/border-rankings-data.js',
      'js/calculators.js',
    ],
    eventSupportLite: [
      'js/event-support.js',
    ],
    eventSupport: [
      'js/pjsk-engine.js',
      'js/border-rankings-data.js',
      'js/event-support.js',
    ],
    guides: [
      'js/guide-articles.js',
      'js/guides.js',
    ],
    mypage: [
      'js/qr-utils.js',
      'js/friends.js',
      'js/mypage.js',
    ],
    board: [
      'js/friends.js',
      'js/board.js',
    ],
    ranking: [
      'js/ranking.js',
    ],
    admin: [
      'js/qr-utils.js',
      'js/friends.js',
      'js/mypage.js',
      'js/ranking.js',
      'js/admin-config.js',
      'js/admin.js',
    ],
  };

  function assetVer() {
    const meta = document.querySelector('meta[name="mirai-kissa-build"]');
    const v = meta && meta.getAttribute('content');
    return v || '1';
  }

  function withVer(path) {
    const clean = String(path || '').replace(/\?v=[^&]*/g, '').replace(/\?&/, '?').replace(/\?$/, '');
    return clean + (clean.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(assetVer());
  }

  function loadScript(path) {
    const key = String(path || '').replace(/\?v=[^&]*/g, '');
    if (!key) return Promise.resolve();
    if (document.querySelector('script[data-mirai-src="' + key + '"][data-loaded="1"]')) {
      return Promise.resolve();
    }
    if (pending[key]) return pending[key];

    pending[key] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = withVer(key);
      s.async = false;
      s.setAttribute('data-mirai-src', key);
      s.onload = function () {
        s.setAttribute('data-loaded', '1');
        if (key.indexOf('pjsk-engine.js') >= 0 && window.PjskEngine) {
          if (typeof PjskEngine.loadMultiplierData === 'function') {
            PjskEngine.loadMultiplierData().catch(function () {});
          }
        }
        if (key.indexOf('border-rankings-data.js') >= 0 && window.PjskEngine && typeof PjskEngine.initBorderData === 'function') {
          PjskEngine.initBorderData();
        }
        resolve();
      };
      s.onerror = function () {
        delete pending[key];
        reject(new Error('スクリプトを読み込めませんでした: ' + key));
      };
      document.head.appendChild(s);
    });
    return pending[key];
  }

  async function ensure(name) {
    const list = BUNDLES[name];
    if (!list) throw new Error('不明なバンドル: ' + name);
    for (let i = 0; i < list.length; i++) {
      await loadScript(list[i]);
    }
  }

  return { ensure, loadScript, withVer };
})();

window.MiraiLoad = MiraiLoad;
