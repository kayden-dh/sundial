// Pulls the JavaScript out of HTML-like pages (.html, .htm, .php), so inline
// <script> blocks get scanned like a normal .js file.
//
// Everything outside <script> blocks is replaced with spaces (newlines kept),
// so line numbers in the report still match the original page. That also
// means PHP code and page text are ignored: Sundial only scans JS/TS.

/** File extensions whose inline <script> blocks we scan. */
export const PAGE_EXTENSIONS = new Set([".html", ".htm", ".php"]);

// <script ...attributes...> content </script>  (case-insensitive, lazy match
// so each block stops at its own closing tag).
const SCRIPT_BLOCK = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

// <!-- HTML comments -->; a script inside one is commented out and not run.
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

// PHP code: <?php ... ?> or <?= ... ?>. A file may end without "?>", so the
// block can also run to the end of the file ($ without the m flag = end of text).
// PHP can mention "<script>" in comments or strings, which must not count as a tag.
const PHP_BLOCK = /<\?[\s\S]*?(?:\?>|$)/g;

// Script types that browsers run as JavaScript. No type at all also means JS.
// Other types (application/json, text/template, ...) hold data, not code.
const JS_TYPE = /^(text\/javascript|application\/javascript|module|text\/babel|text\/jsx)$/i;

export function extractScripts(page: string): string {
  // Blank out PHP code and HTML comments first, so a "<script>" mentioned
  // there (or a <!-- <script>...</script> --> block) isn't treated as a real tag.
  const visible = page.replace(PHP_BLOCK, blank).replace(HTML_COMMENT, blank);

  // Start from an all-blank copy, then copy each script's content back in at
  // the same position.
  const out = blank(page).split("");

  for (const match of visible.matchAll(SCRIPT_BLOCK)) {
    const attributes = match[1];
    const content = match[2];

    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attributes)?.[1];
    if (type !== undefined && !JS_TYPE.test(type)) continue;

    // Where the content starts: after "<script" + attributes + ">".
    const contentStart = (match.index ?? 0) + match[0].indexOf(">") + 1;
    for (let i = 0; i < content.length; i++) {
      out[contentStart + i] = content[i];
    }
  }

  return out.join("");
}

/** Same length as `text`, all spaces except newlines. */
function blank(text: string): string {
  return text.replace(/[^\r\n]/g, " ");
}
