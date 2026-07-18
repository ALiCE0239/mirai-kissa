/**
 * 未来喫茶 — Firebase Web SDK (v10 modular) 初期化
 *
 * ESM モジュールとして CDN から読み込み、初期化した各サービスと
 * よく使う関数を window.MiraiFirebase に公開する。
 * 非モジュールの既存スクリプトは window.MiraiFirebaseReady を await して使う。
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth,
  initializeAuth,
  browserLocalPersistence,
  indexedDBLocalPersistence,
  browserPopupRedirectResolver,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  signOut,
  getAdditionalUserInfo,
  TwitterAuthProvider,
  GoogleAuthProvider,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  getCountFromServer,
  increment,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

function isConfigured(cfg) {
  return !!(cfg && cfg.apiKey && !String(cfg.apiKey).startsWith('REPLACE'));
}

const cfg = window.MIRAI_FIREBASE_CONFIG;
let api;

if (!isConfigured(cfg)) {
  // 未設定でも読み込みは成功させ、UI 側で「準備中」を出す
  api = { configured: false };
} else {
  const app = initializeApp(cfg);
  let auth;
  try {
    auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch (e) {
    auth = getAuth(app);
  }
  const db = getFirestore(app);
  const storage = getStorage(app);

  api = {
    configured: true,
    app,
    auth,
    db,
    storage,
    authFns: {
      onAuthStateChanged,
      signInWithPopup,
      signInWithRedirect,
      getRedirectResult,
      linkWithPopup,
      linkWithRedirect,
      signOut,
      getAdditionalUserInfo,
      TwitterAuthProvider,
      GoogleAuthProvider,
    },
    dbFns: {
      doc,
      getDoc,
      setDoc,
      updateDoc,
      deleteDoc,
      collection,
      query,
      orderBy,
      limit,
      where,
      getDocs,
      getCountFromServer,
      increment,
      serverTimestamp,
      Timestamp,
    },
    storageFns: {
      ref: storageRef,
      uploadBytes,
      getDownloadURL,
    },
  };
}

window.MiraiFirebase = api;
if (typeof window.__miraiFirebaseResolve === 'function') {
  window.__miraiFirebaseResolve(api);
}
