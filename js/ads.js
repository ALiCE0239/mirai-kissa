/**
 * 未来喫茶 — Google AdSense
 *
 * - head の adsbygoogle.js で自動広告が有効（Console 側の設定が必要）
 * - slots に ID を入れると、手動配置の広告枠も表示
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

  /** 広告を出さないページ */
  function shouldShow(hash) {
    if (!isEnabled()) return false;
    const hidden = ['/admin'];
    return !hidden.some((p) => hash === p || hash.startsWith(p + '/'));
  }

  function pushAd() {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('[未来喫茶] AdSense:', e);
    }
  }

  /** 文字列/オブジェクトどちらの slot 指定も共通の形へ */
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
    if (s.layoutKey) ins.setAttribute('data-ad-layout-key', s.layoutKey);
    // fluid（インフィード）以外はレスポンシブ幅指定を付与
    if (s.format !== 'fluid' && s.fullWidthResponsive !== false) {
      ins.setAttribute('data-full-width-responsive', 'true');
    }
    return ins;
  }

  function wrapAd(ins) {
    const wrap = document.createElement('div');
    wrap.className = 'ad-unit';
    const label = document.createElement('p');
    label.className = 'ad-unit__label';
    label.textContent = '広告';
    wrap.appendChild(label);
    wrap.appendChild(ins);
    return wrap;
  }

  function mountSlot(mountEl, slot) {
    if (!mountEl || !slot) {
      if (mountEl) mountEl.hidden = true;
      return;
    }
    mountEl.hidden = false;
    mountEl.innerHTML = '';
    const ins = createIns(slot);
    if (!ins) return;
    mountEl.appendChild(wrapAd(ins));
    pushAd();
  }

  function initFooter() {
    const mount = document.getElementById('adFooterMount');
    if (!mount) return;
    const slot = cfg().slots && cfg().slots.footer;
    if (slot) {
      mountSlot(mount, slot);
      return;
    }
    // スロット未設定時: 自動広告用（Console で自動広告を有効にしてください）
    mount.hidden = false;
    mount.innerHTML = '';
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', cfg().client);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    mount.appendChild(wrapAd(ins));
    pushAd();
  }

  function refreshInline(hash) {
    document.querySelectorAll('.ad-unit--inline').forEach((el) => el.remove());
    const slot = cfg().slots && cfg().slots.content;
    if (!shouldShow(hash) || !slot) return;

    const app = document.getElementById('app');
    if (!app) return;
    const anchor = app.querySelector('.calc-header') || app.querySelector('.hero');
    if (!anchor) return;

    const ins = createIns(slot);
    if (!ins) return;
    const wrap = wrapAd(ins);
    wrap.classList.add('ad-unit--inline');
    anchor.insertAdjacentElement('afterend', wrap);
    pushAd();
  }

  function onRouteChange(hash) {
    const mount = document.getElementById('adFooterMount');
    if (!shouldShow(hash)) {
      if (mount) mount.hidden = true;
      document.querySelectorAll('.ad-unit--inline').forEach((el) => el.remove());
      return;
    }
    if (mount) mount.hidden = false;
    refreshInline(hash);
  }

  function init() {
    if (!isEnabled()) return;
    initFooter();
    onRouteChange(location.hash.slice(1) || '/');
  }

  return { init, onRouteChange, isEnabled };
})();

window.MiraiAds = MiraiAds;
