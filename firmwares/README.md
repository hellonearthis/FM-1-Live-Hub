# FM-1 Installed Synths & Firmwares (`firmwares/`)

Only **`ATEK303 v1.4`** (`04_atek303.fwsc`) and **`Skiff v2.7.2`** (`skiff-2.7.2.fwsc`) are installed in `firmwares\`, with per-synth flash persistence saved automatically to `saves\<name>.flash`.

- **Full 486-Firmware Catalog & MIDI I/O Feasibility Audit:** [FM1_FIRMWARE_CATALOG.md](./FM1_FIRMWARE_CATALOG.md) ([catalog.json](./catalog.json))

## Installed Firmwares Comparison

| Synth / Firmware | File & Author | Engine Type | Hub Sequencer (Ch Notes) | Hub CC Mode | Clock / PC / Remote | Best Usefulness | Guide |
|---|---|---|---|---|---|---|---|
| **ATEK303 v1.4** | `04_atek303.fwsc` (Animatek) | TB-303 acid voice + 14 WAVE oscs + 64-step seq + 4 FX | **Very High** (`Ch 1`: plays stopped / transposes running) | **`ATEK303 (Safe Tuning)`** (`CC 74/71/75/76/77/79`, locks `CC 78` Tuning) | **High** (`24 PPQN` Clock + `CLK OFFSET`) | Acid House, Acid Techno, 303 basslines & live transposition | [04_atek303.README.md](./04_atek303.README.md) |
| **Skiff v2.7.2** | `skiff-2.7.2.fwsc` (illuminus5) | 6-track groovebox, 14 engines (incl. `FM6` DX7), 64-step + songs | **Very High** (`Ch 1–6` per track) | **`Skiff (6-Track / FX Sends)`** (`CC 7/74/71/73/75/72/91/93/94`) | **Very High** (Clock + PC + native `REMOTE` CCs `102–119`) | Full 6-track sets, drums + poly chords + songs + Browser Editor | [skiff-2.7.2.README.md](./skiff-2.7.2.README.md) |
