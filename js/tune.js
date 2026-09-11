// tune.js — assembles a complete tune (key, form, tempo, harmony, melody)
// and renders it to ABC notation for abcjs.

const Tune = (() => {
  const { mod, makeKey, KEYS, spell, chordTones, chordScale, chordSymbol, abcPitch, keySigAcc,
          LETTERS, LETTER_PC, QUALITIES } = Theory;

  // ---- Level descriptions (shown in the UI) ---------------------------------
  const LEVELS = {
    1:  { name: 'First Steps',   harmony: 'C major only. I, IV and V triads, one chord per bar. 16 bars.', melody: 'Stepwise melody in whole, half and quarter notes within a sixth.' },
    2:  { name: 'Easy',          harmony: 'Keys with up to one sharp or flat. Adds ii and vi.', melody: 'Dotted half notes, small leaps, simple two-bar motifs.' },
    3:  { name: 'Beginner Plus', harmony: 'Up to two accidentals. Adds iii and an occasional V7. Some tunes in 3/4.', melody: 'A few eighth-note pairs; still mostly quarters and halves.' },
    4:  { name: 'Moving Up',     harmony: '32-bar AABA form with turnarounds. Triads with V7; two chords per bar at cadences.', melody: 'Eighth-note pairs and dotted quarters become common.' },
    5:  { name: 'Intermediate',  harmony: 'Seventh chords throughout (maj7, m7, 7, m7b5). Keys up to three accidentals.', melody: 'Rests, dotted rhythms and the first light syncopation.' },
    6:  { name: 'Intermediate Plus', harmony: 'Occasional secondary dominants (V7 of x) and 7sus4. Minor keys appear.', melody: 'Off-beat eighths, dotted-eighth figures, a chromatic note here and there.' },
    7:  { name: 'Advancing',     harmony: 'More secondary dominants, ii–V of x. Keys up to four accidentals.', melody: 'Triplets, syncopated bars, wider range.' },
    8:  { name: 'Advanced',      harmony: 'Borrowed chords (iv, bVI), slash-bass inversions, 6 and m6 chords.', melody: 'First sixteenth-note figures, chromatic approach notes.' },
    9:  { name: 'Pro',           harmony: 'Passing diminished chords, backdoor bVII7, V7b9 in minor. Keys up to five accidentals.', melody: 'Sixteenth figures, tresillo rhythms, bigger leaps.' },
    10: { name: 'Expert',        harmony: 'Everything plus tritone substitutions and denser chord changes.', melody: 'Octave leaps, frequent chromatic approaches, the widest range.' },
  };

  // ---- Key choice ------------------------------------------------------------
  function keyPool(level) {
    const maj = (n) => KEYS.major.filter(k => Math.abs(k.fifths) <= n).map(k => ['major', k.name]);
    const min = (n) => KEYS.minor.filter(k => Math.abs(k.fifths) <= n).map(k => ['minor', k.name]);
    if (level === 1) return [['major', 'C']];
    if (level === 2) return maj(1);
    if (level <= 4) return maj(2);
    if (level === 5) return maj(3);
    if (level === 6) return [...maj(3), ...min(1)];
    if (level === 7) return [...maj(4), ...min(2)];
    if (level === 8) return [...maj(4), ...min(3)];
    if (level === 9) return [...maj(5), ...min(3)];
    return [...maj(5), ...min(4)];
  }

  function keyFromTonic(tonic, mode, nearFifths) {
    const cands = KEYS[mode].filter(k => k.tonic === tonic);
    cands.sort((a, b) => Math.abs(a.fifths - nearFifths) - Math.abs(b.fifths - nearFifths));
    return makeKey(cands[0].name, mode);
  }

  // ---- Form ---------------------------------------------------------------------
  function makeForm(rng, level, home) {
    if (level <= 3) {
      const bStart = level >= 3 ? rng.pick([3, 3, 1, 5]) : 3;
      return [
        { name: 'A', bars: 4, cadence: 'half', key: home },
        { name: 'A', bars: 4, cadence: 'full', key: home, reuse: 0 },
        { name: 'B', bars: 4, cadence: 'half', key: home, startDegree: bStart },
        { name: 'A', bars: 4, cadence: 'final', key: home, reuse: 0 },
      ];
    }
    let bKey = home, returnKey;
    const pMod = 0; // bridge modulation is beyond the top level now
    if (rng.chance(pMod)) {
      const opts = home.mode === 'major'
        ? [[5, 'major'], [9, 'minor'], [3, 'major'], [8, 'major'], [5, 'major']]
        : [[3, 'major'], [5, 'minor'], [8, 'major']];
      const [iv, mode] = rng.pick(opts);
      bKey = keyFromTonic(mod(home.tonic + iv, 12), mode, home.fifths);
      returnKey = home;
    }
    const bStart = rng.pick(bKey === home ? [3, 1, 5, 3] : [0, 0, 3]);
    return [
      { name: 'A', bars: 8, cadence: 'turnaround', key: home },
      { name: 'A', bars: 8, cadence: 'full', key: home, reuse: 0 },
      { name: 'B', bars: 8, cadence: 'half', key: bKey, returnKey, startDegree: bStart },
      { name: 'A', bars: 8, cadence: 'final', key: home, reuse: 0 },
    ];
  }

  // ---- Song types (feel + time signature + tempo range) --------------------------
  // minLevel: the type only comes up at random from that (average) level;
  // w: weight for the random pick.
  const TYPES = [
    { name: 'Ballad',          meter: '4/4', tempo: [56, 76],   minLevel: 1, w: 3 },
    { name: 'Medium',          meter: '4/4', tempo: [88, 112],  minLevel: 1, w: 3 },
    { name: 'Bossa Nova',      meter: '4/4', tempo: [96, 140],  minLevel: 1, w: 3 },
    { name: 'Medium Swing',    meter: '4/4', tempo: [108, 152], minLevel: 4, w: 4 },
    { name: 'Medium-Up Swing', meter: '4/4', tempo: [148, 176], minLevel: 9, w: 2 },
    { name: 'Latin',           meter: '4/4', tempo: [120, 156], minLevel: 6, w: 2 },
    { name: 'Funk',            meter: '4/4', tempo: [90, 112],  minLevel: 6, w: 2 },
    { name: 'Waltz',           meter: '3/4', tempo: [96, 126],  minLevel: 3, w: 1.2 },
    { name: 'Slow Waltz',      meter: '3/4', tempo: [80, 104],  minLevel: 3, w: 0.8 },
    { name: 'Jazz Waltz',      meter: '3/4', tempo: [132, 176], minLevel: 7, w: 1 },
    { name: 'Samba',           meter: '2/4', tempo: [92, 116],  minLevel: 5, w: 0.5 },
    { name: 'Ragtime',         meter: '2/4', tempo: [76, 100],  minLevel: 4, w: 0.5 },
    { name: 'Polka',           meter: '2/4', tempo: [100, 124], minLevel: 3, w: 0.3 },
    { name: 'March',           meter: '2/4', tempo: [100, 120], minLevel: 2, w: 0.3 },
    { name: 'Tango',           meter: '2/4', tempo: [62, 78],   minLevel: 5, w: 0.4 },
  ];
  const typeByName = name => TYPES.find(t => t.name === name) || null;

  function pickType(rng, level) {
    const pool = TYPES.filter(t => level >= t.minLevel).map(t => [t, t.w]);
    return rng.weighted(pool);
  }

  // Lower levels sit in the slower part of a type's range.
  function tempoFor(rng, level, type) {
    const [lo, hi] = type.tempo;
    const span = 0.45 + 0.55 * (level - 1) / 9;
    return Math.round((lo + (hi - lo) * span * rng.next()) / 2) * 2;
  }

  // ---- Titles ------------------------------------------------------------------
  // Pseudo-generated from word pools that match the feel (and lean darker in
  // minor keys). Templates are picked by weight, then filled from the pools.
  const NAMES = ['June', 'Ellis', 'Marnie', 'Theo', 'Ruby', 'Sam', 'Lou', 'Nina', 'Otis', 'Pearl', 'Milo', 'Hazel',
    'Dizzy', 'Bud', 'Frankie', 'Stella', 'Iris', 'Ziggy', 'Mabel', 'Jasper', 'Wendell', 'Delilah', 'Roscoe', 'Ivy',
    'Ada', 'Cleo', 'Bix', 'Toots', 'Lester', 'Minnie', 'Ollie', 'Ramona', 'Clyde', 'Vera', 'Duke', 'Louie', 'Edie',
    'Mose', 'Fats', 'Sadie', 'Rufus', 'Greta', 'Hank', 'Lulu', 'Ike', 'Dot', 'Max', 'Wanda', 'Percy', 'Cosmo',
    'Beatrix', 'Alfie', 'Margot', 'Ezra', 'Opal', 'Ned', 'Tallulah', 'Gus', 'Coco', 'Arlo', 'Fern', 'Rudy', 'Elsie',
    'Monty', 'Petra', 'Sol', 'Winnie', 'Basil', 'Rosie', 'Chet', 'Marlene', 'Skip', 'Josephine', 'Ira', 'Loretta'];
  const ODD_NAMES = ['Nobody', 'the Cat', 'the Dog', 'My Landlord', 'the Milkman', 'the Night Shift', 'a Rainy Tuesday',
    'the Neighbours', 'the Goldfish', 'Whoever Is Listening', 'the Last Bus', 'an Old Friend', 'the Kettle', 'the Pigeons',
    'the Late Train', 'the Bartender', 'a Stranger', 'the Radiator', 'the Moon', 'Absolutely No One'];
  const STREETS = ['Fifth', 'Bleecker', 'Main Street', '52nd Street', 'Rampart', 'Basin Street', 'Beale', 'the Bowery',
    'Sunset', 'Broadway', 'Canal Street', 'the Boardwalk', 'the Fire Escape', 'the Rooftop', 'the Back Porch', 'the Corner',
    'Lenox Avenue', 'the Night Bus', 'the L Train', 'Frenchmen Street', 'the Pier', 'the Landing'];
  const TIMES = ['Dusk', 'Dawn', 'Midnight', '3 A.M.', 'Closing Time', 'Twilight', 'Sunset', 'First Light', 'Last Call',
    'Noon', 'Teatime', 'Half Past Late', 'the Blue Hour', 'Sunrise', 'Bedtime', 'the End of the Night'];
  const PLACES = ['Bahia', 'Havana', 'Rio', 'Lisbon', 'Cádiz', 'Seville', 'Salvador', 'Recife', 'Tulum', 'Montevideo',
    'the Islands', 'the Old Quarter', 'the Harbour', 'the Cove', 'Ipanema', 'Cartagena', 'the Marina', 'the Lagoon'];

  const POOLS = {
    slow: {
      adj: ['Quiet', 'Tender', 'Distant', 'Lonely', 'Faded', 'Pale', 'Silent', 'Sleepless', 'Hollow', 'Last', 'Late',
        'Slow', 'Weary', 'Soft', 'Blue', 'Grey', 'Amber', 'Velvet', 'Wistful', 'Gentle', 'Dim', 'Autumn', 'Winter',
        'Midnight', 'Forgotten', 'Empty', 'Unspoken', 'Fading', 'Borrowed', 'Rainy', 'Paper', 'Threadbare', 'Patient',
        'Nameless', 'Lingering', 'Starless', 'Frosted', 'Whispered', 'Hushed', 'Long'],
      noun: ['Lullaby', 'Serenade', 'Prayer', 'Goodbye', 'Letter', 'Photograph', 'Window', 'Rain', 'Fog', 'Snow', 'Ember',
        'Candle', 'Harbour', 'Lantern', 'Moon', 'Shadow', 'Farewell', 'Sigh', 'Afterglow', 'Twilight', 'Whisper',
        'Nocturne', 'Reverie', 'Lament', 'Elegy', 'Hymn', 'Overcoat', 'Doorway', 'Streetlight', 'Postcard', 'Telegram',
        'Balcony', 'Pillow', 'Moth', 'Tide', 'River', 'Bridge', 'Attic', 'Lighthouse', 'Snowfall', 'Lantern', 'Ghost'],
      templates: [
        ['{Adj} {Noun}', 30], ['{Noun} for {Name}', 12], ['The Last {Noun}', 8], ['{Noun} at {Time}', 10],
        ['Song for {Name}', 6], ['Waiting for {Name}', 5], ['Ballad of {Name}', 6], ['Goodbye, {Name}', 5],
        ['I Remember {Name}', 4], ['{Adj} {Noun} at {Time}', 5], ['Ballad for {OddName}', 5], ['A {Adj} Kind of {Noun}', 4],
        ['Nothing but {Noun}', 3], ['{Name} in the {Where}', 4], ['One More {Noun}', 4], ['If You Forget {Name}', 3],
      ],
    },
    waltz: {
      adj: ['Little', 'Crooked', 'Tipsy', 'Wobbly', 'Sleepy', 'Dusty', 'Paper', 'Tin', 'Clockwork', 'Velvet', 'Midnight',
        'Sunday', 'Lopsided', 'Dizzy', 'Wandering', 'Backwards', 'Spinning', 'Upside-Down', 'Peppermint', 'Porcelain',
        'Moonlit', 'Attic', 'Autumn', 'Rainy', 'Crumpled', 'Borrowed', 'Turning', 'Silver'],
      noun: ['Carousel', 'Music Box', 'Ballroom', 'Chandelier', 'Lantern', 'Snowfall', 'Umbrella', 'Bicycle', 'Kite',
        'Teacup', 'Merry-Go-Round', 'Ferris Wheel', 'Pocket Watch', 'Spinning Top', 'Accordion', 'Gramophone', 'Puppet',
        'Slipper', 'Balloon', 'Weathervane', 'Cuckoo Clock', 'Pinwheel', 'Toy Soldier', 'Tea Party', 'Attic'],
      templates: [
        ['Waltz for {Name}', 10], ['{Adj} Waltz', 16], ['{Noun} Waltz', 14], ['Waltz in {WaltzIn}', 8],
        ["{Name}'s Waltz", 6], ['Three for {Name}', 4], ['{Adj} {Noun}', 16], ['Valse for {Name}', 4],
        ['Waltz for {OddName}', 6], ['The {Adj} {Noun}', 6], ['Last Waltz at {Time}', 4], ['One, Two, {Noun}', 3],
        ['{Adj} {Noun} Waltz', 6], ['Waltz of the {Nouns}', 4],
      ],
    },
    swing: {
      adj: ['Uptown', 'Downtown', 'Crosstown', 'Sideways', 'Straight', 'Hip', 'Cool', 'Bright', 'Blue', "Boppin'",
        "Jumpin'", "Swingin'", 'Quick', 'Loose', 'Sharp', 'Slick', 'Nifty', 'Zippy', 'Back-Alley', 'Late-Night',
        'Double', 'Crooked', 'Snappy', 'Sneaky', 'Fast', 'Crazy', 'Frantic', 'Nervous', 'Dapper', 'Jaunty', 'Hasty',
        'Rapid', 'Skittish', 'Rickety', 'Cheeky', 'Restless', 'Wiggly', 'Bouncy', 'Sudden'],
      noun: ['Steps', 'Shuffle', 'Strut', 'Bounce', 'Riff', 'Groove', 'Hustle', 'Express', 'Detour', 'Shortcut',
        'Scramble', 'Runaround', 'Rush Hour', 'Cab Ride', 'Hop', 'Stomp', 'Jump', 'Sidestep', 'Zigzag', 'Hopscotch',
        'Pinball', 'Jackknife', 'Rooftop', 'Getaway', 'Nightcap', 'Escalator', 'Sprint', 'Errand', 'Caper', 'Racket',
        'Tangle', 'Whirl', 'Chase', 'Shindig', 'Hullabaloo', 'Ricochet', 'Skedaddle', 'Bebop', 'Rumpus', 'Turnaround'],
      single: ['Confabulation', 'Perambulation', 'Syncopation', 'Escalation', 'Reciprocity', 'Rhubarb', 'Marmalade',
        'Paprika', 'Nightcap', 'Sidestep', 'Zigzag', 'Hopscotch', 'Pinball', 'Jackknife', 'Rooftopology', 'Discombobulation',
        'Flapdoodle', 'Kerfuffle', 'Skulduggery', 'Brouhaha', 'Hocus-Pocus', 'Shenanigans', 'Gobbledygook', 'Flibbertigibbet',
        'Mumbo Jumbo', 'Hodgepodge', 'Whatchamacallit', 'Thingamajig', 'Rigmarole', 'Ballyhoo', 'Bamboozle', 'Lollygag',
        'Catawampus', 'Hootenanny', 'Hobnob', 'Skedaddle', 'Hornswoggle', 'Doohickey', 'Codswallop', 'Snickersnee'],
      templates: [
        ['{Adj} {Noun}', 26], ['{Noun} on {Street}', 12], ['Blues for {Name}', 8], ['One for {Name}', 8],
        ["{Name}'s {Noun}", 8], ['Take the {Noun}', 5], ["Don't Ask {Name}", 4], ['{Single}', 8],
        ['{Adj} {Single}', 4], ['Blues for {OddName}', 5], ['{Noun} at {Time}', 5], ['The {Adj} {Noun}', 6],
        ['{Name} Meets {Name2}', 5], ['{Noun} Number {Num}', 4], ['Anything for {Name}', 3], ['Who Let {Name} In?', 3],
        ['{Adj} and {Adj2}', 4], ['No More {Nouns}', 3], ['Blues for the {Noun}', 3],
      ],
    },
    latin: {
      adj: ['Sunlit', 'Golden', 'Salt', 'Warm', 'Lazy', 'Sunday', 'Summer', 'Coral', 'Tropical', 'Coastal', 'Blue',
        'Green', 'Soft', 'Sleepy', 'Barefoot', 'Sun-Drunk', 'Lemon', 'Turquoise', 'Breezy', 'Hazy', 'Mango', 'Seaside',
        'Saturday', 'Rooftop', 'Slow', 'Honey', 'Papaya', 'Sugarcane', 'Hibiscus', 'Copper'],
      noun: ['Breeze', 'Beach', 'Tide', 'Wave', 'Sand', 'Sail', 'Sun', 'Afternoon', 'Hammock', 'Sea Glass', 'Postcard',
        'Sunset', 'Ferry', 'Harbour', 'Island', 'Palm', 'Seashell', 'Balcony', 'Kite', 'Lemonade', 'Sandal', 'Parasol',
        'Cabana', 'Coconut', 'Lagoon', 'Sailboat', 'Sunburn', 'Starfish', 'Shoreline', 'Siesta', 'Veranda', 'Daydream',
        'Terrace', 'Guitar', 'Pelican', 'Boardwalk', 'Orchid'],
      templates: [
        ['{Adj} {Noun}', 26], ['{Noun} in {Place}', 12], ['Samba for {Name}', 6], ['Bossa for {Name}', 8],
        ['One Summer {Noun}', 5], ['Café {Noun}', 5], ['{Name} in {Place}', 6], ['The {Adj} {Noun}', 6],
        ['{Noun} at {Time}', 6], ['{Adj} {Noun} Bossa', 4], ['Girl from {Place}', 3], ['Boy from {Place}', 3],
        ['{PlaceName} {Noun}', 6], ['Bossa for {OddName}', 4], ['Two Weeks in {Place}', 3], ['{Adj} Samba', 4],
        ['Postcard from {Place}', 4], ['Dreaming of {Place}', 3],
      ],
    },
    funk: {
      adj: ['Greasy', 'Sticky', 'Chunky', 'Nasty', 'Funky', 'Fat', 'Dirty', 'Stanky', 'Deep', 'Low', 'Heavy', 'Chicken',
        'Crispy', 'Juicy', 'Rubber', 'Sloppy', 'Lumpy', 'Gritty', 'Swampy', 'Bumpy', 'Crunchy', 'Wobbly', 'Slippery', 'Big'],
      noun: ['Pocket', 'Groove', 'Gravy', 'Grits', 'Biscuit', 'Shuffle', 'Strut', 'Stomp', 'Slap', 'Bounce', 'Bump',
        'Wiggle', 'Boogaloo', 'Backbeat', 'Boots', 'Sandwich', 'Waffle', 'Pickle', 'Gumbo', 'Jambalaya', 'Chicken',
        'Meatball', 'Hot Sauce', 'Skillet', 'Noodle', 'Pretzel', 'Doughnut', 'Basement', 'Sneaker', 'Elbow'],
      templates: [
        ['{Adj} {Noun}', 26], ['The {Noun}', 8], ["{Name}'s {Noun}", 8], ['Get the {Noun}', 6], ['{Noun} Machine', 6],
        ['{Adj} {Noun} Strut', 5], ['Pass the {Noun}', 6], ['Too Much {Noun}', 5], ['{Noun} Time', 5],
        ['Mister {Noun}', 4], ['{Adj} Mama', 3], ['Big {Noun}', 4], ['Do the {Noun}', 6], ['{Noun} on {Street}', 5],
        ['Who Ate the {Noun}?', 3], ['Extra {Noun}', 3],
      ],
    },
    medium: {
      adj: ['Autumn', 'Blue', 'Midnight', 'Velvet', 'Lazy', 'Crimson', 'Silent', 'Sunday', 'Neon', 'Paper', 'Amber',
        'Quiet', 'Golden', 'Restless', 'Hollow', 'Winter', 'Distant', 'Tender', 'Late', 'Emerald', 'Northern', 'Scarlet',
        'Crooked', 'Sideways', 'Easy', 'Lucky', 'Rainy', 'Uptown', 'Sunday-Morning', 'Half-Asleep', 'Lemon', 'Copper',
        'Second-Hand', 'Borrowed', 'Cobalt', 'Peculiar', 'Ordinary', 'Purple', 'Tangerine', 'Marmalade'],
      noun: ['Lullaby', 'Serenade', 'Steps', 'Moon', 'Rain', 'Avenue', 'Dream', 'Lantern', 'Tide', 'Whisper', 'Postcard',
        'Window', 'Garden', 'Harbour', 'Skyline', 'Afternoon', 'Ferry', 'Shadows', 'Streetlight', 'Bridge', 'Ember',
        'Doorway', 'Umbrella', 'Sparrow', 'Bicycle', 'Balcony', 'Rooftop', 'Corner', 'Detour', 'Daydream', 'Teacup',
        'Overcoat', 'Suitcase', 'Newspaper', 'Streetcar', 'Kitchen', 'Radio', 'Pigeon', 'Elevator', 'Lamplight'],
      templates: [
        ['{Adj} {Noun}', 30], ['{Noun} on {Street}', 10], ['Song for {Name}', 8], ["{Name}'s Dream", 5],
        ['{Noun} at {Time}', 8], ['The {Adj} {Noun}', 6], ['One for {Name}', 5], ['{Noun} for {OddName}', 5],
        ['Just {Noun}', 3], ['{Adj} {Noun} Blues', 4], ['Meet Me on {Street}', 3], ['{Name} and the {Noun}', 4],
        ['A {Noun} Named {Name}', 3], ['{Adj} and {Adj2}', 3], ['Almost {Noun}', 3],
      ],
    },
  };
  // Extra vocabulary mixed in for minor keys.
  const MINOR_ADJ = ['Dark', 'Midnight', 'Noir', 'Crooked', 'Smoky', 'Restless', 'Hollow', 'Haunted', 'Shadowy', 'Black',
    'Crimson', 'Bitter', 'Sly', 'Sinister', 'Moody', 'Brooding', 'Cold', 'Stormy', 'Thorny', 'Wicked'];
  const MINOR_NOUN = ['Shadow', 'Alley', 'Raven', 'Storm', 'Mirror', 'Cellar', 'Rumour', 'Secret', 'Gambit', 'Stranger',
    'Detective', 'Thief', 'Spiral', 'Cobweb', 'Riddle', 'Omen', 'Wolf', 'Fog', 'Maze', 'Trapdoor'];
  const WALTZ_IN = ['the Rain', 'Blue', 'Three', 'Autumn', 'the Attic', 'Amber', 'Slow Motion', 'the Dark', 'Stockings',
    'a Minor Key', 'Reverse', 'the Kitchen', 'Moonlight', 'Sepia', 'Half-Light'];
  const NUMS = ['Two', 'Three', 'Five', 'Seven', 'Nine', 'Eleven', 'Thirteen', 'Forty-Two', 'Ninety-Nine', 'One Hundred'];
  const WHERE = ['Rain', 'Fog', 'Snow', 'Dark', 'Twilight', 'Afterglow', 'Attic', 'Doorway', 'Harbour', 'Moonlight',
    'Cold', 'Hallway', 'Kitchen', 'Garden', 'Morning', 'Half-Light', 'Lamplight', 'Quiet'];
  const plural = w => /(s|x|z|ch|sh)$/.test(w) ? w + 'es' : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's';

  function moodFor(feelName, meter) {
    if (meter === '3/4') return 'waltz';
    if (/Ballad|Tango/.test(feelName)) return 'slow';
    if (/Swing|Ragtime|Polka|March/.test(feelName)) return 'swing';
    if (/Bossa|Latin|Samba/.test(feelName)) return 'latin';
    if (/Funk/.test(feelName)) return 'funk';
    return 'medium';
  }
  // Some types like to say what they are in the title.
  const TYPE_TEMPLATES = {
    Ragtime: [['{Adj} Rag', 4], ['{Noun} Rag', 4], ["{Name}'s Rag", 3], ['Rag for {OddName}', 1], ['The {Adj} {Noun} Rag', 2]],
    Polka:   [['{Adj} Polka', 4], ["{Name}'s Polka", 3], ['Polka for {OddName}', 1], ['{Noun} Polka', 3]],
    March:   [['March of the {Nouns}', 4], ['{Adj} March', 3], ["{Name}'s March", 2], ['March to {Street}', 2]],
    Tango:   [['Tango for {Name}', 4], ['{Adj} Tango', 4], ['Tango at {Time}', 2], ['Last Tango on {Street}', 1]],
    Samba:   [['Samba for {Name}', 3], ['{Adj} Samba', 3], ['Samba in {Place}', 2]],
  };

  function makeTitle(rng, meter, feelName, mode) {
    const mood = moodFor(feelName, meter);
    const pool = POOLS[mood];
    let adj = pool.adj, noun = pool.noun;
    if (mode === 'minor' && mood !== 'funk') {
      // Minor keys borrow the darker words (roughly a third of the pool).
      adj = adj.concat(MINOR_ADJ, MINOR_ADJ); noun = noun.concat(MINOR_NOUN);
    }
    // Slow waltzes lean on the ballad vocabulary.
    if (mood === 'waltz' && /Slow/.test(feelName)) { adj = adj.concat(POOLS.slow.adj); noun = noun.concat(POOLS.slow.noun); }
    const special = TYPE_TEMPLATES[feelName];
    const template = special && rng.chance(0.55) ? rng.weighted(special) : rng.weighted(pool.templates);
    const used = new Set();
    const pickFresh = list => {
      let w = rng.pick(list), tries = 0;
      while (used.has(w) && tries++ < 8) w = rng.pick(list);
      used.add(w); return w;
    };
    const fill = {
      Adj: () => pickFresh(adj), Adj2: () => pickFresh(adj), Noun: () => pickFresh(noun),
      Name: () => pickFresh(NAMES), Name2: () => pickFresh(NAMES), OddName: () => pickFresh(ODD_NAMES),
      Street: () => rng.pick(STREETS), Time: () => rng.pick(TIMES), Place: () => rng.pick(PLACES),
      WaltzIn: () => rng.pick(WALTZ_IN), Single: () => rng.pick(pool.single || POOLS.swing.single), Num: () => rng.pick(NUMS),
      Nouns: () => plural(pickFresh(noun)), Where: () => rng.pick(WHERE),
      PlaceName: () => rng.pick(PLACES.filter(x => !/^the /.test(x))),
    };
    const title = template.replace(/\{(\w+)\}/g, (m, k) => (fill[k] ? fill[k]() : m));
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  // ---- Chord-tone spelling ------------------------------------------------------
  const STEP_OF_INTERVAL = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6,
                             13: 1, 14: 1, 15: 1, 17: 3, 18: 3, 20: 5, 21: 5 };
  function chordToneSpelling(chord, pc, key) {
    const rootSp = spell(chord.root, chord.key || key);
    const ivs = QUALITIES[chord.quality].intervals;
    const iv = ivs.find(i => mod(chord.root + i, 12) === pc);
    if (iv === undefined) return null;
    let step = STEP_OF_INTERVAL[iv];
    if (iv === 6 && chord.quality.includes('#11')) step = 3;
    if (iv === 8 && chord.quality === 'aug') step = 4;
    const letter = LETTERS[(LETTERS.indexOf(rootSp.letter) + step) % 7];
    let acc = pc - LETTER_PC[letter];
    acc = ((acc + 6) % 12 + 12) % 12 - 6; // -6..5
    if (Math.abs(acc) > 1) return null;
    return { letter, acc };
  }

  function spellMelodyNote(ev, prevPitch, nextPitch, key) {
    const k = ev.chord.key || key;
    const pc = mod(ev.pitch, 12);
    if (chordTones(ev.chord).includes(pc)) {
      const s = chordToneSpelling(ev.chord, pc, k);
      if (s) return s;
    }
    if (k.scale.includes(pc)) return spell(pc, k);
    if (chordScale(ev.chord, k).includes(pc)) {
      // Colour tone of the chord scale: spell around the chord root.
      const rootSp = spell(ev.chord.root, k);
      const centre = { centre: ({ F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 })[rootSp.letter] + 7 * rootSp.acc };
      return spell(pc, centre);
    }
    // Chromatic passing / approach: sharp when rising, flat when falling.
    let prefer = 0;
    if (nextPitch !== null && nextPitch !== undefined) prefer = nextPitch > ev.pitch ? 1 : nextPitch < ev.pitch ? -1 : 0;
    else if (prevPitch !== null && prevPitch !== undefined) prefer = ev.pitch > prevPitch ? 1 : -1;
    return spell(pc, k, prefer);
  }

  // ---- ABC rendering ----------------------------------------------------------------
  const onBeat = pos => Math.abs(pos - Math.round(pos)) < 1e-6 && Math.round(pos) % 4 === 0;

  function toAbc(tune) {
    const { title, chordsLevel, melodyLevel, meter, key, tempo, feelName, sections, form } = tune;
    const lines = [];
    lines.push('X:1');
    lines.push('T:' + title);
    lines.push('C:' + (chordsLevel === melodyLevel
      ? 'Level ' + chordsLevel + ' · ' + LEVELS[chordsLevel].name
      : 'Chords ' + chordsLevel + ' · Melody ' + melodyLevel));
    lines.push('M:' + meter);
    lines.push('L:1/16');
    lines.push('Q:"' + feelName + '" 1/4=' + tempo);
    lines.push('K:' + key.abc);
    const barsPerLine = meter === '2/4' ? 8 : 4;

    // Flatten events for prev/next lookups.
    const flat = [];
    sections.forEach(sec => sec.bars.forEach(bar => bar.events.forEach(e => flat.push(e))));
    const pitched = flat.filter(e => !e.rest);
    pitched.forEach((e, i) => { e._prev = i > 0 ? pitched[i - 1].pitch : null; e._next = i + 1 < pitched.length ? pitched[i + 1].pitch : null; });

    let firstLine = true;
    sections.forEach((sec, si) => {
      const secKey = sec.key;
      const keyChanged = secKey.name !== key.name;
      let line = '';
      const partLetter = form[si].name;
      lines.push('P:' + partLetter);
      if (keyChanged) lines.push('K:' + secKey.abc);
      sec.bars.forEach((bar, b) => {
        const inForce = {}; // letter+octave -> acc
        let barStr = '';
        bar.events.forEach((e, i) => {
          if (i > 0 && onBeat(e.pos) && e.triplet !== 'mid' && e.triplet !== 'end') barStr += ' ';
          if (e.chordStart) barStr += '"' + chordSymbol(e.chord, e.chord.key || secKey) + '"';
          if (e.triplet === 'start') barStr += '(3';
          const len = e.triplet ? 2 : e.dur;
          if (e.rest) { barStr += 'z' + len; return; }
          const sp = spellMelodyNote(e, e._prev, e._next, secKey);
          const ap = abcPitch(e.pitch, sp);
          const id = sp.letter + ap.octave;
          const current = id in inForce ? inForce[id] : keySigAcc(sp.letter, secKey);
          let accStr = '';
          if (current !== sp.acc) { accStr = sp.acc === 0 ? '=' : ap.acc; inForce[id] = sp.acc; }
          barStr += accStr + ap.name + len;
        });
        line += barStr;
        const lastBarOfTune = si === sections.length - 1 && b === sec.bars.length - 1;
        const lastBarOfSection = b === sec.bars.length - 1;
        line += lastBarOfTune ? ' |]' : lastBarOfSection ? ' ||' : ' |';
        if ((b + 1) % barsPerLine === 0 || lastBarOfSection) { lines.push(line); line = ''; }
        else line += ' ';
      });
      if (keyChanged && si < sections.length - 1 && sections[si + 1].key.name === key.name) lines.push('K:' + key.abc);
      firstLine = false;
    });
    return lines.join('\n');
  }

  // ---- Main ------------------------------------------------------------------------
  // opts: { chords: 1-10, melody: 1-10, seed, key?: 'Eb' | 'F#m' | null, meter?: '4/4' | '3/4' | null }
  // (also accepts the older generate(level, seed) form)
  function generate(opts, seedArg) {
    if (typeof opts === 'number') opts = { chords: opts, melody: opts, seed: seedArg };
    const clamp = v => Math.max(1, Math.min(10, (v | 0) || 1));
    const chordsLevel = clamp(opts.chords);
    const melodyLevel = clamp(opts.melody);
    const seed = opts.seed >>> 0;
    const rng = makeRng(seed);

    let key;
    if (opts.key) {
      key = makeKey(opts.key, /m$/.test(opts.key) ? 'minor' : 'major');
    } else {
      const [mode, name] = rng.pick(keyPool(chordsLevel));
      key = makeKey(name, mode);
    }
    const avgLevel = Math.round((chordsLevel + melodyLevel) / 2);
    const type = typeByName(opts.type) || pickType(rng, avgLevel);
    const meter = type.meter;
    const feelName = type.name;
    const barLen = meter === '3/4' ? 12 : meter === '2/4' ? 8 : 16;

    const form = makeForm(rng, chordsLevel, key);
    const harmony = Harmony.generate(rng, chordsLevel, form, meter);
    const sections = Melody.generate(rng, melodyLevel, harmony, form, barLen, key);
    const tempo = tempoFor(rng, avgLevel, type);
    const title = makeTitle(rng, meter, feelName, key.mode);
    const level = Math.max(chordsLevel, melodyLevel);
    const tune = { title, level, chordsLevel, melodyLevel, seed, meter, key, tempo, feelName, sections, form };
    tune.abc = toAbc(tune);
    return tune;
  }

  return { generate, LEVELS, TYPES, toAbc };
})();
