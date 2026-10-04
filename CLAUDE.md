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

Two rules keep the bag contained:

- `skipKeys` (the second argument) names direct children to leave out: the channel passes `["item"]` and the feed `["entry"]`, so an item's namespaces stay on the item instead of also being attributed to its channel. It applies at the root only.
- A descendant under the *same* prefix as its nearest namespaced ancestor is not collected again, because `processNode` already captured that whole subtree. This is what keeps `<itunes:owner>`'s children inside `extra.itunes.owner` instead of also surfacing as `extra.itunes.name`.

A descendant under a *different* prefix is still collected at the top level, and deliberately so: that is how `<mi:focalRegion>` nested inside `<media:content>` stays reachable as `extra.mi.focalRegion` without walking the tree. The `microsoft_start_slideshow` corpus depends on it.

The iTunes namespace is the one exception — it is lifted out of `extra` into a typed `itunes` object by `processChannelItunes` / `processItemItunes`, with normalizers that coerce the loose on-the-wire forms: `parseItunesDuration` (`HH:MM:SS`, `MM:SS`, or plain seconds → seconds), `parseItunesExplicit` (`yes`/`no`/`true`/`false` → boolean), `parseItunesCategories` (flattens nested `itunes:category` into a flat string array). Both helpers strip `undefined` keys and return `undefined` when nothing matched, so `itunes` is absent rather than empty. Additional namespaces that deserve first-class typing should follow this shape.

### Atom-specific handling

- **Version tolerance**: 0.3 element names are accepted as fallbacks for their 1.0 equivalents — `modified`→`updated`, `issued`/`created`→`published`, `tagline`→`subtitle`, `copyright`→`rights`.
- **`xml:base` resolution**: the feed-level `@_xml:base`, overridden by an entry-level one, is applied to link hrefs via `resolveUrl`, which falls back to the raw URL if `new URL()` throws.
- **Stop nodes**: `<content>` and Atom's text constructs are registered in the parser's `stopNodes`, so `fast-xml-parser` hands their inner XML back verbatim. That is what preserves sibling order and the position of text among inline elements — rebuilding markup from the parsed object form loses both, since the object groups repeated tag names together and moves loose text to the end. The text-construct paths are listed individually in `ATOM_TEXT_CONSTRUCT_PATHS` and spelled out from the root (`feed.title`, `feed.entry.summary`, …) rather than as a `*.title` wildcard, which would also catch RSS's own `<title>`. RSS therefore keeps the parser's built-in entity decoding and CDATA unwrapping; do not widen these patterns to bare wildcards.
- **Entity decoding**: stop nodes skip the parser's own decoding, trimming and CDATA unwrapping, so the readers put that back. `getContentValue` (for `<content>`) and `getTextConstruct` (for titles, subtitles, summaries and rights) both trim, strip a wrapping CDATA section, and — for escaped types, meaning anything that is not `xhtml` or a `*xml*` MIME type — run the value through `decodeHtmlEntities` to stand in for the XML-level decode. `type="html"` **content** is then passed through `decodeHtmlEntities` a second time by its caller. That double pass applies to `<content>` only and is long-standing behavior pinned by the `atom_reddit` corpus (it is what turns `&amp;#39;` into `'`); collapsing it to a single decode is a deliberate, breaking change, not a cleanup. Text constructs are decoded exactly once.
- **Text constructs**: `getTextConstruct` reads the stop-node value: it takes the first of a repeated element, returns `""` for an empty or attribute-only element, keeps markup verbatim for `type="xhtml"`, and collapses whitespace runs to single spaces. `getTypeContent` survives only for `<generator>`, which is not a stop node and is never XHTML.
- **Repeated people and categories**: `<author>`, `<contributor>` and `<category>` may each appear several times. The plural fields (`authors`, `contributors`, `categories`) carry all of them in document order; the singular `author`, `contributor` and `category` are the first element, kept so existing callers keep working. All of them are left off entirely when the element is absent, and a `<category>` with no `term` is skipped. An entry with no author of its own inherits the feed's whole list, not just its first author.

### `getAuthorInfo`

Exported and tested directly (`test/utilities.test.ts`). Parses the RSS `email (Name)` convention into `{ name, email }`, returning the original string unchanged when there is no ` (` separator.

## Tests

Mocha + Chai `expect`. Each file embeds its feed fixture as an inline template literal (the JSON Feed test is the exception: it imports `test/example_json_feed.json` with an import attribute). Files are named after the format and scenario — `atom_1_0_basic`, `itunes_rss_basic`, `atom_namespaces`, plus real-world regression corpora (`atom_reddit`, `microsoft_start_slideshow`) and per-area edge-case suites (`rss_edge_cases`, `atom_edge_cases`, `itunes_normalizers`, `json_feed_versions`, `feed_detection`). Prefer adding a new fixture file per feed quirk over extending an existing one.

The edge-case suites build fixtures from a small `feed(...)` helper that already supplies a title, link and description; splice in only the elements under test, and write a standalone fixture when the test needs to replace one of those defaults (a second `<title>` makes the parser return an array, not an override).

Tests import from `../src/index.js` (the `.js` extension on a `.ts` path is required by the ESM/`moduleResolution: node` setup), and `src/index.ts` likewise imports `./types.js`. Keep the `.js` extension on relative imports in new code.
