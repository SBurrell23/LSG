// app.js — UI wiring: difficulty, generation, rendering, playback, print, links.

(() => {
  const $ = id => document.getElementById(id);
  const chordsInput = $('chords-level');
  const melodyInput = $('melody-level');
  const keySelect = $('key-select');
  const typeSelect = $('type-select');
  let current = null;
  let synthControl = null;
  let visualObj = null;

  const randomSeed = () => (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0);
  const clampLevel = v => { const n = parseInt(v, 10); return n >= 1 && n <= 10 ? n : null; };

  // ---- key picker ----
  const pretty = name => name.replace(/([A-G])b/, '$1♭').replace(/([A-G])#/, '$1♯');
  (function fillKeys() {
    // Easiest first: fewest accidentals, sharps before flats on ties (C, G, F, D, Bb, A, Eb ...).
    const byDifficulty = (a, b) => Math.abs(a.fifths) - Math.abs(b.fifths) || b.fifths - a.fifths;
    const majors = Theory.KEYS.major.slice().sort(byDifficulty);
    const minors = Theory.KEYS.minor.slice().sort(byDifficulty);
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
    // Song types grouped by time signature.
    for (const meter of ['4/4', '3/4', '2/4', '6/8']) {
      const g = document.createElement('optgroup'); g.label = meter;
      for (const t of Tune.TYPES.filter(t => t.meter === meter)) {
        const o = document.createElement('option'); o.value = t.name; o.textContent = t.name; g.appendChild(o);
      }
      typeSelect.appendChild(g);
    }
  })();

  // ---- URL state ----
  function readUrl() {
    const p = new URLSearchParams(location.search);
    const legacy = clampLevel(p.get('level'));
    const chords = clampLevel(p.get('chords')) || legacy;
    const melody = clampLevel(p.get('melody')) || legacy;
    const seed = parseInt(p.get('seed'), 10);
    const key = p.get('key') || '';
    const type = p.get('type') || '';
    const keyOk = [...keySelect.options].some(o => o.value === key) ? key : '';
    const typeOk = Tune.TYPES.some(t => t.name === type) ? type : '';
    return { chords, melody, seed: Number.isFinite(seed) ? seed >>> 0 : null, key: keyOk, type: typeOk };
  }

  function writeUrl(t) {
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('chords', t.chordsLevel);
    url.searchParams.set('melody', t.melodyLevel);
    url.searchParams.set('seed', t.seed);
    if (keySelect.value) url.searchParams.set('key', keySelect.value);
    if (typeSelect.value) url.searchParams.set('type', typeSelect.value);
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

  const onSliderInput = () => updateLevelText();

  // Tooltip on the Type dropdown: describes the selected type's traits.
  function updateTypeTip() {
    const t = Tune.TYPES.find(x => x.name === typeSelect.value);
    $('type-option').classList.toggle('has-type', !!t);
    if (t) { $('type-tip-name').textContent = t.name + ' · ' + t.meter; $('type-tip-text').textContent = t.desc; }
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
      + ' · ' + tune.meter + ' · ' + tune.feelName + (tune.meter === '6/8' ? ' ♩.=' : ' ♩=') + tune.tempo;
    $('tempo-btn').firstChild.textContent = tune.meter === '6/8' ? '♩. = ' : '♩ = ';
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

  // ---- tempo (BPM) control, replaces abcjs's percent box ----
  let bpm = 120;
  const clampBpm = v => Math.max(50, Math.min(250, Math.round(v)));
  function showBpm(v) {
    $('tempo-value').textContent = v; $('tempo-big').textContent = v; $('tempo-slider').value = v;
    $('tempo-slider').style.setProperty('--pct', ((v - 50) / 200 * 100) + '%');
  }
  function applyBpm(v) {
    bpm = clampBpm(v);
    showBpm(bpm);
    if (synthControl && current) {
      const warp = Math.max(1, Math.round(bpm / current.tempo * 100));
      synthControl.setWarp(warp).catch(err => console.warn('Tempo problem:', err));
    }
  }
  $('tempo-btn').addEventListener('click', () => { $('tempo-modal').hidden = false; $('tempo-slider').focus(); });
  $('tempo-modal').addEventListener('click', ev => { if (ev.target.closest('[data-close]')) $('tempo-modal').hidden = true; });
  $('tempo-slider').addEventListener('input', () => showBpm(clampBpm($('tempo-slider').value)));
  $('tempo-slider').addEventListener('change', () => applyBpm($('tempo-slider').value));
  $('tempo-reset').addEventListener('click', () => applyBpm(current ? current.tempo : 120));

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
      chordsOff: false,
      program: 0,
      midiTranspose: 0,
    }).catch(err => console.warn('Audio problem:', err));
    // Every sheet starts at its own written tempo.
    bpm = current ? current.tempo : 120;
    $('tempo-sheet').textContent = bpm;
    showBpm(bpm);
  }

  // ---- saved sheets (localStorage) ----
  const SAVED_KEY = 'lsg-saved';
  const readSaved = () => { try { const v = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const writeSaved = list => { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e) { /* storage full or blocked */ } };
  const sheetId = t => [t.chordsLevel, t.melodyLevel, t.seed, keySelect.value || '', typeSelect.value || ''].join('|');
  const findSaved = t => readSaved().findIndex(s => s.id === sheetId(t));

  function updateSaveButton() {
    const saved = current ? findSaved(current) >= 0 : false;
    $('save').setAttribute('aria-pressed', saved ? 'true' : 'false');
    $('save-label').textContent = saved ? 'Saved' : 'Save';
    $('save').title = saved ? 'Remove from saved sheets' : 'Save this sheet';
    $('saved-count').textContent = readSaved().length;
  }

  function toggleSave() {
    if (!current) return;
    const list = readSaved();
    const i = list.findIndex(s => s.id === sheetId(current));
    if (i >= 0) list.splice(i, 1);
    else list.unshift({
      id: sheetId(current), title: current.title, chords: current.chordsLevel, melody: current.melodyLevel,
      seed: current.seed, key: keySelect.value || '', type: typeSelect.value || '',
      keyName: pretty(current.key.name.replace(/m$/, '')) + (current.key.mode === 'minor' ? ' minor' : ' major'),
      time: current.meter, feel: current.feelName, tempo: current.tempo, savedAt: Date.now(),
    });
    writeSaved(list);
    updateSaveButton();
  }

  function loadSaved(entry) {
    chordsInput.value = entry.chords; melodyInput.value = entry.melody;
    keySelect.value = entry.key || ''; typeSelect.value = entry.type || '';
    updateLevelText();
    closeModal();
    generate(entry.seed);
  }

  function renderSavedList() {
    const list = readSaved();
    const ul = $('saved-list');
    ul.innerHTML = '';
    $('saved-empty').hidden = list.length > 0;
    const fmtDate = ts => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    for (const e of list) {
      const li = document.createElement('li'); li.className = 'saved-item';
      const open = document.createElement('button'); open.type = 'button'; open.className = 'saved-open';
      const levels = e.chords === e.melody ? 'Level ' + e.chords : 'Chords ' + e.chords + ' · Melody ' + e.melody;
      open.innerHTML = '<span class="t"></span><span class="m"><b></b> · ' + '</span>';
      open.querySelector('.t').textContent = e.title;
      open.querySelector('.m b').textContent = levels;
      open.querySelector('.m').append(document.createTextNode([e.keyName, e.time, e.feel + ' ♩=' + e.tempo, 'saved ' + fmtDate(e.savedAt)].join(' · ')));
      open.addEventListener('click', () => loadSaved(e));
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'saved-remove'; rm.textContent = '×';
      rm.title = 'Remove'; rm.setAttribute('aria-label', 'Remove ' + e.title);
      rm.addEventListener('click', ev => { ev.stopPropagation(); writeSaved(readSaved().filter(s => s.id !== e.id)); renderSavedList(); updateSaveButton(); });
      li.append(open, rm); ul.appendChild(li);
    }
  }

  function openModal() { renderSavedList(); $('saved-modal').hidden = false; $('saved-modal').querySelector('.modal-close').focus(); }
  function closeModal() { $('saved-modal').hidden = true; }

  // ---- generation ----
  function generate(seed) {
    const chords = parseInt(chordsInput.value, 10);
    const melody = parseInt(melodyInput.value, 10);
    const opts = { chords, melody, seed: seed == null ? randomSeed() : seed, key: keySelect.value || null, type: typeSelect.value || null };
    try {
      current = Tune.generate(opts);
    } catch (err) {
      console.error('Generation failed', opts, err);
      current = Tune.generate({ ...opts, seed: randomSeed() });
    }
    updateLevelText();
    writeUrl(current);
    render(current);
    updateSaveButton();
  }

  // ---- events ----
  chordsInput.addEventListener('input', onSliderInput);
  melodyInput.addEventListener('input', onSliderInput);
  chordsInput.addEventListener('change', () => generate());
  melodyInput.addEventListener('change', () => generate());
  keySelect.addEventListener('change', () => generate());
  typeSelect.addEventListener('change', () => { updateTypeTip(); generate(); });
  $('generate').addEventListener('click', () => generate());
  $('print').addEventListener('click', () => window.print());
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
  $('save').addEventListener('click', toggleSave);
  $('open-saved').addEventListener('click', openModal);
  $('saved-modal').addEventListener('click', ev => { if (ev.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && !$('saved-modal').hidden) { closeModal(); return; }
    if (ev.key === 'Escape' && !$('tempo-modal').hidden) { $('tempo-modal').hidden = true; return; }
    if (ev.target.matches('input, textarea, select')) return;
    if (!$('saved-modal').hidden || !$('tempo-modal').hidden) return;
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
  keySelect.value = fromUrl.key;
  typeSelect.value = fromUrl.type;
  updateTypeTip();
  updateLevelText();
  generate(fromUrl.seed);
})();
