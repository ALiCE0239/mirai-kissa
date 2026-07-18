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
  let initPromise = null;
  const listeners = new Set();

  const XHANDLE_KEY = 'miraiKissaXHandle';
  const LOGIN_RETURN_KEY = 'miraiLoginReturn';
  const AUTH_ERROR_KEY = 'miraiAuthError';
  const AUTH_REDIRECT_PENDING_KEY = 'miraiAuthRedirectPending';

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
    if (initPromise) return initPromise;
    initPromise = doInit();
    return initPromise;
  }

  async function whenReady() {
    return init();
  }

  async function doInit() {
    fb = await window.MiraiFirebaseReady;
    ready = true;

    if (!fb.configured) {
      updateNav();
      notify();
      return;
    }

    const { onAuthStateChanged, getRedirectResult, getAdditionalUserInfo } = fb.authFns;

    if (fb.auth.currentUser) {
      currentUser = fb.auth.currentUser;
    }

    onAuthStateChanged(fb.auth, (user) => {
      currentUser = user || null;
      notify();
    });

    let hadRedirectPending = false;
    try {
      hadRedirectPending = sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY) === '1';
    } catch (e) { /* ignore */ }

    // リダイレクト方式のログインから戻ってきた場合の後処理（ルーターより先に完了させる）
    try {
      const result = await getRedirectResult(fb.auth);
      if (result && result.user) {
        currentUser = result.user;
        await handleSignInResult(result, getAdditionalUserInfo);
        notify();
        if (hadRedirectPending) {
          sessionStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
          location.hash = consumeLoginReturn('#/mypage');
        }
      } else if (hadRedirectPending) {
        sessionStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
        if (!fb.auth.currentUser) {
          storeAuthError({
            code: 'auth/redirect-failed',
            message: 'redirect',
          });
          location.hash = '#/login';
        }
      }
    } catch (e) {
      console.warn('[auth] redirect result:', e);
      sessionStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
      storeAuthError(e);
      location.hash = '#/login';
    }

    if (!currentUser && fb.auth.currentUser) {
      currentUser = fb.auth.currentUser;
    }

    notify();
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

  function storeAuthError(err) {
    const msg = friendlyError(err);
    if (!msg) return;
    try { sessionStorage.setItem(AUTH_ERROR_KEY, msg); } catch (e) { /* ignore */ }
  }

  function consumeAuthError() {
    try {
      const msg = sessionStorage.getItem(AUTH_ERROR_KEY);
      sessionStorage.removeItem(AUTH_ERROR_KEY);
      return msg || '';
    } catch (e) {
      return '';
    }
  }

  function prefersRedirectAuth() {
    return /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent || '');
  }

  function friendlyError(err) {
    const code = (err && err.code) || '';
    const raw = (err && err.message) || '';
    if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
      return 'ポップアップがブロックされました。もう一度お試しください。';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'ログインがキャンセルされました。';
    }
    if (code === 'auth/operation-not-allowed') {
      return 'X ログインが Firebase で有効になっていません。Firebase Console → Authentication → Sign-in method → Twitter を ON にしてください。';
    }
    if (code === 'auth/unauthorized-domain') {
      return 'このドメインは許可されていません。Firebase の「承認済みドメイン」に 39cafe.fictionscale.jp を追加してください。';
    }
    if (code === 'auth/invalid-credential') {
      if (/403|callback|request token/i.test(raw)) {
        return 'X の Callback URL 設定が一致していない可能性があります。X Developer Portal の User authentication settings に次を登録してください: https://cafe-9d3b7.firebaseapp.com/__/auth/handler';
      }
      return 'X の API Key / Secret または Callback URL の設定を確認してください。Firebase には OAuth 1.0a の API Key と API Key Secret（Client ID ではない）を貼り、X 側の Callback URL は https://cafe-9d3b7.firebaseapp.com/__/auth/handler です。';
    }
    if (code === 'auth/internal-error') {
      return 'X ログインの設定エラーです。Firebase の Twitter 設定と X Developer Portal の Callback URL（https://cafe-9d3b7.firebaseapp.com/__/auth/handler）を確認してください。';
    }
    if (code === 'auth/account-exists-with-different-credential') {
      return 'この X アカウントは別のログイン方法（Google 等）ですでに登録されています。先に Google でログインし、マイページ設定から X を連携してください。';
    }
    if (code === 'auth/credential-already-in-use') {
      return 'この Google / X アカウントは、別の未来喫茶アカウントにすでに登録されています。元のアカウントでログインするか、別のアカウントをお試しください。';
    }
    if (code === 'auth/provider-already-linked') {
      return 'すでに連携済みです。';
    }
    if (code === 'auth/requires-recent-login') {
      return 'セキュリティのため、一度ログアウトしてから再度ログインしてから連携してください。';
    }
    if (raw) return raw;
    return 'ログインに失敗しました。';
  }

  function providerIds(user) {
    if (!user || !Array.isArray(user.providerData)) return new Set();
    return new Set(user.providerData.map((p) => p.providerId));
  }

  function hasProvider(user, providerId) {
    return providerIds(user).has(providerId);
  }

  async function linkWith(providerFactory) {
    if (!fb || !fb.configured) {
      throw new Error('ログイン機能はまだ準備中です（Firebase 未設定）。');
    }
    const user = currentUser;
    if (!user) {
      throw new Error('ログインしてから連携してください。');
    }
    const { linkWithPopup, linkWithRedirect, getAdditionalUserInfo } = fb.authFns;
    const provider = providerFactory();
    try {
      const result = await linkWithPopup(user, provider);
      await handleSignInResult(result, getAdditionalUserInfo);
      currentUser = result.user || fb.auth.currentUser;
      notify();
      return currentUser;
    } catch (err) {
      if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
        await linkWithRedirect(user, provider);
        return null;
      }
      throw new Error(friendlyError(err));
    }
  }

  async function signInWith(providerFactory, opts) {
    if (!fb || !fb.configured) {
      throw new Error('ログイン機能はまだ準備中です（Firebase 未設定）。');
    }
    const options = opts || {};
    const { signInWithPopup, signInWithRedirect, getAdditionalUserInfo } = fb.authFns;
    const provider = providerFactory();
    if (options.preferRedirect) {
      try {
        sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, '1');
        if (location.hash && location.hash !== '#/login') {
          sessionStorage.setItem(LOGIN_RETURN_KEY, location.hash);
        }
      } catch (e) { /* ignore */ }
      await signInWithRedirect(fb.auth, provider);
      return null;
    }
    try {
      const result = await signInWithPopup(fb.auth, provider);
      await handleSignInResult(result, getAdditionalUserInfo);
      return result.user;
    } catch (err) {
      // モバイル等でポップアップが使えない場合はリダイレクトにフォールバック
      if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
        try {
          sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, '1');
          if (location.hash && location.hash !== '#/login') {
            sessionStorage.setItem(LOGIN_RETURN_KEY, location.hash);
          }
        } catch (e) { /* ignore */ }
        await signInWithRedirect(fb.auth, provider);
        return null;
      }
      throw new Error(friendlyError(err));
    }
  }

  return {
    init,
    whenReady,
    isReady: () => ready,
    isConfigured: () => !!(fb && fb.configured),
    getUser: () => currentUser,
    redirectToLogin,
    consumeLoginReturn,
    consumeAuthError,
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
      // X（Twitter）はポップアップよりリダイレクトの方が安定
      return signInWith(
        () => new fb.authFns.TwitterAuthProvider(),
        { preferRedirect: true }
      );
    },
    signInWithGoogle() {
      return signInWith(() => new fb.authFns.GoogleAuthProvider());
    },
    linkWithX() {
      return linkWith(() => new fb.authFns.TwitterAuthProvider());
    },
    linkWithGoogle() {
      return linkWith(() => new fb.authFns.GoogleAuthProvider());
    },
    hasProvider(user, providerId) {
      return hasProvider(user || currentUser, providerId);
    },
    getLinkedProviders(user) {
      const u = user || currentUser;
      return {
        google: hasProvider(u, 'google.com'),
        twitter: hasProvider(u, 'twitter.com'),
      };
    },
    async signOut() {
      if (!fb || !fb.configured) return;
      await fb.authFns.signOut(fb.auth);
    },
  };
})();

window.MiraiAuth = MiraiAuth;
