# Zeabur 部署與 CI/CD

Zeabur 使用專案根目錄的 Dockerfile 建置應用程式，PostgreSQL 18 則部署成同專案的獨立服務；平台不會執行 Compose。自架 Docker 的一行啟動方式仍維持不變。

## 平台設定

1. 建立 PostgreSQL 18，保留範本的資料硬碟，並在「網路」關閉 TCP 公網轉送。
2. 將應用程式連結到自己的 GitHub 儲存庫 `main` 分支，根目錄 `/`、監控路徑 `*`。
3. 掛載兩個獨立硬碟：`kaiyolab-uploads` 到 `/app/data/uploads`、`kaiyolab-secrets` 到 `/app/data/secrets`。不要掛載整個 `/app`，以免遮住程式。
4. 設定下表環境變數，啟用 HTTP 健康檢查 `/api/health`，Zeabur 的 `web` 服務連接埠為 `8080`。

| 變數                 | 值                                                     |
| -------------------- | ------------------------------------------------------ |
| `DATABASE_URL`       | `${POSTGRES_URI}`，引用同專案 PostgreSQL 的私有連線    |
| `SITE_URL`           | 自己的完整 HTTPS 網址，例如 `https://kaiyo.zeabur.app` |
| `HOST`               | `0.0.0.0`                                              |
| `PORT`               | `8080`                                                 |
| `UPLOAD_DIR`         | `/app/data/uploads`                                    |
| `SECRETS_DIR`        | `/app/data/secrets`                                    |
| `INITIALIZE_SECRETS` | `true`                                                 |

Zeabur 會把 `SITE_URL` 傳入同名 Docker 建置參數。變更網域後必須重新建置，不能只重新啟動。`ZEABUR_GIT_COMMIT_SHA` 建置參數會寫入健康端點，讓部署驗證確認實際執行的版本。

`INITIALIZE_SECRETS=true` 在首次啟動產生隨機密鑰，既有檔案保持原值；必須搭配持久化硬碟。應用程式使用 UID/GID `1000:1000`，硬碟需允許該身分存取；若平台以 root 啟動，初始化完成後會立即降權再執行 migration 與網站。不要刪除密鑰硬碟來修復啟動問題。

首次啟動先執行 migration；失敗會停止啟動並保留錯誤。從服務「記錄」取得一次性初始化碼，在 `/setup` 輸入自己的站長 Email、密碼與站名。初始化碼及密碼不得貼到 GitHub Issue、公開日誌或文件。完成後初始化入口自動關閉。

## 持續整合與部署

```text
功能分支 → PR → 型別／核心規則／PostgreSQL／Docker／瀏覽器／還原測試
                     ↓ 必要檢查全部通過
                    main → Zeabur 自動建置、migration、啟動
                            ↓
                    GitHub Actions 驗證精確 Git 版本與公開／私人邊界
```

- `main` 分支保護要求 PR、最新基準與兩項檢查：`型別、核心規則與資料庫`、`Docker、瀏覽器與備份還原`。單人維護不要求第二位審查者，但不能略過測試直接推送。
- Zeabur 原生 GitHub 整合負責推送後部署，無須把 Zeabur API Token 存進 GitHub。
- 在 GitHub 儲存庫 Actions Variables 設定 `PRODUCTION_URL`，並建立 `production` Environment，僅允許受保護分支。
- `正式部署驗證` 在 main 的 CI 成功後等待最多 20 分鐘；`/api/health` 必須回報該次完整 commit SHA。之後驗證公開頁面可讀、訪客呼叫管理 API 回傳 401。也可從 Actions 手動執行。
- 版本標籤 `v*` 會先執行完整 CI，再發布 GHCR 的 amd64／arm64 映像。通用映像的 HTTPS 限制見[正式部署](deployment.md)。

## 備份、升級與回復

更新前保留 PostgreSQL 備份、兩個應用程式硬碟，以及平台環境設定。Zeabur 的「備份還原」可建立平台快照；仍應另存可攜式備份到自己的安全儲存空間。資料庫與圖片必須對應同一個備份時間點，備份期間暫停後台寫入。

在 PostgreSQL 服務終端可執行：

```sh
pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/kaiyolab.dump
```

在應用程式服務終端可執行：

```sh
tar -czf /tmp/kaiyolab-files.tar.gz -C /app/data uploads secrets
```

從平台檔案工具下載這兩個檔案並安全保存。`/tmp` 不會持久保存，請勿把這裡當成備份目的地。備份含私密內容與密鑰，不可公開。

回復時先停止應用程式，在全新的 PostgreSQL 18 資料庫使用 `pg_restore --exit-on-error --no-owner --no-privileges` 匯入 dump，還原 uploads、secrets 到對應硬碟並維持 UID/GID 1000，更新 `DATABASE_URL` 後啟動相容版本。先在隔離環境驗證登入、文章與圖片，再切換正式網站。

部署失敗可透過 Zeabur 部署紀錄回復映像，或建立 revert PR 並通過 CI 後合併。映像回復不會回復資料庫、硬碟或環境變數；若 migration 不向後相容，需同步還原完整備份。不要在舊資料目錄直接更換 PostgreSQL 大版本。

忘記站長密碼時，在應用程式終端執行 `node scripts/start.mjs recover`，系統產生新的隨機密碼並撤銷舊 Session。

## 官方參考

- [GitHub 自動部署](https://zeabur.com/docs/en-US/deploy/methods/github-integration)
- [Dockerfile 建置](https://zeabur.com/docs/en-US/deploy/methods/dockerfile)
- [環境變數與 Git 版本資訊](https://zeabur.com/docs/en-US/deploy/config/environment-variables)
- [持久化硬碟](https://zeabur.com/docs/en-US/data-management/volumes)
- [回復部署](https://zeabur.com/docs/en-US/operations/deployment/rollbacks)
