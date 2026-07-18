/**
 * 未来喫茶 — フレンド申請 / フレンド一覧
 *
 * users/{uid}/friendRequests/{fromUid}  … 受信した申請（fromUid が申請者）
 * users/{uid}/friends/{friendUid}       … フレンド一覧
 * users/{uid}/blocks/{blockedUid}       … ブロック一覧（本人のみ閲覧）
 * users/{uid}/shadowFriendRequests/{targetUid} … ブロックされて届かなかった申請（送信者のみ・見かけ上の申請済み）
 */
const MiraiFriends = (function () {
  'use strict';

  const FRIEND_REQUEST_SOURCES = {
    profile: 'セカイノート（公開ページ・QR）',
    idSearch: 'マイページのID検索',
    ranking: 'ランキング',
    boardEvent: 'イベラン広告',
    boardMysekai: 'マイセカイ宣伝',
  };

  const DEFAULT_FRIEND_REQUEST_SOURCES = {
    profile: true,
    idSearch: true,
    ranking: true,
    boardEvent: true,
    boardMysekai: true,
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalizeFriendRequestSources(raw) {
    const out = Object.assign({}, DEFAULT_FRIEND_REQUEST_SOURCES);
    if (!raw || typeof raw !== 'object') return out;
    Object.keys(DEFAULT_FRIEND_REQUEST_SOURCES).forEach((key) => {
      if (typeof raw[key] === 'boolean') out[key] = raw[key];
    });
    return out;
  }

  function normalizeFriendSource(source) {
    return source && FRIEND_REQUEST_SOURCES[source] ? source : 'profile';
  }

  async function loadFriendRequestSources(uid) {
    const f = await fb();
    if (!f || !uid) return normalizeFriendRequestSources(null);
    const { doc, getDoc } = f.dbFns;
    try {
      const snap = await safeGetDoc(getDoc, doc(f.db, 'users', uid, 'sns', 'settings'));
      if (!snap.exists()) return normalizeFriendRequestSources(null);
      return normalizeFriendRequestSources(snap.data().friendRequestSources);
    } catch (e) {
      console.warn('[friends] loadFriendRequestSources:', e);
      return normalizeFriendRequestSources(null);
    }
  }

  async function saveFriendRequestSources(uid, sources) {
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const { doc, setDoc, serverTimestamp } = f.dbFns;
    await setDoc(doc(f.db, 'users', uid, 'sns', 'settings'), {
      friendRequestSources: normalizeFriendRequestSources(sources),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  function isFriendRequestSourceAllowed(sources, source) {
    const normalized = normalizeFriendRequestSources(sources);
    return normalized[normalizeFriendSource(source)] !== false;
  }

  function friendRequestSourceLabel(source) {
    return FRIEND_REQUEST_SOURCES[normalizeFriendSource(source)];
  }

  function profileLink(publicId, source) {
    const id = String(publicId || '').trim();
    if (!id) return '';
    const base = '#/p/' + encodeURIComponent(id);
    const key = normalizeFriendSource(source);
    return key === 'profile' ? base : base + '?fr=' + encodeURIComponent(key);
  }

  function parseFriendSourceFromHash() {
    const raw = location.hash.slice(1) || '/';
    const qIdx = raw.indexOf('?');
    if (qIdx < 0) return 'profile';
    try {
      const params = new URLSearchParams(raw.slice(qIdx + 1));
      return normalizeFriendSource(params.get('fr'));
    } catch (e) {
      return 'profile';
    }
  }

  function readFriendRequestSourcesFromDom(root) {
    const out = Object.assign({}, DEFAULT_FRIEND_REQUEST_SOURCES);
    if (!root) return out;
    root.querySelectorAll('[data-friend-request-source]').forEach((input) => {
      const key = input.dataset.friendRequestSource;
      if (key && Object.prototype.hasOwnProperty.call(out, key)) {
        out[key] = input.checked;
      }
    });
    return out;
  }

  function friendRequestSettingsHtml(sources) {
    const normalized = normalizeFriendRequestSources(sources);
    const items = Object.keys(FRIEND_REQUEST_SOURCES).map((key) =>
      '<label class="mp-friend-request-settings__item">' +
      '<input type="checkbox" data-friend-request-source="' + key + '"' + (normalized[key] ? ' checked' : '') + '>' +
      '<span>' + esc(FRIEND_REQUEST_SOURCES[key]) + '</span>' +
      '</label>'
    ).join('');
    return (
      '<div class="mp-friend-request-settings">' +
      '<p class="form-hint">チェックを外した経路からのフレンド申請を拒否します。</p>' +
      items +
      '</div>'
    );
  }

  async function initFriendRequestSettingsPage() {
    const box = document.getElementById('app').querySelector('#friendRequestSettingsRoot');
    if (!box) return;
    await window.MiraiFirebaseReady;
    const user = window.MiraiAuth ? await window.MiraiAuth.requireUser('#/mypage/friend-settings') : null;
    if (!user) return;

    let blockListVisible = false;

    async function renderPage(options) {
      options = options || {};
      if (options.showBlockList) blockListVisible = true;

      box.innerHTML = '<p class="text-muted">読み込み中…</p>';
      try {
        const [sources, blocked] = await Promise.all([
          loadFriendRequestSources(user.uid),
          listBlockedUsers(user.uid),
        ]);
        const blockToggleLabel = blockListVisible
          ? 'ブロックリストを隠す'
          : blockListToggleLabel(blocked.length);
        box.innerHTML =
          '<section class="card community-editor mp-friend-settings-page">' +
          '<p class="adjust-filters__title">申請の受け付け</p>' +
          friendRequestSettingsHtml(sources) +
          '<button type="button" class="btn btn-primary btn-block mt-3" id="friendRequestSettingsSave">受け付け設定を保存</button>' +
          '<p id="friendRequestSettingsError" class="form-error mt-2" hidden></p>' +
          '<p id="friendRequestSettingsSaved" class="community-saved mt-2" hidden>保存しました ✓</p>' +
          '<div class="divider"></div>' +
          '<p class="adjust-filters__title">ブロック</p>' +
          '<p class="form-hint">ブロックしたユーザーからの申請は届きません（相手には申請できたように見えます）。マイセカイ宣伝・イベラン広告も非表示になります。</p>' +
          '<div class="mp-block-add">' +
          '<label for="blockIdInput">未来喫茶IDでブロック</label>' +
          '<div class="mp-block-add__row">' +
          '<input type="text" class="form-input" id="blockIdInput" maxlength="12" placeholder="例: a1b2c3d4" autocapitalize="off" autocomplete="off" spellcheck="false">' +
          '<button type="button" class="btn btn-secondary" id="blockAddBtn">ブロック</button>' +
          '</div>' +
          '<p id="blockAddError" class="form-error mt-1" hidden></p>' +
          '</div>' +
          '<button type="button" class="btn btn-secondary btn-block mt-2" id="blockListToggle">' + esc(blockToggleLabel) + '</button>' +
          '<div id="blockListWrap" class="mp-block-list-wrap"' + (blockListVisible ? '' : ' hidden') + '>' +
          '<div id="blockList" class="mp-block-list">' + blockListHtml(blocked) + '</div>' +
          '</div>' +
          '</section>';

        const errEl = box.querySelector('#friendRequestSettingsError');
        const savedEl = box.querySelector('#friendRequestSettingsSaved');
        box.querySelector('#friendRequestSettingsSave').addEventListener('click', async () => {
          errEl.hidden = true;
          savedEl.hidden = true;
          const btn = box.querySelector('#friendRequestSettingsSave');
          btn.disabled = true;
          btn.textContent = '保存中…';
          try {
            await saveFriendRequestSources(user.uid, readFriendRequestSourcesFromDom(box));
            savedEl.hidden = false;
            setTimeout(() => { savedEl.hidden = true; }, 2500);
          } catch (e) {
            errEl.textContent = e.message || String(e);
            errEl.hidden = false;
          } finally {
            btn.disabled = false;
            btn.textContent = '受け付け設定を保存';
          }
        });

        const blockInput = box.querySelector('#blockIdInput');
        const blockErr = box.querySelector('#blockAddError');
        async function runBlockAdd() {
          blockErr.hidden = true;
          const id = normalizePublicId(blockInput.value);
          if (!id || id.length < 4) {
            blockErr.textContent = 'IDを入力してください。';
            blockErr.hidden = false;
            return;
          }
          const btn = box.querySelector('#blockAddBtn');
          btn.disabled = true;
          try {
            const hub = await loadHubByPublicId(id);
            if (!hub || !hub.uid) {
              blockErr.textContent = '該当するユーザーが見つかりませんでした。';
              blockErr.hidden = false;
              return;
            }
            if (hub.uid === user.uid) {
              blockErr.textContent = '自分自身はブロックできません。';
              blockErr.hidden = false;
              return;
            }
            await blockUser(user.uid, hub);
            blockInput.value = '';
            await renderPage({ showBlockList: true });
          } catch (e) {
            blockErr.textContent = e.message || String(e);
            blockErr.hidden = false;
          } finally {
            btn.disabled = false;
          }
        }
        box.querySelector('#blockAddBtn').addEventListener('click', runBlockAdd);
        blockInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') runBlockAdd();
        });

        const listWrap = box.querySelector('#blockListWrap');
        const toggleBtn = box.querySelector('#blockListToggle');
        toggleBtn.addEventListener('click', () => {
          blockListVisible = !blockListVisible;
          listWrap.hidden = !blockListVisible;
          toggleBtn.textContent = blockListVisible
            ? 'ブロックリストを隠す'
            : blockListToggleLabel(blocked.length);
        });

        box.querySelectorAll('[data-unblock-uid]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const targetUid = btn.dataset.unblockUid;
            btn.disabled = true;
            try {
              await unblockUser(user.uid, targetUid);
              await renderPage({ showBlockList: blockListVisible });
            } catch (e) {
              alert(e.message || String(e));
              btn.disabled = false;
            }
          });
        });
      } catch (e) {
        box.innerHTML = '<p class="form-error">読み込みに失敗しました</p>';
        console.error(e);
      }
    }

    await renderPage();
  }

  function blockListToggleLabel(count) {
    return count > 0 ? 'ブロックリストを表示（' + count + '人）' : 'ブロックリストを表示';
  }

  function blockListHtml(blocked) {
    if (!blocked.length) {
      return '<p class="text-muted mp-friends-empty">ブロックしているユーザーはいません</p>';
    }
    return blocked.map((b) =>
      '<div class="mp-block-row card" data-blocked="' + esc(b.blockedUid) + '">' +
      '<div class="mp-block-row__main">' +
      friendAvatar({ displayName: b.displayName, avatarURL: b.avatarURL }) +
      '<div>' +
      '<p class="mp-block-row__name">' + esc(b.displayName || 'ユーザー') + '</p>' +
      '<p class="form-hint">ID: ' + esc(b.publicId || '—') + '</p>' +
      '</div></div>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-unblock-uid="' + esc(b.blockedUid) + '">解除</button>' +
      '</div>'
    ).join('');
  }

  async function listBlockedUsers(uid) {
    const f = await fb();
    if (!f || !uid) return [];
    const { collection, getDocs } = f.dbFns;
    const snap = await getDocs(collection(f.db, 'users', uid, 'blocks'));
    return snap.docs.map((d) => Object.assign({ blockedUid: d.id }, d.data()));
  }

  async function listBlockedUids(uid) {
    const list = await listBlockedUsers(uid);
    return new Set(list.map((b) => b.blockedUid).filter(Boolean));
  }

  async function blockUser(myUid, targetHub) {
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const targetUid = targetHub && targetHub.uid;
    if (!targetUid) throw new Error('ユーザーが見つかりません。');
    if (myUid === targetUid) throw new Error('自分自身はブロックできません。');

    const { doc, setDoc, deleteDoc, serverTimestamp } = f.dbFns;
    await setDoc(doc(f.db, 'users', myUid, 'blocks', targetUid), {
      blockedUid: targetUid,
      publicId: targetHub.publicId || '',
      displayName: targetHub.displayName || 'ユーザー',
      avatarURL: targetHub.avatarURL || '',
      createdAt: serverTimestamp(),
    });

    await Promise.all([
      deleteDoc(doc(f.db, 'users', myUid, 'friendRequests', targetUid)).catch(() => {}),
      deleteDoc(doc(f.db, 'users', targetUid, 'friendRequests', myUid)).catch(() => {}),
      deleteDoc(doc(f.db, 'users', myUid, 'friends', targetUid)).catch(() => {}),
      deleteDoc(doc(f.db, 'users', targetUid, 'friends', myUid)).catch(() => {}),
      deleteDoc(doc(f.db, 'users', targetUid, 'shadowFriendRequests', myUid)).catch(() => {}),
    ]);
  }

  async function unblockUser(myUid, targetUid) {
    const f = await fb();
    if (!f || !f.configured) return;
    const { doc, deleteDoc } = f.dbFns;
    await deleteDoc(doc(f.db, 'users', myUid, 'blocks', targetUid));
  }

  async function fb() {
    return window.MiraiFirebaseReady ? await window.MiraiFirebaseReady : null;
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function isRetryableFirebaseError(err) {
    const code = err && err.code ? String(err.code) : '';
    return code === 'permission-denied' || code === 'unavailable' || code === 'failed-precondition';
  }

  async function ensureAuthReady(fallbackUser) {
    if (window.MiraiAuth && window.MiraiAuth.whenReady) {
      await window.MiraiAuth.whenReady();
    }
    await fb();
    let user = (window.MiraiAuth && window.MiraiAuth.getUser()) || fallbackUser || null;
    if (!user && window.MiraiAuth && window.MiraiAuth.waitForUser) {
      user = await window.MiraiAuth.waitForUser(2000);
    }
    if (!user || !user.uid) return null;
    for (let i = 0; i < 3; i++) {
      try {
        if (typeof user.getIdToken === 'function') {
          await user.getIdToken(i > 0);
        }
        return user;
      } catch (e) {
        if (i >= 2) return user;
        await delay(250 * (i + 1));
      }
    }
    return user;
  }

  function isRenderStale(opts) {
    return !!(opts && typeof opts.isRenderStale === 'function' && opts.isRenderStale());
  }

  async function loadHubByUid(uid) {
    const f = await fb();
    if (!f || !f.configured) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, 'users', uid, 'sns', 'linkHub'));
    return snap.exists() ? snap.data() : null;
  }

  async function safeGetDoc(getDoc, ref) {
    try {
      return await getDoc(ref);
    } catch (e) {
      if (e && e.code === 'permission-denied') {
        console.warn('[friends] permission denied:', ref && ref.path ? ref.path : ref);
        return { exists: () => false, data: () => null };
      }
      throw e;
    }
  }

  async function loadHubByPublicId(publicId) {
    const f = await fb();
    if (!f || !f.configured) return null;
    const id = normalizePublicId(publicId);
    if (!id) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, 'linkHubs', id));
    if (!snap.exists()) return null;
    const hub = snap.data();
    if (!hub) return null;
    if (!hub.publicId) hub.publicId = id;
    return hub;
  }

  function normalizePublicId(raw) {
    return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  }

  /** @returns {'self'|'friends'|'pending_sent'|'pending_received'|'none'} */
  async function getStatus(myUid, targetUid) {
    if (!myUid || !targetUid) return 'none';
    if (myUid === targetUid) return 'self';
    const f = await fb();
    if (!f || !f.configured) return 'none';
    const { doc, getDoc } = f.dbFns;
    const [friendSnap, sentSnap, recvSnap, shadowSnap] = await Promise.all([
      safeGetDoc(getDoc, doc(f.db, 'users', myUid, 'friends', targetUid)),
      safeGetDoc(getDoc, doc(f.db, 'users', targetUid, 'friendRequests', myUid)),
      safeGetDoc(getDoc, doc(f.db, 'users', myUid, 'friendRequests', targetUid)),
      safeGetDoc(getDoc, doc(f.db, 'users', myUid, 'shadowFriendRequests', targetUid)),
    ]);
    if (friendSnap.exists()) return 'friends';
    if (sentSnap.exists() && sentSnap.data().status === 'pending') return 'pending_sent';
    if (shadowSnap.exists()) return 'pending_sent';
    if (recvSnap.exists() && recvSnap.data().status === 'pending') return 'pending_received';
    return 'none';
  }

  async function sendRequest(myUid, targetHub, source) {
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const targetUid = targetHub && targetHub.uid;
    if (!targetUid) throw new Error('ユーザーが見つかりません。');
    if (myUid === targetUid) throw new Error('自分自身には申請できません。');

    const requestSource = normalizeFriendSource(source);
    const targetSources = await loadFriendRequestSources(targetUid);
    if (!isFriendRequestSourceAllowed(targetSources, requestSource)) {
      throw new Error(friendRequestSourceLabel(requestSource) + 'からのフレンド申請は受け付けていません。');
    }

    const status = await getStatus(myUid, targetUid);
    if (status === 'friends') throw new Error('すでにフレンドです。');
    if (status === 'pending_sent') throw new Error('申請済みです。');
    if (status === 'pending_received') throw new Error('相手から申請が来ています。マイページで承認してください。');

    const myHub = await loadHubByUid(myUid);
    const { doc, setDoc, serverTimestamp } = f.dbFns;
    const payload = {
      fromUid: myUid,
      fromPublicId: (myHub && myHub.publicId) || '',
      fromDisplayName: (myHub && myHub.displayName) || 'ユーザー',
      fromAvatarURL: (myHub && myHub.avatarURL) || '',
      status: 'pending',
      source: requestSource,
      createdAt: serverTimestamp(),
    };
    try {
      await setDoc(doc(f.db, 'users', targetUid, 'friendRequests', myUid), payload);
    } catch (e) {
      if (e && e.code === 'permission-denied') {
        await setDoc(doc(f.db, 'users', myUid, 'shadowFriendRequests', targetUid), {
          targetUid,
          targetPublicId: (targetHub && targetHub.publicId) || '',
          targetDisplayName: (targetHub && targetHub.displayName) || '',
          source: requestSource,
          createdAt: serverTimestamp(),
        });
        return;
      }
      throw e;
    }
  }

  async function cancelRequest(myUid, targetUid) {
    const f = await fb();
    if (!f || !f.configured) return;
    const { doc, deleteDoc } = f.dbFns;
    await Promise.all([
      deleteDoc(doc(f.db, 'users', targetUid, 'friendRequests', myUid)).catch(() => {}),
      deleteDoc(doc(f.db, 'users', myUid, 'shadowFriendRequests', targetUid)).catch(() => {}),
    ]);
  }

  async function acceptRequest(myUid, fromUid) {
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const { doc, getDoc, setDoc, deleteDoc, serverTimestamp } = f.dbFns;
    const reqRef = doc(f.db, 'users', myUid, 'friendRequests', fromUid);
    const reqSnap = await getDoc(reqRef);
    if (!reqSnap.exists()) throw new Error('申請が見つかりません。');
    const req = reqSnap.data();
    if (req.status !== 'pending') throw new Error('この申請は処理済みです。');

    const myHub = await loadHubByUid(myUid);
    const ts = serverTimestamp();
    await setDoc(doc(f.db, 'users', myUid, 'friends', fromUid), {
      friendUid: fromUid,
      publicId: req.fromPublicId || '',
      displayName: req.fromDisplayName || '',
      avatarURL: req.fromAvatarURL || '',
      addedAt: ts,
    });
    await setDoc(doc(f.db, 'users', fromUid, 'friends', myUid), {
      friendUid: myUid,
      publicId: (myHub && myHub.publicId) || '',
      displayName: (myHub && myHub.displayName) || '',
      avatarURL: (myHub && myHub.avatarURL) || '',
      addedAt: ts,
    });
    await deleteDoc(reqRef);
  }

  async function rejectRequest(myUid, fromUid) {
    const f = await fb();
    if (!f || !f.configured) return;
    const { doc, deleteDoc } = f.dbFns;
    await deleteDoc(doc(f.db, 'users', myUid, 'friendRequests', fromUid));
  }

  async function listIncomingRequests(uid) {
    const f = await fb();
    if (!f || !f.configured) return [];
    const { collection, query, where, getDocs } = f.dbFns;
    const [snap, blockedUids] = await Promise.all([
      getDocs(query(collection(f.db, 'users', uid, 'friendRequests'), where('status', '==', 'pending'))),
      listBlockedUids(uid),
    ]);
    return snap.docs
      .filter((d) => !blockedUids.has(d.id))
      .map((d) => Object.assign({ id: d.id, fromUid: d.id }, d.data()));
  }

  async function listFriends(uid) {
    const f = await fb();
    if (!f || !f.configured) return [];
    const { collection, getDocs } = f.dbFns;
    const snap = await getDocs(collection(f.db, 'users', uid, 'friends'));
    return snap.docs.map((d) => Object.assign({ friendUid: d.id }, d.data()));
  }

  async function hydrateFriendsFromHubs(friends) {
    if (!friends.length) return friends;
    return Promise.all(friends.map(async (fr) => {
      const hub = fr.publicId
        ? await loadHubByPublicId(fr.publicId)
        : null;
      if (!hub) return fr;
      return Object.assign({}, fr, {
        displayName: hub.displayName || fr.displayName || 'ユーザー',
        avatarURL: hub.avatarURL != null ? hub.avatarURL : (fr.avatarURL || ''),
        publicId: hub.publicId || fr.publicId || '',
      });
    }));
  }

  /** 表示名・アバター変更を、相互フレンドの一覧キャッシュへ反映 */
  async function syncFriendProfileForPeers(uid, hub) {
    const f = await fb();
    if (!f || !f.configured || !uid || !hub) return;
    const friends = await listFriends(uid);
    if (!friends.length) return;
    const { doc, setDoc } = f.dbFns;
    const patch = {
      displayName: hub.displayName || '',
      avatarURL: hub.avatarURL || '',
      publicId: hub.publicId || '',
    };
    await Promise.all(friends.map((fr) => {
      if (!fr.friendUid) return Promise.resolve();
      return setDoc(doc(f.db, 'users', fr.friendUid, 'friends', uid), patch, { merge: true });
    }));
  }

  function friendAvatar(meta, className) {
    const cls = 'mp-friend-avatar' + (className ? ' ' + className : '');
    if (meta.avatarURL) {
      return `<div class="${cls} mp-friend-avatar--img"><img src="${esc(meta.avatarURL)}" alt="" loading="lazy"></div>`;
    }
    const initial = (meta.displayName || '?').slice(0, 1);
    return `<div class="${cls}">${esc(initial)}</div>`;
  }

  function statusLabel(status) {
    switch (status) {
      case 'friends': return 'フレンド';
      case 'pending_sent': return '申請済み';
      case 'pending_received': return '申請が届いています';
      default: return '';
    }
  }

  function friendActionErrorMessage(err) {
    const code = err && err.code ? String(err.code) : '';
    if (code === 'permission-denied') {
      return 'ログイン状態を確認できませんでした。一度ログアウトしてから再度ログインしてください。';
    }
    const msg = err && err.message ? String(err.message).trim() : '';
    return msg || 'フレンド操作の読み込みに失敗しました';
  }

  async function renderActionButton(container, myUid, targetHub, opts) {
    if (!container) return;
    if (!targetHub || !targetHub.uid) {
      container.hidden = false;
      container.innerHTML =
        '<p class="friend-action-bar__status friend-action-bar__status--blocked">' +
        'このユーザーはプロフィール登録が未完了のため、フレンド申請できません。</p>';
      return;
    }
    let onChange;
    let source = 'profile';
    if (typeof opts === 'function') {
      onChange = opts;
    } else {
      opts = opts || {};
      onChange = opts.onChange;
      source = normalizeFriendSource(opts.source);
    }

    container.hidden = false;
    container.innerHTML = '<p class="text-muted">読み込み中…</p>';

    for (let attempt = 0; attempt < 3; attempt++) {
      if (isRenderStale(opts)) return;
      try {
        await ensureAuthReady(null);
        if (isRenderStale(opts)) return;

        const status = await getStatus(myUid, targetHub.uid);
        if (isRenderStale(opts)) return;
        if (status === 'self') {
          container.innerHTML = '';
          container.hidden = true;
          return;
        }

        if (status === 'friends') {
          container.innerHTML = '<p class="friend-action-bar__status">👥 フレンド</p>';
          return;
        }
        if (status === 'pending_sent') {
          container.innerHTML =
            '<p class="friend-action-bar__status">フレンド申請を送信しました</p>' +
            '<button type="button" class="btn btn-secondary btn-sm" id="friendCancelBtn">申請を取り消す</button>';
          container.querySelector('#friendCancelBtn').addEventListener('click', async () => {
            const btn = container.querySelector('#friendCancelBtn');
            btn.disabled = true;
            try {
              await cancelRequest(myUid, targetHub.uid);
              if (onChange) await onChange();
              else await renderActionButton(container, myUid, targetHub, opts);
            } catch (e) {
              alert(e.message || String(e));
              btn.disabled = false;
            }
          });
          return;
        }
        if (status === 'pending_received') {
          container.innerHTML =
            '<p class="friend-action-bar__status">このユーザーからフレンド申請が届いています</p>' +
            '<a href="#/mypage" class="btn btn-primary btn-sm" data-link>マイページで承認</a>';
          return;
        }

        const targetSources = await loadFriendRequestSources(targetHub.uid);
        if (isRenderStale(opts)) return;
        if (!isFriendRequestSourceAllowed(targetSources, source)) {
          container.innerHTML =
            '<p class="friend-action-bar__status friend-action-bar__status--blocked">' +
            esc(friendRequestSourceLabel(source) + 'からのフレンド申請は受け付けていません。') +
            '</p>';
          return;
        }

        container.innerHTML = '<button type="button" class="btn btn-primary" id="friendSendBtn">フレンド申請する</button>';
        container.querySelector('#friendSendBtn').addEventListener('click', async () => {
          const btn = container.querySelector('#friendSendBtn');
          btn.disabled = true;
          btn.textContent = '送信中…';
          try {
            await sendRequest(myUid, targetHub, source);
            if (onChange) await onChange();
            else await renderActionButton(container, myUid, targetHub, opts);
          } catch (e) {
            alert(e.message || String(e));
            btn.disabled = false;
            btn.textContent = 'フレンド申請する';
          }
        });
        return;
      } catch (e) {
        if (attempt < 2 && isRetryableFirebaseError(e)) {
          await delay(400 * (attempt + 1));
          continue;
        }
        if (isRenderStale(opts)) return;
        console.error('[friends] renderActionButton:', e);
        container.innerHTML =
          '<p class="form-error">' + esc(friendActionErrorMessage(e)) + '</p>';
        return;
      }
    }
  }

  function updateRequestBadge(box, count) {
    const badge = box.querySelector('#mpFriendRequestBadge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  async function refreshRequestBadge(box, user) {
    try {
      const requests = await listIncomingRequests(user.uid);
      updateRequestBadge(box, requests.length);
      return requests.length;
    } catch (e) {
      console.error(e);
      return 0;
    }
  }

  async function renderRequestsList(rootEl, user, opts) {
    opts = opts || {};
    if (!rootEl) return;

    rootEl.innerHTML = '<p class="text-muted">読み込み中…</p>';
    try {
      const requests = await listIncomingRequests(user.uid);
      if (opts.badgeBox) updateRequestBadge(opts.badgeBox, requests.length);

      if (!requests.length) {
        rootEl.innerHTML = '<p class="text-muted mp-friends-empty">新しいフレンド申請はありません</p>';
        return;
      }

      rootEl.innerHTML = requests.map((req) => `
        <div class="mp-friend-request card" data-from="${esc(req.fromUid)}">
          <div class="mp-friend-request__main">
            ${friendAvatar({ displayName: req.fromDisplayName, avatarURL: req.fromAvatarURL })}
            <div>
              <p class="mp-friend-request__name">${esc(req.fromDisplayName || 'ユーザー')}</p>
              <p class="form-hint">ID: ${esc(req.fromPublicId || '—')}</p>
            </div>
          </div>
          <div class="mp-friend-request__actions">
            <button type="button" class="btn btn-primary btn-sm mpFriendAccept">承認</button>
            <button type="button" class="btn btn-secondary btn-sm mpFriendReject">拒否</button>
          </div>
        </div>
      `).join('');

      rootEl.querySelectorAll('.mp-friend-request').forEach((row) => {
        const fromUid = row.dataset.from;
        row.querySelector('.mpFriendAccept').addEventListener('click', async () => {
          row.querySelector('.mpFriendAccept').disabled = true;
          try {
            await acceptRequest(user.uid, fromUid);
            await renderRequestsList(rootEl, user, opts);
          } catch (e) {
            alert(e.message || String(e));
            row.querySelector('.mpFriendAccept').disabled = false;
          }
        });
        row.querySelector('.mpFriendReject').addEventListener('click', async () => {
          try {
            await rejectRequest(user.uid, fromUid);
            await renderRequestsList(rootEl, user, opts);
          } catch (e) {
            alert(e.message || String(e));
          }
        });
      });
    } catch (e) {
      rootEl.innerHTML = '<p class="form-error">読み込みに失敗しました</p>';
      console.error(e);
    }
  }

  async function renderFriendsList(rootEl, user) {
    if (!rootEl) return;

    rootEl.innerHTML = '<p class="text-muted">読み込み中…</p>';
    try {
      const friends = await hydrateFriendsFromHubs(await listFriends(user.uid));

      if (!friends.length) {
        rootEl.innerHTML = '<p class="text-muted mp-friends-empty">フレンドはまだいません。ID検索またはセカイノートから申請できます</p>';
        return;
      }

      rootEl.innerHTML = friends.map((fr) => `
        <a href="#/p/${esc(fr.publicId)}" class="mp-friend-row card" data-link>
          ${friendAvatar(fr)}
          <div class="mp-friend-row__text">
            <p class="mp-friend-row__name">${esc(fr.displayName || 'ユーザー')}</p>
            <p class="form-hint">セカイノートを見る · ID: ${esc(fr.publicId || '—')}</p>
          </div>
          <span class="mp-friend-row__arrow" aria-hidden="true">→</span>
        </a>
      `).join('');
    } catch (e) {
      rootEl.innerHTML = '<p class="form-error">読み込みに失敗しました</p>';
      console.error(e);
    }
  }

  async function initFriendRequestsPage() {
    const box = document.getElementById('app').querySelector('#friendRequestsRoot');
    if (!box) return;
    await window.MiraiFirebaseReady;
    const user = window.MiraiAuth ? await window.MiraiAuth.requireUser('#/mypage/friend-requests') : null;
    if (!user) return;
    await renderRequestsList(box, user);
  }

  async function initFriendsPage() {
    const box = document.getElementById('app').querySelector('#friendsListRoot');
    if (!box) return;
    await window.MiraiFirebaseReady;
    const user = window.MiraiAuth ? await window.MiraiAuth.requireUser('#/mypage/friends') : null;
    if (!user) return;
    await renderFriendsList(box, user);
  }

  async function resolveSearchUser(fallbackUser) {
    return ensureAuthReady(fallbackUser);
  }

  function friendSearchErrorMessage(err) {
    const code = err && err.code ? String(err.code) : '';
    if (code === 'permission-denied') {
      return 'ログイン状態を確認できませんでした。一度ログアウトしてから再度ログインしてください。';
    }
    if (code === 'unavailable' || code === 'failed-precondition') {
      return '通信エラーです。しばらくしてから再度お試しください。';
    }
    const msg = err && err.message ? String(err.message).trim() : '';
    return msg || '検索に失敗しました';
  }

  function initFriendIdSearch(box, user) {
    const input = box.querySelector('#mpFriendIdSearch');
    const btn = box.querySelector('#mpFriendIdSearchBtn');
    const resultEl = box.querySelector('#mpFriendIdSearchResult');
    if (!input || !btn || !resultEl) return;

    let searchSeq = 0;
    let actionRenderSeq = 0;

    async function runSearch() {
      const seq = ++searchSeq;
      const isStale = () => seq !== searchSeq;

      resultEl.innerHTML = '';
      const id = normalizePublicId(input.value);
      if (!id) {
        resultEl.innerHTML = '<p class="form-error">IDを入力してください。</p>';
        return;
      }
      if (id.length < 4) {
        resultEl.innerHTML = '<p class="form-error">IDの形式が正しくありません。</p>';
        return;
      }

      resultEl.innerHTML = '<p class="text-muted">検索中…</p>';
      btn.disabled = true;
      try {
        const searchUser = await resolveSearchUser(user);
        if (isStale()) return;
        if (!searchUser) {
          resultEl.innerHTML =
            '<p class="form-error">フレンド検索にはログインが必要です。</p>' +
            '<p class="form-hint mt-1"><a href="#/login" data-link>ログインする</a></p>';
          return;
        }

        const hub = await loadHubByPublicId(id);
        if (isStale()) return;
        if (!hub) {
          resultEl.innerHTML =
            '<p class="form-error">該当するユーザーが見つかりませんでした。</p>' +
            '<p class="form-hint mt-1">相手がマイページを一度も開いていない、またはプロフィール登録が完了していない可能性があります。</p>';
          return;
        }
        if (hub.uid && hub.uid === searchUser.uid) {
          resultEl.innerHTML = '<p class="text-muted mp-friends-empty">これはあなた自身のIDです。</p>';
          return;
        }

        resultEl.innerHTML = `
          <div class="mp-friend-search-result card">
            <div class="mp-friend-search-result__main">
              ${friendAvatar(hub)}
              <div class="mp-friend-search-result__text">
                <p class="mp-friend-search-result__name">${esc(hub.displayName || 'ユーザー')}</p>
                <p class="form-hint">未来喫茶ID: ${esc(hub.publicId || id)}</p>
              </div>
            </div>
            <div class="mp-friend-search-result__actions">
              <a href="${esc(profileLink(hub.publicId || id, 'idSearch'))}" class="btn btn-secondary btn-sm" data-link>セカイノートを見る</a>
              <div id="mpFriendIdSearchAction"></div>
            </div>
          </div>
        `;
        if (isStale()) return;
        const actionEl = resultEl.querySelector('#mpFriendIdSearchAction');
        if (actionEl) {
          const myActionSeq = ++actionRenderSeq;
          await renderActionButton(actionEl, searchUser.uid, hub, {
            onChange: () => runSearch(),
            source: 'idSearch',
            isRenderStale: () => isStale() || myActionSeq !== actionRenderSeq,
          });
        }
      } catch (e) {
        if (isStale()) return;
        resultEl.innerHTML = '<p class="form-error">' + esc(friendSearchErrorMessage(e)) + '</p>';
        console.error(e);
      } finally {
        if (!isStale()) btn.disabled = false;
      }
    }

    btn.addEventListener('click', runSearch);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearch();
      }
    });
  }

  function initMypageFriends(box, user) {
    refreshRequestBadge(box, user);
    initFriendIdSearch(box, user);
  }

  return {
    FRIEND_REQUEST_SOURCES,
    DEFAULT_FRIEND_REQUEST_SOURCES,
    getStatus,
    sendRequest,
    cancelRequest,
    acceptRequest,
    rejectRequest,
    listIncomingRequests,
    listFriends,
    hydrateFriendsFromHubs,
    syncFriendProfileForPeers,
    loadHubByPublicId,
    normalizePublicId,
    loadFriendRequestSources,
    saveFriendRequestSources,
    listBlockedUsers,
    listBlockedUids,
    blockUser,
    unblockUser,
    friendRequestSettingsHtml,
    readFriendRequestSourcesFromDom,
    profileLink,
    parseFriendSourceFromHash,
    renderActionButton,
    initMypageFriends,
    ensureAuthReady,
    initFriendRequestsPage,
    initFriendsPage,
    initFriendRequestSettingsPage,
  };
})();

window.MiraiFriends = MiraiFriends;
