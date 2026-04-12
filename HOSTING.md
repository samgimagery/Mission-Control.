# Hosting Mission Control — Remote Access Guide

Mission Control is a Python HTTP server (`dev_server.py`) on port 8787 serving:
- Static frontend: `index.html`, `app.js`, `styles.css`
- JSON API endpoints: `/api/mission-control-jobs`, `/api/pulse-data`, etc.
- Data storage: JSON files in `data/` directory (~104 KB jobs.json, small config files)
- No database, no npm, no build step — just Python + static files

---

## 1. Railway Deployment

### What It Is

Railway is a PaaS (Platform-as-a-Service) that deploys code from GitHub and runs it on managed infrastructure. You push code, Railway builds and runs it.

### Setup Steps

**1. Create a Railway project and connect your GitHub repo**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link project
railway login
railway init  # Creates project, links to repo
```

**2. Add required files**

**`requirements.txt`** (Python dependencies):
```
# Mission Control has no external deps — stdlib only
# But Railway needs this file to detect a Python project
```

Even an empty `requirements.txt` works. Railway uses it to detect Python.

**`Procfile`** (how to start the server):
```
web: python features/asset-manager/tools/dev_server.py
```

**3. Configure environment variables in Railway dashboard**

The current server hardcodes paths like `/Users/samg/AI/OpenClaw`. You'd need to refactor `dev_server.py` to use environment variables:

```python
import os

ROOT = Path(os.environ.get('DATA_ROOT', '/data'))
PORT = int(os.environ.get('PORT', '8787'))
```

Railway sets `PORT` automatically (usually 8080 or a dynamic port). Your server **must** read `PORT` from the environment — Railway routes external traffic to whatever port your app listens on.

**4. Persistent data with Railway Volumes**

Railway containers have **ephemeral filesystems** — files written during runtime are lost on redeploy. For your `data/*.json` files, you need a volume:

```bash
# Add a volume in Railway dashboard (or CLI)
railway volume create --mount /data
```

Then configure your app to read/write JSON files from `/data` instead of relative paths.

**Volume limitations**:
- Volumes are **not** backed up automatically
- Volumes are tied to a specific region
- Free tier includes 1 GB volume storage
- Data persists across deploys but **not** across volume deletion
- No built-in versioning — if JSON files corrupt, they're corrupted

**5. Alternative: Use a database instead of JSON files**

For production, consider replacing `data/*.json` with SQLite or a managed Postgres (Railway offers both). This gives you:
- ACID transactions (no partial writes on crash)
- Atomic reads/writes (no JSON file locking issues)
- Built-in Railway backups for Postgres

**6. Deploy**

```bash
railway up
```

Railway builds the container, installs Python, runs the Procfile command, and routes traffic.

### Free Tier & Pricing

| Plan | Cost | Included | Limits |
|------|------|----------|--------|
| Trial | Free | $5 credit, 500 hours | Credit expires, 1 GB volume, apps sleep |
| Hobby | $5/month | 8 GB RAM, 8 vCPU, usage-based | Good for small apps |
| Pro | $20/month/seat | More resources, team features | For teams |

**Trial plan limitations**:
- $5 credit — likely covers ~1 month of light use
- After credit expires, app stops
- 500 execution hours/month
- Apps sleep after inactivity (cold starts ~5-10s)
- Single region

### What Needs Changing in Your Code

| Current | Needs to become |
|---------|----------------|
| Hardcoded `/Users/samg/AI/OpenClaw` paths | `os.environ.get('DATA_ROOT', local_path)` |
| `subprocess.run(['/opt/homebrew/bin/python3', ...])` | Remove or replace (no Homebrew on Railway) |
| `http.server.SimpleHTTPRequestHandler` on port 8787 | Read `PORT` from env, bind to `0.0.0.0` |
| JSON files in `data/` directory | Volume-mounted `/data` or database |
| macOS-specific paths (`/Users/samg/...`) | Relative or env-configured paths |

### Railway Pros & Cons

**Pros**:
- Zero-config HTTPS (automatic TLS certificates)
- Custom domain support
- GitHub integration (push to deploy)
- Managed infrastructure — no server maintenance
- Scaling if needed

**Cons**:
- Ephemeral filesystem without volumes
- JSON file storage is fragile (no atomic writes, no backups)
- Requires code changes to remove macOS-specific paths and Homebrew calls
- Free tier is limited and time-bound
- Adds latency vs local (network round-trip to cloud region)
- No SSH access for debugging

---

## 2. Home VPN Access

Access your Mac Studio at home from anywhere, running Mission Control exactly as-is.

### Option A: Tailscale (Recommended)

**The simplest option.** Tailscale is a zero-config mesh VPN built on WireGuard.

**Setup**:
1. Install Tailscale on Mac Studio: `brew install tailscale` or download from tailscale.com
2. Install Tailscale on your remote device (phone, laptop, etc.)
3. Sign in with same account on both devices
4. Done — devices can now reach each other by Tailscale IP (100.x.x.x)

**Access Mission Control**: `http://100.x.x.x:8787` (Tailscale assigns this IP)

**Pros**:
- **Zero config** — no port forwarding, no firewall rules
- Works behind NAT, CGNAT, even on LTE
- End-to-end encrypted (WireGuard under the hood)
- Free for personal use (up to 100 devices)
- MagicDNS — access by hostname: `http://mac-studio:8787`
- Works on iOS, Android, Windows, Mac, Linux

**Cons**:
- Requires Tailscale client on every device that accesses it
- Not a public URL — only Tailscale-connected devices can reach it
- Tailscale account required (dependency on their coordination server)

### Option B: Cloudflare Tunnel

**Best for public access without opening ports.** Creates an outbound tunnel from your Mac to Cloudflare's network.

**Setup**:
1. Buy a domain (or use one you own) and add it to Cloudflare
2. Install `cloudflared` on Mac Studio: `brew install cloudflared`
3. Authenticate: `cloudflared tunnel login`
4. Create tunnel: `cloudflared tunnel create mission-control`
5. Route traffic: `cloudflared tunnel route dns mission-control mc.yourdomain.com`
6. Run tunnel: `cloudflared tunnel --url http://localhost:8787 run mission-control`

**Access Mission Control**: `https://mc.yourdomain.com`

**Pros**:
- **Public HTTPS URL** — no client software needed on remote devices
- No inbound ports opened on your network
- Automatic TLS certificates
- Free tier (Cloudflare free plan + tunnel is free)
- Works from any browser, any device

**Cons**:
- Requires a domain pointed to Cloudflare
- Traffic flows through Cloudflare (latency adds ~20-50ms)
- Anyone with the URL can reach it (need auth layer)
- Cloudflare sees your traffic (they terminate TLS)
- More complex setup than Tailscale

### Option C: WireGuard (Manual)

Full control, more configuration. You'd need to:
- Set up a WireGuard server (or use your Mac as one)
- Configure port forwarding on your router
- Manage keys and configs manually
- Set up a DNS record or remember your home IP

**Verdict**: Only worth it if you're already running WireGuard or need maximum control. Tailscale gives you WireGuard's encryption with none of the config overhead.

### Option D: SSH Tunnel

Quick and temporary — not a real hosting solution:

```bash
ssh -L 8787:localhost:8787 samg@your-home-ip
```

Then access `http://localhost:8787`. Requires port forwarding on your router, and your home IP can change. Only useful for quick access, not ongoing use.

### Security Considerations

| Concern | Tailscale | Cloudflare Tunnel |
|---------|-----------|-------------------|
| Attack surface | None (no open ports) | None (outbound tunnel only) |
| Encryption | WireGuard (end-to-end) | TLS (terminated at Cloudflare) |
| Auth needed on app | No (only Tailscale devices reach it) | **Yes** (public URL = anyone can hit it) |
| Dependency | Tailscale coordination server | Cloudflare infrastructure |

**If you use Cloudflare Tunnel, you must add authentication** — either:
- Basic auth in your Python server
- Cloudflare Access (zero-trust, requires Cloudflare account)
- An auth middleware layer

**Tailscale needs no app-level auth** because only authenticated devices can reach the server.

---

## 3. Recommendation

### For Mission Control: **Tailscale**

Here's why:

1. **Zero code changes** — Mission Control runs exactly as-is on your Mac Studio. No path refactoring, no PORT env var, no Docker, no Procfile.

2. **JSON data stays local** — Your `data/*.json` files stay on your Mac Studio's SSD. No volume mounting, no database migration, no data loss risk. The files are already there and being read/written by the running server.

3. **No auth needed** — Only Tailscale-connected devices can reach `http://mac-studio:8787`. No need to add login pages or API keys.

4. **Free** — Tailscale personal tier is free for up to 100 devices. Your Mac Studio + phone + laptop = 3 devices.

5. **Lowest latency** — Direct peer-to-peer connection when possible (Tailscale tries to establish direct WireGuard tunnels). Traffic goes Mac Studio → your device, not Mac Studio → cloud → your device.

6. **Your Mac Studio already runs 24/7** — You're already paying for the hardware and electricity. No need to pay Railway for compute you already have.

### When Railway Would Be Better

Choose Railway if:
- You need a **public URL** that anyone can access (team members, etc.)
- You don't want your Mac Studio to be a single point of failure
- You want automatic deploys from GitHub on push
- You're okay migrating JSON files to a database

### Quick Start: Tailscale Setup

```bash
# On Mac Studio
brew install tailscale
sudo tailscale up

# On your remote device (laptop, phone)
# Install Tailscale from tailscale.com
# Sign in with same account

# Access Mission Control from anywhere
# http://mac-studio:8787  (MagicDNS)
# or http://100.x.x.x:8787  (Tailscale IP)
```

That's it. No code changes, no config files, no DNS setup.