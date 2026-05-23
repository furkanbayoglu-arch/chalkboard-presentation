const templates = {
  default: `# Baslik
Bugun birlikte yeni bir fikri anlatacagiz.
Her cumle tahtaya yavas yavas yazilacak.

[u]Onemli not:[/u] Satir bitince metin otomatik olarak alta iner.

---
# Ikinci Slayt
[sari]Renkli vurgu[/sari], [mavi]notlar[/mavi] ve [c]dairenin icine alma[/c] efektleri de var.

---
# Son
Metnini degistir, hizi ayarla ve yeniden oynat.`,
  math: `# Pisagor Teoremi
Bir dik ucgende:
[u]a² + b² = c²[/u]

[sari]Hipotenus[/sari], dik acinin karsisindaki en uzun kenardir.

---
# Kucuk Ornek
Eger a = 3 ve b = 4 ise:
[c]c = 5[/c]

---
# Ozet
Kenarlar arasindaki iliski sayesinde eksik uzunlugu buluruz.`,
  story: `# Kucuk Bir Hikaye
Bir sabah eski sinifin kapisi acildi.
Tahtanin ustunde tek bir cumle vardi:
[c]Bugun hayal gucun yazacak.[/c]

---
# Devam
Ogretmen gelmeden herkes sirayla tahtaya bir kelime ekledi.
Sonunda sinifin kendi masali olustu.`
};

const COLOR_CLASS_MAP = {
  "color-sari": "#ffe070",
  "color-mavi": "#8bd2ff",
  "color-pembe": "#ffb5df",
  "color-yesil": "#b8f3b5"
};

const THEME_SURFACES = {
  green: "#284d3d",
  black: "#1c1f22",
  white: "#f7f7f2"
};

const board = document.getElementById("board");
const boardContent = document.getElementById("boardContent");
const drawingCanvas = document.getElementById("drawingCanvas");
const slideInput = document.getElementById("slideInput");
const slideIndicator = document.getElementById("slideIndicator");
const statusChip = document.getElementById("statusChip");
const chalkCursor = document.getElementById("chalkCursor");
const miniType = document.getElementById("miniType");
const startFromWelcome = document.getElementById("startFromWelcome");
const playButton = document.getElementById("playPresentation");
const nextButton = document.getElementById("nextSlide");
const prevButton = document.getElementById("prevSlide");
const replayButton = document.getElementById("replaySlide");
const clearButton = document.getElementById("clearBoard");
const boardTheme = document.getElementById("boardTheme");
const chalkColor = document.getElementById("chalkColor");
const speedControl = document.getElementById("speedControl");
const fontChoice = document.getElementById("fontChoice");
const drawingToggle = document.getElementById("drawingToggle");
const clearDrawingButton = document.getElementById("clearDrawing");
const brushSizeInput = document.getElementById("brushSize");
const exportButton = document.getElementById("exportVideo");
const exportFormat = document.getElementById("exportFormat");
const toolButtons = [...document.querySelectorAll(".tool-button")];
const toolbarButtons = [...document.querySelectorAll(".toolbar button")];
const templateButtons = [...document.querySelectorAll("[data-template]")];
const drawingContext = drawingCanvas.getContext("2d");

const state = {
  slideIndex: 0,
  slides: [],
  isTyping: false,
  typingRunId: 0,
  drawings: [],
  isDrawingMode: false,
  isPointerDown: false,
  currentPath: null,
  exportInProgress: false,
  currentTool: "chalk"
};

const miniDemoText = "Merhaba!\nBu tahta senin yazdiklarini\nadim adim canlandirir.";

function parseSlides(source) {
  return source
    .split(/\n\s*---\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function ensureDrawingSlots() {
  state.drawings.length = state.slides.length;
  state.drawings = state.drawings.map((entry) => entry || []);
}

function parseInline(text) {
  const tagMap = {
    u: "underline",
    c: "circle",
    sari: "color-sari",
    mavi: "color-mavi",
    pembe: "color-pembe",
    yesil: "color-yesil"
  };

  const root = { className: "", children: [] };
  const stack = [root];
  const regex = /\[(\/?)(u|c|sari|mavi|pembe|yesil)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text))) {
    const plain = text.slice(lastIndex, match.index);
    if (plain) {
      stack[stack.length - 1].children.push(plain);
    }

    const isClosing = match[1] === "/";
    const tagName = match[2];

    if (isClosing) {
      if (stack.length > 1) {
        stack.pop();
      }
    } else {
      const node = { className: tagMap[tagName], children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    }

    lastIndex = regex.lastIndex;
  }

  const tail = text.slice(lastIndex);
  if (tail) {
    stack[stack.length - 1].children.push(tail);
  }

  return root.children;
}

function renderNode(node, target) {
  if (typeof node === "string") {
    for (const char of node) {
      const span = document.createElement("span");
      span.className = "token";
      span.dataset.char = char === "\n" ? "newline" : "char";
      span.textContent = char;
      span.style.opacity = "0";
      target.appendChild(span);
    }
    return;
  }

  const span = document.createElement("span");
  span.className = node.className;
  target.appendChild(span);
  node.children.forEach((child) => renderNode(child, span));
}

function buildSlideMarkup(slideText) {
  boardContent.innerHTML = "";
  const lines = slideText.split("\n");

  lines.forEach((line) => {
    const lineNode = document.createElement("div");
    lineNode.className = "line";
    if (line.startsWith("# ")) {
      const title = document.createElement("span");
      title.className = "title";
      parseInline(line.slice(2)).forEach((node) => renderNode(node, title));
      lineNode.appendChild(title);
    } else if (line.length > 0) {
      parseInline(line).forEach((node) => renderNode(node, lineNode));
    } else {
      lineNode.innerHTML = "&nbsp;";
    }
    boardContent.appendChild(lineNode);
  });
}

function getVisibleTokens() {
  return [...boardContent.querySelectorAll(".token")];
}

function updateCursorNearToken(token) {
  const boardRect = board.getBoundingClientRect();
  const tokenRect = token.getBoundingClientRect();
  const left = tokenRect.left - boardRect.left + tokenRect.width + 6;
  const top = tokenRect.top - boardRect.top + tokenRect.height * 0.68;
  chalkCursor.style.left = `${left}px`;
  chalkCursor.style.top = `${top}px`;
}

function setStatus(text) {
  statusChip.textContent = text;
}

function updateSlideIndicator() {
  const total = state.slides.length || 1;
  slideIndicator.textContent = `Slayt ${state.slideIndex + 1} / ${total}`;
}

function syncCanvasResolution() {
  const rect = board.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  drawingCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  drawingCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  drawingCanvas.style.width = `${rect.width}px`;
  drawingCanvas.style.height = `${rect.height}px`;
  drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  redrawCurrentSlideDrawing();
}

function applyBoardTheme() {
  board.classList.remove("board-green", "board-black", "board-white");
  board.classList.add(`board-${boardTheme.value}`);
  board.style.setProperty("--board-text", chalkColor.value);
  board.style.setProperty("--board-font", `"${fontChoice.value}", cursive`);
  chalkCursor.style.background = chalkColor.value;
  redrawCurrentSlideDrawing();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function typeCurrentSlide() {
  if (!state.slides.length) {
    return;
  }

  state.typingRunId += 1;
  const runId = state.typingRunId;
  state.isTyping = true;
  setStatus("Yaziyor");
  chalkCursor.classList.add("visible");

  buildSlideMarkup(state.slides[state.slideIndex]);
  updateSlideIndicator();
  applyBoardTheme();

  const tokens = getVisibleTokens();
  const baseSpeed = 110 - Number(speedControl.value);

  for (const token of tokens) {
    if (runId !== state.typingRunId) {
      return;
    }

    token.style.opacity = "1";
    updateCursorNearToken(token);

    if (token.dataset.char === "newline") {
      await delay(baseSpeed + 80);
      continue;
    }

    const wobble = Math.floor(Math.random() * 30);
    await delay(Math.max(12, baseSpeed + wobble));
  }

  chalkCursor.classList.remove("visible");
  state.isTyping = false;
  setStatus(state.isDrawingMode ? "Cizim modu acik" : "Hazir");
}

function loadSlidesAndPlay() {
  state.slides = parseSlides(slideInput.value);
  if (!state.slides.length) {
    state.slides = [templates.default];
    slideInput.value = templates.default;
  }
  if (state.slideIndex > state.slides.length - 1) {
    state.slideIndex = 0;
  }
  ensureDrawingSlots();
  typeCurrentSlide();
}

function clearBoard() {
  state.typingRunId += 1;
  state.isTyping = false;
  boardContent.innerHTML = "";
  chalkCursor.classList.remove("visible");
  setStatus("Temiz");
}

function clearCurrentDrawing() {
  if (!state.drawings[state.slideIndex]) {
    return;
  }
  state.drawings[state.slideIndex] = [];
  redrawCurrentSlideDrawing();
}

function moveSlide(direction) {
  if (!state.slides.length) {
    state.slides = parseSlides(slideInput.value);
    ensureDrawingSlots();
  }
  if (!state.slides.length) {
    return;
  }
  state.slideIndex = (state.slideIndex + direction + state.slides.length) % state.slides.length;
  typeCurrentSlide();
}

function wrapSelection(openTag, closeTag) {
  const start = slideInput.selectionStart;
  const end = slideInput.selectionEnd;
  const selected = slideInput.value.slice(start, end);
  const replacement = `${openTag}${selected}${closeTag}`;
  slideInput.setRangeText(replacement, start, end, "end");
  slideInput.focus();
}

function startMiniDemo() {
  let index = 0;
  miniType.textContent = "";

  function tick() {
    if (index > miniDemoText.length) {
      setTimeout(() => {
        index = 0;
        miniType.textContent = "";
        tick();
      }, 1400);
      return;
    }
    miniType.textContent = miniDemoText.slice(0, index);
    index += 1;
    setTimeout(tick, 56 + Math.random() * 28);
  }

  tick();
}

function getCanvasPoint(event) {
  const rect = drawingCanvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function drawArrowHead(ctx, from, to, lineWidth) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const headLength = Math.max(12, lineWidth * 3.2);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle - Math.PI / 7),
    to.y - headLength * Math.sin(angle - Math.PI / 7)
  );
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLength * Math.cos(angle + Math.PI / 7),
    to.y - headLength * Math.sin(angle + Math.PI / 7)
  );
  ctx.stroke();
}

function drawStrokeEntry(ctx, entry, options = {}) {
  if (!entry || entry.points.length < 2) {
    return;
  }

  const scaleX = options.scaleX || 1;
  const scaleY = options.scaleY || 1;
  const lineWidth = entry.size * (options.scaleStroke || 1);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = entry.color;
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = lineWidth;
  if (entry.mode === "erase") {
    ctx.globalCompositeOperation = "destination-out";
  }
  ctx.beginPath();
  ctx.moveTo(entry.points[0].x * scaleX, entry.points[0].y * scaleY);

  for (let index = 1; index < entry.points.length; index += 1) {
    const point = entry.points[index];
    ctx.lineTo(point.x * scaleX, point.y * scaleY);
  }

  ctx.stroke();
  ctx.restore();
}

function drawShapeEntry(ctx, entry, options = {}) {
  if (!entry || !entry.start || !entry.end) {
    return;
  }

  const scaleX = options.scaleX || 1;
  const scaleY = options.scaleY || 1;
  const scaleStroke = options.scaleStroke || 1;
  const start = { x: entry.start.x * scaleX, y: entry.start.y * scaleY };
  const end = { x: entry.end.x * scaleX, y: entry.end.y * scaleY };
  const width = end.x - start.x;
  const height = end.y - start.y;

  ctx.save();
  ctx.strokeStyle = entry.color;
  ctx.lineWidth = entry.size * scaleStroke;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (entry.type === "rectangle") {
    ctx.strokeRect(start.x, start.y, width, height);
  } else if (entry.type === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(
      start.x + width / 2,
      start.y + height / 2,
      Math.abs(width / 2),
      Math.abs(height / 2),
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  } else if (entry.type === "arrow") {
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    drawArrowHead(ctx, start, end, entry.size * scaleStroke);
  }

  ctx.restore();
}

function drawEntryOnContext(ctx, entry, options = {}) {
  if (!entry) {
    return;
  }

  if (entry.type === "stroke") {
    drawStrokeEntry(ctx, entry, options);
    return;
  }

  drawShapeEntry(ctx, entry, options);
}

function renderEntriesOnContext(ctx, entries, options = {}) {
  entries.forEach((entry) => drawEntryOnContext(ctx, entry, options));
}

function redrawCurrentSlideDrawing() {
  const rect = drawingCanvas.getBoundingClientRect();
  drawingContext.clearRect(0, 0, rect.width, rect.height);
  const drawing = state.drawings[state.slideIndex] || [];
  renderEntriesOnContext(drawingContext, drawing);
  if (
    state.currentPath &&
    state.currentPath.slideIndex === state.slideIndex &&
    state.currentPath.type !== "stroke"
  ) {
    drawEntryOnContext(drawingContext, state.currentPath);
  }
}

function setDrawingMode(enabled) {
  state.isDrawingMode = enabled;
  drawingToggle.textContent = enabled ? "Cizim Modu: Acik" : "Cizim Modu";
  drawingToggle.classList.toggle("is-active", enabled);
  board.classList.toggle("drawing-enabled", enabled);
  setStatus(enabled ? "Cizim modu acik" : "Hazir");
}

function setCurrentTool(tool) {
  state.currentTool = tool;
  toolButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tool === tool);
  });
}

function beginDrawing(event) {
  if (!state.isDrawingMode || state.exportInProgress) {
    return;
  }

  event.preventDefault();
  const point = getCanvasPoint(event);
  state.isPointerDown = true;
  const isStrokeTool = state.currentTool === "chalk" || state.currentTool === "eraser";
  const entry = isStrokeTool ? {
    type: "stroke",
    color: chalkColor.value,
    size: Number(brushSizeInput.value),
    mode: state.currentTool === "eraser" ? "erase" : "draw",
    points: [point]
  } : {
    type: state.currentTool,
    color: chalkColor.value,
    size: Number(brushSizeInput.value),
    start: point,
    end: point
  };

  entry.slideIndex = state.slideIndex;
  state.currentPath = entry;
  if (isStrokeTool) {
    state.drawings[state.slideIndex].push(entry);
  }
}

function moveDrawing(event) {
  if (!state.isPointerDown || !state.currentPath) {
    return;
  }
  event.preventDefault();
  const point = getCanvasPoint(event);
  if (state.currentPath.type === "stroke") {
    state.currentPath.points.push(point);
  } else {
    state.currentPath.end = point;
  }
  redrawCurrentSlideDrawing();
}

function endDrawing() {
  if (state.currentPath && state.currentPath.type !== "stroke") {
    state.drawings[state.slideIndex].push({ ...state.currentPath });
  }
  state.isPointerDown = false;
  state.currentPath = null;
  redrawCurrentSlideDrawing();
}

function collectCharTokens(lineText) {
  const chars = [];

  function walk(nodes, classes = []) {
    nodes.forEach((node) => {
      if (typeof node === "string") {
        for (const char of node) {
          chars.push({ char, classes: [...classes] });
        }
      } else {
        walk(node.children, [...classes, node.className]);
      }
    });
  }

  walk(parseInline(lineText));
  return chars;
}

function getFontString(size, isTitle = false) {
  const weight = isTitle ? 700 : 400;
  return `${weight} ${size}px "${fontChoice.value}", cursive`;
}

function layoutStyledLine(ctx, charItems, config) {
  const lines = [];
  let currentLine = [];
  let currentWidth = 0;
  const maxWidth = config.maxWidth;

  charItems.forEach((item) => {
    if (item.char === "\n") {
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
      return;
    }

    ctx.font = getFontString(config.fontSize, config.isTitle);
    const charWidth = ctx.measureText(item.char).width;
    const shouldWrap = currentLine.length > 0 && currentWidth + charWidth > maxWidth && item.char !== " ";

    if (shouldWrap) {
      lines.push(currentLine);
      currentLine = [];
      currentWidth = 0;
    }

    currentLine.push({ ...item, width: charWidth });
    currentWidth += charWidth;
  });

  lines.push(currentLine);
  return lines;
}

function buildRenderableSlide(ctx, slideText, width, height) {
  const marginX = 110;
  const marginTop = 94;
  const maxWidth = width - marginX * 2;
  const renderLines = [];
  let y = marginTop;

  slideText.split("\n").forEach((sourceLine) => {
    const isTitle = sourceLine.startsWith("# ");
    const cleanLine = isTitle ? sourceLine.slice(2) : sourceLine;
    const fontSize = isTitle ? 58 : 42;
    const lineHeight = isTitle ? 76 : 58;

    if (!cleanLine.trim()) {
      y += lineHeight * 0.74;
      return;
    }

    const chars = collectCharTokens(cleanLine);
    const wrapped = layoutStyledLine(ctx, chars, { maxWidth, fontSize, isTitle });

    wrapped.forEach((lineChars) => {
      renderLines.push({
        chars: lineChars,
        x: marginX,
        y,
        fontSize,
        isTitle,
        lineHeight
      });
      y += lineHeight;
    });
  });

  return renderLines;
}

function tokenColor(classes, fallback) {
  const colorClass = classes.find((className) => className.startsWith("color-"));
  return COLOR_CLASS_MAP[colorClass] || fallback;
}

function drawBoardBackground(ctx, width, height) {
  const surface = THEME_SURFACES[boardTheme.value];
  const textColor = chalkColor.value;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, surface);
  gradient.addColorStop(1, boardTheme.value === "white" ? "#ecece4" : "#20392d");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.strokeStyle = boardTheme.value === "white" ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  for (let y = 0; y < height; y += 42) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  for (let x = 0; x < width; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  const glare = ctx.createRadialGradient(width * 0.2, height * 0.18, 0, width * 0.2, height * 0.18, width * 0.42);
  glare.addColorStop(0, boardTheme.value === "white" ? "rgba(255,255,255,0.24)" : "rgba(255,255,255,0.09)");
  glare.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = glare;
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.2, width / 2, height / 2, width * 0.8);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  return textColor;
}

function renderSlideToCanvas(ctx, width, height, slideText, visibleChars) {
  const fallbackColor = drawBoardBackground(ctx, width, height);
  const renderLines = buildRenderableSlide(ctx, slideText, width, height);
  let shown = 0;

  renderLines.forEach((line) => {
    ctx.font = getFontString(line.fontSize, line.isTitle);
    ctx.textBaseline = "alphabetic";
    let x = line.x;
    const lineStartX = x;
    const lineStartY = line.y;
    let circleStart = null;
    let lastCircleX = null;

    line.chars.forEach((item) => {
      if (shown >= visibleChars) {
        x += item.width;
        return;
      }

      const color = tokenColor(item.classes, fallbackColor);
      ctx.fillStyle = color;
      ctx.fillText(item.char, x, line.y);

      if (item.classes.includes("underline")) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(2, line.fontSize * 0.04);
        ctx.beginPath();
        ctx.moveTo(x, line.y + 8);
        ctx.lineTo(x + item.width, line.y + 10);
        ctx.stroke();
        ctx.restore();
      }

      if (item.classes.includes("circle")) {
        if (circleStart === null) {
          circleStart = x;
        }
        lastCircleX = x + item.width;
      } else if (circleStart !== null && lastCircleX !== null) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(
          (circleStart + lastCircleX) / 2,
          line.y - line.fontSize * 0.34,
          (lastCircleX - circleStart) / 2 + 12,
          line.fontSize * 0.52,
          -0.05,
          0,
          Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
        circleStart = null;
        lastCircleX = null;
      }

      x += item.width;
      shown += 1;
    });

    if (circleStart !== null && lastCircleX !== null && shown >= visibleChars) {
      const color = tokenColor(line.chars[line.chars.length - 1]?.classes || [], fallbackColor);
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.ellipse(
        (circleStart + lastCircleX) / 2,
        line.y - line.fontSize * 0.34,
        (lastCircleX - circleStart) / 2 + 12,
        line.fontSize * 0.52,
        -0.05,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();
    }

    if (line.chars.length === 0) {
      ctx.save();
      ctx.fillStyle = fallbackColor;
      ctx.fillText("", lineStartX, lineStartY);
      ctx.restore();
    }
  });

  const boardRect = board.getBoundingClientRect();
  const scaleX = width / boardRect.width;
  const scaleY = height / boardRect.height;
  const overlayCanvas = document.createElement("canvas");
  overlayCanvas.width = width;
  overlayCanvas.height = height;
  const overlayContext = overlayCanvas.getContext("2d");
  renderEntriesOnContext(overlayContext, state.drawings[state.slideIndex] || [], {
    scaleX,
    scaleY,
    scaleStroke: scaleX
  });
  ctx.drawImage(overlayCanvas, 0, 0);
}

function pickRecordingFormat() {
  const choice = exportFormat.value;
  const candidates = choice === "mp4"
    ? [
        { mimeType: "video/mp4;codecs=h264", extension: "mp4" },
        { mimeType: "video/mp4", extension: "mp4" }
      ]
    : choice === "webm"
      ? [
          { mimeType: "video/webm;codecs=vp9", extension: "webm" },
          { mimeType: "video/webm;codecs=vp8", extension: "webm" },
          { mimeType: "video/webm", extension: "webm" }
        ]
      : [
          { mimeType: "video/mp4;codecs=h264", extension: "mp4" },
          { mimeType: "video/mp4", extension: "mp4" },
          { mimeType: "video/webm;codecs=vp9", extension: "webm" },
          { mimeType: "video/webm;codecs=vp8", extension: "webm" },
          { mimeType: "video/webm", extension: "webm" }
        ];

  const supported = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate.mimeType));
  return supported || { mimeType: "", extension: "webm" };
}

async function recordPresentationVideo() {
  if (state.exportInProgress) {
    return;
  }

  state.slides = parseSlides(slideInput.value);
  if (!state.slides.length) {
    state.slides = [templates.default];
  }
  ensureDrawingSlots();

  state.exportInProgress = true;
  exportButton.disabled = true;
  setStatus("Video hazirlaniyor");

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = 1920;
  exportCanvas.height = 1080;
  const exportContext = exportCanvas.getContext("2d");
  const stream = exportCanvas.captureStream(30);
  const format = pickRecordingFormat();
  const recorder = format.mimeType
    ? new MediaRecorder(stream, { mimeType: format.mimeType })
    : new MediaRecorder(stream);
  const chunks = [];

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  const finished = new Promise((resolve) => {
    recorder.addEventListener("stop", () => resolve());
  });

  recorder.start();

  const originalSlideIndex = state.slideIndex;

  for (let slideIndex = 0; slideIndex < state.slides.length; slideIndex += 1) {
    state.slideIndex = slideIndex;
    const slideText = state.slides[slideIndex];
    const totalChars = slideText.replace(/\[(\/?)(u|c|sari|mavi|pembe|yesil)\]/g, "").length;
    const charsPerFrame = Math.max(1, Math.ceil(totalChars / (Math.max(18, Number(speedControl.value)) * 1.7)));

    for (let visibleChars = 0; visibleChars <= totalChars; visibleChars += charsPerFrame) {
      renderSlideToCanvas(exportContext, exportCanvas.width, exportCanvas.height, slideText, visibleChars);
      await delay(1000 / 30);
    }

    renderSlideToCanvas(exportContext, exportCanvas.width, exportCanvas.height, slideText, totalChars + 1);
    await delay(1000);
  }

  recorder.stop();
  await finished;

  const blobType = format.mimeType || recorder.mimeType || "video/webm";
  const blob = new Blob(chunks, { type: blobType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `chalkboard-presentation.${format.extension}`;
  anchor.click();

  setTimeout(() => URL.revokeObjectURL(url), 2000);
  state.slideIndex = originalSlideIndex;
  exportButton.disabled = false;
  state.exportInProgress = false;
  const preferredMp4 = exportFormat.value === "mp4" || exportFormat.value === "auto";
  if (preferredMp4 && format.extension !== "mp4") {
    setStatus("MP4 desteklenmedi, WebM indirildi");
  } else {
    setStatus(state.isDrawingMode ? "Cizim modu acik" : "Hazir");
  }
  typeCurrentSlide();
}

templateButtons.forEach((button) => {
  button.addEventListener("click", () => {
    slideInput.value = templates[button.dataset.template] || templates.default;
    state.slideIndex = 0;
    loadSlidesAndPlay();
    window.scrollTo({ top: document.querySelector(".workspace").offsetTop - 12, behavior: "smooth" });
  });
});

toolbarButtons.forEach((button) => {
  button.addEventListener("click", () => {
    wrapSelection(button.dataset.wrap, button.dataset.wrapClose);
  });
});

startFromWelcome.addEventListener("click", () => {
  slideInput.focus();
  window.scrollTo({ top: document.querySelector(".workspace").offsetTop - 12, behavior: "smooth" });
});

playButton.addEventListener("click", () => {
  state.slideIndex = 0;
  loadSlidesAndPlay();
});

nextButton.addEventListener("click", () => moveSlide(1));
prevButton.addEventListener("click", () => moveSlide(-1));
replayButton.addEventListener("click", () => typeCurrentSlide());
clearButton.addEventListener("click", clearBoard);
clearDrawingButton.addEventListener("click", clearCurrentDrawing);
boardTheme.addEventListener("change", applyBoardTheme);
chalkColor.addEventListener("input", applyBoardTheme);
fontChoice.addEventListener("change", applyBoardTheme);
drawingToggle.addEventListener("click", () => setDrawingMode(!state.isDrawingMode));
exportButton.addEventListener("click", recordPresentationVideo);
toolButtons.forEach((button) => {
  button.addEventListener("click", () => setCurrentTool(button.dataset.tool));
});

drawingCanvas.addEventListener("pointerdown", beginDrawing);
drawingCanvas.addEventListener("pointermove", moveDrawing);
drawingCanvas.addEventListener("pointerup", endDrawing);
drawingCanvas.addEventListener("pointerleave", endDrawing);
drawingCanvas.addEventListener("pointercancel", endDrawing);

window.addEventListener("resize", syncCanvasResolution);

document.addEventListener("keydown", (event) => {
  if (event.key === "F5") {
    event.preventDefault();
    state.slideIndex = 0;
    loadSlidesAndPlay();
  }
  if (event.key === "ArrowRight") {
    moveSlide(1);
  }
  if (event.key === "ArrowLeft") {
    moveSlide(-1);
  }
});

slideInput.value = templates.default;
state.slides = parseSlides(slideInput.value);
ensureDrawingSlots();
updateSlideIndicator();
applyBoardTheme();
startMiniDemo();
syncCanvasResolution();
setCurrentTool("chalk");
typeCurrentSlide();
