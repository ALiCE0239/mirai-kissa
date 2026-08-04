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
    // 文字列 = ディスプレイ広告(auto)、オブジェクト = 形式指定(fluid など)
    footer: '6463922836',  // フッター上（全ページ共通）ディスプレイ広告
    content: {             // 計算機ページの見出し下（インフィード広告）
      slot: '1020024468',
      format: 'fluid',
      layoutKey: '-fb+5w+4e-db+86',
    },
  },
};
