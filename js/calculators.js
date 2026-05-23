/**
 * 未来喫茶 — Calculator UI（プロセカアプリ準拠）
 */
const Calculators = {
  _calcActions: {
    amatsuyu: 'calcAmatsuyu',
    event: 'calcEvent',
    exec: 'calcExec',
    adjust: 'calcAdjust',
    kizuna: 'calcKizuna',
    diagnosis: 'calcDiagnosis',
  },

  _app() {
    return document.getElementById('app');
  },

  _el(id) {
    const root = this._app();
    if (!root || !id) return null;
    return root.querySelector('[id="' + id + '"]');
  },

  wireCalcButtons() {
    const app = this._app();
    if (!app) return;
    app.querySelectorAll('[data-calc]').forEach((btn) => {
      const action = btn.dataset.calc;
      const method = this._calcActions[action];
      if (!method || typeof this[method] !== 'function') return;
      btn.type = 'button';
      btn.onclick = (e) => {
        e.preventDefault();
        this._runCalc(method);
        const panel = app.querySelector('.result-panel');
        panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    });
  },

  _runCalc(method) {
    if (typeof PjskEngine === 'undefined') {
      alert('計算エンジンを読み込めませんでした。ページを再読み込みしてください。');
      return;
    }
    try {
      this[method]();
    } catch (err) {
      console.error('[未来喫茶] 計算エラー:', err);
      alert('計算中にエラーが発生しました: ' + err.message);
    }
  },

  _rawValue(id) {
    const el = this._el(id);
    if (!el) return '';
    return String(el.value).trim();
  },

  _parseNum(raw) {
    if (raw === '') return NaN;
    const v = parseFloat(String(raw).replace(/,/g, ''));
    return isNaN(v) ? NaN : v;
  },

  _num(id, fallback = 0) {
    const v = this._parseNum(this._rawValue(id));
    return isNaN(v) ? fallback : v;
  },

  _int(id, fallback = 0) {
    return Math.floor(this._num(id, fallback));
  },

  _selectInt(id, fallback = 0) {
    const el = this._el(id);
    if (!el) return fallback;
    const v = parseInt(el.value, 10);
    return isNaN(v) ? fallback : v;
  },

  _fillLbSelect(selectId, multiplierMap, defaultValue) {
    const el = this._el(selectId);
    if (!el) return;
    const keys = Object.keys(multiplierMap).map(Number).sort((a, b) => a - b);
    el.innerHTML = keys.map((n) => {
      const mul = multiplierMap[n];
      const label = mul !== undefined ? `${n}（×${mul}）` : String(n);
      const selected = n === defaultValue ? ' selected' : '';
      return `<option value="${n}"${selected}>${label}</option>`;
    }).join('');
  },

  /** 炊き数のみ表示（倍率表記なし） */
  _fillCookSelect(selectId, multiplierMap, defaultValue) {
    const el = this._el(selectId);
    if (!el) return;
    const keys = Object.keys(multiplierMap).map(Number).sort((a, b) => a - b);
    el.innerHTML = keys.map((n) => {
      const selected = n === defaultValue ? ' selected' : '';
      return `<option value="${n}"${selected}>${n}</option>`;
    }).join('');
  },

  _fillLevelSelect(selectId, minLevel, maxLevel, defaultValue) {
    const el = this._el(selectId);
    if (!el) return;
    const options = [];
    for (let lv = minLevel; lv <= maxLevel; lv++) {
      const selected = lv === defaultValue ? ' selected' : '';
      options.push(`<option value="${lv}"${selected}>${lv}</option>`);
    }
    el.innerHTML = options.join('');
  },

  _intRequired(id, label) {
    const raw = this._rawValue(id);
    if (raw === '') {
      return { ok: false, message: `${label}を入力してください` };
    }
    const v = this._parseNum(raw);
    if (isNaN(v) || v < 0) {
      return { ok: false, message: `${label}に0以上の数値を入力してください` };
    }
    return { ok: true, value: Math.floor(v) };
  },
  _chk(id) {
    return this._el(id)?.checked ?? false;
  },
  _show(id) {
    this._el(id)?.classList.add('visible');
  },
  _hide(id) {
    this._el(id)?.classList.remove('visible');
  },
  _resultGrid(gridId, items) {
    const el = this._el(gridId);
    if (!el) return;
    el.innerHTML = items.map((it) => `
      <div class="result-item">
        <div class="label">${it.label}</div>
        <div class="value ${it.color || ''}">${it.value}</div>
      </div>
    `).join('');
  },

  _copy(text, btn) {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'コピーしました';
        setTimeout(() => { btn.textContent = orig; }, 1200);
      }
    });
  },

  // ========================================
  // あまつゆ計算機
  // ========================================
  _amatsuyuMode() {
    const checked = this._app()?.querySelector('input[name="amatsuyuMode"]:checked');
    return checked?.value === 'mysekai' ? 'mysekai' : 'live';
  },

  _updateAmatsuyuModeUI() {
    const isLive = this._amatsuyuMode() === 'live';
    const cookGroup = this._el('amatsuyuCookGroup');
    if (!cookGroup) return;
    if (isLive) {
      cookGroup.hidden = false;
      cookGroup.classList.remove('is-hidden');
    } else {
      cookGroup.hidden = true;
      cookGroup.classList.add('is-hidden');
    }
  },

  initAmatsuyu() {
    this._hide('amatsuyuResult');
    this._fillCookSelect('amatsuyuCook', PjskEngine.LB_REWARD_MULTIPLIERS, 10);
    this._updateAmatsuyuModeUI();

    this._app()?.querySelectorAll('input[name="amatsuyuMode"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        this._updateAmatsuyuModeUI();
        this._hide('amatsuyuResult');
      });
    });

    const btn = this._el('amatsuyuCalcBtn');
    if (btn) {
      btn.onclick = (e) => {
        e.preventDefault();
        this._runCalc('calcAmatsuyu');
        const panel = this._el('amatsuyuResult');
        panel?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    }
  },

  _renderAmatsuyuMetric(label, value, unit, opts = {}) {
    const { primary = false, sub = false } = opts;
    const cls = primary ? ' amatsuyu-metric--primary' : sub ? ' amatsuyu-metric--sub' : '';
    const unitHtml = unit ? `<span class="amatsuyu-metric-unit">${unit}</span>` : '';
    return `
      <div class="amatsuyu-metric${cls}">
        <span class="amatsuyu-metric-label">${label}</span>
        <span class="amatsuyu-metric-value">${value}${unitHtml}</span>
      </div>
    `;
  },

  _renderAmatsuyuLiveRoute(r, cook) {
    return `
      <section class="amatsuyu-route amatsuyu-route--live" aria-labelledby="amatsuyu-live-title">
        <header class="amatsuyu-route-header">
          <span class="amatsuyu-route-icon" aria-hidden="true">🎤</span>
          <div>
            <h2 class="amatsuyu-route-title" id="amatsuyu-live-title">周回のみ（ライブ）</h2>
            <p class="amatsuyu-route-desc">1周あたり あまつゆ ${fmtNum(r.dropsPerRun)} 個</p>
          </div>
          <span class="amatsuyu-route-badge">${cook} 炊き</span>
        </header>
        <div class="amatsuyu-route-body">
          ${this._renderAmatsuyuMetric('必要周回数', fmtNum(r.needRunsLive), '周', { primary: true })}
          <div class="amatsuyu-metric-row">
            ${this._renderAmatsuyuMetric('1周あたり', fmtNum(r.dropsPerRun), '個')}
            ${this._renderAmatsuyuMetric('消費LB合計', fmtNum(r.needLiveBoost), '')}
          </div>
          ${this._renderAmatsuyuMetric('クリスタル換算', fmtNum(r.needCrystalLive), '個', { sub: true })}
        </div>
      </section>
    `;
  },

  _renderAmatsuyuMysekaiRoute(r) {
    return `
      <section class="amatsuyu-route amatsuyu-route--futaba" aria-labelledby="amatsuyu-futaba-title">
        <header class="amatsuyu-route-header">
          <span class="amatsuyu-route-icon" aria-hidden="true">🌿</span>
          <div>
            <h2 class="amatsuyu-route-title" id="amatsuyu-futaba-title">双葉のみ（マイセカイ）</h2>
            <p class="amatsuyu-route-desc">双葉であまつゆを受け取る場合</p>
          </div>
        </header>
        <div class="amatsuyu-route-notes">
          <span>1双葉 = <strong>42</strong> 個</span>
          <span>LB換算 <strong>2.5</strong> / 双葉</span>
        </div>
        <div class="amatsuyu-route-body">
          ${this._renderAmatsuyuMetric('必要双葉数', fmtNum(r.needFutaba), '個', { primary: true })}
          <div class="amatsuyu-metric-row">
            ${this._renderAmatsuyuMetric('必要ライブボーナス', fmtNum1(r.needLBsmallMySekai), '')}
            ${this._renderAmatsuyuMetric('あまつゆ合計', fmtNum(r.needDrops), '個')}
          </div>
          ${this._renderAmatsuyuMetric('クリスタル換算', fmtNum(r.needCrystalMySekai), '個', { sub: true })}
        </div>
      </section>
    `;
  },

  calcAmatsuyu() {
    const mode = this._amatsuyuMode();
    const cook = this._selectInt('amatsuyuCook', 10);
    const r = PjskEngine.calcAmatsuyu({
      targetFlowers: this._int('amatsuyuTarget', 400),
      hasNewBD: this._chk('amatsuyuNewBD'),
      hasOldBD1: this._chk('amatsuyuOld1'),
      hasOldBD2: this._chk('amatsuyuOld2'),
      hasOldBD3: this._chk('amatsuyuOld3'),
      hasOldBD4: this._chk('amatsuyuOld4'),
      selectedCook: cook,
    });

    const summary = this._el('amatsuyuSummary');
    const routes = this._el('amatsuyuRoutes');
    const mainLabel = this._el('amatsuyuMainLabel');
    if (!summary || !routes) return;

    summary.innerHTML = `
      <div class="amatsuyu-summary-item">
        <span class="amatsuyu-summary-item-label">必要Pt</span>
        <span class="amatsuyu-summary-item-value">${fmtNum(r.needPt)}</span>
      </div>
      <div class="amatsuyu-summary-item amatsuyu-summary-item--highlight">
        <span class="amatsuyu-summary-item-label">必要あまつゆ</span>
        <span class="amatsuyu-summary-item-value">${fmtNum(r.needDrops)}<small>個</small></span>
      </div>
      <div class="amatsuyu-summary-item">
        <span class="amatsuyu-summary-item-label">1個あたりPt</span>
        <span class="amatsuyu-summary-item-value">${fmtNum(r.ptPerDrop)}</span>
      </div>
      <div class="amatsuyu-summary-item">
        <span class="amatsuyu-summary-item-label">BDボーナス</span>
        <span class="amatsuyu-summary-item-value">${(r.bonusRate * 100).toFixed(0)}<small>%</small></span>
      </div>
    `;

    if (mode === 'live') {
      if (mainLabel) mainLabel.textContent = '周回（ライブ）で集める場合';
      routes.innerHTML = this._renderAmatsuyuLiveRoute(r, cook);
    } else {
      if (mainLabel) mainLabel.textContent = 'マイセカイ（双葉）で集める場合';
      routes.innerHTML = this._renderAmatsuyuMysekaiRoute(r);
    }

    this._show('amatsuyuResult');
  },

  // ========================================
  // イベントPt計算
  // ========================================
  initEvent() {
    this._hide('eventResult');
    this._fillCookSelect('eventLbPerRun', PjskEngine.LB_EVENT_PT_MULTIPLIERS, 5);
    const btn = this._el('eventCalcBtn');
    if (btn) {
      btn.onclick = (e) => {
        e.preventDefault();
        this._runCalc('calcEvent');
        this._el('eventResult')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    }
  },

  calcEvent() {
    const target = this._intRequired('eventTarget', '目標Pt');
    if (!target.ok) {
      alert(target.message);
      return;
    }
    const ptPerRun = this._intRequired('eventPtPerRun', '1周あたりPt');
    if (!ptPerRun.ok) {
      alert(ptPerRun.message);
      return;
    }

    const currentRaw = this._rawValue('eventCurrent');
    const currentPt = currentRaw === '' ? 0 : Math.max(0, Math.floor(this._parseNum(currentRaw) || 0));

    const lbPerRun = Math.max(0, Math.min(10, this._selectInt('eventLbPerRun', 5)));

    const r = PjskEngine.calcEventPt({
      targetPt: target.value,
      currentPt,
      ptPerRun: ptPerRun.value,
      lbPerRun,
    });

    this._resultGrid('eventResultGrid', [
      { label: '残りPt', value: fmtNum(r.remainingPt), color: 'pink' },
      { label: '必要周回数', value: `${fmtNum(r.runs)} 周`, color: 'purple' },
      { label: '必要クリスタル', value: `${fmtNum(r.crystals)} 個`, color: 'cyan' },
      { label: '周回時間', value: `${fmtNum1(r.hours)} h`, color: 'blue' },
    ]);

    this._show('eventResult');
  },

  // ========================================
  // 実効値（実行値）計算
  // ========================================
  initExec() {
    this._hide('execResult');
    const btn = this._el('execCalcBtn');
    if (btn) {
      btn.onclick = (e) => {
        e.preventDefault();
        this._runCalc('calcExec');
        this._el('execResult')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    }
  },

  calcExec() {
    const r = PjskEngine.calcExecValue({
      leader: this._int('execLeader', 0),
      sub1: this._int('execSub1', 0),
      sub2: this._int('execSub2', 0),
      sub3: this._int('execSub3', 0),
      sub4: this._int('execSub4', 0),
    });

    const internalEl = this._el('execInternal');
    const valueEl = this._el('execValue');
    if (!internalEl || !valueEl) return;
    internalEl.textContent = fmtNum(r.internalValue);
    valueEl.textContent = fmtNum1(r.execValue);

    const copyInternal = this._el('execCopyInternal');
    const copyExec = this._el('execCopyExec');
    if (copyInternal) copyInternal.onclick = () => this._copy(String(r.internalValue), copyInternal);
    if (copyExec) copyExec.onclick = () => this._copy(fmtNum1(r.execValue), copyExec);

    this._show('execResult');
  },

  // ========================================
  // ポイント調整
  // ========================================
  initAdjust() {
    const chips = this._el('adjustTakiChips');
    if (chips) {
      chips.innerHTML = Object.keys(PjskEngine.LB_EVENT_PT_MULTIPLIERS).map((t) => {
        const n = parseInt(t, 10);
        const checked = n === 0 ? ' checked' : '';
        return `
        <label class="taki-chip">
          <input type="checkbox" data-taki="${n}"${checked}>
          <span>${n}</span>
        </label>
      `;
      }).join('');
    }
    const onEnter = (e) => {
      if (e.key === 'Enter') this._runCalc('calcAdjust');
    };
    this._el('adjustTarget')?.addEventListener('keydown', onEnter);
    this._el('adjustBonusMax')?.addEventListener('keydown', onEnter);
  },

  calcAdjust() {
    const target = parseInt(this._el('adjustTarget')?.value, 10);
    const errEl = this._el('adjustError');
    const listEl = this._el('adjustMatches');
    const countEl = this._el('adjustCount');

    if (!errEl || !listEl || !countEl) return;

    errEl.textContent = '';
    listEl.innerHTML = '';

    if (!target || target <= 0) {
      errEl.textContent = '獲得したいポイントに正の整数を入力してください';
      this._hide('adjustResult');
      return;
    }

    const filterTaki = new Set();
    this._app()?.querySelectorAll('[data-taki]:checked').forEach((cb) => {
      filterTaki.add(parseInt(cb.dataset.taki, 10));
    });
    if (filterTaki.size === 0) {
      errEl.textContent = '絞り込みで炊き数を1つ以上選んでください';
      this._hide('adjustResult');
      return;
    }

    let maxB = this._int('adjustBonusMax', PjskEngine.BONUS_MAX);
    maxB = Math.max(PjskEngine.BONUS_MIN, Math.min(maxB, PjskEngine.BONUS_MAX));

    const bonusStep = this._el('adjustBonusStep5')?.checked ? 5 : 1;
    const matches = PjskEngine.findExactMatches(
      target, filterTaki, PjskEngine.BONUS_MIN, maxB, bonusStep,
    );
    countEl.textContent = matches.length;

    if (matches.length === 0) {
      listEl.innerHTML = '<p class="text-muted text-center" style="padding:2rem;">一致無し</p>';
    } else {
      listEl.innerHTML = matches.map((m) => `
        <div class="match-row">
          <div class="match-row-head">
            <strong>合計 ${fmtNum(m.totalPoint)} Pt</strong>
            <span class="tag">炊き ${m.taki}</span>
          </div>
          <div class="match-row-body">
            スコア帯: ${fmtNum(m.scoreLow)}〜${fmtNum(m.scoreHigh)}<br>
            炊き前EP: ${fmtNum(m.epBeforeCook)} / ボーナス: +${m.bonusHundred}% / イベントP倍率: ×${m.multiplier}
          </div>
        </div>
      `);
    }

    this._show('adjustResult');
  },

  // ========================================
  // キズナ計算
  // ========================================
  initKizuna() {
    this._hide('kizunaResult');
    this._fillLevelSelect('kizunaCurrent', 0, 125, 1);
    this._fillLevelSelect('kizunaTarget', 0, 125, 125);
    this._fillCookSelect('kizunaTakisu', PjskEngine.LB_REWARD_MULTIPLIERS, 5);
    const btn = this._el('kizunaCalcBtn');
    if (btn) {
      btn.onclick = (e) => {
        e.preventDefault();
        this._runCalc('calcKizuna');
        this._el('kizunaResult')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    }
  },

  calcKizuna() {
    const current = this._int('kizunaCurrent', 1);
    const target = this._int('kizunaTarget', 125);
    const takisu = this._selectInt('kizunaTakisu', 5);

    if (target < current) {
      alert('目標Lvは現在Lv以上にしてください');
      return;
    }

    const r = PjskEngine.calcKizuna({ currentLevel: current, targetLevel: target, takisu });

    if (r.alreadyReached) {
      alert('すでに到達しています。');
      return;
    }

    this._resultGrid('kizunaResultGrid', [
      { label: '残りEXP', value: fmtNum(r.need), color: 'pink' },
      { label: '1回あたりEXP', value: fmtNum(r.per), color: 'purple' },
      { label: '必要プレイ回数', value: `${fmtNum(r.plays)} 回`, color: 'cyan' },
      { label: '必要クリスタル', value: `${fmtNum(r.crystals)} 個`, color: 'yellow' },
    ]);
    this._show('kizunaResult');
  },

  // ========================================
  // イベラン診断
  // ========================================
  initDiagnosis() {
    this._hide('diagnosisResult');
    PjskEngine.ensureBorderData();
    this._fillDiagnosisFilterOptions();

    const typeSel = this._el('diagnosisFilterType');
    if (typeSel) {
      typeSel.onchange = () => this._fillDiagnosisFilterOptions();
    }
    const btn = this._el('diagnosisCalcBtn');
    if (btn) {
      btn.onclick = (e) => {
        e.preventDefault();
        this._runCalc('calcDiagnosis');
        this._el('diagnosisResult')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    }
  },

  _fillDiagnosisFilterOptions() {
    const type = this._el('diagnosisFilterType')?.value === 'unit' ? 'unit' : 'banner';
    const valueSel = this._el('diagnosisFilterValue');
    const labelEl = this._el('diagnosisFilterValueLabel');
    const hintEl = this._el('diagnosisFilterHint');
    if (!valueSel) return;

    const list = PjskEngine.getBorderFilterList(type);
    const prev = valueSel.value;
    if (labelEl) labelEl.textContent = type === 'unit' ? 'ユニット' : 'バナーキャラクター';

    valueSel.innerHTML = list.map((name) => {
      const esc = name.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
      const selected = name === prev ? ' selected' : '';
      return `<option value="${esc}"${selected}>${esc}</option>`;
    }).join('');

    if (!list.includes(prev)) valueSel.selectedIndex = 0;

    if (hintEl) {
      hintEl.textContent = PjskEngine.borderDataLoaded
        ? '一致イベントのポイント上位5件の平均で推定Ptを算出'
        : 'ボーダーデータが読み込めません（border-rankings-data.js を確認）';
    }
  },

  calcDiagnosis() {
    if (!PjskEngine.ensureBorderData()) {
      alert('ボーダーデータが読み込めません。ページを再読み込みしてください。');
      return;
    }

    const presetId = parseInt(this._el('diagnosisPreset')?.value, 10);
    const filterType = this._el('diagnosisFilterType')?.value === 'unit' ? 'unit' : 'banner';
    const filterValue = this._el('diagnosisFilterValue')?.value || '';

    const r = PjskEngine.runDiagnosis({
      presetId,
      filterType,
      filterValue,
      sougouryokuMan: this._num('diagnosisSougou', 36),
      jikkochiPct: this._int('diagnosisJikkochi', 270),
      bonusPct: this._int('diagnosisBonus', 435),
      totalPlayHours: this._int('diagnosisHours', 60),
      availableCrystals: this._int('diagnosisCrystals', 100000),
    });

    if (!r.ok) {
      alert(r.error || '計算できませんでした');
      return;
    }

    this._renderDiagnosisResult(r);
    this._show('diagnosisResult');
  },

  _diagnosisUtilLevel(pct) {
    if (pct <= 100) return 'ok';
    if (pct <= 120) return 'warn';
    return 'bad';
  },

  _diagnosisMeter(label, pct, needText, availText) {
    const lv = this._diagnosisUtilLevel(pct);
    const width = Math.min(pct, 100);
    return `
      <div class="diagnosis-meter">
        <div class="diagnosis-meter__head">
          <span>${label}</span>
          <span class="diagnosis-meter__pct diagnosis-meter__pct--${lv}">${fmtNum1(pct)}%</span>
        </div>
        <div class="diagnosis-meter__track">
          <div class="diagnosis-meter__fill diagnosis-meter__fill--${lv}" style="width:${width}%"></div>
        </div>
        <p class="diagnosis-meter__sub">必要 ${needText} / 可能 ${availText}</p>
      </div>
    `;
  },

  _renderDiagnosisResult(r) {
    const body = this._el('diagnosisResultBody');
    if (!body) return;

    const esc = (s) => String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const mul0 = PjskEngine.lbEventPtMul(0);
    const mul5 = PjskEngine.lbEventPtMul(5);
    const mul10 = PjskEngine.lbEventPtMul(10);
    const rank = r.rank.toLowerCase();
    const plan = r.plan;

    const eventItems = r.borderEst.topSamples.map((row) => (
      `<li>${esc(row.eventName)}
        <strong>${esc(row.pointsDisplay)}</strong>（${fmtNum(row.points)} Pt）</li>`
    )).join('');

    const adviceItems = r.advice.split('\n').filter(Boolean).map(
      (line) => `<li>${esc(line)}</li>`,
    ).join('');

    const planTitle = r.rebalanced10
      ? '推奨周回プラン（時間95〜100%・10炊き調整）'
      : (r.feasiblePlan ? '推奨周回プラン（5炊き優先）' : '推奨周回プラン（5炊きのみ想定・参考）');
    const runs10Note = r.rebalanced10
      ? '<span class="diagnosis-bottleneck">時間圧縮</span>'
      : (plan.runs10 > 0 ? '<span class="diagnosis-bottleneck">10炊きあり</span>' : '不要');
    const rankSubMap = {
      s: '余裕あり',
      a: '達成見込み◎',
      b: '達成見込み○',
      c: 'ぎりぎり達成可能',
      d: '目標達成は困難',
    };
    const rankSub = rankSubMap[rank] || r.rank;
    const meterPlan = r.needPlan || r.plan;
    const isFail = rank === 'd';
    const comparePct = Math.min(100, Math.max(0, r.achievablePct || 0));

    const failAlert = isFail ? `
      <section class="diagnosis-alert diagnosis-alert--fail" role="alert">
        <p class="diagnosis-alert__eyebrow">判定 D</p>
        <h3 class="diagnosis-alert__title">この条件では目標Ptの達成が困難です</h3>
        <p class="diagnosis-alert__lead">
          入力したプレイ時間・クリスタルを使い切っても、
          <strong>${esc(r.preset.label)}</strong>の推定目標（<strong>${fmtNum(r.targetPt)} Pt</strong>）に届きません。
        </p>
        <div class="diagnosis-compare">
          <div class="diagnosis-compare__row">
            <span class="diagnosis-compare__label">推定目標Pt</span>
            <div class="diagnosis-compare__track" aria-hidden="true">
              <div class="diagnosis-compare__fill diagnosis-compare__fill--target" style="width:100%"></div>
            </div>
            <span class="diagnosis-compare__value">${fmtNum(r.targetPt)}</span>
          </div>
          <div class="diagnosis-compare__row">
            <span class="diagnosis-compare__label">獲得可能Pt（最大）</span>
            <div class="diagnosis-compare__track" aria-hidden="true">
              <div class="diagnosis-compare__fill diagnosis-compare__fill--cap" style="width:${comparePct}%"></div>
            </div>
            <span class="diagnosis-compare__value">${fmtNum(r.cap.plannedPt)}</span>
          </div>
        </div>
        <p class="diagnosis-alert__stat">
          目標まであと <strong>約 ${fmtNum(r.shortfallPt)} Pt</strong>
          （達成可能なのは目標の約 <strong>${fmtNum1(comparePct)}%</strong>）
        </p>
        <p class="diagnosis-alert__hint">
          プレイ時間・クリスタルの追加、イベントボーナス・実効値の強化、または目標順位の見直しを検討してください。
        </p>
      </section>
    ` : '';

    const heroClass = isFail ? 'diagnosis-hero diagnosis-hero--fail' : 'diagnosis-hero';

    body.innerHTML = `
      ${failAlert}
      <section class="${heroClass}">
        <div class="diagnosis-hero__rank">
          <div class="diagnosis-rank diagnosis-rank--${rank}">${esc(r.rank)}</div>
          <p class="diagnosis-hero__rank-label">達成判定（${rankSub}）</p>
        </div>
        <div class="diagnosis-hero__target">
          <p class="diagnosis-hero__target-label">推定目標Pt（${esc(r.preset.label)}・${esc(r.borderEst.sheetKey)}位）</p>
          <p class="diagnosis-hero__target-value">${fmtNum(r.targetPt)} Pt</p>
          <p class="diagnosis-hero__meta">
            ${esc(r.filterLabel)}＝${esc(r.borderEst.filterValue)}
            ／ 上位${r.borderEst.sampleCount}件平均
            ${isFail
    ? `<span class="diagnosis-bottleneck">不足 約 ${fmtNum(r.shortfallPt)} Pt</span>`
    : `<span class="diagnosis-bottleneck diagnosis-bottleneck--surplus">余裕 +${fmtNum1(r.marginPct)}%（+${fmtNum(r.surplusPt)} Pt）</span>`}
            <span class="diagnosis-bottleneck">ボトルネック: ${esc(r.bottleneck)}</span>
          </p>
        </div>
      </section>

      <section class="diagnosis-meters">
        ${this._diagnosisMeter(
          '時間消化率（目標達成に必要）',
          r.utilTime,
          `${fmtNum1(meterPlan.needHours)} h`,
          `${fmtNum1(r.available)} h`,
        )}
        ${this._diagnosisMeter(
          'クリスタル消化率（目標達成に必要）',
          r.utilCrystal,
          `${fmtNum(meterPlan.needCrystals)} 個`,
          `${fmtNum(r.crystals)} 個`,
        )}
      </section>

      <section class="diagnosis-card diagnosis-card--plan${isFail ? ' diagnosis-card--muted' : ''}">
        <h3 class="diagnosis-card__title">${isFail ? '参考: 5炊きのみ想定の周回（目標には不足）' : planTitle}</h3>
        <div class="diagnosis-plan-grid">
          <div class="diagnosis-plan-stat">
            <span class="diagnosis-plan-stat__label">5炊き</span>
            <span class="diagnosis-plan-stat__value">${fmtNum(plan.runs5)} 回</span>
            <span class="diagnosis-plan-stat__sub">${fmtNum(plan.runs5 * plan.cost5)} 個</span>
          </div>
          <div class="diagnosis-plan-stat">
            <span class="diagnosis-plan-stat__label">10炊き</span>
            <span class="diagnosis-plan-stat__value">${fmtNum(plan.runs10)} 回</span>
            <span class="diagnosis-plan-stat__sub">${fmtNum(plan.runs10 * plan.cost10)} 個 ${runs10Note}</span>
          </div>
          <div class="diagnosis-plan-stat">
            <span class="diagnosis-plan-stat__label">獲得可能Pt</span>
            <span class="diagnosis-plan-stat__value">${fmtNum(r.cap.plannedPt)}</span>
            <span class="diagnosis-plan-stat__sub">5炊き${fmtNum(r.cap.runs5)}+10炊き${fmtNum(r.cap.runs10)}回</span>
          </div>
        </div>
        <div class="diagnosis-plan-total">
          <span>合計 <strong>${fmtNum(plan.totalRuns)} 回</strong></span>
          <span>所要 <strong>${fmtNum1(plan.needHours)} h</strong></span>
          <span>消費 <strong>${fmtNum(plan.needCrystals)} 個</strong></span>
        </div>
      </section>

      <section class="diagnosis-card">
        <h3 class="diagnosis-card__title">1回あたり・時速（エンヴィー28回/h）</h3>
        <div class="diagnosis-table-wrap">
          <table class="diagnosis-table">
            <thead>
              <tr>
                <th>炊き数</th>
                <th>倍率</th>
                <th>1回Pt</th>
                <th>時速</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="cook-0">0炊き</td>
                <td>×${mul0}</td>
                <td>${fmtNum(r.pt0)}</td>
                <td>${fmtNum(r.hourly0)}</td>
              </tr>
              <tr>
                <td class="cook-5">5炊き</td>
                <td>×${mul5}</td>
                <td>${fmtNum(r.pt5)}</td>
                <td>${fmtNum(r.hourly5)}</td>
              </tr>
              <tr>
                <td class="cook-10">10炊き</td>
                <td>×${mul10}</td>
                <td>${fmtNum(r.pt10)}</td>
                <td>${fmtNum(r.hourly10)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="diagnosis-card">
        <h3 class="diagnosis-card__title">参考（単一炊き数のみで達成した場合の時間）</h3>
        <div class="diagnosis-plan-total">
          <span>0炊き <strong>${fmtNum1(r.totalH0)} h</strong></span>
          <span>5炊きのみ <strong>${fmtNum1(r.totalH5only)} h</strong></span>
          <span>10炊きのみ <strong>${fmtNum1(r.totalH10only)} h</strong></span>
          <span>推定スコア <strong>${fmtNum(r.estimatedScore)}</strong></span>
        </div>
      </section>

      <section class="diagnosis-card">
        <h3 class="diagnosis-card__title">参照した上位イベント</h3>
        <ol class="diagnosis-events">${eventItems}</ol>
      </section>

      <section class="diagnosis-card">
        <h3 class="diagnosis-card__title">アドバイス</h3>
        <ul class="diagnosis-advice">${adviceItems}</ul>
      </section>
    `;
  },
};

if (typeof window !== 'undefined') {
  window.Calculators = Calculators;
}
