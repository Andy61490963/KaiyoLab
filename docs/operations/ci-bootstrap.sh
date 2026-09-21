#!/bin/sh
set -eu
# 驗證平台以 root 啟動時會降權，以及新硬碟在重建後保留同一份密鑰。
image="$(docker compose images -q app)"
for attempt in 1 2; do
  docker run --rm --user 0:0 \
    -e INITIALIZE_SECRETS=true \
    -e SECRETS_DIR=/app/data/secrets \
    -e DATABASE_URL=postgresql://unused:unused@127.0.0.1:1/unused \
    -v kaiyolab-ci-bootstrap-secrets:/app/data/secrets \
    -v kaiyolab-ci-bootstrap-uploads:/app/data/uploads \
    --entrypoint node "$image" --input-type=module -e '
      import {readFile, writeFile} from "node:fs/promises";
      import {createHash} from "node:crypto";
      try { await import("./scripts/start.mjs"); throw new Error("意外啟動成功"); }
      catch (error) {
        if (!error.message.includes("scripts/migrate.mjs")) throw error;
        if (process.getuid() !== 1000) throw new Error("應用程式未降權");
        const key = await readFile("/app/data/secrets/auth-secret", "utf8");
        const hash = createHash("sha256").update(key).digest("hex");
        const marker = "/app/data/uploads/bootstrap-check";
        try { if ((await readFile(marker, "utf8")) !== hash) throw new Error("重啟後密鑰不同"); }
        catch (error) { if (error.code !== "ENOENT") throw error; await writeFile(marker, hash); }
        console.log("平台初始化、非 root 執行與持久化驗證通過");
      }
    '
done
docker volume rm kaiyolab-ci-bootstrap-secrets kaiyolab-ci-bootstrap-uploads
