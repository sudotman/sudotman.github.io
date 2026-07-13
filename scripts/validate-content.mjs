#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST_PATH = 'content.json';
const PROFILE_PATH = 'profile.json';

const errors = [];
const warnings = [];
const localAssets = new Map();
const seenWorkIds = new Map();
let workCount = 0;
let feedCount = 0;
let remoteAssetCount = 0;

const EMBED_PROVIDER_IDS = new Map([
  ['youtube', /^[A-Za-z0-9_-]{11}$/],
  ['vimeo', /^\d{1,12}$/]
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addError(location, message) {
  errors.push(`${location}: ${message}`);
}

function addWarning(location, message) {
  warnings.push(`${location}: ${message}`);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateText(value, location, fieldName = 'value') {
  if (!hasText(value)) {
    addError(location, `${fieldName} must be a non-empty string`);
    return false;
  }
  return true;
}

function validateStringArray(value, location, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) {
    addError(location, 'must be an array');
    return false;
  }
  if (!allowEmpty && value.length === 0) {
    addError(location, 'must not be empty');
    return false;
  }
  let valid = true;
  value.forEach((item, index) => {
    if (!hasText(item)) {
      addError(`${location}[${index}]`, 'must be a non-empty string');
      valid = false;
    }
  });
  return valid;
}

function normalizeRepoReference(reference) {
  return reference.split('#', 1)[0].split('?', 1)[0].replaceAll('\\', '/');
}

function isRemoteReference(reference) {
  return /^https?:\/\//i.test(reference);
}

function validateRemoteUrl(value, location) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
      addError(location, `unsupported URL protocol "${url.protocol}"`);
      return false;
    }
    return true;
  } catch {
    addError(location, 'must be a valid URL');
    return false;
  }
}

function resolveInsideRepo(reference, location) {
  const normalized = normalizeRepoReference(reference);
  if (!normalized) {
    addError(location, 'local path must not be empty');
    return null;
  }
  if (path.isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) {
    addError(location, 'local path must be relative to the repository root');
    return null;
  }

  const resolved = path.resolve(ROOT, normalized);
  const relative = path.relative(ROOT, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    addError(location, 'local path must stay inside the repository');
    return null;
  }
  return { normalized, resolved };
}

function registerAsset(reference, location) {
  if (!validateText(reference, location, 'asset reference')) return;
  if (isRemoteReference(reference)) {
    if (validateRemoteUrl(reference, location)) remoteAssetCount += 1;
    return;
  }

  const resolved = resolveInsideRepo(reference, location);
  if (!resolved) return;
  if (!localAssets.has(resolved.normalized)) {
    localAssets.set(resolved.normalized, {
      resolved: resolved.resolved,
      locations: [location]
    });
  } else {
    localAssets.get(resolved.normalized).locations.push(location);
  }
}

function validateLinkHref(value, location) {
  if (!validateText(value, location, 'href')) return;
  if (isRemoteReference(value)) {
    validateRemoteUrl(value, location);
    return;
  }
  if (/^(mailto:|tel:)/i.test(value) || value.startsWith('#')) return;
  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(value)) {
    addError(location, 'only http(s), mailto, tel, hash, or repository-relative links are allowed');
    return;
  }
  resolveInsideRepo(value, location);
}

async function readJson(relativePath, location = relativePath) {
  const resolved = resolveInsideRepo(relativePath, location);
  if (!resolved) return null;
  try {
    const source = await readFile(resolved.resolved, 'utf8');
    return JSON.parse(source);
  } catch (error) {
    addError(location, error.code === 'ENOENT' ? 'file does not exist' : `cannot parse JSON (${error.message})`);
    return null;
  }
}

function validateTaxonomyEntries(entries, location, { requireAccent = false } = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    addError(location, 'must be a non-empty array');
    return new Set();
  }

  const ids = new Set();
  entries.forEach((entry, index) => {
    const entryLocation = `${location}[${index}]`;
    if (!isObject(entry)) {
      addError(entryLocation, 'must be an object');
      return;
    }
    if (!validateText(entry.id, `${entryLocation}.id`, 'id')) return;
    if (!/^[a-z][a-z0-9_-]*$/.test(entry.id)) {
      addError(`${entryLocation}.id`, 'must use lowercase letters, numbers, underscores, or hyphens');
    }
    if (ids.has(entry.id)) addError(`${entryLocation}.id`, `duplicate taxonomy id "${entry.id}"`);
    ids.add(entry.id);
    validateText(entry.label, `${entryLocation}.label`, 'label');
    if (requireAccent || entry.accent !== undefined) {
      if (!hasText(entry.accent) || !/^#[0-9A-Fa-f]{6}$/.test(entry.accent)) {
        addError(`${entryLocation}.accent`, 'must be a six-digit hexadecimal color');
      }
    }
  });
  return ids;
}

function validateKnownTracks(tracks, location, knownTracks) {
  if (!validateStringArray(tracks, location)) return;
  const localIds = new Set();
  tracks.forEach((track, index) => {
    if (localIds.has(track)) addError(`${location}[${index}]`, `duplicate track "${track}"`);
    localIds.add(track);
    if (!knownTracks.has(track)) addError(`${location}[${index}]`, `unknown track "${track}"`);
  });
}

function validateDimensions(item, location) {
  for (const field of ['width', 'height']) {
    if (item[field] !== undefined && (!Number.isInteger(item[field]) || item[field] <= 0)) {
      addError(`${location}.${field}`, 'must be a positive integer');
    }
  }
}

function validateBody(body, location) {
  if (!Array.isArray(body) || body.length === 0) {
    addError(location, 'must be a non-empty array of content blocks');
    return;
  }
  const supportedTypes = new Set(['paragraph', 'heading', 'quote', 'list', 'legacyHtml']);
  body.forEach((block, index) => {
    const blockLocation = `${location}[${index}]`;
    if (!isObject(block)) {
      addError(blockLocation, 'must be an object');
      return;
    }
    if (!supportedTypes.has(block.type)) {
      addError(`${blockLocation}.type`, `must be one of ${[...supportedTypes].join(', ')}`);
      return;
    }
    if (block.type === 'list') {
      validateStringArray(block.items, `${blockLocation}.items`);
    } else if (block.type === 'legacyHtml') {
      validateText(block.html, `${blockLocation}.html`, 'html');
    } else {
      validateText(block.text, `${blockLocation}.text`, 'text');
    }
  });
}

function validateCover(cover, location) {
  if (!isObject(cover)) {
    addError(location, 'must be an object');
    return;
  }
  registerAsset(cover.src, `${location}.src`);
  validateText(cover.alt, `${location}.alt`, 'alt');
  validateDimensions(cover, location);
}

function validateMedia(media, location) {
  if (!Array.isArray(media)) {
    addError(location, 'must be an array');
    return;
  }
  media.forEach((item, index) => {
    const itemLocation = `${location}[${index}]`;
    if (!isObject(item)) {
      addError(itemLocation, 'must be an object');
      return;
    }
    if (!['image', 'video', 'audio'].includes(item.type)) {
      addError(`${itemLocation}.type`, 'must be image, video, or audio');
      return;
    }

    if (item.type === 'image') {
      registerAsset(item.src, `${itemLocation}.src`);
      validateText(item.alt, `${itemLocation}.alt`, 'alt');
      if (item.thumbnail !== undefined) registerAsset(item.thumbnail, `${itemLocation}.thumbnail`);
      if (item.caption !== undefined) validateText(item.caption, `${itemLocation}.caption`, 'caption');
      validateDimensions(item, itemLocation);
      return;
    }

    validateText(item.title, `${itemLocation}.title`, 'title');
    if (item.caption !== undefined) validateText(item.caption, `${itemLocation}.caption`, 'caption');

    if (item.type === 'audio') {
      registerAsset(item.src, `${itemLocation}.src`);
      if (item.provider !== undefined || item.id !== undefined) {
        addError(itemLocation, 'audio media supports a direct src only; provider and id are not allowed');
      }
      if (item.poster !== undefined) {
        addError(`${itemLocation}.poster`, 'is supported for direct video sources only');
      }
      return;
    }

    const hasDirectSource = item.src !== undefined;
    const hasProviderFields = item.provider !== undefined || item.id !== undefined;
    if (hasDirectSource && hasProviderFields) {
      addError(itemLocation, 'video media must use either a direct src or a provider/id pair, not both');
    }

    if (hasDirectSource) {
      registerAsset(item.src, `${itemLocation}.src`);
    } else {
      const providerValid = validateText(item.provider, `${itemLocation}.provider`, 'provider');
      const idValid = validateText(item.id, `${itemLocation}.id`, 'id');
      if (providerValid) {
        const idPattern = EMBED_PROVIDER_IDS.get(item.provider);
        if (!idPattern) {
          addError(`${itemLocation}.provider`, `must be one of ${[...EMBED_PROVIDER_IDS.keys()].join(', ')}`);
        } else if (idValid && !idPattern.test(item.id)) {
          addError(`${itemLocation}.id`, `is not a valid ${item.provider} video id`);
        }
      }
    }
    if (item.poster !== undefined) {
      if (hasDirectSource) registerAsset(item.poster, `${itemLocation}.poster`);
      else addError(`${itemLocation}.poster`, 'is supported for direct video sources only');
    }
  });
}

function validateLinks(links, location) {
  if (!Array.isArray(links)) {
    addError(location, 'must be an array');
    return;
  }
  links.forEach((link, index) => {
    const linkLocation = `${location}[${index}]`;
    if (!isObject(link)) {
      addError(linkLocation, 'must be an object');
      return;
    }
    validateText(link.label, `${linkLocation}.label`, 'label');
    validateLinkHref(link.href, `${linkLocation}.href`);
    if (link.kind !== undefined) validateText(link.kind, `${linkLocation}.kind`, 'kind');
  });
}

function validateWork(work, location, defaultTracks, knownTracks, knownMediums) {
  if (!isObject(work)) {
    addError(location, 'must be an object');
    return;
  }
  workCount += 1;

  if (validateText(work.id, `${location}.id`, 'id')) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(work.id)) {
      addError(`${location}.id`, 'must contain only letters, numbers, underscores, or hyphens');
    }
    if (seenWorkIds.has(work.id)) {
      addError(`${location}.id`, `duplicate work id; first declared at ${seenWorkIds.get(work.id)}`);
    } else {
      seenWorkIds.set(work.id, `${location}.id`);
    }
  }

  validateText(work.title, `${location}.title`, 'title');

  const tracks = work.tracks ?? defaultTracks;
  validateKnownTracks(tracks, `${location}.${work.tracks ? 'tracks' : 'inheritedTracks'}`, knownTracks);

  const medium = work.medium ?? work.category;
  if (validateText(medium, `${location}.${work.medium ? 'medium' : 'category'}`, 'medium')) {
    if (!knownMediums.has(medium)) {
      addError(`${location}.${work.medium ? 'medium' : 'category'}`, `unknown medium "${medium}"`);
    }
  }

  if (!hasText(work.summary) && !hasText(work.short)) {
    addError(location, 'requires a non-empty summary or legacy short field');
  }
  if (work.body !== undefined) {
    validateBody(work.body, `${location}.body`);
  } else if (!hasText(work.long)) {
    addError(location, 'requires body blocks or a non-empty legacy long field');
  }

  if (work.cover !== undefined) {
    validateCover(work.cover, `${location}.cover`);
  } else if (work.image !== undefined) {
    registerAsset(work.image, `${location}.image`);
  } else {
    addError(location, 'requires a cover object or legacy image field');
  }

  if (work.gallery !== undefined) {
    if (!Array.isArray(work.gallery)) {
      addError(`${location}.gallery`, 'must be an array');
    } else {
      work.gallery.forEach((asset, index) => registerAsset(asset, `${location}.gallery[${index}]`));
    }
  }
  if (work.media !== undefined) validateMedia(work.media, `${location}.media`);
  if (work.links !== undefined) validateLinks(work.links, `${location}.links`);

  if (work.roles !== undefined) validateStringArray(work.roles, `${location}.roles`);
  if (work.sortDate !== undefined && (!hasText(work.sortDate) || !/^\d{4}-\d{2}-\d{2}$/.test(work.sortDate))) {
    addError(`${location}.sortDate`, 'must use YYYY-MM-DD');
  }
  if (work.featuredRank !== undefined && (!Number.isInteger(work.featuredRank) || work.featuredRank < 0)) {
    addError(`${location}.featuredRank`, 'must be a non-negative integer');
  }
}

function sameStringSet(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && left.length === right.length
    && left.every(value => right.includes(value));
}

async function validateFeed(source, sourceLocation, knownTracks, knownMediums) {
  const feed = await readJson(source.src, `${sourceLocation}.src`);
  if (!feed) return;
  feedCount += 1;

  if (!isObject(feed)) {
    addError(source.src, 'feed root must be an object');
    return;
  }
  if (feed.schemaVersion !== 2) addError(`${source.src}.schemaVersion`, 'must equal 2');
  if (!isObject(feed.source)) {
    addError(`${source.src}.source`, 'must be an object');
    return;
  }
  if (feed.source.id !== source.id) {
    addError(`${source.src}.source.id`, `must match manifest source id "${source.id}"`);
  }

  validateKnownTracks(feed.source.defaultTracks, `${source.src}.source.defaultTracks`, knownTracks);
  if (!sameStringSet(feed.source.defaultTracks, source.defaultTracks)) {
    addError(`${source.src}.source.defaultTracks`, 'must match the manifest source defaults');
  }

  if (!Array.isArray(feed.works)) {
    addError(`${source.src}.works`, 'must be an array');
    return;
  }
  feed.works.forEach((work, index) => {
    validateWork(work, `${source.src}.works[${index}]`, feed.source.defaultTracks, knownTracks, knownMediums);
  });
}

function validateProfile(profile) {
  if (!isObject(profile)) {
    addError(PROFILE_PATH, 'root must be an object');
    return;
  }
  if (!Array.isArray(profile.workExperience)) addError(`${PROFILE_PATH}.workExperience`, 'must be an array');
  if (!Array.isArray(profile.education)) addError(`${PROFILE_PATH}.education`, 'must be an array');
  if (!isObject(profile.techStack)) addError(`${PROFILE_PATH}.techStack`, 'must be an object');
  if (!isObject(profile.interests)) addError(`${PROFILE_PATH}.interests`, 'must be an object');
}

function validateHomepageIdentity(manifest) {
  if (!isObject(manifest.identity)) {
    addError(`${MANIFEST_PATH}.identity`, 'must be an object');
  } else {
    for (const field of ['name', 'shortName', 'role', 'location', 'email', 'bio']) {
      validateText(manifest.identity[field], `${MANIFEST_PATH}.identity.${field}`, field);
    }
    validateStringArray(manifest.identity.languages, `${MANIFEST_PATH}.identity.languages`);
    if (!Array.isArray(manifest.identity.socials) || manifest.identity.socials.length === 0) {
      addError(`${MANIFEST_PATH}.identity.socials`, 'must be a non-empty array');
    } else {
      manifest.identity.socials.forEach((link, index) => {
        const location = `${MANIFEST_PATH}.identity.socials[${index}]`;
        if (!isObject(link)) {
          addError(location, 'must be an object');
          return;
        }
        validateText(link.label, `${location}.label`, 'label');
        validateLinkHref(link.href, `${location}.href`);
      });
    }
  }

  if (!Array.isArray(manifest.sites) || manifest.sites.length === 0) {
    addError(`${MANIFEST_PATH}.sites`, 'must be a non-empty array');
  } else {
    manifest.sites.forEach((site, index) => {
      const location = `${MANIFEST_PATH}.sites[${index}]`;
      if (!isObject(site)) {
        addError(location, 'must be an object');
        return;
      }
      validateText(site.title, `${location}.title`, 'title');
      validateText(site.note, `${location}.note`, 'note');
      validateLinkHref(site.href, `${location}.href`);
    });
  }
}

function validateCuration(curation) {
  if (!isObject(curation)) {
    addError(`${MANIFEST_PATH}.curation`, 'must be an object');
    return;
  }
  if (!validateStringArray(curation.featuredWorkIds, `${MANIFEST_PATH}.curation.featuredWorkIds`)) return;
  const featured = new Set();
  curation.featuredWorkIds.forEach((id, index) => {
    if (featured.has(id)) addError(`${MANIFEST_PATH}.curation.featuredWorkIds[${index}]`, `duplicate work id "${id}"`);
    featured.add(id);
    if (!seenWorkIds.has(id)) addError(`${MANIFEST_PATH}.curation.featuredWorkIds[${index}]`, `unknown work id "${id}"`);
  });
}

async function validateLocalAssets() {
  await Promise.all([...localAssets.entries()].map(async ([relativePath, asset]) => {
    try {
      const metadata = await stat(asset.resolved);
      if (!metadata.isFile()) {
        addError(asset.locations[0], `local asset "${relativePath}" is not a file`);
      }
    } catch (error) {
      addError(asset.locations[0], error.code === 'ENOENT'
        ? `local asset "${relativePath}" does not exist`
        : `cannot inspect local asset "${relativePath}" (${error.message})`);
    }
  }));
}

async function main() {
  const manifest = await readJson(MANIFEST_PATH);
  const profile = await readJson(PROFILE_PATH);
  if (profile) validateProfile(profile);

  if (!isObject(manifest)) {
    if (manifest !== null) addError(MANIFEST_PATH, 'root must be an object');
  } else {
    if (manifest.schemaVersion !== 2) addError(`${MANIFEST_PATH}.schemaVersion`, 'must equal 2');
    if (!isObject(manifest.siteHeader)) {
      addError(`${MANIFEST_PATH}.siteHeader`, 'must be an object');
    } else {
      validateText(manifest.siteHeader.title, `${MANIFEST_PATH}.siteHeader.title`, 'title');
      validateText(manifest.siteHeader.subtitle, `${MANIFEST_PATH}.siteHeader.subtitle`, 'subtitle');
      validateText(manifest.siteHeader.kicker, `${MANIFEST_PATH}.siteHeader.kicker`, 'kicker');
      validateText(manifest.siteHeader.thesis, `${MANIFEST_PATH}.siteHeader.thesis`, 'thesis');
      validateText(manifest.siteHeader.manifesto, `${MANIFEST_PATH}.siteHeader.manifesto`, 'manifesto');
      registerAsset(manifest.siteHeader.bannerImage, `${MANIFEST_PATH}.siteHeader.bannerImage`);
    }

    validateHomepageIdentity(manifest);

    if (!isObject(manifest.catalog)) {
      addError(`${MANIFEST_PATH}.catalog`, 'must be an object');
    } else {
      const knownTracks = validateTaxonomyEntries(
        manifest.catalog.tracks,
        `${MANIFEST_PATH}.catalog.tracks`,
        { requireAccent: true }
      );
      const knownMediums = validateTaxonomyEntries(
        manifest.catalog.mediums,
        `${MANIFEST_PATH}.catalog.mediums`,
        { requireAccent: true }
      );

      if (!Array.isArray(manifest.catalog.sources) || manifest.catalog.sources.length === 0) {
        addError(`${MANIFEST_PATH}.catalog.sources`, 'must be a non-empty array');
      } else {
        const sourceIds = new Set();
        const feedTasks = [];
        manifest.catalog.sources.forEach((source, index) => {
          const sourceLocation = `${MANIFEST_PATH}.catalog.sources[${index}]`;
          if (!isObject(source)) {
            addError(sourceLocation, 'must be an object');
            return;
          }
          if (validateText(source.id, `${sourceLocation}.id`, 'id')) {
            if (sourceIds.has(source.id)) addError(`${sourceLocation}.id`, `duplicate source id "${source.id}"`);
            sourceIds.add(source.id);
          }
          validateText(source.src, `${sourceLocation}.src`, 'src');
          validateKnownTracks(source.defaultTracks, `${sourceLocation}.defaultTracks`, knownTracks);
          if (hasText(source.src)) {
            feedTasks.push(validateFeed(source, sourceLocation, knownTracks, knownMediums));
          }
        });
        await Promise.all(feedTasks);
        validateCuration(manifest.curation);
      }
    }
  }

  await validateLocalAssets();

  warnings.sort();
  errors.sort();
  warnings.forEach(warning => console.warn(`warning: ${warning}`));

  if (errors.length > 0) {
    console.error(`Content validation failed with ${errors.length} error${errors.length === 1 ? '' : 's'}:`);
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
    return;
  }

  console.log(
    `Content validation passed: ${workCount} works across ${feedCount} feeds; `
    + `${localAssets.size} local assets checked; ${remoteAssetCount} remote asset references checked.`
  );
}

await main();
