import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDebugLog } from './shell/debugLog.js';
import { createDeckController } from './shell/deckController.js';
import { startFastPathServer } from './shell/fastPathHttp.js';
import { createFm1Launcher } from './shell/fm1Process.js';
import { createLlmConfig } from './shell/llmClient.js';
import { createPatchStore } from './shell/patchStore.js';
import { createPatternStore } from './shell/patternStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(__dirname, '..');
const FM1_ROOT = path.resolve(HUB_ROOT, '..');
const SKILLS_DIR = path.join(HUB_ROOT, 'skills');
const PATCHES_DIR = path.join(HUB_ROOT, 'patches');
const PATTERNS_DIR = path.join(HUB_ROOT, 'patterns');

const debugLog = createDebugLog();
const llmConfig = createLlmConfig();
const controller = createDeckController({
  skillsDir: SKILLS_DIR,
  llmConfig,
  debugLog,
});
const fm1Launcher = createFm1Launcher({ rootDir: FM1_ROOT, debugLog });
const patchStore = createPatchStore({ patchesDir: PATCHES_DIR, debugLog });
const patternStore = createPatternStore({ patternsDir: PATTERNS_DIR, debugLog });

debugLog.push('info', 'hub', `Dashboard started (LLM: ${llmConfig.endpoint}, model: ${llmConfig.model ?? 'auto'})`);
startFastPathServer(controller, undefined, {
  fm1Launcher,
  patchStore,
  patternStore,
  llmConfig,
  debugLog,
});
