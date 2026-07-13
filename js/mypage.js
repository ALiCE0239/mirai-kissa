/**
 * 未来喫茶 — マイページ（リトリン風リンクまとめ / linkHubs）
 *
 * - #/login          ログイン画面（X / Google）
 * - #/mypage         自分のマイページ編集（要ログイン）
 * - #/p/:id          公開マイページ（誰でも閲覧）
 *
 * データ構造はアプリの LinkHubDocument に準拠。
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

  function initLogin() {
    const root = document.getElementById('app');
    const box = root.querySelector('#loginBox');
    if (!box) return;

    const configured = window.MiraiAuth && window.MiraiAuth.isConfigured();

    if (!configured) {
      box.innerHTML =
        '<div class="info-box">' +
        '<p><strong>ログイン機能は準備中です。</strong></p>' +
        '<p class="mt-1">サイト管理者が Firebase の設定（<code>js/firebase-config.js</code>）を行うと有効になります。手順は <code>data/Firebase設定手順.txt</code> を参照してください。</p>' +
        '</div>';
      return;
    }

    // 既にログイン済みならマイページへ
    if (window.MiraiAuth.getUser()) {
      location.hash = '#/mypage';
      return;
    }

    box.innerHTML =
      '<p class="text-muted community-login__lead">ログインすると、マイページ・イベラン広告・マイセカイ宣伝を登録できます。</p>' +
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
        if (user) location.hash = '#/mypage';
      } catch (e) {
        showErr(e.message || String(e));
      }
    };

    box.querySelector('#loginX').addEventListener('click', () => run(() => window.MiraiAuth.signInWithX()));
    box.querySelector('#loginGoogle').addEventListener('click', () => run(() => window.MiraiAuth.signInWithGoogle()));

    // ログイン状態が変わったら自動遷移
    const off = window.MiraiAuth.onChange((user) => {
      if (user && location.hash === '#/login') location.hash = '#/mypage';
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

    const configured = window.MiraiAuth && window.MiraiAuth.isConfigured();
    if (!configured) {
      box.innerHTML =
        '<div class="info-box"><p><strong>ログイン機能は準備中です。</strong></p>' +
        '<p class="mt-1">Firebase の設定後に利用できます。</p></div>';
      return;
    }

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';

    // 認証確定を待つ
    await window.MiraiFirebaseReady;
    let user = window.MiraiAuth.getUser();
    if (!user) {
      // onChange で確定するのを少し待つ
      user = await new Promise((resolve) => {
        let done = false;
        const off = window.MiraiAuth.onChange((u) => {
          if (done) return;
          done = true; off(); resolve(u);
        });
        setTimeout(() => { if (!done) { done = true; off(); resolve(window.MiraiAuth.getUser()); } }, 2500);
      });
    }

    if (!user) {
      box.innerHTML =
        '<div class="info-box"><p>マイページの編集にはログインが必要です。</p>' +
        '<p class="mt-2"><a href="#/login" class="btn btn-primary" data-link>ログインする</a></p></div>';
      return;
    }

    let hub = await loadOwnHub(user.uid);
    if (!hub) {
      hub = {
        uid: user.uid,
        publicId: newPublicId(),
        displayName: '',
        headline: '',
        bio: '',
        links: [],
        highlights: [],
        pinEventAd: false,
        pinMysekai: false,
        theme: 'blue',
        blocks: [],
      };
      const x = window.MiraiAuth.getStoredXHandle();
      if (x) {
        hub.links.push({ id: newPublicId(), title: 'X', url: 'https://x.com/' + x, emoji: '𝕏' });
      }
    }
    hub.links = Array.isArray(hub.links) ? hub.links : [];

    renderEditor(box, user, hub);
  }

  function renderEditor(box, user, hub) {
    const themeOptions = Object.keys(THEMES)
      .map((k) => `<option value="${k}"${hub.theme === k ? ' selected' : ''}>${THEMES[k].name}</option>`)
      .join('');

    box.innerHTML = `
      <div class="community-grid">
        <section class="card community-editor">
          <h2 class="community-editor__title">マイページを編集</h2>
          <div class="form-group">
            <label for="mpName">表示名</label>
            <input type="text" class="form-input" id="mpName" maxlength="30" value="${esc(hub.displayName)}" placeholder="例: みくちゃん">
          </div>
          <div class="form-group">
            <label for="mpHeadline">ひとこと見出し</label>
            <input type="text" class="form-input" id="mpHeadline" maxlength="40" value="${esc(hub.headline)}" placeholder="例: 25時、ナイトコードで。推し">
          </div>
          <div class="form-group">
            <label for="mpBio">自己紹介</label>
            <textarea class="form-input" id="mpBio" rows="3" maxlength="200" placeholder="プロフィールや活動内容など">${esc(hub.bio)}</textarea>
          </div>
          <div class="form-group">
            <label for="mpTheme">テーマ色</label>
            <select class="form-select" id="mpTheme">${themeOptions}</select>
          </div>

          <div class="divider"></div>
          <div class="community-links-head">
            <p class="adjust-filters__title">リンク</p>
            <button type="button" class="btn btn-secondary btn-sm" id="mpAddLink">＋ 追加</button>
          </div>
          <div id="mpLinks" class="community-links-edit"></div>

          <p id="mpError" class="form-error mt-3" hidden></p>
          <button type="button" class="btn btn-primary btn-block mt-3" id="mpSave">保存する</button>
          <p id="mpSaved" class="community-saved mt-2" hidden>保存しました ✓</p>
        </section>

        <section class="community-preview-wrap">
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
          <button type="button" class="btn btn-secondary btn-block mt-3" id="mpLogout">ログアウト</button>
        </section>
      </div>
    `;

    const linksWrap = box.querySelector('#mpLinks');
    const preview = box.querySelector('#mpPreview');

    function readForm() {
      hub.displayName = box.querySelector('#mpName').value.trim();
      hub.headline = box.querySelector('#mpHeadline').value.trim();
      hub.bio = box.querySelector('#mpBio').value.trim();
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
    }

    function renderLinks() {
      linksWrap.innerHTML = '';
      hub.links.forEach((lnk) => linksWrap.appendChild(linkRow(lnk)));
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
        readForm();
        hub.links = hub.links.filter((x) => x.id !== row.dataset.id);
        renderLinks();
        renderPreview();
      });
      ['input'].forEach((ev) => row.addEventListener(ev, () => { readForm(); renderPreview(); }));
      return row;
    }

    function renderPreview() {
      preview.innerHTML = publicHtml(hub);
      preview.setAttribute('style', themeStyle(hub.theme));
    }

    renderLinks();
    renderPreview();

    box.querySelector('#mpShareUrl').value =
      location.origin + location.pathname + '#/p/' + hub.publicId;

    box.querySelector('#mpAddLink').addEventListener('click', () => {
      readForm();
      hub.links.push({ id: newPublicId(), title: '', url: '', emoji: '' });
      renderLinks();
      renderPreview();
    });

    ['#mpName', '#mpHeadline', '#mpBio', '#mpTheme'].forEach((sel) => {
      box.querySelector(sel).addEventListener('input', () => { readForm(); renderPreview(); });
    });

    box.querySelector('#mpCopyUrl').addEventListener('click', () => {
      const input = box.querySelector('#mpShareUrl');
      input.select();
      try { navigator.clipboard.writeText(input.value); } catch (e) { document.execCommand('copy'); }
      const btn = box.querySelector('#mpCopyUrl');
      const t = btn.textContent; btn.textContent = 'コピー済';
      setTimeout(() => { btn.textContent = t; }, 1200);
    });

    box.querySelector('#mpLogout').addEventListener('click', async () => {
      await window.MiraiAuth.signOut();
      location.hash = '#/';
    });

    const errEl = box.querySelector('#mpError');
    const savedEl = box.querySelector('#mpSaved');
    box.querySelector('#mpSave').addEventListener('click', async () => {
      readForm();
      errEl.hidden = true; savedEl.hidden = true;
      if (!hub.displayName) { errEl.textContent = '表示名を入力してください。'; errEl.hidden = false; return; }
      const btn = box.querySelector('#mpSave');
      btn.disabled = true; btn.textContent = '保存中…';
      try {
        await saveHub(user.uid, hub);
        savedEl.hidden = false;
        setTimeout(() => { savedEl.hidden = true; }, 2500);
      } catch (e) {
        errEl.textContent = e.message || String(e); errEl.hidden = false;
      } finally {
        btn.disabled = false; btn.textContent = '保存する';
      }
    });
  }

  // ================= 公開ページ =================

  async function initPublic(params) {
    const root = document.getElementById('app');
    const box = root.querySelector('#publicProfileRoot');
    if (!box) return;
    const publicId = params && params.id;

    if (!window.MiraiAuth || !window.MiraiAuth.isConfigured()) {
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
      box.innerHTML = '<div class="linkhub linkhub--full" style="' + themeStyle(hub.theme) + '">' + publicHtml(hub) + '</div>';
      document.title = (hub.displayName || 'マイページ') + ' — 未来喫茶';
    } catch (e) {
      box.innerHTML = '<div class="info-box"><p>読み込みに失敗しました。</p></div>';
      console.error(e);
    }
  }

  function publicHtml(hub) {
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

    return `
      <div class="linkhub-avatar">${esc(initial(hub.displayName))}</div>
      <h1 class="linkhub-name">${esc(hub.displayName || '名無し')}</h1>
      ${hub.headline ? `<p class="linkhub-headline">${esc(hub.headline)}</p>` : ''}
      ${hub.bio ? `<p class="linkhub-bio">${esc(hub.bio)}</p>` : ''}
      <div class="linkhub-links">${linksHtml || '<p class="linkhub-empty">リンクはまだありません</p>'}</div>
      ${pins.length ? `<div class="linkhub-links linkhub-links--pins">${pins.join('')}</div>` : ''}
    `;
  }

  return { initLogin, initMyPage, initPublic };
})();

window.MiraiMyPage = MiraiMyPage;
