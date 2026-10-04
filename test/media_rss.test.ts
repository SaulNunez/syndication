import { expect } from "chai";
import { parseFeed } from "../src/index.js";
import { AtomFeed, RSSChannel } from "../src/types";

const rssExample = `
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Example News</title>
    <link>https://news.example.com/</link>
    <description>News from around the world</description>
    <item>
      <title>Single media:content with dimensions</title>
      <link>https://news.example.com/1</link>
      <description>A short teaser.</description>
      <content:encoded><![CDATA[<p>The <b>full</b> article.</p><img src="https://news.example.com/inline.jpg">]]></content:encoded>
      <media:content url="https://news.example.com/1.jpg" type="image/jpeg" medium="image" width="1200" height="675" />
    </item>
    <item>
      <title>Thumbnails only</title>
      <link>https://news.example.com/2</link>
      <description>Another teaser.</description>
      <media:thumbnail url="https://news.example.com/2-small.jpg" width="240" height="135" />
      <media:thumbnail url="https://news.example.com/2-large.jpg" width="976" height="549" />
    </item>
    <item>
      <title>Media group with nested thumbnail</title>
      <link>https://news.example.com/3</link>
      <description>Third teaser.</description>
      <media:group>
        <media:content url="https://news.example.com/3.mp4" type="video/mp4" medium="video">
          <media:thumbnail url="https://news.example.com/3-poster.jpg" width="1280" height="720" />
        </media:content>
        <media:content url="https://news.example.com/3-alt.jpg" medium="image" />
      </media:group>
    </item>
    <item>
      <title>No media</title>
      <link>https://news.example.com/4</link>
      <description>Plain item.</description>
    </item>
  </channel>
</rss>
`;

const atomExample = `
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <id>yt:channel:example</id>
  <title>Example Channel</title>
  <updated>2026-10-01T12:00:00+00:00</updated>
  <link rel="alternate" href="https://www.youtube.com/channel/example"/>
  <entry>
    <id>yt:video:abc123</id>
    <title>A video</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
    <published>2026-10-01T12:00:00+00:00</published>
    <updated>2026-10-01T12:00:00+00:00</updated>
    <media:group>
      <media:title>A video</media:title>
      <media:content url="https://www.youtube.com/v/abc123" type="application/x-shockwave-flash" width="640" height="390"/>
      <media:thumbnail url="https://i.ytimg.com/vi/abc123/hqdefault.jpg" width="480" height="360"/>
      <media:description>Video description</media:description>
    </media:group>
  </entry>
</feed>
`;

describe('Parsing Media RSS and content:encoded', () => {
  const rss = parseFeed(rssExample) as RSSChannel;

  it('Parses a single media:content with its attributes', () => {
    expect(rss.items[0].media).to.deep.equal({
      contents: [{
        url: 'https://news.example.com/1.jpg',
        type: 'image/jpeg',
        medium: 'image',
        width: 1200,
        height: 675,
      }],
      thumbnails: [],
    });
  });

  it('Parses content:encoded separately from description', () => {
    expect(rss.items[0].description).to.equal('A short teaser.');
    expect(rss.items[0].contentEncoded).to.equal('<p>The <b>full</b> article.</p><img src="https://news.example.com/inline.jpg">');
    expect(rss.items[1].contentEncoded).to.be.undefined;
  });

  it('Parses multiple media:thumbnail elements', () => {
    expect(rss.items[1].media).to.deep.equal({
      contents: [],
      thumbnails: [
        { url: 'https://news.example.com/2-small.jpg', width: 240, height: 135 },
        { url: 'https://news.example.com/2-large.jpg', width: 976, height: 549 },
      ],
    });
  });

  it('Flattens media:group and thumbnails nested in media:content', () => {
    expect(rss.items[2].media).to.deep.equal({
      contents: [
        { url: 'https://news.example.com/3.mp4', type: 'video/mp4', medium: 'video' },
        { url: 'https://news.example.com/3-alt.jpg', medium: 'image' },
      ],
      thumbnails: [
        { url: 'https://news.example.com/3-poster.jpg', width: 1280, height: 720 },
      ],
    });
  });

  it('Leaves media undefined when the item has none', () => {
    expect(rss.items[3].media).to.be.undefined;
  });

  it('Parses Media RSS in Atom entries', () => {
    const atom = parseFeed(atomExample) as AtomFeed;
    expect(atom.items[0].media).to.deep.equal({
      contents: [{
        url: 'https://www.youtube.com/v/abc123',
        type: 'application/x-shockwave-flash',
        width: 640,
        height: 390,
      }],
      thumbnails: [
        { url: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg', width: 480, height: 360 },
      ],
    });
  });
});
