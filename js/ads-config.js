/**
 * Google AdSense 設定
 *
 * client      … 発行者ID（ca-pub-...）
 * placements  … 実際に表示する広告（ページを絞って配置）
 *   home … ホームの開いたところ（hero 直後）
 *   big  … bigPages のページに出す大きな広告（見出し直後）
 * bigPages    … 大きな広告を出すルート（#/ を除いたパス）
 * units       … 作成済みだが未配置のユニット（保管用。使うときは placements へ）
 *
 * 各広告は文字列(スロットID)= ディスプレイ広告(auto)、
 * もしくは { slot, format, layout, layoutKey } で形式を指定できます。
 */
window.MIRAI_ADS_CONFIG = {
  enabled: true,
  client: 'ca-pub-8136431649527522',
  placements: {
    home: '6463922836', // ホーム開いたところ：ディスプレイ広告
    big: {              // イベラン診断／ポイント調整NEXT：大きな広告（マルチプレックス）
      slot: '7202289430',
      format: 'autorelaxed',
    },
  },
  bigPages: ['/diagnosis', '/adjust-next'],
  // 作成済みだが今は未配置のユニット（保管）
  units: {
    inFeed: {           // インフィード広告
      slot: '1020024468',
      format: 'fluid',
      layoutKey: '-fb+5w+4e-db+86',
    },
    inArticle: {        // 記事内広告
      slot: '1992380695',
      format: 'fluid',
      layout: 'in-article',
    },
  },
};
