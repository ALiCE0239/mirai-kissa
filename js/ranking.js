/**
 * 未来喫茶 — ランキング（チャレンジライブスコア / キャラクターランク）
 *
 * - #/ranking                          ランキング種別の選択
 * - #/ranking/challenge_live           チャレンジライブスコア一覧
 * - #/ranking/character_rank           キャラクターランク一覧
 * - #/mypage/ranking                   登録メニュー（要ログイン）
 * - #/mypage/ranking/:type             申請フォーム（要ログイン）
 *
 * 1アカウント・種別1件。更新は再申請（moderationStatus: pending）。
 * 証拠画像は Firebase Storage ではなく外部 URL。
 */
const MiraiRanking = (function () {
  'use strict';

  const COLLECTION = 'rankingEntries';

  const TYPES = {
    challenge_live: {
      id: 'challenge_live',
      label: 'チャレンジライブスコア',
      shortLabel: 'チャレンジスコア',
      scoreLabel: 'スコア',
      scorePlaceholder: '例: 985432',
      sortDesc: true,
    },
    character_rank: {
      id: 'character_rank',
      label: 'キャラクターランク',
      shortLabel: 'キャラランク',
      scoreLabel: 'キャラランク',
      scorePlaceholder: '例: 42',
      sortDesc: true,
    },
  };

  const STATUS_LABELS = {
    pending: '審査中',
    approved: '掲載中',
    rejected: '却下',
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function typeMeta(type) {
    return TYPES[type] || null;
  }

  function docId(uid, type) {
    return uid + '_' + type;
  }

  function normalizeUrl(url) {
    const u = String(url || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return 'https://' + u;
  }

  function formatScore(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    if (typeof window.fmtNum === 'function') return window.fmtNum(v);
    return v.toLocaleString('ja-JP');
  }

  async function fb() {
    return window.MiraiFirebaseReady ? await window.MiraiFirebaseReady : null;
  }

  function isConfigured(f) {
    return !!(f && f.configured);
  }

  function notConfiguredHtml() {
    return '<div class="info-box"><p>この機能は準備中です（Firebase 未設定）。</p></div>';
  }

  function characterOptionsHtml(selectedKey) {
    const mp = window.MiraiMyPage;
    if (!mp || typeof mp.getCardThemes !== 'function') {
      return '<option value="">キャラクター一覧を読み込めません</option>';
    }
    const themes = mp.getCardThemes();
    const groups = mp.getCardThemeGroups();
    const sel = mp.normalizeCardThemeKey(selectedKey || '');
    return groups.map((g) => {
      const keys = Object.keys(themes).filter((k) => themes[k].group === g.id);
      if (!keys.length) return '';
      const opts = keys.map((k) => {
        const t = themes[k];
        return '<option value="' + esc(k) + '"' + (k === sel ? ' selected' : '') + '>' + esc(t.name) + '</option>';
      }).join('');
      return '<optgroup label="' + esc(g.label) + '">' + opts + '</optgroup>';
    }).join('');
  }

  function characterName(key) {
    const mp = window.MiraiMyPage;
    if (!mp) return key || '';
    const themes = mp.getCardThemes();
    const k = mp.normalizeCardThemeKey(key);
    return themes[k] ? themes[k].name : key || '';
  }

  function characterAccent(key) {
    const mp = window.MiraiMyPage;
    if (!mp) return '#14b8a6';
    const themes = mp.getCardThemes();
    const k = mp.normalizeCardThemeKey(key);
    return themes[k] ? themes[k].accent : '#14b8a6';
  }

  async function requireUser(box) {
    await window.MiraiFirebaseReady;
    const user = window.MiraiAuth && window.MiraiAuth.getUser();
    if (!user) {
      box.innerHTML =
        '<div class="info-box"><p>ログインが必要です。</p>' +
        '<p class="mt-2"><a href="#/login" class="btn btn-primary" data-link>ログインする</a></p></div>';
      return null;
    }
    return user;
  }

  async function loadOwnHub(uid) {
    if (window.MiraiMyPage && typeof window.MiraiMyPage.loadHub !== 'function') return null;
    const f = await fb();
    if (!isConfigured(f)) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, 'users', uid, 'sns', 'linkHub'));
    return snap.exists() ? snap.data() : null;
  }

  async function fetchOwnEntry(uid, type) {
    const f = await fb();
    if (!isConfigured(f)) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, COLLECTION, docId(uid, type)));
    return snap.exists() ? snap.data() : null;
  }

  async function fetchApprovedByType(type) {
    const f = await fb();
    if (!isConfigured(f)) return [];
    const { collection, query, where, limit, getDocs } = f.dbFns;
    const col = collection(f.db, COLLECTION);
    const queries = [
      () => query(col, where('type', '==', type), where('moderationStatus', '==', 'approved'), limit(200)),
      () => query(col, where('moderationStatus', '==', 'approved'), limit(300)),
      () => query(col, limit(300)),
    ];
    let lastErr = null;
    for (const build of queries) {
      try {
        const snap = await getDocs(build());
        return snap.docs
          .map((d) => Object.assign({ id: d.id }, d.data()))
          .filter((e) => e.type === type && e.moderationStatus === 'approved');
      } catch (e) {
        lastErr = e;
        if (e.code !== 'failed-precondition' && e.code !== 'permission-denied' && e.code !== 'invalid-argument') {
          throw e;
        }
      }
    }
    throw lastErr || new Error('ランキングの取得に失敗しました');
  }

  async function fetchPendingEntries() {
    const f = await fb();
    if (!isConfigured(f)) return [];
    const { collection, query, where, limit, getDocs } = f.dbFns;
    const col = collection(f.db, COLLECTION);
    try {
      const snap = await getDocs(query(col, where('moderationStatus', '==', 'pending'), limit(100)));
      return snap.docs.map((d) => Object.assign({ id: d.id }, d.data()));
    } catch (e) {
      const snap = await getDocs(query(col, limit(200)));
      return snap.docs
        .map((d) => Object.assign({ id: d.id }, d.data()))
        .filter((row) => row.moderationStatus === 'pending');
    }
  }

  function sortEntries(entries, type) {
    const meta = typeMeta(type);
    const desc = meta ? meta.sortDesc !== false : true;
    return entries.slice().sort((a, b) => {
      const sa = Number(a.score) || 0;
      const sb = Number(b.score) || 0;
      if (sb !== sa) return desc ? sb - sa : sa - sb;
      const ta = a.updatedAt && a.updatedAt.toMillis ? a.updatedAt.toMillis() : 0;
      const tb = b.updatedAt && b.updatedAt.toMillis ? b.updatedAt.toMillis() : 0;
      return tb - ta;
    });
  }

  function summaryText(entry, type) {
    const meta = typeMeta(type);
    if (!entry) return '未登録 — 「ランキングに登録」から申請できます';
    const status = STATUS_LABELS[entry.moderationStatus] || entry.moderationStatus;
    const char = entry.characterName || characterName(entry.characterKey);
    const parts = [char, (meta && meta.scoreLabel) + ' ' + formatScore(entry.score), status];
    if (entry.moderationStatus === 'rejected' && entry.rejectionReason) {
      parts.push('理由: ' + entry.rejectionReason);
    }
    return parts.join(' · ');
  }

  function entryRowHtml(entry, rank) {
    const accent = characterAccent(entry.characterKey);
    const profile = entry.authorPublicId
      ? '<a href="#/p/' + esc(entry.authorPublicId) + '" class="ranking-row__name" data-link>' + esc(entry.playerName || entry.authorName || '匿名') + '</a>'
      : '<span class="ranking-row__name">' + esc(entry.playerName || entry.authorName || '匿名') + '</span>';
    return (
      '<li class="ranking-row" style="--ranking-accent:' + esc(accent) + '">' +
      '<span class="ranking-row__rank">' + rank + '</span>' +
      '<span class="ranking-row__char">' + esc(entry.characterName || characterName(entry.characterKey)) + '</span>' +
      '<span class="ranking-row__player">' + profile + '</span>' +
      '<span class="ranking-row__score">' + formatScore(entry.score) + '</span>' +
      '</li>'
    );
  }

  function typeNavHtml(activeType, linkMode) {
    return (
      '<nav class="ranking-picker" aria-label="ランキング種別">' +
      Object.keys(TYPES).map((t) => {
        const m = TYPES[t];
        const label = m.shortLabel || m.label;
        const active = t === activeType ? ' is-active' : '';
        if (linkMode) {
          return '<a href="#/ranking/' + t + '" class="ranking-picker__btn' + active + '" data-link>' + esc(label) + '</a>';
        }
        return '<button type="button" class="ranking-picker__btn' + active + '" data-ranking-go="' + t + '">' + esc(label) + '</button>';
      }).join('') +
      '</nav>'
    );
  }

  function panelHtml(type, entries) {
    const meta = typeMeta(type);
    const list = entries.length
      ? '<ol class="ranking-list">' + entries.map((e, i) => entryRowHtml(e, i + 1)).join('') + '</ol>'
      : '<p class="text-muted ranking-empty">まだ掲載されている記録はありません。</p>';
    return (
      '<section class="ranking-panel" data-ranking-panel="' + type + '">' +
      '<div class="ranking-panel__head">' +
      '<h2>' + esc(meta.label) + '</h2>' +
      '<p class="form-hint">管理者承認済みの記録のみ表示しています。</p></div>' +
      '<div class="ranking-table-head" aria-hidden="true">' +
      '<span>順位</span><span>キャラ</span><span>名前</span><span>' + esc(meta.scoreLabel) + '</span></div>' +
      list +
      '</section>'
    );
  }

  async function initHub() {
    const root = document.getElementById('app');
    const box = root.querySelector('#rankingRoot');
    if (!box) return;

    const header = root.querySelector('.calc-header p');
    if (header) header.textContent = '見たいランキングを選んでください';

    box.innerHTML =
      '<div class="ranking-page ranking-page--hub">' +
      '<p class="form-hint ranking-page__lead">チャレンジライブスコアとキャラクターランクの記録を閲覧できます。</p>' +
      typeNavHtml(null, false) +
      '</div>';

    box.querySelectorAll('[data-ranking-go]').forEach((btn) => {
      btn.addEventListener('click', () => {
        location.hash = '#/ranking/' + btn.dataset.rankingGo;
      });
    });
  }

  async function initView(params) {
    const root = document.getElementById('app');
    const box = root.querySelector('#rankingRoot');
    if (!box) return;

    const type = params && params.type;
    const meta = typeMeta(type);
    if (!meta) {
      location.hash = '#/ranking';
      return;
    }

    if (!isConfigured(await fb())) {
      box.innerHTML = notConfiguredHtml();
      return;
    }

    const header = root.querySelector('.calc-header p');
    if (header) header.textContent = meta.label;

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';

    try {
      const entries = sortEntries(await fetchApprovedByType(type), type);
      box.innerHTML =
        '<div class="ranking-page">' +
        '<p class="ranking-page__back"><a href="#/ranking" class="back-link" data-link>← ランキング一覧に戻る</a></p>' +
        typeNavHtml(type, true) +
        panelHtml(type, entries) +
        '</div>';
    } catch (e) {
      box.innerHTML = '<div class="info-box"><p>読み込みに失敗しました。</p><p class="form-error mt-1">' + esc(e.message || String(e)) + '</p></div>';
    }
  }

  async function initList() {
    return initHub();
  }

  async function initMypageHub() {
    const box = document.getElementById('app').querySelector('#rankingHubRoot');
    if (!box) return;
    if (!isConfigured(await fb())) { box.innerHTML = notConfiguredHtml(); return; }
    box.innerHTML = '<p class="text-muted">読み込み中…</p>';
    const user = await requireUser(box);
    if (!user) return;

    const entries = await Promise.all(
      Object.keys(TYPES).map(async (type) => ({ type, entry: await fetchOwnEntry(user.uid, type) }))
    );

    box.innerHTML =
      '<p class="form-hint">各項目1件まで。更新する場合は再申請となり、管理者の承認後にランキングへ反映されます。</p>' +
      '<p class="form-hint mt-1">証拠画像は X や Imgur 等に投稿したURLを貼ってください（サイト内には保存しません）。</p>' +
      entries.map(({ type, entry }) => {
        const meta = typeMeta(type);
        const status = entry ? (STATUS_LABELS[entry.moderationStatus] || '—') : '未登録';
        return (
          '<section class="card ranking-hub-card">' +
          '<div class="ranking-hub-card__head">' +
          '<div><h3>' + esc(meta.label) + '</h3>' +
          '<p class="text-muted">' + esc(summaryText(entry, type)) + '</p></div>' +
          '<a href="#/mypage/ranking/' + type + '" class="btn btn-primary btn-sm" data-link>' +
          (entry ? '再申請する' : '登録する') + '</a></div>' +
          '<p class="form-hint">状態: <strong>' + esc(status) + '</strong></p>' +
          '</section>'
        );
      }).join('') +
      '<a href="#/ranking" class="btn btn-secondary mt-3" data-link>ランキングを見る</a>' +
      '<a href="#/mypage" class="btn btn-secondary mt-3" data-link>マイページに戻る</a>';
  }

  async function initEdit(params) {
    const box = document.getElementById('app').querySelector('#rankingEditRoot');
    if (!box) return;
    const type = params && params.type;
    const meta = typeMeta(type);
    if (!meta) {
      box.innerHTML = '<div class="info-box"><p>種別が正しくありません。</p><a href="#/mypage/ranking" class="btn btn-secondary mt-2" data-link>戻る</a></div>';
      return;
    }
    if (!isConfigured(await fb())) { box.innerHTML = notConfiguredHtml(); return; }
    box.innerHTML = '<p class="text-muted">読み込み中…</p>';
    const user = await requireUser(box);
    if (!user) return;

    const hub = await loadOwnHub(user.uid);
    const existing = await fetchOwnEntry(user.uid, type);
    const entry = existing || {
      characterKey: 'kaito',
      characterName: characterName('kaito'),
      playerName: (hub && hub.displayName) || '',
      score: '',
      proofURL: '',
      note: '',
    };

    const statusNote = existing
      ? '<div class="info-box mb-2"><p>現在の状態: <strong>' + esc(STATUS_LABELS[existing.moderationStatus] || existing.moderationStatus) + '</strong></p>' +
        (existing.moderationStatus === 'rejected' && existing.rejectionReason
          ? '<p class="form-error mt-1">却下理由: ' + esc(existing.rejectionReason) + '</p>' : '') +
        '<p class="form-hint mt-1">保存すると再申請（審査中）になります。</p></div>'
      : '';

    box.innerHTML =
      statusNote +
      '<section class="card community-editor mp-board-editor">' +
      '<h2 class="community-editor__title">' + esc(meta.label) + 'を登録</h2>' +
      '<div class="form-group"><label for="rkCharacter">キャラクター</label>' +
      '<select class="form-select" id="rkCharacter">' + characterOptionsHtml(entry.characterKey) + '</select></div>' +
      '<div class="form-group"><label for="rkPlayerName">名前（ランキング表示名）</label>' +
      '<input type="text" class="form-input" id="rkPlayerName" maxlength="30" value="' + esc(entry.playerName || '') + '" placeholder="ゲーム内の名前など"></div>' +
      '<div class="form-group"><label for="rkScore">' + esc(meta.scoreLabel) + '</label>' +
      '<input type="number" class="form-input" id="rkScore" min="1" max="99999999" value="' + esc(entry.score != null ? entry.score : '') + '" placeholder="' + esc(meta.scorePlaceholder) + '"></div>' +
      '<div class="form-group"><label for="rkProof">証拠画像のURL <span class="text-muted">（必須）</span></label>' +
      '<input type="url" class="form-input" id="rkProof" value="' + esc(entry.proofURL || '') + '" placeholder="https://x.com/... または https://i.imgur.com/...">' +
      '<p class="form-hint mt-1">スクリーンショットを X・Imgur 等に投稿し、公開URLを貼ってください。Firebase には保存しません。</p></div>' +
      '<div class="form-group"><label for="rkNote">補足（任意）</label>' +
      '<textarea class="form-input" id="rkNote" rows="2" maxlength="200" placeholder="楽曲名・難易度など">' + esc(entry.note || '') + '</textarea></div>' +
      '<p id="rkError" class="form-error mt-2" hidden></p>' +
      '<button type="button" class="btn btn-primary btn-block" id="rkSave">' + (existing ? '再申請する' : '申請する') + '</button>' +
      '<p id="rkSaved" class="community-saved mt-2" hidden>申請しました ✓ 管理者の承認をお待ちください</p>' +
      '</section>' +
      '<a href="#/mypage/ranking" class="btn btn-secondary mt-3" data-link>登録メニューに戻る</a>';

    const errEl = box.querySelector('#rkError');
    const savedEl = box.querySelector('#rkSaved');
    box.querySelector('#rkSave').addEventListener('click', async () => {
      errEl.hidden = true;
      savedEl.hidden = true;
      const charKey = box.querySelector('#rkCharacter').value;
      const playerName = box.querySelector('#rkPlayerName').value.trim();
      const score = parseInt(box.querySelector('#rkScore').value, 10);
      const proofURL = normalizeUrl(box.querySelector('#rkProof').value);
      const note = box.querySelector('#rkNote').value.trim();

      if (!charKey) { errEl.textContent = 'キャラクターを選んでください。'; errEl.hidden = false; return; }
      if (!playerName) { errEl.textContent = '名前を入力してください。'; errEl.hidden = false; return; }
      if (!Number.isFinite(score) || score < 1) { errEl.textContent = meta.scoreLabel + 'を正しく入力してください。'; errEl.hidden = false; return; }
      if (!proofURL) { errEl.textContent = '証拠画像のURLを入力してください。'; errEl.hidden = false; return; }

      const btn = box.querySelector('#rkSave');
      btn.disabled = true;
      btn.textContent = '送信中…';
      try {
        const f = await fb();
        const { doc, setDoc, serverTimestamp } = f.dbFns;
        const freshHub = await loadOwnHub(user.uid);
        const data = {
          authorUid: user.uid,
          authorPublicId: (freshHub && freshHub.publicId) || (entry.authorPublicId || ''),
          authorName: (freshHub && freshHub.displayName) || playerName,
          authorAvatarURL: (freshHub && freshHub.avatarURL) || null,
          type: type,
          characterKey: charKey,
          characterName: characterName(charKey),
          playerName: playerName,
          score: score,
          proofURL: proofURL,
          note: note || '',
          moderationStatus: 'pending',
          rejectionReason: null,
          updatedAt: serverTimestamp(),
          submittedAt: serverTimestamp(),
        };
        if (!existing) data.createdAt = serverTimestamp();
        await setDoc(doc(f.db, COLLECTION, docId(user.uid, type)), data, { merge: true });
        savedEl.hidden = false;
        setTimeout(() => { location.hash = '#/mypage/ranking'; }, 1600);
      } catch (e) {
        errEl.textContent = e.message || String(e);
        errEl.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = existing ? '再申請する' : '申請する';
      }
    });
  }

  async function moderateEntry(entryId, action, adminUid, reason) {
    const f = await fb();
    if (!isConfigured(f)) throw new Error('Firebase 未設定');
    const { doc, updateDoc, serverTimestamp } = f.dbFns;
    const payload = {
      updatedAt: serverTimestamp(),
      approvedBy: adminUid,
    };
    if (action === 'approve') {
      payload.moderationStatus = 'approved';
      payload.approvedAt = serverTimestamp();
      payload.rejectionReason = null;
    } else {
      payload.moderationStatus = 'rejected';
      payload.rejectionReason = String(reason || '').trim() || '内容を確認できませんでした';
    }
    await updateDoc(doc(f.db, COLLECTION, entryId), payload);
  }

  return {
    TYPES,
    STATUS_LABELS,
    typeMeta,
    docId,
    fetchOwnEntry,
    fetchApprovedByType,
    fetchPendingEntries,
    summaryText,
    initHub,
    initView,
    initList,
    initMypageHub,
    initEdit,
    moderateEntry,
  };
})();

window.MiraiRanking = MiraiRanking;
