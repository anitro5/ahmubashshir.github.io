/*
This is a modified version of Ethan Marcotte's service worker (https://ethanmarcotte.com/theworkerofservices.js),
which is in turn a modified version of Jeremy Keith's service worker (https://adactio.com/serviceworker.js),
with a few additional edits borrowed from Filament Group's. (https://www.filamentgroup.com/sw.js)
*/

( function () {
	const version = '{{ slicestr ((.Lastmod | time.AsTime).Unix | sha1) 0 7 }}';
	const cacheName = version + '::blog::';

	const staticCacheName = cacheName + 'static';
	const remoteCacheName = cacheName + 'remote';
	const imagesCacheName = cacheName + 'images';
	const pagesCacheName = cacheName + 'pages';

	const trimLimit = {
		static: 50,
		remote: 50,
		pages: 100,
		images: 150
	}
	const staticAssets = [
		'/',
		"/assets/js/graphviz.min.js",
		"/assets/css/highlight.min.css",
		"/assets/js/highlight.min.js",
		"assets/js/jquery.min.js",
		"/assets/js/photoswipe.min.js",
		"/assets/css/photoswipe/default-skin.png",
		"/assets/css/photoswipe/default-skin.svg",
		"/assets/css/photoswipe/preloader.gif",
		"/assets/css/photoswipe/style.min.css",
		"/assets/js/search.min.js",
		"/assets/css/stylesheet.min.css",
		"/assets/js/tracker.ackee.min.js",
		'/assets/icons/favicon/16x16.png',
		'/assets/icons/favicon/32x32.png',
		'/assets/icons/favicon/48x48.png',
		'/assets/icons/apple/base.png',
		'/assets/icons/apple/tab.svg',
		'/search/',
		'/index.json',
		'/offline/',
		'/404.html'
	];
	const whitelist = {
		remote: [ 'unpkg.com' ],
		images: [
			'i.creativecommons.org',
			'i.imgur.com'
		],
		includes: ( domain ) => {
			for ( let val of Object.values( whitelist ) ) {
				if ( typeof ( val ) === 'function' ) continue;
				if ( val.includes( domain ) ) {
					return true;
				}
			}
			return false;
		}
	}

	function updateStaticCache() {
		// These items must be cached for the Service Worker to complete installation
		return caches.open( staticCacheName )
			.then( cache => {
				return cache.addAll( staticAssets.map( url => new Request( url, {
					credentials: 'include'
				} ) ) );
			} );
	}

	function getCacheByDomain( domain ) {
		let list = whitelist;
		for ( let key of Object.keys( list ) ) {
			if ( typeof ( list[ key ] ) === 'function' ) continue;
			let cache = list[ key ];
			if ( cache && cache.includes( domain ) ) {
				return cacheName + key;
			}
		}
		return cacheName + 'remote';
	}

	function getCacheForPath( path, domain ) {
		if ( ( staticAssets.includes( path ) || path.startsWith( '/assets/' ) ) === true ) {
			return staticCacheName;
		} else if ( whitelist.includes( domain ) === true ) {
			return getCacheByDomain( domain );
		} else {
			return pagesCacheName;
		}
	}

	function stashInCache( cacheName, request, response ) {
		caches.open( cacheName )
			.then( cache => cache.put( request, response ) );
	}

	// Limit the number of items in a specified cache.
	function trimCache( cacheName, maxItems ) {
		caches.open( cacheName )
			.then( cache => {
				cache.keys()
					.then( keys => {
						if ( keys.length > maxItems ) {
							cache.delete( keys[ 0 ] )
								.then( trimCache( cacheName, maxItems ) );
						}
					} );
			} );
	}

	// Remove caches whose name is no longer valid
	function clearOldCaches() {
		return caches.keys()
			.then( keys => {
				return Promise.all( keys
					.filter( key => key.indexOf( version ) !== 0 )
					.map( key => caches.delete( key ) )
				);
			} );
	}

	// Events!
	self.addEventListener( 'message', event => {
		if ( event.data.command === 'trimCaches' ) {
			for ( let key of Object.keys( trimLimit ) ) {
				trimCache( cacheName + key, trimLimit[ key ] );
			}
		}
	} );

	self.addEventListener( 'install', event => {
		event.waitUntil( updateStaticCache()
			.then( () => self.skipWaiting() )
		);
	} );

	self.addEventListener( 'activate', event => {
		event.waitUntil( clearOldCaches()
			.then( () => self.clients.claim() )
		);
	} );

	self.addEventListener( 'fetch', event => {
		const request = event.request;
		const url = new URL( request.url );

		if ( ( url.href.startsWith( '{{ $.Site.BaseURL }}' ) || whitelist.includes( url.hostname ) ) === false ) {
			return;
		}

		// Ignore testing blog
		if ( url.pathname.startsWith( '/blog/' ) === true ) {
			return;
		}

		// Ignore non-GET requests
		if ( request.method !== 'GET' ) {
			return;
		}

		// Ignore query-string'd requests
		if ( url.href.indexOf( '?' ) !== -1 ) {
			return;
		}

		// Try the network first, fall back to the cache, finally the offline page (for HTML requests)
		event.respondWith(
			fetch( request )
			.then( response => {
				// NETWORK
				// Stash a copy of this page in the pages cache
				const copy = response.clone();
				stashInCache( getCacheForPath( url.pathname, url.hostname ), request, copy );
				return response;
			} )
			.catch( ( e ) => {
				console.log( e )
				// CACHE or FALLBACK
				if ( request.headers.get( 'Accept' ).indexOf( 'text/html' ) !== -1 ) {
					return caches.match( request )
						.then( response => response || caches.match( '/offline/' ) );
				} else {
					return caches.match( request ).then( response => response );
				}
			} )
		);
		return;

	} );
} )();
