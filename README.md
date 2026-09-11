# Lead Sheet Generator

A static website that procedurally generates a one-page piano lead sheet at a difficulty of your choosing (1–10). Every sheet has a title, key, tempo/feel, chord symbols and a melody written so that it sits on the harmony.

## Run it

It is plain HTML/CSS/JS with no build step. Serve the folder with any static server, for example:

```bash
python -m http.server 8765
```

Then open http://localhost:8765. Opening `index.html` directly from disk also works in most browsers.

Notation rendering and playback use [abcjs](https://github.com/paulrosen/abcjs) from a CDN, and the piano soundfont is fetched on first play, so an internet connection is needed.

## Using it

- Two independent **Difficulty** sliders (1–10): one for the chords, one for the melody, so you can mix easy chords with a hard melody or the reverse. Hover a number to see what that level includes. A new sheet is generated when you let go, or press **New Sheet** / `N`.
- **Key** and **Time** default to random, or pick any major/minor key and 4/4 or 3/4.
- **Play along** plays the melody with the chords as accompaniment (`Space` toggles play/pause); the note being played is highlighted on the sheet. Untick *Play chord accompaniment* to hear the melody alone.
- **Save** (top-right of the score) keeps the current sheet in your browser's local storage; **Saved** opens the list so you can reopen or remove any of them.
- **Print / PDF** prints just the sheet.
- Every sheet has a **seed**. The URL (`?chords=6&melody=4&seed=123456&key=Eb`) recreates the exact same sheet, and *Copy link* copies it. You can also paste a seed into the box and press *Load*.
- The ABC notation source is available under *ABC notation source* if you want to paste it into another editor.

## How the difficulty scales

| Level | Harmony | Melody |
|---|---|---|
| 1 | C major, I/IV/V triads, one chord per bar, 16 bars | Stepwise, whole/half/quarter notes |
| 2 | Keys up to 1 accidental, adds ii and vi | Dotted halves, small leaps |
| 3 | Up to 2 accidentals, adds iii and V7, some 3/4 tunes | First eighth notes, dotted quarters |
| 4 | Seventh chords everywhere, 32-bar AABA with turnarounds | Rests, dotted rhythms, first syncopation |
| 5 | Secondary dominants, minor keys, 7sus4 | Triplets, off-beat eighths, a few chromatic notes |
| 6 | ii–V of x, borrowed chords (iv, ♭VI), slash chords, 6ths | Sixteenth figures, syncopated bars |
| 7 | Tritone subs, passing diminished, backdoor ♭VII7, V7♭9 | Tresillo rhythms, chromatic approach notes |
| 8 | 9ths, 13ths, maj9, 6/9, m11, 7♯11; bridge may modulate | Dense sixteenths, enclosures, bigger leaps |
| 9 | Altered dominants, up to four chords per bar, any key | Fast chromatic runs, two-octave range |
| 10 | Everything, denser | Maximum density and chromaticism |

## How it works

- `js/theory.js` – pitch spelling (circle-of-fifths based, so chord symbols and accidentals are spelled sensibly in every key), chord qualities and chord-scales. The chord-scale for a chord is the key scale plus the chord tones minus "avoid" notes (a half step above a chord tone, ♭3 against a major 3rd, major 7th against a dominant 7th).
- `js/harmony.js` – a functional-harmony Markov chain over scale degrees produces a base progression with proper cadences, then level-gated decorations are layered on: sevenths, secondary dominants, ii–Vs, modal interchange, passing diminished chords, tritone substitutions, inversions, sus chords and extensions.
- `js/melody.js` – rhythm is built from weighted cells per level. Pitches are placed in two passes: chord tones on "anchor" notes (downbeats, chord changes, long notes), then scale/chromatic fills that walk between anchors. Motifs are reused (rhythm and contour, snapped to the new chord), and repeated A sections copy the melody exactly, as on a real lead sheet.
- `js/tune.js` – picks key, meter, form, tempo and title, runs the generators, and writes ABC notation.
- `js/app.js` – the UI, abcjs rendering and playback.
