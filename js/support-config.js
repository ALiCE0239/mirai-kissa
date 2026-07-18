/**
 * 未来喫茶 — サイト支援（募金）設定
 *
 * OFUSE または Ko-fi 等でアカウントを作成し、支援ページの URL を url に設定してください。
 * url が空、または enabled が false のときはフッターリンクは非表示になります。
 *
 * 例:
 *   OFUSE:  https://ofuse.me/あなたのID
 *   Ko-fi:  https://ko-fi.com/あなたのID
 */
window.MIRAI_SUPPORT_CONFIG = {
  enabled: false,
  provider: 'ofuse', // 'ofuse' | 'kofi' | 'stripe' | 'custom'
  url: '', // ← 支援ページ URL（アカウント開設後に設定）
  label: '未来喫茶を支援する',
  footerLabel: 'サイトを支援する',
  message: 'サーバー代・ドメイン代など、未来喫茶の運営費の任意支援です。金額は自由に選べます。',
  note: '支援は任意です。ゲーム内アイテム等の提供や有償コンテンツの販売ではありません。広告（AdSense）とは別の仕組みです。',
};
