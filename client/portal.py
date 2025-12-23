from flask import Flask, request, render_template_string
from api import verify_mfa
from firewall import allow_ip
import socket

app = Flask(__name__)

HTML_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Zero Access Portal</title>
    <style>
        body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #f0f2f5; }
        .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); width: 300px; }
        h2 { margin-top: 0; color: #1a73e8; }
        input { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { width: 100%; padding: 10px; background: #1a73e8; color: white; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #1557b0; }
        .error { color: red; font-size: 0.9em; margin-bottom: 10px; }
        .success { color: green; text-align: center; }
    </style>
</head>
<body>
    <div class="card">
        <h2>Zero Access Portal</h2>
        {% if success %}
            <div class="success">
                <h3>Access Granted</h3>
                <p>Firewall opened for <b>{{ client_ip }}</b></p>
                <p>You may now connect to services on this host.</p>
            </div>
        {% else %}
            {% if error %}
                <div class="error">{{ error }}</div>
            {% endif %}
            <form method="POST" action="/verify">
                <label>Username</label>
                <input type="text" name="username" placeholder="Enter Username" required>
                <label>OTP Code</label>
                <input type="text" name="otp" placeholder="Enter OTP" required>
                <button type="submit">Unlock Access</button>
            </form>
        {% endif %}
    </div>
</body>
</html>
"""

@app.route('/', methods=['GET'])
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/verify', methods=['POST'])
def verify():
    username = request.form.get('username')
    otp = request.form.get('otp')
    client_ip = request.remote_addr
    
    # 1. Verify credentials via Admin API
    auth_result = verify_mfa(username, otp)
    
    if auth_result.get('success'):
        # 2. Unlock Firewall
        allow_ip(client_ip)
        return render_template_string(HTML_TEMPLATE, success=True, client_ip=client_ip)
    else:
        error = auth_result.get('error') or "Authentication Failed"
        return render_template_string(HTML_TEMPLATE, error=error)

def start_portal(port=9999):
    # Bind to 0.0.0.0 to allow external access
    app.run(host='0.0.0.0', port=port)

if __name__ == '__main__':
    start_portal()
