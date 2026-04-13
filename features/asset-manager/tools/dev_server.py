#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import subprocess
import os
from urllib.parse import unquote

ROOT = Path('/Users/samg/AI/OpenClaw')
UI_ROOT = ROOT / 'dev' / 'mission-control'
ASSET_MANAGER_ROOT = ROOT / 'dev' / 'asset-manager'
DATA_DIR = ASSET_MANAGER_ROOT / 'data'
DATA_JSON = DATA_DIR / 'assets.json'
CONFIG_JSON = DATA_DIR / 'library-config.json'
IMPORT_SCRIPT = ASSET_MANAGER_ROOT / 'tools' / 'import_assets.py'
DELETION_LOG = DATA_DIR / 'deletions.log'
DASHBOARD_ROOT = ROOT / 'dev' / 'market-dashboard'
DEV_ROOT = ROOT / 'dev'
AI_ROOT = Path('/Users/samg/AI')
SELECTED_ROOT_LINK = ASSET_MANAGER_ROOT / 'selected_root'
WORKSPACE_ROOT = Path('/Users/samg/.openclaw/workspace')
OPENCLAW_AGENTS_ROOT = Path('/Users/samg/.openclaw/agents')
OPENCLAW_WORKSPACES_ROOT = Path('/Users/samg/.openclaw/workspaces')
MISSION_CONTROL_JOBS_JSON = UI_ROOT / 'data' / 'jobs.json'
MISSION_CONTROL_PROJECTS_JSON = UI_ROOT / 'data' / 'projects.json'
MISSION_CONTROL_SNAPSHOTS_DIR = UI_ROOT / 'data' / 'snapshots'


def load_config():
    if not CONFIG_JSON.exists():
        return {}
    try:
        data = json.loads(CONFIG_JSON.read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_config(cfg):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_JSON.write_text(json.dumps(cfg, indent=2), encoding='utf-8')


def load_mission_control_jobs():
    if not MISSION_CONTROL_JOBS_JSON.exists():
        return []
    try:
        data = json.loads(MISSION_CONTROL_JOBS_JSON.read_text(encoding='utf-8'))
        if not isinstance(data, list):
            return []
        # Normalize legacy phase names
        for j in data:
            if j.get('phase') == 'review':
                j['phase'] = 'qc'
            if j.get('phase') == 'completed':
                j['phase'] = 'done'
            if j.get('status') == 'review':
                j['status'] = 'qc'
            if j.get('status') == 'completed':
                j['status'] = 'done'
            # Ensure subtasks array exists
            if 'subtasks' not in j:
                j['subtasks'] = []
            if 'history' not in j:
                j['history'] = []
        return data
    except Exception:
        return []


def save_mission_control_jobs(jobs):
    MISSION_CONTROL_JOBS_JSON.parent.mkdir(parents=True, exist_ok=True)
    MISSION_CONTROL_JOBS_JSON.write_text(json.dumps(jobs, indent=2), encoding='utf-8')


def load_mission_control_projects():
    if not MISSION_CONTROL_PROJECTS_JSON.exists():
        return []
    try:
        data = json.loads(MISSION_CONTROL_PROJECTS_JSON.read_text(encoding='utf-8'))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_mission_control_projects(projects):
    MISSION_CONTROL_PROJECTS_JSON.parent.mkdir(parents=True, exist_ok=True)
    MISSION_CONTROL_PROJECTS_JSON.write_text(json.dumps(projects, indent=2), encoding='utf-8')


def find_job_by_id(job_id):
    jobs = load_mission_control_jobs()
    for j in jobs:
        if j.get('id') == job_id:
            return j, jobs
    return None, jobs


def transition_job_phase(job_id, new_phase, event_prefix='transitioned', by='Alfred'):
    job, jobs = find_job_by_id(job_id)
    if not job:
        return None, 'Job not found'
    old_phase = job.get('phase', 'todo')
    if old_phase == new_phase:
        return job, None
    job['phase'] = new_phase
    job['status'] = new_phase
    import time
    now_ms = int(time.time() * 1000)
    job['updatedAt'] = now_ms
    if 'history' not in job:
        job['history'] = []
    # Set startedAt when moving to working
    if new_phase == 'working' and 'startedAt' not in job:
        job['startedAt'] = now_ms
    # Set completedAt when moving to done
    if new_phase == 'done':
        job['completedAt'] = now_ms
    event_record = {
        'ts': now_ms,
        'event': f'{event_prefix}_to_{new_phase}',
        'by': by,
    }
    job['history'].append(event_record)
    save_mission_control_jobs(jobs)
    return job, None


def save_snapshot(job_id, image_data_b64):
    """Save a base64 PNG snapshot and update the job record."""
    MISSION_CONTROL_SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

    # Strip data URL prefix if present
    if ',' in image_data_b64:
        image_data_b64 = image_data_b64.split(',', 1)[1]

    import base64
    import time
    timestamp = int(time.time() * 1000)
    filename = f'{job_id}_{timestamp}.png'
    filepath = MISSION_CONTROL_SNAPSHOTS_DIR / filename

    try:
        png_bytes = base64.b64decode(image_data_b64)
        filepath.write_bytes(png_bytes)
    except Exception as e:
        return None, f'Failed to decode/save image: {e}'

    snapshot_url = f'/data/snapshots/{filename}'

    # Update the job record
    job, jobs = find_job_by_id(job_id)
    if not job:
        # Clean up orphaned file
        filepath.unlink(missing_ok=True)
        return None, 'Job not found'

    job['snapshotUrl'] = snapshot_url
    job['snapshotFile'] = str(filepath)
    if 'history' not in job:
        job['history'] = []
    now_ms = int(time.time() * 1000)
    job['history'].append({
        'ts': now_ms,
        'event': 'snapshot_captured',
        'url': snapshot_url,
    })
    job['updatedAt'] = now_ms
    save_mission_control_jobs(jobs)
    return job, None


def sync_selected_root_link():
    cfg = load_config()
    raw = str(cfg.get('import_root') or '').strip()
    if SELECTED_ROOT_LINK.exists() or SELECTED_ROOT_LINK.is_symlink():
        SELECTED_ROOT_LINK.unlink()
    if not raw:
        return None
    target = Path(raw).expanduser().resolve()
    if not target.exists() or not target.is_dir():
        return None
    SELECTED_ROOT_LINK.symlink_to(target, target_is_directory=True)
    return target


def choose_folder_mac():
    script = 'POSIX path of (choose folder with prompt "Choose a folder to import into the asset library")'
    proc = subprocess.run(['osascript', '-e', script], capture_output=True, text=True)
    if proc.returncode != 0:
        stderr = (proc.stderr or '').strip()
        if 'User canceled' in stderr or '(-128)' in stderr:
            raise RuntimeError('Folder selection cancelled')
        raise RuntimeError(stderr or 'Folder selection failed')
    folder = (proc.stdout or '').strip()
    if not folder:
        raise RuntimeError('No folder selected')
    return str(Path(folder).expanduser().resolve())


def _safe_read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback


def _recent_dev_files(limit=24):
    files = []
    try:
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
    except Exception:
        return []
    files.sort(key=lambda x: x['mtime'], reverse=True)
    return files[:limit]


def _load_openclaw_sessions():
    try:
        proc = subprocess.run(
            ['openclaw', 'sessions', '--all-agents', '--json'],
            capture_output=True,
            text=True,
            timeout=2,
            check=True,
        )
        payload = json.loads(proc.stdout or '{}')
        sessions = payload.get('sessions') if isinstance(payload, dict) else []
        if not isinstance(sessions, list):
            return []
        return sessions
    except Exception:
        return []


def _get_openclaw_status():
    """Call openclaw status --json and return parsed data."""
    try:
        proc = subprocess.run(
            ['openclaw', 'status', '--json'],
            capture_output=True, text=True, timeout=2
        )
        if proc.returncode != 0 or not proc.stdout.strip():
            return {}
        return json.loads(proc.stdout)
    except Exception:
        return {}


def _list_openclaw_agent_ids():
    ids = set()
    try:
        if OPENCLAW_AGENTS_ROOT.exists():
            for child in OPENCLAW_AGENTS_ROOT.iterdir():
                if child.is_dir():
                    ids.add(child.name)
    except Exception:
        pass
    return sorted(ids)


def _parse_identity_md(path: Path):
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


def _read_text(path: Path, fallback=''):
    try:
        return path.read_text(encoding='utf-8')
    except Exception:
        return fallback


def _load_openclaw_commands():
    try:
        import re
        proc = subprocess.run(['openclaw', '--help'], capture_output=True, text=True, timeout=8, check=True)
        commands = []
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
                if cmd not in commands:
                    commands.append(cmd)
        return commands[:24]
    except Exception:
        return []



def _load_ready_skills(limit=20):
    try:
        proc = subprocess.run(['openclaw', 'skills'], capture_output=True, text=True, timeout=10, check=True)
        skills = []
        for line in (proc.stdout or '').splitlines():
            if '│ ✓ ready' in line:
                parts = [p.strip() for p in line.split('│')]
                if len(parts) > 2:
                    name = parts[2]
                    if name:
                        # strip leading emoji
                        cleaned = name.split(' ', 1)[1] if ' ' in name else name
                        skills.append(cleaned)
        return skills[:limit]
    except Exception:
        return []


def _load_agent_profile(agent_id: str, sessions: list, skills: list, commands: list):
    agent_root = OPENCLAW_AGENTS_ROOT / agent_id / 'agent'

    workspace_map = {
        'main': WORKSPACE_ROOT,
        'coder': OPENCLAW_WORKSPACES_ROOT / 'coder',
        'researcher': OPENCLAW_WORKSPACES_ROOT / 'researcher',
    }
    ws_root = workspace_map.get(agent_id)

    identity = _parse_identity_md(agent_root / 'IDENTITY.md')
    user = _parse_identity_md(agent_root / 'USER.md')
    soul = _read_text(agent_root / 'SOUL.md')

    if not identity and ws_root:
        identity = _parse_identity_md(ws_root / 'IDENTITY.md')
    if not user and ws_root:
        user = _parse_identity_md(ws_root / 'USER.md')
    if not soul and ws_root:
        soul = _read_text(ws_root / 'SOUL.md')

    vision_lines = []
    for line in soul.splitlines():
        line = line.strip()
        if not line or line.startswith('#') or line.startswith('_') or line.startswith('- '):
            continue
        if line.startswith('**'):
            clean = line.replace('**', '').strip()
            if clean:
                vision_lines.append(clean)
        if len(vision_lines) >= 4:
            break

    agent_sessions = [s for s in sessions if str(s.get('agentId') or '') == agent_id]
    active = None
    if agent_sessions:
        agent_sessions = sorted(agent_sessions, key=lambda s: int(s.get('updatedAt') or 0), reverse=True)
        active = agent_sessions[0]

    from datetime import datetime

    appearance_defaults = {
        'main': {
            'skinTone': '#f2d7b6',
            'hairColor': '#2f4d87',
            'hairStyle': 'butler-cut',
            'note': 'Chief operations officer',
        },
        'coder': {
            'skinTone': '#5b3b2f',
            'hairColor': '#141414',
            'hairStyle': 'tight fade',
            'note': 'Jackson character profile: black',
        },
        'researcher': {
            'skinTone': '#f6d9bf',
            'hairColor': '#e6c46f',
            'hairStyle': 'blond mid-length',
            'note': 'Gemma character profile: blonde, white skin',
        },
    }

    fallback_name = {
        'main': 'Alfred',
        'coder': 'Jackson',
        'researcher': 'Gemma',
    }.get(agent_id, agent_id)

    return {
        'id': agent_id,
        'name': identity.get('name', fallback_name),
        'emoji': identity.get('emoji', '🤖'),
        'creature': identity.get('creature', 'AI agent'),
        'vibe': identity.get('vibe', ''),
        'human': {
            'name': user.get('name', 'Sam'),
            'preferredAddress': user.get('what to call them', 'Sam'),
        },
        'vision': vision_lines,
        'skills': list(skills or []),
        'commands': list(commands or []),
        'runtime': {
            'currentModel': (active or {}).get('model') or 'unknown',
            'currentProvider': (active or {}).get('modelProvider') or 'unknown',
            'activeSessionKey': (active or {}).get('key') or 'n/a',
            'sessionsCount': len(agent_sessions),
            'syncedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        },
        'appearance': appearance_defaults.get(agent_id, {
            'skinTone': '#d7b894',
            'hairColor': '#3a2f2a',
            'hairStyle': 'standard',
            'note': 'Custom agent appearance',
        }),
        'chief': agent_id == 'main',
    }


def build_alfred_profile():
    sessions = _load_openclaw_sessions()
    skills = _load_ready_skills()
    commands = _load_openclaw_commands()

    agent_ids = _list_openclaw_agent_ids()
    for s in sessions:
        sid = str(s.get('agentId') or '').strip()
        if sid:
            agent_ids.append(sid)

    dedup_agent_ids = []
    seen = set()
    for aid in agent_ids:
        if aid in seen:
            continue
        seen.add(aid)
        dedup_agent_ids.append(aid)

    profiles = [_load_agent_profile(aid, sessions, skills, commands) for aid in dedup_agent_ids]
    alfred = next((p for p in profiles if p.get('id') == 'main'), None)

    if not alfred:
        identity = _parse_identity_md(WORKSPACE_ROOT / 'IDENTITY.md')
        user = _parse_identity_md(WORKSPACE_ROOT / 'USER.md')
        from datetime import datetime
        alfred = {
            'id': 'main',
            'name': identity.get('name', 'Alfred'),
            'emoji': identity.get('emoji', '🛎️'),
            'creature': identity.get('creature', 'AI butler'),
            'vibe': identity.get('vibe', ''),
            'human': {
                'name': user.get('name', 'Sam'),
                'preferredAddress': user.get('what to call them', 'Sam'),
            },
            'vision': [],
            'skills': list(skills or []),
            'commands': list(commands or []),
            'runtime': {
                'currentModel': 'unknown',
                'currentProvider': 'unknown',
                'activeSessionKey': 'n/a',
                'sessionsCount': 0,
                'syncedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            },
            'chief': True,
            'appearance': {
                'skinTone': '#f2d7b6',
                'hairColor': '#2f4d87',
                'hairStyle': 'butler-cut',
                'note': 'Chief operations officer',
            },
        }
        profiles.insert(0, alfred)

    return {
        'ok': True,
        'name': alfred.get('name', 'Alfred'),
        'creature': alfred.get('creature', 'AI butler'),
        'vibe': alfred.get('vibe', ''),
        'emoji': alfred.get('emoji', '🛎️'),
        'human': alfred.get('human', {'name': 'Sam', 'preferredAddress': 'Sam'}),
        'vision': alfred.get('vision', []),
        'skills': alfred.get('skills', skills),
        'commands': alfred.get('commands', commands),
        'runtime': alfred.get('runtime', {}),
        'agents': profiles,
        'links': {
            'missionControl': 'http://localhost:8787/',
            'assetManager': 'http://localhost:8787/asset-manager/',
        }
    }


def _get_gateway_uptime():
    """Get OpenClaw gateway process uptime in seconds."""
    try:
        proc = subprocess.run(
            ['pgrep', '-f', 'openclaw.*gateway'],
            capture_output=True, text=True, timeout=3
        )
        if proc.returncode != 0:
            # Fallback: try 'openclaw gateway status'
            try:
                proc2 = subprocess.run(
                    ['openclaw', 'gateway', 'status', '--json'],
                    capture_output=True, text=True, timeout=5
                )
                if proc2.returncode == 0 and proc2.stdout.strip():
                    import json as _json
                    status = _json.loads(proc2.stdout)
                    uptime_s = status.get('uptimeSeconds') or status.get('uptime')
                    if uptime_s:
                        return int(uptime_s)
            except Exception:
                pass
            return 0
        # Found gateway PID — get its start time via ps
        pid = proc.stdout.strip().split('\n')[0]
        if not pid:
            return 0
        ps_proc = subprocess.run(
            ['ps', '-p', pid, '-o', 'etime='],
            capture_output=True, text=True, timeout=3
        )
        if ps_proc.returncode != 0:
            return 0
        elapsed = ps_proc.stdout.strip()
        # Parse ps etime format: "DD-HH:MM:SS" or "HH:MM:SS" or "MM:SS"
        return _parse_ps_etime(elapsed)
    except Exception:
        return 0


def _parse_ps_etime(etime_str):
    """Parse ps etime format to seconds."""
    s = etime_str.strip()
    days = 0
    if '-' in s:
        parts = s.split('-', 1)
        try:
            days = int(parts[0])
        except ValueError:
            return 0
        s = parts[1]
    parts = s.split(':')
    try:
        if len(parts) == 3:
            h, m, sec = int(parts[0]), int(parts[1]), int(parts[2])
        elif len(parts) == 2:
            h, m, sec = 0, int(parts[0]), int(parts[1])
        else:
            return 0
        return days * 86400 + h * 3600 + m * 60 + sec
    except (ValueError, IndexError):
        return 0


def build_pulse_data():
    """Build real Mission Control pulse metrics."""
    import subprocess
    import time
    now_ms = int(time.time() * 1000)
    now_s = int(time.time())

    # --- Jobs stats ---
    jobs = load_mission_control_jobs()
    total_jobs = len(jobs)
    todo_count = sum(1 for j in jobs if j.get('phase') == 'todo')
    working_count = sum(1 for j in jobs if j.get('phase') == 'working')
    review_count = sum(1 for j in jobs if j.get('phase') in ('review', 'qc'))
    done_count = sum(1 for j in jobs if j.get('phase') in ('done', 'completed') and j.get('phase') != 'archived')

    # --- Team agents (not raw sessions) ---
    sessions = _load_openclaw_sessions()
    STALE_MS = 5 * 60 * 1000  # 5 min — only truly active sessions
    live_sessions = [s for s in sessions if (now_ms - int(s.get('updatedAt', 0))) < STALE_MS]

    # Determine which team members are truly active right now
    active_names = set()
    for s in live_sessions:
        key = str(s.get('key') or '').lower()
        # Alfred: always active if main session updated in last 5 min
        if 'main' in key or 'alfred' in key or 'telegram' in key:
            active_names.add('Alfred')
        # Gemma: active only if a researcher subagent session updated in last 5 min
        if 'gemma' in key or 'researcher' in key:
            active_names.add('Gemma')

    # Check if Claude Code is running
    import subprocess as _sp
    try:
        proc = _sp.run(['pgrep', '-f', 'claude.*glm-5.1'], capture_output=True, text=True, timeout=3)
        claude_running = proc.returncode == 0
    except Exception:
        claude_running = False
    if claude_running:
        active_names.add('Claude')

    team = [
        {'name': 'Alfred', 'emoji': '🛎️', 'role': 'Coordinator', 'status': 'active' if 'Alfred' in active_names else 'standby', 'model': 'glm-5.1:cloud'},
        {'name': 'Gemma', 'emoji': '🔎', 'role': 'Research & Design', 'status': 'active' if 'Gemma' in active_names else 'standby', 'model': 'Gemma4 31B cloud'},
        {'name': 'Claude', 'emoji': '⚡', 'role': 'Build', 'status': 'active' if 'Claude' in active_names else 'standby', 'model': 'Claude-Code / glm-5.1:cloud'},
    ]

    # --- Model usage from codexbar ---
    codex_usage = _get_codex_usage()
    ollama_usage = _get_ollama_usage()

    # --- Uptime from OpenClaw gateway ---
    uptime_s = _get_gateway_uptime()

    # --- Context & compaction: read from OpenClaw status --
    compactions = 0
    context_used = 0
    context_total = 202752
    try:
        result = subprocess.run(
            ['openclaw', 'status', '--json'],
            capture_output=True, text=True, timeout=8
        )
        if result.returncode == 0:
            oc_status = json.loads(result.stdout)
            sessions_data = oc_status.get('sessions', {})
            context_total = int(sessions_data.get('defaults', {}).get('contextTokens', 202752))
            # Get main session's context usage
            for s in sessions_data.get('recent', []):
                if 'telegram:direct' in s.get('key', ''):
                    inp = s.get('inputTokens', 0)
                    out = s.get('outputTokens', 0)
                    remaining = s.get('remainingTokens', context_total - inp - out)
                    context_used = context_total - remaining
                    break
            # Compaction count not in status API — read from file as fallback
            session_stats_file = DATA_DIR / 'session-stats.json'
            if session_stats_file.exists():
                with open(session_stats_file, 'r') as f:
                    stats = json.load(f)
                compactions = int(stats.get('compactions', 0))
    except Exception:
        # Fallback to file
        session_stats_file = DATA_DIR / 'session-stats.json'
        try:
            if session_stats_file.exists():
                with open(session_stats_file, 'r') as f:
                    stats = json.load(f)
                compactions = int(stats.get('compactions', 0))
                context_used = int(stats.get('contextUsed', 0))
                context_total = int(stats.get('contextWindow', 202752))
        except Exception:
            pass

    # --- Tasks completed metrics ---
    now_dt = __import__('datetime').datetime.now(__import__('datetime').timezone.utc)
    today_start = __import__('datetime').datetime(now_dt.year, now_dt.month, now_dt.day, tzinfo=__import__('datetime').timezone.utc)
    week_start = today_start - __import__('datetime').timedelta(days=today_start.weekday())
    month_start = __import__('datetime').datetime(now_dt.year, now_dt.month, 1, tzinfo=__import__('datetime').timezone.utc)
    year_start = __import__('datetime').datetime(now_dt.year, 1, 1, tzinfo=__import__('datetime').timezone.utc)

    today_ms = int(today_start.timestamp() * 1000)
    week_ms = int(week_start.timestamp() * 1000)
    month_ms = int(month_start.timestamp() * 1000)
    year_ms = int(year_start.timestamp() * 1000)

    def count_completed(since_ms):
        """Count completed subtasks + completed jobs since a timestamp."""
        count = 0
        for j in jobs:
            # Count completed jobs (by completedAt)
            if j.get('phase') == 'done' and (j.get('completedAt') or 0) >= since_ms:
                count += 1
            # Count completed subtasks
            for st in j.get('subtasks', []):
                if st.get('status') == 'done':
                    st_completed = st.get('completedAt') or j.get('completedAt') or 0
                    if st_completed >= since_ms:
                        count += 1
        return count

    tasks_completed = {
        'today': count_completed(today_ms),
        'week': count_completed(week_ms),
        'month': count_completed(month_ms),
        'year': count_completed(year_ms),
        'total': sum(len([s for s in j.get('subtasks', []) if s.get('status') == 'done']) for j in jobs) + sum(1 for j in jobs if j.get('phase') == 'done'),
    }

    return {
        'ok': True,
        'timestamp': now_ms,
        'jobs': {
            'total': total_jobs,
            'todo': todo_count,
            'working': working_count,
            'qc': review_count,
            'done': done_count,
        },
        'agents': team,
        'usage': {
            'codex': codex_usage,
            'ollama': ollama_usage,
        },
        'compactions': compactions,
        'tasksCompleted': tasks_completed,
        'uptime': _format_duration(uptime_s) if uptime_s else 'unknown',
        'model': 'glm-5.1:cloud',
        'contextUsed': context_used,
        'contextWindow': context_total,
        'serverRestart': '2026-04-10T11:25:00+10:00',
        'lastUpdate': 'OpenClaw 2026.4.9',
    }


def _format_duration(seconds):
    if seconds < 60:
        return f'{seconds}s'
    elif seconds < 3600:
        return f'{seconds // 60}m {seconds % 60}s'
    elif seconds < 86400:
        return f'{seconds // 3600}h {(seconds % 3600) // 60}m'
    else:
        return f'{seconds // 86400}d {(seconds % 86400) // 3600}h'


def _get_codex_usage():
    """Get Codex/OpenAI usage from codexbar."""
    try:
        proc = subprocess.run(
            ['codexbar', 'cost', '--provider', 'codex', '--format', 'json'],
            capture_output=True, text=True, timeout=5
        )
        if proc.returncode != 0:
            return {'available': False}
        import json as _json
        data = _json.loads(proc.stdout)
        if isinstance(data, list) and len(data) > 0:
            entry = data[0]
            daily = entry.get('daily', [])
            totals = entry.get('totals', {})
            # Last 7 days
            recent = daily[-7:] if len(daily) >= 7 else daily
            daily_breakdown = []
            for day in recent:
                daily_breakdown.append({
                    'date': day.get('date', ''),
                    'totalTokens': day.get('totalTokens', 0),
                    'inputTokens': day.get('inputTokens', 0),
                    'outputTokens': day.get('outputTokens', 0),
                    'modelsUsed': day.get('modelsUsed', []),
                })
            return {
                'available': True,
                'provider': 'codex',
                'totalTokens': totals.get('totalTokens', 0),
                'totalInput': totals.get('inputTokens', 0),
                'totalOutput': totals.get('outputTokens', 0),
                'daily': daily_breakdown,
            }
    except Exception:
        pass
    return {'available': False}


def _get_ollama_usage():
    """Get Ollama usage by combining claude + codex providers with model breakdown."""
    import json as _json
    model_totals = {}
    total_in = 0
    total_out = 0
    total_tokens = 0
    daily_combined = {}

    for provider in ['claude', 'codex']:
        try:
            proc = subprocess.run(
                ['codexbar', 'cost', '--provider', provider, '--format', 'json'],
                capture_output=True, text=True, timeout=8
            )
            if proc.returncode != 0 or not proc.stdout.strip():
                continue
            data = _json.loads(proc.stdout)
            if not isinstance(data, list) or len(data) == 0:
                continue
            entry = data[0]
            daily = entry.get('daily', [])
            totals = entry.get('totals', {})
            total_in += totals.get('inputTokens', 0)
            total_out += totals.get('outputTokens', 0)
            total_tokens += totals.get('totalTokens', 0)
            for day in daily:
                date_key = day.get('date', '')
                day_in = day.get('inputTokens', 0)
                day_out = day.get('outputTokens', 0)
                day_total = day.get('totalTokens', 0)
                if date_key not in daily_combined:
                    daily_combined[date_key] = {'date': date_key, 'inputTokens': 0, 'outputTokens': 0, 'totalTokens': 0, 'models': {}}
                daily_combined[date_key]['inputTokens'] += day_in
                daily_combined[date_key]['outputTokens'] += day_out
                daily_combined[date_key]['totalTokens'] += day_total
                for m in day.get('modelsUsed', []):
                    mname = m.get('modelName', m) if isinstance(m, dict) else str(m)
                    mtokens = day_total  # approximate per-day
                    model_totals[mname] = model_totals.get(mname, 0) + mtokens
                    daily_combined[date_key]['models'][mname] = daily_combined[date_key]['models'].get(mname, 0) + mtokens
        except Exception:
            continue

    # Pull model usage from OpenClaw sessions (Kimi K2.5, etc.)
    try:
        sessions = _load_openclaw_sessions()
        for session in sessions:
            model = str(session.get('model') or '').strip()
            if not model:
                continue
            session_tokens = 0
            for key in ('totalTokens', 'tokensUsed', 'tokenCount', 'tokens'):
                val = session.get(key)
                if isinstance(val, (int, float)) and int(val) > session_tokens:
                    session_tokens = int(val)
            if session_tokens > 0:
                model_totals[model] = model_totals.get(model, 0) + session_tokens
                total_tokens += session_tokens
                input_t = session.get('inputTokens', 0)
                output_t = session.get('outputTokens', 0)
                total_in += int(input_t) if isinstance(input_t, (int, float)) and input_t > 0 else session_tokens // 2
                total_out += int(output_t) if isinstance(output_t, (int, float)) and output_t > 0 else session_tokens - session_tokens // 2
    except Exception:
        pass

    if not model_totals:
        return {'available': False}

    # Build model breakdown with separate in/out counts from daily data
    model_breakdown = []
    for name, tokens in sorted(model_totals.items(), key=lambda x: -x[1]):
        model_breakdown.append({'name': name, 'tokens': tokens})

    # Sort daily by date descending, take last 7
    sorted_daily = sorted(daily_combined.values(), key=lambda x: x['date'], reverse=True)[:7]
    sorted_daily.reverse()  # chronological order
    daily_output = []
    for d in sorted_daily:
        daily_output.append({
            'date': d['date'],
            'totalTokens': d['totalTokens'],
            'inputTokens': d['inputTokens'],
            'outputTokens': d['outputTokens'],
            'modelsUsed': list(d['models'].keys()),
        })

    return {
        'available': True,
        'provider': 'ollama',
        'totalTokens': total_tokens,
        'totalInput': total_in,
        'totalOutput': total_out,
        'daily': daily_output,
        'modelBreakdown': model_breakdown,
    }


def build_mission_control_state():
    assets = _safe_read_json(DATA_JSON, [])
    sessions = _load_openclaw_sessions()
    now_ms = int(__import__('time').time() * 1000)

    # Filter stale sessions (>30 min inactive) - only show live agents
    STALE_MS = 30 * 60 * 1000
    sessions = [s for s in sessions if (now_ms - int(s.get('updatedAt', 0))) < STALE_MS]

    normalized_sessions = []
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

        normalized_sessions.append({
            'id': key,
            'name': key.split(':')[-1] or key,
            'role': f"{kind} · {model}",
            'zone': zone,
            'updatedAt': updated_at,
            'ageMs': age_ms,
            'task': f"Session {key}",
            'key': key,
        })

    tasks = []
    for s in normalized_sessions:
        tasks.append({
            'id': f"task::{s['id']}",
            'title': s['task'],
            'zone': s['zone'],
            'meta': s['role'],
        })

    return {
        'ok': True,
        'timestamp': now_ms,
        'stats': {
            'assetsCount': len(assets) if isinstance(assets, list) else 0,
            'sessionsCount': len(normalized_sessions),
            'recentFilesCount': len(_recent_dev_files()),
        },
        'agents': normalized_sessions,
        'tasks': tasks,
        'recentFiles': _recent_dev_files(),
    }


def resolve_asset_path(rel: str):
    if rel.startswith('./media_root/'):
        rel_to_root = rel[len('./media_root/'):]
        base_root = ROOT.resolve()
        target = (ROOT / rel_to_root).resolve()
        return base_root, target
    if rel.startswith('./codex_root/'):
        rel_to_root = rel[len('./codex_root/'):]
        base_root = AI_ROOT.resolve()
        target = (AI_ROOT / rel_to_root).resolve()
        return base_root, target
    if rel.startswith('./selected_root/'):
        selected_root = sync_selected_root_link()
        if not selected_root:
            raise ValueError('No selected import folder is configured')
        rel_to_root = rel[len('./selected_root/'):]
        base_root = selected_root.resolve()
        target = (selected_root / rel_to_root).resolve()
        return base_root, target
    raise ValueError('Invalid path format')


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def _send_json(self, status: int, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        clean_path = self.path.split('?', 1)[0].split('#', 1)[0]

        media_prefixes = ('/selected_root/', '/media_root/', '/codex_root/')
        if clean_path.startswith(media_prefixes):
            return self.serve_with_range_support()

        if clean_path == '/dashboard':
            self.send_response(302)
            self.send_header('Location', '/dashboard/')
            self.end_headers()
            return
        if clean_path == '/asset-manager':
            self.send_response(302)
            self.send_header('Location', '/asset-manager/')
            self.end_headers()
            return
        if clean_path == '/api/library-config':
            cfg = load_config()
            self._send_json(200, {'ok': True, 'config': cfg})
            return
        if clean_path == '/api/mission-control-state':
            state = build_mission_control_state()
            self._send_json(200, state)
            return
        if clean_path == '/api/pulse-data':
            import threading
            pulse_result = {}
            pulse_error = None
            def _build():
                nonlocal pulse_result, pulse_error
                try:
                    pulse_result = build_pulse_data()
                except Exception as e:
                    pulse_error = str(e)
            t = threading.Thread(target=_build, daemon=True)
            t.start()
            t.join(timeout=15)
            if t.is_alive() or pulse_error:
                # Timeout or error — return minimal data with real jobs count
                jobs = load_mission_control_jobs()
                done_count = sum(1 for j in jobs if j.get('phase') in ('done', 'completed') and j.get('phase') != 'archived')
                self._send_json(200, {'ok': True, 'agents': [{'name': 'Alfred', 'emoji': '🛎️', 'role': 'Coordinator', 'status': 'standby', 'model': 'glm-5.1:cloud'}, {'name': 'Claude', 'emoji': '⚡', 'role': 'Build', 'status': 'standby', 'model': 'Claude-Code / glm-5.1:cloud'}], 'jobs': {'total': len(jobs), 'todo': sum(1 for j in jobs if j.get('phase') == 'todo'), 'working': sum(1 for j in jobs if j.get('phase') == 'working'), 'qc': sum(1 for j in jobs if j.get('phase') in ('review', 'qc')), 'done': done_count}, 'usage': {}, 'compactions': 0, 'tasksCompleted': {}, 'uptime': 'unknown', 'contextUsed': 0, 'contextTotal': 202752, 'excludedModels': [], 'modelUsage': []})
                return
            self._send_json(200, pulse_result)
            return
        if clean_path == '/api/alfred-status':
            status_file = DATA_DIR / 'alfred-status.json'
            status = {}
            if status_file.exists():
                try:
                    status = json.loads(status_file.read_text(encoding='utf-8'))
                except Exception:
                    pass
            self._send_json(200, {'ok': True, **status})
            return
        if clean_path == '/api/alfred-profile':
            profile = build_alfred_profile()
            self._send_json(200, profile)
            return
        if clean_path == '/api/mission-control-jobs':
            all_jobs = load_mission_control_jobs()
            # Return only active (todo + working) jobs — done jobs available via /done endpoint
            active = []
            for j in all_jobs:
                phase = j.get('phase', 'todo')
                if phase in ('archived', 'done', 'completed'):
                    continue  # Skip done/archived — load on demand only
                active.append(j)
            self._send_json(200, {'ok': True, 'jobs': active})
            return
        if clean_path == '/api/mission-control-jobs/done':
            # On-demand: return compacted done jobs for the Done list
            all_jobs = load_mission_control_jobs()
            compacted = []
            for j in all_jobs:
                phase = j.get('phase', 'todo')
                if phase == 'archived':
                    continue
                if phase in ('done', 'completed'):
                    completed_by = ''
                    for h in j.get('history', []):
                        ev = h.get('event', '')
                        if ev in ('transitioned_to_done', 'approved') or 'done' in ev:
                            completed_by = h.get('by', 'Alfred')
                    compacted.append({
                        'id': j.get('id'),
                        'number': j.get('number'),
                        'title': j.get('title'),
                        'phase': phase,
                        'assignee': j.get('assignee'),
                        'priority': j.get('priority'),
                        'project': j.get('project'),
                        'createdBy': j.get('createdBy'),
                        'completedBy': completed_by or j.get('assignee', ''),
                        'completedAt': j.get('completedAt'),
                        'createdAt': j.get('createdAt'),
                    })
            self._send_json(200, {'ok': True, 'jobs': compacted})
            return
        if clean_path == '/api/mission-control-jobs/needs-rewrite':
            jobs = load_mission_control_jobs()
            needing = [j for j in jobs if j.get('needsRewrite')]
            self._send_json(200, {'ok': True, 'jobs': needing})
            return

        if clean_path == '/api/mission-control-jobs/logs':
            # Job-level log entries for the Logs panel
            all_jobs = load_mission_control_jobs()
            log_entries = []
            for j in all_jobs:
                phase = j.get('phase', 'todo')
                if phase == 'archived':
                    continue
                number = j.get('number', '')
                title = j.get('title', '')
                description = j.get('description', j.get('details', ''))
                # Extract last sentence from description
                import re as _re
                sentences = _re.split(r'[.!?]+', description.strip())
                sentences = [s.strip() for s in sentences if s.strip()]
                summary = sentences[-1] if sentences else title
                # Get created and completed dates
                created_at = j.get('createdAt')
                completed_at = j.get('completedAt')
                history = j.get('history', [])
                # Build log text from history
                log_lines = []
                for h in history:
                    ev = h.get('event', '')
                    by = h.get('by', '')
                    ts = h.get('ts', 0)
                    from datetime import datetime as _dt, timezone as _tz
                    try:
                        dt = _dt.fromtimestamp(ts / 1000, tz=_tz.utc)
                        time_str = dt.strftime('%H:%M')
                    except Exception:
                        time_str = ''
                    if 'created' in ev:
                        log_lines.append(f'{time_str} Created by {by}')
                    elif 'working' in ev:
                        log_lines.append(f'{time_str} Started ({by})')
                    elif 'done' in ev or 'approved' in ev:
                        log_lines.append(f'{time_str} Completed ({by})')
                    elif 'archived' in ev:
                        log_lines.append(f'{time_str} Archived')
                    elif 'stopped' in ev:
                        log_lines.append(f'{time_str} Stopped ({by})')
                    elif 'subtask' in ev:
                        log_lines.append(f'{time_str} {ev} ({by})')
                log_entries.append({
                    'id': j.get('id'),
                    'number': number,
                    'title': title,
                    'summary': summary,
                    'phase': phase,
                    'createdAt': created_at,
                    'completedAt': completed_at,
                    'log': log_lines,
                    'assignee': j.get('assignee', ''),
                })
            # Sort by createdAt descending
            log_entries.sort(key=lambda e: e.get('createdAt') or 0, reverse=True)
            self._send_json(200, {'ok': True, 'logs': log_entries})
            return
        if clean_path == '/api/mission-control-projects':
            self._send_json(200, {'ok': True, 'projects': load_mission_control_projects()})
            return
        if clean_path == '/api/mission-control-messages':
            msg_file = UI_ROOT / 'data' / 'messages.json'
            messages = []
            if msg_file.exists():
                try:
                    messages = json.loads(msg_file.read_text(encoding='utf-8'))
                    if not isinstance(messages, list):
                        messages = []
                except Exception:
                    messages = []
            self._send_json(200, {'ok': True, 'messages': messages})
            return
        return super().do_GET()

    def serve_with_range_support(self):
        clean = unquote(self.path.split('?', 1)[0].split('#', 1)[0])
        full_path = Path(super().translate_path(clean))
        if not full_path.exists() or not full_path.is_file():
            self.send_error(404, 'File not found')
            return

        total_size = full_path.stat().st_size
        content_type = self.guess_type(str(full_path))
        range_header = self.headers.get('Range', '').strip()

        start = 0
        end = total_size - 1
        status = 200

        if range_header.startswith('bytes='):
            try:
                range_spec = range_header[len('bytes='):].split(',', 1)[0].strip()
                start_str, end_str = range_spec.split('-', 1)

                if start_str == '':
                    length = int(end_str)
                    start = max(total_size - length, 0)
                else:
                    start = int(start_str)

                if end_str != '':
                    end = int(end_str)

                if start > end or start < 0 or end >= total_size:
                    raise ValueError('Invalid byte range')

                status = 206
            except Exception:
                self.send_response(416)
                self.send_header('Content-Range', f'bytes */{total_size}')
                self.send_header('Accept-Ranges', 'bytes')
                self.end_headers()
                return

        length = end - start + 1
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(length))
        self.send_header('Last-Modified', self.date_time_string(full_path.stat().st_mtime))
        if status == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{total_size}')
        self.end_headers()

        with full_path.open('rb') as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(64 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def translate_path(self, path):
        clean = unquote(path.split('?', 1)[0].split('#', 1)[0])
        if clean.startswith('/mission-control/'):
            rel = clean[len('/mission-control/'):].lstrip('/')
            candidate = (UI_ROOT / rel).resolve()
            root = UI_ROOT.resolve()
            if candidate == root or str(candidate).startswith(str(root) + '/'):
                return str(candidate)
            return str(root / '__forbidden__')
        if clean.startswith('/dashboard/'):
            rel = clean[len('/dashboard/'):].lstrip('/')
            candidate = (DASHBOARD_ROOT / rel).resolve()
            root = DASHBOARD_ROOT.resolve()
            if candidate == root or str(candidate).startswith(str(root) + '/'):
                return str(candidate)
            return str(root / '__forbidden__')
        if clean.startswith('/asset-manager/'):
            rel = clean[len('/asset-manager/'):].lstrip('/')
            candidate = (ASSET_MANAGER_ROOT / rel).resolve()
            root = ASSET_MANAGER_ROOT.resolve()
            if candidate == root or str(candidate).startswith(str(root) + '/'):
                return str(candidate)
            return str(root / '__forbidden__')
        return super().translate_path(path)

    def do_POST(self):
        clean_path = self.path.split('?', 1)[0].split('#', 1)[0]

        # Create a new project
        if clean_path == '/api/mission-control-projects/create':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
                name = (payload.get('name') or '').strip()
                if not name:
                    raise ValueError('Project name is required')
                projects = load_mission_control_projects()
                # Check for duplicate name
                if any(p.get('name') == name for p in projects):
                    raise ValueError(f'Project "{name}" already exists')
                import time as _time_proj
                now_ms = int(_time_proj.time() * 1000)
                slug = name.lower().replace(' ', '-').replace('/', '-')
                new_project = {
                    'id': f'proj_{slug}',
                    'name': name,
                    'folderPath': (payload.get('folderPath') or '').strip(),
                    'createdAt': now_ms,
                    'isDefault': False,
                }
                projects.append(new_project)
                save_mission_control_projects(projects)
                self._send_json(200, {'ok': True, 'project': new_project})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        if clean_path == '/api/save-assets':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8'))
                if not isinstance(payload, list):
                    raise ValueError('Payload must be an array')
                DATA_JSON.parent.mkdir(parents=True, exist_ok=True)
                DATA_JSON.write_text(json.dumps(payload, indent=2), encoding='utf-8')
                self._send_json(200, {'ok': True, 'saved': len(payload)})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        if clean_path == '/api/select-import-folder':
            try:
                folder = choose_folder_mac()
                cfg = load_config()
                cfg['import_root'] = folder
                save_config(cfg)
                sync_selected_root_link()
                proc = subprocess.run(['/opt/homebrew/bin/python3', str(IMPORT_SCRIPT)], capture_output=True, text=True, check=True)
                self._send_json(200, {'ok': True, 'folder': folder, 'message': proc.stdout.strip()})
            except subprocess.CalledProcessError as e:
                self._send_json(500, {'ok': False, 'error': e.stderr or e.stdout})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        if clean_path == '/api/import-assets':
            try:
                DATA_JSON.parent.mkdir(parents=True, exist_ok=True)
                sync_selected_root_link()
                proc = subprocess.run(['/opt/homebrew/bin/python3', str(IMPORT_SCRIPT)], capture_output=True, text=True, check=True)
                self._send_json(200, {'ok': True, 'message': proc.stdout.strip()})
            except subprocess.CalledProcessError as e:
                self._send_json(500, {'ok': False, 'error': e.stderr or e.stdout})
            return

        if clean_path == '/api/delete-asset':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8'))
                rel = (payload.get('path') or '').strip()
                base_root, target = resolve_asset_path(rel)
                if not str(target).startswith(str(base_root) + '/') and target != base_root:
                    raise ValueError('Path escapes root')
                if not target.exists() or not target.is_file():
                    raise FileNotFoundError('Source file not found')
                target.unlink()
                self._send_json(200, {'ok': True, 'deleted': str(target)})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        if clean_path == '/api/log-deletion':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8'))
                DELETION_LOG.parent.mkdir(parents=True, exist_ok=True)
                with DELETION_LOG.open('a', encoding='utf-8') as f:
                    f.write(json.dumps(payload, ensure_ascii=False) + "\n")
                self._send_json(200, {'ok': True})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        if clean_path == '/api/mission-control-jobs':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8') or '{}')
                jobs = payload.get('jobs') if isinstance(payload, dict) else None
                if not isinstance(jobs, list):
                    raise ValueError('jobs must be a list')
                # drop noisy legacy auto-injected runtime jobs
                jobs = [j for j in jobs if isinstance(j, dict) and j.get('source') != 'runtime-auto']
                save_mission_control_jobs(jobs)
                self._send_json(200, {'ok': True, 'saved': len(jobs)})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        # --- Mission Control Job Actions ---
        import re
        mc_job_match = re.match(r'^/api/mission-control-jobs/([^/]+)/(.+)$', clean_path)
        if mc_job_match:
            job_id = unquote(mc_job_match.group(1))
            action = mc_job_match.group(2)
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
            except Exception:
                payload = {}

            if action == 'transition':
                new_phase = (payload.get('phase') or '').strip()
                if new_phase not in ('todo', 'working', 'qc', 'review', 'awaiting-approval', 'done'):
                    self._send_json(400, {'ok': False, 'error': 'Invalid phase'})
                    return
                # Prevent starting a scheduled job before its due date
                if new_phase == 'working':
                    target_job, _ = find_job_by_id(job_id)
                    if target_job:
                        due = target_job.get('dueDate')
                        if due and due != 'None':
                            try:
                                import datetime as _dt
                                due_dt = _dt.datetime.fromisoformat(due.replace('Z', '+00:00'))
                                if due_dt.tzinfo is None:
                                    due_dt = due_dt.replace(tzinfo=_dt.timezone.utc)
                                now_utc = _dt.datetime.now(_dt.timezone.utc)
                                if due_dt > now_utc:
                                    self._send_json(400, {'ok': False, 'error': f'Job is scheduled to start at {due}. Cannot start before due date.'})
                                    return
                            except (ValueError, TypeError):
                                pass  # Invalid date format — allow transition
                by = (payload.get('by') or '').strip() or 'Alfred'
                job, err = transition_job_phase(job_id, new_phase, by=by)
                if err:
                    self._send_json(404, {'ok': False, 'error': err})
                    return
                self._send_json(200, {'ok': True, 'job': job})
                return

            if action == 'create':
                self._send_json(400, {'ok': False, 'error': 'Use POST /api/mission-control-jobs/create'})
                return

            if action == 'snapshot':
                # Snapshot endpoint is now a no-op
                self._send_json(200, {'ok': True, 'message': 'Snapshots are temporarily disabled'})
                return

            if action == 'approve':
                import time as _time_approve
                now_ms_approve = int(_time_approve.time() * 1000)
                job, err = transition_job_phase(job_id, 'done', event_prefix='approved', by='Sam')
                if err:
                    self._send_json(404, {'ok': False, 'error': err})
                    return
                # Set qcResult
                job['qcResult'] = {
                    'status': 'approved',
                    'by': payload.get('by', 'Gemma'),
                    'notes': payload.get('notes', ''),
                    'timestamp': now_ms_approve,
                }
                job['completedAt'] = now_ms_approve
                save_mission_control_jobs(load_mission_control_jobs())
                self._send_json(200, {'ok': True, 'job': job})
                return

            if action == 'reject':
                import time as _time_reject
                now_ms_reject = int(_time_reject.time() * 1000)
                reason = (payload.get('reason') or '').strip()
                job, err = transition_job_phase(job_id, 'working', event_prefix='rejected', by='Sam')
                if err:
                    self._send_json(404, {'ok': False, 'error': err})
                    return
                # Attach rejection reason to the latest history entry
                if job and job.get('history'):
                    job['history'][-1]['reason'] = reason or 'No reason provided'
                # Set qcResult
                job['qcResult'] = {
                    'status': 'rejected',
                    'by': payload.get('by', 'Gemma'),
                    'notes': reason or 'No reason provided',
                    'timestamp': now_ms_reject,
                }
                save_mission_control_jobs(load_mission_control_jobs())
                self._send_json(200, {'ok': True, 'job': job})
                return

            if action == 'archive':
                import time as _time_archive
                now_ms_archive = int(_time_archive.time() * 1000)
                job, jobs = find_job_by_id(job_id)
                if not job:
                    self._send_json(404, {'ok': False, 'error': 'Job not found'})
                    return
                job['phase'] = 'archived'
                job['status'] = 'archived'
                job['updatedAt'] = now_ms_archive
                if 'history' not in job:
                    job['history'] = []
                job['history'].append({'ts': now_ms_archive, 'event': 'archived'})
                save_mission_control_jobs(jobs)
                self._send_json(200, {'ok': True, 'job': job})
                return

            if action == 'approve-request':
                import time as _time_approve_req
                now_ms_approve_req = int(_time_approve_req.time() * 1000)
                job, jobs = find_job_by_id(job_id)
                if not job:
                    self._send_json(404, {'ok': False, 'error': 'Job not found'})
                    return
                if job.get('phase') != 'awaiting-approval':
                    self._send_json(400, {'ok': False, 'error': 'Job is not awaiting approval'})
                    return
                job['phase'] = 'done'
                job['status'] = 'done'
                job['completedAt'] = now_ms_approve_req
                job['updatedAt'] = now_ms_approve_req
                if 'history' not in job:
                    job['history'] = []
                job['history'].append({
                    'ts': now_ms_approve_req,
                    'event': 'request_approved',
                    'by': payload.get('by', 'Sam'),
                })
                job['qcResult'] = {
                    'status': 'approved',
                    'by': payload.get('by', 'Sam'),
                    'notes': '',
                    'timestamp': now_ms_approve_req,
                }
                save_mission_control_jobs(jobs)
                self._send_json(200, {'ok': True, 'job': job})
                return

            if action == 'deny-request':
                import time as _time_deny_req
                now_ms_deny_req = int(_time_deny_req.time() * 1000)
                reason = (payload.get('reason') or '').strip()
                job, jobs = find_job_by_id(job_id)
                if not job:
                    self._send_json(404, {'ok': False, 'error': 'Job not found'})
                    return
                if job.get('phase') != 'awaiting-approval':
                    self._send_json(400, {'ok': False, 'error': 'Job is not awaiting approval'})
                    return
                job['phase'] = 'todo'
                job['status'] = 'todo'
                job['updatedAt'] = now_ms_deny_req
                if 'history' not in job:
                    job['history'] = []
                job['history'].append({
                    'ts': now_ms_deny_req,
                    'event': 'request_denied',
                    'by': payload.get('by', 'Sam'),
                    'reason': reason or 'No reason provided',
                })
                job['qcResult'] = {
                    'status': 'rejected',
                    'by': payload.get('by', 'Sam'),
                    'notes': reason or 'No reason provided',
                    'timestamp': now_ms_deny_req,
                }
                save_mission_control_jobs(jobs)
                self._send_json(200, {'ok': True, 'job': job})
                return

            self._send_json(404, {'ok': False, 'error': f'Unknown action: {action}'})
            return

        # Archive all done jobs
        if clean_path == '/api/mission-control-jobs/archive-all-done':
            try:
                import time as _time_arch_all
                now_ms_arch = int(_time_arch_all.time() * 1000)
                jobs = load_mission_control_jobs()
                archived_count = 0
                for j in jobs:
                    if j.get('phase') in ('done', 'completed'):
                        j['phase'] = 'archived'
                        j['status'] = 'archived'
                        j['updatedAt'] = now_ms_arch
                        if 'history' not in j:
                            j['history'] = []
                        j['history'].append({'ts': now_ms_arch, 'event': 'archived'})
                        archived_count += 1
                save_mission_control_jobs(jobs)
                self._send_json(200, {'ok': True, 'archived': archived_count})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        # Create a new job
        if clean_path == '/api/mission-control-jobs/create':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
                title = (payload.get('title') or '').strip()
                if not title:
                    raise ValueError('Title is required')
                jobs = load_mission_control_jobs()
                import time
                now_ms = int(time.time() * 1000)
                # Auto-increment job number
                max_num = 0
                for j in jobs:
                    num_str = (j.get('number') or '')
                    if num_str.startswith('REQ-'):
                        try:
                            n = int(num_str[4:])
                            if n > max_num:
                                max_num = n
                        except ValueError:
                            pass
                new_job = {
                    'id': f'job_{now_ms}_{__import__("random").randint(1000,9999):04d}',
                    'number': f'REQ-{max_num + 1:03d}',
                    'title': title,
                    'description': payload.get('description', payload.get('details', '')),
                    'details': payload.get('details', ''),
                    'assignee': payload.get('assignee', 'Unassigned'),
                    'createdBy': payload.get('createdBy', payload.get('assignee', 'Unassigned')),
                    'assignedBy': payload.get('assignedBy', payload.get('createdBy', 'Alfred')),
                    'priority': payload.get('priority', 'normal'),
                    'project': payload.get('project', 'Mission Control'),
                    'status': 'todo',
                    'jobStatus': 'active',
                    'phase': 'todo',
                    'source': 'manual',
                    'needsRewrite': True,
                    'activity': 'new',
                    'workers': [],
                    'subtasks': payload.get('subtasks', []),
                    'history': [{'ts': now_ms, 'event': 'created', 'by': payload.get('createdBy', payload.get('assignee', 'Unassigned'))}],
                    'createdAt': now_ms,
                    'updatedAt': now_ms,
                    'dueDate': payload.get('dueDate') or None,
                    'startedAt': None,
                    'completedAt': None,
                    'qcResult': None,
                }
                jobs.append(new_job)
                save_mission_control_jobs(jobs)
                self._send_json(200, {'ok': True, 'job': new_job})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        # Message routing — relay to Alfred
        if clean_path == '/api/alfred-status':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
            except Exception:
                payload = {}
            import time as _time_status
            payload['updatedAt'] = int(_time_status.time() * 1000)
            status_file = DATA_DIR / 'alfred-status.json'
            status_file.write_text(json.dumps(payload, indent=2), encoding='utf-8')
            self._send_json(200, {'ok': True, **payload})
            return

        if clean_path == '/api/mission-control-message':
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
                to_name = (payload.get('to') or '').strip()
                message = (payload.get('message') or '').strip()
                if not to_name or not message:
                    self._send_json(400, {'ok': False, 'error': 'to and message are required'})
                    return

                # Store message in a messages log
                msg_file = UI_ROOT / 'data' / 'messages.json'
                msg_file.parent.mkdir(parents=True, exist_ok=True)
                messages = []
                if msg_file.exists():
                    try:
                        messages = json.loads(msg_file.read_text(encoding='utf-8'))
                        if not isinstance(messages, list):
                            messages = []
                    except Exception:
                        messages = []

                import time as _time_msg
                now_ms_msg = int(_time_msg.time() * 1000)
                msg_entry = {
                    'id': f'msg_{now_ms_msg}',
                    'from': payload.get('from', 'Sam'),
                    'to': to_name,
                    'message': message,
                    'timestamp': now_ms_msg,
                    'routedTo': 'Alfred',
                    'status': 'pending',
                }
                messages.append(msg_entry)
                # Keep last 200 messages
                if len(messages) > 200:
                    messages = messages[-200:]
                msg_file.write_text(json.dumps(messages, indent=2), encoding='utf-8')

                # Try to relay via openclaw if Alfred session is active
                try:
                    subprocess.run(
                        ['openclaw', 'system', 'event', '--text',
                         f'Message from Sam to {to_name}: {message}',
                         '--mode', 'now'],
                        capture_output=True, text=True, timeout=5
                    )
                except Exception:
                    pass

                self._send_json(200, {'ok': True, 'message': msg_entry})
            except Exception as e:
                self._send_json(400, {'ok': False, 'error': str(e)})
            return

        self._send_json(404, {'ok': False, 'error': 'Not found'})

    def do_PATCH(self):
        clean_path = self.path.split('?', 1)[0].split('#', 1)[0]
        import re

        # PATCH /api/mission-control-jobs/{id} — update job fields (priority, etc)
        mc_job_patch_match = re.match(r'^/api/mission-control-jobs/([^/]+)$', clean_path)
        if mc_job_patch_match and not clean_path.endswith('/subtasks'):
            job_id = unquote(mc_job_patch_match.group(1))
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
            except Exception:
                payload = {}

            job, jobs = find_job_by_id(job_id)
            if not job:
                self._send_json(404, {'ok': False, 'error': 'Job not found'})
                return

            # Allowed fields to patch
            for field in ('priority', 'assignee', 'title', 'description', 'dueDate', 'jobStatus', 'assignedBy', 'needsRewrite'):
                if field in payload:
                    job[field] = payload[field]
                    # Add history entry for jobStatus changes
                    if field == 'jobStatus' and payload[field] in ('paused', 'stopped', 'active'):
                        import time as _time_js
                        job['history'].append({
                            'ts': int(_time_js.time() * 1000),
                            'event': f'job {payload[field]}',
                            'by': payload.get('by', 'Alfred'),
                        })

            # Support adding new subtasks via PATCH
            if 'addSubtasks' in payload:
                existing_ids = {st.get('id') for st in job.get('subtasks', [])}
                for new_st in payload['addSubtasks']:
                    if new_st.get('id') and new_st['id'] not in existing_ids:
                        st_obj = {
                            'id': new_st['id'],
                            'title': new_st.get('title', new_st['id']),
                            'status': new_st.get('status', 'pending'),
                            'startedBy': None,
                            'completedBy': None,
                            'startedAt': None,
                            'completedAt': None,
                        }
                        job.setdefault('subtasks', []).append(st_obj)
                        existing_ids.add(new_st['id'])

            # Support updating existing subtask statuses via PATCH
            if 'subtasks' in payload and isinstance(payload['subtasks'], list):
                subtask_map = {st.get('id'): st for st in job.get('subtasks', [])}
                valid_statuses = ('pending', 'in-progress', 'done', 'cancelled')
                import time as _time_patch_st
                now_ms_patch = int(_time_patch_st.time() * 1000)
                for upd in payload['subtasks']:
                    st_id = upd.get('id', '')
                    new_status = upd.get('status', '')
                    if st_id in subtask_map and new_status in valid_statuses:
                        subtask_map[st_id]['status'] = new_status
                        if new_status == 'done':
                            subtask_map[st_id]['completedAt'] = now_ms_patch
                            subtask_map[st_id]['completedBy'] = upd.get('completedBy') or upd.get('by', 'Alfred')
                        elif new_status == 'in-progress':
                            subtask_map[st_id]['startedAt'] = now_ms_patch
                            subtask_map[st_id]['startedBy'] = upd.get('startedBy') or upd.get('by', 'Alfred')
                        elif new_status == 'cancelled':
                            subtask_map[st_id]['cancelledAt'] = now_ms_patch
                            subtask_map[st_id]['cancelledBy'] = upd.get('by', 'Alfred')
                        if 'history' not in job:
                            job['history'] = []
                        st_title = subtask_map.get(st_id, {}).get('title', '')
                        title_suffix = f' — {st_title}' if st_title else ''
                        job['history'].append({
                            'ts': now_ms_patch,
                            'event': f'subtask {st_id} {new_status}{title_suffix}',
                            'by': upd.get('by', 'Alfred'),
                        })

            import time as _time_patch
            job['updatedAt'] = int(_time_patch.time() * 1000)
            save_mission_control_jobs(jobs)
            self._send_json(200, {'ok': True, 'job': job})
            return

        mc_subtask_match = re.match(r'^/api/mission-control-jobs/([^/]+)/subtasks$', clean_path)
        if mc_subtask_match:
            job_id = unquote(mc_subtask_match.group(1))
            length = int(self.headers.get('Content-Length', '0'))
            raw = self.rfile.read(length or 0)
            try:
                payload = json.loads(raw.decode('utf-8')) if length else {}
            except Exception:
                payload = {}

            job, jobs = find_job_by_id(job_id)
            if not job:
                self._send_json(404, {'ok': False, 'error': 'Job not found'})
                return

            # Support single update or batch
            updates = payload.get('updates', [])
            if not updates and payload.get('subtaskId'):
                updates = [{'subtaskId': payload['subtaskId'], 'status': payload.get('status', 'pending')}]

            valid_statuses = ('pending', 'in-progress', 'done', 'cancelled')
            subtask_map = {st.get('id'): st for st in job.get('subtasks', [])}

            import time as _time_st
            now_ms_st = int(_time_st.time() * 1000)

            for upd in updates:
                st_id = upd.get('subtaskId', '')
                new_status = upd.get('status', 'pending')
                if st_id in subtask_map and new_status in valid_statuses:
                    subtask_map[st_id]['status'] = new_status
                    # Track completion metadata
                    if new_status == 'done':
                        subtask_map[st_id]['completedAt'] = now_ms_st
                        subtask_map[st_id]['completedBy'] = upd.get('by', 'Alfred')
                    elif new_status == 'in-progress':
                        subtask_map[st_id]['startedAt'] = now_ms_st
                        subtask_map[st_id]['startedBy'] = upd.get('by', 'Alfred')
                    elif new_status == 'cancelled':
                        subtask_map[st_id]['cancelledAt'] = now_ms_st
                        subtask_map[st_id]['cancelledBy'] = upd.get('by', 'Alfred')
                    if 'history' not in job:
                        job['history'] = []
                    # Include subtask title in event for better readability
                    st_title = subtask_map.get(st_id, {}).get('title', '')
                    title_suffix = f' — {st_title}' if st_title else ''
                    job['history'].append({
                        'ts': now_ms_st,
                        'event': f'subtask {st_id} {new_status}{title_suffix}',
                        'by': upd.get('by', 'Alfred'),
                    })

            job['updatedAt'] = now_ms_st
            save_mission_control_jobs(jobs)

            # Auto-transition: if all subtasks are done (ignore cancelled), move job to done
            subtasks = job.get('subtasks', [])
            active_subtasks = [st for st in subtasks if st.get('status') != 'cancelled']
            if active_subtasks and job.get('phase') != 'done':
                all_done = all(st.get('status') == 'done' for st in active_subtasks)
                if all_done:
                    import time as _time_done
                    now_ms_done = int(_time_done.time() * 1000)
                    job['phase'] = 'done'
                    job['status'] = 'done'
                    job['completedAt'] = now_ms_done
                    job['updatedAt'] = now_ms_done
                    if 'history' not in job:
                        job['history'] = []
                    job['history'].append({'ts': now_ms_done, 'event': 'all_subtasks_done_auto', 'by': 'System'})
                    save_mission_control_jobs(jobs)

            self._send_json(200, {'ok': True, 'job': job})
            return

        self._send_json(404, {'ok': False, 'error': 'Not found'})


if __name__ == '__main__':
    import time as _time
    _SERVER_START_TIME = _time.time()
    os.chdir(UI_ROOT)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not DATA_JSON.exists():
        DATA_JSON.write_text('[]\n', encoding='utf-8')
    if not CONFIG_JSON.exists():
        CONFIG_JSON.write_text('{}\n', encoding='utf-8')
    if not MISSION_CONTROL_JOBS_JSON.exists():
        MISSION_CONTROL_JOBS_JSON.parent.mkdir(parents=True, exist_ok=True)
        MISSION_CONTROL_JOBS_JSON.write_text('[]\n', encoding='utf-8')
    MISSION_CONTROL_SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    sync_selected_root_link()
    server = ThreadingHTTPServer(('0.0.0.0', 8787), Handler)
    print('Creative Ops UI dev server running on http://0.0.0.0:8787')
    print('Market Dashboard available at http://0.0.0.0:8787/dashboard/')
    server.serve_forever()
