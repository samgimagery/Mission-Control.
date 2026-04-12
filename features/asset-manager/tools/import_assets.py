#!/usr/bin/env python3
import json
import os
from pathlib import Path
from datetime import datetime

OPENCLAW_ROOT = Path('/Users/samg/AI/OpenClaw')
AI_ROOT = Path('/Users/samg/AI')
UI_ROOT = OPENCLAW_ROOT / 'dev' / 'asset-manager'
DATA_DIR = UI_ROOT / 'data'
OUT = DATA_DIR / 'assets.json'
CONFIG_JSON = DATA_DIR / 'library-config.json'
SELECTED_ROOT_LINK = UI_ROOT / 'selected_root'

DEFAULT_SCAN_DIRS = [
    OPENCLAW_ROOT / 'camera',
    OPENCLAW_ROOT / 'images',
    OPENCLAW_ROOT / 'closure',
    OPENCLAW_ROOT / 'exports',
    OPENCLAW_ROOT / 'notes',
    AI_ROOT / 'codex',
]

EXT_TYPE = {
    '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.webp': 'image', '.gif': 'image',
    '.mp4': 'video', '.mov': 'video', '.m4v': 'video',
    '.pdf': 'doc', '.html': 'doc', '.htm': 'doc',
    '.mp3': 'audio', '.wav': 'audio', '.m4a': 'audio'
}


def load_config() -> dict:
    if not CONFIG_JSON.exists():
        return {}
    try:
        data = json.loads(CONFIG_JSON.read_text(encoding='utf-8'))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def selected_import_root() -> Path | None:
    cfg = load_config()
    raw = str(cfg.get('import_root') or '').strip()
    if not raw:
        return None
    p = Path(raw).expanduser().resolve()
    if p.exists() and p.is_dir():
        return p
    return None


def active_scan_dirs() -> list[Path]:
    chosen = selected_import_root()
    return [chosen] if chosen else DEFAULT_SCAN_DIRS


def infer_project(path: Path) -> str:
    s = str(path).lower()
    if 'cosmic' in s:
        return 'The Cosmic Engine'
    if 'samg.studio' in s or 'homepage' in s:
        return 'samg.studio'
    return 'General'


def infer_source(path: Path) -> str:
    s = str(path).lower()
    if '/images/icons/' in s:
        return 'openclaw-image-generation'
    if '/camera/' in s:
        return 'camera-capture'
    if 'screenshot' in path.name.lower() or path.suffix.lower() == '.png':
        return 'ui-capture'
    return 'local-import'


def infer_api(path: Path) -> str:
    src = infer_source(path)
    if src == 'openclaw-image-generation':
        return 'openai-images'
    if src == 'camera-capture':
        return 'rtsp/onvif'
    if src == 'ui-capture':
        return 'local-filesystem'
    return 'local-filesystem'


def infer_prompt(path: Path) -> str:
    stem = path.stem.replace('_', ' ').replace('-', ' ')
    return f'Imported asset: {stem}'


def infer_guidance(path: Path) -> str:
    return 'Keep canonical naming, maintain version suffixes, and preserve source traceability.'


def infer_tags(path: Path, project: str, t: str):
    tags = [path.parent.name, project.lower().replace(' ', '-'), t]
    if '/images/icons/' in str(path).lower():
        tags.extend(['icon', 'branding'])
    return sorted({x for x in tags if x})


def to_rel_for_ui(path: Path) -> str:
    selected_root = selected_import_root()
    openclaw_root = OPENCLAW_ROOT.resolve()
    ai_root = AI_ROOT.resolve()
    p = path.resolve()

    if selected_root:
        root = selected_root.resolve()
        if p == root or str(p).startswith(str(root) + '/'):
            rel = os.path.relpath(p, root).replace('\\', '/')
            return f"./selected_root/{rel}"

    if p == openclaw_root or str(p).startswith(str(openclaw_root) + '/'):
        rel_to_root = os.path.relpath(p, openclaw_root).replace('\\', '/')
        return f"./media_root/{rel_to_root}"

    if p == ai_root or str(p).startswith(str(ai_root) + '/'):
        rel_to_ai = os.path.relpath(p, ai_root).replace('\\', '/')
        return f"./codex_root/{rel_to_ai}"

    rel_to_ai = os.path.relpath(p, ai_root).replace('\\', '/')
    return f"./codex_root/{rel_to_ai}"


def infer_folder(rel_path: str) -> str:
    clean = str(rel_path or '').replace('./', '')
    parts = [x for x in clean.split('/') if x]
    if not parts:
        return 'Unsorted'
    if len(parts) == 1:
        return parts[0]
    return '/'.join(parts[:2])


def build_assets():
    existing = []
    if OUT.exists():
        try:
            existing = json.loads(OUT.read_text(encoding='utf-8'))
        except Exception:
            existing = []
    by_path = {x.get('path'): x for x in existing if isinstance(x, dict)}

    selected_root = selected_import_root()
    selected_root_resolved = selected_root.resolve() if selected_root else None

    assets = []
    idx = 1
    for d in active_scan_dirs():
        if not d.exists():
            continue
        for p in sorted(d.rglob('*')):
            if not p.is_file():
                continue
            ext = p.suffix.lower()
            if ext not in EXT_TYPE:
                continue

            in_selected_root = bool(selected_root_resolved and (p.resolve() == selected_root_resolved or str(p.resolve()).startswith(str(selected_root_resolved) + '/')))
            in_codex = str(p.resolve()).startswith(str((AI_ROOT / 'codex').resolve()) + '/')
            if in_codex and not in_selected_root:
                if ext not in ('.html', '.htm'):
                    continue
                codex_l = str(p).lower()
                keep_codex = (
                    codex_l.endswith('/samg.studio-sandbox/index.html') or
                    codex_l.endswith('/samg.studio-sandbox/concepts/v3-premium-minimal.html')
                )
                if not keep_codex:
                    continue

            t = EXT_TYPE[ext]
            mtime = datetime.fromtimestamp(p.stat().st_mtime).astimezone().isoformat(timespec='seconds')
            rel = to_rel_for_ui(p)
            thumb = rel if t in ('image', 'screenshot') else None
            prev = by_path.get(rel, {})
            assets.append({
                'id': prev.get('id', f'a{idx}'),
                'project': prev.get('project', infer_project(p)),
                'asset_name': p.name,
                'type': t,
                'model_tool': prev.get('model_tool', 'import-scan'),
                'created_at': mtime,
                'status': prev.get('status', 'draft'),
                'path': rel,
                'folder': prev.get('folder') or infer_folder(rel),
                'thumbnail_path': prev.get('thumbnail_path', thumb),
                'tags': prev.get('tags') or infer_tags(p, prev.get('project', infer_project(p)), t),
                'notes': prev.get('notes') or 'Auto-imported. Review and refine metadata as needed.',
                'iteration_of': prev.get('iteration_of', None),
                'source': prev.get('source') or infer_source(p),
                'api': prev.get('api') or infer_api(p),
                'prompt': prev.get('prompt') or infer_prompt(p),
                'designer_guidance': prev.get('designer_guidance') or infer_guidance(p)
            })
            idx += 1
    return assets


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    assets = build_assets()
    OUT.write_text(json.dumps(assets, indent=2), encoding='utf-8')
    print(f'Imported {len(assets)} assets -> {OUT}')


if __name__ == '__main__':
    main()
