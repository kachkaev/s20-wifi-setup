#!/bin/bash
# Run while connected to the WiWo-S20 Wi-Fi access point.
# Captures everything needed to figure out why pairing fails.
# Usage: bash scripts/s20-diagnose.sh
# Asks for sudo once (for tcpdump + arp -d).

set +e
OUT=/tmp/s20-diag.txt
PCAP=/tmp/s20-tcpdump.txt
: > "$OUT"
: > "$PCAP"

log() { echo "$@" | tee -a "$OUT"; }
run() {
  log ""
  log "### $* ###"
  eval "$@" 2>&1 | tee -a "$OUT"
}

log "=================================================="
log " Wiwo S20 pairing diagnostic — $(date)"
log "=================================================="

# --- Are we even on the right network? ---
run "networksetup -getairportnetwork en0"
run "ipconfig getifaddr en0"
run "ifconfig en0 | grep -E 'inet |status|ether'"
run "route -n get 10.10.100.254"
run "netstat -rn -f inet | grep -E '10\\.10\\.100|en0' | head -20"
run "arp -an | grep 10.10.100 || echo '(arp empty)'"

# --- Clear any stale ARP, start packet capture, then probe ---
log ""
log "### sudo arp -d 10.10.100.254 (clear stale entry) ###"
sudo arp -d 10.10.100.254 2>&1 | tee -a "$OUT"

log ""
log "### starting tcpdump on en0 for udp/48899 + arp ... ###"
sudo tcpdump -i en0 -n -v -l 'udp port 48899 or arp' > "$PCAP" 2>&1 &
TCPPID=$!
sleep 1

# --- Layer 3 reachability ---
run "ping -c2 -W500 10.10.100.254"
run "ping -c1 -W500 10.10.100.1"

# --- UDP discovery via broadcast and unicast ---
log ""
log "### python3 UDP probes (broadcast + unicast) ###"
python3 - << 'PY' 2>&1 | tee -a "$OUT"
import socket, time

def probe(target, broadcast=False, label=""):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    if broadcast:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    try:
        s.bind(("", 48899))
    except OSError as e:
        print(f"[{label}] bind error: {e}")
        return
    s.settimeout(2.5)
    try:
        s.sendto(b"HF-A11ASSISTHREAD", (target, 48899))
        print(f"[{label}] sent HF-A11ASSISTHREAD -> {target}:48899")
    except OSError as e:
        print(f"[{label}] send error: {e}")
        s.close()
        return
    deadline = time.time() + 2.5
    got = 0
    while time.time() < deadline:
        try:
            data, addr = s.recvfrom(1024)
            got += 1
            print(f"[{label}] reply from {addr}: {data!r}")
        except socket.timeout:
            break
    if got == 0:
        print(f"[{label}] (no replies)")
    s.close()

probe("10.10.100.255", broadcast=True, label="broadcast")
probe("10.10.100.254", broadcast=False, label="unicast .254")
probe("255.255.255.255", broadcast=True, label="global-broadcast")
PY

# --- ARP table after probes ---
log ""
log "### ARP table after probes ###"
arp -an | grep 10.10.100 | tee -a "$OUT"

# --- Stop capture and dump it ---
sleep 1
sudo kill "$TCPPID" 2> /dev/null
wait "$TCPPID" 2> /dev/null

log ""
log "### tcpdump capture ($PCAP) ###"
sed -n '1,200p' "$PCAP" | tee -a "$OUT"

log ""
log "=================================================="
log " Done. Full output: $OUT"
log "=================================================="
