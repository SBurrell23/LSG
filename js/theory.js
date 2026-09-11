// theory.js — pitch spelling, keys, chord qualities, chord-scales.
// Everything here is pure and deterministic.

const Theory = (() => {
  const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  // Position of each natural letter on the circle of fifths (C = 0).
  const LETTER_FIFTHS = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
  const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
  const NAT_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

  const mod = (n, m) => ((n % m) + m) % m;

  // ---- Keys -------------------------------------------------------------
  // fifths: signature position (positive = sharps). tonicFifths: where the
  // tonic itself sits, used as the "spelling centre" for accidentals.
  const KEYS = {
    major: [
      { name: 'C', tonic: 0, fifths: 0 }, { name: 'G', tonic: 7, fifths: 1 },
      { name: 'D', tonic: 2, fifths: 2 }, { name: 'A', tonic: 9, fifths: 3 },
      { name: 'E', tonic: 4, fifths: 4 }, { name: 'B', tonic: 11, fifths: 5 },
      { name: 'F#', tonic: 6, fifths: 6 }, { name: 'F', tonic: 5, fifths: -1 },
      { name: 'Bb', tonic: 10, fifths: -2 }, { name: 'Eb', tonic: 3, fifths: -3 },
      { name: 'Ab', tonic: 8, fifths: -4 }, { name: 'Db', tonic: 1, fifths: -5 },
      { name: 'Gb', tonic: 6, fifths: -6 },
    ],
    minor: [
      { name: 'Am', tonic: 9, fifths: 0 }, { name: 'Em', tonic: 4, fifths: 1 },
      { name: 'Bm', tonic: 11, fifths: 2 }, { name: 'F#m', tonic: 6, fifths: 3 },
      { name: 'C#m', tonic: 1, fifths: 4 }, { name: 'G#m', tonic: 8, fifths: 5 },
      { name: 'Dm', tonic: 2, fifths: -1 }, { name: 'Gm', tonic: 7, fifths: -2 },
      { name: 'Cm', tonic: 0, fifths: -3 }, { name: 'Fm', tonic: 5, fifths: -4 },
      { name: 'Bbm', tonic: 10, fifths: -5 }, { name: 'Ebm', tonic: 3, fifths: -6 },
    ],
  };

  function makeKey(name, mode) {
    const def = KEYS[mode].find(k => k.name === name);
    if (!def) throw new Error('Unknown key ' + name + ' ' + mode);
    const scale = (mode === 'major' ? MAJOR_SCALE : NAT_MINOR_SCALE).map(i => mod(def.tonic + i, 12));
    // Spelling centre: tonic on the circle of fifths (minor tonic = sig + 3).
    const centre = mode === 'major' ? def.fifths : def.fifths + 3;
    return { name, mode, tonic: def.tonic, fifths: def.fifths, centre, scale,
             abc: name };
  }

  // ---- Spelling ---------------------------------------------------------
  // All candidate spellings for a pitch class: {letter, acc} with acc in -2..2.
  const SPELLINGS = [];
  for (let pc = 0; pc < 12; pc++) {
    const list = [];
    for (const L of LETTERS) {
      for (const acc of [-2, -1, 0, 1, 2]) {
        if (mod(LETTER_PC[L] + acc, 12) === pc) list.push({ letter: L, acc });
      }
    }
    SPELLINGS.push(list);
  }
  const fifthsOf = s => LETTER_FIFTHS[s.letter] + 7 * s.acc;

  // Choose the spelling closest to the key's centre on the circle of fifths.
  // `prefer` (+1 / -1) breaks near-ties for chromatic passing notes.
  function spell(pc, key, prefer = 0) {
    pc = mod(pc, 12);
    let best = null, bestScore = Infinity;
    for (const s of SPELLINGS[pc]) {
      if (Math.abs(s.acc) > 1 && Math.abs(fifthsOf(s) - key.centre) > 8) continue;
      let score = Math.abs(fifthsOf(s) - key.centre);
      if (Math.abs(s.acc) === 2) score += 3;
      // Cb, Fb, E#, B# only when the key signature itself has them (Gb, Cb, F#, C#).
      if (s.acc !== 0 && (s.letter === 'C' || s.letter === 'F') && s.acc === -1 && keySigAcc(s.letter, key) !== -1) score += 6;
      if (s.acc !== 0 && (s.letter === 'E' || s.letter === 'B') && s.acc === 1 && keySigAcc(s.letter, key) !== 1) score += 6;
      if (prefer !== 0 && s.acc !== 0) {
        // If the note is chromatic, lean towards the requested direction.
        if (Math.sign(s.acc) === prefer) score -= 3; else score += 1;
      }
      if (score < bestScore - 1e-9 || (Math.abs(score - bestScore) < 1e-9 && s.acc > best.acc)) {
        best = s; bestScore = score;
      }
    }
    return best;
  }

  const ACC_TEXT = { '-2': 'bb', '-1': 'b', '0': '', '1': '#', '2': 'x' };
  const ACC_ABC = { '-2': '__', '-1': '_', '0': '', '1': '^', '2': '^^' };
  const ACC_UNICODE = { '-2': '𝄫', '-1': '♭', '0': '', '1': '♯', '2': '𝄪' };

  function chordRootName(pc, key) {
    const s = spell(pc, key);
    return s.letter + ACC_TEXT[s.acc];
  }

  // ---- Chord qualities --------------------------------------------------
  // intervals: chord tones (semitones above root). scale: optional explicit
  // chord-scale; otherwise derived from the key.
  const QUALITIES = {
    '':        { intervals: [0, 4, 7] },
    'm':       { intervals: [0, 3, 7] },
    'dim':     { intervals: [0, 3, 6], scale: [0, 2, 3, 5, 6, 8, 9, 11] },
    'aug':     { intervals: [0, 4, 8], scale: [0, 2, 4, 6, 8, 10] },
    'sus4':    { intervals: [0, 5, 7] },
    'sus2':    { intervals: [0, 2, 7] },
    '6':       { intervals: [0, 4, 7, 9] },
    'm6':      { intervals: [0, 3, 7, 9], scale: [0, 2, 3, 5, 7, 9, 10] },
    'add9':    { intervals: [0, 4, 7, 14] },
    'maj7':    { intervals: [0, 4, 7, 11] },
    'm7':      { intervals: [0, 3, 7, 10] },
    '7':       { intervals: [0, 4, 7, 10] },
    'm7b5':    { intervals: [0, 3, 6, 10], scale: [0, 2, 3, 5, 6, 8, 10] },
    'dim7':    { intervals: [0, 3, 6, 9], scale: [0, 2, 3, 5, 6, 8, 9, 11] },
    'mMaj7':   { intervals: [0, 3, 7, 11], scale: [0, 2, 3, 5, 7, 9, 11] },
    '7sus4':   { intervals: [0, 5, 7, 10] },
    'maj9':    { intervals: [0, 4, 7, 11, 14] },
    '6/9':     { intervals: [0, 4, 7, 9, 14] },
    'maj7#11': { intervals: [0, 4, 7, 11, 18], scale: [0, 2, 4, 6, 7, 9, 11] },
    'm9':      { intervals: [0, 3, 7, 10, 14] },
    'm11':     { intervals: [0, 3, 7, 10, 14, 17] },
    '9':       { intervals: [0, 4, 7, 10, 14] },
    '13':      { intervals: [0, 4, 7, 10, 14, 21] },
    '7b9':     { intervals: [0, 4, 7, 10, 13], scale: [0, 1, 3, 4, 6, 7, 9, 10] },
    '7#9':     { intervals: [0, 4, 7, 10, 15], scale: [0, 1, 3, 4, 6, 8, 10] },
    '7#11':    { intervals: [0, 4, 7, 10, 18], scale: [0, 2, 4, 6, 7, 9, 10] },
    '7b13':    { intervals: [0, 4, 7, 10, 20], scale: [0, 2, 4, 5, 7, 8, 10] },
    '7alt':    { intervals: [0, 4, 10, 13, 15, 20], scale: [0, 1, 3, 4, 6, 8, 10] },
    '9sus4':   { intervals: [0, 5, 7, 10, 14] },
  };

  const isDominant = q => ['7', '9', '13', '7b9', '7#9', '7#11', '7b13', '7alt', '7sus4', '9sus4'].includes(q);
  const isMinorish = q => ['m', 'm6', 'm7', 'm9', 'm11', 'mMaj7', 'm7b5'].includes(q);
  const isMajorish = q => ['', '6', 'add9', 'maj7', 'maj9', '6/9', 'maj7#11'].includes(q);

  // Pitch classes of the chord tones.
  function chordTones(chord) {
    return QUALITIES[chord.quality].intervals.map(i => mod(chord.root + i, 12));
  }

  // The scale a melody may draw from over this chord.
  // Explicit chord-scale if defined, otherwise the key's scale plus chord
  // tones, minus any non-chord-tone sitting a half step above a chord tone
  // (the classic "avoid note" rule: F over Cmaj7, C over G7, ...).
  function chordScale(chord, key) {
    const q = QUALITIES[chord.quality];
    if (q.scale) return q.scale.map(i => mod(chord.root + i, 12));
    const tones = new Set(chordTones(chord));
    const out = new Set(tones);
    const ivs = q.intervals;
    for (const pc of key.scale) {
      if (tones.has(pc)) continue;
      const iv = mod(pc - chord.root, 12);
      let clash = [...tones].some(t => mod(pc - t, 12) === 1);
      if (ivs.includes(4) && iv === 3) clash = true;   // minor 3rd against a major 3rd
      if (ivs.includes(10) && iv === 11) clash = true; // major 7th against a dominant 7th
      if (ivs.includes(3) && !ivs.includes(4) && iv === 4) clash = true; // major 3rd against a minor chord
      if (!clash) out.add(pc);
    }
    return [...out];
  }

  function chordSymbol(chord, key) {
    let s = chordRootName(chord.root, key) + chord.quality;
    if (chord.bass !== undefined && chord.bass !== chord.root) s += '/' + chordRootName(chord.bass, key);
    return s;
  }

  // Pretty version for on-screen text (uses real flat/sharp glyphs).
  function prettySymbol(sym) {
    return sym.replace(/([A-G])b/g, '$1♭').replace(/([A-G])#/g, '$1♯');
  }

  // ABC note for a MIDI pitch. spelling = {letter, acc}.
  function abcPitch(midi, spelling) {
    const octave = Math.floor((midi - spelling.acc) / 12) - 1; // MIDI 60 = C4
    let s = spelling.letter;
    if (octave >= 5) s = s.toLowerCase() + "'".repeat(octave - 5);
    else if (octave < 4) s = s + ','.repeat(4 - octave);
    return { acc: ACC_ABC[spelling.acc], name: s, octave };
  }

  // Key signature accidental for a letter (0, 1 or -1).
  function keySigAcc(letter, key) {
    if (key.fifths === undefined) return 0;
    const sharps = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
    const flats = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
    if (key.fifths > 0 && sharps.indexOf(letter) < key.fifths) return 1;
    if (key.fifths < 0 && flats.indexOf(letter) < -key.fifths) return -1;
    return 0;
  }

  return { LETTERS, LETTER_PC, KEYS, QUALITIES, MAJOR_SCALE, NAT_MINOR_SCALE, mod,
           makeKey, spell, chordTones, chordScale, chordSymbol, prettySymbol,
           chordRootName, abcPitch, keySigAcc, isDominant, isMinorish, isMajorish,
           ACC_TEXT, ACC_UNICODE };
})();
