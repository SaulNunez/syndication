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

describe("Atom author selection and inheritance", () => {
    // Atom permits several <author> elements; the declared type holds one.
    it("takes the first of several entry authors", () => {
        const atom = parseFeed(feed(entry(
            "<author><name>A</name></author><author><name>B</name></author>"
        ))) as AtomFeed;
        expect(atom.items[0].author.name).to.equal("A");
    });

    it("takes the first of several feed authors", () => {
        const atom = parseFeed(feed(
            "<author><name>A</name></author><author><name>B</name></author>"
        )) as AtomFeed;
        expect(atom.author?.name).to.equal("A");
    });

    // RFC 4287 section 4.2.1.
    it("inherits the feed-level author when an entry has none", () => {
        const atom = parseFeed(feed(
            "<author><name>Feed Author</name></author>" + entry("")
        )) as AtomFeed;
        expect(atom.items[0].author.name).to.equal("Feed Author");
    });

    it("prefers an entry's own author over the feed's", () => {
        const atom = parseFeed(feed(
            "<author><name>Feed Author</name></author>" +
            entry("<author><name>Entry Author</name></author>")
        )) as AtomFeed;
        expect(atom.items[0].author.name).to.equal("Entry Author");
    });

    it("still falls back to an empty-named author when neither level has one", () => {
        expect((parseFeed(feed(entry(""))) as AtomFeed).items[0].author).to.deep.equal({ name: "" });
    });
});

describe("Atom xhtml text constructs", () => {
    // A type="xhtml" construct holds child elements rather than text, so the
    // serialized children stand in for the (absent) text node.
    it("extracts a type=xhtml title", () => {
        const xhtmlTitle = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
            <title type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">Hello <b>World</b></div></title>
            <id>tag:example.com,2024:feed</id></feed>`;
        const atom = parseFeed(xhtmlTitle) as AtomFeed;
        expect(atom.title).to.contain("Hello");
        expect(atom.title).to.contain("World");
    });

    it("extracts a type=xhtml summary", () => {
        const atom = parseFeed(feed(entry(
            '<summary type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Summarised</p></div></summary>'
        ))) as AtomFeed;
        expect(atom.items[0].summary).to.contain("Summarised");
    });

    // Text constructs are parsed as stop nodes, so an XHTML payload keeps its
    // markup exactly as authored instead of being rebuilt from a parsed object.
    it("keeps text in place alongside inline elements in a title", () => {
        const mixed = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
            <title type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">Hello <b>World</b>!</div></title>
            <id>tag:example.com,2024:feed</id></feed>`;
        expect((parseFeed(mixed) as AtomFeed).title).to.equal(
            '<div xmlns="http://www.w3.org/1999/xhtml">Hello <b>World</b>!</div>'
        );
    });

    it("keeps document order in a title when sibling element names repeat", () => {
        const repeated = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
            <title type="xhtml"><div><p>A</p><span>B</span><p>C</p></div></title>
            <id>tag:example.com,2024:feed</id></feed>`;
        expect((parseFeed(repeated) as AtomFeed).title).to.equal("<div><p>A</p><span>B</span><p>C</p></div>");
    });

    it("keeps an xhtml summary's markup in order", () => {
        const atom = parseFeed(feed(entry(
            '<summary type="xhtml"><div>Sum <i>mary</i> here</div></summary>'
        ))) as AtomFeed;
        expect(atom.items[0].summary).to.equal("<div>Sum <i>mary</i> here</div>");
    });

    // Stop nodes skip the parser's own entity decoding and CDATA unwrapping, so
    // escaped text constructs have to be put back together by hand.
    it("decodes entities in an escaped title", () => {
        const entities = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
            <title>Bug &amp; fix caf&#233;</title><id>tag:example.com,2024:feed</id></feed>`;
        expect((parseFeed(entities) as AtomFeed).title).to.equal("Bug & fix café");
    });

    it("unwraps CDATA in a title", () => {
        const cdata = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
            <title><![CDATA[Raw & <b>markup</b>]]></title><id>tag:example.com,2024:feed</id></feed>`;
        expect((parseFeed(cdata) as AtomFeed).title).to.equal("Raw & <b>markup</b>");
    });

    it("decodes a type=html title exactly once", () => {
        const html = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
            <title type="html">&lt;b&gt;bold&lt;/b&gt; &amp;amp; more</title>
            <id>tag:example.com,2024:feed</id></feed>`;
        expect((parseFeed(html) as AtomFeed).title).to.equal("<b>bold</b> &amp; more");
    });

    it("still collapses whitespace in a multi-line title", () => {
        const multiline = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
            <title>
                Spread   over
                lines
            </title><id>tag:example.com,2024:feed</id></feed>`;
        expect((parseFeed(multiline) as AtomFeed).title).to.equal("Spread over lines");
    });

    // RSS has its own <title>, which the Atom-scoped stop nodes must not touch.
    it("leaves RSS titles and descriptions to the parser's own decoding", () => {
        const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
            <title>Bug &amp; fix</title><link>https://example.com/</link>
            <description><![CDATA[<p>desc</p>]]></description>
            <item><title>Item &amp; co</title><link>https://example.com/1</link>
            <description>d</description></item></channel></rss>`;
        const channel = parseFeed(rss) as any;
        expect(channel.title).to.equal("Bug & fix");
        expect(channel.description).to.equal("<p>desc</p>");
        expect(channel.items[0].title).to.equal("Item & co");
    });

    it("leaves a plain text title untouched", () => {
        const plain = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
            <title type="text">Just text</title><id>tag:example.com,2024:feed</id></feed>`;
        expect((parseFeed(plain) as AtomFeed).title).to.equal("Just text");
    });

    it("takes the first of a repeated title rather than serializing the array", () => {
        const repeated = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
            <title>First</title><title>Second</title><id>tag:example.com,2024:feed</id></feed>`;
        expect((parseFeed(repeated) as AtomFeed).title).to.equal("First");
    });
});

describe("Atom categories and source", () => {
    it("maps a feed <category> with all three attributes", () => {
        const atom = parseFeed(feed(
            '<category term="tech" scheme="https://example.com/s" label="Tech"/>'
        )) as AtomFeed;
        expect(atom.category).to.deep.equal({
            term: "tech", scheme: "https://example.com/s", label: "Tech"
        });
    });

    it("maps an entry <category> with only a term", () => {
        const atom = parseFeed(feed(entry('<category term="news"/>'))) as AtomFeed;
        expect(atom.items[0].category).to.deep.equal({ term: "news" });
    });

    // The declared type holds one category, so a repeated element gets the first.
    it("takes the first of several categories", () => {
        const atom = parseFeed(feed(
            '<category term="one"/><category term="two"/>'
        )) as AtomFeed;
        expect(atom.category?.term).to.equal("one");
    });

    it("leaves category undefined when the element is absent", () => {
        expect((parseFeed(feed(entry(""))) as AtomFeed).category).to.equal(undefined);
    });

    it("maps an entry's <source> element", () => {
        const atom = parseFeed(feed(entry(
            "<source><id>tag:example.com,2024:src</id><title>Source Feed</title>" +
            '<link rel="alternate" href="https://source.example.org/"/>' +
            "<updated>2024-01-01T00:00:00Z</updated></source>"
        ))) as AtomFeed;
        const source = atom.items[0].source;
        expect(source).to.have.property("feedType", "atom");
        expect(source).to.have.property("title", "Source Feed");
        expect(source).to.have.property("id", "tag:example.com,2024:src");
        expect(source).to.have.property("link", "https://source.example.org/");
        expect(source).to.have.property("updated", "2024-01-01T00:00:00Z");
    });

    it("leaves source undefined when the element is absent", () => {
        expect((parseFeed(feed(entry(""))) as AtomFeed).items[0].source).to.equal(undefined);
    });
});

describe("Atom content ordering", () => {
    // <content> is parsed as a stop node, so its inner XML survives verbatim
    // rather than being rebuilt from an object that has lost document order.
    it("keeps text in place alongside inline elements", () => {
        const atom = parseFeed(feed(entry(
            '<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Hi <i>there</i></p></div></content>'
        ))) as AtomFeed;
        expect(atom.items[0].content?.value).to.equal(
            '<div xmlns="http://www.w3.org/1999/xhtml"><p>Hi <i>there</i></p></div>'
        );
    });

    it("keeps document order when sibling element names repeat", () => {
        const atom = parseFeed(feed(entry(
            '<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>A</p><span>B</span><p>C</p></div></content>'
        ))) as AtomFeed;
        expect(atom.items[0].content?.value).to.equal(
            '<div xmlns="http://www.w3.org/1999/xhtml"><p>A</p><span>B</span><p>C</p></div>'
        );
    });

    it("still collects media:group on an entry whose content is a stop node", () => {
        const atom = parseFeed(feed(entry(
            '<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Hi <i>there</i></p></div></content>' +
            '<media:group><media:content url="https://example.com/a.mp4"/></media:group>'
        ), 'xmlns:media="http://search.yahoo.com/mrss/"')) as AtomFeed;
        expect(atom.items[0].content?.value).to.equal(
            '<div xmlns="http://www.w3.org/1999/xhtml"><p>Hi <i>there</i></p></div>'
        );
        expect(atom.items[0].media?.contents).to.deep.equal([{ url: "https://example.com/a.mp4" }]);
    });

    it("preserves whitespace inside the content markup", () => {
        const atom = parseFeed(feed(entry(
            '<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><pre>a  b</pre></div></content>'
        ))) as AtomFeed;
        expect(atom.items[0].content?.value).to.contain("a  b");
    });
});

describe("Atom repeated people and categories", () => {
    const manyPeople = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
        <title>T</title><id>tag:example.com,2024:feed</id>
        <author><name>A</name><email>a@example.com</email></author><author><name>B</name></author>
        <contributor><name>C1</name></contributor><contributor><name>C2</name></contributor>
        <category term="one" scheme="https://example.com/s" label="One"/>
        <category term="two"/>
        <entry><id>tag:example.com,2024:1</id><title>E</title>
            <author><name>EA</name></author><author><name>EB</name></author>
            <category term="ec1"/><category term="ec2"/>
        </entry></feed>`;

    it("exposes every feed author, keeping `author` as the first", () => {
        const atom = parseFeed(manyPeople) as AtomFeed;
        expect(atom.authors).to.deep.equal([{ name: "A", email: "a@example.com" }, { name: "B" }]);
        expect(atom.author).to.deep.equal({ name: "A", email: "a@example.com" });
    });

    it("exposes every feed contributor, keeping `contributor` as the first", () => {
        const atom = parseFeed(manyPeople) as AtomFeed;
        expect(atom.contributors).to.deep.equal([{ name: "C1" }, { name: "C2" }]);
        expect(atom.contributor).to.deep.equal({ name: "C1" });
    });

    it("exposes every feed category, keeping `category` as the first", () => {
        const atom = parseFeed(manyPeople) as AtomFeed;
        expect(atom.categories).to.deep.equal([
            { term: "one", scheme: "https://example.com/s", label: "One" },
            { term: "two" }
        ]);
        expect(atom.category).to.deep.equal({ term: "one", scheme: "https://example.com/s", label: "One" });
    });

    it("exposes every entry author and category", () => {
        const entryParsed = (parseFeed(manyPeople) as AtomFeed).items[0];
        expect(entryParsed.authors).to.deep.equal([{ name: "EA" }, { name: "EB" }]);
        expect(entryParsed.author).to.deep.equal({ name: "EA" });
        expect(entryParsed.categories).to.deep.equal([{ term: "ec1" }, { term: "ec2" }]);
    });

    it("wraps a lone author and category into their arrays", () => {
        const atom = parseFeed(feed(
            '<author><name>Solo</name></author><category term="only"/>'
        )) as AtomFeed;
        expect(atom.authors).to.deep.equal([{ name: "Solo" }]);
        expect(atom.categories).to.deep.equal([{ term: "only" }]);
    });

    it("leaves the arrays undefined when the elements are absent", () => {
        const atom = parseFeed(feed(entry(""))) as AtomFeed;
        expect(atom.authors).to.equal(undefined);
        expect(atom.categories).to.equal(undefined);
        expect(atom.contributors).to.equal(undefined);
        expect(atom.items[0].categories).to.equal(undefined);
    });

    it("inherits the whole feed author list for an entry with none", () => {
        const atom = parseFeed(feed(
            "<author><name>Feed A</name></author><author><name>Feed B</name></author>" + entry("")
        )) as AtomFeed;
        expect(atom.items[0].authors).to.deep.equal([{ name: "Feed A" }, { name: "Feed B" }]);
        expect(atom.items[0].author).to.deep.equal({ name: "Feed A" });
    });

    it("skips a category that names no term", () => {
        const atom = parseFeed(feed(
            '<category label="no term"/><category term="real"/>'
        )) as AtomFeed;
        expect(atom.categories).to.deep.equal([{ term: "real" }]);
    });

    it("exposes a source's authors and categories", () => {
        const atom = parseFeed(feed(entry(
            "<source><id>tag:example.com,2024:src</id><title>S</title>" +
            "<author><name>SA</name></author><author><name>SB</name></author>" +
            '<category term="sc1"/><category term="sc2"/></source>'
        ))) as AtomFeed;
        expect(atom.items[0].source?.authors).to.deep.equal([{ name: "SA" }, { name: "SB" }]);
        expect(atom.items[0].source?.categories).to.deep.equal([{ term: "sc1" }, { term: "sc2" }]);
    });
});
