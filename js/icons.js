// icons.js — small line icons for the song-type picker, one per type.
// 48x48 viewBox, drawn with the current text colour; parts with class "a"
// are tinted with the accent colour by CSS.

const TypeIcons = (() => {
  const wrap = inner => '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  const I = {
    Random: '<path d="M6 16h8l5 6"/><path d="M6 32h8l14-16h10"/><path d="M26 32h12"/><path d="M34 12l4 4-4 4"/><path d="M34 28l4 4-4 4"/>',
    // ---- 4/4
    'Ballad': '<path class="a" d="M30 7a16 16 0 1 0 12 27A13 13 0 0 1 30 7z"/><path class="a" d="M13 11l1.6 3.2 3.4.5-2.5 2.4.6 3.5L13 19l-3.1 1.6.6-3.5L8 14.7l3.4-.5z"/>',
    'Medium': '<path class="a" d="M19 8h10l7 32H12z"/><path d="M24 34V17"/><path d="M24 23l9-10"/><circle class="a" cx="33" cy="12" r="2.5"/><path d="M12 40h24"/>',
    'Rock Ballad': '<rect class="a" x="17" y="24" width="14" height="16" rx="2"/><path d="M20 30h8M20 34h8"/><path class="a" d="M24 22c-6-5-4-10-1-13 1 3 4 4 4 7 2-1 3-3 3-5 4 3 3 8-2 11z"/>',
    'Blues': '<rect class="a" x="6" y="18" width="36" height="12" rx="3"/><path d="M12 22v4M18 22v4M24 22v4M30 22v4M36 22v4"/><path d="M9 18v-3h30v3M9 30v3h30v-3"/>',
    'Boogie-Woogie': '<rect class="a" x="8" y="12" width="32" height="24" rx="2"/><path d="M16 12v24M24 12v24M32 12v24"/><path d="M13 12v13h5V12M21 12v13h5V12M29 12v13h5V12" fill="currentColor" stroke="none"/><path d="M4 8l3 2M44 8l-3 2"/>',
    'Gospel': '<path class="a" d="M10 40V22l14-10 14 10v18z"/><path d="M24 4v8M20 8h8"/><rect class="a" x="20" y="30" width="8" height="10"/><path d="M4 40h40"/>',
    'Bossa Nova': '<path d="M22 40c0-11 2-19 6-25"/><path class="a" d="M28 15c-6-4-12-3-16 2 6-1 10 0 14 3z"/><path class="a" d="M28 15c2-6 8-9 14-7-5 2-8 5-10 9z"/><path class="a" d="M28 15c6-1 11 2 13 8-5-3-9-3-13-1z"/><path class="a" d="M28 15c-5 1-9 5-9 11 3-4 6-6 10-6z"/><path d="M8 40h32"/>',
    'Medium Swing': '<path class="a" d="M8 30c0-4 6-6 16-6s16 2 16 6-6 6-16 6S8 34 8 30z"/><path class="a" d="M14 28c0-8 3-14 10-14s10 6 10 14"/><path d="M14 24c4 2 16 2 20 0"/>',
    'Medium-Up Swing': '<g transform="translate(4 0)"><path class="a" d="M8 30c0-4 6-6 16-6s16 2 16 6-6 6-16 6S8 34 8 30z"/><path class="a" d="M14 28c0-8 3-14 10-14s10 6 10 14"/><path d="M14 24c4 2 16 2 20 0"/></g><path d="M2 18h6M1 24h5M2 30h6"/>',
    'Latin': '<ellipse class="a" cx="16" cy="16" rx="7" ry="8" transform="rotate(-20 16 16)"/><path d="M19 23l6 15"/><ellipse class="a" cx="32" cy="16" rx="7" ry="8" transform="rotate(20 32 16)"/><path d="M29 23l-6 15"/>',
    'Funk': '<path d="M4 18h40"/><path class="a" d="M8 18h14v6a7 7 0 0 1-14 0z"/><path class="a" d="M26 18h14v6a7 7 0 0 1-14 0z"/><path d="M22 21c1-1 3-1 4 0"/>',
    'Reggae': '<circle class="a" cx="24" cy="19" r="7"/><path d="M24 5v4M10 19h4M34 19h4M14 9l3 3M34 9l-3 3"/><path d="M6 34c4-3 8-3 12 0s8 3 12 0 8-3 12 0"/><path d="M6 41c4-3 8-3 12 0s8 3 12 0 8-3 12 0"/>',
    'Stride': '<rect class="a" x="14" y="8" width="20" height="22" rx="2"/><path class="a" d="M8 30h32v4H8z"/><path d="M14 22h20"/>',
    // ---- 3/4
    'Waltz': '<circle class="a" cx="24" cy="9" r="4"/><path d="M24 13v6"/><path class="a" d="M24 19L12 41h24z"/><path d="M24 19l-8-4M24 19l8-6"/>',
    'Slow Waltz': '<rect class="a" x="18" y="20" width="12" height="20" rx="2"/><path d="M24 20v-5"/><path class="a" d="M24 15c-3-3-3-6 0-9 3 3 3 6 0 9z"/><path d="M14 40h20"/>',
    'Jazz Waltz': '<path class="a" d="M8 8h32L24 26z"/><path d="M24 26v14M16 40h16"/><circle class="a" cx="30" cy="14" r="2.5"/><path d="M31 12l6-6"/>',
    'Minuet': '<path class="a" d="M24 4c-4 6-4 12 0 18 4-6 4-12 0-18z"/><path class="a" d="M22 22c-6-6-14-4-14 2 4 2 8 2 12 0z"/><path class="a" d="M26 22c6-6 14-4 14 2-4 2-8 2-12 0z"/><rect class="a" x="19" y="24" width="10" height="4" rx="1"/><path d="M24 28v12M20 40h8"/>',
    'Country Waltz': '<path class="a" d="M6 28c6 4 30 4 36 0-2 6-8 8-18 8S8 34 6 28z"/><path class="a" d="M16 28c-2-10 2-18 8-18s10 8 8 18"/><path d="M16 26c4 2 12 2 16 0"/>',
    // ---- 2/4
    'Samba': '<ellipse class="a" cx="24" cy="14" rx="14" ry="5"/><path class="a" d="M10 14v20c0 3 6 5 14 5s14-2 14-5V14"/><path d="M10 34c0-3 6-5 14-5s14 2 14 5"/><path d="M16 18v16M32 18v16"/>',
    'Ragtime': '<rect class="a" x="12" y="6" width="24" height="36" rx="2"/><path d="M18 12h4M26 12h6M16 18h6M28 18h4M20 24h8M16 30h4M26 30h6M18 36h6" stroke-width="3"/>',
    'Polka': '<rect class="a" x="6" y="12" width="10" height="24" rx="2"/><rect class="a" x="32" y="12" width="10" height="24" rx="2"/><path d="M16 14h16M16 20h16M16 26h16M16 32h16"/><path d="M9 18h4M9 24h4M9 30h4M37 18v12"/>',
    'March': '<path d="M12 42V6"/><path class="a" d="M12 8h26l-6 8 6 8H12z"/>',
    'Tango': '<path d="M24 26v16"/><path class="a" d="M24 34c-6 0-9-3-10-7 5 0 8 2 10 7z"/><path class="a" d="M24 34c6 0 9-3 10-7-5 0-8 2-10 7z"/><path class="a" d="M24 26c-7 0-10-5-9-11 4 1 6 3 7 6 1-4 3-7 6-9 4 4 4 9 1 13-2 1-3 1-5 1z"/>',
    'Habanera': '<path class="a" d="M24 40L8 16a20 20 0 0 1 32 0z"/><path d="M24 40L14 18M24 40l-2-24M24 40l2-24M24 40l10-22"/>',
    // ---- 6/8
    '6/8 Ballad': '<path d="M24 6v24"/><path class="a" d="M24 8c8 5 10 13 10 22H24z"/><path class="a" d="M22 14c-6 4-8 10-8 16h8z"/><path class="a" d="M8 34h32l-4 6H12z"/>',
    'Jig': '<circle class="a" cx="24" cy="14" r="7"/><circle class="a" cx="15" cy="26" r="7"/><circle class="a" cx="33" cy="26" r="7"/><path d="M24 24v18"/>',
    'Tarantella': '<circle class="a" cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="11"/><circle class="a" cx="24" cy="9" r="2"/><circle class="a" cx="37" cy="17" r="2"/><circle class="a" cx="37" cy="31" r="2"/><circle class="a" cx="24" cy="39" r="2"/><circle class="a" cx="11" cy="31" r="2"/><circle class="a" cx="11" cy="17" r="2"/>',
  };
  return { svg: name => wrap(I[name] || I.Random) };
})();
