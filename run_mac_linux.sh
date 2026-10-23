#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
python3 -m pip install -r requirements.txt
printf '\nDesktop: http://127.0.0.1:8002\nPhone: http://YOUR-COMPUTER-LAN-IP:8002 (same trusted Wi-Fi)\n'
python3 -m uvicorn server:app --host 0.0.0.0 --port 8002
