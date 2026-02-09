
import { expect } from "chai";
import { getAuthorInfo } from "../src/index.js";

describe('Parsing Author information', () => {
    it("Test basic author information gets parsed correctly", () => {
        const authorString = "neil.armstrong@example.com (Neil Armstrong\)";
        const authorInfo = getAuthorInfo(authorString);
        expect(typeof authorInfo).to.equal('object');
        if (typeof authorInfo === 'object') {
            expect(authorInfo.name).to.equal('Neil Armstrong');
            expect(authorInfo.email).to.equal('neil.armstrong@example.com');
        }
    });
});
