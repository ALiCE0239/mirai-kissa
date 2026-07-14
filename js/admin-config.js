/**
 * 管理者設定（クライアント側の表示制御用）
 *
 * Firestore の config/admins ドキュメントにも同じ UID を登録してください。
 * ルール上の書き込み権限は Firestore 側の uids リストで判定されます。
 */
window.MIRAI_ADMIN_CONFIG = {
  /** @type {string[]} Firebase Auth UID（Google ログイン後にコンソールで確認） */
  firebaseAdminUids: [],
};
