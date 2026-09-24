# 內容復原與網站維運

## 版本、發布與網址

編輯器的 **Version history** 可比較目前草稿與先前內容，再還原為草稿。還原前會先儲存正在編輯的文字；若另一分頁已更新內容，介面會提示衝突。還原不會替換公開版本，仍須經過 **Publish content / Publish changes → Confirm publication**。

發布版本永久保存；被取代的草稿每 5 分鐘最多記錄一份，保留最近 100 份。這不是逐字操作紀錄。版本仍使用的圖片不能刪除，媒體庫會顯示使用位置。升級時會替既有內容建立草稿與公開版本的起點，無法復原升級前未保存的文字。

發布檢查會列出摘要、封面與 Markdown 圖片替代文字、站內文章及作品連結問題，以及文字與欄位差異。這些提醒不會阻止站長有意發布；外部連結不會自動連線檢查。Markdown 行差異採有限長度顯示，大篇幅仍可在編輯器查看完整內容。

文章設定可指定系列名稱與篇次，公開文章會顯示同系列已發布文章及前後篇導覽。封面的水平／垂直裁切焦點適用於固定比例的封面。媒體庫支援一次上傳最多 20 張圖片，個別失敗可重試；使用中的歷史圖片也會受保護。縮圖只有 480、960、1600 像素三種寬度，保留原圖，且每次讀取都檢查公開或站長權限。

修改公開 slug 後，舊網址以 301 轉到目前公開網址。下架或移到垃圾桶後，舊網址也不可讀取。歷史網址不能被另一篇搶用，避免舊連結指向錯誤內容。垃圾桶保留文章與版本供還原，也會保留相應圖片參照。

首次發布與最後公開更新日期分開保存；草稿儲存不影響公開日期。升級前無法從既有資料推回真正的第一次發布時間，因此以當時保留的 `publishedAt` 為起點。

內容搬家請參考[匯出與匯入](content-transfer.md)，災難復原仍使用[完整備份與還原](backup-restore.md)。

## 後台系統狀態

**System status** 顯示執行版本、Node.js 版本、資料庫查詢時間、圖片目錄的實際寫入檢查，以及資料庫登錄的原始圖片數量／容量；這不是逐檔完整性檢查。頁面與 API 只允許站長存取，不會回傳環境變數、資料庫連線字串或主機路徑。若資料庫故障導致登入驗證也無法完成，請使用外部監測與主機日誌排錯。

Compose 只將 `backups/.operations` 以唯讀方式掛到應用程式的 `OPERATIONS_DIR=/app/data/operations`。備份成功後在此子目錄記錄 `.last-backup.json`；還原驗證完成後才記錄 `.last-restore.json`。這些小檔案只含操作類型與 UTC 完成時間，備份本體與密鑰封存檔不掛入應用程式。沒有紀錄會明確顯示 **Not recorded**，未設定目錄則顯示 **Not configured**。多個驗證專案若共用同一紀錄目錄，會看到相同時間，不能只靠這個時間判定目前資料庫是哪一次還原結果。

Zeabur 等平台需自行掛載維運紀錄目錄並設定 `OPERATIONS_DIR`；未提供此目錄時，其他狀態照常顯示。不要手動填入未執行的備份／驗證時間。

## 外部監測與通知

GitHub Actions 的 **網站外部監測** 每 10 分鐘從站外檢查健康端點、首頁、登入頁與管理 API 的訪客限制。每次錯誤最多檢查 3 次，持續失敗會標示 workflow 失敗，摘要保留路徑與結果。它不需要資料庫、站長密碼或部署主機的存取權。

1. 在 repository **Settings → Secrets and variables → Actions → Variables** 設定 `PRODUCTION_URL`，例如 `https://kaiyo.zeabur.app`
2. 在 **Actions → 網站外部監測 → Run workflow** 執行一次，確認目標正確
3. 在個人 GitHub **Settings → Notifications → System → Actions** 開啟 Web 或 Email 通知，選擇僅失敗通知

排程通知預設送給最初建立 workflow 的使用者，修改 cron 語法後改送該修改者；停用後重新啟用時，改送重新啟用者。實際傳送取決於該帳號的通知設定，專案程式不會代替使用者開啟通知或發送測試信。[GitHub 通知規則](https://docs.github.com/en/actions/concepts/workflows-and-actions/notifications-for-workflow-runs)

GitHub 排程可能延遲；公開 repository 60 天沒有活動時，排程會自動停用，需要在 Actions 重新啟用。因此這是基本外部監測，沒有可用性 SLA；需要精確分鐘級警示時可將 `/api/health` 交給獨立監測服務。[GitHub 排程限制](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
