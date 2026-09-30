# Homepage refinements

The existing sidebar width, page container, typography, colors, timeline Markdown, and navigation routes are preserved. A 224px circular ragdoll portrait fills the desktop introduction's unused right-hand space; on narrow screens it becomes a small decoration below the introduction. The image is a locally hosted WebP crop of the AI-generated mockup supplied in the conversation, not a photograph of the owner's pet. No external image or translation service is used.

## Interface language

The EN / 中文 control is at the upper right on desktop and in the compact header on mobile. The thumb animates for 200ms; reduced-motion settings disable the transition. Its two buttons support keyboard activation, stable accessible names, and selected states. The preference is stored under `kaiyo-ui-language`, restored before first paint, and synchronized between tabs. Blocked storage still permits switching on the current page. Without JavaScript, the English interface and native navigation remain available; the inactive language control stays hidden.

語言切換只處理明確標記的介面文案與無障礙標籤，首頁／關於我的 Markdown、文章與作品標題、摘要、內文、程式碼、分類名稱及社群連結名稱保留原文，日期沿用既有格式，不新增翻譯 API 或相依套件，前台中文介面不使用中文句號，左側底部保留 GitHub、頁尾保留 RSS 與關於我，公開頁面不提供管理入口，站長以 `/admin` 網址或書籤進入後台

## Initial articles

Migration 006 inserts five original engineering notes into the existing CMS tables. These are public articles, not placeholder links. They use their actual insertion time, not invented historical publication dates, and include official sources. The content avoids private repositories, clients, hostnames, credentials, and claims of undisclosed professional achievements.

The migration never updates settings or existing entries. Stable IDs, slug checks (including deleted/private entries), and `ON CONFLICT DO NOTHING` protect existing work. Re-running it does not republish drafts, restore trashed notes, overwrite edits, or change dates. A short table lock protects the conflict check during the one-time insertion. Later deploys skip the recorded migration; authors maintain or remove the notes through the usual CMS workflow.

No Docker ports, environment variables, credentials, or schema definitions change. Deployment still uses the existing startup migration and Zeabur/GitHub process.
