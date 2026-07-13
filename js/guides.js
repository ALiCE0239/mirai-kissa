/**
 * 未来喫茶 — 攻略図書館
 *
 * プロセカの攻略記事をここに追加していく。
 * 記事データは data/guides/ または guides 配列に追記。
 */
const GuidesPage = (function () {
  'use strict';

  /** @type {{ id: string, title: string, emoji: string, summary: string, category: string }[]} */
  const ARTICLES = [];

  const CATEGORIES = [
    { id: 'event', name: 'イベント・イベラン', emoji: '🏆' },
    { id: 'mysekai', name: 'マイセカイ', emoji: '🌿' },
    { id: 'team', name: '編成・育成', emoji: '📐' },
    { id: 'other', name: 'その他', emoji: '📖' },
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function init() {
    const root = document.getElementById('guidesRoot');
    if (!root) return;

    if (!ARTICLES.length) {
      root.innerHTML =
        '<div class="guides-empty">' +
        '<div class="info-box">' +
        '<p><strong>準備中です</strong></p>' +
        '<p class="mt-1">イベント周回・編成・マイセカイなど、プロセカの攻略記事を順次追加していきます。</p>' +
        '</div>' +
        '<div class="guides-categories">' +
        CATEGORIES.map((c) =>
          `<div class="guides-category-card card"><span class="guides-category-card__emoji">${c.emoji}</span><h3>${esc(c.name)}</h3><p class="text-muted">記事を追加予定</p></div>`
        ).join('') +
        '</div></div>';
      return;
    }

    root.innerHTML =
      '<div class="guides-list">' +
      ARTICLES.map((a) =>
        `<article class="card guides-article-card">` +
        `<span class="guides-article-card__emoji">${esc(a.emoji || '📄')}</span>` +
        `<h3>${esc(a.title)}</h3>` +
        `<p class="text-muted">${esc(a.summary)}</p>` +
        `</article>`
      ).join('') +
      '</div>';
  }

  return { init };
})();

window.GuidesPage = GuidesPage;
