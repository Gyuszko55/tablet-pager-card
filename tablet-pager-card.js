// Tablet Pager Card (custom:tablet-pager-card) – https://github.com/Gyuszko55/tablet-pager-card
// Several Home Assistant cards in one place, paging by themselves every `interval` seconds.
// Touching the card restarts the timer, so it never moves away while in use. Any card can be a page.
// If an inner card exposes `paused === true` (or the Hungarian `szunetel`), its page, dot and tab are hidden.
// No dependencies. Hungarian keys are accepted as aliases.
//
// Four ways to use it:
//   effect: slide            pages glide in sideways, swipe with a finger or mouse (default)
//   effect: slide, strip: true    endless strip: as many cards as fit side by side (the last one partly), steps left,
//                                 the card leaving moves to the end; with too few cards the first ones come again
//   effect: fade, navigation: tabs   tab bar with a progress line, pages cross-fade
//   effect: vertical         news ticker: rows roll upwards; a page may be a simple entity row
//
// type: custom:tablet-pager-card
// interval: 30          # seconds, 0 = no automatic paging
// effect: slide         # slide | fade | vertical
// navigation: dots      # dots | tabs | none
// strip: false          # endless strip (slide only)
// card_width: 260       # strip: width of one card in px; omitted = each card's own width
// tabs:                 # with navigation: tabs – one entry per card, in the same order
//   - { name: Calendar, icon: mdi:calendar, badge: sensor.events_today }
// cards:
//   - type: entities
//     entities: [light.kitchen]
//   - entity: sensor.fuel_price   # a card without `type` is a simple entity row (icon, name, value)
//     icon: mdi:gas-station
//     color: "#7fd18b"

const VERSION = "1.1.0";

const HATASOK = ["slide", "fade", "vertical"];
const NAVIGACIOK = ["dots", "tabs", "none"];

const normalize = (config) => {
  const cards = config.cards ?? config.kartyak;
  const interval = config.interval ?? config.valtas_mp ?? 30;
  const showDots = config.show_dots ?? config.pottyok ?? true;
  let effect = config.effect ?? config.hatas ?? "slide";
  if (!HATASOK.includes(effect)) effect = "slide";
  let navigation = config.navigation ?? config.navigacio ?? (showDots === false ? "none" : effect === "vertical" ? "none" : "dots");
  if (!NAVIGACIOK.includes(navigation)) navigation = "dots";
  const strip = effect === "slide" && (config.strip ?? config.szalag) === true;
  const cardWidth = Number(config.card_width ?? config.kartya_szelesseg) > 0 ? Number(config.card_width ?? config.kartya_szelesseg) : null;
  const tabs = config.tabs ?? config.fulek ?? [];
  return { ...config, cards, interval: Number(interval) || 0, effect, navigation, strip, card_width: cardWidth, tabs: Array.isArray(tabs) ? tabs : [] };
};

const ESC = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sorE = (kc) => kc && !kc.type && kc.entity !== undefined;

// ---------------------------------------------------------------------------------------------
// Simple entity row (a page without `type`): icon, name, value; tap opens the entity's details.

class TabletPagerRow extends HTMLElement {
  setConfig(config) {
    this._config = config;
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" }).innerHTML = `
        <style>
          :host { display: block; }
          .sor { display: flex; align-items: center; gap: 10px; height: 100%; min-height: 30px; padding: 0 4px; cursor: pointer;
            font-size: 15px; white-space: nowrap; overflow: hidden; color: var(--primary-text-color); }
          .ikon { color: var(--szin, var(--state-icon-color)); --mdc-icon-size: 20px; flex-shrink: 0; display: flex; }
          .nev { color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; }
          .ertek { font-weight: 600; color: var(--szin, var(--primary-text-color)); margin-left: auto; overflow: hidden; text-overflow: ellipsis; }
        </style>
        <div class="sor" id="sor"><span class="ikon" id="ikon"></span><span class="nev" id="nev"></span><span class="ertek" id="ertek"></span></div>`;
      this.shadowRoot.getElementById("sor").addEventListener("click", () => {
        if (this._config?.entity) this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId: this._config.entity }, bubbles: true, composed: true }));
      });
    }
    this.style.setProperty("--szin", config.color || "");
    if (!config.color) this.style.removeProperty("--szin");
    this._rajz();
  }

  set hass(hass) {
    // redrawn on every update: translations may arrive after the state, and a row is cheap to draw
    this._hass = hass;
    this._st = hass?.states?.[this._config?.entity];
    this._rajz();
  }

  _rajz() {
    const sr = this.shadowRoot, c = this._config, st = this._st;
    if (!sr || !c) return;
    const ikonHely = sr.getElementById("ikon");
    if (!this._ikon || this._ikon.localName !== (c.icon ? "ha-icon" : "ha-state-icon")) {
      this._ikon = document.createElement(c.icon ? "ha-icon" : "ha-state-icon");
      ikonHely.replaceChildren(this._ikon);
    }
    if (c.icon) this._ikon.icon = c.icon;
    else { this._ikon.hass = this._hass; this._ikon.stateObj = st; }
    const ir = (id, szoveg) => { const el = sr.getElementById(id); if (el.textContent !== szoveg) el.textContent = szoveg; };
    ir("nev", c.name ?? st?.attributes?.friendly_name ?? c.entity ?? "");
    ir("ertek", !st ? "—" : this._hass?.formatEntityState
      ? this._hass.formatEntityState(st)
      : `${st.state}${st.attributes.unit_of_measurement ? " " + st.attributes.unit_of_measurement : ""}`);
  }

  getCardSize() { return 1; }
}

// ---------------------------------------------------------------------------------------------

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
    [...(this._kartyak || []), ...(this._klonok || [])].forEach((k) => { k.hass = hass; });
    this._szur();
    this._jelvenyek();
  }

  get _szalag() { return this._config.strip; }
  get _rakas() { return this._config.effect !== "slide"; }

  // Recompute the visible pages; when it changes, hidden pages and their dots/tabs disappear.
  _szur() {
    if (!this._kartyak) return;
    const lathato = this._kartyak.map((k, i) => (k.paused === true || k.szunetel === true ? -1 : i)).filter((i) => i >= 0);
    if (!lathato.length) lathato.push(0);
    if (this._lathato && lathato.join() === this._lathato.join()) return;
    const akt = this._lathato?.[this._lap];
    this._lathato = lathato;
    const sr = this.shadowRoot;
    sr.querySelectorAll(".lap").forEach((l) => { l.hidden = !lathato.includes(Number(l.dataset.i)); });
    sr.querySelectorAll(".potty, .ful").forEach((p) => { p.hidden = !lathato.includes(Number(p.dataset.i)); });
    sr.getElementById("pottyok").hidden = this._config.navigation !== "dots" || !this._lapozhato;
    this._lap = Math.max(0, lathato.indexOf(akt));
    if (this._szalag) { this._peldany = 0; this._szalagKitolt(); this._szalagIgazit(); }
    this._mutat();
    this._idozit();
  }

  get _lapozhato() { return (this._lathato?.length ?? this._config.cards.length) > 1; }

  _jelvenyek() {
    if (this._config?.navigation !== "tabs" || !this._hass) return;
    this.shadowRoot.querySelectorAll(".ful").forEach((f) => {
      const ent = this._config.tabs[Number(f.dataset.i)]?.badge;
      const db = f.querySelector(".db");
      const ertek = ent ? this._hass.states[ent]?.state : undefined;
      const szam = Number(ertek);
      const mutat = ertek !== undefined && !["unknown", "unavailable", "off", ""].includes(ertek) && !(Number.isFinite(szam) && szam <= 0);
      db.hidden = !mutat;
      if (mutat) db.textContent = ertek === "on" ? "!" : ertek;
    });
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
    const tab = (i) => c.tabs[i] || {};
    const fulNev = (i) => tab(i).name ?? c.cards[i]?.title ?? c.cards[i]?.name ?? String(i + 1);
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: flex; flex-direction: column; height: 100%; --szel: ${c.card_width ? `${c.card_width}px` : "auto"}; }
        .ablak { position: relative; flex: 1; overflow: hidden; touch-action: pan-y; border-radius: var(--ha-card-border-radius, 12px); }
        .sav { display: flex; height: 100%; transition: transform .6s cubic-bezier(.22,.8,.3,1); will-change: transform; }
        .sav.huz, .sav.nyugt { transition: none; user-select: none; -webkit-user-select: none; }
        .lap { flex: 0 0 100%; min-width: 0; display: flex; flex-direction: column; }
        .lap > * { flex: 1; }
        .lap[hidden], .potty[hidden], .pottyok[hidden], .ful[hidden] { display: none; }
        /* endless strip: cards side by side at their width, a small gap between them */
        .szalag .ablak { margin: 0 -4px; border-radius: 0; }
        .szalag .lap { flex: 0 0 auto; width: var(--szel); padding: 0 4px; box-sizing: border-box; }
        /* fade / vertical: pages stacked in one grid cell, so the height is the tallest page's */
        .rakas .sav { display: grid; transition: none; }
        .rakas .lap { grid-area: 1 / 1; transition: opacity .6s ease, transform .6s ease, visibility 0s linear .6s; visibility: hidden; opacity: 0; }
        .rakas .lap.akt { visibility: visible; opacity: 1; transform: none; transition: opacity .6s ease, transform .6s ease, visibility 0s; }
        .fuggoleges .ablak { touch-action: auto; }
        .fuggoleges .lap { transform: translateY(100%); opacity: 0; }
        .fuggoleges .lap.el { transform: translateY(-100%); }
        .pottyok { display: flex; justify-content: center; gap: 8px; padding: 8px 0 0; }
        .potty { width: 8px; height: 8px; border-radius: 4px; border: 0; padding: 0; cursor: pointer;
          background: var(--secondary-text-color); opacity: .3; transition: width .3s, opacity .3s; }
        .potty.akt { width: 22px; opacity: .85; background: var(--primary-color); }
        .fulek { display: flex; border-bottom: 1px solid var(--divider-color); margin-bottom: 6px; }
        .ful { flex: 1; position: relative; display: flex; align-items: center; justify-content: center; gap: 7px; min-width: 0;
          padding: 9px 6px 8px; border: 0; background: none; color: var(--primary-text-color); font: inherit; font-size: 15px;
          cursor: pointer; opacity: .55; white-space: nowrap; }
        .ful span.nev { overflow: hidden; text-overflow: ellipsis; }
        .ful ha-icon { --mdc-icon-size: 19px; flex-shrink: 0; }
        .ful.akt { opacity: 1; font-weight: 600; }
        .ful .csik { position: absolute; left: 0; bottom: -1px; height: 2px; width: 0; background: var(--primary-color); }
        .ful.akt .csik { width: 100%; }
        .ful.akt.ido .csik { animation: tolt var(--ido) linear forwards; }
        @keyframes tolt { from { width: 0; } to { width: 100%; } }
        .ful .db { background: var(--error-color, #e5484d); color: #fff; border-radius: 9px; font-size: 11px; padding: 0 6px; line-height: 17px; font-weight: 700; }
        .ful .db[hidden] { display: none; }
        .potty:focus-visible, .ful:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .sav, .potty, .lap { transition: none !important; } .ful.akt.ido .csik { animation: none; width: 100%; } }
      </style>
      <div id="keret" style="display:contents">
        ${c.navigation === "tabs" ? `<div class="fulek" role="tablist">${c.cards.map((_, i) => `
          <button class="ful" role="tab" data-i="${i}">${tab(i).icon ? `<ha-icon icon="${ESC(tab(i).icon)}"></ha-icon>` : ""}<span class="nev">${ESC(fulNev(i))}</span><span class="db" hidden></span><span class="csik"></span></button>`).join("")}</div>` : ""}
        <div class="ablak" id="ablak"><div class="sav" id="sav"></div></div>
        <div class="pottyok" id="pottyok">${c.cards.map((_, i) => `<button class="potty" data-i="${i}" aria-label="${i + 1}"></button>`).join("")}</div>
      </div>`;
    const sr = this.shadowRoot;
    const keret = sr.getElementById("keret");
    // the layout class goes on the host's wrapper so every rule above can key off it
    const osztaly = this._szalag ? "szalag" : this._rakas ? `rakas${c.effect === "vertical" ? " fuggoleges" : ""}` : "";
    keret.className = osztaly;
    sr.getElementById("pottyok").hidden = c.navigation !== "dots" || c.cards.length < 2;
    sr.querySelectorAll(".potty, .ful").forEach((p) => p.addEventListener("click", () => {
      const i = Number(p.dataset.i);
      this._ugrik(this._lathato ? this._lathato.indexOf(i) : i);
    }));
    this._huzas(sr.getElementById("ablak"), sr.getElementById("sav"));

    this._helpers = await window.loadCardHelpers();
    if (epites !== this._epites) return; // a newer setConfig already rebuilt the card
    const sav = sr.getElementById("sav");
    this._klonok = [];
    this._peldany = 0;
    this._kartyak = c.cards.map((kc, i) => {
      const { lap, el } = this._lapKeszit(kc, i, 0);
      sav.appendChild(lap);
      return el;
    });
    this._ro?.disconnect();
    if (this._szalag) {
      // card widths settle only after the cards render, and the strip may be resized: refill when either changes
      this._ro = new ResizeObserver(() => this._szalagKitolt());
      this._ro.observe(sr.getElementById("ablak"));
      this._lapElemek().forEach((l) => this._ro.observe(l));
    }
    this._lathato = null;
    this._szur();
    this._jelvenyek();
  }

  // one page: a wrapper with the card (or entity row); k > 0 marks a copy made to fill the strip
  _lapKeszit(kc, i, k) {
    const lap = document.createElement("div");
    lap.className = "lap";
    lap.dataset.i = i;
    lap.dataset.k = k;
    let el;
    if (sorE(kc)) { el = document.createElement("tablet-pager-row"); el.setConfig(kc); }
    else {
      el = this._helpers.createCardElement(kc);
      // a card whose type is still loading replaces itself once ready
      el.addEventListener("ll-rebuild", (ev) => {
        ev.stopPropagation();
        const uj = this._helpers.createCardElement(kc);
        if (this._hass) uj.hass = this._hass;
        lap.replaceChild(uj, lap.firstChild);
        [this._kartyak, this._klonok].forEach((t) => { const x = t?.indexOf(el); if (x >= 0) t[x] = uj; });
      }, { once: true });
    }
    if (this._hass) el.hass = this._hass;
    lap.appendChild(el);
    return { lap, el };
  }

  _huzas(ablak, sav) {
    let x0 = 0, y0 = 0, dx = 0, huz = false, lenn = false, id = null;
    ablak.addEventListener("pointerdown", (e) => {
      lenn = true; huz = false; dx = 0; x0 = e.clientX; y0 = e.clientY; id = e.pointerId;
      this._idozit();
    });
    ablak.addEventListener("pointermove", (e) => {
      if (!lenn || e.pointerId !== id || this._config.effect === "vertical" || this._mozog) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!huz) {
        // a swipe only starts after 12 px of mostly horizontal travel; until then a tap stays a tap
        if (Math.abs(mx) < 12 || Math.abs(mx) < Math.abs(my) * 1.3 || !this._lapozhato) return;
        huz = true;
        ablak.setPointerCapture(id);
        sav.classList.add("huz");
        window.getSelection()?.removeAllRanges(); // a mouse drag may already have started selecting text
      }
      dx = mx;
      // fade only decides at the end; slide and strip follow the finger
      if (this._szalag) sav.style.transform = `translateX(${dx}px)`;
      else if (!this._rakas) sav.style.transform = `translateX(calc(${-this._lap * 100}% + ${dx}px))`;
    });
    const vege = (e) => {
      if (!lenn || e.pointerId !== id) return;
      lenn = false;
      if (!huz) return;
      sav.classList.remove("huz");
      const lepes = this._szalag ? this._elsoSzel() : ablak.clientWidth;
      const kuszob = lepes * (this._szalag ? 0.3 : 0.18);
      if (this._szalag) {
        if (dx < -kuszob) this._szalagElore(dx);
        else if (dx > kuszob) this._szalagHatra(dx);
        else sav.style.transform = "translateX(0)";
        this._idozit();
      } else if (dx < -kuszob) this._ugrik(this._lap + 1);
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
    const uj = ((i % n) + n) % n;
    if (this._szalag) {
      const d = (uj - this._lap + n) % n;
      if (d === 1) this._szalagElore(0);
      else if (d === n - 1) this._szalagHatra(0);
      else if (d) { this._lap = uj; this._szalagIgazit(); this._mutat(); }
      this._idozit();
      return;
    }
    this._lap = uj;
    this._mutat();
    this._idozit();
  }

  // --- endless strip: the DOM order of the pages rotates, the strip itself always rests at 0 ---

  _lapElemek() { return [...this.shadowRoot.querySelectorAll(".lap")]; }

  _elsoSzel() { return this._lapElemek().find((l) => !l.hidden)?.offsetWidth || this.shadowRoot.getElementById("ablak").clientWidth; }

  // With too few cards to fill the width, add copies of the whole set (only as many as needed), so that
  // after the last card the first one comes again. Recounted when the width or the card sizes change.
  _szalagKitolt() {
    if (!this._szalag || !this._kartyak || !this._lathato) return;
    const sr = this.shadowRoot, sav = sr.getElementById("sav");
    const szeles = sr.getElementById("ablak").clientWidth;
    const eredeti = this._lapElemek().filter((l) => l.dataset.k === "0" && !l.hidden);
    const osszes = eredeti.reduce((a, l) => a + l.offsetWidth, 0);
    if (!szeles || !osszes) return;
    const legszelesebb = Math.max(...eredeti.map((l) => l.offsetWidth));
    const kell = eredeti.length > 1 ? Math.max(1, Math.ceil((szeles + legszelesebb) / osszes)) : 1;
    if (kell === this._peldany || this._mozog) return;
    this._peldany = kell;
    this._lapElemek().filter((l) => l.dataset.k !== "0").forEach((l) => { this._ro?.unobserve(l); l.remove(); });
    this._klonok = [];
    for (let k = 1; k < kell; k++) {
      this._config.cards.forEach((kc, i) => {
        const { lap, el } = this._lapKeszit(kc, i, k);
        lap.hidden = !this._lathato.includes(i);
        sav.appendChild(lap);
        this._klonok.push(el);
      });
    }
    this._szalagIgazit();
  }

  // put the current leading page first, keeping the cyclic order (copies follow the originals)
  _szalagIgazit() {
    const sav = this.shadowRoot.getElementById("sav");
    const akt = String(this._lathato?.[this._lap] ?? 0);
    const lapok = this._lapElemek().sort((a, b) => a.dataset.k - b.dataset.k || a.dataset.i - b.dataset.i);
    const k = lapok.findIndex((l) => l.dataset.i === akt);
    [...lapok.slice(k), ...lapok.slice(0, k)].forEach((l) => sav.appendChild(l));
    sav.classList.add("nyugt");
    sav.style.transform = "translateX(0)";
    void sav.offsetWidth;
    sav.classList.remove("nyugt");
  }

  _szalagElore(dx) {
    const sav = this.shadowRoot.getElementById("sav");
    if (this._mozog || !this._lapozhato) { sav.style.transform = "translateX(0)"; return; }
    this._mozog = true;
    const lepes = this._elsoSzel();
    sav.style.transform = `translateX(${-lepes}px)`;
    setTimeout(() => {
      // move the page that left (and any hidden ones before it) to the end, then rest at 0 again
      const lapok = this._lapElemek();
      let k = 0;
      while (k < lapok.length && lapok[k].hidden) k++;
      lapok.slice(0, k + 1).forEach((l) => sav.appendChild(l));
      sav.classList.add("nyugt");
      sav.style.transform = "translateX(0)";
      void sav.offsetWidth;
      sav.classList.remove("nyugt");
      this._lap = (this._lap + 1) % this._lathato.length;
      this._mutat();
      this._mozog = false;
    }, Math.abs(dx) > lepes ? 50 : 620);
  }

  _szalagHatra(dx) {
    const sav = this.shadowRoot.getElementById("sav");
    if (this._mozog || !this._lapozhato) { sav.style.transform = "translateX(0)"; return; }
    this._mozog = true;
    // bring the last visible page (and hidden ones after it) to the front, shifted out of view, then slide in
    const lapok = this._lapElemek();
    let k = lapok.length - 1;
    while (k > 0 && lapok[k].hidden) k--;
    lapok.slice(k).reverse().forEach((l) => sav.insertBefore(l, sav.firstChild));
    const lepes = this._elsoSzel();
    sav.classList.add("nyugt");
    sav.style.transform = `translateX(${dx - lepes}px)`;
    void sav.offsetWidth;
    sav.classList.remove("nyugt");
    sav.style.transform = "translateX(0)";
    this._lap = (this._lap - 1 + this._lathato.length) % this._lathato.length;
    this._mutat();
    setTimeout(() => { this._mozog = false; }, 620);
  }

  _mutat() {
    const sr = this.shadowRoot;
    const sav = sr?.getElementById("sav");
    if (!sav) return;
    const akt = this._lathato ? this._lathato[this._lap] : this._lap;
    if (this._rakas) {
      sr.querySelectorAll(".lap").forEach((l) => {
        const i = Number(l.dataset.i);
        if (i === akt) {
          if (l.classList.contains("akt")) return;
          // come in from below: jump to the starting position without animation first
          l.style.transition = "none"; l.classList.remove("el"); void l.offsetWidth; l.style.transition = "";
          l.classList.add("akt");
        } else if (l.classList.contains("akt")) { l.classList.remove("akt"); l.classList.add("el"); }
      });
    } else if (!this._szalag) sav.style.transform = `translateX(${-this._lap * 100}%)`;
    sr.querySelectorAll(".potty").forEach((p) => p.classList.toggle("akt", Number(p.dataset.i) === akt));
    sr.querySelectorAll(".ful").forEach((f) => {
      const ez = Number(f.dataset.i) === akt;
      f.classList.toggle("akt", ez);
      f.setAttribute("aria-selected", ez);
    });
  }

  _idozit() {
    clearTimeout(this._idozito);
    const mp = this._config?.interval || 0;
    // restart the tab's progress line together with the timer
    const ful = this.shadowRoot?.querySelector(".ful.akt");
    if (ful) {
      ful.classList.remove("ido");
      if (mp > 0 && this._lapozhato) { ful.style.setProperty("--ido", `${mp}s`); void ful.offsetWidth; ful.classList.add("ido"); }
    }
    if (mp <= 0 || document.hidden || !this.isConnected || !this._lapozhato) return;
    this._idozito = setTimeout(() => this._ugrik(this._lap + 1), mp * 1000);
  }

  getCardSize() { return this._config?.effect === "vertical" && this._config.cards.every(sorE) ? 1 : 6; }

  getGridOptions() { return { columns: 12, min_columns: 3, rows: "auto" }; }
}

// ---------------------------------------------------------------------------------------------
// Visual editor: general settings via ha-form, one tab per inner card with HA's own card editor
// (or a small form for a simple entity row), plus the tab's name/icon/badge in tab mode.

const SZOVEG = {
  en: { interval: "Automatic paging (seconds, 0 = off)", effect: "Effect", navigation: "Navigation", strip: "Endless strip", card_width: "Card width in the strip (px, empty = the card's own width)",
    slide: "Slide", fade: "Fade", vertical: "Vertical (ticker)", dots: "Dots", tabs: "Tabs", none: "None",
    add: "Add card", addRow: "Add entity row", left: "Move left", right: "Move right", del: "Delete card", code: "Code editor", visual: "Visual editor",
    tabName: "Tab name", tabIcon: "Tab icon", tabBadge: "Tab badge (entity, shown when not 0)",
    entity: "Entity", name: "Name", icon: "Icon", color: "Color (e.g. #7fd18b)" },
  hu: { interval: "Automatikus lapozás (másodperc, 0 = ki)", effect: "Lapváltás", navigation: "Navigáció", strip: "Végtelen szalag", card_width: "Kártyaszélesség a szalagban (px, üres = a kártya saját szélessége)",
    slide: "Beúszás", fade: "Áttűnés", vertical: "Függőleges (hírsor)", dots: "Pöttyök", tabs: "Fülek", none: "Nincs",
    add: "Kártya hozzáadása", addRow: "Entitás-sor hozzáadása", left: "Mozgatás balra", right: "Mozgatás jobbra", del: "Kártya törlése", code: "Kódszerkesztő", visual: "Vizuális szerkesztő",
    tabName: "Fül neve", tabIcon: "Fül ikonja", tabBadge: "Fül számlálója (entitás, 0 felett látszik)",
    entity: "Entitás", name: "Név", icon: "Ikon", color: "Szín (pl. #7fd18b)" },
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
    const van = (k) => k in (config || {});
    // keep the user's own key names (Hungarian or English) when writing back
    this._kulcs = {
      cards: van("kartyak") && !van("cards") ? "kartyak" : "cards",
      interval: van("valtas_mp") && !van("interval") ? "valtas_mp" : "interval",
      tabs: van("fulek") && !van("tabs") ? "fulek" : "tabs",
    };
    this._config = config || {};
    this._cards = Array.isArray(c.cards) ? c.cards : [];
    this._tabs = this._cards.map((_, i) => c.tabs[i] || {});
    this._alap = { interval: c.interval, effect: c.effect, navigation: c.navigation, strip: c.strip, card_width: c.card_width ?? undefined };
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
    const k = this._kulcs, a = this._alap;
    const uj = { ...this._config };
    ["cards", "kartyak", "interval", "valtas_mp", "show_dots", "pottyok", "effect", "hatas", "navigation", "navigacio",
      "strip", "szalag", "card_width", "kartya_szelesseg", "tabs", "fulek"].forEach((x) => delete uj[x]);
    uj.type = this._config.type || "custom:tablet-pager-card";
    uj[k.interval] = a.interval;
    if (a.effect !== "slide") uj.effect = a.effect;
    if (a.navigation !== (a.effect === "vertical" ? "none" : "dots")) uj.navigation = a.navigation;
    if (a.effect === "slide" && a.strip) {
      uj.strip = true;
      if (a.card_width > 0) uj.card_width = a.card_width;
    }
    // tab settings only when tabs are shown, trailing empty entries dropped
    if (a.navigation === "tabs") {
      const tabs = this._tabs.map((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v !== "" && v != null)));
      while (tabs.length && !Object.keys(tabs[tabs.length - 1]).length) tabs.pop();
      if (tabs.length) uj[k.tabs] = tabs;
    }
    uj[k.cards] = this._cards;
    this._config = uj;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: uj }, bubbles: true, composed: true }));
  }

  _urlap(data, schema, valtozik) {
    const f = document.createElement("ha-form");
    f.hass = this._hass;
    f.data = data;
    f.schema = schema;
    f.computeLabel = (s) => this._t[s.label || s.name] ?? s.name;
    f.addEventListener("value-changed", (ev) => { ev.stopPropagation(); valtozik(ev.detail.value); });
    return f;
  }

  async _render() {
    if (!this._hass || !this._config) return;
    await this._betolt();
    this._kesz = true;
    const t = this._t, sr = this.shadowRoot, n = this._cards.length, v = this._valasztott, a = this._alap;
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
        .fulbeall { margin-bottom: 12px; padding: 4px 0 8px; border-bottom: 1px solid var(--divider-color); }
        .sorgomb { display: flex; justify-content: center; margin: 4px 0 12px; }
        .sorgomb button { font: inherit; border: 1px solid var(--primary-color); color: var(--primary-color); background: none;
          border-radius: 18px; padding: 6px 14px; cursor: pointer; display: flex; gap: 6px; align-items: center; }
      </style>
      <div id="altalanos"></div>
      <div class="fulek">
        ${this._cards.map((_, i) => `<button class="ful ${i === v ? "akt" : ""}" data-i="${i}">${i + 1}</button>`).join("")}
        <button class="ful ${v === n ? "akt" : ""}" data-i="${n}" title="${t.add}" aria-label="${t.add}">+</button>
      </div>
      <div id="tartalom"></div>`;

    const valaszt = (opts) => ({ select: { mode: "dropdown", options: opts.map((o) => ({ value: o, label: t[o] })) } });
    const schema = [
      { name: "interval", selector: { number: { min: 0, max: 3600, step: 1, mode: "box", unit_of_measurement: "s" } } },
      { type: "grid", name: "", schema: [
        { name: "effect", selector: valaszt(HATASOK) },
        { name: "navigation", selector: valaszt(NAVIGACIOK) },
      ] },
    ];
    if (a.effect === "slide") schema.push({ name: "strip", selector: { boolean: {} } });
    if (a.effect === "slide" && a.strip) schema.push({ name: "card_width", selector: { number: { min: 60, max: 2000, step: 1, mode: "box", unit_of_measurement: "px" } } });
    sr.getElementById("altalanos").appendChild(this._urlap({ ...a }, schema, (uj) => {
      const ujra = uj.effect !== a.effect || uj.navigation !== a.navigation || !!uj.strip !== !!a.strip;
      this._alap = { interval: Number(uj.interval) || 0, effect: uj.effect || "slide", navigation: uj.navigation || "dots", strip: !!uj.strip,
        card_width: Number(uj.card_width) > 0 ? Number(uj.card_width) : undefined };
      this._kuld();
      if (ujra) this._render();
    }));

    sr.querySelectorAll(".ful").forEach((b) => b.addEventListener("click", () => { this._valasztott = Number(b.dataset.i); this._render(); }));

    const tartalom = sr.getElementById("tartalom");
    const hozzaad = (kc) => {
      this._cards = [...this._cards, kc];
      this._tabs = [...this._tabs, {}];
      this._valasztott = this._cards.length - 1;
      this._kuld();
      this._render();
    };
    if (v === n) {
      const gomb = document.createElement("div");
      gomb.className = "sorgomb";
      gomb.innerHTML = `<button type="button"><ha-icon icon="mdi:format-list-text"></ha-icon>${t.addRow}</button>`;
      gomb.querySelector("button").addEventListener("click", () => hozzaad({ entity: "" }));
      tartalom.appendChild(gomb);
      const picker = document.createElement("hui-card-picker");
      picker.hass = this._hass;
      picker.lovelace = this._lovelace;
      picker.addEventListener("config-changed", (ev) => { ev.stopPropagation(); hozzaad(ev.detail.config); });
      tartalom.appendChild(picker);
      return;
    }

    const sor = sorE(this._cards[v]);
    const eszk = document.createElement("div");
    eszk.className = "eszkozok";
    eszk.innerHTML = `
      ${sor ? "" : `<button id="kod" title="${this._kodMod ? t.visual : t.code}"><ha-icon icon="${this._kodMod ? "mdi:eye" : "mdi:code-braces"}"></ha-icon></button>`}
      <button id="bal" title="${t.left}" ${v === 0 ? "disabled" : ""}><ha-icon icon="mdi:arrow-left"></ha-icon></button>
      <button id="jobb" title="${t.right}" ${v === n - 1 ? "disabled" : ""}><ha-icon icon="mdi:arrow-right"></ha-icon></button>
      <button id="torol" title="${t.del}"><ha-icon icon="mdi:delete"></ha-icon></button>`;
    tartalom.appendChild(eszk);

    if (a.navigation === "tabs") {
      const fb = document.createElement("div");
      fb.className = "fulbeall";
      fb.appendChild(this._urlap({ ...this._tabs[v] }, [
        { type: "grid", name: "", schema: [
          { name: "name", label: "tabName", selector: { text: {} } },
          { name: "icon", label: "tabIcon", selector: { icon: {} } },
        ] },
        { name: "badge", label: "tabBadge", selector: { entity: {} } },
      ], (uj) => { this._tabs = this._tabs.map((x, i) => (i === v ? uj : x)); this._kuld(); }));
      tartalom.appendChild(fb);
    }

    const cserel = (kc) => { this._cards = this._cards.map((c, i) => (i === v ? kc : c)); this._kuld(); };
    if (sor) {
      tartalom.appendChild(this._urlap({ ...this._cards[v] }, [
        { name: "entity", selector: { entity: {} } },
        { type: "grid", name: "", schema: [
          { name: "name", selector: { text: {} } },
          { name: "icon", selector: { icon: {} } },
        ] },
        { name: "color", selector: { text: {} } },
      ], (uj) => cserel(Object.fromEntries(Object.entries(uj).filter(([k, x]) => k === "entity" || (x !== "" && x != null))))));
    } else {
      const szerk = document.createElement("hui-card-element-editor");
      szerk.hass = this._hass;
      szerk.lovelace = this._lovelace;
      szerk.value = this._cards[v];
      tartalom.appendChild(szerk);
      if (this._kodMod) szerk.updateComplete?.then(() => szerk.toggleMode?.());
      szerk.addEventListener("config-changed", (ev) => { ev.stopPropagation(); if (ev.detail.config) cserel(ev.detail.config); });
      szerk.addEventListener("GUImode-changed", (ev) => { ev.stopPropagation(); this._kodMod = !ev.detail.guiMode; });
      eszk.querySelector("#kod").addEventListener("click", () => { this._kodMod = !this._kodMod; this._render(); });
    }

    const csere = (x, y) => {
      const l = [...this._cards], f = [...this._tabs];
      [l[x], l[y]] = [l[y], l[x]]; [f[x], f[y]] = [f[y], f[x]];
      this._cards = l; this._tabs = f; this._valasztott = y; this._kuld(); this._render();
    };
    eszk.querySelector("#bal").addEventListener("click", () => csere(v, v - 1));
    eszk.querySelector("#jobb").addEventListener("click", () => csere(v, v + 1));
    eszk.querySelector("#torol").addEventListener("click", () => {
      this._cards = this._cards.filter((_, i) => i !== v);
      this._tabs = this._tabs.filter((_, i) => i !== v);
      this._valasztott = Math.max(0, Math.min(v, this._cards.length - 1));
      this._kuld();
      this._render();
    });
  }
}

customElements.define("tablet-pager-row", TabletPagerRow);
customElements.define("tablet-pager-card", TabletPagerCard);
customElements.define("tablet-pager-card-editor", TabletPagerCardEditor);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "tablet-pager-card",
  name: "Tablet Pager Card",
  description: "Auto-advancing pages of any cards: slide, endless strip, tabs or ticker / Magától lapozó kártyák: beúszás, szalag, fülek, hírsor",
  preview: false,
  documentationURL: "https://github.com/Gyuszko55/tablet-pager-card",
});
console.info(`%c TABLET-PAGER-CARD %c ${VERSION} `, "color:#fff;background:#0b7fa8;font-weight:700", "color:#0b7fa8;background:#fff");
