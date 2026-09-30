# Verification evidence

วันที่ทดสอบ: 29 กันยายน 2026 · Windows / Node 22 · Development milestone

ล่าสุด: 44 automated tests ผ่าน (3 files) หลังเพิ่ม Group/OAuth และคง default TTL ตาม v2 TypeScript/lint และ production build ของ source ล่าสุดผ่านแล้ว การสแกน source/browser chunks ไม่พบค่าของ private credentials ที่ตั้งไว้ ทั้งหมดเป็น local verification ไม่ใช่ production deployment หรือ cloud integration test

## Automated

`tests/domain.test.ts`: Thai/ISO date parsing, leap days, Bangkok midnight, captured button date, immutable inputs, both job types × both systems, stable sequence/names and no content-level dedupe, image signature, size metadata, Retry-After and nonretryable permission handling.

`tests/database.test.ts`: migration executes in PGlite PostgreSQL engine; unique active draft/context, cross-workspace FK, inbox dedupe, separate messages retained, immutable snapshot/Drive ID triggers; viewer/nonmember/anonymous read and mutation restrictions.

`tests/workflow.test.ts`: calls the actual Bot handler and worker against the same migration with pg-compatible adapter. Drive and Telegram are fakes. Exercises photo-first flow → opaque menus → preview → transaction confirm → job processing; wrong actor/stale callback; full hierarchy; crash after Drive create and after upload; same-name/date new session; fencing of old worker; stop before provisioning.

เพิ่ม tests ของ 4 group actors แบบ interleaved, source reply/topic isolation, ForceReply actor/revision matching, explicit group rollout gate, OAuth PKCE/one-time state, encrypted refresh token/tamper protection และปฏิเสธ browser access ต่อ private OAuth tables/input prompts

PGlite is real PostgreSQL compiled to WASM, but it is not Supabase Cloud, does not reproduce pooler/network behavior, and these tests are sequential. They **do not prove** multi-process race safety on the deployed database. Supabase auth schema/roles are test fixtures, not the production Auth service.

## T01–T30 mapping

| IDs | Evidence / outstanding |
|---|---|
| T01–T04 | Handler/unit tests for photo-first, choosing different folders, pending new name and cancel; live preference presentation still needs UAT |
| T05–T08 | Four hierarchy nodes + new folder per session + duplicate confirmation tests with fake Drive |
| T09–T12 | Unit dates/revisions and selected-date snapshot; future date warning in preview |
| T13–T14 | Message order and snapshot tests; real late-album race and arrival-during-confirm stress test pending |
| T15 | Wrong actor callback test; real groups deliberately disabled pending UAT |
| T16 | Unique normalized folder/node constraints implemented; real two-worker same-name race test pending |
| T17 | Inbox dedupe + DB identity uniqueness tested |
| T18–T20 | Fake Drive crash-window and expired lease generation tests; cloud equivalents pending |
| T21–T22 | Worker partial/retry mechanics and retry policy; real quota/token failures pending |
| T23 | Ancestry/mismatch guards implemented; real rename/move/trash UAT pending |
| T24–T25 | Separate messages retained; signature/date/media validation unit tests; cloud size-limit test pending |
| T26 | RLS negative tests in PGlite; real Supabase login/logout/cookie/role E2E pending |
| T27 | Server-only modules, ignored env, source/browser secret scan; production build/log review still required |
| T28–T30 | Durable outbox/lease recovery implemented; actual send timeout, multi-file stop and restored DB exercise pending |

## Manual browser QA

Dashboard demo verified in Codex browser: Thai labels, search by SEE, 1 matching row, partial file count, details, simulated retry, mobile menu and interactive Bot flow. Changes remain in browser state only. Desktop/mobile screenshots captured during QA where available; no screenshot represents a real Drive upload.

## Release gate

No Definition of Done production checkbox is claimed complete from mocks alone. Before production: prepare isolated Bot/root/workspace, apply migrations with permission, configure schedule, run T01–T30 end-to-end scenarios, evaluate limits and roles, record actual evidence, obtain UAT and deployment authorization.
