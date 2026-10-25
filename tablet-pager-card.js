// Tablet Pager Card (custom:tablet-pager-card) – https://github.com/Gyuszko55/tablet-pager-card
// Several Home Assistant cards in one place, gliding into each other. Swipe with a finger (or mouse),
// tap the dots, or let it advance by itself every `interval` seconds. Touching the card restarts the timer,
// so it never slides away while in use. Any card can be a page, built-in or custom.
// If an inner card exposes `paused === true` (or the Hungarian `szunetel`), its page and dot are hidden.
// No dependencies. Hungarian keys (kartyak, valtas_mp, pottyok) are accepted as aliases.
//
// type: custom:tablet-pager-card
// interval: 30          # seconds, 0 = no automatic paging
// show_dots: true
// cards:
//   - type: entities
//     entities: [light.kitchen]
//   - type: weather-forecast
//     entity: weather.home

const VERSION = "1.0.1";

const normalize = (config) => {
  const cards = config.cards ?? config.kartyak;
  const interval = config.interval ?? config.valtas_mp ?? 30;
  const showDots = config.show_dots ?? config.pottyok ?? true;
  return { ...config, cards, interval: Number(interval) || 0, show_dots: showDots !== false };
};

class TabletPagerCard extends HTMLElement {
  static getConfigElement() { return document.createElement("tablet-pager-card-editor"); }

  static getStubConfig() {
    return {
      interval: 30,
      cards: [
        { type: "markdown", content: "## 1\nSwipe me / Húzz oldalra" },
        { type: "markdown", content: "## 2\nTap the dots / Koppints a pöttyökre" },
      ],
    };
  }

  setConfig(config) {
    const c = normalize(config || {});
    if (!Array.isArray(c.cards) || !c.cards.length) throw new Error("Add at least one card (cards). / Adj meg kártyákat (cards).");
    this._config = c;
    this._lap = 0;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._epit();
  }

  set hass(hass) {
    this._hass = hass;
    (this._kartyak || []).forEach((k) => { k.hass = hass; });
    this._szur();
  }

  // Recompute the visible pages; when it changes, hidden pages and their dots disappear.
  _szur() {
    if (!this._kartyak) return;
    const lathato = this._kartyak.map((k, i) => (k.paused === true || k.szunetel === true ? -1 : i)).filter((i) => i >= 0);
    if (!lathato.length) lathato.push(0);
    if (this._lathato && lathato.join() === this._lathato.join()) return;
    const akt = this._lathato?.[this._lap];
    this._lathato = lathato;
    const sr = this.shadowRoot;
    sr.querySelectorAll(".lap").forEach((l, i) => { l.hidden = !lathato.includes(i); });
    sr.querySelectorAll(".potty").forEach((p, i) => { p.hidden = !lathato.includes(i); });
    sr.getElementById("pottyok").hidden = !this._config.show_dots || lathato.length < 2;
    this._lap = Math.max(0, lathato.indexOf(akt));
    this._mutat();
    this._idozit();
  }

  connectedCallback() {
    this._idozit();
    this._lathatosag = () => this._idozit();
    document.addEventListener("visibilitychange", this._lathatosag);
  }

  disconnectedCallback() {
    clearTimeout(this._idozito);
    document.removeEventListener("visibilitychange", this._lathatosag);
  }

  async _epit() {
    const c = this._config;
    const epites = (this._epites = {});
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; flex-direction: column; height: 100%; }
        .ablak { position: relative; flex: 1; overflow: hidden; touch-action: pan-y; border-radius: var(--ha-card-border-radius, 12px); }
        .sav { display: flex; height: 100%; transition: transform .6s cubic-bezier(.22,.8,.3,1); will-change: transform; }
        .sav.huz { transition: none; user-select: none; -webkit-user-select: none; }
        .lap { flex: 0 0 100%; min-width: 0; display: flex; flex-direction: column; }
        .lap > * { flex: 1; }
        .lap[hidden], .potty[hidden], .pottyok[hidden] { display: none; }
        .pottyok { display: flex; justify-content: center; gap: 8px; padding: 8px 0 0; }
        .potty { width: 8px; height: 8px; border-radius: 4px; border: 0; padding: 0; cursor: pointer;
          background: var(--secondary-text-color); opacity: .3; transition: width .3s, opacity .3s; }
        .potty.akt { width: 22px; opacity: .85; background: var(--primary-color); }
        .potty:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .sav, .potty { transition: none; } }
      </style>
      <div class="ablak" id="ablak"><div class="sav" id="sav"></div></div>
      <div class="pottyok" id="pottyok">${c.cards.map((_, i) => `<button class="potty" data-i="${i}" aria-label="${i + 1}"></button>`).join("")}</div>`;
    const sr = this.shadowRoot;
    sr.getElementById("pottyok").hidden = !c.show_dots || c.cards.length < 2;
    sr.querySelectorAll(".potty").forEach((p) => p.addEventListener("click", () => this._ugrik(this._lathato ? this._lathato.indexOf(Number(p.dataset.i)) : Number(p.dataset.i))));
    this._huzas(sr.getElementById("ablak"), sr.getElementById("sav"));

    const helpers = await window.loadCardHelpers();
    if (epites !== this._epites) return; // a newer setConfig already rebuilt the card
    const sav = sr.getElementById("sav");
    this._kartyak = c.cards.map((kc) => {
      const lap = document.createElement("div");
      lap.className = "lap";
      const el = helpers.createCardElement(kc);
      // a card whose type is still loading replaces itself once ready
      el.addEventListener("ll-rebuild", (ev) => {
        ev.stopPropagation();
        const uj = helpers.createCardElement(kc);
        if (this._hass) uj.hass = this._hass;
        lap.replaceChild(uj, lap.firstChild);
        this._kartyak[this._kartyak.indexOf(el)] = uj;
      }, { once: true });
      if (this._hass) el.hass = this._hass;
      lap.appendChild(el);
      sav.appendChild(lap);
      return el;
    });
    this._lathato = null;
    this._szur();
  }

  _huzas(ablak, sav) {
    let x0 = 0, y0 = 0, dx = 0, huz = false, lenn = false, id = null;
    ablak.addEventListener("pointerdown", (e) => {
      lenn = true; huz = false; dx = 0; x0 = e.clientX; y0 = e.clientY; id = e.pointerId;
      this._idozit();
    });
    ablak.addEventListener("pointermove", (e) => {
      if (!lenn || e.pointerId !== id) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!huz) {
        // a swipe only starts after 12 px of mostly horizontal travel; until then a tap stays a tap
        if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my) * 1.3 || (this._lathato?.length ?? 0) < 2) return;
        huz = true;
        ablak.setPointerCapture(id);
        sav.classList.add("huz");
        window.getSelection()?.removeAllRanges(); // a mouse drag may already have started selecting text
      }
      dx = mx;
      sav.style.transform = `translateX(calc(${-this._lap * 100}% + ${dx}px))`;
    });
    const vege = (e) => {
      if (!lenn || e.pointerId !== id) return;
      lenn = false;
      if (!huz) return;
      sav.classList.remove("huz");
      const kuszob = ablak.clientWidth * 0.18;
      if (dx < -kuszob) this._ugrik(this._lap + 1);
      else if (dx > kuszob) this._ugrik(this._lap - 1);
      else this._mutat();
      // the click that follows a swipe must not toggle anything on the page
      // (touch swipes usually send no click at all, so the trap is removed again shortly after)
      const elnyel = (k) => { k.stopPropagation(); k.preventDefault(); };
      ablak.addEventListener("click", elnyel, { capture: true, once: true });
      setTimeout(() => ablak.removeEventListener("click", elnyel, { capture: true }), 350);
      setTimeout(() => { huz = false; }, 0);
    };
    ablak.addEventListener("pointerup", vege);
    ablak.addEventListener("pointercancel", vege);
    // with a mouse, dragging selected text or an image would start native drag & drop and cancel the swipe
    ablak.addEventListener("dragstart", (e) => e.preventDefault());
  }

  _ugrik(i) {
    const n = this._lathato?.length || this._config.cards.length;
    this._lap = ((i % n) + n) % n;
    this._mutat();
    this._idozit();
  }

  _mutat() {
    const sr = this.shadowRoot;
    const sav = sr?.getElementById("sav");
    if (!sav) return;
    sav.style.transform = `translateX(${-this._lap * 100}%)`;
    const akt = this._lathato ? this._lathato[this._lap] : this._lap;
    sr.querySelectorAll(".potty").forEach((p, i) => p.classList.toggle("akt", i === akt));
  }

  _idozit() {
    clearTimeout(this._idozito);
    const mp = this._config?.interval || 0;
    if (mp <= 0 || document.hidden || !this.isConnected || (this._lathato && this._lathato.length < 2)) return;
    this._idozito = setTimeout(() => this._ugrik(this._lap + 1), mp * 1000);
  }

  getCardSize() { return 6; }

  getGridOptions() { return { columns: 12, min_columns: 3, rows: "auto" }; }
}

// ---------------------------------------------------------------------------------------------
// Visual editor: interval and dots via ha-form, one tab per inner card with HA's own card editor.

const SZOVEG = {
  en: { interval: "Automatic paging (seconds, 0 = off)", show_dots: "Show dots", add: "Add card",
    left: "Move left", right: "Move right", del: "Delete card", code: "Code editor", visual: "Visual editor" },
  hu: { interval: "Automatikus lapozás (másodperc, 0 = ki)", show_dots: "Pöttyök mutatása", add: "Kártya hozzáadása",
    left: "Mozgatás balra", right: "Mozgatás jobbra", del: "Kártya törlése", code: "Kódszerkesztő", visual: "Vizuális szerkesztő" },
};

class TabletPagerCardEditor extends HTMLElement {
  constructor() {
    super();
    this._valasztott = 0;
    this.attachShadow({ mode: "open" });
  }

  get _t() { return SZOVEG[(this._hass?.locale?.language || this._hass?.language || "en").startsWith("hu") ? "hu" : "en"]; }

  setConfig(config) {
    // HA echoes back every config we send; re-rendering then would steal focus from the inner editor
    if (this._kesz && this._config && JSON.stringify(config) === JSON.stringify(this._config)) return;
    const c = normalize(config || {});
    // keep the user's own key names (Hungarian or English) when writing back
    this._kulcs = {
      cards: "kartyak" in (config || {}) && !("cards" in config) ? "kartyak" : "cards",
      interval: "valtas_mp" in (config || {}) && !("interval" in config) ? "valtas_mp" : "interval",
      show_dots: "pottyok" in (config || {}) && !("show_dots" in config) ? "pottyok" : "show_dots",
    };
    this._config = config || {};
    this._cards = Array.isArray(c.cards) ? c.cards : [];
    this._interval = c.interval;
    this._showDots = c.show_dots;
    if (this._valasztott > this._cards.length) this._valasztott = this._cards.length;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot.querySelectorAll("ha-form, hui-card-element-editor, hui-card-picker").forEach((el) => { el.hass = hass; });
    if (!this._kesz) this._render();
  }

  set lovelace(lovelace) {
    this._lovelace = lovelace;
    this.shadowRoot.querySelectorAll("hui-card-element-editor, hui-card-picker").forEach((el) => { el.lovelace = lovelace; });
  }

  // HA defines hui-card-element-editor and hui-card-picker lazily; loading the stack card editor brings them in.
  async _betolt() {
    if (customElements.get("hui-card-element-editor") && customElements.get("hui-card-picker")) return;
    const helpers = await window.loadCardHelpers();
    const stack = helpers.createCardElement({ type: "vertical-stack", cards: [] });
    await customElements.whenDefined(stack.localName);
    await customElements.get(stack.localName).getConfigElement();
    await Promise.all([customElements.whenDefined("hui-card-element-editor"), customElements.whenDefined("hui-card-picker")]);
  }

  _kuld() {
    const k = this._kulcs;
    const uj = { ...this._config };
    ["cards", "kartyak", "interval", "valtas_mp", "show_dots", "pottyok"].forEach((x) => delete uj[x]);
    uj.type = this._config.type || "custom:tablet-pager-card";
    uj[k.interval] = this._interval;
    if (!this._showDots) uj[k.show_dots] = false;
    uj[k.cards] = this._cards;
    this._config = uj;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: uj }, bubbles: true, composed: true }));
  }

  async _render() {
    if (!this._hass || !this._config) return;
    await this._betolt();
    this._kesz = true;
    const t = this._t, sr = this.shadowRoot, n = this._cards.length, v = this._valasztott;
    sr.innerHTML = `
      <style>
        .fulek { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 16px 0 8px; }
        .ful { min-width: 36px; height: 32px; border-radius: 16px; border: 1px solid var(--divider-color); background: none;
          color: var(--primary-text-color); font: inherit; cursor: pointer; padding: 0 10px; }
        .ful.akt { background: var(--primary-color); border-color: var(--primary-color); color: var(--text-primary-color, #fff); }
        .eszkozok { display: flex; justify-content: flex-end; gap: 4px; margin-bottom: 8px; }
        .eszkozok button { border: 0; background: none; color: var(--primary-text-color); cursor: pointer; padding: 6px; border-radius: 50%; }
        .eszkozok button:disabled { opacity: .3; cursor: default; }
        .eszkozok button:hover:not(:disabled) { background: var(--secondary-background-color); }
      </style>
      <ha-form id="form"></ha-form>
      <div class="fulek">
        ${this._cards.map((_, i) => `<button class="ful ${i === v ? "akt" : ""}" data-i="${i}">${i + 1}</button>`).join("")}
        <button class="ful ${v === n ? "akt" : ""}" data-i="${n}" title="${t.add}" aria-label="${t.add}">+</button>
      </div>
      <div id="tartalom"></div>`;

    const form = sr.getElementById("form");
    form.hass = this._hass;
    form.data = { interval: this._interval, show_dots: this._showDots };
    form.schema = [
      { name: "interval", selector: { number: { min: 0, max: 3600, step: 1, mode: "box", unit_of_measurement: "s" } } },
      { name: "show_dots", selector: { boolean: {} } },
    ];
    form.computeLabel = (s) => t[s.name];
    form.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      this._interval = Number(ev.detail.value.interval) || 0;
      this._showDots = ev.detail.value.show_dots !== false;
      this._kuld();
    });

    sr.querySelectorAll(".ful").forEach((b) => b.addEventListener("click", () => { this._valasztott = Number(b.dataset.i); this._render(); }));

    const tartalom = sr.getElementById("tartalom");
    if (v === n) {
      const picker = document.createElement("hui-card-picker");
      picker.hass = this._hass;
      picker.lovelace = this._lovelace;
      picker.addEventListener("config-changed", (ev) => {
        ev.stopPropagation();
        this._cards = [...this._cards, ev.detail.config];
        this._valasztott = this._cards.length - 1;
        this._kuld();
        this._render();
      });
      tartalom.appendChild(picker);
      return;
    }

    const eszk = document.createElement("div");
    eszk.className = "eszkozok";
    eszk.innerHTML = `
      <button id="kod" title="${this._kodMod ? t.visual : t.code}"><ha-icon icon="${this._kodMod ? "mdi:eye" : "mdi:code-braces"}"></ha-icon></button>
      <button id="bal" title="${t.left}" ${v === 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-left"></ha-icon></button>
      <button id="jobb" title="${t.right}" ${v === n - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-right"></ha-icon></button>
      <button id="torol" title="${t.del}"><ha-icon icon="mdi:delete"></ha-icon></button>`;
    tartalom.appendChild(eszk);

    const szerk = document.createElement("hui-card-element-editor");
    szerk.hass = this._hass;
    szerk.lovelace = this._lovelace;
    szerk.value = this._cards[v];
    tartalom.appendChild(szerk);
    if (this._kodMod) szerk.updateComplete?.then(() => szerk.toggleMode?.());
    szerk.addEventListener("config-changed", (ev) => {
      ev.stopPropagation();
      if (!ev.detail.config) return;
      this._cards = this._cards.map((c, i) => (i === v ? ev.detail.config : c));
      this._kuld();
    });
    szerk.addEventListener("GUImode-changed", (ev) => { ev.stopPropagation(); this._kodMod = !ev.detail.guiMode; });

    const csere = (a, b) => { const l = [...this._cards]; [l[a], l[b]] = [l[b], l[a]]; this._cards = l; this._valasztott = b; this._kuld(); this._render(); };
    eszk.querySelector("#bal").addEventListener("click", () => csere(v, v - 1));
    eszk.querySelector("#jobb").addEventListener("click", () => csere(v, v + 1));
    eszk.querySelector("#kod").addEventListener("click", () => { this._kodMod = !this._kodMod; this._render(); });
    eszk.querySelector("#torol").addEventListener("click", () => {
      this._cards = this._cards.filter((_, i) => i !== v);
      this._valasztott = Math.max(0, Math.min(v, this._cards.length - 1));
      this._kuld();
      this._render();
    });
  }
}

customElements.define("tablet-pager-card", TabletPagerCard);
customElements.define("tablet-pager-card-editor", TabletPagerCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "tablet-pager-card",
  name: "Tablet Pager Card",
  description: "Swipeable, auto-advancing pages of any cards / Húzható, magától lapozó kártyák",
  preview: false,
  documentationURL: "https://github.com/Gyuszko55/tablet-pager-card",
});
console.info(`%c TABLET-PAGER-CARD %c ${VERSION} `, "color:#fff;background:#0b7fa8;font-weight:700", "color:#0b7fa8;background:#fff");
