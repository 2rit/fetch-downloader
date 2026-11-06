#!/bin/bash
# FETCH start script
export PATH="$HOME/.deno/bin:$PATH"
cd "$(dirname "$0")/backend"
echo "Starting FETCH on http://0.0.0.0:8000"
echo "Deno: $(command -v deno || echo 'not found')"
python3.11 main.py
