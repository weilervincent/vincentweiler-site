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
		const base = rel.replace(/\.(jpe?g|png|tiff?|webp|heic|avif|gif)$/i, '');
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
async function imgItem(src, { href, eager, style, noAnim, sizes } = {}) {
	const im = await image(src);
	if (!im) return '';
	const tag = `<img src="${im.src}" srcset="${im.srcset}" sizes="${sizes || '100vw'}" width="${im.w}" height="${im.h}" alt="" decoding="async" loading="${eager ? 'eager' : 'lazy'}"${style ? ` style="${style}"` : ''}>`;
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
		items.push(`<media-item><img ${items.length < 2 ? 'src' : 'data-src'}="${im.src}" ${items.length < 2 ? 'srcset' : 'data-srcset'}="${im.srcset}" sizes="${opts.sizes || '90vw'}" width="${im.w}" height="${im.h}" alt="" decoding="async"></media-item>`);
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
	const items = [['narrative', 'Narrative', '/narrative/'], ['commercials', 'Commercials', '/commercials/'], ['beauty', 'Beauty', '/beauty/'], ['info', 'Info', '/info/']];
	return columnSet(items.map(([k, label, href]) => ({ html: `<div style="text-align: center"><a href="${href}"${k === active ? ' class="active"' : ''}>${label}</a></div>` })), { gutter: '0rem', mobileGutter: '0.0rem', stack: true });
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
${section ? `<a class="caption-black" href="/${section}/" style="color: rgb(0, 0, 0); --font-scale: 0.75;">${sectionLabel[section]}</a>` : ''}</div>${nav ? navDesktop() : ''}<br>
`;
}

// ------------------------------------------------------------------ page shell
function page({ id, title, body, css = '', bodyClass = '', ogImage, wallpaper = '' }) {
	const fullTitle = title ? `${title} — ${settings.site_title}` : settings.site_title;
	const ga = settings.google_analytics ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(settings.google_analytics)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(settings.google_analytics)}');</script>` : '';
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(settings.description)}">
<meta name="keywords" content="${esc(settings.keywords)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(settings.description)}">
${ogImage ? `<meta property="og:image" content="${ogImage}">` : ''}
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
function write(rel, html) {
	const out = path.join(DIST, rel);
	fs.mkdirSync(path.dirname(out), { recursive: true });
	fs.writeFileSync(out, html);
}

// ------------------------------------------------------------------ pages
async function buildProject(p) {
	const tw = Math.min(11, Math.max(1, parseInt(p.title_width) || 5));
	const titleRow = (credits) => columnSet([
		{ span: tw, html: `<div style="text-align: left"><b>${esc(p.title)}</b></div>` },
		{ span: 12 - tw, html: `<div style="text-align: right">${credits}</div>` },
	], { gutter: '2rem', stack: false });

	let desk = titleRow(esc(p.credits || '')) + '<br>\n';
	let mob = titleRow(nl2br(p.credits_mobile || String(p.credits || '').replace(/\s+I\s+/g, '\n'))) + '<br>\n';
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
	const og = (await image((p.thumbnails || [])[0]))?.src;
	write(`${p.slug}/index.html`, page({ id: `p-${p.slug}`, title: p.title, body, ogImage: og }));
}

async function buildSection(name) {
	const sec = sections[name];
	const list = (sec.projects || []).map((it) => projects[slugOf(it.project || it)]).filter(Boolean);
	let desk = '';
	let mob = '';
	for (const p of list) {
		const href = `/${p.slug}/`;
		const thumbs = (p.thumbnails || []).filter(Boolean);
		const cap = `<a class="proj-cap" href="${href}" aria-label="${esc(p.hover_title || p.title)}"><span>${esc(p.hover_title || p.title)}</span></a>`;
		desk += `<div class="proj-row">` + columnSet(await Promise.all(thumbs.map(async (t) => ({ html: await imgItem(t, { href, sizes: `${Math.round(90 / thumbs.length)}vw` }) }))), { gutter: '0rem', stack: false }) + cap + '</div><br>\n';
		mob += `<div class="proj-row proj-row-m">` + await imgItem(p.mobile_thumbnail || thumbs[Math.floor(thumbs.length / 2)], { href, style: 'padding: 0.2rem;' }) + cap + '</div>';
	}
	const css = `#s-${name}.page{min-height:var(--viewport-height)} #s-${name} .page-content{align-items:flex-start;padding:1.5rem}`;
	const body = headerDesktop(name) + desk + '</div>' + headerMobile({ big: true }) + '<br>' + mob + '</div>';
	write(`${name}/index.html`, page({ id: `s-${name}`, title: sec.title || sectionLabel[name], body, css }));
}

async function buildHome() {
	const nav = (cls, scale) => columnSet([['Narrative', '/narrative/'], ['Commercials', '/commercials/'], ['Beauty', '/beauty/'], ['Info', '/info/']].map(([l, h]) => ({ html: `<a class="caption" href="${h}" style="color: rgb(255, 255, 255);${scale ? ' --font-scale: 1.25;' : ''}">${l}</a>` })), { gutter: '1rem' });
	const desk = `<div class="only-desktop"><h1 style="color: rgb(255, 255, 255); --font-scale: 1.5;"><a href="/">${esc(home.name)}</a></h1><h2 style="color: rgb(255, 230, 230); --font-scale: 1.5;"><a href="/">${esc(home.subtitle)}</a></h2><h2 style="color: rgb(255, 255, 255);"><br>
<br>
</h2><br>${nav('', true)}</div>`;
	const mob = `<div class="only-mobile"><div style="text-align: center"><h1 style="color: rgb(255, 255, 255);"><a href="/">${esc(home.name)}</a></h1></div><div style="text-align: center"><h2 style="color: rgb(255, 255, 255);"><a href="/">${esc(home.subtitle)}</a><br>
<br>
</h2></div><br>${nav('', false)}</div>`;
	const wall = async (list, cls) => {
		const items = [];
		for (const s of list || []) { const im = await image(s); if (im) items.push(`<media-item><img ${items.length < 2 ? 'src' : 'data-src'}="${im.src}" ${items.length < 2 ? 'srcset' : 'data-srcset'}="${im.srcset}" sizes="100vw" alt="" decoding="async"></media-item>`); }
		const opts = { autoplay: true, delay: Number(home.seconds_per_image) || 1, speed: 1, type: 'fade', shuffle: home.shuffle !== false, nav: 'none', fill: 'fill' };
		return `<div class="backdrop wallpaper ${cls}" style="opacity:0.95"><gallery-slideshow class="wallpaper-slideshow" data-options='${esc(JSON.stringify(opts))}'>${items.join('')}</gallery-slideshow></div>`;
	};
	const wallpaper = await wall(home.background_images, 'only-desktop') + await wall(home.background_images_mobile?.length ? home.background_images_mobile : home.background_images, 'only-mobile');
	const css = `#home.page{min-height:var(--viewport-height)} #home .page-content{align-items:center;width:100%} #home .page-layout{align-items:center}`;
	const og = (await image((home.background_images || [])[0]))?.src;
	write('index.html', page({ id: 'home', title: '', body: desk + mob, css, wallpaper, ogImage: og }));
	write('404.html', page({ id: 'home', title: '', body: desk + mob, css, wallpaper }));
}

async function buildInfo() {
	const ss = await slideshow(info.photos, { sizes: '40vw', autoplay: true, delay: 2, speed: 1, type: 'fade', shuffle: true, nav: 'none' });
	const text = `<div class="info-text" style="text-align: left"><span style="--font-scale: 0.9;"><span class="info-bio">${nl2br(info.text)}</span><span class="info-clients"><i>${esc(info.clients_title)}<br>
${esc(info.clients)}</i></span></span></div>`;
	const links = `<div class="info-links" style="text-align: left"><span style="color: rgb(0, 0, 0); --font-scale: 0.9;">${(info.links || []).map((l) => `<a href="${esc(l.url)}"${/^https?:/.test(l.url) ? ' target="_blank" rel="noopener"' : ''}>→ ${esc(l.label)}</a>`).join('')}</span></div>`;
	const row = columnSet([{ span: 5, html: ss }, { span: 5, html: text }, { span: 2, html: links }], { gutter: '2.6rem', stack: true });
	const body = headerDesktop('info') + '</div>' + headerMobile({ big: true }) + '</div>' + row;
	write('info/index.html', page({ id: 'info', title: 'Info', body }));
}

async function buildContact() {
	const lines = (contact.lines || []).map(esc).join('<br>');
	const email = contact.email ? `<br>\n<a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a>` : '';
	const row = columnSet([{ html: `\n<br>\n${lines}${email}<br>\n${esc(contact.sign_off || '')}\n` }], { gutter: '1.3rem', stack: true });
	const body = headerDesktop() + '<br>\n</div>' + headerMobile({ big: true, nav: true }) + '<br>\n</div>' + row;
	write('contact/index.html', page({ id: 'contact', title: 'Contact', body }));
}

async function buildShowreel() {
	const row = columnSet([{ html: videoItem(showreel.video) }], { gutter: '1.3rem', stack: true });
	const body = headerDesktop() + '<br>\n</div>' + headerMobile({ big: true, nav: true }) + '<br>\n</div>' + (showreel.title ? `<div style="text-align: left">${esc(showreel.title)}</div>` : '') + row;
	write('showreel/index.html', page({ id: 'showreel', title: 'Showreel', body }));
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
	const urls = ['/', ...SECTIONS.map((s) => `/${s}/`), ...Object.keys(projects).map((s) => `/${s}/`), '/info/', '/contact/', '/showreel/'];
	fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('\n')}\n</urlset>\n`);
	fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`);
}

async function main() {
	const t0 = Date.now();
	fs.rmSync(DIST, { recursive: true, force: true });
	fs.mkdirSync(DIST, { recursive: true });
	copyDir(path.join(ROOT, 'build/assets'), path.join(DIST, 'assets'));
	copyDir(path.join(ROOT, 'build/fonts'), path.join(DIST, 'fonts'));
	fs.copyFileSync(path.join(ROOT, 'build/favicon.ico'), path.join(DIST, 'favicon.ico'));
	fs.copyFileSync(path.join(ROOT, 'build/_headers'), path.join(DIST, '_headers'));

	const all = [...(home.background_images || []), ...(home.background_images_mobile || []), ...(info.photos || [])];
	for (const p of Object.values(projects)) {
		all.push(...(p.thumbnails || []), p.mobile_thumbnail);
		for (const b of p.blocks || []) all.push(...(b.images || []));
	}
	await prepareImages(all);

	await buildHome();
	for (const s of SECTIONS) await buildSection(s);
	for (const p of Object.values(projects)) await buildProject(p);
	await buildInfo();
	await buildContact();
	await buildShowreel();
	redirects();
	sitemap();
	const missing = Object.keys(projects).filter((s) => !SECTIONS.some((n) => (sections[n].projects || []).some((it) => slugOf(it.project || it) === s)));
	if (missing.length) console.log('  Projets en ligne mais absents des rubriques :', missing.join(', '));
	if (process.env.PRUNE_IMAGE_CACHE) for (const f of fs.readdirSync(CACHE)) if (!usedCache.has(f)) fs.unlinkSync(path.join(CACHE, f));
	console.log(`Site généré dans dist/ : ${Object.keys(projects).length} projets, ${imgCache.size} images (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
