# IdeaCanvas

A professional visual-thinking workspace with freehand drawing, shapes,
connectors, templates, colors, zoom, history, server persistence, local fallback,
and JSON export.

## Run locally

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python server.py
```

Open `http://127.0.0.1:4173`.

## Backend API

- `GET /api/health` checks the service.
- `GET /api/boards/<board_id>` loads a saved canvas.
- `PUT /api/boards/<board_id>` validates and saves a canvas.

Board files are stored under `data/boards/` and ignored by Git.
