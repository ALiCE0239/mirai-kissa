/**
 * 未来喫茶 — Calculator UI（プロセカアプリ準拠）
 */
const Calculators = {
  _calcActions: {
    amatsuyu: 'calcAmatsuyu',
    event: 'calcEvent',
    exec: 'calcExec',
    adjust: 'calcAdjust',
    'adjust-next': 'calcAdjustNext',
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
        if (typeof MiraiAnalytics !== 'undefined') MiraiAnalytics.trackToolUse(action);
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
    const fromSettings = sessionStorage.getItem('mirai_exec_from_settings');
    if (fromSettings) {
      const page = this._app()?.querySelector('.calc-page');
      const header = page && page.querySelector('.calc-header');
      if (header) {
        const back = header.querySelector('.back-link');
        if (back) {
          back.href = '#/mypage/settings';
          back.textContent = '← マイページ設定に戻る';
        }
        const hint = document.createElement('p');
        hint.className = 'form-hint exec-settings-hint';
        hint.textContent = '内部値を計算したら「コピー」し、マイページ設定の支援編成欄に貼り付けてください。';
        header.appendChild(hint);
      }
      sessionStorage.removeItem('mirai_exec_from_settings');
    }
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
  // ポイント調整 NEXT（楽曲基礎点）
  // ========================================
  _adjustNextEsc(t) {
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _adjustNextUnitLabel(unit) {
    const labels = {
      '1:レオニ': 'Leo/need',
      '2:モモ': 'MORE MORE JUMP!',
      '3:ビビ': 'Vivid BAD SQUAD',
      '4:ダショ': 'ワンダーランズ×ショウタイム',
      '5:ニーゴ': '25時、ナイトコードで。',
      '6:バチャ': 'チャルシンガー',
      '7:その他': 'その他',
    };
    return labels[unit] || unit;
  },

  _adjustNextSortUnits(units) {
    return [...units].sort((a, b) => {
      const na = parseInt(String(a).split(':')[0], 10) || 99;
      const nb = parseInt(String(b).split(':')[0], 10) || 99;
      return na - nb;
    });
  },

  _adjustNextFillUnitSelect() {
    const sel = this._el('adjustNextUnitSelect');
    if (!sel || typeof SongKiso === 'undefined') return;
    const all = SongKiso.getAllSongs();
    const units = this._adjustNextSortUnits([...new Set(all.map((s) => s.unit).filter(Boolean))]);
    const current = sel.value;
    sel.innerHTML =
      `<option value="">全て（全楽曲）（${all.length}曲）</option>` +
      units.map((u) => {
        const n = all.filter((s) => s.unit === u).length;
        return `<option value="${this._adjustNextEsc(u)}">${this._adjustNextEsc(this._adjustNextUnitLabel(u))}（${n}曲）</option>`;
      }).join('');
    if (current === '' || units.includes(current)) {
      sel.value = current;
    } else {
      sel.value = '';
    }
  },

  _adjustNextSongsForPicker() {
    if (typeof SongKiso === 'undefined') return [];
    const unit = this._el('adjustNextUnitSelect')?.value ?? '';
    const q = this._el('adjustNextSongSearch')?.value?.trim().toLowerCase() || '';
    let songs = unit
      ? SongKiso.getAllSongs().filter((s) => s.unit === unit)
      : SongKiso.getAllSongs();
    if (q) songs = songs.filter((s) => s.name.toLowerCase().includes(q));
    return songs;
  },

  _adjustNextFillSongSelect() {
    const unitSel = this._el('adjustNextUnitSelect');
    const searchEl = this._el('adjustNextSongSearch');
    const sel = this._el('adjustNextSongSelect');
    const countEl = this._el('adjustNextSongCount');
    if (!sel || typeof SongKiso === 'undefined') return;

    const unit = unitSel?.value ?? '';
    const current = sel.value;

    if (searchEl) searchEl.disabled = false;
    sel.disabled = false;

    const allInScope = unit
      ? SongKiso.getAllSongs().filter((s) => s.unit === unit)
      : SongKiso.getAllSongs();
    const songs = this._adjustNextSongsForPicker();

    if (songs.length === 0) {
      sel.innerHTML = '<option value="">— 該当する楽曲がありません —</option>';
    } else {
      sel.innerHTML = '<option value="">— 楽曲を選択 —</option>' + songs.map((s) =>
        `<option value="${this._adjustNextEsc(s.name)}">${this._adjustNextEsc(s.name)}（基礎点 ${s.kiso}）</option>`,
      ).join('');
      if (current && songs.some((s) => s.name === current)) sel.value = current;
    }

    if (countEl) {
      const q = this._el('adjustNextSongSearch')?.value?.trim();
      const scopeLabel = unit ? this._adjustNextUnitLabel(unit) : '全楽曲';
      countEl.textContent = q
        ? `${songs.length} 件（${scopeLabel} 全 ${allInScope.length} 曲中）`
        : `全 ${allInScope.length} 曲（${scopeLabel}）— 絞り込みには上の検索を使えます`;
    }

    if (!sel.value) this._adjustNextOnSongSelectChange();
  },

  _adjustNextOnSongSelectChange() {
    const sel = this._el('adjustNextSongSelect');
    const hint = this._el('adjustNextKisoHint');
    const hidden = this._el('adjustNextKiso');
    const name = sel?.value?.trim() || '';
    if (!name || typeof SongKiso === 'undefined') {
      if (hint) hint.textContent = '基礎点: —';
      if (hidden) hidden.value = '';
      return;
    }
    const song = SongKiso.findByName(name);
    if (!song) {
      if (hint) hint.textContent = '基礎点: —';
      if (hidden) hidden.value = '';
      return;
    }
    if (hidden) hidden.value = String(song.kiso);
    if (hint) {
      hint.textContent = song.unit
        ? `基礎点: ${song.kiso}（${this._adjustNextUnitLabel(song.unit)}）`
        : `基礎点: ${song.kiso}`;
    }
  },

  async initAdjustNext() {
    const chips = this._el('adjustNextTakiChips');
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

    const loadErr = this._el('adjustNextSongLoadErr');
    if (typeof SongKiso !== 'undefined') {
      const ok = await SongKiso.load();
      if (!ok && loadErr) {
        loadErr.hidden = false;
        loadErr.textContent = '楽曲一覧を読み込めませんでした。js/song-kiso-data.js を確認してください。';
      } else if (loadErr) {
        loadErr.hidden = true;
        this._adjustNextFillUnitSelect();
        this._adjustNextFillSongSelect();
      }
    }

    this._el('adjustNextUnitSelect')?.addEventListener('change', () => {
      const search = this._el('adjustNextSongSearch');
      if (search) search.value = '';
      this._adjustNextFillSongSelect();
    });
    this._el('adjustNextSongSearch')?.addEventListener('input', () => this._adjustNextFillSongSelect());
    this._el('adjustNextSongSelect')?.addEventListener('change', () => this._adjustNextOnSongSelectChange());

    const onEnter = (e) => {
      if (e.key === 'Enter') this._runCalc('calcAdjustNext');
    };
    this._el('adjustNextTarget')?.addEventListener('keydown', onEnter);
    this._el('adjustNextBonusMax')?.addEventListener('keydown', onEnter);
  },

  calcAdjustNext() {
    const target = parseInt(this._el('adjustNextTarget')?.value, 10);
    const songName = this._el('adjustNextSongSelect')?.value?.trim() || '';
    const kiso = parseInt(this._el('adjustNextKiso')?.value, 10);
    const errEl = this._el('adjustNextError');
    const listEl = this._el('adjustNextMatches');
    const countEl = this._el('adjustNextCount');

    if (!errEl || !listEl || !countEl) return;

    errEl.textContent = '';
    listEl.innerHTML = '';

    if (!target || target <= 0) {
      errEl.textContent = '獲得したいポイントに正の整数を入力してください';
      this._hide('adjustNextResult');
      return;
    }

    if (!songName) {
      errEl.textContent = '楽曲を選択してください';
      this._hide('adjustNextResult');
      return;
    }
    if (!kiso || kiso < 1 || kiso > 999) {
      errEl.textContent = '基礎点を取得できません。楽曲を選び直してください';
      this._hide('adjustNextResult');
      return;
    }

    const filterTaki = new Set();
    this._app()?.querySelectorAll('#adjustNextTakiChips [data-taki]:checked').forEach((cb) => {
      filterTaki.add(parseInt(cb.dataset.taki, 10));
    });
    if (filterTaki.size === 0) {
      errEl.textContent = '絞り込みで炊き数を1つ以上選んでください';
      this._hide('adjustNextResult');
      return;
    }

    let maxB = this._int('adjustNextBonusMax', PjskEngine.BONUS_MAX);
    maxB = Math.max(PjskEngine.BONUS_MIN, Math.min(maxB, PjskEngine.BONUS_MAX));

    const bonusStep = this._el('adjustNextBonusStep5')?.checked ? 5 : 1;
    const matches = PjskEngine.findExactMatches(
      target, filterTaki, PjskEngine.BONUS_MIN, maxB, bonusStep, kiso,
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
            ${songName ? `楽曲: ${songName}<br>` : ''}基礎点: ${fmtNum(m.kiso)}<br>
            スコア帯: ${fmtNum(m.scoreLow)}〜${fmtNum(m.scoreHigh)}<br>
            炊き前EP: ${fmtNum(m.epBeforeCook)} / ボーナス: +${m.bonusHundred}% / イベントP倍率: ×${m.multiplier}
          </div>
        </div>
      `);
    }

    this._show('adjustNextResult');
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
    this._lastDiagnosis = null;
    this._lastDiagnosisInputs = null;
    const saveBtn = this._el('diagnosisSaveImageBtn');
    const saveHint = this._el('diagnosisSaveHint');
    if (saveBtn) {
      saveBtn.hidden = true;
      saveBtn.classList.remove('is-loading');
      saveBtn.textContent = '画像で保存';
      saveBtn.onclick = (e) => {
        e.preventDefault();
        this._saveDiagnosisImage();
      };
    }
    if (saveHint) saveHint.hidden = true;

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

    const inputs = {
      sougouryokuMan: this._num('diagnosisSougou', 36),
      jikkochiPct: this._int('diagnosisJikkochi', 270),
      bonusPct: this._int('diagnosisBonus', 435),
      totalPlayHours: this._int('diagnosisHours', 60),
      availableCrystals: this._int('diagnosisCrystals', 100000),
    };

    const r = PjskEngine.runDiagnosis({
      presetId,
      filterType,
      filterValue,
      ...inputs,
    });

    if (!r.ok) {
      alert(r.error || '計算できませんでした');
      return;
    }

    this._lastDiagnosis = r;
    this._lastDiagnosisInputs = inputs;
    this._renderDiagnosisResult(r);
    this._show('diagnosisResult');
    const saveBtn = this._el('diagnosisSaveImageBtn');
    const saveHint = this._el('diagnosisSaveHint');
    if (saveBtn) saveBtn.hidden = false;
    if (saveHint) saveHint.hidden = false;
  },

  async _saveDiagnosisImage() {
    if (!this._lastDiagnosis || !this._lastDiagnosisInputs) {
      alert('先に「計算する」を実行してください。');
      return;
    }
    const btn = this._el('diagnosisSaveImageBtn');
    const prevLabel = btn?.textContent;
    if (btn) {
      btn.classList.add('is-loading');
      btn.textContent = '生成中…';
    }

    try {
      const filename = await DiagnosisShare.exportImage(
        this._lastDiagnosis,
        this._lastDiagnosisInputs,
      );
      if (btn) btn.textContent = '保存しました';
      setTimeout(() => {
        if (btn && prevLabel) btn.textContent = prevLabel;
      }, 2000);
    } catch (err) {
      console.error('[未来喫茶] 診断画像の保存に失敗:', err);
      alert(err.message || '画像の保存に失敗しました。しばらくしてから再度お試しください。');
      if (btn && prevLabel) btn.textContent = prevLabel;
    } finally {
      if (btn) btn.classList.remove('is-loading');
    }
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
      c: '目標の±5%以内',
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

/** イベラン診断 — 結果をカード画像として保存 */
const DiagnosisShare = {
  CARD_WIDTH: 960,
  CARD_HEIGHT: 540,

  _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _rankSub(rank) {
    const map = {
      s: '余裕あり',
      a: '達成見込み◎',
      b: '達成見込み○',
      c: '目標の±5%以内',
      d: '目標達成は困難',
    };
    return map[rank] || rank.toUpperCase();
  },

  _iconUrl() {
    try {
      return new URL('img/icon.png', window.location.href).href;
    } catch {
      return 'img/icon.png';
    }
  },

  _reachableShareText(r) {
    if (!r.reachable) {
      return 'TOP 1000 も厳しい';
    }
    return r.reachable.preset.label;
  },

  buildCardHtml(r, inputs, iconSrc) {
    const logo = iconSrc || this._iconUrl();
    const rank = r.rank.toLowerCase();
    const isFail = rank === 'd';
    const meterPlan = r.needPlan || r.plan;
    const timePct = Math.min(999, r.utilTime);
    const crystalPct = Math.min(999, r.utilCrystal);
    const timeBar = Math.min(100, timePct);
    const crystalBar = Math.min(100, crystalPct);

    const statusLine = isFail
      ? `不足 約 ${fmtNum(r.shortfallPt)} Pt（達成率 ${fmtNum1(r.achievablePct)}%）`
      : `余裕 +${fmtNum1(r.marginPct)}%（+${fmtNum(r.surplusPt)} Pt）`;

    const capPt = r.cap.plannedPt;
    const capMeetsTarget = capPt >= r.targetPt;
    const capTone = capMeetsTarget ? 'surplus' : 'shortfall';

    return `
      <article class="diagnosis-share-card diagnosis-share-card--${rank}" style="width:${this.CARD_WIDTH}px;height:${this.CARD_HEIGHT}px">
        <header class="diagnosis-share-card__top">
          <img class="diagnosis-share-card__logo" src="${this._esc(logo)}" alt="" width="36" height="36" crossorigin="anonymous">
          <span class="diagnosis-share-card__site">未来喫茶</span>
          <span class="diagnosis-share-card__type">イベラン診断</span>
        </header>

        <div class="diagnosis-share-card__body">
          <aside class="diagnosis-share-card__rank-panel">
            <div class="diagnosis-share-card__panel-meta">
              <span class="diagnosis-share-card__chip diagnosis-share-card__chip--filter">${this._esc(r.filterLabel)}：${this._esc(r.borderEst.filterValue)}</span>
              <span class="diagnosis-share-card__chip">${this._esc(r.preset.label)}</span>
            </div>
            <p class="diagnosis-share-card__rank" aria-hidden="true">${this._esc(r.rank)}</p>
            <p class="diagnosis-share-card__rank-sub">${this._esc(this._rankSub(rank))}</p>
            <p class="diagnosis-share-card__rank-label">達成判定</p>
          </aside>

          <div class="diagnosis-share-card__main">
            <section class="diagnosis-share-card__hero">
              <div class="diagnosis-share-card__pt-labels">
                <span>推定目標Pt</span>
                <span>獲得可能Pt</span>
              </div>
              <div class="diagnosis-share-card__pt-row">
                <div class="diagnosis-share-card__pt-col">
                  <p class="diagnosis-share-card__pt-value diagnosis-share-card__pt-value--target">${fmtNum(r.targetPt)}<span>Pt</span></p>
                </div>
                <div class="diagnosis-share-card__pt-col diagnosis-share-card__pt-col--cap">
                  <p class="diagnosis-share-card__pt-value diagnosis-share-card__pt-value--cap diagnosis-share-card__pt-value--${capTone}">${fmtNum(capPt)}<span>Pt</span></p>
                  <p class="diagnosis-share-card__margin-note diagnosis-share-card__margin-note--${isFail ? 'fail' : 'ok'}">${this._esc(statusLine)}</p>
                </div>
              </div>
            </section>

            <div class="diagnosis-share-card__meters">
              <div class="diagnosis-share-card__meter">
                <div class="diagnosis-share-card__meter-head">
                  <span>時間消化率</span>
                  <strong>${fmtNum1(timePct)}%</strong>
                </div>
                <div class="diagnosis-share-card__meter-track">
                  <div class="diagnosis-share-card__meter-fill" style="width:${timeBar}%"></div>
                </div>
                <p class="diagnosis-share-card__meter-sub">必要 ${fmtNum1(meterPlan.needHours)} h ／ 可能 ${fmtNum1(r.available)} h</p>
              </div>
              <div class="diagnosis-share-card__meter">
                <div class="diagnosis-share-card__meter-head">
                  <span>クリスタル消化率</span>
                  <strong>${fmtNum1(crystalPct)}%</strong>
                </div>
                <div class="diagnosis-share-card__meter-track">
                  <div class="diagnosis-share-card__meter-fill diagnosis-share-card__meter-fill--crystal" style="width:${crystalBar}%"></div>
                </div>
                <p class="diagnosis-share-card__meter-sub">必要 ${fmtNum(meterPlan.needCrystals)} 個 ／ 可能 ${fmtNum(r.crystals)} 個</p>
              </div>
            </div>

            <ul class="diagnosis-share-card__stats">
              <li class="diagnosis-share-card__stat-primary"><span>総合力</span><strong>${fmtNum1(inputs.sougouryokuMan)}<small>万</small></strong></li>
              <li class="diagnosis-share-card__stat-primary"><span>実行値</span><strong>${fmtNum(inputs.jikkochiPct)}<small>%</small></strong></li>
              <li class="diagnosis-share-card__stat-primary"><span>ボーナス</span><strong>${fmtNum(inputs.bonusPct)}<small>%</small></strong></li>
              <li class="diagnosis-share-card__stat-primary"><span>狙える順位</span><strong>${this._esc(this._reachableShareText(r))}</strong></li>
            </ul>
          </div>
        </div>
      </article>
    `;
  },

  async _loadHtml2Canvas() {
    if (window.html2canvas) return window.html2canvas;
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-diagnosis-share="html2canvas"]');
      if (existing) {
        if (window.html2canvas) {
          resolve(window.html2canvas);
          return;
        }
        existing.addEventListener('load', () => {
          if (window.html2canvas) resolve(window.html2canvas);
          else reject(new Error('画像ライブラリの読み込みに失敗しました'));
        });
        existing.addEventListener('error', () => reject(new Error('画像ライブラリの読み込みに失敗しました')));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.async = true;
      script.dataset.diagnosisShare = 'html2canvas';
      script.onload = () => {
        if (window.html2canvas) resolve(window.html2canvas);
        else reject(new Error('画像ライブラリの読み込みに失敗しました'));
      };
      script.onerror = () => reject(new Error('画像ライブラリの読み込みに失敗しました'));
      document.head.appendChild(script);
    });
  },

  async exportImage(r, inputs) {
    const mount = document.getElementById('diagnosisShareMount');
    if (!mount) throw new Error('共有用の描画領域がありません');

    mount.innerHTML = this.buildCardHtml(r, inputs, this._iconUrl());
    const card = mount.querySelector('.diagnosis-share-card');
    if (!card) throw new Error('カードの生成に失敗しました');

    const logo = card.querySelector('.diagnosis-share-card__logo');
    if (logo) {
      await new Promise((resolve) => {
        if (logo.complete) {
          resolve();
          return;
        }
        logo.onload = () => resolve();
        logo.onerror = () => resolve();
      });
    }

    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));

    const html2canvas = await this._loadHtml2Canvas();
    const canvas = await html2canvas(card, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      width: this.CARD_WIDTH,
      height: this.CARD_HEIGHT,
    });

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('画像の生成に失敗しました'));
      }, 'image/png');
    });

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `mirai-kissa-diagnosis-${r.preset.label.replace(/\s+/g, '')}-${r.rank}-${date}.png`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    return filename;
  },
};

if (typeof window !== 'undefined') {
  window.Calculators = Calculators;
  window.DiagnosisShare = DiagnosisShare;
}
