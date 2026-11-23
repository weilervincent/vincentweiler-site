// Gallery page: every project still in its original format, justified rows of near-equal height,
// a small "Sort by" filter, and a full-screen slideshow per project on click.
(function () {
	const root = document.getElementById('gal');
	if (!root) return;
	const GAP = 4;
	let DATA = [], filter = 'all';
	const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
	const list = root.querySelector('.gal-list');

	fetch('/gallery/photos.json').then((r) => r.json()).then((d) => { DATA = d; build(); layout(); }).catch(() => { list.textContent = ''; });

	// ---------------------------------------------------------------- sort by
	root.querySelector('.gal-sort').addEventListener('click', (e) => {
		const b = e.target.closest('button'); if (!b) return;
		filter = b.dataset.s;
		root.querySelectorAll('.gal-sort button').forEach((x) => x.classList.toggle('on', x === b));
		build(); layout();
	});

	function visible() { return DATA.map((g, i) => ({ g, i })).filter(({ g }) => filter === 'all' || g.section === filter); }
	function build() {
		list.innerHTML = visible().map(({ g, i }) => `<section class="gal-p"><div class="gal-h"><div><a class="gal-t" href="/${esc(g.slug)}/"><b>${esc(g.title)}</b></a>${g.featuring && g.featuring.length ? `<i> with ${esc(g.featuring.join(', '))}</i>` : ''}</div><span>${esc(g.credits)}</span></div><div class="gal-rows" data-g="${i}"></div></section>`).join('');
	}

	// ---------------------------------------------------------------- layout
	function layout() {
		const first = list.querySelector('.gal-rows'); if (!first) return;
		const W = first.clientWidth;
		const target = W < 700 ? Math.max(80, W * 0.27) : Math.min(190, Math.max(130, W * 0.115));
		const hOf = (r) => (W - GAP * (r.length - 1)) / r.reduce((s, it) => s + it.w / it.h, 0);
		list.querySelectorAll('.gal-rows').forEach((box) => {
			const gi = +box.dataset.g, grp = DATA[gi], items = grp.items, rows = []; let row = [];
			items.forEach((it) => {
				const h0 = row.length ? hOf(row) : Infinity; row.push(it); const h1 = hOf(row);
				if (h1 <= target) {
					if (row.length > 1 && Math.abs(h0 - target) < Math.abs(h1 - target)) { row.pop(); rows.push(row); row = [it]; }
					else { rows.push(row); row = []; }
				}
			});
			if (row.length && rows.length && hOf(rows[rows.length - 1].concat(row)) >= target * 0.72) { rows[rows.length - 1] = rows[rows.length - 1].concat(row); row = []; }
			let html = '', lastH = target, n = 0;
			const img = (it, h) => `<img loading="lazy" decoding="async" src="${it.m}" data-g="${gi}" data-n="${n++}" style="width:${(h * it.w / it.h).toFixed(2)}px;height:${h.toFixed(2)}px" alt="${esc(it.alt || grp.title + ' — ' + grp.credits)}">`;
			rows.forEach((r) => { const h = hOf(r); lastH = h; html += '<div class="gal-row">' + r.map((it) => img(it, h)).join('') + '</div>'; });
			if (row.length) { const h = Math.min(hOf(row), rows.length ? lastH : target); html += '<div class="gal-row">' + row.map((it) => img(it, h)).join('') + '</div>'; }
			box.innerHTML = html;
		});
	}
	let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(layout, 120); });

	// ---------------------------------------------------------------- full-screen slideshow
	const lb = document.createElement('div');
	lb.className = 'gal-lb';
	lb.innerHTML = '<button class="gal-x" aria-label="Close">Close</button><button class="gal-prev" aria-label="Previous"></button><img alt=""><button class="gal-next" aria-label="Next"></button><div class="gal-cap"></div>';
	document.body.appendChild(lb);
	const lbImg = lb.querySelector('img'), cap = lb.querySelector('.gal-cap');
	let cur = null, idx = 0;
	function show() {
		const it = cur.items[idx];
		lbImg.src = it.m; lbImg.alt = it.alt || cur.title;
		cap.innerHTML = `<b>${esc(cur.title)}</b> <span>${idx + 1} / ${cur.items.length}</span>`;
		const nx = cur.items[(idx + 1) % cur.items.length]; if (nx) { const p = new Image(); p.src = nx.m; }
	}
	function open(gi, n) { cur = DATA[gi]; idx = n; show(); lb.classList.add('on'); document.documentElement.style.overflow = 'hidden'; }
	function close() { lb.classList.remove('on'); lbImg.removeAttribute('src'); document.documentElement.style.overflow = ''; }
	const step = (d) => { idx = (idx + d + cur.items.length) % cur.items.length; show(); };
	list.addEventListener('click', (e) => { const im = e.target.closest('img[data-g]'); if (im) open(+im.dataset.g, +im.dataset.n); });
	lb.querySelector('.gal-prev').onclick = (e) => { e.stopPropagation(); step(-1); };
	lb.querySelector('.gal-next').onclick = (e) => { e.stopPropagation(); step(1); };
	lb.querySelector('.gal-x').onclick = close;
	lbImg.onclick = (e) => { e.stopPropagation(); step(1); };
	lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
	addEventListener('keydown', (e) => {
		if (!lb.classList.contains('on')) return;
		if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1);
	});
	let sx = null;
	lb.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
	lb.addEventListener('touchend', (e) => { if (sx === null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1); sx = null; });
})();
