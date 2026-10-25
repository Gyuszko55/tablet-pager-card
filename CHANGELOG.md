# Changelog

## 1.1.0 – 2026-10-25

- **Endless strip:** `strip: true` (+ optional `card_width`) shows as many cards side by side as the width allows; it steps left, the card that leaves joins the end, and with too few cards the first ones come again. / Végtelen szalag.
- **Tabs:** `navigation: tabs` with name, icon and badge per card; the line under the active tab shows the time left. / Fülek.
- **Fade** and **vertical** (ticker) effects. / Áttűnés és függőleges hírsor.
- **Entity rows:** a page without `type` is a one-line entity row; tap opens its details. / Entitás-sor.
- Visual editor: effect, navigation, strip and card width, tab settings, entity rows.
- Existing configurations work unchanged.

## 1.0.1 – 2026-10-25

- HACS validation workflow added; no functional change. / HACS-ellenőrzés hozzáadva, működésbeli változás nincs.

## 1.0.0 – 2026-10-25

- First public release / Első nyilvános kiadás.
- Swipe, dots, automatic paging that pauses on touch, wrap-around.
- Pages of paused inner cards (`paused` / `szunetel`) are hidden.
- Visual editor (interval, dots, add / reorder / delete / edit inner cards).
- English and Hungarian config keys.
