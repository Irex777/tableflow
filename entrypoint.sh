#!/bin/sh
# Fix data directory permissions (volume mounted as root)
mkdir -p /app/data
chown -R appuser:appuser /app/data 2>/dev/null
# Drop privileges and run
exec su-exec appuser node server.js
