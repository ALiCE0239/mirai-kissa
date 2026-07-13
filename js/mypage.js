/**
 * 未来喫茶 — セカイノート（リトリン風リンク + 自分の記事 / linkHubs）
 *
 * - #/login          ログイン画面（X / Google）
 * - #/mypage         マイページ（要ログイン）
 * - #/mypage/sekainote     セカイノート編集（要ログイン）
 * - #/mypage/profile-card  プロフィールカード作成（要ログイン）
 * - #/sekainote/read       セカイノート読み取り（公開）
 * - #/p/:id          公開セカイノート（誰でも閲覧）
 *
 * データ構造はアプリの LinkHubDocument に準拠 + notes[] で記事。
 *   linkHubs/{publicId}            … 公開用（誰でも閲覧）
 *   users/{uid}/sns/linkHub        … 本人用ミラー
 */
const MiraiMyPage = (function () {
  'use strict';

  // アプリの CardTheme と同じ配色（gradient 2色）
  const THEMES = {
    green:   { name: 'グリーン',   colors: ['#c7f2d9', '#9ed9bf'] },
    blue:    { name: 'ブルー',     colors: ['#ccdcff', '#ebdcff'] },
    pinkRed: { name: 'ピンクレッド', colors: ['#ffdce6', '#ffb8c7'] },
    purple:  { name: 'パープル',   colors: ['#e6d6ff', '#c2b3fa'] },
    yellow:  { name: 'イエロー',   colors: ['#fff5cc', '#ffe699'] },
    emerald: { name: 'エメラルド', colors: ['#d6faf0', '#a6f0dc'] },
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function newPublicId() {
    const uuid = (crypto.randomUUID && crypto.randomUUID()) ||
      String(Date.now()) + Math.random().toString(16).slice(2);
    return uuid.replace(/-/g, '').slice(0, 8).toLowerCase();
  }

  function normalizeUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return 'https://' + u;
  }

  function themeStyle(themeKey) {
    const t = THEMES[themeKey] || THEMES.blue;
    return `background: linear-gradient(135deg, ${t.colors[0]}, ${t.colors[1]});`;
  }

  function initial(name) {
    const n = String(name || '').trim();
    return n ? n.slice(0, 1) : '☕';
  }

  // ---------- Firebase helpers ----------

  async function fb() {
    return window.MiraiFirebaseReady ? await window.MiraiFirebaseReady : null;
  }

  async function isConfigured() {
    const f = await fb();
    return !!(f && f.configured);
  }

  async function loadHub(publicId) {
    const f = await fb();
    if (!f || !f.configured) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, 'linkHubs', publicId));
    return snap.exists() ? snap.data() : null;
  }

  async function loadOwnHub(uid) {
    const f = await fb();
    if (!f || !f.configured) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, 'users', uid, 'sns', 'linkHub'));
    return snap.exists() ? snap.data() : null;
  }

  function avatarHtml(hub, className) {
    const cls = 'linkhub-avatar' + (className ? ' ' + className : '');
    if (hub.avatarURL) {
      return `<div class="${cls} linkhub-avatar--img"><img src="${esc(hub.avatarURL)}" alt="" decoding="async"></div>`;
    }
    return `<div class="${cls}">${esc(initial(hub.displayName))}</div>`;
  }

  async function uploadAvatar(uid, file) {
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) throw new Error('画像は2MB以下にしてください。');
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
      throw new Error('JPEG / PNG / WebP / GIF の画像を選んでください。');
    }
    const ext = file.type === 'image/png' ? 'png'
      : file.type === 'image/webp' ? 'webp'
      : file.type === 'image/gif' ? 'gif' : 'jpg';
    const { ref, uploadBytes, getDownloadURL } = f.storageFns;
    const r = ref(f.storage, `users/${uid}/avatar.${ext}`);
    await uploadBytes(r, file);
    return getDownloadURL(r);
  }

  async function saveHub(uid, hub) {
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const { doc, setDoc, serverTimestamp } = f.dbFns;
    const data = Object.assign({}, hub, { uid, updatedAt: serverTimestamp() });
    await setDoc(doc(f.db, 'linkHubs', data.publicId), data, { merge: true });
    await setDoc(doc(f.db, 'users', uid, 'sns', 'linkHub'), data, { merge: true });
    return data;
  }

  // ================= ログイン画面 =================

  async function initLogin() {
    const root = document.getElementById('app');
    const box = root.querySelector('#loginBox');
    if (!box) return;

    const configured = await isConfigured();

    if (!configured) {
      box.innerHTML =
        '<div class="info-box">' +
        '<p><strong>ログイン機能は準備中です。</strong></p>' +
        '<p class="mt-1">サイト管理者が Firebase の設定（<code>js/firebase-config.js</code>）を行うと有効になります。手順は <code>data/Firebase設定手順.txt</code> を参照してください。</p>' +
        '</div>';
      return;
    }

    // 既にログイン済みなら元のページへ
    if (window.MiraiAuth.getUser()) {
      location.hash = window.MiraiAuth.consumeLoginReturn('#/mypage');
      return;
    }

    box.innerHTML =
      '<p class="text-muted community-login__lead">ログインすると、セカイノートからプロフィール・イベラン広告・マイセカイ宣伝を編集できます。</p>' +
      '<button type="button" class="btn community-btn-x btn-block" id="loginX">𝕏 でログイン / 登録</button>' +
      '<button type="button" class="btn btn-secondary btn-block mt-2" id="loginGoogle">Google でログイン</button>' +
      '<p id="loginError" class="form-error mt-3" hidden></p>' +
      '<p class="form-hint mt-3">初めての方は自動で新規登録されます。</p>';

    const errEl = box.querySelector('#loginError');
    const showErr = (msg) => { errEl.textContent = msg; errEl.hidden = false; };

    const run = async (fn) => {
      errEl.hidden = true;
      try {
        const user = await fn();
        if (user) location.hash = window.MiraiAuth.consumeLoginReturn('#/mypage');
      } catch (e) {
        showErr(e.message || String(e));
      }
    };

    box.querySelector('#loginX').addEventListener('click', () => run(() => window.MiraiAuth.signInWithX()));
    box.querySelector('#loginGoogle').addEventListener('click', () => run(() => window.MiraiAuth.signInWithGoogle()));

    // ログイン状態が変わったら自動遷移
    const off = window.MiraiAuth.onChange((user) => {
      if (user && location.hash === '#/login') {
        location.hash = window.MiraiAuth.consumeLoginReturn('#/mypage');
      }
    });
    // 画面を離れたら解除
    window.addEventListener('hashchange', function h() {
      if (location.hash !== '#/login') { off(); window.removeEventListener('hashchange', h); }
    });
  }

  // ================= マイページ編集 =================

  async function initMyPage() {
    const root = document.getElementById('app');
    const box = root.querySelector('#myPageRoot');
    if (!box) return;

    const configured = await isConfigured();
    if (!configured) {
      box.innerHTML =
        '<div class="info-box"><p><strong>ログイン機能は準備中です。</strong></p>' +
        '<p class="mt-1">Firebase の設定後に利用できます。</p></div>';
      return;
    }

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';

    const user = await resolveAuthUser();
    if (!user) {
      box.innerHTML =
        '<div class="info-box"><p>マイページの編集にはログインが必要です。</p>' +
        '<p class="mt-2"><a href="#/login" class="btn btn-primary" data-link>ログインする</a></p></div>';
      return;
    }

    const { hub, hubExisted } = await prepareHub(user);

    let sekaiSaved = hubExisted;
    if (!hubExisted) {
      try {
        await saveHub(user.uid, hub);
      } catch (e) {
        console.error(e);
      }
    }

    renderDashboard(box, user, hub, sekaiSaved);
    loadBoardSummaries(box, user);
  }

  async function initSekaiNoteEdit() {
    const root = document.getElementById('app');
    const box = root.querySelector('#sekaiNoteEditRoot');
    if (!box) return;

    if (!(await isConfigured())) {
      box.innerHTML =
        '<div class="info-box"><p><strong>ログイン機能は準備中です。</strong></p>' +
        '<p class="mt-1">Firebase の設定後に利用できます。</p></div>';
      return;
    }

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';

    const user = await resolveAuthUser();
    if (!user) {
      box.innerHTML =
        '<div class="info-box"><p>セカイノートの編集にはログインが必要です。</p>' +
        '<p class="mt-2"><a href="#/login" class="btn btn-primary" data-link>ログインする</a></p></div>';
      return;
    }

    const { hub, hubExisted } = await prepareHub(user);
    renderSekaiEditor(box, user, hub, hubExisted);
  }

  async function resolveAuthUser() {
    await window.MiraiFirebaseReady;
    let user = window.MiraiAuth.getUser();
    if (!user) {
      user = await new Promise((resolve) => {
        let done = false;
        const off = window.MiraiAuth.onChange((u) => {
          if (done) return;
          done = true; off(); resolve(u);
        });
        setTimeout(() => { if (!done) { done = true; off(); resolve(window.MiraiAuth.getUser()); } }, 2500);
      });
    }
    return user;
  }

  async function prepareHub(user) {
    let hub = await loadOwnHub(user.uid);
    const hubExisted = !!hub;
    if (!hub) {
      hub = {
        uid: user.uid,
        publicId: newPublicId(),
        displayName: '',
        headline: '',
        bio: '',
        avatarURL: '',
        links: [],
        highlights: [],
        pinEventAd: false,
        pinMysekai: false,
        theme: 'blue',
        blocks: [],
        notes: [],
      };
      const x = window.MiraiAuth.getStoredXHandle();
      if (x) {
        hub.links.push({ id: newPublicId(), title: 'X', url: 'https://x.com/' + x, emoji: '𝕏' });
      }
    }
    hub.links = Array.isArray(hub.links) ? hub.links : [];
    hub.notes = Array.isArray(hub.notes) ? hub.notes : [];
    return { hub, hubExisted };
  }

  function normalizeNotes(notes) {
    return notes.map((n) => ({
      id: n.id || newPublicId(),
      title: String(n.title || '').trim(),
      body: String(n.body || '').trim(),
      isPublished: n.isPublished !== false,
      updatedAt: n.updatedAt || '',
    }));
  }

  function sekaiSummaryText(hub, hubExisted) {
    if (!hubExisted && !(hub.links && hub.links.length) && !(hub.notes && hub.notes.length)) {
      return '未作成 — 「セカイノートを作成」から作り始められます';
    }
    const parts = [];
    if (hub.links && hub.links.length) parts.push('リンク ' + hub.links.length + '件');
    if (hub.notes && hub.notes.length) parts.push('記事 ' + hub.notes.length + '件');
    const themeName = (THEMES[hub.theme] || THEMES.blue).name;
    parts.push('テーマ: ' + themeName);
    return parts.join(' · ');
  }

  function renderDashboard(box, user, hub, hubExisted) {
    box.innerHTML = `
      <section class="card community-editor mp-page">
        <h2 class="community-editor__title">マイページ</h2>
        <p class="text-muted mp-editor-lead">プロフィールと掲示板投稿を管理できます</p>

        <div class="mp-profile-summary">
          <div class="mp-profile-summary__main">
            <div id="mpProfileAvatarPreview">${avatarHtml(hub, 'linkhub-avatar--sm')}</div>
            <div class="mp-profile-summary__text">
              <p class="mp-profile-summary__name" id="mpProfileNamePreview">${esc(hub.displayName || '未設定')}</p>
              <p class="mp-profile-summary__headline" id="mpProfileHeadlinePreview">${esc(hub.headline || '一言未設定')}</p>
            </div>
          </div>
          <button type="button" class="btn btn-secondary" id="mpProfileToggle" aria-expanded="false" aria-controls="mpProfilePanel">マイページ設定</button>
        </div>

        <div id="mpProfilePanel" class="mp-profile-panel" hidden>
          <div class="form-group mp-avatar-field">
            <label>アイコン画像</label>
            <div class="mp-avatar-upload">
              <div id="mpAvatarEditPreview">${avatarHtml(hub, 'linkhub-avatar--sm')}</div>
              <div class="mp-avatar-upload__actions">
                <label class="btn btn-secondary btn-sm mp-avatar-upload__pick">
                  画像を選ぶ
                  <input type="file" id="mpAvatarFile" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
                </label>
                <button type="button" class="btn btn-secondary btn-sm" id="mpAvatarClear"${hub.avatarURL ? '' : ' hidden'}>削除</button>
              </div>
              <p class="form-hint">JPEG / PNG / WebP / GIF・2MBまで</p>
            </div>
          </div>
          <div class="form-group">
            <label for="mpName">表示名</label>
            <input type="text" class="form-input" id="mpName" maxlength="30" value="${esc(hub.displayName)}" placeholder="例: みくちゃん">
          </div>
          <div class="form-group">
            <label for="mpHeadline">一言</label>
            <input type="text" class="form-input" id="mpHeadline" maxlength="40" value="${esc(hub.headline)}" placeholder="例: 25時、ナイトコードで。推し">
          </div>
          <div class="form-group">
            <label for="mpBio">自己紹介</label>
            <textarea class="form-input" id="mpBio" rows="3" maxlength="200" placeholder="プロフィールや活動内容など">${esc(hub.bio)}</textarea>
          </div>
          <button type="button" class="btn btn-primary btn-block" id="mpProfileSave">マイページ設定を保存</button>
          <p id="mpProfileError" class="form-error mt-2" hidden></p>
          <p id="mpProfileSaved" class="community-saved mt-2" hidden>保存しました ✓</p>
        </div>

        <div class="divider"></div>

        <section class="mp-id-section card">
          <p class="adjust-filters__title">🪪 あなたのID</p>
          <p class="form-hint">このIDとQRコードで、他の人があなたのセカイノートを読み取れます</p>
          <div class="mp-id-row">
            <code class="mp-id-code" id="mpPublicId">${esc(hub.publicId)}</code>
            <button type="button" class="btn btn-secondary btn-sm" id="mpCopyId">IDをコピー</button>
          </div>
          <div class="mp-id-qr-wrap">
            <div id="mpQrCode" class="mp-qr" aria-label="セカイノートQRコード"></div>
          </div>
          <p class="form-hint mp-id-url"><a href="#/p/${esc(hub.publicId)}" data-link>公開ページを開く</a></p>
        </section>

        <div class="divider"></div>

        <div class="mp-sekai-entry">
          <div class="mp-sekai-entry__head">
            <div>
              <p class="adjust-filters__title">💳 プロフィールカード</p>
              <p class="mp-board-summary text-muted">名刺サイズのプロフィールカードを作成できます</p>
            </div>
            <a href="#/mypage/profile-card" class="btn btn-secondary" data-link>プロフィールカードを作成</a>
          </div>
        </div>

        <div class="divider"></div>

        <div class="mp-sekai-entry">
          <div class="mp-sekai-entry__head">
            <div>
              <p class="adjust-filters__title">📓 セカイノート</p>
              <p id="mpSekaiSummary" class="mp-board-summary text-muted">${esc(sekaiSummaryText(hub, hubExisted))}</p>
            </div>
            <a href="#/mypage/sekainote" class="btn btn-primary" data-link id="mpSekaiBtn">${hubExisted ? 'セカイノートを編集' : 'セカイノートを作成'}</a>
          </div>
        </div>

        <div class="divider"></div>

        <section class="mp-friends-section">
          <p class="adjust-filters__title">👥 フレンド</p>
          <p class="form-hint">フレンド申請の確認と、フレンドのセカイノートへのリンク</p>
          <div class="mp-friends-actions">
            <div class="mp-friends-btn-wrap">
              <button type="button" class="btn btn-secondary" id="mpFriendRequestsToggle" aria-expanded="false" aria-controls="mpFriendRequestsPanel">フレンド申請</button>
              <span id="mpFriendRequestBadge" class="mp-friend-notify-badge" hidden aria-label="未確認のフレンド申請"></span>
            </div>
            <button type="button" class="btn btn-secondary" id="mpFriendsListToggle" aria-expanded="false" aria-controls="mpFriendsListPanel">フレンド一覧</button>
          </div>
          <div id="mpFriendRequestsPanel" class="mp-friends-panel" hidden>
            <div id="mpFriendRequests" class="mp-friend-requests"></div>
          </div>
          <div id="mpFriendsListPanel" class="mp-friends-panel" hidden>
            <div id="mpFriendsList" class="mp-friends-list"></div>
          </div>
        </section>

        <div class="divider"></div>
        <div class="mp-board-block">
          <div class="community-links-head">
            <p class="adjust-filters__title">📣 イベラン広告</p>
            <a href="#/board/event/edit" class="btn btn-secondary btn-sm" data-link id="mpEventBtn">作成する</a>
          </div>
          <p id="mpEventSummary" class="mp-board-summary text-muted">読み込み中…</p>
          <p class="form-hint"><a href="#/board/event" data-link>掲示板で見る</a> · 1アカウント1件</p>
        </div>

        <div class="divider"></div>
        <div class="mp-board-block">
          <div class="community-links-head">
            <p class="adjust-filters__title">🌿 マイセカイ宣伝</p>
            <a href="#/board/mysekai/edit" class="btn btn-secondary btn-sm" data-link id="mpMysekaiBtn">作成する</a>
          </div>
          <p id="mpMysekaiSummary" class="mp-board-summary text-muted">読み込み中…</p>
          <p class="form-hint"><a href="#/board/mysekai" data-link>掲示板で見る</a> · 1アカウント1件</p>
        </div>

        <button type="button" class="btn btn-secondary btn-block mt-3" id="mpLogout">ログアウト</button>
      </section>
    `;

    const profilePanel = box.querySelector('#mpProfilePanel');
    const profileToggle = box.querySelector('#mpProfileToggle');
    let pendingAvatarFile = null;
    let avatarObjectUrl = null;

    function readProfileForm() {
      hub.displayName = box.querySelector('#mpName').value.trim();
      hub.headline = box.querySelector('#mpHeadline').value.trim();
      hub.bio = box.querySelector('#mpBio').value.trim();
    }

    function renderProfileSummary() {
      const view = Object.assign({}, hub);
      if (avatarObjectUrl) view.avatarURL = avatarObjectUrl;
      box.querySelector('#mpProfileAvatarPreview').innerHTML = avatarHtml(view, 'linkhub-avatar--sm');
      box.querySelector('#mpAvatarEditPreview').innerHTML = avatarHtml(view, 'linkhub-avatar--sm');
      box.querySelector('#mpProfileNamePreview').textContent = hub.displayName || '未設定';
      box.querySelector('#mpProfileHeadlinePreview').textContent = hub.headline || '一言未設定';
      box.querySelector('#mpAvatarClear').hidden = !(hub.avatarURL || pendingAvatarFile);
    }

    profileToggle.addEventListener('click', () => {
      const open = profilePanel.hidden;
      profilePanel.hidden = !open;
      profileToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      profileToggle.textContent = open ? 'マイページ設定を閉じる' : 'マイページ設定';
    });

    ['#mpName', '#mpHeadline', '#mpBio'].forEach((sel) => {
      box.querySelector(sel).addEventListener('input', () => { readProfileForm(); renderProfileSummary(); });
    });

    box.querySelector('#mpAvatarFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
      pendingAvatarFile = file;
      avatarObjectUrl = URL.createObjectURL(file);
      renderProfileSummary();
    });

    box.querySelector('#mpAvatarClear').addEventListener('click', () => {
      if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
      avatarObjectUrl = null;
      pendingAvatarFile = null;
      hub.avatarURL = '';
      box.querySelector('#mpAvatarFile').value = '';
      renderProfileSummary();
    });

    const profileSavedEl = box.querySelector('#mpProfileSaved');
    const profileErrEl = box.querySelector('#mpProfileError');
    box.querySelector('#mpProfileSave').addEventListener('click', async () => {
      readProfileForm();
      profileErrEl.hidden = true;
      profileSavedEl.hidden = true;
      if (!hub.displayName) {
        profileErrEl.textContent = '表示名を入力してください。';
        profileErrEl.hidden = false;
        return;
      }
      const btn = box.querySelector('#mpProfileSave');
      btn.disabled = true;
      btn.textContent = '保存中…';
      try {
        if (pendingAvatarFile) {
          hub.avatarURL = await uploadAvatar(user.uid, pendingAvatarFile);
          if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
          avatarObjectUrl = null;
          pendingAvatarFile = null;
          box.querySelector('#mpAvatarFile').value = '';
        }
        await saveHub(user.uid, hub);
        profileSavedEl.hidden = false;
        renderProfileSummary();
        const sekaiSummary = box.querySelector('#mpSekaiSummary');
        const sekaiBtn = box.querySelector('#mpSekaiBtn');
        if (sekaiSummary) sekaiSummary.textContent = sekaiSummaryText(hub, true);
        if (sekaiBtn) sekaiBtn.textContent = 'セカイノートを編集';
        setTimeout(() => { profileSavedEl.hidden = true; }, 2500);
      } catch (e) {
        profileErrEl.textContent = e.message || String(e);
        profileErrEl.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = 'マイページ設定を保存';
      }
    });

    box.querySelector('#mpLogout').addEventListener('click', async () => {
      await window.MiraiAuth.signOut();
      location.hash = '#/';
    });

    box.querySelector('#mpCopyId').addEventListener('click', () => {
      const id = hub.publicId;
      try { navigator.clipboard.writeText(id); } catch (e) { document.execCommand('copy'); }
      const btn = box.querySelector('#mpCopyId');
      const t = btn.textContent;
      btn.textContent = 'コピー済';
      setTimeout(() => { btn.textContent = t; }, 1200);
    });

    if (window.MiraiQr) {
      MiraiQr.render(box.querySelector('#mpQrCode'), MiraiQr.publicPageUrl(hub.publicId), 120).catch(console.error);
    }

    if (window.MiraiFriends) {
      MiraiFriends.initMypageFriends(box, user);
    }
  }

  function renderSekaiEditor(box, user, hub, hubExisted) {
    let sekaiSaved = hubExisted;

    box.innerHTML = `
      <div class="mp-sekai-page">
        ${!hub.displayName ? '<div class="info-box mb-2"><p>公開前に<a href="#/mypage" data-link>マイページ</a>で表示名を設定してください。</p></div>' : ''}
        <p class="form-hint mp-sekai-lead">テーマカラー・リンク・記事を設定して、公開ページを作れます</p>
        <div class="mp-sekai-grid">
          <div class="mp-sekai-editor card community-editor">
            <div class="form-group">
              <label for="mpTheme">テーマカラー</label>
              <select class="form-select" id="mpTheme">${Object.keys(THEMES)
                .map((k) => `<option value="${k}"${hub.theme === k ? ' selected' : ''}>${THEMES[k].name}</option>`)
                .join('')}</select>
            </div>

            <div class="community-links-head">
              <p class="adjust-filters__title">🔗 リンク</p>
              <button type="button" class="btn btn-secondary btn-sm" id="mpAddLink">＋ 追加</button>
            </div>
            <div id="mpLinks" class="community-links-edit"></div>

            <div class="divider"></div>
            <div class="community-links-head">
              <p class="adjust-filters__title">📝 記事</p>
              <button type="button" class="btn btn-secondary btn-sm" id="mpAddNote">＋ 記事を追加</button>
            </div>
            <p class="form-hint mp-notes-lead">イベントの感想や周回記録など、ブログ風の記事を書けます</p>
            <div id="mpNotes" class="sekai-notes-edit"></div>

            <p id="mpSekaiError" class="form-error mt-2" hidden></p>
            <button type="button" class="btn btn-primary btn-block mt-3" id="mpSekaiSave">セカイノートを保存</button>
            <p id="mpSekaiSaved" class="community-saved mt-2" hidden>セカイノートを保存しました ✓</p>
          </div>

          <aside class="mp-sekai-preview-wrap">
            <p class="community-preview__label">プレビュー</p>
            <div id="mpPreview" class="linkhub"></div>
            <div class="community-share">
              <p class="form-hint">公開URL（このリンクを共有）</p>
              <div class="community-share__row">
                <input type="text" class="form-input" id="mpShareUrl" readonly>
                <button type="button" class="btn btn-secondary" id="mpCopyUrl">コピー</button>
              </div>
              <a href="#/p/${esc(hub.publicId)}" class="btn btn-secondary btn-block mt-2" data-link>公開ページを開く</a>
            </div>
          </aside>
        </div>
      </div>
    `;

    const linksWrap = box.querySelector('#mpLinks');
    const notesWrap = box.querySelector('#mpNotes');
    const preview = box.querySelector('#mpPreview');

    function readSekaiForm() {
      hub.theme = box.querySelector('#mpTheme').value;
      hub.links = [];
      linksWrap.querySelectorAll('.community-link-row').forEach((row) => {
        const title = row.querySelector('.mpLinkTitle').value.trim();
        const url = row.querySelector('.mpLinkUrl').value.trim();
        const emoji = row.querySelector('.mpLinkEmoji').value.trim();
        if (title || url) {
          hub.links.push({ id: row.dataset.id || newPublicId(), title, url: normalizeUrl(url), emoji });
        }
      });
      hub.notes = [];
      notesWrap.querySelectorAll('.sekai-note-row').forEach((row) => {
        const title = row.querySelector('.mpNoteTitle').value.trim();
        const body = row.querySelector('.mpNoteBody').value.trim();
        const isPublished = row.querySelector('.mpNotePublished').checked;
        if (title || body) {
          hub.notes.push({
            id: row.dataset.id || newPublicId(),
            title,
            body,
            isPublished,
            updatedAt: row.dataset.updated || new Date().toISOString(),
          });
        }
      });
    }

    function noteRow(note) {
      const row = document.createElement('div');
      row.className = 'sekai-note-row card';
      row.dataset.id = note.id || newPublicId();
      row.dataset.updated = note.updatedAt || new Date().toISOString();
      row.innerHTML = `
        <div class="sekai-note-row__head">
          <input type="text" class="form-input mpNoteTitle" maxlength="60" value="${esc(note.title || '')}" placeholder="記事タイトル">
          <button type="button" class="btn btn-secondary btn-sm mpNoteDel" aria-label="削除">✕</button>
        </div>
        <textarea class="form-input mpNoteBody" rows="4" maxlength="2000" placeholder="本文（イベントの感想、周回記録など）">${esc(note.body || '')}</textarea>
        <label class="form-toggle sekai-note-row__pub"><input type="checkbox" class="mpNotePublished"${note.isPublished !== false ? ' checked' : ''}><span class="toggle-track"></span><span class="toggle-label">公開する</span></label>
      `;
      row.querySelector('.mpNoteDel').addEventListener('click', () => {
        readSekaiForm();
        hub.notes = hub.notes.filter((x) => x.id !== row.dataset.id);
        renderNotes();
        renderPreview();
      });
      row.addEventListener('input', () => { readSekaiForm(); renderPreview(); });
      return row;
    }

    function renderNotes() {
      notesWrap.innerHTML = '';
      if (!hub.notes.length) {
        notesWrap.innerHTML = '<p class="text-muted sekai-notes-empty">記事はまだありません。「＋ 記事を追加」から書き始められます。</p>';
        return;
      }
      hub.notes.forEach((note) => notesWrap.appendChild(noteRow(note)));
    }

    function linkRow(lnk) {
      const row = document.createElement('div');
      row.className = 'community-link-row';
      row.dataset.id = lnk.id || newPublicId();
      row.innerHTML = `
        <input type="text" class="form-input mpLinkEmoji" maxlength="2" value="${esc(lnk.emoji || '')}" placeholder="🔗" aria-label="絵文字">
        <input type="text" class="form-input mpLinkTitle" value="${esc(lnk.title || '')}" placeholder="タイトル（例: X）" aria-label="タイトル">
        <input type="text" class="form-input mpLinkUrl" value="${esc(lnk.url || '')}" placeholder="https://..." aria-label="URL">
        <button type="button" class="btn btn-secondary btn-sm mpLinkDel" aria-label="削除">✕</button>
      `;
      row.querySelector('.mpLinkDel').addEventListener('click', () => {
        readSekaiForm();
        hub.links = hub.links.filter((x) => x.id !== row.dataset.id);
        renderLinks();
        renderPreview();
      });
      ['input'].forEach((ev) => row.addEventListener(ev, () => { readSekaiForm(); renderPreview(); }));
      return row;
    }

    function renderLinks() {
      linksWrap.innerHTML = '';
      hub.links.forEach((lnk) => linksWrap.appendChild(linkRow(lnk)));
    }

    function renderPreview() {
      preview.innerHTML = publicHtml(hub, { showDrafts: true });
      preview.setAttribute('style', themeStyle(hub.theme));
    }

    renderLinks();
    renderNotes();
    renderPreview();

    box.querySelector('#mpTheme').addEventListener('change', () => { readSekaiForm(); renderPreview(); });

    box.querySelector('#mpShareUrl').value =
      location.origin + location.pathname + '#/p/' + hub.publicId;

    box.querySelector('#mpAddLink').addEventListener('click', () => {
      readSekaiForm();
      hub.links.push({ id: newPublicId(), title: '', url: '', emoji: '' });
      renderLinks();
      renderPreview();
    });

    box.querySelector('#mpAddNote').addEventListener('click', () => {
      readSekaiForm();
      hub.notes.unshift({
        id: newPublicId(),
        title: '',
        body: '',
        isPublished: true,
        updatedAt: new Date().toISOString(),
      });
      renderNotes();
      renderPreview();
      const first = notesWrap.querySelector('.mpNoteTitle');
      if (first) first.focus();
    });

    box.querySelector('#mpCopyUrl').addEventListener('click', () => {
      const input = box.querySelector('#mpShareUrl');
      input.select();
      try { navigator.clipboard.writeText(input.value); } catch (e) { document.execCommand('copy'); }
      const btn = box.querySelector('#mpCopyUrl');
      const t = btn.textContent; btn.textContent = 'コピー済';
      setTimeout(() => { btn.textContent = t; }, 1200);
    });

    const sekaiErrEl = box.querySelector('#mpSekaiError');
    const sekaiSavedEl = box.querySelector('#mpSekaiSaved');
    box.querySelector('#mpSekaiSave').addEventListener('click', async () => {
      readSekaiForm();
      hub.notes = normalizeNotes(hub.notes);
      sekaiErrEl.hidden = true;
      sekaiSavedEl.hidden = true;
      if (!hub.displayName) {
        sekaiErrEl.textContent = 'マイページで表示名を設定してから保存してください。';
        sekaiErrEl.hidden = false;
        return;
      }
      const btn = box.querySelector('#mpSekaiSave');
      btn.disabled = true;
      btn.textContent = '保存中…';
      try {
        await saveHub(user.uid, hub);
        sekaiSaved = true;
        renderNotes();
        renderPreview();
        sekaiSavedEl.hidden = false;
        setTimeout(() => { sekaiSavedEl.hidden = true; }, 2500);
      } catch (e) {
        sekaiErrEl.textContent = e.message || String(e);
        sekaiErrEl.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = 'セカイノートを保存';
      }
    });
  }

  function eventSummaryText(post) {
    if (!post || !post.eventName) return '未設定 — 編集ボタンから募集内容を登録できます';
    const pub = post.isPublished === false ? '（非公開）' : '';
    const vis = post.visibility === 'friends' ? '（フレンド限定）' : '';
    return '「' + post.eventName + '」' + pub + vis;
  }

  function mysekaiSummaryText(post) {
    if (!post || !post.title) return '未設定 — 編集ボタンから宣伝内容を登録できます';
    const pub = post.isPublished === false ? '（非公開）' : '';
    const vis = post.visibility === 'friends' ? '（フレンド限定）' : '';
    return '「' + post.title + '」' + pub + vis;
  }

  function loadBoardSummaries(box, user) {
    if (!window.MiraiBoard) return;
    const eventSummary = box.querySelector('#mpEventSummary');
    const mysekaiSummary = box.querySelector('#mpMysekaiSummary');
    const eventBtn = box.querySelector('#mpEventBtn');
    const mysekaiBtn = box.querySelector('#mpMysekaiBtn');

    Promise.all([
      MiraiBoard.fetchOwnEventAd(user.uid),
      MiraiBoard.fetchOwnMysekai(user.uid),
    ]).then(([ev, ms]) => {
      if (eventSummary) eventSummary.textContent = eventSummaryText(ev);
      if (mysekaiSummary) mysekaiSummary.textContent = mysekaiSummaryText(ms);
      if (eventBtn) eventBtn.textContent = (ev && ev.eventName) ? '編集する' : '作成する';
      if (mysekaiBtn) mysekaiBtn.textContent = (ms && ms.title) ? '編集する' : '作成する';
    }).catch((e) => console.error(e));
  }

  // ================= セカイノート読み取り =================

  async function initSekaiNoteRead() {
    const root = document.getElementById('app');
    const box = root.querySelector('#sekaiNoteReadRoot');
    if (!box) return;

    const user = typeof MiraiAuth !== 'undefined' ? MiraiAuth.getUser() : null;

    box.innerHTML = `
      <section class="card community-editor mp-read-page">
        <h2 class="community-editor__title">セカイノートを読み取る</h2>
        <p class="text-muted mp-editor-lead">IDを入力してセカイノートを開けます</p>

        <div class="form-group">
          <label for="readPublicId">セカイノートID（8桁）</label>
          <input type="text" class="form-input" id="readPublicId" maxlength="12" placeholder="例: a1b2c3d4" autocapitalize="off" autocomplete="off" spellcheck="false">
        </div>
        <p id="readError" class="form-error" hidden></p>
        <button type="button" class="btn btn-primary btn-block" id="readOpenBtn">読み取る</button>

        ${user
          ? '<p class="form-hint mt-2">ログイン中の方は、開いたページからフレンド申請ができます。<a href="#/mypage" data-link>マイページ</a>で申請・フレンド一覧を確認できます。</p>'
          : '<p class="form-hint mt-2"><a href="#/login" data-link>ログイン</a>すると、読み取った相手にフレンド申請できます。</p>'}
      </section>
    `;

    const input = box.querySelector('#readPublicId');
    const errEl = box.querySelector('#readError');

    function normalizeReadId(raw) {
      return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
    }

    function openId(raw) {
      errEl.hidden = true;
      const id = normalizeReadId(raw);
      if (!id) {
        errEl.textContent = 'IDを入力してください。';
        errEl.hidden = false;
        return;
      }
      if (id.length < 4) {
        errEl.textContent = 'IDの形式が正しくありません。';
        errEl.hidden = false;
        return;
      }
      location.hash = '#/p/' + id;
    }

    box.querySelector('#readOpenBtn').addEventListener('click', () => openId(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') openId(input.value);
    });
  }

  // ================= プロフィールカード =================

  function profileCardHtml(hub, qrContainerId) {
    const theme = THEMES[hub.theme] || THEMES.blue;
    const accent = theme.colors[1] || theme.colors[0];
    return `
      <div class="profile-card-meishi" style="--pc-accent: ${accent}; --pc-bg: ${theme.colors[0]};">
        <div class="profile-card-meishi__inner">
          <div class="profile-card-meishi__main">
            ${avatarHtml(hub, 'profile-card-meishi__avatar')}
            <div class="profile-card-meishi__text">
              <p class="profile-card-meishi__name">${esc(hub.displayName || '未設定')}</p>
              ${hub.headline ? `<p class="profile-card-meishi__headline">${esc(hub.headline)}</p>` : ''}
              ${hub.bio ? `<p class="profile-card-meishi__bio">${esc(hub.bio)}</p>` : ''}
            </div>
          </div>
          <div class="profile-card-meishi__qr-col">
            <div id="${qrContainerId}" class="profile-card-meishi__qr"></div>
            <p class="profile-card-meishi__id">ID: ${esc(hub.publicId)}</p>
            <p class="profile-card-meishi__site">未来喫茶</p>
          </div>
        </div>
      </div>
    `;
  }

  async function initProfileCard() {
    const root = document.getElementById('app');
    const box = root.querySelector('#profileCardRoot');
    if (!box) return;

    if (!(await isConfigured())) {
      box.innerHTML = '<div class="info-box"><p>この機能は準備中です。</p></div>';
      return;
    }

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';

    const user = await resolveAuthUser();
    if (!user) {
      box.innerHTML =
        '<div class="info-box"><p>プロフィールカードの作成にはログインが必要です。</p>' +
        '<p class="mt-2"><a href="#/login" class="btn btn-primary" data-link>ログインする</a></p></div>';
      return;
    }

    const { hub } = await prepareHub(user);
    const qrId = 'profileCardQr';

    box.innerHTML = `
      <div class="profile-card-page">
        ${!hub.displayName ? '<div class="info-box mb-2"><p><a href="#/mypage" data-link>マイページ</a>で表示名を設定してください。</p></div>' : ''}
        <p class="form-hint">名刺サイズ（91×55mm）のプロフィールカードです。印刷またはスクリーンショットで保存できます。</p>
        <div class="profile-card-page__preview" id="profileCardPreviewWrap">
          ${profileCardHtml(hub, qrId)}
        </div>
        <div class="profile-card-page__actions">
          <button type="button" class="btn btn-primary" id="profileCardPrint">印刷する</button>
          <a href="#/mypage" class="btn btn-secondary" data-link>マイページに戻る</a>
        </div>
        <p class="form-hint mt-2">テーマカラーは<a href="#/mypage/sekainote" data-link>セカイノート</a>の設定に連動します</p>
      </div>
    `;

    if (window.MiraiQr) {
      MiraiQr.render(box.querySelector('#' + qrId), MiraiQr.publicPageUrl(hub.publicId), 72).catch(console.error);
    }

    box.querySelector('#profileCardPrint').addEventListener('click', () => {
      document.body.classList.add('is-print-profile-card');
      window.print();
      setTimeout(() => document.body.classList.remove('is-print-profile-card'), 500);
    });
  }

  // ================= 公開ページ =================

  async function initPublic(params) {
    const root = document.getElementById('app');
    const box = root.querySelector('#publicProfileRoot');
    if (!box) return;
    const publicId = params && params.id;

    if (!(await isConfigured())) {
      box.innerHTML = '<div class="info-box"><p>このページ機能は準備中です。</p></div>';
      return;
    }

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';
    try {
      const hub = await loadHub(publicId);
      if (!hub) {
        box.innerHTML = '<div class="info-box"><p>ページが見つかりませんでした。</p>' +
          '<p class="mt-2"><a href="#/" class="btn btn-secondary" data-link>ホームへ</a></p></div>';
        return;
      }

      const viewer = typeof MiraiAuth !== 'undefined' ? MiraiAuth.getUser() : null;
      const showFriendBar = viewer && hub.uid && viewer.uid !== hub.uid && window.MiraiFriends;

      box.innerHTML =
        (showFriendBar ? '<div id="publicFriendBar" class="friend-action-bar card"></div>' : '') +
        '<div class="linkhub linkhub--full" style="' + themeStyle(hub.theme) + '">' + publicHtml(hub) + '</div>';

      if (showFriendBar) {
        await MiraiFriends.renderActionButton(
          box.querySelector('#publicFriendBar'),
          viewer.uid,
          hub
        );
      }

      document.title = (hub.displayName || 'セカイノート') + ' — 未来喫茶';
    } catch (e) {
      box.innerHTML = '<div class="info-box"><p>読み込みに失敗しました。</p></div>';
      console.error(e);
    }
  }

  function notesHtml(hub, opts) {
    const showDrafts = opts && opts.showDrafts;
    const notes = normalizeNotes(Array.isArray(hub.notes) ? hub.notes : [])
      .filter((n) => n.title || n.body)
      .filter((n) => showDrafts || n.isPublished);
    if (!notes.length) return '';
    const items = notes.map((n) => {
      const draft = showDrafts && !n.isPublished ? '<span class="sekai-note-card__draft">下書き</span>' : '';
      return `<article class="sekai-note-card${showDrafts && !n.isPublished ? ' sekai-note-card--draft' : ''}">` +
        `<h3 class="sekai-note-card__title">${esc(n.title || '無題')}${draft}</h3>` +
        `<div class="sekai-note-card__body">${esc(n.body).replace(/\n/g, '<br>')}</div>` +
        `</article>`;
    }).join('');
    return `<section class="sekai-notes"><h2 class="sekai-notes__heading">📓 セカイノート</h2><div class="sekai-notes__list">${items}</div></section>`;
  }

  function publicHtml(hub, opts) {
    const links = Array.isArray(hub.links) ? hub.links : [];
    const linksHtml = links.filter((l) => l.url).map((l) => {
      const emoji = l.emoji ? `<span class="linkhub-link__emoji">${esc(l.emoji)}</span>` : '';
      return `<a class="linkhub-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${emoji}<span>${esc(l.title || l.url)}</span></a>`;
    }).join('');

    const pins = [];
    if (hub.pinEventAd && hub.uid) {
      pins.push(`<a class="linkhub-link linkhub-link--pin" href="#/board/event" data-link><span class="linkhub-link__emoji">📣</span><span>イベラン広告を見る</span></a>`);
    }
    if (hub.pinMysekai && hub.uid) {
      pins.push(`<a class="linkhub-link linkhub-link--pin" href="#/board/mysekai" data-link><span class="linkhub-link__emoji">🌿</span><span>マイセカイ宣伝を見る</span></a>`);
    }

    const notesSection = notesHtml(hub, opts);

    return `
      ${avatarHtml(hub)}
      <h1 class="linkhub-name">${esc(hub.displayName || '名無し')}</h1>
      ${hub.headline ? `<p class="linkhub-headline">${esc(hub.headline)}</p>` : ''}
      ${hub.bio ? `<p class="linkhub-bio">${esc(hub.bio)}</p>` : ''}
      <div class="linkhub-links">${linksHtml || '<p class="linkhub-empty">リンクはまだありません</p>'}</div>
      ${pins.length ? `<div class="linkhub-links linkhub-links--pins">${pins.join('')}</div>` : ''}
      ${notesSection}
    `;
  }

  return { initLogin, initMyPage, initSekaiNoteEdit, initSekaiNoteRead, initProfileCard, initPublic };
})();

window.MiraiMyPage = MiraiMyPage;
