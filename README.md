# IdeaCanvas

A local-first visual-thinking workspace with freehand drawing, shapes, text,
picture captions, connectors, templates, colors, zoom, history, and JSON export.

## Run locally

IdeaCanvas is a static website with no backend and no database. Open `index.html`
directly in a modern browser, or use any static-file preview extension. If your
browser restricts local files, run a simple static-file server such as:

```powershell
python -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## Storage and privacy

Canvases and their file-library metadata are stored only in the browser's
`localStorage`. Nothing is sent to a server. Browser storage belongs to the
current browser profile and site origin, so export a JSON backup before clearing
site data or switching browsers.

## Features

- Infinite canvas with smooth marker drawing, shapes, text, notes, and connectors
- Sticky notes that grow only when their writing area is full
- Picture upload with editable on-picture captions
- Broad font picker with web fonts and common system font families
- Selectable marker strokes and reliable toolbar/keyboard deletion
- Keyboard tools, editing, object cycling, nudging, zoom, history, and search
- Mind map, process flow, brainstorming, roadmap, Kanban, and wireframe layouts
- Multiple named canvases stored locally in the browser
- Light/dark themes with visible selection and color outlines
- JSON import/export, SVG vector export, and high-resolution PNG export