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

  function initMobileMenu() {
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    if (!toggle || !links) return;
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    links.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') links.classList.remove('open');
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

  function initHome() {
    const toolsToggle = document.getElementById('homeToolsToggle');
    const toolsPanel = document.getElementById('homeToolsPanel');
    const iberanToggle = document.getElementById('homeIberanToggle');
    const iberanPanel = document.getElementById('homeIberanPanel');
    if (!toolsToggle || !toolsPanel) return;

    let iberanCtrl = null;
    if (iberanToggle && iberanPanel) {
      iberanCtrl = { panel: iberanPanel, toggle: iberanToggle, api: null };
    }

    const toolsApi = bindHomePanel(toolsToggle, toolsPanel, () => {
      if (iberanCtrl?.api?.isOpen()) iberanCtrl.api.forceClose();
    });

    if (iberanCtrl) {
      iberanCtrl.api = bindHomePanel(iberanCtrl.toggle, iberanCtrl.panel, () => {
        if (toolsApi?.isOpen()) toolsApi.forceClose();
      });
    }
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
      .add('404',       'tmpl-404',       null);

    router.onRouteChange = (hash) => {
      const titles = {
        '/':          '未来喫茶 — プロセカ計算機ツール集',
        '/amatsuyu':  'あまつゆ計算機 — 未来喫茶',
        '/event':     'イベントPt計算 — 未来喫茶',
        '/exec':      '実効値計算 — 未来喫茶',
        '/adjust':      'ポイント調整 — 未来喫茶',
        '/adjust-next': 'ポイント調整NEXT — 未来喫茶',
        '/kizuna':    'キズナ計算 — 未来喫茶',
        '/diagnosis': 'イベラン診断 — 未来喫茶',
      };
      document.title = titles[hash] || '未来喫茶';
    };

    router.start();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    createParticles();
    initNavScroll();
    initMobileMenu();
    if (typeof PjskEngine !== 'undefined') {
      if (PjskEngine.loadMultiplierData) await PjskEngine.loadMultiplierData();
      if (PjskEngine.initBorderData) PjskEngine.initBorderData();
    }
    initRouter();
  });
})();
