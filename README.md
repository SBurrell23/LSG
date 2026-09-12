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
- **Key** and **Style** default to random. Key is a dropdown of every major and minor key. Style opens a gallery of illustrated tiles grouped by time signature: 4/4 (Ballad, Medium, Rock Ballad, Blues, Boogie-Woogie, Gospel, Disney Ballad, Disney Showtune, Bossa Nova, Medium Swing, Medium-Up Swing, Latin, Reggae, Stride), 3/4 (Waltz, Slow Waltz, Jazz Waltz, Minuet, Country Waltz), 2/4 (Samba, Ragtime, Polka, March, Tango, Habanera) and 6/8 (6/8 Ballad, Jig, Tarantella). Hover a tile (or tap its ⓘ on touch screens) to read what makes that style tick. Each style also sets the play-along accompaniment pattern (oom-pah for a polka, off-beat skank for reggae, a sparse pad for a ballad), always on piano.
- **Play along** plays the melody with the chords as accompaniment (`Space` toggles play/pause); the note being played is highlighted on the sheet, and clicking or tapping any note starts playback from that note. Untick *Chord Accompaniment* to hear the melody alone. The ♩= button opens a tempo slider (50–250 BPM).
- **Save** (top-right of the score) keeps the current sheet in your browser's local storage; **Saved** opens the list so you can reopen or remove any of them.
- **Dark mode** via the sun/moon button in the header. It follows your system setting until you choose, remembers your choice, and inverts the score too (light notation on a dark sheet). Printing always comes out black on white.
- **Print / PDF** prints just the sheet.
- Every sheet has a **seed**. The URL (`?chords=6&melody=4&seed=123456&key=Eb&style=Bossa%20Nova`) recreates the exact same sheet, and *Copy link* copies it. You can also paste a seed into the box and press *Load*.
- The ABC notation source is available under *ABC notation source* if you want to paste it into another editor.

## How the difficulty scales

| Level | Harmony | Melody |
|---|---|---|
| 1 | C major, I/IV/V triads, one chord per bar, 16 bars | Stepwise, whole/half/quarter notes |
| 2 | Keys up to 1 accidental, adds ii and vi | Dotted halves, small leaps |
| 3 | Up to 2 accidentals, adds iii and an occasional V7, some 3/4 tunes | A few eighth-note pairs |
| 4 | 32-bar AABA with turnarounds; triads with V7, two chords per bar at cadences | Eighth pairs and dotted quarters |
| 5 | A few seventh chords (V7 always, maj7/m7 here and there), keys up to 3 accidentals | Rests, dotted rhythms, light syncopation |
| 6 | Sevenths on most chords, occasional secondary dominants, 7sus4, minor keys | Off-beat eighths, dotted-eighth figures, a stray chromatic note |
| 7 | Sevenths throughout, more secondary dominants, ii–V of x, keys up to 4 accidentals | Triplets, syncopated bars, wider range |
| 8 | Borrowed chords (iv, ♭VI), slash chords, 6 and m6 | First sixteenth figures, chromatic approach notes |
| 9 | Passing diminished, backdoor ♭VII7, V7♭9 in minor, keys up to 5 accidentals | Sixteenth figures, tresillo rhythms, bigger leaps |
| 10 | Plus tritone substitutions and denser changes | Octave leaps, frequent chromatic approaches |

## How it works

- `js/theory.js` – pitch spelling (circle-of-fifths based, so chord symbols and accidentals are spelled sensibly in every key), chord qualities and chord-scales. The chord-scale for a chord is the key scale plus the chord tones minus "avoid" notes (a half step above a chord tone, ♭3 against a major 3rd, major 7th against a dominant 7th).
- `js/harmony.js` – every 4-bar phrase is built from a library of progression idioms (I–V–vi–IV, circle-of-fifths chains, descending bass lines, pedal bars, borrowed-chord shapes; bridges from their own set that start away from the tonic), laid out at one of three harmonic rhythms, with varied cadences (half, full, plagal, deceptive, several turnarounds), then level-gated decorations are layered on: sevenths, secondary dominants, ii–Vs, modal interchange, passing diminished chords, tritone substitutions, inversions, sus chords and extensions.
- `js/melody.js` – rhythm is built from weighted cells per level. Pitches are placed in two passes: chord tones on "anchor" notes (downbeats, chord changes, long notes), then scale/chromatic fills that walk between anchors. Every note is scored with voice-leading rules — prefer steps, keep momentum for a few notes then turn, step back after a leap, avoid zigzags — and pulled toward a phrase contour that rises to one climax and settles on a stable tone (questions end open, answers end on the root). Bar 2 often sequences bar 1, bar 3 restates it, and the second phrase opens like the first, so a 4-bar phrase reads as idea / idea varied / idea / answer. Phrase ends can lead into the next phrase with pickup notes, notes are sometimes held (tied) across a chord change, the second bar of a phrase breathes with longer notes, and the phrase climax may take an expressive leap. Repeated A sections copy the melody exactly, as on a real lead sheet.
- `js/tune.js` – the song-style table (time signature, tempo range, description, rhythm profile and harmony profile per type), key/form/title selection, and the ABC writer.
- **Styles** shape the music through two profiles. The *rhythm profile* multiplies the weight of rhythm cells by tag (long notes, eighths, sixteenths, triplets, dotted, syncopated, rests, habanera), so a Ballad leans on long notes and a Bossa Nova on off-beat figures at the same level. The *harmony profile* can force triads (Country Waltz, Polka), dominant 7ths on I and IV (Blues, Boogie-Woogie), slow the chord rate (Reggae), pick the fixed 12-bar blues form, and scale each decoration (secondary dominants, borrowed chords, passing diminished, tritone subs, slash chords, sus). Blues-based types also add blue notes to the melody's fill scale. A style can also prefer its own tagged idioms (the Disney styles lean on Broadway shapes: walking-bass inversions, IV to iv, secondary dominants) and lift the final chorus up a half or whole step, transposing the copied A section and its melody.
- `js/icons.js` – the line icons for the style gallery.
- `js/app.js` – the UI (custom dropdown, type gallery, saved sheets, tempo), abcjs rendering and playback.
