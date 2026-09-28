(function () {
  const M = window.LeafModel;
  const STORAGE_KEY = "list-notes-v1";
  const EMOJIS = ["📄", "🌱", "📝", "📚", "✨", "💡", "🎯", "✅", "📌", "🚀", "🧠", "🗂️", "📅", "🔥", "🌟", "💬", "🧪", "🧩", "📎", "🏠", "⭐", "🎨", "📖", "🖊️", "💼", "🌿", "☕", "🎵", "📷", "❤️", "🌙", "🧰"];
  const COVER_LABELS = { warm: "Тёплая", sage: "Шалфей", sky: "Небо", dusk: "Закат", ink: "Чернила" };

  const app = document.getElementById("app");
  let state = normalize(load());
  let undoStack = [];
  let redoStack = [];
  let typingKey = null;
  let saveTimer = 0;
  let toastTimer = 0;
  let composing = false;
  let dragId = null;
  let sidebarOpen = window.innerWidth > 800;
  let slash = { open: false, blockId: null, query: "", index: 0, fromButton: false };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return M.seedState();
      return JSON.parse(raw);
    } catch (error) {
      return M.seedState();
    }
  }

  function normalize(data) {
    if (!data || !Array.isArray(data.pages) || !data.pages.length) return M.seedState();
    data.pages = data.pages.filter(function (page) { return page && page.id; });
    if (!data.pages.length) return M.seedState();
    data.pages.forEach(function (page) {
      if (!Array.isArray(page.blocks) || !page.blocks.length) page.blocks = [M.emptyBlock()];
      page.blocks.forEach(function (block) {
        if (!block.id) block.id = M.uid();
        if (!block.type) block.type = "paragraph";
        block.content = M.sanitizeHtml(block.content || "");
        block.checked = Boolean(block.checked);
      });
      if (M.COVERS.indexOf(page.cover) === -1) page.cover = null;
    });
    if (!data.pages.some(function (page) { return page.id === data.activePageId; })) {
      data.activePageId = data.pages[0].id;
    }
    data.theme = data.theme === "dark" ? "dark" : "light";
    return data;
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, 120);
  }

  function activePage() {
    return state.pages.filter(function (page) { return page.id === state.activePageId; })[0] || state.pages[0];
  }

  function blockById(id) {
    return activePage().blocks.filter(function (block) { return block.id === id; })[0];
  }

  function touch(page) {
    page.updatedAt = Date.now();
    save();
  }

  function snapshot() {
    return JSON.stringify({ pages: state.pages, activePageId: state.activePageId });
  }

  function pushHistory() {
    const snap = snapshot();
    if (undoStack[undoStack.length - 1] === snap) return;
    undoStack.push(snap);
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
  }

  function beforeTyping(key) {
    if (typingKey !== key) {
      pushHistory();
      typingKey = key;
    }
  }

  function beforeStructural() {
    pushHistory();
    typingKey = null;
  }

  function restore(snap) {
    const data = JSON.parse(snap);
    state.pages = data.pages;
    state.activePageId = data.activePageId;
    typingKey = null;
    closeSlash();
    closeMenu();
    save();
    render();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restore(undoStack.pop());
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restore(redoStack.pop());
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatTime(ts) {
    const delta = Date.now() - (ts || Date.now());
    if (delta < 15000) return "Только что";
    const minutes = Math.floor(delta / 60000);
    if (minutes < 60) return "Изменено " + minutes + " мин назад";
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return "Изменено " + hours + " ч назад";
    return "Изменено " + new Date(ts).toLocaleDateString("ru-RU");
  }

  function placeholder(type) {
    if (type === "h1") return "Заголовок 1";
    if (type === "h2") return "Заголовок 2";
    if (type === "h3") return "Заголовок 3";
    if (type === "bullet" || type === "numbered") return "Пункт списка";
    if (type === "todo") return "Задача";
    if (type === "quote") return "Цитата";
    if (type === "callout") return "Выноска";
    if (type === "code") return "Код";
    return "Введите текст или / для команд";
  }

  function numbering(blocks) {
    let count = 0;
    return blocks.map(function (block) {
      if (block.type === "numbered") return ++count;
      count = 0;
      return 0;
    });
  }

  function gutter(id) {
    return '<div class="gutter">' +
      '<button type="button" class="gutter-btn" data-action="add" data-id="' + id + '" title="Добавить блок">+</button>' +
      '<button type="button" class="gutter-btn handle" draggable="true" data-action="menu" data-id="' + id + '" title="Перетащить или открыть меню">⠿</button>' +
      "</div>";
  }

  function renderBlock(block, number) {
    if (block.type === "divider") {
      return '<div class="block" data-block-id="' + block.id + '" data-type="divider">' + gutter(block.id) + "<hr></div>";
    }
    if (block.type === "page") {
      const linked = state.pages.filter(function (page) { return page.id === block.pageId; })[0];
      const title = linked ? linked.title || "Без названия" : "Страница удалена";
      const icon = linked ? linked.icon || "📄" : "🗑️";
      return '<div class="block" data-block-id="' + block.id + '" data-type="page">' + gutter(block.id) +
        '<button type="button" class="page-ref" data-open="' + escapeHtml(block.pageId || "") + '">' +
        escapeHtml(icon) + "<span>" + escapeHtml(title) + "</span></button></div>";
    }
    let marker = "";
    if (block.type === "bullet") marker = '<span class="marker">•</span>';
    if (block.type === "numbered") marker = '<span class="marker">' + number + ".</span>";
    if (block.type === "todo") {
      marker = '<button type="button" class="check" data-action="check" data-id="' + block.id + '" aria-pressed="' + block.checked + '" aria-label="Отметить задачу">' + (block.checked ? "✓" : "") + "</button>";
    }
    if (block.type === "callout") marker = '<span class="marker">💡</span>';
    return '<div class="block" data-block-id="' + block.id + '" data-type="' + block.type + '" data-checked="' + (block.checked ? "true" : "false") + '">' +
      gutter(block.id) + marker +
      '<div class="content" contenteditable="true" spellcheck="' + (block.type === "code" ? "false" : "true") + '" data-placeholder="' + escapeHtml(placeholder(block.type)) + '" data-empty="' + (M.htmlToText(block.content) ? "false" : "true") + '">' +
      M.sanitizeHtml(block.content || "") + "</div></div>";
  }

  function ancestors(page) {
    const chain = [];
    const seen = new Set();
    let current = page;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.unshift(current);
      current = state.pages.filter(function (item) { return item.id === current.parentId; })[0];
    }
    return chain;
  }

  function renderShell() {
    app.classList.add("app");
    app.innerHTML =
      '<aside class="sidebar">' +
      '<div class="workspace"><span class="logo">Л</span><span class="ws-name">Лист</span></div>' +
      '<div class="search-wrap"><input id="search" type="search" placeholder="Поиск страниц" aria-label="Поиск страниц" autocomplete="off"></div>' +
      '<button type="button" class="new-page" data-action="new-page">+ Новая страница</button>' +
      '<nav id="page-tree" class="page-tree" aria-label="Страницы"></nav>' +
      '<p class="side-hint">/ — блоки<br>⌘B или Ctrl+B — жирный<br>⌘Z — отмена</p>' +
      "</aside>" +
      '<div class="scrim" data-action="close-sidebar"></div>' +
      '<div class="main">' +
      '<header class="topbar">' +
      '<button type="button" class="icon-btn" data-action="toggle-sidebar" aria-label="Боковая панель">☰</button>' +
      '<div id="crumbs" class="crumbs"></div>' +
      '<button type="button" class="text-btn" data-action="theme">Тема</button>' +
      '<button type="button" class="icon-btn" data-action="more" aria-label="Меню страницы">···</button>' +
      "</header>" +
      '<div id="scroller" class="scroller"><div id="cover"></div><article id="page" class="page"></article></div>' +
      "</div>" +
      '<div id="slash" class="slash hidden" role="listbox"></div>' +
      '<div id="menu" class="menu hidden"></div>' +
      '<div id="emoji" class="emoji-pop hidden"></div>' +
      '<div id="toast" class="toast hidden" role="status"></div>';
  }

  function renderSidebar() {
    const query = document.getElementById("search").value || "";
    const tree = document.getElementById("page-tree");
    const seen = new Set();
    const searching = query.trim().length > 0;
    const roots = searching
      ? state.pages.filter(function (page) { return M.pageMatches(page, query); })
      : state.pages.filter(function (page) { return !page.parentId; });

    function rows(page, depth) {
      if (seen.has(page.id) || depth > 8) return "";
      seen.add(page.id);
      const kids = searching ? [] : state.pages.filter(function (item) { return item.parentId === page.id; });
      return '<div class="page-row' + (page.id === state.activePageId ? " active" : "") + '" style="--depth:' + depth + '">' +
        '<button type="button" class="page-link" data-open="' + page.id + '"><span>' + escapeHtml(page.icon || "📄") + '</span><span class="pt">' + escapeHtml(page.title || "Без названия") + "</span></button>" +
        '<button type="button" class="page-add" data-action="subpage" data-parent="' + page.id + '" title="Вложенная страница">+</button></div>' +
        kids.map(function (kid) { return rows(kid, depth + 1); }).join("");
    }

    tree.innerHTML = roots.map(function (page) { return rows(page, 0); }).join("") || '<p class="empty-side">Ничего не найдено</p>';
  }

  function render(options) {
    const opts = options || {};
    const page = activePage();
    document.documentElement.dataset.theme = state.theme;
    document.title = (page.title || "Без названия") + " — Лист";
    app.classList.toggle("sidebar-open", sidebarOpen);
    const cover = document.getElementById("cover");
    cover.className = page.cover ? "cover cover-" + page.cover : "cover cover-empty";
    cover.innerHTML = page.cover
      ? '<div class="cover-actions"><button type="button" data-action="cover">Сменить обложку</button><button type="button" data-action="cover-remove">Убрать</button></div>'
      : '<button type="button" class="cover-add" data-action="cover">Добавить обложку</button>';
    document.getElementById("crumbs").innerHTML = ancestors(page).map(function (item) {
      return '<button type="button" data-open="' + item.id + '" class="' + (item.id === page.id ? "current" : "") + '">' +
        escapeHtml((item.icon || "📄") + " " + (item.title || "Без названия")) + "</button>";
    }).join('<span class="sep">/</span>');
    const numbers = numbering(page.blocks);
    document.getElementById("page").innerHTML =
      '<button type="button" class="page-icon" data-action="icon" title="Сменить значок">' + escapeHtml(page.icon || "📄") + "</button>" +
      '<h1 class="page-title" contenteditable="true" data-placeholder="Без названия" aria-label="Название страницы">' + escapeHtml(page.title || "") + "</h1>" +
      '<p class="edited">' + escapeHtml(formatTime(page.updatedAt)) + "</p>" +
      '<div class="blocks">' + page.blocks.map(function (block, index) { return renderBlock(block, numbers[index]); }).join("") + "</div>";
    renderSidebar();
    if (opts.focusId) focusContent(opts.focusId, opts.at || "start", opts.offset);
    if (opts.focusTitle) focusTitle();
    if (opts.scrollTop) document.getElementById("scroller").scrollTop = 0;
  }

  function updateEdited() {
    const label = document.querySelector(".edited");
    if (label) label.textContent = formatTime(activePage().updatedAt);
  }

  function syncEmpty(el) {
    const empty = !el.textContent.replace(/\u00a0/g, " ").trim();
    el.dataset.empty = empty ? "true" : "false";
  }

  function focusTitle() {
    const el = document.querySelector(".page-title");
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function resolveOffset(el, offset) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let remain = offset;
    let node = walker.nextNode();
    while (node) {
      if (remain <= node.textContent.length) return { node: node, offset: remain };
      remain -= node.textContent.length;
      node = walker.nextNode();
    }
    return null;
  }

  function focusContent(id, at, offset) {
    const el = document.querySelector('[data-block-id="' + id + '"] .content');
    if (!el) return;
    el.focus();
    syncEmpty(el);
    const range = document.createRange();
    if (at === "offset" && typeof offset === "number") {
      const pos = resolveOffset(el, offset);
      if (pos) range.setStart(pos.node, pos.offset);
      else range.selectNodeContents(el);
      range.collapse(true);
    } else if (at === "end") {
      range.selectNodeContents(el);
      range.collapse(false);
    } else {
      range.selectNodeContents(el);
      range.collapse(true);
    }
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function caretOffset(el) {
    const sel = getSelection();
    if (!sel.rangeCount) return 0;
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(el);
    range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
    return range.toString().length;
  }

  function caretAt(el, edge) {
    const sel = getSelection();
    if (!sel.rangeCount || !sel.isCollapsed || !el.contains(sel.anchorNode)) return false;
    const offset = caretOffset(el);
    if (edge === "start") return offset === 0;
    return offset === el.textContent.length;
  }

  function textBeforeCaret(el) {
    const sel = getSelection();
    if (!sel.rangeCount) return "";
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(el);
    range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
    return range.toString();
  }

  function openPage(id) {
    if (!state.pages.some(function (page) { return page.id === id; })) return;
    closeSlash();
    closeMenu();
    closeEmoji();
    state.activePageId = id;
    if (window.innerWidth <= 800) sidebarOpen = false;
    save();
    render({ scrollTop: true });
  }

  function addPage(parentId) {
    beforeStructural();
    const page = M.createPage({ parentId: parentId || null, icon: parentId ? "📝" : "📄", title: "" });
    state.pages.push(page);
    state.activePageId = page.id;
    save();
    render({ focusTitle: true, scrollTop: true });
  }

  function duplicatePage() {
    const page = activePage();
    beforeStructural();
    const copy = M.createPage({
      title: (page.title || "Без названия") + " (копия)",
      icon: page.icon,
      cover: page.cover,
      parentId: page.parentId,
      blocks: page.blocks.map(function (block) {
        return Object.assign({}, block, { id: M.uid() });
      }),
    });
    state.pages.push(copy);
    state.activePageId = copy.id;
    save();
    render({ scrollTop: true });
    toast("Страница скопирована");
  }

  function removePage(id) {
    const ids = new Set();
    function walk(pid, depth) {
      if (ids.has(pid) || depth > 20) return;
      ids.add(pid);
      state.pages.filter(function (page) { return page.parentId === pid; }).forEach(function (page) {
        walk(page.id, depth + 1);
      });
    }
    beforeStructural();
    walk(id, 0);
    state.pages = state.pages.filter(function (page) { return !ids.has(page.id); });
    state.pages.forEach(function (page) {
      page.blocks = page.blocks.filter(function (block) {
        return !(block.type === "page" && ids.has(block.pageId));
      });
      if (!page.blocks.length) page.blocks.push(M.emptyBlock());
    });
    if (!state.pages.length) {
      const fresh = M.createPage({ title: "", icon: "📄" });
      state.pages = [fresh];
      state.activePageId = fresh.id;
    } else if (!state.pages.some(function (page) { return page.id === state.activePageId; })) {
      state.activePageId = state.pages[0].id;
    }
    save();
    render({ scrollTop: true });
    toast("Страница удалена");
  }

  function setCover(cover) {
    beforeStructural();
    activePage().cover = cover;
    touch(activePage());
    render();
  }

  function downloadMarkdown() {
    const page = activePage();
    const blob = new Blob([M.exportPageMarkdown(page, state.pages)], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    const name = (page.title || "zametka").replace(/[\\/:*?"<>|]/g, "").trim() || "zametka";
    link.href = URL.createObjectURL(blob);
    link.download = name + ".md";
    link.click();
    URL.revokeObjectURL(link.href);
    toast("Markdown скачан");
  }

  function deleteBlock(id) {
    const page = activePage();
    const index = page.blocks.findIndex(function (block) { return block.id === id; });
    if (index < 0) return;
    beforeStructural();
    if (page.blocks.length === 1) {
      page.blocks[0] = M.emptyBlock();
      touch(page);
      render({ focusId: page.blocks[0].id });
      return;
    }
    page.blocks.splice(index, 1);
    const focus = page.blocks[Math.max(0, index - 1)];
    touch(page);
    render({ focusId: focus.id, at: "end" });
  }

  function duplicateBlock(id) {
    const page = activePage();
    const index = page.blocks.findIndex(function (block) { return block.id === id; });
    if (index < 0) return;
    beforeStructural();
    const copy = Object.assign({}, page.blocks[index], { id: M.uid() });
    page.blocks.splice(index + 1, 0, copy);
    touch(page);
    render({ focusId: copy.id, at: "end" });
  }

  function convertBlock(block, type) {
    block.type = type;
    block.checked = false;
    if (type !== "page") block.pageId = null;
    const page = activePage();
    let focusId = block.id;
    if (type === "page") {
      const child = M.createPage({ parentId: page.id, title: "", icon: "📝" });
      state.pages.push(child);
      block.pageId = child.id;
      block.content = "";
      focusId = null;
    }
    if (type === "divider") {
      block.content = "";
      const index = page.blocks.findIndex(function (item) { return item.id === block.id; });
      const next = M.emptyBlock();
      page.blocks.splice(index + 1, 0, next);
      focusId = next.id;
    }
    touch(page);
    render(focusId ? { focusId: focusId, at: "end" } : {});
  }

  function addBlockAfter(id) {
    const page = activePage();
    const index = page.blocks.findIndex(function (block) { return block.id === id; });
    const block = M.emptyBlock();
    beforeStructural();
    page.blocks.splice(index + 1, 0, block);
    touch(page);
    render({ focusId: block.id });
    openSlash(block.id, true);
  }

  function splitBlock(block, el) {
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const afterRange = range.cloneRange();
    afterRange.selectNodeContents(el);
    afterRange.setStart(range.endContainer, range.endOffset);
    const holder = document.createElement("div");
    holder.appendChild(afterRange.extractContents());
    const beforeHtml = M.sanitizeHtml(el.innerHTML);
    const afterHtml = M.sanitizeHtml(holder.innerHTML);
    const beforeText = M.htmlToText(beforeHtml).trim();
    const page = activePage();
    const index = page.blocks.findIndex(function (item) { return item.id === block.id; });
    if (["bullet", "numbered", "todo"].indexOf(block.type) !== -1 && !beforeText && !M.htmlToText(afterHtml).trim()) {
      beforeStructural();
      block.type = "paragraph";
      block.content = "";
      touch(page);
      render({ focusId: block.id });
      return;
    }
    beforeStructural();
    block.content = beforeHtml;
    const created = M.emptyBlock(["bullet", "numbered", "todo", "quote", "callout"].indexOf(block.type) !== -1 && beforeText ? block.type : "paragraph");
    created.content = afterHtml;
    page.blocks.splice(index + 1, 0, created);
    touch(page);
    render({ focusId: created.id });
  }

  function mergeWithPrev(block, el) {
    const page = activePage();
    const index = page.blocks.findIndex(function (item) { return item.id === block.id; });
    const currentText = M.htmlToText(el.innerHTML);
    if (index <= 0) {
      if (!currentText.trim() && page.blocks.length > 1) deleteBlock(block.id);
      return;
    }
    const prev = page.blocks[index - 1];
    if (prev.type === "divider" || prev.type === "page") {
      if (!currentText.trim()) deleteBlock(block.id);
      return;
    }
    beforeStructural();
    const offset = M.htmlToText(prev.content || "").length;
    prev.content = M.sanitizeHtml((prev.content || "") + el.innerHTML);
    page.blocks.splice(index, 1);
    touch(page);
    render({ focusId: prev.id, at: "offset", offset: offset });
  }

  function insertPlain(text) {
    document.execCommand("insertText", false, text);
  }

  function onPaste(event) {
    const el = event.target.closest(".content");
    if (!el) return;
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const block = blockById(el.closest(".block").dataset.blockId);
    if (!block || lines.length === 1 || block.type === "code") {
      insertPlain(text);
      return;
    }
    beforeStructural();
    insertPlain(lines[0]);
    block.content = M.sanitizeHtml(el.innerHTML);
    const page = activePage();
    const index = page.blocks.findIndex(function (item) { return item.id === block.id; });
    const created = lines.slice(1).map(function (line) {
      const item = M.emptyBlock(block.type === "bullet" || block.type === "numbered" || block.type === "todo" ? block.type : "paragraph");
      item.content = escapeHtml(line);
      return item;
    });
    page.blocks.splice.apply(page.blocks, [index + 1, 0].concat(created));
    touch(page);
    render({ focusId: created[created.length - 1].id, at: "end" });
  }

  function applyShortcut(block, type) {
    block.content = "";
    convertBlock(block, type);
    closeSlash();
  }

  function deleteSlashToken(el) {
    const before = textBeforeCaret(el);
    const match = /(^|\s)\/([^\n]*)$/.exec(before);
    if (!match) return;
    const deleteCount = match[2].length + 1;
    const start = before.length - deleteCount;
    const end = before.length;
    const startPos = resolveOffset(el, start);
    const endPos = resolveOffset(el, end);
    if (!startPos || !endPos) return;
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);
    range.deleteContents();
  }

  function openSlash(id, fromButton) {
    slash = { open: true, blockId: id, query: "", index: 0, fromButton: Boolean(fromButton) };
    const el = document.querySelector('[data-block-id="' + id + '"] .content');
    renderSlash(el);
  }

  function closeSlash() {
    slash.open = false;
    const menu = document.getElementById("slash");
    if (menu) menu.classList.add("hidden");
  }

  function renderSlash(anchor) {
    const menu = document.getElementById("slash");
    const commands = M.filterCommands(slash.query);
    if (!slash.open) {
      menu.classList.add("hidden");
      return;
    }
    if (slash.index >= commands.length) slash.index = 0;
    menu.innerHTML = commands.length
      ? commands.map(function (command, index) {
        return '<button type="button" class="slash-item' + (index === slash.index ? " active" : "") + '" data-slash="' + command.type + '"><span>' +
          escapeHtml(command.label) + "</span><small>" + escapeHtml(command.hint) + "</small></button>";
      }).join("")
      : '<div class="slash-empty">Нет такой команды</div>';
    menu.classList.remove("hidden");
    positionNear(menu, anchor);
    const active = menu.querySelector(".active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  function positionNear(menu, anchor) {
    let rect = null;
    const sel = getSelection();
    if (sel && sel.rangeCount && anchor && anchor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0).cloneRange();
      range.collapse(true);
      rect = range.getClientRects()[0];
    }
    if (!rect && anchor) rect = anchor.getBoundingClientRect();
    if (!rect) return;
    menu.style.visibility = "hidden";
    menu.classList.remove("hidden");
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    let top = rect.bottom + 6;
    let left = rect.left;
    if (top + height > window.innerHeight - 8) top = Math.max(8, rect.top - height - 6);
    if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
    menu.style.top = Math.max(8, top) + "px";
    menu.style.left = Math.max(8, left) + "px";
    menu.style.visibility = "";
  }

  function applySlash() {
    const commands = M.filterCommands(slash.query);
    const command = commands[slash.index];
    const block = blockById(slash.blockId);
    const el = document.querySelector('[data-block-id="' + slash.blockId + '"] .content');
    if (!command || !block) {
      closeSlash();
      return;
    }
    if (el && !slash.fromButton) deleteSlashToken(el);
    if (el) block.content = M.sanitizeHtml(el.innerHTML);
    closeSlash();
    convertBlock(block, command.type);
  }

  function updateSlash(el, block) {
    const before = textBeforeCaret(el).replace(/\u00a0/g, " ");
    const match = /(^|\s)\/([^\n]*)$/.exec(before);
    if (!match) {
      closeSlash();
      return;
    }
    slash.open = true;
    slash.blockId = block.id;
    slash.query = match[2];
    slash.fromButton = false;
    if (!slash.query) slash.index = 0;
    renderSlash(el);
  }

  function closeMenu() {
    const menu = document.getElementById("menu");
    if (menu) menu.classList.add("hidden");
  }

  function openMenu(x, y, items) {
    const menu = document.getElementById("menu");
    menu.innerHTML = items.map(function (item, index) {
      return '<button type="button" data-menu="' + index + '" class="' + (item.danger ? "danger" : "") + '">' + escapeHtml(item.label) + "</button>";
    }).join("");
    menu.classList.remove("hidden");
    menu.style.left = Math.max(8, x) + "px";
    menu.style.top = Math.max(8, y) + "px";
    menu._items = items;
    requestAnimationFrame(function () {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) menu.style.left = window.innerWidth - rect.width - 8 + "px";
      if (rect.bottom > window.innerHeight - 8) menu.style.top = window.innerHeight - rect.height - 8 + "px";
    });
  }

  function closeEmoji() {
    const pop = document.getElementById("emoji");
    if (pop) pop.classList.add("hidden");
  }

  function openEmoji(anchor) {
    const pop = document.getElementById("emoji");
    pop.innerHTML = EMOJIS.map(function (emoji) {
      return '<button type="button" class="emoji-btn" data-emoji="' + emoji + '">' + emoji + "</button>";
    }).join("");
    pop.classList.remove("hidden");
    const rect = anchor.getBoundingClientRect();
    pop.style.left = Math.min(rect.left, window.innerWidth - 280) + "px";
    pop.style.top = rect.bottom + 8 + "px";
  }

  function toast(message) {
    const node = document.getElementById("toast");
    node.textContent = message;
    node.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.classList.add("hidden"); }, 2200);
  }

  function onInput(event) {
    if (composing) return;
    if (event.target.classList.contains("page-title")) {
      const page = activePage();
      beforeTyping("title");
      page.title = event.target.textContent.replace(/\n/g, "");
      if (!page.title) event.target.innerHTML = "";
      touch(page);
      renderSidebar();
      updateEdited();
      document.title = (page.title || "Без названия") + " — Лист";
      return;
    }
    const el = event.target.closest(".content");
    if (!el) return;
    const block = blockById(el.closest(".block").dataset.blockId);
    if (!block) return;
    beforeTyping(block.id);
    block.content = M.sanitizeHtml(el.innerHTML);
    syncEmpty(el);
    touch(activePage());
    updateEdited();
    const shortcut = M.shortcutFor(el.textContent.replace(/\u00a0/g, " "));
    if (shortcut && caretAt(el, "end")) {
      applyShortcut(block, shortcut);
      return;
    }
    updateSlash(el, block);
  }

  function onKeyDown(event) {
    if (event.isComposing || composing) return;
    const command = (event.metaKey || event.ctrlKey) && !event.altKey;
    if (command && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (command && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
      return;
    }

    const content = event.target.closest ? event.target.closest(".content") : null;
    if (slash.open && content) {
      if (event.key === "ArrowDown") { event.preventDefault(); slash.index += 1; renderSlash(content); return; }
      if (event.key === "ArrowUp") { event.preventDefault(); slash.index = Math.max(0, slash.index - 1); renderSlash(content); return; }
      if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); applySlash(); return; }
      if (event.key === "Escape") { event.preventDefault(); closeSlash(); return; }
    }
    if (content && command && event.key.toLowerCase() === "b") {
      event.preventDefault();
      document.execCommand("bold");
      return;
    }
    if (content && command && event.key.toLowerCase() === "i") {
      event.preventDefault();
      document.execCommand("italic");
      return;
    }
    if (event.target.classList && event.target.classList.contains("page-title") && event.key === "Enter") {
      event.preventDefault();
      const first = activePage().blocks[0];
      if (first) focusContent(first.id, "start");
      return;
    }
    if (!content) return;
    const block = blockById(content.closest(".block").dataset.blockId);
    if (!block) return;

    if (event.key === "Enter" && !event.shiftKey) {
      if (block.type === "code" && !command) {
        event.preventDefault();
        document.execCommand("insertLineBreak");
        return;
      }
      event.preventDefault();
      splitBlock(block, content);
      return;
    }
    if (event.key === "Backspace" && caretAt(content, "start")) {
      event.preventDefault();
      const text = content.textContent.replace(/\u00a0/g, " ");
      if (!text && block.type !== "paragraph" && block.type !== "code") {
        beforeStructural();
        block.type = "paragraph";
        block.content = M.sanitizeHtml(content.innerHTML);
        touch(activePage());
        render({ focusId: block.id });
        return;
      }
      mergeWithPrev(block, content);
      return;
    }
    if (event.key === "ArrowUp" && caretAt(content, "start")) {
      const blocks = activePage().blocks;
      const index = blocks.findIndex(function (item) { return item.id === block.id; });
      const prev = blocks[index - 1];
      if (prev && prev.type !== "divider" && prev.type !== "page") {
        event.preventDefault();
        focusContent(prev.id, "end");
      }
    }
    if (event.key === "ArrowDown" && caretAt(content, "end")) {
      const blocks = activePage().blocks;
      const index = blocks.findIndex(function (item) { return item.id === block.id; });
      const next = blocks[index + 1];
      if (next && next.type !== "divider" && next.type !== "page") {
        event.preventDefault();
        focusContent(next.id, "start");
      }
    }
  }

  function turnIntoItems(id) {
    return M.COMMANDS.map(function (command) {
      return {
        label: command.label,
        run: function () {
          const block = blockById(id);
          if (!block) return;
          beforeStructural();
          convertBlock(block, command.type);
        },
      };
    });
  }

  function bind() {
    app.addEventListener("input", onInput);
    app.addEventListener("keydown", onKeyDown);
    app.addEventListener("paste", onPaste);
    app.addEventListener("compositionstart", function () { composing = true; });
    app.addEventListener("compositionend", function (event) {
      composing = false;
      onInput(event);
    });
    document.getElementById("search").addEventListener("input", renderSidebar);

    app.addEventListener("click", function (event) {
      const opener = event.target.closest("[data-open]");
      if (opener && opener.dataset.open) {
        openPage(opener.dataset.open);
        return;
      }
      const actionNode = event.target.closest("[data-action]");
      if (!actionNode) return;
      const action = actionNode.dataset.action;
      if (action === "new-page") addPage(null);
      if (action === "subpage") addPage(actionNode.dataset.parent);
      if (action === "toggle-sidebar" || action === "close-sidebar") {
        sidebarOpen = action === "close-sidebar" ? false : !sidebarOpen;
        app.classList.toggle("sidebar-open", sidebarOpen);
      }
      if (action === "theme") {
        state.theme = state.theme === "dark" ? "light" : "dark";
        save();
        render();
      }
      if (action === "add") addBlockAfter(actionNode.dataset.id);
      if (action === "check") {
        const block = blockById(actionNode.dataset.id);
        if (!block) return;
        beforeStructural();
        block.checked = !block.checked;
        actionNode.closest(".block").dataset.checked = block.checked ? "true" : "false";
        actionNode.textContent = block.checked ? "✓" : "";
        actionNode.setAttribute("aria-pressed", String(block.checked));
        touch(activePage());
        updateEdited();
      }
      if (action === "menu") {
        const rect = actionNode.getBoundingClientRect();
        const id = actionNode.dataset.id;
        openMenu(rect.left, rect.bottom + 4, [
          { label: "Дублировать блок", run: function () { duplicateBlock(id); } },
          { label: "Удалить блок", danger: true, run: function () { deleteBlock(id); } },
        ].concat(turnIntoItems(id)));
      }
      if (action === "more") {
        const rect = actionNode.getBoundingClientRect();
        const id = activePage().id;
        openMenu(rect.right - 220, rect.bottom + 4, [
          { label: "Дублировать страницу", run: duplicatePage },
          { label: "Экспорт Markdown", run: downloadMarkdown },
          {
            label: "Удалить страницу",
            danger: true,
            run: function () {
              if (confirm("Удалить эту страницу и вложенные?")) removePage(id);
            },
          },
        ]);
      }
      if (action === "icon") openEmoji(actionNode);
      if (action === "cover") {
        const rect = actionNode.getBoundingClientRect();
        openMenu(rect.left, rect.bottom + 6, M.COVERS.map(function (cover) {
          return { label: COVER_LABELS[cover], run: function () { setCover(cover); } };
        }).concat([{ label: "Без обложки", run: function () { setCover(null); } }]));
      }
      if (action === "cover-remove") setCover(null);
    });

    document.getElementById("slash").addEventListener("mousedown", function (event) { event.preventDefault(); });
    document.getElementById("slash").addEventListener("click", function (event) {
      const button = event.target.closest("[data-slash]");
      if (!button) return;
      const commands = M.filterCommands(slash.query);
      slash.index = Math.max(0, commands.findIndex(function (command) { return command.type === button.dataset.slash; }));
      applySlash();
    });
    document.getElementById("menu").addEventListener("mousedown", function (event) { event.preventDefault(); });
    document.getElementById("menu").addEventListener("click", function (event) {
      const button = event.target.closest("[data-menu]");
      if (!button) return;
      const item = document.getElementById("menu")._items[Number(button.dataset.menu)];
      closeMenu();
      if (item) item.run();
    });
    document.getElementById("emoji").addEventListener("mousedown", function (event) { event.preventDefault(); });
    document.getElementById("emoji").addEventListener("click", function (event) {
      const button = event.target.closest("[data-emoji]");
      if (!button) return;
      beforeStructural();
      activePage().icon = button.dataset.emoji;
      touch(activePage());
      closeEmoji();
      render();
    });

    document.addEventListener("mousedown", function (event) {
      if (!event.target.closest("#slash") && !event.target.closest(".content")) closeSlash();
      if (!event.target.closest("#menu") && !event.target.closest("[data-action='menu']") && !event.target.closest("[data-action='more']") && !event.target.closest("[data-action='cover']")) closeMenu();
      if (!event.target.closest("#emoji") && !event.target.closest("[data-action='icon']")) closeEmoji();
    });

    document.getElementById("scroller").addEventListener("click", function (event) {
      if (event.target.id !== "scroller" && event.target.id !== "page" && !event.target.classList.contains("blocks")) return;
      const blocks = activePage().blocks;
      const last = blocks[blocks.length - 1];
      if (!last) return;
      if (last.type === "paragraph") focusContent(last.id, "end");
      else addBlockAfter(last.id);
    });

    app.addEventListener("dragstart", function (event) {
      const handle = event.target.closest(".handle");
      if (!handle) return;
      dragId = handle.dataset.id;
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", dragId);
      handle.closest(".block").classList.add("dragging");
      app.classList.add("dragging");
    });
    app.addEventListener("dragover", function (event) {
      const block = event.target.closest(".block");
      if (!dragId || !block) return;
      event.preventDefault();
      const rect = block.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      document.querySelectorAll(".block").forEach(function (node) { node.classList.remove("drop-before", "drop-after"); });
      if (block.dataset.blockId !== dragId) block.classList.add(after ? "drop-after" : "drop-before");
    });
    app.addEventListener("drop", function (event) {
      const block = event.target.closest(".block");
      if (!dragId || !block) return;
      event.preventDefault();
      const place = block.classList.contains("drop-after") ? "after" : "before";
      const targetId = block.dataset.blockId;
      if (targetId !== dragId) {
        const page = activePage();
        beforeStructural();
        page.blocks = M.moveBlock(page.blocks, dragId, targetId, place);
        touch(page);
        render();
      }
      dragId = null;
      app.classList.remove("dragging");
    });
    app.addEventListener("dragend", function () {
      dragId = null;
      app.classList.remove("dragging");
      document.querySelectorAll(".block").forEach(function (node) {
        node.classList.remove("dragging", "drop-before", "drop-after");
      });
    });
  }

  renderShell();
  bind();
  render({ scrollTop: true });
})();
