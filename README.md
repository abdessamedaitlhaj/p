<div align="center">

# Pong Platform (Full-Stack Real‑Time Game, Chat, Tournaments)

Author: (Project Team)  
Last Documentation Sync: 2025-08-25

</div>

---

## ⚡ Overview

This repository contains a full‑stack TypeScript implementation of a real‑time Pong platform featuring:

- JWT + refresh token auth (multi-session)  
- Real-time chat & typing indicators  
- Local (same keyboard) and remote multiplayer games (authoritative server loop @ 60 FPS)  
- Matchmaking queue  
- Direct invites with concurrency / busy-state locks  
- Tournament system (countdown start, bracket, invites, elimination, persistence)  
- Player cumulative + per‑match analytics (rallies, momentum, streaks)  
- Modular state management (React Context + Zustand slices)  
- Activity locking to prevent conflicting actions  
- SQLite persistence with JSON snapshots for tournaments & game results  

This README consolidates detailed architecture, endpoint docs, data flows, and file roles.

---

## 📑 Table of Contents
1. Backend HTTP Endpoints
2. Socket.IO Event Endpoints
3. Exact Data Flow (Front ⇄ Back)
4. Frontend State Sharing & Management
5. Backend State Management
6. Locking / Notifiers (ActivityManager)
7. Database Schemas & CRUD
8. Local vs Remote Games (Rooms, Engine, Stats)
9. Tournament Management
10. Player Lock Life Cycle
11. Concepts / Modules / Libraries Used
12. React Concepts Applied
13. State Management Strategy (Zustand vs Context)
14. File-by-File Roles
15. Cross-File Interaction Highlights
16. Edge Cases & Error Handling
17. Potential Improvements / Extensions
18. Mental Model Cheat Sheet
19. Coverage Matrix (Requirements)

---

## 1. Backend HTTP API Endpoints (Fastify)

Base prefix: `/api`

### Auth (`server/routes/auth.ts`)
| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | /api/signin | { username, password } | Login, sets httpOnly refresh cookie, returns accessToken + user + session refresh token copy |
| POST | /api/signup | { username, password, email } | Create user (unique check), init player_stats |
| GET | /api/logout | Cookie jwt | Deletes session row, clears cookie |

### Token Refresh
| GET | /api/token/new | – | Uses refresh cookie → new access token + user |

### Users (`server/routes/users.ts`)
| GET | /api/user/:id | Authorization: Bearer accessToken | Returns single user |
| GET | /api/ | – | Returns all users |

### Messages (`server/routes/messages.ts`)
| GET | /api/messages/ | – | All messages (DESC) |
| POST | /api/messages/ | { sender_id, receiver_id, text } | Create message |
| GET | /api/messages/conversation/:userId/:otherUserId | – | Bidirectional conversation chronologically |

Game results & tournaments are persisted internally (no direct public GET yet).

---

## 2. Socket.IO Event Endpoints (Realtime)

Authentication / Presence:
- `join` userId → status online, join personal room.
- `logout` userId → status offline.

Typing / Chat:
- `istyping` rid → broadcast `typing`.
- `stop_typing` rid → broadcast `stop_typing`.
- `send_message` { sender_id, receiver_id, text } → store + emit `receive_message` to both.

Local Game:
- `join_game` { settings, userId, clientRoomId? } → create local GameRoom → `room_joined`.
- `start_game` → start if pending.
- `game_input` (key, isKeyDown) → queue paddle movement.
- `leave_game` { roomId? } → cleanup, unlock.

Remote Invite Flow:
- `send_invite` selectedUser.id → validate locks → `receive_invite` (target) & `invite_sent` (inviter).
- `accept_invite` { inviterId, inviteId? } → remote room, lock players → `remote_room_joined` for both.
- `decline_invite` { inviterId } → `invite_declined` & `invite_cleared`.

Remote Game:
- `remote_game_input` (key, isKeyDown)
- `remote_start_game`
- `join_remote_room` { roomId, playerId } (reconnect) → `remote_room_joined_success` & latest `remote_game_state`.

Matchmaking:
- `matchmaking_join` { settings? }
- `matchmaking_leave`
Events: `remote_room_joined`, `matchmaking_status`, `matchmaking_error`, `matchmaking_timeout`.

Tournament:
- `tournament_list`
- `tournament_create` { name, startsInMinutes }
- `tournament_join` { id }
- `tournament_leave` { id }
- `tournament_match_invite_response` { tournamentId, matchKey, response }
Server broadcasts: `tournament_countdown`, `tournament_match_invite`, `tournament_match_invite_update`, `tournament_bracket_update`, `tournament_completed`, `tournament_cancelled`.

Locks & User Activity:
- `user_locked` { reason }
- `user_unlocked`

Game State Streaming:
- `game_state` (local), `remote_game_state` (remote) at 60 FPS.

---

## 3. Exact Data Flow (Front ⇄ Back)

### Auth
1. Login → POST /signin → httpOnly refresh cookie + accessToken response.
2. Context reducer stores auth; effect syncs to Zustand user slice.
3. Socket connect triggers `join` (user presence & lock state push).
4. Refresh token via GET /token/new when needed (useRefreshToken hook).

### Chat
Conversation fetch over HTTP → stored in `chatSlice.messages`. New messages via socket `send_message` → persisted then echoed.

### Local Game
Hook `useLocalGame` emits `join_game` → server sends `room_joined`, then continuous `game_state` updates. Keyboard via `useGameInput` emits `game_input` events. On scoring server pauses briefly. Game end → result saved (local type, no cumulative stats).

### Remote Game / Invite
Invite workflow (pending → accept) creates RemoteGameRoom (matchType remote or matchmaking). `remote_room_joined` metadata saved to sessionStorage, navigation event triggers route. Hook `useRemoteGame` listens & replays state.

### Matchmaking
Queue join emits `matchmaking_join`. First pair available → remote room creation, lock players, streaming begins.

### Tournaments
List or join via socket. Tick system drives countdown & bracket invites. Remote games launched with matchType = tournamentId so results propagate into bracket.

### Persistence Pipeline
RemoteGameRoom end → `saveGameResult` → `insertGameResult` + `updatePlayerStats` + `tournamentManager.onGameResult` → bracket advancement (if tournament).

---

## 4. Frontend State Sharing & Management

Layers:
- React Context (AuthReducer) for login lifecycle & persistence toggle.
- Zustand root store (userSlice, chatSlice, socketSlice, gameEventsSlice) for granular, high-frequency game/chat updates.
- SessionStorage: remoteGameInfo (room metadata), tournament stage markers.
- LocalStorage: theme selection, persist flag, remoteThemeId.

Cross-Slice Interaction: `userSlice.setUser` defers ensureJoined (gameEventsSlice) after socket connect; `socketSlice.connect` triggers auto-join & initializes game listeners.

---

## 5. Backend State Management

| Manager | Purpose | Persistence | Key Methods |
|---------|---------|-------------|-------------|
| roomManager | Track active local & remote game rooms | Memory | createGameRoom, createRemoteGameRoom, deleteRemoteRoom |
| activityManager | User locks (match, tournament, pendingInvite) | Memory | lockForMatch, unlockFromMatch, setTournamentLock |
| tournamentManager | Tournaments + bracket + invites | Snapshot in `tournaments` table | create, join, tick, respondToMatchInvite, onGameResult |
| RemoteGameRoom/GameRoom | Game loop & physics per match | Memory (results persisted) | startGameLoop, handleInput, saveGameResult |

---

## 6. Locking / Notifiers

States per user: `{ inMatch, tournamentLocked, pendingInviteId }`.
- Match lock: set on pairing / invite accept; cleared on game completion or explicit leave.
- Tournament lock: during pre-start window (10 min), countdown, running; cleared on elimination or completion.
- Pending invite: blocks additional matchmaking/invites until resolved.
Events: `user_locked`, `user_unlocked` emitted to user personal room.

---

## 7. Database Schemas & CRUD

SQLite tables (creation in model files):
- users (status ENUM `'in_game'|'online'|'offline'` with CHECK)
- user_sessions (multi-session refresh tokens)
- player_stats (cumulative aggregates + streaks)
- messages
- friendships (future)
- usersettings (future customization)
- game_results (settings/perMatchStats JSON)
- matchistory (legacy)
- tournaments (serialized snapshot)

Key CRUD wrappers: Users (createUser/findBy...), Sessions (createSession, findSessionByToken, deleteSessionByToken, touchSession), Messages (createMessage, getAllMessages), Game Results (insertGameResult), Player Stats (ensurePlayerStats, updatePlayerStats), Tournaments (upsertTournament, loadTournaments).

Per-Match JSON (game_results.settings_json & per_match_stats_json) stores raw settings (without theme) and detailed analytics for remote games.

---

## 8. Local vs Remote Games (Rooms, Engine, Stats)

Shared Engine (`GameEngine.update`): paddle movement, wall/paddle collisions, dynamic bounce angle, incremental speed, scoring & reset.

Local (`GameRoom`): one socket controls both players (key mapping). Auto-start fallback if no manual start. Saves result (matchType 'local') without affecting cumulative player_stats.

Remote (`RemoteGameRoom`): two sockets; normalized inputs; tracks advanced stats (rallies, momentum, comeback factor). Disconnect/exit sets distinct endReason and awards score to opponent for clarity.

Stats Flow: RemoteGameRoom → remoteStats (rally and momentum tracking) → buildResult attaches perMatchStats → saveGameResult updates cumulative player_stats.

---

## 9. Tournament Management

Lifecycle: waiting → (10 min pre-window locks) → countdown (10s) → running → completed/cancelled.
Bracket: semi1, semi2, final; invites require acceptance (30s window) before spawning remote game (matchType=tournamentId).
Elimination reasons tracked; winner & runners-up persisted.
Persistence: every change upserted minus volatile invite timer IDs.
Locks: tournamentLocked applied automatically; cleared on elimination or end.

---

## 10. Player Lock Life Cycle

| Action | Lock Impact |
|--------|-------------|
| Accept invite / matchmaking pair | inMatch=true for both |
| Game completion / leave / disconnect | inMatch=false (unlockFromMatch / unlockUser) |
| Enter tournament pre-window | tournamentLocked=true |
| Elimination | tournamentLocked cleared (if not active elsewhere) |
| Tournament complete/cancel | All participants unlocked |
| Pending invite set | pendingInviteId for both (blocks new invites/matchmaking) |
| Invite consumed/cleared | pendingInviteId removed |

---

## 11. Concepts / Libraries Used

Backend: Fastify, Socket.IO, SQLite (sqlite3), bcrypt, jsonwebtoken.  
Frontend: React, Vite, Zustand, Tailwind, socket.io-client, react-hot-toast.  
Patterns: Authoritative server game loop, state snapshot emission, locking manager, tournament snapshot persistence, modular store slices.

---

## 12. React Concepts Applied

Custom hooks (local/remote game, auth, refresh token), reducer for auth, context-provider bridging to Zustand, effect-driven socket lifecycle, controlled keyboard listeners with cleanup, session/local storage synchronization, event-driven navigation (CustomEvent).

---

## 13. State Management Strategy (Zustand vs Context)

Context retained for legacy auth semantics & reducer ergonomics. Zustand adopted for:
- High-frequency updates (chat, game state) without broad rerenders.
- Slice modularity & simple cross-slice interactions.
Other tools (Redux, Recoil, React Query) considered overkill or orthogonal (React Query could later manage server-side caching for stats/history endpoints).

---

## 14. File-by-File Roles (Selective Summary)

| Path | Role |
|------|------|
| server/models/*.ts | Schema creation + query helpers |
| server/controllers/*.ts | HTTP handlers (auth, users, messages, statistics) |
| server/routes/*.ts | Fastify route registration |
| server/socket/registerHandlers.ts | All Socket.IO event wiring |
| server/game/*.ts | Game state, engine, room orchestration (local & remote) |
| server/roomManager.ts | Create/delete rooms, search & cleanup |
| server/activityManager.ts | User locking (match/tournament/invite) |
| server/tournamentManager.ts | Tournament orchestration & persistence |
| server/tournament/*.ts | Bracket logic, flow control, helper functions |
| server/models/GameResults.ts | Game results persistence (JSON snapshots) |
| server/models/PlayerStats.ts | Cumulative stat aggregation logic |
| client/context/* | Auth reducer + provider bridging to Zustand |
| client/store/slices/* | Modular Zustand slices (user/chat/socket/events) |
| client/hooks/* | Encapsulated side-effect logic (games, auth, refresh) |
| client/components/* | UI elements (chat, invites, nav, game rendering) |
| client/lib/themes.ts | Theme catalog & accessors |
| client/lib/gameConfig.ts | Base client game configs |
| shared/api.ts | (Shared API utilities placeholder) |

---

## 15. Cross-File Interaction Highlights

- `userSlice.setUser` → triggers `ensureJoined` (gameEventsSlice) after socket connect.
- Invite acceptance: socket handler → `roomManager.createRemoteGameRoom` → `RemoteGameRoom.saveGameResult` → `statistics.saveGameResult` → `tournamentManager.onGameResult`.
- `remoteStats.buildResult` attaches analytics feeding `game_results` + player cumulative stats logic.
- Tournament `tick` influences ActivityManager locks in real time.

---

## 16. Edge Cases & Error Handling

- Duplicate remote room creation avoided by pre-check in `createRemoteGameRoom`.
- Room deletion race guarded (<500ms old) to prevent premature cleanup.
- Invalid or stale invite prevented (pendingInviteId mismatch) on accept.
- Matchmaking ignores users already locked or busy.
- Disconnect mid-game awards opponent finalizing clear result state.
- Per-player stats safeguarded by ensurePlayerStats recursion if row absent.

---

## 17. Potential Improvements / Extensions

1. Public endpoints for player stats & match history (paginate game_results).  
2. Friendships CRUD & presence-based filtering.  
3. Migrate or remove legacy `matchistory` table.  
4. Input validation (zod / TypeBox) for all HTTP + socket payloads.  
5. Rate limiting & brute-force protection on auth routes.  
6. UI surfaces for lock reasons (disable buttons w/ tooltips).  
7. Analytics dashboard (longest rally, win streak charts).  
8. Spectator mode socket namespace (read-only state stream).  
9. Reconnection resilience (persist remote inputs / resume).  
10. Recording & replay (store state sequence deltas).  

---

## 18. Mental Model Cheat Sheet

Auth: Refresh cookie + stateless access token; sessions table tracks multi devices.
Realtime: Personal user rooms for direct events; global per-room broadcast for games.
Locks: Central map ensures consistent concurrency rules (no overlapping invites or queue + match + tournament conflict).
Games: Server authoritative physics; clients only send key transitions.
Stats: Per-match JSON + cumulative aggregation enabling future UX dashboards.
Tournaments: Snapshot persisted → resilient to restarts; invites ensure readiness fairness.
Frontend: Context (auth) + Zustand (everything else) + ephemeral sessionStorage bridging refresh transitions.

---

## 19. Coverage Matrix (Original Documentation Requirements)

| Requirement | Section(s) |
|-------------|------------|
| Front & backend endpoints | 1, 2 |
| Data flow back ↔ front | 3 |
| Data sharing frontend | 4 |
| State management (front/back) | 4, 5 |
| Notifiers / locks | 6, 10 |
| DB schemas & CRUD | 7 |
| Local & remote games (rooms & stats) | 8 |
| Tournament management | 9 |
| Player locking constraints | 10 |
| Concepts/modules/plugins | 11 |
| React concepts | 12 |
| Zustand vs Context vs others | 13 |
| File roles | 14 |
| Cross-file relations | 15 |
| Edge cases | 16 |
| Improvements | 17 |
| Mental model | 18 |
| Coverage mapping | 19 |

---

## 🛠 Quick Start (Dev)

```bash
# Install
npm install

# Run server + client (adjust scripts as defined in package.json)
npm run dev

# (If separate) start server at :3000 and Vite dev at :5173
```

Ensure environment variables for JWT secrets (e.g., `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`) are set.

---

## 📄 License

Add license details here.

---

## 🤝 Contributing

1. Fork & branch from `main`  
2. Follow existing TypeScript & naming patterns  
3. Document new socket events & DB migrations in README  
4. Submit PR with concise summary  

---

## 🙌 Acknowledgements

Thanks to the open-source ecosystem powering Fastify, Socket.IO, React, Vite, and Zustand.

---

End of documentation.
