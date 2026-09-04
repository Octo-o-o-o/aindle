#!/usr/bin/env python3
"""LAN preview server for the Aindle Oasis demo. No secrets, mock HTML only."""

from __future__ import annotations

import argparse
import http.server
import socket
import socketserver
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 8765


def lan_addrs() -> list[str]:
    found: list[str] = []
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("192.168.2.1", 80))
        found.append(sock.getsockname()[0])
        sock.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in found and not ip.startswith("127."):
                found.append(ip)
    except OSError:
        pass
    return found or ["<this-machine-lan-ip>"]


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def guess_type(self, path):
        ctype = super().guess_type(path)
        if ctype and ctype.startswith("text/"):
            return ctype + "; charset=utf-8"
        return ctype

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        sys_stderr = __import__("sys").stderr
        sys_stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve Aindle demo on the LAN")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    args = parser.parse_args()

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((args.host, args.port), Handler) as httpd:
        print("Aindle demo root: %s" % ROOT)
        print("Bind: %s:%s" % (args.host, args.port))
        print("Open on this Mac:  http://127.0.0.1:%s/" % args.port)
        print("Kindle / LAN:")
        for ip in lan_addrs():
            print("  http://%s:%s/" % (ip, args.port))
            print("  http://%s:%s/oasis-monitor.html?device=oasis1&kindle=1" % (ip, args.port))
        print("Ctrl+C to stop.")
        httpd.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
