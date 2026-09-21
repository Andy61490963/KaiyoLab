# 本機開發與測試

使用 Node.js 24 與 PostgreSQL 18。本機開發、瀏覽器驗收與正式網站應使用不同的資料庫。

## 環境變數與開發伺服器

將根目錄 `.env.example` 複製為 `.env`，取消註解並設定 `DATABASE_URL`、`BETTER_AUTH_SECRET`、`SETUP_TOKEN`、`UPLOAD_DIR`；`SITE_URL` 使用 `http://localhost:4321`。密鑰使用自行產生的隨機值，例如執行 `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`，每個密鑰分別產生一次。

應用程式的伺服器端直接讀取 `process.env`。下列指令使用 Node 24 的 `--env-file` 明確載入檔案，適用於 PowerShell、macOS 與 Linux：

```bash
npm ci
node --env-file=.env scripts/migrate.mjs
node --env-file=.env node_modules/astro/bin/astro.mjs dev --host 127.0.0.1 --ignore-lock
```

在同一個終端機按 Ctrl+C 停止前景伺服器。網址為 [http://localhost:4321](http://localhost:4321)。

Astro 7 在偵測到代理執行環境時，可能自動啟動背景伺服器並讓命令立即結束。`--ignore-lock` 會使用前景模式，適合 Playwright 管理程序；不可與 `--background` 或 `--force` 同時使用。此模式不受 `astro dev stop` 管理，也不會檢查既有伺服器的鎖定檔，所以啟動前需確認 4321 沒有其他網站在使用。

如果先前使用了背景模式，可用 `npx astro dev status`、`npx astro dev logs` 檢查，並使用 `npx astro dev stop` 停止。正式容器直接啟動建置後的 Node server，不使用開發伺服器或其 daemon。

## 型別、核心規則與資料庫測試

```bash
npm run check
npm test
node --env-file=.env node_modules/vitest/vitest.mjs run tests/integration
npm run build
```

整合測試需要提供 `DATABASE_URL`；沒有設定時會略過該組測試。測試帳號需要 `CREATE DATABASE` 權限，流程會建立隨機命名的 `kaiyo_test_*` 資料庫，測試結束後移除該測試資料庫。它不會把既有網站當作測試資料庫，但仍建議使用專用的本機 PostgreSQL。

已透過系統環境變數匯入資料庫設定時，也可直接執行 `npm run test:integration`。

## 瀏覽器測試

建立不提交到 Git 的 `.env.test`，指定專用的空白測試資料庫與圖片目錄，例如：

```dotenv
DATABASE_URL=postgresql://kaiyo:你的測試資料庫密碼@localhost:5432/kaiyolab_e2e
SITE_URL=http://localhost:4321
BETTER_AUTH_SECRET=請填入至少32位元組的獨立隨機密鑰
SETUP_TOKEN=請填入獨立的隨機初始化碼
UPLOAD_DIR=./.local/e2e-uploads
E2E_EMAIL=e2e@example.test
E2E_PASSWORD=KaiyoLab-e2e-password-2026
```

先建立對應資料庫，再執行：

```bash
node --env-file=.env.test scripts/migrate.mjs
npx playwright install chromium
node --env-file=.env.test node_modules/@playwright/test/cli.js test
```

Playwright 預設使用 `http://localhost:4321`。執行前先停止同一個 port 的開發網站，避免把另一個網站當作測試目標。測試會建立站長、文章、作品及操作設定，不可對正式網站執行。若沿用已初始化的測試資料庫，`E2E_EMAIL`、`E2E_PASSWORD` 必須與測試站長相符。

需要對已啟動的建置版本或專用測試容器驗收時，在測試環境變數加入：

```dotenv
E2E_EXTERNAL_SERVER=true
PLAYWRIGHT_BASE_URL=http://localhost:4321
```

這會讓 Playwright 使用既有伺服器，不啟動另一個開發程序。首次設定時還需提供與測試容器相同的 `SETUP_TOKEN`。

## Docker 驗證

GitHub Actions 的 Docker 工作會在乾淨環境啟動整個 Compose、驗證實際瀏覽器操作，再停站備份並還原到新的 volumes。同時檢查：

- 應用程式以 UID 1000 執行，根檔案系統唯讀。
- 容器重建後資料庫、圖片檔案與密鑰的內容一致。
- 還原到全新 volumes 後，資料庫及全部檔案內容相同。
- 對非空圖片／密鑰 volume 或已有資料表的資料庫執行還原時，操作被拒絕。
- 還原後可用原站長帳號登入、讀取私人總覽、首頁與 RSS。
- 容器帳號復原指令可產生新密碼，並使舊密碼與舊 Session 失效。

另有建置後的 HTTPS 代理標頭整合驗證：以精確的測試網域建置，驗證登入、multipart 圖片上傳及拒絕未允許的來源／代理網域；此流程模擬代理轉送標頭，不依賴外部 DNS 或憑證服務。

`docs/operations/ci-roundtrip.sh` 僅允許 `CI=true` 且 Compose 專案為 `kaiyolab-ci` 時執行。它會寫入隨機的圖片儲存探測檔並切換測試容器，不適用於正式站維護；正式備份請使用[備份與還原文件](backup-restore.md)。
