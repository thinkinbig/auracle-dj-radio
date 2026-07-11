#!/usr/bin/env bash
# demo 完跑这个:deallocate(不是普通关机),停掉 compute 计费。
# 磁盘 + 静态 IP 仍有小额费用(~几刀/月)。
set -euo pipefail

SUBSCRIPTION="${SUBSCRIPTION:-cf1f480e-562c-4428-978e-5182874bcb0b}"
RG="${RG:-auracle-demo-rg}"
VM="${VM:-auracle-demo-vm}"

az vm deallocate --subscription "$SUBSCRIPTION" -g "$RG" -n "$VM" -o none
echo "deallocated. compute 计费已停。下次 demo 前跑 vm-start.sh。"
