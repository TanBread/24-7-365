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

  it('returns empty array when no tags present', () => {
    expect(parseToolTags('just some plain text')).toEqual([]);
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
