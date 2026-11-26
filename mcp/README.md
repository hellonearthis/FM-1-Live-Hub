# FM-1 Emulator MCP Server

Local stdio MCP server wrapping `fm1-live.exe` and `fm1-emu.exe`.

## Tools

- `fm1_list_firmwares` — Lists `.fwsc` packages in `firmwares/` and `.flash` saves in `saves/`.
- `fm1_start_live` — Launches `fm1-live.exe` with a chosen firmware, MHz clock, flash save, and MIDI options.
- `fm1_status` — Checks if `fm1-live.exe` is running.
- `fm1_stop_live` — Stops the running `fm1-live.exe` window.
- `fm1_render_shot` — Runs `--shot` headlessly and returns a PNG screenshot of the panel or 240x240 LCD.
- `fm1_render_audio` — Runs `fm1-emu.exe --wav` headlessly and writes a `.wav` file to `work/`.
- `fm1_bench` — Runs `fm1-live.exe --bench` and reports emulation speed.

## Client Configuration (`mcp_config.json`)

```json
{
  "mcpServers": {
    "fm1-emu": {
      "command": "python",
      "args": [
        "C:\\Users\\Desktop-Dev\\Desktop\\FM-1\\mcp\\fm1_mcp.py"
      ]
    }
  }
}
```
