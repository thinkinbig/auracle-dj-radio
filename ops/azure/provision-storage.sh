#!/usr/bin/env bash
# 幂等创建存储账户 + 公开只读容器,打印 BLOB_BASE_URL / BLOB_HOST。
set -euo pipefail

SUBSCRIPTION="${SUBSCRIPTION:-cf1f480e-562c-4428-978e-5182874bcb0b}"
LOCATION="${LOCATION:-swedencentral}"
RG="${RG:-auracle-demo-rg}"
# 全局唯一、3-24 位小写字母数字。可用 STORAGE_ACCOUNT 覆盖。
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-auracledjmedia$RANDOM}"
CONTAINER="${CONTAINER:-catalog-media}"

az account set --subscription "$SUBSCRIPTION"
az provider register --namespace Microsoft.Storage --wait

az group create --name "$RG" --location "$LOCATION" -o none

az storage account create \
  --name "$STORAGE_ACCOUNT" --resource-group "$RG" --location "$LOCATION" \
  --sku Standard_LRS --kind StorageV2 \
  --allow-blob-public-access true -o none

KEY="$(az storage account keys list --account-name "$STORAGE_ACCOUNT" \
  --resource-group "$RG" --query '[0].value' -o tsv)"

az storage container create \
  --name "$CONTAINER" --account-name "$STORAGE_ACCOUNT" \
  --account-key "$KEY" --public-access blob -o none

echo "BLOB_BASE_URL=https://${STORAGE_ACCOUNT}.blob.core.windows.net/${CONTAINER}"
echo "BLOB_HOST=${STORAGE_ACCOUNT}.blob.core.windows.net"
