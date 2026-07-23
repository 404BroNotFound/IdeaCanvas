# IdeaCanvas

IdeaCanvas is a local-first visual workspace for turning ideas into diagrams,
notes, plans, and annotated images directly in the browser.

## Features

- Infinite canvas with zooming, panning, grid controls, and focus mode
- Sticky notes, text, tasks, frames, shapes, arrows, and connectors
- Smooth freehand drawing with a click-and-drag eraser
- Image uploads with text and drawing overlays
- Automatic object, stroke, and connector selection
- Keyboard navigation, movement, editing, deletion, undo, and redo
- Light and dark themes with consistent selection feedback
- Mind map, process flow, brainstorming, roadmap, Kanban, and wireframe layouts
- JSON backups plus SVG and high-resolution PNG exports
- Multiple canvases stored locally in the browser

## Getting Started

IdeaCanvas has no dependencies, build step, backend, or database.

1. Clone the repository:

   ```bash
   git clone https://github.com/404BroNotFound/IdeaCanvas.git
   ```

2. Open the project folder.
3. Open `index.html` in a modern browser.

You can also use a static preview extension such as Live Server.

## Using the Canvas

- Choose a creation tool from the sidebar and click the canvas.
- Tap an existing object, stroke, or connector to select it.
- Use the floating action bar or the Delete key to remove a selection.
- Select a picture and choose **Write** to add text over it.
- Choose the pencil or eraser and drag directly across the canvas.
- Use **Snap** for grid alignment and **Focus** to hide surrounding panels.

## Keyboard Shortcuts

| Action | Shortcut |
| --- | --- |
| Select | `V` |
| Pan canvas | `H` or hold `Space` and drag |
| Pencil | `P` |
| Eraser | `E` |
| Arrow | `L` |
| Rectangle | `R` |
| Ellipse | `O` |
| Sticky note | `N` |
| Text | `T` |
| Edit selection | `Enter` |
| Delete selection | `Delete` or `Backspace` |
| Select or move objects | Arrow keys |
| Move by 10 pixels | `Shift` + Arrow key |
| Change selection | `Alt` + Arrow key |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` |
| Copy / paste | `Ctrl+C` / `Ctrl+V` |
| Search canvas | `Ctrl+F` |
| Save locally | `Ctrl+S` |

## Local Storage

Canvas files are saved in browser `localStorage`. No canvas content is uploaded
to a server. Browser data can be removed when site data is cleared, so export a
JSON backup for important canvases.

## Project Structure

```text
IdeaCanvas/
??? index.html   # Application interface
??? styles.css   # Layout, themes, and responsive styling
??? app.js       # Canvas tools, interactions, storage, and exports
??? logo.svg     # IdeaCanvas logo
??? README.md    # Project documentation
```

## Browser Support

IdeaCanvas is designed for current versions of Chrome, Edge, Firefox, and
Safari on desktop and touch devices.
