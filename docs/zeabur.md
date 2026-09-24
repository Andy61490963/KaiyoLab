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

### 建置成功但網站回傳 502

先區分 CI 建置、容器映像下載、應用程式啟動及網站健康檢查四個階段，建置成功不代表網站已上線

若服務顯示 `PULL_FAILED` 或 Kubernetes 顯示 `ImagePullBackOff`，請先查看該 Pod 的事件，`timeout awaiting response headers` 表示映像下載階段失敗，此時應用程式可能尚未啟動，回退介面程式或刪除資料硬碟無法解決下載問題

在自有主機比較 DNS 解析、HTTPS 狀態碼、完整下載大小與 SHA-256；只收到 HTTP 200 標頭不能證明映像內容已下載成功，不建議永久固定 CDN IP 或直接重啟整台共享主機

### 使用 CI 復原映像

設定 `PRODUCTION_URL` 後，CI 在型別、資料庫、Docker 與瀏覽器檢查通過後，另外建置正式網址使用的 amd64 映像，保留七天於 `production-image-完整版本` artifact，內含 `kaiyolab-image.tar`、`SHA256SUMS` 與 `REVISION`

映像包含程式及內建素材，不包含執行中的資料庫、上傳檔案、登入密鑰或測試資料；這是應用程式復原來源，不能取代資料備份，PR 產物也不能視為已合併的正式版本

映像儲存服務故障時，具備自有主機維護權限的人可採以下流程：

1. 選擇已通過 CI 的 main 版本，下載對應 artifact，確認 `REVISION` 與預期部署版本相同
2. 以 `sha256sum -c SHA256SUMS` 驗證下載檔案，使用已核對主機金鑰的 SSH／SFTP 傳到主機，再驗證一次
3. 使用 `sudo k3s ctr -n k8s.io images import /tmp/kaiyolab-image.tar` 匯入內容快取，保留既有資料庫、環境變數與 volumes
4. 先記錄目前 Deployment 名稱、容器名稱與映像參照，再將該應用程式容器切換到 `docker.io/library/kaiyolab-recovery:完整版本`，不要改動其他服務，也不要把重建的映像冒充為原 registry 的 digest
5. 等待容器 Ready，執行正式部署驗證，確認健康端點回報精確版本、公開頁面成功及管理 API 回傳 401

這是平台映像儲存故障期間的復原程序，直接調整 Kubernetes 映像可能被平台後續部署覆寫，不代表原 registry 已修好；恢復平台正常部署後需再次核對實際版本，正式部署工作流程仍以精確版本驗證作為成功條件

需要重新產生產物時可手動執行「持續整合」工作流程，版本標籤的多平台 GHCR 發布流程維持不變

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
