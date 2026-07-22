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
  filesDialog: document.querySelector("#filesDialog"),
  exportDialog: document.querySelector("#exportDialog"),
  imageUploadInput: document.querySelector("#imageUploadInput"),
  fileList: document.querySelector("#fileList"),
  toolGuideIcon: document.querySelector("#toolGuideIcon"),
  toolGuideTitle: document.querySelector("#toolGuideTitle"),
  toolGuideText: document.querySelector("#toolGuideText"),
};

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "ideacanvas";
const THEME_KEY = "ideacanvas-theme";
const LOCKED_ICON = '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
const UNLOCKED_ICON = '<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="3"/><path d="M9 10V7a4 4 0 0 1 7-2.6"/></svg>';
let currentBoardId = localStorage.getItem("ideacanvas-current-board") || "default";
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
  k: "task",
  f: "frame",
};

// Application state ---------------------------------------------------------
const state = {
  tool: "select",
  zoom: 1,
  panX: 0,
  panY: 0,
  color: "#202630",
  strokeWidth: 2,
  snapToGrid: false,
  navigationLocked: true,
  fontFamily: "DM Sans",
  fontSize: 14,
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
let clipboardNode = null;
let textFitFrame = null;
let pendingAction = null;
let typographySnapshotTaken = false;
let imageReplaceTargetId = null;

// Small utilities -----------------------------------------------------------
function applyTheme(theme, { persist = true } = {}) {
  const isDark = theme === "dark";
  document.body.classList.toggle("dark-mode", isDark);
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#0d1020" : "#15122b";
  const button = document.querySelector("#themeToggleButton");
  button.setAttribute("aria-pressed", String(isDark));
  button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  button.querySelector("span").textContent = isDark ? "☀" : "☾";
  if (persist) localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  applyTheme(document.body.classList.contains("dark-mode") ? "light" : "dark");
  showToast(document.body.classList.contains("dark-mode") ? "Dark mode enabled" : "Light mode enabled");
}

function updateTypographyControls(node = null) {
  const fontSelect = document.querySelector("#fontFamilySelect");
  const sizeRange = document.querySelector("#fontSizeRange");
  const isImage = node?.type === "image";
  fontSelect.disabled = Boolean(isImage);
  sizeRange.disabled = Boolean(isImage);
  fontSelect.value = node?.fontFamily || state.fontFamily;
  sizeRange.value = node?.fontSize || state.fontSize;
  document.querySelector("#fontSizeValue").textContent = sizeRange.value + " px";
}

function applyTypography({ fontFamily = state.fontFamily, fontSize = state.fontSize, snapshot = true } = {}) {
  const selectedElement = getSelectedNodeElement();
  const node = selectedElement && getNodeById(selectedElement.dataset.id);
  state.fontFamily = fontFamily;
  state.fontSize = Number(fontSize);
  document.querySelector("#fontSizeValue").textContent = state.fontSize + " px";

  if (!node || node.type === "image") return;
  if (snapshot) takeSnapshot();
  node.fontFamily = state.fontFamily;
  node.fontSize = state.fontSize;
  selectedElement.style.setProperty("--node-font", node.fontFamily);
  selectedElement.style.setProperty("--node-font-size", node.fontSize + "px");
  scheduleTextFit();
  markUnsaved();
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readImageDimensions(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = reject;
    image.src = source;
  });
}

function openImagePicker(replaceNodeId = null) {
  imageReplaceTargetId = replaceNodeId;
  elements.imageUploadInput.click();
}

async function addImageFromFile(file) {
  if (!file) return;
  const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    elements.imageUploadInput.value = "";
    return showToast("Choose a PNG, JPG, or WebP image");
  }
  if (file.size > 3 * 1024 * 1024) {
    elements.imageUploadInput.value = "";
    return showToast("Picture must be smaller than 3 MB");
  }

  try {
    const source = await fileToDataUrl(file);
    const dimensions = await readImageDimensions(source);
    const maxWidth = 360;
    const maxHeight = 280;
    const ratio = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height, 1);
    let width = Math.round(dimensions.width * ratio);
    let height = Math.round(dimensions.height * ratio);
    const minimumScale = Math.max(120 / width, 90 / height, 1);
    width = Math.round(width * minimumScale);
    height = Math.round(height * minimumScale);
    takeSnapshot();

    const existing = imageReplaceTargetId && getNodeById(imageReplaceTargetId);
    if (existing?.type === "image") {
      existing.src = source;
      existing.alt = file.name;
      existing.text = file.name;
      existing.width = width;
      existing.height = height;
      renderCanvas();
      selectNode(existing.id);
      showToast("Picture replaced");
    } else {
      const bounds = elements.viewport.getBoundingClientRect();
      const center = screenToWorld(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
      const node = {
        id: createId(),
        type: "image",
        x: center.x - width / 2,
        y: center.y - height / 2,
        width,
        height,
        text: file.name,
        alt: file.name,
        src: source,
        color: "#6458d6",
        locked: false,
      };
      state.nodes.push(node);
      renderCanvas();
      selectNode(node.id);
      showToast("Picture added to canvas");
    }
  } catch (error) {
    showToast("This picture could not be loaded");
  } finally {
    imageReplaceTargetId = null;
    elements.imageUploadInput.value = "";
  }
}
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
  const bounds = elements.viewport.getBoundingClientRect();
  return {
    x: (clientX - bounds.left - state.panX) / state.zoom,
    y: (clientY - bounds.top - state.panY) / state.zoom,
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
  updateHistoryControls();
}

function markSaved() {
  elements.saveStatus.textContent = "All changes saved";
  document.querySelector(".status-dot").style.background = "#0f9f78";
}

function updateHistoryControls() {
  const undo = document.querySelector("#undoButton");
  const redo = document.querySelector("#redoButton");
  undo.disabled = history.length === 0;
  redo.disabled = future.length === 0;
}

// History -------------------------------------------------------------------
function serializeCanvas() {
  return JSON.stringify({
    nodes: state.nodes,
    drawings: state.drawings,
    connections: state.connections,
  });
}

function commitHistorySnapshot(snapshot) {
  history.push(snapshot);
  if (history.length > 60) history.shift();
  future = [];
  markUnsaved();
}

function takeSnapshot() {
  commitHistorySnapshot(serializeCanvas());
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

function setNavigationLocked(locked, { silent = false } = {}) {
  state.navigationLocked = locked;
  const button = document.querySelector("#navigationLockButton");
  button.classList.toggle("active", locked);
  button.setAttribute("aria-pressed", String(locked));
  button.setAttribute("aria-label", locked ? "Unlock canvas movement" : "Lock canvas movement");
  button.title = locked ? "Canvas movement is locked" : "Canvas movement is unlocked";
  button.innerHTML = locked ? LOCKED_ICON : UNLOCKED_ICON;
  if (!silent) showToast(locked ? "Canvas movement locked" : "Canvas movement unlocked");
}

function toggleNavigationLock() {
  setNavigationLocked(!state.navigationLocked);
  if (state.navigationLocked && state.tool === "hand") setTool("select");
}
function setTool(toolName) {
  state.tool = toolName;
  if (toolName === "hand" && state.navigationLocked) setNavigationLocked(false, { silent: true });

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
    task: "Task",
    frame: "Section",
  };
  elements.inspectorTitle.textContent = labels[toolName] || "Canvas";

  const guides = {
    select: ["V", "Select tool", "Your canvas stays fixed until you choose Move, Space-drag, or unlock navigation."],
    hand: ["H", "Move canvas", "Drag anywhere to navigate your planning space."],
    draw: ["P", "Pencil", "Sketch freely. Choose color and weight from the Style panel."],
    line: ["L", "Arrow", "Drag to communicate direction, sequence, or flow."],
    connector: ["C", "Connector", "Click one object, then another, to link them."],
    rect: ["R", "Rectangle", "Add a labeled step, screen, or process block."],
    ellipse: ["O", "Ellipse", "Add a goal, milestone, or central idea."],
    diamond: ["G", "Decision", "Add a branching decision to your workflow."],
    note: ["N", "Sticky note", "Capture a quick thought and edit it immediately."],
    task: ["K", "Task card", "Add an actionable item to a plan or Kanban board."],
    frame: ["F", "Section frame", "Group related objects into a named visual area."],
    text: ["T", "Text", "Add a heading, annotation, or explanation."],
  };
  const guide = guides[toolName] || guides.select;
  elements.toolGuideIcon.textContent = guide[0];
  elements.toolGuideTitle.textContent = guide[1];
  elements.toolGuideText.textContent = guide[2];
}

function clearSelection() {
  queryAll(".node.selected").forEach((node) => node.classList.remove("selected"));
  elements.selectionActions.classList.remove("visible");
  updateTypographyControls();
}

function selectNode(nodeId) {
  clearSelection();
  const nodeElement = document.querySelector(`[data-id="${nodeId}"]`);
  nodeElement?.classList.add("selected");
  elements.selectionActions.classList.toggle("visible", Boolean(nodeElement));
  const node = getNodeById(nodeId);
  if (node) {
    elements.inspectorTitle.textContent = node.type === "note" ? "Sticky note" : node.type;
    const lockButton = document.querySelector("#lockButton");
    lockButton.textContent = node.locked ? "Unlock" : "Lock";
    lockButton.setAttribute("aria-pressed", String(Boolean(node.locked)));
    updateTypographyControls(node);
  }
}

// Canvas data ---------------------------------------------------------------
function addNode(type, x, y, text, width, height, color) {
  const presets = {
    note: { width: 190, height: 132, text: "Write an idea..." },
    rect: { width: 180, height: 94, text: "Add a label" },
    ellipse: { width: 172, height: 104, text: "New thought" },
    diamond: { width: 124, height: 124, text: "Decision" },
    text: { width: 220, height: 44, text: "Start typing" },
    task: { width: 230, height: 62, text: "[ ] New task" },
    frame: { width: 430, height: 280, text: "Section" },
  };
  const preset = presets[type];

  const node = {
    id: createId(),
    type,
    x: state.snapToGrid ? Math.round(x / 16) * 16 : x,
    y: state.snapToGrid ? Math.round(y / 16) * 16 : y,
    width: width || preset.width,
    height: height || preset.height,
    text: text || preset.text,
    color: color || (type === "note" ? NOTE_COLORS[state.nodes.length % NOTE_COLORS.length] : state.color),
    fontFamily: state.fontFamily,
    fontSize: type === "text" ? Math.max(24, state.fontSize) : state.fontSize,
  };

  state.nodes.push(node);
  return node;
}

function deleteSelectedNode() {
  const selectedElement = getSelectedNodeElement();
  if (!selectedElement) return;

  const nodeId = selectedElement.dataset.id;
  const selectedNode = getNodeById(nodeId);
  if (selectedNode.locked) return showToast("Unlock this object before deleting it");
  takeSnapshot();
  state.nodes = state.nodes.filter((node) => node.id !== nodeId);
  state.connections = state.connections.filter((connection) => (
    connection.from !== nodeId && connection.to !== nodeId
  ));
  renderCanvas();
  clearSelection();
  showToast("Object deleted");
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
function renderSvgLayer() {
  queryAll(":scope > path", elements.connectionLayer).forEach((path) => path.remove());
  state.drawings.forEach(createSvgPath);
  state.connections.forEach(renderConnection);
}

function scheduleTextFit() {
  cancelAnimationFrame(textFitFrame);
  textFitFrame = requestAnimationFrame(() => {
    queryAll(".node .content", elements.world).forEach((content) => {
      if (content.isContentEditable) return;
      const nodeElement = content.closest(".node");
      const node = getNodeById(nodeElement.dataset.id);
      const canGrow = ["note", "rect", "task", "text"].includes(node.type);

      if (canGrow && content.scrollHeight > content.clientHeight + 1 && node.height < 600) {
        const nextHeight = Math.min(600, node.height + content.scrollHeight - content.clientHeight + 6);
        node.height = nextHeight;
        nodeElement.style.height = nextHeight + "px";
        renderSvgLayer();
        return;
      }

      if (!canGrow) {
        let fontSize = Number.parseFloat(getComputedStyle(content).fontSize);
        const minimumSize = node.type === "frame" ? 9 : 10;
        while ((content.scrollHeight > content.clientHeight + 1 || content.scrollWidth > content.clientWidth + 1) && fontSize > minimumSize) {
          fontSize -= 0.5;
          content.style.fontSize = fontSize + "px";
        }
        content.title = content.scrollHeight > content.clientHeight + 1 ? node.text : "";
      }
    });
  });
}
function renderCanvas() {
  queryAll(".node", elements.world).forEach((node) => node.remove());
  renderSvgLayer();

  state.nodes.forEach((node) => {
    const nodeElement = document.createElement("div");
    nodeElement.className = `node ${node.type}${node.locked ? " locked" : ""}`;
    nodeElement.dataset.id = node.id;
    nodeElement.style.cssText = [
      `left:${node.x}px`,
      `top:${node.y}px`,
      `width:${node.width}px`,
      `height:${node.height}px`,
      `--node-color:${node.color}`,
      `--node-font:${node.fontFamily || "DM Sans"}`,
      `--node-font-size:${node.fontSize || (node.type === "text" ? 25 : 14)}px`,
      node.type === "note" ? `background:${node.color}` : "",
    ].join(";");
    if (node.type === "image") {
      const image = document.createElement("img");
      image.src = node.src;
      image.alt = node.alt || "Canvas picture";
      image.draggable = false;
      nodeElement.appendChild(image);
    } else {
      nodeElement.innerHTML = `<div class="content">${escapeHtml(node.text)}</div>`;
    }
    elements.world.appendChild(nodeElement);
  });

  const hasContent = state.nodes.length > 0 || state.drawings.length > 0;
  elements.emptyState.classList.toggle("hidden", hasContent);
  scheduleTextFit();
}

function beginNodeEditing(node) {
  requestAnimationFrame(() => {
    const nodeElement = document.querySelector(`[data-id="${node.id}"]`);
    if (!nodeElement) return;

    selectNode(node.id);
    takeSnapshot();
    const content = nodeElement.querySelector(".content");
    content.contentEditable = "true";
    content.focus();
    document.execCommand("selectAll", false, null);
  });
}

// Pointer interactions ------------------------------------------------------
function beginPan(event) {
  if (state.navigationLocked) setNavigationLocked(false, { silent: true });
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
  interaction = {
    kind,
    points: [[point.x, point.y]],
    color: state.color,
    width: state.strokeWidth,
    before: serializeCanvas(),
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
    if (node.locked) {
      selectNode(node.id);
      showToast("Object is locked");
      return;
    }
    selectNode(node.id);
    interaction = {
      kind: "move",
      before: serializeCanvas(),
      moved: false,
      startClientX: event.clientX,
      startClientY: event.clientY,
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

  const nodeTools = ["note", "rect", "ellipse", "diamond", "text", "task", "frame"];
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
    if (!interaction.moved) {
      const distance = Math.hypot(event.clientX - interaction.startClientX, event.clientY - interaction.startClientY);
      if (distance < 2) return;
      interaction.moved = true;
      commitHistorySnapshot(interaction.before);
    }
    const worldPoint = screenToWorld(event.clientX, event.clientY);
    const node = getNodeById(interaction.nodeId);
    const nodeElement = document.querySelector(`[data-id="${node.id}"]`);

    const nextX = worldPoint.x - interaction.offsetX;
    const nextY = worldPoint.y - interaction.offsetY;
    node.x = state.snapToGrid ? Math.round(nextX / 16) * 16 : nextX;
    node.y = state.snapToGrid ? Math.round(nextY / 16) * 16 : nextY;

    // Update only the moving object. Rebuilding every node here continuously
    // restarted entrance animations and made the canvas appear to disappear.
    if (nodeElement) {
      nodeElement.style.left = `${node.x}px`;
      nodeElement.style.top = `${node.y}px`;
    }
    renderSvgLayer();
    return;
  }

  if (interaction.kind === "draw" || interaction.kind === "line") {
    const worldPoint = screenToWorld(event.clientX, event.clientY);
    if (interaction.kind === "draw") {
      interaction.points.push([worldPoint.x, worldPoint.y]);
    } else {
      interaction.points[1] = [worldPoint.x, worldPoint.y];
    }

    renderSvgLayer();
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
      commitHistorySnapshot(interaction.before);
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
    locked: false,
  };
  state.nodes.push(duplicate);
  renderCanvas();
  selectNode(duplicate.id);
  showToast("Object duplicated");
}

function copySelectedNode() {
  const selected = getSelectedNodeElement();
  if (!selected) return;
  const node = getNodeById(selected.dataset.id);
  clipboardNode = { ...node };
  showToast("Object copied");
}

function pasteCopiedNode() {
  if (!clipboardNode) return showToast("Copy an object first");
  takeSnapshot();
  const node = {
    ...clipboardNode,
    id: createId(),
    x: clipboardNode.x + 28,
    y: clipboardNode.y + 28,
    locked: false,
  };
  clipboardNode = { ...node };
  state.nodes.push(node);
  renderCanvas();
  selectNode(node.id);
  showToast("Object pasted");
}

async function importBoardFile(file) {
  if (!file) return;
  try {
    const board = JSON.parse(await file.text());
    if (!board || !Array.isArray(board.nodes) || !Array.isArray(board.drawings) || !Array.isArray(board.connections)) {
      throw new Error("Invalid canvas structure");
    }
    takeSnapshot();
    applyLoadedBoard(board);
    markUnsaved();
    elements.exportDialog.close();
    centerContent();
    showToast("Canvas backup imported");
  } catch (error) {
    showToast("That file is not a valid IdeaCanvas backup");
  }
}
function editSelectedNode() {
  const selected = getSelectedNodeElement();
  if (!selected) return;
  const node = getNodeById(selected.dataset.id);
  if (node.locked) return showToast("Unlock this object to edit it");
  if (node.type === "image") return openImagePicker(node.id);
  beginNodeEditing(node);
}

function toggleSelectedLock() {
  const selected = getSelectedNodeElement();
  if (!selected) return;
  const node = getNodeById(selected.dataset.id);
  takeSnapshot();
  node.locked = !node.locked;
  renderCanvas();
  selectNode(node.id);
  showToast(node.locked ? "Object locked" : "Object unlocked");
}

function moveSelectedLayer(direction) {
  const selected = getSelectedNodeElement();
  if (!selected) return;
  const index = state.nodes.findIndex((node) => node.id === selected.dataset.id);
  const target = Math.max(0, Math.min(state.nodes.length - 1, index + direction));
  if (target === index) return showToast(direction > 0 ? "Already at the front" : "Already at the back");
  takeSnapshot();
  const [node] = state.nodes.splice(index, 1);
  state.nodes.splice(target, 0, node);
  renderCanvas();
  selectNode(node.id);
  showToast(direction > 0 ? "Brought forward" : "Sent backward");
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

function openActionDialog({ title, message, value = null, confirmLabel = "Continue", danger = false }) {
  const dialog = document.querySelector("#actionDialog");
  document.querySelector("#actionDialogTitle").textContent = title;
  document.querySelector("#actionDialogMessage").textContent = message || "";
  document.querySelector("#actionDialogConfirm").textContent = confirmLabel;
  document.querySelector("#actionDialogConfirm").classList.toggle("danger", danger);
  document.querySelector("#actionDialogIcon").textContent = danger ? "!" : "✦";
  const inputWrap = document.querySelector("#actionInputWrap");
  const input = document.querySelector("#actionDialogInput");
  inputWrap.hidden = value === null;
  input.value = value ?? "";
  input.removeAttribute("aria-invalid");

  if (dialog.open) dialog.close();
  dialog.showModal();
  requestAnimationFrame(() => {
    if (value === null) document.querySelector("#actionDialogConfirm").focus();
    else {
      input.focus();
      input.select();
    }
  });

  return new Promise((resolve) => {
    pendingAction = { resolve, expectsText: value !== null };
  });
}

function finishActionDialog(confirmed) {
  if (!pendingAction) return;
  const dialog = document.querySelector("#actionDialog");
  const input = document.querySelector("#actionDialogInput");
  if (confirmed && pendingAction.expectsText && !input.value.trim()) {
    input.setAttribute("aria-invalid", "true");
    input.focus();
    return;
  }

  const result = confirmed ? (pendingAction.expectsText ? input.value.trim() : true) : null;
  const resolve = pendingAction.resolve;
  pendingAction = null;
  dialog.close();
  resolve(result);
}
async function clearCanvas() {
  if (!state.nodes.length && !state.drawings.length) return;
  const confirmed = await openActionDialog({
    title: "Clear this canvas?",
    message: "Every object will be removed. You can still restore the canvas with Undo.",
    confirmLabel: "Clear canvas",
    danger: true,
  });
  if (!confirmed) return;

  takeSnapshot();
  state.nodes = [];
  state.drawings = [];
  state.connections = [];
  interaction = null;
  clearSelection();
  renderCanvas();
  showToast("Canvas cleared - use Undo to restore it");
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
    elements.searchResults.innerHTML = `<p>No objects found for &quot;${escapeHtml(query)}&quot;.</p>`;
    return;
  }

  elements.searchResults.innerHTML = matches.map((node) => `
    <button class="search-result" data-result-id="${node.id}">
      <span class="result-icon">${node.type.slice(0, 1).toUpperCase()}</span>
      <span><b>${escapeHtml(node.text)}</b><small>${node.type}</small></span>
      <strong>?</strong>
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
  const bounds = elements.viewport.getBoundingClientRect();
  const localX = clientX - bounds.left;
  const localY = clientY - bounds.top;
  state.zoom = Math.max(0.25, Math.min(2.5, nextZoom));
  state.panX = localX - (localX - state.panX) * (state.zoom / previousZoom);
  state.panY = localY - (localY - state.panY) * (state.zoom / previousZoom);
  updateWorldTransform();
}

function zoomFromCanvasCenter(change) {
  const bounds = elements.viewport.getBoundingClientRect();
  zoomAtPoint(
    state.zoom + change,
    bounds.left + bounds.width / 2,
    bounds.top + bounds.height / 2,
  );
}
function handleWheel(event) {
  event.preventDefault();
  if (state.navigationLocked) return;

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
    addNode("note", x, centerY - 125, "Add a thought...", 188, 100);
    addNode("note", x, centerY, "Add a thought...", 188, 100);
  });
}

function addRoadmap(centerX, centerY) {
  ["Now", "Next", "Later"].forEach((period, index) => {
    const x = centerX - 430 + index * 285;
    addNode("frame", x, centerY - 185, period, 250, 350);
    addNode("task", x + 12, centerY - 120, "[ ] Key outcome", 220, 58);
    addNode("task", x + 12, centerY - 45, "[ ] Customer milestone", 220, 58);
    addNode("task", x + 12, centerY + 30, "[ ] Success measure", 220, 58);
  });
}

function addKanban(centerX, centerY) {
  ["Backlog", "In progress", "Done"].forEach((column, index) => {
    const x = centerX - 430 + index * 285;
    addNode("frame", x, centerY - 190, column, 250, 370);
    addNode("task", x + 12, centerY - 120, "[ ] Define the problem", 220, 58);
    addNode("task", x + 12, centerY - 45, "[ ] Validate the idea", 220, 58);
  });
}

function addWireframe(centerX, centerY) {
  addNode("frame", centerX - 400, centerY - 245, "Mobile app screen", 800, 490);
  addNode("rect", centerX - 370, centerY - 205, "Logo                 Menu", 740, 52, "#202630");
  addNode("text", centerX - 330, centerY - 115, "A clear product headline", 440, 48, "#202630");
  addNode("rect", centerX - 330, centerY - 48, "Primary action", 180, 54, "#6458d6");
  addNode("rect", centerX + 90, centerY - 125, "Image / prototype", 240, 210, "#9aa2ad");
  addNode("rect", centerX - 330, centerY + 95, "Feature", 180, 80, "#1778e8");
  addNode("rect", centerX - 125, centerY + 95, "Feature", 180, 80, "#0f9f78");
}
function applyTemplate(templateName) {
  elements.templateDialog.close();

  if (templateName === "blank") {
    elements.emptyState.classList.add("hidden");
    showToast("Your canvas is ready");
    return;
  }

  takeSnapshot();
  const centerX = (elements.viewport.clientWidth / 2 - state.panX) / state.zoom;
  const centerY = (elements.viewport.clientHeight / 2 - state.panY) / state.zoom;

  if (templateName === "mindmap") addMindMap(centerX, centerY);
  if (templateName === "flow") addProcessFlow(centerX, centerY);
  if (templateName === "brainstorm") addBrainstorm(centerX, centerY);
  if (templateName === "roadmap") addRoadmap(centerX, centerY);
  if (templateName === "kanban") addKanban(centerX, centerY);
  if (templateName === "wireframe") addWireframe(centerX, centerY);

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
    node.fontFamily = node.fontFamily || "DM Sans";
    node.fontSize = node.fontSize || (node.type === "text" ? 25 : 14);
  });

  if (board.title || board.boardTitle) {
    document.querySelector("#boardTitle").textContent = board.title || board.boardTitle;
  }

  renderCanvas();
  updateWorldTransform();
}

function loadLocalBoard() {
  try {
    const savedBoard = JSON.parse(localStorage.getItem(STORAGE_KEY + ":" + currentBoardId) || localStorage.getItem(STORAGE_KEY));
    if (savedBoard) applyLoadedBoard(savedBoard);
  } catch (error) {
    console.warn("Could not load the local canvas.", error);
  }
}

async function saveBoard({ silent = false } = {}) {
  const board = buildBoardPayload();

  // Local storage keeps the app usable if the Python server is unavailable.
  localStorage.setItem(STORAGE_KEY + ":" + currentBoardId, JSON.stringify(board));
  localStorage.setItem("ideacanvas-current-board", currentBoardId);

  try {
    const response = await fetch("/api/boards/" + currentBoardId, {
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
    if (!silent) showToast("Saved locally - server unavailable");
  }
}

async function loadBoard(boardId = currentBoardId) {
  currentBoardId = boardId;
  localStorage.setItem("ideacanvas-current-board", currentBoardId);
  try {
    const response = await fetch("/api/boards/" + currentBoardId);
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

function resetForNewBoard(title) {
  state.nodes = [];
  state.drawings = [];
  state.connections = [];
  history = [];
  future = [];
  document.querySelector("#boardTitle").textContent = title;
  clearSelection();
  resetView();
  renderCanvas();
  markUnsaved();
}

function createBoardId(title) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "").slice(0, 36) || "canvas";
  return slug + "-" + Date.now().toString(36);
}

async function createNewBoard() {
  const title = await openActionDialog({
    title: "Create a new canvas",
    message: "Give this workspace a short, recognizable name.",
    value: "Untitled canvas",
    confirmLabel: "Create canvas",
  });
  if (!title) return;
  await saveBoard({ silent: true });
  currentBoardId = createBoardId(title);
  localStorage.setItem("ideacanvas-current-board", currentBoardId);
  resetForNewBoard(title.trim());
  await saveBoard({ silent: true });
  elements.filesDialog.close();
  showToast("New canvas created");
}

function formatFileDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved recently";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function renderFileList(files) {
  elements.fileList.replaceChildren();
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "files-empty";
    empty.textContent = "No saved canvases yet. Create one to begin planning.";
    elements.fileList.appendChild(empty);
    return;
  }

  files.forEach((file) => {
    const card = document.createElement("article");
    card.className = "file-card" + (file.id === currentBoardId ? " current" : "");
    card.innerHTML = [
      '<button class="file-open" data-open-file="', escapeHtml(file.id), '"></button>',
      '<div class="file-preview">', escapeHtml(file.title.slice(0, 1).toUpperCase()), '</div>',
      '<div class="file-details"><span><b>', escapeHtml(file.title), '</b><small>',
      String(file.objectCount || 0), ' objects - ', formatFileDate(file.updatedAt),
      '</small></span><button class="file-delete" data-delete-file="', escapeHtml(file.id), '">x</button></div>',
    ].join("");
    elements.fileList.appendChild(card);
  });
}

async function openFiles() {
  if (!elements.filesDialog.open) elements.filesDialog.showModal();
  elements.fileList.innerHTML = '<p class="files-loading">Loading your saved canvases...</p>';
  try {
    const response = await fetch("/api/boards");
    if (!response.ok) throw new Error("Unable to load files");
    renderFileList((await response.json()).boards);
  } catch (error) {
    const localBoard = JSON.parse(localStorage.getItem(STORAGE_KEY + ":" + currentBoardId) || "null");
    renderFileList(localBoard ? [{ id: currentBoardId, title: localBoard.title || "Current canvas", objectCount: localBoard.nodes.length, updatedAt: new Date() }] : []);
  }
}

async function openFile(boardId) {
  if (boardId === currentBoardId) return elements.filesDialog.close();
  await saveBoard({ silent: true });
  await loadBoard(boardId);
  elements.filesDialog.close();
  showToast("Canvas opened");
}

async function deleteFile(boardId) {
  if (boardId === currentBoardId) return showToast("Open another canvas before deleting this one");
  const confirmed = await openActionDialog({
    title: "Delete this canvas?",
    message: "This saved canvas will be permanently removed.",
    confirmLabel: "Delete canvas",
    danger: true,
  });
  if (!confirmed) return;
  try {
    const response = await fetch("/api/boards/" + boardId, { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error("Delete failed");
  } catch (error) {
    console.warn("Server delete unavailable; removing the local copy.", error);
  }
  localStorage.removeItem(STORAGE_KEY + ":" + boardId);
  await openFiles();
  showToast("Canvas deleted");
}
function exportFile(blob, extension) {
  const title = document.querySelector("#boardTitle").textContent;
  const fileName = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ideacanvas";
  const download = document.createElement("a");
  download.href = URL.createObjectURL(blob);
  download.download = fileName + "." + extension;
  download.click();
  setTimeout(() => URL.revokeObjectURL(download.href), 500);
}

function exportBoard() {
  elements.exportDialog.showModal();
}

function exportJson() {
  exportFile(new Blob([JSON.stringify(buildBoardPayload(), null, 2)], { type: "application/json" }), "json");
  elements.exportDialog.close();
  showToast("Editable canvas data exported");
}

function getExportBounds() {
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  state.nodes.forEach((node) => {
    bounds.left = Math.min(bounds.left, node.x);
    bounds.top = Math.min(bounds.top, node.y);
    bounds.right = Math.max(bounds.right, node.x + node.width);
    bounds.bottom = Math.max(bounds.bottom, node.y + node.height);
  });
  state.drawings.forEach((drawing) => {
    const values = (drawing.path.match(/-?d+(?:.d+)?/g) || []).map(Number);
    for (let index = 0; index < values.length - 1; index += 2) {
      bounds.left = Math.min(bounds.left, values[index]);
      bounds.top = Math.min(bounds.top, values[index + 1]);
      bounds.right = Math.max(bounds.right, values[index]);
      bounds.bottom = Math.max(bounds.bottom, values[index + 1]);
    }
  });
  return Number.isFinite(bounds.left) ? bounds : { left: 0, top: 0, right: 1200, bottom: 800 };
}

function buildExportSvg() {
  const bounds = getExportBounds();
  const padding = 72;
  const width = Math.max(320, bounds.right - bounds.left + padding * 2);
  const height = Math.max(240, bounds.bottom - bounds.top + padding * 2);
  const offsetX = padding - bounds.left;
  const offsetY = padding - bounds.top;
  const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">',
    '<rect width="100%" height="100%" fill="#f7f7fc"/>',
    '<defs><marker id="export-arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0 0L0 6L9 3z" fill="context-stroke"/></marker></defs>',
    '<g transform="translate(' + offsetX + ' ' + offsetY + ')" font-family="Arial, sans-serif">',
  ];

  state.drawings.forEach((drawing) => {
    parts.push('<path d="' + drawing.path + '" fill="none" stroke="' + (drawing.color || "#202630") + '" stroke-width="' + (drawing.width || 2) + '" stroke-linecap="round" stroke-linejoin="round"' + (drawing.arrow ? ' marker-end="url(#export-arrow)"' : '') + '/>');
  });

  state.connections.forEach((connection) => {
    const start = getNodeById(connection.from);
    const end = getNodeById(connection.to);
    if (!start || !end) return;
    const x1 = start.x + start.width / 2;
    const y1 = start.y + start.height / 2;
    const x2 = end.x + end.width / 2;
    const y2 = end.y + end.height / 2;
    const curve = Math.max(45, Math.abs(x2 - x1) * .45);
    parts.push('<path d="M' + x1 + ' ' + y1 + ' C' + (x1 + curve) + ' ' + y1 + ',' + (x2 - curve) + ' ' + y2 + ',' + x2 + ' ' + y2 + '" fill="none" stroke="' + (connection.color || "#6458d6") + '" stroke-width="2" marker-end="url(#export-arrow)"/>');
  });

  state.nodes.forEach((node) => {
    const text = escapeHtml(node.text).replace(/\s+/g, " ");
    if (node.type === "image") {
      parts.push('<image href="' + node.src + '" x="' + node.x + '" y="' + node.y + '" width="' + node.width + '" height="' + node.height + '" preserveAspectRatio="xMidYMid meet"/>');
      return;
    }
    if (node.type === "ellipse") {
      parts.push('<ellipse cx="' + (node.x + node.width / 2) + '" cy="' + (node.y + node.height / 2) + '" rx="' + (node.width / 2) + '" ry="' + (node.height / 2) + '" fill="#fff" stroke="' + node.color + '" stroke-width="2"/>');
    } else if (node.type === "diamond") {
      parts.push('<rect x="' + node.x + '" y="' + node.y + '" width="' + node.width + '" height="' + node.height + '" rx="7" fill="#fff" stroke="' + node.color + '" stroke-width="2" transform="rotate(45 ' + (node.x + node.width / 2) + ' ' + (node.y + node.height / 2) + ')"/>');
    } else if (node.type !== "text") {
      const fill = node.type === "note" ? node.color : "#ffffff";
      const dash = node.type === "frame" ? ' stroke-dasharray="8 6"' : "";
      parts.push('<rect x="' + node.x + '" y="' + node.y + '" width="' + node.width + '" height="' + node.height + '" rx="10" fill="' + fill + '" stroke="' + node.color + '" stroke-width="2"' + dash + '/>');
    }
    const fontSize = node.fontSize || (node.type === "text" ? 25 : 14);
    const weight = node.type === "text" ? 700 : 600;
    parts.push('<text x="' + (node.x + node.width / 2) + '" y="' + (node.y + node.height / 2 + fontSize / 3) + '" fill="#202630" font-size="' + fontSize + '" font-family="' + (node.fontFamily || "DM Sans") + '" font-weight="' + weight + '" text-anchor="middle">' + text + '</text>');
  });

  parts.push("</g></svg>");
  return { source: parts.join(""), width, height };
}

function exportSvg() {
  const svg = buildExportSvg();
  exportFile(new Blob([svg.source], { type: "image/svg+xml;charset=utf-8" }), "svg");
  elements.exportDialog.close();
  showToast("Scalable SVG exported");
}

function exportPng() {
  const svg = buildExportSvg();
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg.source], { type: "image/svg+xml;charset=utf-8" }));
  image.onload = () => {
    const scale = Math.min(2, 8192 / Math.max(svg.width, svg.height));
    const canvas = document.createElement("canvas");
    canvas.width = svg.width * scale;
    canvas.height = svg.height * scale;
    const context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) exportFile(blob, "png");
      URL.revokeObjectURL(url);
    }, "image/png");
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    showToast("PNG export could not be generated");
  };
  image.src = url;
  elements.exportDialog.close();
  showToast("High-resolution PNG exported");
}

function toggleSnapGrid() {
  state.snapToGrid = !state.snapToGrid;
  const button = document.querySelector("#snapGridButton");
  button.setAttribute("aria-pressed", String(state.snapToGrid));
  elements.viewport.classList.toggle("snap-active", state.snapToGrid);
  showToast(state.snapToGrid ? "Snap to grid enabled" : "Snap to grid disabled");
}

function toggleFocusMode() {
  const enabled = document.body.classList.toggle("focus-mode");
  document.querySelector("#focusModeButton").setAttribute("aria-pressed", String(enabled));
  if (enabled) elements.inspector.classList.remove("mobile-open");
  showToast(enabled ? "Focus mode enabled — press Esc to exit" : "Focus mode disabled");
}

async function presentCanvas() {
  document.body.classList.add("focus-mode");
  try {
    if (!document.documentElement.requestFullscreen) throw new Error("Fullscreen unavailable");
    await document.documentElement.requestFullscreen();
    showToast("Presentation mode started");
  } catch (error) {
    document.body.classList.remove("focus-mode");
    showToast("Fullscreen is not supported in this browser");
  }
}

async function renameBoard() {
  const titleButton = document.querySelector("#boardTitle");
  const newTitle = await openActionDialog({
    title: "Rename this canvas",
    message: "Choose a name that will be easy to find later.",
    value: titleButton.textContent,
    confirmLabel: "Save name",
  });
  if (!newTitle) return;
  titleButton.textContent = newTitle;
  markUnsaved();
  showToast("Canvas renamed");
}

// Input events --------------------------------------------------------------
function handleKeyDown(event) {
  const isFormField = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
  if (event.target.isContentEditable) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.target.blur();
      clearSelection();
    }
    return;
  }
  if (isFormField) return;

  if (event.code === "Space") {
    spacePressed = true;
    elements.viewport.style.cursor = "grab";
    event.preventDefault();
    return;
  }

  const toolName = KEY_TO_TOOL[event.key.toLowerCase()];
  if (toolName && !event.ctrlKey && !event.metaKey && !event.altKey) setTool(toolName);

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
    event.preventDefault();
    copySelectedNode();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
    event.preventDefault();
    pasteCopiedNode();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
    event.preventDefault();
    duplicateSelectedNode();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
    event.preventDefault();
    openCanvasSearch();
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveBoard();
  }

  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    const selected = getSelectedNodeElement();
    const node = selected && getNodeById(selected.dataset.id);
    if (node && !node.locked) {
      event.preventDefault();
      takeSnapshot();
      const step = event.shiftKey ? 10 : 1;
      if (event.key === "ArrowUp") node.y -= step;
      if (event.key === "ArrowDown") node.y += step;
      if (event.key === "ArrowLeft") node.x -= step;
      if (event.key === "ArrowRight") node.x += step;
      renderCanvas();
      selectNode(node.id);
    }
  }

  if (event.key === "Delete" || event.key === "Backspace") deleteSelectedNode();

  if (event.key === "Escape") {
    document.body.classList.remove("focus-mode");
    document.querySelector("#focusModeButton").setAttribute("aria-pressed", "false");
    elements.inspector.classList.remove("mobile-open");
    document.querySelector("#mobileInspectorButton").setAttribute("aria-expanded", "false");
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
  queryAll(".nav-tool").forEach((button) => {
    if (!button.getAttribute("aria-label") && button.dataset.label) button.setAttribute("aria-label", button.dataset.label);
  });

  queryAll(".nav-tool[data-tool]").forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.tool));
  });

  queryAll(".color-swatch").forEach((button) => {
    button.setAttribute("aria-label", "Use color " + button.dataset.color);
    button.addEventListener("click", () => {
      state.color = button.dataset.color;
      queryAll(".color-swatch").forEach((swatch) => swatch.classList.toggle("active", swatch === button));
      applyColorToSelection(state.color);
    });
  });

  document.querySelector(".custom-color").setAttribute("aria-label", "Choose a custom color");
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

  document.querySelector("#themeToggleButton").addEventListener("click", toggleTheme);
  document.querySelector("#addImageButton").addEventListener("click", () => openImagePicker());
  document.querySelector("#inspectorImageButton").addEventListener("click", () => openImagePicker());
  elements.imageUploadInput.addEventListener("change", (event) => addImageFromFile(event.target.files[0]));

  document.querySelector("#fontFamilySelect").addEventListener("change", (event) => {
    applyTypography({ fontFamily: event.target.value, snapshot: true });
  });
  const fontSizeRange = document.querySelector("#fontSizeRange");
  fontSizeRange.addEventListener("pointerdown", () => { typographySnapshotTaken = false; });
  fontSizeRange.addEventListener("input", (event) => {
    const selected = getSelectedNodeElement();
    if (selected && !typographySnapshotTaken) {
      takeSnapshot();
      typographySnapshotTaken = true;
    }
    applyTypography({ fontSize: event.target.value, snapshot: false });
  });
  fontSizeRange.addEventListener("change", () => { typographySnapshotTaken = false; });

  document.querySelector("#undoButton").addEventListener("click", undo);
  document.querySelector("#redoButton").addEventListener("click", redo);
  document.querySelector("#saveButton").addEventListener("click", saveBoard);
  document.querySelector("#exportButton").addEventListener("click", exportBoard);
  document.querySelector("#closeExport").addEventListener("click", () => elements.exportDialog.close());
  document.querySelector("#importBoardButton").addEventListener("click", () => document.querySelector("#importBoardInput").click());
  document.querySelector("#importBoardInput").addEventListener("change", (event) => {
    importBoardFile(event.target.files[0]);
    event.target.value = "";
  });
  queryAll("[data-export]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.export === "json") exportJson();
      if (button.dataset.export === "svg") exportSvg();
      if (button.dataset.export === "png") exportPng();
    });
  });
  document.querySelector("#snapGridButton").addEventListener("click", toggleSnapGrid);
  document.querySelector("#focusModeButton").addEventListener("click", toggleFocusMode);
  document.querySelector("#presentButton").addEventListener("click", presentCanvas);
  document.querySelector("#boardTitle").addEventListener("click", renameBoard);
  document.querySelector("#gridButton").addEventListener("click", (event) => {
    const isOff = elements.viewport.classList.toggle("grid-off");
    event.currentTarget.setAttribute("aria-pressed", String(!isOff));
  });
  document.querySelector("#navigationLockButton").addEventListener("click", toggleNavigationLock);
  document.querySelector("#zoomInButton").addEventListener("click", () => zoomFromCanvasCenter(0.1));
  document.querySelector("#zoomOutButton").addEventListener("click", () => zoomFromCanvasCenter(-0.1));
  document.querySelector("#fitButton").addEventListener("click", centerContent);
  document.querySelector("#searchButton").addEventListener("click", openCanvasSearch);
  document.querySelector("#editButton").addEventListener("click", editSelectedNode);
  document.querySelector("#duplicateButton").addEventListener("click", duplicateSelectedNode);
  document.querySelector("#lockButton").addEventListener("click", toggleSelectedLock);
  document.querySelector("#sendBackButton").addEventListener("click", () => moveSelectedLayer(-1));
  document.querySelector("#bringFrontButton").addEventListener("click", () => moveSelectedLayer(1));
  document.querySelector("#deleteButton").addEventListener("click", deleteSelectedNode);
  document.querySelector("#centerContentButton").addEventListener("click", centerContent);
  document.querySelector("#clearCanvasButton").addEventListener("click", clearCanvas);
  document.querySelector("#filesButton").addEventListener("click", openFiles);
  document.querySelector("#sidebarFilesButton").addEventListener("click", openFiles);
  document.querySelector(".brand-mark").addEventListener("click", (event) => {
    event.preventDefault();
    resetView();
    clearSelection();
    showToast("View reset");
  });
  document.querySelector("#sidebarNewButton").addEventListener("click", createNewBoard);
  document.querySelector("#newBoardButton").addEventListener("click", createNewBoard);
  document.querySelector("#closeFiles").addEventListener("click", () => elements.filesDialog.close());
  document.querySelector("#actionDialogForm").addEventListener("submit", (event) => {
    event.preventDefault();
    finishActionDialog(true);
  });
  document.querySelector("#actionDialogCancel").addEventListener("click", () => finishActionDialog(false));
  document.querySelector("#actionDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    finishActionDialog(false);
  });
  document.querySelector("#actionDialog").addEventListener("close", () => {
    if (pendingAction) {
      const resolve = pendingAction.resolve;
      pendingAction = null;
      resolve(null);
    }
  });

  elements.fileList.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-file]");
    const deleteButton = event.target.closest("[data-delete-file]");
    if (openButton) openFile(openButton.dataset.openFile);
    if (deleteButton) deleteFile(deleteButton.dataset.deleteFile);
  });

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
  document.querySelector("#sidebarToggleButton").addEventListener("click", toggleSidebar);
  document.querySelector("#mobileInspectorButton").addEventListener("click", toggleInspector);
    window.addEventListener("resize", syncPanelState);

  elements.viewport.addEventListener("dragover", (event) => {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    elements.viewport.classList.add("file-dragging");
  });
  elements.viewport.addEventListener("dragleave", () => elements.viewport.classList.remove("file-dragging"));
  elements.viewport.addEventListener("drop", (event) => {
    event.preventDefault();
    elements.viewport.classList.remove("file-dragging");
    const file = event.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) addImageFromFile(file);
    else importBoardFile(file);
  });
  elements.viewport.addEventListener("pointerdown", handlePointerDown);
  elements.viewport.addEventListener("wheel", handleWheel, { passive: false });
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", handlePointerUp);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  queryAll("dialog").forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
      document.body.classList.remove("focus-mode");
      document.querySelector("#focusModeButton").setAttribute("aria-pressed", "false");
    }
  });

  elements.world.addEventListener("dblclick", handleNodeDoubleClick);
  elements.world.addEventListener("input", handleNodeInput);
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
  const node = getNodeById(content.closest(".node").dataset.id);
  if (node.locked) return showToast("Unlock this object to edit it");
  takeSnapshot();
  content.contentEditable = "true";
  content.focus();
}

function handleNodeInput(event) {
  if (!event.target.classList.contains("content")) return;
  const nodeElement = event.target.closest(".node");
  const node = getNodeById(nodeElement.dataset.id);
  node.text = event.target.innerText;
  const growableTypes = ["note", "rect", "task", "text"];

  if (growableTypes.includes(node.type)) {
    requestAnimationFrame(() => {
      const requiredHeight = Math.min(600, Math.max(node.height, event.target.scrollHeight + 4));
      if (requiredHeight > node.height + 1) {
        node.height = requiredHeight;
        nodeElement.style.height = requiredHeight + "px";
        renderSvgLayer();
      }
    });
  }

  markUnsaved();
}
function handleNodeFocusOut(event) {
  if (!event.target.classList.contains("content")) return;
  const node = getNodeById(event.target.closest(".node").dataset.id);
  node.text = event.target.innerText;
  event.target.contentEditable = "false";
  markUnsaved();
}

function toggleSidebar() {
  if (window.matchMedia("(max-width: 980px)").matches) return;
  const isCompact = elements.appShell.classList.toggle("sidebar-compact");
  const button = document.querySelector("#sidebarToggleButton");
  button.setAttribute("aria-pressed", String(isCompact));
  button.setAttribute("aria-label", isCompact ? "Expand sidebar" : "Collapse sidebar");
  button.innerHTML = isCompact ? "&#8250;" : "&#8249;";
}

function syncPanelState() {
  const isMobile = window.matchMedia("(max-width: 980px)").matches;
  const button = document.querySelector("#mobileInspectorButton");
  if (isMobile) {
    elements.inspector.classList.remove("collapsed");
    elements.appShell.classList.remove("inspector-closed");
    document.documentElement.style.setProperty("--inspector-width", "0px");
    button.setAttribute("aria-expanded", String(elements.inspector.classList.contains("mobile-open")));
  } else {
    elements.inspector.classList.remove("mobile-open");
    const isOpen = !elements.inspector.classList.contains("collapsed");
    document.documentElement.style.setProperty("--inspector-width", isOpen ? "286px" : "0px");
    button.setAttribute("aria-expanded", String(isOpen));
  }
}
function toggleInspector() {
  const mobileButton = document.querySelector("#mobileInspectorButton");
  if (window.matchMedia("(max-width: 980px)").matches) {
    const isOpen = elements.inspector.classList.toggle("mobile-open");
    mobileButton.setAttribute("aria-expanded", String(isOpen));
    mobileButton.setAttribute("aria-label", isOpen ? "Close style panel" : "Open style panel");
    return;
  }

  const isCollapsed = elements.inspector.classList.toggle("collapsed");
  elements.appShell.classList.toggle("inspector-closed", isCollapsed);
  document.documentElement.style.setProperty("--inspector-width", isCollapsed ? "0px" : "286px");
  mobileButton.setAttribute("aria-expanded", String(!isCollapsed));
  mobileButton.setAttribute("aria-label", isCollapsed ? "Open style panel" : "Close style panel");
}

// Start ---------------------------------------------------------------------
const initialTheme = localStorage.getItem(THEME_KEY) || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
applyTheme(initialTheme, { persist: false });
updateTypographyControls();
bindInterfaceEvents();
loadBoard();
renderCanvas();
updateWorldTransform();
setTool(state.tool);
updateHistoryControls();

syncPanelState();
setNavigationLocked(true, { silent: true });
