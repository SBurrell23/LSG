// app.js — UI wiring: difficulty, generation, rendering, playback, print, links.

(() => {
  const $ = id => document.getElementById(id);
  const chordsInput = $('chords-level');
  const melodyInput = $('melody-level');
  const linkInput = $('link-levels');
  const keySelect = $('key-select');
  const meterSelect = $('meter-select');
  let current = null;
  let synthControl = null;
  let visualObj = null;

  const randomSeed = () => (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0);
  const clampLevel = v => { const n = parseInt(v, 10); return n >= 1 && n <= 10 ? n : null; };

  // ---- key picker ----
  const pretty = name => name.replace(/([A-G])b/, '$1♭').replace(/([A-G])#/, '$1♯');
  (function fillKeys() {
    const majors = Theory.KEYS.major.slice().sort((a, b) => a.fifths - b.fifths);
    const minors = Theory.KEYS.minor.slice().sort((a, b) => a.fifths - b.fifths);
    const grp = (label, list, suffix) => {
      const g = document.createElement('optgroup'); g.label = label;
      for (const k of list) {
        const o = document.createElement('option'); o.value = k.name;
        o.textContent = pretty(k.name.replace(/m$/, '')) + suffix; g.appendChild(o);
      }
      keySelect.appendChild(g);
    };
    grp('Major', majors, ' major');
    grp('Minor', minors, ' minor');
  })();

  // ---- URL state ----
  function readUrl() {
    const p = new URLSearchParams(location.search);
    const legacy = clampLevel(p.get('level'));
    const chords = clampLevel(p.get('chords')) || legacy;
    const melody = clampLevel(p.get('melody')) || legacy;
    const seed = parseInt(p.get('seed'), 10);
    const key = p.get('key') || '';
    const meter = p.get('meter') === '3/4' || p.get('meter') === '4/4' ? p.get('meter') : '';
    const keyOk = [...keySelect.options].some(o => o.value === key) ? key : '';
    return { chords, melody, seed: Number.isFinite(seed) ? seed >>> 0 : null, key: keyOk, meter };
  }

  function writeUrl(t) {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('chords', t.chordsLevel);
    url.searchParams.set('melody', t.melodyLevel);
    url.searchParams.set('seed', t.seed);
    if (keySelect.value) url.searchParams.set('key', keySelect.value);
    if (meterSelect.value) url.searchParams.set('meter', meterSelect.value);
    history.replaceState(null, '', url);
  }

  // ---- difficulty readouts + tooltips ----
  function updateLevelText() {
    const c = parseInt(chordsInput.value, 10), m = parseInt(melodyInput.value, 10);
    $('chords-number').textContent = c;
    $('melody-number').textContent = m;
    $('chords-tip-name').textContent = 'Level ' + c + ' · ' + Tune.LEVELS[c].name;
    $('chords-tip-text').textContent = Tune.LEVELS[c].harmony;
    $('melody-tip-name').textContent = 'Level ' + m + ' · ' + Tune.LEVELS[m].name;
    $('melody-tip-text').textContent = Tune.LEVELS[m].melody;
    chordsInput.style.setProperty('--pct', ((c - 1) / 9 * 100) + '%');
    melodyInput.style.setProperty('--pct', ((m - 1) / 9 * 100) + '%');
  }

  function onSliderInput(ev) {
    if (linkInput.checked) {
      const other = ev.target === chordsInput ? melodyInput : chordsInput;
      other.value = ev.target.value;
    }
    updateLevelText();
  }

  // ---- rendering ----
  function render(tune) {
    const sheet = $('sheet');
    sheet.innerHTML = '';
    const totalBars = tune.sections.reduce((a, s) => a + s.bars.length, 0);
    const rendered = ABCJS.renderAbc(sheet, tune.abc, {
      responsive: 'resize',
      scale: totalBars <= 16 ? 1.2 : 1,
      add_classes: true,
      staffwidth: 980,
      paddingtop: 10,
      paddingbottom: 20,
      format: {
        titlefont: 'Fraunces 26',
        composerfont: 'Inter 12',
        tempofont: 'Inter 13',
        partsfont: 'Inter 13 bold',
        gchordfont: 'Inter 14 bold',
        partsbox: 1,
      },
    });
    visualObj = rendered[0];
    $('abc-source').value = tune.abc;
    $('seed').textContent = tune.seed;
    $('meta-key').textContent = pretty(tune.key.name.replace(/m$/, '')) + (tune.key.mode === 'minor' ? ' minor' : ' major')
      + ' · ' + tune.meter + ' · ' + tune.feelName + ' ♩=' + tune.tempo;
    const letters = tune.form.map(s => s.name).join('');
    const modulates = tune.sections.some(s => s.key.name !== tune.key.name);
    $('meta-form').textContent = totalBars + ' bars, ' + letters + (modulates ? ' (bridge modulates)' : '');
    document.title = tune.title + ' · Lead Sheet Generator';
    loadAudio();
  }

  // ---- playback with a moving highlight ----
  function clearHighlights() {
    document.querySelectorAll('#sheet .abcjs-highlight').forEach(el => el.classList.remove('abcjs-highlight'));
  }
  const cursorControl = {
    onStart() { clearHighlights(); },
    onEvent(ev) {
      if (ev.measureStart && ev.left === null) return; // end-of-line marker, nothing to show
      clearHighlights();
      const groups = ev.elements || [];
      let first = null;
      groups.forEach(g => g.forEach(el => { el.classList.add('abcjs-highlight'); if (!first) first = el; }));
      if (first) keepInView(first);
    },
    onFinished() { clearHighlights(); },
  };
  function keepInView(el) {
    const r = el.getBoundingClientRect();
    const pad = 90;
    if (r.top < pad || r.bottom > window.innerHeight - pad) {
      window.scrollTo({ top: window.scrollY + r.top - window.innerHeight / 2, behavior: 'smooth' });
    }
  }

  function loadAudio() {
    const box = $('audio');
    if (!ABCJS.synth.supportsAudio()) {
      box.innerHTML = '<p class="hint">Audio playback is not supported in this browser.</p>';
      return;
    }
    // A fresh controller for every sheet. abcjs keeps the previously primed
    // audio buffer when setTune is called without a user gesture, which made
    // the play button keep playing the old tune.
    if (synthControl) { try { synthControl.destroy(); } catch (e) { /* ignore */ } }
    clearHighlights();
    box.innerHTML = '';
    synthControl = new ABCJS.synth.SynthController();
    synthControl.load('#audio', cursorControl, {
      displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true,
    });
    synthControl.setTune(visualObj, false, {
      chordsOff: !$('chords-on').checked,
      program: 0,
      midiTranspose: 0,
    }).catch(err => console.warn('Audio problem:', err));
  }

  // ---- generation ----
  function generate(seed) {
    const chords = parseInt(chordsInput.value, 10);
    const melody = parseInt(melodyInput.value, 10);
    const opts = { chords, melody, seed: seed == null ? randomSeed() : seed, key: keySelect.value || null, meter: meterSelect.value || null };
    try {
      current = Tune.generate(opts);
    } catch (err) {
      console.error('Generation failed', opts, err);
      current = Tune.generate({ ...opts, seed: randomSeed() });
    }
    updateLevelText();
    writeUrl(current);
    render(current);
  }

  // ---- events ----
  chordsInput.addEventListener('input', onSliderInput);
  melodyInput.addEventListener('input', onSliderInput);
  chordsInput.addEventListener('change', () => generate());
  melodyInput.addEventListener('change', () => generate());
  linkInput.addEventListener('change', () => {
    if (linkInput.checked && chordsInput.value !== melodyInput.value) {
      melodyInput.value = chordsInput.value; updateLevelText(); generate();
    }
  });
  keySelect.addEventListener('change', () => generate());
  meterSelect.addEventListener('change', () => generate());
  $('generate').addEventListener('click', () => generate());
  $('print').addEventListener('click', () => window.print());
  $('chords-on').addEventListener('change', loadAudio);
  $('copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      const b = $('copy-link'); const old = b.textContent; b.textContent = 'Copied!'; setTimeout(() => b.textContent = old, 1400);
    } catch (e) { prompt('Copy this link:', location.href); }
  });
  $('seed-form').addEventListener('submit', ev => {
    ev.preventDefault();
    const v = parseInt($('seed-input').value.trim(), 10);
    if (Number.isFinite(v)) generate(v >>> 0);
  });
  document.addEventListener('keydown', ev => {
    if (ev.target.matches('input, textarea, select')) return;
    if (ev.key === 'n' || ev.key === 'N') generate();
    if (ev.key === ' ' && synthControl) { ev.preventDefault(); synthControl.play(); }
  });

  // ---- collapsible panels remember their state ----
  document.querySelectorAll('details.collapsible').forEach(d => {
    const k = 'lsg-' + d.id;
    try { const v = localStorage.getItem(k); if (v === 'closed') d.open = false; } catch (e) { /* ignore */ }
    d.addEventListener('toggle', () => { try { localStorage.setItem(k, d.open ? 'open' : 'closed'); } catch (e) { /* ignore */ } });
  });

  // ---- init ----
  const fromUrl = readUrl();
  if (fromUrl.chords) chordsInput.value = fromUrl.chords;
  if (fromUrl.melody) melodyInput.value = fromUrl.melody;
  if (fromUrl.chords && fromUrl.melody && fromUrl.chords !== fromUrl.melody) linkInput.checked = false;
  keySelect.value = fromUrl.key;
  meterSelect.value = fromUrl.meter;
  updateLevelText();
  generate(fromUrl.seed);
})();
