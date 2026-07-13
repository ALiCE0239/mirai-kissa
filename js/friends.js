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

  async function renderRequestsList(box, user) {
    const requestsEl = box.querySelector('#mpFriendRequests');
    if (!requestsEl) return;

    requestsEl.innerHTML = '<p class="text-muted">読み込み中…</p>';
    try {
      const requests = await listIncomingRequests(user.uid);
      updateRequestBadge(box, requests.length);

      if (!requests.length) {
        requestsEl.innerHTML = '<p class="text-muted mp-friends-empty">新しいフレンド申請はありません</p>';
        return;
      }

      requestsEl.innerHTML = requests.map((req) => `
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

      requestsEl.querySelectorAll('.mp-friend-request').forEach((row) => {
        const fromUid = row.dataset.from;
        row.querySelector('.mpFriendAccept').addEventListener('click', async () => {
          row.querySelector('.mpFriendAccept').disabled = true;
          try {
            await acceptRequest(user.uid, fromUid);
            await renderRequestsList(box, user);
            if (box.querySelector('#mpFriendsListPanel') && !box.querySelector('#mpFriendsListPanel').hidden) {
              await renderFriendsList(box, user);
            }
          } catch (e) {
            alert(e.message || String(e));
            row.querySelector('.mpFriendAccept').disabled = false;
          }
        });
        row.querySelector('.mpFriendReject').addEventListener('click', async () => {
          try {
            await rejectRequest(user.uid, fromUid);
            await renderRequestsList(box, user);
          } catch (e) {
            alert(e.message || String(e));
          }
        });
      });
    } catch (e) {
      requestsEl.innerHTML = '<p class="form-error">読み込みに失敗しました</p>';
      console.error(e);
    }
  }

  async function renderFriendsList(box, user) {
    const friendsEl = box.querySelector('#mpFriendsList');
    if (!friendsEl) return;

    friendsEl.innerHTML = '<p class="text-muted">読み込み中…</p>';
    try {
      const friends = await listFriends(user.uid);

      if (!friends.length) {
        friendsEl.innerHTML = '<p class="text-muted mp-friends-empty">フレンドはまだいません。セカイノートを読み取って申請できます</p>';
        return;
      }

      friendsEl.innerHTML = friends.map((fr) => `
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
      friendsEl.innerHTML = '<p class="form-error">読み込みに失敗しました</p>';
      console.error(e);
    }
  }

  function initMypageFriends(box, user) {
    const requestsToggle = box.querySelector('#mpFriendRequestsToggle');
    const friendsToggle = box.querySelector('#mpFriendsListToggle');
    const requestsPanel = box.querySelector('#mpFriendRequestsPanel');
    const friendsPanel = box.querySelector('#mpFriendsListPanel');
    if (!requestsToggle || !friendsToggle || !requestsPanel || !friendsPanel) return;

    requestsToggle.dataset.labelDefault = 'フレンド申請';
    friendsToggle.dataset.labelDefault = 'フレンド一覧';

    function closePanel(toggle, panel) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = toggle.dataset.labelDefault;
    }

    function openPanel(toggle, panel, otherToggle, otherPanel) {
      if (otherPanel && !otherPanel.hidden) closePanel(otherToggle, otherPanel);
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      toggle.textContent = toggle.dataset.labelDefault + 'を閉じる';
    }

    requestsToggle.addEventListener('click', async () => {
      const open = requestsToggle.getAttribute('aria-expanded') === 'true';
      if (open) {
        closePanel(requestsToggle, requestsPanel);
        return;
      }
      openPanel(requestsToggle, requestsPanel, friendsToggle, friendsPanel);
      await renderRequestsList(box, user);
    });

    friendsToggle.addEventListener('click', async () => {
      const open = friendsToggle.getAttribute('aria-expanded') === 'true';
      if (open) {
        closePanel(friendsToggle, friendsPanel);
        return;
      }
      openPanel(friendsToggle, friendsPanel, requestsToggle, requestsPanel);
      await renderFriendsList(box, user);
    });

    refreshRequestBadge(box, user);
  }

  return {
    getStatus,
    sendRequest,
    cancelRequest,
    acceptRequest,
    rejectRequest,
    listIncomingRequests,
    listFriends,
    renderActionButton,
    initMypageFriends,
  };
})();

window.MiraiFriends = MiraiFriends;
