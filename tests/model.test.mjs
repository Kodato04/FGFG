import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const M = require("../js/model.js");

test("sanitize keeps basic formatting and drops scripts", () => {
  assert.equal(M.sanitizeHtml("<b onclick=\"alert(1)\">hi</b>"), "<b>hi</b>");
  assert.equal(M.sanitizeHtml("<script>alert(1)</script><em>ok</em>"), "<em>ok</em>");
  assert.equal(M.sanitizeHtml('<a href="javascript:alert(1)">x</a>'), "x");
  assert.equal(
    M.sanitizeHtml('<a href="https://example.com">site</a>'),
    '<a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a>'
  );
  assert.equal(M.sanitizeHtml("1 < 2"), "1 &lt; 2");
});

test("markdown shortcuts recognize the marker and the following space", () => {
  assert.equal(M.shortcutFor("# "), "h1");
  assert.equal(M.shortcutFor("## "), "h2");
  assert.equal(M.shortcutFor("[] "), "todo");
  assert.equal(M.shortcutFor("---"), "divider");
  assert.equal(M.shortcutFor("# hello"), null);
});

test("slash filter matches russian and english names", () => {
  assert.equal(M.filterCommands("").length, M.COMMANDS.length);
  assert.deepEqual(M.filterCommands("код").map((item) => item.type), ["code"]);
  assert.ok(M.filterCommands("heading").some((item) => item.type === "h1"));
});

test("export and block move keep document order", () => {
  const page = M.createPage({
    title: "План",
    blocks: [
      Object.assign(M.emptyBlock("todo"), { id: "a", content: "Купить хлеб", checked: true }),
      Object.assign(M.emptyBlock("numbered"), { id: "b", content: "Первый" }),
      Object.assign(M.emptyBlock("numbered"), { id: "c", content: "<strong>Второй</strong>" }),
      Object.assign(M.emptyBlock("code"), { id: "d", content: "const n = 1;" }),
    ],
  });
  const markdown = M.exportPageMarkdown(page, []);
  assert.match(markdown, /^# План/);
  assert.match(markdown, /- \[x\] Купить хлеб/);
  assert.match(markdown, /1\. Первый/);
  assert.match(markdown, /2\. \*\*Второй\*\*/);
  assert.match(markdown, /```\nconst n = 1;\n```/);

  const moved = M.moveBlock(page.blocks, "a", "c", "after").map((item) => item.id);
  assert.deepEqual(moved, ["b", "c", "a", "d"]);
});

test("seed pages are linked and searchable", () => {
  const seed = M.seedState();
  const ids = seed.pages.map((page) => page.id);
  assert.equal(new Set(ids).size, ids.length);
  const welcome = seed.pages[0];
  const link = welcome.blocks.find((block) => block.type === "page");
  assert.ok(seed.pages.some((page) => page.id === link.pageId && page.parentId === welcome.id));
  assert.equal(M.pageMatches(welcome, "чекбокс"), true);
  assert.equal(M.pageMatches(welcome, "нет-такого-слова"), false);
});
