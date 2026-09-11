// app.js — UI wiring: difficulty, generation, rendering, playback, print, links.

(() => {
  const $ = id => document.getElementById(id);
  const levelInput = $('level');
  let current = null;
  let synthControl = null;
  let visualObj = null;

  function randomSeed() {
    return (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0);
  }

  function readUrl() {
    const p = new URLSearchParams(location.search);
    const level = parseInt(p.get('level'), 10);
    const seed = parseInt(p.get('seed'), 10);
    return { level: level >= 1 && level <= 10 ? level : null, seed: Number.isFinite(seed) ? seed >>> 0 : null };
  }

  function writeUrl(level, seed) {
    const url = new URL(location.href);
    url.searchParams.set('level', level);
    url.searchParams.set('seed', seed);
    history.replaceState(null, '', url);
  }

  function updateLevelText() {
    const level = parseInt(levelInput.value, 10);
    const info = Tune.LEVELS[level];
    $('level-number').textContent = level;
    $('level-name').textContent = info.name;
    $('desc-harmony').textContent = info.harmony;
    $('desc-melody').textContent = info.melody;
    levelInput.style.setProperty('--pct', ((level - 1) / 9 * 100) + '%');
  }

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
    $('meta-key').textContent = Theory.prettySymbol(tune.key.name.replace('m', '')) + (tune.key.mode === 'minor' ? ' minor' : ' major') + ' · ' + tune.meter + ' · ' + tune.feelName + ' ♩=' + tune.tempo;
    const bars = tune.sections.reduce((a, s) => a + s.bars.length, 0);
    const letters = tune.form.map(s => s.name).join('');
    const modulates = tune.sections.some(s => s.key.name !== tune.key.name);
    $('meta-form').textContent = bars + ' bars, ' + letters + (modulates ? ' (bridge modulates)' : '');
    document.title = tune.title + ' · Lead Sheet Generator';
    loadAudio();
  }

  function loadAudio() {
    if (!ABCJS.synth.supportsAudio()) {
      $('audio').innerHTML = '<p class="hint">Audio playback is not supported in this browser.</p>';
      return;
    }
    if (!synthControl) {
      synthControl = new ABCJS.synth.SynthController();
      synthControl.load('#audio', null, {
        displayLoop: true, displayRestart: true, displayPlay: true, displayProgress: true, displayWarp: true,
      });
    }
    synthControl.setTune(visualObj, false, {
      chordsOff: !$('chords-on').checked,
      program: 0,
      midiTranspose: 0,
    }).catch(err => console.warn('Audio problem:', err));
  }

  function generate(level, seed) {
    level = level || parseInt(levelInput.value, 10);
    seed = seed === undefined || seed === null ? randomSeed() : seed;
    try {
      current = Tune.generate(level, seed);
    } catch (err) {
      console.error('Generation failed for level', level, 'seed', seed, err);
      // Retry with a new seed rather than leaving the page empty.
      current = Tune.generate(level, randomSeed());
    }
    levelInput.value = current.level;
    updateLevelText();
    writeUrl(current.level, current.seed);
    render(current);
  }

  // ---- events ----
  levelInput.addEventListener('input', updateLevelText);
  levelInput.addEventListener('change', () => generate());
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
    if (Number.isFinite(v)) generate(null, v >>> 0);
  });
  document.addEventListener('keydown', ev => {
    if (ev.target.matches('input, textarea')) return;
    if (ev.key === 'n' || ev.key === 'N') generate();
    if (ev.key === ' ' && synthControl) { ev.preventDefault(); synthControl.play(); }
  });

  // ---- init ----
  const fromUrl = readUrl();
  if (fromUrl.level) levelInput.value = fromUrl.level;
  updateLevelText();
  generate(fromUrl.level, fromUrl.seed);
})();
