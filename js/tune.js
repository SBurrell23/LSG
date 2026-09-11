// tune.js — assembles a complete tune (key, form, tempo, harmony, melody)
// and renders it to ABC notation for abcjs.

const Tune = (() => {
  const { mod, makeKey, KEYS, spell, chordTones, chordScale, chordSymbol, abcPitch, keySigAcc,
          LETTERS, LETTER_PC, QUALITIES } = Theory;

  // ---- Level descriptions (shown in the UI) ---------------------------------
  const LEVELS = {
    1:  { name: 'First Steps',   harmony: 'C major only. I, IV and V triads, one chord per bar.', melody: 'Stepwise melody in whole, half and quarter notes within a sixth.' },
    2:  { name: 'Easy',          harmony: 'Keys with up to one sharp or flat. Adds ii and vi.', melody: 'Dotted half notes, small leaps, simple two-bar motifs.' },
    3:  { name: 'Beginner Plus', harmony: 'Up to two accidentals. Adds iii and V7. Occasional two chords per bar. Some tunes in 3/4.', melody: 'First eighth-note pairs and dotted quarters.' },
    4:  { name: 'Intermediate',  harmony: 'Seventh chords throughout (maj7, m7, 7, m7b5). 32-bar AABA with turnarounds.', melody: 'Rests, dotted rhythms and the first syncopations.' },
    5:  { name: 'Intermediate Plus', harmony: 'Secondary dominants (V7 of x). Minor keys and 7sus4 appear.', melody: 'Triplets, off-beat eighths, dotted-eighth figures, a few chromatic notes.' },
    6:  { name: 'Advancing',     harmony: 'ii–V of x, borrowed chords (iv, bVI), slash-bass inversions, 6 and m6 chords.', melody: 'Sixteenth-note figures, syncopated bars, wider range.' },
    7:  { name: 'Advanced',      harmony: 'Tritone substitutions, passing diminished chords, backdoor bVII7, V7b9 in minor. Keys up to five accidentals.', melody: 'Tresillo rhythms, chromatic approach notes, octave leaps.' },
    8:  { name: 'Pro',           harmony: 'Extensions: 9, 13, maj9, 6/9, m11, 7#11. The bridge may modulate.', melody: 'Dense sixteenths, enclosures, larger leaps.' },
    9:  { name: 'Expert',        harmony: 'Altered dominants (7alt, 7#9, 7b13), up to four chords per bar, any key.', melody: 'Chromatic enclosures, fast runs, two-octave range.' },
    10: { name: 'Virtuoso',      harmony: 'Everything, denser: frequent changes, chromatic mediants, thick extensions.', melody: 'Maximum rhythmic density and chromaticism across the full range.' },
  };

  // ---- Key choice ------------------------------------------------------------
  function keyPool(level) {
    const maj = (n) => KEYS.major.filter(k => Math.abs(k.fifths) <= n).map(k => ['major', k.name]);
    const min = (n) => KEYS.minor.filter(k => Math.abs(k.fifths) <= n).map(k => ['minor', k.name]);
    if (level === 1) return [['major', 'C']];
    if (level === 2) return maj(1);
    if (level === 3) return maj(2);
    if (level === 4) return maj(3);
    if (level === 5) return [...maj(3), ...min(1)];
    if (level === 6) return [...maj(4), ...min(2)];
    if (level === 7) return [...maj(5), ...min(3)];
    if (level === 8) return [...maj(5), ...min(4)];
    return [...maj(6), ...min(5)].filter(([, n]) => n !== 'Gb'); // prefer F# over Gb
  }

  function keyFromTonic(tonic, mode, nearFifths) {
    const cands = KEYS[mode].filter(k => k.tonic === tonic);
    cands.sort((a, b) => Math.abs(a.fifths - nearFifths) - Math.abs(b.fifths - nearFifths));
    return makeKey(cands[0].name, mode);
  }

  // ---- Form ---------------------------------------------------------------------
  function makeForm(rng, level, home) {
    if (level <= 3) {
      const bStart = level >= 3 ? rng.pick([3, 3, 1, 5]) : 3;
      return [
        { name: 'A', bars: 4, cadence: 'half', key: home },
        { name: 'A', bars: 4, cadence: 'full', key: home, reuse: 0 },
        { name: 'B', bars: 4, cadence: 'half', key: home, startDegree: bStart },
        { name: 'A', bars: 4, cadence: 'final', key: home, reuse: 0 },
      ];
    }
    let bKey = home, returnKey;
    const pMod = level >= 10 ? 0.65 : level === 9 ? 0.55 : level === 8 ? 0.45 : 0;
    if (rng.chance(pMod)) {
      const opts = home.mode === 'major'
        ? [[5, 'major'], [9, 'minor'], [3, 'major'], [8, 'major'], [5, 'major']]
        : [[3, 'major'], [5, 'minor'], [8, 'major']];
      const [iv, mode] = rng.pick(opts);
      bKey = keyFromTonic(mod(home.tonic + iv, 12), mode, home.fifths);
      returnKey = home;
    }
    const bStart = rng.pick(bKey === home ? [3, 1, 5, 3] : [0, 0, 3]);
    return [
      { name: 'A', bars: 8, cadence: 'turnaround', key: home },
      { name: 'A', bars: 8, cadence: 'full', key: home, reuse: 0 },
      { name: 'B', bars: 8, cadence: 'half', key: bKey, returnKey, startDegree: bStart },
      { name: 'A', bars: 8, cadence: 'final', key: home, reuse: 0 },
    ];
  }

  // ---- Tempo / feel ---------------------------------------------------------------
  function feel(rng, level, meter) {
    if (meter === '3/4') {
      return level >= 6 ? rng.pick([['Jazz Waltz', 132, 176], ['Slow Waltz', 84, 108]]) : ['Waltz', 96, 126];
    }
    if (level <= 3) return rng.pick([['Ballad', 60, 76], ['Medium', 88, 108], ['Bossa Nova', 96, 116]]);
    if (level <= 7) return rng.pick([['Medium Swing', 116, 150], ['Bossa Nova', 116, 140], ['Ballad', 58, 72], ['Latin', 126, 156], ['Medium Swing', 120, 140]]);
    return rng.pick([['Up-tempo Swing', 176, 232], ['Medium-Up Swing', 148, 176], ['Bossa Nova', 128, 152], ['Ballad', 54, 68], ['Funk', 92, 112], ['Samba', 176, 208]]);
  }

  const TITLE_ADJ = ['Autumn', 'Blue', 'Midnight', 'Velvet', 'Lazy', 'Crimson', 'Silent', 'Sunday', 'Neon', 'Paper',
    'Amber', 'Quiet', 'Golden', 'Restless', 'Hollow', 'Winter', 'Distant', 'Tender', 'Late', 'Emerald', 'Northern', 'Scarlet'];
  const TITLE_NOUN = ['Waltz', 'Lullaby', 'Serenade', 'Steps', 'Moon', 'Rain', 'Avenue', 'Dream', 'Lantern', 'Tide',
    'Whisper', 'Postcard', 'Window', 'Garden', 'Harbour', 'Skyline', 'Afternoon', 'Ferry', 'Shadows', 'Streetlight', 'Bridge', 'Ember'];
  const TITLE_TAIL = ['for Nobody', 'on Fifth', 'in Blue', 'at Dusk', 'for Two', 'Revisited', 'in the Rain', 'Uptown', 'in Three', 'Downtown'];

  function makeTitle(rng, meter) {
    const r = rng.next();
    if (r < 0.55) return rng.pick(TITLE_ADJ) + ' ' + rng.pick(TITLE_NOUN.filter(n => meter === '3/4' || n !== 'Waltz'));
    if (r < 0.8) return rng.pick(TITLE_NOUN) + ' ' + rng.pick(TITLE_TAIL.filter(t => meter === '3/4' || t !== 'in Three'));
    return rng.pick(['One for', 'Song for', 'Blues for', 'Waiting for']) + ' ' + rng.pick(['June', 'Ellis', 'Marnie', 'Theo', 'the Cat', 'Later', 'Ruby', 'Sam']);
  }

  // ---- Chord-tone spelling ------------------------------------------------------
  const STEP_OF_INTERVAL = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6,
                             13: 1, 14: 1, 15: 1, 17: 3, 18: 3, 20: 5, 21: 5 };
  function chordToneSpelling(chord, pc, key) {
    const rootSp = spell(chord.root, chord.key || key);
    const ivs = QUALITIES[chord.quality].intervals;
    const iv = ivs.find(i => mod(chord.root + i, 12) === pc);
    if (iv === undefined) return null;
    let step = STEP_OF_INTERVAL[iv];
    if (iv === 6 && chord.quality.includes('#11')) step = 3;
    if (iv === 8 && chord.quality === 'aug') step = 4;
    const letter = LETTERS[(LETTERS.indexOf(rootSp.letter) + step) % 7];
    let acc = pc - LETTER_PC[letter];
    acc = ((acc + 6) % 12 + 12) % 12 - 6; // -6..5
    if (Math.abs(acc) > 1) return null;
    return { letter, acc };
  }

  function spellMelodyNote(ev, prevPitch, nextPitch, key) {
    const k = ev.chord.key || key;
    const pc = mod(ev.pitch, 12);
    if (chordTones(ev.chord).includes(pc)) {
      const s = chordToneSpelling(ev.chord, pc, k);
      if (s) return s;
    }
    if (k.scale.includes(pc)) return spell(pc, k);
    if (chordScale(ev.chord, k).includes(pc)) {
      // Colour tone of the chord scale: spell around the chord root.
      const rootSp = spell(ev.chord.root, k);
      const centre = { centre: ({ F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 })[rootSp.letter] + 7 * rootSp.acc };
      return spell(pc, centre);
    }
    // Chromatic passing / approach: sharp when rising, flat when falling.
    let prefer = 0;
    if (nextPitch !== null && nextPitch !== undefined) prefer = nextPitch > ev.pitch ? 1 : nextPitch < ev.pitch ? -1 : 0;
    else if (prevPitch !== null && prevPitch !== undefined) prefer = ev.pitch > prevPitch ? 1 : -1;
    return spell(pc, k, prefer);
  }

  // ---- ABC rendering ----------------------------------------------------------------
  const onBeat = pos => Math.abs(pos - Math.round(pos)) < 1e-6 && Math.round(pos) % 4 === 0;

  function toAbc(tune) {
    const { title, level, seed, meter, key, tempo, feelName, sections, form } = tune;
    const lines = [];
    lines.push('X:1');
    lines.push('T:' + title);
    lines.push('C:Level ' + level + ' · ' + LEVELS[level].name);
    lines.push('M:' + meter);
    lines.push('L:1/16');
    lines.push('Q:"' + feelName + '" 1/4=' + tempo);
    lines.push('K:' + key.abc);

    // Flatten events for prev/next lookups.
    const flat = [];
    sections.forEach(sec => sec.bars.forEach(bar => bar.events.forEach(e => flat.push(e))));
    const pitched = flat.filter(e => !e.rest);
    pitched.forEach((e, i) => { e._prev = i > 0 ? pitched[i - 1].pitch : null; e._next = i + 1 < pitched.length ? pitched[i + 1].pitch : null; });

    let firstLine = true;
    sections.forEach((sec, si) => {
      const secKey = sec.key;
      const keyChanged = secKey.name !== key.name;
      let line = '';
      const partLetter = form[si].name;
      lines.push('P:' + partLetter);
      if (keyChanged) lines.push('K:' + secKey.abc);
      sec.bars.forEach((bar, b) => {
        const inForce = {}; // letter+octave -> acc
        let barStr = '';
        bar.events.forEach((e, i) => {
          if (i > 0 && onBeat(e.pos) && e.triplet !== 'mid' && e.triplet !== 'end') barStr += ' ';
          if (e.chordStart) barStr += '"' + chordSymbol(e.chord, e.chord.key || secKey) + '"';
          if (e.triplet === 'start') barStr += '(3';
          const len = e.triplet ? 2 : e.dur;
          if (e.rest) { barStr += 'z' + len; return; }
          const sp = spellMelodyNote(e, e._prev, e._next, secKey);
          const ap = abcPitch(e.pitch, sp);
          const id = sp.letter + ap.octave;
          const current = id in inForce ? inForce[id] : keySigAcc(sp.letter, secKey);
          let accStr = '';
          if (current !== sp.acc) { accStr = sp.acc === 0 ? '=' : ap.acc; inForce[id] = sp.acc; }
          barStr += accStr + ap.name + len;
        });
        line += barStr;
        const lastBarOfTune = si === sections.length - 1 && b === sec.bars.length - 1;
        const lastBarOfSection = b === sec.bars.length - 1;
        line += lastBarOfTune ? ' |]' : lastBarOfSection ? ' ||' : ' |';
        if ((b + 1) % 4 === 0 || lastBarOfSection) { lines.push(line); line = ''; }
        else line += ' ';
      });
      if (keyChanged && si < sections.length - 1 && sections[si + 1].key.name === key.name) lines.push('K:' + key.abc);
      firstLine = false;
    });
    return lines.join('\n');
  }

  // ---- Main ------------------------------------------------------------------------
  function generate(level, seed) {
    level = Math.max(1, Math.min(10, level | 0));
    const rng = makeRng(seed);
    const [mode, name] = rng.pick(keyPool(level));
    const key = makeKey(name, mode);
    const meter = level >= 3 && rng.chance(0.2) ? '3/4' : '4/4';
    const barLen = meter === '3/4' ? 12 : 16;
    const form = makeForm(rng, level, key);
    const harmony = Harmony.generate(rng, level, form, meter);
    const sections = Melody.generate(rng, level, harmony, form, barLen, key);
    const [feelName, tLo, tHi] = feel(rng, level, meter);
    const tempo = Math.round(rng.int(tLo, tHi) / 2) * 2;
    const title = makeTitle(rng, meter);
    const tune = { title, level, seed, meter, key, tempo, feelName, sections, form };
    tune.abc = toAbc(tune);
    return tune;
  }

  return { generate, LEVELS, toAbc };
})();
