/* Slideshows, wallpaper backdrop and scroll animation. */
(function () {
	var mobile = function () { return document.documentElement.classList.contains('mobile'); };

	// Cargo shrinks page padding on phones by --mobile-padding-offset.
	function mobilePadding() {
		var off = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mobile-padding-offset'));
		if (isNaN(off)) off = 1;
		document.querySelectorAll('.page-content').forEach(function (pc) {
			pc.style.padding = '';
			if (!mobile()) return;
			var cs = getComputedStyle(pc);
			pc.style.padding = ['Top', 'Right', 'Bottom', 'Left'].map(function (k) { return (parseFloat(cs['padding' + k]) * off) + 'px'; }).join(' ');
		});
	}
	mobilePadding();
	window.addEventListener('resize', mobilePadding, { passive: true });

	function shuffle(a) {
		for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
		return a;
	}

	function Slideshow(el) {
		var o = {};
		try { o = JSON.parse(el.getAttribute('data-options') || '{}'); } catch (e) {}
		var m = mobile();
		var type = (m && o.mType) || o.type || 'slide';
		var speed = parseFloat((m && o.mSpeed) || o.speed);
		if (isNaN(speed)) speed = 0.8;
		var delay = parseFloat((m && o.mDelay) || o.delay) || 3;
		var nav = (m && o.mNav) || o.nav || 'cursor-zones';
		var doShuffle = o.shuffle && !(m && o.mShuffle === 'false');
		var items = Array.prototype.slice.call(el.children).filter(function (c) { return c.tagName === 'MEDIA-ITEM'; });
		if (!items.length) return;
		if (doShuffle) { shuffle(items).forEach(function (it) { el.appendChild(it); }); }
		el.setAttribute('data-type', type === 'fade' ? 'fade' : 'slide');
		el.setAttribute('data-nav', items.length > 1 ? nav : 'none');
		if (o.fill) el.setAttribute('data-fill', o.fill);
		el.style.setProperty('--speed', speed + 's');
		var idx = 0, timer = null, hover = false;

		function load(i) {
			var it = items[(i + items.length) % items.length];
			var img = it && it.querySelector('img[data-src]');
			if (img) { img.src = img.getAttribute('data-src'); img.removeAttribute('data-src'); }
		}
		function show(n, dir) {
			var prev = idx;
			idx = (n + items.length) % items.length;
			items.forEach(function (it, i) {
				it.classList.toggle('current', i === idx);
				it.classList.toggle('prev', type !== 'fade' && (dir > 0 ? i === prev : false) && i !== idx);
				if (type !== 'fade' && i !== idx && i !== prev) it.classList.add('no-anim-step'); else it.classList.remove('no-anim-step');
			});
			load(idx + 1);
		}
		function next() { show(idx + 1, 1); }
		function prevSlide() { show(idx - 1, -1); }
		function schedule() {
			clearTimeout(timer);
			if (o.autoplay === false || items.length < 2) return;
			timer = setTimeout(function () { next(); schedule(); }, (delay + speed) * 1000);
		}

		load(0); show(0, 1); load(1);
		if (items.length > 1) {
			if (nav === 'cursor-zones' || nav === 'single-advance') {
				el.addEventListener('mousemove', function (e) {
					var r = el.getBoundingClientRect();
					el.classList.toggle('left-zone', nav === 'cursor-zones' && (e.clientX - r.left) < Math.max(40, r.width * 0.2));
				});
				el.addEventListener('click', function (e) {
					if (e.target.closest('a,iframe')) return;
					var r = el.getBoundingClientRect();
					if (nav === 'cursor-zones' && (e.clientX - r.left) < Math.max(40, r.width * 0.2)) prevSlide(); else next();
					schedule();
				});
			} else if (nav === 'buttons') {
				var mk = function (cls, label, path, fn) {
					var b = document.createElement('button');
					b.type = 'button'; b.className = 'ss-btn ' + cls; b.setAttribute('aria-label', label);
					b.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="' + path + '" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
					b.addEventListener('click', function (e) { e.stopPropagation(); fn(); schedule(); });
					el.appendChild(b);
				};
				mk('ss-prev', 'Previous', 'M9 2L4 7l5 5', prevSlide);
				mk('ss-next', 'Next', 'M5 2l5 5-5 5', next);
			}
			// touch swipe
			var sx = null;
			el.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
			el.addEventListener('touchend', function (e) {
				if (sx === null) return;
				var dx = e.changedTouches[0].clientX - sx; sx = null;
				if (Math.abs(dx) > 40) { dx < 0 ? next() : prevSlide(); schedule(); }
			}, { passive: true });
		}
		schedule();
	}

	document.querySelectorAll('gallery-slideshow').forEach(function (el) { Slideshow(el); });

	// fade-up scroll animation for media (skipped inside slideshows / when disabled)
	var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	if ('IntersectionObserver' in window && !reduce) {
		var targets = Array.prototype.slice.call(document.querySelectorAll('bodycopy media-item')).filter(function (m) {
			return !m.hasAttribute('no-anim') && !m.closest('gallery-slideshow');
		});
		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (en) {
				if (en.isIntersecting) {
					en.target.classList.add('anim-in');
					en.target.classList.remove('anim-pending');
					io.unobserve(en.target);
				}
			});
		}, { rootMargin: '0px 0px -5% 0px' });
		targets.forEach(function (t) {
			var r = t.getBoundingClientRect();
			if (r.top < window.innerHeight) return; // already visible on load: no animation
			t.classList.add('anim-pending');
			io.observe(t);
		});
	}
})();
