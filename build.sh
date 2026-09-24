#!/usr/bin/env bash
# Builds the standalone posture-checker website and zips both deliverables.
# The website reuses the extension's checker code so the two never drift apart.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf web dist
mkdir -p web/shared web/icons dist
cp -R extension/checker web/checker
cp extension/shared/base.css extension/shared/config.js extension/shared/store.js web/shared/
cp extension/icons/icon32.png extension/icons/icon48.png extension/icons/icon512.png web/icons/

cat > web/index.html <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>WristGuard Posture Check</title>
  <meta http-equiv="refresh" content="0; url=checker/">
  <link rel="icon" href="icons/icon32.png">
</head>
<body><a href="checker/">Open the WristGuard posture checker</a></body>
</html>
HTML

(cd extension && zip -qr ../dist/wristguard-extension.zip . -x '*.DS_Store')
(cd web && zip -qr ../dist/wristguard-web.zip . -x '*.DS_Store')
echo "Built:"; ls -lh dist
