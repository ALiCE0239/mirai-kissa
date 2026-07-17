/**
 * 未来喫茶 — サイト支援（外部募金サービスへのリンク）
 */
const MiraiSupport = (function () {
  'use strict';

  const PROVIDER_LABELS = {
    ofuse: 'OFUSE',
    kofi: 'Ko-fi',
    stripe: 'Stripe',
    custom: '外部ページ',
  };

  function cfg() {
    return window.MIRAI_SUPPORT_CONFIG || {};
  }

  function isActive() {
    const c = cfg();
    return !!(c.enabled && c.url && String(c.url).trim());
  }

  function providerLabel() {
    const c = cfg();
    return PROVIDER_LABELS[c.provider] || PROVIDER_LABELS.custom;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function externalLinkHtml(url, label, className) {
    const cls = className ? ' ' + className : '';
    return (
      '<a href="' + esc(url) + '" class="btn btn-primary support-cta' + cls + '" ' +
      'target="_blank" rel="noopener noreferrer">' +
      esc(label) +
      '<svg class="support-cta__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>' +
      '<polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>' +
      '</svg></a>'
    );
  }

  function disclaimerHtml() {
    const c = cfg();
    const note = c.note || '支援は任意です。有償コンテンツの販売ではありません。';
    return (
      '<div class="info-box support-disclaimer">' +
      '<p>' + esc(note) + '</p>' +
      '<p class="form-hint mt-1">このサイトはプロジェクトセカイ非公式のファンメイドです。SEGA・Colorful Palette とは関係ありません。</p>' +
      '</div>'
    );
  }

  function initFooter() {
    const mount = document.getElementById('footerSupportMount');
    if (!mount) return;
    if (!isActive()) {
      mount.hidden = true;
      mount.innerHTML = '';
      return;
    }
    const c = cfg();
    mount.hidden = false;
    mount.innerHTML =
      '<a href="#/support" class="footer-support__link" data-link>' +
      esc(c.footerLabel || 'サイトを支援する') +
      '</a>';
  }

  function initPage() {
    const root = document.getElementById('app').querySelector('#supportRoot');
    if (!root) return;

    if (!isActive()) {
      root.innerHTML =
        '<div class="info-box support-unavailable">' +
        '<p><strong>現在、支援の受付は準備中です。</strong></p>' +
        '<p class="form-hint mt-1">OFUSE または Ko-fi 等のアカウント作成後、' +
        '<code>js/support-config.js</code> の <code>url</code> に支援ページの URL を設定してください。</p>' +
        '</div>';
      return;
    }

    const c = cfg();
    const url = c.url.trim();
    root.innerHTML =
      '<p class="support-page__lead">' + esc(c.message || '') + '</p>' +
      '<p class="form-hint support-page__provider">決済は ' + esc(providerLabel()) + ' 上で安全に処理されます。</p>' +
      '<div class="support-page__actions">' +
      externalLinkHtml(url, c.label || '支援ページを開く') +
      '</div>' +
      disclaimerHtml();
  }

  function init() {
    initFooter();
  }

  return { init, initPage, initFooter, isActive };
})();

window.MiraiSupport = MiraiSupport;
