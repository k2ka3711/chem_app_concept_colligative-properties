// 1ファイルのアプリを作る：node tools/build.mjs [artifact-out.html]
// - index.html：完成したページ（そのまま開く／GitHub Pages で公開する）
// - 2つ目のファイル（任意）：<html>/<head>/<body> を除いた同じページ（claude.ai のアーティファクト用）
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const strip = (js) => js.replace(/\nif \(typeof module[^\n]*\n?/, "\n");

const html = read("src/app.html")
  .replace("/*@MODEL*/", () => strip(read("src/model.js")))
  .replace("@SCHOLA_B64@", () => readFileSync(join(root, "fonts/texgyreschola-italic-subset.ttf")).toString("base64"));

writeFileSync(join(root, "index.html"), html.replace(/[ \t]*<!--@ARTIFACT-[A-Z-]+-->\n/g, ""));
console.log("wrote index.html", (html.length / 1024).toFixed(0) + " KB");

const out = process.argv[2];
if (out) {
  const cut = (a, b) => html.slice(html.indexOf(a) + a.length, html.indexOf(b));
  const art = cut("<!--@ARTIFACT-START-->", "<!--@ARTIFACT-HEAD-END-->") + cut("<!--@ARTIFACT-BODY-START-->", "<!--@ARTIFACT-END-->");
  writeFileSync(out, art.trim() + "\n");
  console.log("wrote", out);
}
