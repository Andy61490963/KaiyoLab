# Homepage refinements

The existing sidebar width, page container, typography, colors, timeline Markdown, and navigation routes are preserved. A 224px circular ragdoll portrait fills the desktop introduction's unused right-hand space; on narrow screens it becomes a small decoration below the introduction. The image is a locally hosted WebP crop of the AI-generated mockup supplied in the conversation, not a photograph of the owner's pet. No external image or translation service is used.

## Interface language

The EN / 中文 control is at the upper right on desktop and in the compact header on mobile. The thumb animates for 200ms; reduced-motion settings disable the transition. Its two buttons support keyboard activation, stable accessible names, and selected states. The preference is stored under `kaiyo-ui-language`, restored before first paint, and synchronized between tabs. Blocked storage still permits switching on the current page. Without JavaScript, the English interface and native navigation remain available; the inactive language control stays hidden.

Only explicitly marked interface copy and accessibility labels change. Authored home/About Markdown, article and project titles, excerpts, bodies, code, taxonomy names, and social-link labels stay in their original language. The admin interface is unchanged by this refinement. Dates remain in their existing presentation. There is no translation API and no new application dependency. The sidebar's lower section contains only the requested GitHub profile; RSS and admin routes are retained elsewhere.

## Initial articles

Migration 006 inserts five original engineering notes into the existing CMS tables. These are public articles, not placeholder links. They use their actual insertion time, not invented historical publication dates, and include official sources. The content avoids private repositories, clients, hostnames, credentials, and claims of undisclosed professional achievements.

The migration never updates settings or existing entries. Stable IDs, slug checks (including deleted/private entries), and `ON CONFLICT DO NOTHING` protect existing work. Re-running it does not republish drafts, restore trashed notes, overwrite edits, or change dates. A short table lock protects the conflict check during the one-time insertion. Later deploys skip the recorded migration; authors maintain or remove the notes through the usual CMS workflow.

No Docker ports, environment variables, credentials, or schema definitions change. Deployment still uses the existing startup migration and Zeabur/GitHub process.
