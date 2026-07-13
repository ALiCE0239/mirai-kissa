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

  /**
   * '/p/:id' のようなパターンと実際のハッシュを照合。
   * 一致すれば { params } を返し、しなければ null。
   */
  matchPattern(pattern, hash) {
    if (!pattern.includes(':')) return null;
    const pp = pattern.split('/');
    const hp = hash.split('/');
    if (pp.length !== hp.length) return null;
    const params = {};
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) {
        if (!hp[i]) return null;
        params[pp[i].slice(1)] = decodeURIComponent(hp[i]);
      } else if (pp[i] !== hp[i]) {
        return null;
      }
    }
    return { params };
  }

  resolve() {
    const hash = location.hash.slice(1) || '/';

    let route = this.routes.get(hash);
    let params = {};
    let matchedKey = hash;

    if (!route) {
      for (const [path, r] of this.routes) {
        const m = this.matchPattern(path, hash);
        if (m) { route = r; params = m.params; matchedKey = path; break; }
      }
    }
    if (!route) { route = this.routes.get('404'); matchedKey = '404'; }

    if (!route) return;

    const app = document.getElementById('app');
    const template = document.getElementById(route.templateId);

    if (!template) return;

    app.innerHTML = '';
    const content = template.content.cloneNode(true);
    app.appendChild(content);

    this.currentRoute = hash;
    this.updateActiveLink(matchedKey);

    if (route.initFn) {
      Promise.resolve(route.initFn(params)).catch((err) => {
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
