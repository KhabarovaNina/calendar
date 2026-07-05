# [CLAUDE.md](http://CLAUDE.md)

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

default language is russian

## What this is

A Cal.com-style booking platform. An **Organizer** publishes **Event Types** with their own **Availability** rules; anyone can book a free **Slot** on the public page `/book/{username}/{slug}` (no login required). See `CONTEXT.md` for the domain glossary (ubiquitous language, in Russian) — the terms there (`Organizer`, `Attendee`, `Event Type`, `Booking`, `Slot`, `Availability`, …) map directly to model names and are the vocabulary to use in code and commits.

Three halves:

1. **API spec** (repo root) — TypeSpec (`.tsp`) files that compile to an OpenAPI 3.1 document. This is the **contract**.
2. **Backend** (`server/`) — a real Express + SQLite (`better-sqlite3`) server that **hand-implements** the spec. Data persists in `server/data.db`. This is the default backend.
3. **Frontend** (`web/`) — a React + Mantine SPA. It calls `/api` (Vite proxies `/api` → the backend on `:4010`) using types generated from the OpenAPI document.

> Historical note: there used to be **no** backend — the frontend talked to a **Prism mock** generated from the spec's `@example` decorators. That mode still works (`make dev-mock` / `make mock`), but the real SQLite server is now the default.



## How the pieces connect (most important thing to understand)

The TypeSpec spec is the source of truth for the **shape** of the API. It feeds two things:

```
*.tsp  ──tsp compile──▶  tsp-output/schema/openapi.yaml
                            │
                            ├─ openapi-typescript ─▶ web/src/api/schema.d.ts   (frontend types)
                            │
                            └─ prism mock ─────────▶ :4010                      (LEGACY mock backend)

server/src/*.js  ───────hand-written───────────────▶ :4010                     (DEFAULT real backend)
```

Consequences — **the spec drives the frontend automatically, but the backend by hand:**

- `tsp-output/schema/openapi.yaml` and `web/src/api/schema.d.ts` are **generated — never edit by hand.** After editing any `.tsp` file, run `make spec` then `make gen` (or just `make gen`, which recompiles) so the frontend types pick up the change.
- The **backend in** `server/` **is NOT generated.** If you add or change a field / endpoint in the spec, you must **manually** update the matching handler in `server/src/index.js`, the model mapper in `server/src/models.js`, and (if a new column) the schema in `server/src/db.js`. Keeping the three in sync with the spec is a manual discipline — there is no codegen guardrail.
- Prism mock responses come from `@example(...)` blocks in the `.tsp` models. The real backend's demo data lives in `server/src/seed.js`, whose values intentionally mirror those examples.



## Commands

Use the **Makefile** (it wraps the npm scripts; comments are in Russian). Run `make help` for the list.

- `make install` — install deps for root, `web/`, **and** `server/`
- `make dev` — **default dev loop**: real SQLite backend (`:4010`) + Vite (`:5173`) together. Frontend at [http://localhost:5173](http://localhost:5173).
- `make back` — backend only (real SQLite server on `:4010`)
- `make back-seed` — seed the DB with demo data (only if empty)
- `make back-reset` — delete `data.db` and re-seed from scratch
- `make dev-mock` — **legacy** loop: Prism mock (`:4010`) + Vite (`:5173`)
- `make mock` — Prism mock server only (`:4010`)
- `make spec` — compile TypeSpec → `tsp-output/schema/openapi.yaml`
- `make gen` — regenerate frontend types (`web/src/api/schema.d.ts`) from OpenAPI
- `make docs` — build spec and serve Swagger UI at [http://localhost:8080/docs/](http://localhost:8080/docs/)
- `make typecheck` — `tsc --noEmit` in `web/`
- `make test` — run the **backend tests** in `server/test/` on Node's built-in test runner (`node:test`, i.e. `cd server && npm test`) — no extra framework. Run a single file with `cd server && node --test test/slots.test.js`. Two suites: `booking-flow.test.js` (integration/e2e over HTTP) and `slots.test.js` (unit tests of the pure slot-computation logic in `src/slots.js`).
- `make build` — production build of the frontend into `web/dist`

There is no linter configured, and the **frontend** has no test suite. `make typecheck` (`tsc --noEmit`) is the correctness check for frontend changes. The backend is plain JS with no typecheck — cover it with the `node:test` suites above and/or by running `make back` and hitting the endpoints.

## Commits

When the user asks to commit changes, write the message following the **Conventional Commits** standard: `type(scope): description`.

- **type** — one of: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **scope** (optional) — the affected area, preferably a domain term (`spec`, `server`, `web`, `slots`, `booking`, `auth`, `availability`, …).
- **description** — imperative mood, lowercase, no trailing period. **Write commit messages in English** (even though the rest of the project is in Russian).
- Commit body (optional) — after a blank line, explains *why*, not *what*. Mark breaking changes with `!` after the scope (e.g. `feat(server)!: ...`) or a `BREAKING CHANGE:` footer.

Examples: `feat(server): add /slots endpoint`, `fix(web): correct timezone in bookings list`, `docs: update domain glossary`.

## CI и релизы

GitHub Actions в `.github/workflows/` (все запускаются автоматически):

- **CI** (`ci.yml`) — на push в любую ветку и на PR в `main`/`dev`. Ставит зависимости всех трёх частей по lock-файлам, компилирует спеку (`make spec`) и типы (`make gen`), **проверяет дрифт** сгенерированного `web/src/api/schema.d.ts` (падает, если забыли `make gen` после правки `.tsp`), затем `make typecheck`, `make build`, `make test`. Push-триггер расширен до всех веток, чтобы чек привязывался к SHA и был виден в авто-создаваемых PR.
- **Auto PR** (`auto-pr.yml`) — на push в фичеветку (кроме `main`/`dev`/`release-please--**`) сам открывает PR в `main` с описанием из коммитов (`gh pr create --fill`); если PR уже открыт — пропускает.
- **Release Please** (`release-please.yml`) — на push в `main` ведёт release-PR: по Conventional Commits считает версию (`fix`→patch, `feat`→minor, `!`/`BREAKING`→major), обновляет `CHANGELOG.md` и бампит версию во всех трёх `package.json` в lockstep (`extra-files` в `release-please-config.json`). Мёрж release-PR создаёт тег и GitHub Release. Требует включённого «Allow GitHub Actions to create and approve pull requests» в настройках репозитория.

Шаблон описания PR — `.github/pull_request_template.md` (для PR, создаваемых вручную через UI).

## Layout

**Spec** (repo root):

- `main.tsp` — service definition + imports of the API modules. `common.tsp` — shared models (`ApiError`, `Page<T>`, `PaginationParams`), scalars (`Slug`, `TimeZone`), the `Weekday` enum.
- `api/` — one file per resource: `auth.tsp` (login/logout/register — public), `me.tsp`, `event-types.tsp`, `availability.tsp`, `bookings.tsp`, `slots.tsp`, `public.tsp` (organizer's public profile + open events, no auth). Each defines its models and a `@route`/`@tag` interface.
- `docs/adr/` — Architecture Decision Records (e.g. `0001-server-side-session-auth.md`). Consult these for the *why* behind cross-cutting choices before changing them.

**Backend** (`server/`, ESM, no build step):

- `src/index.js` — all Express routes. **Real auth via server-side sessions** (`express-session` + `better-sqlite3-session-store`, httpOnly cookie; see `docs/adr/0001`). The current user is `req.session.userId`; organizer routes are gated by the `requireAuth` middleware. Public routes (`/auth/`*, `/slots`, `/public/*`, booking create/cancel by UID) skip it. Listens on `BACKEND_PORT` (default `4010`). Errors use the spec's `ApiError` shape via the `apiError()` helper.
- `src/auth.js` — password hashing (`cryptjs`, cost 12; pure-JS, no native build) + `createOrganizer()`, which in one transaction inserts the user **and** a default schedule (a new organizer with no schedule would break `/slots`).
- `src/mailer.js` — `nodemailer` booking notifications (`notifyBookingCreated`/`notifyBookingCancelled`). Configured via `SMTP_*` env vars; **if** `SMTP_HOST` **is unset it falls back to a dev stub that only logs** (no mail leaves the machine). Mail failures are swallowed — they never fail the request, and send happens *after* the booking is persisted.
- `src/db.js` — opens `better-sqlite3` (WAL mode), `initSchema()` creates tables idempotently. Complex nested spec fields (`locations`, `availability`, `attendees`, …) are stored as **JSON strings in TEXT columns**; booleans as `0/1`. `DB_PATH` env var overrides the file location.
- `src/models.js` — row ↔ API-model mappers (`userToApi`, `scheduleToApi`, `eventTypeToApi`, `bookingToApi`). They parse the JSON columns, coerce booleans, and drop `undefined` keys so responses match the spec shape.
- `src/slots.js` — `computeSlots()`: derives free slots from a schedule's weekly rules + date overrides, slices into slot-length/interval steps, then filters out past time + `minimumBookingNotice`, the `bookingWindowDays` window, and overlaps with existing bookings (respecting buffers). Group events (`seatsPerTimeSlot`) decrement remaining seats instead of vanishing.
- `src/seed.js` — seeds a single demo user (`nina`) + schedule + event types into an empty DB; idempotent.
- `test/` — `node:test` suites: `booking-flow.test.js` (e2e over HTTP) and `slots.test.js` (unit tests of `src/slots.js`). Run via `cd server && npm test`.

**Frontend** (`web/`):

- `src/api/client.ts` — the single hand-written API layer. Wraps `openapi-fetch` (typed by generated `schema.d.ts`) with `baseUrl: "/api"` (Vite proxies to `:4010`, forwarding the session cookie). Exports typed model aliases and per-resource API objects (`authApi`, `meApi`, `eventTypesApi`, `availabilityApi`, `bookingsApi`, `publicApi`), plus `unwrap()` which throws `ApiError` on failure.
- `src/api/useApi.ts` — `useResource(fn, deps)` hook: fetch-on-mount + `reload()`, no caching.
- `src/pages/` — one component per route. Organizer pages (`LoginPage`, `ProfilePage`, `EventTypes*`, `Availability*`, `Bookings*`, …) sit at the top level; the **public booking flow** lives in `src/pages/public/` (`OrganizerPage`, `BookingPage`). `App.tsx` maps routes: public `/book/:username[/:slug]` under `PublicLayout`, everything else behind a `RequireAuth` guard + `Layout`. `components/Layout.tsx` is the organizer shell, `components/confirm.tsx` a confirm-dialog helper. `src/lib/format.ts` holds shared date/formatting helpers.

