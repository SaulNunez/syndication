import { expect } from "chai";
import { parseFeed } from "../src/index.js";
import { AtomFeed } from "../src/types";

const yt_sample = `
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="https://sample-feeds.rowanmanning.com/examples/fa88e615794de0164b706a5c21619e61/feed.xml"/>
 <id>yt:channel:</id>
 <yt:channelId></yt:channelId>
 <title>Critical Role</title>
 <link rel="alternate" href="https://www.youtube.com/channel/UCpXBGqwsBkpvcYjsJBQ7LEQ"/>
 <author>
  <name>Critical Role</name>
  <uri>https://www.youtube.com/channel/UCpXBGqwsBkpvcYjsJBQ7LEQ</uri>
 </author>
 <published>2018-05-23T17:03:19+00:00</published>
 <entry>
  <id>yt:video:0_NVdZp8haA</id>
  <yt:videoId>0_NVdZp8haA</yt:videoId>
  <yt:channelId>UCpXBGqwsBkpvcYjsJBQ7LEQ</yt:channelId>
  <title>The Aurora Grows | Critical Role | Campaign 3, Episode 49</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=0_NVdZp8haA"/>
  <author>
   <name>Critical Role</name>
   <uri>https://www.youtube.com/channel/UCpXBGqwsBkpvcYjsJBQ7LEQ</uri>
  </author>
  <published>2023-02-20T20:00:01+00:00</published>
  <updated>2023-02-20T22:24:07+00:00</updated>
  <media:group>
   <media:title>The Aurora Grows | Critical Role | Campaign 3, Episode 49</media:title>
   <media:content url="https://www.youtube.com/v/0_NVdZp8haA?version=3" type="application/x-shockwave-flash" width="640" height="390"/>
   <media:thumbnail url="https://i1.ytimg.com/vi/0_NVdZp8haA/hqdefault.jpg" width="480" height="360"/>
   <media:description>This episode is sponsored by Thorum. Enjoy 20% off your Thorum ring with code Criticalrole at https://Thorum.com 

Bells Hells travel the aurora-filled skies of the Hellcatch Valley, concocting plans and gathering allies as the days tick down to the apogee solstice...

CAPTION STATUS: CAPTIONED BY OUR EDITORS. The closed captions featured on this episode have been curated by our CR editors. For more information on the captioning process, check out: https://critrole.com/cr-transcript-closed-captions-update

Due to the improv nature of Critical Role and other RPG content on our channels, some themes and situations that occur in-game may be difficult for some to handle. If certain episodes or scenes become uncomfortable, we strongly suggest taking a break or skipping that particular episode.
Your health and well-being is important to us and Psycom has a great list of international mental health resources, in case it’s useful: http://bit.ly/PsycomResources

Watch Critical Role Campaign 3 live Thursdays at 7pm PT on https://twitch.tv/criticalrole and https://youtube.com/criticalrole. To join our live and moderated community chat, watch the broadcast on our Twitch channel.

Twitch subscribers gain instant access to VODs of our shows like Critical Role, Exandria Unlimited, and 4-Sided Dive. But don't worry: Twitch broadcasts will be uploaded to YouTube about 36 hours after airing live, with audio-only podcast versions of select shows on Spotify, Apple Podcasts &amp; Google Podcasts following a week after the initial air date. Twitch subscribers also gain access to our official custom emote set and subscriber badges and the ability to post links in Twitch chat!

&quot;It's Thursday Night (Critical Role Theme Song)&quot; by Peter Habib and Sam Riegel
Original Music by Omar Fadel and Hexany Audio
&quot;Welcome to Marquet&quot; Art Theme by Colm McGuinness
Additional Music by Universal Production Music, Epidemic Sounds, and 5 Alarm
Character Art by Hannah Friederichs


Follow us!
Website: https://www.critrole.com
Newsletter: https://critrole.com/newsletter
Facebook: https://www.facebook.com/criticalrole
Twitter: https://twitter.com/criticalrole
Instagram: https://instagram.com/critical_role
Twitch: https://www.twitch.tv/criticalrole

Shops: 
US: https://shop.critrole.com
UK: https://shop.critrole.co.uk
EU: https://shop.critrole.eu
AU: https://shop.critrole.com.au
CA: https://canada.critrole.com

Follow Critical Role Foundation!
Learn More &amp; Donate: https://criticalrolefoundation.org
Twitter: https://twitter.com/CriticalRoleFDN
Facebook: https://facebook.com/CriticalRoleFDN

Want games? Follow Darrington Press
Newsletter: https://darringtonpress.com/newsletter
Twitter: https://twitter.com/DarringtonPress
Facebook: https://www.facebook.com/darringtonpress

Check out our animated series!
The Legend of Vox Machina is available now on Prime Video! Watch: https://amzn.to/3o4nBS5
Listen to The Legend of Vox Machina's official soundtrack here: https://lnk.to/voxmachina

#CriticalRole #BellsHells #DungeonsAndDragons</media:description>
   <media:community>
    <media:starRating count="12916" average="5.00" min="1" max="5"/>
    <media:statistics views="624477"/>
   </media:community>
  </media:group>
 </entry>
</feed>
`;

describe('Parsing Atom Feed with namespaces', () => {
    it('Test entry', () => {
        const atom = parseFeed(yt_sample) as AtomFeed;
        const entry = atom.items[0];
        expect(entry.extra["yt"]["videoId"]).to.equal('0_NVdZp8haA');
        expect(entry.extra["media"]["group"]).to.have.property("title").that.equals("The Aurora Grows | Critical Role | Campaign 3, Episode 49");
        expect(entry.extra["media"]["group"]).to.have.property("content").that.has.property("url", "https://www.youtube.com/v/0_NVdZp8haA?version=3");
        expect(entry.extra["media"]["group"]).to.have.property("content").that.has.property("type", "application/x-shockwave-flash");
        expect(entry.extra["media"]["group"]).to.have.property("content").that.has.property("width", "640");
        expect(entry.extra["media"]["group"]).to.have.property("content").that.has.property("height", "390");
        expect(entry.extra["media"]["group"]).to.have.property("thumbnail").that.has.property("url", "https://i1.ytimg.com/vi/0_NVdZp8haA/hqdefault.jpg");
        expect(entry.extra["media"]["group"]).to.have.property("thumbnail").that.has.property("width", "480");
        expect(entry.extra["media"]["group"]).to.have.property("thumbnail").that.has.property("height", "360");
        expect(entry.extra["media"]["group"]).to.have.property("community").that.has.property("starRating").that.has.property("count", "12916");
        expect(entry.extra["media"]["group"]).to.have.property("community").that.has.property("starRating").that.has.property("average", "5.00");
        expect(entry.extra["media"]["group"]).to.have.property("community").that.has.property("starRating").that.has.property("min", "1");
        expect(entry.extra["media"]["group"]).to.have.property("community").that.has.property("starRating").that.has.property("max", "5");
        expect(entry.extra["media"]["group"]).to.have.property("community").that.has.property("statistics").that.has.property("views", "624477");
    });
});
