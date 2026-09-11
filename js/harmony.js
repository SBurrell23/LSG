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

  // Markov transitions between scale degrees (0-based).  Weighted by
  // function: tonic -> anything, pre-dominant -> dominant, dominant -> tonic.
  const TRANSITIONS = [
    /* I   */ [[3, 25], [4, 20], [5, 20], [1, 15], [2, 10], [0, 8], [6, 2]],
    /* ii  */ [[4, 60], [3, 10], [6, 8], [2, 8], [0, 10], [5, 4]],
    /* iii */ [[5, 45], [3, 30], [1, 20], [4, 5]],
    /* IV  */ [[4, 40], [0, 25], [1, 20], [5, 8], [2, 5], [6, 2]],
    /* V   */ [[0, 60], [5, 22], [3, 10], [1, 8]],
    /* vi  */ [[1, 30], [3, 35], [4, 20], [2, 10], [0, 5]],
    /* vii */ [[0, 65], [2, 25], [5, 10]],
  ];

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

  // ---- Harmonic rhythm ---------------------------------------------------
  // Returns an array of slot lengths (in 16ths) for one bar.
  function barSlots(rng, level, barLen, role, profile) {
    // role: 'normal' | 'cadence' | 'final' | 'turnaround'
    if (role === 'final') return [barLen];
    const half = barLen / 2;
    let pTwo;
    if (level <= 2) pTwo = 0;
    else if (level === 3) pTwo = role === 'cadence' ? 0.35 : 0.08;
    else if (level === 4) pTwo = role === 'cadence' ? 0.5 : 0.12;
    else if (level <= 6) pTwo = role === 'cadence' ? 0.6 : 0.25;
    else if (level <= 8) pTwo = role === 'cadence' ? 0.6 : 0.35;
    else pTwo = 0.45;
    if (barLen === 8) pTwo *= 0.5; // 2/4: two chords a bar means one per beat, keep it rarer
    if (profile.rate !== undefined) pTwo *= profile.rate; // type: how busy the chord changes are
    if (role === 'turnaround' && level >= 4) pTwo = 1;
    if (rng.chance(pTwo)) {
      if (barLen === 12) return rng.chance(0.5) ? [8, 4] : [4, 8];
      return [half, half];
    }
    return [barLen];
  }

  // ---- Base progression --------------------------------------------------
  // Generates degree indices for `n` slots, ending according to `cadence`.
  function generateDegrees(rng, level, n, cadence, startDegree) {
    const allowed = allowedDegrees(level);
    const degrees = [];
    let cur = startDegree !== undefined ? startDegree : 0;
    // Number of slots reserved for the cadence.
    const tail = cadence === 'half' ? 1 : 2;
    for (let i = 0; i < n - tail; i++) {
      if (i === 0) { cur = startDegree !== undefined ? startDegree : 0; degrees.push(cur); continue; }
      const options = TRANSITIONS[cur].filter(([d]) => allowed.includes(d));
      // Avoid landing on I right before the cadence starts (weak).
      const filtered = i === n - tail - 1 ? options.filter(([d]) => d !== 0 || options.length === 1) : options;
      cur = rng.weighted(filtered.length ? filtered : options);
      degrees.push(cur);
    }
    if (cadence === 'half') {
      // pre-dominant -> V  (the V is the last slot)
      degrees.push(4);
    } else if (cadence === 'full' || cadence === 'final') {
      // ... -> (ii or IV) -> V -> I  when room, else V -> I
      if (n >= 4 && level >= 2) {
        degrees[n - 3] = rng.pick(level >= 3 ? [1, 1, 3, 5] : [3, 3, 1]);
      }
      degrees.push(4, 0);
    } else if (cadence === 'turnaround') {
      // I -> vi -> ii -> V   (last two slots are ii V; preceding get I vi if room)
      if (n >= 4) { degrees[n - 4] = 0; degrees[n - 3] = level >= 3 ? 5 : 3; }
      degrees.push(level >= 2 ? 1 : 3, 4);
    }
    return degrees;
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
    // Level 5+: sevenths (with some sixths / triads for colour from level 8)
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
    const barLen = meter === '3/4' ? 12 : meter === '2/4' ? 8 : meter === '6/8' ? 24 : 16;
    const sections = [];
    for (const sec of form) {
      if (sec.reuse !== undefined) {
        const src = sections[sec.reuse];
        // Deep copy, then re-do the ending bars to fit this section's cadence.
        const copy = { key: src.key, bars: src.bars.map(b => b.map(c => ({ ...c }))) };
        if (sec.cadence !== form[sec.reuse].cadence) {
          const endBars = Math.min(2, copy.bars.length);
          const fresh = generateSection(rng, level, sec, barLen, profile);
          for (let i = 1; i <= endBars; i++) copy.bars[copy.bars.length - i] = fresh.bars[fresh.bars.length - i];
        }
        sections.push(copy);
        continue;
      }
      sections.push(generateSection(rng, level, sec, barLen, profile));
    }
    return sections;
  }

  function generateSection(rng, level, sec, barLen, profile) {
    if (profile.form === 'blues') return generateBlues(rng, level, sec, barLen, profile);
    const key = sec.key;
    const nBars = sec.bars;
    const mult = k => (profile.mult && profile.mult[k] !== undefined) ? profile.mult[k] : 1;
    // Slots per bar.
    const slotsPerBar = [];
    for (let b = 0; b < nBars; b++) {
      let role = 'normal';
      if (b === nBars - 1) role = sec.cadence === 'turnaround' ? 'turnaround' : (sec.cadence === 'half' ? 'cadence' : 'final');
      else if (b === nBars - 2 && sec.cadence !== 'turnaround') role = 'cadence';
      slotsPerBar.push(barSlots(rng, level, barLen, role, profile));
    }
    const slotCount = slotsPerBar.reduce((a, s) => a + s.length, 0);
    const degrees = generateDegrees(rng, level, slotCount, sec.cadence, sec.startDegree);

    // Build chord objects.
    let chords = [];
    let idx = 0;
    for (let b = 0; b < nBars; b++) {
      let pos = 0;
      for (const dur of slotsPerBar[b]) {
        const degree = degrees[idx++];
        chords.push({ root: degreeRoot(key, degree), degree, quality: baseQuality(key, degree, level, rng, profile),
                      bar: b, pos, dur, diatonic: true });
        pos += dur;
      }
    }

    // Merge identical adjacent chords within a bar (avoid "C | C" halves).
    chords = mergeRepeats(chords);

    // --- decorations, each gated by level and scaled by the type profile ---
    if (level >= 6 && mult('secondary') > 0) chords = secondaryDominants(rng, level, key, chords, barLen, mult('secondary'));
    if (level >= 8 && mult('borrowed') > 0) chords = modalInterchange(rng, level, key, chords, sec, mult('borrowed'));
    if (level >= 9 && mult('passingDim') > 0) chords = passingDiminished(rng, level, key, chords, barLen, mult('passingDim'));
    if (level >= 10 && mult('tritone') > 0) chords = tritoneSubs(rng, level, key, chords, mult('tritone'));
    if (level >= 8 && mult('slash') > 0) chords = slashChords(rng, level, key, chords, mult('slash'));
    if (level >= 6 && mult('sus') > 0) chords = susColour(rng, level, chords, barLen, mult('sus'));

    // A modulated section returns home through the home key's ii–V.
    if (sec.returnKey && sec.cadence === 'half') {
      const hk = sec.returnKey;
      const half = barLen === 12 ? [8, 4] : barLen === 8 ? [4, 4] : barLen === 24 ? [12, 12] : [8, 8];
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
  function splitDur(dur, barLen) {
    if (barLen === 24) return dur === 24 ? [12, 12] : dur === 12 ? [6, 6] : null; // 6/8: split on the dotted-quarter beat
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
  function generateBlues(rng, level, sec, barLen, profile) {
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
    if (level >= 6 && mult('sus') > 0) chords = susColour(rng, level, chords, barLen, mult('sus'));
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
  function secondaryDominants(rng, level, key, chords, barLen, m = 1) {
    const p = Math.min(0.9, [0.18, 0.28, 0.35, 0.42, 0.45][Math.min(level, 10) - 6] * m);
    const out = [];
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      const next = chords[i + 1];
      const split = splitDur(c.dur, barLen);
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
  function passingDiminished(rng, level, key, chords, barLen, m = 1) {
    const p = Math.min(0.9, (level === 9 ? 0.22 : 0.3) * m);
    const out = [];
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i], next = chords[i + 1];
      const split = splitDur(c.dur, barLen);
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
  function susColour(rng, level, chords, barLen, m = 1) {
    const p = Math.min(0.9, (level <= 8 ? 0.1 : 0.16) * m);
    const out = [];
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      const split = splitDur(c.dur, barLen);
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
