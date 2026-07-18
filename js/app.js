/**
 * 未来喫茶 — Main Application
 */
(function () {
  'use strict';

  function createParticles() {
    const container = document.getElementById('bgEffects');
    if (!container) return;
    const colors = ['var(--brand-green-soft)', 'var(--brand-blue-soft)', 'var(--brand-teal)', 'var(--accent-cyan)'];
    for (let i = 0; i < 20; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      const size = Math.random() * 4 + 1;
      particle.style.cssText = `
        width: ${size}px; height: ${size}px;
        left: ${Math.random() * 100}%;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        animation-duration: ${Math.random() * 20 + 15}s;
        animation-delay: ${Math.random() * 15}s;
      `;
      container.appendChild(particle);
    }
  }

  function initNavScroll() {
    const nav = document.getElementById('nav');
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          nav.classList.toggle('scrolled', window.scrollY > 20);
          ticking = false;
        });
        ticking = true;
      }
    });
  }

  function bindHomePanel(toggle, panel, onOpen) {
    if (!toggle || !panel || toggle.dataset.bound === '1') return;
    toggle.dataset.bound = '1';

    const open = () => {
      if (onOpen) onOpen();
      panel.hidden = false;
      requestAnimationFrame(() => {
        panel.classList.add('is-open');
        toggle.setAttribute('aria-expanded', 'true');
      });
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    const forceClose = () => {
      panel.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      panel.hidden = true;
    };

    const close = () => {
      panel.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        panel.hidden = true;
      };
      panel.addEventListener('transitionend', (e) => {
        if (e.propertyName === 'grid-template-rows') finish();
      }, { once: true });
      setTimeout(finish, 500);
    };

    toggle.addEventListener('click', () => {
      if (panel.classList.contains('is-open')) close();
      else open();
    });

    return {
      open,
      close,
      forceClose,
      isOpen: () => panel.classList.contains('is-open'),
    };
  }

  function homeToolCard(opts) {
    return (
      '<a href="' + opts.href + '" class="tool-card tool-card--' + opts.variant + '" data-link style="--card-delay:' + opts.delay + '">' +
      '<span class="tool-card__stripe" aria-hidden="true"></span>' +
      '<div class="tool-card__main">' +
      '<h3>' + opts.title + '</h3><p>' + opts.desc + '</p></div></a>'
    );
  }

  function renderHomeCommunity() {
    const content = document.getElementById('homeCommunityContent');
    const lead = document.getElementById('homeCommunityLead');
    if (!content) return;

    const user = typeof MiraiAuth !== 'undefined' ? MiraiAuth.getUser() : null;

    if (lead) {
      lead.textContent = user
        ? '掲示板は閲覧のみ。投稿・編集はマイページから行えます'
        : '掲示板はログインなしで閲覧できます。セカイノートはIDで読み取れます';
    }

    content.innerHTML =
      '<div class="card-grid">' +
      homeToolCard({ href: '#/board/event', variant: 'board-event', title: 'イベラン広告', desc: '一緒に走る仲間・Discord募集を探す（閲覧のみ）', delay: '0ms' }) +
      homeToolCard({ href: '#/board/mysekai', variant: 'board-mysekai', title: 'マイセカイ宣伝', desc: 'みんなの百景を見る（閲覧のみ）', delay: '60ms' }) +
      homeToolCard({ href: '#/sekainote/read', variant: 'sekainote', title: 'セカイノート', desc: 'IDまたはQRコードで他の人のノートを読み取る', delay: '120ms' }) +
      '</div>';
  }

  function initHome() {
    const panels = [
      { toggle: document.getElementById('homeToolsToggle'), panel: document.getElementById('homeToolsPanel') },
      { toggle: document.getElementById('homeIberanToggle'), panel: document.getElementById('homeIberanPanel') },
      { toggle: document.getElementById('homeCommunityToggle'), panel: document.getElementById('homeCommunityPanel') },
      { toggle: document.getElementById('homeRankingToggle'), panel: document.getElementById('homeRankingPanel') },
    ].filter((p) => p.toggle && p.panel);

    const apis = [];
    panels.forEach(({ toggle, panel }, i) => {
      apis.push(bindHomePanel(toggle, panel, () => {
        apis.forEach((api, j) => {
          if (j !== i && api?.isOpen()) api.forceClose();
        });
        if (panel.id === 'homeCommunityPanel') renderHomeCommunity();
      }));
    });

    renderHomeCommunity();
    if (typeof MiraiAuth !== 'undefined') {
      MiraiAuth.onChange(() => {
        if (location.hash === '#/' || location.hash === '') renderHomeCommunity();
      });
    }
  }

  function guardCommunity(initFn) {
    return async (params) => {
      if (typeof MiraiAuth === 'undefined') return;
      const user = await MiraiAuth.requireUser(location.hash);
      if (!user) return;
      return initFn(params);
    };
  }

  function initRouter() {
    const router = new Router();

    router
      .add('/',         'tmpl-home',      () => initHome())
      .add('/amatsuyu', 'tmpl-amatsuyu',  () => Calculators.initAmatsuyu())
      .add('/event',    'tmpl-event',     () => Calculators.initEvent())
      .add('/exec',     'tmpl-exec',      () => Calculators.initExec())
      .add('/adjust',      'tmpl-adjust',      () => Calculators.initAdjust())
      .add('/adjust-next', 'tmpl-adjust-next', () => Calculators.initAdjustNext())
      .add('/kizuna',   'tmpl-kizuna',    () => Calculators.initKizuna())
      .add('/diagnosis','tmpl-diagnosis', () => Calculators.initDiagnosis())
      .add('/guides',   'tmpl-guides',    () => GuidesPage.init())
      .add('/support',  'tmpl-support',   () => MiraiSupport.initPage())
      .add('/admin',    'tmpl-admin',     () => AdminPage.init())
      .add('/login',    'tmpl-login',     () => MiraiMyPage.initLogin())
      .add('/mypage',   'tmpl-mypage',    () => guardCommunity(() => MiraiMyPage.initMyPage())())
      .add('/mypage/settings', 'tmpl-mypage-settings', () => guardCommunity(() => MiraiMyPage.initSettings())())
      .add('/mypage/friend-requests', 'tmpl-mypage-friend-requests', () => guardCommunity(() => MiraiFriends.initFriendRequestsPage())())
      .add('/mypage/friends', 'tmpl-mypage-friends', () => guardCommunity(() => MiraiFriends.initFriendsPage())())
      .add('/mypage/friend-settings', 'tmpl-mypage-friend-settings', () => guardCommunity(() => MiraiFriends.initFriendRequestSettingsPage())())
      .add('/mypage/sekainote', 'tmpl-mypage-sekainote', () => guardCommunity(() => MiraiMyPage.initSekaiNoteEdit())())
      .add('/mypage/profile-card', 'tmpl-profile-card', () => guardCommunity(() => MiraiMyPage.initProfileCard())())
      .add('/mypage/ranking', 'tmpl-ranking-hub', () => guardCommunity(() => MiraiRanking.initMypageHub())())
      .add('/mypage/ranking/:type', 'tmpl-ranking-edit', (params) => guardCommunity(() => MiraiRanking.initEdit(params))())
      .add('/ranking', 'tmpl-ranking', () => MiraiRanking.initHub())
      .add('/ranking/:type', 'tmpl-ranking', (params) => MiraiRanking.initView(params))
      .add('/sekainote/read', 'tmpl-sekainote-read', () => MiraiMyPage.initSekaiNoteRead())
      .add('/p/:id',    'tmpl-public',    (params) => MiraiMyPage.initPublic(params))
      .add('/board/event/bookmarks', 'tmpl-board-event-bookmarks', () => guardCommunity(() => MiraiBoard.initEventBookmarks())())
      .add('/board/event',       'tmpl-board-event',       () => MiraiBoard.initEventList())
      .add('/board/event/:uid',  'tmpl-board-event-detail', (params) => MiraiBoard.initEventDetail(params))
      .add('/board/event/edit',  'tmpl-board-event-edit',  () => guardCommunity(() => MiraiBoard.initEventEdit())())
      .add('/board/mysekai',     'tmpl-board-mysekai',     () => MiraiBoard.initMysekaiList())
      .add('/board/mysekai/:uid','tmpl-board-mysekai-detail', (params) => MiraiBoard.initMysekaiDetail(params))
      .add('/board/mysekai/edit','tmpl-board-mysekai-edit',() => guardCommunity(() => MiraiBoard.initMysekaiEdit())())
      .add('404',       'tmpl-404',       null);

    router.onRouteChange = (hash) => {
      if (typeof MiraiAnalytics !== 'undefined') MiraiAnalytics.trackPageView(hash);
      if (typeof MiraiAds !== 'undefined') MiraiAds.onRouteChange(hash);
      const titles = {
        '/':          '未来喫茶 — プロセカ計算機ツール集',
        '/amatsuyu':  'あまつゆ計算機 — 未来喫茶',
        '/event':     'イベントPt計算 — 未来喫茶',
        '/exec':      '実効値計算 — 未来喫茶',
        '/adjust':      'ポイント調整 — 未来喫茶',
        '/adjust-next': 'ポイント調整NEXT — 未来喫茶',
        '/kizuna':    'キズナ計算 — 未来喫茶',
        '/diagnosis': 'イベラン診断 — 未来喫茶',
        '/guides':    '攻略図書館 — 未来喫茶',
        '/support':   'サイトを支援する — 未来喫茶',
        '/admin':     '管理者 — 未来喫茶',
        '/login':     'ログイン — 未来喫茶',
        '/mypage':    'マイページ — 未来喫茶',
        '/mypage/settings': 'マイページ設定 — 未来喫茶',
        '/mypage/friend-requests': 'フレンド申請 — 未来喫茶',
        '/mypage/friends': 'フレンド一覧 — 未来喫茶',
        '/mypage/friend-settings': '拒否設定 — 未来喫茶',
        '/mypage/sekainote': 'セカイノートを編集 — 未来喫茶',
        '/mypage/profile-card': 'プロフィールカード — 未来喫茶',
        '/mypage/ranking': 'ランキング登録 — 未来喫茶',
        '/ranking': 'ランキング — 未来喫茶',
        '/sekainote/read': 'セカイノートを読み取る — 未来喫茶',
        '/board/event':        'イベラン広告 — 未来喫茶',
        '/board/event/bookmarks': 'ブックマーク一覧 — 未来喫茶',
        '/board/event/edit':   'イベラン広告を編集 — 未来喫茶',
        '/board/mysekai':      'マイセカイ宣伝 — 未来喫茶',
        '/board/mysekai/edit': 'マイセカイ宣伝を編集 — 未来喫茶',
      };
      document.title = titles[hash] || '未来喫茶';
    };

    router.start();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    createParticles();
    initNavScroll();
    if (typeof MiraiAuth !== 'undefined') {
      try {
        await MiraiAuth.init();
      } catch (err) {
        console.error('[未来喫茶] 認証初期化エラー:', err);
      }
    }
    initRouter();
    if (typeof PjskEngine !== 'undefined') {
      if (PjskEngine.loadMultiplierData) {
        PjskEngine.loadMultiplierData().catch(() => {});
      }
      if (PjskEngine.initBorderData) PjskEngine.initBorderData();
    }
    if (typeof MiraiAds !== 'undefined') MiraiAds.init();
    if (typeof MiraiSupport !== 'undefined') MiraiSupport.init();
  });
})();
