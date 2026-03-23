#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerBashTools } from './tools/bash.js';
import { registerFileTools } from './tools/files.js';
import { registerGrepTools } from './tools/grep.js';
import { registerScreenTools } from './tools/screen.js';
import { registerClipboardTools } from './tools/clipboard.js';
import { registerGitTools } from './tools/git.js';
import { registerProcessTools } from './tools/process.js';

const server = new McpServer({
  name: 'deskcritter-tools',
  version: '1.0.0',
});

registerBashTools(server);
registerFileTools(server);
registerGrepTools(server);
registerScreenTools(server);
registerClipboardTools(server);
registerGitTools(server);
registerProcessTools(server);

await server.connect(new StdioServerTransport());
