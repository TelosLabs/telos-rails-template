#!/bin/bash
set -euo pipefail

echo "==> Initializing firewall rules..."

# ---------- helpers ----------------------------------------------------------

ipset_add_safe() {
  local set_name="$1"
  local value="$2"
  ipset add "$set_name" "$value" 2>/dev/null || true
}

is_ipv6_enabled() {
  [ -f /proc/sys/net/ipv6/conf/all/disable_ipv6 ] && [ "$(cat /proc/sys/net/ipv6/conf/all/disable_ipv6)" = "0" ]
}

# ---------- preserve Docker DNS ---------------------------------------------

DOCKER_DNS_RULES=""
if iptables -t nat -S 2>/dev/null | grep -q "DOCKER"; then
  DOCKER_DNS_RULES=$(iptables -t nat -S | grep "DOCKER" || true)
fi

# ---------- flush existing rules --------------------------------------------

iptables -F
iptables -X 2>/dev/null || true
iptables -t nat -F
iptables -t nat -X 2>/dev/null || true
iptables -t mangle -F
iptables -t mangle -X 2>/dev/null || true
ipset destroy allowed-domains-v4 2>/dev/null || true
ipset destroy allowed-domains-v6 2>/dev/null || true

if command -v ip6tables >/dev/null 2>&1; then
  ip6tables -F 2>/dev/null || true
  ip6tables -X 2>/dev/null || true
  ip6tables -t mangle -F 2>/dev/null || true
  ip6tables -t mangle -X 2>/dev/null || true
fi

# Restore Docker DNS rules
if [ -n "$DOCKER_DNS_RULES" ]; then
  echo "$DOCKER_DNS_RULES" | while read -r rule; do
    iptables -t nat ${rule/-A/-A} 2>/dev/null || true
  done
fi

# ---------- create ipset for allowed domains --------------------------------

ipset create allowed-domains-v4 hash:net family inet
ipset create allowed-domains-v6 hash:net family inet6

# ---------- GitHub IP ranges ------------------------------------------------

echo "==> Fetching GitHub IP ranges..."
GITHUB_META=$(curl -sf https://api.github.com/meta 2>/dev/null || echo "")

if [ -n "$GITHUB_META" ]; then
  GITHUB_CIDRS=$(echo "$GITHUB_META" | jq -r '
    [.hooks, .web, .api, .git, .packages, .pages, .actions, .dependabot, .copilot]
    | map(select(. != null))
    | flatten
    | map(select(type == "string"))
    | unique
    | .[]' 2>/dev/null || echo "")

  if [ -n "$GITHUB_CIDRS" ]; then
    AGGREGATED=$(echo "$GITHUB_CIDRS" | aggregate -q 2>/dev/null || echo "$GITHUB_CIDRS")
    while IFS= read -r cidr; do
      if [[ "$cidr" == *:* ]]; then
        ipset_add_safe allowed-domains-v6 "$cidr"
      else
        ipset_add_safe allowed-domains-v4 "$cidr"
      fi
    done <<< "$AGGREGATED"
    echo "    GitHub IP ranges added."
  fi
else
  echo "    WARNING: Could not fetch GitHub IP ranges"
fi

# ---------- allowed domains -------------------------------------------------

ALLOWED_DOMAINS=(
  # Claude / Anthropic
  "api.anthropic.com"
  "claude.ai"
  "storage.googleapis.com"
  "statsig.anthropic.com"
  "statsig.com"
  "sentry.io"

  # Package registries
  "rubygems.org"
  "index.rubygems.org"
  "rubygems.pkg.github.com"

  # GitHub
  "github.com"
  "api.github.com"
  "codeload.github.com"

  # VS Code / devcontainer connectivity
  "marketplace.visualstudio.com"
  "vscode.blob.core.windows.net"
  "update.code.visualstudio.com"
)

echo "==> Resolving allowed domains..."
for domain in "${ALLOWED_DOMAINS[@]}"; do
  ipv4_ips=$(dig +short A "$domain" 2>/dev/null || true)
  for ip in $ipv4_ips; do
    ipset_add_safe allowed-domains-v4 "$ip/32"
  done

  ipv6_ips=$(dig +short AAAA "$domain" 2>/dev/null || true)
  for ip in $ipv6_ips; do
    ipset_add_safe allowed-domains-v6 "$ip/128"
  done
done
echo "    Domain IPs resolved and added."

# ---------- apply firewall rules -------------------------------------------

# Default policies: drop everything
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established / related connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow DNS
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# Allow HTTPS outbound to allowed destinations only
iptables -A OUTPUT -p tcp --dport 443 -m set --match-set allowed-domains-v4 dst -j ACCEPT

# Reject everything else
iptables -A OUTPUT -j REJECT --reject-with icmp-admin-prohibited

# IPv6 rules mirror IPv4 rules to avoid egress bypasses
if command -v ip6tables >/dev/null 2>&1 && is_ipv6_enabled; then
  ip6tables -P INPUT DROP
  ip6tables -P FORWARD DROP
  ip6tables -P OUTPUT DROP

  ip6tables -A INPUT -i lo -j ACCEPT
  ip6tables -A OUTPUT -o lo -j ACCEPT

  ip6tables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
  ip6tables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

  ip6tables -A OUTPUT -p udp --dport 53 -j ACCEPT
  ip6tables -A OUTPUT -p tcp --dport 53 -j ACCEPT

  ip6tables -A OUTPUT -p tcp --dport 443 -m set --match-set allowed-domains-v6 dst -j ACCEPT
  ip6tables -A OUTPUT -j REJECT --reject-with icmp6-adm-prohibited
fi

# ---------- verification ----------------------------------------------------

echo "==> Verifying firewall..."

if curl -sf --connect-timeout 3 https://example.com > /dev/null 2>&1; then
  echo "    ERROR: example.com is reachable; firewall is not enforcing default deny"
  exit 1
else
  echo "    OK: example.com is blocked"
fi

if curl -sf --connect-timeout 5 https://api.github.com > /dev/null 2>&1; then
  echo "    OK: api.github.com is reachable"
else
  echo "    ERROR: api.github.com is not reachable; allowlist is incomplete"
  exit 1
fi

echo "==> Firewall initialized."
