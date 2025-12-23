import subprocess
import shutil

def run_cmd(cmd):
    try:
        subprocess.run(cmd, shell=True, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Firewall Error: {e.stderr.decode().strip()}")
        return False

def check_root():
    if shutil.which("iptables") is None:
        return False
    # Check if we can run a simple command
    return run_cmd("iptables -L -n")

def lockdown(allow_ssh=True):
    print("Locking down host firewall...")
    
    # Flush existing rules
    run_cmd("iptables -F")
    run_cmd("iptables -X")
    
    # Allow local traffic
    run_cmd("iptables -A INPUT -i lo -j ACCEPT")
    
    # Allow established connections (so we don't kill ourself immediately if active)
    run_cmd("iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT")
    
    # Allow SSH (Port 22) - Safety net
    if allow_ssh:
        run_cmd("iptables -A INPUT -p tcp --dport 22 -j ACCEPT")

    # Allow Zero Portal (Port 9999)
    run_cmd("iptables -A INPUT -p tcp --dport 9999 -j ACCEPT")
        
    # Default Policy: DROP
    run_cmd("iptables -P INPUT DROP")
    run_cmd("iptables -P FORWARD DROP")
    
    print("Firewall locked down. SSH (22) and Portal (9999) allowed.")

def allow_ip(ip_address, duration_seconds=300):
    """
    Allow a specific IP address to access all ports (or specific ones)
    """
    print(f"Opening firewall for {ip_address}...")
    # Insert at top of INPUT chain
    run_cmd(f"iptables -I INPUT -s {ip_address} -j ACCEPT")
    
    # Note: In a real agent, we would schedule a removal task here.
    # For now, we trust the rule stays (or operator manages cleanup).


def reset():
    print("Resetting firewall (OPEN ALL)...")
    run_cmd("iptables -P INPUT ACCEPT")
    run_cmd("iptables -P FORWARD ACCEPT")
    run_cmd("iptables -F")
    run_cmd("iptables -X")
