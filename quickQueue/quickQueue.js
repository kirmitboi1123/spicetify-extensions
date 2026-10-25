// NAME: Quick Queue (1.3.x fix)
// AUTHOR: OhItsTom, Spotify 1.3.x patch by kirmitboi1123 (2026-10-25)
// DESCRIPTION: Adds a button to the tracklist to add/remove a song from the queue.
//
// ohitstom/spicetify-extensions quickQueue.js (main @ 2d76dc5), patched for Spotify 1.3.6
// (fork: kirmitboi1123/spicetify-extensions, branch quickqueue-spotify-1.3.6). Upstream is
// broken there (issue #79; a different, unmerged fix is in PR #80):
//   1. the track URI is no longer in the props the old lookup reads - it now sits a couple
//      of React fiber levels above the [role="row"] element, so walk up the fiber;
//   2. rows are inserted empty and filled in afterwards, and virtualised rows are recycled
//      for other tracks while scrolling, so rows are (re)processed on every mutation inside
//      them, batched on a timer, and the button is re-mounted when the row's URI changes.
// Uses the same .queueControl-wrapper class as upstream and skips rows that already have
// one, so it can run as a local extension next to the Marketplace copy without doubling up.
// Drop it once upstream is fixed.

(function quickQueueFix() {
	if (
		!(
			Spicetify.React &&
			Spicetify.ReactDOM &&
			Spicetify.showNotification &&
			Spicetify.Platform?.PlayerAPI &&
			Spicetify.Tippy &&
			Spicetify.TippyProps &&
			Spicetify.LocalStorage
		)
	) {
		setTimeout(quickQueueFix, 10);
		return;
	}

	const dict = () => Spicetify.Locale?._dictionary || {};

	// Settings: same key as upstream. The Marketplace copy (if still installed) registers the
	// "Button on the left" menu item and writes this key, so only register our own item when
	// it is gone, and pick the setting up live either way.
	const STORAGE_KEY_PLACE_LEFT = "quickQueue.placeLeftSide";
	const readPlaceLeft = () => Spicetify.LocalStorage.get(STORAGE_KEY_PLACE_LEFT) === "1";
	let placeLeftSide = readPlaceLeft();

	function applyPlacement() {
		placeLeftSide = readPlaceLeft();
		// Move the buttons that are already rendered
		document.querySelectorAll('.queueControl-wrapper[data-qq-fix="1"]').forEach(wrapper => {
			Spicetify.ReactDOM.unmountComponentAtNode?.(wrapper);
			wrapper.remove();
		});
		document.querySelectorAll('[role="row"]').forEach(schedule);
	}
	setInterval(() => readPlaceLeft() !== placeLeftSide && applyPlacement(), 1000);

	const upstreamLoaded = !!document.querySelector('script[src*="quickQueue/quickQueue.js"]');
	try {
		if (!upstreamLoaded && Spicetify.Menu?.Item) {
			new Spicetify.Menu.Item("Quick Queue: Button on the left", placeLeftSide, self => {
				Spicetify.LocalStorage.set(STORAGE_KEY_PLACE_LEFT, placeLeftSide ? "0" : "1");
				applyPlacement();
				self.setState(placeLeftSide);
				Spicetify.showNotification(`Quick Queue placement is now ${placeLeftSide ? "on the left" : "in the right column"}`);
			}).register();
		}
	} catch (error) {
		// no-op: menu might not be available in all environments
	}

	const QueueButton = Spicetify.React.memo(({ uri, classList }) => {
		const [isQueued, setIsQueued] = Spicetify.React.useState(Spicetify.Platform.PlayerAPI._queue._queueState.queued.some(item => item.uri === uri));
		const [tippyInstance, setTippyInstance] = Spicetify.React.useState(null);
		const [isShiftPressed, setIsShiftPressed] = Spicetify.React.useState(false);
		const buttonRef = Spicetify.React.useRef(null);

		// Functions
		const updateQueueState = event => setIsQueued(event.data.queued.some(item => item.uri === uri));
		const handleKeyDown = event => event.key === "Shift" && setIsShiftPressed(true);
		const handleKeyUp = event => event.key === "Shift" && setIsShiftPressed(false);

		const handleClick = async event => {
			if (isQueued && event.type === "contextmenu") return;

			if (!isQueued && (event.type === "contextmenu" || isShiftPressed)) {
				event.preventDefault();
				event.stopPropagation();
				await addToNext(uri);
				Spicetify.showNotification("Added to next in queue");
			} else {
				Spicetify.Platform.PlayerAPI[isQueued ? "removeFromQueue" : "addToQueue"]([{ uri }]);
				Spicetify.showNotification(isQueued ? "Removed from queue" : dict()["queue.added-to-queue"] || "Added to queue");
			}
		};

		const getTooltipContent = () => {
			return isQueued
				? dict()["contextmenu.remove-from-queue"] || "Remove from queue"
				: isShiftPressed
				? "Play next in queue"
				: dict()["contextmenu.add-to-queue"] || "Add to queue";
		};

		Spicetify.React.useEffect(() => {
			Spicetify.Platform.PlayerAPI._queue._events.addListener("queue_update", updateQueueState);
			document.addEventListener("keydown", handleKeyDown);
			document.addEventListener("keyup", handleKeyUp);
		}, []);

		// Cleanup
		Spicetify.React.useEffect(() => {
			const intervalId = setInterval(function () {
				if (!document.contains(buttonRef.current)) {
					clearInterval(intervalId);
					tippyInstance?.destroy();
					document.removeEventListener("keydown", handleKeyDown);
					document.removeEventListener("keyup", handleKeyUp);
					Spicetify.Platform.PlayerAPI._queue._events.removeListener("queue_update", updateQueueState);
				}
			}, 1000);
		}, []);

		// Tooltip initialization and update
		Spicetify.React.useEffect(() => {
			if (buttonRef.current && !tippyInstance) {
				const instance = Spicetify.Tippy(buttonRef.current, {
					...Spicetify.TippyProps,
					hideOnClick: true,
					content: getTooltipContent()
				});
				setTippyInstance(instance);
			} else if (tippyInstance) {
				tippyInstance.setProps({ content: getTooltipContent() });
			}
		}, [isQueued, isShiftPressed, tippyInstance]);

		// Render
		return Spicetify.React.createElement(
			"button",
			{
				ref: buttonRef,
				className: classList,
				"aria-checked": isQueued,
				onClick: handleClick,
				onContextMenu: handleClick,
				style: {
					marginRight: "12px",
					opacity: isQueued ? "1" : undefined
				}
			},
			Spicetify.React.createElement(
				"span",
				{
					style: { display: "flex" }
				},
				Spicetify.React.createElement("svg", {
					role: "img",
					height: "16",
					width: "16",
					viewBox: "0 0 16 16",
					className: isQueued ? "Svg-img-icon-small-textBrightAccent" : "Svg-img-icon-small",
					style: {
						fill: isQueued ? "var(--text-bright-accent)" : "var(--text-subdued)"
					},
					dangerouslySetInnerHTML: {
						__html: isQueued
							? `<path d="M5.25 3v-.917C5.25.933 6.183 0 7.333 0h1.334c1.15 0 2.083.933 2.083 2.083V3h4.75v1.5h-.972l-1.257 9.544A2.25 2.25 0 0 1 11.041 16H4.96a2.25 2.25 0 0 1-2.23-1.956L1.472 4.5H.5V3h4.75zm1.5-.917V3h2.5v-.917a.583.583 0 0 0-.583-.583H7.333a.583.583 0 0 0-.583.583zM2.986 4.5l1.23 9.348a.75.75 0 0 0 .744.652h6.08a.75.75 0 0 0 .744-.652L13.015 4.5H2.985z"></path>`
							: `<path d="M16 15H2v-1.5h14V15zm0-4.5H2V9h14v1.5zm-8.034-6A5.484 5.484 0 0 1 7.187 6H13.5a2.5 2.5 0 0 0 0-5H7.966c.159.474.255.978.278 1.5H13.5a1 1 0 1 1 0 2H7.966zM2 2V0h1.5v2h2v1.5h-2v2H2v-2H0V2h2z"></path>`
					}
				})
			)
		);
	});

	// modified from github.com/daksh2k/Spicetify-stuff/blob/6edf2235f8b8ec514b27a10aca4607d38b2fbb87/Extensions/playNext.js#L131
	async function addToNext(uri) {
		const queue = await Spicetify.Platform.PlayerAPI.getQueue();
		if (!queue.queued.length > 0) return await Spicetify.addToQueue([{ uri }]);

		await Spicetify.Platform.PlayerAPI.insertIntoQueue([{ uri }], {
			before: {
				uri: queue.queued[0].uri,
				uid: queue.queued[0].uid
			}
		});
	}

	// Spotify 1.3.x: the row's own props no longer carry the URI; a component a few fiber
	// levels up does (props.uri, or props.item.uri / props.value.item.uri higher still).
	const isTrackUri = value => typeof value === "string" && /^spotify:(track|episode|local):/.test(value);
	function getRowUri(row) {
		const fiberKey = Object.keys(row).find(key => key.startsWith("__reactFiber"));
		let fiber = fiberKey && row[fiberKey];
		for (let depth = 0; fiber && depth < 25; depth++, fiber = fiber.return) {
			const props = fiber.memoizedProps;
			if (!props || typeof props !== "object") continue;
			for (const value of [props.uri, props.item?.uri, props.value?.item?.uri, props.track?.uri]) {
				if (isTrackUri(value)) return value;
			}
		}
		return null;
	}

	function processRow(row) {
		if (!row.isConnected) return;
		// row > .main-trackList-trackListRow > last cell (duration, add-to-playlist, more)
		const endCell = row.firstElementChild?.lastElementChild;
		if (!endCell) return;
		const entryPoint = endCell.querySelector(":scope > button:not(:last-child):has([data-encore-id])");
		if (!entryPoint) return; // row not filled in yet; a later mutation brings us back

		const uri = getRowUri(row);
		if (!uri) return;

		let wrapper = row.querySelector(".queueControl-wrapper");
		if (wrapper && wrapper.dataset.qqFix !== "1") return; // upstream's button is already here
		if (wrapper && wrapper.dataset.uri === uri) return;

		if (!wrapper) {
			// Decide insertion target
			let insertionParent = endCell;
			let referenceNode = entryPoint;
			if (placeLeftSide) {
				const startCell = endCell.parentElement?.querySelector(':scope > .main-trackList-rowSectionStart[role="gridcell"]');
				if (startCell) {
					insertionParent = startCell;
					// Before the cover image if there is one (albums have none)
					referenceNode = startCell.querySelector(":scope img") || startCell.firstElementChild;
				}
			}

			wrapper = document.createElement("div");
			wrapper.className = "queueControl-wrapper";
			wrapper.dataset.qqFix = "1";
			wrapper.style.display = "contents";
			wrapper.style.marginRight = 0;
			if (referenceNode && referenceNode.parentNode === insertionParent) insertionParent.insertBefore(wrapper, referenceNode);
			else if (insertionParent.firstChild) insertionParent.insertBefore(wrapper, insertionParent.firstChild);
			else insertionParent.appendChild(wrapper);
		}

		// A recycled row gets a new key, so React mounts a fresh button for the new track.
		wrapper.dataset.uri = uri;
		Spicetify.ReactDOM.render(
			Spicetify.React.createElement(QueueButton, {
				key: uri,
				uri,
				classList: entryPoint.classList
			}),
			wrapper
		);
	}

	// Batch with a timer, not requestAnimationFrame: Chromium pauses rAF while the window is
	// covered or minimised, so rows went unprocessed until Spotify was looked at.
	const pendingRows = new Set();
	let batchQueued = false;
	function schedule(row) {
		pendingRows.add(row);
		if (batchQueued) return;
		batchQueued = true;
		setTimeout(() => {
			batchQueued = false;
			const rows = [...pendingRows];
			pendingRows.clear();
			for (const row of rows) {
				try {
					processRow(row);
				} catch (error) {
					console.error("Quick Queue (1.3.x fix): failed on a row", error, row);
				}
			}
		}, 0);
	}

	const observer = new MutationObserver(mutationList => {
		for (const mutation of mutationList) {
			const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
			const row = target?.closest?.('[role="row"]');
			if (row) schedule(row);
			for (const node of mutation.addedNodes) {
				if (node.nodeType !== 1) continue;
				if (node.matches('[role="row"]')) schedule(node);
				else node.querySelectorAll('[role="row"]').forEach(schedule);
			}
		}
	});

	observer.observe(document, {
		subtree: true,
		childList: true
	});
	document.querySelectorAll('[role="row"]').forEach(schedule);
})();
