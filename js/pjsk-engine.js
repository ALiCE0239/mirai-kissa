/**
 * 未来喫茶 — プロセカ計算エンジン
 * 倍率データ: data/炊き数倍率.txt（編集可能）
 */
const PjskEngine = {
  dataLoaded: false,
  dataLoadError: null,
  MULTIPLIER_DATA_URL: 'data/炊き数倍率.txt',
  borderDataLoaded: false,
  borderData: null,

  _SECTION_ALIASES: {
    'イベントP': 'event',
    EVENT_PT: 'event',
    event_pt: 'event',
    '報酬': 'reward',
    REWARD: 'reward',
    reward: 'reward',
    'キズナEXP': 'kizuna',
    KIZUNA_EXP: 'kizuna',
    kizuna_exp: 'kizuna',
  },

  async loadMultiplierData(url) {
    const path = url || this.MULTIPLIER_DATA_URL;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
    try {
      const res = await fetch(`${path}?v=${Date.now()}`, controller ? { signal: controller.signal } : {});
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      this.applyMultiplierText(await res.text());
      this.dataLoaded = true;
      this.dataLoadError = null;
      console.info('[未来喫茶] 倍率データを読み込みました:', path);
      return true;
    } catch (err) {
      if (timer) clearTimeout(timer);
      this.dataLoaded = false;
      this.dataLoadError = err.message;
      console.warn('[未来喫茶] 倍率データの読み込みに失敗。内蔵値を使用します:', err.message);
      return false;
    }
  },

  applyMultiplierText(text) {
    const parsed = { event: {}, reward: {}, kizuna: {} };
    let section = null;

    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const sectionMatch = trimmed.match(/^\[(.+)\]$/);
      if (sectionMatch) {
        section = this._SECTION_ALIASES[sectionMatch[1].trim()] || null;
        continue;
      }

      const kv = trimmed.match(/^(\d+)\s*[=:]\s*(\d+(?:\.\d+)?)\s*$/);
      if (!kv || !section) continue;

      const cook = parseInt(kv[1], 10);
      const value = parseFloat(kv[2]);
      if (isNaN(cook) || isNaN(value)) continue;
      parsed[section][cook] = value;
    }

    if (Object.keys(parsed.event).length > 0) {
      this.LB_EVENT_PT_MULTIPLIERS = parsed.event;
    }
    if (Object.keys(parsed.reward).length > 0) {
      this.LB_REWARD_MULTIPLIERS = parsed.reward;
    }
    // キズナEXPは 150×報酬倍率 で算出するため [キズナEXP] セクションは無視
  },
  cumulativeExp: [
    0, 7224, 14448, 21672, 28896, 36120, 64214, 92308, 120402, 180602,
    240802, 301002, 371236, 441470, 511704, 612036, 712368, 812700, 943132, 1073564,
    1203996, 1364530, 1525064, 1685598, 1896298, 2106998, 2317698, 2568532, 2819366, 3070200,
    3351134, 3632068, 3913002, 4214002, 4515002, 4816002, 5117002, 5418002, 5719002, 6020002,
    6321002, 6622002, 6923002, 7224002, 7525002, 7826002, 8127002, 8428002, 8729002, 9030002,
    9331002, 9632002, 9933002, 10234002, 10535002, 10836002, 11137002, 11438002, 11739002, 12040002,
    12341002, 12642002, 12943002, 13244002, 13545002, 13846002, 14147002, 14448002, 14749002, 15050002,
    15351002, 15652002, 15953002, 16254002, 16555002, 16856002, 17157002, 17458002, 17759002, 18060002,
    18361002, 18662002, 18963002, 19264002, 19565002, 19866002, 20167002, 20468002, 20769002, 21070002,
    21371002, 21672002, 21973002, 22274002, 22575002, 22876002, 23177002, 23478002, 23779002, 24080002,
    24381002, 24682002, 24983002, 25284002, 25585002, 25886002, 26187002, 26488002, 26789002, 27090002,
    27391002, 27692002, 27993002, 28294002, 28595002, 28896002, 29197002, 29498002, 29799002, 30100002,
    30401002, 30702002, 31003002, 31304002, 31605002,
  ],

  /** キズナ: 0炊きあたりの基礎EXP（×報酬倍率で増加） */
  KIZUNA_EXP_BASE: 150,

  /**
   * イベントポイント倍率 — 既定値（data/炊き数倍率.txt の [イベントP] で上書き）
   */
  LB_EVENT_PT_MULTIPLIERS: {
    0: 1, 1: 5, 2: 10, 3: 15, 4: 20, 5: 25, 6: 27, 7: 29, 8: 31, 9: 33, 10: 35,
  },

  /**
   * 報酬・ドロップ倍率 — 既定値（data/炊き数倍率.txt の [報酬] で上書き）
   */
  LB_REWARD_MULTIPLIERS: {
    0: 1, 1: 5, 2: 10, 3: 15, 4: 20, 5: 25, 6: 26, 7: 27, 8: 28, 9: 29, 10: 30,
  },

  /** @deprecated LB_EVENT_PT_MULTIPLIERS を使用 */
  get TAKI_MULTIPLIERS() {
    return this.LB_EVENT_PT_MULTIPLIERS;
  },

  lbEventPtMul(cook) {
    const c = Math.max(0, Math.min(10, Math.floor(cook)));
    return this.LB_EVENT_PT_MULTIPLIERS[c] ?? 1;
  },

  lbRewardMul(cook) {
    const c = Math.max(0, Math.min(10, Math.floor(cook)));
    return this.LB_REWARD_MULTIPLIERS[c] ?? 1;
  },

  /** 1プレイEXP = 150 × 報酬倍率（0炊き=150） */
  kizunaExpPerPlay(cook) {
    const c = Math.max(0, Math.min(10, Math.floor(cook)));
    return Math.round(this.KIZUNA_EXP_BASE * this.lbRewardMul(c));
  },
  SCORE_BAND_WIDTH: 20000,
  SCORE_BAND_COUNT: 125,
  BONUS_MIN: 0,
  BONUS_MAX: 1040,
  ENVY_RUNS_PER_HOUR: 28,

  /** 目標順位 → js/border-rankings-data.js のシート（EMBEDDED_BORDER_DATA） */
  TARGET_RANK_PRESETS: [
    { id: 10, label: 'TOP 10', sheetKey: '10' },
    { id: 50, label: 'TOP 50', sheetKey: '50' },
    { id: 100, label: 'TOP 100', sheetKey: '100' },
    { id: 500, label: 'TOP 500', sheetKey: '500' },
    { id: 1000, label: 'TOP 1000', sheetKey: '1000' },
    { id: 5000, label: 'TOP 5000', sheetKey: '5000' },
  ],

  /** あまつゆ周回 — 報酬倍率表を使用 */
  cookMultiplier(cook) {
    return this.lbRewardMul(cook);
  },

  // --- あまつゆ計算機 ---
  calcAmatsuyu({ targetFlowers, hasNewBD, hasOldBD1, hasOldBD2, hasOldBD3, hasOldBD4, selectedCook }) {
    const clampedTarget = Math.max(0, Math.min(targetFlowers, 400));
    const needPt = clampedTarget * 10000;
    const oldCount = [hasOldBD1, hasOldBD2, hasOldBD3, hasOldBD4].filter(Boolean).length;
    const bonusRate = (hasNewBD ? 0.5 : 0) + 0.15 * oldCount;
    const ptPerDrop = Math.ceil(100 * (1 + bonusRate));
    const needDrops = ptPerDrop > 0 ? Math.ceil(needPt / ptPerDrop) : 0;

    const dropsPerFutaba = 42;
    const lbSmallPerFutaba = 2.5;
    const crystalPerLiveBoost = 10;

    const needFutaba = dropsPerFutaba > 0 ? Math.ceil(needDrops / dropsPerFutaba) : 0;
    const needLBsmallMySekai = needFutaba * lbSmallPerFutaba;
    const needCrystalMySekai = Math.ceil(needLBsmallMySekai) * crystalPerLiveBoost;

    const selectedMultiplier = this.cookMultiplier(selectedCook);
    const dropsPerRun = 1 * selectedMultiplier;
    const needRunsLive = dropsPerRun > 0 ? Math.ceil(needDrops / dropsPerRun) : 0;
    const needLiveBoost = needRunsLive * selectedCook;
    const needCrystalLive = needLiveBoost * crystalPerLiveBoost;

    return {
      needPt, needDrops, ptPerDrop, bonusRate,
      needRunsLive, dropsPerRun, needLiveBoost, needCrystalLive,
      needFutaba, needLBsmallMySekai, needCrystalMySekai,
    };
  },

  // --- イベントPt計算 ---
  /**
   * イベントPt計算
   * 残りPt = 目標Pt − 現在Pt
   * 必要周回数 = ceil(残りPt ÷ 1周あたりPt)
   * 必要クリスタル = 炊き数 × 10 × 必要周回数
   * 周回時間(h) = 必要周回数 ÷ 30
   */
  calcEventPt({ targetPt, currentPt, ptPerRun, lbPerRun }) {
    const remainingPt = Math.max(targetPt - currentPt, 0);
    const runs = ptPerRun > 0 ? Math.ceil(remainingPt / ptPerRun) : 0;
    const crystals = lbPerRun * 10 * runs;
    const hours = runs / 30;
    return { targetPt, currentPt, ptPerRun, lbPerRun, remainingPt, runs, crystals, hours };
  },

  // --- 実効値（実行値）計算 ---
  calcExecValue({ leader, sub1, sub2, sub3, sub4 }) {
    const subTotal = sub1 + sub2 + sub3 + sub4;
    const internalValue = leader + subTotal;
    const execValue = leader + 0.2 * subTotal;
    return { subTotal, internalValue, execValue };
  },

  // --- ポイント調整（ひとりでライブ・独りんぼエンヴィー・基礎点100固定）---
  SOLO_LIVE_KISO: 100,

  /** ※1 スコア帯番号 r = floor(スコア / 20000) */
  soloLiveScoreBand(score) {
    return Math.floor(score / this.SCORE_BAND_WIDTH);
  },

  /** (100 + r) × (100 + B%) / 100 を小数第2位以下切捨て（小数1桁）。基礎点は炊き前EPのみ反映 */
  soloLivePointStep2(scoreBand, bonusPct) {
    const raw = (this.SOLO_LIVE_KISO + scoreBand) * (100 + bonusPct) / 100;
    return Math.floor(raw * 10) / 10;
  },

  /** 炊き前イベントP = floor(中間値 × 基礎点 / 100) */
  soloLiveEpBeforeCook(scoreBand, bonusPct, kiso = this.SOLO_LIVE_KISO) {
    const v = this.soloLivePointStep2(scoreBand, bonusPct);
    return Math.floor((v * kiso) / 100);
  },

  /** 獲得Pt = 炊き前EP × [イベントP]倍率 */
  soloLiveTotalPoint(scoreBand, bonusPct, taki, kiso = this.SOLO_LIVE_KISO) {
    return this.soloLiveEpBeforeCook(scoreBand, bonusPct, kiso) * this.lbEventPtMul(taki);
  },

  bandBounds(r) {
    const low = r * this.SCORE_BAND_WIDTH;
    return { low, high: low + (this.SCORE_BAND_WIDTH - 1) };
  },

  findExactMatches(target, filterTaki, filterBonusMin, filterBonusMax, bonusStep = 1, kiso = this.SOLO_LIVE_KISO) {
    const out = [];
    const k = Math.floor(Number(kiso));
    if (!Number.isFinite(k) || k < 1) return out;

    const bMin = Math.max(this.BONUS_MIN, filterBonusMin);
    const bMax = Math.min(this.BONUS_MAX, filterBonusMax);
    const step = bonusStep > 1 ? Math.floor(bonusStep) : 1;
    let bStart = bMin;
    if (step > 1) {
      bStart = Math.ceil(bMin / step) * step;
      if (bStart > bMax) return out;
    }

    for (let r = 0; r < this.SCORE_BAND_COUNT; r++) {
      for (let b100 = bStart; b100 <= bMax; b100 += step) {
        const step2 = this.soloLivePointStep2(r, b100, k);
        const ep = this.soloLiveEpBeforeCook(r, b100, k);
        for (const [takiStr, mul] of Object.entries(this.LB_EVENT_PT_MULTIPLIERS)) {
          const taki = parseInt(takiStr, 10);
          if (filterTaki && !filterTaki.has(taki)) continue;
          const total = ep * mul;
          if (total === target) {
            const band = this.bandBounds(r);
            out.push({
              kiso: k,
              scoreLow: band.low, scoreHigh: band.high,
              bonusHundred: b100, taki,
              step2Value: step2, epBeforeCook: ep,
              multiplier: mul, totalPoint: total,
            });
          }
        }
      }
    }

    return out.sort((a, b) => {
      if (a.taki !== b.taki) return a.taki - b.taki;
      if (a.bonusHundred !== b.bonusHundred) return a.bonusHundred - b.bonusHundred;
      if (a.scoreLow !== b.scoreLow) return a.scoreLow - b.scoreLow;
      return a.epBeforeCook - b.epBeforeCook;
    });
  },

  // --- キズナ計算 ---
  cumExp(level) {
    const maxUi = Math.min(125, this.cumulativeExp.length);
    const idx = Math.min(Math.max(level, 1), maxUi) - 1;
    return this.cumulativeExp[idx];
  },

  calcKizuna({ currentLevel, targetLevel, takisu }) {
    if (currentLevel >= targetLevel) {
      return { alreadyReached: true };
    }
    const need = Math.max(0, this.cumExp(targetLevel) - this.cumExp(currentLevel));
    const rewardMul = this.lbRewardMul(takisu);
    const per = this.kizunaExpPerPlay(takisu);
    const plays = per > 0 ? Math.ceil(need / per) : 0;
    const crystals = takisu * 10 * plays;
    return {
      alreadyReached: false, need, per, plays, crystals, takisu,
      rewardMul, expBase: this.KIZUNA_EXP_BASE,
    };
  },

  /** 内蔵ボーダーデータ（border-rankings-data.js）を適用 */
  initBorderData() {
    if (typeof EMBEDDED_BORDER_DATA === 'undefined') {
      this.borderData = null;
      this.borderDataLoaded = false;
      console.error('[未来喫茶] EMBEDDED_BORDER_DATA がありません。border-rankings-data.js を読み込んでください。');
      return false;
    }
    this.borderData = EMBEDDED_BORDER_DATA;
    this.borderDataLoaded = true;
    return true;
  },

  ensureBorderData() {
    if (this.borderDataLoaded && this.borderData?.ranks) return true;
    return this.initBorderData();
  },

  /** バナーキャラクター表示順（イベラン診断プルダウン） */
  BANNER_DISPLAY_ORDER: [
    '一歌', '咲希', '穂波', '志歩', 'みのり', '遥', '愛莉', '雫', 'こはね', '杏',
    '彰人', '冬弥', '司', 'えむ', '寧々', '類', '奏', 'まふゆ', '絵名', '瑞希',
  ],

  /** イベラン診断のバナー選択肢から除外するミク混合バナー */
  BANNER_EXCLUDE: ['ダショミク', 'ニーゴミク', 'ビビミク'],

  sortBannerList(banners) {
    const orderIndex = new Map(this.BANNER_DISPLAY_ORDER.map((name, i) => [name, i]));
    return [...banners].sort((a, b) => {
      const ia = orderIndex.has(a) ? orderIndex.get(a) : 999;
      const ib = orderIndex.has(b) ? orderIndex.get(b) : 999;
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b, 'ja');
    });
  },

  getBorderFilterList(filterType) {
    const key = filterType === 'unit' ? 'units' : 'banners';
    const list = this.borderData?.[key] ?? [];
    if (filterType === 'banner') {
      const filtered = list.filter((name) => !this.BANNER_EXCLUDE.includes(name));
      return this.sortBannerList(filtered);
    }
    return list;
  },

  formatPtLabel(pt) {
    const n = Math.round(pt);
    if (n >= 100000000) {
      const oku = n / 100000000;
      const text = oku % 1 === 0 ? String(oku) : oku.toFixed(1).replace(/\.0$/, '');
      return `約${text}億Pt`;
    }
    if (n >= 10000) return `約${Math.round(n / 10000)}万Pt`;
    return `${fmtNum(n)} Pt`;
  },

  /**
   * 参考データから推定目標Pt（一致イベントのポイント上位5件の平均）
   * @param {'banner'|'unit'} filterType
   */
  estimateBorderTargetPt(sheetKey, filterType, filterValue) {
    if (!this.borderData?.ranks?.[sheetKey]) {
      return { ok: false, error: 'ボーダーデータが読み込まれていません' };
    }
    const field = filterType === 'unit' ? 'unit' : 'banner';
    const value = String(filterValue || '').trim();
    if (!value) {
      return { ok: false, error: 'バナーまたはユニットを選択してください' };
    }

    const matched = this.borderData.ranks[sheetKey]
      .filter((row) => row[field] === value)
      .sort((a, b) => b.points - a.points);

    if (matched.length === 0) {
      return {
        ok: false,
        error: `${value} に一致するイベントが ${sheetKey}位データにありません`,
        filterType,
        filterValue: value,
        sheetKey,
      };
    }

    const top = matched.slice(0, 5);
    const sum = top.reduce((acc, row) => acc + row.points, 0);
    const estimatedPt = Math.round(sum / top.length);

    return {
      ok: true,
      estimatedPt,
      ptLabel: this.formatPtLabel(estimatedPt),
      filterType,
      filterValue: value,
      sheetKey,
      matchCount: matched.length,
      sampleCount: top.length,
      topSamples: top,
    };
  },

  // --- イベラン診断 ---
  estimateEnvyScore(sougouryoku, jikkochiPct) {
    const s = sougouryoku;
    const j = jikkochiPct;
    const kisoCoeff = 4.34;
    const skillCov = 0.402;
    const comboFever = 1.110;
    const katsuyaku = 0.375;
    const kiso = s * kisoCoeff;
    const skillMul = 1.0 + (j / 100) * skillCov;
    return kiso * skillMul * comboFever + s * katsuyaku;
  },

  envyEventPtBase(sougouryoku, jikkochiPct, bonusPct) {
    const score = this.estimateEnvyScore(sougouryoku, jikkochiPct);
    const selfSB = Math.floor(score / 17000);
    const otherSB = 13;
    const base = 110 + selfSB + otherSB;
    const bonusMul = (100 + bonusPct) / 100;
    const step1 = Math.floor(base * bonusMul * 10) / 10;
    return Math.floor(step1);
  },

  /** 1周あたりのクリスタル消費（炊き数×10） */
  crystalsPerRun(cook) {
    const c = Math.max(0, Math.min(10, Math.floor(cook)));
    return c * 10;
  },

  requiredRunsForPt(targetPt, ptPerRun) {
    return ptPerRun > 0 ? Math.ceil(targetPt / ptPerRun) : 0;
  },

  /**
   * 余裕率（(獲得可能Pt−目標Pt)/目標Pt）のランク閾値
   * C … -5%〜+5%（0%付近±5%以内）。+5%超〜B未満も従来どおり C
   * D … -5%未満
   */
  DIAGNOSIS_MARGIN_THRESHOLDS: { S: 0.50, A: 0.30, B: 0.15, C: -0.05, C_MAX: 0.05 },

  diagnosisRankFromMargin(marginRatio) {
    const t = this.DIAGNOSIS_MARGIN_THRESHOLDS;
    if (marginRatio < t.C) return 'D';
    if (marginRatio >= t.S) return 'S';
    if (marginRatio >= t.A) return 'A';
    if (marginRatio >= t.B) return 'B';
    if (marginRatio <= t.C_MAX) return 'C';
    if (marginRatio < t.B) return 'C';
    return 'C';
  },

  _packDiagnosisPlan(runs5, runs10, pt5, pt10, rph, cost5, cost10, extra = {}) {
    const totalRuns = runs5 + runs10;
    return {
      runs5,
      runs10,
      totalRuns,
      needCrystals: runs5 * cost5 + runs10 * cost10,
      needHours: totalRuns / rph,
      plannedPt: runs5 * pt5 + runs10 * pt10,
      cost5,
      cost10,
      ...extra,
    };
  },

  /**
   * 5炊きのみで目標に届く理想周回数（リソース上限なし・参考用）。
   */
  planDiagnosisRunsIdeal(targetPt, pt5, pt10) {
    const rph = this.ENVY_RUNS_PER_HOUR;
    const cost5 = this.crystalsPerRun(5);
    const cost10 = this.crystalsPerRun(10);
    let runs5 = 0;
    let runs10 = 0;

    if (targetPt > 0) {
      if (pt5 > 0) {
        runs5 = Math.ceil(targetPt / pt5);
      } else if (pt10 > 0) {
        runs10 = Math.ceil(targetPt / pt10);
      }
    }

    return this._packDiagnosisPlan(runs5, runs10, pt5, pt10, rph, cost5, cost10);
  },

  _diagnosisPlanFitsResources(plan, hours, crystals) {
    return plan.needHours <= hours + 1e-9
      && plan.needCrystals <= crystals + 1e-9;
  },

  _diagnosisTimeUtilPct(plan, hours) {
    return hours > 0 ? (plan.needHours / hours) * 100 : 999;
  },

  /**
   * 5炊き優先で目標Ptに届くプラン（時間が溢れない場合のみ採用）。
   */
  _diagnosisFivePriorityPlan(targetPt, pt5, pt10, maxSlots, crystals, rph, cost5, cost10) {
    if (targetPt <= 0) {
      return this._packDiagnosisPlan(0, 0, pt5, pt10, rph, cost5, cost10);
    }

    let runs5 = 0;
    let runs10 = 0;

    if (pt5 > 0) {
      const need5 = Math.ceil(targetPt / pt5);
      const maxRuns5 = Math.min(
        maxSlots,
        cost5 > 0 ? Math.floor(crystals / cost5) : 0,
      );
      runs5 = Math.min(need5, maxRuns5);
      const remPt = Math.max(0, targetPt - runs5 * pt5);
      if (remPt > 0 && pt10 > 0) {
        runs10 = Math.ceil(remPt / pt10);
      }
    } else if (pt10 > 0) {
      runs10 = Math.ceil(targetPt / pt10);
    }

    const plan = this._packDiagnosisPlan(runs5, runs10, pt5, pt10, rph, cost5, cost10);
    if (plan.plannedPt < targetPt || plan.totalRuns > maxSlots) return null;
    if (plan.needCrystals > crystals) return null;
    return plan;
  },

  /**
   * 5炊きのみ想定で時間が溢れるとき、時間稼働率95〜100%になるよう5/10を調整。
   * 該当プランがなければ null（判定D）。
   */
  _diagnosisRebalanceForTime(targetPt, pt5, pt10, hours, maxSlots, crystals, rph, cost5, cost10) {
    const slotMin = Math.ceil(maxSlots * 0.95);
    const maxR10 = Math.min(
      maxSlots,
      cost10 > 0 ? Math.floor(crystals / cost10) : 0,
    );

    let best = null;

    for (let runs10 = 0; runs10 <= maxR10; runs10 += 1) {
      const ptFrom10 = runs10 * pt10;
      const remPt = targetPt - ptFrom10;
      const runs5 = remPt <= 0 ? 0 : (pt5 > 0 ? Math.ceil(remPt / pt5) : 0);
      const totalRuns = runs5 + runs10;
      if (totalRuns > maxSlots || totalRuns < slotMin) continue;

      const needCrystals = runs5 * cost5 + runs10 * cost10;
      if (needCrystals > crystals) continue;

      const plannedPt = runs5 * pt5 + runs10 * pt10;
      if (plannedPt < targetPt) continue;

      const cand = this._packDiagnosisPlan(runs5, runs10, pt5, pt10, rph, cost5, cost10);
      const timeUtil = this._diagnosisTimeUtilPct(cand, hours);
      if (timeUtil < 95 || timeUtil > 100.0001) continue;

      if (
        !best
        || runs5 > best.runs5
        || (runs5 === best.runs5 && runs10 < best.runs10)
      ) {
        best = cand;
      }
    }

    return best;
  },

  /**
   * 時間が溢れない限り5炊き優先。
   * 5炊きのみで時間が溢れる場合は稼働率95〜100%になるよう10炊きを増やす。
   * 調整後も時間・クリスタルが100%超なら null（D）。
   */
  diagnosisFeasiblePlan(targetPt, pt5, pt10, availableHours, availableCrystals) {
    const rph = this.ENVY_RUNS_PER_HOUR;
    const hours = Math.max(0, availableHours);
    const crystals = Math.max(0, availableCrystals);
    const maxSlots = Math.floor(hours * rph);
    const cost5 = this.crystalsPerRun(5);
    const cost10 = this.crystalsPerRun(10);

    if (targetPt <= 0) {
      return this._packDiagnosisPlan(0, 0, pt5, pt10, rph, cost5, cost10, { withinResources: true });
    }

    const ideal5 = this.planDiagnosisRunsIdeal(targetPt, pt5, pt10);
    const fivePlan = this._diagnosisFivePriorityPlan(
      targetPt, pt5, pt10, maxSlots, crystals, rph, cost5, cost10,
    );

    if (fivePlan && this._diagnosisPlanFitsResources(fivePlan, hours, crystals)) {
      const timeUtil = this._diagnosisTimeUtilPct(fivePlan, hours);
      if (timeUtil <= 100.0001) {
        return { ...fivePlan, withinResources: true, rebalanced: false };
      }
    }

    const fiveOnlyOverflow = hours > 0
      && ideal5.runs10 === 0
      && ideal5.needHours > hours + 1e-9;
    if (!fiveOnlyOverflow) {
      return null;
    }

    const rebalanced = this._diagnosisRebalanceForTime(
      targetPt, pt5, pt10, hours, maxSlots, crystals, rph, cost5, cost10,
    );
    if (!rebalanced || !this._diagnosisPlanFitsResources(rebalanced, hours, crystals)) {
      return null;
    }

    const timeUtil = this._diagnosisTimeUtilPct(rebalanced, hours);
    const crystalUtil = crystals > 0 ? (rebalanced.needCrystals / crystals) * 100 : 0;
    if (timeUtil > 100.0001 || crystalUtil > 100.0001) {
      return null;
    }

    return { ...rebalanced, withinResources: true, rebalanced: true };
  },

  /**
   * 時間・クリスタル100%以内の最大獲得Pt（10炊き優先、同Ptなら10炊き多め）。
   */
  diagnosisCapPlan(pt5, pt10, availableHours, availableCrystals) {
    const rph = this.ENVY_RUNS_PER_HOUR;
    const hours = Math.max(0, availableHours);
    const crystals = Math.max(0, availableCrystals);
    const maxSlots = Math.floor(hours * rph);
    const cost5 = this.crystalsPerRun(5);
    const cost10 = this.crystalsPerRun(10);

    const maxR10 = Math.min(
      maxSlots,
      cost10 > 0 ? Math.floor(crystals / cost10) : 0,
    );

    let best = this._packDiagnosisPlan(0, 0, pt5, pt10, rph, cost5, cost10);

    for (let runs10 = 0; runs10 <= maxR10; runs10 += 1) {
      const slotsLeft = maxSlots - runs10;
      const crysLeft = crystals - runs10 * cost10;
      const runs5 = cost5 > 0
        ? Math.min(slotsLeft, Math.max(0, Math.floor(crysLeft / cost5)))
        : 0;
      const cand = this._packDiagnosisPlan(runs5, runs10, pt5, pt10, rph, cost5, cost10);
      if (
        cand.plannedPt > best.plannedPt
        || (cand.plannedPt === best.plannedPt && cand.runs10 > best.runs10)
      ) {
        best = cand;
      }
    }

    return best;
  },

  /** @deprecated diagnosisCapPlan の別名 */
  diagnosisMaxPtPlan(pt5, pt10, availableHours, availableCrystals) {
    return this.diagnosisCapPlan(pt5, pt10, availableHours, availableCrystals);
  },

  /** @deprecated 互換用。feasible または ideal を返す */
  planDiagnosisRuns(targetPt, pt5, pt10, availableHours, availableCrystals) {
    return this.diagnosisFeasiblePlan(targetPt, pt5, pt10, availableHours, availableCrystals)
      || this.planDiagnosisRunsIdeal(targetPt, pt5, pt10);
  },

  maxAchievableDiagnosis(pt5, pt10, availableHours, availableCrystals) {
    return this.diagnosisCapPlan(pt5, pt10, availableHours, availableCrystals);
  },

  reachableRank(pt5, pt10, availableHours, availableCrystals, filterType, filterValue) {
    const cap = this.maxAchievableDiagnosis(pt5, pt10, availableHours, availableCrystals);
    const maxPt = cap.plannedPt;

    const reachable = [];
    for (const preset of this.TARGET_RANK_PRESETS) {
      const est = this.estimateBorderTargetPt(preset.sheetKey, filterType, filterValue);
      if (est.ok && est.estimatedPt <= maxPt) {
        reachable.push({ preset, estimatedPt: est.estimatedPt, ptLabel: est.ptLabel });
      }
    }
    if (reachable.length === 0) return null;
    return reachable.reduce((a, b) => (a.preset.id < b.preset.id ? a : b));
  },

  runDiagnosis({
    presetId, filterType, filterValue,
    sougouryokuMan, jikkochiPct, bonusPct, totalPlayHours, availableCrystals,
  }) {
    const preset = this.TARGET_RANK_PRESETS.find((p) => p.id === presetId)
      || this.TARGET_RANK_PRESETS.find((p) => p.id === 500)
      || this.TARGET_RANK_PRESETS[0];
    const borderEst = this.estimateBorderTargetPt(preset.sheetKey, filterType, filterValue);
    if (!borderEst.ok) {
      return { ok: false, error: borderEst.error, preset };
    }

    const sougouryoku = sougouryokuMan * 10000;

    const ep0 = this.envyEventPtBase(sougouryoku, jikkochiPct, bonusPct);
    const pt0 = ep0;
    const pt5 = ep0 * this.lbEventPtMul(5);
    const pt10 = ep0 * this.lbEventPtMul(10);
    const runs = this.ENVY_RUNS_PER_HOUR;
    const hourly0 = pt0 * runs;
    const hourly5 = pt5 * runs;
    const hourly10 = pt10 * runs;

    const targetPt = borderEst.estimatedPt;
    const available = totalPlayHours;
    const crystals = Math.max(0, availableCrystals);

    const idealPlan = this.planDiagnosisRunsIdeal(targetPt, pt5, pt10);
    const feasiblePlan = this.diagnosisFeasiblePlan(targetPt, pt5, pt10, available, crystals);
    const cap = this.diagnosisCapPlan(pt5, pt10, available, crystals);
    const plan = feasiblePlan || idealPlan;
    const rebalanced10 = Boolean(feasiblePlan && feasiblePlan.rebalanced);

    const totalH0 = hourly0 > 0 ? targetPt / hourly0 : 9999;
    const totalH5 = hourly5 > 0 ? targetPt / hourly5 : 9999;
    const totalH10 = hourly10 > 0 ? targetPt / hourly10 : 9999;
    const totalH5only = idealPlan.runs10 === 0 ? idealPlan.needHours : totalH5;
    const totalH10only = idealPlan.runs10 > 0 ? idealPlan.needHours : totalH10;

    const marginRatio = targetPt > 0
      ? (cap.plannedPt - targetPt) / targetPt
      : 0;
    const marginPct = marginRatio * 100;
    const rank = this.diagnosisRankFromMargin(marginRatio);
    const achievable = rank !== 'D';
    const shortfallPt = achievable ? 0 : Math.max(0, targetPt - cap.plannedPt);
    const surplusPt = achievable ? Math.max(0, cap.plannedPt - targetPt) : 0;
    const achievablePct = targetPt > 0
      ? Math.min(100, (cap.plannedPt / targetPt) * 100)
      : 100;
    const needPlan = feasiblePlan || idealPlan;
    const displayPlan = achievable ? (feasiblePlan || cap) : cap;
    const ratioTime = available > 0 ? plan.needHours / available : 999;
    const ratioCrystal = crystals > 0 ? plan.needCrystals / crystals : 999;
    const ratio = Math.max(ratioTime, ratioCrystal);
    const capUtilTime = available > 0 ? (cap.needHours / available) * 100 : 999;
    const capUtilCrystal = crystals > 0 ? (cap.needCrystals / crystals) * 100 : 999;
    const needUtilTime = available > 0 ? (needPlan.needHours / available) * 100 : 999;
    const needUtilCrystal = crystals > 0 ? (needPlan.needCrystals / crystals) * 100 : 999;
    const bottleneck = needUtilCrystal > needUtilTime ? 'クリスタル' : '時間';
    const rankBottleneck = capUtilCrystal > capUtilTime ? 'クリスタル' : '時間';
    const idealUtilTime = available > 0 ? (idealPlan.needHours / available) * 100 : 999;
    const idealUtilCrystal = crystals > 0 ? (idealPlan.needCrystals / crystals) * 100 : 999;

    const estimatedScore = Math.floor(this.estimateEnvyScore(sougouryoku, jikkochiPct));
    const reachable = this.reachableRank(pt5, pt10, available, crystals, filterType, filterValue);
    const planUtilTime = needUtilTime;
    const planUtilCrystal = needUtilCrystal;

    const rankComments = {
      S: '獲得可能Ptが目標を大きく上回っています。余裕を持って達成できる見込みです。',
      A: '獲得可能Ptに十分な余裕があります。安定して目標達成が見込めます。',
      B: '獲得可能Ptが目標を上回っています。計画的に周回すれば達成可能です。',
      C: '獲得可能Ptは目標の±5%以内です。余裕が少ないためペース管理が重要です。',
      D: '現在のプレイ時間・クリスタルでは、目標順位の推定Ptに届きません。目標達成は難しい状況です。',
    };

    const adviceLines = [rankComments[rank]];
    if (rank === 'D') {
      adviceLines.push(
        `[達成率] 獲得可能Ptは目標の約 ${fmtNum1(achievablePct)}%（不足 約 ${fmtNum(shortfallPt)} Pt）。`,
      );
      if (rankBottleneck === 'クリスタル') {
        adviceLines.push('[改善案] クリスタルがボトルネックです。クリスタル追加または5/10炊きの配分見直しを検討してください。');
      } else {
        adviceLines.push('[改善案] プレイ時間がボトルネックです。稼働時間の追加を検討してください。');
      }
      adviceLines.push('[改善案] イベントボーナス・実効値の強化でも必要Ptを下げられます。');
    } else {
      adviceLines.push(
        `[余裕率] 獲得可能Ptは目標より約 +${fmtNum1(marginPct)}%（+${fmtNum(surplusPt)} Pt）。`,
      );
      if (rank === 'C') {
        adviceLines.push('[注意] 余裕が少ないため、ボーナス・実効値の維持と進捗確認をこまめに行いましょう。');
      } else if (rank === 'B') {
        adviceLines.push('[参考] イベントボーナスや実効値をさらに上げると、より安定した達成が見込めます。');
      }
      if (planUtilTime >= 85 || planUtilCrystal >= 85) {
        adviceLines.push('[注意] 目標達成用プランの時間またはクリスタル使用率が高めです。');
      }
    }
    if (rebalanced10) {
      adviceLines.push(
        `[周回プラン] 5炊きのみ想定（${fmtNum1(idealUtilTime)}%）では時間が足りないため、`
        + `時間稼働率が95〜100%になるよう10炊きを ${fmtNum(feasiblePlan.runs10)} 回に調整`
        + `（5炊き ${fmtNum(feasiblePlan.runs5)} 回 + 10炊き ${fmtNum(feasiblePlan.runs10)} 回、`
        + `時間 ${fmtNum1(planUtilTime)}%）。`,
      );
    } else if (plan.runs10 > 0) {
      adviceLines.push(
        `[周回プラン] 5炊き ${fmtNum(plan.runs5)} 回 + 10炊き ${fmtNum(plan.runs10)} 回`,
      );
    } else if (plan.runs5 > 0) {
      adviceLines.push(`[周回プラン] 5炊き ${fmtNum(plan.runs5)} 回のみで達成可能です。`);
    }

    if (reachable) {
      if (reachable.preset.id !== preset.id) {
        adviceLines.push(
          `[現在の条件で狙える順位] ${reachable.preset.label}（推定 ${reachable.ptLabel}）`,
        );
      }
    } else {
      adviceLines.push('[現在の条件で狙える順位] TOP 1000 も厳しい状況です。条件の見直しを強く推奨します。');
    }

    const filterLabel = filterType === 'unit' ? 'ユニット' : 'バナー';

    return {
      ok: true,
      rank, achievable, marginRatio, marginPct, shortfallPt, surplusPt, achievablePct, rebalanced10,
      preset, targetPt, ep0, pt0, pt5, pt10,
      hourly0, hourly5, hourly10, totalH0, totalH5, totalH10, totalH5only, totalH10only,
      available, crystals, plan, needPlan, displayPlan, idealPlan, feasiblePlan, cap,
      ratioTime, ratioCrystal, ratio, bottleneck, rankBottleneck,
      utilTime: needUtilTime,
      utilCrystal: needUtilCrystal,
      capUtilTime, capUtilCrystal,
      idealUtilTime, idealUtilCrystal,
      estimatedScore, reachable,
      borderEst, filterLabel,
      advice: adviceLines.join('\n'),
    };
  },
};

function fmtNum(n) {
  return Math.round(n).toLocaleString('ja-JP');
}

function fmtNum1(n) {
  return (Math.round(n * 10) / 10).toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

if (typeof window !== 'undefined') {
  window.PjskEngine = PjskEngine;
  window.fmtNum = fmtNum;
  window.fmtNum1 = fmtNum1;
}
