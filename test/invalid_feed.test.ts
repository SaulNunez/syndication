import { expect } from "chai";
import { parseFeed } from "../src/index.js";

describe('Parsing invalid input', () => {
    it("Throws a clear error for HTML/non-feed input instead of crashing", () => {
        const html = `<!doctype html><html><head><title>404</title></head><body>Not found</body></html>`;
        expect(() => parseFeed(html)).to.throw(/not a recognized RSS or Atom feed/);
    });

    it("Throws a clear error for empty input instead of crashing", () => {
        expect(() => parseFeed("")).to.throw(/not a recognized RSS or Atom feed/);
    });
});
