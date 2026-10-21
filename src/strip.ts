// Removes comments (and optionally string contents) from JS/TS source code,
// so the scanner doesn't flag deprecated methods that are only *mentioned*.
//
// Removed characters are replaced with spaces, and newlines are kept.
// That way every character stays at the same position and on the same line,
// so line numbers in the report are still correct.
//
// This is a small hand-written state machine, not a full parser. It can't
// tell a regex literal from division, and it doesn't understand JSX text, so
// quote characters in those places are misread. Known gaps:
//  - A quote (' or ") in a regex like /"/ or in JSX text like <p>Don't</p>
//    looks like the start of a string. Normal strings can't span lines, so
//    the damage stops at the end of that line.
//  - A regex containing // (like /\/\//) looks like a line comment. The rest
//    of that line is hidden.
//  - A stray backtick (/`/ in a regex, <p>Run `npm i</p> in JSX) looks like
//    the start of a template literal, which CAN span lines. Safety net: if the
//    file ends while still inside a template, stripSource re-processes it with
//    that backtick treated as plain code, so the rest of the file is scanned.
//    The net only catches templates still open at the end of the file. If a
//    later backtick (in a real template or a string like "`") pairs up with
//    the stray one, the code between the two is still hidden.
//  - A regex containing /* (like /\/*/) looks like the start of a block
//    comment, which hides code until the next */ (possibly many lines later).

export interface StrippedSource {
  /** Comments AND string contents blanked. Use for method-call patterns. */
  code: string;
  /** Only comments blanked; string contents kept. Use for URL/name patterns. */
  codeWithStrings: string;
}

type Mode = "code" | "lineComment" | "blockComment" | "string" | "template";

export function stripSource(src: string): StrippedSource {
  // Safety net for stray backticks, like /`/ in a regex or <p>Run `npm i</p>
  // in JSX. A stray backtick opens a "template" that never closes, which would
  // hide the rest of the file. So if a pass ends while still inside a
  // template, we mark the backtick that opened it as a plain character and
  // run the pass again. Each retry marks one more backtick, so this always ends.
  const plainBackticks = new Set<number>();

  while (true) {
    const pass = stripOnce(src, plainBackticks);
    if (pass.unclosedTemplateStart === null) return pass.result;
    plainBackticks.add(pass.unclosedTemplateStart);
  }
}

interface Pass {
  result: StrippedSource;
  /** Position of the backtick that opened a template still open at the end of the file, or null. */
  unclosedTemplateStart: number | null;
}

/**
 * One pass over the source. Backticks at positions in `plainBackticks` are
 * treated as ordinary code characters instead of starting a template.
 */
function stripOnce(src: string, plainBackticks: Set<number>): Pass {
  const code: string[] = [];
  const withStrings: string[] = [];

  let mode: Mode = "code";
  let quote = ""; // which quote opened the current string: ' or "

  // Template literals can contain code: `hi ${name}`. Each number on this
  // stack counts open { braces inside one ${ ... } so we know which } ends it.
  const templateStack: number[] = [];

  // Where each currently open template started (its opening backtick).
  // Templates can nest through ${ ... }, so this is a stack too.
  const openTemplateStarts: number[] = [];

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
        } else if (ch === "`" && !plainBackticks.has(i)) {
          mode = "template";
          openTemplateStarts.push(i);
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
          openTemplateStarts.pop();
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

  // Still inside template text at the end of the file? Report which backtick
  // opened that template, so stripSource can retry with it treated as plain code.
  const unclosedTemplateStart =
    mode === "template" ? openTemplateStarts[openTemplateStarts.length - 1] : null;

  return {
    result: { code: code.join(""), codeWithStrings: withStrings.join("") },
    unclosedTemplateStart,
  };
}

function isNewline(ch: string): boolean {
  return ch === "\n" || ch === "\r";
}
