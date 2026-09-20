import { expect } from "chai";
import { parseFeed } from "../src/index.js";

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
<title>T</title><link>https://example.com/</link><description>D</description></channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<title>T</title><id>tag:example.com,2024:feed</id></feed>`;

describe("Format detection", () => {
    it("tags an RSS channel with feedType rss", () => {
        expect(parseFeed(RSS).feedType).to.equal("rss");
    });

    it("tags an Atom feed with feedType atom", () => {
        expect(parseFeed(ATOM).feedType).to.equal("atom");
    });

    it("tags a JSON Feed with feedType json", () => {
        const json = JSON.stringify({ version: "https://jsonfeed.org/version/1.1", title: "T", items: [] });
        expect(parseFeed(json).feedType).to.equal("json");
    });

    it("tolerates leading whitespace before the XML declaration", () => {
        expect(parseFeed("\n\n  " + RSS).feedType).to.equal("rss");
    });

    it("tolerates a UTF-8 byte order mark", () => {
        expect(parseFeed("﻿" + RSS).feedType).to.equal("rss");
    });
});

describe("JSON Feed version sniffing", () => {
    // The sniff requires `version` to be a string containing the exact
    // "https://jsonfeed.org/version/" prefix; anything else falls through to the
    // XML parser and is then rejected as unrecognised.
    const rejected: Array<[string, unknown]> = [
        ["a non-TLS version URL", "http://jsonfeed.org/version/1.1"],
        ["a bare version number", "1.1"],
        ["a numeric version", 1.1]
    ];

    rejected.forEach(([label, version]) => {
        it(`rejects a feed with ${label}`, () => {
            const json = JSON.stringify({ version, title: "T", items: [] });
            expect(() => parseFeed(json)).to.throw(/not a recognized RSS or Atom feed/);
        });
    });

    it("rejects a JSON document with no version key", () => {
        expect(() => parseFeed(JSON.stringify({ title: "T", items: [] })))
            .to.throw(/not a recognized RSS or Atom feed/);
    });

    it("rejects JSON that is not an object", () => {
        expect(() => parseFeed("[1,2,3]")).to.throw(/not a recognized RSS or Atom feed/);
        expect(() => parseFeed('"hello"')).to.throw(/not a recognized RSS or Atom feed/);
    });
});

describe("Unrecognised input", () => {
    it("rejects <rss> with no <channel>", () => {
        expect(() => parseFeed('<?xml version="1.0"?><rss version="2.0"></rss>'))
            .to.throw(/not a recognized RSS or Atom feed/);
    });

    // RSS 1.0 / RDF is not among the supported formats: the payload hangs off
    // rdf:RDF rather than rss.channel, so it is rejected rather than misparsed.
    it("rejects an RSS 1.0 (RDF) document", () => {
        const rdf = `<?xml version="1.0"?><rdf:RDF
            xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns="http://purl.org/rss/1.0/"><channel><title>T</title></channel></rdf:RDF>`;
        expect(() => parseFeed(rdf)).to.throw(/not a recognized RSS or Atom feed/);
    });

    it("rejects whitespace-only input", () => {
        expect(() => parseFeed("   ")).to.throw(/not a recognized RSS or Atom feed/);
    });

    // The message leaks an internal TypeError ("Cannot read properties of null").
    // Pinned only so a future tidy-up is a deliberate change.
    it("throws rather than crashing on a null input", () => {
        expect(() => parseFeed(null as unknown as string)).to.throw(/Failed to parse feed/);
    });

    // fast-xml-parser runs without validation, so genuinely malformed markup is
    // recovered instead of throwing -- the "not valid XML" branch of parseFeed is
    // unreachable for most real-world broken input.
    it("recovers an unclosed tag instead of reporting invalid XML", () => {
        const broken = `<rss version="2.0"><channel><title>T</title></rss>`;
        expect(parseFeed(broken).feedType).to.equal("rss");
    });
});
