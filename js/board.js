/**
 * 未来喫茶 — 掲示板（イベラン広告 / マイセカイ宣伝）
 *
 * - #/board/event         イベラン広告 一覧・検索（閲覧のみ）
 * - #/board/event/:uid    イベラン広告 詳細
 * - #/board/mysekai       マイセカイ宣伝 一覧・いいね（閲覧のみ）
 * - #/board/event/edit    イベラン広告 作成/編集（要ログイン・マイページから遷移）
 * - #/board/mysekai/edit  マイセカイ宣伝 作成/編集（要ログイン・マイページから遷移）
 *
 * データ構造はアプリに準拠。
 *   boardEventAds/{authorUid}                    … 1アカウント1件
 *   boardMysekai/{authorUid}                     … 1アカウント1件
 *   boardMysekai/{authorUid}/likes/{likerUid}    … いいね
 */
const MiraiBoard = (function () {
  'use strict';

  const CONDITION_TAGS = [
    'ゆるラン', 'ガチラン', 'Discord周回', '初心者歓迎', '高速周回',
    'シフト制', 'リアクション制', '内部値重視', '速度重視', 'オープンチャット周回',
  ];
  const EVENT_FORMAT_TAGS = [
    'ワールドリンク総合',
    'Leo/need箱',
    'MORE MORE JUMP!箱',
    'VIRTUAL SINGER箱',
    'ワンダーランズ×ショウタイム箱',
    '25時、ナイトコードで。箱',
    '混合イベント',
    'チアフルイベント',
  ];
  const EVENT_VOCALOID_BANNER_TAGS = [
    '初音ミク', '鏡音リン', '鏡音レン', '巡音ルカ', 'MEIKO', 'KAITO',
  ];
  const FALLBACK_EVENT_BANNER_TAGS = [
    '一歌', '咲希', '穂波', '志歩', 'みのり', '遥', '愛莉', '雫', 'こはね', '杏',
    '彰人', '冬弥', '司', 'えむ', '寧々', '類', '奏', 'まふゆ', '絵名', '瑞希',
  ].concat(EVENT_VOCALOID_BANNER_TAGS);
  const BOOKMARK_TAG = '__bookmark__';
  const TARGET_RANKS = [10, 50, 100, 500, 1000, 2000, 3000, 4000, 5000, 10000];
  const PAGE_SIZE = 30;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function normalizeUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    return /^https?:\/\//i.test(u) ? u : 'https://' + u;
  }

  function getEventBannerTags() {
    const engine = window.PjskEngine;
    if (engine && Array.isArray(engine.BANNER_DISPLAY_ORDER)) {
      return engine.BANNER_DISPLAY_ORDER.concat(EVENT_VOCALOID_BANNER_TAGS);
    }
    return FALLBACK_EVENT_BANNER_TAGS.slice();
  }

  function getAllEventTags() {
    return EVENT_FORMAT_TAGS.concat(getEventBannerTags());
  }

  function getAllFilterTags() {
    return CONDITION_TAGS.concat(getAllEventTags());
  }

  function isConditionTag(tag) {
    return CONDITION_TAGS.includes(tag);
  }

  function isEventTag(tag) {
    return getAllEventTags().includes(tag);
  }

  function isEventFormatTag(tag) {
    return EVENT_FORMAT_TAGS.includes(tag);
  }

  function isEventBannerTag(tag) {
    return getEventBannerTags().includes(tag);
  }

  function splitEventTags(tags) {
    const list = (Array.isArray(tags) ? tags : []).map((t) => String(t || '').trim()).filter(Boolean);
    const formats = list.filter((t) => isEventFormatTag(t));
    const banners = list.filter((t) => isEventBannerTag(t));
    return {
      eventFormat: formats[0] || '',
      eventBanner: banners[0] || '',
      eventTags: [formats[0], banners[0]].filter(Boolean),
    };
  }

  function normalizeSavedEventTags(selected) {
    return splitEventTags(selected).eventTags;
  }

  function getPostEventTags(p) {
    const tags = Array.isArray(p && p.eventTags)
      ? p.eventTags.map((t) => String(t || '').trim()).filter(Boolean)
      : [];
    const banner = String((p && p.eventBanner) || '').trim();
    if (banner && !tags.includes(banner)) tags.push(banner);
    return [...new Set(tags)];
  }

  function postHasActiveTag(p, tag) {
    if (!tag) return true;
    if (isConditionTag(tag)) return (p.conditionTags || []).includes(tag);
    if (isEventTag(tag)) return getPostEventTags(p).includes(tag);
    return false;
  }

  function postSearchHaystack(p) {
    return [
      p.eventName || '',
      p.body || '',
      p.authorName || '',
      p.eventBanner || '',
      ...(p.conditionTags || []),
      ...getPostEventTags(p),
    ].map((s) => String(s).toLowerCase());
  }

  function scoreTagSuggestion(tag, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return 0;
    const label = String(tag).toLowerCase();
    if (label === q) return 100;
    if (label.startsWith(q)) return 80;
    if (label.includes(q)) return 60;
    return 0;
  }

  function suggestFilterTags(query, limit) {
    const max = limit || 8;
    return getAllFilterTags()
      .map((tag) => ({ tag, score: scoreTagSuggestion(tag, query), kind: isConditionTag(tag) ? 'condition' : 'event' }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag, 'ja'))
      .slice(0, max);
  }

  function findExactFilterTag(query) {
    const q = String(query || '').trim();
    if (!q) return '';
    return getAllFilterTags().find((tag) => tag === q) || '';
  }

  function activeFilterLabel(tag) {
    if (!tag) return '';
    if (tag === BOOKMARK_TAG) return '★ ブックマーク';
    return tag;
  }

  function createEmptyEventFilters() {
    return {
      bookmarkOnly: false,
      conditionTags: [],
      eventFormat: '',
      eventBanner: '',
    };
  }

  function hasActiveEventFilters(filters) {
    return !!(filters.bookmarkOnly || filters.conditionTags.length || filters.eventFormat || filters.eventBanner);
  }

  function postMatchesEventFilters(p, filters, bookmarkUids) {
    if (filters.bookmarkOnly && !bookmarkUids.has(p.authorUid)) return false;
    if (filters.conditionTags.length &&
      !filters.conditionTags.every((t) => (p.conditionTags || []).includes(t))) return false;
    const eventTags = getPostEventTags(p);
    if (filters.eventFormat && !eventTags.includes(filters.eventFormat)) return false;
    if (filters.eventBanner && !eventTags.includes(filters.eventBanner)) return false;
    return true;
  }

  function toggleEventFilter(filters, tag) {
    if (tag === '') {
      return createEmptyEventFilters();
    }
    if (tag === BOOKMARK_TAG) {
      const next = createEmptyEventFilters();
      next.bookmarkOnly = !filters.bookmarkOnly;
      return next;
    }
    const next = Object.assign(createEmptyEventFilters(), {
      bookmarkOnly: false,
      conditionTags: filters.conditionTags.slice(),
      eventFormat: filters.eventFormat,
      eventBanner: filters.eventBanner,
    });
    if (isConditionTag(tag)) {
      const idx = next.conditionTags.indexOf(tag);
      if (idx >= 0) next.conditionTags.splice(idx, 1);
      else next.conditionTags.push(tag);
      return next;
    }
    if (isEventFormatTag(tag)) {
      next.eventFormat = next.eventFormat === tag ? '' : tag;
      return next;
    }
    if (isEventBannerTag(tag)) {
      next.eventBanner = next.eventBanner === tag ? '' : tag;
      return next;
    }
    return filters;
  }

  function applySearchTagToFilters(filters, tag) {
    if (!tag || tag === BOOKMARK_TAG) return toggleEventFilter(filters, tag);
    const next = Object.assign(createEmptyEventFilters(), {
      bookmarkOnly: false,
      conditionTags: filters.conditionTags.slice(),
      eventFormat: filters.eventFormat,
      eventBanner: filters.eventBanner,
    });
    if (isConditionTag(tag)) {
      if (!next.conditionTags.includes(tag)) next.conditionTags.push(tag);
      return next;
    }
    if (isEventFormatTag(tag)) {
      next.eventFormat = tag;
      return next;
    }
    if (isEventBannerTag(tag)) {
      next.eventBanner = tag;
      return next;
    }
    return filters;
  }

  function removeEventFilterTag(filters, tag) {
    if (tag === BOOKMARK_TAG) {
      const next = Object.assign(createEmptyEventFilters(), filters);
      next.bookmarkOnly = false;
      return next;
    }
    const next = Object.assign(createEmptyEventFilters(), filters);
    if (isConditionTag(tag)) {
      next.conditionTags = next.conditionTags.filter((t) => t !== tag);
      return next;
    }
    if (isEventFormatTag(tag) && next.eventFormat === tag) next.eventFormat = '';
    if (isEventBannerTag(tag) && next.eventBanner === tag) next.eventBanner = '';
    return next;
  }

  function activeEventFilterItems(filters) {
    const items = [];
    if (filters.bookmarkOnly) items.push({ tag: BOOKMARK_TAG, label: activeFilterLabel(BOOKMARK_TAG) });
    filters.conditionTags.forEach((tag) => items.push({ tag, label: tag }));
    if (filters.eventFormat) items.push({ tag: filters.eventFormat, label: filters.eventFormat });
    if (filters.eventBanner) items.push({ tag: filters.eventBanner, label: filters.eventBanner });
    return items;
  }

  function postVisibility(p) {
    return p && p.visibility === 'friends' ? 'friends' : 'public';
  }

  function visibilityChipHtml(p) {
    if (postVisibility(p) !== 'friends') return '';
    return '<span class="board-visibility-chip">フレンド限定</span>';
  }

  function visibilitySelectHtml(id, selected) {
    const vis = selected === 'friends' ? 'friends' : 'public';
    return `
      <div class="form-group"><label for="${id}">公開範囲</label>
        <select class="form-select" id="${id}">
          <option value="public"${vis === 'public' ? ' selected' : ''}>全体公開（誰でも閲覧可）</option>
          <option value="friends"${vis === 'friends' ? ' selected' : ''}>フレンドのみ</option>
        </select>
        <p class="form-hint">フレンドのみは、相互フレンドになった人だけが閲覧できます。</p>
      </div>`;
  }

  async function loadViewerContext() {
    await window.MiraiFirebaseReady;
    const user = window.MiraiAuth ? window.MiraiAuth.getUser() : null;
    let friendUids = null;
    if (user && window.MiraiFriends) {
      try {
        const friends = await MiraiFriends.listFriends(user.uid);
        friendUids = new Set(friends.map((f) => f.friendUid));
      } catch (e) {
        console.error(e);
        friendUids = new Set();
      }
    }
    return { user, friendUids };
  }

  function isPostVisible(p, viewerUid, friendUids) {
    if (p.isPublished === false) return false;
    if (postVisibility(p) === 'public') return true;
    if (!viewerUid) return false;
    if (p.authorUid === viewerUid) return true;
    return !!(friendUids && friendUids.has(p.authorUid));
  }

  function postUpdatedMs(p) {
    const t = p && p.updatedAt;
    if (!t) return 0;
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t === 'number') return t;
    if (typeof t === 'string') return Date.parse(t) || 0;
    if (t.seconds) return t.seconds * 1000;
    return 0;
  }

  function sortPostsByUpdated(posts) {
    return posts.sort((a, b) => postUpdatedMs(b) - postUpdatedMs(a));
  }

  function isIndexOrQueryError(err) {
    const code = err && err.code;
    return code === 'failed-precondition' || code === 'permission-denied' || code === 'invalid-argument';
  }

  /** 公開投稿のみ（equality のみで取得し、並び替えはクライアント側 — 複合インデックス不要） */
  async function fetchPublicBoardPosts(collectionName) {
    const f = await fb();
    if (!f || !f.configured) return [];
    const { collection, query, limit, getDocs, where, orderBy } = f.dbFns;
    const col = collection(f.db, collectionName);
    const fetchLimit = PAGE_SIZE * 4;
    const queries = [
      () => query(col, where('visibility', '==', 'public'), limit(fetchLimit)),
      () => query(col, where('visibility', '==', 'public'), where('isPublished', '==', true), limit(fetchLimit)),
      () => query(col, where('isPublished', '==', true), limit(fetchLimit)),
      () => query(col, orderBy('updatedAt', 'desc'), limit(fetchLimit)),
    ];

    let lastErr = null;
    for (const build of queries) {
      try {
        const snap = await getDocs(build());
        return snap.docs
          .map((d) => Object.assign({ authorUid: d.id }, d.data()))
          .filter((p) => p.isPublished !== false && postVisibility(p) === 'public');
      } catch (e) {
        lastErr = e;
        if (!isIndexOrQueryError(e)) throw e;
        console.warn('[board] public query fallback:', collectionName, e.code || e.message);
      }
    }
    throw lastErr || new Error('掲示板データの取得に失敗しました');
  }

  /** 公開投稿 + 自分・フレンドの限定投稿 */
  async function fetchBoardPosts(collectionName) {
    const f = await fb();
    if (!f || !f.configured) return [];
    const { doc, getDoc } = f.dbFns;
    const { user, friendUids } = await loadViewerContext();
    const byUid = new Map((await fetchPublicBoardPosts(collectionName)).map((p) => [p.authorUid, p]));
    const extraUids = new Set();
    if (user) extraUids.add(user.uid);
    if (friendUids) friendUids.forEach((uid) => extraUids.add(uid));
    await Promise.all(Array.from(extraUids).map(async (uid) => {
      if (byUid.has(uid)) return;
      try {
        const snap = await getDoc(doc(f.db, collectionName, uid));
        if (!snap.exists()) return;
        const p = Object.assign({ authorUid: uid }, snap.data());
        if (isPostVisible(p, user && user.uid, friendUids)) byUid.set(uid, p);
      } catch (e) {
        console.warn('[board] extra fetch failed:', collectionName, uid, e);
      }
    }));
    return sortPostsByUpdated(Array.from(byUid.values())).slice(0, PAGE_SIZE);
  }

  function aspect16x9Html(url, emptyLabel) {
    if (url) {
      return `<div class="board-aspect-16x9"><img src="${esc(url)}" alt="" loading="lazy"></div>`;
    }
    if (emptyLabel) {
      return `<div class="board-aspect-16x9 board-aspect-16x9--empty">${esc(emptyLabel)}</div>`;
    }
    return '';
  }

  function authorAvatarHtml(p, className) {
    const cls = 'board-author-avatar' + (className ? ' ' + className : '');
    const name = p.authorName || '匿名';
    if (p.authorAvatarURL) {
      return `<div class="${cls} board-author-avatar--img"><img src="${esc(p.authorAvatarURL)}" alt="" loading="lazy"></div>`;
    }
    return `<div class="${cls}">${esc(name.slice(0, 1))}</div>`;
  }

  function authorRowHtml(p) {
    const profileLink = p.authorPublicId
      ? `<a href="#/p/${esc(p.authorPublicId)}" class="board-card__author-link" data-link>${esc(p.authorName || '匿名')}</a>`
      : `<span class="board-card__author-name">${esc(p.authorName || '匿名')}</span>`;
    return `<div class="board-card__author-row">${authorAvatarHtml(p, 'board-author-avatar--sm')}${profileLink}</div>`;
  }

  function eventHeroHtml(p, opts) {
    opts = opts || {};
    const detailCls = opts.detail ? ' board-feed-card__hero--detail' : '';
    const headCls = opts.detail ? ' board-event-head--detail' : '';
    const title = esc(p.eventName || '(無題)') + visibilityChipHtml(p);
    const inner = p.imageURL
      ? `<img src="${esc(p.imageURL)}" alt="" loading="lazy">`
      : `<span class="board-aspect-16x9--empty">${esc('画像なし')}</span>`;
    return `
      <div class="board-event-head${headCls}">
        <div class="board-feed-card__hero board-aspect-16x9${detailCls}">${inner}</div>
        <div class="board-event-head__title"><h3 class="board-card__title">${title}</h3></div>
      </div>`;
  }

  async function enrichPostsWithAvatars(posts) {
    const f = await fb();
    if (!f) return posts;
    const { doc, getDoc } = f.dbFns;
    return Promise.all(posts.map(async (p) => {
      if (p.authorAvatarURL) return p;
      if (!p.authorPublicId) return p;
      try {
        const snap = await getDoc(doc(f.db, 'linkHubs', p.authorPublicId));
        if (snap.exists() && snap.data().avatarURL) {
          return Object.assign({}, p, { authorAvatarURL: snap.data().avatarURL });
        }
      } catch (e) { /* ignore */ }
      return p;
    }));
  }

  function wireBoardFeed(container) {
    if (!container) return;
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.board-detail-toggle');
      if (!btn) return;
      const card = btn.closest('.board-feed-card');
      const panel = card && card.querySelector('.board-detail-panel');
      if (!panel) return;
      const open = panel.hidden;
      panel.hidden = !open;
      btn.textContent = open
        ? (btn.dataset.closeLabel || '詳細を閉じる')
        : (btn.dataset.openLabel || '詳細を見る');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  async function fb() {
    return window.MiraiFirebaseReady ? await window.MiraiFirebaseReady : null;
  }

  async function isConfigured() {
    const f = await fb();
    return !!(f && f.configured);
  }

  function notConfiguredHtml() {
    return '<div class="info-box"><p><strong>この機能は準備中です。</strong></p>' +
      '<p class="mt-1">サイト管理者が Firebase を設定すると利用できます。</p></div>';
  }

  async function requireUser(box) {
    await window.MiraiFirebaseReady;
    let user = window.MiraiAuth.getUser();
    if (!user) {
      user = await new Promise((resolve) => {
        let done = false;
        const off = window.MiraiAuth.onChange((u) => { if (!done) { done = true; off(); resolve(u); } });
        setTimeout(() => { if (!done) { done = true; off(); resolve(window.MiraiAuth.getUser()); } }, 2500);
      });
    }
    if (!user) {
      box.innerHTML = '<div class="info-box"><p>この操作にはログインが必要です。</p>' +
        '<p class="mt-2"><a href="#/login" class="btn btn-primary" data-link>ログインする</a></p></div>';
      return null;
    }
    return user;
  }

  async function uploadImage(uid, file, name) {
    const f = await fb();
    const { ref, uploadBytes, getDownloadURL } = f.storageFns;
    const r = ref(f.storage, `board/${uid}/${name}`);
    await uploadBytes(r, file);
    return getDownloadURL(r);
  }

  // ========================================================
  // イベラン広告
  // ========================================================

  function bookmarkMs(b) {
    const t = b && b.createdAt;
    if (!t) return 0;
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t === 'number') return t;
    if (typeof t === 'string') return Date.parse(t) || 0;
    if (t.seconds) return t.seconds * 1000;
    return 0;
  }

  async function loadBookmarkedUids(uid) {
    const f = await fb();
    if (!f || !uid) return new Set();
    const { collection, getDocs } = f.dbFns;
    const snap = await getDocs(collection(f.db, 'users', uid, 'eventBookmarks'));
    return new Set(snap.docs.map((d) => d.id));
  }

  async function listEventBookmarks(uid) {
    const f = await fb();
    if (!f || !uid) return [];
    const { collection, getDocs } = f.dbFns;
    const snap = await getDocs(collection(f.db, 'users', uid, 'eventBookmarks'));
    return snap.docs
      .map((d) => Object.assign({ authorUid: d.id }, d.data()))
      .sort((a, b) => bookmarkMs(b) - bookmarkMs(a));
  }

  async function toggleEventBookmark(uid, post) {
    const f = await fb();
    if (!f || !uid || !post || !post.authorUid) throw new Error('ブックマークできません');
    const { doc, getDoc, setDoc, deleteDoc, serverTimestamp } = f.dbFns;
    const ref = doc(f.db, 'users', uid, 'eventBookmarks', post.authorUid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await deleteDoc(ref);
      return false;
    }
    await setDoc(ref, {
      authorUid: post.authorUid,
      eventName: post.eventName || '',
      authorName: post.authorName || '',
      authorPublicId: post.authorPublicId || '',
      createdAt: serverTimestamp(),
    });
    return true;
  }

  function eventBookmarkBtnHtml(p, isActive) {
    return `<button type="button" class="board-bookmark${isActive ? ' is-bookmarked' : ''}" data-uid="${esc(p.authorUid)}" aria-pressed="${isActive ? 'true' : 'false'}">
      <span class="board-bookmark__icon" aria-hidden="true">${isActive ? '★' : '☆'}</span>
      <span class="board-bookmark__label">${isActive ? 'ブックマーク済み' : 'ブックマーク'}</span>
    </button>`;
  }

  async function initEventList() {
    const box = document.getElementById('app').querySelector('#boardEventRoot');
    if (!box) return;
    if (!(await isConfigured())) { box.innerHTML = notConfiguredHtml(); return; }

    box.innerHTML = `
      <div class="board-toolbar board-toolbar--view">
        <div class="board-search-wrap">
          <input type="search" class="form-input" id="boardEventSearch" placeholder="イベント名・タグで検索（例: 初音ミク、ガチラン）" autocomplete="off" aria-autocomplete="list" aria-controls="boardEventSuggest" aria-expanded="false">
          <div id="boardEventSuggest" class="board-search-suggest" role="listbox" hidden></div>
        </div>
        <div id="boardEventActiveFilter" class="board-active-filter-wrap" hidden></div>
        <p class="form-hint board-toolbar__note">閲覧のみ。投稿・編集は<a href="#/mypage" data-link>マイページ</a>から行えます（1アカウント1件）。</p>
      </div>
      <div class="board-filter-compact" id="boardEventTagGroups">
        <div class="board-filter-row">
          <span class="board-filter-row__label">条件</span>
          <div class="board-filter-row__content">
            <p class="form-hint board-filter-row__hint">複数選択可</p>
            <div class="board-tags board-tags--scroll" id="boardEventConditionTags"></div>
          </div>
        </div>
        <details class="board-tag-fold">
          <summary class="board-tag-fold__summary">
            <span class="board-tag-fold__chevron" aria-hidden="true"></span>
            <span class="board-tag-fold__text">
              <strong class="board-tag-fold__title">イベントタグ一覧</strong>
              <span class="board-tag-fold__hint">形式・バナーキャラで絞り込む（タップして開く）</span>
            </span>
          </summary>
          <div class="board-tag-fold__body">
            <p class="form-hint board-tag-group__hint">イベント形式（1つまで）</p>
            <div class="board-tags board-tags--dense" id="boardEventFormatTags"></div>
            <p class="form-hint board-tag-group__hint mt-2">バナーキャラクター（1つまで）</p>
            <div class="board-tags board-tags--dense board-tags--scroll-y" id="boardEventBannerTags"></div>
          </div>
        </details>
      </div>
      <div id="boardEventList" class="board-list board-feed-wrap"><p class="text-muted">読み込み中…</p></div>
    `;

    const tagGroups = box.querySelector('#boardEventTagGroups');
    const conditionTagWrap = box.querySelector('#boardEventConditionTags');
    const formatTagWrap = box.querySelector('#boardEventFormatTags');
    const bannerTagWrap = box.querySelector('#boardEventBannerTags');
    let filters = createEmptyEventFilters();

    const { user: viewer, friendUids } = await loadViewerContext();
    let bookmarkUids = viewer ? await loadBookmarkedUids(viewer.uid) : new Set();
    const canBookmark = !!viewer;

    if (viewer) {
      try {
        if (sessionStorage.getItem('miraiBoardEventFilter') === 'bookmark') {
          sessionStorage.removeItem('miraiBoardEventFilter');
          filters.bookmarkOnly = true;
        }
      } catch (e) { /* ignore */ }
    }

    function isTagButtonActive(tag) {
      if (tag === '') return !hasActiveEventFilters(filters);
      if (tag === BOOKMARK_TAG) return filters.bookmarkOnly;
      if (isConditionTag(tag)) return filters.conditionTags.includes(tag);
      if (isEventFormatTag(tag)) return filters.eventFormat === tag;
      if (isEventBannerTag(tag)) return filters.eventBanner === tag;
      return false;
    }

    function tagButtonHtml(tag, label, extraClass) {
      const active = isTagButtonActive(tag) ? ' is-active' : '';
      const cls = 'board-tag' + (extraClass ? ' ' + extraClass : '') + active;
      return '<button type="button" class="' + cls + '" data-tag="' + esc(tag) + '">' + esc(label || tag) + '</button>';
    }

    function renderTagButtons() {
      conditionTagWrap.innerHTML =
        tagButtonHtml('', 'すべて') +
        (canBookmark ? tagButtonHtml(BOOKMARK_TAG, '★ ブックマーク', 'board-tag--bookmark') : '') +
        CONDITION_TAGS.map((t) => tagButtonHtml(t, t, 'board-tag--condition')).join('');
      formatTagWrap.innerHTML = EVENT_FORMAT_TAGS.map((t) => tagButtonHtml(t, t, 'board-tag--event')).join('');
      bannerTagWrap.innerHTML = getEventBannerTags().map((t) => tagButtonHtml(t, t, 'board-tag--event')).join('');
    }
    renderTagButtons();

    let all = [];
    try {
      all = await enrichPostsWithAvatars(await fetchEventAds());
    } catch (e) {
      const hint = (e && e.code === 'permission-denied')
        ? '<p class="form-hint mt-1">Firestore のルールが未デプロイの可能性があります。<code>data/firestore.rules</code> を Firebase Console に反映してください。</p>'
        : (e && e.code === 'failed-precondition')
          ? '<p class="form-hint mt-1">Firestore インデックスの作成が必要な場合があります。<code>data/firestore.indexes.json</code> をデプロイしてください。</p>'
          : '';
      box.querySelector('#boardEventList').innerHTML =
        '<div class="info-box"><p>読み込みに失敗しました。</p>' + hint + '</div>';
      console.error(e);
      return;
    }

    const listEl = box.querySelector('#boardEventList');
    const searchEl = box.querySelector('#boardEventSearch');
    const suggestEl = box.querySelector('#boardEventSuggest');
    const activeFilterEl = box.querySelector('#boardEventActiveFilter');

    function syncActiveTagButtons() {
      renderTagButtons();
    }

    function renderActiveFilter() {
      if (!activeFilterEl) return;
      const items = activeEventFilterItems(filters);
      if (!items.length) {
        activeFilterEl.hidden = true;
        activeFilterEl.innerHTML = '';
        return;
      }
      activeFilterEl.hidden = false;
      activeFilterEl.innerHTML =
        items.map((item) =>
          '<span class="board-active-filter">' +
          '<span class="board-active-filter__label">絞り込み</span>' +
          '<span class="board-active-filter__tag">' + esc(item.label) + '</span>' +
          '<button type="button" class="board-active-filter__clear" data-clear-tag="' + esc(item.tag) + '" aria-label="' + esc(item.label) + 'の絞り込みを解除">✕</button>' +
          '</span>'
        ).join('') +
        '<button type="button" class="board-active-filter__clear-all">すべて解除</button>';
    }

    function hideSuggestions() {
      if (!suggestEl) return;
      suggestEl.hidden = true;
      suggestEl.innerHTML = '';
      searchEl.setAttribute('aria-expanded', 'false');
    }

    function renderSuggestions() {
      if (!suggestEl) return;
      const q = searchEl.value.trim();
      const items = suggestFilterTags(q, 12);
      if (!q || !items.length) {
        hideSuggestions();
        return;
      }
      const groups = [
        { label: '条件タグ', items: items.filter((item) => item.kind === 'condition') },
        { label: 'イベントタグ', items: items.filter((item) => item.kind === 'event') },
      ].filter((group) => group.items.length);
      suggestEl.innerHTML = groups.map((group) =>
        '<div class="board-search-suggest__group">' +
        '<p class="board-search-suggest__heading">' + esc(group.label) + '</p>' +
        group.items.map((item) =>
          '<button type="button" class="board-search-suggest__item" role="option" data-tag="' + esc(item.tag) + '">' +
          '<span class="board-search-suggest__tag">' + esc(item.tag) + '</span>' +
          '</button>'
        ).join('') +
        '</div>'
      ).join('');
      suggestEl.hidden = false;
      searchEl.setAttribute('aria-expanded', 'true');
    }

    function clearAllFilters() {
      filters = createEmptyEventFilters();
      searchEl.value = '';
      syncActiveTagButtons();
      renderActiveFilter();
      hideSuggestions();
      render();
    }

    function applySearchTag(tag) {
      filters = applySearchTagToFilters(filters, tag);
      searchEl.value = tag;
      syncActiveTagButtons();
      renderActiveFilter();
      hideSuggestions();
      render();
    }

    function render() {
      const q = searchEl.value.trim().toLowerCase();
      const items = all.filter((p) => {
        if (!isPostVisible(p, viewer && viewer.uid, friendUids)) return false;
        if (!postMatchesEventFilters(p, filters, bookmarkUids)) return false;
        if (!q) return true;
        return postSearchHaystack(p).some((s) => s.includes(q));
      });
      listEl.innerHTML = items.length
        ? `<div class="board-feed">${items.map((p) => eventCardHtml(p, bookmarkUids, canBookmark)).join('')}</div>`
        : (filters.bookmarkOnly
          ? '<p class="text-muted board-empty">ブックマークした広告はまだありません。</p>'
          : '<p class="text-muted board-empty">該当する広告はまだありません。</p>');
    }

    searchEl.addEventListener('input', () => {
      renderSuggestions();
      render();
    });
    searchEl.addEventListener('focus', renderSuggestions);
    searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        hideSuggestions();
        return;
      }
      if (e.key !== 'Enter') return;
      const q = searchEl.value.trim();
      const exactTag = findExactFilterTag(q);
      if (exactTag) {
        e.preventDefault();
        applySearchTag(exactTag);
        return;
      }
      const items = suggestFilterTags(q, 1);
      if (items.length === 1 && items[0].score >= 60) {
        e.preventDefault();
        applySearchTag(items[0].tag);
      }
    });
    if (activeFilterEl) {
      activeFilterEl.addEventListener('click', (e) => {
        const clearOne = e.target.closest('[data-clear-tag]');
        if (clearOne) {
          filters = removeEventFilterTag(filters, clearOne.dataset.clearTag);
          syncActiveTagButtons();
          renderActiveFilter();
          render();
          return;
        }
        if (e.target.closest('.board-active-filter__clear-all')) {
          clearAllFilters();
        }
      });
    }
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.board-search-wrap')) hideSuggestions();
    });
    if (suggestEl) {
      suggestEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.board-search-suggest__item');
        if (!btn) return;
        applySearchTag(btn.dataset.tag);
      });
    }
    tagGroups.addEventListener('click', (e) => {
      const b = e.target.closest('.board-tag');
      if (!b) return;
      filters = toggleEventFilter(filters, b.dataset.tag);
      syncActiveTagButtons();
      renderActiveFilter();
      render();
    });
    renderActiveFilter();
    listEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('.board-bookmark');
      if (!btn) return;
      e.preventDefault();
      if (!viewer) { location.hash = '#/login'; return; }
      const authorUid = btn.dataset.uid;
      const post = all.find((p) => p.authorUid === authorUid);
      if (!post) return;
      btn.disabled = true;
      try {
        const added = await toggleEventBookmark(viewer.uid, post);
        if (added) bookmarkUids.add(authorUid);
        else bookmarkUids.delete(authorUid);
        render();
      } catch (err) {
        console.error(err);
        alert(err.message || 'ブックマークに失敗しました');
        btn.disabled = false;
      }
    });
    render();
  }

  async function fetchEventAds() {
    return fetchBoardPosts('boardEventAds');
  }

  function eventCardHtml(p, bookmarkUids, canBookmark) {
    const conditionTags = (p.conditionTags || []).map((t) => `<span class="board-chip">${esc(t)}</span>`).join('');
    const eventTags = getPostEventTags(p).map((t) => `<span class="board-chip board-chip--event">${esc(t)}</span>`).join('');
    const rank = p.targetRank ? `<span class="board-meta-item">目標 ${esc(p.targetRank)}位</span>` : '';
    const banner = p.eventBanner ? `<span class="board-meta-item">${esc(p.eventBanner)}</span>` : '';
    const detailUrl = `#/board/event/${encodeURIComponent(p.authorUid)}`;
    const bookmarked = bookmarkUids && bookmarkUids.has(p.authorUid);
    const bookmarkBtn = canBookmark ? eventBookmarkBtnHtml(p, bookmarked) : '';
    const chipsHtml = [
      conditionTags ? `<div class="board-chips">${conditionTags}</div>` : '',
      eventTags ? `<div class="board-chips board-chips--event">${eventTags}</div>` : '',
    ].filter(Boolean).join('');

    return `
      <article class="board-feed-card board-feed-card--event">
        ${eventHeroHtml(p)}
        <div class="board-feed-card__body">
          ${authorRowHtml(p)}
          <div class="board-meta">${rank}${banner}</div>
          ${chipsHtml}
          <div class="board-card__actions board-card__actions--event">
            ${bookmarkBtn}
            <a href="${detailUrl}" class="btn btn-secondary btn-sm board-detail-link" data-link>詳細を見る</a>
          </div>
        </div>
      </article>
    `;
  }

  async function fetchEventAd(authorUid) {
    const f = await fb();
    if (!f || !authorUid) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, 'boardEventAds', authorUid));
    return snap.exists() ? Object.assign({ authorUid }, snap.data()) : null;
  }

  async function initEventDetail(params) {
    const box = document.getElementById('app').querySelector('#boardEventDetailRoot');
    if (!box) return;
    if (!(await isConfigured())) { box.innerHTML = notConfiguredHtml(); return; }

    const authorUid = params && params.uid;
    if (!authorUid) {
      box.innerHTML = '<div class="info-box"><p>広告が見つかりませんでした。</p><p class="mt-2"><a href="#/board/event" class="btn btn-secondary" data-link>一覧に戻る</a></p></div>';
      return;
    }

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';
    const { user: viewer, friendUids } = await loadViewerContext();

    let post;
    try {
      post = await fetchEventAd(authorUid);
    } catch (e) {
      box.innerHTML = '<div class="info-box"><p>読み込みに失敗しました。</p></div>';
      console.error(e);
      return;
    }

    if (!post || !isPostVisible(post, viewer && viewer.uid, friendUids)) {
      box.innerHTML = '<div class="info-box"><p>この広告は表示できません。</p><p class="mt-2"><a href="#/board/event" class="btn btn-secondary" data-link>一覧に戻る</a></p></div>';
      return;
    }

    const enriched = (await enrichPostsWithAvatars([post]))[0];
    const bookmarked = viewer ? (await loadBookmarkedUids(viewer.uid)).has(authorUid) : false;
    box.innerHTML = eventDetailHtml(enriched, { canBookmark: !!viewer, bookmarked });
    document.title = (enriched.eventName || 'イベラン広告') + ' — 未来喫茶';

    const bookmarkBtn = box.querySelector('.board-bookmark');
    if (bookmarkBtn && viewer) {
      bookmarkBtn.addEventListener('click', async () => {
        bookmarkBtn.disabled = true;
        try {
          const added = await toggleEventBookmark(viewer.uid, enriched);
          const active = added;
          bookmarkBtn.classList.toggle('is-bookmarked', active);
          bookmarkBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
          bookmarkBtn.querySelector('.board-bookmark__icon').textContent = active ? '★' : '☆';
          bookmarkBtn.querySelector('.board-bookmark__label').textContent = active ? 'ブックマーク済み' : 'ブックマーク';
        } catch (err) {
          console.error(err);
          alert(err.message || 'ブックマークに失敗しました');
        } finally {
          bookmarkBtn.disabled = false;
        }
      });
    }
  }

  function eventDetailHtml(p, opts) {
    opts = opts || {};
    const conditionTags = (p.conditionTags || []).map((t) => `<span class="board-chip">${esc(t)}</span>`).join('');
    const eventTags = getPostEventTags(p).map((t) => `<span class="board-chip board-chip--event">${esc(t)}</span>`).join('');
    const rank = p.targetRank ? `<span class="board-meta-item">目標 ${esc(p.targetRank)}位</span>` : '';
    const banner = p.eventBanner ? `<span class="board-meta-item">${esc(p.eventBanner)}</span>` : '';
    const discord = p.discordURL
      ? `<a class="btn btn-secondary btn-sm" href="${esc(normalizeUrl(p.discordURL))}" target="_blank" rel="noopener noreferrer">${esc(p.discordLabel || 'Discord')}</a>` : '';
    const run = p.runLocationURL
      ? `<a class="btn btn-secondary btn-sm" href="${esc(normalizeUrl(p.runLocationURL))}" target="_blank" rel="noopener noreferrer">周回場所</a>` : '';
    const bookmarkBtn = opts.canBookmark
      ? `<div class="board-detail-page__bookmark">${eventBookmarkBtnHtml(p, !!opts.bookmarked)}</div>` : '';
    const chipsHtml = [
      conditionTags ? `<div class="board-chips">${conditionTags}</div>` : '',
      eventTags ? `<div class="board-chips board-chips--event">${eventTags}</div>` : '',
    ].filter(Boolean).join('');

    return `
      <article class="board-detail-page">
        ${eventHeroHtml(p, { detail: true })}
        <div class="board-detail-page__body">
          ${bookmarkBtn}
          ${authorRowHtml(p)}
          <div class="board-meta">${rank}${banner}</div>
          ${chipsHtml}
          ${p.body ? `<p class="board-card__text">${esc(p.body)}</p>` : ''}
          ${(discord || run) ? `<div class="board-card__actions">${discord}${run}</div>` : ''}
        </div>
      </article>
    `;
  }

  async function initEventEdit() {
    const box = document.getElementById('app').querySelector('#boardEventEditRoot');
    if (!box) return;
    if (!(await isConfigured())) { box.innerHTML = notConfiguredHtml(); return; }
    box.innerHTML = '<p class="text-muted">読み込み中…</p>';
    const user = await requireUser(box);
    if (!user) return;
    await mountEventEditor(box, user);
  }

  async function mountEventEditor(box, user, opts) {
    if (!box) return;
    opts = opts || {};
    if (!(await isConfigured())) { box.innerHTML = notConfiguredHtml(); return; }
    if (!user) return;

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';

    const f = await fb();
    const { doc, getDoc } = f.dbFns;
    let post = null;
    let docExists = false;
    try {
      const snap = await getDoc(doc(f.db, 'boardEventAds', user.uid));
      docExists = snap.exists();
      post = docExists ? snap.data() : null;
    } catch (e) { console.error(e); }

    let authorName = post && post.authorName ? post.authorName : '';
    let authorPublicId = post && post.authorPublicId ? post.authorPublicId : '';
    let authorAvatarURL = post && post.authorAvatarURL ? post.authorAvatarURL : '';
    const hub = await loadOwnHub(user.uid);
    if (!authorName && hub) { authorName = hub.displayName || ''; authorPublicId = hub.publicId || ''; }
    if (!authorAvatarURL && hub && hub.avatarURL) authorAvatarURL = hub.avatarURL;

    const hasPost = !!(post && post.eventName);
    post = post || {
      authorUid: user.uid, authorPublicId, authorName, authorAvatarURL,
      eventName: '', body: '', imageURL: '', conditionTags: [], eventTags: [], targetRank: null,
      eventBanner: '', discordURL: '', discordLabel: 'Discord', runLocationURL: '', isPublished: true,
      visibility: 'public',
    };

    const storedEventTags = getPostEventTags(post);
    const selectedEvent = splitEventTags(storedEventTags);
    const tagChecks = CONDITION_TAGS.map((t) => `
      <label class="board-check"><input type="checkbox" value="${esc(t)}"${(post.conditionTags || []).includes(t) ? ' checked' : ''}><span>${esc(t)}</span></label>
    `).join('');
    const eventFormatChecks = EVENT_FORMAT_TAGS.map((t) => `
      <label class="board-check"><input type="checkbox" name="evEventFormat" value="${esc(t)}"${selectedEvent.eventFormat === t ? ' checked' : ''}><span>${esc(t)}</span></label>
    `).join('');
    const eventBannerChecks = getEventBannerTags().map((t) => `
      <label class="board-check"><input type="checkbox" name="evEventBanner" value="${esc(t)}"${selectedEvent.eventBanner === t ? ' checked' : ''}><span>${esc(t)}</span></label>
    `).join('');
    const rankOpts = ['<option value="">指定なし</option>']
      .concat(TARGET_RANKS.map((r) => `<option value="${r}"${post.targetRank === r ? ' selected' : ''}>${r}位</option>`)).join('');

    box.innerHTML = `
      <p class="form-hint mp-board-hint">1アカウント1件まで。保存すると既存の内容を上書き更新します。</p>
      <section class="card community-editor mp-board-editor">
        <div class="form-group"><label for="evName">イベント名 / タイトル</label>
          <input type="text" class="form-input" id="evName" maxlength="60" value="${esc(post.eventName)}" placeholder="例: 〇〇イベント 一緒に走りませんか"></div>
        <div class="form-group"><label for="evAuthor">表示名</label>
          <input type="text" class="form-input" id="evAuthor" maxlength="30" value="${esc(authorName)}" placeholder="広告に表示される名前"></div>
        <div class="form-group"><label for="evBody">紹介文</label>
          <textarea class="form-input" id="evBody" rows="4" maxlength="500" placeholder="募集内容・条件・雰囲気など">${esc(post.body)}</textarea></div>
        <div class="form-row">
          <div class="form-group"><label for="evRank">目標順位</label><select class="form-select" id="evRank">${rankOpts}</select></div>
          <div class="form-group"><label for="evBanner">対象バナー/キャラ（表示用・任意）</label>
            <input type="text" class="form-input" id="evBanner" maxlength="30" value="${esc(post.eventBanner)}" placeholder="例: 一歌（未入力時はバナータグから自動設定）"></div>
        </div>
        <div class="form-group"><label>条件タグ</label>
          <p class="form-hint">複数選択できます</p>
          <div class="board-checks" id="evTags">${tagChecks}</div></div>
        <div class="form-group"><label>イベントタグ</label>
          <p class="form-hint">イベント形式（1つまで）</p>
          <div class="board-checks" id="evEventFormatTags">${eventFormatChecks}</div>
          <p class="form-hint mt-2">バナーキャラクター（1つまで）</p>
          <div class="board-checks board-checks--dense" id="evEventBannerTags">${eventBannerChecks}</div>
        </div>
        <div class="form-row">
          <div class="form-group"><label for="evDiscordUrl">Discord / 募集URL</label>
            <input type="text" class="form-input" id="evDiscordUrl" value="${esc(post.discordURL)}" placeholder="https://discord.gg/..."></div>
          <div class="form-group"><label for="evDiscordLabel">リンク表示名</label>
            <input type="text" class="form-input" id="evDiscordLabel" maxlength="20" value="${esc(post.discordLabel || 'Discord')}"></div>
        </div>
        <div class="form-group"><label for="evRunUrl">周回場所URL（任意）</label>
          <input type="text" class="form-input" id="evRunUrl" value="${esc(post.runLocationURL)}" placeholder="https://..."></div>
        <div class="form-group"><label for="evImg">バナー画像（任意・1枚）</label>
          <input type="file" class="form-input" id="evImg" accept="image/*">
          ${post.imageURL ? `<div class="board-aspect-16x9 mt-2" style="max-height:200px"><img src="${esc(post.imageURL)}" alt="" loading="lazy"></div>` : ''}</div>
        ${visibilitySelectHtml('evVisibility', post.visibility)}
        <div class="form-group"><label class="form-toggle"><input type="checkbox" id="evPublished"${post.isPublished !== false ? ' checked' : ''}><span class="toggle-track"></span><span class="toggle-label">公開する</span></label></div>

        <p id="evError" class="form-error mt-2" hidden></p>
        <button type="button" class="btn btn-primary btn-block" id="evSave">${hasPost ? '更新する' : '保存する'}</button>
        <p id="evSaved" class="community-saved mt-2" hidden>保存しました ✓</p>
      </section>
    `;

    const errEl = box.querySelector('#evError');
    const savedEl = box.querySelector('#evSaved');

    function wireSingleSelectEventTags(root) {
      const formatInputs = root.querySelectorAll('#evEventFormatTags input[name="evEventFormat"]');
      const bannerInputs = root.querySelectorAll('#evEventBannerTags input[name="evEventBanner"]');
      formatInputs.forEach((input) => {
        input.addEventListener('change', () => {
          if (!input.checked) return;
          formatInputs.forEach((other) => { if (other !== input) other.checked = false; });
        });
      });
      bannerInputs.forEach((input) => {
        input.addEventListener('change', () => {
          if (!input.checked) return;
          bannerInputs.forEach((other) => { if (other !== input) other.checked = false; });
        });
      });
    }
    wireSingleSelectEventTags(box);

    box.querySelector('#evSave').addEventListener('click', async () => {
      errEl.hidden = true; savedEl.hidden = true;
      const name = box.querySelector('#evName').value.trim();
      if (!name) { errEl.textContent = 'イベント名を入力してください。'; errEl.hidden = false; return; }
      const btn = box.querySelector('#evSave');
      btn.disabled = true; btn.textContent = '保存中…';
      try {
        const rankVal = box.querySelector('#evRank').value;
        const tags = Array.from(box.querySelectorAll('#evTags input:checked')).map((i) => i.value);
        const formatTag = (box.querySelector('#evEventFormatTags input:checked') || {}).value || '';
        const bannerTag = (box.querySelector('#evEventBannerTags input:checked') || {}).value || '';
        const eventTags = normalizeSavedEventTags([formatTag, bannerTag]);
        let eventBanner = box.querySelector('#evBanner').value.trim();
        if (!eventBanner && bannerTag) eventBanner = bannerTag;
        const fileInput = box.querySelector('#evImg');
        let imageURL = post.imageURL || '';
        if (fileInput.files && fileInput.files[0]) {
          imageURL = await uploadImage(user.uid, fileInput.files[0], 'event-banner.jpg');
        }
        const freshHub = await loadOwnHub(user.uid);
        if (freshHub && freshHub.avatarURL) authorAvatarURL = freshHub.avatarURL;
        const data = {
          authorUid: user.uid,
          authorPublicId: authorPublicId || '',
          authorName: box.querySelector('#evAuthor').value.trim() || name,
          authorAvatarURL: authorAvatarURL || null,
          eventName: name,
          body: box.querySelector('#evBody').value.trim(),
          imageURL: imageURL || null,
          conditionTags: tags,
          eventTags: eventTags,
          targetRank: rankVal ? parseInt(rankVal, 10) : null,
          eventBanner: eventBanner,
          discordURL: normalizeUrl(box.querySelector('#evDiscordUrl').value),
          discordLabel: box.querySelector('#evDiscordLabel').value.trim() || 'Discord',
          runLocationURL: normalizeUrl(box.querySelector('#evRunUrl').value),
          isPublished: box.querySelector('#evPublished').checked,
          visibility: box.querySelector('#evVisibility').value === 'friends' ? 'friends' : 'public',
        };
        await saveDoc('boardEventAds', user.uid, data, !docExists);
        docExists = true;
        post = Object.assign(post, data);
        btn.textContent = '更新する';
        savedEl.hidden = false;
        if (typeof opts.onSaved === 'function') opts.onSaved(post);
        setTimeout(() => { savedEl.hidden = true; }, 2500);
      } catch (e) {
        errEl.textContent = e.message || String(e); errEl.hidden = false;
      } finally {
        btn.disabled = false;
        if (btn.textContent === '保存中…') btn.textContent = hasPost ? '更新する' : '保存する';
      }
    });

    return post;
  }

  async function fetchOwnEventAd(uid) {
    const f = await fb();
    if (!f) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, 'boardEventAds', uid));
    return snap.exists() ? snap.data() : null;
  }

  async function fetchOwnMysekai(uid) {
    const f = await fb();
    if (!f) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, 'boardMysekai', uid));
    return snap.exists() ? snap.data() : null;
  }

  // ========================================================
  // マイセカイ宣伝
  // ========================================================

  async function initMysekaiList() {
    const box = document.getElementById('app').querySelector('#boardMysekaiRoot');
    if (!box) return;
    if (!(await isConfigured())) { box.innerHTML = notConfiguredHtml(); return; }

    box.innerHTML = `
      <div class="board-toolbar board-toolbar--view">
        <p class="text-muted board-toolbar__note">マイセカイの百景を見る（閲覧のみ）</p>
        <p class="form-hint board-toolbar__note">投稿・編集は<a href="#/mypage" data-link>マイページ</a>から行えます（1アカウント1件）。</p>
      </div>
      <div id="boardMysekaiList" class="board-list board-feed-wrap"><p class="text-muted">読み込み中…</p></div>
    `;

    const { user: viewer, friendUids } = await loadViewerContext();
    let all = [];
    try { all = await fetchMysekai(); }
    catch (e) {
      const hint = (e && e.code === 'permission-denied')
        ? '<p class="form-hint mt-1">Firestore のルールが未デプロイの可能性があります。<code>data/firestore.rules</code> を Firebase Console に反映してください。</p>'
        : (e && e.code === 'failed-precondition')
          ? '<p class="form-hint mt-1">Firestore インデックスの作成が必要な場合があります。<code>data/firestore.indexes.json</code> をデプロイしてください。</p>'
          : '';
      box.querySelector('#boardMysekaiList').innerHTML =
        '<div class="info-box"><p>読み込みに失敗しました。</p>' + hint + '</div>';
      console.error(e);
      return;
    }

    const listEl = box.querySelector('#boardMysekaiList');
    const visible = all.filter((p) => isPostVisible(p, viewer && viewer.uid, friendUids));
    listEl.innerHTML = visible.length
      ? `<div class="board-feed">${visible.map(mysekaiCardHtml).join('')}</div>`
      : '<p class="text-muted board-empty">宣伝はまだありません。</p>';

    wireBoardFeed(listEl);
    listEl.addEventListener('click', async (e) => {
      const likeBtn = e.target.closest('.board-like');
      if (!likeBtn) return;
      const authorUid = likeBtn.dataset.uid;
      const user = window.MiraiAuth.getUser();
      if (!user) { location.hash = '#/login'; return; }
      likeBtn.disabled = true;
      try {
        const liked = await toggleLike(authorUid, user.uid);
        const countEl = likeBtn.querySelector('.board-like__count');
        let n = parseInt(countEl.textContent, 10) || 0;
        n += liked ? 1 : -1;
        countEl.textContent = Math.max(0, n);
        likeBtn.classList.toggle('is-liked', liked);
      } catch (err) { console.error(err); }
      finally { likeBtn.disabled = false; }
    });
  }

  async function fetchMysekai() {
    return fetchBoardPosts('boardMysekai');
  }

  function mysekaiCardHtml(p) {
    const imgs = (p.imageURLs || []).slice(0, 4);
    const thumb = imgs[0];
    const extraCount = imgs.length > 1 ? imgs.length - 1 : 0;
    const thumbHtml = thumb
      ? `<div class="board-aspect-16x9">${extraCount ? `<span class="board-photo-badge">+${extraCount}枚</span>` : ''}<img src="${esc(thumb)}" alt="" loading="lazy"></div>`
      : aspect16x9Html('', '画像なし');
    const extraImgs = imgs.slice(1);
    const extraGallery = extraImgs.length
      ? `<div class="board-detail-gallery">${extraImgs.map((u) => aspect16x9Html(u)).join('')}</div>` : '';
    const hasDetail = !!(p.body || extraImgs.length);
    const likeBtn = `<button type="button" class="board-like" data-uid="${esc(p.authorUid)}">
      <span aria-hidden="true">♥</span> <span class="board-like__count">${esc(p.likeCount || 0)}</span>
    </button>`;
    const detailPanel = hasDetail ? `
      <div class="board-detail-panel" hidden>
        ${p.body ? `<p class="board-card__text">${esc(p.body)}</p>` : ''}
        ${extraGallery}
      </div>
      <button type="button" class="board-detail-toggle btn btn-secondary btn-sm btn-block" aria-expanded="false" data-open-label="詳細を見る" data-close-label="詳細を閉じる">詳細を見る</button>
    ` : '';

    return `
      <article class="board-feed-card board-feed-card--mysekai">
        ${thumbHtml}
        <div class="board-feed-card__body">
          <h3 class="board-card__title">${esc(p.title || '(無題)')}${visibilityChipHtml(p)}</h3>
          <p class="board-card__author">${esc(p.authorName || '匿名')}</p>
          ${detailPanel}
          <div class="board-card__actions">${likeBtn}</div>
        </div>
      </article>
    `;
  }

  async function toggleLike(authorUid, likerUid) {
    const f = await fb();
    const { doc, getDoc, setDoc, deleteDoc, updateDoc, increment, serverTimestamp } = f.dbFns;
    const likeRef = doc(f.db, 'boardMysekai', authorUid, 'likes', likerUid);
    const snap = await getDoc(likeRef);
    const postRef = doc(f.db, 'boardMysekai', authorUid);
    if (snap.exists()) {
      await deleteDoc(likeRef);
      await updateDoc(postRef, { likeCount: increment(-1) });
      return false;
    }
    await setDoc(likeRef, { createdAt: serverTimestamp() });
    await updateDoc(postRef, { likeCount: increment(1) });
    return true;
  }

  async function initMysekaiEdit() {
    const box = document.getElementById('app').querySelector('#boardMysekaiEditRoot');
    if (!box) return;
    if (!(await isConfigured())) { box.innerHTML = notConfiguredHtml(); return; }
    box.innerHTML = '<p class="text-muted">読み込み中…</p>';
    const user = await requireUser(box);
    if (!user) return;
    await mountMysekaiEditor(box, user);
  }

  async function mountMysekaiEditor(box, user, opts) {
    if (!box) return;
    opts = opts || {};
    if (!(await isConfigured())) { box.innerHTML = notConfiguredHtml(); return; }
    if (!user) return;

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';

    const f = await fb();
    const { doc, getDoc } = f.dbFns;
    let post = null;
    let docExists = false;
    try {
      const snap = await getDoc(doc(f.db, 'boardMysekai', user.uid));
      docExists = snap.exists();
      post = docExists ? snap.data() : null;
    } catch (e) { console.error(e); }

    let authorName = post && post.authorName ? post.authorName : '';
    let authorPublicId = post && post.authorPublicId ? post.authorPublicId : '';
    if (!authorName) {
      const hub = await loadOwnHub(user.uid);
      if (hub) { authorName = hub.displayName || ''; authorPublicId = hub.publicId || ''; }
    }

    const hasPost = !!(post && post.title);
    post = post || {
      authorUid: user.uid, authorPublicId, authorName,
      title: '', body: '', imageURLs: [], likeCount: 0, isPublished: true,
      visibility: 'public',
    };

    const existing = (post.imageURLs || []).slice(0, 4);
    box.innerHTML = `
      <p class="form-hint mp-board-hint">1アカウント1件まで。保存すると既存の内容を上書き更新します。</p>
      <section class="card community-editor mp-board-editor">
        <div class="form-group"><label for="msTitle">タイトル</label>
          <input type="text" class="form-input" id="msTitle" maxlength="60" value="${esc(post.title)}" placeholder="例: 和風庭園の百景"></div>
        <div class="form-group"><label for="msAuthor">表示名</label>
          <input type="text" class="form-input" id="msAuthor" maxlength="30" value="${esc(authorName)}"></div>
        <div class="form-group"><label for="msBody">紹介文</label>
          <textarea class="form-input" id="msBody" rows="4" maxlength="500" placeholder="こだわりポイントなど">${esc(post.body)}</textarea></div>
        <div class="form-group"><label for="msImgs">画像（最大4枚）</label>
          <input type="file" class="form-input" id="msImgs" accept="image/*" multiple>
          ${existing.length ? `<div class="board-detail-gallery mt-2">${existing.map((u) => aspect16x9Html(u)).join('')}</div>` : ''}
          <p class="form-hint">新しく選ぶと、選んだ画像で置き換えます。1枚目がサムネイル、2〜4枚目は詳細で表示されます。</p></div>
        ${visibilitySelectHtml('msVisibility', post.visibility)}
        <div class="form-group"><label class="form-toggle"><input type="checkbox" id="msPublished"${post.isPublished !== false ? ' checked' : ''}><span class="toggle-track"></span><span class="toggle-label">公開する</span></label></div>

        <p id="msError" class="form-error mt-2" hidden></p>
        <button type="button" class="btn btn-primary btn-block" id="msSave">${hasPost ? '更新する' : '保存する'}</button>
        <p id="msSaved" class="community-saved mt-2" hidden>保存しました ✓</p>
      </section>
    `;

    const errEl = box.querySelector('#msError');
    const savedEl = box.querySelector('#msSaved');
    box.querySelector('#msSave').addEventListener('click', async () => {
      errEl.hidden = true; savedEl.hidden = true;
      const title = box.querySelector('#msTitle').value.trim();
      if (!title) { errEl.textContent = 'タイトルを入力してください。'; errEl.hidden = false; return; }
      const btn = box.querySelector('#msSave');
      btn.disabled = true; btn.textContent = '保存中…';
      try {
        const files = Array.from(box.querySelector('#msImgs').files || []).slice(0, 4);
        let imageURLs = post.imageURLs || [];
        if (files.length) {
          imageURLs = [];
          for (let i = 0; i < files.length; i++) {
            imageURLs.push(await uploadImage(user.uid, files[i], `mysekai-${i}.jpg`));
          }
        }
        const data = {
          authorUid: user.uid,
          authorPublicId: authorPublicId || '',
          authorName: box.querySelector('#msAuthor').value.trim() || title,
          title,
          body: box.querySelector('#msBody').value.trim(),
          imageURLs,
          isPublished: box.querySelector('#msPublished').checked,
          visibility: box.querySelector('#msVisibility').value === 'friends' ? 'friends' : 'public',
        };
        if (typeof post.likeCount === 'number') data.likeCount = post.likeCount;
        await saveDoc('boardMysekai', user.uid, data, !docExists);
        docExists = true;
        post = Object.assign(post, data);
        btn.textContent = '更新する';
        savedEl.hidden = false;
        if (typeof opts.onSaved === 'function') opts.onSaved(post);
        setTimeout(() => { savedEl.hidden = true; }, 2500);
      } catch (e) {
        errEl.textContent = e.message || String(e); errEl.hidden = false;
      } finally {
        btn.disabled = false;
        if (btn.textContent === '保存中…') btn.textContent = hasPost ? '更新する' : '保存する';
      }
    });

    return post;
  }

  // ---------- 共通保存 ----------

  async function saveDoc(collectionName, id, data, isNew) {
    const f = await fb();
    const { doc, setDoc, serverTimestamp } = f.dbFns;
    const payload = Object.assign({}, data, { updatedAt: serverTimestamp() });
    if (isNew) payload.createdAt = serverTimestamp();
    await setDoc(doc(f.db, collectionName, id), payload, { merge: true });
  }

  async function loadOwnHub(uid) {
    const f = await fb();
    const { doc, getDoc } = f.dbFns;
    try {
      const snap = await getDoc(doc(f.db, 'users', uid, 'sns', 'linkHub'));
      return snap.exists() ? snap.data() : null;
    } catch (e) { return null; }
  }

  return {
    initEventList, initEventDetail, initEventEdit, initMysekaiList, initMysekaiEdit,
    mountEventEditor, mountMysekaiEditor,
    fetchOwnEventAd, fetchOwnMysekai,
    listEventBookmarks, loadBookmarkedUids, toggleEventBookmark,
  };
})();

window.MiraiBoard = MiraiBoard;
