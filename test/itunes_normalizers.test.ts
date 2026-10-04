import { expect } from "chai";
import { parseFeed } from "../src/index.js";
import { RSSChannel } from "../src/types.js";

const ITUNES = 'xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"';

/** One-item podcast channel; `channelBody` and `itemBody` are spliced in verbatim. */
const feed = (channelBody = "", itemBody = "") => `<?xml version="1.0"?>
<rss version="2.0" ${ITUNES}>
  <channel>
    <title>Podcast</title>
    <link>https://example.com/</link>
    <description>Fixture for iTunes normalizers</description>
    ${channelBody}
    <item>
      <title>Episode</title>
      <link>https://example.com/1</link>
      <description>Episode body</description>
      ${itemBody}
    </item>
  </channel>
</rss>`;

const channelItunes = (body: string) => (parseFeed(feed(body)) as RSSChannel).itunes;
const itemItunes = (body: string) => (parseFeed(feed("", body)) as RSSChannel).items[0].itunes;

describe("parseItunesDuration", () => {
    const cases: Array<[string, number | undefined]> = [
        ["1079", 1079],        // plain seconds
        ["32", 32],
        ["00:32", 32],         // MM:SS
        ["12:30", 750],
        ["1:00:00", 3600],     // HH:MM:SS
        ["01:02:03", 3723],
        ["abc", undefined],    // unparseable
        ["12:ab", undefined],
        ["1:2:3:4", undefined] // too many parts
    ];

    cases.forEach(([input, expected]) => {
        it(`converts ${JSON.stringify(input)} to ${String(expected)}`, () => {
            expect(itemItunes(`<itunes:duration>${input}</itunes:duration>`)?.duration).to.equal(expected);
        });
    });

    // Number("") is 0, not NaN, so the isNaN guard lets an empty element through.
    it("yields 0 for an empty <itunes:duration> (open question: should be undefined)", () => {
        expect(itemItunes("<itunes:duration></itunes:duration>")?.duration).to.equal(0);
    });
});

describe("parseItunesExplicit", () => {
    const cases: Array<[string, boolean | undefined]> = [
        ["yes", true],
        ["true", true],
        ["YES", true],
        ["True", true],
        ["no", false],
        ["false", false],
        ["NO", false]
    ];

    cases.forEach(([input, expected]) => {
        it(`converts ${JSON.stringify(input)} to ${String(expected)}`, () => {
            expect(itemItunes(`<itunes:explicit>${input}</itunes:explicit>`)?.explicit).to.equal(expected);
        });
    });

    // Apple's legacy third value. It means "not explicit", so false is arguably
    // the better mapping; undefined is what the current code produces.
    it("yields undefined for the legacy 'clean' value (open question: should be false)", () => {
        expect(itemItunes("<itunes:explicit>clean</itunes:explicit>")).to.equal(undefined);
    });
});

describe("parseItunesCategories", () => {
    it("flattens a nested category into a flat list", () => {
        expect(channelItunes(
            '<itunes:category text="Sports"><itunes:category text="Wilderness"/></itunes:category>'
        )?.categories).to.deep.equal(["Sports", "Wilderness"]);
    });

    it("collects several sibling categories and decodes entities in the text", () => {
        expect(channelItunes(
            '<itunes:category text="Sports"/><itunes:category text="Health &amp; Fitness"/>'
        )?.categories).to.deep.equal(["Sports", "Health & Fitness"]);
    });

    it("omits the categories key entirely when there are none", () => {
        expect(channelItunes('<itunes:author>A</itunes:author>')).to.not.have.property("categories");
    });
});

describe("iTunes episode and season coercion", () => {
    it("converts numeric strings, including zero-padded ones", () => {
        const itunes = itemItunes("<itunes:episode>007</itunes:episode><itunes:season>2</itunes:season>");
        expect(itunes?.episode).to.equal(7);
        expect(itunes?.season).to.equal(2);
    });

    it("drops a non-numeric episode", () => {
        expect(itemItunes("<itunes:episode>abc</itunes:episode>")).to.equal(undefined);
    });
});

describe("iTunes object presence", () => {
    // Both helpers strip undefined keys and return undefined when nothing matched,
    // so a non-podcast feed has no `itunes` key at all rather than an empty object.
    it("omits the itunes key on a channel with no iTunes elements", () => {
        const rss = parseFeed(feed()) as RSSChannel;
        expect(rss).to.not.have.property("itunes");
    });

    it("omits the itunes key on an item with no iTunes elements", () => {
        const rss = parseFeed(feed()) as RSSChannel;
        expect(rss.items[0]).to.not.have.property("itunes");
    });

    it("reads channel author, image href, keywords and type", () => {
        const itunes = channelItunes(
            "<itunes:author>The Sunset Explorers</itunes:author>" +
            '<itunes:image href="https://example.com/art.png"/>' +
            "<itunes:keywords>hiking,outdoors</itunes:keywords>" +
            "<itunes:type>serial</itunes:type>"
        );
        expect(itunes?.author).to.equal("The Sunset Explorers");
        expect(itunes?.image).to.equal("https://example.com/art.png");
        expect(itunes?.keywords).to.equal("hiking,outdoors");
        expect(itunes?.type).to.equal("serial");
    });

    it("reads item title and episodeType", () => {
        const itunes = itemItunes(
            "<itunes:title>Trailer</itunes:title><itunes:episodeType>trailer</itunes:episodeType>"
        );
        expect(itunes?.title).to.equal("Trailer");
        expect(itunes?.episodeType).to.equal("trailer");
    });
});

describe("iTunes fields outside the typed object", () => {
    // processItemItunes has no `image` field, so per-episode artwork is reachable
    // only through the generic extra bag.
    it("leaves item-level itunes:image out of the typed object, in extra instead", () => {
        const rss = parseFeed(feed("", '<itunes:image href="https://example.com/ep.png"/>')) as RSSChannel;
        expect(rss.items[0].itunes).to.equal(undefined);
        expect(rss.items[0].extra?.itunes?.image).to.deep.equal({ href: "https://example.com/ep.png" });
    });

    it("leaves channel-level owner, summary and block in extra", () => {
        const rss = parseFeed(feed(
            "<itunes:owner><itunes:name>N</itunes:name><itunes:email>e@example.com</itunes:email></itunes:owner>" +
            "<itunes:summary>S</itunes:summary><itunes:block>yes</itunes:block>"
        )) as RSSChannel;
        expect(rss.itunes).to.equal(undefined);
        expect(rss.extra?.itunes?.owner).to.deep.equal({ name: "N", email: "e@example.com" });
        expect(rss.extra?.itunes?.summary).to.equal("S");
        expect(rss.extra?.itunes?.block).to.equal("yes");
    });

    // extractAndProcess recurses into <itunes:owner>'s children and collects them
    // a second time at the top level of extra.itunes.
    it("also hoists an owner's nested children to the top of extra.itunes", () => {
        const rss = parseFeed(feed(
            "<itunes:owner><itunes:name>N</itunes:name><itunes:email>e@example.com</itunes:email></itunes:owner>"
        )) as RSSChannel;
        expect(rss.extra?.itunes?.name).to.equal("N");
        expect(rss.extra?.itunes?.email).to.equal("e@example.com");
    });
});
