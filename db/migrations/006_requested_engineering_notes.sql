-- User-requested original notes. Data only; no schema or settings changes.
-- The migration runner wraps this file in one transaction under its migration lock.
-- Insert once, never overwrite matching drafts, published entries, or deleted entries.
WITH seed(id, title, slug, excerpt, category, tags, body) AS (
  VALUES
  ('7e08ed09-d422-5ee9-8843-e18223d69bdd', 'C# 依賴注入：一個介面註冊多個實作，最後會拿到誰？', 'dotnet-di-multiple-implementations', '從單一服務解析與 IEnumerable<T> 的差異，整理多實作選擇、生命週期與測試時容易忽略的邊界。', 'Backend', ARRAY['C#','.NET','Dependency Injection']::text[], $note$多個類別實作同一個介面時，先別急著增加 Factory 或 Resolver。先釐清呼叫端究竟需要「預設的一個實作」，還是「所有實作」。這兩個需求在 DI 中並不相同。

## 註冊不是把前面的類別刪掉

下面是註冊片段；假設 `CardPaymentService` 與 `BankTransferService` 都實作 `IPaymentService`：

```csharp
builder.Services.AddScoped<IPaymentService, CardPaymentService>();
builder.Services.AddScoped<IPaymentService, BankTransferService>();
```

使用內建容器解析單一 `IPaymentService`，會取得最後註冊的實作；解析 `IEnumerable<IPaymentService>`，則依註冊順序取得所有一般、非 keyed 的實作。這不是每次呼叫都把上一個物件覆蓋掉，而是解析方式不同。[官方行為說明](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection#service-registration-methods)。

## 什麼時候需要 Resolver？

假設付款方式由請求資料決定，呼叫端就需要明確的選擇規則。可以讓每個實作宣告自己支援的 enum，再把實作集合整理成唯讀查找表。這是設計選項，不是每個介面都需要的固定架構。

建立查找表時，應拒絕重複的 enum。查不到實作時，也應回報可理解的錯誤，而不是悄悄改用另一種付款方式。否則設定錯誤會被藏成業務行為。

只有兩個穩定分支時，清楚的小型條件判斷也可能足夠。比較方案時，我會先問：選擇規則會不會變？是否需要集中驗證？Controller 是否已承擔太多工作？

## 生命週期比 Pattern 名稱重要

如果實作包含 request-scoped 狀態，Resolver 也不能被設成會長期持有它們的 Singleton。`IReadOnlyDictionary` 只限制查找表的介面，並不會自動讓表內的服務具備 thread safety。[生命週期與 scope 指引](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection/overview#scope-validation)。

## 我會保留的測試

測試已知 enum 是否選到正確實作、未知值是否拒絕、重複註冊是否被發現，並確認一個 request 的狀態不會流到下一個 request。這些測試比證明自己用了 Strategy Pattern 更能保護系統。

核心原則是：先把解析行為與生命週期講清楚，再增加真正需要的選擇機制。$note$),
  ('92adaa40-96d7-59ed-9cfa-6b7ed488d461', 'HTTPS 排錯：RemoteCertificateNameMismatch 不是換個協定就會好', 'tls-certificate-name-mismatch', '把 URL 主機名稱、重新導向、TLS 憑證與同步狀態檔拆開檢查，避免修掉連線問題後又誤判下一層錯誤。', 'Operations', ARRAY['HTTPS','C#','Troubleshooting']::text[], $note$HTTP 改成 HTTPS，不代表憑證問題就一定解決。程式最後連到的主機名稱，也必須符合伺服器提供的憑證。

## 先看錯誤屬於哪一層

在 .NET 的 `SslPolicyErrors` 中，`RemoteCertificateNameMismatch` 指的是憑證名稱不相符；它和憑證鏈錯誤、沒有收到憑證是不同的狀態。[Microsoft 列舉說明](https://learn.microsoft.com/en-us/dotnet/api/system.net.security.sslpolicyerrors?view=net-10.0)。

因此，我會先把「DNS 解析到哪裡」、「HTTP 是否重新導向」、「最後的 HTTPS 主機名稱」分開記錄。不要因為 IP 可連線，就推論憑證也一定正確。

## 用小範圍請求觀察，不急著改程式

以下使用保留的範例網域，執行前要換成自己的服務來源：

```powershell
curl.exe -i --max-time 15 http://sync.example.test/api/health
curl.exe -i --max-time 15 https://sync.example.test/api/health
```

第一個請求用來觀察狀態碼與 `Location`；第二個直接確認預期的 HTTPS 來源。這裡刻意不提供略過憑證檢查的參數，也不要貼出 API Key 或完整授權標頭。

若正式服務的憑證屬於自訂網域，客戶端應使用那個網域，而不是任意替換成舊雲端主機名稱或 IP。修正後重新啟動客戶端，再確認實際載入的設定。

## 連線修好後出現 JSON 錯誤，是另一個問題

同步系統可能先卡在 TLS；修好連線之後，才走到讀取本機狀態檔的步驟。如果接著出現 `LastSyncUtc` 或 Model 無法反序列化，應檢查狀態檔結構和程式版本，不要把所有錯誤都歸成憑證問題。

在調整狀態檔之前，先備份原檔並確認它記錄的意義。刪除狀態檔可能讓系統重新掃描或計算雜湊；是否會重傳、漏同步或影響刪除行為，取決於實際演算法，不能靠猜測保證。

## 修正要能被驗證

我的驗收順序是：健康端點可達、憑證檢查成功、程式載入正確設定、狀態檔可讀，最後才檢查檔案一致性。不要用全域關閉憑證驗證，換取表面上的「同步成功」。$note$),
  ('0581f30e-9942-5648-84ac-ecdd5c8aae4b', 'Debugging a 502: a healthy container is only half the story', 'debugging-502-container-vs-public', 'Separate the listening port, gateway route, database probe, and deployed revision before changing infrastructure settings.', 'Operations', ARRAY['Deployment','Docker','Troubleshooting']::text[], $note$A successful build is not the same thing as a reachable website. A healthy process inside a container is another useful piece of evidence, but it still does not prove that the public gateway can reach that process.

## The two probes answer different questions

During this site's deployment checks, the container responded with HTTP 200 on port 8080 while port 4321 refused the connection. That narrowed the investigation: the process was running, and the next question was where the gateway was forwarding requests.

The public health endpoint later returned HTTP 200 with the expected revision. That established external reachability at the time of the check. It did not, by itself, establish which configuration change fixed the earlier failure.

## Write down the contract

For a container deployment, record the application listening address, its actual port, the platform's internal HTTP target, and the public hostname. A Dockerfile declaration and a runtime environment variable can describe different ports. Zeabur documents how it selects service ports for Dockerfile deployments in its [public networking guide](https://zeabur.com/docs/en-US/deploy/networking/public-networking).

Do not repeatedly change both sides. Pick one intended internal port, verify the platform setting, and make the application agree with it. Keep the public HTTPS port separate from this internal HTTP connection.

## Test from outside the container

Use the real hostname from your own machine. The following uses an example hostname rather than production credentials:

```powershell
curl.exe -i --max-time 15 https://site.example.test/api/health
```

Check the HTTP status, response shape, and deployed revision. A revision is useful because an older healthy process can otherwise look like a successful release.

## Keep the conclusion narrower than the evidence

If a health endpoint runs a small database query, success establishes that the query worked. It does not validate every table, permission, application route, or user journey.

After public health succeeds, test login and the page that originally failed. Only then test a small, reversible content update. If one page still fails, investigate that request rather than restarting the entire deployment diagnosis from zero.

The most useful incident note records the observed facts, the hypothesis, the single change made, and the verification result. Avoid turning a plausible explanation into a confirmed root cause without evidence.$note$),
  ('6f3aad92-fc96-5a81-b86a-a61333543aed', '後台 UX：自動儲存不應該等於自動發布', 'draft-autosave-publish-boundaries', '從草稿、公開快照、未儲存提示與多分頁衝突，整理內容編輯器應該清楚表達的狀態。', 'Engineering', ARRAY['UI/UX','Concurrency','CMS']::text[], $note$編輯器看起來整齊，不代表使用者能安心操作。對內容管理系統來說，最重要的問題是：我現在改的內容，讀者看得到了嗎？

## 先把「儲存」和「公開」拆開

我會把正在編輯的草稿與讀者看到的公開快照視為兩份不同狀態。自動儲存更新草稿；明確按下發布，才讓新的內容成為公開版本。

因此，按鈕應直接寫出動作，例如 Save draft 和 Publish changes。不要只顯示含糊的完成圖示，也不要在背景自動儲存後，讓使用者誤以為新內容已公開。

## 已儲存提示要對應真正的版本

假設使用者送出版本 A，等待期間又繼續輸入成版本 B。A 的成功回應到達時，不能把目前畫面標示為「所有變更已儲存」。正確的提示應根據送出的快照與目前輸入比較，保留 B 尚未送出的狀態。

同樣地，網路失敗時應保留輸入、提供重試和匯出方式，而不是清空表單。這是本文建議的交互設計，不是單靠一個 toast 就能解決的問題。

## 本機復原資料也需要選擇流程

發現舊的本機草稿時，先讓使用者決定要復原，還是採用伺服器內容。尚未決定之前，不應開始新的自動儲存，把待復原的資料覆蓋掉。

若本機儲存空間不可用，也要讓使用者知道。不要顯示一個其實沒有成功保存的「本機已備份」狀態。

## 多分頁衝突不是最後寫入者永遠正確

對需要版本保護的文章編輯，可以讓儲存請求帶上使用者讀取時的版本。版本已改變就拒絕覆蓋，讓使用者比較、重載或另存草稿。若透過 HTTP 條件請求實作，`If-Match` 是可研究的標準機制；它不等於所有現有 API 都已使用這個標頭。[HTTP If-Match](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Match)。

## 驗收要走完整手順

我會實際測試：修改已發布文章但只存草稿、儲存途中繼續輸入、斷線後重試、重新整理後復原，以及兩個分頁同時編輯。再確認鍵盤操作、手機工具列與明暗模式都沒有遮住主要動作。

好的後台 UX 不是增加更多按鈕，而是讓每個狀態都能被理解，且錯誤不會悄悄變成內容遺失。$note$),
  ('71f1aecb-9580-5e0c-a1f0-328cde7ae044', 'MES 系統整合：Timeout 之後，重試之前', 'mes-integration-before-retry', '逾時不代表對方沒有成功。先釐清業務操作識別碼、冪等性與補償責任，再決定如何重試跨系統寫入。', 'Backend', ARRAY['MES','Integration','Reliability']::text[], $note$假設 MES 把一筆報工傳到另一套系統，對方已經寫入，但回應在網路途中遺失。呼叫端看到 Timeout，能直接再送一次嗎？

不一定。這個例子使用虛構情境，不代表任何特定客戶或既有 MES 的設計。

## Timeout 只告訴我們沒有收到結果

把「沒有收到成功回應」當成「對方一定沒有執行」，是跨系統寫入最危險的假設之一。重試策略要看操作是否能安全重複、故障是否暫時，以及總等待時間是否可接受。[Microsoft Retry pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/retry)。

## 先定義一筆業務操作的身分

報工、過站、扣料可能是不同操作。識別碼應對應業務上的一次動作，而不是每一次 HTTP 嘗試。否則每次重試都產生新識別碼，接收端仍會把它們當成新工作。

我會先列出契約：相同識別碼與相同內容重送時要回什麼？相同識別碼卻帶不同內容要如何拒絕？接收端如何原子地辨認重複操作？呼叫端又如何查詢最終狀態？這些都需要雙方確認，不能只在客戶端增加一個 Retry 迴圈。

## Transaction 不會自動跨過 HTTP

在本機 SQL Transaction 裡包住一個外部 HTTP 呼叫，不會因此讓另一套系統一起回滾，反而可能延長本機鎖定與連線持有時間。

針對具體流程，可以評估提交後派送、既有佇列或可追蹤的補送機制；但不要沒確認業務條件，就假設能補償每一種操作。扣料能否反沖、報工能否撤回，都不是技術層能自行決定的規則。

## 把重試與人工處理分開

驗證錯誤通常需要修正資料，不能靠重試變正確。暫時故障可以有有限次數的退避重試；超過界線後，應留下可查詢的操作狀態與追蹤 ID，而不是無限重送。

## 上線前的演練

測試對方已成功但回應遺失、同一操作同時重送、接收端回報衝突、程式在送出前後重啟，以及人工補送時的權限與稽核。最終驗收應看「業務動作只發生應有的次數」，不是只有 HTTP 回傳 200。$note$)
), payload AS (
  SELECT id, slug, jsonb_build_object(
    'title', title, 'slug', slug, 'excerpt', excerpt, 'body', body,
    'category', category, 'tags', to_jsonb(tags), 'featured', false,
    'cover', '', 'coverAlt', '', 'seoTitle', '', 'seoDescription', '',
    'demoUrl', '', 'repoUrl', ''
  ) AS content
  FROM seed
)
INSERT INTO entries(id, kind, content, published, published_at, updated_at, version)
SELECT id, 'article', content, content, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1
FROM payload p
WHERE NOT EXISTS (
  SELECT 1 FROM entries e
  WHERE e.id = p.id OR (e.kind = 'article' AND
    (e.content ->> 'slug' = p.slug OR e.published ->> 'slug' = p.slug))
)
ON CONFLICT DO NOTHING;

-- Populate navigation metadata without renaming any existing taxonomy.
WITH names(kind, name, slug) AS (
  VALUES
  ('category', 'Backend', 'backend'),
  ('category', 'Operations', 'operations'),
  ('category', 'Engineering', 'engineering'),
  ('tag', 'C#', 'csharp'), ('tag', '.NET', 'dotnet'),
  ('tag', 'Dependency Injection', 'dependency-injection'),
  ('tag', 'HTTPS', 'https'), ('tag', 'Troubleshooting', 'troubleshooting'),
  ('tag', 'Deployment', 'deployment'), ('tag', 'Docker', 'docker'),
  ('tag', 'UI/UX', 'ui-ux'), ('tag', 'Concurrency', 'concurrency'),
  ('tag', 'CMS', 'cms'), ('tag', 'MES', 'mes'),
  ('tag', 'Integration', 'integration'), ('tag', 'Reliability', 'reliability')
)
INSERT INTO taxonomies(id, kind, name, slug)
SELECT md5('kaiyolab-requested-notes/' || kind || '/' || slug)::uuid::text, kind, name, slug
FROM names
ON CONFLICT DO NOTHING;
