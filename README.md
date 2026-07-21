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

## Features

- Professional infinite canvas with drawing, shapes, text, notes, and connectors
- Mind map, process flow, and brainstorming layouts
- Canvas-wide text search with focus navigation
- Duplicate, delete, clear-with-undo, and center-content actions
- Keyboard shortcuts, zoom, panning, grid controls, and responsive layout
- Debounced server autosave with local-storage fallback
- JSON export and validated Python persistence API

## Backend API

- `GET /api/health` checks the service.
- `GET /api/boards/<board_id>` loads a saved canvas.
- `PUT /api/boards/<board_id>` validates and saves a canvas.

Board files are stored under `data/boards/` and ignored by Git.
