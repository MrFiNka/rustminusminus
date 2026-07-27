# TODO Later

Ideas from the original rustminusminus vision that are deferred past the module-system-foundation
pass (see the architecture plan this came from for full context on why these were deferred).

## Game economy config
- Craft cost configuration UI (override/display Rust's crafting costs per item).
- Raid cost configuration UI (explosive/tool costs to raid different structure tiers).

## Feature parity with rustplusplus
Done, as individual modules on the module system (see `src/modules/`): `team-tracker`,
`smart-switches`, `smart-alarms`, `storage-monitors`, `chat-relay`, `server-info-panel`,
`map-events`, `raid-alerts`, `vending-search`. All previously-reserved permissions
(`switches.toggle`, `alarms.manage`, `raidalerts.manage`) plus two new ones
(`storagemonitors.manage`, `raidalerts.manage`'s config command) are now enforced by their
modules in `src/permissions/definitions.ts`. Deliberately excluded: anything BattleMetrics-based
(cross-server player search/tracking, offline population), in-game team-leader change (fragile
undocumented workaround upstream, and `rustminus`'s `promoteToLeader` only covers clan chat),
and voice/TTS relay (no voice infra in this bot, `chat-relay` already covers it textually).

Still open:
- **`calculators` module** (`/recycle`, `/craft`, `/decay`) — needs rustplusplus's curated
  recycler-yield/crafting-cost/decay-hours datasets (`recyclerData.json`/`craftData.json`/
  `decayData.json` equivalents). This repo's `items.json` (gitignored, deployer-supplied) only
  carries `Id`/`DisplayName`/`ShortName` — no balance data — so this needs sourcing/porting real
  data rather than guessing numbers.
- **`camera-preview` module** (`/camera <id>`, CCTV/PTZ) — flagged as a stretch goal in the
  parity plan; ray decoding + PTZ input + subscription lifecycle is significantly more complex
  than every other module for comparatively niche value. Build only if there's real demand.
- **Smart-device grouping** (control multiple switches as one named group) — deferred out of
  `smart-switches` v1 to ship the base module faster.
- **Discord button-based device toggles** — `smart-switches`/`smart-alarms`/`storage-monitors`
  use slash-command subcommands only; `DiscordBot.ts` has no component-interaction handling yet.

## Server detail page & Discord monitor fixes
- **Tool cupboard item list on server detail page** — show the items list for tool cupboards the
  same way storages already display theirs on the server detail page.
- **Storage monitor Discord channel messages are broken** — the monitor messages don't show the
  wipe/expiry time or the items-left count, and they only post for tool cupboards (TCs), not for
  regular storage boxes.
- **Switches and alarms not posting to their Discord channels** — smart-switch and smart-alarm
  events aren't being added to the Discord channels set up for them.

## Cross-team-chat follow-ups
- Link-group management UI in `Modules.tsx` (currently only enable/disable per team; creating
  and editing `ChatLink` groups is Discord-command-only in the foundation pass).
- Consider replacing the visible `RELAY_PREFIX` echo-loop guard with a short-TTL in-memory hash
  of recently-relayed messages, so relayed text doesn't carry a visible marker in-game.
- Consider whether cross-guild links (not just cross-team within one guild) are worth supporting.

## ~~WEBUI for Vending Search~~ / ~~A full featured map~~ — BUILT

Both sections below were implemented together (the map was a hard dependency of the market's
map coupling). What shipped:

- `src/rustplus/mapProjection.ts` — the world↔pixel transform, grid geometry and `gridCellCentre`,
  unit-tested against a real server's geometry; `toGridReference` now sits on top of it.
  **`AppMap.oceanMargin` is in pixels, not world units** — it's padding baked into the rendered JPEG,
  so the playable world occupies `width - 2*oceanMargin` px (measured: mapSize 5650, width 3825,
  margin 500 → 2825 px, exactly 2 world units per pixel). `mapSize + 2*oceanMargin` is *not* the
  image width and never was; assuming it stretched every overlay outward from the map centre by ~15%
  of its distance from centre (~1.4 grid cells half way to the edge). Verified by projecting Launch
  Site, Harbor 2 and The Dome onto the server's own JPEG and checking they land on the drawn
  features; those three are locked in as a regression test.
- `src/rustplus/monumentNames.ts` — curated token→name table with an algorithmic fallback.
- `src/modules/vending-search/{types,search,format}.ts` — structured `VendingOrder`/`MarketSnapshot`
  records; buy-side matching and out-of-stock listings retained; `formatOrder()` keeps `!market` and
  `/market` output byte-identical.
- `serverSnapshot.ts` — one cached `getMap()` payload serving both the image and new
  `getServerMapMeta`; wipe-triggered cache invalidation; `markers` and `teamInfo` frames pushed over
  the existing `/ws` (markers ride the 30s tick's existing `getMapMarkers()` call — no extra Rust+
  traffic, no second poll loop).
- `GET .../map-meta` and `GET .../market` routes (the latter replaces `POST .../vending-search`).
- `src/client/components/map/` — canvas+SVG viewer: pan/zoom, grid overlay with F1-matching labels,
  monument labels, live marker/team/vending layers, cargo/heli trails, marker popovers, right-click
  grid copy, `?focus=`/`?marker=` deep links, localStorage layer toggles.
- `src/client/components/market/` — whole-market browser grouped by shop, with cheapest-per-unit /
  stock / nearest sorts and blueprint & damaged-goods badges, coupled both ways to the map.
- Watchlists: `VendingWatch` model, edge-triggered evaluation (`watches.ts`, unit-tested), Discord
  delivery (`alerts.ts`), `onTick` poll counted in ticks, `vending.watch` permission, CRUD routes and
  in-panel UI.

### Remaining
- **Grid overlay anchoring is unconfirmed.** `gridCellCentre`/`gridOverlay` anchor the grid at world
  0 going north/east, so the last row and column overhang `mapSize` (39 cells × 146.3 = 5705.7 vs a
  5650 map). This matches the pre-existing `toGridReference` exactly, so the two can't disagree — but
  whether *Rust* anchors the same way hasn't been checked against the in-game F1 map. If labels are
  off by one near an edge, this is why.
- **Price history** (§4 below) — still deliberately not built.
- Monument table covers the tokens known at time of writing; unrecognised ones fall back to a derived
  name, so a Rust update degrades rather than breaks.

<details>
<summary>Original plan (kept for context)</summary>

## WEBUI for Vending Search (to integrate with the map)

Today the web side of `vending-search` is a single text box on the server detail page
(`ServerDetail.tsx`, the `hasModule("vending-search")` block): you type an item name, it POSTs to
`/servers/:serverId/vending-search`, and gets back `string[]` — lines like
`Rifle Body x1 for 250 Scrap — K14 (3 in stock)`. That shape comes from
`searchVendingMachines()` in `src/modules/vending-search/search.ts`, which formats for in-game chat
(the `!market` command truncates to 5 results) and hands the same pre-rendered strings to Discord
and the web. The grid reference is the only location information, and it's a string in the middle
of a sentence, so nothing downstream can put it on a map.

The goal is a real **market browser**: browse every machine's stock, filter/sort it, see where each
machine is on the map, and get pinged when something you want shows up.

### 1. Structured search results (prerequisite for everything else)

`searchVendingMachines()` has to stop returning display strings and start returning records:

```ts
interface VendingOrder {
    machineId: number;            // AppMarker.id — stable enough to group orders per machine
    machineName?: string;         // AppMarker.name, the shop's own sign
    x: number; y: number;         // world coords, for map pins
    grid: string;                 // toGridReference(x, y, info.mapSize), for chat/Discord
    itemId: number; itemName: string; itemShortName: string;
    quantity: number;             // units per purchase
    costPerItem: number;          // price per purchase
    currencyId: number; currencyName: string;
    amountInStock: number;
    itemIsBlueprint: boolean; currencyIsBlueprint: boolean;
    itemCondition?: number; itemConditionMax?: number;  // damaged-goods flag for weapons/tools
}
```

Everything above is already on `AppMarker`/`AppMarker_SellOrder` — the current code reads it and
throws most of it away. The chat/Discord formatting moves into a `formatOrder()` helper next to the
search so `!market` and `/market` keep their exact current output; only the web consumes the
records. Blueprint and condition flags matter in practice: a "Rifle Body" listing that's actually a
blueprint, or an AK at 40% durability, is a different offer at the same price, and neither is
distinguishable in today's output.

Two search-behaviour gaps worth closing while the shape changes:
- **Buy-side search.** The current filter only matches `sellOrders[].itemId` — what machines *sell*.
  Matching `currencyId` too answers "who will pay for my scrap/cloth", which is half of what people
  use vending machines for.
- **Out-of-stock.** `amountInStock <= 0` orders are dropped entirely. The browser should keep them
  and grey them out — knowing a shop *usually* sells rockets is useful even when it's empty, and
  it's the precondition for a restock alert.

### 2. Market browser page

New route under the server (`/guilds/:guildId/teams/:teamId/servers/:serverId/market`), or a full-
width panel on the server detail page — a text box is the wrong container for a few hundred orders.

- **Whole-market view, not just search hits.** Load every vending machine's every order once, then
  filter client-side. A wiped server has on the order of 10²–10³ orders total; that's a small JSON
  payload and it makes filtering instant.
- **Filters**: item name/shortname (fuzzy, as today), currency, price range, in-stock-only,
  blueprints-only, damaged-goods-only, grid area.
- **Sorts**: cheapest per unit (`costPerItem / quantity`, which the string form can't express),
  most stock, nearest to the team, newest listing.
- **Group by machine.** A shop is a coherent thing — one row per machine, expandable to its full
  stock, with its sign name and grid. Today ten orders from one shop look like ten unrelated results.
- **Map coupling both ways.** Hovering a result highlights its pin; clicking flies the map to it and
  opens the machine's stock in a popover; clicking a pin filters the list to that machine. This is
  the "integrate with the map" half, and it's why the map section below is a hard dependency.

### 3. Watchlists and alerts

A saved query per team (`VendingWatch` model: teamId, serverId, query, optional maxPrice, optional
currencyId, target Discord channel, created-by, enabled), evaluated on a poll.

- **Trigger conditions**: item appears in stock at all; price at or below a threshold; a previously
  seen listing restocks. All three are the same evaluation over consecutive snapshots.
- **Where the poll lives.** `vending-search` is a passive-hook-free module today. It can grow an
  `onTick` (see `RustModule.onTick` in `src/modules/types.ts`) that pulls markers on the existing
  live connection — same pattern `map-events` uses — so no new connection machinery is needed.
  Vending markers change slowly; a tick on the order of a minute is plenty and keeps the Rust+ call
  budget low.
- **De-duplication.** Alerting must be edge-triggered, not level-triggered, or a watch on
  "Sheet Metal Door under 50 scrap" fires every tick for a week. Keep the last-seen
  order-fingerprint set per watch (machineId + itemId + costPerItem) and only alert on transitions
  into the matching state.
- **Delivery**: Discord embed to the team's channel (reuse the `map-events` channel-resolution
  pattern), and optionally an in-game chat line for the team.
- **Permissions.** Searching stays open to team members (`requireTeamModuleEnabled`, matching
  `/market`'s lack of a permission gate). *Creating* watches is a mutation with a Discord-side
  notification effect, so it needs its own permission id in `src/permissions/definitions.ts`
  (`vending.watch` or similar) and `requireTeamModuleAccess` on the route — same split every other
  module already uses for read vs. manage.
- **Module settings** (`settingsSchema`): poll interval, max watches per team, whether alerts ping
  `@everyone`, default alert channel.

### 4. Constraints to design around

- **Active server only.** `searchVending()` refuses non-active servers, because vending data needs a
  live connection. Keep that, but say so in the UI instead of returning a bare 400 — the current
  page just shows an error banner.
- **Snapshot freshness.** The browser should show when the market data was last pulled, and offer a
  manual refresh, rather than silently serving a minutes-old snapshot as if it were live.
- **Price history is a stretch goal.** Storing every poll's orders would give per-item price trends
  over a wipe, which is genuinely interesting — but it's an unbounded write stream to Mongo. If it's
  built, it should be a per-team opt-in with a wipe-scoped retention window, not on by default.

## A full featured map instead of a sad image

Today the map is one `<img>` on the server detail page pointing at
`/guilds/:guildId/teams/:teamId/servers/:serverId/map`, with a click-to-lightbox. That route
(`teamsRoutes.ts`) calls `getServerMap()` in `src/rustplus/serverSnapshot.ts`, which fetches
`rustplus.getMap()` and returns **only `map.jpgImage`** — the raw JPEG Rust renders server-side.
The rest of the `AppMap` response (`width`, `height`, `oceanMargin`, `monuments`) is discarded, and
that discarded data is exactly what turns the image into a map.

Direction: **keep the server's JPEG as the base layer** and build an interactive overlay on top of
it. No terrain re-rendering — the Rust+ API doesn't expose heightmap or biome data, so a
from-scratch render would be inventing terrain. Everything below is achievable from data the API
already returns.

### 1. Map metadata endpoint

New `/servers/:serverId/map-meta` (or extend the snapshot) returning `width`, `height`,
`oceanMargin`, `monuments[]` from `AppMap`, plus `mapSize` from `AppInfo`. All of it is wipe-stable,
so it caches on the same `MAP_TTL_MS` as the image itself.

**The world→pixel transform is the load-bearing piece.** The JPEG is larger than the playable world
because Rust pads it with ocean on all four sides, and the y axis is flipped (world y grows north,
image y grows down):

```
px = (worldX + oceanMargin) / (mapSize + 2 * oceanMargin) * imageWidth
py = imageHeight - (worldY + oceanMargin) / (mapSize + 2 * oceanMargin) * imageHeight
```

This needs verifying against a real server before anything is built on it — every marker, the grid
overlay, and every vending pin inherit its error, and a transform that's subtly wrong looks like
"the pins drift toward the corners". Note the trap already documented on `toGridReference`:
`AppInfo.mapSize` (world units) and `AppMap.width` (pixels) are different scales and are easy to
mix up. Put the transform in one module (`src/rustplus/mapProjection.ts`) with unit tests over known
monument positions, and have both the client overlay and `toGridReference` sit on top of it.

### 2. Base viewer

- **Pan and zoom** with wheel/pinch, clamped to the image bounds, with a reset-view control. On a
  4000-unit map the current fixed-size image is unreadable — this is most of the perceived "sad".
- **Grid overlay**, toggleable: lines every `GRID_CELL_SIZE` (146.3 world units, already in
  `gridReference.ts`) with A–Z / row labels, matching the in-game F1 overlay. Live grid readout
  under the cursor.
- **Monument labels** from `AppMap.monuments`. These arrive as tokens (`"launchsite"`,
  `"airfield_display_name"`, …), so a token→display-name table has to be sourced — same category of
  work as the curated datasets the `calculators` module is blocked on, but far smaller.
- **Layer toggles** persisted per user, so someone who only cares about vending pins isn't fighting
  cargo/heli clutter every page load.

### 3. Live marker layers

`getMapMarkers()` is already being polled by the event dispatcher whenever a module declares
`onMapEvent` (that's how `map-events` works), so the data is in the process — it just never reaches
the browser. Layers, all from `AppMarker`:

- **Team members** — position, `rotation` for a facing arrow, alive/offline state, name. Comes from
  `AppTeamInfo` rather than markers, and `team-tracker` already consumes it.
- **Events** — cargo ship, patrol helicopter, CH47, locked crates, explosions. `map-events` already
  classifies these (`EVENT_LABELS_BY_MARKER_TYPE`); the map just draws what that module names, so
  the two stay in sync by construction.
- **Vending machines** — pins, coloured by whether they match the active market filter. This is the
  join point with the vending browser above.
- **Player-placed markers and the team's own map notes**, if `AppTeamInfo` notes are exposed.
- **Cargo/heli trails** — keep the last N polled positions client-side and draw a fading path.
  Cheap, since the polling already happens, and it's the difference between "cargo is at K14" and
  "cargo is heading for the north side".

Transport: push over the existing `/ws` connection rather than adding a polling loop in the client.
The dispatcher already has the marker diffs (`diffMapMarkers`); broadcasting them to watchers of
that team is a small addition next to a second independent poll. Marker updates are the *only* thing
that needs to be live — the base image and metadata are wipe-stable and should stay on their long
cache.

### 4. Interactions

- Click a marker → detail popover (vending machine's full stock, crate contents if known, event
  timing).
- Right-click / long-press → copy the grid reference, or post it to team chat via the existing
  chat-relay path.
- Deep links: `?focus=<grid>` or `?marker=<id>` so a Discord alert can link straight to the spot on
  the map. This makes `map-events` and `raid-alerts` embeds meaningfully more useful — a grid string
  becomes a clickable location.
- Raid alerts and map events drop a timestamped pin that fades over a few minutes.

### 5. Constraints

- **Non-active servers have no live markers.** The base image is fetchable for any paired server
  (`getServerMap` opens an ephemeral connection), but marker polling only runs on the active
  connection. The viewer must degrade to a static-but-still-zoomable map with monuments and grid,
  not error out.
- **Map image size.** These JPEGs run to several MB on large maps. They're already cached
  (`MAP_TTL_MS`, `MAP_CACHE_MAX_ENTRIES`, plus a 5-minute browser `Cache-Control`), and the cache
  key is per team+server — worth confirming the memory ceiling holds before adding a second consumer
  that fetches them more often.
- **Wipe invalidation.** Both the image and the metadata are only valid for one wipe. There's cache
  invalidation for snapshots (`invalidateServerSnapshot`); the map caches need the same treatment
  hung off wipe detection, or the first day after a wipe shows the previous map.

</details>