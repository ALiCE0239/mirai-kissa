/**
 * 未来喫茶 — 認証（X / Google ログイン）
 *
 * window.MiraiAuth として公開。
 * - Xログイン（Firebase の Twitter プロバイダ）
 * - ログイン状態に応じてナビ右上（☰ の左）の「ホーム / ログイン / マイページへ」を表示
 * - ログイン直後に X の @ID を取得して users/{uid}/sns に控えておく
 */
const MiraiAuth = (function () {
  'use strict';

  let fb = null;               // window.MiraiFirebase
  let currentUser = null;      // Firebase User | null
  let ready = false;
  const listeners = new Set();

  const XHANDLE_KEY = 'miraiKissaXHandle';
  const LOGIN_RETURN_KEY = 'miraiLoginReturn';

  function notify() {
    listeners.forEach((cb) => {
      try { cb(currentUser); } catch (e) { console.error(e); }
    });
    updateNav();
  }

  function updateNav() {
    updateNavAuth();
  }

  function updateNavAuth() {
    const btn = document.getElementById('navAuthBtn');
    if (!btn) return;
    if (currentUser) {
      btn.href = '#/mypage';
      btn.textContent = 'マイページへ';
      btn.className = 'nav-auth-btn nav-auth-btn--mypage';
    } else {
      btn.href = '#/login';
      btn.textContent = 'ログイン';
      btn.className = 'nav-auth-btn nav-auth-btn--login';
    }
  }

  function redirectToLogin(returnTo) {
    try {
      const dest = returnTo || location.hash || '#/';
      if (dest !== '#/login') sessionStorage.setItem(LOGIN_RETURN_KEY, dest);
    } catch (e) {}
    location.hash = '#/login';
  }

  function consumeLoginReturn(fallback) {
    const fbDefault = '#/mypage';
    try {
      const ret = sessionStorage.getItem(LOGIN_RETURN_KEY);
      sessionStorage.removeItem(LOGIN_RETURN_KEY);
      if (ret && ret !== '#/login') return ret;
    } catch (e) {}
    return fallback || fbDefault;
  }

  async function waitForUser(timeoutMs) {
    if (currentUser) return currentUser;
    if (!ready && window.MiraiFirebaseReady) await window.MiraiFirebaseReady;
    if (currentUser) return currentUser;
    return new Promise((resolve) => {
      let done = false;
      const cb = (u) => {
        if (done) return;
        done = true;
        listeners.delete(cb);
        resolve(u);
      };
      listeners.add(cb);
      setTimeout(() => {
        if (!done) {
          done = true;
          listeners.delete(cb);
          resolve(currentUser);
        }
      }, timeoutMs || 2500);
    });
  }

  async function requireUser(returnTo) {
    const user = await waitForUser();
    if (user) return user;
    redirectToLogin(returnTo || location.hash);
    return null;
  }

  async function init() {
    fb = await window.MiraiFirebaseReady;
    ready = true;

    if (!fb.configured) {
      updateNav();
      notify();
      return;
    }

    const { onAuthStateChanged, getRedirectResult, getAdditionalUserInfo } = fb.authFns;

    // リダイレクト方式のログインから戻ってきた場合の後処理
    try {
      const result = await getRedirectResult(fb.auth);
      if (result) await handleSignInResult(result, getAdditionalUserInfo);
    } catch (e) {
      console.warn('[auth] redirect result:', e);
    }

    onAuthStateChanged(fb.auth, (user) => {
      currentUser = user || null;
      notify();
    });
  }

  async function handleSignInResult(result, getAdditionalUserInfo) {
    try {
      const info = getAdditionalUserInfo ? getAdditionalUserInfo(result) : null;
      const username = info && info.username ? info.username : '';
      if (username) {
        try { localStorage.setItem(XHANDLE_KEY, username); } catch (e) {}
        // users/{uid}/sns/auth に X の @ID を控える（プロフィール初期値に使う）
        if (result.user) {
          const { doc, setDoc, serverTimestamp } = fb.dbFns;
          await setDoc(
            doc(fb.db, 'users', result.user.uid, 'sns', 'auth'),
            { xHandle: username, updatedAt: serverTimestamp() },
            { merge: true }
          );
        }
      }
    } catch (e) {
      console.warn('[auth] handleSignInResult:', e);
    }
  }

  function friendlyError(err) {
    const code = (err && err.code) || '';
    if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
      return 'ポップアップがブロックされました。もう一度お試しください。';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'ログインがキャンセルされました。';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'このログイン方法はまだ有効化されていません（Firebase の設定が必要です）。';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'このドメインは許可されていません。Firebase の「承認済みドメイン」に追加してください。';
    }
    return (err && err.message) || 'ログインに失敗しました。';
  }

  async function signInWith(providerFactory) {
    if (!fb || !fb.configured) {
      throw new Error('ログイン機能はまだ準備中です（Firebase 未設定）。');
    }
    const { signInWithPopup, signInWithRedirect, getAdditionalUserInfo } = fb.authFns;
    const provider = providerFactory();
    try {
      const result = await signInWithPopup(fb.auth, provider);
      await handleSignInResult(result, getAdditionalUserInfo);
      return result.user;
    } catch (err) {
      // モバイル等でポップアップが使えない場合はリダイレクトにフォールバック
      if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
        await signInWithRedirect(fb.auth, provider);
        return null;
      }
      throw new Error(friendlyError(err));
    }
  }

  return {
    init,
    isReady: () => ready,
    isConfigured: () => !!(fb && fb.configured),
    getUser: () => currentUser,
    redirectToLogin,
    consumeLoginReturn,
    waitForUser,
    requireUser,
    getFirebase: () => fb,
    getStoredXHandle: () => {
      try { return localStorage.getItem(XHANDLE_KEY) || ''; } catch (e) { return ''; }
    },
    onChange(cb) {
      listeners.add(cb);
      if (ready) { try { cb(currentUser); } catch (e) {} }
      return () => listeners.delete(cb);
    },
    signInWithX() {
      return signInWith(() => new fb.authFns.TwitterAuthProvider());
    },
    signInWithGoogle() {
      return signInWith(() => new fb.authFns.GoogleAuthProvider());
    },
    async signOut() {
      if (!fb || !fb.configured) return;
      await fb.authFns.signOut(fb.auth);
    },
  };
})();

window.MiraiAuth = MiraiAuth;
