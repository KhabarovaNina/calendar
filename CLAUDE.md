# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

default language is russian

## What this is

A Cal.com-style booking platform. An **Organizer** publishes **Event Types** with their own **Availability** rules; anyone can book a free **Slot** on the public page `/{username}/{slug}`. See `CONTEXT.md` for the domain glossary (ubiquitous language, in Russian) — the terms there (`Organizer`, `Attendee`, `Event Type`, `Booking`, `Slot`, `Availability`, …) map directly to model names and are the vocabulary to use in code and commits.

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
- The **backend in `server/` is NOT generated.** If you add or change a field / endpoint in the spec, you must **manually** update the matching handler in `server/src/index.js`, the model mapper in `server/src/models.js`, and (if a new column) the schema in `server/src/db.js`. Keeping the three in sync with the spec is a manual discipline — there is no codegen guardrail.
- Prism mock responses come from `@example(...)` blocks in the `.tsp` models. The real backend's demo data lives in `server/src/seed.js`, whose values intentionally mirror those examples.

## Commands

Use the **Makefile** (it wraps the npm scripts; comments are in Russian). Run `make help` for the list.

- `make install` — install deps for root, `web/`, **and** `server/`
- `make dev` — **default dev loop**: real SQLite backend (`:4010`) + Vite (`:5173`) together. Frontend at http://localhost:5173.
- `make back` — backend only (real SQLite server on `:4010`)
- `make back-seed` — seed the DB with demo data (only if empty)
- `make back-reset` — delete `data.db` and re-seed from scratch
- `make dev-mock` — **legacy** loop: Prism mock (`:4010`) + Vite (`:5173`)
- `make mock` — Prism mock server only (`:4010`)
- `make spec` — compile TypeSpec → `tsp-output/schema/openapi.yaml`
- `make gen` — regenerate frontend types (`web/src/api/schema.d.ts`) from OpenAPI
- `make docs` — build spec and serve Swagger UI at http://localhost:8080/docs/
- `make typecheck` — `tsc --noEmit` in `web/`
- `make build` — production build of the frontend into `web/dist`

There is no test suite and no linter configured. `make typecheck` is the available correctness check for frontend changes. The backend is plain JS with no typecheck — verify it by running `make back` and hitting the endpoints.

## Layout

**Spec** (repo root):
- `main.tsp` — service definition + imports of the API modules. `common.tsp` — shared models (`ApiError`, `Page<T>`, `PaginationParams`), scalars (`Slug`, `TimeZone`), the `Weekday` enum.
- `api/` — one file per resource: `me.tsp`, `event-types.tsp`, `availability.tsp`, `bookings.tsp`, `slots.tsp`. Each defines its models and a `@route`/`@tag` interface.

**Backend** (`server/`, ESM, no build step):
- `src/index.js` — all Express routes. No auth: the "current user" is hardcoded as `CURRENT_USER_ID = 1` (demo mode, same convention as the old mock). Listens on `BACKEND_PORT` (default `4010`). Errors use the spec's `ApiError` shape via the `apiError()` helper.
- `src/db.js` — opens `better-sqlite3` (WAL mode), `initSchema()` creates tables idempotently. Complex nested spec fields (`locations`, `availability`, `attendees`, …) are stored as **JSON strings in TEXT columns**; booleans as `0/1`. `DB_PATH` env var overrides the file location.
- `src/models.js` — row ↔ API-model mappers (`userToApi`, `scheduleToApi`, `eventTypeToApi`, `bookingToApi`). They parse the JSON columns, coerce booleans, and drop `undefined` keys so responses match the spec shape.
- `src/slots.js` — `computeSlots()`: derives free slots from a schedule's weekly rules + date overrides, slices into slot-length/interval steps, then filters out past time + `minimumBookingNotice`, the `bookingWindowDays` window, and overlaps with existing bookings (respecting buffers). Group events (`seatsPerTimeSlot`) decrement remaining seats instead of vanishing.
- `src/seed.js` — seeds a single demo user (`nina`) + schedule + event types into an empty DB; idempotent.

**Frontend** (`web/`):
- `src/api/client.ts` — the single hand-written API layer. Wraps `openapi-fetch` (typed by generated `schema.d.ts`) with `baseUrl: "/api"` (Vite proxies to `:4010`). Exports typed model aliases and per-resource API objects (`meApi`, `eventTypesApi`, `availabilityApi`, `bookingsApi`), plus `unwrap()` which throws `ApiError` on failure.
- `src/api/useApi.ts` — `useResource(fn, deps)` hook: fetch-on-mount + `reload()`, no caching.
- `src/pages/` — one component per route; `App.tsx` maps routes; `components/Layout.tsx` is the shell.
