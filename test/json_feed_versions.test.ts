import { expect } from "chai";
import { parseFeed } from "../src/index.js";
import { JSONFeed } from "../src/types.js";

const V1 = "https://jsonfeed.org/version/1";
const V11 = "https://jsonfeed.org/version/1.1";

const parse = (feed: Record<string, unknown>) => parseFeed(JSON.stringify(feed)) as JSONFeed;

describe("JSON Feed 1.0 compatibility", () => {
    // 1.0 has a singular `author` object; 1.1 replaced it with an `authors` array.
    // The parser normalises 1.0 up to the 1.1 shape at both levels.
    it("lifts a feed-level 1.0 author into authors[]", () => {
        const feed = parse({
            version: V1,
            title: "T",
            author: { name: "Jo", url: "https://example.com/jo" },
            items: []
        });
        expect(feed.authors).to.deep.equal([{ name: "Jo", url: "https://example.com/jo" }]);
    });

    it("lifts an item-level 1.0 author into authors[]", () => {
        const feed = parse({
            version: V1,
            title: "T",
            items: [{ id: "1", author: { name: "Jo" }, content_text: "x" }]
        });
        expect(feed.items[0].authors).to.deep.equal([{ name: "Jo" }]);
    });

    it("prefers an existing authors array over the legacy author key", () => {
        const feed = parse({
            version: V11,
            title: "T",
            authors: [{ name: "New" }],
            author: { name: "Old" },
            items: []
        });
        expect(feed.authors).to.deep.equal([{ name: "New" }]);
    });

    it("leaves authors undefined when neither key is present", () => {
        expect(parse({ version: V11, title: "T", items: [] }).authors).to.equal(undefined);
    });
});

describe("JSON Feed field mapping", () => {
    it("sets feedType and mirrors home_page_url into link", () => {
        const feed = parse({ version: V11, title: "T", home_page_url: "https://example.com/", items: [] });
        expect(feed.feedType).to.equal("json");
        expect(feed.link).to.equal("https://example.com/");
    });

    it("falls back to an empty link when home_page_url is absent", () => {
        expect(parse({ version: V11, title: "T", items: [] }).link).to.equal("");
    });

    it("mirrors item url into link and defaults a missing item title", () => {
        const feed = parse({
            version: V11,
            title: "T",
            items: [{ id: "1", url: "https://example.com/1", content_text: "x" }]
        });
        expect(feed.items[0].link).to.equal("https://example.com/1");
        expect(feed.items[0].title).to.equal("");
    });

    it("carries feed_url, next_url, language, expired, icon and favicon", () => {
        const feed = parse({
            version: V11,
            title: "T",
            feed_url: "https://example.com/feed.json",
            next_url: "https://example.com/feed.json?page=2",
            language: "en-US",
            expired: true,
            icon: "https://example.com/icon.png",
            favicon: "https://example.com/favicon.png",
            items: []
        });
        expect(feed.feed_url).to.equal("https://example.com/feed.json");
        expect(feed.next_url).to.equal("https://example.com/feed.json?page=2");
        expect(feed.language).to.equal("en-US");
        expect(feed.expired).to.equal(true);
        expect(feed.icon).to.equal("https://example.com/icon.png");
        expect(feed.favicon).to.equal("https://example.com/favicon.png");
    });

    it("carries item tags and attachments through unchanged", () => {
        const attachment = {
            url: "https://example.com/a.mp3",
            mime_type: "audio/mpeg",
            size_in_bytes: 5,
            duration_in_seconds: 9
        };
        const feed = parse({
            version: V11,
            title: "T",
            items: [{ id: "1", content_text: "x", tags: ["a", "b"], attachments: [attachment] }]
        });
        expect(feed.items[0].tags).to.deep.equal(["a", "b"]);
        expect(feed.items[0].attachments).to.deep.equal([attachment]);
    });

    it("carries the item content, summary and image fields", () => {
        const feed = parse({
            version: V11,
            title: "T",
            items: [{
                id: "1",
                content_html: "<p>Hello</p>",
                content_text: "Hello",
                summary: "A summary",
                image: "https://example.com/i.png",
                banner_image: "https://example.com/b.png",
                external_url: "https://other.example.org/",
                date_published: "2024-01-01T00:00:00Z",
                date_modified: "2024-01-02T00:00:00Z"
            }]
        });
        const item = feed.items[0];
        expect(item.content_html).to.equal("<p>Hello</p>");
        expect(item.content_text).to.equal("Hello");
        expect(item.summary).to.equal("A summary");
        expect(item.image).to.equal("https://example.com/i.png");
        expect(item.banner_image).to.equal("https://example.com/b.png");
        expect(item.external_url).to.equal("https://other.example.org/");
        // Dates are declared as Date but passed through as the raw ISO strings.
        expect(item.date_published as unknown).to.equal("2024-01-01T00:00:00Z");
        expect(item.date_modified as unknown).to.equal("2024-01-02T00:00:00Z");
    });

    it("returns an empty items array when the key is missing", () => {
        expect(parse({ version: V11, title: "T" }).items).to.deep.equal([]);
    });

    // Unlike RSSChannel and AtomFeed, JSONFeed has no `extra` bag, so `feed.extra`
    // is only reachable after narrowing on feedType.
    it("does not add an extra property", () => {
        expect(parse({ version: V11, title: "T", items: [] })).to.not.have.property("extra");
    });
});
