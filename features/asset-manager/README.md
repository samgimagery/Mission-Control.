# Creative Ops UI (MVP)

Minimal local UI for browsing generated assets.

## Run
From this folder (recommended server with one-click import/save):

```bash
python3 /Users/samg/AI/OpenClaw/dev/asset-manager/tools/dev_server.py
```

Open: http://localhost:8787

## Data
Edit `data/assets.json` manually, or auto-import from canonical folders:

```bash
python3 /Users/samg/AI/OpenClaw/dev/asset-manager/tools/import_assets.py
```

Then click **Refresh** in the UI.

## Save changes flow
- Click **Save metadata** in an asset detail.
- The app now tries to save directly to `data/assets.json` via local API.
- If local API is unavailable, it falls back to exporting `assets.updated.json`.

## Features
- Grid view with zoom slider
- Folder + type/status filters
- Load more button for large libraries
- Right-side detail preview panel
- Minimal editorial styling
