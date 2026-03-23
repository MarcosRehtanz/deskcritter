import { bashTools } from './bash.js';
import { fileTools } from './files.js';
import { grepTools } from './grep.js';
import { screenTools } from './screen.js';
import { clipboardTools } from './clipboard.js';
import { gitTools } from './git.js';
import { processTools } from './process.js';

export const TOOL_MAP = {
  ...bashTools,
  ...fileTools,
  ...grepTools,
  ...screenTools,
  ...clipboardTools,
  ...gitTools,
  ...processTools,
};
