// What search engines and feed readers read: sitemap, robots rules, and the news feed (NFR-11).
import { esc } from './lib/html.mjs';
import { plain } from './components.mjs';

export function sitemapXml(c, pages) {
  const urls = pages
    .filter((pg) => !pg.noindex)
    .map((pg) => {
      const item = c.news.find((n) => pg.path === `/news/${n.slug}/`);
      return `  <url><loc>${esc(c.siteUrl + pg.path)}</loc>${item ? `<lastmod>${item.date}</lastmod>` : ''}</url>`;
    });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}

export function robotsTxt(c) {
  if (!c.production) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\n\nSitemap: ${c.siteUrl}/sitemap.xml\n`;
}

export function atomFeed(c) {
  const name = esc(plain(c.site.name));
  const base = c.siteUrl;
  const updated = c.news.length ? `${c.news[0].date}T00:00:00Z` : c.now.toISOString();
  const entries = c.news.map(
    (n) => `  <entry>
    <title>${esc(plain(n.title))}</title>
    <id>${esc(`${base}/news/${n.slug}/`)}</id>
    <link href="${esc(`${base}/news/${n.slug}/`)}"/>
    <updated>${n.date}T00:00:00Z</updated>
    <summary>${esc(plain(n.summary))}</summary>
  </entry>`,
  );
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>News from ${name}</title>
  <id>${esc(`${base}/feed.xml`)}</id>
  <link rel="self" href="${esc(`${base}/feed.xml`)}"/>
  <link href="${esc(`${base}/news/`)}"/>
  <updated>${updated}</updated>
${entries.join('\n')}
</feed>
`;
}
