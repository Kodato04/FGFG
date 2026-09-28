(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.LeafModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const COMMANDS = [
    { type: "paragraph", label: "Текст", hint: "Обычный абзац", keys: "текст text paragraph" },
    { type: "h1", label: "Заголовок 1", hint: "Крупный заголовок", keys: "заголовок heading h1" },
    { type: "h2", label: "Заголовок 2", hint: "Средний заголовок", keys: "заголовок heading h2" },
    { type: "h3", label: "Заголовок 3", hint: "Небольшой заголовок", keys: "заголовок heading h3" },
    { type: "bullet", label: "Маркированный список", hint: "Список с точками", keys: "список bullet list ul" },
    { type: "numbered", label: "Нумерованный список", hint: "Список с номерами", keys: "список numbered ol" },
    { type: "todo", label: "Чекбокс", hint: "Задача", keys: "todo task checkbox задача чекбокс" },
    { type: "quote", label: "Цитата", hint: "Выделенная цитата", keys: "quote цитата" },
    { type: "callout", label: "Выноска", hint: "Заметка с акцентом", keys: "callout выноска заметка" },
    { type: "code", label: "Код", hint: "Фрагмент кода", keys: "code код" },
    { type: "divider", label: "Разделитель", hint: "Горизонтальная линия", keys: "divider hr линия" },
    { type: "page", label: "Страница", hint: "Новая вложенная страница", keys: "page subpage страница" },
  ];

  const COVERS = ["warm", "sage", "sky", "dusk", "ink"];

  function uid() {
    try {
      if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    } catch (error) {}
    return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function emptyBlock(type) {
    return {
      id: uid(),
      type: type || "paragraph",
      content: "",
      checked: false,
      pageId: null,
    };
  }

  function createPage(partial) {
    const src = partial || {};
    const now = Date.now();
    return {
      id: src.id || uid(),
      title: src.title || "",
      icon: src.icon == null ? "📄" : src.icon,
      cover: src.cover || null,
      parentId: src.parentId || null,
      createdAt: src.createdAt || now,
      updatedAt: src.updatedAt || now,
      blocks: src.blocks && src.blocks.length ? src.blocks : [emptyBlock()],
    };
  }

  function seedState() {
    const welcomeId = uid();
    const guideId = uid();
    const ideasId = uid();
    const now = Date.now();
    return {
      activePageId: welcomeId,
      theme: "light",
      pages: [
        createPage({
          id: welcomeId,
          title: "Добро пожаловать",
          icon: "🌱",
          cover: "sage",
          createdAt: now,
          updatedAt: now,
          blocks: [
            block("paragraph", "Это <strong>Лист</strong> — лёгкие заметки в духе Notion. Всё хранится в этом браузере."),
            block("callout", "Введите <code>/</code> в строке, чтобы открыть меню блоков."),
            block("h2", "Что можно делать"),
            block("bullet", "Писать текст, заголовки, списки и цитаты"),
            block("bullet", "Отмечать задачи чекбоксами"),
            block("bullet", "Собирать вложенные страницы"),
            block("todo", "Сменить значок страницы"),
            block("todo", "Попробовать тёмную тему", true),
            block("quote", "Enter создаёт новый блок. Backspace в начале строки сливает его с предыдущим."),
            Object.assign(emptyBlock("page"), { pageId: guideId }),
            emptyBlock(),
          ],
        }),
        createPage({
          id: guideId,
          parentId: welcomeId,
          title: "Как пользоваться",
          icon: "📖",
          createdAt: now,
          updatedAt: now,
          blocks: [
            block("h2", "Быстрые команды"),
            block("bullet", "<code>/</code> — меню блоков"),
            block("bullet", "<code>#</code> , <code>##</code> , <code>###</code> и пробел — заголовки"),
            block("bullet", "<code>-</code> и пробел — список, <code>[]</code> и пробел — чекбокс"),
            block("bullet", "<code>&gt;</code> и пробел — цитата, <code>---</code> — разделитель"),
            block("code", "const note = \"привет\";"),
            emptyBlock("divider"),
            block("paragraph", "Ctrl+B или ⌘B — жирный, Ctrl+I — курсив. Ctrl+Z отменяет действие."),
          ],
        }),
        createPage({
          id: ideasId,
          title: "Идеи",
          icon: "💡",
          cover: "sky",
          createdAt: now,
          updatedAt: now,
          blocks: [
            block("todo", "Собрать список покупок"),
            block("todo", "Набросать план на неделю", true),
            emptyBlock(),
          ],
        }),
      ],
    };
  }

  function block(type, content, checked) {
    return Object.assign(emptyBlock(type), {
      content: content || "",
      checked: Boolean(checked),
    });
  }

  function escapeText(value) {
    return String(value).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function cleanTag(full) {
    const matched = /^<\/?([a-zA-Z0-9]+)/.exec(full);
    if (!matched) return null;
    const tag = matched[1].toLowerCase();
    const closing = full.charAt(1) === "/";
    if (["strong", "b", "em", "i", "u", "s", "code"].indexOf(tag) !== -1) {
      return closing ? "</" + tag + ">" : "<" + tag + ">";
    }
    if (tag === "a") {
      if (closing) return "</a>";
      const hrefMatch = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(full);
      const href = hrefMatch ? hrefMatch[1] || hrefMatch[2] || hrefMatch[3] || "" : "";
      if (!/^https?:\/\//i.test(href)) return null;
      return '<a href="' + href.replace(/"/g, "&quot;") + '" target="_blank" rel="noopener noreferrer">';
    }
    return null;
  }

  function sanitizeHtml(html) {
    let source = String(html == null ? "" : html);
    source = source.replace(/<!--[\s\S]*?-->/g, "");
    source = source.replace(/<(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\/\1>/gi, "");
    source = source.replace(/<(script|style|iframe|object|embed)[^>]*\/?>/gi, "");
    source = source.replace(/<div[^>]*>/gi, "\u0000BR\u0000");
    source = source.replace(/<\/div>/gi, "");
    source = source.replace(/<p[^>]*>/gi, "\u0000BR\u0000");
    source = source.replace(/<\/p>/gi, "");
    source = source.replace(/<br\s*\/?>/gi, "\u0000BR\u0000");

    const kept = [];
    source = source.replace(/<\/?[a-zA-Z][^>]*>/g, function (full) {
      const token = cleanTag(full);
      if (!token) return "";
      const id = kept.length;
      kept.push(token);
      return "\u0000T" + id + "\u0000";
    });
    source = escapeText(source);
    source = source.replace(/\u0000BR\u0000/g, "<br>");
    source = source.replace(/\u0000T(\d+)\u0000/g, function (_, id) {
      return kept[Number(id)];
    });
    source = source.replace(/<\/a>/gi, function (match, offset, str) {
      const prev = str.slice(0, offset);
      const opens = (prev.match(/<a\b/gi) || []).length;
      const closes = (prev.match(/<\/a>/gi) || []).length;
      return opens > closes ? match : "";
    });
    source = source.replace(/^(?:<br>)+/, "");
    if (source === "<br>") return "";
    return source;
  }

  function decodeEntities(value) {
    return String(value)
      .replace(/&nbsp;/gi, " ")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/gi, "&");
  }

  function htmlToText(html) {
    return decodeEntities(
      sanitizeHtml(html)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
    );
  }

  function inlineMarkdown(html) {
    let source = sanitizeHtml(html);
    source = source.replace(/<(strong|b)>/gi, "**").replace(/<\/(strong|b)>/gi, "**");
    source = source.replace(/<(em|i)>/gi, "*").replace(/<\/(em|i)>/gi, "*");
    source = source.replace(/<code>/gi, "`").replace(/<\/code>/gi, "`");
    source = source.replace(/<br\s*\/?>/gi, "\n");
    source = source.replace(/<a [^>]*href="([^"]+)"[^>]*>/gi, function (_, href) {
      return href + " ";
    });
    source = source.replace(/<\/a>/gi, "");
    source = source.replace(/<\/?(u|s)>/gi, "");
    source = source.replace(/<[^>]+>/g, "");
    return decodeEntities(source);
  }

  function shortcutFor(text) {
    const value = String(text || "").replace(/\u00a0/g, " ");
    if (/^###\s$/.test(value)) return "h3";
    if (/^##\s$/.test(value)) return "h2";
    if (/^#\s$/.test(value)) return "h1";
    if (/^[-*]\s$/.test(value)) return "bullet";
    if (/^1\.\s$/.test(value)) return "numbered";
    if (/^\[\]\s$/.test(value) || /^\[ \]\s$/.test(value)) return "todo";
    if (/^>\s$/.test(value)) return "quote";
    if (/^```$/.test(value)) return "code";
    if (/^---$/.test(value)) return "divider";
    return null;
  }

  function filterCommands(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return COMMANDS.slice();
    return COMMANDS.filter(function (command) {
      return (command.label + " " + command.hint + " " + command.keys + " " + command.type)
        .toLowerCase()
        .indexOf(q) !== -1;
    });
  }

  function exportPageMarkdown(page, pages) {
    const lines = ["# " + (page.title || "Без названия"), ""];
    let number = 1;
    (page.blocks || []).forEach(function (blockItem) {
      if (blockItem.type !== "numbered") number = 1;
      const text = inlineMarkdown(blockItem.content || "");
      switch (blockItem.type) {
        case "h1":
          lines.push("# " + text, "");
          break;
        case "h2":
          lines.push("## " + text, "");
          break;
        case "h3":
          lines.push("### " + text, "");
          break;
        case "bullet":
          lines.push("- " + text, "");
          break;
        case "numbered":
          lines.push(number + ". " + text, "");
          number += 1;
          break;
        case "todo":
          lines.push("- [" + (blockItem.checked ? "x" : " ") + "] " + text, "");
          break;
        case "quote":
        case "callout":
          lines.push("> " + text, "");
          break;
        case "code":
          lines.push("```", htmlToText(blockItem.content || ""), "```", "");
          break;
        case "divider":
          lines.push("---", "");
          break;
        case "page": {
          const linked = (pages || []).filter(function (item) {
            return item.id === blockItem.pageId;
          })[0];
          lines.push("[[" + (linked ? linked.title || "Без названия" : "Страница") + "]]", "");
          break;
        }
        default:
          lines.push(text, "");
      }
    });
    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  function moveBlock(blocks, fromId, toId, place) {
    const next = blocks.slice();
    const from = next.findIndex(function (item) { return item.id === fromId; });
    if (from < 0 || fromId === toId) return next;
    const item = next.splice(from, 1)[0];
    let dest = next.findIndex(function (entry) { return entry.id === toId; });
    if (dest < 0) return blocks.slice();
    if (place === "after") dest += 1;
    next.splice(dest, 0, item);
    return next;
  }

  function pageMatches(page, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    if ((page.title || "").toLowerCase().indexOf(q) !== -1) return true;
    return (page.blocks || []).some(function (blockItem) {
      return htmlToText(blockItem.content || "").toLowerCase().indexOf(q) !== -1;
    });
  }

  return {
    COMMANDS: COMMANDS,
    COVERS: COVERS,
    uid: uid,
    emptyBlock: emptyBlock,
    createPage: createPage,
    seedState: seedState,
    sanitizeHtml: sanitizeHtml,
    htmlToText: htmlToText,
    inlineMarkdown: inlineMarkdown,
    shortcutFor: shortcutFor,
    filterCommands: filterCommands,
    exportPageMarkdown: exportPageMarkdown,
    moveBlock: moveBlock,
    pageMatches: pageMatches,
  };
});
