// ═══════════════════════════════════════════════════════════════
// Pure, side-effect-free utilities (testable without a DOM).
// ═══════════════════════════════════════════════════════════════

/**
 * AST-style context compression: folds function bodies, CSS rules and
 * <script>/<style> blocks so the model receives signatures instead of full code.
 * Returns the content unchanged for unsupported extensions.
 */
export function compressCodeContext(filename: string, content: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext !== 'js' && ext !== 'ts' && ext !== 'tsx' && ext !== 'jsx' && ext !== 'css' && ext !== 'html') {
    return content;
  }

  if (ext === 'css') {
    return content.replace(/([^{]+)\{[^}]*\}/g, '$1{ /* ... [folded, read with full="true"] ... */ }');
  }

  if (ext === 'html') {
    let temp = content.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, '<script>/* ... [folded JS code, read with full="true"] ... */</script>');
    temp = temp.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, '<style>/* ... [folded CSS code, read with full="true"] ... */</style>');
    return temp;
  }

  const lines = content.split('\n');
  let resultLines: string[] = [];
  let bracketDepth = 0;
  let inFold = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (inFold) {
      const openCount = (line.match(/\{/g) || []).length;
      const closeCount = (line.match(/\}/g) || []).length;
      bracketDepth += openCount - closeCount;
      if (bracketDepth <= 0) {
        bracketDepth = 0;
        inFold = false;
        resultLines.push(line.replace(/^.*?(}+)$/, '$1'));
      }
      continue;
    }

    const isInterfaceOrType = trimmed.startsWith('interface ') || trimmed.startsWith('type ');
    const isClassDecl = trimmed.startsWith('class ') || trimmed.includes(' class ');
    const isFunctionStart = (
      /^(export\s+)?(async\s+)?function\b/.test(trimmed) ||
      /^(private\s+|protected\s+|public\s+|static\s+|async\s+)*[a-zA-Z_]\w*\s*\(.*?\)\s*(:\s*\w+)?\s*\{/.test(trimmed) ||
      /\b(const|let|var)\s+\w+\s*=\s*(\(.*?\)|[a-zA-Z_]\w*)\s*=>\s*\{/.test(trimmed)
    ) && trimmed.endsWith('{') && !/\b(if|for|while|switch|catch)\b/.test(trimmed);

    if (isFunctionStart && !isInterfaceOrType && !isClassDecl) {
      const openCount = (line.match(/\{/g) || []).length;
      const closeCount = (line.match(/\}/g) || []).length;
      bracketDepth = openCount - closeCount;

      const sig = line.substring(0, line.indexOf('{') + 1);
      resultLines.push(sig + ' /* ... [folded body, read with full="true" to see details] ... */');

      if (bracketDepth > 0) {
        inFold = true;
      } else {
        resultLines[resultLines.length - 1] += ' }';
      }
    } else {
      resultLines.push(line);
    }
  }

  return resultLines.join('\n');
}

/**
 * Validates that brackets {}, [], () are balanced and correctly nested.
 * Pure function (no DOM) — used as the core of code syntax validation.
 */
export function checkBalancedBrackets(content: string): { valid: boolean; error?: string } {
  const stack: string[] = [];
  const opening = ['{', '[', '('];
  const closing = ['}', ']', ')'];
  const pairs: Record<string, string> = { '}': '{', ']': '[', ')': '(' };

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (opening.includes(char)) {
      stack.push(char);
    } else if (closing.includes(char)) {
      const top = stack.pop();
      if (top !== pairs[char]) {
        return { valid: false, error: `Несбалансированные скобки: ожидалась закрывающая для "${top || 'нет'}", но найдена "${char}" на позиции ${i}` };
      }
    }
  }
  if (stack.length > 0) {
    return { valid: false, error: `Несбалансированные скобки: отсутствуют закрывающие скобки для "${stack.join(', ')}"` };
  }
  return { valid: true };
}

/**
 * Parses XML-style tool tags out of an assistant message.
 * Returns a normalized list of { type, params } — pure, no DOM access.
 */
export interface ParsedTool {
  type: string;
  params: Record<string, any>;
  rawTag: string;
}

function parseToolAttrs(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRegex.exec(attrString)) !== null) {
    attrs[attrMatch[1]] = attrMatch[2] ?? attrMatch[3] ?? '';
  }
  return attrs;
}

export function parseToolTags(text: string): ParsedTool[] {
  const tools: ParsedTool[] = [];
  let match: RegExpExecArray | null;

  const rawReadDir = /<read_dir\b([^>]*)\s*(?:\/>|>\s*<\/read_dir>|>)/g;
  while ((match = rawReadDir.exec(text)) !== null) {
    const attrs = parseToolAttrs(match[1]);
    if (attrs.path) tools.push({ type: 'read_dir', params: { path: attrs.path }, rawTag: match[0] });
  }

  const rawReadFile = /<read_file\b([^>]*)\s*(?:\/>|>\s*<\/read_file>|>)/g;
  while ((match = rawReadFile.exec(text)) !== null) {
    const attrs = parseToolAttrs(match[1]);
    if (attrs.path) {
      tools.push({ type: 'read_file', params: { path: attrs.path, full: attrs.full === 'true' }, rawTag: match[0] });
    }
  }

  // ── write_file ──
  // The lazy `[\s\S]*?` is *not* enough on its own: when the model output is
  // split between two completions (anti-truncation), an unclosed
  // `<write_file path="a">` block can be silently followed by a fully-formed
  // `<write_file path="b">…</write_file>`. Without a guard, the lazy match
  // greedily captures the second file's body too, swapping the contents.
  // We close the body either at `</write_file>`, at the next `<write_file …>`
  // (the previous one was unterminated), or at end of input.
  const rawWriteFile = /<write_file\b([^>]*)>([\s\S]*?)(?:<\/write_file>|(?=<write_file\b)|$)/g;
  while ((match = rawWriteFile.exec(text)) !== null) {
    const attrs = parseToolAttrs(match[1]);
    if (attrs.path) tools.push({ type: 'write_file', params: { path: attrs.path, content: match[2] }, rawTag: match[0] });
  }

  // ── edit_file ── same protection against neighbouring tag bleed.
  const rawEditFile = /<edit_file\b([^>]*)>([\s\S]*?)(?:<\/edit_file>|(?=<edit_file\b)|$)/g;
  while ((match = rawEditFile.exec(text)) !== null) {
    const attrs = parseToolAttrs(match[1]);
    const innerContent = match[2];
    const searchMatch = innerContent.match(/<search>([\s\S]*?)(?:<\/search>|$)/);
    const replaceMatch = innerContent.match(/<replace>([\s\S]*?)(?:<\/replace>|$)/);
    if (attrs.path && searchMatch && replaceMatch) {
      tools.push({ type: 'edit_file', params: { path: attrs.path, search: searchMatch[1], replace: replaceMatch[1] }, rawTag: match[0] });
    }
  }

  const rawExecCmd = /<execute_command\b([^>]*)\s*(?:\/>|>\s*<\/execute_command>|>)/g;
  while ((match = rawExecCmd.exec(text)) !== null) {
    const attrs = parseToolAttrs(match[1]);
    if (attrs.command) tools.push({ type: 'execute_command', params: { command: attrs.command }, rawTag: match[0] });
  }

  const rawSearchCode = /<search_code\b([^>]*)\s*(?:\/>|>\s*<\/search_code>|>)/g;
  while ((match = rawSearchCode.exec(text)) !== null) {
    const attrs = parseToolAttrs(match[1]);
    if (attrs.query) tools.push({ type: 'search_code', params: { query: attrs.query }, rawTag: match[0] });
  }

  return tools;
}
