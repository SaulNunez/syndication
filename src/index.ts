import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { AtomEntry, AtomFeed, RSSAuthor, RSSChannel, RSSItem, AtomAuthor, AtomCategory } from "./types.js";

const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

export function parseFeed(rssString: string): RSSChannel | AtomFeed {
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
        copyright: channelRaw.copyright,
        managingEditor: channelRaw.managingEditor ? (getAuthorInfo(channelRaw.managingEditor) as RSSAuthor) : undefined,
        webMaster: channelRaw.webMaster ? (getAuthorInfo(channelRaw.webMaster) as RSSAuthor) : undefined,
        items: items,
        extra: processNamespaces(channelRaw)
    };

    const itunes = processChannelItunes(channelRaw);
    if (itunes) {
        channel.itunes = itunes;
    }

    return channel;
}

function parseAtom(feedRaw: any): AtomFeed {
    const feedBaseUrl = feedRaw["@_xml:base"];
    const entries: AtomEntry[] = Array.isArray(feedRaw.entry)
        ? feedRaw.entry.map((entry: any) => mapAtomEntry(entry, feedBaseUrl))
        : (feedRaw.entry ? [mapAtomEntry(feedRaw.entry, feedBaseUrl)] : []);

    return {
        id: feedRaw.id,
        title: getTypeContent(feedRaw.title),
        updated: feedRaw.updated || feedRaw.modified,
        link: resolveUrl(getLinkHref(feedRaw.link), feedBaseUrl),
        subtitle: getTypeContent(feedRaw.subtitle || feedRaw.tagline),
        rights: feedRaw.rights ? getTypeContent(feedRaw.rights) : (feedRaw.copyright ? getTypeContent(feedRaw.copyright) : undefined),
        generator: getTypeContent(feedRaw.generator),
        author: feedRaw.author ? getAtomAuthor(feedRaw.author) : undefined,
        logo: feedRaw.logo,
        icon: feedRaw.icon,
        items: entries,
        description: getTypeContent(feedRaw.subtitle), // Map subtitle to description for BaseChannel compatibility
        extra: processNamespaces(feedRaw)
    };
}

function mapAtomEntry(entryRaw: any, feedBaseUrl?: string): AtomEntry {
    const entryBaseUrl = entryRaw["@_xml:base"] || feedBaseUrl;
    const contentRaw = entryRaw.content;
    const contentType = contentRaw ? contentRaw["@_type"] : undefined;
    let contentValue = contentRaw ? getContentValue(contentRaw) : undefined;

    if (contentType === 'html' && contentValue) {
        contentValue = decodeHtmlEntities(contentValue);
    }

    return {
        id: entryRaw.id,
        title: getTypeContent(entryRaw.title),
        updated: entryRaw.updated || entryRaw.modified,
        published: entryRaw.published || entryRaw.issued || entryRaw.created,
        link: resolveUrl(getLinkHref(entryRaw.link), entryBaseUrl),
        summary: getTypeContent(entryRaw.summary),
        content: contentRaw ? {
            type: contentType,
            value: contentValue
        } : undefined,
        author: entryRaw.author ? getAtomAuthor(entryRaw.author) : { name: "" },
        contributors: entryRaw.contributor ? (Array.isArray(entryRaw.contributor) ? entryRaw.contributor.map(getAtomAuthor) : [getAtomAuthor(entryRaw.contributor)]) : undefined,
        extra: processNamespaces(entryRaw)
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
        uri: authorRaw.uri || authorRaw.url
    };
}

function getLinkHref(linkRaw: any): string | undefined {
    if (!linkRaw) return undefined;
    if (Array.isArray(linkRaw)) {
        const alternate = linkRaw.find((l: any) => l["@_rel"] === "alternate" || !l["@_rel"]);
        return alternate ? alternate["@_href"] : linkRaw[0]["@_href"];
    }
    return linkRaw["@_href"];
}

function resolveUrl(url: string | undefined, baseUrl: string | undefined): string | undefined {
    if (!url) return undefined;
    if (!baseUrl) return url;
    try {
        return new URL(url, baseUrl).href;
    } catch (e) {
        return url;
    }
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
    const item: RSSItem = {
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
        extra: processNamespaces(itemRaw)
    };

    const itunes = processItemItunes(itemRaw);
    if (itunes) {
        item.itunes = itunes;
    }

    return item;
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

function decodeHtmlEntities(str: string): string {
    const namedEntities: { [key: string]: string } = {
        '&quot;': '"',
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&apos;': "'"
    };
    return str.replace(/&#(\d+);/g, (_match, dec) => String.fromCharCode(parseInt(dec, 10)))
        .replace(/&#x([0-9A-Fa-f]+);/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&[a-z]+;/g, (match) => namedEntities[match] || match);
}

function parseItunesCategories(categoryRaw: any): string[] {
    if (!categoryRaw) return [];
    const categories: string[] = [];
    const processCategory = (cat: any) => {
        if (!cat) return;
        if (cat["@_text"]) {
            categories.push(cat["@_text"]);
        }
        if (cat["itunes:category"]) {
            if (Array.isArray(cat["itunes:category"])) {
                cat["itunes:category"].forEach(processCategory);
            } else {
                processCategory(cat["itunes:category"]);
            }
        }
    };
    if (Array.isArray(categoryRaw)) {
        categoryRaw.forEach(processCategory);
    } else {
        processCategory(categoryRaw);
    }
    return categories;
}

function parseItunesDuration(durationRaw: any): number | undefined {
    if (durationRaw === undefined || durationRaw === null) return undefined;
    if (typeof durationRaw === 'number') return durationRaw;
    const parts = String(durationRaw).split(':').map(Number);
    if (parts.some(isNaN)) return undefined;

    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
        return parts[0] * 60 + parts[1];
    } else if (parts.length === 1) {
        return parts[0];
    }
    return undefined;
}

function parseItunesExplicit(explicitRaw: any): boolean | undefined {
    if (explicitRaw === undefined || explicitRaw === null) return undefined;
    if (typeof explicitRaw === 'boolean') return explicitRaw;
    const str = String(explicitRaw).toLowerCase();
    if (str === 'yes' || str === 'true') return true;
    if (str === 'no' || str === 'false') return false;
    return undefined;
}

function parseItunesEpisode(episodeRaw: any): number | undefined {
    if (episodeRaw === undefined || episodeRaw === null) return undefined;
    if (typeof episodeRaw === 'number') return episodeRaw;
    const num = Number(episodeRaw);
    return isNaN(num) ? undefined : num;
}

function processChannelItunes(channelRaw: any) {
    const itunesFields: any = {
        author: channelRaw['itunes:author'],
        categories: parseItunesCategories(channelRaw['itunes:category']),
        explicit: parseItunesExplicit(channelRaw['itunes:explicit']),
        image: channelRaw['itunes:image'] ? channelRaw['itunes:image']['@_href'] : undefined,
        keywords: channelRaw['itunes:keywords'],
        type: channelRaw['itunes:type']
    };

    if (itunesFields.categories.length === 0) {
        delete itunesFields.categories;
    }

    Object.keys(itunesFields).forEach((key) => {
        if (itunesFields[key] === undefined) {
            delete itunesFields[key];
        }
    });

    if (Object.keys(itunesFields).length > 0) {
        return itunesFields;
    }
    return undefined;
}

function processItemItunes(itemRaw: any) {
    const itunesFields: any = {
        title: itemRaw['itunes:title'],
        season: parseItunesEpisode(itemRaw['itunes:season']),
        episode: parseItunesEpisode(itemRaw['itunes:episode']),
        episodeType: itemRaw['itunes:episodeType'],
        duration: parseItunesDuration(itemRaw['itunes:duration']),
        explicit: parseItunesExplicit(itemRaw['itunes:explicit']),
    };

    Object.keys(itunesFields).forEach((key) => {
        if (itunesFields[key] === undefined) {
            delete itunesFields[key];
        }
    });

    if (Object.keys(itunesFields).length > 0) {
        return itunesFields;
    }
    return undefined;
}

function processNamespaces(obj: any): any {
    const extra: any = {};

    const processNode = (node: any, currentNs: string): any => {
        if (node === null || node === undefined) return node;
        if (Array.isArray(node)) return node.map(n => processNode(n, currentNs));
        if (typeof node !== 'object') return String(node);

        const attributes: any = {};
        const children: any = {};
        let hasAttrs = false;
        let hasChildren = false;

        for (const k in node) {
            if (k.startsWith('@_')) {
                attributes[k.substring(2)] = String(node[k]);
                hasAttrs = true;
            } else if (k === '#text') {
                // Ignore mixed text or keep if needed
            } else {
                hasChildren = true;
                const childNsMatch = k.indexOf(':');
                let childNs = currentNs;
                let childProp = k;
                if (childNsMatch > 0) {
                    childNs = k.substring(0, childNsMatch);
                    childProp = k.substring(childNsMatch + 1);
                }

                const processedChild = processNode(node[k], childNs);

                if (childNs === currentNs) {
                    children[childProp] = processedChild;
                } else {
                    if (!children[childNs]) children[childNs] = {};
                    children[childNs][childProp] = processedChild;
                }
            }
        }

        if (hasAttrs && hasChildren) {
            return { ...attributes, children };
        } else if (hasAttrs && !hasChildren) {
            if (node['#text']) return { ...attributes, text: String(node['#text']) };
            return attributes;
        } else if (!hasAttrs && hasChildren) {
            return children;
        } else {
            return String(node['#text'] || '');
        }
    };

    const extractAndProcess = (node: any) => {
        if (!node || typeof node !== 'object') return;

        for (const k in node) {
            if (k.includes(':') && !k.startsWith('@_')) {
                const [ns, prop] = k.split(/:(.+)/);
                if (!extra[ns]) extra[ns] = {};

                const processed = processNode(node[k], ns);

                if (extra[ns][prop]) {
                    if (Array.isArray(extra[ns][prop])) {
                        extra[ns][prop].push(processed);
                    } else {
                        extra[ns][prop] = [extra[ns][prop], processed];
                    }
                } else {
                    extra[ns][prop] = processed;
                }
            }

            if (Array.isArray(node[k])) {
                node[k].forEach(extractAndProcess);
            } else if (typeof node[k] === 'object') {
                extractAndProcess(node[k]);
            }
        }
    };

    extractAndProcess(obj);
    return extra;
}