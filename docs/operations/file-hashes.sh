#!/bin/sh
set -eu
umask 077
manifest="$(mktemp)"
trap 'rm -f "$manifest"' 0
trap 'exit 1' HUP INT TERM
# 對每一個實際檔案計算內容雜湊；名稱一併比對，避免遺漏或多出檔案。
# 不輸出圖片或密鑰內容；任一檔案無法讀取時，由 find 傳回失敗。
find /media /secrets -type f -exec sha256sum {} + > "$manifest"
LC_ALL=C sort "$manifest"
