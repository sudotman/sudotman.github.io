/**
 * Prepares a post for pasting into Substack.
 *
 * Substack's editor is ProseMirror, and it reads the `text/html` flavour of a
 * paste. So the cheapest honest way to mirror a post there is to hand the
 * clipboard the same HTML the site publishes, lightly adjusted for an editor
 * that is not this one, and let the author paste it. No API, no session
 * cookie, no private endpoint that can change under us.
 *
 * The HTML comes from `markdown.js`, so a post looks on Substack like it looks
 * on satyam.lol. Everything here is a small correction on top of that:
 *
 * - relative URLs become absolute, since Substack cannot resolve `/images/…`
 * - figures unwrap, because a pasted `<figure>` is not reliably understood
 * - rendering hints the site needs and an editor does not are dropped
 * - the post ends pointing back at its canonical page
 */

import { renderMarkdown } from './markdown.js';

export const SITE = 'https://satyam.lol';

/** Attributes that mean something to the site's pages and nothing in a paste. */
const DROPPED = /\s(?:loading|decoding|target|rel|id)="[^"]*"/g;

function absolute(html, origin) {
  // A leading single slash is site-root relative. `//host` is already absolute.
  return String(html).replace(/\s(src|href)="\/(?!\/)([^"]*)"/g, (match, attribute, rest) => ` ${attribute}="${origin}/${rest}"`);
}

/**
 * Figures become an image followed by its caption in italics, which is what
 * Substack's own caption looks like once the paste lands.
 */
function unwrapFigures(html) {
  return String(html).replace(/<figure>([\s\S]*?)<\/figure>/g, (match, inner) => {
    const image = inner.match(/<img\s[^>]*>/)?.[0] || '';
    const caption = inner.match(/<figcaption>([\s\S]*?)<\/figcaption>/)?.[1] || '';
    if (!image) return '';
    return caption ? `<p>${image}</p>\n<p><em>${caption}</em></p>` : `<p>${image}</p>`;
  });
}

/** The line that keeps satyam.lol the original wherever a post is mirrored. */
export function originLine(url) {
  return `<hr>\n<p><em>Originally published at <a href="${url}">${url}</a>.</em></p>`;
}

/**
 * Renders a post body as the HTML to put on the clipboard.
 *
 * `canonical` is the post's page on the site. When it is given, the HTML ends
 * with a line linking back to it.
 */
export function substackHtml(markdown = '', { origin = SITE, canonical = '' } = {}) {
  let html = renderMarkdown(markdown).html;
  html = unwrapFigures(html);
  html = absolute(html, origin.replace(/\/+$/, ''));
  html = html.replace(DROPPED, '');
  if (canonical) html += `\n${originLine(canonical)}`;
  return html;
}

/**
 * The plain-text flavour of the same copy. Markdown is more useful than
 * stripped prose anywhere the rich paste does not land, so it is the source
 * with its image and link targets made absolute.
 */
export function substackText(markdown = '', { origin = SITE, canonical = '' } = {}) {
  const base = origin.replace(/\/+$/, '');
  const text = String(markdown)
    .replace(/(!?\[[^\]]*\]\()\/(?!\/)/g, (match, head) => `${head}${base}/`)
    .trim();
  return canonical ? `${text}\n\n---\n\n*Originally published at ${canonical}.*\n` : `${text}\n`;
}

/** What a post would carry onto the clipboard, both flavours at once. */
export function substackClipboard(markdown = '', options = {}) {
  return {
    html: substackHtml(markdown, options),
    text: substackText(markdown, options)
  };
}
