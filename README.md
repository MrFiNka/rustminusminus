# rustminusminus

> ⚠️ **Very early development.** This is a work in progress and nothing here is stable yet —
> features, module contracts, database schemas, permission ids, API routes and configuration are
> all subject to change without notice or migrations. Expect breakage on update, and don't rely on
> it for anything you'd be upset to lose.

A Discord bot + web dashboard for managing [Rust+](https://rust.facepunch.com/companion) enabled
Rust servers, heavily inspired by
[rustplusplus](https://github.com/alexemanuelol/rustplusplus) by alexemanuelol — but built around
a different core idea: **every feature is a toggleable module**, controllable per Discord server
(guild) or per in-game team, live, without a bot restart.

Uses [rustminus](https://github.com/realspinelle/rustminus) (a from-scratch TypeScript rewrite of `rustplus.js`) for the actual Rust+ WebSocket/FCM protocol.

## What makes this different from a straight rustplusplus port

rustplusplus registers all ~24 of its commands unconditionally and gates them with a handful of
global boolean flags (`generalSettings.inGameCommandsEnabled`, etc.) — there's no way to turn one
feature on for one team and off for another, and no web UI at all.

Here, every feature (in-game chat commands, Discord slash commands, and whatever the web UI
exposes) is bundled as a **module**:

- Modules declare their own in-game commands, Discord commands, and settings schema.
- A module can be scoped `team`, `guild`, or `global`, and toggled at that granularity from the
  web dashboard.
- Toggling is instant: Discord commands are registered **per-guild** (not globally) and re-synced
  the moment a module's state changes; in-game commands are gated by an in-memory lookup checked
  on every incoming chat message — no bot restart, ever.
- Module settings are declarative. A module's `settingsSchema` drives both server-side validation
  and the form rendered on the team's Settings page, so adding a setting means adding one array
  entry — no UI work.
- Actions are permission-gated through a shared permission registry
  ([`src/permissions/definitions.ts`](src/permissions/definitions.ts)) enforced identically across
  all three surfaces: web, Discord, and in-game chat.

See [`src/modules/`](src/modules) for the module contract (`types.ts`), the registry
(`ModuleRegistry.ts`), the event dispatcher (`EventDispatcher.ts`), and `cross-team-chat` as the
smallest worked example. Deferred ideas are tracked in [`TODOLATER.md`](TODOLATER.md).

## Modules

| Module | Scope | Discord | In-game | Settings |
| --- | --- | --- | --- | --- |
| Cross-Team Chat | guild | `/chatlink create\|add\|remove\|list` | — | — |
| Team Tracker | team | `/team-status` | `!online` `!offline` `!dead` | log deaths / respawns / join-leave / online-offline |
| Smart Switches | team | `/switch list\|on\|off\|rename` | `!switch on\|off <name>` `!switches` | announce in team chat when toggled from Discord |
| Smart Alarms | team | `/alarm list\|rename` | `!alarms` | ping @everyone on trigger |
| Storage Monitors | team | `/storagemonitor list\|view\|rename` | `!tc <name>` `!box <name>` | — |
| Chat Relay | team | — (two-way Discord ↔ in-game team chat) | — | — |
| Server Info Panel | team | — (live pop/time/wipe embed) | `!pop` `!time` `!wipe` | — |
| Map Events | team | `/events` | `!cargo` `!heli` `!chinook` `!crate` `!events` | alert on cargo / heli / chinook / crate, ping @everyone |
| Raid Alerts | team | `/raidalert radius` | — | alert radius (meters), ping @everyone |
| Vending Search | team | `/market <item>` | `!market <item>` | — |

`!` is the default in-game prefix; it's configurable per team on the team's Settings page.

## Features

- Multi-guild, multi-team: one Discord server can manage several independent in-game teams, each
  with its own Rust+ connection, paired smart devices, and Discord category/channels/role.
- Auto-provisions per-team Discord channels (team chat, alarms, switches, storage monitors,
  servers, player activity, information, events) and a dedicated role.
- FCM listener auto-pairs smart switches/alarms/storage monitors and registers servers as
  pairing notifications arrive from the Rust+ companion app.
- Web dashboard (React + Discord OAuth login), server-rendered with the same route tree and
  loaders the client uses, so a page arrives populated rather than empty-then-fetching.
- **Live dashboard updates over a websocket**: the active server's device state, header stats and
  team chat are pushed to open pages as they change, with no polling or refresh.
- **Permission groups**: named, per-guild or per-team grants (e.g. "let this role toggle switches
  on this team only"), manageable from Discord or the dashboard, and enforced on the web API,
  Discord commands, and in-game chat commands alike.
- Cross-team chat relay module, with duplicate/echo-loop protection.
- Two-way team chat: messages sent from Discord or the dashboard go out in-game under the
  *sender's own* linked Rust account, not a shared bot account.
- Smart switch/alarm/storage-monitor modules with custom device naming, live-updating status
  embeds, and Discord + in-game commands.
- Map-event alerts (cargo ship, patrol heli, chinook, crates) and proximity-based raid alerts,
  via periodic map-marker polling (Rust+ has no push event for markers).

## Tech stack

Bun (runtime + package manager + bundler) · TypeScript · Discord.js v14 · MongoDB / Mongoose ·
Elysia (web server + websockets) · React 19 + react-router-dom v7 (SSR + client dashboard) ·
Tailwind CSS v4 · [rustminus](https://www.npmjs.com/package/rustminus) (Rust+ protocol client).

## Prerequisites

- [Bun](https://bun.sh)
- A MongoDB instance (local or hosted, e.g. MongoDB Atlas)
- A [Discord application](https://discord.com/developers/applications) with a bot user (you'll
  need its token, and the OAuth2 client secret for the web dashboard's login flow)
- A [Steam Web API key](https://steamcommunity.com/dev/apikey) — used to verify Steam IDs at
  account-link time and to show player names on the dashboard

## Setup

1. Install dependencies:
   ```sh
   bun install
   ```
2. Create a `.env` and fill in your own values:
   ```env
   TOKEN=your-discord-bot-token
   OAUTH_SECRET=your-discord-oauth2-client-secret
   BASE_URL=http://localhost:3000
   PORT=3000
   MONGODB_URI=mongodb://127.0.0.1/rustminusminus
   STEAM_API_KEY=your-steam-web-api-key
   NODE_ENV=production
   # Optional: Discord user id granted bot-owner-only surfaces (the global /modules page)
   OWNER_DISCORD_ID=
   ```
   `BASE_URL` is the dashboard's public origin — everything the bot links to (the OAuth redirect
   URI, the team page it posts on `/team create`) is built from it, so behind a reverse proxy it's
   the *external* address, not `localhost:PORT`. `PORT` is only what the server binds to locally.

   For a hosted MongoDB (e.g. Atlas) or one with auth enabled, `MONGODB_URI` just needs to be a
   full connection string with credentials, e.g.
   `mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/rustminusminus`.
3. In the Discord Developer Portal, add `<BASE_URL>/callback` as an OAuth2 redirect URI (it must
   match exactly), with the `identify` and `guilds` scopes.
4. Run it:
   ```sh
   bun start
   ```
   This connects to MongoDB, logs the Discord bot in, reconnects any previously-configured
   Rust+ teams, builds and serves the web dashboard, and starts the web server on `PORT`.

### Scripts

| Script | What it does |
| --- | --- |
| `bun start` | Run the bot + web server (production). |
| `bun run dev` | Same, with `NODE_ENV=development`: restarts on server-side changes, hot-rebuilds the dashboard, live-reloads the browser. |
| `bun run typecheck` | `tsc --noEmit`. |
| `bun run lint` | ESLint over the whole repo. |
| `bun run format` | Prettier write. |

### Docker

A `Dockerfile` is included. Supply the environment variables above at run time (they're
deliberately not baked into the image) and publish `PORT`.

## Discord commands

Always available:

- `/credentials add|delete` — link your Rust+ FCM/Steam credentials to your Discord account (used
  to receive pairing notifications and control servers on your behalf). The Steam ID is verified
  against the Steam API and can only be claimed by one Discord account.
- `/team create|delete|reset|setowner|invite|adduser|removeuser` — create/manage an in-game team and
  its Discord channels/role. `create`/`delete`/`reset` require Manage Server. `invite`/`removeuser`
  require Manage Server, team ownership, or the `teammembers.manage` permission for that team.
  `adduser` is the only way to join someone without asking them, so it needs the separate,
  guild-wide-only `teammembers.forceadd` — see [Team invites](#team-invites).
- `/permissions group create|delete|list|add-permission|remove-permission` and
  `/permissions assign|unassign` — manage permission groups and their members (Manage Server only).
  Groups are guild-wide by default, or scoped to a single team with the `team` option.

Everything else is module-owned: it only appears (and is only registered with Discord) once its
module is enabled for that guild/team, and disappears live if disabled — no bot restart. See the
[Modules](#modules) table above for the full list.

## Permissions

Two things can authorize an action:

1. Discord's **Manage Server** permission on the guild — always sufficient.
2. Membership of a **permission group** that grants the specific permission.

Groups are either guild-wide or scoped to one team. A guild-wide grant applies everywhere; a
team-scoped grant applies only to its own team. The same check backs the web API, Discord
commands, and in-game chat commands — with one deliberate exception: **there is no Manage Server
bypass in-game**, because a chat line carries no Discord admin context, so in-game commands
require an explicit grant and unlinked players are always denied.

Current permissions: `modules.manage`, `chatlinks.manage`, `switches.toggle`, `alarms.manage`,
`raidalerts.manage`, `storagemonitors.manage`, `vending.watch`, `activeserver.manage`,
`activecredential.manage`, `teammembers.manage`, `teammembers.forceadd`, `permissions.manage`,
`teampermissions.manage`, `settings.manage`.
They're declared in [`src/permissions/definitions.ts`](src/permissions/definitions.ts); the
dashboard and the `/permissions` command both enumerate that list, so adding one is a single entry.

A few permissions are marked guild-only and can't be put in a team-scoped group, because granting
them within one team would still be a guild-level delegation: `permissions.manage` (guild-wide
groups grant on *every* team) and `teammembers.forceadd` (see below).

### Team Modules and Settings

A team's **Modules** and **Settings** tabs are management surfaces, not member ones — being in the
team is not enough. Modules needs `modules.manage` (the same permission as the guild-wide Modules
screen; a team-scoped grant only reaches its own team, since the guild-level route resolves without
a teamId) and Settings needs `settings.manage`. Bot owner, Manage Server and the team's owner hold
both implicitly.

Each tab is hidden when you lack its permission, and the loader behind it re-checks with the *same*
rule as the mutation route, so a hidden tab isn't reachable by typing its URL.

### Team invites

Adding someone to a team is normally consensual. `/team invite` (or the Invite button on the team
page) DMs them an embed with **Accept** / **Refuse**; nothing changes until they press one.

Pending invites are rows in Mongo, not in-memory state, which is what makes them survive a bot
restart and makes them unforgeable: the button's `customId` carries only an invite id, and the
press is rejected unless the presser *is* the invitee. They expire after 24 hours (a TTL index,
re-checked in code so an unswept row can't be accepted late).

Skipping the invite is a separate permission, `teammembers.forceadd`, and it can only be granted in
a **guild-wide** group — putting someone in a team without their consent is a guild-level trust
decision, so a team lead delegating within their own team can't hand it out. Bot owner and Manage
Server hold it implicitly. The dashboard hides the "Add directly" button from anyone who lacks it,
and the API re-checks independently.

## Web dashboard

Visit the bot's web address (`BASE_URL`) and log in with Discord.

- `/guilds` — servers you can access (guild admins, team members, and permission-group members).
- `/guild/:id/modules` — enable/disable modules for the whole guild.
- `/guild/:id/teams` — the guild's teams; create new ones.
- `/guild/:id/teams/:teamId` — team detail: members, servers, active server/credential, live team
  status, and a live team chat panel you can send from.
- `/guild/:id/teams/:teamId/modules` — per-team module toggles (override the guild setting).
- `/guild/:id/teams/:teamId/settings` — in-game chat prefix and each enabled module's settings.
- `/guild/:id/teams/:teamId/servers/:serverId` — server detail: live player/queue/map/wipe stats,
  switches, alarms, tool cupboards and storage (with contents and upkeep), active map events,
  vending search, and device rename/unpair. Non-active servers can be pinged on demand for a
  one-off read.
- `/guild/:id/permissions` — permission groups and their members.
- `/guild/:id/chat-links` — cross-team chat link groups (shown once Cross-Team Chat is enabled).
- `/modules` — global module defaults (bot owner only, via `OWNER_DISCORD_ID`).

## Project layout

```
src/
  classes/           DiscordBot, WebServer, FmcListener, SteamApi (core services)
    routes/          Elysia API route groups + session/auth plugins
  rustplus/          RustPlus connection lifecycle, live snapshot store, device/marker helpers
  modules/           Module system: types, registry, dispatcher, settings, and each module
  permissions/       Permission registry + web/Discord/in-game enforcement
  server/            SSR: route loaders, data access, React render, server router
  client/            React dashboard (pages, layout, components, hooks)
  discord/           Shared Discord helpers (tracked/live-updating embeds)
  models/            Mongoose models: Guild, Team, User, Server, OAuth, ChatLink,
                     PermissionGroup, BotSettings
  discordCommands/   Core (always-registered) slash commands
  routeTree.tsx      Single route tree shared by the client and server routers
scripts/dev.ts       Dev runner (watch + restart)
```

## License

MIT
