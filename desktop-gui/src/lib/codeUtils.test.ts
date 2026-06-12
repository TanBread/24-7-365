import { describe, it, expect } from 'vitest';
import { compressCodeContext, checkBalancedBrackets, parseToolTags } from './codeUtils';

describe('compressCodeContext', () => {
  it('returns content unchanged for unsupported extensions', () => {
    const md = '# Title\n\nSome text';
    expect(compressCodeContext('readme.md', md)).toBe(md);
  });

  it('folds CSS rule bodies', () => {
    const css = '.btn { color: red; padding: 4px; }';
    const out = compressCodeContext('styles.css', css);
    expect(out).toContain('folded');
    expect(out).not.toContain('color: red');
  });

  it('folds <script> and <style> blocks in HTML', () => {
    const html = '<html><style>.a{color:red}</style><script>console.log(1)</script></html>';
    const out = compressCodeContext('index.html', html);
    expect(out).not.toContain('console.log(1)');
    expect(out).not.toContain('color:red');
    expect(out).toContain('folded');
  });

  it('folds JS function bodies but keeps signatures', () => {
    const js = [
      'function add(a, b) {',
      '  const sum = a + b;',
      '  return sum;',
      '}',
      'const x = 1;',
    ].join('\n');
    const out = compressCodeContext('app.js', js);
    expect(out).toContain('function add(a, b) {');
    expect(out).toContain('folded body');
    expect(out).not.toContain('const sum = a + b;');
    expect(out).toContain('const x = 1;'); // top-level statement preserved
  });
});

describe('checkBalancedBrackets', () => {
  it('accepts balanced brackets', () => {
    expect(checkBalancedBrackets('function f() { return [1, 2, (3)]; }').valid).toBe(true);
  });

  it('rejects a missing closing bracket', () => {
    const res = checkBalancedBrackets('function f() { return 1;');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('отсутствуют');
  });

  it('rejects mismatched brackets', () => {
    const res = checkBalancedBrackets('const a = [1, 2);');
    expect(res.valid).toBe(false);
  });
});

describe('parseToolTags', () => {
  it('parses a self-closing read_file with full flag', () => {
    const tools = parseToolTags('<read_file path="src/app.ts" full="true"/>');
    expect(tools).toHaveLength(1);
    expect(tools[0].type).toBe('read_file');
    expect(tools[0].params.path).toBe('src/app.ts');
    expect(tools[0].params.full).toBe(true);
  });

  it('parses write_file with content', () => {
    const tools = parseToolTags('<write_file path="a.txt">hello world</write_file>');
    expect(tools[0].type).toBe('write_file');
    expect(tools[0].params.content).toBe('hello world');
  });

  it('parses edit_file with search/replace', () => {
    const tools = parseToolTags('<edit_file path="a.ts"><search>old</search><replace>new</replace></edit_file>');
    expect(tools[0].type).toBe('edit_file');
    expect(tools[0].params.search).toBe('old');
    expect(tools[0].params.replace).toBe('new');
  });

  it('parses search_code and execute_command', () => {
    const tools = parseToolTags('<search_code query="useState"/><execute_command command="npm test"/>');
    expect(tools.some(t => t.type === 'search_code' && t.params.query === 'useState')).toBe(true);
    expect(tools.some(t => t.type === 'execute_command' && t.params.command === 'npm test')).toBe(true);
  });

  it('parses single-quoted attributes from reasoning models', () => {
    const tools = parseToolTags("<read_file path='index.html' full='true'/>");
    expect(tools).toHaveLength(1);
    expect(tools[0].type).toBe('read_file');
    expect(tools[0].params.path).toBe('index.html');
    expect(tools[0].params.full).toBe(true);
  });

  it('parses mixed quote styles and spaced attributes', () => {
    const tools = parseToolTags("<execute_command command='npm test' /><search_code query=\"renderChat\" />");
    expect(tools.some(t => t.type === 'execute_command' && t.params.command === 'npm test')).toBe(true);
    expect(tools.some(t => t.type === 'search_code' && t.params.query === 'renderChat')).toBe(true);
  });

  it('accepts read/search/execute tags closed with a plain >', () => {
    const tools = parseToolTags('<read_file path="index.html" full="true"><search_code query="appendBubble"><execute_command command="npm test">');
    expect(tools.some(t => t.type === 'read_file' && t.params.path === 'index.html' && t.params.full === true)).toBe(true);
    expect(tools.some(t => t.type === 'search_code' && t.params.query === 'appendBubble')).toBe(true);
    expect(tools.some(t => t.type === 'execute_command' && t.params.command === 'npm test')).toBe(true);
  });

  it('returns empty array when no tags present', () => {
    expect(parseToolTags('just some plain text')).toEqual([]);
  });

  // Regression: when an unterminated <write_file> is followed by another
  // <write_file>, the first tool's content must NOT include the second tool.
  it('does not let an unterminated write_file swallow the next one', () => {
    const text = [
      '<write_file path="a.ts">',
      '// content of a (no closing tag)',
      '<write_file path="b.ts">',
      'CONTENT_OF_B',
      '</write_file>',
    ].join('\n');
    const tools = parseToolTags(text);
    expect(tools).toHaveLength(2);
    const a = tools.find(t => t.params.path === 'a.ts');
    const b = tools.find(t => t.params.path === 'b.ts');
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.params.content).not.toContain('CONTENT_OF_B');
    expect(b!.params.content).toContain('CONTENT_OF_B');
  });

  // Same protection for edit_file.
  it('does not let an unterminated edit_file swallow the next one', () => {
    const text = [
      '<edit_file path="a.ts"><search>X</search><replace>Y</replace>',
      '<edit_file path="b.ts"><search>P</search><replace>Q</replace></edit_file>',
    ].join('\n');
    const tools = parseToolTags(text);
    const editsA = tools.filter(t => t.type === 'edit_file' && t.params.path === 'a.ts');
    const editsB = tools.filter(t => t.type === 'edit_file' && t.params.path === 'b.ts');
    expect(editsA).toHaveLength(1);
    expect(editsB).toHaveLength(1);
    expect(editsA[0].params.search).toBe('X');
    expect(editsA[0].params.replace).toBe('Y');
    expect(editsB[0].params.search).toBe('P');
    expect(editsB[0].params.replace).toBe('Q');
  });
});


// ─── Additional reliability checks for the audit changes ───
import { describe as describe2, it as it2, expect as expect2 } from 'vitest';

describe2('parseToolTags resilience', () => {
  it2('ignores incomplete edit_file (missing replace) without crashing', () => {
    const tools = parseToolTags('<edit_file path="a.ts"><search>x</search></edit_file>');
    // No replace -> tag is incomplete and must NOT produce a tool entry
    expect2(tools.find(t => t.type === 'edit_file')).toBeUndefined();
  });

  it2('extracts read_dir even when surrounded by prose', () => {
    const tools = parseToolTags('Сначала прочитаем структуру: <read_dir path="."/> и продолжим.');
    expect2(tools).toHaveLength(1);
    expect2(tools[0].params.path).toBe('.');
  });
});
