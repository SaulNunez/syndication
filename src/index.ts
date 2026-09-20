import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { AtomEntry, AtomFeed, RSSAuthor, RSSChannel, RSSItem, AtomAuthor, AtomCategory, AtomSource, JSONFeed } from "./types.js";

const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_"
});

export function parseFeed(rssString: string): RSSChannel | AtomFeed | JSONFeed {
    // Attempt to parse as JSON first
    try {
        const parsedJson = JSON.parse(rssString);
        if (parsedJson && parsedJson.version && typeof parsedJson.version === 'string' && parsedJson.version.includes("https://jsonfeed.org/version/")) {
            return parseJSONFeed(parsedJson);
        }
    } catch (e) {
        // Not JSON, continue to XML parsing
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        textNodeName: "#text",
        // Keep <content> as raw inner XML: rebuilding it from the parsed object
        // form loses sibling order and the position of text among inline elements.
        stopNodes: ["*.content"]
    });

    let parsed: any;
    try {
        parsed = parser.parse(rssString);
    } catch (e) {
        throw new Error(`Failed to parse feed: input is not valid XML (${e instanceof Error ? e.message : String(e)})`);
    }

    if (parsed.feed) {
        return parseAtom(parsed.feed);
    }

    if (!parsed.rss || !parsed.rss.channel) {
        throw new Error("Failed to parse feed: input is not a recognized RSS or Atom feed");
    }

    const channelRaw = parsed.rss.channel;

    const items: RSSItem[] = Array.isArray(channelRaw.item)
        ? channelRaw.item.map(mapItem)
        : (channelRaw.item ? [mapItem(channelRaw.item)] : []);

    const channel: RSSChannel = {
        feedType: "rss",
        title: channelRaw.title,
        link: channelRaw.link,
        description: channelRaw.description,
        language: channelRaw.language,
        pubDate: channelRaw.pubDate,
        lastBuildDate: channelRaw.lastBuildDate,
        docs: channelRaw.docs,
        generator: channelRaw.generator,
        ttl: parseTtl(channelRaw.ttl),
        copyright: channelRaw.copyright,
        managingEditor: channelRaw.managingEditor ? (getAuthorInfo(channelRaw.managingEditor) as RSSAuthor) : undefined,
        webMaster: channelRaw.webMaster ? (getAuthorInfo(channelRaw.webMaster) as RSSAuthor) : undefined,
        image: mapChannelImage(channelRaw.image),
        items: items,
        // <item> is excluded so an item's namespaces stay on the item.
        extra: processNamespaces(channelRaw, ["item"])
    };

    const itunes = processChannelItunes(channelRaw);
    if (itunes) {
        channel.itunes = itunes;
    }

    return channel;
}

function parseAtom(feedRaw: any): AtomFeed {
    const feedBaseUrl = feedRaw["@_xml:base"];
    // RFC 4287 4.2.1: an entry with no author of its own inherits the feed's.
    const feedAuthor = feedRaw.author ? getAtomAuthor(feedRaw.author) : undefined;
    const entries: AtomEntry[] = Array.isArray(feedRaw.entry)
        ? feedRaw.entry.map((entry: any) => mapAtomEntry(entry, feedBaseUrl, feedAuthor))
        : (feedRaw.entry ? [mapAtomEntry(feedRaw.entry, feedBaseUrl, feedAuthor)] : []);

    return {
        feedType: "atom",
        id: feedRaw.id,
        title: getTypeContent(feedRaw.title),
        updated: feedRaw.updated || feedRaw.modified,
        link: resolveUrl(getLinkHref(feedRaw.link), feedBaseUrl),
        subtitle: getTypeContent(feedRaw.subtitle || feedRaw.tagline),
        rights: feedRaw.rights ? getTypeContent(feedRaw.rights) : (feedRaw.copyright ? getTypeContent(feedRaw.copyright) : undefined),
        generator: getTypeContent(feedRaw.generator),
        author: feedAuthor,
        category: getAtomCategory(feedRaw.category),
        logo: feedRaw.logo,
        icon: feedRaw.icon,
        items: entries,
        description: getTypeContent(feedRaw.subtitle), // Map subtitle to description for BaseChannel compatibility
        // <entry> is excluded so an entry's namespaces stay on the entry.
        extra: processNamespaces(feedRaw, ["entry"])
    };
}

function parseJSONFeed(feedRaw: any): JSONFeed {
    return {
        feedType: "json",
        version: feedRaw.version,
        title: feedRaw.title,
        link: feedRaw.home_page_url || "", // Map home_page_url to link for BaseChannel compatibility
        description: feedRaw.description,
        home_page_url: feedRaw.home_page_url,
        feed_url: feedRaw.feed_url,
        next_url: feedRaw.next_url,
        icon: feedRaw.icon,
        favicon: feedRaw.favicon,
        authors: feedRaw.authors || (feedRaw.author ? [feedRaw.author] : undefined), //Adding compatibility with 1.0 JSON Feed
        language: feedRaw.language,
        expired: feedRaw.expired,
        items: Array.isArray(feedRaw.items) ? feedRaw.items.map(mapJSONFeedItem) : [],
    };
}

function mapJSONFeedItem(itemRaw: any): any {
    return {
        id: itemRaw.id,
        title: itemRaw.title || "", // BaseItem compatibility
        link: itemRaw.url || "", // BaseItem compatibility
        content_text: itemRaw.content_text,
        content_html: itemRaw.content_html,
        url: itemRaw.url,
        external_url: itemRaw.external_url,
        summary: itemRaw.summary,
        image: itemRaw.image,
        banner_image: itemRaw.banner_image,
        date_published: itemRaw.date_published,
        date_modified: itemRaw.date_modified,
        authors: itemRaw.authors || (itemRaw.author ? [itemRaw.author] : undefined),
        tags: itemRaw.tags,
        attachments: itemRaw.attachments,
    };
}

function mapAtomEntry(entryRaw: any, feedBaseUrl?: string, feedAuthor?: AtomAuthor): AtomEntry {
    const entryBaseUrl = entryRaw["@_xml:base"] || feedBaseUrl;
    const contentRaw = entryRaw.content;
    const contentType = contentRaw ? contentRaw["@_type"] : undefined;
    let contentValue = contentRaw ? getContentValue(contentRaw, contentType) : undefined;

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
        author: entryRaw.author ? getAtomAuthor(entryRaw.author) : (feedAuthor || { name: "" }),
        contributors: entryRaw.contributor ? (Array.isArray(entryRaw.contributor) ? entryRaw.contributor.map(getAtomAuthor) : [getAtomAuthor(entryRaw.contributor)]) : undefined,
        category: getAtomCategory(entryRaw.category),
        source: getAtomSource(entryRaw.source),
        extra: processNamespaces(entryRaw)
    };
}

/** True for the Atom text-construct types whose payload is markup, not escaped text. */
function isMarkupConstruct(contentType?: string): boolean {
    return typeof contentType === "string" && (contentType === "xhtml" || contentType.includes("xml"));
}

function getContentValue(contentRaw: any, contentType?: string): string {
    if (typeof contentRaw === "string") return decodeHtmlEntities(contentRaw);

    if (contentRaw["#text"] !== undefined && contentRaw["#text"] !== null) {
        // fast-xml-parser trims ordinary text nodes but not stop nodes, so the
        // indentation around the element has to be dropped here to match.
        const text = String(contentRaw["#text"]).trim();
        // Markup constructs keep their entities, which belong to the markup. For
        // escaped types the raw text still carries the XML-level entities that
        // fast-xml-parser would have resolved had this not been a stop node.
        return isMarkupConstruct(contentType) ? text : decodeHtmlEntities(text);
    }

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
    // Atom permits several <author> elements; the declared type holds one, so
    // take the first rather than reading fields off the array.
    const raw = Array.isArray(authorRaw) ? authorRaw[0] : authorRaw;
    return {
        name: raw.name,
        email: raw.email,
        uri: raw.uri || raw.url
    };
}

/** Reads the first <category>; its data lives entirely in attributes. */
function getAtomCategory(categoryRaw: any): AtomCategory | undefined {
    if (!categoryRaw) return undefined;
    const raw = Array.isArray(categoryRaw) ? categoryRaw[0] : categoryRaw;
    if (!raw || raw["@_term"] === undefined) return undefined;

    const category: AtomCategory = { term: String(raw["@_term"]) };
    if (raw["@_scheme"] !== undefined) category.scheme = String(raw["@_scheme"]);
    if (raw["@_label"] !== undefined) category.label = String(raw["@_label"]);
    return category;
}

/** An entry's <source> preserves metadata from the feed it was copied out of. */
function getAtomSource(sourceRaw: any): AtomSource | undefined {
    if (!sourceRaw) return undefined;
    const raw = Array.isArray(sourceRaw) ? sourceRaw[0] : sourceRaw;

    const subtitle = getTypeContent(raw.subtitle || raw.tagline);
    return {
        feedType: "atom",
        id: raw.id,
        title: getTypeContent(raw.title),
        link: getLinkHref(raw.link),
        updated: raw.updated || raw.modified,
        subtitle: subtitle,
        description: subtitle,
        rights: raw.rights ? getTypeContent(raw.rights) : (raw.copyright ? getTypeContent(raw.copyright) : undefined),
        generator: getTypeContent(raw.generator),
        author: raw.author ? getAtomAuthor(raw.author) : undefined,
        category: getAtomCategory(raw.category),
        logo: raw.logo,
        icon: raw.icon
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
    // A repeated element arrives as an array; the declared types hold one value.
    if (Array.isArray(contentRaw)) return getTypeContent(contentRaw[0]);

    let text = "";
    if (typeof contentRaw === "object" && contentRaw !== null) {
        text = contentRaw["#text"] || "";
        // A type="xhtml" text construct carries child elements instead of text,
        // so fall back to the serialized children rather than dropping it.
        if (!text) {
            text = getContentValue(contentRaw) || "";
        }
    } else {
        text = contentRaw || "";
    }
    return text.replace(/\s+/g, ' ').trim();
}

function mapItem(itemRaw: any): RSSItem {
    // RSS allows several enclosures per item in the wild; keep the first.
    const enclosureRaw = Array.isArray(itemRaw.enclosure) ? itemRaw.enclosure[0] : itemRaw.enclosure;

    const item: RSSItem = {
        title: itemRaw.title,
        link: itemRaw.link,
        description: itemRaw.description,
        author: itemRaw.author ? (getAuthorInfo(itemRaw.author) as RSSAuthor) : undefined,
        comments: itemRaw.comments,
        pubDate: itemRaw.pubDate,
        guid: itemRaw.guid ? (typeof itemRaw.guid === 'object' ? itemRaw.guid['#text'] : itemRaw.guid) : undefined,
        enclosure: enclosureRaw ? {
            url: enclosureRaw['@_url'],
            length: parseEnclosureLength(enclosureRaw['@_length']),
            type: enclosureRaw['@_type']
        } : undefined,
        extra: processNamespaces(itemRaw)
    };

    const itunes = processItemItunes(itemRaw);
    if (itunes) {
        item.itunes = itunes;
    }

    return item;
}

/** `<ttl>` is optional and defaults to 60; a literal 0 is a real value, not an absence. */
function parseTtl(ttlRaw: any): number {
    if (ttlRaw === undefined || ttlRaw === null || ttlRaw === "") return 60;
    const ttl = Number(ttlRaw);
    return isNaN(ttl) ? 60 : ttl;
}

/** `length` is required by the spec but routinely omitted; report that as undefined, not NaN. */
function parseEnclosureLength(lengthRaw: any): number | undefined {
    if (lengthRaw === undefined || lengthRaw === null || lengthRaw === "") return undefined;
    const length = Number(lengthRaw);
    return isNaN(length) ? undefined : length;
}

function mapChannelImage(imageRaw: any): RSSChannel["image"] {
    if (!imageRaw) return undefined;
    const raw = Array.isArray(imageRaw) ? imageRaw[0] : imageRaw;
    return {
        url: raw.url,
        title: raw.title,
        link: raw.link
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

/**
 * Collects every namespaced element below `obj` into a bag keyed by prefix.
 * `skipKeys` names direct children to leave out entirely -- the channel/feed
 * passes its item/entry key so that an item's namespaces are not also
 * attributed to its channel.
 */
function processNamespaces(obj: any, skipKeys: string[] = []): any {
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

    const extractAndProcess = (node: any, isRoot = false) => {
        if (!node || typeof node !== 'object') return;

        for (const k in node) {
            if (isRoot && skipKeys.includes(k)) continue;

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
                // Not a bare reference: forEach would pass the index as isRoot.
                node[k].forEach((child: any) => extractAndProcess(child));
            } else if (typeof node[k] === 'object') {
                extractAndProcess(node[k]);
            }
        }
    };

    extractAndProcess(obj, true);
    return extra;
}