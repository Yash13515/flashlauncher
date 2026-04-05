import http.server
import socketserver
import urllib.request
import urllib.error
import urllib.parse
import ssl
import os
import json
import mimetypes

# ─── Config ───
PORT = int(os.environ.get('PORT', 8080))
TARGET_HOSTNAME = 'rocket.maximizer.io'

# Meta API credentials (stored securely in the backend — never sent to the browser)
META_ACCESS_TOKEN = os.environ.get('META_ACCESS_TOKEN', 'EAARvTJXAd88BRNgIPOb1ZCQbCLWtSOeL6ypE3XB6KcYPSbfJ3uZBWFLfFRD74weIKUHOKv7XD3j1p6ReYC2RViWgQz2TG6PdTM5cpLCrRCgPa0s1UYwZBsnOGW8nNQYwlnz7I9ljpYjB4cAJGrKhUJYAktJfIgLoEFaIc06CJZCwzN98ZAX2dZAl2eZCpCKrSgYNqzQ')
META_APP_ID     = os.environ.get('META_APP_ID', '1248274627459023')
META_AD_ACCOUNT = os.environ.get('META_AD_ACCOUNT', 'act_1263470675279125')
META_API_VER    = 'v21.0'
META_GRAPH_BASE = f'https://graph.facebook.com/{META_API_VER}'

ctx = ssl.create_default_context()

def meta_get(endpoint, params=None):
    """Make a GET request to the Meta Graph API and return parsed JSON."""
    qs = {'access_token': META_ACCESS_TOKEN}
    if params:
        qs.update(params)
    url = f"{META_GRAPH_BASE}{endpoint}?{urllib.parse.urlencode(qs)}"
    print(f"[Meta API] GET {url}")
    with urllib.request.urlopen(url, context=ctx) as resp:
        return json.loads(resp.read())

def meta_post(endpoint, body_dict):
    """Make a POST request to the Meta Graph API and return parsed JSON."""
    url = f"{META_GRAPH_BASE}{endpoint}"
    body_dict['access_token'] = META_ACCESS_TOKEN
    data = urllib.parse.urlencode(body_dict).encode('utf-8')
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/x-www-form-urlencoded')
    print(f"[Meta API] POST {url}")
    with urllib.request.urlopen(req, context=ctx) as resp:
        return json.loads(resp.read())

def send_json(handler, status, payload):
    body = json.dumps(payload).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.send_header('Content-Length', str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)

class FullStackHandler(http.server.SimpleHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'X-Requested-With, content-type, Authorization, Accept, x-api-key')
        self.end_headers()

    def do_GET(self):
        # ── Meta API proxy routes ──────────────────────────────────────
        if self.path == '/meta/adaccounts':
            try:
                data = meta_get('/me/adaccounts', {'fields': 'name,account_id,currency,account_status'})
                accounts = [
                    {'id': a['id'], 'name': a.get('name', 'Unknown'), 'currency': a.get('currency', 'USD')}
                    for a in data.get('data', [])
                ]
                send_json(self, 200, {'accounts': accounts})
            except Exception as e:
                send_json(self, 500, {'error': str(e)})
            return

        if self.path == '/meta/pages':
            try:
                data = meta_get('/me/accounts', {'fields': 'name,id,category'})
                pages = [{'id': p['id'], 'name': p['name']} for p in data.get('data', [])]
                send_json(self, 200, {'pages': pages})
            except Exception as e:
                send_json(self, 500, {'error': str(e)})
            return

        if self.path.startswith('/meta/pixels'):
            try:
                parsed = urllib.parse.urlparse(self.path)
                qs = urllib.parse.parse_qs(parsed.query)
                ad_account = qs.get('ad_account', [META_AD_ACCOUNT])[0]
                data = meta_get(f'/{ad_account}/adspixels', {'fields': 'name,id'})
                pixels = [{'id': p['id'], 'name': p['name']} for p in data.get('data', [])]
                send_json(self, 200, {'pixels': pixels})
            except Exception as e:
                send_json(self, 500, {'error': str(e)})
            return

        # ── Maximizer API proxy ────────────────────────────────────────
        if self.path.startswith('/api/'):
            self._proxy_maximizer()
            return

        # ── Redirect root to the new dashboard ──────────────────────────
        if self.path == '/':
            self.send_response(302)
            self.send_header('Location', '/dashboard-v2/index.html')
            self.end_headers()
            return

        # ── Legacy route ──────────────────────────────────────────────
        if self.path == '/old' or self.path == '/old/':
            self.path = '/index.html'

        super().do_GET()

    def do_POST(self):
        if self.path == '/meta/campaign':
            self._create_meta_campaign()
            return
        if self.path == '/meta/update-budget':
            self._update_meta_budget()
            return
        if self.path.startswith('/api/'):
            self._proxy_maximizer()
            return
        self.send_error(405, "Method Not Allowed")

    # ─── Create Meta Campaign  ────────────────────────────────────────
    def _create_meta_campaign(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length)) if length else {}

            results = []
            campaigns = body.get('campaigns', [body])  # support batch or single

            for c in campaigns:
                ad_account = c.get('adAccount', META_AD_ACCOUNT)
                # Normalise account id format
                if not ad_account.startswith('act_'):
                    ad_account = 'act_' + ad_account

                campaign_params = {
                    'name': c.get('name', 'Dashboard Campaign'),
                    'objective': c.get('objective', 'OUTCOME_TRAFFIC'),
                    'status': c.get('status', 'PAUSED'),
                    'special_ad_categories': '[]',
                }

                # Optional daily budget (in cents)
                budget_usd = float(c.get('budget', 5))
                campaign_params['daily_budget'] = int(budget_usd * 100)

                # Optional bid strategy
                bid_strategy = c.get('bidStrategy', 'COST_CAP').upper().replace(' ', '_')
                campaign_params['bid_strategy'] = bid_strategy

                result = meta_post(f'/{ad_account}/campaigns', campaign_params)
                results.append({'name': c.get('name'), 'id': result.get('id'), 'status': 'created'})
                print(f"[Meta] Created campaign: {result}")

            send_json(self, 200, {'success': True, 'results': results})

        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8')
            print(f"[Meta Error] {e.code}: {err_body}")
            send_json(self, e.code, {'error': err_body})
        except Exception as e:
            print(f"[Meta Error] {str(e)}")
            send_json(self, 500, {'error': str(e)})

    # ─── Update Meta Budget ──────────────────────────────────────────
    def _update_meta_budget(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length)) if length else {}
            
            c_name = body.get('campaignName')
            new_budget_usd = float(body.get('budget', 5))
            ad_account = body.get('adAccount', META_AD_ACCOUNT)
            if not ad_account.startswith('act_'): ad_account = 'act_' + ad_account

            # 1. Search for campaign ID by name
            search_params = {
                'fields': 'id,name',
                'filtering': json.dumps([{'field': 'name', 'operator': 'EQUAL', 'value': c_name}])
            }
            search_results = meta_get(f'/{ad_account}/campaigns', search_params)
            data = search_results.get('data', [])

            if not data:
                send_json(self, 404, {'error': f'Campaign "{c_name}" not found on Meta account {ad_account}'})
                return

            campaign_id = data[0]['id']

            # 2. Update Budget
            update_params = {
                'daily_budget': int(new_budget_usd * 100)
            }
            result = meta_post(f'/{campaign_id}', update_params)
            
            send_json(self, 200, {'success': True, 'id': campaign_id, 'result': result})
            print(f"[Meta] Updated budget for {c_name} ({campaign_id}) to ${new_budget_usd}")

        except Exception as e:
            print(f"[Meta Error Update] {str(e)}")
            send_json(self, 500, {'error': str(e)})

    # ─── Maximizer Proxy ──────────────────────────────────────────────
    def _proxy_maximizer(self):
        target_url = f"https://{TARGET_HOSTNAME}{self.path}"
        print(f"[Proxy] {self.command} {self.path} -> {target_url}")

        req = urllib.request.Request(target_url, method=self.command)
        for key, value in self.headers.items():
            if key.lower() not in ['host', 'origin', 'referer', 'accept-encoding']:
                req.add_header(key, value)
        req.add_header('Host', TARGET_HOSTNAME)

        if self.command == 'POST' and 'Content-Length' in self.headers:
            req.data = self.rfile.read(int(self.headers['Content-Length']))

        try:
            with urllib.request.urlopen(req, context=ctx) as response:
                self.send_response(response.status)
                self.send_header('Access-Control-Allow-Origin', '*')
                for key, value in response.headers.items():
                    if key.lower() not in ['transfer-encoding']:
                        self.send_header(key, value)
                self.end_headers()
                self.wfile.write(response.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('Access-Control-Allow-Origin', '*')
            for key, value in e.headers.items():
                if key.lower() not in ['transfer-encoding']:
                    self.send_header(key, value)
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_response(500)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(f"Proxy Error: {str(e)}".encode('utf-8'))

    def log_message(self, format, *args):
        print(f"[{self.address_string()}] {format % args}")

# ─── MIME types (Windows compatibility) ───
mimetypes.init()
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('text/css', '.css')

print(f"[Server] Starting on port {PORT}")
print(f"[Server] Meta Ad Account: {META_AD_ACCOUNT}")
with socketserver.ThreadingTCPServer(("", PORT), FullStackHandler) as httpd:
    print(f"[Server] Dashboard ready at http://localhost:{PORT}")
    httpd.serve_forever()
