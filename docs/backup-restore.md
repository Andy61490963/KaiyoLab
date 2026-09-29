# 備份與還原

完整備份包含 PostgreSQL、上傳圖片與部署密鑰。操作腳本在隨附的維護容器執行，主機不需要安裝 PostgreSQL 工具。

備份內含私人文章、帳號驗證資料與密鑰，請保存在自己控制的儲存空間，不要提交到 Git 或公開分享。以下以本機 Compose 為例；正式站請在每一條指令使用相同的 `-f compose.yaml -f compose.production.yaml` 參數。

## 建立一致的備份

一般 Compose 啟動後，`backup-scheduler` 每 24 小時建立完整備份，保留約 14 天；啟動時若沒有成功紀錄會先執行一次，重新啟動不會重複已完成的週期

備份會取得與內容寫入相同的 PostgreSQL 鎖，讓資料庫、圖片及設定維持同一個快照，網站仍可閱讀，寫入會暫時等待，等待鎖超過 30 秒便回報失敗，1 小時後重試

也可以立即手動執行：

```bash
docker compose --profile maintenance run --rm backup
```

腳本會建立 `backups/UTC時間/`，包含：

| 檔案             | 內容                            |
| ---------------- | ------------------------------- |
| `database.dump`  | PostgreSQL 自訂格式 dump        |
| `uploads.tar.gz` | 上傳圖片及目錄權限              |
| `secrets.tar.gz` | 資料庫密碼、Auth 密鑰與初始化碼 |
| `manifest.txt`   | 備份時間與 PostgreSQL 大版本    |
| `SHA256SUMS`     | 完整性校驗值                    |

任何一步失敗都不會顯示「備份已完成」，也不會替換成功紀錄；失敗的 `.partial-*` 目錄只供診斷，不能拿來還原，確認原因後才由管理員移除。只有包含全部檔案且通過校驗的目錄可用於還原。備份資料夾的權限預設只允許建立備份的使用者讀取，在 Linux 上可能需要主機管理員權限才能搬移。

成功備份會原子更新 `backups/.operations/.last-backup.json`，後台 **System status** 讀取此 UTC 時間。應用程式只掛載 `.operations` 紀錄子目錄，無法透過此掛載讀取備份本體與密鑰封存檔。此紀錄只代表腳本完成，不代表異地備份或還原驗證已完成。

後台會區分正常、超時與最近失敗，預設成功紀錄超過 36 小時便標示超時，可在 `.env` 調整 `BACKUP_INTERVAL_SECONDS`、`BACKUP_RETENTION_DAYS` 與 `BACKUP_MAX_AGE_HOURS`，提醒門檻應大於備份週期

```bash
docker compose logs --tail=100 backup-scheduler
```

本機備份仍與網站在同一台主機，不能處理整台主機或磁碟遺失

## 選用：加密異地副本

目的地由站長提供，不會自動開通付費服務，也不會預設上傳私人資料。隨附的 `compose.offsite.yaml` 使用 [restic 的加密儲存庫](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)，可連接自己的 S3、R2 或其他支援的儲存空間

1. 在專案的 `.local/offsite-password` 建立長隨機密碼，檔案只允許管理員讀取，並另外保存在密碼管理器；遺失此密碼將無法解密備份
2. 建立被 Git 忽略的 `.env.offsite`，填入自己的端點與只限定該 bucket 的存取憑證，不要提交至 Git

```dotenv
RESTIC_REPOSITORY=s3:https://自己的端點/自己的bucket/kaiyolab
AWS_ACCESS_KEY_ID=自己的存取金鑰
AWS_SECRET_ACCESS_KEY=自己的密鑰
AWS_DEFAULT_REGION=auto
OFFSITE_INTERVAL_SECONDS=86400
```

3. 確認目的地後只初始化一次，再啟動排程

```bash
docker compose -f compose.yaml -f compose.offsite.yaml run --rm --entrypoint restic offsite init
docker compose -f compose.yaml -f compose.offsite.yaml up -d offsite
docker compose -f compose.yaml -f compose.offsite.yaml logs --tail=100 offsite
```

每次只上傳最新且校驗成功的完整備份，未完成目錄不會上傳，遠端驗證或網路失敗會讓程序失敗並由 Docker 重新啟動。此範例保留全部遠端快照，不會自動刪除遠端資料；需要清理時先查看 [restic 保留政策](https://restic.readthedocs.io/en/stable/060_forget.html)，確認範圍後再執行

使用 `restic snapshots` 選定快照，將 `restic restore 快照ID --target /restore` 還原到另一個空白掛載目錄，驗證 `SHA256SUMS` 後依下節還原。後台的備份狀態指本機備份，異地上傳需另看 `offsite` 日誌，不會冒充異地已成功

## 還原到全新 volumes

### 單節點 Kubernetes 主機

Zeabur 部署不會執行 Compose 的排程容器。具有主機管理權限時，可使用隨附的 `docs/operations/backup-kubernetes.py` 與 systemd 範例，需求為 Python 3.11 以上、kubectl、tar 與 sha256sum；限於可直接讀取指定網站本機持久磁碟的單節點主機

先將 `OPERATIONS_DIR` 設定為 `UPLOAD_DIR/.operations`，安裝腳本至 `/usr/local/lib/kaiyolab/backup-kubernetes.py`，在 `/etc/kaiyolab-backup.conf` 填入自己經核對的部署識別碼

```ini
NAMESPACE=自己的namespace
APP_DEPLOYMENT=自己的app-deployment
DATABASE_DEPLOYMENT=自己的db-deployment
BACKUP_ROOT=/var/backups/kaiyolab
```

此設定不放憑證，腳本以既有 kubectl 權限讀取指定應用程式的資料庫設定，不列印連線字串。掛載路徑、Pod 就緒、內容鎖與資料庫匯出任一步失敗便保留上一份備份；備份格式可接續下方 Compose 還原步驟。DB 名稱和帳號由新的 Compose 還原環境設定，內容資料及站長帳號不變

將隨附的 `.service`、`.timer` 複製到 `/etc/systemd/system/`，先手動執行並檢查結果，再啟用排程

```bash
sudo systemctl daemon-reload
sudo systemctl start kaiyolab-backup.service
sudo journalctl -u kaiyolab-backup.service -n 30 --no-pager
sudo systemctl enable --now kaiyolab-backup.timer
sudo systemctl list-timers kaiyolab-backup.timer
```

範例於台灣時間每天 03:00 起隨機延後最多 15 分鐘執行，保留 14 天，關機錯過的排程會在下次啟動補跑；切換到多節點、遠端磁碟或更換 namespace 時需重新檢查備份方式

### Compose 還原步驟

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
