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
