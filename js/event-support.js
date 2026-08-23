/**
 * 未来喫茶 — イベラン支援（イベントアーカイブ）
 *
 * ログインユーザーが 1 アカウントにつき最大 3 件のイベントを保管し、
 * イベント中の自分のPt（＋任意で目標順位ボーダー）を時刻付きで記録して、
 * 自作SVGグラフで推移を表示し、着地予想・残り周回プランを提案する。
 * イベント終了時にはバナーページのスクショを 1 枚だけ保存できる。
 *
 * データ:
 *   users/{uid}/eventArchives/{archiveId}   … isPublic のとき公開 read、write は本人のみ
 *   Storage users/{uid}/eventArchives/{archiveId}.jpg … バナー画像1枚
 *
 * 計算は js/pjsk-engine.js の既存関数を再利用（新規式なし）。
 */
const MiraiEventSupport = (function () {
  'use strict';

  const MAX_ARCHIVES = 3;
  const TITLE_MAX = 60;
  const NOTE_MAX = 120;
  const EVENT_VOCALOID_CHARS = ['初音ミク', '鏡音リン', '鏡音レン', '巡音ルカ', 'MEIKO', 'KAITO'];
  const FALLBACK_EVENT_CHARS = [
    '一歌', '咲希', '穂波', '志歩', 'みのり', '遥', '愛莉', '雫', 'こはね', '杏',
    '彰人', '冬弥', '司', 'えむ', '寧々', '類', '奏', 'まふゆ', '絵名', '瑞希',
  ].concat(EVENT_VOCALOID_CHARS);

  function getEventCharList() {
    const engine = window.PjskEngine;
    if (engine && Array.isArray(engine.BANNER_DISPLAY_ORDER)) {
      return engine.BANNER_DISPLAY_ORDER.concat(EVENT_VOCALOID_CHARS);
    }
    return FALLBACK_EVENT_CHARS.slice();
  }

  function normalizeEventChar(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    return getEventCharList().includes(s) ? s : s.slice(0, 20);
  }

  /** 明示指定がなければ、ボーダー推定用バナーがキャラ名のときそれを使う（既存データ互換） */
  function resolveEventChar(a) {
    const explicit = normalizeEventChar(a && a.eventChar);
    if (explicit) return explicit;
    const banner = a && a.banner ? String(a.banner).trim() : '';
    return getEventCharList().includes(banner) ? banner : '';
  }

  function eventCharOptions(selected) {
    const sel = String(selected || '');
    const opts = ['<option value="">未指定</option>'];
    getEventCharList().forEach((name) => {
      opts.push('<option value="' + esc(name) + '"' + (sel === name ? ' selected' : '') + '>' + esc(name) + '</option>');
    });
    return opts.join('');
  }

  function eventCharTagHtml(name) {
    if (!name) return '';
    return '<span class="char-tag">' + esc(name) + '</span>';
  }

  // ---------- 汎用ヘルパー ----------

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function newId() {
    const uuid = (crypto.randomUUID && crypto.randomUUID()) ||
      String(Date.now()) + Math.random().toString(16).slice(2);
    return uuid.replace(/-/g, '').slice(0, 12).toLowerCase();
  }

  function numOrNull(v) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function fmtPt(n) {
    if (n == null) return '—';
    return (typeof window.fmtNum === 'function' ? window.fmtNum(n) : String(Math.round(n))) + ' Pt';
  }

  /** 大きな数を短く（例: 2.3億 / 159万 / 3200） */
  function shortNum(n) {
    n = Math.round(n);
    const abs = Math.abs(n);
    if (abs >= 100000000) {
      const o = n / 100000000;
      return (o % 1 === 0 ? String(o) : o.toFixed(1).replace(/\.0$/, '')) + '億';
    }
    if (abs >= 10000) return Math.round(n / 10000) + '万';
    return String(n);
  }

  function fmtHours(h) {
    if (h == null || !Number.isFinite(h)) return '—';
    if (h >= 24) {
      const d = Math.floor(h / 24);
      const r = Math.round(h - d * 24);
      return r > 0 ? `${d}日${r}時間` : `${d}日`;
    }
    if (h >= 1) return `約${(Math.round(h * 10) / 10)}時間`;
    return `約${Math.max(1, Math.round(h * 60))}分`;
  }

  function fmtDateTime(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function targetRankLabel(rank) {
    if (rank == null) return '指定なし';
    const preset = window.PjskEngine && PjskEngine.TARGET_RANK_PRESETS
      ? PjskEngine.TARGET_RANK_PRESETS.find((p) => p.id === rank)
      : null;
    return preset ? preset.label : rank + '位';
  }

  function normalizeTargetRankHistory(list) {
    if (!Array.isArray(list)) return [];
    return list
      .map((x) => ({
        rank: x && x.rank != null && x.rank !== '' ? Number(x.rank) : null,
        prevRank: x && x.prevRank != null && x.prevRank !== '' ? Number(x.prevRank) : null,
        at: Number(x && x.at) || 0,
      }))
      .filter((x) => x.at)
      .slice(-20);
  }

  function recordTargetRankChange(archive, nextRank) {
    const prev = archive.targetRank != null ? archive.targetRank : null;
    const next = nextRank != null ? nextRank : null;
    if (prev === next) return false;
    const at = Date.now();
    archive.targetRank = next;
    archive.targetRankChangedAt = at;
    const hist = Array.isArray(archive.targetRankHistory) ? archive.targetRankHistory.slice() : [];
    hist.push({ rank: next, prevRank: prev, at });
    archive.targetRankHistory = hist.slice(-20);
    return true;
  }

  function rankStatusHtml(archive) {
    const current = '現在 ' + targetRankLabel(archive.targetRank);
    const changed = archive.targetRankChangedAt
      ? ' · 変更 ' + fmtDateTime(archive.targetRankChangedAt)
      : '';
    return current + changed;
  }

  function rankHistoryHtml(archive) {
    const hist = Array.isArray(archive.targetRankHistory) ? archive.targetRankHistory : [];
    if (!hist.length) return '<p class="form-hint">まだ変更記録はありません。</p>';
    return (
      '<ul class="es-rank-history">' +
      hist.slice().reverse().map((h) =>
        '<li><span>' + esc(targetRankLabel(h.prevRank)) + ' → ' + esc(targetRankLabel(h.rank)) + '</span>' +
        '<time>' + esc(fmtDateTime(h.at)) + '</time></li>'
      ).join('') +
      '</ul>'
    );
  }

  function toInputDate(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const pad = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function toInputTime(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    const pad = (x) => String(x).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /** 日付入力＋時刻入力を ms に合成。日付が空なら null、時刻が空なら 00:00 扱い。 */
  function combineDateTime(dateStr, timeStr) {
    if (!dateStr) return null;
    const t = (timeStr && /^\d{1,2}:\d{2}/.test(timeStr)) ? timeStr : '00:00';
    const ms = new Date(`${dateStr}T${t}`).getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  // ---------- Firebase ----------

  async function fb() {
    return window.MiraiFirebaseReady ? await window.MiraiFirebaseReady : null;
  }

  async function isConfigured() {
    const f = await fb();
    return !!(f && f.configured);
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

  // ---------- データアクセス ----------

  function normalizeArchive(a) {
    a = a || {};
    const p = a.params || {};
    return {
      id: a.id,
      title: String(a.title || '').slice(0, TITLE_MAX),
      eventType: String(a.eventType || '').slice(0, 30),
      eventChar: resolveEventChar(a),
      filterType: a.filterType === 'unit' ? 'unit' : 'banner',
      banner: String(a.banner || ''),
      unit: String(a.unit || ''),
      targetRank: a.targetRank != null && a.targetRank !== '' ? Number(a.targetRank) : null,
      targetRankChangedAt: numOrNull(a.targetRankChangedAt),
      targetRankHistory: normalizeTargetRankHistory(a.targetRankHistory),
      targetPtManual: numOrNull(a.targetPtManual),
      startAt: numOrNull(a.startAt),
      endAt: numOrNull(a.endAt),
      params: {
        sougouryokuMan: numOrNull(p.sougouryokuMan),
        jikkochiPct: numOrNull(p.jikkochiPct),
        bonusPct: numOrNull(p.bonusPct),
        crystals: numOrNull(p.crystals),
        cook: p.cook != null ? Number(p.cook) : 5,
      },
      logs: (Array.isArray(a.logs) ? a.logs : [])
        .map((l) => ({
          at: Number(l.at) || 0,
          myPt: numOrNull(l.myPt),
          borderPt: numOrNull(l.borderPt),
          note: String(l.note || '').slice(0, NOTE_MAX),
        }))
        .filter((l) => l.at && l.myPt != null)
        .sort((x, y) => x.at - y.at),
      finalImageURL: String(a.finalImageURL || ''),
      finalRank: numOrNull(a.finalRank),
      finalPt: numOrNull(a.finalPt),
      resultTargetRank: numOrNull(a.resultTargetRank),
      resultTargetPt: numOrNull(a.resultTargetPt),
      crystalsUsed: numOrNull(a.crystalsUsed),
      isPublic: a.isPublic !== false,
      createdAtMs: Number(a.createdAtMs) || Date.now(),
      updatedAtMs: Number(a.updatedAtMs) || 0,
    };
  }

  function isLocalGuest() {
    return !!(window.MiraiAuth && MiraiAuth.isLocalGuest && MiraiAuth.isLocalGuest());
  }

  function useLocalPreview() {
    if (isLocalGuest()) return true;
    const u = window.MiraiAuth && MiraiAuth.getUser && MiraiAuth.getUser();
    if (u && u.uid === 'local-guest') return true;
    return !!(window.MiraiAuth && typeof MiraiAuth.isLocalDev === 'function' && MiraiAuth.isLocalDev());
  }

  const LOCAL_ARCHIVES_KEY = 'miraiLocalGuestArchives';

  function readLocalArchives() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_ARCHIVES_KEY) || '[]');
      return Array.isArray(raw) ? raw.map((a) => normalizeArchive(a)) : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocalArchives(items) {
    localStorage.setItem(LOCAL_ARCHIVES_KEY, JSON.stringify(items.map((a) => normalizeArchive(a))));
  }

  function seedLocalDemoArchive() {
    const items = readLocalArchives();
    if (items.length) return items;
    const now = Date.now();
    const day = 86400000;
    const demo = normalizeArchive({
      id: 'demoarchive01',
      title: 'プレビュー用イベント',
      startAt: now - 5 * day,
      endAt: now - 6 * 3600000,
      eventChar: '奏',
      filterType: 'banner',
      banner: '奏',
      targetRank: 1000,
      params: { sougouryokuMan: 30, jikkochiPct: 130, bonusPct: 435, crystals: 8000, cook: 5 },
      logs: [
        { at: now - 5 * day + 2 * 3600000, myPt: 180000, borderPt: 210000, note: '開始直後' },
        { at: now - 4 * day, myPt: 520000, borderPt: 580000 },
        { at: now - 2 * day, myPt: 1100000, borderPt: 1210000, note: '中日' },
        { at: now - 8 * 3600000, myPt: 1480000, borderPt: 1550000 },
        { at: now - 7 * 3600000, myPt: 1620000, borderPt: 1590000, note: '終了前' },
      ],
      finalRank: 480,
      finalPt: 1620000,
      resultTargetRank: 1000,
      resultTargetPt: 1590000,
      crystalsUsed: 8000,
      isPublic: true,
      createdAtMs: now - 5 * day,
      updatedAtMs: now,
    });
    writeLocalArchives([demo]);
    return [demo];
  }

  async function listArchives(uid) {
    if (useLocalPreview()) {
      const items = readLocalArchives();
      return items.length ? items : seedLocalDemoArchive();
    }
    const f = await fb();
    if (!f || !f.configured) return [];
    const { collection, getDocs } = f.dbFns;
    const snap = await getDocs(collection(f.db, 'users', uid, 'eventArchives'));
    const items = [];
    const backfill = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      data.id = d.id;
      if (!Object.prototype.hasOwnProperty.call(data, 'isPublic')) {
        data.isPublic = true;
        backfill.push(data);
      }
      items.push(normalizeArchive(data));
    });
    items.sort((a, b) => (b.updatedAtMs || b.createdAtMs || 0) - (a.updatedAtMs || a.createdAtMs || 0));
    backfill.forEach((raw) => {
      saveArchive(uid, normalizeArchive(raw)).catch((e) => {
        console.warn('[event-support] isPublic backfill failed:', e);
      });
    });
    return items;
  }

  async function listPublicArchives(uid) {
    if (useLocalPreview()) {
      const items = readLocalArchives();
      return (items.length ? items : seedLocalDemoArchive()).filter((a) => a.isPublic !== false);
    }
    if (!uid) return [];
    const f = await fb();
    if (!f || !f.configured) return [];
    const { collection, query, where, getDocs } = f.dbFns;
    if (!query || !where) {
      const items = await listArchives(uid);
      return items.filter((a) => a.isPublic !== false);
    }
    const snap = await getDocs(query(
      collection(f.db, 'users', uid, 'eventArchives'),
      where('isPublic', '==', true),
    ));
    const items = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      data.id = d.id;
      items.push(normalizeArchive(data));
    });
    items.sort((a, b) => (b.updatedAtMs || b.createdAtMs || 0) - (a.updatedAtMs || a.createdAtMs || 0));
    return items;
  }

  async function loadArchive(uid, id) {
    if (useLocalPreview()) {
      const items = readLocalArchives();
      const found = items.find((a) => a.id === id);
      if (found) return found;
      return seedLocalDemoArchive().find((a) => a.id === id) || null;
    }
    const f = await fb();
    if (!f || !f.configured) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, 'users', uid, 'eventArchives', id));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    data.id = id;
    return normalizeArchive(data);
  }

  async function saveArchive(uid, archive) {
    if (useLocalPreview()) {
      archive.updatedAtMs = Date.now();
      const data = normalizeArchive(archive);
      const items = readLocalArchives().filter((a) => a.id !== data.id);
      items.unshift(data);
      writeLocalArchives(items);
      return data;
    }
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const { doc, setDoc, serverTimestamp } = f.dbFns;
    archive.updatedAtMs = Date.now();
    const data = Object.assign({}, normalizeArchive(archive), {
      uid,
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(f.db, 'users', uid, 'eventArchives', archive.id), data, { merge: true });
    return data;
  }

  async function deleteArchive(uid, id) {
    if (useLocalPreview()) {
      writeLocalArchives(readLocalArchives().filter((a) => a.id !== id));
      return;
    }
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const { doc, deleteDoc } = f.dbFns;
    await deleteDoc(doc(f.db, 'users', uid, 'eventArchives', id));
  }

  // ---------- 画像（バナースクショ 1 枚） ----------

  async function compressImage(file, maxDim, quality) {
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = () => rej(new Error('画像の読み込みに失敗しました'));
      r.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('画像の読み込みに失敗しました'));
      im.src = dataUrl;
    });
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('画像の変換に失敗しました');
    ctx.drawImage(img, 0, 0, w, h);
    return new Promise((res, rej) => {
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('画像の変換に失敗しました'))), 'image/jpeg', quality);
    });
  }

  async function uploadBannerImage(uid, id, file) {
    if (useLocalPreview()) {
      if (!/^image\//i.test(file.type)) throw new Error('画像ファイルを選んでください。');
      const blob = await compressImage(file, 1280, 0.85);
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error('画像の読み込みに失敗しました'));
        r.readAsDataURL(blob);
      });
    }
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    if (!/^image\//i.test(file.type)) throw new Error('画像ファイルを選んでください。');
    if (file.size > 8 * 1024 * 1024) throw new Error('画像は8MB以下を選んでください。');
    const blob = await compressImage(file, 1280, 0.85);
    const { ref, uploadBytes, getDownloadURL } = f.storageFns;
    const r = ref(f.storage, `users/${uid}/eventArchives/${id}.jpg`);
    await uploadBytes(r, blob, { contentType: 'image/jpeg' });
    return getDownloadURL(r);
  }

  // ---------- 計算（プラン） ----------

  function getTargetPt(a) {
    if (a.targetPtManual != null && a.targetPtManual > 0) {
      return { pt: a.targetPtManual, source: 'manual', label: fmtPt(a.targetPtManual) };
    }
    if (a.targetRank && window.PjskEngine) {
      PjskEngine.ensureBorderData();
      const preset = PjskEngine.TARGET_RANK_PRESETS.find((p) => p.id === a.targetRank);
      const filterValue = a.filterType === 'unit' ? a.unit : a.banner;
      if (preset && filterValue) {
        const est = PjskEngine.estimateBorderTargetPt(preset.sheetKey, a.filterType, filterValue);
        if (est.ok) {
          return {
            pt: est.estimatedPt,
            source: 'estimate',
            label: est.ptLabel,
            sampleCount: est.sampleCount,
            presetLabel: preset.label,
          };
        }
        return { error: est.error };
      }
    }
    return null;
  }

  function hasTeamParams(a) {
    const p = a.params;
    return !!(p && p.sougouryokuMan != null && p.jikkochiPct != null && p.bonusPct != null);
  }

  /**
   * 記録したボーダーPtの推移から、イベント終了時のボーダー最終着地予想を算出。
   * （イベラン診断が過去平均の上位ボーダーを参照する箇所を、実データの外挿で置き換える）
   */
  function getBorderProjection(a) {
    const bl = (a.logs || []).filter((l) => l.borderPt != null);
    if (!bl.length) return null;
    const last = bl[bl.length - 1];
    if (bl.length < 2 || !a.endAt) {
      return {
        pt: Math.round(last.borderPt),
        label: window.PjskEngine ? PjskEngine.formatPtLabel(last.borderPt) : fmtPt(last.borderPt),
        pace: null,
        source: 'last',
      };
    }
    const prev = bl[bl.length - 2];
    const first = bl[0];
    const recentH = (last.at - prev.at) / 3600000;
    const spanH = (last.at - first.at) / 3600000;
    let pace = recentH > 0 ? (last.borderPt - prev.borderPt) / recentH : null;
    if (pace == null && spanH > 0) pace = (last.borderPt - first.borderPt) / spanH;
    if (pace == null) {
      return {
        pt: Math.round(last.borderPt),
        label: window.PjskEngine ? PjskEngine.formatPtLabel(last.borderPt) : fmtPt(last.borderPt),
        pace: null,
        source: 'last',
      };
    }
    const hoursToEnd = Math.max((a.endAt - last.at) / 3600000, 0);
    const projected = Math.max(Math.round(last.borderPt + pace * hoursToEnd), Math.round(last.borderPt));
    return {
      pt: projected,
      label: window.PjskEngine ? PjskEngine.formatPtLabel(projected) : fmtPt(projected),
      pace,
      source: 'projection',
    };
  }

  // 指定した炊き数のみで目標到達する場合の周回プラン
  function buildCookOnlyPlan(remainingPt, ptPerRun, cook, rph, hoursRemaining) {
    if (!(ptPerRun > 0)) return { available: false, cook };
    const runs = remainingPt <= 0 ? 0 : Math.ceil(remainingPt / ptPerRun);
    const needHours = runs / rph;
    const costPerRun = window.PjskEngine ? PjskEngine.crystalsPerRun(cook) : 0;
    return {
      available: true,
      cook,
      runs,
      needHours,
      needCrystals: runs * costPerRun,
      fitsTime: hoursRemaining == null || needHours <= hoursRemaining + 1e-9,
    };
  }

  function computePlan(a) {
    const logs = a.logs;
    const now = Date.now();
    const res = { logs };
    if (!logs.length) {
      res.empty = true;
      res.target = getTargetPt(a);
      return res;
    }
    const last = logs[logs.length - 1];
    res.currentPt = last.myPt;
    res.lastAt = last.at;

    if (logs.length >= 2) {
      const first = logs[0];
      const spanH = (last.at - first.at) / 3600000;
      res.avgPace = spanH > 0 ? (last.myPt - first.myPt) / spanH : null;
      const prev = logs[logs.length - 2];
      const recentH = (last.at - prev.at) / 3600000;
      res.recentPace = recentH > 0 ? (last.myPt - prev.myPt) / recentH : null;
    }
    const pace = res.recentPace != null ? res.recentPace : res.avgPace;
    res.pace = pace;

    if (a.endAt) {
      res.hoursRemaining = Math.max((a.endAt - now) / 3600000, 0);
      res.eventEnded = a.endAt <= now;
    }

    if (pace != null && pace > 0 && res.hoursRemaining != null) {
      res.landingPt = last.myPt + pace * res.hoursRemaining;
    }

    // --- 目標Ptの決定（最終着地予想を優先） ---
    // 優先度: 手入力 > ボーダー最終着地予想（実データ外挿） > 過去平均（イベラン診断と同じ）
    const histTarget = getTargetPt(a);
    const borderProj = getBorderProjection(a);
    res.borderProjection = borderProj;
    res.histTarget = histTarget;
    let target = null;
    if (a.targetPtManual != null && a.targetPtManual > 0) {
      target = { pt: a.targetPtManual, source: 'manual', label: fmtPt(a.targetPtManual) };
    } else if (borderProj) {
      target = { pt: borderProj.pt, source: 'borderProjection', label: borderProj.label };
    } else if (histTarget && histTarget.pt) {
      target = {
        pt: histTarget.pt,
        source: 'estimate',
        label: histTarget.label,
        presetLabel: histTarget.presetLabel,
      };
    } else if (histTarget && histTarget.error) {
      target = { error: histTarget.error };
    }
    res.target = target;

    if (target && target.pt) {
      res.remainingPt = Math.max(target.pt - last.myPt, 0);
      if (pace != null && pace > 0) res.hoursToTarget = res.remainingPt / pace;
      if (res.landingPt != null) {
        res.willReach = res.landingPt >= target.pt;
        res.landingDiff = res.landingPt - target.pt;
      }
    }

    // --- 詳細周回プラン（編成ベース・イベラン診断ロジックを再利用） ---
    if (hasTeamParams(a) && window.PjskEngine) {
      const p = a.params;
      const rph = PjskEngine.ENVY_RUNS_PER_HOUR || 28;
      const ep0 = PjskEngine.envyEventPtBase(p.sougouryokuMan * 10000, p.jikkochiPct, p.bonusPct);
      const pt5 = ep0 * PjskEngine.lbEventPtMul(5);
      const pt10 = ep0 * PjskEngine.lbEventPtMul(10);
      const detail = {
        ep0,
        pt5,
        pt10,
        hourly5: pt5 * rph,
        hourly10: pt10 * rph,
        crystalsSpecified: p.crystals != null,
      };
      if (target && target.pt && res.hoursRemaining != null) {
        const remainingPt = Math.max(target.pt - last.myPt, 0);
        const crystals = p.crystals != null && p.crystals >= 0 ? p.crystals : 1e12;
        const feasible = PjskEngine.diagnosisFeasiblePlan(remainingPt, pt5, pt10, res.hoursRemaining, crystals);
        const cap = PjskEngine.diagnosisCapPlan(pt5, pt10, res.hoursRemaining, crystals);
        const marginRatio = remainingPt > 0 ? (cap.plannedPt - remainingPt) / remainingPt : 1;
        detail.remainingPt = remainingPt;
        detail.feasible = feasible;
        detail.cap = cap;
        detail.rank = PjskEngine.diagnosisRankFromMargin(marginRatio);
        detail.marginRatio = marginRatio;
        detail.achievable = !!feasible;
        detail.reachablePt = last.myPt + cap.plannedPt;
        detail.timeUtil = res.hoursRemaining > 0 && feasible ? (feasible.needHours / res.hoursRemaining) * 100 : null;
        detail.only5 = buildCookOnlyPlan(remainingPt, pt5, 5, rph, res.hoursRemaining);
        detail.only10 = buildCookOnlyPlan(remainingPt, pt10, 10, rph, res.hoursRemaining);
      }
      res.detail = detail;
    }
    return res;
  }

  // ---------- 自作SVG折れ線グラフ ----------

  function renderLineChart(a, plan) {
    const logs = a.logs;
    if (!logs.length) {
      return '<p class="es-empty">記録がまだありません。上のフォームから現在Ptを記録するとグラフが表示されます。</p>';
    }

    const W = 680, H = 280, padL = 60, padR = 18, padT = 16, padB = 36;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const times = logs.map((l) => l.at);
    let t0 = a.startAt || times[0];
    let t1 = a.endAt || times[times.length - 1];
    t0 = Math.min(t0, times[0]);
    t1 = Math.max(t1, times[times.length - 1]);
    if (t1 <= t0) t1 = t0 + 3600000;

    let maxV = 0;
    logs.forEach((l) => {
      if (l.myPt != null) maxV = Math.max(maxV, l.myPt);
      if (l.borderPt != null) maxV = Math.max(maxV, l.borderPt);
    });
    if (plan && plan.target && plan.target.pt) maxV = Math.max(maxV, plan.target.pt);
    if (plan && plan.landingPt != null) maxV = Math.max(maxV, plan.landingPt);
    if (maxV <= 0) maxV = 1;
    maxV = maxV * 1.08;

    const x = (t) => padL + innerW * ((t - t0) / (t1 - t0));
    const y = (v) => padT + innerH * (1 - v / maxV);

    const parts = [];
    parts.push(`<svg class="es-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="ポイント推移グラフ" preserveAspectRatio="xMidYMid meet">`);

    // Y 軸グリッド＋ラベル
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
      const v = (maxV * i) / yTicks;
      const yy = y(v);
      parts.push(`<line class="es-grid" x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}"/>`);
      parts.push(`<text class="es-axis-label" x="${padL - 8}" y="${(yy + 4).toFixed(1)}" text-anchor="end">${esc(shortNum(v))}</text>`);
    }

    // X 軸ラベル（開始・中間・終了）
    [t0, (t0 + t1) / 2, t1].forEach((t, i) => {
      const xx = x(t);
      const anchor = i === 0 ? 'start' : (i === 2 ? 'end' : 'middle');
      parts.push(`<text class="es-axis-label" x="${xx.toFixed(1)}" y="${H - 12}" text-anchor="${anchor}">${esc(fmtDateTime(t))}</text>`);
    });

    // 目標ライン
    if (plan && plan.target && plan.target.pt) {
      const ty = y(plan.target.pt);
      parts.push(`<line class="es-target-line" x1="${padL}" y1="${ty.toFixed(1)}" x2="${W - padR}" y2="${ty.toFixed(1)}"/>`);
      parts.push(`<text class="es-target-text" x="${W - padR}" y="${(ty - 6).toFixed(1)}" text-anchor="end">目標 ${esc(shortNum(plan.target.pt))}</text>`);
    }

    // ボーダー系列
    const borderPts = logs.filter((l) => l.borderPt != null);
    if (borderPts.length) {
      const pointsStr = borderPts.map((l) => `${x(l.at).toFixed(1)},${y(l.borderPt).toFixed(1)}`).join(' ');
      if (borderPts.length >= 2) {
        parts.push(`<polyline class="es-line es-line--border" points="${pointsStr}"/>`);
      }
      borderPts.forEach((l) => {
        parts.push(`<circle class="es-dot es-dot--border" cx="${x(l.at).toFixed(1)}" cy="${y(l.borderPt).toFixed(1)}" r="3"/>`);
      });
    }

    // 自分のPt系列
    const myPts = logs.filter((l) => l.myPt != null);
    const myPointsStr = myPts.map((l) => `${x(l.at).toFixed(1)},${y(l.myPt).toFixed(1)}`).join(' ');
    if (myPts.length >= 2) {
      parts.push(`<polyline class="es-line es-line--mine" points="${myPointsStr}"/>`);
    }
    myPts.forEach((l) => {
      parts.push(`<circle class="es-dot es-dot--mine" cx="${x(l.at).toFixed(1)}" cy="${y(l.myPt).toFixed(1)}" r="3.5"/>`);
    });

    // 着地予想（点線）
    if (plan && plan.landingPt != null && a.endAt && myPts.length) {
      const last = myPts[myPts.length - 1];
      parts.push(`<line class="es-line--projection" x1="${x(last.at).toFixed(1)}" y1="${y(last.myPt).toFixed(1)}" x2="${x(a.endAt).toFixed(1)}" y2="${y(plan.landingPt).toFixed(1)}"/>`);
      parts.push(`<circle class="es-dot es-dot--projection" cx="${x(a.endAt).toFixed(1)}" cy="${y(plan.landingPt).toFixed(1)}" r="3.5"/>`);
    }

    parts.push('</svg>');

    const legend =
      '<div class="es-chart-legend">' +
      '<span class="es-legend es-legend--mine">自分のPt</span>' +
      (borderPts.length ? '<span class="es-legend es-legend--border">ボーダー</span>' : '') +
      (plan && plan.target && plan.target.pt ? '<span class="es-legend es-legend--target">目標</span>' : '') +
      (plan && plan.landingPt != null ? '<span class="es-legend es-legend--projection">着地予想</span>' : '') +
      '</div>';

    return '<div class="es-chart">' + parts.join('') + legend + '</div>';
  }

  // ---------- プランカードのHTML ----------

  function planCardHtml(a, plan) {
    if (plan.empty) {
      return '<p class="es-empty">記録すると、ここに着地予想と周回プランが表示されます。</p>';
    }
    const rows = [];
    rows.push(planRow('現在のPt', fmtPt(plan.currentPt), 'mine'));

    if (plan.recentPace != null || plan.avgPace != null) {
      const paceText = [];
      if (plan.recentPace != null) paceText.push('直近 ' + fmtPt(Math.round(plan.recentPace)) + '/時');
      if (plan.avgPace != null) paceText.push('平均 ' + fmtPt(Math.round(plan.avgPace)) + '/時');
      rows.push(planRow('ペース', paceText.join(' · ')));
    } else {
      rows.push(planRow('ペース', '2件以上記録すると算出されます'));
    }

    if (plan.hoursRemaining != null) {
      rows.push(planRow('イベント残り時間', plan.eventEnded ? '終了済み' : fmtHours(plan.hoursRemaining)));
    }

    if (plan.landingPt != null) {
      let tone = '';
      let suffix = '';
      if (plan.target && plan.target.pt) {
        tone = plan.willReach ? 'ok' : 'warn';
        const diff = Math.abs(Math.round(plan.landingDiff));
        suffix = plan.willReach
          ? `（目標を +${fmtPt(diff)} 上回る見込み）`
          : `（目標に ${fmtPt(diff)} 届かない見込み）`;
      }
      rows.push(planRow('このペースの着地予想', fmtPt(Math.round(plan.landingPt)) + ' ' + suffix, tone));
    }

    if (plan.target && plan.target.pt) {
      const filterLabel = esc(a.filterType === 'unit' ? a.unit : a.banner);
      let src;
      if (plan.target.source === 'estimate') {
        src = `過去平均（${esc(plan.target.presetLabel || '目標順位')}・${filterLabel}）`;
      } else if (plan.target.source === 'borderProjection') {
        src = '最終着地予想（記録ボーダーから外挿）';
      } else {
        src = '手入力';
      }
      rows.push(planRow('目標Pt', esc(plan.target.label) + `<span class="es-plan-sub">${src}</span>`, '', true));
      rows.push(planRow('目標まで残り', fmtPt(plan.remainingPt) + (plan.hoursToTarget != null ? `（このペースで ${fmtHours(plan.hoursToTarget)}）` : '')));
    } else if (plan.target && plan.target.error) {
      rows.push(planRow('目標Pt', '<span class="es-plan-sub">' + esc(plan.target.error) + '</span>', 'warn', true));
    }

    return '<div class="es-plan-rows">' + rows.join('') + '</div>' + detailPlanHtml(a, plan);
  }

  const RANK_LABELS = { S: '余裕あり', A: 'ほぼ確実', B: '安全圏', C: 'ギリギリ', D: '厳しい' };

  function fmtCount(n) {
    return typeof window.fmtNum === 'function' ? window.fmtNum(n) : String(n);
  }

  function teamOpenLabel(archive) {
    return hasTeamParams(archive) ? '🎛️ 編成を編集する' : '🎛️ 編成を登録する';
  }

  function logToggleLabel(count, open) {
    return open
      ? '📝 記録一覧を閉じる（' + count + '件）'
      : '📝 記録一覧を表示する（' + count + '件）';
  }

  function teamSummaryText(p) {
    if (!p || p.sougouryokuMan == null || p.jikkochiPct == null || p.bonusPct == null) return null;
    const parts = [
      '総合力 ' + p.sougouryokuMan + '万',
      '実効値 ' + p.jikkochiPct + '%',
      'ボーナス ' + p.bonusPct + '%',
    ];
    if (p.crystals != null) parts.push('クリスタル ' + fmtCount(p.crystals));
    return parts.join(' / ');
  }

  // 編成登録カード内の「エビ1回あたりのPt」表示
  function teamEstimateHtml(archive) {
    const p = archive.params;
    if (!hasTeamParams(archive) || !window.PjskEngine) {
      return '<p class="form-hint">編成を登録すると、エビ1回あたりのおおよそのPtと推奨周回プランが表示されます。</p>';
    }
    const rph = PjskEngine.ENVY_RUNS_PER_HOUR || 28;
    const ep0 = PjskEngine.envyEventPtBase(p.sougouryokuMan * 10000, p.jikkochiPct, p.bonusPct);
    const pt5 = ep0 * PjskEngine.lbEventPtMul(5);
    const pt10 = ep0 * PjskEngine.lbEventPtMul(10);
    return (
      '<div class="es-team-result">' +
      '<p class="es-team-result__summary">登録済み: ' + esc(teamSummaryText(p)) + '</p>' +
      '<div class="es-runplan-grid">' +
      '<div class="es-runplan"><p class="es-runplan__cook">エビ 5炊き 1回</p><p class="es-runplan__runs">約 ' + fmtPt(Math.round(pt5)) + '</p><p class="es-runplan__meta">時速 約 ' + fmtPt(Math.round(pt5 * rph)) + '</p></div>' +
      '<div class="es-runplan"><p class="es-runplan__cook">エビ 10炊き 1回</p><p class="es-runplan__runs">約 ' + fmtPt(Math.round(pt10)) + '</p><p class="es-runplan__meta">時速 約 ' + fmtPt(Math.round(pt10 * rph)) + '</p></div>' +
      '</div>' +
      '<p class="form-hint">下の「🧭 着地予想・周回プラン」に、目標到達までの推奨周回プランが表示されます。</p>' +
      '</div>'
    );
  }

  // 編成ベースの詳細周回プラン（イベラン診断ロジックを流用し、残り時間から逆算）
  function detailPlanHtml(a, plan) {
    if (!hasTeamParams(a)) {
      if (plan.target && plan.target.pt) {
        return '<p class="form-hint es-plan-runplans-hint">上の「編成を登録する」から総合力・実効値・ボーナスを入力すると、最終着地予想から逆算した詳しい周回プランを表示できます。</p>';
      }
      return '';
    }
    const d = plan.detail;
    if (!d) return '';
    const rph = (window.PjskEngine && PjskEngine.ENVY_RUNS_PER_HOUR) || 28;

    let body = '';
    if (d.remainingPt == null) {
      body = '<p class="form-hint">イベントの終了日時と目標（記録ボーダー or 手入力）があると、残り時間から必要な周回配分を算出します。</p>';
    } else if (d.remainingPt <= 0) {
      body = '<p class="es-plan-note es-plan-note--ok">目標Ptに到達済みです。おつかれさまでした！</p>';
    } else if (d.feasible) {
      const f = d.feasible;
      const mix = [];
      if (f.runs5 > 0) mix.push('5炊き ' + fmtCount(f.runs5) + ' 回');
      if (f.runs10 > 0) mix.push('10炊き ' + fmtCount(f.runs10) + ' 回');
      const rank = d.rank || '';
      const rankLabel = RANK_LABELS[rank] || '';
      body =
        '<div class="es-plan-verdict">' +
        '<span class="es-rank-badge es-rank-badge--' + esc(rank) + '">判定 ' + esc(rank) + '</span>' +
        '<span class="es-plan-verdict__text">' + esc(rankLabel) + '</span>' +
        '</div>' +
        '<div class="es-plan-rows es-plan-rows--sub">' +
        planRow('おすすめ配分', mix.length ? mix.join(' ＋ ') : '追加の周回は不要です') +
        planRow('必要な周回数', fmtCount(f.totalRuns) + ' 周') +
        planRow('必要な時間', fmtHours(f.needHours) + (d.timeUtil != null ? `（残り時間の ${Math.round(d.timeUtil)}%）` : '')) +
        planRow('必要なクリスタル', '約 ' + fmtCount(Math.round(f.needCrystals)) + (d.crystalsSpecified && a.params.crystals != null ? ` / 所持 ${fmtCount(a.params.crystals)}` : '')) +
        '</div>' +
        (f.rebalanced ? '<p class="form-hint">残り時間に収めるため10炊きを混ぜた配分です。</p>' : '');
    } else {
      const shortfall = Math.max(Math.round(d.remainingPt - d.cap.plannedPt), 0);
      body =
        '<div class="es-plan-verdict">' +
        '<span class="es-rank-badge es-rank-badge--D">判定 D</span>' +
        '<span class="es-plan-verdict__text">現在の残り時間・リソースでは目標到達が厳しい状況です</span>' +
        '</div>' +
        '<div class="es-plan-rows es-plan-rows--sub">' +
        planRow('フル稼働の到達可能Pt', fmtPt(Math.round(d.reachablePt)) + '（残り ' + fmtCount(d.cap.totalRuns) + ' 周で最大）') +
        (shortfall > 0 ? planRow('不足Pt', fmtPt(shortfall), 'warn') : '') +
        '</div>' +
        '<p class="form-hint">ボーナス・実効値の強化や、目標順位の見直しを検討しましょう。' +
        (d.crystalsSpecified ? 'クリスタルを追加すると到達できる場合があります。' : '') + '</p>';
    }

    const crystalHint = d.crystalsSpecified
      ? ''
      : '<p class="form-hint">所持クリスタル未指定のため時間のみで算出しています（イベント設定で入力できます）。</p>';

    const cookOnly = (d.remainingPt != null && d.remainingPt > 0 && (d.only5 || d.only10))
      ? '<p class="es-runplan-subtitle">🍚 炊き数別プラン（単独で目標到達する場合）</p>' +
        '<div class="es-runplan-grid">' + cookOnlyCardHtml(d.only5) + cookOnlyCardHtml(d.only10) + '</div>'
      : '';

    return (
      '<div class="es-plan-runplans">' +
      '<p class="adjust-filters__title">🧮 詳細周回プラン（編成ベース）</p>' +
      body +
      cookOnly +
      '<p class="form-hint">独りんぼエンヴィー想定（' + rph + '周/時）。イベラン診断と同じ計算で残り時間から逆算しています。</p>' +
      crystalHint +
      '</div>'
    );
  }

  function cookOnlyCardHtml(plan) {
    if (!plan || !plan.available) return '';
    const overCls = plan.fitsTime ? '' : ' es-runplan--over';
    return (
      '<div class="es-runplan' + overCls + '">' +
      '<p class="es-runplan__cook">' + plan.cook + '炊きのみ</p>' +
      '<p class="es-runplan__runs">' + fmtCount(plan.runs) + ' 周</p>' +
      '<p class="es-runplan__meta">' + fmtHours(plan.needHours) + ' / 約 ' + fmtCount(Math.round(plan.needCrystals)) + ' クリスタル</p>' +
      (plan.fitsTime ? '' : '<p class="es-runplan__warn">残り時間オーバー</p>') +
      '</div>'
    );
  }

  function planRow(label, valueHtml, tone, isHtml) {
    const toneCls = tone ? ' es-plan-row--' + tone : '';
    const val = isHtml ? valueHtml : esc(valueHtml);
    return (
      '<div class="es-plan-row' + toneCls + '">' +
      '<span class="es-plan-row__label">' + esc(label) + '</span>' +
      '<span class="es-plan-row__value">' + val + '</span>' +
      '</div>'
    );
  }

  // ================= ハブ（一覧） =================

  async function initHub() {
    const root = document.getElementById('app');
    const box = root && root.querySelector('#eventSupportRoot');
    if (!box) return;

    if (!(await isConfigured()) && !useLocalPreview()) {
      box.innerHTML = '<div class="info-box"><p><strong>ログイン機能は準備中です。</strong></p><p class="mt-1">Firebase の設定後に利用できます。</p></div>';
      return;
    }

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';
    const user = await resolveAuthUser();
    if (!user) {
      box.innerHTML =
        '<div class="info-box"><p>イベラン支援の利用にはログインが必要です。</p>' +
        '<p class="mt-2"><a href="#/login" class="btn btn-primary" data-link>ログインする</a></p></div>';
      return;
    }

    let archives = [];
    try {
      archives = await listArchives(user.uid);
    } catch (e) {
      console.error(e);
      box.innerHTML = '<div class="info-box"><p>読み込みに失敗しました。</p><p class="form-error mt-1">' + esc(e.message || String(e)) + '</p></div>';
      return;
    }

    renderHub(box, user, archives);
  }

  function archiveCardHtml(a) {
    const last = a.logs.length ? a.logs[a.logs.length - 1] : null;
    const period = (a.startAt || a.endAt)
      ? `${fmtDateTime(a.startAt)} 〜 ${fmtDateTime(a.endAt)}`
      : '期間未設定';
    const target = getTargetPt(a);
    const targetText = target && target.pt ? '目標 ' + esc(target.label) : '目標未設定';
    const thumb = a.finalImageURL
      ? `<div class="es-card__thumb"><img src="${esc(a.finalImageURL)}" alt="" loading="lazy" decoding="async"></div>`
      : '';
    return (
      '<div class="es-card card" data-id="' + esc(a.id) + '">' +
      thumb +
      '<div class="es-card__body">' +
      '<p class="es-card__title">' + esc(a.title || '無題のイベント') + '</p>' +
      (resolveEventChar(a) ? '<p class="es-card__char">' + eventCharTagHtml(resolveEventChar(a)) + '</p>' : '') +
      '<p class="es-card__period">' + esc(period) + '</p>' +
      '<div class="es-card__stats">' +
      '<span>記録 ' + a.logs.length + '件</span>' +
      '<span>' + (last ? '現在 ' + esc(fmtPt(last.myPt)) : '記録なし') + '</span>' +
      '<span>' + targetText + '</span>' +
      (a.isPublic !== false ? '<span>公開ページに表示</span>' : '<span>非公開</span>') +
      '</div>' +
      '<div class="es-card__actions">' +
      '<a href="#/mypage/event-support/' + esc(a.id) + '" class="btn btn-primary btn-sm" data-link>開く</a>' +
      '<button type="button" class="btn btn-secondary btn-sm es-card__delete">削除</button>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function renderHub(box, user, archives) {
    const canCreate = archives.length < MAX_ARCHIVES;
    const guestNote = useLocalPreview()
      ? '<div class="info-box mb-2"><p><strong>ローカルゲストプレビュー</strong></p><p class="mt-1">この環境ではログインせずに操作できます。記録はブラウザ内だけに保存され、本番には送られません。</p></div>'
      : '';
    box.innerHTML = `
      ${guestNote}
      <section class="card community-editor es-hub">
        <div class="es-hub__head">
          <div>
            <h2 class="community-editor__title">イベラン支援</h2>
            <p class="text-muted mp-editor-lead">イベント中のPtを記録して、着地予想と周回プランを確認できます。公開をオンにするとセカイノートにアーカイブが出ます。</p>
          </div>
          <span class="es-hub__count">${archives.length} / ${MAX_ARCHIVES}</span>
        </div>

        <div class="es-hub__new">
          <button type="button" class="btn btn-primary" id="esNewToggle"${canCreate ? '' : ' disabled'}>＋ 新しいイベントを追加</button>
          ${canCreate ? '' : '<p class="form-hint">保管できるのは ' + MAX_ARCHIVES + ' 件までです。新しく作るには、下のイベントを1つ削除してください。</p>'}
        </div>

        <div class="es-new-form" id="esNewForm" hidden>
          <div class="form-group">
            <label for="esNewTitle">イベント名</label>
            <input type="text" class="form-input" id="esNewTitle" maxlength="${TITLE_MAX}" placeholder="例: ○○のイベント">
          </div>
          <div class="form-group">
            <label for="esNewEventChar">イベントキャラ</label>
            <select class="form-select" id="esNewEventChar">${eventCharOptions('')}</select>
            <p class="form-hint">攻略図書館のイベランレポートで、キャラタグとして検索できます。</p>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="esNewStartDate">開始日時</label>
              <div class="es-datetime">
                <input type="date" class="form-input" id="esNewStartDate" aria-label="開始日" required>
                <input type="time" class="form-input" id="esNewStartTime" aria-label="開始時刻" value="15:00" required>
              </div>
            </div>
            <div class="form-group">
              <label for="esNewEndDate">終了日時</label>
              <div class="es-datetime">
                <input type="date" class="form-input" id="esNewEndDate" aria-label="終了日" required>
                <input type="time" class="form-input" id="esNewEndTime" aria-label="終了時刻" value="20:59" required>
              </div>
            </div>
          </div>
          <p class="form-hint">開始・終了は必須です。イベランレポートのタイムテーブルは、この期間を1時間ごとに割ります。</p>
          <p id="esNewError" class="form-error" hidden></p>
          <button type="button" class="btn btn-primary btn-block" id="esNewCreate">作成してひらく</button>
        </div>

        <div class="divider"></div>
        <div class="es-card-list" id="esCardList">
          ${archives.length ? archives.map(archiveCardHtml).join('') : '<p class="es-empty">まだイベントがありません。「＋ 新しいイベントを追加」から始められます。</p>'}
        </div>
      </section>
    `;

    const newToggle = box.querySelector('#esNewToggle');
    const newForm = box.querySelector('#esNewForm');
    if (newToggle && newForm) {
      newToggle.addEventListener('click', () => {
        newForm.hidden = !newForm.hidden;
        if (!newForm.hidden) {
          const t = box.querySelector('#esNewTitle');
          if (t) t.focus();
        }
      });
    }

    const createBtn = box.querySelector('#esNewCreate');
    if (createBtn) {
      createBtn.addEventListener('click', async () => {
        const errEl = box.querySelector('#esNewError');
        errEl.hidden = true;
        const title = box.querySelector('#esNewTitle').value.trim();
        if (!title) {
          errEl.textContent = 'イベント名を入力してください。';
          errEl.hidden = false;
          return;
        }
        const startAt = combineDateTime(box.querySelector('#esNewStartDate').value, box.querySelector('#esNewStartTime').value);
        const endAt = combineDateTime(box.querySelector('#esNewEndDate').value, box.querySelector('#esNewEndTime').value);
        if (!startAt || !endAt) {
          errEl.textContent = 'イベント期間（開始・終了）を入力してください。';
          errEl.hidden = false;
          return;
        }
        if (endAt <= startAt) {
          errEl.textContent = '終了日時は開始日時より後にしてください。';
          errEl.hidden = false;
          return;
        }
        let current = [];
        try {
          current = await listArchives(user.uid);
        } catch (e) {
          current = archives;
        }
        if (current.length >= MAX_ARCHIVES) {
          errEl.textContent = '保管できるのは ' + MAX_ARCHIVES + ' 件までです。先に不要なイベントを削除してください。';
          errEl.hidden = false;
          return;
        }
        createBtn.disabled = true;
        createBtn.textContent = '作成中…';
        try {
          const eventChar = (box.querySelector('#esNewEventChar') || {}).value || '';
          const archive = normalizeArchive({
            id: newId(),
            title,
            eventChar,
            banner: eventChar,
            startAt,
            endAt,
            isPublic: true,
            createdAtMs: Date.now(),
          });
          await saveArchive(user.uid, archive);
          location.hash = '#/mypage/event-support/' + archive.id;
        } catch (e) {
          errEl.textContent = e.message || String(e);
          errEl.hidden = false;
          createBtn.disabled = false;
          createBtn.textContent = '作成してひらく';
        }
      });
    }

    box.querySelectorAll('.es-card__delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.es-card');
        const id = card && card.dataset.id;
        if (!id) return;
        if (!confirm('このイベントの記録を削除しますか？（元に戻せません）')) return;
        btn.disabled = true;
        try {
          await deleteArchive(user.uid, id);
          const next = await listArchives(user.uid);
          renderHub(box, user, next);
        } catch (e) {
          btn.disabled = false;
          alert(e.message || String(e));
        }
      });
    });
  }

  // ================= アーカイブ詳細 =================

  async function initArchive(params) {
    const root = document.getElementById('app');
    const box = root && root.querySelector('#eventArchiveRoot');
    if (!box) return;

    const id = params && params.id ? String(params.id) : '';

    if (!(await isConfigured()) && !useLocalPreview()) {
      box.innerHTML = '<div class="info-box"><p><strong>ログイン機能は準備中です。</strong></p></div>';
      return;
    }

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';
    const user = await resolveAuthUser();
    if (!user) {
      box.innerHTML =
        '<div class="info-box"><p>イベラン支援の利用にはログインが必要です。</p>' +
        '<p class="mt-2"><a href="#/login" class="btn btn-primary" data-link>ログインする</a></p></div>';
      return;
    }

    let archive;
    try {
      archive = await loadArchive(user.uid, id);
    } catch (e) {
      box.innerHTML = '<div class="info-box"><p>読み込みに失敗しました。</p><p class="form-error mt-1">' + esc(e.message || String(e)) + '</p></div>';
      return;
    }

    if (!archive) {
      box.innerHTML =
        '<div class="info-box"><p>イベントが見つかりませんでした。</p>' +
        '<p class="mt-2"><a href="#/mypage/event-support" class="btn btn-secondary" data-link>イベラン支援に戻る</a></p></div>';
      return;
    }

    let report = null;
    if (window.GuidesPage && typeof GuidesPage.loadReport === 'function' && typeof GuidesPage.reportIdForArchive === 'function') {
      try {
        report = await GuidesPage.loadReport(GuidesPage.reportIdForArchive(user.uid, archive.id));
      } catch (e) {
        console.warn('[event-support] report load failed:', e);
      }
    }

    renderArchive(box, user, archive, report);
  }

  function targetRankOptions(selected) {
    const opts = ['<option value="">指定なし</option>'];
    (window.PjskEngine ? PjskEngine.TARGET_RANK_PRESETS : []).forEach((p) => {
      opts.push('<option value="' + p.id + '"' + (selected === p.id ? ' selected' : '') + '>' + esc(p.label) + '</option>');
    });
    return opts.join('');
  }

  function filterValueOptions(filterType, selected) {
    if (!window.PjskEngine) return '<option value="">—</option>';
    PjskEngine.ensureBorderData();
    const list = PjskEngine.getBorderFilterList(filterType) || [];
    const opts = ['<option value="">選択してください</option>'];
    list.forEach((name) => {
      opts.push('<option value="' + esc(name) + '"' + (selected === name ? ' selected' : '') + '>' + esc(name) + '</option>');
    });
    return opts.join('');
  }

  function renderArchive(box, user, archive, report) {
    archive.uid = user.uid;
    const plan = computePlan(archive);

    box.innerHTML = `
      <div class="es-archive">
        <section class="card community-editor es-record">
          <div class="es-record__head">
            <h2 class="community-editor__title" id="esTitleDisplay">${esc(archive.title || '無題のイベント')}</h2>
            <p class="es-event-char-line" id="esEventCharDisplay">${resolveEventChar(archive) ? eventCharTagHtml(resolveEventChar(archive)) : '<span class="text-muted">イベントキャラ未指定</span>'}</p>
            <p class="text-muted es-record__period">${esc((archive.startAt || archive.endAt) ? fmtDateTime(archive.startAt) + ' 〜 ' + fmtDateTime(archive.endAt) : '期間未設定')}</p>
          </div>
          <div class="es-top-actions">
            <button type="button" class="btn btn-primary btn-block es-action-btn" id="esTeamOpen">${teamOpenLabel(archive)}</button>
            <p class="form-hint es-top-actions__hint">イベント開始時に一度登録すると、エビ1回あたりのPtと周回プランが出ます。</p>
            <p id="esTeamSaved" class="community-saved" hidden>登録しました ✓</p>
            <button type="button" class="btn btn-secondary btn-block es-action-btn" id="esRankOpen">🎯 目標順位を変更する</button>
            <p class="form-hint es-top-actions__hint" id="esRankStatus">${esc(rankStatusHtml(archive))}</p>
            <p id="esRankSaved" class="community-saved" hidden>変更しました ✓</p>
          </div>
          <p class="form-hint">今の自分のPt（と、任意で目標順位のボーダーPt）を記録すると、下のグラフとプランに反映されます。</p>
          <div class="form-row es-record__inputs">
            <div class="form-group">
              <label for="esLogMyPt">現在のPt</label>
              <input type="number" class="form-input" id="esLogMyPt" min="0" inputmode="numeric" placeholder="例: 1250000">
            </div>
            <div class="form-group">
              <label for="esLogBorderPt">ボーダーPt（任意）</label>
              <input type="number" class="form-input" id="esLogBorderPt" min="0" inputmode="numeric" placeholder="狙う順位の現在ボーダー">
            </div>
          </div>
          <div class="form-group">
            <label for="esLogNote">メモ（任意）</label>
            <input type="text" class="form-input" id="esLogNote" maxlength="${NOTE_MAX}" placeholder="例: 睡眠前 / ○○終わり">
          </div>
          <p id="esLogError" class="form-error" hidden></p>
          <button type="button" class="btn btn-primary btn-block" id="esLogAdd">現在時刻で記録する</button>
        </section>

        <section class="card es-graph-card">
          <p class="adjust-filters__title">📈 ポイント推移</p>
          <div id="esChartWrap">${renderLineChart(archive, plan)}</div>
        </section>

        <section class="card es-team-card">
          <p class="adjust-filters__title">🍚 エビ1回あたりのPt</p>
          <div id="esTeamResult">${teamEstimateHtml(archive)}</div>
        </section>

        <dialog class="es-modal" id="esTeamModal">
          <div class="es-modal__body">
            <p class="es-modal__title">🎛️ 編成を登録</p>
            <p class="form-hint">総合力・実効値・イベントボーナスを入力すると、エビ1回あたりのおおよそのPtと推奨周回プランを算出します（独りんぼエンヴィー想定）。イベント中に一度だけ登録すればOKです。</p>
            <div class="form-group">
              <label for="esSetSougou">総合力（万）</label>
              <input type="number" class="form-input" id="esSetSougou" min="0" step="0.1" value="${archive.params.sougouryokuMan != null ? esc(archive.params.sougouryokuMan) : ''}" placeholder="例: 30">
            </div>
            <div class="form-group">
              <label for="esSetJikko">実効値（%）</label>
              <input type="number" class="form-input" id="esSetJikko" min="0" max="100" step="0.1" value="${archive.params.jikkochiPct != null ? esc(archive.params.jikkochiPct) : ''}" placeholder="例: 130">
            </div>
            <div class="form-group">
              <label for="esSetBonus">イベントボーナス（%）</label>
              <input type="number" class="form-input" id="esSetBonus" min="0" step="1" value="${archive.params.bonusPct != null ? esc(archive.params.bonusPct) : ''}" placeholder="例: 435">
            </div>
            <div class="form-group">
              <label for="esSetCrystals">所持クリスタル（任意）</label>
              <input type="number" class="form-input" id="esSetCrystals" min="0" step="1" value="${archive.params.crystals != null ? esc(archive.params.crystals) : ''}" placeholder="例: 12000">
            </div>
            <p id="esTeamError" class="form-error" hidden></p>
            <div class="es-modal__actions">
              <button type="button" class="btn btn-secondary" id="esTeamCancel">キャンセル</button>
              <button type="button" class="btn btn-primary" id="esTeamSave">登録する</button>
            </div>
          </div>
        </dialog>

        <dialog class="es-modal" id="esRankModal">
          <div class="es-modal__body">
            <p class="es-modal__title">🎯 目標順位を変更</p>
            <p class="form-hint">変更すると日時が記録され、着地予想と周回プランの目標が更新されます。</p>
            <div class="form-group">
              <label for="esRankSelect">目標順位</label>
              <select class="form-select" id="esRankSelect">${targetRankOptions(archive.targetRank)}</select>
            </div>
            <div class="es-rank-history-wrap">
              <p class="adjust-filters__title">変更履歴</p>
              <div id="esRankHistory">${rankHistoryHtml(archive)}</div>
            </div>
            <p id="esRankError" class="form-error" hidden></p>
            <div class="es-modal__actions">
              <button type="button" class="btn btn-secondary" id="esRankCancel">キャンセル</button>
              <button type="button" class="btn btn-primary" id="esRankSave">変更する</button>
            </div>
          </div>
        </dialog>

        <section class="card es-plan-card">
          <p class="adjust-filters__title">🧭 着地予想・周回プラン</p>
          <div id="esPlanWrap">${planCardHtml(archive, plan)}</div>
        </section>

        <section class="card es-logs-card">
          <button type="button" class="btn btn-primary btn-block es-action-btn" id="esLogToggle" aria-expanded="false">${logToggleLabel(archive.logs.length, false)}</button>
          <div id="esLogList" class="es-logs-card__body" hidden>${logListHtml(archive)}</div>
        </section>

        <details class="card es-settings" id="esSettings">
          <summary class="es-settings__summary">⚙️ イベント設定（名前・期間・目標）</summary>
          <div class="es-settings__body">
            <div class="form-group">
              <label for="esSetTitle">イベント名</label>
              <input type="text" class="form-input" id="esSetTitle" maxlength="${TITLE_MAX}" value="${esc(archive.title)}">
            </div>
            <div class="form-group">
              <label class="form-toggle">
                <input type="checkbox" id="esSetPublic"${archive.isPublic !== false ? ' checked' : ''}>
                <span class="toggle-track"></span>
                <span class="toggle-label">公開ページに表示する</span>
              </label>
              <p class="form-hint">オンにすると、セカイノート（公開ページ）にグラフ・最終記録が出ます。</p>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="esSetStartDate">開始日時（必須）</label>
                <div class="es-datetime">
                  <input type="date" class="form-input" id="esSetStartDate" aria-label="開始日" value="${esc(toInputDate(archive.startAt))}">
                  <input type="time" class="form-input" id="esSetStartTime" aria-label="開始時刻" value="${esc(toInputTime(archive.startAt))}">
                </div>
              </div>
              <div class="form-group">
                <label for="esSetEndDate">終了日時（必須）</label>
                <div class="es-datetime">
                  <input type="date" class="form-input" id="esSetEndDate" aria-label="終了日" value="${esc(toInputDate(archive.endAt))}">
                  <input type="time" class="form-input" id="esSetEndTime" aria-label="終了時刻" value="${esc(toInputTime(archive.endAt))}">
                </div>
              </div>
            </div>

            <div class="divider"></div>
            <p class="adjust-filters__title">🎯 目標ボーダー</p>
            <p class="form-hint">目標順位とバナー／ユニットを選ぶと、過去イベントの平均から目標Ptを推定します。目標Ptを直接入れても構いません。</p>
            <div class="form-row">
              <div class="form-group">
                <label for="esSetRank">目標順位</label>
                <select class="form-select" id="esSetRank">${targetRankOptions(archive.targetRank)}</select>
              </div>
              <div class="form-group">
                <label for="esSetFilterType">推定の基準</label>
                <select class="form-select" id="esSetFilterType">
                  <option value="banner"${archive.filterType !== 'unit' ? ' selected' : ''}>バナー</option>
                  <option value="unit"${archive.filterType === 'unit' ? ' selected' : ''}>ユニット</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label for="esSetFilterValue" id="esSetFilterValueLabel">${archive.filterType === 'unit' ? 'ユニット' : 'バナー'}</label>
              <select class="form-select" id="esSetFilterValue">${filterValueOptions(archive.filterType, archive.filterType === 'unit' ? archive.unit : archive.banner)}</select>
            </div>
            <div class="form-group">
              <label for="esSetTargetManual">目標Ptを直接指定（任意）</label>
              <input type="number" class="form-input" id="esSetTargetManual" min="0" inputmode="numeric" value="${archive.targetPtManual != null ? esc(archive.targetPtManual) : ''}" placeholder="例: 1500000">
            </div>
            <p class="form-hint">※ 編成（総合力・実効値・イベントボーナス）は上の「🎛️ 編成を登録」から設定できます。</p>

            <p id="esSetError" class="form-error" hidden></p>
            <button type="button" class="btn btn-primary btn-block" id="esSetSave">イベント設定を保存</button>
            <p id="esSetSaved" class="community-saved mt-2" hidden>保存しました ✓</p>
          </div>
        </details>

        <section class="card es-final">
          <p class="adjust-filters__title">🏁 イベント終了時の記録</p>
          <p class="form-hint">イベントバナーページのスクショを1枚だけ保存できます。最終順位と最終着地Ptを記録できます。当初の目標はイベランレポート側で記入します。</p>
          <div class="es-final__image">
            <div id="esFinalPreview" class="es-final__preview">${archive.finalImageURL
        ? `<img src="${esc(archive.finalImageURL)}" alt="バナーページのスクショ" decoding="async">`
        : '<span class="es-final__placeholder">画像未登録</span>'}</div>
            <div class="es-final__image-actions">
              <label class="btn btn-secondary btn-sm">
                画像を選ぶ
                <input type="file" id="esFinalFile" accept="image/*" hidden>
              </label>
              <span id="esFinalImageStatus" class="form-hint"></span>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label for="esFinalRank">最終順位（任意）</label>
              <input type="number" class="form-input" id="esFinalRank" min="0" inputmode="numeric" value="${archive.finalRank != null ? esc(archive.finalRank) : ''}" placeholder="例: 480">
            </div>
            <div class="form-group">
              <label for="esFinalPt">最終着地Pt（任意）</label>
              <input type="number" class="form-input" id="esFinalPt" min="0" inputmode="numeric" value="${archive.finalPt != null ? esc(archive.finalPt) : ''}" placeholder="例: 1620000">
            </div>
          </div>
          <div class="form-group">
            <label for="esFinalCrystals">消化したクリスタル（任意）</label>
            <input type="number" class="form-input" id="esFinalCrystals" min="0" inputmode="numeric" value="${archive.crystalsUsed != null ? esc(archive.crystalsUsed) : ''}" placeholder="例: 8000">
            <p class="form-hint">実際に使った数。イベランレポートにそのまま掲載できます。</p>
          </div>
          <p id="esFinalError" class="form-error" hidden></p>
          <button type="button" class="btn btn-primary btn-block" id="esFinalSave">終了時の記録を保存</button>
          <p id="esFinalSaved" class="community-saved mt-2" hidden>保存しました ✓</p>
        </section>

        <section class="card es-report-cta">
          <p class="adjust-filters__title">📓 イベランレポート</p>
          <p class="form-hint">この記録をもとに、攻略図書館へ投稿できるノート記事を作れます。現在準備中です。</p>
          <div id="esReportCta">${reportCtaHtml(archive, report)}</div>
        </section>

        <button type="button" class="btn btn-secondary btn-block mt-2" id="esDeleteArchive">このイベントを削除</button>
        <a href="#/mypage/event-support" class="btn btn-secondary btn-block mt-2" data-link>イベラン支援に戻る</a>
      </div>
    `;

    wireArchive(box, user, archive);
  }

  function reportCtaHtml(archive, report) {
    const href = '#/mypage/event-support/' + esc(archive.id) + '/report';
    if (report && report.isPublished) {
      return (
        '<p class="es-report-cta__status">公開中です</p>' +
        '<div class="es-card__actions">' +
        '<a href="' + href + '" class="btn btn-primary btn-sm" data-link>レポートを編集</a>' +
        '<a href="#/guides/reports/' + esc(report.id) + '" class="btn btn-secondary btn-sm" data-link>攻略図書館で見る</a>' +
        '</div>'
      );
    }
    if (report) {
      return (
        '<p class="es-report-cta__status">下書きがあります</p>' +
        '<a href="' + href + '" class="btn btn-primary btn-block" data-link>レポートを編集する</a>'
      );
    }
    return '<button type="button" class="btn btn-primary btn-block" disabled>レポートを書く（準備中）</button>';
  }

  function logListHtml(archive) {
    if (!archive.logs.length) {
      return '<p class="es-empty">記録がありません。</p>';
    }
    const rows = archive.logs.slice().reverse().map((l) => {
      const border = l.borderPt != null ? '<span class="es-log-row__border">ボーダー ' + esc(fmtPt(l.borderPt)) + '</span>' : '';
      const note = l.note ? '<span class="es-log-row__note">' + esc(l.note) + '</span>' : '';
      return (
        '<div class="es-log-row" data-at="' + l.at + '">' +
        '<div class="es-log-row__main">' +
        '<span class="es-log-row__time">' + esc(fmtDateTime(l.at)) + '</span>' +
        '<span class="es-log-row__pt">' + esc(fmtPt(l.myPt)) + '</span>' +
        border + note +
        '</div>' +
        '<button type="button" class="btn btn-secondary btn-sm es-log-row__del" aria-label="削除">✕</button>' +
        '</div>'
      );
    }).join('');
    return rows;
  }

  function refreshDynamic(box, archive) {
    const plan = computePlan(archive);
    const chart = box.querySelector('#esChartWrap');
    const planWrap = box.querySelector('#esPlanWrap');
    const logList = box.querySelector('#esLogList');
    if (chart) chart.innerHTML = renderLineChart(archive, plan);
    if (planWrap) planWrap.innerHTML = planCardHtml(archive, plan);
    if (logList) {
      logList.innerHTML = logListHtml(archive);
      wireLogRows(box, archive);
    }
    syncLogToggleLabel(box, archive);
  }

  function syncLogToggleLabel(box, archive) {
    const btn = box.querySelector('#esLogToggle');
    if (!btn) return;
    const open = btn.getAttribute('aria-expanded') === 'true';
    btn.textContent = logToggleLabel(archive.logs.length, open);
  }

  function wireLogRows(box, archive) {
    box.querySelectorAll('.es-log-row__del').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const row = btn.closest('.es-log-row');
        const at = row && Number(row.dataset.at);
        if (!at) return;
        if (!confirm('この記録を削除しますか？')) return;
        archive.logs = archive.logs.filter((l) => l.at !== at);
        try {
          await saveArchive(archive.uid || (window.MiraiAuth.getUser() || {}).uid, archive);
        } catch (e) {
          alert(e.message || String(e));
        }
        refreshDynamic(box, archive);
      });
    });
  }

  function wireArchive(box, user, archive) {
    // 記録追加
    const addBtn = box.querySelector('#esLogAdd');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const errEl = box.querySelector('#esLogError');
        errEl.hidden = true;
        const myPt = numOrNull(box.querySelector('#esLogMyPt').value);
        const borderPt = numOrNull(box.querySelector('#esLogBorderPt').value);
        const note = box.querySelector('#esLogNote').value.trim();
        if (myPt == null || myPt < 0) {
          errEl.textContent = '現在のPtを入力してください。';
          errEl.hidden = false;
          return;
        }
        addBtn.disabled = true;
        addBtn.textContent = '記録中…';
        try {
          archive.logs.push({ at: Date.now(), myPt, borderPt, note });
          archive.logs.sort((a, b) => a.at - b.at);
          await saveArchive(user.uid, archive);
          box.querySelector('#esLogMyPt').value = '';
          box.querySelector('#esLogBorderPt').value = '';
          box.querySelector('#esLogNote').value = '';
          refreshDynamic(box, archive);
        } catch (e) {
          errEl.textContent = e.message || String(e);
          errEl.hidden = false;
        } finally {
          addBtn.disabled = false;
          addBtn.textContent = '現在時刻で記録する';
        }
      });
    }

    wireLogRows(box, archive);

    const logToggle = box.querySelector('#esLogToggle');
    const logList = box.querySelector('#esLogList');
    if (logToggle && logList) {
      logToggle.addEventListener('click', () => {
        const open = logToggle.getAttribute('aria-expanded') !== 'true';
        logToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        logList.hidden = !open;
        logToggle.textContent = logToggleLabel(archive.logs.length, open);
      });
    }

    // 設定: filterType 切り替えで value のリストを更新
    const filterTypeSel = box.querySelector('#esSetFilterType');
    const filterValueSel = box.querySelector('#esSetFilterValue');
    const filterValueLabel = box.querySelector('#esSetFilterValueLabel');
    if (filterTypeSel && filterValueSel) {
      filterTypeSel.addEventListener('change', () => {
        const ft = filterTypeSel.value === 'unit' ? 'unit' : 'banner';
        filterValueSel.innerHTML = filterValueOptions(ft, '');
        if (filterValueLabel) filterValueLabel.textContent = ft === 'unit' ? 'ユニット' : 'バナー';
      });
    }

    // 編成登録モーダル
    const teamModal = box.querySelector('#esTeamModal');
    const teamOpen = box.querySelector('#esTeamOpen');
    const teamCancel = box.querySelector('#esTeamCancel');
    const teamSave = box.querySelector('#esTeamSave');

    function openTeamModal() {
      if (!teamModal) return;
      const errEl = box.querySelector('#esTeamError');
      if (errEl) errEl.hidden = true;
      if (typeof teamModal.showModal === 'function') teamModal.showModal();
      else teamModal.setAttribute('open', '');
    }
    function closeTeamModal() {
      if (!teamModal) return;
      if (typeof teamModal.close === 'function' && teamModal.open) teamModal.close();
      else teamModal.removeAttribute('open');
    }

    if (teamOpen) teamOpen.addEventListener('click', openTeamModal);
    if (teamCancel) teamCancel.addEventListener('click', closeTeamModal);
    if (teamModal) {
      teamModal.addEventListener('cancel', (e) => { e.preventDefault(); closeTeamModal(); });
    }

    const rankModal = box.querySelector('#esRankModal');
    const rankOpen = box.querySelector('#esRankOpen');
    const rankCancel = box.querySelector('#esRankCancel');
    const rankSave = box.querySelector('#esRankSave');

    function openRankModal() {
      if (!rankModal) return;
      const errEl = box.querySelector('#esRankError');
      if (errEl) errEl.hidden = true;
      const sel = box.querySelector('#esRankSelect');
      if (sel) sel.innerHTML = targetRankOptions(archive.targetRank);
      const histEl = box.querySelector('#esRankHistory');
      if (histEl) histEl.innerHTML = rankHistoryHtml(archive);
      if (typeof rankModal.showModal === 'function') rankModal.showModal();
      else rankModal.setAttribute('open', '');
    }
    function closeRankModal() {
      if (!rankModal) return;
      if (typeof rankModal.close === 'function' && rankModal.open) rankModal.close();
      else rankModal.removeAttribute('open');
    }
    function syncRankUi() {
      const statusEl = box.querySelector('#esRankStatus');
      if (statusEl) statusEl.textContent = rankStatusHtml(archive);
      const setRank = box.querySelector('#esSetRank');
      if (setRank) setRank.innerHTML = targetRankOptions(archive.targetRank);
      const histEl = box.querySelector('#esRankHistory');
      if (histEl) histEl.innerHTML = rankHistoryHtml(archive);
    }

    if (rankOpen) rankOpen.addEventListener('click', openRankModal);
    if (rankCancel) rankCancel.addEventListener('click', closeRankModal);
    if (rankModal) {
      rankModal.addEventListener('cancel', (e) => { e.preventDefault(); closeRankModal(); });
    }

    if (rankSave) {
      rankSave.addEventListener('click', async () => {
        const errEl = box.querySelector('#esRankError');
        const savedEl = box.querySelector('#esRankSaved');
        if (errEl) errEl.hidden = true;
        const nextRank = numOrNull(box.querySelector('#esRankSelect').value);
        if (!recordTargetRankChange(archive, nextRank)) {
          if (errEl) {
            errEl.textContent = '目標順位は変わっていません。';
            errEl.hidden = false;
          }
          return;
        }
        rankSave.disabled = true;
        rankSave.textContent = '変更中…';
        try {
          await saveArchive(user.uid, archive);
          closeRankModal();
          if (savedEl) {
            savedEl.hidden = false;
            setTimeout(() => { savedEl.hidden = true; }, 2200);
          }
          syncRankUi();
          refreshDynamic(box, archive);
        } catch (e) {
          if (errEl) {
            errEl.textContent = e.message || String(e);
            errEl.hidden = false;
          }
        } finally {
          rankSave.disabled = false;
          rankSave.textContent = '変更する';
        }
      });
    }

    if (teamSave) {
      teamSave.addEventListener('click', async () => {
        const errEl = box.querySelector('#esTeamError');
        const savedEl = box.querySelector('#esTeamSaved');
        errEl.hidden = true;
        const sougou = numOrNull(box.querySelector('#esSetSougou').value);
        const jikko = numOrNull(box.querySelector('#esSetJikko').value);
        const bonus = numOrNull(box.querySelector('#esSetBonus').value);
        if (sougou == null || jikko == null || bonus == null) {
          errEl.textContent = '総合力・実効値・イベントボーナスをすべて入力してください。';
          errEl.hidden = false;
          return;
        }
        archive.params = {
          sougouryokuMan: sougou,
          jikkochiPct: jikko,
          bonusPct: bonus,
          crystals: numOrNull(box.querySelector('#esSetCrystals').value),
          cook: archive.params.cook != null ? archive.params.cook : 5,
        };
        teamSave.disabled = true;
        teamSave.textContent = '登録中…';
        try {
          await saveArchive(user.uid, archive);
          closeTeamModal();
          if (savedEl) {
            savedEl.hidden = false;
            setTimeout(() => { savedEl.hidden = true; }, 2200);
          }
          const resultEl = box.querySelector('#esTeamResult');
          if (resultEl) resultEl.innerHTML = teamEstimateHtml(archive);
          if (teamOpen) teamOpen.textContent = teamOpenLabel(archive);
          refreshDynamic(box, archive);
        } catch (e) {
          errEl.textContent = e.message || String(e);
          errEl.hidden = false;
        } finally {
          teamSave.disabled = false;
          teamSave.textContent = '登録する';
        }
      });
    }

    // 設定保存
    const setSave = box.querySelector('#esSetSave');
    if (setSave) {
      setSave.addEventListener('click', async () => {
        const errEl = box.querySelector('#esSetError');
        const savedEl = box.querySelector('#esSetSaved');
        errEl.hidden = true;
        savedEl.hidden = true;
        const title = box.querySelector('#esSetTitle').value.trim();
        if (!title) {
          errEl.textContent = 'イベント名を入力してください。';
          errEl.hidden = false;
          return;
        }
        archive.title = title;
        archive.startAt = combineDateTime(box.querySelector('#esSetStartDate').value, box.querySelector('#esSetStartTime').value);
        archive.endAt = combineDateTime(box.querySelector('#esSetEndDate').value, box.querySelector('#esSetEndTime').value);
        if (!archive.startAt || !archive.endAt) {
          errEl.textContent = 'イベント期間（開始・終了）を入力してください。';
          errEl.hidden = false;
          return;
        }
        if (archive.endAt <= archive.startAt) {
          errEl.textContent = '終了日時は開始日時より後にしてください。';
          errEl.hidden = false;
          return;
        }
        recordTargetRankChange(archive, numOrNull(box.querySelector('#esSetRank').value));
        archive.filterType = box.querySelector('#esSetFilterType').value === 'unit' ? 'unit' : 'banner';
        const fv = box.querySelector('#esSetFilterValue').value;
        if (archive.filterType === 'unit') { archive.unit = fv; } else { archive.banner = fv; }
        archive.targetPtManual = numOrNull(box.querySelector('#esSetTargetManual').value);
        const pubEl = box.querySelector('#esSetPublic');
        archive.isPublic = !pubEl || pubEl.checked;
        setSave.disabled = true;
        setSave.textContent = '保存中…';
        try {
          await saveArchive(user.uid, archive);
          savedEl.hidden = false;
          setTimeout(() => { savedEl.hidden = true; }, 2200);
          const titleDisplay = box.querySelector('#esTitleDisplay');
          if (titleDisplay) titleDisplay.textContent = archive.title || '無題のイベント';
          const periodEl = box.querySelector('.es-record__period');
          if (periodEl) periodEl.textContent = (archive.startAt || archive.endAt) ? fmtDateTime(archive.startAt) + ' 〜 ' + fmtDateTime(archive.endAt) : '期間未設定';
          if (typeof syncRankUi === 'function') syncRankUi();
          refreshDynamic(box, archive);
        } catch (e) {
          errEl.textContent = e.message || String(e);
          errEl.hidden = false;
        } finally {
          setSave.disabled = false;
          setSave.textContent = 'イベント設定を保存';
        }
      });
    }

    // 終了時: 画像選択（プレビューのみ、保存で確定）
    let pendingImageFile = null;
    let previewObjectUrl = null;
    const fileInput = box.querySelector('#esFinalFile');
    const imgStatus = box.querySelector('#esFinalImageStatus');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (!/^image\//i.test(file.type)) {
          if (imgStatus) imgStatus.textContent = '画像ファイルを選んでください。';
          return;
        }
        pendingImageFile = file;
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = URL.createObjectURL(file);
        const preview = box.querySelector('#esFinalPreview');
        if (preview) preview.innerHTML = `<img src="${previewObjectUrl}" alt="バナーページのスクショ" decoding="async">`;
        if (imgStatus) imgStatus.textContent = '「終了時の記録を保存」で確定します';
      });
    }

    const finalSave = box.querySelector('#esFinalSave');
    if (finalSave) {
      finalSave.addEventListener('click', async () => {
        const errEl = box.querySelector('#esFinalError');
        const savedEl = box.querySelector('#esFinalSaved');
        errEl.hidden = true;
        savedEl.hidden = true;
        finalSave.disabled = true;
        finalSave.textContent = '保存中…';
        try {
          if (pendingImageFile) {
            if (imgStatus) imgStatus.textContent = '画像をアップロード中…';
            archive.finalImageURL = await uploadBannerImage(user.uid, archive.id, pendingImageFile);
            pendingImageFile = null;
            if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; }
            if (fileInput) fileInput.value = '';
            if (imgStatus) imgStatus.textContent = '';
          }
          archive.finalRank = numOrNull(box.querySelector('#esFinalRank').value);
          archive.finalPt = numOrNull(box.querySelector('#esFinalPt').value);
          archive.crystalsUsed = numOrNull(box.querySelector('#esFinalCrystals').value);
          await saveArchive(user.uid, archive);
          const preview = box.querySelector('#esFinalPreview');
          if (preview && archive.finalImageURL) {
            preview.innerHTML = `<img src="${esc(archive.finalImageURL)}" alt="バナーページのスクショ" decoding="async">`;
          }
          savedEl.hidden = false;
          setTimeout(() => { savedEl.hidden = true; }, 2200);
        } catch (e) {
          errEl.textContent = e.message || String(e);
          errEl.hidden = false;
        } finally {
          finalSave.disabled = false;
          finalSave.textContent = '終了時の記録を保存';
        }
      });
    }

    // 削除
    const delBtn = box.querySelector('#esDeleteArchive');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!confirm('このイベントの記録を削除しますか？（元に戻せません）')) return;
        delBtn.disabled = true;
        try {
          await deleteArchive(user.uid, archive.id);
          location.hash = '#/mypage/event-support';
        } catch (e) {
          delBtn.disabled = false;
          alert(e.message || String(e));
        }
      });
    }
  }

  // ---------- マイページ用の要約 ----------

  function publicArchiveCardHtml(a) {
    const last = a.logs.length ? a.logs[a.logs.length - 1] : null;
    const period = (a.startAt || a.endAt)
      ? fmtDateTime(a.startAt) + ' 〜 ' + fmtDateTime(a.endAt)
      : '期間未設定';
    const stats = [];
    if (a.finalRank != null) stats.push('最終 ' + (typeof window.fmtNum === 'function' ? window.fmtNum(a.finalRank) : a.finalRank) + '位');
    if (a.finalPt != null) stats.push(fmtPt(a.finalPt));
    else if (last) stats.push('現在 ' + fmtPt(last.myPt));
    const thumb = a.finalImageURL
      ? '<div class="es-public-card__thumb"><img src="' + esc(a.finalImageURL) + '" alt="" loading="lazy" decoding="async"></div>'
      : '';
    const plan = computePlan(a);
    const chart = a.logs.length ? renderLineChart(a, plan) : '';
    return (
      '<article class="es-public-card">' +
      thumb +
      '<div class="es-public-card__body">' +
      '<h3 class="es-public-card__title">' + esc(a.title || '無題のイベント') + '</h3>' +
      (resolveEventChar(a) ? '<p class="es-public-card__char">' + eventCharTagHtml(resolveEventChar(a)) + '</p>' : '') +
      '<p class="es-public-card__period">' + esc(period) + '</p>' +
      (stats.length ? '<p class="es-public-card__stats">' + esc(stats.join(' · ')) + '</p>' : '') +
      chart +
      '</div>' +
      '</article>'
    );
  }

  function publicArchivesHtml(archives) {
    const items = (archives || []).filter((a) => a && a.isPublic !== false);
    if (!items.length) return '';
    return (
      '<section class="sekai-notes es-public-archives" aria-label="イベントアーカイブ">' +
      '<h2 class="sekai-notes__heading">📈 イベントアーカイブ</h2>' +
      '<div class="es-public-list">' + items.map(publicArchiveCardHtml).join('') + '</div>' +
      '</section>'
    );
  }

  async function fetchArchiveCount(uid) {
    try {
      const items = await listArchives(uid);
      return items.length;
    } catch (e) {
      console.warn('[event-support] count failed:', e);
      return null;
    }
  }

  return {
    initHub,
    initArchive,
    fetchArchiveCount,
    listPublicArchives,
    publicArchivesHtml,
    loadArchive,
    renderLineChart,
    computePlan,
    hasTeamParams,
    teamSummaryText,
    fmtPt,
    fmtDateTime,
    getEventCharList,
    resolveEventChar,
    MAX_ARCHIVES,
  };
})();

window.MiraiEventSupport = MiraiEventSupport;
