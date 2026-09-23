# Homepage refinements

Keep the existing public sidebar, page width, Markdown introduction, section order, author name and timeline. The enhancement stylesheet is additive; it does not change the admin workspace or runtime/deployment configuration.

## Interface language

The top-right EN / 中文 pill switches **public interface labels only**. The desktop control is at the top-right of the content area; tablet/mobile use the header. The moving highlight and brief label fade respect reduced-motion preferences. Keyboard focus stays on the control. The preference is stored locally, restored before paint, and synchronized across tabs. When storage is blocked, switching still works in the current page; persistence is not promised. Without JavaScript, English navigation and content work and the inactive language control is hidden.

UiText renders escaped English and Traditional Chinese labels. Only explicitly marked interface attributes/messages are updated; authored Markdown, article titles/excerpts, categories, tags, author names and code samples are not passed to a translation service or rewritten. The admin remains English. Interface preference is not sent to a server, and no new API or cookie is introduced.

## Home decoration and navigation

The original introduction remains editable in the CMS. A small circular ragdoll portrait sits beside the introduction on wide screens and below it on narrow screens. The image is decorative (empty alt, hidden from accessibility APIs), non-interactive, locally served, and has reserved dimensions. It is an extract of the AI-generated homepage concept from this conversation, not a real photograph of the author's pet. There is no external image request or new font/package dependency.

The sidebar bottom contains only the owner's GitHub profile. RSS and admin routes still exist; no authorization behavior changes.

## Requested notes

Migration 006 inserts five original notes: .NET DI, TLS troubleshooting, 502 diagnosis, editor draft safety, and MES retries. Four are Traditional Chinese and one is English. It is a data-only migration, with no schema or profile-setting changes. Notes use deployment time, not invented historical publication dates, and link to primary technical references.

The migration runner executes it once under its existing lock and transaction. Fixed IDs and draft/published slug checks prevent overwriting or resurrecting existing content. Subsequent edits/unpublishing/deletion happen through the existing CMS; the app does not reseed content on every request. Do not edit an applied migration. Forks that do not want these notes should review the insert before first deployment, or unpublish the notes through the CMS afterward.

Tests verify repeatability, matching-slug and deleted-content preservation, publishing, both interface languages, unchanged Markdown, storage failure, no-JavaScript operation, five viewport widths, and light/dark themes. Long-timeline screenshots use isolated CI fixtures and restore settings afterward.
