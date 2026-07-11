#!/usr/bin/env bash
# 开机(demo 前跑)。容器 restart: unless-stopped,会自动拉起,约 30-60s 可用。
set -euo pipefail

SUBSCRIPTION="${SUBSCRIPTION:-cf1f480e-562c-4428-978e-5182874bcb0b}"
RG="${RG:-auracle-demo-rg}"
VM="${VM:-auracle-demo-vm}"

az vm start --subscription "$SUBSCRIPTION" -g "$RG" -n "$VM" -o none
IP="$(az vm show -d --subscription "$SUBSCRIPTION" -g "$RG" -n "$VM" --query publicIps -o tsv)"
echo "started. public IP: $IP (Standard 静态,不变)"
echo "容器自动拉起,约 30-60s 后 https://auracle-demo.swedencentral.cloudapp.azure.com 可用。"
