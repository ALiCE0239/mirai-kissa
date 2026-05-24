/**
 * 楽曲・基礎点マスタ（js/song-kiso-data.js 組み込み + ブラウザ上書き）
 */
const SongKiso = {
  songs: [],
  customSongs: [],
  overrides: {},
  loaded: false,
  loadError: null,
  masterSource: '',

  MASTER_TXT: 'data/楽曲基礎点.txt',
  MASTER_JSON: 'data/楽曲基礎点.json',
  STORAGE_OVERRIDES: 'miraiKissaSongKisoOverrides',
  STORAGE_CUSTOM: 'miraiKissaSongKisoCustom',

  /** @param {string} text */
  parseListText(text) {
    const songs = [];
    const seen = new Set();
    for (const line of String(text || '').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#') || t.startsWith('■') || t.startsWith('＝') || t === '================================') {
        continue;
      }
      if (t.startsWith('※') || t.startsWith('例:') || t.startsWith('例：')) continue;

      let name = '';
      let kiso = NaN;
      let unit = '';

      if (t.includes('\t')) {
        const parts = t.split('\t').map((p) => p.trim());
        name = parts[0] || '';
        kiso = parseInt(parts[1], 10);
        unit = parts[2] || '';
      } else {
        const eq = t.indexOf('=');
        if (eq < 1) continue;
        name = t.slice(0, eq).trim();
        const rest = t.slice(eq + 1).trim();
        const pipe = rest.indexOf('|');
        if (pipe >= 0) {
          kiso = parseInt(rest.slice(0, pipe).trim(), 10);
          unit = rest.slice(pipe + 1).trim();
        } else {
          kiso = parseInt(rest, 10);
        }
      }

      if (!name || !Number.isFinite(kiso) || kiso < 1 || kiso > 999) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      songs.push({ name, kiso, unit });
    }
    return songs;
  },

  /** js/song-kiso-data.js の SONG_KISO_DATA */
  loadFromEmbedded() {
    const raw = typeof SONG_KISO_DATA !== 'undefined' ? SONG_KISO_DATA : null;
    if (!raw || !Array.isArray(raw) || raw.length === 0) return false;
    this.songs = raw.map((s) => ({
      name: String(s.name).trim(),
      kiso: parseInt(s.kiso, 10),
      unit: s.unit ? String(s.unit) : '',
    })).filter((s) => s.name && Number.isFinite(s.kiso));
    this.masterSource = 'js/song-kiso-data.js';
    return this.songs.length > 0;
  },

  async loadFromText(url = this.MASTER_TXT) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const songs = this.parseListText(text);
    if (songs.length === 0) throw new Error('有効な楽曲行がありません');
    this.songs = songs;
    this.masterSource = url;
    return true;
  },

  async loadFromJson(url = this.MASTER_JSON) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.songs)) throw new Error('songs がありません');
    this.songs = data.songs.map((s) => ({
      name: String(s.name).trim(),
      kiso: parseInt(s.kiso, 10),
      unit: s.unit ? String(s.unit) : '',
    })).filter((s) => s.name && Number.isFinite(s.kiso));
    if (this.songs.length === 0) throw new Error('有効な楽曲がありません');
    this.masterSource = url;
    return true;
  },

  async load() {
    this.loadError = null;
    if (this.loadFromEmbedded()) {
      this._loadStorage();
      this.loaded = true;
      return true;
    }
    try {
      await this.loadFromText(this.MASTER_TXT);
      this._loadStorage();
      this.loaded = true;
      return true;
    } catch (errTxt) {
      try {
        await this.loadFromJson(this.MASTER_JSON);
        this._loadStorage();
        this.loaded = true;
        console.warn('[未来喫茶] 組み込みデータなし。txt を使用:', errTxt.message);
        return true;
      } catch (errJson) {
        this.loadError = '楽曲データを読み込めませんでした';
        this.songs = [];
        this.loaded = false;
        this.masterSource = '';
        console.warn('[未来喫茶] 楽曲基礎点の読み込みに失敗:', errTxt, errJson);
        return false;
      }
    }
  },

  _loadStorage() {
    try {
      this.overrides = JSON.parse(localStorage.getItem(this.STORAGE_OVERRIDES) || '{}');
    } catch {
      this.overrides = {};
    }
    try {
      this.customSongs = JSON.parse(localStorage.getItem(this.STORAGE_CUSTOM) || '[]');
    } catch {
      this.customSongs = [];
    }
    if (!this.overrides || typeof this.overrides !== 'object') this.overrides = {};
    if (!Array.isArray(this.customSongs)) this.customSongs = [];
  },

  _saveOverrides() {
    localStorage.setItem(this.STORAGE_OVERRIDES, JSON.stringify(this.overrides));
  },

  _saveCustom() {
    localStorage.setItem(this.STORAGE_CUSTOM, JSON.stringify(this.customSongs));
  },

  /** マスタ＋カスタム、上書き適用済みの一覧 */
  getAllSongs() {
    const map = new Map();
    for (const s of this.songs) {
      const kiso = this.overrides[s.name] !== undefined ? this.overrides[s.name] : s.kiso;
      map.set(s.name, { name: s.name, kiso, unit: s.unit, source: 'master' });
    }
    for (const s of this.customSongs) {
      const kiso = this.overrides[s.name] !== undefined ? this.overrides[s.name] : s.kiso;
      map.set(s.name, { name: s.name, kiso, unit: s.unit || '', source: 'custom' });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'ja'),
    );
  },

  findByName(name) {
    const q = String(name || '').trim();
    if (!q) return null;
    return this.getAllSongs().find((s) => s.name === q) || null;
  },

  search(query, limit = 80) {
    const q = String(query || '').trim().toLowerCase();
    const all = this.getAllSongs();
    if (!q) return all.slice(0, limit);
    return all.filter((s) => s.name.toLowerCase().includes(q)).slice(0, limit);
  },

  setKiso(name, kiso) {
    const n = String(name || '').trim();
    const k = parseInt(kiso, 10);
    if (!n || !Number.isFinite(k) || k < 1 || k > 999) return false;

    const customIdx = this.customSongs.findIndex((s) => s.name === n);
    if (customIdx >= 0) {
      this.customSongs[customIdx].kiso = k;
      this._saveCustom();
      return true;
    }
    if (this.songs.some((s) => s.name === n)) {
      this.overrides[n] = k;
      this._saveOverrides();
      return true;
    }
    return false;
  },

  addCustomSong(name, kiso, unit = '') {
    const n = String(name || '').trim();
    const k = parseInt(kiso, 10);
    if (!n || !Number.isFinite(k) || k < 1 || k > 999) return false;
    if (this.findByName(n)) return false;

    this.customSongs.push({ name: n, kiso: k, unit: String(unit || '') });
    this._saveCustom();
    return true;
  },

  removeOverride(name) {
    const n = String(name || '').trim();
    if (!n) return;
    delete this.overrides[n];
    this._saveOverrides();
  },

  clearAllOverrides() {
    this.overrides = {};
    this._saveOverrides();
  },

  clearCustomSongs() {
    this.customSongs = [];
    this._saveCustom();
  },

  resetUserData() {
    this.clearAllOverrides();
    this.clearCustomSongs();
  },

  /** マスター一覧を txt 形式で出力（編集・バックアップ用） */
  exportMasterText() {
    const lines = [
      '未来喫茶 — 楽曲・基礎点リスト（エクスポート）',
      '================================',
      '',
      '# 曲名\t基礎点\tユニット',
      '',
    ];
    for (const s of [...this.songs].sort((a, b) => a.name.localeCompare(b.name, 'ja'))) {
      const k = this.overrides[s.name] !== undefined ? this.overrides[s.name] : s.kiso;
      lines.push(`${s.name}\t${k}\t${s.unit || ''}`);
    }
    return lines.join('\n');
  },

  /** 上書きのみエクスポート（曲名=基礎点） */
  exportOverridesText() {
    const lines = ['# 未来喫茶 — 楽曲基礎点上書き（ブラウザのみ）', '# 形式: 曲名=基礎点'];
    const all = this.getAllSongs();
    const masterKiso = new Map(this.songs.map((s) => [s.name, s.kiso]));

    for (const s of all) {
      const base = masterKiso.get(s.name);
      if (s.source === 'custom') {
        lines.push(`${s.name}=${s.kiso}`);
      } else if (base !== undefined && base !== s.kiso) {
        lines.push(`${s.name}=${s.kiso}`);
      } else if (this.overrides[s.name] !== undefined) {
        lines.push(`${s.name}=${s.kiso}`);
      }
    }
    return lines.join('\n');
  },

  importOverridesText(text) {
    const lines = String(text || '').split(/\r?\n/);
    let count = 0;
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 1) continue;
      const name = t.slice(0, eq).trim();
      const kiso = parseInt(t.slice(eq + 1).trim(), 10);
      if (!name || !Number.isFinite(kiso)) continue;

      if (this.songs.some((s) => s.name === name)) {
        this.overrides[name] = kiso;
        count += 1;
      } else if (this.customSongs.some((s) => s.name === name)) {
        this.setKiso(name, kiso);
        count += 1;
      } else if (this.addCustomSong(name, kiso)) {
        count += 1;
      }
    }
    this._saveOverrides();
    return count;
  },
};

if (typeof window !== 'undefined') {
  window.SongKiso = SongKiso;
}
