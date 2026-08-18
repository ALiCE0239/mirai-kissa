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
      startAt: numOrNull(a.startAt),
      endAt: numOrNull(a.endAt),
      filterType: a.filterType === 'unit' ? 'unit' : 'banner',
      banner: String(a.banner || ''),
      unit: String(a.unit || ''),
      targetRank: numOrNull(a.targetRank),
      targetPtManual: numOrNull(a.targetPtManual),
      params: {
        sougouryokuMan: numOrNull(p.sougouryokuMan),
        jikkochiPct: numOrNull(p.jikkochiPct),
        bonusPct: numOrNull(p.bonusPct),
        crystals: numOrNull(p.crystals),
      },
      logs,
      finalRank: numOrNull(a.finalRank),
      finalPt: numOrNull(a.finalPt),
      finalImageURL: String(a.finalImageURL || ''),
    };
  }

  function snapshotToArchive(snap) {
    snap = snap || {};
    const p = snap.params || {};
    return {
      title: snap.eventTitle || '',
      startAt: numOrNull(snap.startAt),
      endAt: numOrNull(snap.endAt),
      filterType: snap.filterType === 'unit' ? 'unit' : 'banner',
      banner: snap.banner || '',
      unit: snap.unit || '',
      targetRank: numOrNull(snap.targetRank),
      targetPtManual: numOrNull(snap.targetPtManual),
      params: {
        sougouryokuMan: numOrNull(p.sougouryokuMan),
        jikkochiPct: numOrNull(p.jikkochiPct),
        bonusPct: numOrNull(p.bonusPct),
        crystals: numOrNull(p.crystals),
      },
      logs: Array.isArray(snap.logs) ? snap.logs : [],
      finalRank: numOrNull(snap.finalRank),
      finalPt: numOrNull(snap.finalPt),
      finalImageURL: snap.finalImageURL || '',
    };
  }

  function normalizeReport(raw, id) {
    raw = raw || {};
    return {
      id: id || raw.id || '',
      authorUid: String(raw.authorUid || ''),
      authorPublicId: String(raw.authorPublicId || ''),
      authorDisplayName: String(raw.authorDisplayName || ''),
      archiveId: String(raw.archiveId || ''),
      title: String(raw.title || '').slice(0, TITLE_MAX),
      body: String(raw.body || '').slice(0, BODY_MAX),
      isPublished: raw.isPublished === true,
      snapshot: snapshotFromArchive(snapshotToArchive(raw.snapshot || {})),
      createdAtMs: Number(raw.createdAtMs) || Date.now(),
      updatedAtMs: Number(raw.updatedAtMs) || 0,
    };
  }

  async function loadReport(id) {
    const f = await fb();
    if (!f || !f.configured || !id) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, COLLECTION, id));
    if (!snap.exists()) return null;
    return normalizeReport(snap.data(), snap.id);
  }

  async function listPublishedReports() {
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
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const { doc, setDoc, serverTimestamp } = f.dbFns;
    const data = Object.assign({}, normalizeReport(report, report.id), {
      updatedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    });
    if (!data.createdAtMs) data.createdAtMs = Date.now();
    await setDoc(doc(f.db, COLLECTION, data.id), data, { merge: true });
    return data;
  }

  async function deleteReport(id) {
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
    const plan = typeof es.computePlan === 'function' ? es.computePlan(archive) : null;
    return es.renderLineChart(archive, plan);
  }

  function teamPtHtml(archive) {
    if (!hasTeamParams(archive) || !window.PjskEngine) return '';
    const p = archive.params;
    const rph = PjskEngine.ENVY_RUNS_PER_HOUR || 28;
    const ep0 = PjskEngine.envyEventPtBase(p.sougouryokuMan * 10000, p.jikkochiPct, p.bonusPct);
    const pt5 = ep0 * PjskEngine.lbEventPtMul(5);
    const pt10 = ep0 * PjskEngine.lbEventPtMul(10);
    return (
      '<div class="guide-report-team">' +
      '<p class="guide-report-team__summary">' + esc(teamSummaryText(p)) + '</p>' +
      '<div class="es-runplan-grid">' +
      '<div class="es-runplan"><p class="es-runplan__cook">エビ 5炊き 1回</p><p class="es-runplan__runs">約 ' + esc(fmtPt(Math.round(pt5))) + '</p><p class="es-runplan__meta">時速 約 ' + esc(fmtPt(Math.round(pt5 * rph))) + '</p></div>' +
      '<div class="es-runplan"><p class="es-runplan__cook">エビ 10炊き 1回</p><p class="es-runplan__runs">約 ' + esc(fmtPt(Math.round(pt10))) + '</p><p class="es-runplan__meta">時速 約 ' + esc(fmtPt(Math.round(pt10 * rph))) + '</p></div>' +
      '</div>' +
      '<p class="form-hint">独りんぼエンヴィー想定。実際の周回曲・スコアで前後します。</p>' +
      '</div>'
    );
  }

  function scorePt(archive) {
    if (!archive) return null;
    if (archive.finalPt != null) return archive.finalPt;
    const last = archive.logs && archive.logs.length ? archive.logs[archive.logs.length - 1] : null;
    return last && last.myPt != null ? last.myPt : null;
  }

  function statsGridHtml(archive) {
    const a = archive || {};
    const filter = a.filterType === 'unit' ? a.unit : a.banner;
    const filterKind = a.filterType === 'unit' ? 'ユニット' : 'バナー';
    const goal = targetRankLabel(a.targetRank);
    const pt = scorePt(a);
    const ptLabel = a.finalPt != null ? '最終Pt' : (pt != null ? '記録Pt' : 'Pt');
    const cells = [
      { label: '期間', value: periodText(a) },
      { label: '目標', value: goal || '未設定' },
      { label: filterKind, value: filter || '—' },
      { label: '最終順位', value: a.finalRank != null ? fmtNum(a.finalRank) + '位' : '—' },
      { label: ptLabel, value: pt != null ? fmtPt(pt) : '—' },
      { label: '記録数', value: (a.logs && a.logs.length ? a.logs.length : 0) + '件' },
    ];
    return (
      '<dl class="guide-report-stats">' +
      cells.map((c) =>
        '<div class="guide-report-stats__cell"><dt>' + esc(c.label) + '</dt><dd>' + esc(c.value) + '</dd></div>'
      ).join('') +
      '</dl>'
    );
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
    const archive = snapshotToArchive(report.snapshot);
    const title = report.title || (archive.title ? archive.title + ' のイベランレポート' : 'イベランレポート');
    const img = archive.finalImageURL
      ? '<div class="guide-report-hero"><img src="' + esc(archive.finalImageURL) + '" alt="" decoding="async"></div>'
      : '';
    const team = teamPtHtml(archive);
    const editLink = opts.canEdit
      ? '<p class="guide-report__edit"><a href="#/mypage/event-support/' + esc(report.archiveId) + '/report" class="btn btn-secondary btn-sm" data-link>このレポートを編集</a></p>'
      : '';
    const draft = !report.isPublished && opts.showDraft
      ? '<span class="guide-report__draft">下書き</span>'
      : '';
    return (
      '<article class="guide-report">' +
      '<header class="guide-report__head">' +
      '<p class="guide-report__kicker">🏆 イベランレポート' + draft + '</p>' +
      '<h2 class="guide-report__title">' + esc(title) + '</h2>' +
      (opts.hideMeta ? '' : authorLineHtml(report)) +
      editLink +
      '</header>' +
      img +
      statsGridHtml(archive) +
      '<section class="guide-report-section">' +
      '<p class="adjust-filters__title">📈 ポイント推移</p>' +
      reportChartHtml(archive) +
      '</section>' +
      (team
        ? '<section class="guide-report-section"><p class="adjust-filters__title">🍚 編成・1回あたりのPt</p>' + team + '</section>'
        : '') +
      '<section class="guide-report-note">' +
      '<p class="adjust-filters__title">📓 ノート</p>' +
      articleBodyHtml(report.body) +
      '</section>' +
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

    if (!(await isConfigured())) {
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

    const listBlock = published.length
      ? '<div class="guides-report-list">' + published.map(reportCardHtml).join('') + '</div>'
      : '<div class="info-box"><p>まだ公開されているイベランレポートはありません。</p><p class="mt-1">イベントアーカイブの記録をもとに、最初のレポートを書いてみましょう。</p></div>';

    const otherCats = CATEGORIES.filter((c) => c.id !== 'event').map((c) =>
      '<div class="guides-category-card card">' +
      '<span class="guides-category-card__emoji">' + c.emoji + '</span>' +
      '<h3>' + esc(c.name) + '</h3>' +
      '<p class="text-muted">記事を追加予定</p>' +
      '</div>'
    ).join('');

    root.innerHTML =
      '<section class="guides-event">' +
      '<div class="guides-event__head">' +
      '<h2 class="guides-section-title">🏆 イベランレポート</h2>' +
      '</div>' +
      postHint +
      ownBlock +
      listBlock +
      '</section>' +
      '<section class="guides-more">' +
      '<h2 class="guides-section-title">その他の棚</h2>' +
      '<div class="guides-categories">' + otherCats + '</div>' +
      '</section>';
  }

  // ================= 詳細 =================

  async function initReportDetail(params) {
    const root = document.getElementById('app');
    const box = root && root.querySelector('#guidesReportRoot');
    if (!box) return;

    const id = params && params.id ? String(params.id) : '';
    if (!(await isConfigured())) {
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
    if (!(await isConfigured())) {
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
    try {
      if (window.MiraiEventSupport && typeof MiraiEventSupport.loadArchive === 'function') {
        archive = await MiraiEventSupport.loadArchive(user.uid, archiveId);
      }
      report = await loadReport(rid);
    } catch (e) {
      box.innerHTML = '<div class="info-box"><p>読み込みに失敗しました。</p><p class="form-error mt-1">' + esc(e.message || String(e)) + '</p></div>';
      return;
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
    renderEditor(box, user, {
      id: rid,
      archiveId,
      archive,
      report,
      snapshot,
      title: defaultTitle.slice(0, TITLE_MAX),
      body: report ? report.body : '',
      isPublished: report ? report.isPublished : false,
    });
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
      isPublished: state.isPublished,
      snapshot: state.snapshot,
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
      <section class="card community-editor">
        <h2 class="community-editor__title">イベランレポート</h2>
        <p class="text-muted mp-editor-lead">イベントアーカイブの成績・グラフを添えたノート記事です。公開すると攻略図書館に並びます。</p>
        <div class="form-group">
          <label for="grTitle">タイトル</label>
          <input type="text" class="form-input" id="grTitle" maxlength="${TITLE_MAX}" value="${esc(state.title)}">
        </div>
        <div class="form-group">
          <label for="grBody">本文（ノート）</label>
          <textarea class="form-input" id="grBody" rows="10" maxlength="${BODY_MAX}" placeholder="走り方・反省点・おすすめ編成などを自由に書いてください">${esc(state.body)}</textarea>
          <p class="form-hint"><span id="grBodyCount">0</span> / ${BODY_MAX} · <button type="button" class="guide-report-tpl-btn" id="grInsertTpl">ひな形を入れる</button></p>
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
    `;

    const titleEl = box.querySelector('#grTitle');
    const bodyEl = box.querySelector('#grBody');
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
    function refreshCount() {
      if (countEl) countEl.textContent = String(currentBody().length);
    }
    function refreshPreview() {
      previewReport.title = currentTitle();
      previewReport.body = currentBody();
      previewReport.isPublished = !!(pubEl && pubEl.checked);
      previewReport.snapshot = state.snapshot;
      if (previewEl) previewEl.innerHTML = reportArticleHtml(previewReport, { hideMeta: true, showDraft: true });
    }

    refreshCount();
    titleEl.addEventListener('input', refreshPreview);
    bodyEl.addEventListener('input', () => { refreshCount(); refreshPreview(); });
    if (pubEl) pubEl.addEventListener('change', refreshPreview);

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
            isPublished,
            snapshot: state.snapshot,
            createdAtMs: state.report ? state.report.createdAtMs : Date.now(),
          });
          state.report = saved;
          state.title = saved.title;
          state.body = saved.body;
          state.isPublished = saved.isPublished;
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
