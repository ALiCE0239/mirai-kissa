/**
 * 未来喫茶 — 掲示板（イベラン広告 / マイセカイ宣伝）
 *
 * - #/board/event         イベラン広告 一覧・検索（閲覧のみ）
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

  function aspect16x9Html(url, emptyLabel) {
    if (url) {
      return `<div class="board-aspect-16x9"><img src="${esc(url)}" alt="" loading="lazy"></div>`;
    }
    if (emptyLabel) {
      return `<div class="board-aspect-16x9 board-aspect-16x9--empty">${esc(emptyLabel)}</div>`;
    }
    return '';
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

  async function initEventList() {
    const box = document.getElementById('app').querySelector('#boardEventRoot');
    if (!box) return;
    if (!(await isConfigured())) { box.innerHTML = notConfiguredHtml(); return; }

    box.innerHTML = `
      <div class="board-toolbar board-toolbar--view">
        <input type="search" class="form-input" id="boardEventSearch" placeholder="イベント名・条件で検索">
        <p class="form-hint board-toolbar__note">閲覧のみ。投稿・編集は<a href="#/mypage" data-link>マイページ</a>から行えます（1アカウント1件）。</p>
      </div>
      <div class="board-tags" id="boardEventTags"></div>
      <div id="boardEventList" class="board-list board-feed-wrap"><p class="text-muted">読み込み中…</p></div>
    `;

    const tagWrap = box.querySelector('#boardEventTags');
    let activeTag = '';
    tagWrap.innerHTML = ['', ...CONDITION_TAGS].map((t) =>
      `<button type="button" class="board-tag${t === '' ? ' is-active' : ''}" data-tag="${esc(t)}">${t === '' ? 'すべて' : esc(t)}</button>`
    ).join('');

    const { user: viewer, friendUids } = await loadViewerContext();
    let all = [];
    try {
      all = await fetchEventAds();
    } catch (e) {
      box.querySelector('#boardEventList').innerHTML = '<div class="info-box"><p>読み込みに失敗しました。</p></div>';
      console.error(e);
      return;
    }

    const listEl = box.querySelector('#boardEventList');
    const searchEl = box.querySelector('#boardEventSearch');

    function render() {
      const q = searchEl.value.trim().toLowerCase();
      const items = all.filter((p) => {
        if (!isPostVisible(p, viewer && viewer.uid, friendUids)) return false;
        if (activeTag && !(p.conditionTags || []).includes(activeTag)) return false;
        if (!q) return true;
        return [(p.eventName || ''), (p.body || ''), (p.authorName || ''), (p.eventBanner || '')]
          .some((s) => String(s).toLowerCase().includes(q));
      });
      listEl.innerHTML = items.length
        ? `<div class="board-feed">${items.map(eventCardHtml).join('')}</div>`
        : '<p class="text-muted board-empty">該当する広告はまだありません。</p>';
    }

    wireBoardFeed(listEl);
    searchEl.addEventListener('input', render);
    tagWrap.addEventListener('click', (e) => {
      const b = e.target.closest('.board-tag');
      if (!b) return;
      activeTag = b.dataset.tag;
      tagWrap.querySelectorAll('.board-tag').forEach((x) => x.classList.toggle('is-active', x === b));
      render();
    });
    render();
  }

  async function fetchEventAds() {
    const f = await fb();
    const { collection, query, orderBy, limit, getDocs } = f.dbFns;
    const snap = await getDocs(query(collection(f.db, 'boardEventAds'), orderBy('updatedAt', 'desc'), limit(PAGE_SIZE)));
    return snap.docs.map((d) => Object.assign({ authorUid: d.id }, d.data()));
  }

  function eventCardHtml(p) {
    const tags = (p.conditionTags || []).map((t) => `<span class="board-chip">${esc(t)}</span>`).join('');
    const rank = p.targetRank ? `<span class="board-meta-item">目標 ${esc(p.targetRank)}位</span>` : '';
    const banner = p.eventBanner ? `<span class="board-meta-item">${esc(p.eventBanner)}</span>` : '';
    const img = aspect16x9Html(p.imageURL);
    const hasDetail = !!(p.body || p.discordURL || p.runLocationURL);
    const discord = p.discordURL
      ? `<a class="btn btn-secondary btn-sm" href="${esc(normalizeUrl(p.discordURL))}" target="_blank" rel="noopener noreferrer">${esc(p.discordLabel || 'Discord')}</a>` : '';
    const run = p.runLocationURL
      ? `<a class="btn btn-secondary btn-sm" href="${esc(normalizeUrl(p.runLocationURL))}" target="_blank" rel="noopener noreferrer">周回場所</a>` : '';
    const detailBody = p.body ? `<p class="board-card__text">${esc(p.body)}</p>` : '';
    const detailActions = (discord || run) ? `<div class="board-card__actions">${discord}${run}</div>` : '';
    const detailPanel = hasDetail ? `
      <div class="board-detail-panel" hidden>
        ${detailBody}
        ${detailActions}
      </div>
      <button type="button" class="board-detail-toggle btn btn-secondary btn-sm btn-block" aria-expanded="false" data-open-label="詳細を見る" data-close-label="詳細を閉じる">詳細を見る</button>
    ` : (detailActions ? `<div class="board-card__actions">${discord}${run}</div>` : '');

    return `
      <article class="board-feed-card">
        ${img}
        <div class="board-feed-card__body">
          <h3 class="board-card__title">${esc(p.eventName || '(無題)')}${visibilityChipHtml(p)}</h3>
          <p class="board-card__author">${esc(p.authorName || '匿名')}</p>
          <div class="board-meta">${rank}${banner}</div>
          ${tags ? `<div class="board-chips">${tags}</div>` : ''}
          ${detailPanel}
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
    if (!authorName) {
      const hub = await loadOwnHub(user.uid);
      if (hub) { authorName = hub.displayName || ''; authorPublicId = hub.publicId || ''; }
    }

    const hasPost = !!(post && post.eventName);
    post = post || {
      authorUid: user.uid, authorPublicId, authorName,
      eventName: '', body: '', imageURL: '', conditionTags: [], targetRank: null,
      eventBanner: '', discordURL: '', discordLabel: 'Discord', runLocationURL: '', isPublished: true,
      visibility: 'public',
    };

    const tagChecks = CONDITION_TAGS.map((t) => `
      <label class="board-check"><input type="checkbox" value="${esc(t)}"${(post.conditionTags || []).includes(t) ? ' checked' : ''}><span>${esc(t)}</span></label>
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
          <div class="form-group"><label for="evBanner">対象バナー/キャラ</label>
            <input type="text" class="form-input" id="evBanner" maxlength="30" value="${esc(post.eventBanner)}" placeholder="例: 一歌"></div>
        </div>
        <div class="form-group"><label>条件タグ</label><div class="board-checks" id="evTags">${tagChecks}</div></div>
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
    box.querySelector('#evSave').addEventListener('click', async () => {
      errEl.hidden = true; savedEl.hidden = true;
      const name = box.querySelector('#evName').value.trim();
      if (!name) { errEl.textContent = 'イベント名を入力してください。'; errEl.hidden = false; return; }
      const btn = box.querySelector('#evSave');
      btn.disabled = true; btn.textContent = '保存中…';
      try {
        const rankVal = box.querySelector('#evRank').value;
        const tags = Array.from(box.querySelectorAll('#evTags input:checked')).map((i) => i.value);
        const fileInput = box.querySelector('#evImg');
        let imageURL = post.imageURL || '';
        if (fileInput.files && fileInput.files[0]) {
          imageURL = await uploadImage(user.uid, fileInput.files[0], 'event-banner.jpg');
        }
        const data = {
          authorUid: user.uid,
          authorPublicId: authorPublicId || '',
          authorName: box.querySelector('#evAuthor').value.trim() || name,
          eventName: name,
          body: box.querySelector('#evBody').value.trim(),
          imageURL: imageURL || null,
          conditionTags: tags,
          targetRank: rankVal ? parseInt(rankVal, 10) : null,
          eventBanner: box.querySelector('#evBanner').value.trim(),
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
    catch (e) { box.querySelector('#boardMysekaiList').innerHTML = '<div class="info-box"><p>読み込みに失敗しました。</p></div>'; console.error(e); return; }

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
    const f = await fb();
    const { collection, query, orderBy, limit, getDocs } = f.dbFns;
    const snap = await getDocs(query(collection(f.db, 'boardMysekai'), orderBy('updatedAt', 'desc'), limit(PAGE_SIZE)));
    return snap.docs.map((d) => Object.assign({ authorUid: d.id }, d.data()));
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
    initEventList, initEventEdit, initMysekaiList, initMysekaiEdit,
    mountEventEditor, mountMysekaiEditor,
    fetchOwnEventAd, fetchOwnMysekai,
  };
})();

window.MiraiBoard = MiraiBoard;
