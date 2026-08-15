/**
 * 未来喫茶 — Google AdSense
 *
 * ページを絞って広告を配置する:
 *   - ホーム(#/)         … hero 直後に placements.home
 *   - bigPages の各ページ … 見出し(.calc-header)直後に placements.big（大きな広告）
 *   - 管理者(/admin)      … 広告なし
 * 設定は js/ads-config.js（window.MIRAI_ADS_CONFIG）。
 */
const MiraiAds = (function () {
  'use strict';

  function cfg() {
    return window.MIRAI_ADS_CONFIG || {};
  }

  function isEnabled() {
    const c = cfg();
    return !!(c.enabled && c.client);
  }

  function pushAd() {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('[未来喫茶] AdSense:', e);
    }
  }

  /** 文字列/オブジェクトどちらの指定も共通の形へ */
  function normalizeSlot(spec) {
    if (!spec) return null;
    if (typeof spec === 'string') {
      return { slot: spec, format: 'auto', fullWidthResponsive: true };
    }
    if (!spec.slot) return null;
    return spec;
  }

  function createIns(spec) {
    const s = normalizeSlot(spec);
    if (!s) return null;
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', cfg().client);
    ins.setAttribute('data-ad-slot', s.slot);
    ins.setAttribute('data-ad-format', s.format || 'auto');
    if (s.layout) ins.setAttribute('data-ad-layout', s.layout);
    if (s.layoutKey) ins.setAttribute('data-ad-layout-key', s.layoutKey);
    // fluid / autorelaxed 以外はレスポンシブ幅指定を付与
    if (s.format !== 'fluid' && s.format !== 'autorelaxed' && s.fullWidthResponsive !== false) {
      ins.setAttribute('data-full-width-responsive', 'true');
    }
    return ins;
  }

  /** URL に adsdebug を含むときだけ広告枠を可視化（診断用） */
  function isDebug() {
    try {
      return /adsdebug/.test(location.href) || localStorage.getItem('mirai_ads_debug') === '1';
    } catch (e) {
      return /adsdebug/.test(location.href);
    }
  }

  function wrapAd(ins, big) {
    const wrap = document.createElement('div');
    wrap.className = 'ad-unit ad-unit--injected' + (big ? ' ad-unit--big' : '');
    const label = document.createElement('p');
    label.className = 'ad-unit__label';
    label.textContent = '広告';
    wrap.appendChild(label);
    wrap.appendChild(ins);
    if (isDebug()) {
      wrap.classList.add('ad-unit--debug');
      const slot = ins.getAttribute('data-ad-slot');
      label.textContent = '広告[debug] slot=' + slot + ' status=…';
      // 配信結果(filled/unfilled)を枠に表示
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        const st = ins.getAttribute('data-ad-status');
        if (st || tries > 20) {
          label.textContent = '広告[debug] slot=' + slot + ' status=' + (st || '(応答なし)');
          console.log('[未来喫茶] AdSense debug', { slot: slot, status: st, tries: tries });
          clearInterval(timer);
        }
      }, 500);
    }
    return wrap;
  }

  function clearInjected() {
    document.querySelectorAll('.ad-unit--injected').forEach((el) => el.remove());
  }

  function inject(anchor, spec, big) {
    const ins = createIns(spec);
    if (!anchor || !ins) return;
    anchor.insertAdjacentElement('afterend', wrapAd(ins, big));
    pushAd();
  }

  function normHash(hash) {
    const h = (hash || '/').split('?')[0];
    return h || '/';
  }

  function isAdmin(hash) {
    return hash === '/admin' || hash.indexOf('/admin/') === 0;
  }

  function onRouteChange(hash) {
    if (!isEnabled()) return;
    hash = normHash(hash);
    clearInjected();
    if (isAdmin(hash)) return;

    const app = document.getElementById('app');
    if (!app) return;

    const c = cfg();
    const placements = c.placements || {};
    const bigPages = c.bigPages || [];

    // 大きな広告（見出し直後）
    if (bigPages.indexOf(hash) !== -1 && placements.big) {
      const anchor = app.querySelector('.calc-header');
      if (anchor) inject(anchor, placements.big, true);
      return;
    }

    // ホームの開いたところ（hero 直後）
    if (hash === '/' && placements.home) {
      const anchor = app.querySelector('.hero');
      if (anchor) inject(anchor, placements.home, false);
    }
  }

  function init() {
    if (!isEnabled()) return;
    // 旧フッター広告枠は使用しない
    const mount = document.getElementById('adFooterMount');
    if (mount) {
      mount.hidden = true;
      mount.innerHTML = '';
    }
    onRouteChange(location.hash.slice(1) || '/');
  }

  return { init, onRouteChange, isEnabled };
})();

window.MiraiAds = MiraiAds;
