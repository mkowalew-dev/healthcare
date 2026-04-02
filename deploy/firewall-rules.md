# Firewall Rules Reference
## ALB + AWS Security Groups / Azure NSGs

The Application Load Balancer is the single internet-facing entry point.
VM1 and VM2 only accept traffic from the ALB — they have no public exposure.

```
Internet → ALB (port 80/443) → VM1:80  (/* — static frontend)
                              → VM2:3001 (/api/* — Node.js API)
                              → (health checks on both VMs)
```

---

### ALB / Application Gateway

| Direction | Port | Source | Description |
|-----------|------|--------|-------------|
| Inbound | 80 | 0.0.0.0/0 | HTTP from internet |
| Inbound | 443 | 0.0.0.0/0 | HTTPS from internet |
| Outbound | 80 | VM1 private IP | Health checks + traffic to Frontend VM |
| Outbound | 3001 | VM2 private IP | Health checks + traffic to API VM |

### VM1 — Frontend

| Direction | Port | Source | Description |
|-----------|------|--------|-------------|
| Inbound | 80 | ALB security group | HTTP from ALB only |
| Inbound | 22 | Admin IP | SSH |
| Outbound | All | 0.0.0.0/0 | General outbound |

### VM2 — API

| Direction | Port | Source | Description |
|-----------|------|--------|-------------|
| Inbound | 3001 | ALB security group | API requests from ALB only |
| Inbound | 22 | Admin IP | SSH |
| Outbound | 5432 | VM3 private IP | PostgreSQL |
| Outbound | All | 0.0.0.0/0 | General outbound |

### VM3 — Database

| Direction | Port | Source | Description |
|-----------|------|--------|-------------|
| Inbound | 5432 | VM2 private IP | PostgreSQL — API VM only |
| Inbound | 22 | Admin IP | SSH |
| Outbound | All | 0.0.0.0/0 | General outbound |

---

## AWS — Create Security Groups via CLI

```bash
# Prerequisites
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" \
  --query "Vpcs[0].VpcId" --output text)

ADMIN_IP="YOUR_IP/32"       # Your machine's IP for SSH
FRONTEND_IP="10.0.1.10/32"  # VM1 private IP
API_IP="10.0.1.20/32"       # VM2 private IP

# ── ALB Security Group ──
ALB_SG=$(aws ec2 create-security-group \
  --group-name careconnect-alb-sg \
  --description "CareConnect ALB" \
  --vpc-id $VPC_ID \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $ALB_SG \
  --ip-permissions \
  "IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTP}]" \
  "IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0,Description=HTTPS}]"

# ── Frontend SG (accepts from ALB SG only) ──
FRONTEND_SG=$(aws ec2 create-security-group \
  --group-name careconnect-frontend-sg \
  --description "CareConnect Frontend" \
  --vpc-id $VPC_ID \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $FRONTEND_SG \
  --ip-permissions \
  "IpProtocol=tcp,FromPort=80,ToPort=80,UserIdGroupPairs=[{GroupId=$ALB_SG,Description=HTTP-from-ALB}]" \
  "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$ADMIN_IP,Description=SSH}]"

# ── API SG (accepts from ALB SG only) ──
API_SG=$(aws ec2 create-security-group \
  --group-name careconnect-api-sg \
  --description "CareConnect API" \
  --vpc-id $VPC_ID \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $API_SG \
  --ip-permissions \
  "IpProtocol=tcp,FromPort=3001,ToPort=3001,UserIdGroupPairs=[{GroupId=$ALB_SG,Description=API-from-ALB}]" \
  "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$ADMIN_IP,Description=SSH}]"

# ── DB SG (accepts from API VM private IP only) ──
DB_SG=$(aws ec2 create-security-group \
  --group-name careconnect-db-sg \
  --description "CareConnect Database" \
  --vpc-id $VPC_ID \
  --query GroupId --output text)

aws ec2 authorize-security-group-ingress --group-id $DB_SG \
  --ip-permissions \
  "IpProtocol=tcp,FromPort=5432,ToPort=5432,IpRanges=[{CidrIp=$API_IP,Description=PostgreSQL-from-API}]" \
  "IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$ADMIN_IP,Description=SSH}]"

echo "ALB SG:      $ALB_SG"
echo "Frontend SG: $FRONTEND_SG"
echo "API SG:      $API_SG"
echo "DB SG:       $DB_SG"
```

### AWS ALB — Create Load Balancer and Listener Rules

```bash
# Prerequisites: two public subnets in your VPC
SUBNET_1="subnet-xxxxxxxx"
SUBNET_2="subnet-yyyyyyyy"

# Fetch instance IDs (or set manually)
FRONTEND_INSTANCE="i-xxxxxxxxxxxxxxxxx"   # VM1
API_INSTANCE="i-yyyyyyyyyyyyyyyyy"        # VM2

# ── Target Groups ──
FRONTEND_TG=$(aws elbv2 create-target-group \
  --name careconnect-frontend-tg \
  --protocol HTTP --port 80 \
  --vpc-id $VPC_ID \
  --health-check-path "/" \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --query "TargetGroups[0].TargetGroupArn" --output text)

API_TG=$(aws elbv2 create-target-group \
  --name careconnect-api-tg \
  --protocol HTTP --port 3001 \
  --vpc-id $VPC_ID \
  --health-check-path "/health" \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 3 \
  --query "TargetGroups[0].TargetGroupArn" --output text)

# Register VM instances
aws elbv2 register-targets --target-group-arn $FRONTEND_TG \
  --targets Id=$FRONTEND_INSTANCE
aws elbv2 register-targets --target-group-arn $API_TG \
  --targets Id=$API_INSTANCE

# ── ALB ──
ALB_ARN=$(aws elbv2 create-load-balancer \
  --name careconnect-alb \
  --subnets $SUBNET_1 $SUBNET_2 \
  --security-groups $ALB_SG \
  --query "LoadBalancers[0].LoadBalancerArn" --output text)

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns $ALB_ARN \
  --query "LoadBalancers[0].DNSName" --output text)

echo "ALB DNS: $ALB_DNS"

# ── HTTP Listener with path-based routing ──
LISTENER_ARN=$(aws elbv2 create-listener \
  --load-balancer-arn $ALB_ARN \
  --protocol HTTP --port 80 \
  --default-actions Type=forward,TargetGroupArn=$FRONTEND_TG \
  --query "Listeners[0].ListenerArn" --output text)

# /api/* → API target group (higher priority = evaluated first)
aws elbv2 create-rule \
  --listener-arn $LISTENER_ARN \
  --priority 10 \
  --conditions '[{"Field":"path-pattern","Values":["/api/*"]}]' \
  --actions "[{\"Type\":\"forward\",\"TargetGroupArn\":\"$API_TG\"}]"

# /health → API target group (for ThousandEyes end-to-end check)
aws elbv2 create-rule \
  --listener-arn $LISTENER_ARN \
  --priority 20 \
  --conditions '[{"Field":"path-pattern","Values":["/health"]}]' \
  --actions "[{\"Type\":\"forward\",\"TargetGroupArn\":\"$API_TG\"}]"

echo "Done. App available at: http://$ALB_DNS"
```

---

## Azure — Application Gateway + NSGs via CLI

```bash
RG="careconnect-rg"
LOCATION="eastus"
VNET="careconnect-vnet"
FRONTEND_IP="10.0.1.10"   # VM1 private IP
API_IP="10.0.1.20"         # VM2 private IP
ADMIN_IP="YOUR_IP"

az group create --name $RG --location $LOCATION

# ── Virtual Network ──
az network vnet create --resource-group $RG --name $VNET \
  --address-prefix 10.0.0.0/16 \
  --subnet-name app-subnet --subnet-prefix 10.0.1.0/24

az network vnet subnet create --resource-group $RG --vnet-name $VNET \
  --name appgw-subnet --address-prefix 10.0.2.0/24

# ── NSG: Frontend VM ──
az network nsg create --resource-group $RG --name careconnect-frontend-nsg

az network nsg rule create --resource-group $RG \
  --nsg-name careconnect-frontend-nsg --name Allow-HTTP-from-AppGW \
  --priority 100 --protocol Tcp --direction Inbound \
  --source-address-prefixes 10.0.2.0/24 \
  --destination-port-ranges 80 --access Allow

az network nsg rule create --resource-group $RG \
  --nsg-name careconnect-frontend-nsg --name Allow-SSH \
  --priority 110 --protocol Tcp --direction Inbound \
  --source-address-prefixes "$ADMIN_IP" --destination-port-ranges 22 --access Allow

# ── NSG: API VM ──
az network nsg create --resource-group $RG --name careconnect-api-nsg

az network nsg rule create --resource-group $RG \
  --nsg-name careconnect-api-nsg --name Allow-API-from-AppGW \
  --priority 100 --protocol Tcp --direction Inbound \
  --source-address-prefixes 10.0.2.0/24 \
  --destination-port-ranges 3001 --access Allow

az network nsg rule create --resource-group $RG \
  --nsg-name careconnect-api-nsg --name Allow-SSH \
  --priority 110 --protocol Tcp --direction Inbound \
  --source-address-prefixes "$ADMIN_IP" --destination-port-ranges 22 --access Allow

# ── NSG: DB VM ──
az network nsg create --resource-group $RG --name careconnect-db-nsg

az network nsg rule create --resource-group $RG \
  --nsg-name careconnect-db-nsg --name Allow-PG-from-API \
  --priority 100 --protocol Tcp --direction Inbound \
  --source-address-prefixes "$API_IP" --destination-port-ranges 5432 --access Allow

az network nsg rule create --resource-group $RG \
  --nsg-name careconnect-db-nsg --name Allow-SSH \
  --priority 110 --protocol Tcp --direction Inbound \
  --source-address-prefixes "$ADMIN_IP" --destination-port-ranges 22 --access Allow

# ── Public IP for Application Gateway ──
az network public-ip create --resource-group $RG \
  --name careconnect-appgw-pip --sku Standard --allocation-method Static

# ── Application Gateway (Standard_v2) ──
# Backend pools point to the VM private IPs
az network application-gateway create \
  --resource-group $RG \
  --name careconnect-appgw \
  --location $LOCATION \
  --sku Standard_v2 \
  --capacity 1 \
  --vnet-name $VNET \
  --subnet appgw-subnet \
  --public-ip-address careconnect-appgw-pip \
  --frontend-port 80 \
  --http-settings-port 80 \
  --http-settings-protocol Http \
  --routing-rule-type PathBasedRouting \
  --servers "$FRONTEND_IP"

# Add API backend pool
az network application-gateway address-pool create \
  --resource-group $RG --gateway-name careconnect-appgw \
  --name api-pool --servers "$API_IP"

# Add HTTP settings for API (port 3001)
az network application-gateway http-settings create \
  --resource-group $RG --gateway-name careconnect-appgw \
  --name api-http-settings \
  --port 3001 --protocol Http \
  --probe appgw-health-probe-api

# Add health probe for API
az network application-gateway probe create \
  --resource-group $RG --gateway-name careconnect-appgw \
  --name appgw-health-probe-api \
  --protocol Http --host-name-from-http-settings true \
  --path /health --interval 30 --threshold 3 --timeout 30

# URL path map: /api/* and /health → API pool; default → Frontend pool
az network application-gateway url-path-map create \
  --resource-group $RG --gateway-name careconnect-appgw \
  --name careconnect-path-map \
  --paths '/api/*' '/health' \
  --address-pool api-pool \
  --http-settings api-http-settings \
  --default-address-pool appGatewayBackendPool \
  --default-http-settings appGatewayBackendHttpSettings

APP_GW_IP=$(az network public-ip show --resource-group $RG \
  --name careconnect-appgw-pip --query ipAddress --output tsv)
echo "App Gateway IP: $APP_GW_IP"
echo "App available at: http://$APP_GW_IP"
```
