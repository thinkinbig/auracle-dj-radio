#!/usr/bin/env bash
# 幂等创建 VM + 公网 IP(带 DNS label)+ NSG 规则。打印公网 IP / FQDN。
set -euo pipefail

SUBSCRIPTION="${SUBSCRIPTION:-cf1f480e-562c-4428-978e-5182874bcb0b}"
LOCATION="${LOCATION:-swedencentral}"
RG="${RG:-auracle-demo-rg}"
VM="${VM:-auracle-demo-vm}"
DNS_LABEL="${DNS_LABEL:-auracle-demo}"
SIZE="${SIZE:-Standard_B2als_v2}"
ADMIN="${ADMIN:-azureuser}"
UDP_MIN="${WEBRTC_UDP_PORT_MIN:-10000}"
UDP_MAX="${WEBRTC_UDP_PORT_MAX:-10100}"
SSH_CIDR="${SSH_CIDR:?set SSH_CIDR to your public IP/CIDR, e.g. 1.2.3.4/32}"

az account set --subscription "$SUBSCRIPTION"
az provider register --namespace Microsoft.Compute --wait
az group create --name "$RG" --location "$LOCATION" -o none

az vm create \
  --resource-group "$RG" --name "$VM" --image Ubuntu2204 \
  --size "$SIZE" --admin-username "$ADMIN" \
  --generate-ssh-keys --public-ip-address-dns-name "$DNS_LABEL" \
  --public-ip-sku Standard -o none

NSG="$(az network nsg list --resource-group "$RG" \
  --query "[?contains(name,'${VM}')].name | [0]" -o tsv)"

az network nsg rule create -g "$RG" --nsg-name "$NSG" -n allow-ssh \
  --priority 1001 --access Allow --protocol Tcp --direction Inbound \
  --destination-port-ranges 22 --source-address-prefixes "$SSH_CIDR" -o none
az network nsg rule create -g "$RG" --nsg-name "$NSG" -n allow-http \
  --priority 1002 --access Allow --protocol Tcp --direction Inbound \
  --destination-port-ranges 80 443 -o none
az network nsg rule create -g "$RG" --nsg-name "$NSG" -n allow-webrtc-udp \
  --priority 1003 --access Allow --protocol Udp --direction Inbound \
  --destination-port-ranges "${UDP_MIN}-${UDP_MAX}" -o none

IP="$(az vm show -d -g "$RG" -n "$VM" --query publicIps -o tsv)"
echo "VM_PUBLIC_IP=$IP"
echo "SITE_DOMAIN=${DNS_LABEL}.${LOCATION}.cloudapp.azure.com"
