#!/usr/bin/env bash
# Build locally, push static site to S3 + CloudFront (cheap, on-demand).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PROFILE="${AWS_PROFILE:-steve-copilot}"
REGION="${AWS_REGION:-us-east-2}"
ACCOUNT="$(aws sts get-caller-identity --profile "$PROFILE" --query Account --output text)"
BUCKET="${WEB_BUCKET:-paramedic-study-buddy-web-${ACCOUNT}}"
DIST_ID_FILE=".amplify-hosting/cloudfront-distribution-id"
STATE_DIR=".amplify-hosting"

mkdir -p "$STATE_DIR"

echo "Building (local)…"
npm run build

if ! aws s3api head-bucket --bucket "$BUCKET" --profile "$PROFILE" 2>/dev/null; then
  echo "Creating bucket s3://$BUCKET …"
  if [[ "$REGION" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$BUCKET" --profile "$PROFILE" --region "$REGION"
  else
    aws s3api create-bucket \
      --bucket "$BUCKET" \
      --profile "$PROFILE" \
      --region "$REGION" \
      --create-bucket-configuration LocationConstraint="$REGION"
  fi
  aws s3api put-public-access-block \
    --bucket "$BUCKET" \
    --profile "$PROFILE" \
    --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  aws s3api put-bucket-ownership-controls \
    --bucket "$BUCKET" \
    --profile "$PROFILE" \
    --ownership-controls 'Rules=[{ObjectOwnership=BucketOwnerEnforced}]'
fi

echo "$BUCKET" > "$STATE_DIR/bucket-name"

# Origin Access Control + CloudFront (create once)
if [[ ! -f "$DIST_ID_FILE" ]]; then
  echo "Creating CloudFront distribution…"
  OAC_ID="$(aws cloudfront create-origin-access-control \
    --profile "$PROFILE" \
    --origin-access-control-config \
    "Name=paramedic-study-buddy-oac,OriginAccessControlOriginType=s3,SigningBehavior=always,SigningProtocol=sigv4,Description=Paramedic Study Buddy SPA" \
    --query 'OriginAccessControl.Id' --output text)"

  CALLER="$(date +%s)"
  cat > "$STATE_DIR/distribution-config.json" <<EOF
{
  "CallerReference": "paramedic-study-buddy-$CALLER",
  "Comment": "Paramedic Study Buddy SPA",
  "Enabled": true,
  "DefaultRootObject": "index.html",
  "Origins": {
    "Quantity": 1,
    "Items": [
      {
        "Id": "s3-web",
        "DomainName": "${BUCKET}.s3.${REGION}.amazonaws.com",
        "S3OriginConfig": { "OriginAccessIdentity": "" },
        "OriginAccessControlId": "${OAC_ID}"
      }
    ]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-web",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 2,
      "Items": ["GET", "HEAD"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET", "HEAD"] }
    },
    "Compress": true,
    "ForwardedValues": {
      "QueryString": false,
      "Cookies": { "Forward": "none" }
    },
    "MinTTL": 0,
    "DefaultTTL": 86400,
    "MaxTTL": 31536000
  },
  "CustomErrorResponses": {
    "Quantity": 2,
    "Items": [
      {
        "ErrorCode": 403,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 0
      },
      {
        "ErrorCode": 404,
        "ResponsePagePath": "/index.html",
        "ResponseCode": "200",
        "ErrorCachingMinTTL": 0
      }
    ]
  },
  "PriceClass": "PriceClass_100",
  "ViewerCertificate": { "CloudFrontDefaultCertificate": true },
  "HttpVersion": "http2"
}
EOF

  DIST_ID="$(aws cloudfront create-distribution \
    --profile "$PROFILE" \
    --distribution-config "file://$STATE_DIR/distribution-config.json" \
    --query 'Distribution.Id' --output text)"
  echo "$DIST_ID" > "$DIST_ID_FILE"
  echo "$OAC_ID" > "$STATE_DIR/oac-id"

  # Bucket policy for this distribution
  cat > "$STATE_DIR/bucket-policy.json" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontRead",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::${BUCKET}/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::${ACCOUNT}:distribution/${DIST_ID}"
        }
      }
    }
  ]
}
EOF
  aws s3api put-bucket-policy \
    --bucket "$BUCKET" \
    --profile "$PROFILE" \
    --policy "file://$STATE_DIR/bucket-policy.json"
else
  DIST_ID="$(cat "$DIST_ID_FILE")"
fi

echo "Syncing dist/ → s3://$BUCKET …"
aws s3 sync dist/ "s3://$BUCKET/" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --delete \
  --cache-control "public,max-age=31536000,immutable" \
  --exclude "index.html" \
  --exclude "*.html"

aws s3 cp dist/index.html "s3://$BUCKET/index.html" \
  --profile "$PROFILE" \
  --region "$REGION" \
  --cache-control "public,max-age=60" \
  --content-type "text/html; charset=utf-8"

echo "Invalidating CloudFront $DIST_ID …"
aws cloudfront create-invalidation \
  --profile "$PROFILE" \
  --distribution-id "$DIST_ID" \
  --paths "/*" >/dev/null

DOMAIN="$(aws cloudfront get-distribution \
  --profile "$PROFILE" \
  --id "$DIST_ID" \
  --query 'Distribution.DomainName' --output text)"

echo "$DOMAIN" > "$STATE_DIR/domain"
echo
echo "Deployed: https://$DOMAIN"
echo "(CloudFront may take a few minutes on first create.)"
