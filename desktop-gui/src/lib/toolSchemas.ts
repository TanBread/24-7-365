// ═══════════════════════════════════════════════════════════════
// Tool definitions for native function-calling (OpenAI/Anthropic style).
// Used by OpenRouter when the underlying model supports tools.
// Structure mirrors the XML tags so parsing of either path produces the same
// AgentTool[].
// ═══════════════════════════════════════════════════════════════

export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'read_dir',
      description: 'List files and directories under the given path inside the working folder.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative path. Use "." for the workspace root.' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a text file. By default returns AST-compressed view (function signatures, imports). Pass full=true to get the full file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          full: { type: 'boolean', description: 'If true, return the full file content (no AST compression). Defaults to false.' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a file with the given content. Use only for new files; for existing files prefer edit_file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Strict search-and-replace edit on an existing file. The "search" block must match a unique fragment of the file (with reasonable surrounding context).',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          search: { type: 'string', description: 'The exact code fragment to find.' },
          replace: { type: 'string', description: 'The replacement code.' },
        },
        required: ['path', 'search', 'replace'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_command',
      description: 'Run a shell command in the working folder. The terminal output streams live to the user.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_code',
      description: 'Fast keyword search across the project files. Returns up to 20 matches with file path, line number and snippet.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_components',
      description: 'List reusable UI component files of the project (.jsx/.tsx/.vue/.svelte and files under components/).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_image_size',
      description: 'Get width, height and byte size of an image file. Use this instead of read_file for images.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
];
