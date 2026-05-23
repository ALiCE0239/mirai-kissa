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

  function initRouter() {
    const router = new Router();

    router
      .add('/',         'tmpl-home',      null)
      .add('/amatsuyu', 'tmpl-amatsuyu',  () => Calculators.initAmatsuyu())
      .add('/event',    'tmpl-event',     () => Calculators.initEvent())
      .add('/exec',     'tmpl-exec',      () => Calculators.initExec())
      .add('/adjust',   'tmpl-adjust',    () => Calculators.initAdjust())
      .add('/kizuna',   'tmpl-kizuna',    () => Calculators.initKizuna())
      .add('/diagnosis','tmpl-diagnosis', () => Calculators.initDiagnosis())
      .add('404',       'tmpl-404',       null);

    router.onRouteChange = (hash) => {
      const titles = {
        '/':          '未来喫茶 — プロセカ計算機ツール集',
        '/amatsuyu':  'あまつゆ計算機 — 未来喫茶',
        '/event':     'イベントPt計算 — 未来喫茶',
        '/exec':      '実効値計算 — 未来喫茶',
        '/adjust':    'ポイント調整 — 未来喫茶',
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
