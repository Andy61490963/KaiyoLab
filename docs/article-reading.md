# Article reading layout and view counts

## Scope

The change is scoped to published article pages. The existing site container, sidebar, home page, profile, language control, themes, content, and publishing rules remain unchanged. A cover already chosen in the CMS is displayed beside the heading on wide screens and above the body on narrow screens. No unrelated photo is inserted when an article has no cover. Technical diagrams and screenshots use `object-fit: contain` rather than cropping their text.

The body keeps comfortable line lengths, section-heading accents, scrollable code/tables, and a sticky desktop contents list with an active-section marker. Small screens retain a native disclosure. Anchor links work without JavaScript. Active-section offsets are remeasured on resize/font/layout changes; scrolling uses a scheduled binary search, not repeated measurements of every heading on every scroll event.

## What the counter means

The small eye badge next to reading time displays **views**, not verified unique people. It starts at zero when introduced. There is no historical backfill or example `2.4K` value. Numbers compact visually, with the exact total and explanation available in its accessible name/title; interface language changes never rewrite article text.

A read-only GET displays the aggregate. After the page has been continuously visible for 1.5 seconds, the browser sends one POST. A successful POST sets an article-specific, signed, HttpOnly, SameSite=Strict receipt cookie lasting 30 minutes (Secure on HTTPS). Repeat requests carrying that receipt return the existing count without incrementing. It contains only a signed expiry: no user identifier, IP, fingerprint, or cross-site tracking.

This is deliberately a lightweight blog counter, not fraud-resistant analytics. Concurrent first visits without an existing receipt can each count; different devices, expired/cleared/blocked cookies, bots executing JavaScript, and network failures affect totals. A lost POST response is not retried automatically. JavaScript-disabled visits are not counted. No claim of exactly-once delivery or unique humans is made. Platform-level abuse controls are still appropriate for a public anonymous endpoint.

## Persistence without schema changes

Totals live under the private `_articleViewsV1` key of the existing `settings.value` JSONB document, keyed by immutable entry ID. No table/column, migration, dependency, external analytics service, or deployment variable is added. Counts survive redeploys and travel with the existing PostgreSQL backup.

Only published, non-deleted articles are accepted. Transactions hold an article share lock and settings row lock, with bounded lock/statement timeouts. Concurrent increments cannot overwrite one another, and incrementing does not change article content, publication timestamps, or optimistic-concurrency versions. Unpublishing immediately hides the public counter endpoint; republishing the same ID retains its historical total.

Admin settings writes preserve the **current database** counter metadata atomically instead of replaying a browser's stale snapshot. Settings responses strip that private key, and settings input validation does not permit a browser to set it. All query values are parameters. Counter errors return a generic 503 and never block server rendering or article navigation. Unknown values are shown as a dash, not fabricated zeroes.

The single JSONB document is a deliberate small-site tradeoff under the no-schema-change constraint: writes serialize on the settings row and rewrite a growing aggregate document. This is not a high-throughput analytics architecture. At materially larger scale, migrate to a dedicated per-article counter table or analytics service only after schema/service approval. Do not edit old migration checksums or put counts inside mutable draft/published snapshots.

## Verification

Unit tests cover compact formatting, corrupt values, hidden metadata, expiry, forged receipts, and article/key isolation. Real PostgreSQL tests cover concurrent increments, independent connections, untouched article versions, private/trash/project visibility, concurrent settings saves, origin/body/method rejection, and unavailable telemetry. Browser tests cover both languages/themes, no-cover pages, 320/375/768/1024/1440px layouts, active anchors, no JavaScript, and failure isolation. Fixture writes require an isolated loopback test server; screenshots are not live production content.

References: [PostgreSQL JSON functions](https://www.postgresql.org/docs/current/functions-json.html), [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html), and [Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
