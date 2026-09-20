import { expect } from "chai";
import { parseFeed } from "../src/index.js";
import { RSSChannel } from "../src/types.js";

const NS = 'xmlns:content="http://purl.org/rss/1.0/modules/content/" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:media="http://search.yahoo.com/mrss/"';

/** One-item RSS 2.0 channel; `channelBody` and `itemBody` are spliced in verbatim. */
const feed = (channelBody = "", itemBody = "", rootAttrs = NS) => `<?xml version="1.0"?>
<rss version="2.0" ${rootAttrs}>
  <channel>
    <title>Edge Case Feed</title>
    <link>https://example.com/</link>
    <description>Fixture for RSS edge cases</description>
    ${channelBody}
    <item>
      <title>An item</title>
      <link>https://example.com/1</link>
      <description>Item body</description>
      ${itemBody}
    </item>
  </channel>
</rss>`;

describe("RSS item collection shape", () => {
    // fast-xml-parser returns a bare object for a single <item> and an array for
    // several, so the single-item case is the one most likely to regress.
    it("wraps a lone <item> into a one-element array", () => {
        const rss = parseFeed(feed()) as RSSChannel;
        expect(rss.items).to.be.an("array").with.lengthOf(1);
        expect(rss.items[0].title).to.equal("An item");
    });

    it("returns an empty array for a channel with no items", () => {
        const empty = `<?xml version="1.0"?><rss version="2.0"><channel>
            <title>T</title><link>https://example.com/</link><description>D</description>
        </channel></rss>`;
        expect((parseFeed(empty) as RSSChannel).items).to.deep.equal([]);
    });
});

describe("RSS channel scalars", () => {
    it("defaults ttl to 60 when the element is absent", () => {
        expect((parseFeed(feed()) as RSSChannel).ttl).to.equal(60);
    });

    it("keeps an explicit ttl", () => {
        expect((parseFeed(feed("<ttl>15</ttl>")) as RSSChannel).ttl).to.equal(15);
    });

    it("parses managingEditor and webMaster in `email (Name)` form", () => {
        const rss = parseFeed(feed(
            "<managingEditor>neil@example.com (Neil Armstrong)</managingEditor>" +
            "<webMaster>sally@example.com (Sally Ride)</webMaster>"
        )) as RSSChannel;
        expect(rss.managingEditor).to.deep.equal({ name: "Neil Armstrong", email: "neil@example.com" });
        expect(rss.webMaster).to.deep.equal({ name: "Sally Ride", email: "sally@example.com" });
    });

    // getAuthorInfo returns the raw string when there is no " (" separator, but the
    // call site casts it to RSSAuthor -- so the declared type is a lie here.
    it("yields a bare string for a managingEditor with no parenthesised name", () => {
        const rss = parseFeed(feed("<managingEditor>neil@example.com</managingEditor>")) as RSSChannel;
        expect(rss.managingEditor as unknown).to.equal("neil@example.com");
    });
});

describe("RSS item fields", () => {
    it("unwraps a guid carrying an isPermaLink attribute", () => {
        const rss = parseFeed(feed("", '<guid isPermaLink="false">abc-123</guid>')) as RSSChannel;
        expect(rss.items[0].guid).to.equal("abc-123");
    });

    it("reads a plain-text guid", () => {
        const rss = parseFeed(feed("", "<guid>abc-123</guid>")) as RSSChannel;
        expect(rss.items[0].guid).to.equal("abc-123");
    });

    it("maps a single enclosure's url, length and type", () => {
        const rss = parseFeed(feed("", '<enclosure url="https://example.com/a.mp3" length="1337" type="audio/mpeg"/>')) as RSSChannel;
        expect(rss.items[0].enclosure).to.deep.equal({
            url: "https://example.com/a.mp3",
            length: 1337,
            type: "audio/mpeg"
        });
    });

    it("leaves enclosure undefined when the element is absent", () => {
        expect((parseFeed(feed()) as RSSChannel).items[0].enclosure).to.equal(undefined);
    });

    it("unwraps CDATA in title and description", () => {
        const cdata = `<?xml version="1.0"?><rss version="2.0"><channel>
            <title><![CDATA[Title & <b>bold</b>]]></title>
            <link>https://example.com/</link>
            <description><![CDATA[<p>Channel</p>]]></description>
            <item><title><![CDATA[Item & co]]></title><link>https://example.com/1</link>
            <description><![CDATA[<p>body</p>]]></description></item>
        </channel></rss>`;
        const rss = parseFeed(cdata) as RSSChannel;
        expect(rss.title).to.equal("Title & <b>bold</b>");
        expect(rss.items[0].title).to.equal("Item & co");
        expect(rss.items[0].description).to.equal("<p>body</p>");
    });
});

describe("RSS namespace extras", () => {
    it("exposes content:encoded, including its CDATA payload", () => {
        const rss = parseFeed(feed("", "<content:encoded><![CDATA[<p>Full text</p>]]></content:encoded>")) as RSSChannel;
        expect(rss.items[0].extra?.content?.encoded).to.equal("<p>Full text</p>");
    });

    it("exposes Dublin Core fields under extra.dc", () => {
        const rss = parseFeed(feed("", "<dc:creator>Jo</dc:creator><dc:date>2024-01-01</dc:date>")) as RSSChannel;
        expect(rss.items[0].extra?.dc).to.deep.equal({ creator: "Jo", date: "2024-01-01" });
    });

    it("collects an undeclared namespace prefix by its literal spelling", () => {
        // processNamespaces keys on the prefix in the document, never the resolved URI.
        const rss = parseFeed(feed("", "<foo:bar>x</foo:bar>", "")) as RSSChannel;
        expect(rss.items[0].extra?.foo).to.deep.equal({ bar: "x" });
    });

    it("stringifies numeric element text", () => {
        const rss = parseFeed(feed("", "<media:views>624477</media:views>")) as RSSChannel;
        expect(rss.items[0].extra?.media?.views).to.equal("624477");
    });

    it("flattens attributes and keeps text under `text`", () => {
        const rss = parseFeed(feed("", '<media:rating scheme="urn:simple">adult</media:rating>')) as RSSChannel;
        expect(rss.items[0].extra?.media?.rating).to.deep.equal({ scheme: "urn:simple", text: "adult" });
    });

    it("nests children under `children` when a node also has attributes", () => {
        const rss = parseFeed(feed("", '<media:group foo="1"><media:title>T</media:title></media:group>')) as RSSChannel;
        expect(rss.items[0].extra?.media?.group).to.deep.equal({ foo: "1", children: { title: "T" } });
    });

    // A repeated element becomes an array while a lone one stays an object, so
    // consumers of `extra` must handle both shapes for the same element name.
    it("collapses a repeated namespaced element into an array", () => {
        const rss = parseFeed(feed("", '<media:content url="a"/><media:content url="b"/>')) as RSSChannel;
        expect(rss.items[0].extra?.media?.content).to.deep.equal([{ url: "a" }, { url: "b" }]);
    });

    it("leaves a lone namespaced element as an object, not a one-element array", () => {
        const rss = parseFeed(feed("", '<media:content url="a"/>')) as RSSChannel;
        expect(rss.items[0].extra?.media?.content).to.deep.equal({ url: "a" });
    });
});

describe("RSS edge cases — known gaps (skipped)", () => {
    // mapItem never reads itemRaw.author, though RSSItem declares the field.
    it.skip("populates item.author from <author>", () => {
        const rss = parseFeed(feed("", "<author>jo@example.com (Jo)</author>")) as RSSChannel;
        expect(rss.items[0].author).to.deep.equal({ name: "Jo", email: "jo@example.com" });
    });

    // mapItem never reads itemRaw.comments, though RSSItem declares the field.
    it.skip("populates item.comments from <comments>", () => {
        const rss = parseFeed(feed("", "<comments>https://example.com/c</comments>")) as RSSChannel;
        expect(rss.items[0].comments).to.equal("https://example.com/c");
    });

    // The whole <image> block is dropped, though RSSChannel declares `image`.
    it.skip("populates channel.image from <image>", () => {
        const rss = parseFeed(feed(
            "<image><url>https://example.com/i.png</url><title>IT</title><link>https://example.com/</link></image>"
        )) as RSSChannel;
        expect(rss.image).to.deep.equal({
            url: "https://example.com/i.png",
            title: "IT",
            link: "https://example.com/"
        });
    });

    // `channelRaw.ttl || 60` treats a legitimate 0 as absent.
    it.skip("keeps ttl of 0 instead of defaulting to 60", () => {
        expect((parseFeed(feed("<ttl>0</ttl>")) as RSSChannel).ttl).to.equal(0);
    });

    // itemRaw.enclosure is an array when repeated; the mapper indexes it as an
    // object, producing {url: undefined, length: NaN, type: undefined}.
    it.skip("takes the first of several enclosures", () => {
        const rss = parseFeed(feed("",
            '<enclosure url="https://example.com/a.mp3" length="1" type="audio/mpeg"/>' +
            '<enclosure url="https://example.com/b.mp3" length="2" type="audio/mpeg"/>'
        )) as RSSChannel;
        expect(rss.items[0].enclosure?.url).to.equal("https://example.com/a.mp3");
    });

    // parseInt(undefined, 10) is NaN, which survives into the result object.
    it.skip("leaves enclosure.length undefined when the attribute is missing", () => {
        const rss = parseFeed(feed("", '<enclosure url="https://example.com/a.mp3" type="audio/mpeg"/>')) as RSSChannel;
        expect(rss.items[0].enclosure?.length).to.equal(undefined);
    });

    // extractAndProcess recurses into descendants, so a namespace used only on an
    // <item> is also collected into the channel's extra bag.
    it.skip("does not leak item-level namespaces into channel.extra", () => {
        const rss = parseFeed(feed("", "<dc:creator>Jo</dc:creator>")) as RSSChannel;
        expect(Object.keys(rss.extra)).to.not.include("dc");
    });
});
