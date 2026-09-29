# 正式部署

預設 Compose 適用於本機使用。公開網站請配置網域與 HTTPS，讓登入 Cookie、來源驗證、RSS 與分享網址使用相同來源。

## 使用隨附的 Caddy

1. 將網域的 DNS A／AAAA 記錄指向部署主機。
2. 確認主機可從網際網路接收 TCP 80、TCP 443；UDP 443 為選用的 HTTP/3。
3. 安裝 Docker Engine 與 Compose v2.24.4 以上，下載專案。
4. 建立 `.env`：

```dotenv
DOMAIN=example.com
```

將 `example.com` 換成自己的網域，不含協定或路徑，然後執行：

```bash
docker compose -f compose.yaml -f compose.production.yaml up -d --build --wait
```

正式設定以 `DOMAIN` 為唯一來源，將應用程式的**建置參數與執行期 `SITE_URL` 都設為 `https://DOMAIN`**；即使 `.env` 還有本機的 `SITE_URL` 值，也會由正式 overlay 統一覆寫。Caddy 同時使用這個網域處理憑證申請與續期，憑證保存在 `caddy_data` volume。

正式設定會移除應用程式的主機 port 映射，只由 Caddy 提供外部流量。PostgreSQL 始終只在內部網路。

首次設定：

```bash
docker compose -f compose.yaml -f compose.production.yaml logs app
```

以 HTTPS 開啟 `/setup`，輸入日誌中的初始化碼建立站長。完成後初始化入口關閉。

**更換網域後必須重新執行含 `--build` 的啟動指令。** 只改執行期環境變數或重新啟動既有映像，不會更新建置時的可信代理網域。

## 已有反向代理

若使用既有 Nginx、Caddy 或其他代理，可保留預設 `127.0.0.1:4321` 映射，讓同一主機的代理轉送至該位置，並設定：

```dotenv
SITE_URL=https://example.com
```

```bash
docker compose up -d --build --wait
```

基礎 Compose 會將同一個 `SITE_URL` 同時傳入 Docker 建置與容器執行環境。網址必須是完整來源，可以包含明確的 port，但不能包含帳密、子路徑、萬用字元、查詢或片段。

代理必須轉送正確的 `Host`、`X-Forwarded-Host` 與 `X-Forwarded-Proto`，並清洗外部提供的轉送標頭；不要把內部 `app:4321` 設成網站網址。代理需保留瀏覽器原本的 `Origin`，不能以改寫來源的方式通過檢查。

## 來源驗證與代理信任

Astro 的 `security.checkOrigin` **保持啟用**。HTTPS 部署只把建置時 `SITE_URL` 指定的精確主機、協定與 port 加入 `security.allowedDomains`，讓 Astro 能辨識可信代理轉送的 HTTPS 來源；本機 HTTP 部署不建立代理白名單。

此外，應用程式 middleware 會對所有 `/api/*` 寫入操作，嚴格比對瀏覽器的 `Origin` 與執行期 `SITE_URL`；缺少或不相符的來源會被拒絕。不要停用 Astro 來源檢查，也不要使用萬用字元白名單來解決網域設定問題。

登入限流使用 Astro adapter 提供的 `clientAddress`，由伺服器覆寫內部的驗證標頭；不直接接受瀏覽器自行提供的身分標頭。在精確允許的代理網域下，adapter 可能採用經代理處理的轉送資訊，因此正式部署必須經由清洗標頭的 Caddy 或自己控制的代理，不能同時公開應用程式 port。多層代理只信任自己控制的上游；若 adapter 取得的是共用代理 IP，使用者可能共用登入限流額度。

不需要開放資料庫 port，也不需要把 Docker socket 掛入任何網站容器。

## 版本映像的第一版限制

本專案的 `v*` 標籤會觸發 GitHub Actions，發布 `ghcr.io/andy61490963/kaiyolab` 的 amd64／arm64 映像。首次發布前不存在可用標籤，請以實際的套件頁面為準。

**第一版的通用 GHCR 映像以 `http://localhost:4321` 建置，供本機 HTTP 使用。自己的 HTTPS 網域必須從原始碼建置。** 可信代理白名單在建置時決定，不能把通用映像直接搭配正式 HTTPS overlay，或只變更執行期 `SITE_URL` 就視為完成部署。

本機已有實際發布版本時，可建立 `compose.image.yaml`：

```yaml
services:
  app:
    image: ghcr.io/andy61490963/kaiyolab:替換為已發布的版本
    build: !reset null
```

```bash
docker compose -f compose.yaml -f compose.image.yaml pull
docker compose -f compose.yaml -f compose.image.yaml up -d --wait
```

此範例不加 `compose.production.yaml`，並保留預設本機網址。仍需保留專案內的初始化及操作腳本；映像只取代應用程式建置。請固定版本，不以未確認內容的 `latest` 更新網站。

## 維運檢查

### 更新期間的維護回應

隨附 Caddy 在應用程式停止或尚未開始監聽，導致代理產生 502、503 或 504 錯誤時，會回傳 `503 Service Unavailable`、`Retry-After: 15` 及 `Cache-Control: no-store`，並顯示簡短維護提示，不會將內部連線錯誤或維護頁誤標成成功

應用程式自行回傳的狀態及本文保持原樣，包括登入驗證 401、內容不存在 404、版本衝突 409，以及健康端點的 503；這份設定沒有啟用寫入操作重試，`Retry-After` 只表示建議稍後再檢查，不保證 15 秒內恢復

更新時保持 Caddy 執行，只重建應用程式：

```bash
docker compose -f compose.yaml -f compose.production.yaml up -d --build --wait app
```

首次安裝仍使用前面的完整啟動指令；Caddy 必須已啟動才能顯示維護回應，若整個 Compose 停止、代理或主機失去連線，這份設定無法代替外部入口

應用程式恢復連線後，Caddy 自動恢復轉送；這改善停機期間的 HTTP 回應，沒有消除單一應用程式容器、資料庫或主機的停機時間

CI 透過 `docs/operations/ci-maintenance.sh` 在隔離網路啟動真實 Caddy 與測試上游，依序驗證正常轉送、停止上游後的 503／重試標頭、重新啟動後的恢復，以及原有 API 錯誤狀態不被取代，參考 [Caddy 錯誤處理文件](https://caddyserver.com/docs/caddyfile/directives/handle_errors)

### 日常檢查

- `/api/health` 應回傳成功；此端點供容器存活與資料庫可用性檢查。
- 用 `docker compose ps` 確認應用程式及資料庫健康。
- 定期依[備份與還原](backup-restore.md)保留可還原的備份。
- 變更 HTTPS 網域後重新建置，確認登入與圖片上傳可用。
- 更新前先備份，再重新建置／拉取適用的映像。不要直接跨 PostgreSQL 大版本沿用資料目錄，應使用 dump／restore 或官方升級程序。
- 預設 Compose 專案名稱為 `kaiyolab`。同一主機多個網站時以 `-p 專案名稱` 區分 volumes、網路與服務，並配置不同網域／入口。
