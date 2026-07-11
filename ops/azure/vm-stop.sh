#!/usr/bin/env bash
# Run after demo: deallocate (not plain stop) to halt compute billing.
# Disk + static IP still incur a small monthly fee (~a few USD).
set -euo pipefail

SUBSCRIPTION="${SUBSCRIPTION:-cf1f480e-562c-4428-978e-5182874bcb0b}"
RG="${RG:-auracle-demo-rg}"
VM="${VM:-auracle-demo-vm}"

az vm deallocate --subscription "$SUBSCRIPTION" -g "$RG" -n "$VM" -o none
echo "deallocated. compute billing stopped. run vm-start.sh before the next demo."
