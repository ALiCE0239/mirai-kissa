/**
 * 未来喫茶 — セカイノート（リトリン風リンク + 自分の記事 / linkHubs）
 *
 * - #/login          ログイン画面（X / Google）
 * - #/mypage         マイページ（要ログイン）
 * - #/mypage/settings    マイページ設定（要ログイン）
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

  const CARD_THEME_GROUPS = [
    { id: 'basic', label: 'VIRTUAL SINGER' },
    { id: 'leoneed', label: 'Leo/need' },
    { id: 'mmj', label: 'MORE MORE JUMP!' },
    { id: 'vbs', label: 'Vivid BAD SQUAD' },
    { id: 'wxs', label: 'ワンダーランズ×ショウタイム' },
    { id: 'n25', label: '25時、ナイトコードで。' },
  ];

  const LEGACY_CARD_THEME_KEYS = {
    mafuyu: 'mfy',
    blue: 'kaito',
    green: 'len',
    pinkRed: 'luka',
    purple: 'meiko',
    yellow: 'rin',
    emerald: 'miku',
  };

  /** メンバーズカード専用テーマ（蝙蝠傘カラーチャート準拠 / bg=背景, accent=アクセント, ink=本文, accentText=見出し） */
  const CARD_THEMES = {
    miku:    { name: 'ミク',   group: 'basic', bg: '#ecfdf8', accent: '#33CCBB', ink: '#1e293b', muted: '#64748b', accentText: '#229988' },
    rin:     { name: 'リン',   group: 'basic', bg: '#fffce8', accent: '#FFCC11', ink: '#1e293b', muted: '#64748b', accentText: '#c4a800' },
    len:     { name: 'レン',   group: 'basic', bg: '#fffef0', accent: '#FFEE11', ink: '#1e293b', muted: '#64748b', accentText: '#ccbb00' },
    luka:    { name: 'ルカ',   group: 'basic', bg: '#fff0f5', accent: '#FFBBCC', ink: '#1e293b', muted: '#64748b', accentText: '#dd8899' },
    meiko:   { name: 'MEIKO',  group: 'basic', bg: '#fff0f0', accent: '#DD4444', ink: '#1e293b', muted: '#64748b', accentText: '#bb3333' },
    kaito:   { name: 'KAITO',  group: 'basic', bg: '#eef3ff', accent: '#3366CC', ink: '#1e293b', muted: '#64748b', accentText: '#2655aa' },
    ichika:  { name: '一歌',   group: 'leoneed', bg: '#e8f6fc', accent: '#33AAEE', ink: '#1e293b', muted: '#64748b', accentText: '#1277aa' },
    saki:    { name: '咲希',   group: 'leoneed', bg: '#fffce8', accent: '#FFDD44', ink: '#1e293b', muted: '#64748b', accentText: '#c4a800' },
    honami:  { name: '穂波',   group: 'leoneed', bg: '#fff0f0', accent: '#FF6666', ink: '#1e293b', muted: '#64748b', accentText: '#cc4444' },
    shiho:   { name: '志歩',   group: 'leoneed', bg: '#f5faeb', accent: '#BBDD22', ink: '#1e293b', muted: '#64748b', accentText: '#8faa18' },
    minori:  { name: 'みのり', group: 'mmj', bg: '#fff5ee', accent: '#FFCCAA', ink: '#1e293b', muted: '#64748b', accentText: '#cc9966' },
    haruka:  { name: '遥',     group: 'mmj', bg: '#eef6ff', accent: '#99CCFF', ink: '#1e293b', muted: '#64748b', accentText: '#6699cc' },
    airi:    { name: '愛莉',   group: 'mmj', bg: '#fff0f8', accent: '#FFAACC', ink: '#1e293b', muted: '#64748b', accentText: '#cc88aa' },
    shizuku: { name: '雫',     group: 'mmj', bg: '#eefaf5', accent: '#99EEDD', ink: '#1e293b', muted: '#64748b', accentText: '#66bbaa' },
    kohane:  { name: 'こはね', group: 'vbs', bg: '#fff0f5', accent: '#FF6699', ink: '#1e293b', muted: '#64748b', accentText: '#cc4477' },
    an:      { name: '杏',     group: 'vbs', bg: '#e8f8fc', accent: '#00BBDD', ink: '#1e293b', muted: '#64748b', accentText: '#0099bb' },
    akito:   { name: '彰',     group: 'vbs', bg: '#fff3eb', accent: '#FF7722', ink: '#1e293b', muted: '#64748b', accentText: '#cc5500' },
    touya:   { name: '冬弥',   group: 'vbs', bg: '#eef5fc', accent: '#0077DD', ink: '#1e293b', muted: '#64748b', accentText: '#0055aa' },
    tsukasa: { name: '司',     group: 'wxs', bg: '#fffbeb', accent: '#FFBB00', ink: '#1e293b', muted: '#64748b', accentText: '#cc9600' },
    emu:     { name: 'えむ',   group: 'wxs', bg: '#fff0f8', accent: '#FF66BB', ink: '#1e293b', muted: '#64748b', accentText: '#cc3388' },
    nene:    { name: '寧々',   group: 'wxs', bg: '#eefbf5', accent: '#33DD99', ink: '#1e293b', muted: '#64748b', accentText: '#22aa66' },
    rui:     { name: '類',     group: 'wxs', bg: '#f5f0fc', accent: '#BB88EE', ink: '#1e293b', muted: '#64748b', accentText: '#8866bb' },
    kanade:  { name: '奏',     group: 'n25', bg: '#f8f0f5', accent: '#BB6688', ink: '#1e293b', muted: '#64748b', accentText: '#994466' },
    ena:     { name: '絵名',   group: 'n25', bg: '#faf5ee', accent: '#CCAA88', ink: '#1e293b', muted: '#64748b', accentText: '#aa8866' },
    mizuki:  { name: '瑞希',   group: 'n25', bg: '#faf0f5', accent: '#DDAACC', ink: '#1e293b', muted: '#64748b', accentText: '#bb88aa' },
    mfy:     { name: 'まふゆ', group: 'n25', bg: '#eef0f8', accent: '#8888CC', ink: '#1e293b', muted: '#64748b', accentText: '#6666aa' },
  };

  /** 管理者付与の特殊カラー（キャラクター以外）。追加時はここに定義 */
  const SPECIAL_CARD_THEMES = {};

  const SPECIAL_CARD_THEME_GROUPS = [
    { id: 'special', label: '特殊カラー' },
  ];

  /** 全員が最初から使えるカードカラー（全キャラクター） */
  const DEFAULT_UNLOCKED_CARD_THEMES = Object.keys(CARD_THEMES);

  function allCardThemes() {
    return Object.assign({}, CARD_THEMES, SPECIAL_CARD_THEMES);
  }

  function isCharacterCardThemeKey(key) {
    return !!CARD_THEMES[normalizeCardThemeKey(key)];
  }

  function isSpecialCardThemeKey(key) {
    return !!SPECIAL_CARD_THEMES[normalizeCardThemeKey(key)];
  }

  function normalizeCardThemeKey(key) {
    const k = String(key || '').trim();
    return LEGACY_CARD_THEME_KEYS[k] || k;
  }

  function resolveCardTheme(hub, rewards) {
    const key = resolveEffectiveProfileCardThemeKey(hub, rewards);
    const themes = allCardThemes();
    return themes[key] || CARD_THEMES.kaito;
  }

  function cardThemeStyleVars(theme) {
    return [
      '--pc-bg:' + theme.bg,
      '--pc-accent:' + theme.accent,
      '--pc-ink:' + theme.ink,
      '--pc-muted:' + theme.muted,
      '--pc-accent-text:' + theme.accentText,
      '--pc-id-bg:#ffffff',
      '--pc-id-border:' + theme.accent + '33',
    ].join(';');
  }

  function resolveUnlockedSpecialThemeKeys(rewards) {
    const extra = rewards && Array.isArray(rewards.unlockedCardThemes) ? rewards.unlockedCardThemes : [];
    return [...new Set(extra.map(normalizeCardThemeKey).filter((k) => isSpecialCardThemeKey(k)))];
  }

  function resolveUnlockedThemeKeys(rewards, hub) {
    const keys = DEFAULT_UNLOCKED_CARD_THEMES.slice();
    resolveUnlockedSpecialThemeKeys(rewards).forEach((k) => {
      if (!keys.includes(k)) keys.push(k);
    });
    const saved = normalizeCardThemeKey(hub && hub.profileCardTheme);
    if (saved && allCardThemes()[saved] && !keys.includes(saved)) {
      keys.push(saved);
    }
    return [...new Set(keys.filter((k) => allCardThemes()[k]))];
  }

  function resolveEffectiveProfileCardThemeKey(hub, rewards) {
    const unlocked = new Set(resolveUnlockedThemeKeys(rewards, hub));
    const preferred = normalizeCardThemeKey(
      (hub && hub.profileCardTheme) || (hub && hub.theme) || 'kaito'
    );
    if (unlocked.has(preferred)) return preferred;
    return DEFAULT_UNLOCKED_CARD_THEMES[0] || 'kaito';
  }

  const MAX_PROFILE_CARD_DISPLAY_TITLES = 5;
  const PROFILE_CARD_WIDTH_MM = 91;
  const PROFILE_CARD_HEIGHT_MM = 55;
  const PROFILE_CARD_EXPORT_DPI = 300;
  const SUPPORT_TEAM_MAX = 3;
  const HEADLINE_MAX = 20;

  function normalizeHeadline(value) {
    return String(value || '').trim().slice(0, HEADLINE_MAX);
  }
  const SUPPORT_TEAM_TYPES = {
    internal: '内部編成',
    internal_encore: '内部アンコール編成',
    encore: 'アンコール編成',
  };
  const SETTINGS_DRAFT_KEY = 'mirai_mypage_settings_draft';
  const EXEC_FROM_SETTINGS_KEY = 'mirai_exec_from_settings';

  function parseSupportNumber(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }

  function parseSupportDecimal(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
  }

  function normalizeSupportTeams(teams) {
    if (!Array.isArray(teams)) return [];
    return teams.slice(0, SUPPORT_TEAM_MAX).map((t) => ({
      id: t.id || newPublicId(),
      teamType: Object.prototype.hasOwnProperty.call(SUPPORT_TEAM_TYPES, t.teamType) ? t.teamType : 'internal',
      leaderSkill: String(t.leaderSkill || '').trim().slice(0, 40),
      internalValue: parseSupportNumber(t.internalValue),
      totalPower: parseSupportDecimal(t.totalPower),
    }));
  }

  function supportTeamsForSave(teams) {
    return normalizeSupportTeams(teams).filter((t) =>
      t.leaderSkill || t.internalValue != null || t.totalPower != null
    );
  }

  function supportTeamTypeLabel(type) {
    return SUPPORT_TEAM_TYPES[type] || SUPPORT_TEAM_TYPES.internal;
  }

  function parseLeaderSkillValue(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function calcSupportExecValue(leaderSkill, internalValue) {
    const leader = parseLeaderSkillValue(leaderSkill);
    const internal = parseSupportNumber(internalValue);
    if (leader == null || internal == null) return null;
    return leader + (internal - leader) * 0.2;
  }

  function supportTeamStatsText(team, fmtDec) {
    const leaderText = team.leaderSkill ? esc(team.leaderSkill) : '—';
    const internalText = team.internalValue != null ? esc(team.internalValue) : '—';
    const totalText = team.totalPower != null ? esc(fmtDec(team.totalPower)) : '—';
    const execValue = calcSupportExecValue(team.leaderSkill, team.internalValue);
    const execPart = execValue != null ? '(' + esc(fmtDec(execValue)) + '%)' : '';
    return leaderText + '/' + internalText + '/' + totalText + execPart;
  }

  function supportTeamsDetailHtml(teams) {
    const list = supportTeamsForSave(teams);
    if (!list.length) return '';
    const fmtDec = typeof window.fmtNum1 === 'function' ? window.fmtNum1 : (n) => String(n);
    return (
      '<section class="board-support-teams">' +
      '<h3 class="board-support-teams__title">お返し編成</h3>' +
      '<ol class="board-support-teams__list">' +
      list.map((team) =>
        '<li class="board-support-team-row">' +
        '<span class="board-support-team-row__type">' + esc(supportTeamTypeLabel(team.teamType)) + '</span>' +
        '<span class="board-support-team-row__stats">' + supportTeamStatsText(team, fmtDec) + '</span>' +
        '</li>'
      ).join('') +
      '</ol></section>'
    );
  }

  function profileCardExportPixelSize() {
    const pxPerMm = PROFILE_CARD_EXPORT_DPI / 25.4;
    return {
      width: Math.round(PROFILE_CARD_WIDTH_MM * pxPerMm),
      height: Math.round(PROFILE_CARD_HEIGHT_MM * pxPerMm),
    };
  }

  function resolveGrantedTitles(rewards) {
    if (!rewards || !Array.isArray(rewards.grantedTitles)) return [];
    return rewards.grantedTitles.map((t) => String(t || '').trim()).filter(Boolean);
  }

  function normalizeProfileCardDisplayTitles(raw, granted) {
    const grantedSet = new Set(granted);
    const list = (Array.isArray(raw) ? raw : [])
      .map((t) => String(t || '').trim())
      .filter((t) => grantedSet.has(t));
    return [...new Set(list)].slice(0, MAX_PROFILE_CARD_DISPLAY_TITLES);
  }

  function resolveProfileCardDisplayTitles(hub, rewards) {
    const granted = resolveGrantedTitles(rewards);
    if (Array.isArray(hub && hub.profileCardDisplayTitles)) {
      return normalizeProfileCardDisplayTitles(hub.profileCardDisplayTitles, granted);
    }
    const legacy = String((hub && hub.profileCardTitle) || '').trim();
    if (legacy && granted.includes(legacy)) return [legacy];
    return [];
  }

  function resolvePublicProfileCardDisplayTitles(hub) {
    if (Array.isArray(hub && hub.profileCardDisplayTitles)) {
      return hub.profileCardDisplayTitles
        .map((t) => String(t || '').trim())
        .filter(Boolean)
        .slice(0, MAX_PROFILE_CARD_DISPLAY_TITLES);
    }
    const legacy = String((hub && hub.profileCardTitle) || '').trim();
    return legacy ? [legacy] : [];
  }

  /** @deprecated 互換用。表示称号は resolveProfileCardDisplayTitles を使用 */
  function resolveProfileCardTitle(hub, rewards) {
    const titles = resolveProfileCardDisplayTitles(hub, rewards);
    return titles[0] || '';
  }

  function profileCardTitlePickerHtml(grantedTitles, selectedTitles) {
    const selected = new Set(selectedTitles || []);
    const atMax = selected.size >= MAX_PROFILE_CARD_DISPLAY_TITLES;
    return (
      '<div class="pc-title-checklist">' +
      grantedTitles.map((t) => {
        const isChecked = selected.has(t);
        const disabled = atMax && !isChecked ? ' disabled' : '';
        const checked = isChecked ? ' checked' : '';
        return (
          '<label class="pc-title-check">' +
          '<input type="checkbox" name="profileCardTitle" value="' + esc(t) + '"' + checked + disabled + '>' +
          '<span>' + esc(t) + '</span></label>'
        );
      }).join('') +
      '</div>'
    );
  }

  function profileCardThemePickerHtml(selected, unlockedSpecialKeys) {
    const characterHtml = CARD_THEME_GROUPS.map((g) => {
      const items = Object.keys(CARD_THEMES).filter((k) => CARD_THEMES[k].group === g.id);
      if (!items.length) return '';
      return (
        '<div class="pc-theme-group">' +
        '<p class="pc-theme-group__label">' + esc(g.label) + '</p>' +
        '<div class="pc-theme-grid">' + items.map((k) => {
          const t = CARD_THEMES[k];
          return '<button type="button" class="pc-theme-swatch' + (k === normalizeCardThemeKey(selected) ? ' is-active' : '') + '" data-theme="' + esc(k) + '" title="' + esc(t.name) + '" style="--swatch-bg:' + t.bg + ';--swatch-accent:' + t.accent + '"><span>' + esc(t.name) + '</span></button>';
        }).join('') + '</div></div>'
      );
    }).join('');

    const specialKeys = (unlockedSpecialKeys || []).filter((k) => isSpecialCardThemeKey(k));
    if (!specialKeys.length) return characterHtml;

    const specialHtml = SPECIAL_CARD_THEME_GROUPS.map((g) => {
      const items = specialKeys.filter((k) => SPECIAL_CARD_THEMES[k].group === g.id);
      if (!items.length) return '';
      return (
        '<div class="pc-theme-group">' +
        '<p class="pc-theme-group__label">' + esc(g.label) + '</p>' +
        '<div class="pc-theme-grid">' + items.map((k) => {
          const t = SPECIAL_CARD_THEMES[k];
          return '<button type="button" class="pc-theme-swatch' + (k === normalizeCardThemeKey(selected) ? ' is-active' : '') + '" data-theme="' + esc(k) + '" title="' + esc(t.name) + '" style="--swatch-bg:' + t.bg + ';--swatch-accent:' + t.accent + '"><span>' + esc(t.name) + '</span></button>';
        }).join('') + '</div></div>'
      );
    }).join('');

    return characterHtml + specialHtml;
  }

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

  function normalizePublicId(raw) {
    return String(raw || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  }

  async function loadHub(publicId) {
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

  function isLocalGuest() {
    return !!(window.MiraiAuth && MiraiAuth.isLocalGuest && MiraiAuth.isLocalGuest());
  }

  const LOCAL_HUB_KEY = 'miraiLocalGuestHub';

  function readLocalHub(uid) {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCAL_HUB_KEY) || 'null');
      return raw && raw.uid === uid ? raw : null;
    } catch (e) {
      return null;
    }
  }

  function writeLocalHub(hub) {
    localStorage.setItem(LOCAL_HUB_KEY, JSON.stringify(hub));
  }

  async function loadOwnHub(uid) {
    if (isLocalGuest()) return readLocalHub(uid);
    const f = await fb();
    if (!f || !f.configured) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, 'users', uid, 'sns', 'linkHub'));
    return snap.exists() ? snap.data() : null;
  }

  async function loadUserRewards(uid) {
    const f = await fb();
    if (!f || !f.configured || !uid) return null;
    const { doc, getDoc } = f.dbFns;
    const snap = await getDoc(doc(f.db, 'userRewards', uid));
    return snap.exists() ? snap.data() : null;
  }

  async function saveUserRewards(uid, rewards, adminUid) {
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const { doc, setDoc, serverTimestamp } = f.dbFns;
    const data = {
      unlockedCardThemes: Array.isArray(rewards.unlockedCardThemes) ? rewards.unlockedCardThemes : [],
      grantedTitles: Array.isArray(rewards.grantedTitles) ? rewards.grantedTitles : [],
      adminNote: String(rewards.adminNote || '').trim(),
      updatedAt: serverTimestamp(),
      updatedBy: adminUid,
    };
    await setDoc(doc(f.db, 'userRewards', uid), data, { merge: true });
    return data;
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
    if (isLocalGuest()) {
      const data = Object.assign({}, hub, {
        uid,
        displayName: hub.displayName || 'ゲスト（ローカル）',
        headline: normalizeHeadline(hub.headline),
        updatedAtMs: Date.now(),
      });
      writeLocalHub(data);
      return data;
    }
    const f = await fb();
    if (!f || !f.configured) throw new Error('Firebase 未設定です。');
    const { doc, setDoc, serverTimestamp } = f.dbFns;
    const data = Object.assign({}, hub, {
      uid,
      headline: normalizeHeadline(hub.headline),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(f.db, 'linkHubs', data.publicId), data, { merge: true });
    await setDoc(doc(f.db, 'users', uid, 'sns', 'linkHub'), data, { merge: true });
    if (window.MiraiFriends && typeof MiraiFriends.syncFriendProfileForPeers === 'function') {
      MiraiFriends.syncFriendProfileForPeers(uid, data).catch((e) => {
        console.warn('[mypage] friend profile sync failed:', e);
      });
    }
    return data;
  }

  async function saveHubWithRetry(uid, hub) {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (window.MiraiAuth && window.MiraiAuth.whenReady) {
          await window.MiraiAuth.whenReady();
        }
        const authUser = window.MiraiAuth ? window.MiraiAuth.getUser() : null;
        if (authUser && typeof authUser.getIdToken === 'function') {
          await authUser.getIdToken(attempt > 0);
        }
        await saveHub(uid, hub);
        return;
      } catch (e) {
        lastError = e;
        const code = e && e.code ? String(e.code) : '';
        if (attempt < 2 && (code === 'permission-denied' || code === 'unavailable')) {
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    if (lastError) throw lastError;
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

    box.innerHTML = '<p class="text-muted">読み込み中…</p>';

    if (window.MiraiAuth.whenReady) await window.MiraiAuth.whenReady();
    const userAfterAuth = await window.MiraiAuth.waitForUser(4000);

    if (userAfterAuth || window.MiraiAuth.getUser()) {
      location.hash = window.MiraiAuth.consumeLoginReturn('#/mypage');
      return;
    }

    const guestBtnHtml = (window.MiraiAuth && MiraiAuth.isLocalDev && MiraiAuth.isLocalDev())
      ? '<button type="button" class="btn btn-secondary btn-block mt-2" id="loginGuest">ゲストでプレビュー（ローカルのみ）</button>'
      : '';
    box.innerHTML =
      '<p class="text-muted community-login__lead">ログインすると、セカイノートからプロフィール・イベラン広告・マイセカイ宣伝を編集できます。</p>' +
      '<button type="button" class="btn community-btn-x btn-block" id="loginX">𝕏（X）でログイン</button>' +
      '<button type="button" class="btn btn-primary btn-block mt-2" id="loginGoogle">Google でログイン</button>' +
      guestBtnHtml +
      '<p class="form-hint mt-2">初回ログイン時は自動で新規登録されます。もう一方のログイン方法は、ログイン後に<a href="#/mypage/settings" data-link>マイページ設定</a>から連携できます。</p>' +
      '<p id="loginError" class="form-error mt-3" hidden></p>';

    const errEl = box.querySelector('#loginError');
    const showErr = (msg) => { errEl.textContent = msg; errEl.hidden = false; };

    const pendingErr = window.MiraiAuth.consumeAuthError && window.MiraiAuth.consumeAuthError();
    if (pendingErr) showErr(pendingErr);

    const run = async (fn) => {
      errEl.hidden = true;
      try {
        await fn();
        if (window.MiraiAuth.isRedirectPending && window.MiraiAuth.isRedirectPending()) {
          return;
        }
        let user = window.MiraiAuth.getUser();
        if (!user) user = await window.MiraiAuth.waitForUser(3000);
        if (user) {
          location.hash = window.MiraiAuth.consumeLoginReturn('#/mypage');
        } else {
          showErr('ログインが完了しませんでした。すでに Google で登録済みの場合は Google でログインしてください。');
        }
      } catch (e) {
        showErr(e.message || String(e));
      }
    };

    box.querySelector('#loginX').addEventListener('click', () => run(() => window.MiraiAuth.signInWithX()));
    box.querySelector('#loginGoogle').addEventListener('click', () => run(() => window.MiraiAuth.signInWithGoogle()));
    const guestBtn = box.querySelector('#loginGuest');
    if (guestBtn) {
      guestBtn.addEventListener('click', () => {
        window.MiraiAuth.enableLocalGuest();
        location.hash = window.MiraiAuth.consumeLoginReturn('#/mypage');
      });
    }

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

  function isRetryableLoadError(err) {
    const code = err && err.code ? String(err.code) : '';
    return code === 'permission-denied' || code === 'unavailable' || code === 'failed-precondition';
  }

  async function loadHubWithRetry(publicId, opts) {
    opts = opts || {};
    const attempts = opts.attempts || 4;
    const intervalMs = opts.intervalMs || 300;
    for (let i = 0; i < attempts; i++) {
      if (opts.isStale && opts.isStale()) return null;
      const f = await fb();
      if (!f || !f.configured) {
        if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }
      const id = normalizePublicId(publicId);
      if (!id) return null;
      const { doc, getDoc } = f.dbFns;
      try {
        const snap = await getDoc(doc(f.db, 'linkHubs', id));
        if (!snap.exists()) return null;
        const hub = snap.data();
        if (!hub) return null;
        if (!hub.publicId) hub.publicId = id;
        return hub;
      } catch (e) {
        if (i < attempts - 1 && isRetryableLoadError(e)) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs * (i + 1)));
          continue;
        }
        throw e;
      }
    }
    return null;
  }

  async function waitForPageUser(fallbackUser) {
    if (window.MiraiFriends && typeof MiraiFriends.waitForAuthUser === 'function') {
      return MiraiFriends.waitForAuthUser(fallbackUser, 12000);
    }
    return resolveAuthUser();
  }

  // ================= マイページ編集 =================

  async function initMyPage() {
    const root = document.getElementById('app');
    const box = root.querySelector('#myPageRoot');
    if (!box) return;

    const configured = await isConfigured();
    if (!configured && !isLocalGuest()) {
      box.innerHTML =
        '<div class="info-box"><p><strong>ログイン機能は準備中です。</strong></p>' +
        '<p class="mt-1">Firebase の設定後に利用できます。</p></div>';
      return;
    }

    let pageSeq = 0;

    async function renderPage() {
      const seq = ++pageSeq;
      const isStale = () => seq !== pageSeq;

      box.innerHTML = '<p class="text-muted">読み込み中…</p>';

      const user = await waitForPageUser(null);
      if (isStale()) return;
      if (!user) {
        box.innerHTML =
          '<div class="info-box"><p>ログイン状態を確認中です…</p>' +
          '<p class="form-hint mt-1">しばらく待っても表示されない場合は<a href="#/login" data-link>ログイン</a>してください。</p></div>';
        return;
      }

      const { hub, hubExisted } = await prepareHub(user);
      if (isStale()) return;

      let sekaiSaved = hubExisted;
      let profileSaveError = '';
      if (!hubExisted) {
        try {
          if (isLocalGuest()) {
            await saveHub(user.uid, hub);
          } else {
            await saveHubWithRetry(user.uid, hub);
          }
          sekaiSaved = true;
        } catch (e) {
          console.error(e);
          profileSaveError = e.message || String(e);
        }
      }
      if (isStale()) return;

      renderDashboard(box, user, hub, sekaiSaved, profileSaveError);
      loadBoardSummaries(box, user);
      loadRankingSummaries(box, user);
      loadEventBookmarksSummary(box, user);
      loadEventSupportSummary(box, user);
    }

    await renderPage();

    if (window.MiraiAuth && typeof window.MiraiAuth.onChange === 'function') {
      window.MiraiAuth.onChange((user) => {
        if (!user) return;
        const loading = box.querySelector('.text-muted');
        const needsLogin = box.querySelector('.info-box');
        if (loading && loading.textContent.indexOf('読み込み中') >= 0) {
          renderPage();
        } else if (needsLogin && needsLogin.textContent.indexOf('ログイン状態を確認中') >= 0) {
          renderPage();
        }
      });
    }
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
    let ownEvent = null;
    let ownMysekai = null;
    if (window.MiraiBoard) {
      try {
        [ownEvent, ownMysekai] = await Promise.all([
          MiraiBoard.fetchOwnEventAd(user.uid),
          MiraiBoard.fetchOwnMysekai(user.uid),
        ]);
      } catch (e) {
        console.warn(e);
      }
    }
    renderSekaiEditor(box, user, hub, hubExisted, { ownEvent, ownMysekai });
  }

  async function initSettings() {
    const root = document.getElementById('app');
    const box = root.querySelector('#myPageSettingsRoot');
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
        '<div class="info-box"><p>マイページ設定の編集にはログインが必要です。</p>' +
        '<p class="mt-2"><a href="#/login" class="btn btn-primary" data-link>ログインする</a></p></div>';
      return;
    }

    const { hub } = await prepareHub(user);
    renderProfileSettings(box, user, hub);
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
        publicId: isLocalGuest() ? 'guestloc' : newPublicId(),
        displayName: isLocalGuest() ? 'ゲスト（ローカル）' : '',
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
        supportTeams: [],
      };
      const x = window.MiraiAuth.getStoredXHandle();
      if (x) {
        hub.links.push({ id: newPublicId(), title: 'X', url: 'https://x.com/' + x, emoji: '𝕏' });
      }
    }
    hub.links = Array.isArray(hub.links) ? hub.links : [];
    hub.notes = Array.isArray(hub.notes) ? hub.notes : [];
    hub.supportTeams = normalizeSupportTeams(hub.supportTeams);
    hub.headline = normalizeHeadline(hub.headline);
    hub.pinEventAd = hub.pinEventAd === true;
    hub.pinMysekai = hub.pinMysekai === true;
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

  function renderDashboard(box, user, hub, hubExisted, profileSaveError) {
    box.innerHTML = `
      <section class="card community-editor mp-page mp-dashboard">
        ${isLocalGuest()
          ? '<div class="info-box mb-2"><p><strong>ローカルゲストプレビュー</strong></p><p class="mt-1">ログインせずにマイページとイベランレポートを確認できます。データはブラウザ内だけに保存されます。</p></div>'
          : ''}
        ${profileSaveError
          ? '<div class="info-box mb-2"><p class="form-error">プロフィールの初期登録に失敗しました。ページを再読み込みするか、マイページ設定から表示名を保存してください。</p><p class="form-hint">' + esc(profileSaveError) + '</p></div>'
          : ''}

        <div class="mp-profile-summary">
          <div class="mp-profile-summary__main">
            <div id="mpProfileAvatarPreview">${avatarHtml(hub, 'linkhub-avatar--sm')}</div>
            <div class="mp-profile-summary__text">
              <p class="mp-profile-summary__name">${esc(hub.displayName || '未設定')}</p>
              <p class="mp-profile-summary__headline">${esc(hub.headline || '一言未設定')}</p>
            </div>
          </div>
          <a href="#/mypage/settings" class="btn btn-secondary" data-link>マイページ設定</a>
        </div>

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

        <div class="mp-cat-grid">

          <div class="mp-cat-card mp-cat-card--feature">
            <div class="mp-cat-card__head">
              <span class="mp-cat-card__icon">📈</span>
              <h3 class="mp-cat-card__title">イベラン支援</h3>
              <span class="mp-cat-card__badge">NEW</span>
            </div>
            <p id="mpEventSupportSummary" class="mp-cat-card__desc">読み込み中…</p>
            <div class="mp-cat-card__actions">
              <a href="#/mypage/event-support" class="btn btn-primary btn-sm" data-link>イベラン支援を開く</a>
            </div>
          </div>

          <div class="mp-cat-card">
            <div class="mp-cat-card__head">
              <span class="mp-cat-card__icon">📓</span>
              <h3 class="mp-cat-card__title">セカイノート</h3>
            </div>
            <p id="mpSekaiSummary" class="mp-cat-card__desc">${esc(sekaiSummaryText(hub, hubExisted))}</p>
            <div class="mp-cat-card__actions">
              <a href="#/mypage/sekainote" class="btn btn-primary btn-sm" data-link id="mpSekaiBtn">${hubExisted ? 'セカイノートを編集' : 'セカイノートを作成'}</a>
            </div>
          </div>

          <div class="mp-cat-card">
            <div class="mp-cat-card__head">
              <span class="mp-cat-card__icon">🏆</span>
              <h3 class="mp-cat-card__title">ランキング</h3>
            </div>
            <p id="mpRankingSummary" class="mp-cat-card__desc">読み込み中…</p>
            <div class="mp-cat-card__actions">
              <a href="#/mypage/ranking" class="btn btn-primary btn-sm" data-link id="mpRankingBtn">ランキングに登録</a>
              <a href="#/ranking" class="btn btn-secondary btn-sm" data-link>見る</a>
            </div>
          </div>

          <div class="mp-cat-card mp-cat-card--wide">
            <div class="mp-cat-card__head">
              <span class="mp-cat-card__icon">👥</span>
              <h3 class="mp-cat-card__title">フレンド</h3>
            </div>
            <p class="mp-cat-card__desc">フレンド申請の確認と、フレンドのセカイノートへのリンク</p>
            <div class="mp-friend-id-search">
              <label for="mpFriendIdSearch">未来喫茶IDで検索</label>
              <div class="mp-friend-id-search__row">
                <input type="text" class="form-input" id="mpFriendIdSearch" maxlength="12" placeholder="例: a1b2c3d4" autocapitalize="off" autocomplete="off" spellcheck="false">
                <button type="button" class="btn btn-secondary" id="mpFriendIdSearchBtn">検索</button>
              </div>
              <div id="mpFriendIdSearchResult" class="mp-friend-id-search__result"></div>
            </div>
            <div class="mp-friends-actions">
              <div class="mp-friends-btn-wrap">
                <a href="#/mypage/friend-requests" class="btn btn-secondary btn-sm" data-link id="mpFriendRequestsLink">フレンド申請</a>
                <span id="mpFriendRequestBadge" class="mp-friend-notify-badge" hidden aria-label="未確認のフレンド申請"></span>
              </div>
              <a href="#/mypage/friends" class="btn btn-secondary btn-sm" data-link>フレンド一覧</a>
              <a href="#/mypage/friend-settings" class="btn btn-secondary btn-sm" data-link>拒否設定</a>
            </div>
          </div>

          <div class="mp-cat-card">
            <div class="mp-cat-card__head">
              <span class="mp-cat-card__icon">📣</span>
              <h3 class="mp-cat-card__title">イベラン広告</h3>
              <p id="mpEventStatus" class="mp-board-status-wrap text-muted">読み込み中…</p>
            </div>
            <p id="mpEventSummary" class="mp-cat-card__desc">読み込み中…</p>
            <p id="mpEventListingAction" class="mp-board-listing-action" hidden></p>
            <p id="mpEventBookmarks" class="form-hint">ブックマークを読み込み中…</p>
            <div class="mp-cat-card__actions">
              <a href="#/board/event/edit" class="btn btn-primary btn-sm" data-link id="mpEventBtn">作成する</a>
              <a href="#/board/event" class="btn btn-secondary btn-sm" data-link>掲示板で見る</a>
              <a href="#/board/event/bookmarks" class="btn btn-secondary btn-sm" data-link>★ ブックマーク</a>
            </div>
          </div>

          <div class="mp-cat-card">
            <div class="mp-cat-card__head">
              <span class="mp-cat-card__icon">🌿</span>
              <h3 class="mp-cat-card__title">マイセカイ宣伝</h3>
              <p id="mpMysekaiStatus" class="mp-board-status-wrap text-muted">読み込み中…</p>
            </div>
            <p id="mpMysekaiSummary" class="mp-cat-card__desc">読み込み中…</p>
            <p id="mpMysekaiListingAction" class="mp-board-listing-action" hidden></p>
            <div class="mp-cat-card__actions">
              <a href="#/board/mysekai/edit" class="btn btn-primary btn-sm" data-link id="mpMysekaiBtn">作成する</a>
              <a href="#/board/mysekai" class="btn btn-secondary btn-sm" data-link>掲示板で見る</a>
            </div>
          </div>

        </div>

        <button type="button" class="btn btn-secondary btn-block mt-3" id="mpLogout">ログアウト</button>
      </section>
    `;

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

  function authProvidersSectionHtml(user) {
    const linked = window.MiraiAuth.getLinkedProviders(user);
    function row(label, providerKey, btnId, btnClass, btnLabel) {
      if (linked[providerKey]) {
        return (
          '<div class="mp-auth-provider-row">' +
          '<span class="mp-auth-provider-row__label">' + label + '</span>' +
          '<span class="mp-auth-provider-row__status">連携済み ✓</span>' +
          '</div>'
        );
      }
      return (
        '<div class="mp-auth-provider-row">' +
        '<span class="mp-auth-provider-row__label">' + label + '</span>' +
        '<button type="button" class="btn btn-sm ' + btnClass + '" id="' + btnId + '">' + btnLabel + '</button>' +
        '</div>'
      );
    }
    return (
      '<section class="mp-auth-providers">' +
      '<p class="adjust-filters__title">🔐 ログイン方法</p>' +
      '<p class="form-hint">Google と 𝕏（X）の両方を同じアカウントに連携できます。どちらでログインしても同じマイページを開けます。</p>' +
      '<div class="mp-auth-provider-list">' +
      row('Google', 'google', 'mpLinkGoogle', 'btn-primary', 'Google を連携') +
      row('𝕏（X）', 'twitter', 'mpLinkX', 'community-btn-x', '𝕏 を連携') +
      '</div>' +
      '<p id="mpAuthLinkError" class="form-error mt-2" hidden></p>' +
      '<p id="mpAuthLinkSaved" class="community-saved mt-2" hidden>連携しました ✓</p>' +
      '</section>'
    );
  }

  function bindAuthProviderButtons(box, user, hub, onLinked) {
    const errEl = box.querySelector('#mpAuthLinkError');
    const savedEl = box.querySelector('#mpAuthLinkSaved');
    const runLink = async (fn) => {
      if (errEl) errEl.hidden = true;
      if (savedEl) savedEl.hidden = true;
      try {
        const nextUser = await fn();
        if (nextUser && typeof onLinked === 'function') {
          onLinked(nextUser);
        } else if (savedEl) {
          savedEl.hidden = false;
          setTimeout(() => { savedEl.hidden = true; }, 2400);
        }
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message || String(err);
          errEl.hidden = false;
        }
      }
    };
    const googleBtn = box.querySelector('#mpLinkGoogle');
    const xBtn = box.querySelector('#mpLinkX');
    if (googleBtn) {
      googleBtn.addEventListener('click', () => runLink(() => window.MiraiAuth.linkWithGoogle()));
    }
    if (xBtn) {
      xBtn.addEventListener('click', () => runLink(() => window.MiraiAuth.linkWithX()));
    }
  }

  function renderProfileSettings(box, user, hub) {
    const draftRaw = sessionStorage.getItem(SETTINGS_DRAFT_KEY);
    if (draftRaw) {
      try {
        const draft = JSON.parse(draftRaw);
        if (draft.displayName != null) hub.displayName = String(draft.displayName);
        if (draft.headline != null) hub.headline = normalizeHeadline(draft.headline);
        if (draft.bio != null) hub.bio = String(draft.bio);
        if (draft.supportTeams) hub.supportTeams = normalizeSupportTeams(draft.supportTeams);
      } catch (e) {
        console.warn('[mypage] settings draft restore failed:', e);
      }
      sessionStorage.removeItem(SETTINGS_DRAFT_KEY);
    }

    let supportTeams = hub.supportTeams.slice();

    function supportTeamTypeOptions(selected) {
      return Object.keys(SUPPORT_TEAM_TYPES).map((k) =>
        '<option value="' + k + '"' + (selected === k ? ' selected' : '') + '>' + esc(SUPPORT_TEAM_TYPES[k]) + '</option>'
      ).join('');
    }

    function supportTeamRowHtml(team, idx) {
      return (
        '<div class="mp-support-team" data-id="' + esc(team.id) + '" data-idx="' + idx + '">' +
        '<div class="mp-support-team__head">' +
        '<p class="adjust-filters__title">支援編成 ' + (idx + 1) + '</p>' +
        '<button type="button" class="btn btn-secondary btn-sm mp-support-team__remove">削除</button>' +
        '</div>' +
        '<div class="form-group">' +
        '<label>編成タイプ</label>' +
        '<select class="form-select mp-support-type">' + supportTeamTypeOptions(team.teamType) + '</select>' +
        '</div>' +
        '<div class="form-row mp-support-team__stats">' +
        '<div class="form-group">' +
        '<label>リーダースキル</label>' +
        '<input type="text" class="form-input mp-support-leader" maxlength="40" value="' + esc(team.leaderSkill) + '" placeholder="160">' +
        '</div>' +
        '<div class="form-group">' +
        '<label>内部値</label>' +
        '<input type="number" class="form-input mp-support-internal" min="0" max="999" value="' + (team.internalValue != null ? esc(team.internalValue) : '') + '" placeholder="760">' +
        '</div>' +
        '<div class="form-group">' +
        '<label>総合力</label>' +
        '<input type="number" class="form-input mp-support-total" min="0" max="9999" step="0.1" value="' + (team.totalPower != null ? esc(team.totalPower) : '') + '" placeholder="36.2">' +
        '</div>' +
        '</div>' +
        '<p class="form-hint mp-support-exec-hint"><a href="#/exec" class="btn btn-secondary btn-sm mp-support-exec-calc" data-link>実効値計算機で入力</a></p>' +
        '</div>'
      );
    }

    function renderSupportTeamList() {
      const wrap = box.querySelector('#mpSupportTeams');
      const addBtn = box.querySelector('#mpAddSupportTeam');
      if (!wrap) return;
      wrap.innerHTML = supportTeams.map((team, idx) => supportTeamRowHtml(team, idx)).join('');
      if (addBtn) addBtn.disabled = supportTeams.length >= SUPPORT_TEAM_MAX;
      wireSupportTeamRows();
    }

    function readSupportTeamsFromDom() {
      const rows = box.querySelectorAll('.mp-support-team');
      supportTeams = Array.from(rows).map((row) => ({
        id: row.dataset.id || newPublicId(),
        teamType: row.querySelector('.mp-support-type').value,
        leaderSkill: row.querySelector('.mp-support-leader').value.trim(),
        internalValue: parseSupportNumber(row.querySelector('.mp-support-internal').value),
        totalPower: parseSupportDecimal(row.querySelector('.mp-support-total').value),
      }));
    }

    function saveSettingsDraft() {
      readProfileForm();
      sessionStorage.setItem(SETTINGS_DRAFT_KEY, JSON.stringify({
        displayName: hub.displayName,
        headline: hub.headline,
        bio: hub.bio,
        supportTeams: supportTeams,
      }));
    }

    function wireSupportTeamRows() {
      box.querySelectorAll('.mp-support-team__remove').forEach((btn) => {
        btn.addEventListener('click', () => {
          readSupportTeamsFromDom();
          const row = btn.closest('.mp-support-team');
          const idx = parseInt(row.dataset.idx, 10);
          supportTeams.splice(idx, 1);
          renderSupportTeamList();
        });
      });
      box.querySelectorAll('.mp-support-exec-calc').forEach((link) => {
        link.addEventListener('click', () => {
          readSupportTeamsFromDom();
          readProfileForm();
          saveSettingsDraft();
          sessionStorage.setItem(EXEC_FROM_SETTINGS_KEY, '1');
        });
      });
    }

    box.innerHTML = `
      <section class="card community-editor mp-settings-page">
        <h2 class="community-editor__title">マイページ設定</h2>
        <p class="form-hint mp-editor-lead">表示名・アイコン・プロフィールの内容は公開ページにも反映されます</p>
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
            <input type="text" class="form-input" id="mpHeadline" maxlength="${HEADLINE_MAX}" value="${esc(normalizeHeadline(hub.headline))}" placeholder="例: 25時、推しはミク">
            <p class="form-hint">最大${HEADLINE_MAX}文字</p>
          </div>
          <div class="form-group">
            <label for="mpBio">自己紹介</label>
            <textarea class="form-input" id="mpBio" rows="3" maxlength="200" placeholder="プロフィールや活動内容など">${esc(hub.bio)}</textarea>
          </div>

        <div class="divider"></div>
        <p class="adjust-filters__title">💳 プロフィールカード</p>
        <p class="form-hint">名刺サイズのプロフィールカードを作成できます</p>
        <a href="#/mypage/profile-card" class="btn btn-secondary btn-block" data-link>カードを作成</a>

        <div class="divider"></div>
        ${authProvidersSectionHtml(user)}

        <div class="divider"></div>
        <div class="community-links-head">
          <p class="adjust-filters__title">🛟 支援編成</p>
          <button type="button" class="btn btn-secondary btn-sm" id="mpAddSupportTeam">支援編成を追加</button>
        </div>
        <p class="form-hint">最大${SUPPORT_TEAM_MAX}つまで登録できます。イベラン広告の詳細で「お返し編成情報を記載」にチェックを入れると表示されます。</p>
        <div id="mpSupportTeams" class="mp-support-teams"></div>

        <button type="button" class="btn btn-primary btn-block" id="mpProfileSave">マイページ設定を保存</button>
        <p id="mpProfileError" class="form-error mt-2" hidden></p>
        <p id="mpProfileSaved" class="community-saved mt-2" hidden>保存しました ✓</p>
        <a href="#/mypage" class="btn btn-secondary btn-block mt-3" data-link>マイページに戻る</a>
      </section>
    `;

    renderSupportTeamList();
    bindAuthProviderButtons(box, user, hub, (nextUser) => {
      renderProfileSettings(box, nextUser, hub);
    });
    box.querySelector('#mpAddSupportTeam').addEventListener('click', () => {
      readSupportTeamsFromDom();
      if (supportTeams.length >= SUPPORT_TEAM_MAX) return;
      supportTeams.push({
        id: newPublicId(),
        teamType: 'internal',
        leaderSkill: '',
        internalValue: null,
        totalPower: null,
      });
      renderSupportTeamList();
    });

    let pendingAvatarFile = null;
    let avatarObjectUrl = null;

    function readProfileForm() {
      hub.displayName = box.querySelector('#mpName').value.trim();
      hub.headline = normalizeHeadline(box.querySelector('#mpHeadline').value);
      hub.bio = box.querySelector('#mpBio').value.trim();
      readSupportTeamsFromDom();
      hub.supportTeams = supportTeamsForSave(supportTeams);
    }

    function renderAvatarPreview() {
      const view = Object.assign({}, hub);
      if (avatarObjectUrl) view.avatarURL = avatarObjectUrl;
      box.querySelector('#mpAvatarEditPreview').innerHTML = avatarHtml(view, 'linkhub-avatar--sm');
      box.querySelector('#mpAvatarClear').hidden = !(hub.avatarURL || pendingAvatarFile);
    }

    box.querySelector('#mpAvatarFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
      pendingAvatarFile = file;
      avatarObjectUrl = URL.createObjectURL(file);
      renderAvatarPreview();
    });

    box.querySelector('#mpAvatarClear').addEventListener('click', () => {
      if (avatarObjectUrl) URL.revokeObjectURL(avatarObjectUrl);
      avatarObjectUrl = null;
      pendingAvatarFile = null;
      hub.avatarURL = '';
      box.querySelector('#mpAvatarFile').value = '';
      renderAvatarPreview();
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
        sessionStorage.removeItem(SETTINGS_DRAFT_KEY);
        profileSavedEl.hidden = false;
        renderAvatarPreview();
        setTimeout(() => { profileSavedEl.hidden = true; }, 2500);
      } catch (e) {
        profileErrEl.textContent = e.message || String(e);
        profileErrEl.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = 'マイページ設定を保存';
      }
    });
  }

  function renderSekaiEditor(box, user, hub, hubExisted, boardCtx) {
    boardCtx = boardCtx || {};
    const ownEvent = boardCtx.ownEvent || null;
    const ownMysekai = boardCtx.ownMysekai || null;

    function hasEventPost() {
      return !!(ownEvent && ownEvent.eventName);
    }

    function hasMysekaiPost() {
      return !!(ownMysekai && ownMysekai.title);
    }

    function pinStatusHint(post, contentKey, createHref, createLabel) {
      if (!post || !post[contentKey]) {
        return '<p class="form-hint mp-sekai-pin-hint">まだ投稿がありません。<a href="' + esc(createHref) + '" data-link>' + esc(createLabel) + '</a></p>';
      }
      const title = String(post[contentKey] || '');
      if (post.isPublished === false) {
        return '<p class="form-hint mp-sekai-pin-hint">「' + esc(title) + '」（非公開 — 公開するとノートに表示されます）</p>';
      }
      return '<p class="form-hint mp-sekai-pin-hint">「' + esc(title) + '」</p>';
    }

    function sekaiPinsSectionHtml() {
      return (
        '<div class="divider"></div><div class="mp-sekai-pins">' +
        '<p class="adjust-filters__title">📌 掲示板の引用</p>' +
        '<p class="form-hint mp-sekai-pins-lead">イベラン広告・マイセカイ宣伝をセカイノートに載せるかを、ここで切り替えます。掲示板への掲載とは別に設定できます。</p>' +
        '<label class="form-toggle mp-sekai-pin">' +
        '<input type="checkbox" id="mpPinEventAd"' + (hub.pinEventAd ? ' checked' : '') + '>' +
        '<span class="toggle-track"></span>' +
        '<span class="toggle-label">イベラン広告を載せる</span></label>' +
        pinStatusHint(ownEvent, 'eventName', '#/board/event/edit', 'イベラン広告を作成') +
        '<label class="form-toggle mp-sekai-pin">' +
        '<input type="checkbox" id="mpPinMysekai"' + (hub.pinMysekai ? ' checked' : '') + '>' +
        '<span class="toggle-track"></span>' +
        '<span class="toggle-label">マイセカイ宣伝を載せる</span></label>' +
        pinStatusHint(ownMysekai, 'title', '#/board/mysekai/edit', 'マイセカイ宣伝を作成') +
        '</div>'
      );
    }

    function embedPostsForPreview() {
      const eventPost = hub.pinEventAd && hasEventPost() ? ownEvent : null;
      const mysekaiPost = hub.pinMysekai && hasMysekaiPost() ? ownMysekai : null;
      return { eventPost, mysekaiPost };
    }

    let sekaiSaved = hubExisted;

    box.innerHTML = `
      <div class="mp-sekai-page">
        ${!hub.displayName ? '<div class="info-box mb-2"><p>公開前に<a href="#/mypage/settings" data-link>マイページ設定</a>で表示名を設定してください。</p></div>' : ''}
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

          ${sekaiPinsSectionHtml()}

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
      const pinEventEl = box.querySelector('#mpPinEventAd');
      const pinMysekaiEl = box.querySelector('#mpPinMysekai');
      if (pinEventEl && !pinEventEl.disabled) hub.pinEventAd = pinEventEl.checked;
      if (pinMysekaiEl && !pinMysekaiEl.disabled) hub.pinMysekai = pinMysekaiEl.checked;
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
      preview.innerHTML = publicHtml(hub, Object.assign({ showDrafts: true }, embedPostsForPreview()));
      preview.setAttribute('style', themeStyle(hub.theme));
    }

    renderLinks();
    renderNotes();
    renderPreview();

    box.querySelectorAll('#mpPinEventAd, #mpPinMysekai').forEach((el) => {
      el.addEventListener('change', () => { readSekaiForm(); renderPreview(); });
    });

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
        sekaiErrEl.textContent = 'マイページ設定で表示名を設定してから保存してください。';
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

  function boardPublishStatus(post, contentKey) {
    const hasContent = !!(post && post[contentKey]);
    if (!hasContent || post.isPublished === false) {
      return { label: '公開されていません', tone: 'off' };
    }
    if (window.MiraiBoard && typeof MiraiBoard.isBoardPostListed === 'function' && !MiraiBoard.isBoardPostListed(post)) {
      return { label: '公開停止中', tone: 'paused' };
    }
    return { label: '公開中', tone: 'live' };
  }

  function boardStatusHtml(status) {
    return (
      '<span class="mp-board-status mp-board-status--' + status.tone + '">' +
      '<span class="mp-board-status__dot" aria-hidden="true"></span>' +
      '<span>' + esc(status.label) + '</span></span>'
    );
  }

  function eventSummaryText(post) {
    if (!post || !post.eventName) return '未設定 — 編集ボタンから募集内容を登録できます';
    const vis = post.visibility === 'friends' ? '（フレンド限定）' : '';
    return '「' + post.eventName + '」' + vis;
  }

  function mysekaiSummaryText(post) {
    if (!post || !post.title) return '未設定 — 編集ボタンから宣伝内容を登録できます';
    const vis = post.visibility === 'friends' ? '（フレンド限定）' : '';
    const likes = Number(post.likeCount) || 0;
    return '「' + post.title + '」' + vis + ' · ♥' + likes;
  }

  function wireMypageListingExtend(el, collectionName, uid, onDone) {
    if (!el || !window.MiraiBoard) return;
    el.hidden = false;
    el.innerHTML =
      '<p class="form-hint">' + esc(MiraiBoard.boardListingPausedMessage()) + '</p>' +
      '<button type="button" class="btn btn-secondary btn-sm mt-1" id="' + esc(el.id) + 'Btn">掲載を延長する</button>';
    const btn = el.querySelector('button');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = '処理中…';
      try {
        await MiraiBoard.extendBoardListing(collectionName, uid);
        el.hidden = true;
        if (typeof onDone === 'function') onDone();
      } catch (e) {
        btn.textContent = label;
        btn.disabled = false;
        alert(e.message || String(e));
      }
    });
  }

  function loadEventBookmarksSummary(box, user) {
    const el = box.querySelector('#mpEventBookmarks');
    if (!el || !window.MiraiBoard || !MiraiBoard.listEventBookmarks) return;
    MiraiBoard.listEventBookmarks(user.uid).then((items) => {
      if (!items.length) {
        el.innerHTML = 'ブックマークはまだありません。掲示板の★から保存できます';
        return;
      }
      el.innerHTML =
        `${items.length}件をブックマーク中 · ` +
        `<a href="#/board/event/bookmarks" data-link id="mpEventBookmarksLink">ブックマーク一覧を見る</a>`;
    }).catch((e) => {
      console.error(e);
      el.textContent = '';
    });
  }

  function loadBoardSummaries(box, user) {
    if (!window.MiraiBoard) return;
    const eventSummary = box.querySelector('#mpEventSummary');
    const mysekaiSummary = box.querySelector('#mpMysekaiSummary');
    const eventStatus = box.querySelector('#mpEventStatus');
    const mysekaiStatus = box.querySelector('#mpMysekaiStatus');
    const eventListingAction = box.querySelector('#mpEventListingAction');
    const mysekaiListingAction = box.querySelector('#mpMysekaiListingAction');
    const eventBtn = box.querySelector('#mpEventBtn');
    const mysekaiBtn = box.querySelector('#mpMysekaiBtn');

    function refresh(ev, ms) {
      if (eventStatus) eventStatus.innerHTML = boardStatusHtml(boardPublishStatus(ev, 'eventName'));
      if (mysekaiStatus) mysekaiStatus.innerHTML = boardStatusHtml(boardPublishStatus(ms, 'title'));
      if (eventSummary) eventSummary.textContent = eventSummaryText(ev);
      if (mysekaiSummary) mysekaiSummary.textContent = mysekaiSummaryText(ms);
      if (eventBtn) eventBtn.textContent = (ev && ev.eventName) ? '編集する' : '作成する';
      if (mysekaiBtn) mysekaiBtn.textContent = (ms && ms.title) ? '編集する' : '作成する';
      if (eventListingAction) {
        if (ev && ev.eventName && ev.isPublished !== false && !MiraiBoard.isBoardPostListed(ev)) {
          wireMypageListingExtend(eventListingAction, 'boardEventAds', user.uid, () => {
            Promise.all([
              MiraiBoard.fetchOwnEventAd(user.uid),
              MiraiBoard.fetchOwnMysekai(user.uid),
            ]).then(([ev2, ms2]) => refresh(ev2, ms2)).catch((e) => console.error(e));
          });
        } else {
          eventListingAction.hidden = true;
          eventListingAction.innerHTML = '';
        }
      }
      if (mysekaiListingAction) {
        if (ms && ms.title && ms.isPublished !== false && !MiraiBoard.isBoardPostListed(ms)) {
          wireMypageListingExtend(mysekaiListingAction, 'boardMysekai', user.uid, () => {
            Promise.all([
              MiraiBoard.fetchOwnEventAd(user.uid),
              MiraiBoard.fetchOwnMysekai(user.uid),
            ]).then(([ev2, ms2]) => refresh(ev2, ms2)).catch((e) => console.error(e));
          });
        } else {
          mysekaiListingAction.hidden = true;
          mysekaiListingAction.innerHTML = '';
        }
      }
    }

    Promise.all([
      MiraiBoard.fetchOwnEventAd(user.uid),
      MiraiBoard.fetchOwnMysekai(user.uid),
    ]).then(([ev, ms]) => refresh(ev, ms)).catch((e) => console.error(e));
  }

  function loadEventSupportSummary(box, user) {
    const el = box.querySelector('#mpEventSupportSummary');
    if (!el || !window.MiraiEventSupport || !MiraiEventSupport.fetchArchiveCount) return;
    const max = MiraiEventSupport.MAX_ARCHIVES || 3;
    MiraiEventSupport.fetchArchiveCount(user.uid).then((count) => {
      if (count == null) {
        el.textContent = `イベント中のPtを記録してグラフ・プランを確認できます（最大${max}件）`;
        return;
      }
      el.textContent = count > 0
        ? `保管 ${count}/${max} 件 · イベント中のPtを記録してグラフ・プランを確認`
        : `イベント中のPtを記録してグラフ・プランを確認できます（最大${max}件）`;
    }).catch(() => {
      el.textContent = 'イベント中のPtを記録してグラフ・プランを確認できます';
    });
  }

  function loadRankingSummaries(box, user) {
    if (!window.MiraiRanking) return;
    const el = box.querySelector('#mpRankingSummary');
    const btn = box.querySelector('#mpRankingBtn');
    if (!el) return;
    Promise.all([
      MiraiRanking.fetchOwnEntry(user.uid, 'challenge_live'),
      MiraiRanking.fetchOwnEntry(user.uid, 'character_rank'),
    ]).then(([cl, cr]) => {
      const parts = [];
      if (cl) parts.push('チャレンジライブ: ' + MiraiRanking.summaryText(cl, 'challenge_live'));
      else parts.push('チャレンジライブ: 未登録');
      if (cr) parts.push('キャラランク: ' + MiraiRanking.summaryText(cr, 'character_rank'));
      else parts.push('キャラランク: 未登録');
      el.textContent = parts.join(' / ');
      if (btn) btn.textContent = (cl || cr) ? '登録・再申請' : 'ランキングに登録';
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

  function profileCardHtml(hub, rewards) {
    const theme = resolveCardTheme(hub, rewards);
    const vars = cardThemeStyleVars(theme);
    const displayTitles = rewards
      ? resolveProfileCardDisplayTitles(hub, rewards)
      : resolvePublicProfileCardDisplayTitles(hub);
    const titleBadges = displayTitles.map((t) =>
      '<span class="profile-card-meishi__title-badge">' + esc(t) + '</span>'
    ).join('');
    return (
      '<div class="profile-card-meishi" style="' + vars + '">' +
      '<div class="profile-card-meishi__accent" aria-hidden="true"></div>' +
      '<div class="profile-card-meishi__glow" aria-hidden="true"></div>' +
      '<div class="profile-card-meishi__inner">' +
      '<header class="profile-card-meishi__head">' +
      '<img src="img/icon.png" alt="" class="profile-card-meishi__logo" width="48" height="48" decoding="async" crossorigin="anonymous">' +
      '<div class="profile-card-meishi__head-text">' +
      '<span class="profile-card-meishi__site">未来喫茶</span>' +
      '<p class="profile-card-meishi__label">MEMBERS CARD</p>' +
      '</div></header>' +
      '<div class="profile-card-meishi__rule" aria-hidden="true"></div>' +
      '<div class="profile-card-meishi__foot">' +
      '<div class="profile-card-meishi__member">' +
      '<p class="profile-card-meishi__name">' + esc(hub.displayName || '未設定') + '</p>' +
      '<div class="profile-card-meishi__id-box">' +
      '<span class="profile-card-meishi__id-label">未来喫茶ID</span>' +
      '<span class="profile-card-meishi__id">' + esc(hub.publicId || '—') + '</span>' +
      '</div></div>' +
      (titleBadges
        ? '<div class="profile-card-meishi__titles" aria-label="称号">' + titleBadges + '</div>'
        : '<div class="profile-card-meishi__titles profile-card-meishi__titles--empty" aria-hidden="true"></div>') +
      '</div></div></div>'
    );
  }

  function refreshProfileCardPreview(box, hub, rewards) {
    const wrap = box.querySelector('#profileCardPreviewWrap');
    if (wrap) wrap.innerHTML = profileCardHtml(hub, rewards);
  }

  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-profile-card="html2canvas"]');
      if (existing) {
        existing.addEventListener('load', () => {
          window.html2canvas ? resolve(window.html2canvas) : reject(new Error('画像ライブラリの読み込みに失敗しました'));
        });
        existing.addEventListener('error', () => reject(new Error('画像ライブラリの読み込みに失敗しました')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.async = true;
      script.dataset.profileCard = 'html2canvas';
      script.onload = () => {
        window.html2canvas ? resolve(window.html2canvas) : reject(new Error('画像ライブラリの読み込みに失敗しました'));
      };
      script.onerror = () => reject(new Error('画像ライブラリの読み込みに失敗しました'));
      document.head.appendChild(script);
    });
  }

  function isMobileSaveDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.maxTouchPoints > 1 && window.matchMedia('(max-width: 900px)').matches);
  }

  async function deliverProfileCardBlob(blob, filename) {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'メンバーズカード' });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  async function saveProfileCardImage(previewWrap, publicId) {
    const sourceCard = previewWrap && previewWrap.querySelector('.profile-card-meishi');
    if (!sourceCard) throw new Error('カードが見つかりません');

    let stage = document.getElementById('profileCardExportStage');
    if (!stage) {
      stage = document.createElement('div');
      stage.id = 'profileCardExportStage';
      stage.className = 'profile-card-export-stage';
      document.body.appendChild(stage);
    }
    stage.innerHTML = '';
    const exportCard = sourceCard.cloneNode(true);
    exportCard.classList.add('profile-card-meishi--export');
    stage.appendChild(exportCard);

    const logo = exportCard.querySelector('.profile-card-meishi__logo');
    if (logo) {
      const src = logo.getAttribute('src') || 'img/icon.png';
      logo.src = new URL(src, location.href).href;
      logo.crossOrigin = 'anonymous';
      await new Promise((resolve) => {
        if (logo.complete) { resolve(); return; }
        logo.onload = () => resolve();
        logo.onerror = () => resolve();
      });
    }
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));

    const html2canvas = await loadHtml2Canvas();
    const { width: targetW, height: targetH } = profileCardExportPixelSize();
    const rect = exportCard.getBoundingClientRect();
    const scale = Math.max(targetW / Math.max(rect.width, 1), targetH / Math.max(rect.height, 1), 2);

    const canvas = await html2canvas(exportCard, {
      scale: scale,
      backgroundColor: null,
      useCORS: true,
      logging: false,
    });

    const out = document.createElement('canvas');
    out.width = targetW;
    out.height = targetH;
    const ctx = out.getContext('2d');
    if (!ctx) throw new Error('画像の生成に失敗しました');
    ctx.drawImage(canvas, 0, 0, targetW, targetH);

    const blob = await new Promise((resolve, reject) => {
      out.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('画像の生成に失敗しました'));
      }, 'image/png');
    });

    stage.innerHTML = '';
    const filename = 'members-card-' + (publicId || 'mirai-kissa') + '.png';
    await deliverProfileCardBlob(blob, filename);
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
    const rewards = await loadUserRewards(user.uid);
    const grantedTitles = resolveGrantedTitles(rewards);
    const unlockedSpecial = resolveUnlockedSpecialThemeKeys(rewards);
    const cardTheme = resolveEffectiveProfileCardThemeKey(hub, rewards);
    const displayTitles = resolveProfileCardDisplayTitles(hub, rewards);
    hub.profileCardDisplayTitles = displayTitles;

    const titlePickerHtml = grantedTitles.length
      ? '<section class="card profile-card-customize">' +
        '<h3 class="profile-card-customize__title">称号</h3>' +
        '<p class="form-hint">カード右下に表示する称号を選べます（最大' + MAX_PROFILE_CARD_DISPLAY_TITLES + 'つ）。「MEMBERS CARD」の表記は変わりません。</p>' +
        profileCardTitlePickerHtml(grantedTitles, displayTitles) +
        '<p id="profileCardTitleLimit" class="form-hint mt-2" hidden>称号は最大' + MAX_PROFILE_CARD_DISPLAY_TITLES + 'つまでです。</p>' +
        '<p id="profileCardTitleSaved" class="community-saved mt-2" hidden>称号を保存しました ✓</p>' +
        '</section>'
      : '';

    box.innerHTML = `
      <div class="profile-card-page">
        ${!hub.displayName ? '<div class="info-box mb-2"><p><a href="#/mypage/settings" data-link>マイページ設定</a>で表示名を設定してください。</p></div>' : ''}
        <p class="form-hint">名刺サイズ（91×55mm）のメンバーズカードです。カラーは選ぶと自動保存されます。</p>

        <section class="card profile-card-customize">
          <h3 class="profile-card-customize__title">カラー・デザイン</h3>
          <div class="profile-card-theme-picker">${profileCardThemePickerHtml(cardTheme, unlockedSpecial)}</div>
          <p class="form-hint mt-2">キャラクターカラーは全員が選べます。特殊カラーは管理者から付与されると表示されます。</p>
          <p id="profileCardThemeSaved" class="community-saved mt-2" hidden>カラー設定を保存しました ✓</p>
        </section>

        ${titlePickerHtml}

        <div class="profile-card-page__preview" id="profileCardPreviewWrap">
          ${profileCardHtml(hub, rewards)}
        </div>
        <div class="profile-card-page__actions">
          <button type="button" class="btn btn-primary" id="profileCardSave">画像を保存</button>
          <a href="#/mypage" class="btn btn-secondary" data-link>マイページに戻る</a>
        </div>
        <p id="profileCardError" class="form-error mt-2" hidden></p>
      </div>
    `;

    const saveBtn = box.querySelector('#profileCardSave');
    const errEl = box.querySelector('#profileCardError');
    const themeSavedEl = box.querySelector('#profileCardThemeSaved');
    let themeSaveTimer = null;

    async function persistCardSettings() {
      try {
        await saveHub(user.uid, hub);
        if (themeSavedEl) {
          themeSavedEl.hidden = false;
          clearTimeout(themeSaveTimer);
          themeSaveTimer = setTimeout(() => { themeSavedEl.hidden = true; }, 2200);
        }
      } catch (e) {
        errEl.textContent = e.message || String(e);
        errEl.hidden = false;
        throw e;
      }
    }

    box.querySelectorAll('.pc-theme-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = normalizeCardThemeKey(btn.dataset.theme);
        if (!isCharacterCardThemeKey(next) && !unlockedSpecial.includes(next)) return;
        hub.profileCardTheme = next;
        box.querySelectorAll('.pc-theme-swatch').forEach((b) => b.classList.toggle('is-active', b === btn));
        refreshProfileCardPreview(box, hub, rewards);
        persistCardSettings().catch((e) => console.error(e));
      });
    });

    const titleSavedEl = box.querySelector('#profileCardTitleSaved');
    const titleLimitEl = box.querySelector('#profileCardTitleLimit');
    let titleSaveTimer = null;

    function syncTitleCheckboxStates() {
      const checked = box.querySelectorAll('input[name="profileCardTitle"]:checked');
      const atMax = checked.length >= MAX_PROFILE_CARD_DISPLAY_TITLES;
      box.querySelectorAll('input[name="profileCardTitle"]').forEach((el) => {
        if (!el.checked) el.disabled = atMax;
      });
      if (titleLimitEl) titleLimitEl.hidden = !atMax;
    }

    function readSelectedDisplayTitles() {
      return [...box.querySelectorAll('input[name="profileCardTitle"]:checked')]
        .map((el) => el.value)
        .filter((t) => grantedTitles.includes(t))
        .slice(0, MAX_PROFILE_CARD_DISPLAY_TITLES);
    }

    box.querySelectorAll('input[name="profileCardTitle"]').forEach((el) => {
      el.addEventListener('change', () => {
        const selected = readSelectedDisplayTitles();
        if (el.checked && selected.length > MAX_PROFILE_CARD_DISPLAY_TITLES) {
          el.checked = false;
          if (titleLimitEl) titleLimitEl.hidden = false;
          return;
        }
        hub.profileCardDisplayTitles = selected;
        syncTitleCheckboxStates();
        refreshProfileCardPreview(box, hub, rewards);
        persistCardSettings().then(() => {
          if (titleSavedEl) {
            titleSavedEl.hidden = false;
            clearTimeout(titleSaveTimer);
            titleSaveTimer = setTimeout(() => { titleSavedEl.hidden = true; }, 2200);
          }
        }).catch((e) => console.error(e));
      });
    });
    syncTitleCheckboxStates();

    saveBtn.addEventListener('click', async () => {
      const mobile = isMobileSaveDevice();
      const msg = mobile ? 'カメラロールに保存しますか？' : '画像を保存しますか？';
      if (!confirm(msg)) return;
      errEl.hidden = true;
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
      try {
        const previewWrap = box.querySelector('#profileCardPreviewWrap');
        await saveProfileCardImage(previewWrap, hub.publicId);
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        errEl.textContent = e.message || String(e);
        errEl.hidden = false;
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '画像を保存';
      }
    });
  }

  // ================= 公開ページ =================

  function publicPageNeedsEmbeds(hub) {
    return !!(hub && hub.uid && (hub.pinEventAd || hub.pinMysekai) && window.MiraiBoard);
  }

  function renderPublicPage(box, hub, opts) {
    opts = opts || {};
    const viewer = opts.viewer || null;
    const showFriendBar = viewer && hub.uid && viewer.uid !== hub.uid && window.MiraiFriends;
    box.innerHTML =
      (showFriendBar ? '<div id="publicFriendBar" class="friend-action-bar card"></div>' : '') +
      '<div class="linkhub linkhub--full" style="' + themeStyle(hub.theme) + '">' +
      publicHtml(hub, { embedLoading: !!opts.embedLoading }) +
      '</div>';
    document.title = (hub.displayName || 'セカイノート') + ' — 未来喫茶';
    return showFriendBar;
  }

  async function wirePublicFriendBar(box, hub, viewer, isStale) {
    if (!window.MiraiFriends || !hub.uid) return;
    let activeViewer = viewer;
    if (activeViewer && window.MiraiFriends.ensureAuthReady) {
      activeViewer = await MiraiFriends.ensureAuthReady(activeViewer);
    }
    if (isStale()) return;
    if (!activeViewer || activeViewer.uid === hub.uid) return;

    let bar = box.querySelector('#publicFriendBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'publicFriendBar';
      bar.className = 'friend-action-bar card';
      box.insertBefore(bar, box.firstChild);
    }
    const frSource = window.MiraiFriends.parseFriendSourceFromHash
      ? MiraiFriends.parseFriendSourceFromHash()
      : 'profile';
    await MiraiFriends.renderActionButton(bar, activeViewer.uid, hub, {
      source: frSource,
      isRenderStale: isStale,
    });
  }

  async function loadPublicEmbeds(box, hub, viewer, isStale) {
    const root = box.querySelector('#publicEmbedRoot');
    if (!root || !window.MiraiBoard || typeof MiraiBoard.fetchSekaiEmbedPosts !== 'function') return;
    try {
      let viewerUid = viewer && viewer.uid;
      if (viewerUid && window.MiraiFriends && window.MiraiFriends.ensureAuthReady) {
        const readyViewer = await MiraiFriends.ensureAuthReady(viewer);
        viewerUid = readyViewer && readyViewer.uid;
      }
      if (isStale()) return;
      const embedOpts = await MiraiBoard.fetchSekaiEmbedPosts(hub.uid, viewerUid);
      if (isStale()) return;
      const html = boardEmbedsHtml(hub, embedOpts);
      if (html) root.outerHTML = html;
      else root.remove();
    } catch (e) {
      console.warn('[public] embed load failed:', e);
      if (isStale()) return;
      root.remove();
    }
  }

  async function loadPublicArchives(box, hub, isStale) {
    const root = box.querySelector('#publicArchivesRoot');
    if (!root || !hub || !hub.uid || !window.MiraiEventSupport || !MiraiEventSupport.listPublicArchives) return;
    try {
      const items = await MiraiEventSupport.listPublicArchives(hub.uid);
      if (isStale && isStale()) return;
      const html = MiraiEventSupport.publicArchivesHtml(items);
      if (html) root.outerHTML = html;
      else root.remove();
    } catch (e) {
      console.warn('[public] archive load failed:', e);
      if (isStale && isStale()) return;
      if (root.parentNode) root.remove();
    }
  }

  async function initPublic(params) {
    const root = document.getElementById('app');
    const box = root.querySelector('#publicProfileRoot');
    if (!box) return;
    const publicId = normalizePublicId(params && params.id);

    if (!(await isConfigured())) {
      box.innerHTML = '<div class="info-box"><p>このページ機能は準備中です。</p></div>';
      return;
    }

    let pageSeq = 0;
    let currentHub = null;

    async function renderPublic() {
      const seq = ++pageSeq;
      const isStale = () => seq !== pageSeq;

      box.innerHTML = '<p class="text-muted">読み込み中…</p>';
      try {
        const hub = await loadHubWithRetry(publicId, { isStale });
        if (isStale()) return;
        if (!hub) {
          currentHub = null;
          box.innerHTML = '<div class="info-box"><p>ページが見つかりませんでした。</p>' +
            '<p class="form-hint mt-1">相手がマイページを一度も開いていない、またはIDが間違っている可能性があります。</p>' +
            '<p class="mt-2"><a href="#/" class="btn btn-secondary" data-link>ホームへ</a></p></div>';
          return;
        }
        hub.headline = normalizeHeadline(hub.headline);
        currentHub = hub;

        const viewer = typeof MiraiAuth !== 'undefined' ? MiraiAuth.getUser() : null;
        const embedLoading = publicPageNeedsEmbeds(hub);
        const showFriendBar = renderPublicPage(box, hub, { viewer, embedLoading });

        if (showFriendBar) {
          wirePublicFriendBar(box, hub, viewer, isStale);
        }

        if (embedLoading) {
          loadPublicEmbeds(box, hub, viewer, isStale);
        }
        loadPublicArchives(box, hub, isStale);
      } catch (e) {
        if (isStale()) return;
        currentHub = null;
        const detail = e && e.message ? String(e.message) : String(e);
        box.innerHTML =
          '<div class="info-box"><p>読み込みに失敗しました。</p>' +
          '<p class="form-error mt-1">' + esc(detail) + '</p></div>';
        console.error(e);
      }
    }

    await renderPublic();

    if (window.MiraiAuth && typeof window.MiraiAuth.onChange === 'function') {
      window.MiraiAuth.onChange((user) => {
        const loading = box.querySelector('.text-muted');
        if (loading && loading.textContent.indexOf('読み込み中') >= 0) {
          renderPublic();
          return;
        }
        if (!user || !currentHub || !currentHub.uid || user.uid === currentHub.uid) return;
        if (!window.MiraiFriends) return;
        const seq = pageSeq;
        const isStale = () => seq !== pageSeq;
        wirePublicFriendBar(box, currentHub, user, isStale);
        if (publicPageNeedsEmbeds(currentHub)) {
          loadPublicEmbeds(box, currentHub, user, isStale);
        }
      });
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

  function boardEmbedsHtml(hub, opts) {
    opts = opts || {};
    const parts = [];
    if (hub.pinEventAd && opts.eventPost && window.MiraiBoard && MiraiBoard.eventSekaiEmbedHtml) {
      parts.push(MiraiBoard.eventSekaiEmbedHtml(opts.eventPost));
    }
    if (hub.pinMysekai && opts.mysekaiPost && window.MiraiBoard && MiraiBoard.mysekaiSekaiEmbedHtml) {
      parts.push(MiraiBoard.mysekaiSekaiEmbedHtml(opts.mysekaiPost));
    }
    if (!parts.length) return '';
    return '<section class="linkhub-embeds" aria-label="掲示板の引用">' + parts.join('') + '</section>';
  }

  function publicHtml(hub, opts) {
    opts = opts || {};
    const links = Array.isArray(hub.links) ? hub.links : [];
    const linksHtml = links.filter((l) => l && l.url).map((l) => {
      const emoji = l.emoji ? `<span class="linkhub-link__emoji">${esc(l.emoji)}</span>` : '';
      return `<a class="linkhub-link" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${emoji}<span>${esc(l.title || l.url)}</span></a>`;
    }).join('');

    const hasPins = !!(hub.pinEventAd || hub.pinMysekai);
    const embedsSection = boardEmbedsHtml(hub, opts);
    let embedBlock = embedsSection;
    if (!embedBlock && hasPins) {
      const loadingHint = opts.embedLoading
        ? '<p class="text-muted form-hint">掲示板の引用を読み込み中…</p>'
        : '';
      embedBlock = '<div id="publicEmbedRoot">' + loadingHint + '</div>';
    } else if (embedBlock && hasPins) {
      embedBlock = embedBlock.replace(
        '<section class="linkhub-embeds"',
        '<section id="publicEmbedRoot" class="linkhub-embeds"'
      );
    }
    const notesSection = notesHtml(hub, opts);
    const archivesBlock = '<div id="publicArchivesRoot"></div>';

    return `
      <div class="public-profile-card-wrap">
        ${profileCardHtml(hub, null)}
      </div>
      ${avatarHtml(hub)}
      <h1 class="linkhub-name">${esc(hub.displayName || '名無し')}</h1>
      ${hub.headline ? `<p class="linkhub-headline">${esc(hub.headline)}</p>` : ''}
      ${hub.bio ? `<p class="linkhub-bio">${esc(hub.bio)}</p>` : ''}
      ${embedBlock}
      <div class="linkhub-links">${linksHtml || '<p class="linkhub-empty">リンクはまだありません</p>'}</div>
      ${notesSection}
      ${archivesBlock}
    `;
  }

  return {
    initLogin,
    initMyPage,
    initSettings,
    initSekaiNoteEdit,
    initSekaiNoteRead,
    initProfileCard,
    initPublic,
    loadHub,
    loadUserRewards,
    saveUserRewards,
    getCardThemes: () => CARD_THEMES,
    getSpecialCardThemes: () => SPECIAL_CARD_THEMES,
    getAllCardThemes: () => allCardThemes(),
    getCardThemeGroups: () => CARD_THEME_GROUPS,
    getSpecialCardThemeGroups: () => SPECIAL_CARD_THEME_GROUPS,
    getDefaultUnlockedCardThemes: () => DEFAULT_UNLOCKED_CARD_THEMES.slice(),
    resolveUnlockedThemeKeys,
    resolveUnlockedSpecialThemeKeys,
    resolveEffectiveProfileCardThemeKey,
    resolveGrantedTitles,
    resolveProfileCardDisplayTitles,
    resolveProfileCardTitle,
    profileCardHtml,
    normalizeCardThemeKey,
    supportTeamsDetailHtml,
    supportTeamTypeLabel,
  };
})();

window.MiraiMyPage = MiraiMyPage;
