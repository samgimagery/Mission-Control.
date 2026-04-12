#!/bin/bash
# Production startup script for Mission Control
# Uses the Python dev server with full API support (Forge, Pulse, QC, Snapshots)

cd /Users/samg/AI/OpenClaw/dev/mission-control

exec /opt/homebrew/bin/python3 \
  features/asset-manager/tools/dev_server.py