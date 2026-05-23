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

const board = document.getElementById("board");
const boardContent = document.getElementById("boardContent");
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
const toolbarButtons = [...document.querySelectorAll(".toolbar button")];
const templateButtons = [...document.querySelectorAll("[data-template]")];

const state = {
  slideIndex: 0,
  slides: [],
  typingToken: 0,
  isTyping: false,
  typingRunId: 0
};

const miniDemoText = "Merhaba!\nBu tahta senin yazdiklarini\nadim adim canlandirir.";

function parseSlides(source) {
  return source
    .split(/\n\s*---\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);
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

  lines.forEach((line, index) => {
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
    if (index < lines.length - 1) {
      const breakNode = document.createElement("div");
      breakNode.className = "line";
      breakNode.innerHTML = "&nbsp;";
      breakNode.dataset.spacer = "true";
      boardContent.appendChild(breakNode);
    }
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

function applyBoardTheme() {
  board.classList.remove("board-green", "board-black", "board-white");
  board.classList.add(`board-${boardTheme.value}`);
  board.style.setProperty("--board-text", chalkColor.value);
  board.style.setProperty("--board-font", `"${fontChoice.value}", cursive`);
  chalkCursor.style.background = chalkColor.value;
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
  setStatus("Hazir");
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
  typeCurrentSlide();
}

function clearBoard() {
  state.typingRunId += 1;
  state.isTyping = false;
  boardContent.innerHTML = "";
  chalkCursor.classList.remove("visible");
  setStatus("Temiz");
}

function moveSlide(direction) {
  if (!state.slides.length) {
    state.slides = parseSlides(slideInput.value);
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
boardTheme.addEventListener("change", applyBoardTheme);
chalkColor.addEventListener("input", applyBoardTheme);
fontChoice.addEventListener("change", applyBoardTheme);

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
updateSlideIndicator();
applyBoardTheme();
startMiniDemo();
typeCurrentSlide();
