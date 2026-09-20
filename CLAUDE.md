# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`@saulnunez/syndication` — a TypeScript library that parses RSS 2.0, Atom (0.3/1.0/1.1) and JSON Feed (1.0/1.1) documents into plain JavaScript objects. Published to GitHub Packages (see `.npmrc`); ESM-first (`"type": "module"`) with CJS output emitted alongside.

## Commands

```bash
npm ci                 # install (CI uses this; there is no node_modules by default)
npm test               # mocha over test/**/*.test.ts via tsx
npm run build          # tsup -> dist/ (esm + cjs + .d.ts); also runs on `prepare`

# single test file
npx tsx node_modules/mocha/bin/mocha.js 'test/rss_2_0_basic.test.ts'
# single test by name
npx tsx node_modules/mocha/bin/mocha.js 'test/**/*.test.ts' --grep "enclosure"
```

Tests run through `tsx` rather than `ts-mocha`/`ts-node`, so TypeScript is stripped, not type-checked, at test time. Run `npm run build` (tsup emits declarations) to actually surface type errors. There is no linter or formatter configured.

CI (`.github/workflows/test.yml`) runs `npm test` on Node 18/20/22 for pushes and PRs against `main`/`master`. Publishing (`publish.yml`) happens on GitHub release creation.

## Architecture

Two source files, one public entry point:

- `src/index.ts` — all parsing logic. The only exported functions are `parseFeed` and `getAuthorInfo`.
- `src/types.ts` — the public shape of every parsed result.

### Dispatch in `parseFeed`

`parseFeed(input: string)` takes a raw string and sniffs the format in order:

1. Try `JSON.parse`; if the result has a `version` containing `https://jsonfeed.org/version/`, it's a JSON Feed → `parseJSONFeed`.
2. Otherwise parse as XML with `fast-xml-parser` (`ignoreAttributes: false`, attribute prefix `@_`, text node key `#text`).
3. `parsed.feed` → `parseAtom`; `parsed.rss.channel` → inline RSS mapping.
4. Anything else throws `Error("Failed to parse feed: input is not a recognized RSS or Atom feed")`. Malformed XML throws `"...input is not valid XML (...)"`. Both messages are asserted by `test/invalid_feed.test.ts` — changing them breaks tests and is a breaking API change.

The return type is the union `RSSChannel | AtomFeed | JSONFeed`. Callers discriminate on the `feedType` literal (`"rss" | "atom" | "json"`), which every parser sets. Keep `feedType` correct on any new format.

### Cross-format compatibility fields

`RSSChannel`, `AtomFeed` and `JSONFeed` all extend a private `BaseChannel` (`title`, `link`, `description`), and items extend `BaseItem` (`title`, `link`). Non-RSS parsers deliberately duplicate data into those slots so the base shape is always populated:

- Atom: `subtitle` is copied into `description`; the `alternate` (or first) `<link href>` becomes `link`.
- JSON Feed: `home_page_url` → `link`; item `url` → `link`.

When adding fields, preserve these mappings — code elsewhere relies on the base shape being filled regardless of feed type.

### Namespaces and the `extra` bag

`processNamespaces` walks a raw parsed node recursively and collects every key containing a `:` into `extra`, keyed by namespace prefix then local name (`rss.extra.atom.title`, `item.extra.media.thumbnail`). Attributes are flattened with the `@_` prefix stripped; a node with both attributes and children becomes `{ ...attributes, children }`; a node with attributes and text becomes `{ ...attributes, text }`; repeated keys collapse into an array (so a lone element is an object where a repeated one is an array — consumers must handle both). It is keyed on the literal prefix used in the document, not the resolved namespace URI, so a feed declaring `xmlns:foo="...atom..."` surfaces under `extra.foo`.

The second argument, `skipKeys`, names direct children to leave out: the channel passes `["item"]` and the feed `["entry"]`, so an item's namespaces stay on the item instead of also being attributed to its channel. The exclusion applies at the root only — nested namespaced elements are still collected from anywhere below, which is why a nested `<itunes:owner>`'s children also appear hoisted at the top of `extra.itunes`.

The iTunes namespace is the one exception — it is lifted out of `extra` into a typed `itunes` object by `processChannelItunes` / `processItemItunes`, with normalizers that coerce the loose on-the-wire forms: `parseItunesDuration` (`HH:MM:SS`, `MM:SS`, or plain seconds → seconds), `parseItunesExplicit` (`yes`/`no`/`true`/`false` → boolean), `parseItunesCategories` (flattens nested `itunes:category` into a flat string array). Both helpers strip `undefined` keys and return `undefined` when nothing matched, so `itunes` is absent rather than empty. Additional namespaces that deserve first-class typing should follow this shape.

### Atom-specific handling

- **Version tolerance**: 0.3 element names are accepted as fallbacks for their 1.0 equivalents — `modified`→`updated`, `issued`/`created`→`published`, `tagline`→`subtitle`, `copyright`→`rights`.
- **`xml:base` resolution**: the feed-level `@_xml:base`, overridden by an entry-level one, is applied to link hrefs via `resolveUrl`, which falls back to the raw URL if `new URL()` throws.
- **Content extraction**: `<content>` is registered in the parser's `stopNodes`, so `fast-xml-parser` hands its inner XML back verbatim. That is what preserves sibling order and the position of text among inline elements — rebuilding markup from the parsed object form loses both, since the object groups repeated tag names together and moves loose text to the end. The consequence is that XHTML content keeps the source's internal whitespace; only the indentation around the element is trimmed.
- **Entity decoding**: stop nodes skip the parser's own decoding and trimming, so `getContentValue` trims and — for escaped types, meaning anything that is not `xhtml` or a `*xml*` MIME type — runs the value through `decodeHtmlEntities` to stand in for the XML-level decode. `type="html"` is then passed through `decodeHtmlEntities` a second time by the caller. That double pass is long-standing behavior pinned by the `atom_reddit` corpus (it is what turns `&amp;#39;` into `'`); collapsing it to a single decode is a deliberate, breaking change, not a cleanup.
- **Text constructs**: `getTypeContent` takes the first of a repeated element, prefers `#text`, and falls back to serializing child elements through the module-level `XMLBuilder` so a `type="xhtml"` title or summary is not dropped. It then collapses whitespace runs to single spaces and trims. Titles are not stop nodes, so mixed content inside an XHTML *title* is still reordered by that fallback; only `<content>` is order-preserving.

### `getAuthorInfo`

Exported and tested directly (`test/utilities.test.ts`). Parses the RSS `email (Name)` convention into `{ name, email }`, returning the original string unchanged when there is no ` (` separator.

## Tests

Mocha + Chai `expect`. Each file embeds its feed fixture as an inline template literal (the JSON Feed test is the exception: it imports `test/example_json_feed.json` with an import attribute). Files are named after the format and scenario — `atom_1_0_basic`, `itunes_rss_basic`, `atom_namespaces`, plus real-world regression corpora (`atom_reddit`, `microsoft_start_slideshow`) and per-area edge-case suites (`rss_edge_cases`, `atom_edge_cases`, `itunes_normalizers`, `json_feed_versions`, `feed_detection`). Prefer adding a new fixture file per feed quirk over extending an existing one.

The edge-case suites build fixtures from a small `feed(...)` helper that already supplies a title, link and description; splice in only the elements under test, and write a standalone fixture when the test needs to replace one of those defaults (a second `<title>` makes the parser return an array, not an override).

Tests import from `../src/index.js` (the `.js` extension on a `.ts` path is required by the ESM/`moduleResolution: node` setup), and `src/index.ts` likewise imports `./types.js`. Keep the `.js` extension on relative imports in new code.
