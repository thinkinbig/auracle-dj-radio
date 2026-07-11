#!/usr/bin/env bash
# Start VM (run before demo). Containers use restart: unless-stopped and auto-start in ~30-60s.
set -euo pipefail

SUBSCRIPTION="${SUBSCRIPTION:-cf1f480e-562c-4428-978e-5182874bcb0b}"
RG="${RG:-auracle-demo-rg}"
VM="${VM:-auracle-demo-vm}"

az vm start --subscription "$SUBSCRIPTION" -g "$RG" -n "$VM" -o none
IP="$(az vm show -d --subscription "$SUBSCRIPTION" -g "$RG" -n "$VM" --query publicIps -o tsv)"
echo "started. public IP: $IP (Standard static, unchanged)"
echo "containers auto-start; https://auracle-demo.swedencentral.cloudapp.azure.com should be up in ~30-60s."
