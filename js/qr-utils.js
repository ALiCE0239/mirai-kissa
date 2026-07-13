/**
 * 未来喫茶 — QRコード描画（qrcodejs を遅延読込）
 */
const MiraiQr = (function () {
  'use strict';

  let loading = null;

  function loadScript() {
    if (typeof QRCode !== 'undefined') return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/qrcode.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('QRコードライブラリの読み込みに失敗しました。'));
      document.head.appendChild(s);
    });
    return loading;
  }

  /** @returns {Promise<boolean>} */
  async function render(container, text, size) {
    if (!container || !text) return false;
    await loadScript();
    container.innerHTML = '';
    /* global QRCode */
    new QRCode(container, {
      text: String(text),
      width: size || 128,
      height: size || 128,
      correctLevel: QRCode.CorrectLevel.M,
    });
    return true;
  }

  function publicPageUrl(publicId) {
    return location.origin + location.pathname + '#/p/' + publicId;
  }

  return { render, publicPageUrl, loadScript };
})();

window.MiraiQr = MiraiQr;
