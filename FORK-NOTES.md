# Fork notes: Quick Queue on Spotify 1.3.6 (2026-10-25)

Upstream: https://github.com/ohitstom/spicetify-extensions (main @ ec0013f; quickQueue last
changed in 2d76dc5). Branch here: `quickqueue-spotify-1.3.6`. Only `quickQueue/quickQueue.js`
is changed.

## Why it broke

Upstream issue #79: on Spotify 1.3.6.1921 the button never appears. Measured on that build with
Spicetify 2.46.3:

- The row lookup itself still works (with a css-map that keeps the `main-trackList-*` names), and
  the button's insertion point is found on every row.
- The track URI lookup fails: `getTracklistTrackUri` reads the `.main-trackList-trackListRow`
  element's own props, which in 1.3.x only hold handlers (`className`, `draggable`, `onClick`...).
  The URI is now `memoizedProps.uri` two fiber levels above the `[role="row"]` element (further up,
  also `value.item.uri` / `item.uri`). Checked against each row's track link: all match.
- Rows are added empty and filled in later, and virtualised rows are recycled for other tracks, so
  only looking at `addedNodes` that are rows misses most of them.

## What changed

- `getRowUri`: walk up the React fiber from the row (max 25 levels) and take the first
  `spotify:track|episode|local` URI from `uri`, `item.uri`, `value.item.uri` or `track.uri`.
- Rows are reprocessed on any mutation inside them, batched on a `setTimeout`. Not
  `requestAnimationFrame`: Chromium pauses it while the window is covered or minimised, which made
  an earlier version do nothing until Spotify was looked at.
- The button is rendered with `key: uri`, so a recycled row gets a fresh button for its new track.
- Same `.queueControl-wrapper` class as upstream; rows that already have an upstream wrapper are
  skipped, and the "Button on the left" menu item is only registered when the Marketplace copy
  isn't loaded (both use the same `quickQueue.placeLeftSide` setting).
- Startup check no longer needs `SVGIcons`, `Mousetrap` or `Locale._dictionary` (unused, or the
  code already has fallback strings).

## Verified (Spotify 1.3.6.1921, Spicetify 2.46.3, Windows)

Real mouse input over CDP: 54/54 rows with a button after scrolling down and back, 0 tied to the
wrong track, 0 duplicates; add then remove via click updates the queue and the button state.
Three cold launches and one launch with the window minimised: 28/28 rows each.
Not checked: "Button on the left" placement, album/artist/search pages, local files, older clients.

## Installing

Installed as a local Spicetify extension, `%APPDATA%\spicetify\Extensions\quickQueueFix.js`
(same file), via `spicetify config extensions quickQueueFix.js` + `spicetify apply`. Undo with
`spicetify config extensions quickQueueFix.js-` + `spicetify apply`.
