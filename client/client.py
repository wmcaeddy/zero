#!/usr/bin/env python3
import sys
import argparse
import socket
import time
from config import load_config, save_config, get_admin_url
from api import register_asset
from firewall import lockdown, reset, check_root
from portal import start_portal

def get_local_ip():
    # Helper to find primary IP
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def configure(args):
    current_config = load_config()
    
    print(f"Current Admin URL: {current_config.get('admin_url')}")
    new_url = input("Enter new Admin URL (press Enter to keep current): ").strip()
    
    if new_url:
        current_config['admin_url'] = new_url
        
    save_config(current_config)

def register(args):
    print("Registering Agent with Admin System...")
    hostname = socket.gethostname()
    ip = get_local_ip()
    
    print(f"Detected Hostname: {hostname}")
    print(f"Detected IP: {ip}")
    
    name = input(f"Enter Asset Name (default: {hostname}): ").strip() or hostname
    
    result = register_asset(name, ip)
    if result.get('success'):
        print("Registration Successful!")
    else:
        print(f"Registration Failed: {result.get('error')}")

def daemon(args):
    if not check_root():
        print("Error: Agent daemon must run as root (to manage iptables).")
        sys.exit(1)
        
    print("Starting Zero Agent Daemon...")
    print("Mode: Enforcing Host Firewall")
    
    # 1. Apply Baseline Security (Lockdown)
    lockdown(allow_ssh=True)
    
    print("Agent is active. \n - SSH: 22 (OPEN)\n - Portal: 9999 (OPEN)\n - Others: CLOSED")
    
    # 2. Start Web Portal (Blocking call)
    try:
        start_portal()
    except KeyboardInterrupt:
        print("\nStopping Agent...")

def cleanup(args):
    if not check_root():
        print("Error: Must run as root to reset firewall.")
        sys.exit(1)
    reset()

def main():
    parser = argparse.ArgumentParser(description="Zero Networks Host Agent")
    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # Configure
    parser_config = subparsers.add_parser("configure", help="Configure Agent settings")
    parser_config.set_defaults(func=configure)

    # Register
    parser_register = subparsers.add_parser("register", help="Register this host as an Asset")
    parser_register.set_defaults(func=register)

    # Daemon
    parser_daemon = subparsers.add_parser("daemon", help="Run the Agent Daemon (Enforce Firewall)")
    parser_daemon.set_defaults(func=daemon)
    
    # Reset
    parser_reset = subparsers.add_parser("reset", help="Reset Firewall (Allow All)")
    parser_reset.set_defaults(func=cleanup)

    args = parser.parse_args()

    if args.command:
        args.func(args)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
