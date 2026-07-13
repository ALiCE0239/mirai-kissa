/**
 * Google AdSense 設定
 *
 * client … 発行者ID（ca-pub-...）
 * slots  … AdSense で広告ユニットを作成したら slot ID を入れる
 *          空のままでも、Console で「自動広告」を有効にすれば表示されます
 */
window.MIRAI_ADS_CONFIG = {
  enabled: true,
  client: 'ca-pub-3749566622644230',
  slots: {
    footer: '',   // フッター上（全ページ共通）
    content: '',  // 計算機ページの見出し下
  },
};
