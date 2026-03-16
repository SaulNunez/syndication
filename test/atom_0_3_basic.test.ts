import { expect } from "chai";
import { parseRSS } from "../src/index.js";
import { AtomFeed } from "../src/types";

const example = `
<?xml version="1.0" encoding="utf-8"?>
<feed version="0.3"
xmlns="http://purl.org/atom/ns#"
xml:base="http://example.org/"
xml:lang="en">
<title type="text/plain" mode="escaped">
Sample Feed
</title>
<tagline type="text/html" mode="escaped">
For documentation &lt;em&gt;only&lt;/em&gt;
</tagline>
<link rel="alternate"
type="text/html"
href="/"/>
<copyright type="text/html" mode="escaped">
&lt;p>Copyright 2004, Mark Pilgrim&lt;/p>&lt;
</copyright>
<generator url="http://example.org/generator/" version="3.0">
Sample Toolkit
</generator>
<id>tag:feedparser.org,2004-04-20:/docs/examples/atom03.xml</id>
<modified>2004-04-20T11:56:34Z</modified>
<info type="application/xhtml+xml" mode="xml">
<div xmlns="http://www.w3.org/1999/xhtml"><p>This is an Atom syndication feed.</p></div>
</info>
<entry>
<title>First entry title</title>
<link rel="alternate"
type="text/html"
href="/entry/3"/>
<link rel="service.edit"
type="application/atom+xml"
title="Atom API entrypoint to edit this entry"
href="/api/edit/3"/>
<link rel="service.post"
type="application/atom+xml"
title="Atom API entrypoint to add comments to this entry"
href="/api/comment/3"/>
<id>tag:feedparser.org,2004-04-20:/docs/examples/atom03.xml:3</id>
<created>2004-04-19T07:45:00Z</created>
<issued>2004-04-20T00:23:47Z</issued>
<modified>2004-04-20T11:56:34Z</modified>
<author>
<name>Mark Pilgrim</name>
<url>http://diveintomark.org/</url>
<email>mark@example.org</email>
</author>
<contributor>
<name>Joe</name>
<url>http://example.org/joe/</url>
<email>joe@example.org</email>
</contributor>
<contributor>
<name>Sam</name>
<url>http://example.org/sam/</url>
<email>sam@example.org</email>
</contributor>
<summary type="text/plain" mode="escaped">
Watch out for nasty tricks
</summary>
<content type="application/xhtml+xml" mode="xml"
xml:base="http://example.org/entry/3"
xml:lang="en-US">
<div xmlns="http://www.w3.org/1999/xhtml">Watch out for <span style="background-image: url(javascript:window.location=’http://example.org/’)"> nasty tricks</span></div>
</content>
</entry>
</feed>
`;

describe('Parsing Atom 0.3 Feed information', () => {
    it('Test feed', () => {
        const atom = parseRSS(example) as AtomFeed;
        expect(atom.title).to.equal('Sample Feed');
        expect(atom.subtitle).to.equal('For documentation <em>only</em>');
        expect(atom.link).to.equal('http://example.org/');
        expect(atom.rights).to.equal('<p>Copyright 2004, Mark Pilgrim</p><');
        expect(atom.generator).to.equal('Sample Toolkit');
        expect(atom.id).to.equal('tag:feedparser.org,2004-04-20:/docs/examples/atom03.xml');
        expect(atom.updated).to.equal('2004-04-20T11:56:34Z');
    });
});

describe('Parsing Atom 0.3 Entry information', () => {
    it('Test entry', () => {
        const atom = parseRSS(example) as AtomFeed;
        const entry = atom.items[0];
        expect(entry.title).to.equal('First entry title');
        expect(entry.link).to.equal('http://example.org/entry/3');
        expect(entry.id).to.equal('tag:feedparser.org,2004-04-20:/docs/examples/atom03.xml:3');
        expect(entry.updated).to.equal('2004-04-20T11:56:34Z');
        expect(entry.published).to.equal('2004-04-20T00:23:47Z');
        expect(entry.author.name).to.equal('Mark Pilgrim');
        expect(entry.author.uri).to.equal('http://diveintomark.org/');
        expect(entry.author.email).to.equal('mark@example.org');
        expect(entry.contributors).to.have.lengthOf(2);
        expect(entry.contributors?.[0].name).to.equal('Joe');
        expect(entry.contributors?.[0].uri).to.equal('http://example.org/joe/');
        expect(entry.contributors?.[0].email).to.equal('joe@example.org');
        expect(entry.contributors?.[1].name).to.equal('Sam');
        expect(entry.contributors?.[1].uri).to.equal('http://example.org/sam/');
        expect(entry.contributors?.[1].email).to.equal('sam@example.org');
        expect(entry.summary).to.equal('Watch out for nasty tricks');
    });
});