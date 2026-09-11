// melody.js — rhythm and pitch generation over a chord progression.
// Durations are in 16th notes (a triplet eighth is 4/3).
// Event: { pos, dur, rest, triplet: 'start'|'mid'|'end'|null, chord, pitch, anchor, bar }

const Melody = (() => {
  const { mod, chordTones, chordScale, QUALITIES } = Theory;

  // ---- Level parameters --------------------------------------------------
  const lerp = (a, b, t) => a + (b - a) * t;
  function params(level) {
    const t = (level - 1) / 9;
    return {
      lo: Math.round(lerp(60, 53, t)),          // C4 .. F3
      hi: Math.round(lerp(74, 86, t)),          // D5 .. D6
      leap: [5, 7, 7, 8, 9, 9, 12, 12, 14, 16][level - 1],
      fillStep: [2, 2, 3, 4, 5, 5, 6, 7, 7, 9][level - 1],
      pAnchor: lerp(0.9, 0.5, t),
      pChrom: [0, 0, 0, 0.03, 0.07, 0.12, 0.18, 0.24, 0.32, 0.4][level - 1],
      pEnclosure: level >= 9 ? 0.25 : level === 8 ? 0.1 : 0,
      pMotif: [0.8, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4][level - 1],
      pRhythmReuse: level <= 5 ? 0.85 : 0.7,
      contourAmp: lerp(4, 9, t),
    };
  }

  // ---- Rhythm cells --------------------------------------------------------
  // d: durations (negative = rest, 't' = eighth-note triplet over one beat)
  // w: weight per level (array index level-1) or function.
  const CELLS = [
    // one beat
    { d: [4],          w: l => [10, 9, 8, 7, 6, 5, 5, 4, 4, 3][l - 1] },
    { d: [2, 2],       w: l => [0, 0, 3, 5, 7, 7, 7, 7, 7, 6][l - 1] },
    { d: [-4],         w: l => l < 4 ? 0 : 0.4 + 0.12 * l },
    { d: [3, 1],       w: l => l < 5 ? 0 : 1.5 },
    { d: [1, 3],       w: l => l < 7 ? 0 : 0.8 },
    { d: [2, 1, 1],    w: l => l < 6 ? 0 : 1.5 + 0.2 * (l - 6) },
    { d: [1, 1, 2],    w: l => l < 6 ? 0 : 1.5 + 0.2 * (l - 6) },
    { d: [1, 2, 1],    w: l => l < 7 ? 0 : 1 },
    { d: [1, 1, 1, 1], w: l => l < 7 ? 0 : [1, 1.5, 2.5, 3.5][l - 7] },
    { d: ['t'],        w: l => l < 5 ? 0 : l < 8 ? 1 : 2 },
    { d: [-2, 2],      w: l => l < 5 ? 0 : 1 + 0.1 * l },
    { d: [2, -2],      w: l => l < 7 ? 0 : 0.7 },
    { d: [-1, 3],      w: l => l < 8 ? 0 : 0.5 },
    // two beats
    { d: [8],          w: l => [8, 6, 5, 3, 3, 2.5, 2, 2, 1.5, 1.2][l - 1] },
    { d: [6, 2],       w: l => l < 3 ? 0 : l < 4 ? 3 : 4 },
    { d: [2, 6],       w: l => l < 5 ? 0 : 3 },
    { d: [2, 4, 2],    w: l => l < 4 ? 0 : l < 6 ? 2 : 4 },
    { d: [3, 3, 2],    w: l => l < 6 ? 0 : l < 8 ? 2 : 3 },
    { d: [-2, 6],      w: l => l < 6 ? 0 : 1.5 },
    { d: [6, -2],      w: l => l < 4 ? 0 : 1 },
    { d: [4, 2, 2],    w: l => l < 3 ? 0 : 2 },
    { d: [2, 2, 4],    w: l => l < 3 ? 0 : 2 },
    // three beats
    { d: [12],         w: l => l < 2 ? 4 : 2 },
    // whole bar (4/4)
    { d: [16],         w: l => [3, 2, 1, 0.6, 0.4, 0.3, 0.2, 0.2, 0.1, 0.1][l - 1] },
    { d: [3, 3, 2, 3, 3, 2], w: l => l < 7 ? 0 : 1.5 },
    { d: [3, 3, 2, 4, 4],    w: l => l < 7 ? 0 : 1 },
    { d: [3, 3, 3, 3, 4],    w: l => l < 8 ? 0 : 0.8 },
    { d: [2, 4, 4, 4, 2],    w: l => l < 6 ? 0 : 1.5 },
    { d: [2, 4, 4, 2, 4],    w: l => l < 6 ? 0 : 1 },
    { d: [6, 6, 4],          w: l => l < 5 ? 0 : 1.5 },
    { d: [4, 6, 6],          w: l => l < 6 ? 0 : 0.8 },
  ];
  const cellLen = d => d.reduce((a, x) => a + (x === 't' ? 4 : Math.abs(x)), 0);

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
  function fillSegment(rng, level, pos, len, opts) {
    const events = [];
    let cur = pos;
    let remaining = len;
    let eighthBeats = 0;
    while (remaining > 0) {
      const options = [];
      for (const c of CELLS) {
        const L = cellLen(c.d);
        if (L > remaining) continue;
        // Bar-length cells must start at the bar start.
        if (L === 16 && cur !== 0) continue;
        if (L === 12 && cur !== 0 && !(len === 12 && cur === pos)) continue;
        // Cells that straddle a beat boundary only start on a beat.
        if (L > 4 && cur % 4 !== 0) continue;
        let w = c.w(level);
        if (w <= 0) continue;
        // Low levels: cap eighth-note activity per bar.
        if (level === 3 && c.d.length > 1 && eighthBeats >= 2) w *= 0.15;
        // No rest as the very first event of the piece / at bar 0 of a phrase start.
        if (opts.noLeadingRest && cur === 0 && c.d[0] < 0) continue;
        // Bar-final quarter/eighth (short note on beat 4) is fine; nothing else to check.
        options.push([c, w]);
      }
      const cell = rng.weighted(options);
      const ev = expandCell(cell.d, cur);
      events.push(...ev);
      if (cell.d.length > 1 && cellLen(cell.d) === 4) eighthBeats++;
      cur += cellLen(cell.d);
      remaining -= cellLen(cell.d);
    }
    return events;
  }

  function endingSegment(rng, level, pos, len) {
    const table = ENDINGS[len] || ENDINGS[4];
    const options = table.map(c => [c, c.w(level)]).filter(([, w]) => w > 0);
    return expandCell(rng.weighted(options).d, pos);
  }

  // Build the rhythm for a whole bar given its chord slots.
  function barRhythm(rng, level, chords, barLen, isPhraseEnd, isFirstBar) {
    const events = [];
    chords.forEach((c, i) => {
      const last = i === chords.length - 1;
      if (isPhraseEnd && last) events.push(...endingSegment(rng, level, c.pos, c.dur));
      else events.push(...fillSegment(rng, level, c.pos, c.dur, { noLeadingRest: isFirstBar || i === 0 && level < 6 }));
    });
    return events;
  }

  const layoutKey = chords => chords.map(c => c.pos + ':' + c.dur).join(',');
  const onBeat = pos => Math.abs(pos - Math.round(pos)) < 1e-6 && Math.round(pos) % 4 === 0;

  // ---- Pitch helpers ---------------------------------------------------------
  function toneRoleWeight(chord, pc) {
    const ivs = QUALITIES[chord.quality].intervals;
    const idx = ivs.findIndex(iv => mod(chord.root + iv, 12) === pc);
    return [3, 4, 2.5, 3, 2, 1.5, 1.5][idx] || 1;
  }

  function chooseAnchor(rng, P, chord, key, prev, target, opts = {}) {
    const tones = new Set(chordTones(chord));
    const cands = [];
    for (let m = P.lo; m <= P.hi; m++) {
      if (!tones.has(mod(m, 12))) continue;
      let w = toneRoleWeight(chord, mod(m, 12));
      if (opts.finalNote) {
        const iv = mod(m - chord.root, 12);
        w = iv === 0 ? 5 : iv === 4 || iv === 3 ? 3 : iv === 7 ? 2 : iv === 2 || iv === 9 ? 1 : 0.2;
      }
      if (prev !== null && prev !== undefined) {
        const d = Math.abs(m - prev);
        if (d > P.leap) continue;
        if (d === 0) w *= 0.45;
        else w *= 1 / (1 + d * 0.22);
      }
      if (opts.leadsTo !== undefined && opts.leadsTo !== null) {
        const d = Math.abs(m - opts.leadsTo);
        if (d > P.leap) continue;
        w *= 1 / (1 + d * 0.15);
      }
      if (target !== undefined) w *= Math.exp(-Math.abs(m - target) / 7);
      // Ease off the extreme ends of the range.
      const edge = Math.min(m - P.lo, P.hi - m);
      if (edge < 2) w *= 0.5;
      cands.push([m, w]);
    }
    if (!cands.length) {
      // Constraints conflict (rare): pick the chord tone that keeps the largest leap smallest.
      const cost = m => Math.max(Math.abs(m - prev), opts.leadsTo != null ? Math.abs(m - opts.leadsTo) : 0);
      let best = null;
      for (let m = P.lo; m <= P.hi; m++) if (tones.has(mod(m, 12)) && (best === null || cost(m) < cost(best))) best = m;
      return best;
    }
    return rng.weighted(cands);
  }

  // Fill the pitches of events strictly between two anchors.
  function fillBetween(rng, P, key, events, from, to, pA, pB, level) {
    let cur = pA;
    let forced = null; // resolution of a chromatic passing tone
    const fills = [];
    for (let k = from + 1; k < to; k++) if (!events[k].rest) fills.push(k);
    if (!fills.length) return;
    const n = fills.length;
    fills.forEach((k, i) => {
      const ev = events[k];
      const t = (i + 1) / (n + 1);
      const interp = pA + (pB - pA) * t;
      const scale = new Set(chordScale(ev.chord, ev.chord.key || key));
      const tones = new Set(chordTones(ev.chord));
      const isLast = i === n - 1;
      if (forced !== null) {
        if (forced >= P.lo && forced <= P.hi && (scale.has(mod(forced, 12)) || tones.has(mod(forced, 12)))) {
          ev.pitch = forced; cur = forced; forced = null; return;
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
        let s = -Math.abs(m - interp) * 0.9;
        if (m === cur) s -= 1.6;
        if (isLast && m === pB) s -= 1.2;
        if (onBeat(ev.pos) && tones.has(pc)) s += 0.8;
        if (chromatic) s += 0.6;
        if (Math.abs(m - cur) > 2) s -= 0.4 * (Math.abs(m - cur) - 2);
        s += rng.next() * 1.6;
        cands.push([m, s]);
      }
      if (!cands.length) { ev.pitch = cur; return; }
      // Enclosure: last two fills surround the target by a half step each side.
      if (isLast && n >= 2 && rng.chance(P.pEnclosure) && events[fills[n - 2]].pitch !== undefined) {
        const prevFill = events[fills[n - 2]];
        if (Math.abs(prevFill.pitch - pB) === 1) { ev.pitch = pB + (prevFill.pitch < pB ? 1 : -1); cur = ev.pitch; return; }
      }
      cands.sort((a, b) => b[1] - a[1]);
      ev.pitch = cands[0][0];
      if (!scale.has(mod(ev.pitch, 12)) && !isLast) forced = ev.pitch + Math.sign(ev.pitch - cur);
      cur = ev.pitch;
    });
  }

  // Copy a bar's pitch shape onto a new bar (same rhythm), snapping to the new chords.
  function snapMotif(P, key, srcEvents, dstEvents, prevPitch) {
    const srcPitched = srcEvents.filter(e => !e.rest);
    const dstPitched = dstEvents.filter(e => !e.rest);
    if (srcPitched.length !== dstPitched.length || !srcPitched.length) return false;
    let shift = ((dstPitched[0].chord.root - srcPitched[0].chord.root + 18) % 12) - 6; // -6..5
    if (prevPitch !== null && prevPitch !== undefined) {
      // Keep the motif's entry within the level's leap limit of the previous note.
      const first = srcPitched[0].pitch + shift;
      if (Math.abs(first - prevPitch) > P.leap) {
        const alt = first > prevPitch ? shift - 12 : shift + 12;
        if (Math.abs(srcPitched[0].pitch + alt - prevPitch) <= P.leap) shift = alt; else return false;
      }
    }
    let prev = null;
    for (let i = 0; i < dstPitched.length; i++) {
      const ev = dstPitched[i];
      const raw = i === 0 ? srcPitched[0].pitch + shift : prev + (srcPitched[i].pitch - srcPitched[i - 1].pitch);
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
  function generate(rng, level, sections, form, barLen, homeKey) {
    const P = params(level);
    const out = [];
    let prevPitch = null;
    const totalBars = sections.reduce((a, s) => a + s.bars.length, 0);
    let barCounter = 0;

    sections.forEach((sec, si) => {
      const key = sec.key;
      const nBars = sec.bars.length;
      const formSec = form[si];
      const bars = [];
      const reuse = formSec.reuse !== undefined ? out[formSec.reuse] : null;

      // ---- rhythm plan ----
      for (let b = 0; b < nBars; b++) {
        const chords = sec.bars[b];
        const isPhraseEnd = b % 4 === 3;
        const isLast = b === nBars - 1;
        let events = null, copyFrom = null, motifFrom = null;
        const layout = layoutKey(chords);
        // Verbatim copy from an earlier section (AABA), except the cadence bars.
        if (reuse && b < nBars - 2 && layoutKey(reuse.bars[b].chords) === layout
            && reuse.bars[b].chords.every((c, i) => c.root === chords[i].root && c.quality === chords[i].quality)) {
          copyFrom = reuse.bars[b];
        } else {
          // Motif: reuse rhythm of an earlier bar in this section.
          const srcIdx = b % 4 === 2 ? b - 2 : (b % 8 === 4 || b % 8 === 5) ? b - 4 : b % 8 === 6 ? (rng.chance(0.5) ? b - 2 : b - 6) : -1;
          if (srcIdx >= 0 && !isPhraseEnd && layoutKey(sec.bars[srcIdx]) === layout && rng.chance(P.pRhythmReuse)) {
            events = bars[srcIdx].events.map(e => ({ ...e, pitch: undefined }));
            if (rng.chance(P.pMotif)) motifFrom = bars[srcIdx];
          }
          if (!events) {
            events = barRhythm(rng, level, chords, barLen, isPhraseEnd || isLast, barCounter === 0 && b === 0);
          }
          // Final bar of the tune: make sure it ends on a held note.
          if (si === sections.length - 1 && isLast) {
            const lastC = chords[chords.length - 1];
            events = events.filter(e => e.pos < lastC.pos);
            const endOpts = level < 4 || lastC.dur <= 4 ? [[lastC.dur]] : [[lastC.dur], [lastC.dur - 4, -4]];
            events.push(...expandCell(rng.pick(endOpts), lastC.pos));
          }
        }
        if (copyFrom) {
          events = copyFrom.events.map(e => ({ ...e }));
        }
        // Attach chords and anchor flags.
        let firstPitched = true;
        events.forEach(e => {
          e.bar = b;
          e.chord = chords.slice().reverse().find(c => c.pos <= e.pos + 1e-6);
          e.chord.key = e.chord.key || key;
          e.chordStart = Math.abs(e.chord.pos - e.pos) < 1e-6;
          if (e.rest) { e.anchor = false; return; }
          e.anchor = firstPitched || e.chordStart || e.dur >= 6 || (onBeat(e.pos) && e.triplet === null && rng.chance(P.pAnchor));
          firstPitched = false;
        });
        const pitched = events.filter(e => !e.rest);
        if (pitched.length && (isPhraseEnd || isLast)) pitched[pitched.length - 1].anchor = true;
        bars.push({ chords, events, copyFrom, motifFrom, key });
        barCounter++;
      }

      // ---- pitch plan ----
      // Phrase contour target: arch shape over each 4-bar phrase.
      const centre = (P.lo + P.hi) / 2;
      const contourTarget = (b, pos) => {
        const phrasePos = ((b % 4) * barLen + pos) / (4 * barLen); // 0..1
        const phraseIdx = Math.floor(b / 4);
        const sign = phraseIdx % 2 === 0 ? 1 : -1;
        return centre + sign * P.contourAmp * Math.sin(Math.PI * phrasePos) + (rng.next() - 0.5) * 2;
      };

      const firstPitchCache = new Map();
      const isFinalSection = si === sections.length - 1;
      // If the next section is a verbatim copy, its first note is already fixed.
      const nextSectionFirst = () => {
        if (!form[si + 1] || form[si + 1].reuse === undefined) return null;
        const src = form[si + 1].reuse === si ? { bars } : out[form[si + 1].reuse];
        if (!src) return null;
        const fp = src.bars[0].events.find(e => !e.rest);
        return fp && fp.pitch !== undefined ? fp.pitch : null;
      };

      // Compute (and cache) the first pitched note of bar b, without filling.
      const resolveFirstPitch = (b, prev) => {
        if (b >= nBars) return null;
        if (firstPitchCache.has(b)) return firstPitchCache.get(b);
        const bar = bars[b];
        const first = bar.events.find(e => !e.rest);
        if (!first) { firstPitchCache.set(b, null); return null; }
        let p;
        if (bar.copyFrom) p = bar.copyFrom.events.find(e => !e.rest).pitch;
        else if (bar.motifFrom && snapMotif(P, key, bar.motifFrom.events, bar.events, prev)) { bar.motifDone = true; p = first.pitch; }
        else p = chooseAnchor(rng, P, first.chord, key, prev, contourTarget(b, first.pos), { leadsTo: b === nBars - 1 ? nextSectionFirst() : undefined });
        firstPitchCache.set(b, p);
        return p;
      };

      for (let b = 0; b < nBars; b++) {
        const bar = bars[b];
        const ev = bar.events;
        const isLast = b === nBars - 1;
        if (bar.copyFrom) {
          ev.forEach((e, i) => { e.pitch = bar.copyFrom.events[i].pitch; });
          const lp = ev.filter(e => !e.rest);
          if (lp.length) prevPitch = lp[lp.length - 1].pitch;
          continue;
        }
        if (bar.motifFrom && (bar.motifDone || snapMotif(P, key, bar.motifFrom.events, ev, prevPitch))) {
          const lp = ev.filter(e => !e.rest);
          if (lp.length) prevPitch = lp[lp.length - 1].pitch;
          continue;
        }
        // Fresh: anchors first.
        const anchorIdx = [];
        ev.forEach((e, i) => { if (e.anchor) anchorIdx.push(i); });
        anchorIdx.forEach((i, n) => {
          const e = ev[i];
          if (n === 0 && firstPitchCache.has(b)) { e.pitch = firstPitchCache.get(b); prevPitch = e.pitch; return; }
          const finalNote = isFinalSection && isLast && n === anchorIdx.length - 1;
          const leadsTo = isLast && n === anchorIdx.length - 1 ? nextSectionFirst() : undefined;
          e.pitch = chooseAnchor(rng, P, e.chord, key, prevPitch, contourTarget(b, e.pos), { finalNote, leadsTo });
          prevPitch = e.pitch;
        });
        // Fills between anchors within the bar.
        for (let n = 0; n + 1 < anchorIdx.length; n++) {
          fillBetween(rng, P, key, ev, anchorIdx[n], anchorIdx[n + 1], ev[anchorIdx[n]].pitch, ev[anchorIdx[n + 1]].pitch, level);
        }
        // Trailing fills run into the next bar's first note.
        const lastA = anchorIdx[anchorIdx.length - 1];
        if (lastA !== undefined && lastA < ev.length - 1 && ev.slice(lastA + 1).some(e => !e.rest)) {
          let target = resolveFirstPitch(b + 1, prevPitch);
          if (target === null) target = chooseAnchor(rng, P, ev[lastA].chord, key, prevPitch, contourTarget(b, barLen));
          fillBetween(rng, P, key, ev, lastA, ev.length, ev[lastA].pitch, target, level);
          const lp = ev.filter(e => !e.rest);
          prevPitch = lp[lp.length - 1].pitch;
        }
        if (anchorIdx.length === 0) {
          // All-rest bar; nothing to do.
        }
      }
      out.push({ key, bars });
    });
    return out;
  }

  return { generate, params };
})();
