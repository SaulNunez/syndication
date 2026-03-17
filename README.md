# Syndication
![GitHub Actions Workflow Status](https://img.shields.io/github/actions/workflow/status/SaulNunez/syndication/test.yml)

_Syndication is the practice making content available outside of it's original source, allowing the content owners to reach a wide audience. In the web examples of this are web feeds, using protocols like RSS and Atom._

Syndication is a library for parsing RSS and Atom feeds into Javascript objects ready to use.

Current supported protocols:
- RSS 2.0
- Atom (0.3, 1.0, 1.1)
- JSON Feed (1.0, 1.1)

## Usage

### Non-standard properties
It supports processing podcast feeds, as well as allow access to any properties that are additional to the standard RSS and Atom protocols.

### iTunes Podcast Support
It supports processing iTunes podcast feeds.

For accesing propierties in the iTunes namespace, you can use the `itunes` property.

```typescript
const rss = parseFeed(sample) as RSSFeed;
console.log(rss.itunes?.image);

const entry = rss.items[0];
console.log(entry.itunes?.episode);
console.log(entry.itunes?.season);
```

### Additional fields
It supports processing additional fields in RSS feeds.

```typescript
const atom = parseFeed(sample) as AtomFeed;
console.log(atom.extra);

const entry = atom.items[0];
console.log(entry.extra);
```
If you know your feed has a specific namespace, like `atom`, you can access that property using the extra property in the object. Inside the extra property, the namespaces are stored as keys, and the values are the values of the properties in the namespace.

```typescript
const rss = parseFeed(sample) as RSSFeed;
console.log(rss.extra?.atom?.title);
```

