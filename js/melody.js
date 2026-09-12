// melody.js — rhythm and pitch generation over a chord progression.
// Durations are in 16th notes (a triplet eighth is 4/3).
// Event: { pos, dur, rest, triplet: 'start'|'mid'|'end'|null, chord, pitch, anchor, bar }

const Melody = (() => {
  const { mod, chordTones, chordScale, QUALITIES } = Theory;

  // ---- Level parameters --------------------------------------------------
  // The UI level (1-10) is mapped onto an internal scale of 1..7 (the old
  // level 7 is the new 10), so all tables below are indexed by that scale and
  // read with linear interpolation.
  const lerp = (a, b, t) => a + (b - a) * t;
  const at = (arr, l) => {
    const x = Math.max(1, Math.min(arr.length, l)) - 1;
    const i = Math.floor(x), f = x - i;
    return i + 1 < arr.length ? arr[i] + (arr[i + 1] - arr[i]) * f : arr[i];
  };
  const internalLevel = ui => 1 + (Math.max(1, Math.min(10, ui)) - 1) * (6 / 9);
  function params(level) {
    const t = (level - 1) / 6;
    return {
      lo: Math.round(lerp(60, 55, t)),          // C4 .. G3
      hi: Math.round(lerp(74, 82, t)),          // D5 .. Bb5
      leap: Math.round(at([5, 7, 7, 8, 9, 9, 12], level)),
      fillStep: Math.round(at([2, 2, 3, 4, 5, 5, 6], level)),
      pAnchor: lerp(0.75, 0.42, t),          // chance an ordinary beat is forced to a chord tone
      pSeq: lerp(0.6, 0.35, t),               // bar 2 repeats bar 1's rhythm (and usually its shape)
      pPickup: lerp(0.25, 0.45, t),           // phrase ends that lead into the next phrase with pickup notes
      pSus: level < 2.3 ? 0 : lerp(0.1, 0.28, t), // a note held (tied) across a chord change
      pInvert: level < 2.5 ? 0 : 0.3,         // bar 3 restates bar 1 upside down
      temp: 0.55,                             // softmax temperature for anchor choice
      pChrom: at([0, 0, 0, 0.03, 0.07, 0.12, 0.18], level),
      pEnclosure: 0,
      pMotif: at([0.8, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55], level),
      pRhythmReuse: level <= 5 ? 0.85 : 0.7,
      contourAmp: lerp(4, 8, t),
    };
  }

  // ---- Rhythm cells --------------------------------------------------------
  // Each cell is a small rhythmic figure that fills part of a bar.
  //   d: durations in 16ths (negative = rest, 't' = eighth-note triplet over one beat)
  //   w: base weight as a function of the internal level (1..7)
  //   t: tags used by the per-type rhythm profile (see Tune.TYPES):
  //        q quarter   e eighths   x sixteenths   t triplet   d dotted figure
  //        s syncopated / off-beat entry   l long note   r rest   h habanera figure
  // A type's profile multiplies the weight of every cell that carries a tag,
  // so a Ballad leans on 'l' cells and a Bossa Nova on 's' cells while the
  // difficulty level still decides which figures are available at all.
  const CELLS = [
    // one beat
    { d: [4],          t: 'q',  w: l => at([10, 9, 8, 7, 6, 5, 5], l) },
    { d: [2, 2],       t: 'e',  w: l => at([0, 0, 3, 5, 7, 7, 7], l) },
    { d: [-4],         t: 'r',  w: l => l < 4 ? 0 : 0.4 + 0.12 * l },
    { d: [3, 1],       t: 'd',  w: l => l < 5 ? 0 : 1.5 },
    { d: [1, 3],       t: 'ds', w: l => l < 7 ? 0 : 0.8 },
    { d: [2, 1, 1],    t: 'x',  w: l => l < 6 ? 0 : 1.5 + 0.2 * (l - 6) },
    { d: [1, 1, 2],    t: 'x',  w: l => l < 6 ? 0 : 1.5 + 0.2 * (l - 6) },
    { d: [1, 2, 1],    t: 'xs', w: l => l < 7 ? 0 : 1 },
    { d: [1, 1, 1, 1], t: 'x',  w: l => l < 7 ? 0 : 1 },
    { d: ['t'],        t: 't',  w: l => l < 5 ? 0 : l < 8 ? 1 : 2 },
    { d: [-2, 2],      t: 'rs', w: l => l < 5 ? 0 : 1 + 0.1 * l },
    { d: [2, -2],      t: 'r',  w: l => l < 7 ? 0 : 0.7 },
    { d: [-1, 3],      t: 'rs', w: l => l < 8 ? 0 : 0.5 },
    // two beats
    { d: [8],          t: 'l',  w: l => at([8, 6, 5, 3, 3, 2.5, 2], l) },
    { d: [6, 2],       t: 'd',  w: l => l < 3 ? 0 : l < 4 ? 3 : 4 },
    { d: [2, 6],       t: 's',  w: l => l < 5 ? 0 : 3 },
    { d: [2, 4, 2],    t: 's',  w: l => l < 4 ? 0 : l < 6 ? 2 : 4 },
    { d: [3, 3, 2],    t: 's',  w: l => l < 6 ? 0 : l < 8 ? 2 : 3 },
    { d: [3, 1, 2, 2], t: 'hd', w: l => l < 4 ? 0 : 0.6 },   // habanera: dotted-eighth, sixteenth, two eighths
    { d: [-2, 6],      t: 'rs', w: l => l < 6 ? 0 : 1.5 },
    { d: [6, -2],      t: 'dr', w: l => l < 4 ? 0 : 1 },
    { d: [4, 2, 2],    t: 'e',  w: l => l < 3 ? 0 : 2 },
    { d: [2, 2, 4],    t: 'e',  w: l => l < 3 ? 0 : 2 },
    // three beats
    { d: [12],         t: 'l',  w: l => l < 2 ? 4 : 2 },
    // whole bar (4/4)
    { d: [16],               t: 'l', w: l => at([3, 2, 1, 0.6, 0.4, 0.3, 0.2], l) },
    { d: [3, 3, 2, 3, 3, 2], t: 's', w: l => l < 7 ? 0 : 1.5 },
    { d: [3, 3, 2, 4, 4],    t: 's', w: l => l < 7 ? 0 : 1 },
    { d: [3, 3, 3, 3, 4],    t: 's', w: l => l < 8 ? 0 : 0.8 },
    { d: [2, 4, 4, 4, 2],    t: 's', w: l => l < 6 ? 0 : 1.5 },
    { d: [2, 4, 4, 2, 4],    t: 's', w: l => l < 6 ? 0 : 1 },
    { d: [6, 6, 4],          t: 'd', w: l => l < 5 ? 0 : 1.5 },
    { d: [4, 6, 6],          t: 'd', w: l => l < 6 ? 0 : 0.8 },
  ];

  // 6/8 cells. The beat is a dotted quarter (6 sixteenths) so the figures are
  // built in threes: the lilt of [4,2], running eighths [2,2,2], and so on.
  const CELLS_68 = [
    // one beat (dotted quarter)
    { d: [6],             t: 'q',  w: l => at([8, 7, 6, 5, 4, 4, 4], l) },
    { d: [2, 2, 2],       t: 'e',  w: l => at([1.5, 3, 4, 6, 7, 7, 7], l) },
    { d: [4, 2],          t: 'd',  w: l => 3 },
    { d: [2, 4],          t: 's',  w: l => l < 4 ? 0 : 2 },
    { d: [-6],            t: 'r',  w: l => l < 4 ? 0 : 0.6 },
    { d: [-2, 2, 2],      t: 'rs', w: l => l < 5 ? 0 : 1 },
    { d: [4, -2],         t: 'dr', w: l => l < 4 ? 0 : 0.8 },
    { d: [1, 1, 2, 2],    t: 'x',  w: l => l < 6 ? 0 : 1 },
    { d: [2, 1, 1, 2],    t: 'x',  w: l => l < 6 ? 0 : 1 },
    { d: [2, 2, 1, 1],    t: 'x',  w: l => l < 7 ? 0 : 0.8 },
    { d: [1, 1, 1, 1, 2], t: 'x',  w: l => l < 7 ? 0 : 0.5 },
    { d: [3, 3],          t: 'ds', w: l => l < 6 ? 0 : 0.8 },   // duple cross-rhythm
    // two beats
    { d: [12],            t: 'l',  w: l => at([6, 5, 4, 2.5, 2, 1.5, 1], l) },
    { d: [8, 4],          t: 'l',  w: l => l < 3 ? 0 : 1.5 },
    { d: [4, 8],          t: 's',  w: l => l < 5 ? 0 : 0.8 },
    { d: [10, 2],         t: 'd',  w: l => l < 4 ? 0 : 1 },
    // whole bar
    { d: [24],            t: 'l',  w: l => at([2, 1.5, 1, 0.5, 0.3, 0.2, 0.2], l) },
  ];
  const cellLen = d => d.reduce((a, x) => a + (x === 't' ? 4 : Math.abs(x)), 0);

  // Weight multiplier from a rhythm profile ({ tag: factor }).
  const profileMult = (tags, prof) => {
    let m = 1;
    for (const tag of tags || '') if (prof[tag] !== undefined) m *= prof[tag];
    return m;
  };

  // Phrase-ending cells, keyed by segment length.
  const ENDINGS = {
    16: [
      { d: [16], w: l => l < 4 ? 4 : 1.5 }, { d: [12, -4], w: l => 3 },
      { d: [8, -8], w: l => l < 2 ? 1 : 3 }, { d: [8, 4, -4], w: l => l < 3 ? 0 : 2 },
      { d: [6, 2, -8], w: l => l < 4 ? 0 : 2 }, { d: [2, 6, -8], w: l => l < 6 ? 0 : 2 },
      { d: [4, -12], w: l => l < 6 ? 0 : 1.5 }, { d: [2, 2, 8, -4], w: l => l < 5 ? 0 : 1.5 },
      { d: [3, 3, 10], w: l => l < 7 ? 0 : 1.2 }, { d: [-2, 2, 12], w: l => l < 7 ? 0 : 1 },
    ],
    12: [
      { d: [12], w: l => l < 4 ? 4 : 2 }, { d: [8, -4], w: l => 3 }, { d: [4, -8], w: l => l < 5 ? 0 : 2 },
      { d: [6, 2, -4], w: l => l < 4 ? 0 : 2 }, { d: [2, 2, 8], w: l => l < 5 ? 0 : 1.5 },
      { d: [2, 6, -4], w: l => l < 6 ? 0 : 1.5 },
    ],
    8: [
      { d: [8], w: l => 3 }, { d: [6, -2], w: l => l < 4 ? 0 : 2 }, { d: [4, -4], w: l => l < 3 ? 0.5 : 2 },
      { d: [2, -6], w: l => l < 6 ? 0 : 1.5 }, { d: [2, 6], w: l => l < 5 ? 0 : 1.5 },
    ],
    4: [{ d: [4], w: l => 3 }, { d: [2, -2], w: l => l < 5 ? 0 : 1 }, { d: [-2, 2], w: l => l < 7 ? 0 : 0.5 }],
  };
  const ENDINGS_68 = {
    24: [
      { d: [24], w: l => l < 4 ? 4 : 2 }, { d: [18, -6], w: l => 3 }, { d: [12, -12], w: l => 2 },
      { d: [12, 6, -6], w: l => l < 3 ? 0 : 2 }, { d: [6, 6, 12], w: l => l < 3 ? 0 : 1.5 },
      { d: [4, 2, 18], w: l => l < 5 ? 0 : 1.5 }, { d: [6, -18], w: l => l < 6 ? 0 : 1 },
    ],
    12: [
      { d: [12], w: l => 3 }, { d: [6, -6], w: l => 2 }, { d: [4, 2, 6], w: l => l < 3 ? 0 : 1.5 },
      { d: [2, 2, 2, 6], w: l => l < 5 ? 0 : 1 },
    ],
    6: [{ d: [6], w: l => 3 }, { d: [4, 2], w: l => 1 }, { d: [2, -4], w: l => l < 5 ? 0 : 0.5 }],
  };

  function expandCell(d, pos) {
    const out = [];
    for (const x of d) {
      if (x === 't') {
        out.push({ pos, dur: 4 / 3, rest: false, triplet: 'start' });
        out.push({ pos: pos + 4 / 3, dur: 4 / 3, rest: false, triplet: 'mid' });
        out.push({ pos: pos + 8 / 3, dur: 4 / 3, rest: false, triplet: 'end' });
        pos += 4;
      } else {
        out.push({ pos, dur: Math.abs(x), rest: x < 0, triplet: null });
        pos += Math.abs(x);
      }
    }
    return out;
  }

  // Fill one chord segment [pos, pos+len) with rhythm cells.
  // ctx: { cells, endings, beat, barLen, prof } — the meter's cell set and the type's rhythm profile.
  function fillSegment(rng, level, pos, len, opts, ctx) {
    const events = [];
    let cur = pos;
    let remaining = len;
    let eighthBeats = 0;
    while (remaining > 0) {
      const options = [];
      for (const c of ctx.cells) {
        const L = cellLen(c.d);
        if (L > remaining) continue;
        // Bar-length cells must start at the bar start.
        if (L === ctx.barLen && cur !== 0) continue;
        if (L === 12 && ctx.barLen === 16 && cur !== 0 && !(len === 12 && cur === pos)) continue;
        // Cells that straddle a beat boundary only start on a beat.
        if (L > ctx.beat && cur % ctx.beat !== 0) continue;
        let w = c.w(level) * profileMult(c.t, ctx.prof);
        if (w <= 0) continue;
        // Low levels: cap eighth-note activity per bar.
        if (level >= 2.3 && level < 3.5 && c.d.length > 1 && eighthBeats >= 2) w *= 0.15;
        // No rest as the very first event of the piece / at bar 0 of a phrase start.
        if (opts.noLeadingRest && cur === 0 && c.d[0] < 0) continue;
        // Bar-final quarter/eighth (short note on beat 4) is fine; nothing else to check.
        options.push([c, w]);
      }
      const cell = rng.weighted(options);
      const ev = expandCell(cell.d, cur);
      events.push(...ev);
      if (cell.d.length > 1 && cellLen(cell.d) === ctx.beat) eighthBeats++;
      cur += cellLen(cell.d);
      remaining -= cellLen(cell.d);
    }
    return events;
  }

  function endingSegment(rng, level, pos, len, ctx) {
    const table = ctx.endings[len];
    if (!table) return fillSegment(rng, level, pos, len, {}, ctx);
    const options = table.map(c => [c, c.w(level)]).filter(([, w]) => w > 0);
    return expandCell(rng.weighted(options).d, pos);
  }

  // Build the rhythm for a whole bar given its chord slots.
  function barRhythm(rng, level, chords, ctx, isPhraseEnd, isFirstBar) {
    const events = [];
    chords.forEach((c, i) => {
      const last = i === chords.length - 1;
      if (isPhraseEnd && last) events.push(...endingSegment(rng, level, c.pos, c.dur, ctx));
      else events.push(...fillSegment(rng, level, c.pos, c.dur, { noLeadingRest: isFirstBar || i === 0 && level < 6 }, ctx));
    });
    return events;
  }

  const layoutKey = chords => chords.map(c => c.pos + ':' + c.dur).join(',');
  const onBeat = (pos, beat = 4) => Math.abs(pos - Math.round(pos)) < 1e-6 && Math.round(pos) % beat === 0;

  // ---- Pitch helpers ---------------------------------------------------------
  // The melody is written as a "line" that remembers where it has been:
  //   prev / prev2  the last two pitches
  //   dir, run      direction of the last move and how many moves went that way
  //   lastInt       the last interval (signed), used for leap recovery
  //   zig           how many times in a row the line bounced back to prev2
  // Every candidate note gets a score from a few voice-leading rules — prefer
  // steps, keep momentum for a few notes then turn, recover from a leap by
  // stepping back, don't zigzag — plus a pull towards the phrase contour. The
  // choice is a softmax over those scores, so lines stay varied but smooth.
  const newLine = () => ({ prev: null, prev2: null, dir: 0, run: 0, lastInt: 0, zig: 0 });
  const copyLine = l => ({ ...l });
  function advance(line, pitch) {
    if (line.prev !== null) {
      const d = pitch - line.prev, dir = Math.sign(d);
      if (dir !== 0 && dir === line.dir) line.run++;
      else if (dir !== 0) { line.dir = dir; line.run = 1; }
      line.lastInt = d;
      line.zig = line.prev2 !== null && pitch === line.prev2 ? line.zig + 1 : 0;
    }
    line.prev2 = line.prev; line.prev = pitch;
  }
  function motionScore(line, m, isFill) {
    if (line.prev === null) return 0;
    const d = m - line.prev, ad = Math.abs(d), dir = Math.sign(d);
    let s = 0;
    // Steps are the default; repeated notes and wide leaps cost.
    if (ad === 1 || ad === 2) s += isFill ? 0.9 : 0.7;
    else if (ad === 0) s -= isFill ? 1.4 : 1.1;
    else if (ad <= 4) s += 0.1;
    else s -= isFill ? 0.9 : 0.25 * (ad - 4);
    const lastAbs = Math.abs(line.lastInt), lastDir = Math.sign(line.lastInt);
    if (lastAbs >= 4) {
      // Leap recovery: after a leap, step back the other way.
      if (dir === -lastDir && ad <= 2) s += 1.8;
      else if (dir === lastDir && ad >= 3) s -= 1.6;
      else if (dir === lastDir) s -= 0.6;
    } else if (dir !== 0 && dir === line.dir) {
      // Momentum: keep going the same way for a few notes, then turn.
      s += line.run < 3 ? 1.1 : line.run < 5 ? 0.3 : -0.6;
    } else if (dir !== 0 && dir === -line.dir && line.run === 1 && lastAbs <= 2) {
      // Reversing straight after a single step is a neighbour figure: fine now and then, not as a habit.
      s -= 0.8;
    }
    // Bouncing back to the note before last, again.
    if (line.prev2 !== null && m === line.prev2) s -= line.zig >= 1 ? 1.6 : 0.4;
    return s;
  }
  function softPick(rng, cands, temp) {
    let max = -Infinity;
    for (const c of cands) if (c[1] > max) max = c[1];
    return rng.weighted(cands.map(([m, s]) => [m, Math.exp((s - max) / temp)]));
  }

  function toneRoleWeight(chord, pc) {
    const ivs = QUALITIES[chord.quality].intervals;
    const idx = ivs.findIndex(iv => mod(chord.root + iv, 12) === pc);
    return [3, 4, 2.5, 3, 2, 1.5, 1.5][idx] || 1;
  }

  // Pick a chord tone for an anchor note. `line` is the anchor-to-anchor line.
  function chooseAnchor(rng, P, chord, key, line, target, opts = {}) {
    const tones = new Set(chordTones(chord));
    const prev = line.prev;
    const cands = [];
    for (let m = P.lo; m <= P.hi; m++) {
      if (!tones.has(mod(m, 12))) continue;
      const iv = mod(m - chord.root, 12);
      let s = Math.log(toneRoleWeight(chord, mod(m, 12)));
      if (opts.finalNote) {
        s = iv === 0 ? 1.6 : (iv === 3 || iv === 4) ? 0.9 : iv === 7 ? 0.4 : -1.5;
      } else if (opts.phraseEnd) {
        // Phrase endings settle on stable tones; answers like the root, questions avoid it.
        const stable = iv === 0 || iv === 3 || iv === 4 || iv === 7;
        s += stable ? 0.8 : -1.2;
        if (iv === 0) s += opts.answer ? 0.5 : -0.4;
      }
      if (prev !== null) {
        const d = Math.abs(m - prev);
        if (d > P.leap) continue;
        s += motionScore(line, m, false) - d * 0.18;
        if (opts.phraseEnd && d > 2) s -= 0.5 * (d - 2); // endings arrive by step
        // At the phrase climax an expressive upward leap (a 4th to a 6th) is welcome; the line steps back after.
        if (opts.climax && m - prev >= 5 && m - prev <= 9) s += 1.4 + d * 0.18;
      }
      if (opts.leadsTo !== undefined && opts.leadsTo !== null) {
        const d = Math.abs(m - opts.leadsTo);
        if (d > P.leap) continue;
        s -= d * 0.12;
      }
      if (target !== undefined) s -= Math.abs(m - target) / 5;
      const edge = Math.min(m - P.lo, P.hi - m);
      if (edge < 2) s -= 0.7;
      cands.push([m, s]);
    }
    if (!cands.length) {
      // Constraints conflict (rare): pick the chord tone that keeps the largest leap smallest.
      const cost = m => Math.max(prev === null ? 0 : Math.abs(m - prev), opts.leadsTo != null ? Math.abs(m - opts.leadsTo) : 0);
      let best = null;
      for (let m = P.lo; m <= P.hi; m++) if (tones.has(mod(m, 12)) && (best === null || cost(m) < cost(best))) best = m;
      return best;
    }
    return softPick(rng, cands, P.temp);
  }

  // Fill the pitches of events strictly between two anchors. `line` is the
  // note-to-note line and must currently sit on the first anchor (pA).
  function fillBetween(rng, P, key, events, from, to, line, pB) {
    const pA = line.prev;
    let forced = null; // resolution of a chromatic passing tone
    const fills = [];
    for (let k = from + 1; k < to; k++) if (!events[k].rest) fills.push(k);
    if (!fills.length) return;
    const n = fills.length;
    fills.forEach((k, i) => {
      const ev = events[k];
      const cur = line.prev;
      const t = (i + 1) / (n + 1);
      const interp = pA + (pB - pA) * t;
      const scale = new Set(chordScale(ev.chord, ev.chord.key || key));
      for (const pc of P.extraPcs) scale.add(pc); // style colour (e.g. blue notes)
      const tones = new Set(chordTones(ev.chord));
      const isLast = i === n - 1;
      if (forced !== null) {
        if (forced >= P.lo && forced <= P.hi && (scale.has(mod(forced, 12)) || tones.has(mod(forced, 12)))) {
          ev.pitch = forced; advance(line, forced); forced = null; return;
        }
        forced = null;
      }
      const cands = [];
      for (let m = Math.max(P.lo, cur - P.fillStep); m <= Math.min(P.hi, cur + P.fillStep); m++) {
        const pc = mod(m, 12);
        const inScale = scale.has(pc);
        let chromatic = false;
        if (!inScale) {
          // Chromatic approach into the next anchor, or passing tone between scale steps.
          const approach = isLast && Math.abs(m - pB) === 1;
          const passing = !isLast && Math.abs(m - cur) === 1 && scale.has(mod(m + Math.sign(m - cur), 12));
          if (!(approach || passing) || !rng.chance(P.pChrom)) continue;
          chromatic = true;
        }
        let s = -Math.abs(m - interp) * 0.5 + motionScore(line, m, true);
        if (isLast) {
          if (m === pB) s -= 1.0;                                   // don't anticipate the anchor
          if (Math.abs(m - pB) > 2) s -= 0.5 * (Math.abs(m - pB) - 2); // arrive at it by step
        }
        if (onBeat(ev.pos, P.beat) && tones.has(pc)) s += 0.6;
        if (chromatic) s += 0.5;
        s += (rng.next() - 0.5) * 0.6;
        cands.push([m, s]);
      }
      if (!cands.length) { ev.pitch = cur; advance(line, cur); return; }
      // Enclosure: last two fills surround the target by a half step each side.
      if (isLast && n >= 2 && rng.chance(P.pEnclosure) && events[fills[n - 2]].pitch !== undefined) {
        const prevFill = events[fills[n - 2]];
        if (Math.abs(prevFill.pitch - pB) === 1) { ev.pitch = pB + (prevFill.pitch < pB ? 1 : -1); advance(line, ev.pitch); return; }
      }
      ev.pitch = softPick(rng, cands, 0.4);
      if (!scale.has(mod(ev.pitch, 12)) && !isLast) forced = ev.pitch + Math.sign(ev.pitch - cur);
      advance(line, ev.pitch);
    });
  }

  // Copy a bar's pitch shape onto a new bar (same rhythm), snapping to the new
  // chords — a melodic sequence. Returns false if the shapes don't fit.
  function snapMotif(P, key, srcEvents, dstEvents, prevPitch, invert = false) {
    const srcPitched = srcEvents.filter(e => !e.rest);
    const dstPitched = dstEvents.filter(e => !e.rest);
    if (srcPitched.length !== dstPitched.length || !srcPitched.length) return false;
    let shift = ((dstPitched[0].chord.root - srcPitched[0].chord.root + 18) % 12) - 6; // -6..5
    if (prevPitch !== null && prevPitch !== undefined) {
      // Keep the motif's entry within the level's leap limit of the previous note,
      // and prefer the octave placement that arrives most smoothly.
      const first = srcPitched[0].pitch + shift;
      const options = [shift, shift - 12, shift + 12]
        .map(sh => [sh, Math.abs(srcPitched[0].pitch + sh - prevPitch)])
        .filter(([sh]) => srcPitched[0].pitch + sh >= P.lo && srcPitched[0].pitch + sh <= P.hi)
        .sort((a, b) => a[1] - b[1]);
      if (!options.length || options[0][1] > P.leap) return false;
      shift = Math.abs(first - prevPitch) <= 2 ? shift : options[0][0];
    }
    let prev = null;
    for (let i = 0; i < dstPitched.length; i++) {
      const ev = dstPitched[i];
      const step = (srcPitched[i].pitch - (i > 0 ? srcPitched[i - 1].pitch : 0)) * (invert ? -1 : 1);
      const raw = i === 0 ? srcPitched[0].pitch + shift : prev + step;
      const allowed = ev.anchor ? new Set(chordTones(ev.chord)) : new Set(chordScale(ev.chord, ev.chord.key || key));
      let best = raw, bestD = Infinity;
      for (let m = raw - 3; m <= raw + 3; m++) {
        if (m < P.lo || m > P.hi || !allowed.has(mod(m, 12))) continue;
        const d = Math.abs(m - raw) + (i > 0 && m === prev && srcPitched[i].pitch !== srcPitched[i - 1].pitch ? 0.5 : 0);
        if (d < bestD) { bestD = d; best = m; }
      }
      if (bestD === Infinity) return false;
      ev.pitch = best; prev = best;
    }
    return true;
  }

  // ---- Main --------------------------------------------------------------
  // sections: from Harmony.generate, plus form info. Returns sections with
  // .bars[b] = { chords, events }.
  // profile: the style's melody profile — { rhythm: { tag: factor }, extraPcs: [semitones above the tonic] }
  function generate(rng, uiLevel, sections, form, barLen, homeKey, profile = {}) {
    const level = internalLevel(uiLevel);
    const P = params(level);
    const beat = barLen === 24 ? 6 : 4;
    const ctx = { cells: barLen === 24 ? CELLS_68 : CELLS, endings: barLen === 24 ? ENDINGS_68 : ENDINGS,
                  beat, barLen, prof: profile.rhythm || {} };
    P.beat = beat;
    P.extraPcs = (profile.extraPcs || []).map(i => mod(homeKey.tonic + i, 12));
    const out = [];
    const line = newLine();   // note-to-note memory, carried across the whole tune
    const lineA = newLine();  // anchor-to-anchor memory (the skeleton of the line)
    let barCounter = 0;

    sections.forEach((sec, si) => {
      const key = sec.key;
      const nBars = sec.bars.length;
      const formSec = form[si];
      const bars = [];
      const reuse = formSec.reuse !== undefined ? out[formSec.reuse] : null;
      // A reused section in a lifted key copies its melody transposed by the lift.
      const copyShift = reuse ? ((sec.key.tonic - reuse.key.tonic + 18) % 12) - 6 : 0;

      // ---- rhythm plan ----
      // A 4-bar phrase is built as idea / idea varied / idea / answer: bar 2 may
      // sequence bar 1, bar 3 repeats bar 1's rhythm, and the second phrase
      // opens like the first (bars 5-6 echo bars 1-2).
      for (let b = 0; b < nBars; b++) {
        const chords = sec.bars[b];
        const isPhraseEnd = b % 4 === 3;
        const isLast = b === nBars - 1;
        let events = null, copyFrom = null, motifFrom = null;
        const layout = layoutKey(chords);
        // Verbatim copy from an earlier section (AABA), except the cadence bars.
        if (reuse && b < nBars - 2 && layoutKey(reuse.bars[b].chords) === layout
            && reuse.bars[b].chords.every((c, i) => mod(c.root + copyShift, 12) === chords[i].root && c.quality === chords[i].quality)) {
          copyFrom = reuse.bars[b];
        } else {
          let srcIdx = -1, pReuse = P.pRhythmReuse, pSnap = P.pMotif;
          if (b % 4 === 1) { srcIdx = b - 1; pReuse = P.pSeq; pSnap = 0.85; }            // bar 2 sequences bar 1
          else if (b % 4 === 2) srcIdx = b - 2;                                          // bar 3 restates bar 1
          else if (b % 8 === 4 || b % 8 === 5) srcIdx = b - 4;                           // phrase 2 opens like phrase 1
          else if (b % 8 === 6) srcIdx = rng.chance(0.5) ? b - 2 : b - 6;
          if (srcIdx >= 0 && !isPhraseEnd && layoutKey(sec.bars[srcIdx]) === layout && rng.chance(pReuse)) {
            events = bars[srcIdx].events.map(e => ({ ...e, pitch: undefined }));
            if (rng.chance(pSnap)) motifFrom = bars[srcIdx];
          }
          if (!events) {
            // Bar 2 of a phrase breathes: longer notes, fewer sixteenths (density contour busy / calm / busy / cadence).
            const calm = b % 4 === 1;
            const calmCtx = calm ? { ...ctx, prof: Object.assign({}, ctx.prof, { l: (ctx.prof.l || 1) * 1.6, x: (ctx.prof.x || 1) * 0.6, e: (ctx.prof.e || 1) * 0.8 }) } : ctx;
            events = barRhythm(rng, level, chords, calmCtx, isPhraseEnd || isLast, barCounter === 0 && b === 0);
          }
          // Final bar of the tune: make sure it ends on a held note.
          if (si === sections.length - 1 && isLast) {
            const lastC = chords[chords.length - 1];
            events = events.filter(e => e.pos < lastC.pos);
            const endOpts = level < 4 || lastC.dur <= beat ? [[lastC.dur]] : [[lastC.dur], [lastC.dur - beat, -beat]];
            events.push(...expandCell(rng.pick(endOpts), lastC.pos));
          }
        }
        if (copyFrom) {
          events = copyFrom.events.map(e => ({ ...e }));
        }
        // Attach chords and anchor flags. Anchors are chord tones: the first note
        // of a bar, chord changes, long notes, phrase endings and some other beats.
        let firstPitched = true;
        events.forEach(e => {
          e.bar = b;
          e.chord = chords.slice().reverse().find(c => c.pos <= e.pos + 1e-6);
          e.chord.key = e.chord.key || key;
          e.chordStart = Math.abs(e.chord.pos - e.pos) < 1e-6;
          if (e.rest) { e.anchor = false; return; }
          if (copyFrom) { e.anchor = !!e.anchor; firstPitched = false; return; } // copies keep the source's anchors
          const strongBeat = onBeat(e.pos, beat) && (Math.round(e.pos) % (beat * 2) === 0);
          e.anchor = firstPitched || e.chordStart || e.dur >= 6
            || (onBeat(e.pos, beat) && e.triplet === null && rng.chance(strongBeat ? P.pAnchor : P.pAnchor * 0.6));
          firstPitched = false;
        });
        const pitched = events.filter(e => !e.rest);
        if (pitched.length && (isPhraseEnd || isLast) && !copyFrom) pitched[pitched.length - 1].anchor = true;
        bars.push({ chords, events, copyFrom, motifFrom, key, invert: !!motifFrom && b % 4 === 2 && rng.chance(P.pInvert) });
        barCounter++;
      }

      // Pickups: a phrase that ends in a rest may lead into the next phrase with one or two notes.
      for (let b = 3; b < nBars; b += 4) {
        const bar = bars[b];
        if (bar.copyFrom || (si === sections.length - 1 && b === nBars - 1) || !rng.chance(P.pPickup)) continue;
        const last = bar.events[bar.events.length - 1];
        if (!last || last.triplet || last.dur < beat) continue;
        // Either the closing rest or the tail of a long final note makes room for the pickup.
        const room = last.rest ? last.dur : last.dur - beat;
        if (room < 2) continue;
        const shapes = room >= 4 ? [[2], [2, 2], [4]] : [[2]];
        const notes = rng.pick(shapes);
        const used = notes.reduce((a, x) => a + x, 0);
        bar.events.pop();
        if (last.dur - used > 0) bar.events.push({ ...last, dur: last.dur - used });
        let pos = last.pos + (last.dur - used);
        for (const d of notes) { bar.events.push({ pos, dur: d, rest: false, triplet: null, bar: b, chord: last.chord, chordStart: false, anchor: false, pickup: true }); pos += d; }
      }

      // ---- phrase plan ----
      // Each 4-bar phrase rises to one climax and settles at its end. Odd
      // phrases are "questions" (end higher, less final), even ones "answers".
      const centre = (P.lo + P.hi) / 2;
      const phrasePlans = new Map();
      const phrasePlan = (b, startPitch) => {
        const idx = Math.floor(b / 4);
        if (!phrasePlans.has(idx)) {
          const answer = idx % 2 === 1;
          const start = startPitch !== null && startPitch !== undefined ? startPitch : centre;
          const climaxAt = 0.3 + rng.next() * 0.35;
          const climax = Math.min(P.hi - 1, Math.max(start + 3, centre + P.contourAmp * (answer ? 0.5 : 0.9) + (rng.next() - 0.5) * 3));
          const end = answer ? centre - P.contourAmp * 0.45 : centre + (rng.next() - 0.5) * 2;
          phrasePlans.set(idx, { start, climaxAt, climax, end, answer });
        }
        return phrasePlans.get(idx);
      };
      const contourTarget = (b, pos) => {
        const plan = phrasePlan(b, line.prev);
        const t = ((b % 4) * barLen + pos) / (4 * barLen); // 0..1 through the phrase
        if (t <= plan.climaxAt) return plan.start + (plan.climax - plan.start) * (t / plan.climaxAt);
        return plan.climax + (plan.end - plan.climax) * ((t - plan.climaxAt) / (1 - plan.climaxAt));
      };

      const firstPitchCache = new Map();
      const isFinalSection = si === sections.length - 1;
      // If the next section is a verbatim copy, its first note is already fixed.
      const nextSectionFirst = () => {
        if (!form[si + 1] || form[si + 1].reuse === undefined) return null;
        const src = form[si + 1].reuse === si ? { bars } : out[form[si + 1].reuse];
        if (!src) return null;
        const fp = src.bars[0].events.find(e => !e.rest);
        if (!fp || fp.pitch === undefined) return null;
        const nextShift = ((form[si + 1].key.tonic - (form[si + 1].reuse === si ? key : out[form[si + 1].reuse].key).tonic + 18) % 12) - 6;
        return fp.pitch + nextShift;
      };

      // Compute (and cache) the first pitched note of bar b, without filling.
      const resolveFirstPitch = (b) => {
        if (b >= nBars) return null;
        if (firstPitchCache.has(b)) return firstPitchCache.get(b);
        const bar = bars[b];
        const first = bar.events.find(e => !e.rest);
        if (!first) { firstPitchCache.set(b, null); return null; }
        let p;
        if (bar.copyFrom) p = bar.copyFrom.events.find(e => !e.rest).pitch + copyShift;
        else if (bar.motifFrom && snapMotif(P, key, bar.motifFrom.events, bar.events, line.prev, bar.invert)) { bar.motifDone = true; p = first.pitch; }
        else p = chooseAnchor(rng, P, first.chord, key, lineA, contourTarget(b, first.pos), { leadsTo: b === nBars - 1 ? nextSectionFirst() : undefined });
        firstPitchCache.set(b, p);
        return p;
      };
      const walkBar = ev => { for (const e of ev) if (!e.rest) { advance(line, e.pitch); if (e.anchor) advance(lineA, e.pitch); } };

      for (let b = 0; b < nBars; b++) {
        const bar = bars[b];
        const ev = bar.events;
        const isLast = b === nBars - 1;
        const isPhraseEnd = b % 4 === 3 || isLast;
        if (bar.copyFrom) {
          ev.forEach((e, i) => { e.pitch = bar.copyFrom.events[i].pitch === undefined ? undefined : bar.copyFrom.events[i].pitch + copyShift; });
          walkBar(ev);
          continue;
        }
        if (bar.motifFrom && (bar.motifDone || snapMotif(P, key, bar.motifFrom.events, ev, line.prev, bar.invert))) {
          walkBar(ev);
          continue;
        }
        // Fresh bar: anchors and fills in order, so every note knows the line so far.
        const anchorIdx = [];
        ev.forEach((e, i) => { if (e.anchor) anchorIdx.push(i); });
        const prevBarEvents = b > 0 ? bars[b - 1].events : [];
        anchorIdx.forEach((i, n) => {
          const e = ev[i];
          const lastAnchor = n === anchorIdx.length - 1;
          const finalNote = isFinalSection && isLast && lastAnchor;
          // Suspension: hold the previous note across the chord change (tied) when it still fits.
          const before = i > 0 ? ev[i - 1] : prevBarEvents[prevBarEvents.length - 1];
          const adjacent = before && !before.rest && before.pitch !== undefined && (i > 0 ? i - 1 === anchorIdx[n - 1] : true)
            && Math.abs((before.pos + before.dur) - (i > 0 ? e.pos : barLen)) < 1e-6;
          if (adjacent && e.chordStart && !finalNote && !(isPhraseEnd && lastAnchor) && !firstPitchCache.has(b) && rng.chance(P.pSus)
              && chordScale(e.chord, e.chord.key || key).includes(mod(before.pitch, 12))) {
            e.pitch = before.pitch; e.tied = true;
          } else if (n === 0 && firstPitchCache.has(b)) e.pitch = firstPitchCache.get(b);
          else {
            const leadsTo = isLast && lastAnchor ? nextSectionFirst() : undefined;
            const phraseEnd = isPhraseEnd && lastAnchor && !finalNote;
            const plan = phrasePlan(b, line.prev);
            const tPos = ((b % 4) * barLen + e.pos) / (4 * barLen);
            e.pitch = chooseAnchor(rng, P, e.chord, key, lineA, contourTarget(b, e.pos),
              { finalNote, leadsTo, phraseEnd, answer: plan.answer, climax: Math.abs(tPos - plan.climaxAt) < 0.1 && !phraseEnd });
          }
          // Fill from the previous anchor up to this one, then land on it.
          if (n > 0) fillBetween(rng, P, key, ev, anchorIdx[n - 1], i, line, e.pitch);
          advance(line, e.pitch); advance(lineA, e.pitch);
        });
        // Trailing fills run into the next bar's first note.
        const lastA = anchorIdx[anchorIdx.length - 1];
        if (lastA !== undefined && lastA < ev.length - 1 && ev.slice(lastA + 1).some(e => !e.rest)) {
          let target = resolveFirstPitch(b + 1);
          if (target === null) target = chooseAnchor(rng, P, ev[lastA].chord, key, lineA, contourTarget(b, barLen));
          fillBetween(rng, P, key, ev, lastA, ev.length, line, target);
        }
      }
      out.push({ key, bars });
    });
    return out;
  }

  return { generate, params, internalLevel };
})();
