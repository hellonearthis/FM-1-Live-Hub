fm1-emu 0.5.1: the M-VAVE FM-1 emulator, for windows-x86_64
https://github.com/joakimeriksson/fm1-emu

fm1-live plays a firmware live: the FM-1's screen and panel in a window, the computer keyboard
as the keys, every MIDI input of the computer, audio out.
It has an x86-64 JIT. If the sound stutters, lower the clock: --mhz 160. The audio goes
to the default output (WASAPI, shared mode).

These programs are not signed, so Windows SmartScreen may stop the first start: "More
info", then "Run anyway". Double-click fm1-live.exe to pick a firmware package, or run it from a
terminal (PowerShell, cmd) in this folder.

Play a firmware package (.fwsc): a community firmware (the list, with each author's link:
https://joakimeriksson.github.io/fm1-emu/ ; the packages: https://thefirmwarehub.com/) or
M-VAVE's own FM-1.fwsc:

    fm1-live --fwsc felucca.fwsc
    fm1-live --fwsc FM-1.fwsc --syx bank.syx     (M-VAVE's own, a DX7 bank loaded)
    fm1-live --help

fm1-emu is the batch runner for tests and debugging: WAV and screen output, breakpoints, memory
dumps (see the repository's README).

MIT licensed. The firmwares are their authors'.
