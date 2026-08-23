/**
 * 未来喫茶 — 攻略図書館
 *
 * - #/guides                         一覧（イベランレポート＋カテゴリ）
 * - #/guides/reports/:id             イベランレポート詳細（公開）
 * - #/mypage/event-support/:id/report  アーカイブからレポート作成・編集（要ログイン）
 *
 * データ: eventReports/{uid}_{archiveId}
 *   公開記事は isPublished == true のみ一覧・詳細に出る。
 *   本文はセカイノートと同じくタイトル＋本文のノート形式。
 *   成績・グラフ・編成はイベントアーカイブのスナップショット。
 */
const GuidesPage = (function () {
  'use strict';

  const COLLECTION = 'eventReports';
  const TITLE_MAX = 80;
  const BODY_MAX = 4000;
  const MAX_REPORTS = 10;
  const LIST_LIMIT = 50;
  const LOG_SNAPSHOT_MAX = 80;
  const BODY_TEMPLATE =
    '走り方・反省点・おすすめ編成などを自由に書いてください。\n\n' +
    '例）\n' +
    '・周回は独りんぼエンヴィーの10炊き中心\n' +
    '・睡眠は○時間確保した\n' +
    '・ボーダーの上がりが速く、後半はペースを上げた\n' +
    '・次はボーナスをもう少し積みたい';

  const CATEGORIES = [
    { id: 'event', name: 'イベント・イベラン', emoji: '🏆' },
    { id: 'mysekai', name: 'マイセカイ', emoji: '🌿' },
    { id: 'team', name: '編成・育成', emoji: '📐' },
    { id: 'other', name: 'その他', emoji: '📖' },
  ];

  const SECTION_DEFS = [
    { id: 'image', label: '結果画像' },
    { id: 'result', label: '最終着地' },
    { id: 'analysis', label: '走りの分析' },
    { id: 'timetable', label: 'タイムテーブル' },
    { id: 'team', label: '編成・イベントボーナス' },
    { id: 'crystals', label: '消化したクリスタル' },
    { id: 'note', label: 'ノート本文' },
  ];
  const HOUR_MS = 3600000;
  const TT_TEXT_MAX = 40;
  const TT_HOURS_MAX = 16 * 24;
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  function defaultSections() {
    const o = {};
    SECTION_DEFS.forEach((s) => { o[s.id] = true; });
    return o;
  }

  function normalizeSections(raw) {
    const base = defaultSections();
    if (!raw || typeof raw !== 'object') return base;
    SECTION_DEFS.forEach((s) => {
      if (raw[s.id] === false) base[s.id] = false;
    });
    return base;
  }

  function sectionOn(report, id) {
    if (!report || !report.sections) return true;
    return report.sections[id] !== false;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtNum(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    if (typeof window.fmtNum === 'function') return window.fmtNum(n);
    return Number(n).toLocaleString('ja-JP');
  }

  function fmtPt(n) {
    const es = window.MiraiEventSupport;
    if (es && typeof es.fmtPt === 'function') return es.fmtPt(n);
    if (n == null) return '—';
    return fmtNum(n) + ' Pt';
  }

  function fmtDateTime(ms) {
    const es = window.MiraiEventSupport;
    if (es && typeof es.fmtDateTime === 'function') return es.fmtDateTime(ms);
    if (!ms) return '—';
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function fmtDate(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  }

  function targetRankLabel(rank) {
    if (rank == null || rank === '') return '';
    const presets = window.PjskEngine && PjskEngine.TARGET_RANK_PRESETS;
    const p = presets && presets.find((x) => x.id === Number(rank));
    return p ? p.label : String(rank) + '位';
  }

  function periodText(a) {
    if (a && (a.startAt || a.endAt)) return fmtDateTime(a.startAt) + ' 〜 ' + fmtDateTime(a.endAt);
    return '期間未設定';
  }

  function hourFloor(ms) {
    const d = new Date(Number(ms));
    if (!Number.isFinite(d.getTime())) return null;
    d.setMinutes(0, 0, 0);
    return d.getTime();
  }

  function eventHourSlots(startAt, endAt) {
    const start = Number(startAt);
    const end = Number(endAt);
    if (!start || !end || end <= start) return [];
    let t = hourFloor(start);
    if (t == null) return [];
    const slots = [];
    while (t < end && slots.length < TT_HOURS_MAX) {
      slots.push(t);
      t += HOUR_MS;
    }
    return slots;
  }

  function dayKey(ms) {
    const d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function dayLabel(ms) {
    const d = new Date(ms);
    return (d.getMonth() + 1) + '/' + d.getDate() + '（' + WEEKDAYS[d.getDay()] + '）';
  }

  function hourLabel(ms) {
    const d = new Date(ms);
    return String(d.getHours()).padStart(2, '0') + ':00';
  }

  function groupHoursByDay(hours) {
    const groups = [];
    const map = {};
    (hours || []).forEach((at) => {
      const key = dayKey(at);
      if (!map[key]) {
        map[key] = { key, label: dayLabel(at), hours: [] };
        groups.push(map[key]);
      }
      map[key].hours.push(at);
    });
    return groups;
  }

  function normalizeTimetable(raw) {
    const map = {};
    if (!raw) return map;
    const list = Array.isArray(raw) ? raw : (Array.isArray(raw.slots) ? raw.slots : null);
    if (list) {
      list.forEach((s) => {
        const at = Number(s && s.at);
        const text = String((s && (s.text != null ? s.text : s.note)) || '').trim().slice(0, TT_TEXT_MAX);
        if (at && text) map[at] = text;
      });
      return map;
    }
    if (typeof raw === 'object') {
      Object.keys(raw).forEach((k) => {
        const at = Number(k);
        const text = String(raw[k] || '').trim().slice(0, TT_TEXT_MAX);
        if (at && text) map[at] = text;
      });
    }
    return map;
  }

  function timetableToList(map) {
    return Object.keys(map || {})
      .map((k) => ({ at: Number(k), text: String(map[k] || '').trim().slice(0, TT_TEXT_MAX) }))
      .filter((s) => s.at && s.text)
      .sort((a, b) => a.at - b.at);
  }

  function timetableFilledCount(map) {
    return timetableToList(map).length;
  }

  function timetableHintText(snapshot, map) {
    const hours = eventHourSlots(snapshot && snapshot.startAt, snapshot && snapshot.endAt);
    if (!hours.length) return 'イベント期間が未設定です。アーカイブのイベント設定で開始・終了を入力してください。';
    const filled = timetableFilledCount(map);
    return filled
      ? hours.length + '時間中 ' + filled + '件を記入済み。レポート保存時に一緒に保存されます。'
      : 'イベント期間の' + hours.length + '時間分を、1時間ごとに編集できます。';
  }

  function numOrNull(v) {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  async function fb() {
    return window.MiraiFirebaseReady ? await window.MiraiFirebaseReady : null;
  }

  async function isConfigured() {
    const f = await fb();
    return !!(f && f.configured);
  }

  function reportIdForArchive(uid, archiveId) {
    return String(uid) + '_' + String(archiveId);
  }

  function getEventCharList() {
    if (window.MiraiEventSupport && typeof MiraiEventSupport.getEventCharList === 'function') {
      return MiraiEventSupport.getEventCharList();
    }
    return [
      '一歌', '咲希', '穂波', '志歩', 'みのり', '遥', '愛莉', '雫', 'こはね', '杏',
      '彰人', '冬弥', '司', 'えむ', '寧々', '類', '奏', 'まふゆ', '絵名', '瑞希',
      '初音ミク', '鏡音リン', '鏡音レン', '巡音ルカ', 'MEIKO', 'KAITO',
    ];
  }

  function resolveEventChar(a) {
    if (window.MiraiEventSupport && typeof MiraiEventSupport.resolveEventChar === 'function') {
      return MiraiEventSupport.resolveEventChar(a);
    }
    const explicit = String((a && a.eventChar) || '').trim();
    if (explicit) return explicit.slice(0, 20);
    const banner = a && a.banner ? String(a.banner).trim() : '';
    return getEventCharList().includes(banner) ? banner : '';
  }

  function reportEventChar(report) {
    if (!report) return '';
    const top = String(report.eventChar || '').trim();
    if (top) return top.slice(0, 20);
    return resolveEventChar(report.snapshot || {});
  }

  function charTagHtml(name) {
    if (!name) return '';
    return '<span class="char-tag">' + esc(name) + '</span>';
  }

  function snapshotFromArchive(archive) {
    const a = archive || {};
    const p = a.params || {};
    const logs = (Array.isArray(a.logs) ? a.logs : [])
      .slice(-LOG_SNAPSHOT_MAX)
      .map((l) => ({
        at: Number(l.at) || 0,
        myPt: numOrNull(l.myPt),
        borderPt: numOrNull(l.borderPt),
      }))
      .filter((l) => l.at && l.myPt != null);
    return {
      eventTitle: String(a.title || '').slice(0, 60),
      eventChar: resolveEventChar(a),
      startAt: numOrNull(a.startAt),
      endAt: numOrNull(a.endAt),
      filterType: a.filterType === 'unit' ? 'unit' : 'banner',
      banner: String(a.banner || ''),
      unit: String(a.unit || ''),
      targetRank: numOrNull(a.targetRank),
      targetPtManual: numOrNull(a.targetPtManual),
      resultTargetRank: numOrNull(a.resultTargetRank),
      resultTargetPt: numOrNull(a.resultTargetPt),
      params: {
        sougouryokuMan: numOrNull(p.sougouryokuMan),
        jikkochiPct: numOrNull(p.jikkochiPct),
        bonusPct: numOrNull(p.bonusPct),
        crystals: numOrNull(p.crystals),
      },
      logs,
      finalRank: numOrNull(a.finalRank),
      finalPt: numOrNull(a.finalPt),
      crystalsUsed: numOrNull(a.crystalsUsed),
      finalImageURL: String(a.finalImageURL || ''),
    };
  }

  function snapshotToArchive(snap) {
    snap = snap || {};
    const p = snap.params || {};
    return {
      title: snap.eventTitle || '',
      eventChar: resolveEventChar(snap),
      startAt: numOrNull(snap.startAt),
      endAt: numOrNull(snap.endAt),
      filterType: snap.filterType === 'unit' ? 'unit' : 'banner',
      banner: snap.banner || '',
      unit: snap.unit || '',
      targetRank: numOrNull(snap.targetRank),
      targetPtManual: numOrNull(snap.targetPtManual),
      resultTargetRank: numOrNull(snap.resultTargetRank),
      resultTargetPt: numOrNull(snap.resultTargetPt),
      params: {
        sougouryokuMan: numOrNull(p.sougouryokuMan),
        jikkochiPct: numOrNull(p.jikkochiPct),
        bonusPct: numOrNull(p.bonusPct),
        crystals: numOrNull(p.crystals),
      },
      logs: Array.isArray(snap.logs) ? snap.logs : [],
      finalRank: numOrNull(snap.finalRank),
      finalPt: numOrNull(snap.finalPt),
      crystalsUsed: numOrNull(snap.crystalsUsed),
      finalImageURL: snap.finalImageURL || '',
    };
  }

  function normalizeReport(raw, id) {
    raw = raw || {};
    const snapshot = snapshotFromArchive(snapshotToArchive(raw.snapshot || {}));
    const eventChar = String(raw.eventChar || snapshot.eventChar || '').slice(0, 20);
    if (eventChar && !snapshot.eventChar) snapshot.eventChar = eventChar;
    const resultTargetRank = numOrNull(raw.resultTargetRank != null ? raw.resultTargetRank : snapshot.resultTargetRank);
    const resultTargetPt = numOrNull(raw.resultTargetPt != null ? raw.resultTargetPt : snapshot.resultTargetPt);
    snapshot.resultTargetRank = resultTargetRank;
    snapshot.resultTargetPt = resultTargetPt;
    return {
      id: id || raw.id || '',
      authorUid: String(raw.authorUid || ''),
      authorPublicId: String(raw.authorPublicId || ''),
      authorDisplayName: String(raw.authorDisplayName || ''),
      archiveId: String(raw.archiveId || ''),
      title: String(raw.title || '').slice(0, TITLE_MAX),
      body: String(raw.body || '').slice(0, BODY_MAX),
      eventChar,
      isPublished: raw.isPublished === true,
      crystalsUsed: numOrNull(raw.crystalsUsed != null ? raw.crystalsUsed : snapshot.crystalsUsed),
      resultTargetRank,
      resultTargetPt,
      timetable: normalizeTimetable(raw.timetable),
      snapshot,
      sections: normalizeSections(raw.sections),
      createdAtMs: Number(raw.createdAtMs) || Date.now(),
      updatedAtMs: Number(raw.updatedAtMs) || 0,
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

  const LOCAL_REPORTS_KEY = 'miraiLocalGuestReports';

  function readLocalReports() {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_REPORTS_KEY) || '[]');
      return Array.isArray(raw) ? raw.map((r) => normalizeReport(r, r.id)) : [];
    } catch (e) {
      return [];
    }
  }

  function writeLocalReports(items) {
    localStorage.setItem(LOCAL_REPORTS_KEY, JSON.stringify(items));
  }

  async function loadReport(id) {
    if (useLocalPreview()) {
      return readLocalReports().find((r) => r.id === id) || null;
    }
    const f = await fb();
    if (!f || !f.configured || !id) return null;
    try {
      const { doc, getDoc } = f.dbFns;
      const snap = await getDoc(doc(f.db, COLLECTION, id));
      if (!snap.exists()) return null;
      return normalizeReport(snap.data(), snap.id);
    } catch (e) {
      console.warn('[guides] loadReport:', e);
      return null;
    }
  }

  async function listPublishedReports() {
    if (useLocalPreview()) {
      return readLocalReports().filter((r) => r.isPublished).sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
    }
    const f = await fb();
    if (!f || !f.configured) return [];
    const { collection, query, where, orderBy, limit, getDocs } = f.dbFns;
    const col = collection(f.db, COLLECTION);
    let snap;
    try {
      snap = await getDocs(query(
        col,
        where('isPublished', '==', true),
        orderBy('updatedAtMs', 'desc'),
        limit(LIST_LIMIT)
      ));
    } catch (e) {
      snap = await getDocs(query(col, where('isPublished', '==', true), limit(LIST_LIMIT)));
    }
    const items = [];
    snap.forEach((d) => items.push(normalizeReport(d.data(), d.id)));
    items.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
    return items;
  }

  async function listOwnReports(uid) {
    if (useLocalPreview()) {
      return readLocalReports().sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
    }
    const f = await fb();
    if (!f || !f.configured || !uid) return [];
    const { collection, query, where, orderBy, getDocs } = f.dbFns;
    const col = collection(f.db, COLLECTION);
    let snap;
    try {
      snap = await getDocs(query(
        col,
        where('authorUid', '==', uid),
        orderBy('updatedAtMs', 'desc')
      ));
    } catch (e) {
      snap = await getDocs(query(col, where('authorUid', '==', uid)));
    }
    const items = [];
    snap.forEach((d) => items.push(normalizeReport(d.data(), d.id)));
    items.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
    return items;
  }

  async function loadAuthorHub(uid) {
    if (useLocalPreview()) {
      return { displayName: 'ゲスト（ローカル）', publicId: 'guestloc' };
    }
    const f = await fb();
    if (!f || !f.configured || !uid) return { displayName: '', publicId: '' };
    const { doc, getDoc } = f.dbFns;
    try {
      const snap = await getDoc(doc(f.db, 'users', uid, 'sns', 'linkHub'));
      if (!snap.exists()) return { displayName: '', publicId: '' };
      const d = snap.data() || {};
      return {
        displayName: String(d.displayName || ''),
        publicId: String(d.publicId || ''),
      };
    } catch (e) {
      return { displayName: '', publicId: '' };
    }
  }

  async function saveReport(report) {
    if (useLocalPreview()) {
      const data = Object.assign({}, normalizeReport(report, report.id), {
        updatedAtMs: Date.now(),
      });
      data.timetable = timetableToList(data.timetable);
      if (!data.createdAtMs) data.createdAtMs = Date.now();
      const items = readLocalReports().filter((r) => r.id !== data.id);
      items.unshift(data);
      writeLocalReports(items);
      return normalizeReport(data, data.id);
    }
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const { doc, setDoc, serverTimestamp } = f.dbFns;
    const data = Object.assign({}, normalizeReport(report, report.id), {
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    });
    data.timetable = timetableToList(data.timetable);
    if (!data.createdAtMs) data.createdAtMs = Date.now();
    await setDoc(doc(f.db, COLLECTION, data.id), data, { merge: true });
    return data;
  }

  async function deleteReport(id) {
    if (useLocalPreview()) {
      writeLocalReports(readLocalReports().filter((r) => r.id !== id));
      return;
    }
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const { doc, deleteDoc } = f.dbFns;
    await deleteDoc(doc(f.db, COLLECTION, id));
  }

  function teamSummaryText(params) {
    const es = window.MiraiEventSupport;
    if (es && typeof es.teamSummaryText === 'function') return es.teamSummaryText(params);
    const p = params || {};
    if (p.sougouryokuMan == null || p.jikkochiPct == null || p.bonusPct == null) return '';
    return '総合力 ' + p.sougouryokuMan + '万 / 実効値 ' + p.jikkochiPct + '% / ボーナス ' + p.bonusPct + '%';
  }

  function hasTeamParams(archive) {
    const es = window.MiraiEventSupport;
    if (es && typeof es.hasTeamParams === 'function') return es.hasTeamParams(archive);
    const p = archive && archive.params;
    return !!(p && p.sougouryokuMan != null && p.jikkochiPct != null && p.bonusPct != null);
  }

  function reportChartHtml(archive) {
    const es = window.MiraiEventSupport;
    if (!archive || !archive.logs || !archive.logs.length) {
      return '<p class="es-empty">ポイント推移の記録はありません。</p>';
    }
    if (!es || typeof es.renderLineChart !== 'function') {
      return '<p class="es-empty">グラフを表示できません。</p>';
    }
    try {
      const plan = typeof es.computePlan === 'function' ? es.computePlan(archive) : null;
      return es.renderLineChart(archive, plan);
    } catch (e) {
      console.warn('[guides] chart:', e);
      return '<p class="es-empty">グラフを表示できません。</p>';
    }
  }

  function fmtHours(h) {
    if (h == null || !Number.isFinite(h)) return '—';
    if (h >= 24) {
      const d = Math.floor(h / 24);
      const r = Math.round(h - d * 24);
      return r > 0 ? d + '日' + r + '時間' : d + '日';
    }
    if (h >= 1) return '約' + (Math.round(h * 10) / 10) + '時間';
    return '約' + Math.max(1, Math.round(h * 60)) + '分';
  }

  function fmtCount(n) {
    if (n == null || !Number.isFinite(Number(n))) return '—';
    if (typeof window.fmtNum === 'function') return window.fmtNum(Math.round(n));
    return Math.round(n).toLocaleString('ja-JP');
  }

  function statsCellsHtml(cells) {
    const list = (cells || []).filter((c) => c && c.value);
    if (!list.length) return '';
    return (
      '<dl class="guide-report-stats">' +
      list.map((c) =>
        '<div class="guide-report-stats__cell"><dt>' + esc(c.label) + '</dt><dd>' + esc(c.value) + '</dd></div>'
      ).join('') +
      '</dl>'
    );
  }

  function scorePt(archive) {
    if (!archive) return null;
    if (archive.finalPt != null) return archive.finalPt;
    const last = archive.logs && archive.logs.length ? archive.logs[archive.logs.length - 1] : null;
    return last && last.myPt != null ? last.myPt : null;
  }

  function analyzeArchive(archive) {
    const a = archive || {};
    const logs = Array.isArray(a.logs) ? a.logs : [];
    const first = logs[0] || null;
    const last = logs.length ? logs[logs.length - 1] : null;
    const pt = scorePt(a);
    const startPt = first && first.myPt != null ? first.myPt : null;
    const gained = (pt != null && startPt != null) ? pt - startPt : null;
    const hoursLogged = (first && last && last.at > first.at) ? (last.at - first.at) / 3600000 : null;
    const eventHours = (a.startAt && a.endAt && a.endAt > a.startAt) ? (a.endAt - a.startAt) / 3600000 : null;
    const es = window.MiraiEventSupport;
    const plan = (es && typeof es.computePlan === 'function') ? es.computePlan(a) : null;
    let team = null;
    if (hasTeamParams(a) && window.PjskEngine) {
      const p = a.params;
      const rph = PjskEngine.ENVY_RUNS_PER_HOUR || 28;
      const ep0 = PjskEngine.envyEventPtBase(p.sougouryokuMan * 10000, p.jikkochiPct, p.bonusPct);
      const pt5 = ep0 * PjskEngine.lbEventPtMul(5);
      const pt10 = ep0 * PjskEngine.lbEventPtMul(10);
      team = {
        p,
        rph,
        ep0,
        pt5,
        pt10,
        hourly5: pt5 * rph,
        hourly10: pt10 * rph,
      };
    }
    return { a, logs, first, last, pt, startPt, gained, hoursLogged, eventHours, plan, team };
  }

  function resultGoalRank(a) {
    if (!a) return null;
    if (a.resultTargetRank != null) return a.resultTargetRank;
    return null;
  }

  /** 目標Pt＝レポートに記入した目標順位のポイント。 */
  function resolveTargetPt(info) {
    const a = info.a || {};
    if (a.resultTargetPt != null) return a.resultTargetPt;
    return null;
  }

  function targetPtNote() {
    return 'レポート記入';
  }

  function applyReportGoals(snapshot, report) {
    const snap = Object.assign({}, snapshot || {});
    if (!report) return snap;
    snap.resultTargetRank = report.resultTargetRank != null ? report.resultTargetRank : null;
    snap.resultTargetPt = report.resultTargetPt != null ? report.resultTargetPt : null;
    return snap;
  }

  function pickReportGoalRank(report, snapshot) {
    if (report && report.resultTargetRank != null) return report.resultTargetRank;
    if (snapshot && snapshot.resultTargetRank != null) return snapshot.resultTargetRank;
    if (snapshot && snapshot.targetRank != null) return snapshot.targetRank;
    return null;
  }

  function pickReportGoalPt(report, snapshot) {
    if (report && report.resultTargetPt != null) return report.resultTargetPt;
    if (snapshot && snapshot.resultTargetPt != null) return snapshot.resultTargetPt;
    return null;
  }

  function eventHasEnded(info) {
    if (info.plan && info.plan.eventEnded) return true;
    return !!(info.a && info.a.endAt && info.a.endAt <= Date.now());
  }

  function reachedTargetPt(info) {
    const targetPt = resolveTargetPt(info);
    if (info.pt == null || targetPt == null) return null;
    return info.pt >= targetPt;
  }

  function signedPt(n) {
    if (n == null || !Number.isFinite(n)) return '';
    const sign = n > 0 ? '+' : n < 0 ? '−' : '±';
    return sign + fmtNum(Math.abs(Math.round(n))) + ' Pt';
  }

  function overviewSectionHtml(info) {
    const a = info.a;
    const name = a.title || '無題のイベント';
    const period = periodText(a);
    const goal = targetRankLabel(resultGoalRank(a));
    return (
      '<section class="guide-overview">' +
      '<p class="guide-overview__kicker">イベント概要</p>' +
      '<h3 class="guide-overview__name">' + esc(name) + '</h3>' +
      '<p class="guide-overview__period">' + esc(period) + '</p>' +
      (goal ? '<p class="guide-overview__goal">目標順位 ' + esc(goal) + '</p>' : '') +
      '</section>'
    );
  }

  function landingRowHtml(label, rankText, ptText, extraHtml, ptNote) {
    return (
      '<div class="guide-landing-row">' +
      '<span class="guide-landing-row__label">' + esc(label) + '</span>' +
      '<span class="guide-landing-row__rank">' + esc(rankText) + '</span>' +
      '<span class="guide-landing-row__pt">' +
      (ptText ? esc(ptText) : '') +
      (ptNote ? '<small>' + esc(ptNote) + '</small>' : '') +
      '</span>' +
      (extraHtml || '') +
      '</div>'
    );
  }

  function resultSectionHtml(info) {
    const a = info.a;
    if (a.finalRank == null && info.pt == null) return '';
    const rankHtml = a.finalRank != null
      ? '<p class="guide-landing__rank">' + esc(fmtNum(a.finalRank)) + '<span>位</span></p>'
      : '<p class="guide-landing__rank guide-landing__rank--empty">順位未記録</p>';

    const targetPt = resolveTargetPt(info);
    const rows = [];
    const goalRank = resultGoalRank(a);
    if (goalRank != null || targetPt != null) {
      rows.push(landingRowHtml(
        '目標順位',
        goalRank != null ? targetRankLabel(goalRank) : '—',
        targetPt != null ? fmtPt(targetPt) : '',
        '',
        targetPt != null ? targetPtNote() : ''
      ));
    }
    if (a.finalRank != null || info.pt != null) {
      const diff = (info.pt != null && targetPt != null) ? Math.round(info.pt - targetPt) : null;
      const diffHtml = diff != null
        ? '<span class="guide-landing-row__diff' + (diff >= 0 ? ' is-plus' : ' is-minus') + '">' + esc(signedPt(diff)) + '</span>'
        : '';
      rows.push(landingRowHtml(
        '着地順位',
        a.finalRank != null ? fmtNum(a.finalRank) + '位' : '—',
        info.pt != null ? fmtPt(info.pt) : '',
        diffHtml,
        info.pt != null ? '実際' : ''
      ));
    }
    const list = rows.length ? '<div class="guide-landing-rows">' + rows.join('') + '</div>' : '';
    return (
      '<section class="guide-landing">' +
      '<p class="guide-landing__kicker">最終着地</p>' +
      rankHtml +
      list +
      '</section>'
    );
  }

  function analysisRowHtml(label, value, extra) {
    if (!value) return '';
    return (
      '<div class="guide-run-row">' +
      '<p class="guide-run-row__label">' + esc(label) + '</p>' +
      '<p class="guide-run-row__value">' + esc(value) + (extra ? '<span class="guide-run-row__extra">' + esc(extra) + '</span>' : '') + '</p>' +
      '</div>'
    );
  }

  function analysisSectionHtml(info, archive) {
    const rows = [];
    if (info.startPt != null && info.pt != null) {
      rows.push(analysisRowHtml(
        'Ptの伸び',
        fmtPt(info.startPt) + ' → ' + fmtPt(info.pt),
        info.gained != null ? '+' + fmtPt(info.gained) : ''
      ));
    }
    if (info.hoursLogged != null) rows.push(analysisRowHtml('記録した時間', fmtHours(info.hoursLogged)));
    const plan = info.plan;
    if (plan && plan.avgPace != null) rows.push(analysisRowHtml('平均ペース', fmtPt(Math.round(plan.avgPace)) + ' / 時'));
    const ended = eventHasEnded(info);
    if (!ended && plan && plan.landingPt != null) {
      rows.push(analysisRowHtml('このペースの着地予想', fmtPt(Math.round(plan.landingPt))));
    }
    if (info.last && info.last.borderPt != null && info.last.myPt != null) {
      const gap = Math.round(info.last.myPt - info.last.borderPt);
      rows.push(analysisRowHtml(
        '最終記録時のボーダー差',
        signedPt(gap),
        gap >= 0 ? 'ボーダー上' : 'ボーダー下'
      ));
    }
    const reachedPt = reachedTargetPt(info);
    const targetPt = resolveTargetPt(info);
    if (reachedPt != null && targetPt != null) {
      if (ended) {
        rows.push(analysisRowHtml(
          '目標Pt判定',
          reachedPt ? '到達' : '届かず',
          '目標 ' + fmtPt(targetPt)
        ));
      } else {
        const land = plan && plan.landingPt != null ? plan.landingPt : info.pt;
        const will = land >= targetPt;
        rows.push(analysisRowHtml(
          '着地判定',
          will ? '目標Ptに届く見込み' : '目標Ptに届かない見込み',
          '目標 ' + fmtPt(targetPt)
        ));
      }
    }
    const list = rows.join('');
    const chart = reportChartHtml(archive);
    if (!list && (!archive.logs || !archive.logs.length)) return '';
    return (
      '<section class="guide-run">' +
      '<p class="guide-run__kicker">走りの分析</p>' +
      (list ? '<div class="guide-run-list">' + list + '</div>' : '') +
      '<div class="guide-run-chart">' +
      '<p class="guide-run-chart__label">ポイント推移</p>' +
      chart +
      '</div>' +
      '</section>'
    );
  }

  function teamSectionHtml(info) {
    const team = info.team;
    if (!team) return '';
    const p = team.p;
    return (
      '<section class="guide-report-section">' +
      '<p class="adjust-filters__title">🍚 編成・イベントボーナス</p>' +
      '<div class="guide-run-list">' +
      analysisRowHtml('総合力', p.sougouryokuMan != null ? p.sougouryokuMan + '万' : '') +
      analysisRowHtml('実効値', p.jikkochiPct != null ? p.jikkochiPct + '%' : '') +
      analysisRowHtml('イベントボーナス', p.bonusPct != null ? p.bonusPct + '%' : '') +
      '</div>' +
      '<div class="guide-report-team mt-2">' +
      '<div class="es-runplan-grid">' +
      '<div class="es-runplan"><p class="es-runplan__cook">エビ 5炊き 1回</p><p class="es-runplan__runs">約 ' + esc(fmtPt(Math.round(team.pt5))) + '</p><p class="es-runplan__meta">時速 約 ' + esc(fmtPt(Math.round(team.hourly5))) + '</p></div>' +
      '<div class="es-runplan"><p class="es-runplan__cook">エビ 10炊き 1回</p><p class="es-runplan__runs">約 ' + esc(fmtPt(Math.round(team.pt10))) + '</p><p class="es-runplan__meta">時速 約 ' + esc(fmtPt(Math.round(team.hourly10))) + '</p></div>' +
      '</div>' +
      '<p class="form-hint">独りんぼエンヴィー想定。実際の周回曲・スコアで前後します。</p>' +
      '</div></section>'
    );
  }

  function crystalsSectionHtml(report) {
    const used = report.crystalsUsed;
    if (used == null) return '';
    return (
      '<section class="guide-crystals">' +
      '<p class="guide-crystals__kicker">消化したクリスタル</p>' +
      '<p class="guide-crystals__value">' + esc(fmtCount(used)) + '</p>' +
      '</section>'
    );
  }

  function timetableSectionHtml(report, archive) {
    const map = normalizeTimetable(report && report.timetable);
    if (!timetableFilledCount(map)) return '';
    const hours = eventHourSlots(archive && archive.startAt, archive && archive.endAt);
    if (!hours.length) return '';
    const days = groupHoursByDay(hours);
    const daysHtml = days.map((day, i) => {
      const filled = day.hours.filter((at) => map[at]).length;
      const rows = day.hours.map((at) => {
        const text = map[at] || '';
        return (
          '<div class="guide-tt-row' + (text ? '' : ' is-empty') + '">' +
          '<span class="guide-tt-row__time">' + esc(hourLabel(at)) + '</span>' +
          '<span class="guide-tt-row__text">' + (text ? esc(text) : '') + '</span>' +
          '</div>'
        );
      }).join('');
      return (
        '<details class="guide-tt-day"' + (i === 0 ? ' open' : '') + '>' +
        '<summary>' + esc(day.label) + '<span>' + filled + ' / ' + day.hours.length + '</span></summary>' +
        '<div class="guide-tt-day__body">' + rows + '</div>' +
        '</details>'
      );
    }).join('');
    return (
      '<section class="guide-tt">' +
      '<p class="guide-tt__kicker">タイムテーブル</p>' +
      '<div class="guide-tt-days">' + daysHtml + '</div>' +
      '</section>'
    );
  }

  function timetableEditorHtml(hours, map) {
    const days = groupHoursByDay(hours);
    if (!days.length) return '<p class="form-hint">イベント期間が無いため、時間枠を作れません。</p>';
    return days.map((day, i) => {
      const filled = day.hours.filter((at) => map[at]).length;
      const rows = day.hours.map((at) => (
        '<label class="guide-tt-edit-row">' +
        '<span>' + esc(hourLabel(at)) + '</span>' +
        '<input type="text" class="form-input" data-tt-at="' + at + '" maxlength="' + TT_TEXT_MAX + '" value="' + esc(map[at] || '') + '" placeholder="予定・メモ">' +
        '</label>'
      )).join('');
      return (
        '<details class="guide-tt-day"' + (i === 0 ? ' open' : '') + '>' +
        '<summary>' + esc(day.label) + '<span>' + filled + ' / ' + day.hours.length + '</span></summary>' +
        '<div class="guide-tt-day__body">' + rows + '</div>' +
        '</details>'
      );
    }).join('');
  }

  function articleBodyHtml(body) {
    const text = String(body || '').trim();
    if (!text) return '<p class="text-muted">本文はまだありません。</p>';
    return '<div class="guide-report-note__body">' + esc(text).replace(/\n/g, '<br>') + '</div>';
  }

  function authorLineHtml(report) {
    const name = report.authorDisplayName || '名無し';
    const when = fmtDate(report.updatedAtMs || report.createdAtMs);
    const nameHtml = report.authorPublicId
      ? '<a href="#/p/' + esc(report.authorPublicId) + '" data-link>' + esc(name) + '</a>'
      : esc(name);
    return '<p class="guide-report__meta">' + nameHtml + (when ? ' · ' + esc(when) : '') + '</p>';
  }

  function reportArticleHtml(report, opts) {
    opts = opts || {};
    const archive = snapshotToArchive(applyReportGoals(report.snapshot, report));
    const info = analyzeArchive(archive);
    const title = report.title || (archive.title ? archive.title + ' のイベランレポート' : 'イベランレポート');
    const img = sectionOn(report, 'image') && archive.finalImageURL
      ? '<div class="guide-report-hero"><img src="' + esc(archive.finalImageURL) + '" alt="" decoding="async"></div>'
      : '';
    const editLink = opts.canEdit
      ? '<p class="guide-report__edit"><a href="#/mypage/event-support/' + esc(report.archiveId) + '/report" class="btn btn-secondary btn-sm" data-link>このレポートを編集</a></p>'
      : '';
    const draft = !report.isPublished && opts.showDraft
      ? '<span class="guide-report__draft">下書き</span>'
      : '';
    const note = sectionOn(report, 'note')
      ? '<section class="guide-report-note"><p class="adjust-filters__title">📓 ノート</p>' + articleBodyHtml(report.body) + '</section>'
      : '';
    return (
      '<article class="guide-report">' +
      '<header class="guide-report__head">' +
      '<p class="guide-report__kicker">🏆 イベランレポート' + draft + '</p>' +
      '<h2 class="guide-report__title">' + esc(title) + '</h2>' +
      (reportEventChar(report) ? '<p class="guide-report__tags">' + charTagHtml(reportEventChar(report)) + '</p>' : '') +
      (opts.hideMeta ? '' : authorLineHtml(report)) +
      editLink +
      '</header>' +
      img +
      overviewSectionHtml(info) +
      (sectionOn(report, 'result') ? resultSectionHtml(info) : '') +
      (sectionOn(report, 'analysis') ? analysisSectionHtml(info, archive) : '') +
      (sectionOn(report, 'timetable') ? timetableSectionHtml(report, archive) : '') +
      (sectionOn(report, 'team') ? teamSectionHtml(info) : '') +
      (sectionOn(report, 'crystals') ? crystalsSectionHtml(report) : '') +
      note +
      '</article>'
    );
  }

  function reportCardHtml(report) {
    const archive = snapshotToArchive(report.snapshot);
    const title = report.title || archive.title || '無題のレポート';
    const pt = scorePt(archive);
    const rank = archive.finalRank != null ? fmtNum(archive.finalRank) + '位' : '';
    const thumb = archive.finalImageURL
      ? '<div class="guide-report-card__thumb"><img src="' + esc(archive.finalImageURL) + '" alt="" loading="lazy" decoding="async"></div>'
      : '<div class="guide-report-card__thumb guide-report-card__thumb--empty">🏆</div>';
    const draft = report.isPublished ? '' : '<span class="guide-report-card__draft">下書き</span>';
    const summary = String(report.body || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    return (
      '<a class="card guide-report-card" href="#/guides/reports/' + esc(report.id) + '" data-link>' +
      thumb +
      '<div class="guide-report-card__body">' +
      '<p class="guide-report-card__kicker">イベランレポート' + draft + '</p>' +
      '<h3 class="guide-report-card__title">' + esc(title) + '</h3>' +
      (reportEventChar(report) ? '<p class="guide-report-card__tags">' + charTagHtml(reportEventChar(report)) + '</p>' : '') +
      '<p class="guide-report-card__meta">' +
      esc(report.authorDisplayName || '名無し') +
      (rank ? ' · ' + esc(rank) : '') +
      (pt != null ? ' · ' + esc(fmtPt(pt)) : '') +
      '</p>' +
      (summary ? '<p class="guide-report-card__summary">' + esc(summary) + (report.body.length > 80 ? '…' : '') + '</p>' : '') +
      '</div></a>'
    );
  }

  function notConfiguredHtml() {
    return '<div class="info-box"><p>この機能は準備中です（Firebase 未設定）。</p></div>';
  }

  // ================= 一覧 =================

  async function init() {
    const root = document.getElementById('guidesRoot');
    if (!root) return;

    root.innerHTML = '<p class="text-muted">読み込み中…</p>';

    if (!(await isConfigured()) && !useLocalPreview()) {
      root.innerHTML = notConfiguredHtml();
      return;
    }

    const user = (typeof MiraiAuth !== 'undefined' && MiraiAuth.getUser) ? MiraiAuth.getUser() : null;
    let published = [];
    let own = [];
    try {
      published = await listPublishedReports();
      if (user) own = await listOwnReports(user.uid);
    } catch (e) {
      console.error(e);
      root.innerHTML =
        '<div class="info-box"><p>読み込みに失敗しました。</p>' +
        '<p class="form-error mt-1">' + esc(e.message || String(e)) + '</p></div>';
      return;
    }

    const ownUnpublished = own.filter((r) => !r.isPublished);
    const postHint = user
      ? '<p class="form-hint guides-post-hint">投稿は<a href="#/mypage/event-support" data-link>イベラン支援</a>のイベントアーカイブから、ノート形式で作成できます。</p>'
      : '<p class="form-hint guides-post-hint">投稿するには<a href="#/login" data-link>ログイン</a>して、イベラン支援のアーカイブからレポートを作成してください。</p>';

    const ownBlock = ownUnpublished.length
      ? (
        '<section class="guides-own">' +
        '<h2 class="guides-section-title">自分の下書き</h2>' +
        '<div class="guides-report-list">' + ownUnpublished.map(reportCardHtml).join('') + '</div>' +
        '</section>'
      )
      : '';

    const usedChars = [];
    published.forEach((r) => {
      const c = reportEventChar(r);
      if (c && !usedChars.includes(c)) usedChars.push(c);
    });
    usedChars.sort((a, b) => {
      const list = getEventCharList();
      const ia = list.indexOf(a);
      const ib = list.indexOf(b);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });

    const otherCats = CATEGORIES.filter((c) => c.id !== 'event').map((c) =>
      '<div class="guides-category-card card">' +
      '<span class="guides-category-card__emoji">' + c.emoji + '</span>' +
      '<h3>' + esc(c.name) + '</h3>' +
      '<p class="text-muted">記事を追加予定</p>' +
      '</div>'
    ).join('');

    function charChipHtml(name, active) {
      return '<button type="button" class="board-tag board-tag--event' + (active ? ' is-active' : '') + '" data-char="' + esc(name) + '">' + esc(name) + '</button>';
    }

    const quickChips = usedChars.length
      ? usedChars.map((c) => charChipHtml(c, false)).join('')
      : '';
    const allChips = getEventCharList().map((c) => charChipHtml(c, false)).join('');

    root.innerHTML =
      '<section class="guides-event">' +
      '<div class="guides-event__head">' +
      '<h2 class="guides-section-title">🏆 イベランレポート</h2>' +
      '</div>' +
      postHint +
      '<div class="guides-report-filter">' +
      '<label class="guides-report-filter__label" for="grFilterQ">キャラタグ・本文で探す</label>' +
      '<input type="search" class="form-input" id="grFilterQ" placeholder="例: 奏 / 睡眠 / 10炊き">' +
      '<div class="guides-char-tags" id="grCharTags">' +
      '<button type="button" class="board-tag is-active" data-char="">すべて</button>' +
      quickChips +
      '</div>' +
      '<details class="guides-char-all">' +
      '<summary>すべてのキャラから選ぶ</summary>' +
      '<div class="guides-char-tags guides-char-tags--all" id="grCharTagsAll">' + allChips + '</div>' +
      '</details>' +
      '</div>' +
      ownBlock +
      '<div id="grPublishedList"></div>' +
      '</section>' +
      '<section class="guides-more">' +
      '<h2 class="guides-section-title">その他の棚</h2>' +
      '<div class="guides-categories">' + otherCats + '</div>' +
      '</section>';

    const listEl = root.querySelector('#grPublishedList');
    const qEl = root.querySelector('#grFilterQ');
    let selectedChar = '';

    function reportMatches(report, q, char) {
      if (char && reportEventChar(report) !== char) return false;
      const needle = String(q || '').trim().toLowerCase();
      if (!needle) return true;
      const hay = [
        report.title,
        report.body,
        report.authorDisplayName,
        reportEventChar(report),
        report.snapshot && report.snapshot.eventTitle,
      ].join(' ').toLowerCase();
      return hay.includes(needle);
    }

    function renderPublished() {
      const q = qEl ? qEl.value : '';
      const filtered = published.filter((r) => reportMatches(r, q, selectedChar));
      if (!published.length) {
        listEl.innerHTML = '<div class="info-box"><p>まだ公開されているイベランレポートはありません。</p><p class="mt-1">イベントアーカイブの記録をもとに、最初のレポートを書いてみましょう。</p></div>';
        return;
      }
      if (!filtered.length) {
        const hint = selectedChar
          ? '「' + selectedChar + '」のレポートはまだありません。'
          : '条件に合うレポートがありません。';
        listEl.innerHTML = '<div class="info-box"><p>' + esc(hint) + '</p></div>';
        return;
      }
      listEl.innerHTML = '<div class="guides-report-list">' + filtered.map(reportCardHtml).join('') + '</div>';
    }

    function setActiveChar(name) {
      selectedChar = name || '';
      root.querySelectorAll('[data-char]').forEach((btn) => {
        btn.classList.toggle('is-active', (btn.getAttribute('data-char') || '') === selectedChar);
      });
      renderPublished();
    }

    root.querySelectorAll('[data-char]').forEach((btn) => {
      btn.addEventListener('click', () => setActiveChar(btn.getAttribute('data-char') || ''));
    });
    if (qEl) qEl.addEventListener('input', renderPublished);
    renderPublished();
  }

  // ================= 詳細 =================

  async function initReportDetail(params) {
    const root = document.getElementById('app');
    const box = root && root.querySelector('#guidesReportRoot');
    if (!box) return;

    const id = params && params.id ? String(params.id) : '';
    if (!(await isConfigured()) && !useLocalPreview()) {
      box.innerHTML = notConfiguredHtml();
      return;
    }

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';
    let report = null;
    try {
      report = await loadReport(id);
    } catch (e) {
      const denied = e && (e.code === 'permission-denied' || /permission/i.test(String(e.message || e)));
      if (!denied) {
        box.innerHTML = '<div class="info-box"><p>読み込みに失敗しました。</p><p class="form-error mt-1">' + esc(e.message || String(e)) + '</p></div>';
        return;
      }
    }

    const user = (typeof MiraiAuth !== 'undefined' && MiraiAuth.getUser) ? MiraiAuth.getUser() : null;
    const isOwner = !!(user && report && report.authorUid === user.uid);

    if (!report || (!report.isPublished && !isOwner)) {
      box.innerHTML =
        '<div class="info-box"><p>レポートが見つかりませんでした。</p>' +
        '<p class="mt-2"><a href="#/guides" class="btn btn-secondary" data-link>攻略図書館に戻る</a></p></div>';
      return;
    }

    document.title = (report.title || 'イベランレポート') + ' — 未来喫茶';
    box.innerHTML =
      reportArticleHtml(report, { canEdit: isOwner, showDraft: isOwner }) +
      '<p class="mt-3"><a href="#/guides" class="btn btn-secondary btn-block" data-link>攻略図書館に戻る</a></p>';
  }

  // ================= 編集 =================

  async function resolveAuthUser() {
    await window.MiraiFirebaseReady;
    if (typeof MiraiAuth === 'undefined') return null;
    let user = MiraiAuth.getUser();
    if (!user) {
      user = await new Promise((resolve) => {
        let done = false;
        const off = MiraiAuth.onChange((u) => {
          if (done) return;
          done = true; off(); resolve(u);
        });
        setTimeout(() => { if (!done) { done = true; off(); resolve(MiraiAuth.getUser()); } }, 2500);
      });
    }
    return user;
  }

  async function initReportEditor(params) {
    const root = document.getElementById('app');
    const box = root && root.querySelector('#eventReportEditRoot');
    if (!box) return;

    const archiveId = params && params.id ? String(params.id) : '';
    if (!(await isConfigured()) && !useLocalPreview()) {
      box.innerHTML = notConfiguredHtml();
      return;
    }

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';
    const user = await resolveAuthUser();
    if (!user) {
      box.innerHTML =
        '<div class="info-box"><p>イベランレポートの作成にはログインが必要です。</p>' +
        '<p class="mt-2"><a href="#/login" class="btn btn-primary" data-link>ログインする</a></p></div>';
      return;
    }

    const rid = reportIdForArchive(user.uid, archiveId);
    let archive = null;
    let report = null;
    if (window.MiraiEventSupport && typeof MiraiEventSupport.loadArchive === 'function') {
      try {
        archive = await MiraiEventSupport.loadArchive(user.uid, archiveId);
      } catch (e) {
        console.warn('[guides] loadArchive:', e);
      }
    }
    try {
      report = await loadReport(rid);
    } catch (e) {
      console.warn('[guides] loadReport:', e);
    }

    if (!archive && !report) {
      box.innerHTML =
        '<div class="info-box"><p>イベントアーカイブが見つかりませんでした。</p>' +
        '<p class="mt-2"><a href="#/mypage/event-support" class="btn btn-secondary" data-link>イベラン支援に戻る</a></p></div>';
      return;
    }

    const snapshot = archive ? snapshotFromArchive(archive) : (report && report.snapshot) || snapshotFromArchive({});
    const defaultTitle = (report && report.title)
      || ((snapshot.eventTitle || '無題のイベント') + ' — イベランレポート');

    document.title = 'イベランレポートを編集 — 未来喫茶';
    try {
      renderEditor(box, user, {
        id: rid,
        archiveId,
        archive,
        report,
        snapshot,
        title: defaultTitle.slice(0, TITLE_MAX),
        body: report ? report.body : '',
        isPublished: report ? report.isPublished : false,
        crystalsUsed: report && report.crystalsUsed != null
          ? report.crystalsUsed
          : numOrNull(snapshot.crystalsUsed),
        resultTargetRank: pickReportGoalRank(report, snapshot),
        resultTargetPt: pickReportGoalPt(report, snapshot),
        timetable: normalizeTimetable(report && report.timetable),
        sections: normalizeSections(report && report.sections),
      });
    } catch (e) {
      console.error('[guides] renderEditor:', e);
      box.innerHTML = '<div class="info-box"><p>編集画面の表示に失敗しました。</p><p class="form-error mt-1">' + esc(e.message || String(e)) + '</p></div>';
    }
  }

  function renderEditor(box, user, state) {
    const archiveView = snapshotToArchive(state.snapshot);
    const previewReport = {
      id: state.id,
      authorUid: user.uid,
      authorDisplayName: (state.report && state.report.authorDisplayName) || '',
      authorPublicId: (state.report && state.report.authorPublicId) || '',
      archiveId: state.archiveId,
      title: state.title,
      body: state.body,
      eventChar: resolveEventChar(state.snapshot),
      isPublished: state.isPublished,
      crystalsUsed: state.crystalsUsed != null ? state.crystalsUsed : ((state.report && state.report.crystalsUsed != null) ? state.report.crystalsUsed : numOrNull(state.snapshot && state.snapshot.crystalsUsed)),
      resultTargetRank: state.resultTargetRank != null ? state.resultTargetRank : pickReportGoalRank(state.report, state.snapshot),
      resultTargetPt: state.resultTargetPt != null ? state.resultTargetPt : pickReportGoalPt(state.report, state.snapshot),
      timetable: normalizeTimetable(state.timetable || (state.report && state.report.timetable)),
      snapshot: applyReportGoals(state.snapshot, {
        resultTargetRank: state.resultTargetRank != null ? state.resultTargetRank : pickReportGoalRank(state.report, state.snapshot),
        resultTargetPt: state.resultTargetPt != null ? state.resultTargetPt : pickReportGoalPt(state.report, state.snapshot),
      }),
      sections: normalizeSections(state.sections || (state.report && state.report.sections)),
      createdAtMs: state.report ? state.report.createdAtMs : Date.now(),
      updatedAtMs: Date.now(),
    };

    const backHref = state.archive
      ? '#/mypage/event-support/' + esc(state.archiveId)
      : '#/guides';
    const backLabel = state.archive ? '← アーカイブに戻る' : '← 攻略図書館に戻る';
    const refreshBtn = state.archive
      ? '<button type="button" class="btn btn-secondary btn-sm" id="grRefreshSnap">アーカイブの最新内容を反映</button>'
      : '<p class="form-hint">元のアーカイブは削除済みです。成績データはこのレポートに保存されています。</p>';

    box.innerHTML = `
      <p class="mb-2"><a href="${backHref}" class="back-link" data-link>${backLabel}</a></p>
      ${useLocalPreview() ? '<div class="info-box mb-2"><p><strong>ローカルゲストプレビュー</strong></p><p class="mt-1">この記事はブラウザ内だけに保存されます。本番の攻略図書館には公開されません。</p></div>' : ''}
      <section class="card community-editor">
        <h2 class="community-editor__title">イベランレポート</h2>
        <p class="text-muted mp-editor-lead">アーカイブの成績・着地・編成を自動で分析して添えます。載せたくない項目はオフにできます。</p>
        <div class="form-group">
          <label for="grTitle">タイトル</label>
          <input type="text" class="form-input" id="grTitle" maxlength="${TITLE_MAX}" value="${esc(state.title)}">
        </div>
        <div class="form-group">
          <p class="guides-editor-char-label">イベントキャラ（検索タグ）</p>
          <p class="guides-editor-char">${resolveEventChar(state.snapshot) ? charTagHtml(resolveEventChar(state.snapshot)) : '<span class="text-muted">未指定</span>'}</p>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label for="grGoalRank">当初の目標順位</label>
            <input type="number" class="form-input" id="grGoalRank" min="1" inputmode="numeric" value="${previewReport.resultTargetRank != null ? esc(previewReport.resultTargetRank) : ''}" placeholder="例: 1000">
          </div>
          <div class="form-group">
            <label for="grGoalPt">目標順位のポイント</label>
            <input type="number" class="form-input" id="grGoalPt" min="0" inputmode="numeric" value="${previewReport.resultTargetPt != null ? esc(previewReport.resultTargetPt) : ''}" placeholder="例: 1590000">
            <p class="form-hint">狙っていた順位の、終了時ボーダーPt。最終着地の比較に使います。</p>
          </div>
        </div>
        <div class="form-group">
          <label for="grCrystalsUsed">消化したクリスタル</label>
          <input type="number" class="form-input" id="grCrystalsUsed" min="0" inputmode="numeric" value="${previewReport.crystalsUsed != null ? esc(previewReport.crystalsUsed) : ''}" placeholder="例: 8000">
          <p class="form-hint">実際に使った数を記入します。空欄ならレポートには出しません。</p>
        </div>
        <div class="form-group">
          <button type="button" class="btn btn-secondary btn-block" id="grTimetableOpen">${timetableFilledCount(previewReport.timetable) ? '📅 タイムテーブルを編集' : '📅 タイムテーブルを作成'}</button>
          <p class="form-hint" id="grTimetableHint">${timetableHintText(state.snapshot, previewReport.timetable)}</p>
        </div>
        <div class="form-group">
          <label for="grBody">本文（ノート）</label>
          <textarea class="form-input" id="grBody" rows="10" maxlength="${BODY_MAX}" placeholder="走り方・反省点・おすすめ編成などを自由に書いてください">${esc(state.body)}</textarea>
          <p class="form-hint"><span id="grBodyCount">0</span> / ${BODY_MAX} · <button type="button" class="guide-report-tpl-btn" id="grInsertTpl">ひな形を入れる</button></p>
        </div>
        <div class="guides-section-toggles">
          <p class="adjust-filters__title">掲載する項目</p>
          <p class="form-hint">アーカイブから自動で作った分析です。公開したくない項目はオフにしてください。</p>
          ${SECTION_DEFS.map((s) =>
            '<label class="form-toggle guides-section-toggle">' +
            '<input type="checkbox" data-section="' + esc(s.id) + '"' + (previewReport.sections[s.id] !== false ? ' checked' : '') + '>' +
            '<span class="toggle-track"></span>' +
            '<span class="toggle-label">' + esc(s.label) + '</span></label>'
          ).join('')}
        </div>
        <label class="form-toggle">
          <input type="checkbox" id="grPublish"${state.isPublished ? ' checked' : ''}>
          <span class="toggle-track"></span>
          <span class="toggle-label">攻略図書館に公開する</span>
        </label>
        <p class="form-hint">オフのままだと下書きです。自分だけが攻略図書館から見られます。</p>
        <div class="es-card__actions mt-2">
          ${refreshBtn}
        </div>
        <p id="grError" class="form-error" hidden></p>
        <button type="button" class="btn btn-primary btn-block mt-2" id="grSave">保存する</button>
        <p id="grSaved" class="community-saved mt-2" hidden>保存しました ✓</p>
        ${state.report ? '<button type="button" class="btn btn-secondary btn-block mt-2" id="grDelete">このレポートを削除</button>' : ''}
      </section>
      <section class="guide-report-preview">
        <p class="adjust-filters__title">プレビュー</p>
        <div id="grPreview">${reportArticleHtml(previewReport, { hideMeta: true, showDraft: true })}</div>
      </section>
      <dialog class="es-modal guide-tt-modal" id="grTimetableModal">
        <div class="es-modal__body">
          <p class="es-modal__title">📅 タイムテーブル</p>
          <p class="form-hint">イベント期間を1時間ごとに並べています。予定やメモを記入してください。</p>
          <div class="guide-tt-editor" id="grTimetableEditor"></div>
          <p id="grTimetableError" class="form-error" hidden></p>
          <div class="es-modal__actions">
            <button type="button" class="btn btn-secondary" id="grTimetableCancel">キャンセル</button>
            <button type="button" class="btn btn-primary" id="grTimetableDone">完了</button>
          </div>
        </div>
      </dialog>
    `;

    const titleEl = box.querySelector('#grTitle');
    const bodyEl = box.querySelector('#grBody');
    const goalRankEl = box.querySelector('#grGoalRank');
    const goalPtEl = box.querySelector('#grGoalPt');
    const crystalsEl = box.querySelector('#grCrystalsUsed');
    const pubEl = box.querySelector('#grPublish');
    const countEl = box.querySelector('#grBodyCount');
    const previewEl = box.querySelector('#grPreview');
    const errEl = box.querySelector('#grError');
    const savedEl = box.querySelector('#grSaved');

    function currentTitle() {
      return (titleEl.value || '').slice(0, TITLE_MAX);
    }
    function currentBody() {
      return (bodyEl.value || '').slice(0, BODY_MAX);
    }
    function currentCrystalsUsed() {
      return crystalsEl ? numOrNull(crystalsEl.value) : null;
    }
    function currentGoalRank() {
      return goalRankEl ? numOrNull(goalRankEl.value) : null;
    }
    function currentGoalPt() {
      return goalPtEl ? numOrNull(goalPtEl.value) : null;
    }
    function refreshCount() {
      if (countEl) countEl.textContent = String(currentBody().length);
    }
    function currentSections() {
      const o = defaultSections();
      box.querySelectorAll('[data-section]').forEach((el) => {
        o[el.getAttribute('data-section')] = el.checked;
      });
      return o;
    }
    function currentTimetable() {
      return normalizeTimetable(state.timetable || previewReport.timetable);
    }
    function syncTimetableUi() {
      const btn = box.querySelector('#grTimetableOpen');
      const hint = box.querySelector('#grTimetableHint');
      const map = currentTimetable();
      if (btn) btn.textContent = timetableFilledCount(map) ? '📅 タイムテーブルを編集' : '📅 タイムテーブルを作成';
      if (hint) hint.textContent = timetableHintText(state.snapshot, map);
    }
    function refreshPreview() {
      previewReport.title = currentTitle();
      previewReport.body = currentBody();
      previewReport.isPublished = !!(pubEl && pubEl.checked);
      previewReport.eventChar = resolveEventChar(state.snapshot);
      previewReport.crystalsUsed = currentCrystalsUsed();
      previewReport.resultTargetRank = currentGoalRank();
      previewReport.resultTargetPt = currentGoalPt();
      previewReport.timetable = currentTimetable();
      previewReport.snapshot = applyReportGoals(state.snapshot, previewReport);
      previewReport.sections = currentSections();
      syncTimetableUi();
      if (previewEl) previewEl.innerHTML = reportArticleHtml(previewReport, { hideMeta: true, showDraft: true });
    }

    refreshCount();
    titleEl.addEventListener('input', refreshPreview);
    bodyEl.addEventListener('input', () => { refreshCount(); refreshPreview(); });
    if (pubEl) pubEl.addEventListener('change', refreshPreview);
    if (goalRankEl) goalRankEl.addEventListener('input', refreshPreview);
    if (goalPtEl) goalPtEl.addEventListener('input', refreshPreview);
    if (crystalsEl) crystalsEl.addEventListener('input', refreshPreview);
    box.querySelectorAll('[data-section]').forEach((el) => {
      el.addEventListener('change', refreshPreview);
    });

    const ttModal = box.querySelector('#grTimetableModal');
    const ttOpen = box.querySelector('#grTimetableOpen');
    const ttCancel = box.querySelector('#grTimetableCancel');
    const ttDone = box.querySelector('#grTimetableDone');
    const ttEditor = box.querySelector('#grTimetableEditor');
    const ttErr = box.querySelector('#grTimetableError');

    function openTimetableModal() {
      const hours = eventHourSlots(state.snapshot && state.snapshot.startAt, state.snapshot && state.snapshot.endAt);
      if (ttErr) ttErr.hidden = true;
      if (!hours.length) {
        if (errEl) {
          errEl.textContent = 'イベント期間が未設定です。アーカイブのイベント設定で開始・終了を入力してください。';
          errEl.hidden = false;
        }
        return;
      }
      if (ttEditor) ttEditor.innerHTML = timetableEditorHtml(hours, currentTimetable());
      if (!ttModal) return;
      if (typeof ttModal.showModal === 'function') ttModal.showModal();
      else ttModal.setAttribute('open', '');
    }
    function closeTimetableModal() {
      if (!ttModal) return;
      if (typeof ttModal.close === 'function' && ttModal.open) ttModal.close();
      else ttModal.removeAttribute('open');
    }
    function collectTimetableFromEditor() {
      const map = {};
      if (!ttEditor) return map;
      ttEditor.querySelectorAll('[data-tt-at]').forEach((el) => {
        const at = Number(el.getAttribute('data-tt-at'));
        const text = String(el.value || '').trim().slice(0, TT_TEXT_MAX);
        if (at && text) map[at] = text;
      });
      return map;
    }

    if (ttOpen) ttOpen.addEventListener('click', openTimetableModal);
    if (ttCancel) ttCancel.addEventListener('click', closeTimetableModal);
    if (ttModal) {
      ttModal.addEventListener('cancel', (e) => { e.preventDefault(); closeTimetableModal(); });
    }
    if (ttDone) {
      ttDone.addEventListener('click', () => {
        state.timetable = collectTimetableFromEditor();
        previewReport.timetable = state.timetable;
        closeTimetableModal();
        refreshPreview();
      });
    }

    const tplBtn = box.querySelector('#grInsertTpl');
    if (tplBtn) {
      tplBtn.addEventListener('click', () => {
        if (currentBody().trim() && !confirm('本文をひな形で置き換えますか？')) return;
        bodyEl.value = BODY_TEMPLATE;
        refreshCount();
        refreshPreview();
        bodyEl.focus();
      });
    }

    const refreshSnap = box.querySelector('#grRefreshSnap');
    if (refreshSnap && state.archive) {
      refreshSnap.addEventListener('click', async () => {
        refreshSnap.disabled = true;
        refreshSnap.textContent = '反映中…';
        try {
          const latest = await MiraiEventSupport.loadArchive(user.uid, state.archiveId);
          if (!latest) throw new Error('アーカイブを読み込めませんでした。');
          state.archive = latest;
          state.snapshot = snapshotFromArchive(latest);
          if (crystalsEl && crystalsEl.value === '' && latest.crystalsUsed != null) {
            crystalsEl.value = String(latest.crystalsUsed);
          }
          if (goalRankEl && goalRankEl.value === '' && latest.targetRank != null) {
            goalRankEl.value = String(latest.targetRank);
          }
          previewReport.eventChar = resolveEventChar(state.snapshot);
          const charLine = box.querySelector('.guides-editor-char');
          if (charLine) {
            charLine.innerHTML = resolveEventChar(state.snapshot)
              ? charTagHtml(resolveEventChar(state.snapshot))
              : '<span class="text-muted">未指定</span>';
          }
          refreshPreview();
          refreshSnap.textContent = '反映しました ✓';
          setTimeout(() => { refreshSnap.textContent = 'アーカイブの最新内容を反映'; refreshSnap.disabled = false; }, 1600);
        } catch (e) {
          errEl.textContent = e.message || String(e);
          errEl.hidden = false;
          refreshSnap.disabled = false;
          refreshSnap.textContent = 'アーカイブの最新内容を反映';
        }
      });
    }

    const saveBtn = box.querySelector('#grSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        errEl.hidden = true;
        savedEl.hidden = true;
        const title = currentTitle().trim();
        if (!title) {
          errEl.textContent = 'タイトルを入力してください。';
          errEl.hidden = false;
          return;
        }
        const isPublished = !!(pubEl && pubEl.checked);
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中…';
        try {
          if (!state.report) {
            const own = await listOwnReports(user.uid);
            if (own.length >= MAX_REPORTS) {
              throw new Error('レポートは ' + MAX_REPORTS + ' 件までです。攻略図書館の自分の投稿から古いレポートを削除してください。');
            }
          }
          const hub = await loadAuthorHub(user.uid);
          const saved = await saveReport({
            id: state.id,
            authorUid: user.uid,
            authorPublicId: hub.publicId,
            authorDisplayName: hub.displayName || '名無し',
            archiveId: state.archiveId,
            title,
            body: currentBody(),
            eventChar: resolveEventChar(state.snapshot),
            isPublished,
            crystalsUsed: currentCrystalsUsed(),
            resultTargetRank: currentGoalRank(),
            resultTargetPt: currentGoalPt(),
            timetable: timetableToList(currentTimetable()),
            sections: currentSections(),
            snapshot: applyReportGoals(
              Object.assign({}, state.snapshot, { crystalsUsed: currentCrystalsUsed() }),
              { resultTargetRank: currentGoalRank(), resultTargetPt: currentGoalPt() }
            ),
            createdAtMs: state.report ? state.report.createdAtMs : Date.now(),
          });
          state.report = saved;
          state.title = saved.title;
          state.body = saved.body;
          state.isPublished = saved.isPublished;
          state.sections = saved.sections;
          state.crystalsUsed = saved.crystalsUsed;
          state.resultTargetRank = saved.resultTargetRank;
          state.resultTargetPt = saved.resultTargetPt;
          state.timetable = saved.timetable;
          savedEl.hidden = false;
          savedEl.innerHTML = saved.isPublished
            ? '公開しました ✓　<a href="#/guides/reports/' + esc(saved.id) + '" data-link>攻略図書館で見る</a>'
            : '下書きを保存しました ✓';
          const del = box.querySelector('#grDelete');
          if (!del) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-secondary btn-block mt-2';
            b.id = 'grDelete';
            b.textContent = 'このレポートを削除';
            saveBtn.insertAdjacentElement('afterend', b);
            wireDelete(b);
          }
        } catch (e) {
          errEl.textContent = e.message || String(e);
          errEl.hidden = false;
        } finally {
          saveBtn.disabled = false;
          saveBtn.textContent = '保存する';
        }
      });
    }

    function wireDelete(btn) {
      if (!btn) return;
      btn.addEventListener('click', async () => {
        if (!confirm('このレポートを削除しますか？（元に戻せません）')) return;
        btn.disabled = true;
        try {
          await deleteReport(state.id);
          location.hash = state.archive
            ? '#/mypage/event-support/' + state.archiveId
            : '#/guides';
        } catch (e) {
          btn.disabled = false;
          errEl.textContent = e.message || String(e);
          errEl.hidden = false;
        }
      });
    }
    wireDelete(box.querySelector('#grDelete'));
  }

  return {
    init,
    initReportDetail,
    initReportEditor,
    loadReport,
    reportIdForArchive,
    MAX_REPORTS,
  };
})();

window.GuidesPage = GuidesPage;
