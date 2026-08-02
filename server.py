"""
Simple Python Web Server to host the TOEIC Vocabulary Local Application
"""

import http.server
import socketserver
import webbrowser
import os
import json

PORT = 8000
WEB_DIR = os.path.join(os.path.dirname(__file__), "web")

PROGRESS_FILE = os.path.join(WEB_DIR, "data", "user_progress.json")

class CustomHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        if self.path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        if self.path.startswith("/api/progress"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            if os.path.exists(PROGRESS_FILE):
                try:
                    with open(PROGRESS_FILE, "rb") as f:
                        self.wfile.write(f.read())
                    return
                except Exception as e:
                    print(f"⚠️ Error reading progress file: {e}")
            
            # Default empty progress structure
            default_data = json.dumps({"learnedWords": [], "starredWords": [], "learnProgress": {}}).encode("utf-8")
            self.wfile.write(default_data)
            return

        super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/progress"):
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                post_data = self.rfile.read(content_length)
                
                # Verify JSON format
                parsed_data = json.loads(post_data.decode("utf-8"))
                
                os.makedirs(os.path.dirname(PROGRESS_FILE), exist_ok=True)
                with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
                    json.dump(parsed_data, f, ensure_ascii=False, indent=2)
                    
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode("utf-8"))
                return
            except Exception as e:
                print(f"⚠️ Error saving progress: {e}")
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
                return

        self.send_response(404)
        self.end_headers()

def run_server():
    import sys
    if sys.stdout.encoding.lower() != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    os.chdir(WEB_DIR)
    handler = CustomHTTPRequestHandler
    
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=" * 60)
        print(f"TOEIC VOCAB MASTER LOCAL WEB APP SAN SANG CHAY!")
        print(f"Mo trinh duyiet tai dia chi: {url}")
        print("=" * 60)
        
        # Tu dong mo trinh duyiet
        webbrowser.open(url)
        
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nDa dung Web Server.")

if __name__ == "__main__":
    run_server()
