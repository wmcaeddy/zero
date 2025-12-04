#!/usr/bin/env python3
"""
Zero-SPA Sample Protected Application

A simple Flask HTTP server that demonstrates a service protected by
Single Packet Authorization (SPA). This service is only accessible
after successful SPA + MFA authentication.

Run with: python3 app.py
Access at: http://192.168.2.19:8080 (after SPA authentication)
"""

import os
import socket
import datetime
from functools import wraps
from flask import Flask, request, jsonify, render_template_string

app = Flask(__name__)
app.secret_key = os.urandom(24)

# HTML template for the main page
MAIN_PAGE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Zero-SPA Protected Service</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #fff;
        }
        .container {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 40px;
            max-width: 600px;
            width: 90%;
            box-shadow: 0 25px 50px rgba(0,0,0,0.3);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            background: linear-gradient(45deg, #00d4ff, #7b2cbf);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .header .badge {
            background: #00d4ff;
            color: #1a1a2e;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.8em;
            font-weight: bold;
        }
        .status-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            margin: 30px 0;
        }
        .status-item {
            background: rgba(0,0,0,0.2);
            padding: 15px;
            border-radius: 10px;
            border-left: 3px solid #00d4ff;
        }
        .status-item .label {
            font-size: 0.8em;
            color: #888;
            margin-bottom: 5px;
        }
        .status-item .value {
            font-size: 1.1em;
            font-weight: bold;
        }
        .access-info {
            background: rgba(0,212,255,0.1);
            border: 1px solid rgba(0,212,255,0.3);
            border-radius: 10px;
            padding: 20px;
            margin-top: 20px;
        }
        .access-info h3 {
            color: #00d4ff;
            margin-bottom: 15px;
        }
        .access-info ul {
            list-style: none;
        }
        .access-info li {
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .access-info li:last-child {
            border-bottom: none;
        }
        .access-info .icon {
            margin-right: 10px;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            color: #666;
            font-size: 0.9em;
        }
        .footer a {
            color: #00d4ff;
            text-decoration: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Zero-SPA</h1>
            <span class="badge">PROTECTED SERVICE</span>
        </div>

        <p style="text-align: center; color: #aaa; margin-bottom: 20px;">
            You have successfully authenticated via Single Packet Authorization + MFA
        </p>

        <div class="status-grid">
            <div class="status-item">
                <div class="label">Your IP Address</div>
                <div class="value">{{ client_ip }}</div>
            </div>
            <div class="status-item">
                <div class="label">Server Time</div>
                <div class="value">{{ server_time }}</div>
            </div>
            <div class="status-item">
                <div class="label">Server Hostname</div>
                <div class="value">{{ hostname }}</div>
            </div>
            <div class="status-item">
                <div class="label">Port</div>
                <div class="value">{{ port }}</div>
            </div>
        </div>

        <div class="access-info">
            <h3>Security Information</h3>
            <ul>
                <li><span class="icon">🔐</span> SPA Authentication: Verified</li>
                <li><span class="icon">🛡️</span> HMAC Signature: Valid</li>
                <li><span class="icon">⏱️</span> Access Window: 30 seconds</li>
                <li><span class="icon">🔒</span> Encryption: AES-256-CBC</li>
            </ul>
        </div>

        <div class="footer">
            Powered by <a href="https://github.com/mrash/fwknop">fwknop</a> Single Packet Authorization
        </div>
    </div>
</body>
</html>
"""


def get_client_ip():
    """Get the real client IP, accounting for proxies."""
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    elif request.headers.get('X-Real-IP'):
        return request.headers.get('X-Real-IP')
    return request.remote_addr


@app.route('/')
def index():
    """Main page showing connection details."""
    return render_template_string(
        MAIN_PAGE,
        client_ip=get_client_ip(),
        server_time=datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        hostname=socket.gethostname(),
        port=os.environ.get('PORT', 8080)
    )


@app.route('/health')
def health():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'service': 'zero-spa-sample',
        'timestamp': datetime.datetime.utcnow().isoformat()
    })


@app.route('/api/whoami')
def whoami():
    """Return client connection information."""
    return jsonify({
        'client_ip': get_client_ip(),
        'user_agent': request.headers.get('User-Agent'),
        'timestamp': datetime.datetime.utcnow().isoformat(),
        'server': {
            'hostname': socket.gethostname(),
            'port': int(os.environ.get('PORT', 8080))
        },
        'security': {
            'spa_protected': True,
            'mfa_required': True,
            'access_window_seconds': 30
        }
    })


@app.route('/api/secret')
def secret():
    """Example protected resource."""
    return jsonify({
        'message': 'This is a secret resource protected by SPA + MFA',
        'data': {
            'secret_value': 'The treasure is buried under the old oak tree',
            'accessed_at': datetime.datetime.utcnow().isoformat(),
            'accessed_by': get_client_ip()
        }
    })


@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8080))
    host = os.environ.get('HOST', '0.0.0.0')

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║              Zero-SPA Sample Protected Application            ║
╠══════════════════════════════════════════════════════════════╣
║  This service is protected by Single Packet Authorization    ║
║  and requires MFA before access is granted.                  ║
║                                                              ║
║  Listening on: http://{host}:{port:<5}                          ║
║                                                              ║
║  Endpoints:                                                  ║
║    GET /           - Main status page                        ║
║    GET /health     - Health check                            ║
║    GET /api/whoami - Connection info                         ║
║    GET /api/secret - Protected resource                      ║
╚══════════════════════════════════════════════════════════════╝
    """)

    app.run(host=host, port=port, debug=False)
