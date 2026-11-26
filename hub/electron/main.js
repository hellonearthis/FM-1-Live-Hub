import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { createDebugLog } from '../src/shell/debugLog.js';
import { createDeckController } from '../src/shell/deckController.js';
import { startFastPathServer } from '../src/shell/fastPathHttp.js';
import { createFm1Launcher } from '../src/shell/fm1Process.js';
import { createLlmConfig } from '../src/shell/llmClient.js';
import { createPatchStore } from '../src/shell/patchStore.js';
import { createPatternStore } from '../src/shell/patternStore.js';

const { app, BrowserWindow, ipcMain, session } = electron;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HUB_ROOT = path.resolve(__dirname, '..');
const FM1_ROOT = path.resolve(HUB_ROOT, '..');
const SKILLS_DIR = path.join(HUB_ROOT, 'skills');
const PATCHES_DIR = path.join(HUB_ROOT, 'patches');
const PATTERNS_DIR = path.join(HUB_ROOT, 'patterns');
const WINDOW_BOUNDS_PATH = path.join(HUB_ROOT, '.electron-data', 'window-bounds.json');
const DEFAULT_WINDOW_BOUNDS = Object.freeze({ width: 1180, height: 1056 });

app.setPath('userData', path.join(HUB_ROOT, '.electron-data'));
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');

const runtimeRef = {
  httpServer: null,
  fm1Launcher: null,
  mainWindow: null,
  debugLog: null,
};

const listenWithFallback = (controller, serverOpts, preferredPort) =>
  new Promise((resolve, reject) => {
    const server = startFastPathServer(controller, preferredPort, serverOpts);

    const onError = (err) => {
      if (err && err.code === 'EADDRINUSE' && preferredPort !== 0) {
        server.removeListener('listening', onListening);
        resolve(listenWithFallback(controller, serverOpts, 0));
      } else {
        reject(err);
      }
    };

    const onListening = () => {
      server.removeListener('error', onError);
      resolve(server);
    };

    server.once('error', onError);
    server.once('listening', onListening);
  });

const toggleWindowDevTools = () => {
  const win = runtimeRef.mainWindow;
  if (!win || win.isDestroyed()) {
    return { open: false };
  }
  win.webContents.toggleDevTools();
  return { open: win.webContents.isDevToolsOpened() };
};

const parseFiniteEnvNumber = (value) => {
  if (value == null || String(value).trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const isWindowBoundsLocked = (env = process.env) => {
  const flag = String(env?.FM1_WINDOW_LOCK ?? '').trim().toLowerCase();
  return flag === '1' || flag === 'true';
};

const sanitizeBounds = (raw) => {
  const width = parseFiniteEnvNumber(raw?.width);
  const height = parseFiniteEnvNumber(raw?.height);
  const safeWidth = width !== undefined && width >= 860 ? Math.round(width) : DEFAULT_WINDOW_BOUNDS.width;
  const safeHeight = height !== undefined && height >= 620 ? Math.round(height) : DEFAULT_WINDOW_BOUNDS.height;
  const posX = parseFiniteEnvNumber(raw?.x);
  const posY = parseFiniteEnvNumber(raw?.y);
  const hasPos = posX !== undefined && posY !== undefined;
  return hasPos
    ? { width: safeWidth, height: safeHeight, x: Math.round(posX), y: Math.round(posY) }
    : { width: safeWidth, height: safeHeight };
};

const resolveWindowBounds = (savedBounds, env = process.env) => {
  const locked = isWindowBoundsLocked(env);
  const base = locked ? DEFAULT_WINDOW_BOUNDS : (savedBounds ?? DEFAULT_WINDOW_BOUNDS);
  const envWidth = parseFiniteEnvNumber(env?.FM1_WINDOW_WIDTH);
  const envHeight = parseFiniteEnvNumber(env?.FM1_WINDOW_HEIGHT);
  const envX = parseFiniteEnvNumber(env?.FM1_WINDOW_X);
  const envY = parseFiniteEnvNumber(env?.FM1_WINDOW_Y);
  const mergedX = envX ?? parseFiniteEnvNumber(base?.x);
  const mergedY = envY ?? parseFiniteEnvNumber(base?.y);
  const hasMergedPos = mergedX !== undefined && mergedY !== undefined;
  const candidate = {
    width: envWidth ?? base.width,
    height: envHeight ?? base.height,
    ...(hasMergedPos ? { x: mergedX, y: mergedY } : {}),
  };
  return { bounds: sanitizeBounds(candidate), locked };
};

const loadWindowBounds = async () => {
  try {
    const raw = await fs.readFile(WINDOW_BOUNDS_PATH, 'utf-8');
    return resolveWindowBounds(JSON.parse(raw), process.env);
  } catch {
    return resolveWindowBounds(DEFAULT_WINDOW_BOUNDS, process.env);
  }
};

const saveWindowBounds = async (win) => {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  const bounds = sanitizeBounds(win.getNormalBounds());
  await fs.mkdir(path.dirname(WINDOW_BOUNDS_PATH), { recursive: true });
  await fs.writeFile(WINDOW_BOUNDS_PATH, `${JSON.stringify(bounds, null, 2)}\n`, 'utf-8');
};

const createMainWindow = (port, windowConfig = { bounds: DEFAULT_WINDOW_BOUNDS, locked: false }) => {
  const initialBounds = windowConfig?.bounds ?? DEFAULT_WINDOW_BOUNDS;
  const locked = Boolean(windowConfig?.locked);
  const win = new BrowserWindow({
    ...initialBounds,
    minWidth: 860,
    minHeight: 620,
    title: 'FM-1 Live Hub & AI Patch Deck',
    backgroundColor: '#0b0e14',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (!locked) {
    const persistBounds = () => {
      saveWindowBounds(win).catch(() => {});
    };
    win.on('resized', persistBounds);
    win.on('moved', persistBounds);
    win.on('close', persistBounds);
  }

  win.webContents.on('before-input-event', (event, input) => {
    const isF12 = input.type === 'keyDown' && input.key === 'F12';
    const isCtrlShiftI =
      input.type === 'keyDown' &&
      input.control &&
      input.shift &&
      input.key.toUpperCase() === 'I';
    if (isF12 || isCtrlShiftI) {
      event.preventDefault();
      toggleWindowDevTools();
    }
  });

  win.loadURL(`http://127.0.0.1:${port}/`);
  win.on('closed', () => {
    runtimeRef.mainWindow = null;
  });

  return win;
};

const configureMidiPermissions = () => {
  const isLocalOrigin = (origin) =>
    typeof origin === 'string' &&
    (origin.startsWith('http://127.0.0.1') || origin.startsWith('http://localhost'));

  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    if (permission === 'midi' || permission === 'midiSysex') {
      return isLocalOrigin(requestingOrigin);
    }
    return false;
  });

  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    if (permission === 'midi' || permission === 'midiSysex') {
      callback(isLocalOrigin(wc.getURL()));
      return;
    }
    callback(false);
  });
};

const bootstrap = async () => {
  configureMidiPermissions();
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
  const preferredPort = Number(process.env.FM1_FASTPATH_PORT || 3001);

  debugLog.push(
    'info',
    'electron',
    `Hub booting (LLM: ${llmConfig.endpoint}, model: ${llmConfig.model ?? 'auto'})`
  );

  const server = await listenWithFallback(
    controller,
    { fm1Launcher, patchStore, patternStore, llmConfig, debugLog },
    preferredPort
  );
  const { port } = server.address();
  debugLog.push('info', 'http', `Dashboard listening on http://127.0.0.1:${port}`);

  ipcMain.handle('fm1:toggle-devtools', () => toggleWindowDevTools());

  const windowConfig = await loadWindowBounds();
  runtimeRef.debugLog = debugLog;
  runtimeRef.httpServer = server;
  runtimeRef.fm1Launcher = fm1Launcher;
  runtimeRef.mainWindow = createMainWindow(port, windowConfig);
};

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = runtimeRef.mainWindow;
    if (win) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.focus();
    }
  });

  app.whenReady().then(bootstrap).catch((err) => {
    console.error('[fm1-electron] startup failed:', err);
    app.quit();
  });
}

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0 && runtimeRef.httpServer) {
    const { port } = runtimeRef.httpServer.address();
    const windowConfig = await loadWindowBounds();
    runtimeRef.mainWindow = createMainWindow(port, windowConfig);
  }
});

app.on('window-all-closed', () => {
  if (runtimeRef.fm1Launcher) {
    runtimeRef.fm1Launcher.stop();
  }
  if (runtimeRef.httpServer) {
    runtimeRef.httpServer.close();
  }
  app.quit();
});
