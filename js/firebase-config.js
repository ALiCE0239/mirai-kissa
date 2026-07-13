/**
 * 未来喫茶 — Firebase Web 設定
 *
 * プロジェクト: cafe-9d3b7（Web専用・アプリ mikucafe とは別データ）
 *
 * この値は公開情報です（HTML に載る前提の値なので秘密ではありません）。
 * 書き込みの制御は Firestore / Storage のセキュリティルールで行っています。
 */
window.MIRAI_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAv4RlAbdWDdLVlpOJGc850XGNu4UDUmqc',
  authDomain: 'cafe-9d3b7.firebaseapp.com',
  projectId: 'cafe-9d3b7',
  storageBucket: 'cafe-9d3b7.firebasestorage.app',
  messagingSenderId: '352105424419',
  appId: '1:352105424419:web:7f06b2335aac8dea0cf396',
};

// firebase.js（module）より前に用意しておく待受プロミス。
// 非モジュールのスクリプト（auth.js など）はこれを await して使う。
window.MiraiFirebaseReady = new Promise((resolve) => {
  window.__miraiFirebaseResolve = resolve;
});
