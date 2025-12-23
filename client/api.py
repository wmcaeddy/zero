import requests
import json
from config import get_admin_url

def get_base_url():
    url = get_admin_url()
    if url.endswith('/'):
        return url[:-1]
    return url

def verify_mfa(username, otp):
    endpoint = f"{get_base_url()}/api/auth/verify"
    try:
        payload = {"username": username, "otp": otp}
        response = requests.post(endpoint, json=payload, timeout=10)
        return response.json()
    except requests.exceptions.RequestException as e:
        return {"success": False, "error": f"Network error: {str(e)}"}

def request_connect(target_ip, port, username, protocol='tcp'):
    endpoint = f"{get_base_url()}/api/network/connect"
    try:
        payload = {
            "targetIp": target_ip,
            "port": port,
            "protocol": protocol,
            "username": username
        }
        response = requests.post(endpoint, json=payload, timeout=10)
        return response.json()
    except requests.exceptions.RequestException as e:
        return {"success": False, "error": f"Network error: {str(e)}"}

def register_asset(name, ip, os_type="Linux"):
    endpoint = f"{get_base_url()}/api/assets"
    try:
        payload = {
            "name": name,
            "ip": ip,
            "os": os_type
        }
        response = requests.post(endpoint, json=payload, timeout=10)
        return response.json()
    except requests.exceptions.RequestException as e:
        return {"success": False, "error": f"Network error: {str(e)}"}
