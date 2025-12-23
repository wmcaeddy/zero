import os
import json
from pathlib import Path

APP_NAME = "zero-client"
CONFIG_DIR = Path.home() / f".{APP_NAME}"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULT_CONFIG = {
    "admin_url": "https://zer0.up.railway.app",
    "username": None
}

def load_config():
    if not CONFIG_FILE.exists():
        return DEFAULT_CONFIG
    try:
        with open(CONFIG_FILE, "r") as f:
            return {**DEFAULT_CONFIG, **json.load(f)}
    except Exception as e:
        print(f"Warning: Could not load config: {e}")
        return DEFAULT_CONFIG

def save_config(config):
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)
    print(f"Configuration saved to {CONFIG_FILE}")

def get_admin_url():
    return load_config().get("admin_url")
