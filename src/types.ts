interface BaseChannel {
    /** The name of the channel. */
    title: string;
    /** The URL to the HTML website corresponding to the channel. */
    link: string;
    /** Phrase or sentence describing the channel. */
    description: string;
}

interface BaseItem {
    /** The title of the item. */
    title: string;
    /** The URL of the item. */
    link: string;

}

/**
 * Represents an RSS 2.0 Channel.
 * @see https://www.rssboard.org/rss-2-0#channel
 */
export interface RSSChannel extends BaseChannel {
    /** The language the channel is written in. */
    language?: string;
    /** The publication date for the content in the channel. */
    pubDate?: string;
    /** The last time the content of the channel changed. */
    lastBuildDate?: string;
    /** "Time to Live". It's a number of minutes that indicates how long a channel can be cached before refreshing from the source. */
    ttl: number;
    /** Specifies a GIF, JPEG or PNG image that can be displayed with the channel. */
    image?: {
        /** The URL of a GIF, JPEG or PNG image that represents the channel. */
        url: string;
        /** Describes the image, it's used in the ALT attribute of the HTML <img> tag when the channel is rendered in HTML. */
        title: string;
        /** The URL of the site, when the channel is rendered, the image is a link to the site. */
        link: string;
    };
    managingEditor?: RSSAuthor;
    webMaster?: RSSAuthor;
    docs?: string;
    generator?: string;
    items: RSSItem[];
    extra: Record<string, any>;
}

export interface RSSAuthor {
    name: string;
    email: string;
}

/**
 * Describes a media object that is attached to the item.
 * @see https://www.rssboard.org/rss-2-0#ltenclosuregtSubelementOfLtitemgt
 */
interface Enclosure {
    /** Where the enclosure is located. */
    url: string;
    /** How big it is in bytes. */
    length: number;
    /** Standard MIME type. */
    type: string;
}

/**
 * Represents an item in an RSS 2.0 channel.
 * @see https://www.rssboard.org/rss-2-0#hrelementsOfLtitemgt
 */
export interface RSSItem extends BaseItem {
    /** Email address of the author of the item. */
    author?: RSSAuthor;
    /** Indicates when the item was published. */
    pubDate?: string;
    /** A string that uniquely identifies the item. */
    guid?: string;
    /** URL of a page for comments relating to the item. */
    comments?: string;
    /** Describes a media object that is attached to the item. */
    enclosure?: Enclosure;
    /** The item synopsis. */
    description: string;
    extra: Record<string, any>;
}

/**
 * Represents a category in an Atom feed.
 * @see https://www.rfc-editor.org/rfc/rfc4287#section-4.2.2
 */
export interface AtomCategory {
    /** Identifies the category to which the entry or feed belongs. */
    term: string;
    /** Identifies a categorization scheme via a URI. */
    scheme?: string;
    /** Provides a human-readable label for display in end-user applications. */
    label?: string;

}

/**
 * Represents the content of an Atom entry.
 * @see https://www.rfc-editor.org/rfc/rfc4287#section-4.1.3
 */
export interface AtomContent {
    /** The type of the content (e.g., "text", "html", "xhtml"). */
    type: string;
    /** The actual content. */
    value: string;
}

/**
 * Represents a Person construct in Atom.
 * @see https://www.rfc-editor.org/rfc/rfc4287#section-3.2
 */
interface AtomAuthor {
    /** A human-readable name for the person. */
    name: string;
    /** An email address for the person. */
    email?: string;
    /** An IRI associated with the person. */
    uri?: string;
}

/**
 * Base interface for Atom Feed and Source elements.
 * @see https://www.rfc-editor.org/rfc/rfc4287#section-4.1.1
 */
interface AtomSource extends BaseChannel {
    /** The author of the feed. */
    author?: AtomAuthor;
    /** Categories associated with the feed. */
    category?: AtomCategory;
    /** People who contributed to the feed. */
    contributor?: AtomAuthor;
    /** Identifies the software used to generate the feed. */
    generator?: string;
    /** An IRI reference to an icon representing the feed. */
    icon?: string;
    /** A permanent, universally unique identifier for the feed. */
    id: string;
    /** An IRI reference to an image that provides a visual representation of the feed. */
    logo?: string;
    /** Information about rights held in and over the feed. */
    rights?: string;
    /** A human-readable description or subtitle for the feed. */
    subtitle?: string;
    /** The most recent instant in time when the feed was modified in a way the publisher considers significant. */
    updated?: string;
}

/**
 * Represents an Atom Feed.
 * @see https://www.rfc-editor.org/rfc/rfc4287#section-4.1.1
 */
export interface AtomFeed extends AtomSource {
    /** The time of the initial creation or first availability of the feed. */
    published?: string;
    /** Content of the feed. */
    content?: AtomContent;
    /** The entries in the feed. */
    entries: AtomEntry[];
}

/**
 * Represents an Atom Entry.
 * @see https://www.rfc-editor.org/rfc/rfc4287#section-4.1.2
 */
export interface AtomEntry extends BaseItem {
    /** Contains or links to the complete content of the entry. */
    content?: AtomContent;
    /** The time of the initial creation or first availability of the entry. */
    published?: string;
    /** The most recent instant in time when the entry was modified in a way the publisher considers significant. */
    updated?: string;
    /** A short summary, abstract, or excerpt of the entry. */
    summary?: string;
    extra: Record<string, any>;
    /** If an entry is copied from one feed into another, the source element preserves metadata from the source feed. */
    source?: AtomSource;
    id: string;
    author: AtomAuthor;
    contributors?: AtomAuthor[];
}