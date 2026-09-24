# 備份與還原

完整備份包含 PostgreSQL、上傳圖片與部署密鑰。操作腳本在隨附的維護容器執行，主機不需要安裝 PostgreSQL 工具。

備份內含私人文章、帳號驗證資料與密鑰，請保存在自己控制的儲存空間，不要提交到 Git 或公開分享。以下以本機 Compose 為例；正式站請在每一條指令使用相同的 `-f compose.yaml -f compose.production.yaml` 參數。

## 建立一致的備份

先停止應用程式，讓資料庫與圖片在備份期間不再變動，資料庫維持執行：

```bash
docker compose stop app
docker compose --profile maintenance run --rm backup
docker compose up -d app
```

腳本會建立 `backups/UTC時間/`，包含：

| 檔案             | 內容                            |
| ---------------- | ------------------------------- |
| `database.dump`  | PostgreSQL 自訂格式 dump        |
| `uploads.tar.gz` | 上傳圖片及目錄權限              |
| `secrets.tar.gz` | 資料庫密碼、Auth 密鑰與初始化碼 |
| `manifest.txt`   | 備份時間與 PostgreSQL 大版本    |
| `SHA256SUMS`     | 完整性校驗值                    |

任何一步失敗都不會顯示「備份已完成」，請保留錯誤訊息並修正後重試。應用程式需由操作者重新啟動；只有包含全部檔案且通過校驗的目錄可用於還原。備份資料夾的權限預設只允許建立備份的使用者讀取，在 Linux 上可能需要主機管理員權限才能搬移。

成功備份會原子更新 `backups/.operations/.last-backup.json`，後台 **System status** 讀取此 UTC 時間。應用程式只掛載 `.operations` 紀錄子目錄，無法透過此掛載讀取備份本體與密鑰封存檔。此紀錄只代表腳本完成，不代表異地備份或還原驗證已完成。

## 還原到全新 volumes

以下使用新的專案名稱 `kaiyolab-restore`，不會覆寫原站。將 `20260921T080000Z` 換成你的備份資料夾名稱，且使用與備份相容的程式版本。

**請勿先啟動還原專案的 app、db 或 init-secrets。** 第一步要先把舊密鑰還原，讓新資料庫使用同一組密碼初始化。

```bash
docker compose -p kaiyolab-restore --profile maintenance run --rm restore-files 20260921T080000Z
docker compose -p kaiyolab-restore up -d --wait db
docker compose -p kaiyolab-restore --profile maintenance run --rm restore-db 20260921T080000Z
```

`restore-files` 遇到非空的圖片／密鑰 volume 會拒絕覆寫；`restore-db` 遇到已有資料表的資料庫也會拒絕。腳本不會自動清除任何既有資料。

現在讓還原站使用另一個本機入口：

```bash
docker compose -p kaiyolab-restore run --rm --no-deps -e SITE_URL=http://localhost:4322 -p 127.0.0.1:4322:4321 app
```

這個指令在前景執行暫時的驗證容器，按 Ctrl+C 會停止容器，資料仍保留。打開 [http://localhost:4322](http://localhost:4322)，使用原本的站長帳號登入，確認文章、草稿、圖片與網站設定。預設密鑰相同，但不同網址的 Cookie 不共用，需要重新登入。

完成上述內容與登入驗證後，才執行下列指令記錄已驗證時間：

```bash
docker compose -p kaiyolab-restore --profile maintenance run --rm --no-deps --entrypoint sh backup /operations/record-restore.sh
```

未執行驗證時不要寫入此紀錄。CI 會在資料庫／檔案雜湊、登入、閱讀及帳號復原檢查全部通過後自動記錄。

確認無誤後，將還原專案部署到正式網址：在獨立專案目錄設定自己的 `.env`，或者切換反向代理流量至還原專案。每次操作必須繼續使用 `-p kaiyolab-restore`，以讀取同一組還原的 volumes。原站先保留，待驗證完整後再由操作者安排移除。

## 升級失敗時回復

切回原程式版本後，若資料庫曾經執行不相容的 migration，不能只重新啟動舊容器。請使用更新前的完整備份及當時的程式版本，按照上方步驟還原到新的 volumes，再切換入口。這樣原站與失敗版本的資料仍可保留供檢查。
