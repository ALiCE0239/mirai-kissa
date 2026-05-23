/**
 * Simple hash-based SPA router for 未来喫茶
 */
class Router {
  constructor() {
    this.routes = new Map();
    this.currentRoute = null;
    this.onRouteChange = null;
    window.addEventListener('hashchange', () => this.resolve());
  }

  add(path, templateId, initFn) {
    this.routes.set(path, { templateId, initFn });
    return this;
  }

  resolve() {
    const hash = location.hash.slice(1) || '/';
    const route = this.routes.get(hash) || this.routes.get('404');

    if (!route) return;

    const app = document.getElementById('app');
    const template = document.getElementById(route.templateId);

    if (!template) return;

    app.innerHTML = '';
    const content = template.content.cloneNode(true);
    app.appendChild(content);

    this.currentRoute = hash;
    this.updateActiveLink(hash);

    if (route.initFn) {
      Promise.resolve(route.initFn()).catch((err) => {
        console.error('[未来喫茶] ページ初期化エラー:', err);
      });
    }

    if (typeof Calculators !== 'undefined') {
      Calculators.wireCalcButtons();
    }

    if (this.onRouteChange) {
      this.onRouteChange(hash);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  updateActiveLink(hash) {
    document.querySelectorAll('.nav-links a').forEach(link => {
      const href = link.getAttribute('href');
      if (href === '#' + hash) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }

  start() {
    if (!location.hash) {
      location.hash = '#/';
    }
    this.resolve();
  }
}
