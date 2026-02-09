import { expect } from "chai";
import { parseRSS } from "../src/index.js";
import { AtomFeed } from "../src/types";

const sample = `
<?xml version="1.0" encoding="utf-8"?>
   <feed xmlns="http://www.w3.org/2005/Atom">
     <title type="text">dive into mark</title>
     <subtitle type="html">
       A &lt;em&gt;lot&lt;/em&gt; of effort
       went into making this effortless
     </subtitle>
     <updated>2005-07-31T12:29:29Z</updated>
     <id>tag:example.org,2003:3</id>
     <link rel="alternate" type="text/html"
      hreflang="en" href="http://example.org/"/>
     <link rel="self" type="application/atom+xml"
      href="http://example.org/feed.atom"/>
     <rights>Copyright (c) 2003, Mark Pilgrim</rights>
     <generator uri="http://www.example.com/" version="1.0">
       Example Toolkit
     </generator>
     <entry>
       <title>Atom draft-07 snapshot</title>
       <link rel="alternate" type="text/html"
        href="http://example.org/2005/04/02/atom"/>
       <link rel="enclosure" type="audio/mpeg" length="1337"
        href="http://example.org/audio/ph34r_my_podcast.mp3"/>
       <id>tag:example.org,2003:3.2397</id>
       <updated>2005-07-31T12:29:29Z</updated>
       <published>2003-12-13T08:29:29-04:00</published>
       <author>
         <name>Mark Pilgrim</name>
         <uri>http://example.org/</uri>
         <email>f8dy@example.com</email>
       </author>
       <contributor>
         <name>Sam Ruby</name>
       </contributor>
       <contributor>
         <name>Joe Gregorio</name>
       </contributor>
       <content type="xhtml" xml:lang="en"
        xml:base="http://diveintomark.org/">
         <div xmlns="http://www.w3.org/1999/xhtml">
           <p><i>[Update: The Atom draft is finished.]</i></p>
         </div>
       </content>
     </entry>
   </feed>
`;

describe('Parsing Atom 1.0 Feed information', () => {
    it('Test feed', () => {
        const atom = parseRSS(sample) as AtomFeed;
        expect(atom.title).to.equal('dive into mark');
        expect(atom.subtitle).to.equal('A <em>lot</em> of effort went into making this effortless');
        expect(atom.updated).to.equal('2005-07-31T12:29:29Z');
        expect(atom.id).to.equal('tag:example.org,2003:3');
        expect(atom.link).to.equal('http://example.org/');
        expect(atom.rights).to.equal('Copyright (c) 2003, Mark Pilgrim');
        expect(atom.generator).to.equal('Example Toolkit');
    });
});

describe('Parsing Atom 1.0 Entry information', () => {
    it('Test entry', () => {
        const atom = parseRSS(sample) as AtomFeed;
        const entry = atom.entries[0];
        expect(entry.title).to.equal('Atom draft-07 snapshot');
        expect(entry.link).to.equal('http://example.org/2005/04/02/atom');
        expect(entry.id).to.equal('tag:example.org,2003:3.2397');
        expect(entry.updated).to.equal('2005-07-31T12:29:29Z');
        expect(entry.published).to.equal('2003-12-13T08:29:29-04:00');
        expect(entry.author.name).to.equal('Mark Pilgrim');
        expect(entry.author.uri).to.equal('http://example.org/');
        expect(entry.author.email).to.equal('f8dy@example.com');
        expect(entry.contributors[0].name).to.equal('Sam Ruby');
        expect(entry.contributors[1].name).to.equal('Joe Gregorio');
        expect(entry.content?.value).to.equal('<div xmlns="http://www.w3.org/1999/xhtml"><p><i>[Update: The Atom draft is finished.]</i></p></div>');
    });
});