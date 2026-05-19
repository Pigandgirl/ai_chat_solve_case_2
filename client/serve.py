import http.server
import http.client
import urllib.parse
import os
import sys
import select
import socket

API_HOST = os.environ.get("API_HOST", "fastapi")
API_PORT = int(os.environ.get("API_PORT", "8000"))
LISTEN_PORT = int(os.environ.get("LISTEN_PORT", "80"))
STATIC_DIR = os.environ.get("STATIC_DIR", "/usr/share/frontend")


class ProxyHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_GET(self):
        if self.path.startswith("/api/") or self.path.startswith("/ws/"):
            self.proxy_request("GET")
        else:
            file_path = os.path.join(STATIC_DIR, self.path.lstrip("/"))
            if self.path == "/" or not os.path.isfile(file_path):
                self.path = "/index.html"
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            self.proxy_request("POST")
        else:
            self.send_error(404)

    def do_PUT(self):
        if self.path.startswith("/api/"):
            self.proxy_request("PUT")
        else:
            self.send_error(404)

    def do_DELETE(self):
        if self.path.startswith("/api/"):
            self.proxy_request("DELETE")
        else:
            self.send_error(404)

    def do_PATCH(self):
        if self.path.startswith("/api/"):
            self.proxy_request("PATCH")
        else:
            self.send_error(404)

    def proxy_request(self, method):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        conn = http.client.HTTPConnection(API_HOST, API_PORT, timeout=300)

        if path.startswith("/ws/"):
            self.proxy_websocket()
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length) if content_length > 0 else None

        headers = {}
        for key, value in self.headers.items():
            if key.lower() not in ("host", "connection"):
                headers[key] = value
        headers["Host"] = f"{API_HOST}:{API_PORT}"

        try:
            conn.request(method, path, body=body, headers=headers)
            resp = conn.getresponse()
            self.send_response(resp.status)
            for key, value in resp.getheaders():
                if key.lower() != "transfer-encoding":
                    self.send_header(key, value)
            self.end_headers()
            data = resp.read()
            self.wfile.write(data)
        except Exception as e:
            self.send_error(502, f"Proxy error: {e}")
        finally:
            conn.close()

    def proxy_websocket(self):
        self.send_error(426, "WebSocket upgrade required - connect to API directly")
        return

    def log_message(self, format, *args):
        sys.stderr.write(f"[frontend] {args[0]}\n")


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", LISTEN_PORT), ProxyHandler)
    print(f"[frontend] Serving {STATIC_DIR} on port {LISTEN_PORT}, proxying /api to {API_HOST}:{API_PORT}")
    server.serve_forever()
