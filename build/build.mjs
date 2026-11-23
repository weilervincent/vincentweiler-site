// Builds the static site in dist/ from content/*.yml and media/.
// Run: npm run build   (Netlify runs it automatically after every change)
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(ROOT, 'dist');
const MAX_W = 2000;

const read = (p) => yaml.load(fs.readFileSync(path.join(ROOT, p), 'utf8')) || {};
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function slugify(s) { return String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'projet'; }
const nl2br = (s) => esc(s).replace(/\n/g, '<br>\n');

const settings = read('content/settings.yml');
const home = read('content/home.yml');
const info = read('content/info.yml');
const contact = read('content/contact.yml');
const showreel = read('content/showreel.yml');
const SECTIONS = ['narrative', 'commercials', 'beauty'];
const sections = Object.fromEntries(SECTIONS.map((s) => [s, read(`content/sections/${s}.yml`)]));
const projects = {};
for (const f of fs.readdirSync(path.join(ROOT, 'content/projects')).filter((f) => /\.ya?ml$/.test(f))) {
	const slug = slugify(f.replace(/\.ya?ml$/, ''));
	projects[slug] = { slug, ...read(`content/projects/${f}`) };
}
const slugOf = (ref) => slugify(path.basename(String(ref || ''), path.extname(String(ref || ''))));
const sectionLabel = { narrative: 'Narrative', commercials: 'Commercials', beauty: 'Beauty' };

// ------------------------------------------------------------------ images
const imgCache = new Map();
const jobs = [];
const MAX_FULL = 2560;
const WIDTHS = [800, 1280, 1920];
// committed cache of encoded images: Cloudflare builds just copy them (fast); new images get encoded once
const CACHE = path.join(ROOT, '.image-cache');
const usedCache = new Set();
import crypto from 'node:crypto';
async function variant(file, buf, width, quality, out) {
	const key = crypto.createHash('sha1').update(buf).update(`${width}-${quality}-ss-srgb`).digest('hex');
	const cached = path.join(CACHE, key + '.webp');
	usedCache.add(key + '.webp');
	if (!fs.existsSync(cached)) {
		fs.mkdirSync(CACHE, { recursive: true });
		await sharp(buf).rotate().resize({ width, withoutEnlargement: true }).toColourspace('srgb').webp({ quality, smartSubsample: true, effort: 5 }).toFile(cached);
	}
	fs.copyFileSync(cached, out);
}
async function image(src) {
	if (!src) return null;
	src = String(src).trim();
	if (imgCache.has(src)) return imgCache.get(src);
	const p = (async () => {
		const rel = decodeURI(src.replace(/^\//, ''));
		const file = path.join(ROOT, rel);
		if (!fs.existsSync(file)) { console.warn('  ! image introuvable :', src); return null; }
		// SEO-friendly public file names: media/projects/prada/vincent-weiler-prada-01.webp
		const stem = rel.replace(/\.(jpe?g|png|tiff?|webp|heic|avif|gif)$/i, '');
		const dir = path.dirname(stem), name = path.basename(stem);
		const kind = /^media\/home/.test(stem) ? 'film-still-' : /^media\/info/.test(stem) ? 'director-of-photography-' : '';
		const base = path.join(dir, name.startsWith('vincent-weiler') ? name : `vincent-weiler-${kind}${name}`);
		const outFull = path.join(DIST, base + '.webp');
		fs.mkdirSync(path.dirname(outFull), { recursive: true });
		const buf = fs.readFileSync(file);
		const meta = await sharp(buf).metadata();
		let w = meta.width, h = meta.height;
		if ((meta.orientation || 1) >= 5) [w, h] = [h, w];
		// full size (max 2560 px), re-encoded from the high-quality master
		await variant(file, buf, MAX_FULL, 95, outFull); { const r = Math.min(1, MAX_FULL / w); w = Math.round(w * r); h = Math.round(h * r); }
		const url = (r) => '/' + r.split(path.sep).map(encodeURIComponent).join('/');
		const set = [];
		for (const vw of WIDTHS) {
			if (vw >= w) continue;
			const r = `${base}-${vw}.webp`;
			await variant(file, buf, vw, 92, path.join(DIST, r));
			set.push(`${url(r)} ${vw}w`);
		}
		set.push(`${url(base + '.webp')} ${w}w`);
		return { src: url(base + '.webp'), srcset: set.join(', '), w, h };
	})();
	imgCache.set(src, p);
	return p;
}
// collect every image used, then process them in parallel batches
async function prepareImages(list) {
	const uniq = [...new Set(list.filter(Boolean).map(String))];
	for (let i = 0; i < uniq.length; i += 8) await Promise.all(uniq.slice(i, i + 8).map(image));
}

// ------------------------------------------------------------------ video
function videoEmbed(url, v = {}) {
	url = String(url || '').trim();
	let m;
	let src = url;
	if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([0-9a-f]+))?/i))) {
		const h = m[2] || (url.match(/[?&]h=([0-9a-f]+)/i) || [])[1];
		const q = new URLSearchParams({ badge: '0', autopause: '0' });
		if (h) q.set('h', h);
		if (v.autoplay) { q.set('autoplay', '1'); q.set('muted', '1'); q.set('loop', '1'); }
		src = `https://player.vimeo.com/video/${m[1]}?${q}`;
	} else if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/i))) {
		const q = new URLSearchParams({ rel: '0' });
		if (v.autoplay) { q.set('autoplay', '1'); q.set('mute', '1'); }
		src = `https://www.youtube.com/embed/${m[1]}?${q}`;
	}
	return src;
}
function ratio(fmt) {
	const m = String(fmt || '16:9').match(/([\d.]+)\s*[:/x]\s*([\d.]+)/);
	return m ? `${m[1]}/${m[2]}` : '16/9';
}
function videoItem(v) {
	if (!v || !v.url) return '';
	return `<media-item data-ratio="1"><div class="video-frame" style="aspect-ratio:${ratio(v.format)};"><iframe src="${esc(videoEmbed(v.url, v))}" loading="lazy" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" title="Video"></iframe></div></media-item>`;
}

// ------------------------------------------------------------------ markup helpers
const SITE = 'https://www.vincentweiler.com';
let ALT = ''; // alt text for images of the page being built (SEO + accessibility)
let PAGE_URL = '/'; // page being built, for the image sitemap
const pageImages = new Map();
function useImage(src) { if (!pageImages.has(PAGE_URL)) pageImages.set(PAGE_URL, new Set()); pageImages.get(PAGE_URL).add(src); }
const PORTRAIT = '/media/portrait/vincent-weiler-director-of-photography.jpg';
async function imgItem(src, { href, eager, style, noAnim, sizes } = {}) {
	const im = await image(src);
	if (!im) return '';
	useImage(im.src);
	const tag = `<img src="${im.src}" srcset="${im.srcset}" sizes="${sizes || '100vw'}" width="${im.w}" height="${im.h}" alt="${esc(ALT)}" decoding="async" loading="${eager ? 'eager' : 'lazy'}"${style ? ` style="${style}"` : ''}>`;
	const inner = href ? `<a href="${href}">${tag}</a>` : tag;
	return `<media-item data-ratio="${(im.w / im.h).toFixed(5)}"${noAnim ? ' no-anim' : ''}>${inner}</media-item>`;
}
function columnSet(units, { gutter = '1rem', mobileGutter, stack = true, cols } = {}) {
	const spans = units.map((u) => u.span);
	const uniform = spans.every((s) => !s);
	const n = cols || (uniform ? units.length : Math.max(units.length, 12));
	let style = `--cols:${n};--gutter:${gutter};`;
	if (mobileGutter !== undefined) style += `--mobile-gutter:${mobileGutter};`;
	return `<column-set style="${style}"${stack ? ' mobile-stack' : ''}>` +
		units.map((u) => `<column-unit style="grid-column:span ${u.span || 1}"${u.html ? '' : ' empty mobile-hide'}>${u.html || ''}</column-unit>`).join('') +
		'</column-set>';
}
async function slideshow(images, opts) {
	const items = [];
	let minRatio = 99;
	for (const s of images || []) {
		const im = await image(s);
		if (!im) continue;
		minRatio = Math.min(minRatio, im.w / im.h);
		useImage(im.src);
		items.push(`<media-item><img ${items.length < 2 ? 'src' : 'data-src'}="${im.src}" ${items.length < 2 ? 'srcset' : 'data-srcset'}="${im.srcset}" sizes="${opts.sizes || '90vw'}" width="${im.w}" height="${im.h}" alt="${esc(ALT)}" decoding="async"></media-item>`);
	}
	if (!items.length) return '';
	return `<gallery-slideshow data-options='${esc(JSON.stringify(opts))}' style="--frame-ratio:${(minRatio === 99 ? 1.5 : minRatio).toFixed(5)}" no-anim>${items.join('')}</gallery-slideshow>`;
}
async function grid(list, cols, render, gutter = '1rem') {
	let out = '';
	for (let i = 0; i < list.length; i += cols) {
		const units = [];
		for (let j = 0; j < cols; j++) units.push({ html: list[i + j] !== undefined ? await render(list[i + j]) : '' });
		out += columnSet(units, { gutter, stack: false });
	}
	return out;
}

// ------------------------------------------------------------------ headers
function navDesktop(active) {
	const items = [['all', 'All', '/work/'], ['narrative', 'Narrative', '/work/#narrative'], ['commercials', 'Commercials', '/work/#commercials'], ['beauty', 'Beauty', '/work/#beauty'], ['info', 'Info', '/info/']];
	return columnSet(items.map(([k, label, href]) => ({ html: `<div style="text-align: center"><a href="${href}"${k === active ? ' class="active"' : ''}>${label}</a></div>` })), { gutter: '0rem', mobileGutter: '0.0rem', stack: true }).replace('<column-set ', '<column-set class="site-nav" ');
}
function headerDesktop(active) {
	return `<div class="only-desktop"><div style="text-align: center"><a class="heading-1-copy" href="/" style="color: rgb(0, 0, 0); --font-scale: 1.22;">${esc(home.name)}</a></div><div style="text-align: center"><a class="heading-2-black" href="/" style="--font-scale: 1.15;">${esc(home.subtitle)}</a><br>
</div><div style="text-align: center"><br>
</div>${navDesktop(active)}<br>
`;
}
function headerMobile({ big = true, section, nav = false } = {}) {
	const name = `<a class="heading-1-copy" href="/" style="color: rgb(0, 0, 0);">${esc(home.name)}</a>`;
	return `<div class="only-mobile"><div style="text-align: center">${big ? `<span style="--font-scale: 1.75;">${name}</span>` : name}</div><div style="text-align: center"><a class="heading-2-black" href="/" style="--font-scale: 1.6;">${esc(home.subtitle)}</a><br>
<br>
${section ? `<a class="caption-black" href="/work/#${section}" style="color: rgb(0, 0, 0); --font-scale: 0.75;">${sectionLabel[section]}</a>` : ''}</div>${nav ? navDesktop(nav === true ? undefined : nav) : ''}<br>
`;
}

// ------------------------------------------------------------------ page shell
function page({ id, title, body, css = '', bodyClass = '', ogImage, wallpaper = '', description, url = '/', jsonld }) {
	const desc = description || settings.description;
	const fullTitle = title ? `${title} — ${settings.site_title}` : settings.site_title;
	// Google Analytics — chargé seulement pour les vrais visiteurs :
	// - jamais sur les aperçus (*.pages.dev, localhost, aperçus de l'éditeur)
	// - jamais dans un navigateur automatisé (navigator.webdriver : robots, Claude)
	// - jamais sur un appareil passé en « mode maintenance » : ouvrir une fois
	//   vincentweiler.com/?notrack sur cet appareil ; ?track pour annuler.
	const gaId = settings.google_analytics ? esc(settings.google_analytics) : '';
	const ga = gaId ? `<script>(function(){var k='vw_notrack',q=location.search;try{if(/[?&]notrack(=|&|$)/.test(q)){localStorage.setItem(k,'1');console.info('Analytics désactivé sur cet appareil');}if(/[?&]track(=|&|$)/.test(q)){localStorage.removeItem(k);console.info('Analytics réactivé sur cet appareil');}if(localStorage.getItem(k))return;}catch(e){}if(navigator.webdriver)return;if(!/(^|\\.)vincentweiler\\.com$/.test(location.hostname))return;var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${gaId}';document.head.appendChild(s);window.dataLayer=window.dataLayer||[];window.gtag=function(){dataLayer.push(arguments);};gtag('js',new Date());gtag('config','${gaId}');})();</script>` : '';
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}${url}">
<meta name="keywords" content="${esc(settings.keywords)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}${url}">
<meta property="og:site_name" content="Vincent Weiler">
${ogImage ? `<meta property="og:image" content="${SITE}${ogImage}">
<meta property="og:image:width" content="1200">
<meta name="twitter:card" content="summary_large_image">` : ''}
<script type="application/ld+json">${JSON.stringify(jsonld || personLD()).replace(/</g, '\\u003c')}</script>
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="preload" href="/fonts/SrirachaDisplay-Regular.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/base.css">
<link rel="stylesheet" href="/assets/site.css">
<script src="/assets/boot.js"></script>
${css ? `<style>${css}</style>` : ''}
</head>
<body class="${bodyClass}">
<div class="content"><div class="pages">
<div id="${id}" class="page">${wallpaper}<div class="page-layout"><div class="page-content"><bodycopy>${body}</bodycopy></div></div></div>
</div></div>
<script src="/assets/site.js" defer></script>
${ga}
</body>
</html>
`;
}
function personLD() {
	const same = (info.links || []).map((l) => l.url).filter((u) => /^https?:/.test(u)).map((u) => u.split('?')[0]);
	return { '@context': 'https://schema.org', '@type': 'Person', '@id': SITE + '/#vincent', name: 'Vincent Weiler', jobTitle: 'Director of Photography (chef opérateur)', url: SITE + '/', image: SITE + PORTRAIT, address: { '@type': 'PostalAddress', addressLocality: 'Paris', addressCountry: 'FR' }, knowsLanguage: ['fr', 'en'], sameAs: same, description: settings.description };
}
// 1200 px JPEG preview for link sharing (WhatsApp, LinkedIn, mail…)
async function ogJpeg(src, name) {
	if (!src) return undefined;
	const file = path.join(ROOT, decodeURI(String(src).trim().replace(/^\//, '')));
	if (!fs.existsSync(file)) return undefined;
	fs.mkdirSync(path.join(DIST, 'og'), { recursive: true });
	await sharp(file).rotate().resize({ width: 1200, height: 630, fit: 'cover' }).toColourspace('srgb').jpeg({ quality: 88, mozjpeg: true }).toFile(path.join(DIST, 'og', name + '.jpg'));
	return `/og/${name}.jpg`;
}
const featuring = (p) => (Array.isArray(p.featuring) ? p.featuring : p.featuring ? [p.featuring] : []).map((x) => String(x).trim()).filter(Boolean);
const withNames = (p) => (featuring(p).length ? ` with ${featuring(p).join(', ')}` : '');
const plainCredits = (p) => String(p.credits || '').replace(/\s+I\s+/g, ', ').replace(/\s+/g, ' ').trim();
function write(rel, html) {
	const out = path.join(DIST, rel);
	fs.mkdirSync(path.dirname(out), { recursive: true });
	fs.writeFileSync(out, html);
}

// ------------------------------------------------------------------ pages
async function buildProject(p) {
	const label = p.hover_title || p.title;
	PAGE_URL = `/${p.slug}/`;
	ALT = `${label}${withNames(p)}${p.credits ? ' — ' + plainCredits(p) : ''} — cinematography by Vincent Weiler`;
	const tw = Math.min(11, Math.max(1, parseInt(p.title_width) || 5));
	const names = featuring(p).length ? `<span class="feat"> with ${esc(featuring(p).join(', '))}</span>` : '';
	const titleRow = (credits, w = tw, n = names) => columnSet([
		{ span: w, html: `<div style="text-align: left"><b>${esc(p.title)}</b>${n}</div>` },
		{ span: 12 - w, html: `<div style="text-align: right">${credits}</div>` },
	], { gutter: '2rem', stack: false });

	let desk = titleRow(esc(p.credits || ''), names ? Math.max(tw, 6) : tw) + '<br>\n';
	let mob = names
		? `<div style="text-align: left"><b>${esc(p.title)}</b>${names}</div><div style="text-align: left; margin-top: .3rem">${esc(p.credits || '')}</div>` + '<br>\n'
		: titleRow(nl2br(p.credits_mobile || String(p.credits || '').replace(/\s+I\s+/g, '\n'))) + '<br>\n';
	for (const b of p.blocks || []) {
		const type = b.type || b._block;
		if (type === 'video') {
			const v = videoItem(b);
			desk += v + '<br><br>\n'; mob += v + '<br>\n';
		} else if (type === 'videos') {
			const vids = (b.videos || []).filter((v) => v && v.url);
			desk += await grid(vids, parseInt(b.columns) || 3, async (v) => videoItem(v)) + '<br>\n';
			mob += await grid(vids, parseInt(b.mobile_columns) || 1, async (v) => videoItem(v)) + '<br>\n';
		} else if (type === 'slideshow') {
			const ss = await slideshow(b.images, { autoplay: b.autoplay !== false, delay: Number(b.seconds_per_image) || 1, speed: 1, type: 'fade', shuffle: !!b.shuffle, nav: 'cursor-zones' });
			desk += columnSet([{ html: ss }], { gutter: '1rem' }) + '<br>\n';
			const how = b.on_mobile || 'one-per-row';
			if (how === 'slideshow') mob += columnSet([{ html: ss }], { gutter: '1rem' }) + '<br>\n';
			else if (how === 'two-per-row') mob += await grid(b.images || [], 2, (s) => imgItem(s), '0.5rem') + '<br>\n';
			else { for (const s of b.images || []) mob += await imgItem(s); mob += '<br>\n'; }
		} else if (type === 'images') {
			const cols = parseInt(b.columns) || 1;
			const mcols = parseInt(b.mobile_columns) || 1;
			const render = (s) => imgItem(s);
			if (cols === 1) { for (const s of b.images || []) desk += await imgItem(s); desk += '<br>\n'; }
			else desk += await grid(b.images || [], cols, render) + '<br>\n';
			if (mcols === 1) { for (const s of b.images || []) mob += await imgItem(s); mob += '<br>\n'; }
			else mob += await grid(b.images || [], mcols, render, '0.5rem') + '<br>\n';
		} else if (type === 'text') {
			const t = `<div style="text-align: left">${nl2br(b.text)}</div><br>\n`;
			desk += t; mob += t;
		}
	}
	const body = headerDesktop() + desk + '</div>' + headerMobile({ big: true, section: p.section }) + mob + '</div>';
	const og = await ogJpeg((p.thumbnails || [])[0], p.slug);
	const secName = sectionLabel[p.section] || '';
	const description = `${label}${withNames(p)}${p.credits ? ' — ' + plainCredits(p) : ''}. Director of photography / chef opérateur : Vincent Weiler (Paris).${secName ? ' ' + secName + '.' : ''}`;
	const jsonld = { '@context': 'https://schema.org', '@type': 'CreativeWork', name: label, url: `${SITE}/${p.slug}/`, description, image: og ? SITE + og : undefined, contributor: { '@type': 'Person', '@id': SITE + '/#vincent', name: 'Vincent Weiler', jobTitle: 'Director of Photography' }, ...(featuring(p).length ? { actor: featuring(p).map((n) => ({ '@type': 'Person', name: n })) } : {}) };
	write(`${p.slug}/index.html`, page({ id: `p-${p.slug}`, title: label, body, ogImage: og, description, url: `/${p.slug}/`, jsonld }));
}

async function buildSection(name) {
	const sec = sections[name];
	const list = (sec.projects || []).map((it) => projects[slugOf(it.project || it)]).filter(Boolean);
	let desk = '';
	let mob = '';
	for (const p of list) {
		const href = `/${p.slug}/`;
		const thumbs = (p.thumbnails || []).filter(Boolean);
		PAGE_URL = `/${name}/`;
		ALT = `${p.hover_title || p.title}${withNames(p)} — cinematography by Vincent Weiler`;
		const cap = `<a class="proj-cap" href="${href}" aria-label="${esc(p.hover_title || p.title)}"><span>${esc(p.hover_title || p.title)}</span></a>`;
		desk += `<div class="proj-row">` + columnSet(await Promise.all(thumbs.map(async (t) => ({ html: await imgItem(t, { href, sizes: `${Math.round(90 / thumbs.length)}vw` }) }))), { gutter: '0rem', stack: false }) + cap + '</div><br>\n';
		mob += `<div class="proj-row proj-row-m">` + await imgItem(p.mobile_thumbnail || thumbs[Math.floor(thumbs.length / 2)], { href, style: 'padding: 0.2rem;' }) + cap + '</div>';
	}
	const css = `#s-${name}.page{min-height:var(--viewport-height)} #s-${name} .page-content{align-items:flex-start;padding:1.5rem}`;
	const body = headerDesktop(name) + desk + '</div>' + headerMobile({ big: true, nav: name }) + '<br>' + mob + '</div>';
	const secDesc = { narrative: 'Narrative work — feature films, short films and music videos (fiction, courts-métrages, clips)', commercials: 'Commercials — fashion and brand campaigns (publicité, films de marque)', beauty: 'Beauty — luxury beauty and fragrance campaigns (publicité beauté, luxe)' }[name] || '';
	const description = `${secDesc}${secDesc ? '. ' : ''}${list.map((p) => p.hover_title || p.title).join(', ')}. Vincent Weiler, director of photography / chef opérateur, Paris.`;
	const og = await ogJpeg(((list[0] || {}).thumbnails || [])[0], name);
	write(`${name}/index.html`, page({ id: `s-${name}`, title: sec.title || sectionLabel[name], body, css, description, url: `/${name}/`, ogImage: og }));
}

// Work: every project, as on the section pages (same thumbnails), Narrative / Commercials / Beauty interleaved
// in their section order, filtered in place by the menu All · Narrative · Commercials · Beauty · Info.
// Beauty thumbnails (9:16) are cropped so each row has the same height as a 3 × 16:9 row.
// Crop = top edge of the visible window, in % of the image height (faces: eyes in the upper third, room under the chin).
const WORK_CROP = {
	lancome: [13, 19, 24.2, 24, 22], prada: [13, 8, 23.2, 15, 27], armani: [10, 11, 23.2, 23, 14],
	valentino: [5, 12, 23, 8, 13], 'viktor-rolf': [24, 23, 20, 8, 12],
};
const WORK_CROP_MOBILE = { lancome: 34.7, prada: 33.7, armani: 33.7, valentino: 33.2, 'viktor-rolf': 26 };
async function buildWork() {
	const lists = Object.fromEntries(SECTIONS.map((n) => [n, (sections[n].projects || []).map((it) => projects[slugOf(it.project || it)]).filter(Boolean)]));
	const order = [];
	for (let i = 0; i < Math.max(...SECTIONS.map((n) => lists[n].length)); i++) for (const n of SECTIONS) if (lists[n][i]) order.push([n, lists[n][i]]);
	let desk = '', mob = '';
	PAGE_URL = '/work/';
	for (const [sec, p] of order) {
		const href = `/${p.slug}/`;
		const thumbs = (p.thumbnails || []).filter(Boolean);
		ALT = `${p.hover_title || p.title}${withNames(p)} — cinematography by Vincent Weiler`;
		const cap = `<a class="proj-cap" href="${href}" aria-label="${esc(p.hover_title || p.title)}"><span>${esc(p.hover_title || p.title)}</span></a>`;
		const crop = sec === 'beauty';
		const pos = (t, win) => `object-position:50% ${(t / (100 - win) * 100).toFixed(1)}%`;
		desk += `<div data-s="${sec}" class="proj-row">` + columnSet(await Promise.all(thumbs.map(async (t, i) => ({ html: await imgItem(t, { href, sizes: `${Math.round(90 / thumbs.length)}vw`, style: crop ? pos((WORK_CROP[p.slug] || [])[i] ?? 15, 52.73) : '' }) }))), { gutter: '0rem', stack: false }) + cap + '</div><br>\n';
		mob += `<div data-s="${sec}" class="proj-row proj-row-m">` + await imgItem(p.mobile_thumbnail || thumbs[Math.floor(thumbs.length / 2)], { href, style: 'padding: 0.2rem;' + (crop ? pos(WORK_CROP_MOBILE[p.slug] ?? 34, 31.64) : '') }) + cap + '</div>';
	}
	const items = [['all', 'All'], ...SECTIONS.map((n) => [n, sectionLabel[n]])];
	const nav = `<column-set class="site-nav" style="--cols:5;--gutter:0rem;--mobile-gutter:0.0rem;" mobile-stack>` + items.map(([k, l]) => `<column-unit style="grid-column:span 1"><div style="text-align: center"><a href="/work/${k === 'all' ? '' : '#' + k}" data-f="${k}"${k === 'all' ? ' class="active"' : ''}>${l}</a></div></column-unit>`).join('') + `<column-unit style="grid-column:span 1"><div style="text-align: center"><a href="/info/">Info</a></div></column-unit></column-set>`;
	const hd = headerDesktop().replace(/<column-set[\s\S]*<\/column-set>/, nav);
	const hm = headerMobile({ big: true, nav: true }).replace(/<column-set[\s\S]*<\/column-set>/, nav);
	const css = `#work.page{min-height:var(--viewport-height)} #work .page-content{align-items:flex-start;padding:1.5rem}
#work .proj-row[data-s="beauty"]:not(.proj-row-m) media-item img{aspect-ratio:16/15;object-fit:cover}
#work .proj-row-m[data-s="beauty"] media-item img{aspect-ratio:16/9;object-fit:cover}`;
	const js = `<script>(function(){var L=document.querySelectorAll('a[data-f]');function set(f){if(!/^(narrative|commercials|beauty)$/.test(f))f='all';L.forEach(function(a){a.classList.toggle('active',a.dataset.f===f);});document.querySelectorAll('.proj-row[data-s]').forEach(function(r){var on=f==='all'||r.dataset.s===f;r.style.display=on?'':'none';var b=r.nextElementSibling;if(b&&b.tagName==='BR')b.style.display=on?'':'none';});}L.forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var f=a.dataset.f;history.replaceState(null,'',f==='all'?'/work/':'#'+f);set(f);scrollTo(0,0);});});set(location.hash.slice(1));addEventListener('hashchange',function(){set(location.hash.slice(1));});})();</script>`;
	const body = hd + desk + '</div>' + hm + '<br>' + mob + '</div>' + js;
	const description = `Work — ${order.map(([, p]) => p.hover_title || p.title).join(', ')}. Vincent Weiler, director of photography / chef opérateur, Paris — narrative, commercials, beauty.`;
	const og = await ogJpeg(((order[0] || [])[1]?.thumbnails || [])[0], 'work');
	write('work/index.html', page({ id: 'work', title: 'Work', body, css, description, url: '/work/', ogImage: og }));
}

async function buildHome() {
	const desk = `<div class="only-desktop"><h1 style="color: rgb(255, 255, 255); --font-scale: 1.5;"><a href="/work/">${esc(home.name)}</a></h1><h2 style="color: rgb(255, 230, 230); --font-scale: 1.5;"><a href="/work/">${esc(home.subtitle)}</a></h2><h2 style="color: rgb(255, 255, 255);"><br>
<br>
</h2></div>`;
	const mob = `<div class="only-mobile"><div style="text-align: center"><h1 style="color: rgb(255, 255, 255);"><a href="/work/">${esc(home.name)}</a></h1></div><div style="text-align: center"><h2 style="color: rgb(255, 255, 255);"><a href="/work/">${esc(home.subtitle)}</a><br>
<br>
</h2></div></div>`;
	PAGE_URL = '/';
	ALT = 'Vincent Weiler, director of photography — film still';
	const wall = async (list, cls) => {
		const items = [];
		for (const s of list || []) { const im = await image(s); if (im) useImage(im.src); if (im) items.push(`<media-item><img ${items.length < 2 ? 'src' : 'data-src'}="${im.src}" ${items.length < 2 ? 'srcset' : 'data-srcset'}="${im.srcset}" sizes="100vw" alt="${esc(ALT)}" decoding="async"></media-item>`); }
		const opts = { autoplay: true, delay: Number(home.seconds_per_image) || 1, speed: 1, type: 'fade', shuffle: home.shuffle !== false, nav: 'none', fill: 'fill' };
		return `<div class="backdrop wallpaper ${cls}" style="opacity:0.95"><gallery-slideshow class="wallpaper-slideshow" data-options='${esc(JSON.stringify(opts))}'>${items.join('')}</gallery-slideshow></div>`;
	};
	const wallpaper = await wall(home.background_images, 'only-desktop') + await wall(home.background_images_mobile?.length ? home.background_images_mobile : home.background_images, 'only-mobile');
	const css = `#home.page{min-height:var(--viewport-height)} #home .page-content{align-items:center;width:100%} #home .page-layout{align-items:center}
html:has(#home){cursor:pointer}
.vw-arrow{position:fixed;left:50%;bottom:2.2rem;transform:translateX(-50%);z-index:50;opacity:0;transition:opacity 1.4s ease;pointer-events:none;color:#fff}
.vw-arrow.on{opacity:.8;animation:vwnudge 3.2s ease-in-out 1.4s infinite}
.vw-arrow svg{display:block;width:18px;height:34px}
@keyframes vwnudge{0%,100%{transform:translate(-50%,0)}50%{transform:translate(-50%,3px)}}
@media (prefers-reduced-motion:reduce){.vw-arrow.on{animation:none}}`;
	const enter = `<div class="vw-arrow" aria-hidden="true"><svg viewBox="0 0 18 34" fill="none" stroke="currentColor" stroke-width="1"><path d="M9 1v31M2 25l7 7 7-7"/></svg></div><script>(function(){setTimeout(function(){var a=document.querySelector('.vw-arrow');if(a)a.classList.add('on');},2500);function go(){location.href='/work/';}document.addEventListener('click',function(e){if(e.target.closest('a'))e.preventDefault();go();});addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '||e.key==='ArrowDown')go();});})();</script>`;
	const og = await ogJpeg((home.background_images || [])[0], 'home');
	write('index.html', page({ id: 'home', title: '', body: desk + mob + enter, css, wallpaper, ogImage: og, url: '/' }));
	write('404.html', page({ id: 'home', title: '', body: desk + mob, css, wallpaper }));
}

async function buildInfo() {
	PAGE_URL = '/info/';
	ALT = 'Vincent Weiler, director of photography, on set';
	const ss = await slideshow(info.photos, { sizes: '40vw', autoplay: true, delay: 2, speed: 1, type: 'fade', shuffle: true, nav: 'none' });
	const text = `<div class="info-text" style="text-align: left"><span style="--font-scale: 0.9;"><span class="info-bio">${nl2br(info.text)}</span><span class="info-clients"><i>${esc(info.clients_title)}<br>
${esc(info.clients)}</i></span></span></div>`;
	const links = `<div class="info-links" style="text-align: left"><span style="color: rgb(0, 0, 0); --font-scale: 0.9;">${(info.links || []).map((l) => `<a href="${esc(l.url)}"${/^https?:/.test(l.url) ? ' target="_blank" rel="noopener"' : ''}>→ ${esc(l.label)}</a>`).join('')}</span></div>`;
	const row = columnSet([{ span: 5, html: ss }, { span: 5, html: text }, { span: 2, html: links }], { gutter: '2.6rem', stack: true });
	const body = headerDesktop('info') + '</div>' + headerMobile({ big: true, nav: 'info' }) + '<br>\n</div>' + row;
	write('info/index.html', page({ id: 'info', title: 'Info', body, url: '/info/', ogImage: PORTRAIT, description: `${String(info.text || '').replace(/\s+/g, ' ').trim()} ${info.clients_title || ''} ${info.clients || ''}`.trim() }));
}

async function buildContact() {
	const lines = (contact.lines || []).map(esc).join('<br>');
	const email = contact.email ? `<br>\n<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>` : '';
	const row = columnSet([{ html: `\n<br>\n${lines}${email}<br>\n${esc(contact.sign_off || '')}\n` }], { gutter: '1.3rem', stack: true });
	const body = headerDesktop() + '<br>\n</div>' + headerMobile({ big: true, nav: true }) + '<br>\n</div>' + row;
	write('contact/index.html', page({ id: 'contact', title: 'Contact', body, url: '/contact/', ogImage: '/og/home.jpg', description: 'Contact Vincent Weiler, director of photography / chef opérateur based in Paris — availability, rates and projects.' }));
}

async function buildShowreel() {
	const row = columnSet([{ html: videoItem(showreel.video) }], { gutter: '1.3rem', stack: true });
	const body = headerDesktop() + '<br>\n</div>' + headerMobile({ big: true, nav: true }) + '<br>\n</div>' + (showreel.title ? `<div style="text-align: left">${esc(showreel.title)}</div>` : '') + row;
	write('showreel/index.html', page({ id: 'showreel', title: 'Showreel', body, url: '/showreel/', ogImage: '/og/home.jpg', description: 'Showreel of Vincent Weiler, director of photography / chef opérateur (Paris) — commercials, beauty, fiction.' }));
}

// Gallery: every project still (gallery/photos.json + gallery/m/), same header as the site, linked from Info
function buildGallery() {
	const src = path.join(ROOT, 'gallery');
	if (!fs.existsSync(path.join(src, 'photos.json'))) return;
	copyDir(src, path.join(DIST, 'gallery'));
	const css = `#gallery .page-content{align-items:flex-start;padding:1.5rem}
.gal{width:100%;line-height:1.25}
.gal,.gal *{--font-size:1.2rem}
.mobile .gal,.mobile .gal *{--font-size:1.5rem}
.gal-sort{display:flex;justify-content:flex-end;gap:1.1em;color:#9c9c9c;margin:0 0 1.2rem}
.gal-sort button{font:inherit;color:#9c9c9c;background:none;border:none;padding:0;cursor:pointer}
.gal-sort button:hover,.gal-sort button.on{color:#030303}
.gal-p{margin:0 0 2.2rem}
.gal-h{display:flex;justify-content:space-between;align-items:baseline;gap:2rem;margin:0 0 .5rem}
.gal-h span{text-align:right}
.gal-h i{font-style:normal;font-weight:normal;color:rgba(0,0,0,.45)}
.gal-h>div{text-align:left}
.gal-t{color:#030303;text-decoration:none}.gal-t:hover{opacity:.55}
.gal-rows{width:100%}
.gal-row{display:flex;gap:4px;margin-bottom:4px}
.gal-row img{display:block;cursor:zoom-in;background:#f2f2f2}
.gal-lb{position:fixed;inset:0;z-index:1000;background:#fff;display:none;align-items:center;justify-content:center;font-size:1.2rem;font-family:"Diatype Substitute",sans-serif;color:#030303}
.gal-lb.on{display:flex}
.gal-lb img{max-width:calc(100vw - 8rem);max-height:calc(100vh - 7rem);object-fit:contain;cursor:pointer}
.gal-lb button{position:absolute;background:none;border:none;font:inherit;color:#030303;cursor:pointer}
.gal-x{top:0;right:0;padding:1rem 1.2rem!important;z-index:3}
.gal-prev,.gal-next{top:4rem;bottom:0;width:30%;z-index:2}
.gal-prev{left:0;cursor:w-resize}.gal-next{right:0;cursor:e-resize}
.gal-lb img{position:relative;z-index:1}
.gal-cap{z-index:2;pointer-events:none}
.gal-cap{position:absolute;left:0;right:0;bottom:1rem;text-align:center}
.gal-cap span{color:#9c9c9c;margin-left:.6em}
.mobile .gal-lb{font-size:1.5rem}
@media (max-width:760px){.gal-h{flex-direction:column;gap:.1rem}.gal-h span{text-align:left}.gal-sort{justify-content:flex-start;flex-wrap:wrap}.gal-lb img{max-width:100vw;max-height:calc(100vh - 6rem)}.gal-prev,.gal-next{display:none}}`;
	const gal = `<div id="gal" class="gal"><div class="gal-sort">Sort by <button data-s="all" class="on">All</button><button data-s="Narrative">Narrative</button><button data-s="Commercials">Commercials</button><button data-s="Beauty">Beauty</button></div><div class="gal-list"></div></div><script src="/gallery/gallery.js" defer></script>`;
	const body = headerDesktop() + '<br>\n</div>' + headerMobile({ big: true, nav: true }) + '<br>\n</div>' + gal;
	write('gallery/index.html', page({ id: 'gallery', title: 'Gallery', body, css, url: '/gallery/', ogImage: '/og/home.jpg', description: 'Gallery of film stills by Vincent Weiler, director of photography / chef opérateur based in Paris — narrative, commercials and beauty.' }));
}

function copyDir(src, dst) {
	fs.mkdirSync(dst, { recursive: true });
	for (const f of fs.readdirSync(src)) {
		const s = path.join(src, f), d = path.join(dst, f);
		fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
	}
}

function redirects() {
	const old = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/old-urls.json'), 'utf8'));
	const lines = [];
	for (const [from, to] of Object.entries(old)) {
		const target = '/' + (to ? to + '/' : '');
		lines.push(`/${encodeURI(from)}  ${target}  301`);
		if (encodeURI(from) !== from) lines.push(`/${from}  ${target}  301`);
		if (from.includes("'")) lines.push(`/${encodeURI(from).replace(/'/g, '%27')}  ${target}  301`);
	}
	fs.writeFileSync(path.join(DIST, '_redirects'), lines.join('\n') + '\n');
}

function sitemap(base = 'https://www.vincentweiler.com') {
	const urls = ['/', '/work/', ...SECTIONS.map((s) => `/${s}/`), ...Object.keys(projects).map((s) => `/${s}/`), '/info/', '/gallery/', '/contact/', '/showreel/'];
	for (const u of ['/', '/info/']) { if (!pageImages.has(u)) pageImages.set(u, new Set()); pageImages.get(u).add(PORTRAIT); }
	const img = (u) => [...(pageImages.get(u) || [])].map((s) => `<image:image><image:loc>${base}${s}</image:loc></image:image>`).join('');
	fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.map((u) => `<url><loc>${base}${u}</loc>${img(u)}</url>`).join('\n')}\n</urlset>\n`);
	fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
}

async function main() {
	const t0 = Date.now();
	fs.rmSync(DIST, { recursive: true, force: true });
	fs.mkdirSync(DIST, { recursive: true });
	copyDir(path.join(ROOT, 'build/assets'), path.join(DIST, 'assets'));
	copyDir(path.join(ROOT, 'build/fonts'), path.join(DIST, 'fonts'));
	copyDir(path.join(ROOT, 'media/portrait'), path.join(DIST, 'media/portrait'));
	fs.copyFileSync(path.join(ROOT, 'build/favicon.ico'), path.join(DIST, 'favicon.ico'));
	fs.copyFileSync(path.join(ROOT, 'build/_headers'), path.join(DIST, '_headers'));

	const all = [...(home.background_images || []), ...(home.background_images_mobile || []), ...(info.photos || [])];
	for (const p of Object.values(projects)) {
		all.push(...(p.thumbnails || []), p.mobile_thumbnail);
		for (const b of p.blocks || []) all.push(...(b.images || []));
	}
	await prepareImages(all);

	await buildHome();
	await buildWork();
	for (const s of SECTIONS) await buildSection(s);
	for (const p of Object.values(projects)) await buildProject(p);
	await buildInfo();
	await buildContact();
	await buildShowreel();
	buildGallery();
	redirects();
	sitemap();
	const missing = Object.keys(projects).filter((s) => !SECTIONS.some((n) => (sections[n].projects || []).some((it) => slugOf(it.project || it) === s)));
	if (missing.length) console.log('  Projets en ligne mais absents des rubriques :', missing.join(', '));
	if (process.env.PRUNE_IMAGE_CACHE) for (const f of fs.readdirSync(CACHE)) if (!usedCache.has(f)) fs.unlinkSync(path.join(CACHE, f));
	console.log(`Site généré dans dist/ : ${Object.keys(projects).length} projets, ${imgCache.size} images (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
