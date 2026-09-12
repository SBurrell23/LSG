// harmony.js — builds a chord progression for a form, gated by difficulty.
// Chords: { root: pc, quality: string, bass?: pc, pos: 16ths offset in bar, dur: 16ths }

const Harmony = (() => {
  const { mod, MAJOR_SCALE, NAT_MINOR_SCALE, isDominant, isMinorish, isMajorish } = Theory;

  // Diatonic degree -> triad / seventh quality in each mode.
  // Minor uses the harmonic-minor dominant (V7) and natural-minor III/VI/VII.
  const DIATONIC = {
    major: [
      { triad: '', seventh: 'maj7' }, { triad: 'm', seventh: 'm7' }, { triad: 'm', seventh: 'm7' },
      { triad: '', seventh: 'maj7' }, { triad: '', seventh: '7' }, { triad: 'm', seventh: 'm7' },
      { triad: 'dim', seventh: 'm7b5' },
    ],
    minor: [
      { triad: 'm', seventh: 'm7' }, { triad: 'dim', seventh: 'm7b5' }, { triad: '', seventh: 'maj7' },
      { triad: 'm', seventh: 'm7' }, { triad: '', seventh: '7' }, { triad: '', seventh: 'maj7' },
      { triad: '', seventh: '7' },
    ],
  };
  // Minor V is raised-7th based: root is the 5th degree, but the leading tone
  // lives in the chord quality, so the root pc is unchanged.

  // Which degrees are allowed at each level (1-10).
  function allowedDegrees(level) {
    if (level <= 1) return [0, 3, 4];
    if (level === 2) return [0, 1, 3, 4, 5];
    if (level <= 4) return [0, 1, 2, 3, 4, 5];
    return [0, 1, 2, 3, 4, 5, 6];
  }

  function degreeRoot(key, degree, alt = 0) {
    const scale = key.mode === 'major' ? MAJOR_SCALE : NAT_MINOR_SCALE;
    return mod(key.tonic + scale[degree] + alt, 12);
  }

  // ---- Progression idioms -----------------------------------------------------
  // Instead of a random walk over chords, every 4-bar phrase is built from a
  // recognisable shape. Tokens are roman numerals relative to the key:
  //   I..VII      diatonic degrees (quality comes from the key and level)
  //   iv          borrowed minor iv         I7 II7 III7 VI7   dominant on that degree
  //   bII bIII bVI bVII   flat-side borrowed chords
  //   X/n         the chord over scale degree n in the bass (I/3 = C/E in C)
  // A template's length sets its harmonic rhythm: 2 tokens = a chord every two
  // bars, 4 = one per bar, 8 = two per bar. `min` is the first level it appears at.
  const TEMPLATES = [
    // simple (level 1+): I, IV, V only
    { s: ['I', 'V'], w: 1.5, min: 1 }, { s: ['I', 'IV'], w: 1.2, min: 1 },
    { s: ['I', 'IV', 'V', 'I'], w: 2, min: 1 }, { s: ['I', 'I', 'IV', 'V'], w: 2, min: 1 },
    { s: ['I', 'IV', 'I', 'V'], w: 2, min: 1 }, { s: ['I', 'V', 'I', 'IV'], w: 1, min: 1 },
    { s: ['IV', 'I', 'V', 'I'], w: 1, min: 1 }, { s: ['I', 'IV', 'V', 'IV'], w: 1, min: 1 },
    // pop (level 2+): adds ii and vi
    { s: ['I', 'V', 'vi', 'IV'], w: 3, min: 2 }, { s: ['vi', 'IV', 'I', 'V'], w: 2.5, min: 2 },
    { s: ['I', 'vi', 'IV', 'V'], w: 3, min: 2 }, { s: ['I', 'IV', 'vi', 'V'], w: 2, min: 2 },
    { s: ['IV', 'I', 'V', 'vi'], w: 1.2, min: 2 }, { s: ['I', 'vi', 'ii', 'V'], w: 2.5, min: 2 },
    { s: ['vi', 'ii', 'V', 'I'], w: 1.2, min: 2 }, { s: ['I', 'ii', 'IV', 'V'], w: 1.5, min: 2 },
    { s: ['vi', 'vi', 'IV', 'V'], w: 1, min: 2 }, { s: ['I', 'I', 'vi', 'vi'], w: 0.8, min: 2 },
    { s: ['ii', 'V', 'I', 'vi'], w: 1, min: 2 }, { s: ['I', 'V', 'ii', 'IV'], w: 0.8, min: 2 },
    { s: ['I', 'vi'], w: 1, min: 2 }, { s: ['vi', 'IV'], w: 0.8, min: 2 },
    // classic / circle of fifths (level 3+): adds iii
    { s: ['I', 'iii', 'IV', 'V'], w: 1.5, min: 3 }, { s: ['iii', 'vi', 'ii', 'V'], w: 1.5, min: 3 },
    { s: ['I', 'iii', 'vi', 'IV'], w: 1.2, min: 3 }, { s: ['I', 'IV', 'iii', 'vi'], w: 1, min: 3 },
    { s: ['I', 'vi', 'iii', 'IV'], w: 0.8, min: 3 }, { s: ['IV', 'V', 'iii', 'vi'], w: 1.5, min: 3 },
    { s: ['ii', 'iii', 'IV', 'V'], w: 0.8, min: 3 }, { s: ['I', 'iii', 'ii', 'V'], w: 1, min: 3 },
    // two chords a bar (level 4+)
    { s: ['I', 'vi', 'ii', 'V', 'I', 'vi', 'ii', 'V'], w: 1.5, min: 4 },
    { s: ['I', 'IV', 'I', 'V', 'I', 'IV', 'V', 'I'], w: 1, min: 4 },
    { s: ['I', 'vi', 'IV', 'V', 'iii', 'vi', 'ii', 'V'], w: 1.2, min: 5 },
    { s: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'ii', 'V'], w: 1.2, min: 5 },
    { s: ['I', 'iii', 'vi', 'I', 'IV', 'V', 'iii', 'vi'], w: 0.8, min: 5 },
    // bass lines (level 5+)
    { s: ['I', 'V/7', 'vi', 'I/5'], w: 1.5, min: 5, tag: 'theatre' }, { s: ['IV', 'I/3', 'ii', 'V'], w: 1.2, min: 5, tag: 'theatre' },
    { s: ['I', 'I/3', 'IV', 'IV/5'], w: 0.8, min: 5 }, { s: ['vi', 'I/5', 'IV', 'I/3'], w: 0.8, min: 5 },
    { s: ['I', 'V/7', 'vi', 'I/5', 'IV', 'I/3', 'ii', 'V'], w: 1, min: 6, tag: 'theatre' },
    // secondary dominants written in (level 6+)
    { s: ['I', 'VI7', 'ii', 'V'], w: 1.5, min: 6, tag: 'theatre' }, { s: ['I', 'III7', 'vi', 'II7'], w: 0.8, min: 6 },
    { s: ['ii', 'V', 'I', 'VI7'], w: 1, min: 6 }, { s: ['I', 'I7', 'IV', 'iv'], w: 1.2, min: 6 },
    { s: ['I', 'VI7', 'ii', 'V', 'iii', 'VI7', 'ii', 'V'], w: 0.8, min: 7 },
    // theatre / Broadway ballad shapes (tagged: styles with idioms: 'theatre' prefer them)
    { s: ['I', 'I/3', 'IV', 'iv'], w: 2, min: 5, tag: 'theatre' }, { s: ['I', 'iii', 'IV', 'iv'], w: 1.5, min: 4, tag: 'theatre' },
    { s: ['IV', 'V', 'I', 'vi'], w: 1.5, min: 2, tag: 'theatre' }, { s: ['ii', 'V', 'iii', 'vi'], w: 1.2, min: 3, tag: 'theatre' },
    { s: ['I', 'vi', 'IV', 'iv'], w: 1.2, min: 4, tag: 'theatre' }, { s: ['I', 'I/3', 'IV', 'V/7'], w: 1, min: 5, tag: 'theatre' },
    { s: ['I', 'III7', 'IV', 'iv'], w: 1, min: 6, tag: 'theatre' }, { s: ['I', 'bVI', 'IV', 'I'], w: 0.8, min: 8, tag: 'theatre' },
    { s: ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'ii', 'V'], w: 0.8, min: 5, tag: 'theatre' },
    // modal / borrowed (level 7+)
    { s: ['I', 'bVII', 'IV', 'I'], w: 1.2, min: 7 }, { s: ['I', 'IV', 'iv', 'I'], w: 1, min: 7 },
    { s: ['vi', 'bVI', 'I', 'V'], w: 0.6, min: 8 }, { s: ['I', 'bIII', 'IV', 'bVII'], w: 0.7, min: 8 },
    { s: ['IV', 'iv', 'I', 'bVII'], w: 0.6, min: 8 }, { s: ['I', 'bVI', 'bVII', 'I'], w: 0.7, min: 8 },
  ];
  // Bridges start somewhere other than the tonic.
  const BRIDGES = [
    { s: ['IV', 'IV', 'I', 'I'], w: 2, min: 1 }, { s: ['IV', 'V', 'I', 'I'], w: 1.5, min: 1 }, { s: ['IV', 'I', 'IV', 'V'], w: 1.2, min: 1 },
    { s: ['IV', 'V', 'iii', 'vi'], w: 2, min: 3 }, { s: ['ii', 'V', 'I', 'I'], w: 1.5, min: 2 }, { s: ['vi', 'vi', 'ii', 'V'], w: 1.5, min: 2 },
    { s: ['vi', 'IV', 'ii', 'V'], w: 1.2, min: 2 }, { s: ['IV', 'IV', 'ii', 'V'], w: 1.2, min: 2 }, { s: ['iii', 'vi', 'ii', 'V'], w: 1.2, min: 3 },
    { s: ['IV', 'V/7', 'vi', 'I/5'], w: 1, min: 5 }, { s: ['ii', 'V', 'iii', 'VI7'], w: 1, min: 6 },
    { s: ['IV', 'iv', 'I', 'I'], w: 1, min: 7, tag: 'theatre' }, { s: ['bVI', 'bVII', 'I', 'I'], w: 0.8, min: 8 },
    { s: ['IV', 'iv', 'iii', 'vi'], w: 1, min: 4, tag: 'theatre' }, { s: ['ii', 'V', 'I', 'I/3'], w: 1, min: 5, tag: 'theatre' },
  ];
  const NUMERAL = { I: 0, II: 1, III: 2, IV: 3, V: 4, VI: 5, VII: 6 };
  const SPECIAL = {  // non-diatonic tokens: degree, alteration, quality family, first level
    iv: { deg: 3, alt: 0, q: 'm', min: 4 },
    I7: { deg: 0, alt: 0, q: '7', min: 6 }, II7: { deg: 1, alt: 0, q: '7', min: 6 },
    III7: { deg: 2, alt: 0, q: '7', min: 6 }, VI7: { deg: 5, alt: 0, q: '7', min: 6 },
    bII: { deg: 1, alt: -1, q: '7', min: 9 }, bIII: { deg: 2, alt: -1, q: 'maj', min: 8 },
    bVI: { deg: 5, alt: -1, q: 'maj', min: 8 }, bVII: { deg: 6, alt: -1, q: '7', min: 7 },
  };
  function parseToken(tok) {
    const [chord, bass] = tok.split('/');
    const sp = SPECIAL[chord];
    if (sp) return { ...sp, bass: bass ? parseInt(bass, 10) - 1 : undefined, special: chord };
    return { deg: NUMERAL[chord.toUpperCase()], alt: 0, bass: bass ? parseInt(bass, 10) - 1 : undefined, min: bass ? 5 : 1 };
  }
  function templateAllowed(tpl, level) {
    if (level < tpl.min) return false;
    const allowed = allowedDegrees(level);
    return tpl.s.every(tok => { const p = parseToken(tok); return level >= p.min && (p.special ? true : allowed.includes(p.deg)); });
  }
  function pickTemplate(rng, level, pool, profile, avoid) {
    const rate = profile.rate !== undefined ? profile.rate : 1;
    const options = pool.filter(t => templateAllowed(t, level) && t !== avoid).map(t => {
      let w = t.w;
      if (t.s.length === 8) w *= level >= 6 ? 1.2 * rate : 0.6 * rate;       // busy harmony later, and per style
      if (t.s.length === 2) w *= rate < 1 ? 1.8 : 0.8;                        // static harmony for laid-back styles
      if (profile.idioms) w *= t.tag === profile.idioms ? 3 : 0.6;             // a style's own idioms come first
      return [t, w];
    });
    return rng.weighted(options.length ? options : pool.filter(t => templateAllowed(t, level)).map(t => [t, t.w]));
  }
  // Lay a template out over 4 bars as [[token, dur], ...] per bar.
  function renderTemplate(tpl, barLen, beat) {
    const half = halves(barLen, beat);
    const bars = [];
    if (tpl.s.length === 2) for (const tok of tpl.s) { bars.push([[tok, barLen]]); bars.push([[tok, barLen]]); }
    else if (tpl.s.length === 4) for (const tok of tpl.s) bars.push([[tok, barLen]]);
    else for (let i = 0; i < 8; i += 2) bars.push([[tpl.s[i], half[0]], [tpl.s[i + 1], half[1]]]);
    return bars;
  }
  // Rewrite the last bar(s) of a phrase to make the requested cadence.
  function applyCadence(rng, level, bars, cadence, barLen, beat) {
    const half = halves(barLen, beat);
    const two = (x, y) => [[x, half[0]], [y, half[1]]];
    const one = x => [[x, barLen]];
    const n = bars.length;
    switch (cadence) {
      case 'half':
        bars[n - 1] = level >= 4 && rng.chance(0.5) ? two('ii', 'V') : (level >= 3 && rng.chance(0.15) ? one('IV') : one('V'));
        break;
      case 'full': case 'final': {
        const pre = level <= 2 ? rng.pick([one('V'), one('V'), one('IV')])
          : rng.weighted([[one('V'), 3], [two('ii', 'V'), level >= 4 ? 3 : 1], [one('IV'), 1.2], [two('IV', 'V'), 1.5], [two('vi', 'V'), level >= 3 ? 0.8 : 0]]);
        bars[n - 2] = pre; bars[n - 1] = one('I');
        break;
      }
      case 'turnaround':
        if (level <= 3) { bars[n - 1] = one('V'); break; }
        bars[n - 2] = rng.weighted([[two('I', 'vi'), 3], [two('I', 'VI7'), level >= 6 ? 2 : 0], [two('iii', 'VI7'), level >= 7 ? 2 : 0], [two('I', 'IV'), 1]]);
        bars[n - 1] = rng.weighted([[two('ii', 'V'), 3], [two('I', 'V'), level <= 6 ? 1.2 : 0.4], [two('IV', 'V'), 1], [one('V'), level <= 5 ? 0.8 : 0.2]]);
        break;
      case 'deceptive': bars[n - 2] = one('V'); bars[n - 1] = one('vi'); break;
      case 'plagal': bars[n - 2] = one('IV'); bars[n - 1] = one('I'); break;
      default: break;
    }
    return bars;
  }
  function tokenToChord(tok, key, level, rng, profile, bar, pos, dur) {
    const p = parseToken(tok);
    let alt = p.alt;
    // In minor keys the "flat" chords are already diatonic (bVII is the subtonic).
    if (key.mode === 'minor' && (p.special === 'bVII' || p.special === 'bVI' || p.special === 'bIII')) alt = 0;
    let quality;
    if (p.special) {
      const q = SPECIAL[p.special].q;
      quality = q === 'maj' ? (level >= 5 ? 'maj7' : '') : q === '7' ? (level >= 3 ? '7' : '') : (level >= 5 ? 'm7' : 'm');
      if (key.mode === 'minor' && p.special === 'iv') quality = baseQuality(key, 3, level, rng, profile);
    } else quality = baseQuality(key, p.deg, level, rng, profile);
    const chord = { root: degreeRoot(key, p.deg, alt), degree: p.special ? -1 : p.deg, quality, bar, pos, dur, diatonic: !p.special };
    if (p.special) chord.written = true; // came from the idiom itself, not a decoration
    if (p.bass !== undefined) chord.bass = degreeRoot(key, p.bass);
    return chord;
  }

  // ---- Decorations ----------------------------------------------------------
  function baseQuality(key, degree, level, rng, profile) {
    const d = DIATONIC[key.mode][degree];
    // Type flavour: blues-based styles want dominant 7ths on I and IV.
    if (profile.dominant && level >= 3 && key.mode === 'major' && (degree === 0 || degree === 3 || degree === 4)) return '7';
    if (level <= 4 || profile.triads) {
      // Triads; V7 sometimes at level 3, always from level 4.
      if (degree === 4 && (level >= 4 || rng.chance(0.5)) && level >= 3) return '7';
      if (degree === 6) return 'm7b5';
      return d.triad;
    }
    // Level 5-6: sevenths creep in (V7 always; maj7 / m7 on roughly a third of chords at 5, two thirds at 6).
    // Level 7+: sevenths throughout (with some sixths / triads for colour from level 8).
    const p7 = level === 5 ? 0.35 : level === 6 ? 0.65 : 1;
    if (p7 < 1 && !rng.chance(p7)) return degree === 4 ? '7' : degree === 6 ? 'm7b5' : d.triad;
    if (key.mode === 'major') {
      if (degree === 0) return rng.pick(level >= 8 ? ['maj7', 'maj7', '6', ''] : ['maj7', 'maj7', '']);
      if (degree === 3) return rng.pick(level >= 8 ? ['maj7', 'maj7', '6'] : ['maj7']);
    } else {
      if (degree === 0) return rng.pick(level >= 8 ? ['m7', 'm6', 'm', 'mMaj7'] : ['m7', 'm']);
      if (degree === 4) return level >= 9 && rng.chance(0.4) ? '7b9' : '7';
    }
    return d.seventh;
  }

  // Main entry: build the whole tune's harmony.
  //  form: [{ name, bars, cadence, key, reuse? }]
  //  returns [{ key, chords: [...], bars: [[chord,...] per bar] }] per section
  // profile: the type's harmony profile (see Tune.TYPES):
  //   triads   keep triads (plus V7) whatever the level
  //   dominant dominant 7ths on I, IV and V (blues-based styles)
  //   rate     multiplier on how often a bar holds two chords
  //   form     'blues' selects the fixed 12-bar template instead of the Markov walk
  //   mult     per-decoration probability multipliers: secondary, borrowed, passingDim, tritone, slash, sus
  function generate(rng, level, form, meter, profile = {}) {
    const barLen = meter === '3/4' ? 12 : meter === '2/4' ? 8 : meter === '6/8' ? 12 : 16;
    const beat = meter === '6/8' ? 6 : 4; // 6/8 counts two dotted-quarter beats
    const sections = [];
    for (const sec of form) {
      if (sec.reuse !== undefined) {
        const src = sections[sec.reuse];
        // Deep copy, then re-do the ending bars to fit this section's cadence.
        // A reused section in a different key (final-chorus lift) is transposed.
        const shift = mod(sec.key.tonic - src.key.tonic, 12);
        const copy = { key: sec.key, bars: src.bars.map(b => b.map(c => ({
          ...c, root: mod(c.root + shift, 12), bass: c.bass !== undefined ? mod(c.bass + shift, 12) : undefined, key: shift ? sec.key : c.key,
        }))) };
        if (sec.cadence !== form[sec.reuse].cadence) {
          const endBars = Math.min(2, copy.bars.length);
          const fresh = generateSection(rng, level, sec, barLen, profile, beat);
          for (let i = 1; i <= endBars; i++) copy.bars[copy.bars.length - i] = fresh.bars[fresh.bars.length - i];
        }
        sections.push(copy);
        continue;
      }
      sections.push(generateSection(rng, level, sec, barLen, profile, beat));
    }
    return sections;
  }

  function generateSection(rng, level, sec, barLen, profile, beat = 4) {
    if (profile.form === 'blues') return generateBlues(rng, level, sec, barLen, profile, beat);
    const key = sec.key;
    const nBars = sec.bars;
    const mult = k => (profile.mult && profile.mult[k] !== undefined) ? profile.mult[k] : 1;
    // Plan each 4-bar phrase from an idiom. The second phrase of a section
    // often restates the first with a different ending (question / answer).
    const phrases = Math.max(1, Math.round(nBars / 4));
    const pool = sec.name === 'B' ? BRIDGES : TEMPLATES;
    let chords = [];
    let prevTpl = null;
    for (let ph = 0; ph < phrases; ph++) {
      const isLastPhrase = ph === phrases - 1;
      const tpl = ph > 0 && prevTpl && rng.chance(0.45) ? prevTpl : pickTemplate(rng, level, pool, profile, prevTpl);
      prevTpl = tpl;
      let bars = renderTemplate(tpl, barLen, beat);
      if (isLastPhrase) bars = applyCadence(rng, level, bars, sec.cadence, barLen, beat);
      else if (rng.chance(0.3)) bars = applyCadence(rng, level, bars, rng.weighted([['half', 3], ['deceptive', level >= 2 ? 2 : 0], ['plagal', 1.5]]), barLen, beat);
      bars.forEach((bar, bi) => {
        let pos = 0;
        for (const [tok, dur] of bar) { chords.push(tokenToChord(tok, key, level, rng, profile, ph * 4 + bi, pos, dur)); pos += dur; }
      });
    }
    // Sections that are not a multiple of 4 bars: trim or pad on the tonic.
    chords = chords.filter(c => c.bar < nBars);
    for (let b = Math.max(...chords.map(c => c.bar)) + 1; b < nBars; b++) chords.push(tokenToChord('I', key, level, rng, profile, b, 0, barLen));

    // Merge identical adjacent chords within a bar (avoid "C | C" halves).
    chords = mergeRepeats(chords);

    // --- decorations, each gated by level and scaled by the type profile ---
    if (level >= 6 && mult('secondary') > 0) chords = secondaryDominants(rng, level, key, chords, barLen, mult('secondary'), beat);
    if (level >= 8 && mult('borrowed') > 0) chords = modalInterchange(rng, level, key, chords, sec, mult('borrowed'));
    if (level >= 9 && mult('passingDim') > 0) chords = passingDiminished(rng, level, key, chords, barLen, mult('passingDim'), beat);
    if (level >= 10 && mult('tritone') > 0) chords = tritoneSubs(rng, level, key, chords, mult('tritone'));
    if (level >= 8 && mult('slash') > 0) chords = slashChords(rng, level, key, chords, mult('slash'));
    if (level >= 6 && mult('sus') > 0) chords = susColour(rng, level, chords, barLen, mult('sus'), beat);

    // A modulated section returns home through the home key's ii–V.
    if (sec.returnKey && sec.cadence === 'half') {
      const hk = sec.returnKey;
      const half = halves(barLen, beat);
      chords = chords.filter(c => c.bar !== nBars - 1);
      chords.push({ root: degreeRoot(hk, 1), quality: hk.mode === 'major' ? 'm7' : 'm7b5', bar: nBars - 1, pos: 0, dur: half[0], degree: 1, diatonic: false, key: hk });
      chords.push({ root: degreeRoot(hk, 4), quality: hk.mode === 'major' ? '7' : '7b9', bar: nBars - 1, pos: half[0], dur: half[1], degree: 4, diatonic: false, key: hk });
    }

    // Regroup into bars.
    const bars = Array.from({ length: nBars }, () => []);
    for (const c of chords) bars[c.bar].push(c);
    return { key, bars };
  }

  // How to split a chord slot in two so every piece is still fillable by rhythm cells.
  // How the bar splits in two: on the beat in 6/8, otherwise by halves (3/4 gives 2+1 beats).
  const halves = (barLen, beat) => beat === 6 ? [6, 6] : barLen === 12 ? [8, 4] : barLen === 8 ? [4, 4] : [8, 8];
  function splitDur(dur, beat) {
    if (beat === 6) return dur === 12 ? [6, 6] : null; // 6/8: split on the dotted-quarter beat
    if (dur % 8 === 0) return [dur / 2, dur / 2];
    if (dur === 12) return [8, 4];
    return null;
  }

  // ---- 12-bar blues ------------------------------------------------------------
  // Fixed templates instead of the Markov walk. Grows with the level:
  //   1-2  I I I I | IV IV I I | V (V/IV) I I           triads, V7 from level 2
  //   3-4  dominant 7ths on I, IV, V; quick change to IV in bar 2 from level 4
  //   5-6  turnaround I7 V7 / I7 VI7 ii7 V7
  //   7-8  jazz blues: #IVdim7 in bar 6, VI7 in bar 8, ii7 V7 in bars 9-10
  //   9-10 v7 I7 leading to the IV in bar 4, iii7 VI7 in bar 8, tritone subs
  // Minor keys use the minor blues: i7 iv7 ... bVI7 V7.
  function generateBlues(rng, level, sec, barLen, profile, beat = 4) {
    const key = sec.key, T = key.tonic, minor = key.mode === 'minor';
    const mult = k => (profile.mult && profile.mult[k] !== undefined) ? profile.mult[k] : 1;
    const q7 = level >= 3 ? '7' : '';
    const qI = minor ? (level >= 3 ? (level >= 8 && rng.chance(0.4) ? 'm6' : 'm7') : 'm') : q7;
    const qIV = minor ? (level >= 3 ? 'm7' : 'm') : q7;
    const qV = level >= 2 ? (minor && level >= 7 ? '7b9' : '7') : '';
    const ch = (off, quality, dur, pos = 0) => ({ root: mod(T + off, 12), quality, dur, pos, degree: -1, diatonic: false });
    const full = (off, q) => [ch(off, q, barLen)];
    const half = (a, b) => [ch(a[0], a[1], barLen / 2), ch(b[0], b[1], barLen / 2, barLen / 2)];
    const I = 0, IV = 5, V = 7;
    const bars = [];
    bars.push(full(I, qI));
    bars.push(level >= 4 ? full(IV, qIV) : full(I, qI));
    bars.push(full(I, qI));
    bars.push(level >= 9 && !minor ? half([7, 'm7'], [I, '7']) : full(I, qI));
    bars.push(full(IV, qIV));
    bars.push(level >= 7 && !minor ? full(6, 'dim7') : full(IV, qIV));
    bars.push(full(I, qI));
    if (minor) bars.push(full(I, qI));
    else bars.push(level >= 9 ? half([4, 'm7'], [9, '7']) : level >= 7 ? full(9, '7') : full(I, qI));
    if (minor) { bars.push(full(8, level >= 5 ? '7' : '')); bars.push(full(V, qV)); }
    else if (level >= 7) { bars.push(full(2, 'm7')); bars.push(full(V, '7')); }
    else { bars.push(full(V, qV)); bars.push(level >= 2 ? full(IV, qIV) : full(V, qV)); }
    if (sec.cadence === 'turnaround') {
      bars.push(level >= 6 ? half([I, qI], [9, '7']) : full(I, qI));
      bars.push(level >= 6 ? half([2, minor ? 'm7b5' : 'm7'], [V, qV]) : half([I, qI], [V, qV]));
    } else {
      bars.push(level >= 5 ? half([I, qI], [IV, qIV]) : full(I, qI));
      bars.push(full(I, qI));
    }
    let chords = [];
    bars.forEach((bar, b) => bar.forEach(c => chords.push({ ...c, bar: b })));
    if (level >= 10 && mult('tritone') > 0) chords = tritoneSubs(rng, level, key, chords, mult('tritone'));
    if (level >= 6 && mult('sus') > 0) chords = susColour(rng, level, chords, barLen, mult('sus'), beat);
    const out = Array.from({ length: bars.length }, () => []);
    for (const c of chords) out[c.bar].push(c);
    return { key, bars: out };
  }

  function mergeRepeats(chords) {
    const out = [];
    for (const c of chords) {
      const prev = out[out.length - 1];
      if (prev && prev.bar === c.bar && prev.root === c.root && prev.quality === c.quality) {
        prev.dur += c.dur;
      } else out.push(c);
    }
    return out;
  }

  // Insert V7/X (or ii–V/X) before a chord X.
  function secondaryDominants(rng, level, key, chords, barLen, m = 1, beat = 4) {
    const p = Math.min(0.9, [0.18, 0.28, 0.35, 0.42, 0.45][Math.min(level, 10) - 6] * m);
    const out = [];
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      const next = chords[i + 1];
      const split = splitDur(c.dur, beat);
      const canSplit = split && (level >= 9 ? c.dur >= barLen / 2 : c.dur >= barLen);
      if (next && canSplit && next.quality !== 'dim' && next.quality !== 'm7b5' && next.quality !== 'dim7'
          && !isDominant(c.quality) && next.degree !== c.degree && rng.chance(p)) {
        const target = next.root;
        const domRoot = mod(target + 7, 12);
        const [d1, d2] = split;
        const useIIV = level >= 7 && c.dur >= barLen && rng.chance(0.4) && c.degree !== 0;
        if (useIIV) {
          const iiRoot = mod(target + 2, 12);
          const iiQ = isMinorish(next.quality) ? 'm7b5' : 'm7';
          out.push({ ...c, root: iiRoot, quality: iiQ, dur: d1, diatonic: false, degree: -1 });
          out.push({ ...c, root: domRoot, quality: '7',
                     pos: c.pos + d1, dur: d2, diatonic: false, degree: -1, secondary: true });
        } else {
          out.push({ ...c, dur: d1 });
          out.push({ ...c, root: domRoot, quality: '7',
                     pos: c.pos + d1, dur: d2, diatonic: false, degree: -1, secondary: true });
        }
      } else out.push(c);
    }
    return out;
  }

  // Borrowed chords: IV -> iv, backdoor bVII7, bVI, cadential iiø.
  function modalInterchange(rng, level, key, chords, sec, m = 1) {
    if (key.mode !== 'major') return chords;
    const p = Math.min(0.9, (level === 8 ? 0.2 : level === 9 ? 0.3 : 0.35) * m);
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i], next = chords[i + 1], isLast = i === chords.length - 1;
      if (isLast) continue;
      if (c.degree === 3 && next && (next.degree === 0 || next.degree === 2) && rng.chance(p)) {
        c.quality = rng.pick(level >= 9 ? ['m', 'm6', 'm7'] : ['m']); c.diatonic = false; c.borrowed = true;
      } else if (c.degree === 4 && next && next.degree === 0 && sec.cadence !== 'final' && level >= 9 && rng.chance(p * 0.6)) {
        // backdoor dominant bVII7 -> I
        c.root = mod(key.tonic + 10, 12); c.quality = '7'; c.degree = -1; c.diatonic = false; c.borrowed = true;
      } else if (c.degree === 5 && next && next.degree === 4 && rng.chance(p * 0.7)) {
        // vi -> bVI (maj7) before V
        c.root = mod(key.tonic + 8, 12); c.quality = level >= 9 ? 'maj7' : ''; c.degree = -1; c.diatonic = false; c.borrowed = true;
      }
    }
    return chords;
  }

  // C – C#dim7 – Dm7 style passing chords when roots ascend by a whole step.
  function passingDiminished(rng, level, key, chords, barLen, m = 1, beat = 4) {
    const p = Math.min(0.9, (level === 9 ? 0.22 : 0.3) * m);
    const out = [];
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i], next = chords[i + 1];
      const split = splitDur(c.dur, beat);
      if (next && split && c.dur >= barLen / 2 && mod(next.root - c.root, 12) === 2
          && !isDominant(c.quality) && rng.chance(p)) {
        const [d1, d2] = split;
        out.push({ ...c, dur: d1 });
        out.push({ root: mod(c.root + 1, 12), quality: 'dim7', bar: c.bar, pos: c.pos + d1, dur: d2,
                   degree: -1, diatonic: false, passing: true });
      } else out.push(c);
    }
    return out;
  }

  // Replace a dominant resolving down a fifth with the dominant a tritone away.
  function tritoneSubs(rng, level, key, chords, m = 1) {
    const p = Math.min(0.9, 0.25 * m);
    for (let i = 0; i < chords.length - 1; i++) {
      const c = chords[i], next = chords[i + 1];
      if (c.quality === '7' && mod(c.root + 5, 12) === next.root && rng.chance(p)) {
        // keep the very final V7 -> I intact most of the time
        if (i === chords.length - 2 && rng.chance(0.6)) continue;
        c.root = mod(c.root + 6, 12); c.quality = '7';
        c.degree = -1; c.diatonic = false; c.tritone = true;
      }
    }
    return chords;
  }

  // Inversions for smoother bass lines (C/E, G/B ...).
  function slashChords(rng, level, key, chords, m = 1) {
    const p = Math.min(0.9, (level === 8 ? 0.12 : 0.18) * m);
    for (let i = 0; i < chords.length - 1; i++) {
      const c = chords[i], next = chords[i + 1];
      if (c.bass !== undefined || isDominant(c.quality) && c.quality !== '7') continue;
      if (!rng.chance(p)) continue;
      const q = Theory.QUALITIES[c.quality].intervals;
      // Pick 3rd or 5th so the bass moves by step into the next root.
      const candidates = q.slice(1, 3).map(iv => mod(c.root + iv, 12))
        .filter(b => { const d = mod(next.root - b, 12); return d === 1 || d === 2 || d === 10 || d === 11; });
      if (candidates.length) { c.bass = rng.pick(candidates); c.diatonic = false; }
    }
    return chords;
  }

  // Occasional 7sus4 resolving to 7 (splits a dominant slot).
  function susColour(rng, level, chords, barLen, m = 1, beat = 4) {
    const p = Math.min(0.9, (level <= 8 ? 0.1 : 0.16) * m);
    const out = [];
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      const split = splitDur(c.dur, beat);
      if (c.quality === '7' && split && c.dur >= 8 && !c.tritone && rng.chance(p)) {
        const [d1, d2] = split;
        out.push({ ...c, quality: '7sus4', dur: d1 });
        out.push({ ...c, pos: c.pos + d1, dur: d2 });
      } else out.push(c);
    }
    return out;
  }

  return { generate, degreeRoot, DIATONIC };
})();
