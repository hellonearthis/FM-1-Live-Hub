import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const SAFE_FW_NAME = /^[a-z0-9_.-]+\.fwsc$/i;

/** Create an imperative shell controller for launching and stopping the visible fm1-live.exe window. */
export const createFm1Launcher = ({ rootDir, debugLog = null }) => {
  const exePath = path.join(rootDir, 'fm1-live.exe');
  const firmwaresDir = path.join(rootDir, 'firmwares');
  const savesDir = path.join(rootDir, 'saves');

  const procRef = {
    child: null,
    firmware: null,
    pid: null,
  };

  const log = (level, message, detail = null) => {
    if (debugLog) {
      debugLog.push(level, 'fm1', message, detail);
    }
  };

  const isRunning = () =>
    procRef.child !== null && procRef.child.exitCode === null && !procRef.child.killed;

  const listFirmwares = async () => {
    try {
      const entries = await fs.readdir(firmwaresDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.fwsc'))
        .map((e) => e.name)
        .sort();
    } catch {
      return [];
    }
  };

  const stop = () => {
    if (!isRunning()) {
      procRef.child = null;
      procRef.pid = null;
      return { stopped: false, message: 'fm1-live.exe is not running.' };
    }
    const stoppedPid = procRef.pid;
    try {
      procRef.child.kill();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log('error', `Failed to stop fm1-live.exe (PID ${stoppedPid})`, msg);
      return { stopped: false, message: msg };
    }
    log('info', `Stopped fm1-live.exe (PID ${stoppedPid})`);
    procRef.child = null;
    procRef.pid = null;
    procRef.firmware = null;
    return { stopped: true, pid: stoppedPid };
  };

  const launch = async (
    firmwareName,
    { mhz = 240, useFlashSave = true, midi = 'all' } = {}
  ) => {
    if (typeof firmwareName !== 'string' || !SAFE_FW_NAME.test(firmwareName)) {
      const error = `Invalid firmware name "${firmwareName}". Expected a .fwsc filename.`;
      log('warn', error);
      return { success: false, error };
    }

    const fwPath = path.join(firmwaresDir, firmwareName);
    try {
      await fs.access(exePath);
      await fs.access(fwPath);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log('error', `Cannot launch ${firmwareName}`, error);
      return { success: false, error };
    }

    if (isRunning()) {
      stop();
    }

    const clockMhz = Number(mhz) || 240;
    const midiPort = typeof midi === 'string' && midi.trim() ? midi.trim() : 'all';
    const args = ['--fwsc', fwPath, '--mhz', String(clockMhz), '--midi', midiPort];
    if (useFlashSave) {
      await fs.mkdir(savesDir, { recursive: true });
      const stem = path.basename(firmwareName, '.fwsc');
      args.push('--flash', path.join(savesDir, `${stem}.flash`));
    }

    const child = spawn(exePath, args, {
      cwd: rootDir,
      detached: true,
      windowsHide: false,
      stdio: 'ignore',
    });
    child.unref();

    procRef.child = child;
    procRef.firmware = firmwareName;
    procRef.pid = child.pid ?? null;

    log('info', `Launched fm1-live.exe with ${firmwareName} @ ${clockMhz} MHz (PID ${procRef.pid})`);

    child.on('exit', (code) => {
      log('info', `fm1-live.exe exited (PID ${child.pid ?? '?'}, code ${code ?? 'null'})`);
      if (procRef.child === child) {
        procRef.child = null;
        procRef.pid = null;
      }
    });

    return {
      success: true,
      value: {
        running: true,
        pid: procRef.pid,
        firmware: firmwareName,
      },
    };
  };

  const getStatus = () => ({
    running: isRunning(),
    pid: isRunning() ? procRef.pid : null,
    firmware: isRunning() ? procRef.firmware : null,
  });

  return Object.freeze({
    listFirmwares,
    launch,
    stop,
    getStatus,
  });
};
