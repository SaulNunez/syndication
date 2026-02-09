import { XMLParser } from "fast-xml-parser";
import { RSSAuthor, RSSChannel, RSSItem } from "./types.js";

export function parseRSS(rssString: string): RSSChannel {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        textNodeName: "#text"
    });
    const parsed = parser.parse(rssString);
    const channelRaw = parsed.rss.channel;

    const items: RSSItem[] = Array.isArray(channelRaw.item)
        ? channelRaw.item.map(mapItem)
        : (channelRaw.item ? [mapItem(channelRaw.item)] : []);

    const channel: RSSChannel = {
        title: channelRaw.title,
        link: channelRaw.link,
        description: channelRaw.description,
        language: channelRaw.language,
        pubDate: channelRaw.pubDate,
        lastBuildDate: channelRaw.lastBuildDate,
        docs: channelRaw.docs,
        generator: channelRaw.generator,
        ttl: channelRaw.ttl || 60,
        managingEditor: channelRaw.managingEditor ? (getAuthorInfo(channelRaw.managingEditor) as RSSAuthor) : undefined,
        webMaster: channelRaw.webMaster ? (getAuthorInfo(channelRaw.webMaster) as RSSAuthor) : undefined,
        items: items,
        extra: {}
    };

    return channel;
}

function mapItem(itemRaw: any): RSSItem {
    return {
        title: itemRaw.title,
        link: itemRaw.link,
        description: itemRaw.description,
        pubDate: itemRaw.pubDate,
        guid: itemRaw.guid ? (typeof itemRaw.guid === 'object' ? itemRaw.guid['#text'] : itemRaw.guid) : undefined,
        enclosure: itemRaw.enclosure ? {
            url: itemRaw.enclosure['@_url'],
            length: parseInt(itemRaw.enclosure['@_length'], 10),
            type: itemRaw.enclosure['@_type']
        } : undefined,
        extra: {}
    };
}

export function getAuthorInfo(authorString: string): RSSAuthor | string {
    const emailEndIndex = authorString.indexOf(' (');
    if (emailEndIndex === -1) {
        return authorString;
    }
    const email = authorString.substring(0, emailEndIndex).trim();
    const name = authorString.substring(emailEndIndex + 2, authorString.length - 1).trim();
    return { name, email };
}