import type { DbmlSchema, DbmlTable, DbmlColumn, DbmlRelationship } from "./types";

/**
 * Minimal DBML parser supporting:
 *   Table name [alias] { column type [pk] [unique] [not null] [note '...'] [ref: > table.column] }
 *   // comments
 *   Ref: table.column > table.column
 *   Table note '...'
 *   enum blocks (skipped)
 */

function stripComments(src: string): string {
  // Remove // line comments and /* */ block comments
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (src[i] === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
    } else {
      out += src[i];
      i++;
    }
  }
  return out;
}

function parseColumnLine(line: string, inTable: string): { col: DbmlColumn; rel?: DbmlRelationship } | null {
  line = line.trim();
  if (!line) return null;

  // DBML column syntax: name type [modifier1, modifier2, ...]
  // The type is everything between the name and the first '[' bracket section.
  // e.g. "user_id integer [not null, ref: > users.id]"
  //   name = "user_id", type = "integer", modifiers = "not null, ref: > users.id"
  const m = line.match(/^(\[?[\w.]+\]?)\s+([^\[]+)(\[.*\])?/);
  if (!m) return null;
  const colName = m[1].replace(/[\[\]]/g, "");
  const colType = m[2].trim();
  const modifierStr = m[3] ? m[3].slice(1, -1) : ""; // remove outer [ ]

  const col: DbmlColumn = { name: colName, type: colType };

  // Split modifiers by comma, but respect quotes and ref: syntax
  const tokens = splitModifiers(modifierStr);

  let rel: DbmlRelationship | undefined;
  let k = 0;
  while (k < tokens.length) {
    const t = tokens[k].trim();
    const tl = t.toLowerCase();
    if (tl === "pk") { col.pk = true; k++; continue; }
    if (tl === "unique") { col.unique = true; k++; continue; }
    if (tl === "not null") { col.notNull = true; k++; continue; }
    if (tl === "null") { k++; continue; }
    if (tl === "fk") { col.fk = true; k++; continue; }
    if (tl === "increment" || tl === "incremental") { k++; continue; }
    if (tl === "default") { k++; continue; }
    if (tl.startsWith("default:")) { k++; continue; }
    if (tl === "note") { k++; continue; }
    if (tl.startsWith("note:")) { k++; continue; }
    if (tl.startsWith("note '") || tl.startsWith("note'")) {
      const nm = t.match(/note\s*'([^']*)'/i);
      if (nm) col.notes = nm[1];
      k++; continue;
    }
    if (tl.startsWith("ref:")) {
      // ref: > table.column  or ref: < table.column
      const refStr = t;
      const refMatch = refStr.match(/ref:\s*([<>])?\s*([^\s.]+)\.([^\s.]+)/i);
      if (refMatch) {
        col.refTable = refMatch[2].replace(/[\[\]]/g, "");
        col.refColumn = refMatch[3].replace(/[\[\]]/g, "");
        col.fk = true;
        rel = {
          fromTable: inTable,
          fromColumn: col.name,
          toTable: col.refTable,
          toColumn: col.refColumn,
        };
      }
      break;
    }
    k++;
  }

  return { col, rel };
}

// Split modifier string by commas, respecting quotes and angle brackets in refs
function splitModifiers(str: string): string[] {
  const result: string[] = [];
  let buf = "";
  let inStr = false;
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === "'") inStr = !inStr;
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && !inStr && depth === 0) {
      if (buf.trim()) result.push(buf.trim());
      buf = "";
    } else {
      buf += c;
    }
  }
  if (buf.trim()) result.push(buf.trim());
  return result;
}

function extractNote(tokens: string[], startIdx: number): { note: string; next: number } | null {
  // Reconstruct the note string starting at tokens[startIdx]
  const remainder = tokens.slice(startIdx).join(" ");
  const m = remainder.match(/^'([^']*)'/);
  if (m) return { note: m[1], next: startIdx + 1 };
  return null;
}

export function parseDbml(src: string): DbmlSchema {
  const tables: DbmlTable[] = [];
  const relationships: DbmlRelationship[] = [];
  const cleaned = stripComments(src);

  let i = 0;
  const text = cleaned;

  while (i < text.length) {
    // Skip whitespace
    while (i < text.length && /\s/.test(text[i])) i++;
    if (i >= text.length) break;

    // Detect "Ref:" standalone lines
    const refLineEnd = text.indexOf("\n", i);
    const line = text.slice(i, refLineEnd === -1 ? undefined : refLineEnd).trim();
    if (/^ref:/i.test(line)) {
      const m = line.match(/ref:\s*([<>]?)\s*([^\s.]+)\.([^\s.]+)\s+-?\s*([<>]?)\s*([^\s.]+)\.([^\s.]+)/i);
      if (m) {
        relationships.push({
          fromTable: m[2].replace(/[\[\]]/g, ""),
          fromColumn: m[3].replace(/[\[\]]/g, ""),
          toTable: m[5].replace(/[\[\]]/g, ""),
          toColumn: m[6].replace(/[\[\]]/g, ""),
        });
      }
      i = refLineEnd === -1 ? text.length : refLineEnd + 1;
      continue;
    }

    // Detect "enum" blocks - skip them
    if (/^enum\b/i.test(line)) {
      const braceStart = text.indexOf("{", i);
      const braceEnd = text.indexOf("}", braceStart);
      i = braceEnd === -1 ? text.length : braceEnd + 1;
      continue;
    }

    // Detect "Table" keyword
    const tableMatch = text.slice(i).match(/^(Table|table)\s+(\[?[\w]+\]?)/);
    if (tableMatch) {
      let p = i + tableMatch[0].length;
      const tableName = tableMatch[2].replace(/[\[\]]/g, "");

      // Optional alias
      let alias: string | undefined;
      let afterName = text.slice(p).trimStart();
      const aliasMatch = afterName.match(/^(\[?[\w]+\]?)\s*\{/);
      if (aliasMatch && aliasMatch[1].toLowerCase() !== tableName.toLowerCase()) {
        // It might be an alias OR could be "as" keyword
        // Actually dbdiagram syntax: Table name [alias] { ... }
        // But also: Table name { ... }
        // Check: if the next token before { is not { itself, treat as alias
        if (!afterName.startsWith("{")) {
          alias = aliasMatch[1].replace(/[\[\]]/g, "");
          p += aliasMatch[0].length;
        }
      }

      // Find opening brace
      const braceStart = text.indexOf("{", p);
      if (braceStart === -1) { i = text.length; break; }
      const braceEnd = findClosingBrace(text, braceStart);
      if (braceEnd === -1) { i = text.length; break; }

      const body = text.slice(braceStart + 1, braceEnd);
      const table: DbmlTable = { name: tableName, alias, columns: [] };

      // Parse table header settings: [headercolor: #xxx]
      const headerMatch = text.slice(i, braceStart).match(/headercolor:\s*['"]?(#[0-9a-fA-F]{3,8})/i);

      // Parse body lines
      const bodyLines = splitBodyLines(body);
      for (const bl of bodyLines) {
        const trimmed = bl.trim();
        if (!trimmed) continue;
        if (/^note\b/i.test(trimmed)) {
          // Table note '...'
          const nm = trimmed.match(/note\s+'([^']*)'/i);
          if (nm) table.note = nm[1];
          continue;
        }
        if (/^headercolor/i.test(trimmed)) continue;
        const parsed = parseColumnLine(trimmed, tableName);
        if (parsed) {
          table.columns.push(parsed.col);
          if (parsed.rel) relationships.push(parsed.rel);
        }
      }

      if (headerMatch) table.headerColor = headerMatch[1];
      tables.push(table);
      i = braceEnd + 1;
      continue;
    }

    // Skip unknown lines
    const nl = text.indexOf("\n", i);
    i = nl === -1 ? text.length : nl + 1;
  }

  return { tables, relationships };
}

/** Comment out a table block without discarding its DBML, so canvas deletion is reversible. */
export function commentOutDbmlTable(source: string, tableName: string): string {
  const header = /^[\t ]*Table\s+\[?([\w]+)\]?/gim;
  let match: RegExpExecArray | null;
  while ((match = header.exec(source)) !== null) {
    if (match[1].toLowerCase() !== tableName.toLowerCase()) continue;
    const openBrace = source.indexOf("{", match.index + match[0].length);
    if (openBrace < 0) return source;
    let depth = 0;
    let quote: "'" | '"' | null = null;
    let lineComment = false;
    let blockComment = false;
    let closeBrace = -1;
    for (let i = openBrace; i < source.length; i++) {
      const char = source[i];
      const next = source[i + 1];
      if (lineComment) {
        if (char === "\n") lineComment = false;
        continue;
      }
      if (blockComment) {
        if (char === "*" && next === "/") { blockComment = false; i++; }
        continue;
      }
      if (quote) {
        if (char === quote && source[i - 1] !== "\\") quote = null;
        continue;
      }
      if (char === "'" || char === '"') { quote = char; continue; }
      if (char === "/" && next === "/") { lineComment = true; i++; continue; }
      if (char === "/" && next === "*") { blockComment = true; i++; continue; }
      if (char === "{") depth++;
      if (char === "}" && --depth === 0) { closeBrace = i; break; }
    }
    if (closeBrace < 0) return source;
    const start = source.lastIndexOf("\n", match.index - 1) + 1;
    const lineAfterBlock = source.indexOf("\n", closeBrace);
    const end = lineAfterBlock < 0 ? source.length : lineAfterBlock + 1;
    const block = source.slice(start, end).replace(/^([\t ]*)(\S.*)$/gm, "$1// $2");
    return source.slice(0, start) + block + source.slice(end);
  }
  return source;
}

function findClosingBrace(text: string, openIdx: number): number {
  let depth = 0;
  for (let j = openIdx; j < text.length; j++) {
    if (text[j] === "{") depth++;
    else if (text[j] === "}") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

function splitBodyLines(body: string): string[] {
  const lines: string[] = [];
  let buf = "";
  let inStr = false;
  let depth = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'") inStr = !inStr;
    if (c === "{" && !inStr) depth++;
    if (c === "}" && !inStr) depth--;
    if (c === "\n" && !inStr && depth === 0) {
      lines.push(buf);
      buf = "";
    } else {
      buf += c;
    }
  }
  if (buf.trim()) lines.push(buf);
  return lines;
}

export const DEFAULT_DBML = `// Welcome to your database schema canvas!
// Edit this code to generate table cards on the canvas.
// You can drag the table cards around and draw freely.

Table users {
  id integer [pk, not null]
  email varchar [unique, not null]
  name varchar [not null]
  created_at timestamp [not null]
}

Table posts {
  id integer [pk, not null]
  user_id integer [not null, ref: > users.id]
  title varchar [not null]
  body text
  published boolean [not null]
  created_at timestamp [not null]
}

Table comments {
  id integer [pk, not null]
  post_id integer [not null, ref: > posts.id]
  user_id integer [not null, ref: > users.id]
  body text [not null]
  created_at timestamp [not null]
}
`;
