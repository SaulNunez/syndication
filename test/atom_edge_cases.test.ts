import { expect } from "chai";
import { parseFeed } from "../src/index.js";
import { AtomFeed } from "../src/types.js";

/** Atom 1.0 feed; `body` is spliced in verbatim, `rootAttrs` extends the <feed> element. */
const feed = (body: string, rootAttrs = "") => `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" ${rootAttrs}>
  <title>Edge Case Feed</title>
  <id>tag:example.com,2024:feed</id>
  ${body}
</feed>`;

const entry = (body: string, attrs = "") =>
    `<entry ${attrs}><id>tag:example.com,2024:1</id><title>An entry</title>${body}</entry>`;

describe("Atom link selection", () => {
    it("prefers the rel=alternate link over rel=self", () => {
        const atom = parseFeed(feed(`
            <link rel="self" type="application/atom+xml" href="https://example.com/feed.atom"/>
            <link rel="alternate" type="text/html" href="https://example.com/"/>
        `)) as AtomFeed;
        expect(atom.link).to.equal("https://example.com/");
    });

    it("uses a link that carries no rel at all", () => {
        const atom = parseFeed(feed('<link href="https://example.com/"/>')) as AtomFeed;
        expect(atom.link).to.equal("https://example.com/");
    });

    // getLinkHref ignores rel entirely when <link> is not repeated, so a feed whose
    // only link is rel=self reports that self URL as its alternate link.
    it("falls back to a lone rel=self link", () => {
        const atom = parseFeed(feed('<link rel="self" href="https://example.com/feed.atom"/>')) as AtomFeed;
        expect(atom.link).to.equal("https://example.com/feed.atom");
    });

    it("leaves link undefined when the feed has none", () => {
        expect((parseFeed(feed("")) as AtomFeed).link).to.equal(undefined);
    });
});

describe("Atom xml:base resolution", () => {
    it("resolves a relative entry link against the feed's xml:base", () => {
        const atom = parseFeed(feed(
            entry('<link rel="alternate" href="3"/>'),
            'xml:base="https://example.com/posts/"'
        )) as AtomFeed;
        expect(atom.items[0].link).to.equal("https://example.com/posts/3");
    });

    it("lets an entry-level xml:base override the feed-level one", () => {
        const atom = parseFeed(feed(
            entry('<link rel="alternate" href="3"/>', 'xml:base="https://sub.example.com/archive/"'),
            'xml:base="https://example.com/posts/"'
        )) as AtomFeed;
        expect(atom.items[0].link).to.equal("https://sub.example.com/archive/3");
    });

    it("leaves an absolute link untouched", () => {
        const atom = parseFeed(feed(
            entry('<link rel="alternate" href="https://other.example.org/x"/>'),
            'xml:base="https://example.com/posts/"'
        )) as AtomFeed;
        expect(atom.items[0].link).to.equal("https://other.example.org/x");
    });
});

describe("Atom text constructs", () => {
    it("collapses whitespace runs in titles and summaries", () => {
        const atom = parseFeed(feed(entry(`
            <summary>A summary
                spread over
                several lines</summary>
        `))) as AtomFeed;
        expect(atom.items[0].summary).to.equal("A summary spread over several lines");
    });

    // getTypeContent returns "" for an absent element, so these are never undefined
    // even though the declared types mark them optional.
    it("yields an empty string, not undefined, for an absent subtitle", () => {
        const atom = parseFeed(feed("")) as AtomFeed;
        expect(atom.subtitle).to.equal("");
        expect(atom.description).to.equal("");
    });

    it("mirrors subtitle into description for BaseChannel compatibility", () => {
        const atom = parseFeed(feed("<subtitle>Tagline here</subtitle>")) as AtomFeed;
        expect(atom.subtitle).to.equal("Tagline here");
        expect(atom.description).to.equal("Tagline here");
    });
});

describe("Atom content extraction", () => {
    it("re-serializes inline XHTML content back to markup", () => {
        const atom = parseFeed(feed(entry(`
            <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p><i>there</i></p></div></content>
        `))) as AtomFeed;
        expect(atom.items[0].content?.type).to.equal("xhtml");
        expect(atom.items[0].content?.value).to.equal(
            '<div xmlns="http://www.w3.org/1999/xhtml"><p><i>there</i></p></div>'
        );
    });

    it("preserves the order of distinct sibling elements", () => {
        const atom = parseFeed(feed(entry(
            '<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>A</p><span>B</span></div></content>'
        ))) as AtomFeed;
        expect(atom.items[0].content?.value).to.equal(
            '<div xmlns="http://www.w3.org/1999/xhtml"><p>A</p><span>B</span></div>'
        );
    });

    it("keeps type=text content verbatim, without whitespace collapsing", () => {
        const atom = parseFeed(feed(entry('<content type="text">plain   text</content>'))) as AtomFeed;
        expect(atom.items[0].content).to.deep.equal({ type: "text", value: "plain   text" });
    });

    it("leaves content undefined when the element is absent", () => {
        expect((parseFeed(feed(entry(""))) as AtomFeed).items[0].content).to.equal(undefined);
    });

    it("decodes numeric and predefined entities in type=html content", () => {
        const atom = parseFeed(feed(entry(
            '<content type="html">&lt;p&gt;caf&#233; &amp;amp; more&lt;/p&gt;</content>'
        ))) as AtomFeed;
        expect(atom.items[0].content?.value).to.equal("<p>café & more</p>");
    });

    // decodeHtmlEntities only knows the five predefined names, so anything else
    // (&nbsp;, &mdash;, ...) survives the pass unchanged.
    it("leaves non-predefined named entities such as &nbsp; undecoded", () => {
        const atom = parseFeed(feed(entry(
            '<content type="html">a&amp;nbsp;b</content>'
        ))) as AtomFeed;
        expect(atom.items[0].content?.value).to.equal("a&nbsp;b");
    });
});

describe("Atom people", () => {
    it("reads name, email and uri from an entry author", () => {
        const atom = parseFeed(feed(entry(
            "<author><name>Mark</name><email>mark@example.com</email><uri>https://example.com/mark</uri></author>"
        ))) as AtomFeed;
        expect(atom.items[0].author).to.deep.equal({
            name: "Mark", email: "mark@example.com", uri: "https://example.com/mark"
        });
    });

    it("accepts the Atom 0.3 <url> spelling of the author uri", () => {
        const atom = parseFeed(feed(entry(
            "<author><name>Mark</name><url>https://example.com/mark</url></author>"
        ))) as AtomFeed;
        expect(atom.items[0].author.uri).to.equal("https://example.com/mark");
    });

    it("falls back to an empty-named author when the entry has none", () => {
        expect((parseFeed(feed(entry(""))) as AtomFeed).items[0].author).to.deep.equal({ name: "" });
    });

    it("wraps a lone contributor into an array", () => {
        const atom = parseFeed(feed(entry("<contributor><name>Sam</name></contributor>"))) as AtomFeed;
        expect(atom.items[0].contributors).to.have.lengthOf(1);
        expect(atom.items[0].contributors?.[0].name).to.equal("Sam");
    });
});

describe("Atom 0.3 element fallbacks", () => {
    const v03 = `<?xml version="1.0"?>
    <feed version="0.3" xmlns="http://purl.org/atom/ns#">
      <title>Old Feed</title>
      <id>tag:example.com,2004:feed</id>
      <tagline>Legacy subtitle</tagline>
      <copyright>Copyright 2004</copyright>
      <modified>2004-04-20T11:56:34Z</modified>
      <entry>
        <id>tag:example.com,2004:1</id>
        <title>Old entry</title>
        <issued>2004-04-20T00:23:47Z</issued>
        <modified>2004-04-20T11:56:34Z</modified>
      </entry>
    </feed>`;

    it("maps tagline, copyright and modified onto their 1.0 names", () => {
        const atom = parseFeed(v03) as AtomFeed;
        expect(atom.subtitle).to.equal("Legacy subtitle");
        expect(atom.rights).to.equal("Copyright 2004");
        expect(atom.updated).to.equal("2004-04-20T11:56:34Z");
    });

    it("maps entry issued/modified onto published/updated", () => {
        const item = (parseFeed(v03) as AtomFeed).items[0];
        expect(item.published).to.equal("2004-04-20T00:23:47Z");
        expect(item.updated).to.equal("2004-04-20T11:56:34Z");
    });

    it("prefers <created> only when issued is absent", () => {
        const atom = parseFeed(feed(entry("<created>2004-04-19T07:45:00Z</created>"))) as AtomFeed;
        expect(atom.items[0].published).to.equal("2004-04-19T07:45:00Z");
    });
});

describe("Atom feed-level scalars", () => {
    it("reads logo and icon", () => {
        const atom = parseFeed(feed(
            "<logo>https://example.com/l.png</logo><icon>https://example.com/i.png</icon>"
        )) as AtomFeed;
        expect(atom.logo).to.equal("https://example.com/l.png");
        expect(atom.icon).to.equal("https://example.com/i.png");
    });

    it("returns an empty items array for a feed with no entries", () => {
        expect((parseFeed(feed("")) as AtomFeed).items).to.deep.equal([]);
    });
});

describe("Atom edge cases — known gaps (skipped)", () => {
    // getContentValue rebuilds markup from the parser's object form, which keeps
    // neither the position of text among sibling elements nor the whitespace
    // around it: "<p>Hi <i>there</i></p>" comes back as "<p><i>there</i>Hi</p>".
    it.skip("keeps text in place alongside inline elements in XHTML content", () => {
        const atom = parseFeed(feed(entry(
            '<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Hi <i>there</i></p></div></content>'
        ))) as AtomFeed;
        expect(atom.items[0].content?.value).to.equal(
            '<div xmlns="http://www.w3.org/1999/xhtml"><p>Hi <i>there</i></p></div>'
        );
    });

    // Same root cause: repeated tag names are grouped together on the object, so
    // "<p>A</p><span>B</span><p>C</p>" re-serializes with both <p>s adjacent.
    it.skip("keeps document order when sibling element names repeat", () => {
        const atom = parseFeed(feed(entry(
            '<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>A</p><span>B</span><p>C</p></div></content>'
        ))) as AtomFeed;
        expect(atom.items[0].content?.value).to.equal(
            '<div xmlns="http://www.w3.org/1999/xhtml"><p>A</p><span>B</span><p>C</p></div>'
        );
    });

    // getAtomAuthor receives the array unchanged and reads .name/.email/.uri off
    // it, so every field comes back undefined.
    it.skip("takes the first of several entry authors", () => {
        const atom = parseFeed(feed(entry(
            "<author><name>A</name></author><author><name>B</name></author>"
        ))) as AtomFeed;
        expect(atom.items[0].author.name).to.equal("A");
    });

    // RFC 4287 section 4.2.1: an entry without an author inherits the feed's.
    it.skip("inherits the feed-level author when an entry has none", () => {
        const atom = parseFeed(feed(
            "<author><name>Feed Author</name></author>" + entry("")
        )) as AtomFeed;
        expect(atom.items[0].author.name).to.equal("Feed Author");
    });

    // getTypeContent only reads #text, so a type="xhtml" text construct -- whose
    // payload is a child <div> -- collapses to "". Compare <content>, which goes
    // through getContentValue and survives.
    it.skip("extracts a type=xhtml title instead of yielding an empty string", () => {
        const atom = parseFeed(feed(
            '<title type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">Hello <b>World</b></div></title>'
        )) as AtomFeed;
        expect(atom.title).to.contain("Hello");
    });

    // AtomCategory is exported and AtomSource declares `category`, but parseAtom
    // never maps it -- and since <category> carries no prefix it is not in `extra`
    // either, so the data is dropped outright.
    it.skip("maps feed and entry <category> elements", () => {
        const atom = parseFeed(feed(
            '<category term="tech" scheme="https://example.com/s" label="Tech"/>' +
            entry('<category term="news"/>')
        )) as AtomFeed;
        expect(atom.category).to.deep.equal({
            term: "tech", scheme: "https://example.com/s", label: "Tech"
        });
        expect((atom.items[0] as any).category).to.have.property("term", "news");
    });

    // AtomEntry declares `source`, but mapAtomEntry never populates it.
    it.skip("maps an entry's <source> element", () => {
        const atom = parseFeed(feed(entry(
            "<source><id>tag:example.com,2024:src</id><title>Source Feed</title></source>"
        ))) as AtomFeed;
        expect(atom.items[0].source).to.have.property("title", "Source Feed");
    });
});
