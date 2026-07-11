#!/usr/bin/env bash
# 幂等把本地歌单媒体推到 Blob(mp3 + 封面 + 艺人图)。catalog JSON 不上传。
set -euo pipefail

RG="${RG:-auracle-demo-rg}"
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:?set STORAGE_ACCOUNT}"
CONTAINER="${CONTAINER:-catalog-media}"
DATA_DIR="${DATA_DIR:-packages/catalog/data}"

KEY="$(az storage account keys list --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RG" --query '[0].value' -o tsv)"

upload() { # $1 本地子目录  $2 blob 目标前缀
  az storage blob upload-batch \
    --account-name "$STORAGE_ACCOUNT" --account-key "$KEY" \
    --destination "$CONTAINER/$2" --source "$DATA_DIR/$1" \
    --overwrite -o none
  echo "uploaded $1 -> $CONTAINER/$2"
}

upload tracks  tracks
upload covers  covers
upload artists artists
