"use strict";

/* ========================================================================== 
   IdeaCanvas
   A dependency-free visual workspace built with DOM nodes and SVG paths.
   ========================================================================== */

// DOM references ------------------------------------------------------------
const elements = {
  appShell: document.querySelector(".app-shell"),
  viewport: document.querySelector("#viewport"),
  world: document.querySelector("#world"),
  connectionLayer: document.querySelector("#connectionLayer"),
  emptyState: document.querySelector("#emptyState"),
  inspector: document.querySelector(".inspector"),
  inspectorTitle: document.querySelector("#inspectorTitle"),
  saveStatus: document.querySelector("#saveStatus"),
  toast: document.querySelector("#toast"),
  zoomLabel: document.querySelector("#zoomLabel"),
  templateDialog: document.querySelector("#templateDialog"),
  shortcutDialog: document.querySelector("#shortcutDialog"),
  searchDialog: document.querySelector("#searchDialog"),
  searchInput: document.querySelector("#searchInput"),
  searchResults: document.querySelector("#searchResults"),
  selectionActions: document.querySelector("#selectionActions"),
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "ideacanvas";
const DEFAULT_BOARD_ID = "default";
const HEADER_HEIGHT = 72;
const NOTE_COLORS = ["#fff0ad", "#c7eadc", "#d4e2fa", "#f7cec7", "#e6daf4"];
const KEY_TO_TOOL = {
  v: "select",
  h: "hand",
  p: "draw",
  l: "line",
  r: "rect",
  o: "ellipse",
  g: "diamond",
  n: "note",
  t: "text",
  c: "connector",
};

// Application state ---------------------------------------------------------
const state = {
  tool: "select",
  zoom: 1,
  panX: 0,
  panY: 0,
  color: "#202630",
  strokeWidth: 2,
  nodes: [],
  drawings: [],
  connections: [],
};

let history = [];
let future = [];
let interaction = null;
let idCounter = 0;
let spacePressed = false;
let toastTimer = null;
let autoSaveTimer = null;

// Small utilities -----------------------------------------------------------
function queryAll(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function createId() {
  idCounter += 1;
  return `item-${Date.now()}-${idCounter}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
  })[character]);
}

function screenToWorld(clientX, clientY) {
  return {
    x: (clientX - state.panX) / state.zoom,
    y: (clientY - HEADER_HEIGHT - state.panY) / state.zoom,
  };
}

function getSelectedNodeElement() {
  return document.querySelector(".node.selected");
}

function getNodeById(nodeId) {
  return state.nodes.find((node) => node.id === nodeId);
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

function markUnsaved() {
  elements.saveStatus.textContent = "Unsaved changes";
  document.querySelector(".status-dot").style.background = "#e67a42";
  scheduleAutoSave();
}

function markSaved() {
  elements.saveStatus.textContent = "All changes saved";
  document.querySelector(".status-dot").style.background = "#0f9f78";
}

// History -------------------------------------------------------------------
function serializeCanvas() {
  return JSON.stringify({
    nodes: state.nodes,
    drawings: state.drawings,
    connections: state.connections,
  });
}

function takeSnapshot() {
  history.push(serializeCanvas());
  if (history.length > 60) history.shift();
  future = [];
  markUnsaved();
}

function restoreSnapshot(snapshot) {
  const savedCanvas = JSON.parse(snapshot);
  state.nodes = savedCanvas.nodes || [];
  state.drawings = savedCanvas.drawings || [];
  state.connections = savedCanvas.connections || [];
  renderCanvas();
  markUnsaved();
}

function undo() {
  if (!history.length) return;
  future.push(serializeCanvas());
  restoreSnapshot(history.pop());
}

function redo() {
  if (!future.length) return;
  history.push(serializeCanvas());
  restoreSnapshot(future.pop());
}

// View and tool state -------------------------------------------------------
function updateWorldTransform() {
  elements.world.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  elements.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
}

function setTool(toolName) {
  state.tool = toolName;

  queryAll(".nav-tool[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === toolName);
  });

  const cursors = {
    hand: "grab",
    draw: "crosshair",
    line: "crosshair",
    connector: "crosshair",
  };
  elements.viewport.style.cursor = cursors[toolName] || "default";

  const labels = {
    select: "Selection",
    hand: "Canvas",
    draw: "Pencil",
    line: "Arrow",
    connector: "Connector",
    rect: "Rectangle",
    ellipse: "Ellipse",
    diamond: "Decision",
    note: "Sticky note",
    text: "Text",
  };
  elements.inspectorTitle.textContent = labels[toolName] || "Canvas";
}

function clearSelection() {
  queryAll(".node.selected").forEach((node) => node.classList.remove("selected"));
  elements.selectionActions.classList.remove("visible");
}

function selectNode(nodeId) {
  clearSelection();
  const nodeElement = document.querySelector(`[data-id="${nodeId}"]`);
  nodeElement?.classList.add("selected");
  elements.selectionActions.classList.toggle("visible", Boolean(nodeElement));
  const node = getNodeById(nodeId);
  if (node) elements.inspectorTitle.textContent = node.type === "note" ? "Sticky note" : node.type;
}

// Canvas data ---------------------------------------------------------------
function addNode(type, x, y, text, width, height, color) {
  const presets = {
    note: { width: 190, height: 132, text: "Write an idea…" },
    rect: { width: 180, height: 94, text: "Add a label" },
    ellipse: { width: 172, height: 104, text: "New thought" },
    diamond: { width: 124, height: 124, text: "Decision" },
    text: { width: 220, height: 44, text: "Start typing" },
  };
  const preset = presets[type];

  const node = {
    id: createId(),
    type,
    x,
    y,
    width: width || preset.width,
    height: height || preset.height,
    text: text || preset.text,
    color: color || (type === "note" ? NOTE_COLORS[state.nodes.length % NOTE_COLORS.length] : state.color),
  };

  state.nodes.push(node);
  return node;
}

function deleteSelectedNode() {
  const selectedElement = getSelectedNodeElement();
  if (!selectedElement) return;

  const nodeId = selectedElement.dataset.id;
  takeSnapshot();
  state.nodes = state.nodes.filter((node) => node.id !== nodeId);
  state.connections = state.connections.filter((connection) => (
    connection.from !== nodeId && connection.to !== nodeId
  ));
  renderCanvas();
}

// SVG rendering -------------------------------------------------------------
function createSvgPath(drawing) {
  const path = document.createElementNS(SVG_NAMESPACE, "path");
  path.setAttribute("d", drawing.path);
  path.setAttribute("class", "draw-path");
  path.setAttribute("stroke", drawing.color || state.color);
  path.setAttribute("stroke-width", drawing.width || 2);
  if (drawing.arrow) path.setAttribute("marker-end", "url(#arrow)");
  elements.connectionLayer.appendChild(path);
}

function renderConnection(connection) {
  const start = getNodeById(connection.from);
  const end = getNodeById(connection.to);
  if (!start || !end) return;

  const startX = start.x + start.width / 2;
  const startY = start.y + start.height / 2;
  const endX = end.x + end.width / 2;
  const endY = end.y + end.height / 2;
  const curve = Math.max(45, Math.abs(endX - startX) * 0.45);

  createSvgPath({
    path: `M${startX} ${startY} C${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`,
    color: connection.color || "#6458d6",
    width: 2,
    arrow: true,
  });
}

// DOM rendering -------------------------------------------------------------
function renderCanvas() {
  queryAll(".node", elements.world).forEach((node) => node.remove());
  queryAll(":scope > path", elements.connectionLayer).forEach((path) => path.remove());

  state.drawings.forEach(createSvgPath);
  state.connections.forEach(renderConnection);

  state.nodes.forEach((node) => {
    const nodeElement = document.createElement("div");
    nodeElement.className = `node ${node.type}`;
    nodeElement.dataset.id = node.id;
    nodeElement.style.cssText = [
      `left:${node.x}px`,
      `top:${node.y}px`,
      `width:${node.width}px`,
      `height:${node.height}px`,
      `--node-color:${node.color}`,
      node.type === "note" ? `background:${node.color}` : "",
    ].join(";");
    nodeElement.innerHTML = `<div class="content">${escapeHtml(node.text)}</div>`;
    elements.world.appendChild(nodeElement);
  });

  const hasContent = state.nodes.length > 0 || state.drawings.length > 0;
  elements.emptyState.classList.toggle("hidden", hasContent);
}

function beginNodeEditing(node) {
  requestAnimationFrame(() => {
    const nodeElement = document.querySelector(`[data-id="${node.id}"]`);
    if (!nodeElement) return;

    selectNode(node.id);
    const content = nodeElement.querySelector(".content");
    content.contentEditable = "true";
    content.focus();
    document.execCommand("selectAll", false, null);
  });
}

// Pointer interactions ------------------------------------------------------
function beginPan(event) {
  interaction = {
    kind: "pan",
    startClientX: event.clientX,
    startClientY: event.clientY,
    startPanX: state.panX,
    startPanY: state.panY,
  };
  elements.viewport.classList.add("panning");
}

function beginDrawing(kind, point) {
  takeSnapshot();
  interaction = {
    kind,
    points: [[point.x, point.y]],
    color: state.color,
    width: state.strokeWidth,
  };
}

function handlePointerDown(event) {
  if (event.button !== 0) return;

  const nodeElement = event.target.closest(".node");
  const worldPoint = screenToWorld(event.clientX, event.clientY);
  const wantsToPan = state.tool === "hand" || spacePressed;

  if (wantsToPan) {
    beginPan(event);
    return;
  }

  if (nodeElement && state.tool === "select") {
    const node = getNodeById(nodeElement.dataset.id);
    takeSnapshot();
    selectNode(node.id);
    interaction = {
      kind: "move",
      nodeId: node.id,
      offsetX: worldPoint.x - node.x,
      offsetY: worldPoint.y - node.y,
    };
    return;
  }

  if (nodeElement && state.tool === "connector") {
    handleConnectorClick(nodeElement.dataset.id);
    return;
  }

  if (state.tool === "draw" || state.tool === "line") {
    beginDrawing(state.tool, worldPoint);
    return;
  }

  const nodeTools = ["note", "rect", "ellipse", "diamond", "text"];
  if (nodeTools.includes(state.tool)) {
    takeSnapshot();
    const node = addNode(state.tool, worldPoint.x - 90, worldPoint.y - 55);
    renderCanvas();
    setTool("select");
    beginNodeEditing(node);
    return;
  }

  clearSelection();
  elements.inspectorTitle.textContent = "Canvas";
}

function handleConnectorClick(nodeId) {
  if (interaction?.kind === "connect" && interaction.from !== nodeId) {
    takeSnapshot();
    state.connections.push({ from: interaction.from, to: nodeId, color: state.color });
    interaction = null;
    setTool("select");
    renderCanvas();
    showToast("Objects connected");
    return;
  }

  interaction = { kind: "connect", from: nodeId };
  selectNode(nodeId);
  showToast("Choose another object to connect");
}

function handlePointerMove(event) {
  if (!interaction) return;

  if (interaction.kind === "pan") {
    state.panX = interaction.startPanX + event.clientX - interaction.startClientX;
    state.panY = interaction.startPanY + event.clientY - interaction.startClientY;
    updateWorldTransform();
    return;
  }

  if (interaction.kind === "move") {
    const worldPoint = screenToWorld(event.clientX, event.clientY);
    const node = getNodeById(interaction.nodeId);
    node.x = worldPoint.x - interaction.offsetX;
    node.y = worldPoint.y - interaction.offsetY;
    renderCanvas();
    selectNode(node.id);
    return;
  }

  if (interaction.kind === "draw" || interaction.kind === "line") {
    const worldPoint = screenToWorld(event.clientX, event.clientY);
    if (interaction.kind === "draw") {
      interaction.points.push([worldPoint.x, worldPoint.y]);
    } else {
      interaction.points[1] = [worldPoint.x, worldPoint.y];
    }

    renderCanvas();
    createSvgPath({
      path: pointsToPath(interaction.points),
      color: interaction.color,
      width: interaction.width,
      arrow: interaction.kind === "line",
    });
  }
}

function pointsToPath(points) {
  return `M${points.map((point) => point.join(" ")).join(" L")}`;
}

function handlePointerUp() {
  if (interaction?.kind === "draw" || interaction?.kind === "line") {
    if (interaction.points.length > 1) {
      state.drawings.push({
        path: pointsToPath(interaction.points),
        color: interaction.color,
        width: interaction.width,
        arrow: interaction.kind === "line",
      });
    }
    renderCanvas();
  }

  if (interaction?.kind !== "connect") interaction = null;
  elements.viewport.classList.remove("panning");
}

// Selection, search, and workspace actions ---------------------------------
function duplicateSelectedNode() {
  const selectedElement = getSelectedNodeElement();
  if (!selectedElement) return;

  const source = getNodeById(selectedElement.dataset.id);
  takeSnapshot();
  const duplicate = {
    ...source,
    id: createId(),
    x: source.x + 28,
    y: source.y + 28,
  };
  state.nodes.push(duplicate);
  renderCanvas();
  selectNode(duplicate.id);
  showToast("Object duplicated");
}

function centerContent() {
  if (!state.nodes.length) {
    resetView();
    return;
  }

  const bounds = state.nodes.reduce((result, node) => ({
    left: Math.min(result.left, node.x),
    top: Math.min(result.top, node.y),
    right: Math.max(result.right, node.x + node.width),
    bottom: Math.max(result.bottom, node.y + node.height),
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });

  const availableWidth = elements.viewport.clientWidth;
  const availableHeight = elements.viewport.clientHeight;
  const contentWidth = bounds.right - bounds.left;
  const contentHeight = bounds.bottom - bounds.top;
  state.zoom = Math.max(0.35, Math.min(1.2, availableWidth / (contentWidth + 180), availableHeight / (contentHeight + 180)));
  state.panX = availableWidth / 2 - ((bounds.left + bounds.right) / 2) * state.zoom;
  state.panY = availableHeight / 2 - ((bounds.top + bounds.bottom) / 2) * state.zoom;
  updateWorldTransform();
}

function clearCanvas() {
  if (!state.nodes.length && !state.drawings.length) return;
  if (!window.confirm("Clear every object from this canvas? You can undo this action.")) return;

  takeSnapshot();
  state.nodes = [];
  state.drawings = [];
  state.connections = [];
  interaction = null;
  clearSelection();
  renderCanvas();
  showToast("Canvas cleared — use Undo to restore it");
}

function openCanvasSearch() {
  elements.searchDialog.showModal();
  elements.searchInput.value = "";
  renderSearchResults("");
  requestAnimationFrame(() => elements.searchInput.focus());
}

function renderSearchResults(query) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    elements.searchResults.innerHTML = "<p>Start typing to search your canvas.</p>";
    return;
  }

  const matches = state.nodes.filter((node) => node.text.toLowerCase().includes(normalizedQuery));
  if (!matches.length) {
    elements.searchResults.innerHTML = `<p>No objects found for “${escapeHtml(query)}”.</p>`;
    return;
  }

  elements.searchResults.innerHTML = matches.map((node) => `
    <button class="search-result" data-result-id="${node.id}">
      <span class="result-icon">${node.type.slice(0, 1).toUpperCase()}</span>
      <span><b>${escapeHtml(node.text)}</b><small>${node.type}</small></span>
      <strong>→</strong>
    </button>
  `).join("");
}

function focusSearchResult(nodeId) {
  const node = getNodeById(nodeId);
  if (!node) return;

  elements.searchDialog.close();
  const centerX = node.x + node.width / 2;
  const centerY = node.y + node.height / 2;
  state.panX = elements.viewport.clientWidth / 2 - centerX * state.zoom;
  state.panY = elements.viewport.clientHeight / 2 - centerY * state.zoom;
  updateWorldTransform();
  selectNode(node.id);

  const nodeElement = document.querySelector(`[data-id="${node.id}"]`);
  nodeElement?.classList.add("search-match");
  setTimeout(() => nodeElement?.classList.remove("search-match"), 900);
}

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveBoard({ silent: true }), 1400);
}
// Canvas zoom ---------------------------------------------------------------
function zoomAtPoint(nextZoom, clientX, clientY) {
  const previousZoom = state.zoom;
  state.zoom = Math.max(0.25, Math.min(2.5, nextZoom));
  state.panX = clientX - (clientX - state.panX) * (state.zoom / previousZoom);
  state.panY = clientY - HEADER_HEIGHT - (clientY - HEADER_HEIGHT - state.panY) * (state.zoom / previousZoom);
  updateWorldTransform();
}

function handleWheel(event) {
  event.preventDefault();

  if (event.ctrlKey) {
    const multiplier = event.deltaY > 0 ? 0.9 : 1.1;
    zoomAtPoint(state.zoom * multiplier, event.clientX, event.clientY);
  } else {
    state.panX -= event.deltaX;
    state.panY -= event.deltaY;
    updateWorldTransform();
  }
}

function resetView() {
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  updateWorldTransform();
}

// Templates -----------------------------------------------------------------
function addMindMap(centerX, centerY) {
  const center = addNode("ellipse", centerX - 95, centerY - 60, "Core idea", 190, 110);
  const branches = [
    ["Audience", centerX - 390, centerY - 210],
    ["Challenge", centerX - 400, centerY + 95],
    ["Approach", centerX + 230, centerY - 210],
    ["Next move", centerX + 240, centerY + 95],
  ];

  branches.forEach(([label, x, y]) => {
    const note = addNode("note", x, y, label, 180, 108);
    state.connections.push({ from: center.id, to: note.id, color: "#6458d6" });
  });
}

function addProcessFlow(centerX, centerY) {
  let previousNode = null;
  ["Discover", "Define", "Create", "Deliver"].forEach((label, index) => {
    const node = addNode("rect", centerX - 430 + index * 230, centerY - 45, label, 160, 86, "#1778e8");
    if (previousNode) {
      state.connections.push({ from: previousNode.id, to: node.id, color: "#1778e8" });
    }
    previousNode = node;
  });
}

function addBrainstorm(centerX, centerY) {
  const columns = ["Opportunities", "Questions", "Next moves"];
  columns.forEach((title, columnIndex) => {
    const x = centerX - 390 + columnIndex * 275;
    addNode("text", x, centerY - 190, title, 220, 40);
    addNode("note", x, centerY - 125, "Add a thought…", 188, 100);
    addNode("note", x, centerY, "Add a thought…", 188, 100);
  });
}

function applyTemplate(templateName) {
  elements.templateDialog.close();

  if (templateName === "blank") {
    elements.emptyState.classList.add("hidden");
    showToast("Your canvas is ready");
    return;
  }

  takeSnapshot();
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  if (templateName === "mindmap") addMindMap(centerX, centerY);
  if (templateName === "flow") addProcessFlow(centerX, centerY);
  if (templateName === "brainstorm") addBrainstorm(centerX, centerY);

  renderCanvas();
  showToast("Layout added");
}

// Persistence and export ----------------------------------------------------
function buildBoardPayload() {
  return {
    version: 2,
    title: document.querySelector("#boardTitle").textContent,
    nodes: state.nodes,
    drawings: state.drawings,
    connections: state.connections,
  };
}

function applyLoadedBoard(board) {
  state.nodes = board.nodes || [];
  state.drawings = board.drawings || [];
  state.connections = board.connections || [];

  // Migrate boards created by the original prototype.
  state.nodes.forEach((node) => {
    node.width = node.width || node.w;
    node.height = node.height || node.h;
  });

  if (board.title || board.boardTitle) {
    document.querySelector("#boardTitle").textContent = board.title || board.boardTitle;
  }

  renderCanvas();
  updateWorldTransform();
}

function loadLocalBoard() {
  try {
    const savedBoard = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (savedBoard) applyLoadedBoard(savedBoard);
  } catch (error) {
    console.warn("Could not load the local canvas.", error);
  }
}

async function saveBoard({ silent = false } = {}) {
  const board = buildBoardPayload();

  // Local storage keeps the app usable if the Python server is unavailable.
  localStorage.setItem(STORAGE_KEY, JSON.stringify(board));

  try {
    const response = await fetch(`/api/boards/${DEFAULT_BOARD_ID}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(board),
    });

    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    markSaved();
    if (!silent) showToast("Saved securely to the server");
  } catch (error) {
    console.warn("Python backend unavailable; saved locally instead.", error);
    markSaved();
    if (!silent) showToast("Saved locally — server unavailable");
  }
}

async function loadBoard() {
  try {
    const response = await fetch(`/api/boards/${DEFAULT_BOARD_ID}`);
    if (response.status === 404) {
      loadLocalBoard();
      return;
    }
    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    applyLoadedBoard(await response.json());
  } catch (error) {
    console.warn("Python backend unavailable; loading local canvas.", error);
    loadLocalBoard();
  }
}

function exportBoard() {
  const board = buildBoardPayload();
  const file = new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
  const download = document.createElement("a");
  download.href = URL.createObjectURL(file);
  download.download = "ideacanvas-board.json";
  download.click();
  URL.revokeObjectURL(download.href);
  showToast("Board exported");
}

function renameBoard() {
  const titleButton = document.querySelector("#boardTitle");
  const newTitle = window.prompt("Name this canvas:", titleButton.textContent);
  if (!newTitle?.trim()) return;
  titleButton.textContent = newTitle.trim();
  markUnsaved();
}

// Input events --------------------------------------------------------------
function handleKeyDown(event) {
  if (event.target.isContentEditable) return;

  if (event.code === "Space") {
    spacePressed = true;
    elements.viewport.style.cursor = "grab";
    event.preventDefault();
    return;
  }

  const toolName = KEY_TO_TOOL[event.key.toLowerCase()];
  if (toolName) setTool(toolName);

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicateSelectedNode();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    openCanvasSearch();
  }

  if (event.key === "Delete" || event.key === "Backspace") deleteSelectedNode();

  if (event.key === "Escape") {
    interaction = null;
    setTool("select");
    renderCanvas();
  }
}

function handleKeyUp(event) {
  if (event.code !== "Space") return;
  spacePressed = false;
  setTool(state.tool);
}

// Interface events ----------------------------------------------------------
function bindInterfaceEvents() {
  queryAll(".nav-tool[data-tool]").forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });

  queryAll(".color-swatch").forEach((button) => {
    button.addEventListener("click", () => {
      state.color = button.dataset.color;
      queryAll(".color-swatch").forEach((swatch) => swatch.classList.toggle("active", swatch === button));
      applyColorToSelection(state.color);
    });
  });

  document.querySelector("#customColor").addEventListener("input", (event) => {
    state.color = event.target.value;
    queryAll(".color-swatch").forEach((swatch) => swatch.classList.remove("active"));
    applyColorToSelection(state.color);
  });

  queryAll("#strokeWidths button").forEach((button) => {
    button.addEventListener("click", () => {
      state.strokeWidth = Number(button.dataset.width);
      queryAll("#strokeWidths button").forEach((item) => item.classList.toggle("active", item === button));
    });
  });

  queryAll("[data-template]").forEach((button) => {
    button.addEventListener("click", () => applyTemplate(button.dataset.template));
  });

  document.querySelector("#undoButton").addEventListener("click", undo);
  document.querySelector("#redoButton").addEventListener("click", redo);
  document.querySelector("#saveButton").addEventListener("click", saveBoard);
  document.querySelector("#exportButton").addEventListener("click", exportBoard);
  document.querySelector("#boardTitle").addEventListener("click", renameBoard);
  document.querySelector("#gridButton").addEventListener("click", () => elements.viewport.classList.toggle("grid-off"));
  document.querySelector("#zoomInButton").addEventListener("click", () => zoomAtPoint(state.zoom + 0.1, window.innerWidth / 2, window.innerHeight / 2));
  document.querySelector("#zoomOutButton").addEventListener("click", () => zoomAtPoint(state.zoom - 0.1, window.innerWidth / 2, window.innerHeight / 2));
  document.querySelector("#fitButton").addEventListener("click", resetView);
  document.querySelector("#searchButton").addEventListener("click", openCanvasSearch);
  document.querySelector("#duplicateButton").addEventListener("click", duplicateSelectedNode);
  document.querySelector("#deleteButton").addEventListener("click", deleteSelectedNode);
  document.querySelector("#centerContentButton").addEventListener("click", centerContent);
  document.querySelector("#clearCanvasButton").addEventListener("click", clearCanvas);

  elements.searchInput.addEventListener("input", (event) => renderSearchResults(event.target.value));
  elements.searchResults.addEventListener("click", (event) => {
    const result = event.target.closest("[data-result-id]");
    if (result) focusSearchResult(result.dataset.resultId);
  });

  document.querySelector("#templateButton").addEventListener("click", () => elements.templateDialog.showModal());
  document.querySelector("#closeTemplates").addEventListener("click", () => elements.templateDialog.close());
  document.querySelector("#helpButton").addEventListener("click", () => elements.shortcutDialog.showModal());
  document.querySelector("#closeShortcuts").addEventListener("click", () => elements.shortcutDialog.close());
  document.querySelector("#collapseInspector").addEventListener("click", toggleInspector);

  elements.viewport.addEventListener("pointerdown", handlePointerDown);
  elements.viewport.addEventListener("wheel", handleWheel, { passive: false });
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  elements.world.addEventListener("dblclick", handleNodeDoubleClick);
  elements.world.addEventListener("focusout", handleNodeFocusOut);
}

function applyColorToSelection(color) {
  const selectedElement = getSelectedNodeElement();
  if (!selectedElement) return;

  const node = getNodeById(selectedElement.dataset.id);
  takeSnapshot();
  node.color = color;
  renderCanvas();
  selectNode(node.id);
}

function handleNodeDoubleClick(event) {
  const content = event.target.closest(".node")?.querySelector(".content");
  if (!content) return;
  content.contentEditable = "true";
  content.focus();
}

function handleNodeFocusOut(event) {
  if (!event.target.classList.contains("content")) return;
  const node = getNodeById(event.target.closest(".node").dataset.id);
  node.text = event.target.innerText;
  event.target.contentEditable = "false";
  markUnsaved();
}

function toggleInspector() {
  const isCollapsed = elements.inspector.classList.toggle("collapsed");
  elements.appShell.classList.toggle("inspector-closed", isCollapsed);
  document.documentElement.style.setProperty("--inspector-width", isCollapsed ? "0px" : "286px");
}

// Start ---------------------------------------------------------------------
bindInterfaceEvents();
loadBoard();
renderCanvas();
updateWorldTransform();
setTool(state.tool);
