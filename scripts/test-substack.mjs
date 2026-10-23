#!/usr/bin/env node

/**
 * Regression tests for the Substack paste format.
 *
 * The editor's "copy for substack" button is the only place a post leaves the
 * site as something other than its own markdown, and nobody sees the result
 * until it is already on the clipboard. These cases pin what lands there.
 */

import { originLine, substackClipboard, substackHtml, substackText } from '../js/lib/substack.js';

const failures = [];
let checks = 0;

function check(name, condition, detail = '') {
  checks += 1;
  if (!condition) failures.push(`${name}${detail ? `\n    ${detail}` : ''}`);
}

function contains(name, source, needle, options = {}) {
  const html = substackHtml(source, options);
  check(name, html.includes(needle), `expected to contain ${JSON.stringify(needle)}\n    got ${JSON.stringify(html)}`);
}

function excludes(name, source, needle, options = {}) {
  const html = substackHtml(source, options);
  check(name, !html.includes(needle), `expected NOT to contain ${JSON.stringify(needle)}\n    got ${JSON.stringify(html)}`);
}

// The site's own rendering carries across unchanged.
contains('paragraph', 'plain words', '<p>plain words</p>');
contains('heading', '## A Section', '>A Section</h2>');
contains('blockquote', '> quoted', '<blockquote><p>quoted</p></blockquote>');
contains('bullet list', '- one\n- two', '<ul><li>one</li><li>two</li></ul>');
contains('ordered list', '1. first', '<ol><li>first</li></ol>');
contains('bold', '**b**', '<strong>b</strong>');
contains('italic', '*i*', '<em>i</em>');
contains('strikethrough', '~~gone~~', '<del>gone</del>');
contains('inline code', '`c`', '<code>c</code>');
contains('code block', '```js\nlet a = 1;\n```', '<pre><code class="language-js">let a = 1;\n</code></pre>');
contains('divider', '---', '<hr>');

// Relative targets have to become absolute: Substack cannot resolve them.
contains('image src becomes absolute', '![a](/images/blog/a.png)', 'src="https://satyam.lol/images/blog/a.png"');
contains('link href becomes absolute', '[a](/blog/other/)', 'href="https://satyam.lol/blog/other/"');
contains('an external link is left alone', '[a](https://example.com)', 'href="https://example.com"');
contains('a protocol-relative url is left alone', '![a](//cdn.example.com/a.png)', 'src="//cdn.example.com/a.png"');
contains('the origin is configurable', '![a](/images/a.png)', 'src="http://localhost:4173/images/a.png"', { origin: 'http://localhost:4173/' });

// Figures unwrap, since a pasted <figure> is not reliably understood.
excludes('no figure survives', '![Alt](/images/a.png "A caption")', '<figure>');
contains('the image is kept in a block', '![Alt](/images/a.png "A caption")', '<p><img src="https://satyam.lol/images/a.png"');
contains('the caption follows in italics', '![Alt](/images/a.png "A caption")', '<p><em>A caption</em></p>');
contains('an uncaptioned image is still a block', '![Alt](/images/a.png)', '<p><img src="https://satyam.lol/images/a.png" alt="Alt"></p>');

// Attributes the site needs and an editor does not.
excludes('loading hint is dropped', '![a](/images/a.png)', 'loading=');
excludes('decoding hint is dropped', '![a](/images/a.png)', 'decoding=');
excludes('heading ids are dropped', '## A Section', 'id="a-section"');
excludes('link target is dropped', '[a](https://example.com)', 'target=');
excludes('link rel is dropped', '[a](https://example.com)', 'rel=');

// The line back to the original.
const canonical = 'https://satyam.lol/blog/a-post/';
contains('the canonical line is appended', 'words', 'Originally published at', { canonical });
contains('the canonical line links the post', 'words', `<a href="${canonical}">${canonical}</a>`, { canonical });
excludes('no canonical, no line', 'words', 'Originally published');
check('originLine is a rule and a line', originLine(canonical).startsWith('<hr>'), originLine(canonical));

// The plain-text flavour stays markdown, with absolute targets.
const text = substackText('![a](/images/a.png) and [b](/blog/b/)', { canonical });
check('text keeps markdown', text.includes('![a](https://satyam.lol/images/a.png)'), text);
check('text makes links absolute', text.includes('[b](https://satyam.lol/blog/b/)'), text);
check('text carries the canonical line', text.includes(`Originally published at ${canonical}`), text);
check('an external link is untouched in text', substackText('[b](https://example.com)').includes('[b](https://example.com)'));

const clipboard = substackClipboard('words', { canonical });
check('the clipboard carries both flavours', clipboard.html.startsWith('<p>words</p>') && clipboard.text.startsWith('words'), JSON.stringify(clipboard));

// Raw HTML in a post stays escaped on the way out, exactly as it does on the site.
check('raw html stays escaped', substackHtml('<script>alert(1)</script>').includes('&lt;script&gt;'), substackHtml('<script>alert(1)</script>'));

if (failures.length) {
  console.error(`Substack format failed ${failures.length} of ${checks} checks:`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Substack format passed ${checks} checks.`);
