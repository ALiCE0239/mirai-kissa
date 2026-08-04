/**
 * Google AdSense 設定
 *
 * client … 発行者ID（ca-pub-...）
 * slots  … AdSense で広告ユニットを作成したら slot ID を入れる
 *          空のままでも、Console で「自動広告」を有効にすれば表示されます
 */
window.MIRAI_ADS_CONFIG = {
  enabled: true,
  client: 'ca-pub-8136431649527522',
  slots: {
    footer: '6463922836',  // フッター上（全ページ共通）／ユニット「未来喫茶ユニット」
    content: '',           // 計算機ページの見出し下（別ユニット作成後に設定）
  },
};
