# Administration workspace

The administration interface is English and shares the public website's paper, charcoal, and berry visual language. `admin.css` is scoped through `admin-document`; it does not restyle public pages. No application dependency or database schema changes are required.

## Authoring

The editor has Write, Preview, and Split view modes. Narrow screens default to Write. Drafts still autosave after one second; Ctrl/Cmd+S requests an immediate private save. Publication remains a separate action. Published content does not change until Publish changes is selected.

Local recovery data is validated before use. When a recoverable draft exists, the editor stays read-only until the owner chooses Restore local draft or Use server version. A blocked browser store produces a warning instead of silently promising a local backup. Server version conflicts retain the input and offer a new draft copy or a Markdown download. Trashing and unpublishing require confirmation.

## Management

Article/project search, category, and status filters persist in the URL. Draft and trash dashboard cards link to both content kinds. Media can be searched by filename or alt text and uploaded with an explicit keyboard-accessible button. Existing in-use media protection remains enforced on the server.

Settings show dirty/saving/saved status and warn before leaving with unsaved edits. A response to an earlier save does not erase edits made while that request was in flight. Site settings retain their existing last-write-wins server behavior; no cross-tab settings-version guarantee is introduced.

## Accessibility and verification

The workspace provides visible focus, a skip link, touch-sized controls, labeled forms and tables, a Radix dialog-based mobile navigation drawer, system/light/dark themes, and reduced-motion support. Wide tables and code stay within their own scroll regions.

Run the existing `check`, `test`, `test:integration`, `build`, and `test:e2e` scripts. The new draft-recovery unit tests cover malformed local storage. The admin UI browser suite exercises five viewport widths and both themes, navigation focus and resizing, filter persistence, save shortcuts, pending recovery, media search, and edits during an in-flight settings save. It attaches real admin and sign-in screenshots to the Playwright report. Existing end-to-end suites still exercise setup, publishing, Markdown sanitization, media usage protection, and conflict recovery. Browser tests must run against an isolated database, never production.
