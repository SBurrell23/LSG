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

  // Which degrees are allowed at each level.
  function allowedDegrees(level) {
    if (level <= 1) return [0, 3, 4];
    if (level === 2) return [0, 1, 3, 4, 5];
    if (level === 3) return [0, 1, 2, 3, 4, 5];
    return [0, 1, 2, 3, 4, 5, 6];
  }

  function degreeRoot(key, degree, alt = 0) {
    const scale = key.mode === 'major' ? MAJOR_SCALE : NAT_MINOR_SCALE;
    return mod(key.tonic + scale[degree] + alt, 12);
  }

  // ---- Harmonic rhythm ---------------------------------------------------
  // Returns an array of slot lengths (in 16ths) for one bar.
  function barSlots(rng, level, barLen, role) {
    // role: 'normal' | 'cadence' | 'final' | 'turnaround'
    if (role === 'final') return [barLen];
    const half = barLen / 2;
    let pTwo;
    if (level <= 2) pTwo = 0;
    else if (level === 3) pTwo = role === 'cadence' ? 0.35 : 0.08;
    else if (level <= 5) pTwo = role === 'cadence' ? 0.6 : 0.25;
    else if (level <= 7) pTwo = 0.45;
    else pTwo = 0.55;
    if (role === 'turnaround' && level >= 4) pTwo = 1;
    if (level >= 9 && barLen === 16 && rng.chance(0.12)) return [4, 4, 4, 4];
    if (level === 10 && barLen === 16 && rng.chance(0.1)) return [8, 4, 4];
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
  function baseQuality(key, degree, level, rng) {
    const d = DIATONIC[key.mode][degree];
    if (level <= 3) {
      // Triads, but V7 appears from level 3.
      if (degree === 4 && level === 3 && rng.chance(0.5)) return '7';
      return d.triad;
    }
    // Level 4+: sevenths (with some sixths / triads for colour)
    if (key.mode === 'major') {
      if (degree === 0) return rng.pick(level >= 6 ? ['maj7', 'maj7', '6', ''] : ['maj7', 'maj7', '']);
      if (degree === 3) return rng.pick(level >= 6 ? ['maj7', 'maj7', '6'] : ['maj7']);
    } else {
      if (degree === 0) return rng.pick(level >= 6 ? ['m7', 'm6', 'm', 'mMaj7'] : ['m7', 'm']);
      if (degree === 4) return level >= 7 && rng.chance(0.4) ? '7b9' : '7';
    }
    return d.seventh;
  }

  function extend(chord, level, rng, isFinal) {
    const q = chord.quality;
    if (isFinal) {
      if (level >= 8) chord.quality = isMinorish(q) ? rng.pick(['m9', 'm6', 'm7']) : rng.pick(['6/9', 'maj9', 'maj7']);
      return;
    }
    if (level < 8) return;
    const p = level === 8 ? 0.35 : level === 9 ? 0.5 : 0.65;
    if (!rng.chance(p)) return;
    if (q === '7') {
      chord.quality = level >= 9
        ? rng.pick(['9', '13', '7b9', '7#11', '7b13', '7alt', '7#9', '9sus4'])
        : rng.pick(['9', '13', '7b9', '7#11']);
    } else if (q === 'maj7') {
      chord.quality = rng.pick(['maj9', '6/9', 'maj7#11', 'maj7']);
    } else if (q === 'm7') {
      chord.quality = rng.pick(['m9', 'm11', 'm9']);
    } else if (q === 'm7b5' && level >= 9 && rng.chance(0.3)) {
      chord.quality = 'm7b5';
    }
  }

  // Main entry: build the whole tune's harmony.
  //  form: [{ name, bars, cadence, key, reuse? }]
  //  returns [{ key, chords: [...], bars: [[chord,...] per bar] }] per section
  function generate(rng, level, form, meter) {
    const barLen = meter === '3/4' ? 12 : 16;
    const sections = [];
    for (const sec of form) {
      if (sec.reuse !== undefined) {
        const src = sections[sec.reuse];
        // Deep copy, then re-do the ending bars to fit this section's cadence.
        const copy = { key: src.key, bars: src.bars.map(b => b.map(c => ({ ...c }))) };
        if (sec.cadence !== form[sec.reuse].cadence) {
          const endBars = Math.min(2, copy.bars.length);
          const fresh = generateSection(rng, level, sec, barLen);
          for (let i = 1; i <= endBars; i++) copy.bars[copy.bars.length - i] = fresh.bars[fresh.bars.length - i];
        }
        sections.push(copy);
        continue;
      }
      sections.push(generateSection(rng, level, sec, barLen));
    }
    return sections;
  }

  function generateSection(rng, level, sec, barLen) {
    const key = sec.key;
    const nBars = sec.bars;
    // Slots per bar.
    const slotsPerBar = [];
    for (let b = 0; b < nBars; b++) {
      let role = 'normal';
      if (b === nBars - 1) role = sec.cadence === 'turnaround' ? 'turnaround' : (sec.cadence === 'half' ? 'cadence' : 'final');
      else if (b === nBars - 2 && sec.cadence !== 'turnaround') role = 'cadence';
      slotsPerBar.push(barSlots(rng, level, barLen, role));
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
        chords.push({ root: degreeRoot(key, degree), degree, quality: baseQuality(key, degree, level, rng),
                      bar: b, pos, dur, diatonic: true });
        pos += dur;
      }
    }

    // Merge identical adjacent chords within a bar (avoid "C | C" halves).
    chords = mergeRepeats(chords);

    // --- decorations, each gated by level ---
    if (level >= 5) chords = secondaryDominants(rng, level, key, chords, barLen);
    if (level >= 6) chords = modalInterchange(rng, level, key, chords, sec);
    if (level >= 7) chords = passingDiminished(rng, level, key, chords, barLen);
    if (level >= 7) chords = tritoneSubs(rng, level, key, chords);
    if (level >= 6) chords = slashChords(rng, level, key, chords);
    if (level >= 8) chords.forEach((c, i) => extend(c, level, rng, sec.cadence === 'final' && i === chords.length - 1));
    if (level >= 5) chords = susColour(rng, level, chords);

    // A modulated section returns home through the home key's ii–V.
    if (sec.returnKey && sec.cadence === 'half') {
      const hk = sec.returnKey;
      const half = barLen === 12 ? [8, 4] : [8, 8];
      chords = chords.filter(c => c.bar !== nBars - 1);
      chords.push({ root: degreeRoot(hk, 1), quality: hk.mode === 'major' ? 'm7' : 'm7b5', bar: nBars - 1, pos: 0, dur: half[0], degree: 1, diatonic: false, key: hk });
      chords.push({ root: degreeRoot(hk, 4), quality: hk.mode === 'major' ? (level >= 9 && rng.chance(0.5) ? '7alt' : '7') : '7b9', bar: nBars - 1, pos: half[0], dur: half[1], degree: 4, diatonic: false, key: hk });
    }

    // Regroup into bars.
    const bars = Array.from({ length: nBars }, () => []);
    for (const c of chords) bars[c.bar].push(c);
    return { key, bars };
  }

  // How to split a chord slot in two so every piece is still fillable by rhythm cells.
  function splitDur(dur) {
    if (dur % 8 === 0) return [dur / 2, dur / 2];
    if (dur === 12) return [8, 4];
    return null;
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
  function secondaryDominants(rng, level, key, chords, barLen) {
    const p = level === 5 ? 0.25 : level === 6 ? 0.35 : 0.45;
    const out = [];
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      const next = chords[i + 1];
      const split = splitDur(c.dur);
      const canSplit = split && (level >= 7 ? c.dur >= barLen / 2 : c.dur >= barLen);
      if (next && canSplit && next.quality !== 'dim' && next.quality !== 'm7b5' && next.quality !== 'dim7'
          && !isDominant(c.quality) && next.degree !== c.degree && rng.chance(p)) {
        const target = next.root;
        const domRoot = mod(target + 7, 12);
        const [d1, d2] = split;
        const useIIV = level >= 6 && c.dur >= barLen && rng.chance(0.4) && c.degree !== 0;
        if (useIIV) {
          const iiRoot = mod(target + 2, 12);
          const iiQ = isMinorish(next.quality) ? 'm7b5' : 'm7';
          out.push({ ...c, root: iiRoot, quality: iiQ, dur: d1, diatonic: false, degree: -1 });
          out.push({ ...c, root: domRoot, quality: level >= 8 && isMinorish(next.quality) ? '7b9' : '7',
                     pos: c.pos + d1, dur: d2, diatonic: false, degree: -1, secondary: true });
        } else {
          out.push({ ...c, dur: d1 });
          out.push({ ...c, root: domRoot, quality: level >= 8 && isMinorish(next.quality) && rng.chance(0.5) ? '7b9' : '7',
                     pos: c.pos + d1, dur: d2, diatonic: false, degree: -1, secondary: true });
        }
      } else out.push(c);
    }
    return out;
  }

  // Borrowed chords: IV -> iv, backdoor bVII7, bVI, cadential iiø.
  function modalInterchange(rng, level, key, chords, sec) {
    if (key.mode !== 'major') return chords;
    const p = level === 6 ? 0.2 : level === 7 ? 0.3 : 0.4;
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i], next = chords[i + 1], isLast = i === chords.length - 1;
      if (isLast) continue;
      if (c.degree === 3 && next && (next.degree === 0 || next.degree === 2) && rng.chance(p)) {
        c.quality = rng.pick(level >= 7 ? ['m', 'm6', 'm7'] : ['m']); c.diatonic = false; c.borrowed = true;
      } else if (c.degree === 4 && next && next.degree === 0 && sec.cadence !== 'final' && level >= 7 && rng.chance(p * 0.6)) {
        // backdoor dominant bVII7 -> I
        c.root = mod(key.tonic + 10, 12); c.quality = '7'; c.degree = -1; c.diatonic = false; c.borrowed = true;
      } else if (c.degree === 5 && next && next.degree === 4 && rng.chance(p * 0.7)) {
        // vi -> bVI (maj7) before V
        c.root = mod(key.tonic + 8, 12); c.quality = level >= 7 ? 'maj7' : ''; c.degree = -1; c.diatonic = false; c.borrowed = true;
      } else if (c.degree === 1 && next && next.degree === 4 && level >= 8 && rng.chance(0.25)) {
        c.quality = 'm7b5'; c.diatonic = false; c.borrowed = true;
        if (next.quality === '7') next.quality = '7b9';
      }
    }
    return chords;
  }

  // C – C#dim7 – Dm7 style passing chords when roots ascend by a whole step.
  function passingDiminished(rng, level, key, chords, barLen) {
    const p = level === 7 ? 0.25 : 0.35;
    const out = [];
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i], next = chords[i + 1];
      const split = splitDur(c.dur);
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
  function tritoneSubs(rng, level, key, chords) {
    const p = level === 7 ? 0.2 : level === 8 ? 0.3 : 0.4;
    for (let i = 0; i < chords.length - 1; i++) {
      const c = chords[i], next = chords[i + 1];
      if (c.quality === '7' && mod(c.root + 5, 12) === next.root && rng.chance(p)) {
        // keep the very final V7 -> I intact most of the time
        if (i === chords.length - 2 && rng.chance(0.6)) continue;
        c.root = mod(c.root + 6, 12); c.quality = level >= 8 && rng.chance(0.5) ? '7#11' : '7';
        c.degree = -1; c.diatonic = false; c.tritone = true;
      }
    }
    return chords;
  }

  // Inversions for smoother bass lines (C/E, G/B ...).
  function slashChords(rng, level, key, chords) {
    const p = level === 6 ? 0.12 : 0.18;
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
  function susColour(rng, level, chords) {
    const p = level <= 6 ? 0.1 : 0.18;
    const out = [];
    for (let i = 0; i < chords.length; i++) {
      const c = chords[i];
      const split = splitDur(c.dur);
      if (c.quality === '7' && split && c.dur >= 8 && !c.tritone && rng.chance(p)) {
        const [d1, d2] = split;
        out.push({ ...c, quality: level >= 8 && rng.chance(0.4) ? '9sus4' : '7sus4', dur: d1 });
        out.push({ ...c, pos: c.pos + d1, dur: d2 });
      } else out.push(c);
    }
    return out;
  }

  return { generate, degreeRoot, DIATONIC };
})();
