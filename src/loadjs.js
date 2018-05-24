/**
 * Global dependencies.
 * @global {Object} document - DOM
 */

var devnull = function() {},
	bundleIdCache = {},
	bundleResultCache = {},
	bundleCallbackQueue = {},
	config = {};

/**
 * Subscribe to bundle load event.
 * @param {string[]} bundleIds - Bundle ids
 * @param {Function} callbackFn - The callback function
 */
function subscribe(bundleIds, callbackFn) {
	// listify
	bundleIds = bundleIds.push ? bundleIds : [bundleIds];

	var depsNotFound = [],
		i = bundleIds.length,
		numWaiting = i,
		fn,
		bundleId,
		r,
		q;

	// define callback function
	fn = function(bundleId, pathsNotFound) {
		if (pathsNotFound.length) depsNotFound.push(bundleId);

		numWaiting--;
		if (!numWaiting) callbackFn(depsNotFound);
	};

	// register callback
	while (i--) {
		bundleId = bundleIds[i];

		// execute callback if in result cache
		r = bundleResultCache[bundleId];
		if (r) {
			fn(bundleId, r);
			continue;
		}

		// add to callback queue
		q = bundleCallbackQueue[bundleId] = bundleCallbackQueue[bundleId] || [];
		q.push(fn);
	}
}

/**
 * Publish bundle load event.
 * @param {string} bundleId - Bundle id
 * @param {string[]} pathsNotFound - List of files not found
 */
function publish(bundleId, pathsNotFound) {
	// exit if id isn't defined
	if (!bundleId) return;

	var q = bundleCallbackQueue[bundleId];

	// cache result
	bundleResultCache[bundleId] = pathsNotFound;

	// exit if queue is empty
	if (!q) return;

	// empty callback queue
	while (q.length) {
		q[0](bundleId, pathsNotFound);
		q.splice(0, 1);
	}
}

/**
 * Load individual file.
 * @param {string} path - The file path
 * @param {Function} callbackFn - The callback function
 */
function loadFile(path, callbackFn, args, numTries) {
	var doc = document,
		async = args.async,
		maxTries = (args.numRetries || 0) + 1,
		beforeCallbackFn = args.before || devnull,
		isCss,
		e;

	numTries = numTries || 0;

	if (/(^css!|\.css$)/.test(path)) {
		isCss = true;

		// css
		e = doc.createElement('link');
		e.rel = 'stylesheet';
		e.href = path.replace(/^css!/, ''); // remove "css!" prefix
	} else {
		// javascript
		e = doc.createElement('script');
		e.src = path;
		e.async = async === undefined ? true : async;
	}

	e.onload = e.onerror = e.onbeforeload = function(ev) {
		var result = ev.type[0];

		// Note: The following code isolates IE using `hideFocus` and treats empty
		// stylesheets as failures to get around lack of onerror support
		if (isCss && 'hideFocus' in e) {
			try {
				if (!e.sheet.cssText.length) result = 'e';
			} catch (x) {
				// sheets objects created from load errors don't allow access to
				// `cssText`
				result = 'e';
			}
		}

		// handle retries in case of load failure
		if (result == 'e') {
			// increment counter
			numTries += 1;

			// exit function and try again
			if (numTries < maxTries) {
				return loadFile(path, callbackFn, args, numTries);
			}
		}

		// execute callback
		callbackFn(path, result, ev.defaultPrevented);
	};

	// add to document (unless callback returns `false`)
	if (beforeCallbackFn(path, e) !== false) doc.head.appendChild(e);
}

/**
 * Load multiple files.
 * @param {string[]} paths - The file paths
 * @param {Function} callbackFn - The callback function
 */
function loadFiles(paths, callbackFn, args) {
	// listify paths
	paths = paths.push ? paths : [paths];

	var numWaiting = paths.length,
		x = numWaiting,
		pathsNotFound = [],
		fn,
		i;

	// define callback function
	fn = function(path, result, defaultPrevented) {
		// handle error
		if (result == 'e') pathsNotFound.push(path);

		// handle beforeload event. If defaultPrevented then that means the load
		// will be blocked (ex. Ghostery/ABP on Safari)
		if (result == 'b') {
			if (defaultPrevented) pathsNotFound.push(path);
			else return;
		}

		numWaiting--;
		if (!numWaiting) callbackFn(pathsNotFound);
	};

	// load scripts
	for (i = 0; i < x; i++) loadFile(paths[i], fn, args);
}

/**
 * Initiate script load and register bundle.
 * @param {(string|string[])} paths - The file paths
 * @param {(string|Function)} [arg1] - The bundleId or success callback
 * @param {Function} [arg2] - The success or error callback
 * @param {Function} [arg3] - The error callback
 */
function loadjs(paths, arg1, arg2) {
	var bundleId, args;

	// bundleId (if string)
	if (arg1 && arg1.trim) bundleId = arg1;

	// args (default is {})
	args = (bundleId ? arg2 : arg1) || {};

	// throw error if bundle is already defined
	if (bundleId) {
		if (bundleId in bundleIdCache) {
			throw 'LoadJS';
		} else {
			bundleIdCache[bundleId] = true;
		}
	}

	// load scripts
	loadFiles(
		paths,
		function(pathsNotFound) {
			// success and error callbacks
			if (pathsNotFound.length) (args.error || devnull)(pathsNotFound);
			else (args.success || devnull)();

			// publish bundle load event
			publish(bundleId, pathsNotFound);
		},
		args
	);
}

/**
 * Execute callbacks when dependencies have been satisfied.
 * @param {(string|string[])} deps - List of bundle ids
 * @param {Object} args - success/error arguments
 */
loadjs.ready = function ready(deps, args) {
	// subscribe to bundle load event
	subscribe(deps, function(depsNotFound) {
		// execute callbacks
		if (depsNotFound.length) (args.error || devnull)(depsNotFound);
		else (args.success || devnull)();
	});

	return loadjs;
};

/**
 * Manually satisfy bundle dependencies.
 * @param {string} bundleId - The bundle id
 */
loadjs.done = function done(bundleId) {
	publish(bundleId, []);
};

/**
 * Reset loadjs dependencies statuses
 */
loadjs.reset = function reset() {
	bundleIdCache = {};
	bundleResultCache = {};
	bundleCallbackQueue = {};
};

/**
 * Determine if bundle has already been defined
 * @param String} bundleId - The bundle id
 */
loadjs.isDefined = function isDefined(bundleId) {
	return bundleId in bundleIdCache;
};

/**
 * load config
 * @param String json
 */
loadjs.config = function(json) {
	config = json;
};

/**
 * load bundle and dependencies with key
 * @param String key
 * @param Function Callback
 */
loadjs.key = function(key, callback) {
	try {
		var self = this;
		var loaded = 0;
		if (config[key].deps) {
			loaded = 0;
			config[key].deps.forEach(function(value) {
				self.key(value, function() {
					loaded++;
					if (loaded == config[key].deps.length) {
						loadjs(config[key].files, key, {
							success: callback
						});
					}
				});
			});
		} else {
			if (config[key].keys) {
				loaded = 0;
				config[key].keys.forEach(function(value) {
					self.key(value, function() {
						loaded++;
						if (loaded == config[key].keys.length) {
							callback();
						}
					});
				});
			} else {
				loadjs(config[key].files, key, {
					success: callback
				});
			}
		}
	} catch (e) {
		loadjs.ready(key, {
			success: callback
		});
	}
};

/**
 * load bundle and dependencies by keys
 * @param Array keys
 * @param Function Callback
 */
loadjs.keys = function(keys, callback) {
	var loaded = 0;
	keys.forEach(function(value) {
		loadjs.key(value, function() {
			loaded++;
			if (loaded == keys.length) {
				callback();
			}
		});
	});
};

/**
 * load bundle by url with key
 * @param String url
 * @param String key
 * @param Function Callback
 */
loadjs.url = function(url, key, callback) {
	try {
		loadjs(url, key, {
			success: callback
		});
	} catch (e) {
		loadjs.ready(key, {
			success: callback
		});
	}
};

// export
return loadjs;
