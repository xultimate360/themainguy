# Security Specification — Satire News Desk (v3.0 Phase 2)

## 1. Data Invariants & Master Source of Truth

1. **Single-Owner Zero-Trust Gate**:
   - All collections are private to the owner (`OWNER_EMAIL = "mamtadevi9329@gmail.com"` with `email_verified == true` and a non-empty `request.auth.uid`).
   - Unauthenticated (`request.auth == null`) and non-owner accounts (`request.auth.token.email != "mamtadevi9329@gmail.com"` or `email_verified != true`) are denied on every single collection (`read` and `write`).
2. **Client-Writable Collections (`sources`, `starred`, `scripts`, `desk`, `settings`)**:
   - The owner may read and write `sources/{sourceId}`, `starred/{storyId}`, `scripts/{scriptId}`, `desk/{uid}`, and `settings/{uid}` only when `isValidId(...)` and `isValid[Entity](incoming())` pass.
   - For `desk/{uid}` and `settings/{uid}`, `uid` must match `request.auth.uid` (or `"current"` / `"user"` when owned by the verified owner).
3. **Server-Write-Only Collections (`stories`, `feedIndex`, `stats`, `meta`, `agentRuns`, `demo`)**:
   - Only the server (Admin SDK) may write to `stories/{storyId}`, `feedIndex/{dayKey}`, `stats/{dayKey}`, `meta/{docId}`, `agentRuns/{runId}`, and `demo/{docId}`.
   - Client writes (`create`, `update`, `delete`) to these collections are unconditionally denied (`if false`), even for the authenticated owner.
   - The verified owner has read-only (`get`, `list`) access.
4. **Server-Only Internal Collections (`seen`, `locks`)**:
   - `seen/{shardId}` (`0..f`) and `locks/{lockId}` (`locks/tick`) are never readable or writable by any client (`allow read, write: if false;`).

---

## 2. The "Dirty Dozen" Payloads (Adversarial Penetration Test Cases)

1. **Payload 1 (Signed-Out Read on `stories`)**: `auth = null`, `GET /stories/story_123` -> `PERMISSION_DENIED`.
2. **Payload 2 (Signed-Out Read on `sources`)**: `auth = null`, `GET /sources/src_ie_top` -> `PERMISSION_DENIED`.
3. **Payload 3 (Other Account Read on `stories`)**: `auth = { uid: "attacker_1", email: "attacker@gmail.com", email_verified: true }`, `GET /stories/story_123` -> `PERMISSION_DENIED`.
4. **Payload 4 (Unverified Email Spoof on `sources`)**: `auth = { uid: "spoof_1", email: "mamtadevi9329@gmail.com", email_verified: false }`, `GET /sources/src_ie_top` -> `PERMISSION_DENIED`.
5. **Payload 5 (Client Write to Server-Only `stories` by Owner)**: `auth = Owner`, `SET /stories/story_123` with valid story payload -> `PERMISSION_DENIED`.
6. **Payload 6 (Client Write to Server-Only `feedIndex` by Owner)**: `auth = Owner`, `SET /feedIndex/2026-11-14` -> `PERMISSION_DENIED`.
7. **Payload 7 (Client Read of Internal `seen` Shard by Owner)**: `auth = Owner`, `GET /seen/a` -> `PERMISSION_DENIED`.
8. **Payload 8 (Client Read of Internal `locks/tick` by Owner)**: `auth = Owner`, `GET /locks/tick` -> `PERMISSION_DENIED`.
9. **Payload 9 (Shadow Field Injection on `sources` Create)**: `auth = Owner`, `CREATE /sources/src_custom_1` with `{ ..., isAdmin: true }` -> `PERMISSION_DENIED`.
10. **Payload 10 (ID Poisoning on `sources`)**: `auth = Owner`, `CREATE /sources/bad$id!with spaces` -> `PERMISSION_DENIED`.
11. **Payload 11 (Value Poisoning on `sources.trust`)**: `auth = Owner`, `CREATE /sources/src_custom_2` with `trust: 99` (outside `1..5`) -> `PERMISSION_DENIED`.
12. **Payload 12 (Oversized Array on `desk.storyIds`)**: `auth = Owner`, `CREATE /desk/owner_uid` with `storyIds` length `35` (exceeds max `30`) -> `PERMISSION_DENIED`.

---

## 3. Test Runner

See `firestore.rules.test.ts` for the automated test suite verifying all 12 Dirty Dozen payloads, owner read/write rules, and Phase 2 seed feed & Zod schema invariants.
