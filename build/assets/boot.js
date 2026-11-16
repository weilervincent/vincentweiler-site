/* Runs in <head>: responsive base size + mobile mode, like Cargo 3. */
(function () {
	var d = document.documentElement;
	d.classList.add('js');
	var portraitQ = window.matchMedia('(max-aspect-ratio: 4/5)');
	var landQ = window.matchMedia('(min-aspect-ratio: 2/3) and (max-height: 500px)');
	function isMobile() { return portraitQ.matches || landQ.matches; }

	// Send visitors to the matching desktop / mobile version of the page.
	var twin = d.getAttribute('data-twin');
	var kind = d.getAttribute('data-kind');
	if (twin && !/[?&]stay/.test(location.search)) {
		if ((kind === 'desktop' && isMobile()) || (kind === 'mobile' && !isMobile())) {
			location.replace(twin + location.hash);
			return;
		}
	}

	// Stable viewport height: on phones the address bar shrinks/grows while scrolling,
	// which must not resize text or re-centre the page. Use the small viewport (svh).
	var probe = document.createElement('div');
	probe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:100vh;height:100svh;visibility:hidden;pointer-events:none';
	d.appendChild(probe);
	var lastW = -1;
	function apply(e) {
		var w = d.clientWidth || window.innerWidth;
		var mobile = isMobile();
		if (e && e.type === 'resize' && mobile && w === lastW) return; // only the address bar moved
		lastW = w;
		var h = mobile ? (probe.getBoundingClientRect().height || window.innerHeight) : window.innerHeight;
		var l = 0;
		if (h > w) { l = (h / w - 1) / 0.777777778; if (l > 1) l = 1; }
		var f = (mobile && !portraitQ.matches) ? 18 : 9;
		var unit = Math.min(w, h) / (100 / (f + 5 * l));
		if (unit < 20) unit = 20;
		d.style.setProperty('--base-size', (unit * 0.16) + 'px');
		d.style.setProperty('--viewport-height', mobile ? '100svh' : h + 'px');
		d.classList.toggle('mobile', mobile);
	}
	apply();
	window.addEventListener('resize', apply, { passive: true });
	portraitQ.addEventListener && portraitQ.addEventListener('change', apply);
})();
