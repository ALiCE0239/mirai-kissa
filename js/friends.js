/**
 * 未来喫茶 — フレンド申請 / フレンド一覧
 *
 * users/{uid}/friendRequests/{fromUid}  … 受信した申請（fromUid が申請者）
 * users/{uid}/friends/{friendUid}       … フレンド一覧
 */
const MiraiFriends = (function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  async function fb() {
    return window.MiraiFirebaseReady ? await window.MiraiFirebaseReady : null;
  }

  async function loadHubByUid(uid) {
    const f = await fb();
    if (!f || !f.configured) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, 'users', uid, 'sns', 'linkHub'));
    return snap.exists() ? snap.data() : null;
  }

  async function loadHubByPublicId(publicId) {
    const f = await fb();
    if (!f || !f.configured) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, 'linkHubs', publicId));
    return snap.exists() ? snap.data() : null;
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
    const [friendSnap, sentSnap, recvSnap] = await Promise.all([
      getDoc(doc(f.db, 'users', myUid, 'friends', targetUid)),
      getDoc(doc(f.db, 'users', targetUid, 'friendRequests', myUid)),
      getDoc(doc(f.db, 'users', myUid, 'friendRequests', targetUid)),
    ]);
    if (friendSnap.exists()) return 'friends';
    if (sentSnap.exists() && sentSnap.data().status === 'pending') return 'pending_sent';
    if (recvSnap.exists() && recvSnap.data().status === 'pending') return 'pending_received';
    return 'none';
  }

  async function sendRequest(myUid, targetHub) {
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const targetUid = targetHub && targetHub.uid;
    if (!targetUid) throw new Error('ユーザーが見つかりません。');
    if (myUid === targetUid) throw new Error('自分自身には申請できません。');

    const status = await getStatus(myUid, targetUid);
    if (status === 'friends') throw new Error('すでにフレンドです。');
    if (status === 'pending_sent') throw new Error('申請済みです。');
    if (status === 'pending_received') throw new Error('相手から申請が来ています。マイページで承認してください。');

    const myHub = await loadHubByUid(myUid);
    const { doc, setDoc, serverTimestamp } = f.dbFns;
    await setDoc(doc(f.db, 'users', targetUid, 'friendRequests', myUid), {
      fromUid: myUid,
      fromPublicId: (myHub && myHub.publicId) || '',
      fromDisplayName: (myHub && myHub.displayName) || 'ユーザー',
      fromAvatarURL: (myHub && myHub.avatarURL) || '',
      status: 'pending',
      createdAt: serverTimestamp(),
    });
  }

  async function cancelRequest(myUid, targetUid) {
    const f = await fb();
    if (!f || !f.configured) return;
    const { doc, deleteDoc } = f.dbFns;
    await deleteDoc(doc(f.db, 'users', targetUid, 'friendRequests', myUid));
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
    const snap = await getDocs(
      query(collection(f.db, 'users', uid, 'friendRequests'), where('status', '==', 'pending'))
    );
    return snap.docs.map((d) => Object.assign({ id: d.id, fromUid: d.id }, d.data()));
  }

  async function listFriends(uid) {
    const f = await fb();
    if (!f || !f.configured) return [];
    const { collection, getDocs } = f.dbFns;
    const snap = await getDocs(collection(f.db, 'users', uid, 'friends'));
    return snap.docs.map((d) => Object.assign({ friendUid: d.id }, d.data()));
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

  async function renderActionButton(container, myUid, targetHub, onChange) {
    if (!container || !targetHub || !targetHub.uid) return;
    const status = await getStatus(myUid, targetHub.uid);
    if (status === 'self') {
      container.innerHTML = '';
      container.hidden = true;
      return;
    }
    container.hidden = false;

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
          else await renderActionButton(container, myUid, targetHub, onChange);
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

    container.innerHTML = '<button type="button" class="btn btn-primary" id="friendSendBtn">フレンド申請する</button>';
    container.querySelector('#friendSendBtn').addEventListener('click', async () => {
      const btn = container.querySelector('#friendSendBtn');
      btn.disabled = true;
      btn.textContent = '送信中…';
      try {
        await sendRequest(myUid, targetHub);
        if (onChange) await onChange();
        else await renderActionButton(container, myUid, targetHub, onChange);
      } catch (e) {
        alert(e.message || String(e));
        btn.disabled = false;
        btn.textContent = 'フレンド申請する';
      }
    });
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
      const friends = await listFriends(user.uid);

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

  function initFriendIdSearch(box, user) {
    const input = box.querySelector('#mpFriendIdSearch');
    const btn = box.querySelector('#mpFriendIdSearchBtn');
    const resultEl = box.querySelector('#mpFriendIdSearchResult');
    if (!input || !btn || !resultEl) return;

    async function runSearch() {
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
        const hub = await loadHubByPublicId(id);
        if (!hub || !hub.uid) {
          resultEl.innerHTML = '<p class="form-error">該当するユーザーが見つかりませんでした。</p>';
          return;
        }
        if (hub.uid === user.uid) {
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
              <a href="#/p/${esc(hub.publicId || id)}" class="btn btn-secondary btn-sm" data-link>セカイノートを見る</a>
              <div id="mpFriendIdSearchAction"></div>
            </div>
          </div>
        `;
        const actionEl = resultEl.querySelector('#mpFriendIdSearchAction');
        await renderActionButton(actionEl, user.uid, hub, () => runSearch());
      } catch (e) {
        resultEl.innerHTML = '<p class="form-error">検索に失敗しました</p>';
        console.error(e);
      } finally {
        btn.disabled = false;
      }
    }

    btn.addEventListener('click', runSearch);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runSearch();
    });
  }

  function initMypageFriends(box, user) {
    refreshRequestBadge(box, user);
    initFriendIdSearch(box, user);
  }

  return {
    getStatus,
    sendRequest,
    cancelRequest,
    acceptRequest,
    rejectRequest,
    listIncomingRequests,
    listFriends,
    loadHubByPublicId,
    normalizePublicId,
    renderActionButton,
    initMypageFriends,
    initFriendRequestsPage,
    initFriendsPage,
  };
})();

window.MiraiFriends = MiraiFriends;
