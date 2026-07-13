/**
 * 未来喫茶 — 掲示板（イベラン広告 / マイセカイ宣伝）
 *
 * - #/board/event         イベラン広告 一覧・検索
 * - #/board/event/edit    自分のイベラン広告 作成/編集（要ログイン）
 * - #/board/mysekai       マイセカイ宣伝 一覧・いいね
 * - #/board/mysekai/edit  自分のマイセカイ宣伝 作成/編集（要ログイン）
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

  async function fb() {
    return window.MiraiFirebaseReady ? await window.MiraiFirebaseReady : null;
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
    if (!window.MiraiAuth || !window.MiraiAuth.isConfigured()) { box.innerHTML = notConfiguredHtml(); return; }

    box.innerHTML = `
      <div class="board-toolbar">
        <input type="search" class="form-input" id="boardEventSearch" placeholder="イベント名・条件で検索">
        <a href="#/board/event/edit" class="btn btn-primary" data-link>広告を出す</a>
      </div>
      <div class="board-tags" id="boardEventTags"></div>
      <div id="boardEventList" class="board-list"><p class="text-muted">読み込み中…</p></div>
    `;

    const tagWrap = box.querySelector('#boardEventTags');
    let activeTag = '';
    tagWrap.innerHTML = ['', ...CONDITION_TAGS].map((t) =>
      `<button type="button" class="board-tag${t === '' ? ' is-active' : ''}" data-tag="${esc(t)}">${t === '' ? 'すべて' : esc(t)}</button>`
    ).join('');

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
        if (p.isPublished === false) return false;
        if (activeTag && !(p.conditionTags || []).includes(activeTag)) return false;
        if (!q) return true;
        return [(p.eventName || ''), (p.body || ''), (p.authorName || ''), (p.eventBanner || '')]
          .some((s) => String(s).toLowerCase().includes(q));
      });
      listEl.innerHTML = items.length
        ? items.map(eventCardHtml).join('')
        : '<p class="text-muted board-empty">該当する広告はまだありません。</p>';
    }

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
    return snap.docs.map((d) => d.data());
  }

  function eventCardHtml(p) {
    const tags = (p.conditionTags || []).map((t) => `<span class="board-chip">${esc(t)}</span>`).join('');
    const rank = p.targetRank ? `<span class="board-meta-item">目標 ${esc(p.targetRank)}位</span>` : '';
    const banner = p.eventBanner ? `<span class="board-meta-item">${esc(p.eventBanner)}</span>` : '';
    const img = p.imageURL ? `<img class="board-card__img" src="${esc(p.imageURL)}" alt="" loading="lazy">` : '';
    const discord = p.discordURL
      ? `<a class="btn btn-secondary btn-sm" href="${esc(normalizeUrl(p.discordURL))}" target="_blank" rel="noopener noreferrer">${esc(p.discordLabel || 'Discord')}</a>` : '';
    const run = p.runLocationURL
      ? `<a class="btn btn-secondary btn-sm" href="${esc(normalizeUrl(p.runLocationURL))}" target="_blank" rel="noopener noreferrer">周回場所</a>` : '';
    return `
      <article class="card board-card">
        ${img}
        <div class="board-card__body">
          <h3 class="board-card__title">${esc(p.eventName || '(無題)')}</h3>
          <p class="board-card__author">${esc(p.authorName || '匿名')}</p>
          <div class="board-meta">${rank}${banner}</div>
          ${tags ? `<div class="board-chips">${tags}</div>` : ''}
          ${p.body ? `<p class="board-card__text">${esc(p.body)}</p>` : ''}
          <div class="board-card__actions">${discord}${run}</div>
        </div>
      </article>
    `;
  }

  async function initEventEdit() {
    const box = document.getElementById('app').querySelector('#boardEventEditRoot');
    if (!box) return;
    if (!window.MiraiAuth || !window.MiraiAuth.isConfigured()) { box.innerHTML = notConfiguredHtml(); return; }
    box.innerHTML = '<p class="text-muted">読み込み中…</p>';

    const user = await requireUser(box);
    if (!user) return;

    const f = await fb();
    const { doc, getDoc } = f.dbFns;
    let post = null;
    try {
      const snap = await getDoc(doc(f.db, 'boardEventAds', user.uid));
      post = snap.exists() ? snap.data() : null;
    } catch (e) { console.error(e); }

    let authorName = post && post.authorName ? post.authorName : '';
    let authorPublicId = post && post.authorPublicId ? post.authorPublicId : '';
    if (!authorName) {
      const hub = await loadOwnHub(user.uid);
      if (hub) { authorName = hub.displayName || ''; authorPublicId = hub.publicId || ''; }
    }

    post = post || {
      authorUid: user.uid, authorPublicId, authorName,
      eventName: '', body: '', imageURL: '', conditionTags: [], targetRank: null,
      eventBanner: '', discordURL: '', discordLabel: 'Discord', runLocationURL: '', isPublished: true,
    };

    const tagChecks = CONDITION_TAGS.map((t) => `
      <label class="board-check"><input type="checkbox" value="${esc(t)}"${(post.conditionTags || []).includes(t) ? ' checked' : ''}><span>${esc(t)}</span></label>
    `).join('');
    const rankOpts = ['<option value="">指定なし</option>']
      .concat(TARGET_RANKS.map((r) => `<option value="${r}"${post.targetRank === r ? ' selected' : ''}>${r}位</option>`)).join('');

    box.innerHTML = `
      <section class="card community-editor">
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
          ${post.imageURL ? `<img class="board-card__img mt-2" src="${esc(post.imageURL)}" alt="" style="max-height:160px">` : ''}</div>
        <div class="form-group"><label class="form-toggle"><input type="checkbox" id="evPublished"${post.isPublished !== false ? ' checked' : ''}><span class="toggle-track"></span><span class="toggle-label">公開する</span></label></div>

        <p id="evError" class="form-error mt-2" hidden></p>
        <div class="board-edit-actions">
          <a href="#/board/event" class="btn btn-secondary" data-link>一覧へ</a>
          <button type="button" class="btn btn-primary" id="evSave">保存する</button>
        </div>
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
        };
        await saveDoc('boardEventAds', user.uid, data, !post.createdAt);
        post = Object.assign(post, data);
        savedEl.hidden = false;
        setTimeout(() => { savedEl.hidden = true; }, 2500);
      } catch (e) {
        errEl.textContent = e.message || String(e); errEl.hidden = false;
      } finally {
        btn.disabled = false; btn.textContent = '保存する';
      }
    });
  }

  // ========================================================
  // マイセカイ宣伝
  // ========================================================

  async function initMysekaiList() {
    const box = document.getElementById('app').querySelector('#boardMysekaiRoot');
    if (!box) return;
    if (!window.MiraiAuth || !window.MiraiAuth.isConfigured()) { box.innerHTML = notConfiguredHtml(); return; }

    box.innerHTML = `
      <div class="board-toolbar">
        <p class="text-muted board-toolbar__note">マイセカイの百景を宣伝しよう</p>
        <a href="#/board/mysekai/edit" class="btn btn-primary" data-link>宣伝を出す</a>
      </div>
      <div id="boardMysekaiList" class="board-list board-list--mysekai"><p class="text-muted">読み込み中…</p></div>
    `;

    let all = [];
    try { all = await fetchMysekai(); }
    catch (e) { box.querySelector('#boardMysekaiList').innerHTML = '<div class="info-box"><p>読み込みに失敗しました。</p></div>'; console.error(e); return; }

    const listEl = box.querySelector('#boardMysekaiList');
    listEl.innerHTML = all.filter((p) => p.isPublished !== false).length
      ? all.filter((p) => p.isPublished !== false).map(mysekaiCardHtml).join('')
      : '<p class="text-muted board-empty">宣伝はまだありません。</p>';

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
    return snap.docs.map((d) => d.data());
  }

  function mysekaiCardHtml(p) {
    const imgs = (p.imageURLs || []).slice(0, 4);
    const imgHtml = imgs.length
      ? `<div class="board-gallery board-gallery--${imgs.length}">${imgs.map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join('')}</div>`
      : '';
    return `
      <article class="card board-card board-card--mysekai">
        ${imgHtml}
        <div class="board-card__body">
          <h3 class="board-card__title">${esc(p.title || '(無題)')}</h3>
          <p class="board-card__author">${esc(p.authorName || '匿名')}</p>
          ${p.body ? `<p class="board-card__text">${esc(p.body)}</p>` : ''}
          <div class="board-card__actions">
            <button type="button" class="board-like" data-uid="${esc(p.authorUid)}">
              <span aria-hidden="true">♥</span> <span class="board-like__count">${esc(p.likeCount || 0)}</span>
            </button>
          </div>
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
    if (!window.MiraiAuth || !window.MiraiAuth.isConfigured()) { box.innerHTML = notConfiguredHtml(); return; }
    box.innerHTML = '<p class="text-muted">読み込み中…</p>';

    const user = await requireUser(box);
    if (!user) return;

    const f = await fb();
    const { doc, getDoc } = f.dbFns;
    let post = null;
    try {
      const snap = await getDoc(doc(f.db, 'boardMysekai', user.uid));
      post = snap.exists() ? snap.data() : null;
    } catch (e) { console.error(e); }

    let authorName = post && post.authorName ? post.authorName : '';
    let authorPublicId = post && post.authorPublicId ? post.authorPublicId : '';
    if (!authorName) {
      const hub = await loadOwnHub(user.uid);
      if (hub) { authorName = hub.displayName || ''; authorPublicId = hub.publicId || ''; }
    }

    post = post || {
      authorUid: user.uid, authorPublicId, authorName,
      title: '', body: '', imageURLs: [], likeCount: 0, isPublished: true,
    };

    const existing = (post.imageURLs || []).slice(0, 4);
    box.innerHTML = `
      <section class="card community-editor">
        <div class="form-group"><label for="msTitle">タイトル</label>
          <input type="text" class="form-input" id="msTitle" maxlength="60" value="${esc(post.title)}" placeholder="例: 和風庭園の百景"></div>
        <div class="form-group"><label for="msAuthor">表示名</label>
          <input type="text" class="form-input" id="msAuthor" maxlength="30" value="${esc(authorName)}"></div>
        <div class="form-group"><label for="msBody">紹介文</label>
          <textarea class="form-input" id="msBody" rows="4" maxlength="500" placeholder="こだわりポイントなど">${esc(post.body)}</textarea></div>
        <div class="form-group"><label for="msImgs">画像（最大4枚）</label>
          <input type="file" class="form-input" id="msImgs" accept="image/*" multiple>
          ${existing.length ? `<div class="board-gallery mt-2 board-gallery--${existing.length}">${existing.map((u) => `<img src="${esc(u)}" alt="">`).join('')}</div>` : ''}
          <p class="form-hint">新しく選ぶと、選んだ画像で置き換えます。</p></div>
        <div class="form-group"><label class="form-toggle"><input type="checkbox" id="msPublished"${post.isPublished !== false ? ' checked' : ''}><span class="toggle-track"></span><span class="toggle-label">公開する</span></label></div>

        <p id="msError" class="form-error mt-2" hidden></p>
        <div class="board-edit-actions">
          <a href="#/board/mysekai" class="btn btn-secondary" data-link>一覧へ</a>
          <button type="button" class="btn btn-primary" id="msSave">保存する</button>
        </div>
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
        };
        if (typeof post.likeCount === 'number') data.likeCount = post.likeCount;
        await saveDoc('boardMysekai', user.uid, data, !post.createdAt);
        post = Object.assign(post, data);
        savedEl.hidden = false;
        setTimeout(() => { savedEl.hidden = true; }, 2500);
      } catch (e) {
        errEl.textContent = e.message || String(e); errEl.hidden = false;
      } finally {
        btn.disabled = false; btn.textContent = '保存する';
      }
    });
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

  return { initEventList, initEventEdit, initMysekaiList, initMysekaiEdit };
})();

window.MiraiBoard = MiraiBoard;
