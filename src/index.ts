import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { AtomEntry, AtomFeed, RSSAuthor, RSSChannel, RSSItem, AtomAuthor, AtomCategory } from "./types.js";

const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

export function parseRSS(rssString: string): RSSChannel | AtomFeed {
    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        textNodeName: "#text"
    });
    const parsed = parser.parse(rssString);

    if (parsed.feed) {
        return parseAtom(parsed.feed);
    }

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

function parseAtom(feedRaw: any): AtomFeed {
    const entries: AtomEntry[] = Array.isArray(feedRaw.entry)
        ? feedRaw.entry.map(mapAtomEntry)
        : (feedRaw.entry ? [mapAtomEntry(feedRaw.entry)] : []);

    return {
        id: feedRaw.id,
        title: getTypeContent(feedRaw.title),
        updated: feedRaw.updated,
        link: getLinkHref(feedRaw.link),
        subtitle: getTypeContent(feedRaw.subtitle),
        rights: feedRaw.rights,
        generator: getTypeContent(feedRaw.generator),
        author: feedRaw.author ? getAtomAuthor(feedRaw.author) : undefined,
        logo: feedRaw.logo,
        icon: feedRaw.icon,
        entries: entries,
        description: getTypeContent(feedRaw.subtitle), // Map subtitle to description for BaseChannel compatibility
        extra: {}
    };
}

function mapAtomEntry(entryRaw: any): AtomEntry {
    return {
        id: entryRaw.id,
        title: getTypeContent(entryRaw.title),
        updated: entryRaw.updated,
        published: entryRaw.published,
        link: getLinkHref(entryRaw.link),
        summary: getTypeContent(entryRaw.summary),
        content: entryRaw.content ? {
            type: entryRaw.content["@_type"],
            value: getContentValue(entryRaw.content)
        } : undefined,
        author: entryRaw.author ? getAtomAuthor(entryRaw.author) : { name: "" },
        contributors: entryRaw.contributor ? (Array.isArray(entryRaw.contributor) ? entryRaw.contributor.map(getAtomAuthor) : [getAtomAuthor(entryRaw.contributor)]) : undefined,
        extra: {}
    };
}

function getContentValue(contentRaw: any): string {
    if (typeof contentRaw === "string") return contentRaw;
    if (contentRaw["#text"]) return contentRaw["#text"];

    // If it's an object with other keys (like children), we might need to serialize it back
    // However, fast-xml-parser puts attributes in keys starting with @_.
    // If the content was <div ...>...</div>, fast-xml-parser parses the div as a property of content.
    // We want the inner XML.

    // Create a copy to remove attributes of the content tag itself if we are serializing the children
    const contentCopy = { ...contentRaw };
    Object.keys(contentCopy).forEach(key => {
        if (key.startsWith("@_")) delete contentCopy[key];
    });

    // If empty after removing attributes, return empty string
    if (Object.keys(contentCopy).length === 0) return "";

    // Otherwise serialize the children
    return builder.build(contentCopy);
}

function getAtomAuthor(authorRaw: any): AtomAuthor {
    return {
        name: authorRaw.name,
        email: authorRaw.email,
        uri: authorRaw.uri
    };
}

function getLinkHref(linkRaw: any): string {
    if (Array.isArray(linkRaw)) {
        const alternate = linkRaw.find((l: any) => l["@_rel"] === "alternate" || !l["@_rel"]);
        return alternate ? alternate["@_href"] : linkRaw[0]["@_href"];
    }
    return linkRaw["@_href"];
}

function getTypeContent(contentRaw: any): string {
    let text = "";
    if (typeof contentRaw === "object" && contentRaw !== null) {
        text = contentRaw["#text"] || "";
    } else {
        text = contentRaw || "";
    }
    return text.replace(/\s+/g, ' ').trim();
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