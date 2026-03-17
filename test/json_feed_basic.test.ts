import feed from './example_json_feed.json' with { type: 'json' };
import { expect } from "chai";
import { parseFeed } from "../src/index.js";

describe("JSON Feed Basic", () => {
    it("should parse the feed", () => {
        const parsedFeed = parseFeed(JSON.stringify(feed));
        expect(parsedFeed).to.have.property('version', 'https://jsonfeed.org/version/1.1');
        expect(parsedFeed).to.have.property('title', 'My Example Feed');
        expect(parsedFeed).to.have.property('home_page_url', 'https://example.org/');
        expect(parsedFeed).to.have.property('feed_url', 'https://example.org/feed.json');
        expect(parsedFeed).to.have.property('items').that.is.an('array');
        expect(parsedFeed.items).to.have.length(2);
        expect(parsedFeed.items[0]).to.have.property('id', '2');
        expect(parsedFeed.items[0]).to.have.property('content_text', 'This is a second item.');
        expect(parsedFeed.items[0]).to.have.property('url', 'https://example.org/second-item');
        expect(parsedFeed.items[1]).to.have.property('id', '1');
        expect(parsedFeed.items[1]).to.have.property('content_html', '<p>Hello, world!</p>');
        expect(parsedFeed.items[1]).to.have.property('url', 'https://example.org/initial-post');
    });
});