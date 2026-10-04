import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { AtomEntry, AtomFeed, RSSAuthor, RSSChannel, RSSItem, AtomAuthor, AtomCategory, AtomSource, JSONFeed, Media, MediaContent, MediaThumbnail } from "./types.js";

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
        // Keep <content> and Atom's text constructs as raw inner XML: rebuilding
        // them from the parsed object form loses sibling order and the position
        // of text among inline elements. The paths are spelled out from the root
        // so that RSS titles and descriptions keep the parser's own entity
        // decoding and CDATA unwrapping.
        stopNodes: ["*.content", ...ATOM_TEXT_CONSTRUCT_PATHS]
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
    const feedAuthors = getAtomPeople(feedRaw.author);
    const feedContributors = getAtomPeople(feedRaw.contributor);
    const feedCategories = getAtomCategories(feedRaw.category);
    const entries: AtomEntry[] = Array.isArray(feedRaw.entry)
        ? feedRaw.entry.map((entry: any) => mapAtomEntry(entry, feedBaseUrl, feedAuthors))
        : (feedRaw.entry ? [mapAtomEntry(feedRaw.entry, feedBaseUrl, feedAuthors)] : []);

    return {
        feedType: "atom",
        id: feedRaw.id,
        title: getTextConstruct(feedRaw.title),
        updated: feedRaw.updated || feedRaw.modified,
        link: resolveUrl(getLinkHref(feedRaw.link), feedBaseUrl),
        subtitle: getTextConstruct(feedRaw.subtitle || feedRaw.tagline),
        rights: feedRaw.rights ? getTextConstruct(feedRaw.rights) : (feedRaw.copyright ? getTextConstruct(feedRaw.copyright) : undefined),
        generator: getTypeContent(feedRaw.generator),
        author: feedAuthors[0],
        authors: orUndefined(feedAuthors),
        contributor: feedContributors[0],
        contributors: orUndefined(feedContributors),
        category: feedCategories[0],
        categories: orUndefined(feedCategories),
        logo: feedRaw.logo,
        icon: feedRaw.icon,
        items: entries,
        description: getTextConstruct(feedRaw.subtitle), // Map subtitle to description for BaseChannel compatibility
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

function mapAtomEntry(entryRaw: any, feedBaseUrl?: string, feedAuthors: AtomAuthor[] = []): AtomEntry {
    const entryBaseUrl = entryRaw["@_xml:base"] || feedBaseUrl;
    const ownAuthors = getAtomPeople(entryRaw.author);
    const entryAuthors = ownAuthors.length > 0 ? ownAuthors : feedAuthors;
    const entryCategories = getAtomCategories(entryRaw.category);
    const contentRaw = entryRaw.content;
    const contentType = contentRaw ? contentRaw["@_type"] : undefined;
    let contentValue = contentRaw ? getContentValue(contentRaw, contentType) : undefined;

    if (contentType === 'html' && contentValue) {
        contentValue = decodeHtmlEntities(contentValue);
    }

    return {
        id: entryRaw.id,
        title: getTextConstruct(entryRaw.title),
        updated: entryRaw.updated || entryRaw.modified,
        published: entryRaw.published || entryRaw.issued || entryRaw.created,
        link: resolveUrl(getLinkHref(entryRaw.link), entryBaseUrl),
        summary: getTextConstruct(entryRaw.summary),
        content: contentRaw ? {
            type: contentType,
            value: contentValue
        } : undefined,
        author: entryAuthors[0] || { name: "" },
        authors: orUndefined(entryAuthors),
        contributors: orUndefined(getAtomPeople(entryRaw.contributor)),
        category: entryCategories[0],
        categories: orUndefined(entryCategories),
        source: getAtomSource(entryRaw.source),
        media: parseMedia(entryRaw),
        extra: processNamespaces(entryRaw)
    };
}

/** True for the Atom text-construct types whose payload is markup, not escaped text. */
/**
 * Atom text constructs, which may hold XHTML. Spelled out per path because a
 * `*.title` wildcard would also catch RSS's own <title> elements.
 * @see https://www.rfc-editor.org/rfc/rfc4287#section-3.1
 */
const ATOM_TEXT_CONSTRUCT_PATHS = [
    "feed.title", "feed.subtitle", "feed.tagline", "feed.rights", "feed.copyright",
    "feed.entry.title", "feed.entry.summary", "feed.entry.rights",
    "feed.entry.source.title", "feed.entry.source.subtitle", "feed.entry.source.rights"
];

const CDATA_PATTERN = /^<!\[CDATA\[([\s\S]*)\]\]>$/;

/** Stop nodes keep CDATA section markers, which the parser would otherwise strip. */
function stripCdata(text: string): string {
    const match = text.match(CDATA_PATTERN);
    return match ? match[1] : text;
}

/**
 * Reads an Atom text construct parsed as a stop node. A type="xhtml" construct
 * keeps its markup verbatim; every other type is escaped text, so it still needs
 * the XML-level entity decoding the stop node skipped.
 */
function getTextConstruct(contentRaw: any): string {
    if (Array.isArray(contentRaw)) return getTextConstruct(contentRaw[0]);
    if (contentRaw === undefined || contentRaw === null) return "";

    let text: string;
    let contentType: string | undefined;

    if (typeof contentRaw === "object") {
        contentType = contentRaw["@_type"];
        const raw = contentRaw["#text"];
        // An empty element, or one carrying only attributes, has no text at all.
        if (raw === undefined || raw === null) return "";
        text = String(raw);
    } else {
        text = String(contentRaw);
    }

    text = stripCdata(text.trim());
    if (!isMarkupConstruct(contentType)) text = decodeHtmlEntities(text);
    return text.replace(/\s+/g, ' ').trim();
}

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

    // Absent parts are left off rather than set to undefined, so a name-only
    // person construct reads as { name } instead of carrying two empty keys.
    const author: AtomAuthor = { name: raw.name };
    const uri = raw.uri || raw.url;
    if (raw.email !== undefined) author.email = raw.email;
    if (uri !== undefined) author.uri = uri;
    return author;
}

/** Reads every <author> or <contributor> person construct, in document order. */
function getAtomPeople(peopleRaw: any): AtomAuthor[] {
    if (!peopleRaw) return [];
    return toArray(peopleRaw)
        .filter((raw: any) => raw && typeof raw === 'object')
        .map((raw: any) => getAtomAuthor(raw));
}

/** Reads one <category>; its data lives entirely in attributes. */
function mapAtomCategory(raw: any): AtomCategory | undefined {
    if (!raw || typeof raw !== 'object' || raw["@_term"] === undefined) return undefined;

    const category: AtomCategory = { term: String(raw["@_term"]) };
    if (raw["@_scheme"] !== undefined) category.scheme = String(raw["@_scheme"]);
    if (raw["@_label"] !== undefined) category.label = String(raw["@_label"]);
    return category;
}

/** Reads every <category>, in document order, skipping any that names no term. */
function getAtomCategories(categoryRaw: any): AtomCategory[] {
    if (!categoryRaw) return [];
    return toArray(categoryRaw)
        .map(mapAtomCategory)
        .filter((category): category is AtomCategory => category !== undefined);
}

/** undefined rather than [] so an absent element leaves the field off entirely. */
function orUndefined<T>(values: T[]): T[] | undefined {
    return values.length > 0 ? values : undefined;
}

/** An entry's <source> preserves metadata from the feed it was copied out of. */
function getAtomSource(sourceRaw: any): AtomSource | undefined {
    if (!sourceRaw) return undefined;
    const raw = Array.isArray(sourceRaw) ? sourceRaw[0] : sourceRaw;

    const subtitle = getTextConstruct(raw.subtitle || raw.tagline);
    const sourceAuthors = getAtomPeople(raw.author);
    const sourceContributors = getAtomPeople(raw.contributor);
    const sourceCategories = getAtomCategories(raw.category);
    return {
        feedType: "atom",
        id: raw.id,
        title: getTextConstruct(raw.title),
        link: getLinkHref(raw.link),
        updated: raw.updated || raw.modified,
        subtitle: subtitle,
        description: subtitle,
        rights: raw.rights ? getTextConstruct(raw.rights) : (raw.copyright ? getTextConstruct(raw.copyright) : undefined),
        generator: getTypeContent(raw.generator),
        author: sourceAuthors[0],
        authors: orUndefined(sourceAuthors),
        contributor: sourceContributors[0],
        contributors: orUndefined(sourceContributors),
        category: sourceCategories[0],
        categories: orUndefined(sourceCategories),
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
        contentEncoded: getTextValue(itemRaw['content:encoded']),
        media: parseMedia(itemRaw),
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

function getTextValue(raw: any): string | undefined {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw === "object") return raw["#text"] !== undefined ? String(raw["#text"]) : undefined;
    return String(raw);
}

function toArray(raw: any): any[] {
    if (raw === undefined || raw === null) return [];
    return Array.isArray(raw) ? raw : [raw];
}

function parseDimension(raw: any): number | undefined {
    if (raw === undefined || raw === null || raw === "") return undefined;
    const num = parseInt(String(raw), 10);
    return isNaN(num) ? undefined : num;
}

function mapMediaThumbnail(thumbRaw: any): MediaThumbnail | undefined {
    if (!thumbRaw || !thumbRaw['@_url']) return undefined;
    const thumbnail: MediaThumbnail = { url: thumbRaw['@_url'] };
    const width = parseDimension(thumbRaw['@_width']);
    const height = parseDimension(thumbRaw['@_height']);
    if (width !== undefined) thumbnail.width = width;
    if (height !== undefined) thumbnail.height = height;
    return thumbnail;
}

/**
 * Collects Media RSS elements from an item or entry. <media:group> elements
 * are flattened, and thumbnails nested inside <media:content> are included.
 * @see https://www.rssboard.org/media-rss
 */
function parseMedia(itemRaw: any): Media | undefined {
    const contents: MediaContent[] = [];
    const thumbnails: MediaThumbnail[] = [];

    const collect = (node: any) => {
        for (const contentRaw of toArray(node['media:content'])) {
            if (!contentRaw || typeof contentRaw !== 'object') continue;
            if (contentRaw['@_url']) {
                const content: MediaContent = { url: contentRaw['@_url'] };
                if (contentRaw['@_type']) content.type = contentRaw['@_type'];
                if (contentRaw['@_medium']) content.medium = contentRaw['@_medium'];
                const width = parseDimension(contentRaw['@_width']);
                const height = parseDimension(contentRaw['@_height']);
                if (width !== undefined) content.width = width;
                if (height !== undefined) content.height = height;
                contents.push(content);
            }
            for (const thumbRaw of toArray(contentRaw['media:thumbnail'])) {
                const thumbnail = mapMediaThumbnail(thumbRaw);
                if (thumbnail) thumbnails.push(thumbnail);
            }
        }
        for (const thumbRaw of toArray(node['media:thumbnail'])) {
            const thumbnail = mapMediaThumbnail(thumbRaw);
            if (thumbnail) thumbnails.push(thumbnail);
        }
    };

    collect(itemRaw);
    for (const groupRaw of toArray(itemRaw['media:group'])) {
        if (groupRaw && typeof groupRaw === 'object') collect(groupRaw);
    }

    if (contents.length === 0 && thumbnails.length === 0) return undefined;
    return { contents, thumbnails };
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

    /**
     * `parentNs` is the prefix of the nearest namespaced ancestor. processNode
     * already captured that ancestor's entire subtree, so a descendant under the
     * same prefix must not be collected again at the top level -- that is what
     * used to surface <itunes:owner>'s name and email as extra.itunes.name.
     * A descendant under a *different* prefix is still collected, so something
     * like <mi:focalRegion> inside <media:content> stays reachable as extra.mi.
     */
    const extractAndProcess = (node: any, isRoot = false, parentNs?: string) => {
        if (!node || typeof node !== 'object') return;

        for (const k in node) {
            if (isRoot && skipKeys.includes(k)) continue;
            if (k.startsWith('@_') || k === '#text') continue;

            let childNs = parentNs;

            if (k.includes(':')) {
                const [ns, prop] = k.split(/:(.+)/);
                childNs = ns;

                if (ns !== parentNs) {
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
            }

            const value = node[k];
            if (Array.isArray(value)) {
                // Not a bare reference: forEach would pass the index as isRoot.
                value.forEach((child: any) => extractAndProcess(child, false, childNs));
            } else if (typeof value === 'object') {
                extractAndProcess(value, false, childNs);
            }
        }
    };

    extractAndProcess(obj, true);
    return extra;
}