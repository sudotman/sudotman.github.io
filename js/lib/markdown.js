/**
 * Markdown renderer shared by the blog build script and the browser editor.
 *
 * Dependency-free and ESM-only so `scripts/build-blog.mjs` can import the exact
 * code the editor previews with. If the two ever drift, the preview stops
 * telling the truth about the published page.
 *
 * Raw HTML in source is escaped rather than passed through. Posts are authored
 * in this repository, but the editor also renders pasted text from anywhere,
 * and one renderer with two safety modes is a rule nobody remembers to follow.
 */

const MARK = '\u0000';
const QUOTE_MARK = '(?:"|&quot;|\'|&#39;)';
const HARD_BREAK = /(?: {2,}|\\)$/;

export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Returns the href unchanged when it is safe to emit, or '' when it is not.
 * Input arrives already HTML-escaped, which never affects the scheme prefix.
 */
export function safeUrl(value = '') {
  const href = String(value).trim();
  if (!href) return '';
  if (/^(?:https?:|mailto:)/i.test(href)) return href;
  if (/^(?:\/|#|\.{1,2}\/)/.test(href)) return href;
  return '';
}

export function slugify(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

function normalize(source = '') {
  return String(source)
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll(MARK, '')
    .replaceAll('\t', '    ');
}

/** Holds rendered fragments so later emphasis rules cannot reach inside them. */
class Vault {
  constructor() {
    this.items = [];
  }

  keep(html) {
    this.items.push(html);
    return `${MARK}${this.items.length - 1}${MARK}`;
  }

  release(text) {
    let output = String(text);
    // A stashed link can hold a stashed code span, so unwrap until stable.
    for (let pass = 0; pass < 8 && output.includes(MARK); pass += 1) {
      output = output.replace(new RegExp(`${MARK}(\\d+)${MARK}`, 'g'), (match, index) => this.items[Number(index)] ?? '');
    }
    return output.replaceAll(MARK, '');
  }
}

function emphasis(text) {
  return String(text)
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])__(?=\S)([\s\S]*?\S)__(?=$|[\s).,;:!?])/g, '$1<strong>$2</strong>')
    .replace(/\*(?=\S)([^*]*?\S)\*/g, '<em>$1</em>')
    .replace(/(^|[\s(])_(?=\S)([^_]*?\S)_(?=$|[\s).,;:!?])/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>');
}

/**
 * Splits `url "title"` into parts. Inline rendering escapes the source before
 * this runs, so the quotes around a title may already be entities.
 */
function splitTarget(target) {
  const pattern = new RegExp('^(\\S+)(?:\\s+' + QUOTE_MARK + '([\\s\\S]*)' + QUOTE_MARK + ')?$');
  const match = String(target).trim().match(pattern);
  return { url: match?.[1] || '', title: match?.[2] || '' };
}

function imageHtml(alt, target) {
  const { url, title } = splitTarget(target);
  const src = safeUrl(url);
  if (!src) return '';
  return `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy" decoding="async">`;
}

function linkHtml(label, target) {
  const { url, title } = splitTarget(target);
  const href = safeUrl(url);
  if (!href) return '';
  const external = /^https?:/i.test(href) ? ' target="_blank" rel="noreferrer"' : '';
  return `<a href="${href}"${title ? ` title="${title}"` : ''}${external}>${emphasis(label)}</a>`;
}

function inline(source, vault) {
  let text = escapeHtml(source);

  // Code spans first: nothing inside them may be interpreted any further.
  text = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (match, fence, code) => vault.keep(`<code>${code.trim()}</code>`));

  // A backslash-escaped punctuation mark is literal text. Stashing it here also
  // hides it from the emphasis and link rules further down.
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!>~|])/g, (match, character) => vault.keep(character));

  text = text.replace(/!\[([^\]]*)\]\(([^()]*)\)/g, (match, alt, target) => {
    const html = imageHtml(alt, target);
    return html ? vault.keep(html) : match;
  });

  text = text.replace(/\[([^\]]*)\]\(([^()]*)\)/g, (match, label, target) => {
    const html = linkHtml(label, target);
    return html ? vault.keep(html) : match;
  });

  // Autolinks: the angle brackets are already escaped by this point.
  text = text.replace(/&lt;((?:https?:\/\/|mailto:)[^\s&]+)&gt;/g, (match, href) => {
    const safe = safeUrl(href);
    return safe ? vault.keep(`<a href="${safe}" target="_blank" rel="noreferrer">${safe}</a>`) : match;
  });

  return emphasis(text);
}

function inlineLines(lines, vault) {
  return lines
    .map((line, index) => {
      const rendered = inline(line.replace(HARD_BREAK, ''), vault);
      return index < lines.length - 1 && HARD_BREAK.test(line) ? `${rendered}<br>` : rendered;
    })
    .join('\n');
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const BULLET = /^( *)([-*+])(\s+)(.*)$/;
const ORDERED = /^( *)(\d{1,9})[.)](\s+)(.*)$/;
const TABLE_DIVIDER = /^ {0,3}\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/;

function isBlockStart(line) {
  return !line.trim()
    || HEADING.test(line)
    || FENCE.test(line)
    || RULE.test(line)
    || QUOTE.test(line)
    || BULLET.test(line)
    || ORDERED.test(line);
}

function tableCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function tableAlignments(divider) {
  return tableCells(divider).map((cell) => {
    if (/^:-+:$/.test(cell)) return ' style="text-align:center"';
    if (/^-+:$/.test(cell)) return ' style="text-align:right"';
    return '';
  });
}

function uniqueId(text, used) {
  const base = slugify(text) || 'section';
  let candidate = base;
  let counter = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }
  used.add(candidate);
  return candidate;
}

function renderBlocks(lines, context) {
  const { vault, headings, usedIds } = context;
  const html = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const [, marker, language] = fence;
      const body = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith(marker)) {
        body.push(lines[index]);
        index += 1;
      }
      index += 1;
      const classAttribute = language ? ` class="language-${escapeHtml(language)}"` : '';
      html.push(`<pre><code${classAttribute}>${escapeHtml(body.join('\n'))}\n</code></pre>`);
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      const id = uniqueId(heading[2], usedIds);
      if (level <= 3) headings.push({ level, id, text: heading[2] });
      html.push(`<h${level} id="${id}">${vault.release(inline(heading[2], vault))}</h${level}>`);
      index += 1;
      continue;
    }

    if (RULE.test(line)) {
      html.push('<hr>');
      index += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const body = [];
      // Lazy continuation: an unmarked prose line still belongs to the quote.
      while (index < lines.length && (QUOTE.test(lines[index]) || (body.length && !isBlockStart(lines[index])))) {
        body.push(lines[index].match(QUOTE)?.[1] ?? lines[index]);
        index += 1;
      }
      html.push(`<blockquote>${renderBlocks(body, context)}</blockquote>`);
      continue;
    }

    if (BULLET.test(line) || ORDERED.test(line)) {
      const { list, next } = collectList(lines, index, context);
      html.push(list);
      index = next;
      continue;
    }

    if (line.includes('|') && TABLE_DIVIDER.test(lines[index + 1] || '')) {
      const header = tableCells(line);
      const alignments = tableAlignments(lines[index + 1]);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        rows.push(tableCells(lines[index]));
        index += 1;
      }
      const cell = (tag) => (value, position) => `<${tag}${alignments[position] || ''}>${vault.release(inline(value, vault))}</${tag}>`;
      const head = header.map(cell('th')).join('');
      const body = rows.map((row) => `<tr>${row.map(cell('td')).join('')}</tr>`).join('');
      html.push(`<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`);
      continue;
    }

    const paragraph = [];
    while (index < lines.length && !isBlockStart(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    html.push(paragraphHtml(paragraph, vault));
  }

  return html.join('\n');
}

/**
 * A paragraph holding nothing but one image becomes a figure, so posts can
 * carry captioned art without the author dropping into raw HTML.
 */
function paragraphHtml(lines, vault) {
  const lone = lines.join('\n').trim().match(/^!\[([^\]]*)\]\(([^()]*)\)$/);
  if (lone) {
    // Only an explicit title becomes a caption. When it repeats the alt text,
    // the image is left decorative so assistive tech reads the words once.
    const caption = splitTarget(lone[2]).title;
    const alt = caption && caption === lone[1] ? '' : lone[1];
    const image = imageHtml(escapeHtml(alt), escapeHtml(lone[2]));
    if (image) {
      return `<figure>${image}${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}</figure>`;
    }
  }
  return `<p>${vault.release(inlineLines(lines, vault))}</p>`;
}

function collectList(lines, start, context) {
  const opener = lines[start].match(ORDERED) || lines[start].match(BULLET);
  const ordered = ORDERED.test(lines[start]);
  const baseIndent = opener[1].length;
  // Continuation lines line up under the text, past the marker and its spaces.
  const contentColumn = opener[0].length - opener[4].length;
  const items = [];
  let index = start;
  let loose = false;

  while (index < lines.length) {
    const line = lines[index];
    const match = line.match(ORDERED) || line.match(BULLET);

    if (match && match[1].length <= baseIndent + 1) {
      if (ORDERED.test(line) !== ordered) break;
      items.push([match[4]]);
      index += 1;
      continue;
    }

    if (!items.length) break;

    if (!line.trim()) {
      const following = lines[index + 1] || '';
      const continues = following.trim()
        && ((following.match(/^ */)[0].length > baseIndent) || ORDERED.test(following) || BULLET.test(following));
      if (!continues) break;
      loose = true;
      items.at(-1).push('');
      index += 1;
      continue;
    }

    if (line.match(/^ */)[0].length <= baseIndent) break;
    items.at(-1).push(line.slice(contentColumn));
    index += 1;
  }

  const tag = ordered ? 'ol' : 'ul';
  const startAttribute = ordered && opener[2] !== '1' ? ` start="${Number(opener[2])}"` : '';
  const rendered = items
    .map((item) => {
      const body = renderBlocks(item, context);
      // A tight item reads as text, not a paragraph, even when it nests a list.
      return `<li>${loose ? body : body.replace(/^<p>([\s\S]*?)<\/p>/, '$1')}</li>`;
    })
    .join('');

  return { list: `<${tag}${startAttribute}>${rendered}</${tag}>`, next: index };
}

/** Renders markdown to HTML, and returns the h1-h3 outline alongside it. */
export function renderMarkdown(source = '') {
  const context = { vault: new Vault(), headings: [], usedIds: new Set() };
  const html = renderBlocks(normalize(source).split('\n'), context);
  return { html: context.vault.release(html), headings: context.headings };
}

export function markdownToHtml(source = '') {
  return renderMarkdown(source).html;
}

/** Strips markdown down to prose, for excerpts, search text and word counts. */
export function markdownToText(source = '') {
  return normalize(source)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^ {0,3}>\s?/gm, '')
    .replace(/^ *(?:[-*+]|\d{1,9}[.)])\s+/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^(?:-{3,}|\*{3,}|_{3,})\s*$/gm, ' ')
    .replace(/[*_~`]/g, '')
    .replace(/\\([\\`{}[\]()#+\-.!>~|])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerpt(source = '', maximum = 220) {
  const text = markdownToText(source);
  if (text.length <= maximum) return text;
  const clipped = text.slice(0, maximum);
  const boundary = clipped.lastIndexOf(' ');
  return `${(boundary > maximum * 0.6 ? clipped.slice(0, boundary) : clipped).trimEnd()}…`;
}

export function wordCount(source = '') {
  const text = markdownToText(source);
  return text ? text.split(/\s+/).length : 0;
}

export function readingMinutes(source = '') {
  return Math.max(1, Math.round(wordCount(source) / 220));
}
