#!/usr/bin/env python3
import http.server
import socketserver
import os

PORT = 8000
DIRECTORY = "/Users/samg/AI/OpenClaw/dev/mission-control"

# Change to the directory containing the files
os.chdir(DIRECTORY)

Handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at port {PORT}")
    print(f"Directory: {DIRECTORY}")
    print("Access this from other devices using: http://192.168.1.100:8000")
    httpd.serve_forever()