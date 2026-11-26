"""MCP server wrapping the M-VAVE FM-1 emulator (fm1-live.exe and fm1-emu.exe)."""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from mcp.server.mcpserver import Image, MCPServer
from PIL import Image as PILImage

ROOT_DIR = Path(__file__).resolve().parent.parent
FM1_LIVE_EXE = ROOT_DIR / "fm1-live.exe"
FM1_EMU_EXE = ROOT_DIR / "fm1-emu.exe"
FIRMWARES_DIR = ROOT_DIR / "firmwares"
SAVES_DIR = ROOT_DIR / "saves"
WORK_DIR = ROOT_DIR / "work"

mcp = MCPServer(
    name="fm1-emu",
    instructions=(
        "Control and test the M-VAVE FM-1 synthesizer emulator (fm1-live.exe and fm1-emu.exe). "
        "Use fm1_list_firmwares to discover installed .fwsc packages, fm1_start_live / fm1_stop_live "
        "to manage the interactive synth window, and fm1_render_shot / fm1_render_audio / fm1_bench "
        "for headless screenshots, WAV renders, and performance benchmarks."
    ),
)

_live_state: dict[str, Any] = {
    "process": None,
    "firmware": None,
    "args": None,
}


def _find_firmware(query: str) -> Path:
    """Resolve a firmware name, stem, or substring to a .fwsc file path."""
    candidates: list[Path] = []
    if FIRMWARES_DIR.is_dir():
        candidates.extend(sorted(FIRMWARES_DIR.glob("*.fwsc")))
    candidates.extend(sorted(ROOT_DIR.glob("*.fwsc")))

    q = query.strip()
    if not q:
        raise ValueError("Firmware name cannot be empty.")

    direct = Path(q)
    if direct.is_file():
        return direct.resolve()

    q_lower = q.lower()
    for path in candidates:
        if path.name.lower() == q_lower or path.stem.lower() == q_lower:
            return path

    matches = [p for p in candidates if q_lower in p.stem.lower() or q_lower in p.name.lower()]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        names = ", ".join(p.name for p in matches)
        raise ValueError(f"Ambiguous firmware '{query}'. Matches: {names}")

    available = ", ".join(p.name for p in candidates) or "(none found)"
    raise FileNotFoundError(f"Firmware '{query}' not found. Available: {available}")


def _is_live_running() -> bool:
    proc = _live_state["process"]
    return proc is not None and proc.poll() is None


@mcp.tool()
def fm1_list_firmwares() -> dict[str, Any]:
    """List all available .fwsc firmware packages and .flash save files."""
    firmwares: list[dict[str, Any]] = []
    if FIRMWARES_DIR.is_dir():
        for p in sorted(FIRMWARES_DIR.glob("*.fwsc")):
            firmwares.append({"name": p.stem, "file": p.name, "path": str(p), "size_bytes": p.stat().st_size})
    for p in sorted(ROOT_DIR.glob("*.fwsc")):
        firmwares.append({"name": p.stem, "file": p.name, "path": str(p), "size_bytes": p.stat().st_size})

    saves: list[dict[str, Any]] = []
    if SAVES_DIR.is_dir():
        for p in sorted(SAVES_DIR.glob("*.flash")):
            saves.append({"name": p.stem, "file": p.name, "path": str(p), "size_bytes": p.stat().st_size})

    return {
        "firmwares_dir": str(FIRMWARES_DIR),
        "firmwares": firmwares,
        "saves": saves,
    }


@mcp.tool()
def fm1_status() -> dict[str, Any]:
    """Check whether fm1-live.exe is currently running."""
    running = _is_live_running()
    proc = _live_state["process"]
    if not running and proc is not None:
        exit_code = proc.poll()
        _live_state["process"] = None
    else:
        exit_code = None

    return {
        "running": running,
        "pid": proc.pid if running and proc is not None else None,
        "firmware": _live_state["firmware"] if running else None,
        "args": _live_state["args"] if running else None,
        "last_exit_code": exit_code,
    }


@mcp.tool()
def fm1_start_live(
    firmware: str,
    mhz: int = 240,
    use_flash_save: bool = True,
    usb: bool = False,
    midi: str = "all",
    midi_channel: int | None = None,
) -> dict[str, Any]:
    """Launch fm1-live.exe in a GUI window with the specified firmware.

    Args:
        firmware: Firmware filename, stem, or substring (e.g. '01_loafbreaker' or 'obervave').
        mhz: Emulated CPU clock in MHz (default 240; try 160 or 120 if audio stutters).
        use_flash_save: Persist saved patches/settings to saves/<firmware>.flash.
        usb: Connect the emulated USB cable (--usb).
        midi: MIDI input filter: 'all', 'none', or a device name substring.
        midi_channel: Optional MIDI channel override (1-16).
    """
    if not FM1_LIVE_EXE.is_file():
        raise FileNotFoundError(f"fm1-live.exe not found at {FM1_LIVE_EXE}")

    if _is_live_running():
        old_proc = _live_state["process"]
        old_proc.terminate()
        try:
            old_proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            old_proc.kill()

    fw_path = _find_firmware(firmware)
    cmd = [str(FM1_LIVE_EXE), "--fwsc", str(fw_path), "--mhz", str(mhz), "--midi", midi]

    if midi_channel is not None:
        cmd.extend(["--midi-ch", str(midi_channel)])

    flash_path: Path | None = None
    if use_flash_save:
        SAVES_DIR.mkdir(parents=True, exist_ok=True)
        flash_path = SAVES_DIR / f"{fw_path.stem}.flash"
        cmd.extend(["--flash", str(flash_path)])

    if usb:
        cmd.append("--usb")

    proc = subprocess.Popen(cmd, cwd=str(ROOT_DIR))
    _live_state["process"] = proc
    _live_state["firmware"] = str(fw_path)
    _live_state["args"] = cmd[1:]

    return {
        "started": True,
        "pid": proc.pid,
        "firmware": fw_path.name,
        "flash_save": str(flash_path) if flash_path else None,
        "command": cmd,
    }


@mcp.tool()
def fm1_stop_live() -> dict[str, Any]:
    """Stop the currently running fm1-live.exe window, if any."""
    if not _is_live_running():
        _live_state["process"] = None
        return {"stopped": False, "message": "fm1-live.exe is not running."}

    proc = _live_state["process"]
    pid = proc.pid
    proc.terminate()
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=3)

    _live_state["process"] = None
    return {"stopped": True, "pid": pid}


@mcp.tool()
def fm1_render_shot(
    firmware: str,
    ms: int = 2500,
    keys: str = "",
    lcd_only: bool = False,
    mhz: int = 240,
) -> list[Any]:
    """Run a firmware headlessly for `ms` milliseconds and return a PNG screenshot of the panel or LCD.

    Args:
        firmware: Firmware filename, stem, or substring.
        ms: Emulated duration in milliseconds before taking the screenshot (default 2500).
        keys: Optional FM1_BENCH_KEYS script, e.g. '1000:PLAY,1200:PLAY^,1500:e0:+2'.
        lcd_only: If True, capture only the 240x240 LCD instead of the full panel.
        mhz: Emulated CPU clock in MHz (default 240).
    """
    if not FM1_LIVE_EXE.is_file():
        raise FileNotFoundError(f"fm1-live.exe not found at {FM1_LIVE_EXE}")

    fw_path = _find_firmware(firmware)
    WORK_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(dir=str(WORK_DIR)) as tmp:
        tmp_path = Path(tmp)
        (tmp_path / "work").mkdir(parents=True, exist_ok=True)
        cmd = [str(FM1_LIVE_EXE), "--fwsc", str(fw_path), "--mhz", str(mhz), "--shot", str(ms)]
        if lcd_only:
            cmd.append("--lcd-only")

        env = os.environ.copy()
        if keys.strip():
            env["FM1_BENCH_KEYS"] = keys.strip()

        res = subprocess.run(cmd, cwd=str(tmp_path), env=env, capture_output=True, text=True, timeout=60)
        if res.returncode != 0:
            raise RuntimeError(f"fm1-live --shot failed (code {res.returncode}): {res.stderr or res.stdout}")

        ppm_name = "lcd.ppm" if lcd_only else "panel.ppm"
        ppm_path = tmp_path / "work" / ppm_name
        if not ppm_path.is_file():
            raise FileNotFoundError(f"Expected screenshot {ppm_path} was not created. Output: {res.stdout}")

        png_out = WORK_DIR / f"{fw_path.stem}_{'lcd' if lcd_only else 'panel'}.png"
        with PILImage.open(ppm_path) as img:
            img.save(png_out, format="PNG")

    png_bytes = png_out.read_bytes()
    summary = f"Rendered {fw_path.name} at {ms} ms -> {png_out}"
    return [summary, Image(data=png_bytes, format="png")]


@mcp.tool()
def fm1_render_audio(
    firmware: str,
    ms: int = 4000,
    keys: str = "",
) -> dict[str, Any]:
    """Run a firmware headlessly via fm1-emu.exe and write a WAV audio file to work/.

    Args:
        firmware: Firmware filename, stem, or substring.
        ms: Emulated duration in milliseconds (default 4000).
        keys: Optional --keys script, e.g. '500:PLAY,1000:n7,1500:e0:+3'.
    """
    if not FM1_EMU_EXE.is_file():
        raise FileNotFoundError(f"fm1-emu.exe not found at {FM1_EMU_EXE}")

    fw_path = _find_firmware(firmware)
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    wav_out = WORK_DIR / f"{fw_path.stem}_{ms}ms.wav"

    cmd = [str(FM1_EMU_EXE), "--fwsc", str(fw_path), "--ms", str(ms), "--wav", str(wav_out)]
    if keys.strip():
        cmd.extend(["--keys", keys.strip()])

    res = subprocess.run(cmd, cwd=str(ROOT_DIR), capture_output=True, text=True, timeout=60)
    if res.returncode != 0:
        raise RuntimeError(f"fm1-emu --wav failed (code {res.returncode}): {res.stderr or res.stdout}")

    return {
        "firmware": fw_path.name,
        "wav_path": str(wav_out),
        "size_bytes": wav_out.stat().st_size if wav_out.is_file() else 0,
        "stdout": res.stdout.strip(),
    }


@mcp.tool()
def fm1_bench(firmware: str, ms: int = 3000) -> dict[str, Any]:
    """Benchmark how fast a firmware emulates on this machine."""
    if not FM1_LIVE_EXE.is_file():
        raise FileNotFoundError(f"fm1-live.exe not found at {FM1_LIVE_EXE}")

    fw_path = _find_firmware(firmware)
    cmd = [str(FM1_LIVE_EXE), "--fwsc", str(fw_path), "--bench", str(ms)]
    res = subprocess.run(cmd, cwd=str(ROOT_DIR), capture_output=True, text=True, timeout=60)
    if res.returncode != 0:
        raise RuntimeError(f"fm1-live --bench failed (code {res.returncode}): {res.stderr or res.stdout}")

    return {
        "firmware": fw_path.name,
        "ms": ms,
        "report": (res.stdout + "\n" + res.stderr).strip(),
    }


if __name__ == "__main__":
    mcp.run(transport="stdio")
