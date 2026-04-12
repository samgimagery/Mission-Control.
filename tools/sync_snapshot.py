#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import time
from datetime import datetime
from pathlib import Path

ROOT = Path('/Users/samg/AI/OpenClaw')
DEV_ROOT = ROOT / 'dev'
MISSION_ROOT = DEV_ROOT / 'mission-control'
DATA_DIR = MISSION_ROOT / 'data'
ASSET_JSON = DEV_ROOT / 'asset-manager' / 'data' / 'assets.json'
WORKSPACE_ROOT = Path('/Users/samg/.openclaw/workspace')


def run_json(cmd: list[str], timeout: int = 10):
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=True)
    return json.loads(proc.stdout or '{}')


def safe_read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback


def parse_identity_md(path: Path):
    out = {}
    try:
        for line in path.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line.startswith('- **') and ':**' in line:
                left, right = line.split(':**', 1)
                key = left.replace('- **', '').replace('**', '').strip().lower()
                out[key] = right.strip().lstrip('-').strip()
    except Exception:
        pass
    return out


def read_text(path: Path, fallback=''):
    try:
        return path.read_text(encoding='utf-8')
    except Exception:
        return fallback


def recent_dev_files(limit=24):
    files = []
    for fp in DEV_ROOT.rglob('*'):
        if not fp.is_file():
            continue
        parts = fp.parts
        if '.git' in parts or 'node_modules' in parts:
            continue
        try:
            st = fp.stat()
        except Exception:
            continue
        files.append({
            'path': str(fp.relative_to(DEV_ROOT)),
            'mtime': int(st.st_mtime),
            'size': st.st_size,
        })
    files.sort(key=lambda x: x['mtime'], reverse=True)
    return files[:limit]


def load_sessions():
    payload = run_json(['openclaw', 'sessions', '--all-agents', '--json'])
    sessions = payload.get('sessions') if isinstance(payload, dict) else []
    return sessions if isinstance(sessions, list) else []


def load_ready_skills(limit=20):
    proc = subprocess.run(['openclaw', 'skills'], capture_output=True, text=True, timeout=10, check=True)
    skills = []
    for line in (proc.stdout or '').splitlines():
        if '│ ✓ ready' in line:
            parts = [p.strip() for p in line.split('│')]
            if len(parts) > 2:
                name = parts[2]
                if name:
                    cleaned = name.split(' ', 1)[1] if ' ' in name else name
                    skills.append(cleaned)
    return skills[:limit]


def load_commands(limit=24):
    proc = subprocess.run(['openclaw', '--help'], capture_output=True, text=True, timeout=8, check=True)
    cmds = []
    in_commands = False
    for raw in (proc.stdout or '').splitlines():
        line = raw.rstrip('\n')
        if line.strip().startswith('Commands:'):
            in_commands = True
            continue
        if in_commands:
            if line.strip().startswith('Examples:'):
                break
            m = re.match(r'^\s{2}([a-z][a-z0-9-]*)\s{2,}', line)
            if not m:
                continue
            cmd = m.group(1)
            if cmd not in cmds:
                cmds.append(cmd)
    return cmds[:limit]


def build_state():
    assets = safe_read_json(ASSET_JSON, [])
    sessions = load_sessions()
    now_ms = int(time.time() * 1000)

    agents = []
    tasks = []
    for s in sessions:
        key = str(s.get('key') or 'session')
        kind = str(s.get('kind') or 'direct')
        model = str(s.get('model') or 'unknown')
        updated_at = int(s.get('updatedAt') or 0)
        age_ms = max(now_ms - updated_at, 0) if updated_at else None

        zone = 'todo'
        if age_ms is not None:
            if age_ms < 5 * 60 * 1000:
                zone = 'working'
            elif age_ms < 60 * 60 * 1000:
                zone = 'review'
            else:
                zone = 'done'

        role = f'{kind} · {model}'
        agents.append({
            'id': key,
            'name': key.split(':')[-1] or key,
            'role': role,
            'zone': zone,
            'updatedAt': updated_at,
            'ageMs': age_ms,
            'task': f'Session {key}',
            'key': key,
        })
        tasks.append({
            'id': f'task::{key}',
            'title': f'Session {key}',
            'zone': zone,
            'meta': role,
        })

    return {
        'ok': True,
        'timestamp': now_ms,
        'stats': {
            'assetsCount': len(assets) if isinstance(assets, list) else 0,
            'sessionsCount': len(agents),
            'recentFilesCount': len(recent_dev_files()),
        },
        'agents': agents,
        'tasks': tasks,
        'recentFiles': recent_dev_files(),
    }


def build_profile(sessions):
    identity = parse_identity_md(WORKSPACE_ROOT / 'IDENTITY.md')
    user = parse_identity_md(WORKSPACE_ROOT / 'USER.md')
    soul = read_text(WORKSPACE_ROOT / 'SOUL.md')

    vision = []
    for line in soul.splitlines():
        line = line.strip()
        if not line or line.startswith('#') or line.startswith('_') or line.startswith('- '):
            continue
        if line.startswith('**'):
            clean = line.replace('**', '').strip()
            if clean:
                vision.append(clean)
        if len(vision) >= 4:
            break

    active = None
    if sessions:
        active = sorted(sessions, key=lambda s: int(s.get('updatedAt') or 0), reverse=True)[0]

    return {
        'ok': True,
        'name': identity.get('name', 'Alfred'),
        'creature': identity.get('creature', 'AI butler'),
        'vibe': identity.get('vibe', ''),
        'emoji': identity.get('emoji', '🛎️'),
        'human': {
            'name': user.get('name', 'Sam'),
            'preferredAddress': user.get('what to call them', 'Sam'),
        },
        'vision': vision,
        'skills': load_ready_skills(),
        'commands': load_commands(),
        'runtime': {
            'currentModel': (active or {}).get('model') or 'unknown',
            'currentProvider': (active or {}).get('modelProvider') or 'unknown',
            'activeSessionKey': (active or {}).get('key') or 'n/a',
            'sessionsCount': len(sessions),
            'syncedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        },
        'links': {
            'assetManager': 'http://localhost:8787/',
            'marketDashboard': 'http://localhost:8787/dashboard/',
            'missionControl': 'http://localhost:8787/mission-control/',
        }
    }


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    sessions = load_sessions()
    state = build_state()
    profile = build_profile(sessions)

    (DATA_DIR / 'mission-control-state.json').write_text(json.dumps(state, indent=2), encoding='utf-8')
    (DATA_DIR / 'alfred-profile.json').write_text(json.dumps(profile, indent=2), encoding='utf-8')

    print(f'Wrote snapshot files to {DATA_DIR}')


if __name__ == '__main__':
    main()
