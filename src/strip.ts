// Removes comments (and optionally string contents) from JS/TS source code,
// so the scanner doesn't flag deprecated methods that are only *mentioned*.
//
// Removed characters are replaced with spaces, and newlines are kept.
// That way every character stays at the same position and on the same line,
// so line numbers in the report are still correct.
//
// This is a small hand-written state machine, not a full parser. Known gaps:
//  - Regex literals like /"/ or /\/\// can confuse it, because it can't
//    always tell a regex from division. The damage stops at the end of the line.
//  - A lone apostrophe in JSX text (<p>Don't</p>) looks like a string start.
//    An unclosed string also stops at the end of the line.

export interface StrippedSource {
  /** Comments AND string contents blanked. Use for method-call patterns. */
  code: string;
  /** Only comments blanked; string contents kept. Use for URL/name patterns. */
  codeWithStrings: string;
}

type Mode = "code" | "lineComment" | "blockComment" | "string" | "template";

export function stripSource(src: string): StrippedSource {
  const code: string[] = [];
  const withStrings: string[] = [];

  let mode: Mode = "code";
  let quote = ""; // which quote opened the current string: ' or "

  // Template literals can contain code: `hi ${name}`. Each number on this
  // stack counts open { braces inside one ${ ... } so we know which } ends it.
  const templateStack: number[] = [];

  // Helpers to write one character to each output.
  const keep = (ch: string) => {
    code.push(ch);
    withStrings.push(ch);
  };
  const blankBoth = (ch: string) => {
    const b = isNewline(ch) ? ch : " ";
    code.push(b);
    withStrings.push(b);
  };
  const stringChar = (ch: string) => {
    // Inside a string: hide it from `code`, keep it in `withStrings`.
    code.push(isNewline(ch) ? ch : " ");
    withStrings.push(ch);
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];

    switch (mode) {
      case "code":
        if (ch === "/" && next === "/") {
          mode = "lineComment";
          blankBoth(ch);
        } else if (ch === "/" && next === "*") {
          mode = "blockComment";
          blankBoth(ch);
          blankBoth(next);
          i++; // skip the '*' so "/*/" isn't read as open-and-close
        } else if (ch === "'" || ch === '"') {
          mode = "string";
          quote = ch;
          keep(ch);
        } else if (ch === "`") {
          mode = "template";
          keep(ch);
        } else if (ch === "{" && templateStack.length > 0) {
          templateStack[templateStack.length - 1]++;
          keep(ch);
        } else if (ch === "}" && templateStack.length > 0) {
          const top = templateStack.length - 1;
          if (templateStack[top] === 0) {
            // This } closes a ${ ... } so we're back inside the template text.
            templateStack.pop();
            mode = "template";
          } else {
            templateStack[top]--;
          }
          keep(ch);
        } else {
          keep(ch);
        }
        break;

      case "lineComment":
        if (isNewline(ch)) mode = "code";
        blankBoth(ch);
        break;

      case "blockComment":
        if (ch === "*" && next === "/") {
          blankBoth(ch);
          blankBoth(next);
          i++;
          mode = "code";
        } else {
          blankBoth(ch);
        }
        break;

      case "string":
        if (ch === "\\" && next !== undefined) {
          // Escaped character like \" so it doesn't end the string.
          stringChar(ch);
          stringChar(next);
          i++;
        } else if (ch === quote) {
          keep(ch);
          mode = "code";
        } else if (isNewline(ch)) {
          // Normal strings can't span lines; treat this as the end.
          keep(ch);
          mode = "code";
        } else {
          stringChar(ch);
        }
        break;

      case "template":
        if (ch === "\\" && next !== undefined) {
          stringChar(ch);
          stringChar(next);
          i++;
        } else if (ch === "`") {
          keep(ch);
          mode = "code";
        } else if (ch === "$" && next === "{") {
          // Start of an embedded expression: that part is real code.
          keep(ch);
          keep(next);
          i++;
          templateStack.push(0);
          mode = "code";
        } else {
          stringChar(ch);
        }
        break;
    }
  }

  return { code: code.join(""), codeWithStrings: withStrings.join("") };
}

function isNewline(ch: string): boolean {
  return ch === "\n" || ch === "\r";
}
