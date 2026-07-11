#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/inj-reviews}"

sudo cp "$APP_DIR/deploy/inj-reviews-backend.service" /etc/systemd/system/inj-reviews-backend.service
sudo cp "$APP_DIR/deploy/inj-reviews-frontend.service" /etc/systemd/system/inj-reviews-frontend.service

cd "$APP_DIR"
if [ -f backend.pid ]; then
  kill "$(cat backend.pid)" 2>/dev/null || true
  rm -f backend.pid
fi
if [ -f frontend.pid ]; then
  kill "$(cat frontend.pid)" 2>/dev/null || true
  rm -f frontend.pid
fi

if crontab -l >/tmp/inj-reviews-cron.$$ 2>/dev/null; then
  grep -v 'inj-reviews' /tmp/inj-reviews-cron.$$ | crontab - || true
fi
rm -f /tmp/inj-reviews-cron.$$ || true

sudo systemctl daemon-reload
sudo systemctl enable --now inj-reviews-backend inj-reviews-frontend
sudo systemctl status --no-pager inj-reviews-backend inj-reviews-frontend
