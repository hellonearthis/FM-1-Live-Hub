import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL = 'https://fm1-editor.com/firmware/';

const HTML_ENTITIES = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  middot: '·',
  hellip: '…',
});

const LOCAL_ID_ALIASES = Object.freeze({
  '01_loafbreaker': 'loaf-breaker',
  '02_h1': 'handy-1',
  '03_coralflower': 'coralflower',
  '04_atek303': 'atek303',
  '05_fmini': 'fmini-1',
  '06_obervave': 'obervave',
  '07_frasil': 'frasil',
  '08_amb': 'amb-1',
  '09_mutable': 'mutable-dreams',
  '10_ravel': 'ravel',
  guitchordi: 'guitchordi',
  hortator: 'hortator',
  mono2k: 'mono2k',
  'skiff-2.7.2': 'skiff',
});

const CATEGORY_ORDER = Object.freeze([
  'grooveboxes',
  'synths',
  'generative',
  'chords',
  'samplers',
  'tools',
  'games',
]);

const HIGHLIGHT_IDS = Object.freeze([
  'official-open',
  'stock',
  'baud-girl',
  'sloop',
  'felucca',
  'skiff',
  'jiant',
  'melodee',
  'loom-8',
  'x0x',
  'dx747',
  'pigeon',
  'zp12',
  'sidou',
  '386dx',
  'fomajam',
  'midi-processor',
  'remotefm1',
  'fm1-dock',
  'fm1-d50',
  'guru-600',
  'modular-1',
]);

const decodeHtml = (raw) =>
  String(raw || '')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&([a-z]+);/gi, (full, name) => HTML_ENTITIES[name.toLowerCase()] ?? full);

const stripTags = (raw) =>
  decodeHtml(String(raw || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

const normalizeSlug = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\.fwsc$/i, '')
    .replace(/^\d+[_-]/, '')
    .replace(/[^a-z0-9]+/g, '');

const mdCell = (value) =>
  String(value || '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim();

const classifyIo = (title, blurb, categories) => {
  const txt = `${title} ${blurb}`.toLowerCase();
  const flags = Object.freeze({
    sysex: /\bsysex\b|\.syx\b/.test(txt),
    midiIn: /\bmidi\s*in\b|\bmidi\s*cc\b|\bmidi\s*clock\b|\bmidi\s*sync\b|\busb\s*midi\b|\bdin\s*midi\b|program\s*change|\bmidi\s*learn\b/.test(txt),
    midiOut: /\bmidi\s*out\b|\bmidi\s*thru\b|sends?\s+midi|sending\s+midi|external\s+midi/.test(txt),
    midiAny: /\bmidi\b/.test(txt),
    midiClock: /midi\s*clock|clock\s*sync|sync\s*in|sync\s*out/.test(txt),
    midiCc: /\bcc\b|\bccs\b|control\s*change/.test(txt),
    webEditor: /web\s*(?:editor|app|tool|companion|librarian|midi)|browser\s*editor|companion\s*app/.test(txt),
    patternTrackIo: /(?:import|export|load|save|transfer|backup|dump|send|receive).{0,35}(?:pattern|track|song|composition|project|bank|patch|preset|sample|smf|\.mid)/.test(txt),
    smfMidiFile: /\.mid\b|midi\s*file|\bsmf\b/.test(txt),
    multiTrackSong: /song\s*mode|pattern\s*chain|arrangement|composition|\btracker\b|multi-?track|8[- ]track|6[- ]track|4[- ]track/.test(txt),
  });

  const isGameOrNonSynth = categories.includes('games') && categories.length === 1;
  const ioTier =
    flags.sysex || flags.webEditor || flags.patternTrackIo
      ? 'sysex_editor'
      : flags.multiTrackSong || flags.midiOut || flags.smfMidiFile
        ? 'multitrack_midi'
        : isGameOrNonSynth
          ? 'standalone_or_game'
          : 'standard_midi';

  const badges = [
    flags.sysex && 'SysEx/.syx',
    flags.webEditor && 'Web Editor',
    flags.patternTrackIo && 'Pattern/Patch IO',
    flags.smfMidiFile && 'SMF .mid',
    flags.midiIn && 'MIDI In',
    flags.midiOut && 'MIDI Out',
    flags.midiClock && 'Clock',
    flags.multiTrackSong && 'Multi-Track/Song',
  ].filter(Boolean);

  return Object.freeze({ flags, ioTier, badges: Object.freeze(badges) });
};

const buildUsefulnessNote = (item, ioInfo) => {
  const { flags } = ioInfo;
  if (item.categories.includes('games') && item.categories.length === 1) {
    return 'Standalone game/demo; Hub MIDI sequencing N/A.';
  }
  const notes = [
    flags.sysex && 'SysEx / DX7 .syx transfer capable (needs Hub SysEx unlock).',
    flags.midiOut && 'MIDI Out / external hardware sequencing.',
    flags.smfMidiFile && 'Supports Standard MIDI Files (.mid) for compositions.',
    flags.webEditor && 'Has browser editor for patch/sample/project I/O.',
    flags.multiTrackSong && 'Multi-track song/pattern chaining fits Section 2B.',
    flags.patternTrackIo && 'Imports/exports patterns, banks, or presets.',
  ].filter(Boolean);
  return notes.length > 0
    ? notes.slice(0, 2).join(' ')
    : 'Play/sequence via Hub Ch 1 MIDI In + --map panel/knobs.';
};

const stripSrOnly = (raw) =>
  String(raw || '').replace(/<span\b[^>]*class="[^"]*\bsr-only\b[^"]*"[^>]*>[\s\S]*?<\/span\s*>/gi, '');

const extractLinks = (body) =>
  [...String(body || '').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)]
    .map((m) => {
      const hrefMatch = (m[1] || '').match(/\bhref="(https?:\/\/[^"]+)"/i);
      if (!hrefMatch) return null;
      const label = stripTags(m[2]).replace(/\s*↗\s*$/, '').trim() || 'Link';
      return Object.freeze({ url: hrefMatch[1], label });
    })
    .filter(Boolean);

export const parseFirmwaresHtml = (htmlText, localFwFiles = []) => {
  const cleanHtml = String(htmlText || '').replace(/<!--[\s\S]*?-->/g, '');
  const articleRegex = /<article\b([^>]*)>([\s\S]*?)<\/article\s*>/g;
  const localNormalized = new Map(
    localFwFiles.map((file) => [normalizeSlug(file), file])
  );

  const entries = [];
  for (const match of cleanHtml.matchAll(articleRegex)) {
    const attrs = match[1] || '';
    const body = match[2] || '';
    const id = (attrs.match(/id="([^"]+)"/) || [])[1] || '';
    if (!id) continue;

    const categories = ((attrs.match(/data-categories="([^"]*)"/) || [])[1] || '')
      .split(/\s+/)
      .filter(Boolean);
    const updated = (attrs.match(/data-updated="([^"]*)"/) || [])[1] || '';
    const rawStars = (attrs.match(/data-stars="([^"]*)"/) || [])[1] || '';
    const stars = /^\d+$/.test(rawStars) ? Number(rawStars) : null;
    const pinned = /\bdata-pinned\b/.test(attrs);

    const maker = stripTags((body.match(/<p class="synthwave-kicker">([\s\S]*?)<\/p\s*>/) || [])[1]);
    const title = stripTags((body.match(/<h2 class="firmware-title"[^>]*>([\s\S]*?)<\/h2\s*>/) || [])[1]);
    const rawStatus = stripSrOnly((body.match(/<p class="firmware-status">([\s\S]*?)<\/p\s*>/) || [])[1]);
    const status = stripTags(
      rawStatus.replace(/<span\b[^>]*class="[^"]*\bfirmware-stars\b[^"]*"[^>]*>[\s\S]*?<\/span\s*>/gi, '')
    );
    const blurb = [...body.matchAll(/<p class="firmware-blurb">([\s\S]*?)<\/p\s*>/g)]
      .map((m) => stripTags(m[1]))
      .filter(Boolean)
      .join(' ');
    const links = extractLinks(body);

    const io = classifyIo(title, blurb, categories);
    const aliasEntry = Object.entries(LOCAL_ID_ALIASES).find(
      ([, aliasId]) => aliasId === id
    );
    const localFile =
      (aliasEntry && localFwFiles.find((f) => f.toLowerCase().startsWith(aliasEntry[0]))) ||
      localNormalized.get(normalizeSlug(id)) ||
      localNormalized.get(normalizeSlug(title)) ||
      null;

    entries.push(
      Object.freeze({
        id,
        title: title || id,
        maker,
        categories: Object.freeze(categories),
        status,
        updated,
        stars,
        pinned,
        installedFile: localFile,
        ioTier: io.ioTier,
        ioBadges: io.badges,
        ioFlags: io.flags,
        hubUsefulness: buildUsefulnessNote({ categories }, io),
        blurb,
        links: Object.freeze(links),
      })
    );
  }

  return Object.freeze(entries);
};

const summarizeCatalog = (entries) => {
  const categoryCounts = Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0]));
  const ioFlagCounts = {
    sysex: 0,
    midiIn: 0,
    midiOut: 0,
    midiAny: 0,
    midiClock: 0,
    midiCc: 0,
    webEditor: 0,
    patternTrackIo: 0,
    smfMidiFile: 0,
    multiTrackSong: 0,
  };
  const tierCounts = {
    sysex_editor: 0,
    multitrack_midi: 0,
    standard_midi: 0,
    standalone_or_game: 0,
  };

  entries.forEach((entry) => {
    entry.categories.forEach((cat) => {
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    tierCounts[entry.ioTier] = (tierCounts[entry.ioTier] || 0) + 1;
    Object.entries(entry.ioFlags).forEach(([k, v]) => {
      if (v) ioFlagCounts[k] += 1;
    });
  });

  return Object.freeze({
    totalFirmwares: entries.length,
    installedCount: entries.filter((e) => e.installedFile !== null).length,
    categoryCounts: Object.freeze(categoryCounts),
    ioFlagCounts: Object.freeze(ioFlagCounts),
    tierCounts: Object.freeze(tierCounts),
  });
};

const formatLinks = (links) =>
  links.length > 0
    ? links
        .slice(0, 2)
        .map((l) => `[${mdCell(l.label || 'Link')}](${l.url})`)
        .join(' · ')
    : '—';

const renderCatalogMarkdown = (entries, summary, fetchedAtIso) => {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const highlighted = HIGHLIGHT_IDS.map((id) => byId.get(id)).filter(Boolean);
  const installed = entries.filter((e) => e.installedFile !== null);

  const lines = [
    '# M-VAVE FM-1 Firmware Catalog & MIDI/Composition I/O Compatibility Report',
    '',
    `- **Source:** ${SOURCE_URL}`,
    `- **Generated:** ${fetchedAtIso}`,
    `- **Total Cataloged Firmwares:** **${summary.totalFirmwares}** (${summary.installedCount} locally installed in \`firmwares/\`)`,
    `- **Machine-Readable Data:** [catalog.json](./catalog.json)`,
    `- **Regenerate Script:** \`node hub/scripts/build-firmware-catalog.mjs\``,
    '',
    '## 1. Category & I/O Summary',
    '',
    '| Category | Count | | I/O Capability Detected (from descriptions) | Count |',
    '|---|---:|---|---|---:|',
    `| Grooveboxes | ${summary.categoryCounts.grooveboxes} | | General MIDI mentioned | ${summary.ioFlagCounts.midiAny} |`,
    `| Synths | ${summary.categoryCounts.synths} | | Web / Browser Editor | ${summary.ioFlagCounts.webEditor} |`,
    `| Generative | ${summary.categoryCounts.generative} | | Multi-Track / Song Mode | ${summary.ioFlagCounts.multiTrackSong} |`,
    `| Games | ${summary.categoryCounts.games} | | MIDI In / CC / Clock / PC | ${summary.ioFlagCounts.midiIn} |`,
    `| Tools | ${summary.categoryCounts.tools} | | Pattern / Track / Bank / Sample I/O | ${summary.ioFlagCounts.patternTrackIo} |`,
    `| Chords | ${summary.categoryCounts.chords} | | MIDI Clock / Sync | ${summary.ioFlagCounts.midiClock} |`,
    `| Samplers | ${summary.categoryCounts.samplers} | | SysEx / \`.syx\` | ${summary.ioFlagCounts.sysex} |`,
    `| | | | MIDI Out | ${summary.ioFlagCounts.midiOut} |`,
    `| | | | Standard MIDI File (\`.mid\` / SMF) | ${summary.ioFlagCounts.smfMidiFile} |`,
    '',
    '---',
    '',
    '## 2. MIDI In / Out Feasibility Audit: Loading Tracks, Patterns & Compositions',
    '',
    'This answers what **MIDI In / Out**, **SysEx**, **`fm1-live.exe`**, and the **FM-1 Live Hub** can and cannot load today.',
    '',
    '### A. Emulator (`fm1-live.exe v0.5.1`) vs. Real Hardware USB/DIN Capabilities',
    '',
    '| Transport / Feature | `fm1-live.exe` (Windows x64 Emulator) | Real FM-1 Hardware (USB / 3.5mm TRS MIDI) | Verified Evidence |',
    '|---|---|---|---|',
    '| **MIDI In (Notes, CCs, PC, SysEx)** | **Supported via WinMM (`midir`)** — opens Windows MIDI inputs (`--midi all\\|NAME`, `--midi-ch N`) including WinMM SysEx input buffers (`midiInPrepareHeader` / `midiInAddBuffer`). | **Supported** over USB-MIDI and TRS MIDI IN. | Binary probe of `fm1-live.exe`: WinMM SysEx input + `FM1_USB_SEND` present. |',
    '| **MIDI Out (`fm1-live.exe` → Hub)** | **NOT bridged on Windows WinMM** — `fm1-live.exe` imports `midiOutClose`/`midiOutReset` only (no `midiOutOpen` / `midiOutShortMsg`). Emulated firmware MIDI Out stays inside virtual `--usb` / logs unless running a native OS with virtual ports. | **Supported** (USB-MIDI bidirectional in Web MIDI editors & hardware firmwares like `OberVave` 1.2+, `FOMAJAM`, `RemoteFM1`, `FM-1 MIDI Processor`). | Windows PE import & string scan of `fm1-live.exe`. |',
    '| **DX7 `.syx` Patch / Bank Load** | **Startup load via `--syx BANK.syx`** (4104-byte `.syx` or 4096-byte 32-voice DX7 bank) + live SysEx over WinMM/USB if firmware accepts it. | **Supported live** in Web MIDI editors on stock V14/V15, `Official Open`, `Felucca`/`SLOOP`, `DX747`, `fm1-d50`, `SIDOU`, `Melodee`. | `fm1-live.exe --help` & `fm1-editor.com` specs. |',
    '| **Panel & Knob Remapping (`--map`)** | **Supported via `--map hub/config/fm1-hub-map.json`** (binds Ch 16 notes → buttons, Ch 15 → panel keys, Ch 1 CCs → knobs). | Requires firmware MIDI learn or `RemoteFM1` / `Macropad Patch`. | Tested `hub/config/fm1-hub-map.json` + `crates/fm1-map`. |',
    '| **Pattern / Composition / Sample Bulk Load** | **Not standardized over MIDI** — only persisted via 1 MiB `--flash saves/<name>.flash` or firmware-specific USB Web MIDI SysEx (when `--usb` is active). | **Firmware-specific** via each project’s browser editor (`Felucca`, `SLOOP`, `Skiff`, `PIGEON`, `zp12`, `Baud Girl`, `Official Open` Workbench). | Audit across all 486 firmware descriptions. |',
    '',
    '### B. Can MIDI In/Out Load Tracks, Patterns, or Compositions?',
    '',
    '| Goal | Over Live MIDI In (Streamed) | Over MIDI SysEx (`0xF0 ... 0xF7`) | Over `.mid` / Hub File Storage | Verdict for FM-1 Live Hub |',
    '|---|---|---|---|---|',
    '| **Play multi-track arrangements / full songs into a groovebox** | **YES** — Channel 1–8 Note On/Off + MIDI Clock (`0xF8`) + Start/Stop (`0xFA`/`0xFC`) works on multitimbral firmwares (`Ravel`, `SLOOP`, `Skiff`, `Felucca`, `Official Open`, `Stock V16`, `DX747`, `FOMAJAM`, `LOOM-8`). | **Rare / Proprietary** — no universal FM-1 pattern SysEx exists across firmwares. | **Import `.mid` into Hub → stream to FM-1** is universal across **all** MIDI-capable synths. | **Best universal path:** Add multi-track / `.mid` composition streaming + Clock (`0xF8`) in Section 2B. |',
    '| **Load a single 16-step pattern into firmware memory** | **Workaround works** (`Preload Pattern → FM-1` via Ch 16 `REC` + Ch 15 panel keys on step-rec synths like `ATEK303`). | Only on firmwares whose web editor uses custom Web MIDI SysEx (`Felucca`/`SLOOP`/`Skiff`/`PIGEON`/`Guru-600`). | Save JSON in `hub/patterns/` and stream cleanly from Hub. | Keep Ch 15 step preload for 1-track synths; rely on Hub sequencing + Program Change for full sets. |',
    '| **Load DX7 / VA / Synth patches & 32-voice banks** | N/A (CC 20/71/7/74..78 adjusts live parameters only). | **YES** — Stock V14/V15, `Official Open`, `DX747`, `SLOOP`, `Baud Girl` take `.syx`; `fm1-d50` takes D-50 SysEx. | `--syx BANK.syx` at `fm1-live.exe` launch or Web MIDI SysEx in Hub. | Needs SysEx enabled (`sysex: true`) in Hub Web MIDI + `.syx` uploader button. |',
    '| **Sync pattern switches / song sections between Hub & FM-1** | **YES** — Ch 1 Program Change (`0xC0`), Ch 16 `SEQ` (`fm1-hub-map.json`), and MIDI Clock (`0xF8`). | N/A | Hub `patterns/` end-of-sequence queue already works. | Add `0xF8` MIDI Clock out from Hub sequencer so firmware arps/delays lock to Hub BPM! |',
    '',
    '### C. Exact Code Gaps Found in FM-1 Live Hub (Actionable Upgrades)',
    '',
    '1. **Hub Web MIDI blocks SysEx (`hub/public/index.html`):** `hub/electron/main.js` already grants `midiSysex`, but `initMidi()` in `index.html` calls `navigator.requestMIDIAccess({ sysex: false })`, preventing `.syx` DX7 bank dumps or firmware SysEx transfers from the Hub.',
    '2. **`fm1-live.exe` launcher omits `--map`, `--syx`, `--usb` (`hub/src/shell/fm1Process.js`):** Currently spawns `[\'--fwsc\', fwPath, \'--mhz\', clockMhz, \'--midi\', midiPort, \'--flash\', ...]` without optional `--map hub/config/fm1-hub-map.json`, `--syx`, or `--usb`. Users must pass `--map` manually for Ch 16 panel buttons (`PLAY`/`REC`/`SEQ`) and `KNOB1–4` to respond inside `fm1-live.exe`.',
    '3. **No MIDI Clock (`0xF8`) / Start-Stop (`0xFA`/`0xFC`) or inbound SysEx/PC handling:** `tickSequencerStep` sends Ch 1 Note On/Off and end-of-bar Program Change, but not 24 PPQN `0xF8` clock ticks (needed for tight sync with `SLOOP`, `Felucca`, `Skiff`, `X0X`, `Hortator`, `SIDOU`, and external delays). `handleIncomingMidi` ignores incoming `0xF0` SysEx and `0xC0` Program Change messages.',
    '4. **Section 2B is single-track, 16 steps (1 bar), no `.mid` file loader:** Cannot yet import multi-track `.mid` compositions, chain patterns into a Song/Arrangement list inside the Hub, or address MIDI Channels `1–8` independently on 8-track grooveboxes (`Ravel`, `SLOOP`, `Skiff`, `Official Open`, `LOOM-8`, `DX747`).',
    '',
    '---',
    '',
    '## 3. Top I/O-Capable & High-Value Firmwares (Recommended Additions)',
    '',
    '| Firmware | Maker | Category | ★ | Installed Locally? | I/O Capabilities | Hub Usefulness | Links |',
    '|---|---|---|---:|---|---|---|---|',
    ...highlighted.map(
      (e) =>
        `| **${mdCell(e.title)}** | ${mdCell(e.maker)} | ${mdCell(e.categories.join(', '))} | ${e.stars ?? 'Pinned'} | ${e.installedFile ? `✅ \`${e.installedFile}\`` : '⬜'} | ${mdCell(e.ioBadges.join(', ') || 'Ch 1 MIDI')} | ${mdCell(e.hubUsefulness)} | ${formatLinks(e.links)} |`
    ),
    '',
    '---',
    '',
    '## 4. Currently Installed Local Firmwares (`firmwares/*.fwsc`) Cross-Reference',
    '',
    '| Local File | Catalog Match | Maker | Status | ★ | I/O Badges | Guide |',
    '|---|---|---|---|---:|---|---|',
    ...installed.map((e) => {
      const stem = path.basename(e.installedFile, '.fwsc');
      return `| \`${e.installedFile}\` | **${mdCell(e.title)}** | ${mdCell(e.maker)} | ${mdCell(e.status)} | ${e.stars ?? '—'} | ${mdCell(e.ioBadges.join(', ') || 'Ch 1 MIDI')} | [${stem}.README.md](./${stem}.README.md) |`;
    }),
    '',
    '---',
    '',
    '## 5. Complete Catalog of All 486 FM-1 Firmwares',
    '',
  ];

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    list: entries
      .filter((e) => e.categories[0] === cat || (!CATEGORY_ORDER.includes(e.categories[0]) && cat === 'tools'))
      .sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || ((b.stars ?? -1) - (a.stars ?? -1)) || a.title.localeCompare(b.title)),
  }));

  grouped.forEach(({ cat, list }) => {
    lines.push(`<details>`);
    lines.push(`<summary><strong>${cat.toUpperCase()} (${list.length} firmwares)</strong> — click to expand</summary>`);
    lines.push('');
    lines.push('| Title | Maker | Latest | ★ | I/O & Capabilities | Summary & Links |');
    lines.push('|---|---|---|---:|---|---|');
    list.forEach((e) => {
      const shortBlurb = e.blurb.length > 180 ? `${e.blurb.slice(0, 177)}...` : e.blurb;
      const localTag = e.installedFile ? ` **[Installed: \`${e.installedFile}\`]**` : '';
      const ioText = e.ioBadges.length ? e.ioBadges.join(', ') : e.ioTier.replace(/_/g, ' ');
      lines.push(
        `| **${mdCell(e.title)}**${localTag} | ${mdCell(e.maker)} | ${mdCell(e.status || e.updated)} | ${e.stars ?? (e.pinned ? 'Pin' : '—')} | ${mdCell(ioText)} | ${mdCell(shortBlurb)} (${formatLinks(e.links)}) |`
      );
    });
    lines.push('');
    lines.push('</details>');
    lines.push('');
  });

  return lines.join('\n');
};

const run = async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(__dirname, '..', '..');
  const firmwaresDir = path.join(rootDir, 'firmwares');

  const localFiles = (await fs.readdir(firmwaresDir))
    .filter((f) => f.toLowerCase().endsWith('.fwsc'))
    .sort();

  const res = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': 'FM1-Hub-CatalogBuilder/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: HTTP ${res.status}`);
  }
  const htmlText = await res.text();
  const entries = parseFirmwaresHtml(htmlText, localFiles);
  if (entries.length === 0) {
    throw new Error('Parsed 0 firmware entries from fm1-editor.com/firmware/');
  }

  const summary = summarizeCatalog(entries);
  const generatedAt = new Date().toISOString();

  const jsonPayload = {
    sourceUrl: SOURCE_URL,
    generatedAt,
    summary,
    firmwares: entries,
  };

  await fs.writeFile(
    path.join(firmwaresDir, 'catalog.json'),
    `${JSON.stringify(jsonPayload, null, 2)}\n`,
    'utf8'
  );
  await fs.writeFile(
    path.join(firmwaresDir, 'FM1_FIRMWARE_CATALOG.md'),
    `${renderCatalogMarkdown(entries, summary, generatedAt)}\n`,
    'utf8'
  );

  console.log(
    `[catalog] Wrote catalog.json and FM1_FIRMWARE_CATALOG.md (${summary.totalFirmwares} firmwares, ${summary.installedCount} matched locally).`
  );
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error('[catalog] ERROR:', err.message);
    process.exit(1);
  });
}
