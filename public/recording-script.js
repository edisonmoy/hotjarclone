(function () {
    "use strict";

    // Prevent duplicate recording instances
    if (window._hotcloneRecorderInstance) {
        return;
    }

    // Early exit if this is a proxy/replay or HotClone app
    if (
        // Check if we're in an iframe (likely a replay)
        window.self !== window.top ||
        // Check if we're on the HotClone app itself
        (window.location.hostname === "localhost" &&
            (window.location.pathname.startsWith("/sessions/") ||
                window.location.pathname.startsWith("/keys"))) ||
        // Check for a query parameter in the URL (?replay=true)
        new URLSearchParams(window.location.search).get("replay") === "true"
    ) {
        // Define a no-op initializer to avoid errors if someone tries to call it
        window.initializeRecording = function () {
            console.log("Recording disabled in replay/HotClone app");
        };
        return;
    }

    class RecordingScript {
        constructor(apiKey) {
            if (!apiKey) {
                throw new Error("API key is required");
            }
            this.events = [];
            this.startTime = Date.now();
            this.isRecording = false;
            this.apiEndpoint = "http://localhost:3000/api/sessions";
            this.apiKey = apiKey;
            this.currentUrl = window.location.href;

            // Record whether this is a fresh page load via refresh
            this.isPageRefresh = this.detectPageRefresh();

            // Always create a new session ID for each page load
            // This ensures refreshes and new visits create a new session
            this.sessionId = this.generateNewSessionId();

            // Track this page load in session storage for refresh detection
            this.updatePageLoadTracking();

            // Setup DOM tracking variables
            this.lastDomSnapshotTime = 0;
            this.domSnapshotThrottle = 500; // Take DOM snapshots at most twice per second
            this.capturedDomIds = new Set(); // Track elements we've already captured
            this.pendingMutations = []; // Store mutations for processing
            this.processingMutations = false; // Flag to prevent concurrent processing

            this.boundHandlers = {
                mousemove: this.handleMouseMove.bind(this),
                click: this.handleClick.bind(this),
                scroll: this.handleScroll.bind(this),
                input: this.handleInput.bind(this),
                visibilitychange: this.handleVisibilityChange.bind(this),
                mousedown: this.handleMouseDown.bind(this),
                mouseup: this.handleMouseUp.bind(this),
                dragstart: this.handleDragStart.bind(this),
                drag: this.handleDrag.bind(this),
                dragend: this.handleDragEnd.bind(this),
            };
            this.lastMouseMoveTime = 0;
            this.mouseMoveThrottle = 100; // ms
            this.isDragging = false;
            this.dragTarget = null;

            // Set up URL change detection
            this.setupUrlChangeDetection();
        }

        // Detect if this page load is a refresh or new visit
        detectPageRefresh() {
            try {
                // Get the last recorded page load time from sessionStorage
                const lastLoadData =
                    sessionStorage.getItem("hotclone_page_load");

                if (lastLoadData) {
                    const { url, timestamp } = JSON.parse(lastLoadData);

                    // If the URL is the same and it was loaded recently (within 5 seconds),
                    // this is likely a refresh
                    const isRefresh =
                        url === window.location.href &&
                        Date.now() - timestamp < 5000;

                    return isRefresh;
                }
            } catch (e) {
                console.error("Error detecting refresh:", e);
            }

            return false;
        }

        // Generate a new unique session ID
        generateNewSessionId() {
            return (
                Math.random().toString(36).substring(2) +
                Date.now().toString(36)
            );
        }

        // Update the page load tracking data
        updatePageLoadTracking() {
            try {
                sessionStorage.setItem(
                    "hotclone_page_load",
                    JSON.stringify({
                        url: window.location.href,
                        timestamp: Date.now(),
                    })
                );
            } catch (e) {
                console.error("Error updating page load tracking:", e);
            }
        }

        setupUrlChangeDetection() {
            setInterval(() => {
                if (this.currentUrl !== window.location.href) {
                    this.recordEvent("session_start", {
                        url: window.location.href,
                        userAgent: navigator.userAgent,
                        screenResolution: `${window.screen.width}x${window.screen.height}`,
                        viewportSize: `${window.innerWidth}x${window.innerHeight}`,
                        timestamp: new Date().toISOString(),
                    });
                    this.currentUrl = window.location.href;

                    this.saveChunk();
                }
            }, 500); // Check every 500ms

            // Also intercept history API methods
            const originalPushState = history.pushState;
            const originalReplaceState = history.replaceState;

            history.pushState = (...args) => {
                originalPushState.apply(history, args);
                this.handleUrlChange();
            };

            history.replaceState = (...args) => {
                originalReplaceState.apply(history, args);
                this.handleUrlChange();
            };

            // Handle popstate events (back/forward navigation)
            window.addEventListener("popstate", () => {
                this.handleUrlChange();
            });
        }

        handleUrlChange() {
            if (this.currentUrl !== window.location.href) {
                // Record a new session_start event with the new URL
                this.recordEvent("session_start", {
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    screenResolution: `${window.screen.width}x${window.screen.height}`,
                    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
                    timestamp: new Date().toISOString(),
                });
                // Update the current URL
                this.currentUrl = window.location.href;

                // Save the chunk immediately to ensure the navigation is recorded
                this.saveChunk();
            }
        }

        start() {
            if (this.isRecording) return;
            this.isRecording = true;
            this.startTime = Date.now();
            this.setupEventListeners();

            // Capture full initial DOM state before recording events
            this.captureInitialDomState();

            this.recordEvent("session_start", {
                url: window.location.href,
                userAgent: navigator.userAgent,
                screenResolution: `${window.screen.width}x${window.screen.height}`,
                viewportSize: `${window.innerWidth}x${window.innerHeight}`,
                timestamp: new Date().toISOString(),
            });
            this.saveChunk();
            this.setupMutationObserver();
        }

        stop() {
            if (!this.isRecording) return;
            this.isRecording = false;

            this.removeEventListeners();

            if (this.snapshotInterval) {
                clearInterval(this.snapshotInterval);
                this.snapshotInterval = null;
            }
            this.recordEvent("session_end", {
                timestamp: new Date().toISOString(),
            });
            this.captureFullDomSnapshot();
            return this.saveSession();
        }

        setupEventListeners() {
            Object.entries(this.boundHandlers).forEach(([event, handler]) => {
                document.addEventListener(event, handler);
            });
            this.setupCanvasListeners();
        }

        removeEventListeners() {
            Object.entries(this.boundHandlers).forEach(([event, handler]) => {
                document.removeEventListener(event, handler);
            });
        }

        handleMouseMove(event) {
            const now = Date.now();
            if (now - this.lastMouseMoveTime < this.mouseMoveThrottle) return;
            this.lastMouseMoveTime = now;

            this.recordEvent("mousemove", {
                x: event.clientX,
                y: event.clientY,
                pageX: event.pageX,
                pageY: event.pageY,
                timestamp: new Date().toISOString(),
            });
        }

        handleClick(event) {
            const target = event.target;
            this.recordEvent("click", {
                x: event.clientX,
                y: event.clientY,
                target: {
                    tagName: target.tagName,
                    id: target.id,
                    className: target.className,
                    text: target.textContent?.slice(0, 100),
                    xpath: this.getXPath(target),
                },
                timestamp: new Date().toISOString(),
            });
        }

        handleScroll() {
            this.recordEvent("scroll", {
                x: window.scrollX,
                y: window.scrollY,
                timestamp: new Date().toISOString(),
            });
        }

        handleInput(event) {
            const target = event.target;
            this.recordEvent("input", {
                target: {
                    tagName: target.tagName,
                    id: target.id,
                    className: target.className,
                    value: target.value,
                    xpath: this.getXPath(target),
                },
                timestamp: new Date().toISOString(),
            });
        }

        handleVisibilityChange() {
            this.recordEvent("visibilitychange", {
                visibility: document.visibilityState,
                timestamp: new Date().toISOString(),
            });
        }

        getXPath(element) {
            if (element.id) return `//*[@id="${element.id}"]`;
            if (element === document.body) return "/html/body";

            let ix = 1;
            const siblings = element.parentNode.childNodes;

            for (let sibling of siblings) {
                if (sibling === element) {
                    return (
                        this.getXPath(element.parentNode) +
                        "/" +
                        element.tagName.toLowerCase() +
                        "[" +
                        ix +
                        "]"
                    );
                }
                if (
                    sibling.nodeType === 1 &&
                    sibling.tagName === element.tagName
                ) {
                    ix++;
                }
            }
        }

        recordEvent(type, data) {
            if (!this.isRecording) return;

            this.events.push({
                type,
                timestamp: Date.now() - this.startTime,
                data,
            });
            if (this.events.length > 10) {
                this.saveChunk();
            }
        }

        async saveChunk() {
            if (this.events.length === 0) return;

            const chunk = this.events.splice(0, this.events.length);

            try {
                const sessionResponse = await fetch(this.apiEndpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-API-Key": this.apiKey,
                    },
                    body: JSON.stringify({
                        id: this.sessionId,
                        url: window.location.href,
                        viewport_size: `${window.innerWidth}x${window.innerHeight}`,
                        user_agent: navigator.userAgent,
                        screen_resolution: `${window.screen.width}x${window.screen.height}`,
                        referrer: document.referrer,
                        start_time: new Date(this.startTime).toISOString(),
                        end_time: new Date().toISOString(),
                    }),
                });

                if (sessionResponse.status === 401) {
                    console.error(
                        "Unauthorized (401) when creating session. Stopping recording."
                    );
                    this.isRecording = false;
                    return;
                }

                if (!sessionResponse.ok) {
                    throw new Error(
                        `Failed to create session: ${sessionResponse.status}`
                    );
                }

                // Then save the chunk
                const chunkResponse = await fetch(
                    "http://localhost:3000/api/sessions/chunks",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-API-Key": this.apiKey,
                        },
                        body: JSON.stringify({
                            sessionId: this.sessionId,
                            events: chunk,
                            url: window.location.href,
                        }),
                    }
                );

                if (chunkResponse.status === 401) {
                    console.error(
                        "Unauthorized (401) when saving chunk. Stopping recording."
                    );
                    this.isRecording = false;
                    return;
                }

                if (!chunkResponse.ok) {
                    throw new Error(
                        `HTTP error! status: ${chunkResponse.status}`
                    );
                }

                await chunkResponse.json();
            } catch (error) {
                console.error("Error saving chunk:", error);
                // If there's an error, put the events back in the queue
                this.events.unshift(...chunk);
            }
        }

        async saveSession() {
            const sessionData = {
                id: this.sessionId,
                url: window.location.href,
                viewport_size: `${window.innerWidth}x${window.innerHeight}`,
                user_agent: navigator.userAgent,
                screen_resolution: `${window.screen.width}x${window.screen.height}`,
                referrer: document.referrer,
                start_time: new Date(this.startTime).toISOString(),
                end_time: new Date().toISOString(),
            };

            try {
                const response = await fetch(this.apiEndpoint, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-API-Key": this.apiKey,
                    },
                    body: JSON.stringify(sessionData),
                });

                if (!response.ok) {
                    throw new Error("Failed to save session");
                }

                const data = await response.json();
                this.sessionId = data.id;
                return data;
            } catch (error) {
                console.error("Error saving session:", error);
                throw error;
            }
        }

        saveToLocalStorage(sessionData) {
            try {
                const failedSessions = JSON.parse(
                    localStorage.getItem("failedSessions") || "[]"
                );
                failedSessions.push(sessionData);
                localStorage.setItem(
                    "failedSessions",
                    JSON.stringify(failedSessions)
                );
            } catch (error) {
                console.error("Error saving to localStorage:", error);
            }
        }

        async sendChunk(events) {
            try {
                const response = await fetch(
                    `${this.backendUrl}/api/sessions/chunks`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "X-API-Key": this.apiKey,
                        },
                        body: JSON.stringify({
                            sessionId: this.sessionId,
                            events: events,
                            url: window.location.href,
                        }),
                    }
                );

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
            } catch (error) {
                console.error("Error sending chunk:", error);
            }
        }

        setupMutationObserver() {
            this.mutationObserver = new MutationObserver((mutations) => {
                this.pendingMutations.push(...mutations);

                if (!this.processingMutations) {
                    this.processMutationQueue();
                }
                this.checkForSignificantChanges(mutations);
            });

            // Configure and start the observer
            const observerConfig = {
                childList: true, // Watch for child element changes
                attributes: true, // Watch for attribute changes
                characterData: true, // Watch for text content changes
                subtree: true, // Watch the entire DOM tree
                attributeOldValue: true,
                characterDataOldValue: true,
            };

            // Start observing the entire document
            this.mutationObserver.observe(
                document.documentElement,
                observerConfig
            );
        }

        processMutationQueue() {
            if (this.pendingMutations.length === 0) {
                this.processingMutations = false;
                return;
            }

            this.processingMutations = true;

            // Throttle processing based on time since last snapshot
            const now = Date.now();
            if (now - this.lastDomSnapshotTime < this.domSnapshotThrottle) {
                // Wait until throttle period has passed
                setTimeout(
                    () => this.processMutationQueue(),
                    this.domSnapshotThrottle - (now - this.lastDomSnapshotTime)
                );
                return;
            }

            // Process all accumulated mutations
            const mutations = this.pendingMutations.splice(
                0,
                this.pendingMutations.length
            );

            // Track the important changes that happened
            const changes = {
                addedNodes: [],
                removedNodes: [],
                attributeChanges: [],
                textChanges: [],
            };

            // Process each mutation
            mutations.forEach((mutation) => {
                // Handle added nodes
                if (mutation.type === "childList") {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.processDomAddition(node, changes.addedNodes);
                        }
                    });

                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            changes.removedNodes.push({
                                xpath: this.getXPath(mutation.target) + "/*", // Approximate
                                nodeName: node.nodeName,
                                id: node.id,
                                className: node.className,
                            });
                        }
                    });
                }

                // Handle attribute changes
                if (
                    mutation.type === "attributes" &&
                    mutation.target.nodeType === Node.ELEMENT_NODE
                ) {
                    changes.attributeChanges.push({
                        domId: this.getOrCreateElementId(mutation.target),
                        xpath: this.getXPath(mutation.target),
                        attributeName: mutation.attributeName,
                        oldValue: mutation.oldValue,
                        newValue: mutation.target.getAttribute(
                            mutation.attributeName
                        ),
                    });
                }

                // Handle text changes
                if (mutation.type === "characterData") {
                    const parentElement = mutation.target.parentElement;
                    if (parentElement) {
                        changes.textChanges.push({
                            xpath: this.getXPath(parentElement),
                            oldValue: mutation.oldValue,
                            newValue: mutation.target.nodeValue,
                        });
                    }
                }
            });

            // Check if there are significant changes to record
            const hasSignificantChanges =
                changes.addedNodes.length > 0 ||
                changes.removedNodes.length > 0 ||
                changes.attributeChanges.length > 0 ||
                changes.textChanges.length > 0;

            if (hasSignificantChanges) {
                // Record a DOM mutation event
                this.recordEvent("dom_mutation", {
                    changes,
                    timestamp: new Date().toISOString(),
                });

                // Also take a snapshot of any canvas elements that might have changed
                this.captureChangedCanvases();

                this.lastDomSnapshotTime = Date.now();
            }

            // Continue processing if there are more mutations
            if (this.pendingMutations.length > 0) {
                // Use requestAnimationFrame to process in the next render frame
                requestAnimationFrame(() => this.processMutationQueue());
            } else {
                this.processingMutations = false;
            }
        }

        processDomAddition(node, addedNodes) {
            // Skip if this node is not interesting
            const isInteractive =
                node.tagName === "CANVAS" ||
                node.tagName === "INPUT" ||
                node.tagName === "SELECT" ||
                node.tagName === "TEXTAREA" ||
                node.tagName === "BUTTON" ||
                node.hasAttribute("draggable") ||
                node.classList.contains("draggable") ||
                node.hasAttribute("contenteditable");

            if (isInteractive) {
                const domId = this.getOrCreateElementId(node);

                // Skip if we've already captured this element
                if (this.capturedDomIds.has(domId)) return;
                this.capturedDomIds.add(domId);

                // Process based on element type
                if (node.tagName === "CANVAS") {
                    const canvasData = [];
                    this.processCanvasElement(node, canvasData);
                    if (canvasData.length > 0) {
                        addedNodes.push(canvasData[0]);
                    }
                } else if (
                    ["INPUT", "SELECT", "TEXTAREA"].includes(node.tagName)
                ) {
                    const formData = [];
                    this.processFormElement(node, formData);
                    if (formData.length > 0) {
                        addedNodes.push(formData[0]);
                    }
                } else {
                    const containerData = [];
                    this.processInteractiveElement(node, containerData);
                    if (containerData.length > 0) {
                        addedNodes.push(containerData[0]);
                    }
                }
            }

            // Recursively process children
            if (node.children) {
                for (let i = 0; i < node.children.length; i++) {
                    this.processDomAddition(node.children[i], addedNodes);
                }
            }
        }

        captureChangedCanvases() {
            const canvases = document.querySelectorAll("canvas");
            const canvasData = [];

            canvases.forEach((canvas) => {
                this.processCanvasElement(canvas, canvasData);
            });

            if (canvasData.length > 0) {
                this.recordEvent("canvas_update", {
                    canvasElements: canvasData,
                    timestamp: new Date().toISOString(),
                });
            }
        }

        setupCanvasListeners() {
            // Find all canvas elements and add specific event listeners
            const setupCanvasElement = (canvas) => {
                if (!canvas || !canvas.getContext) return;

                // Monitor canvas changes by intercepting context methods
                try {
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return;

                    // Keep track of method calls that modify the canvas
                    const methodsToTrack = [
                        "clearRect",
                        "fillRect",
                        "strokeRect",
                        "fillText",
                        "strokeText",
                        "drawImage",
                        "putImageData",
                        "bezierCurveTo",
                        "quadraticCurveTo",
                        "arc",
                        "arcTo",
                        "ellipse",
                        "rect",
                        "fill",
                        "stroke",
                        "lineTo",
                        "moveTo",
                    ];

                    // Save original methods
                    const originalMethods = {};

                    // Replace each method with our tracking version
                    methodsToTrack.forEach((method) => {
                        if (typeof ctx[method] === "function") {
                            originalMethods[method] = ctx[method];

                            ctx[method] = (...args) => {
                                // Call the original method
                                const result = originalMethods[method].apply(
                                    ctx,
                                    args
                                );

                                // Now capture the canvas state
                                this.lastCanvasOperation = Date.now();

                                // Use throttling to avoid too many snapshots
                                if (!this.canvasSnapshotTimeout) {
                                    this.canvasSnapshotTimeout = setTimeout(
                                        () => {
                                            this.captureFullDomSnapshot();
                                            this.canvasSnapshotTimeout = null;
                                        },
                                        100
                                    ); // Take a snapshot 100ms after last canvas operation
                                }

                                return result;
                            };
                        }
                    });

                    // Also capture direct mousedown/mousemove on canvas which might modify it
                    canvas.addEventListener("mousedown", () => {
                        // Record the state before potential change
                        this.captureFullDomSnapshot();
                    });

                    canvas.addEventListener("mouseup", () => {
                        // Record the state after potential change
                        setTimeout(() => this.captureFullDomSnapshot(), 50);
                    });
                } catch (e) {
                    console.error("Error setting up canvas tracking:", e);
                }
            };

            // Set up any existing canvas elements
            document.querySelectorAll("canvas").forEach(setupCanvasElement);

            // Set up new canvas elements as they appear
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === "childList") {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeName === "CANVAS") {
                                setupCanvasElement(node);
                            } else if (node.querySelectorAll) {
                                node.querySelectorAll("canvas").forEach(
                                    setupCanvasElement
                                );
                            }
                        });
                    }
                });
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
            });
        }

        // Capture the complete initial DOM state for accurate playback
        captureInitialDomState() {
            try {
                // Capture the full HTML DOM snapshot
                const doctype = document.doctype
                    ? new XMLSerializer().serializeToString(document.doctype)
                    : "";
                const htmlSnapshot = document.documentElement.outerHTML;

                // Capture all interactive elements that might change
                const interactiveElements = document.querySelectorAll(
                    'canvas, [draggable="true"], .draggable, [data-draggable], ' +
                        "input, select, textarea, button, a, form, " +
                        'div[contenteditable="true"], [contenteditable="true"]'
                );

                // Create containers for different types of elements
                const canvasElements = [];
                const formElements = [];
                const interactiveContainers = [];
                const elements = [];

                // Process each element
                interactiveElements.forEach((element) => {
                    // Generate a unique ID for tracking
                    const domId = this.getOrCreateElementId(element);
                    this.capturedDomIds.add(domId);

                    // Track basic element info
                    elements.push({
                        xpath: this.getXPath(element),
                        domId,
                        tagName: element.tagName,
                    });

                    // Handle canvas elements
                    if (element.tagName === "CANVAS") {
                        this.processCanvasElement(element, canvasElements);
                    }
                    // Handle form elements
                    else if (
                        ["INPUT", "SELECT", "TEXTAREA"].includes(
                            element.tagName
                        )
                    ) {
                        this.processFormElement(element, formElements);
                    }
                    // Handle other interactive elements
                    else {
                        this.processInteractiveElement(
                            element,
                            interactiveContainers
                        );
                    }
                });

                // Record a comprehensive initial state event
                this.recordEvent("initial_dom_state", {
                    canvasElements,
                    formElements,
                    interactiveContainers,
                    elements,
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    initialDomState: {
                        elements,
                        canvasElements,
                        formElements,
                    },
                });

                this.recordEvent("dom_snapshot", {
                    html: htmlSnapshot,
                    doctype: doctype,
                    canvasElements,
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
                });

                this.scheduleDomSnapshots();
            } catch (error) {
                console.error("Error capturing initial DOM state:", error);
            }
        }

        getOrCreateElementId(element) {
            if (element.id) return element.id;

            const xpath = this.getXPath(element);
            const tagName = element.tagName;
            const className = element.className || "";

            const domId = `${tagName.toLowerCase()}-${className.replace(
                /\s+/g,
                "-"
            )}-${this.hashString(xpath)}`;

            if (!element.hasAttribute("data-hotclone-id")) {
                element.setAttribute("data-hotclone-id", domId);
            }

            return domId;
        }

        // Simple string hashing function
        hashString(str) {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = (hash << 5) - hash + str.charCodeAt(i);
                hash |= 0; // Convert to 32bit integer
            }
            return Math.abs(hash).toString(36);
        }

        // Process canvas elements and capture their state
        processCanvasElement(canvas, canvasElements) {
            try {
                // Capture the canvas as a data URL
                let dataUrl = null;
                if (canvas.toDataURL) {
                    try {
                        dataUrl = canvas.toDataURL("image/png", 1.0);
                    } catch (e) {
                        console.warn("Could not capture canvas contents:", e);
                    }
                }

                canvasElements.push({
                    domId: this.getOrCreateElementId(canvas),
                    id: canvas.id,
                    className: canvas.className,
                    xpath: this.getXPath(canvas),
                    dataUrl: dataUrl,
                    width: canvas.width,
                    height: canvas.height,
                    position: this.getElementPosition(canvas),
                });

                // Set up special tracking for this canvas
                this.setupCanvasTracking(canvas);
            } catch (error) {
                console.error("Error processing canvas element:", error);
            }
        }

        // Process form elements and capture their state
        processFormElement(element, formElements) {
            try {
                let value = element.value;

                // Handle checkbox and radio inputs specially
                if (
                    element.tagName === "INPUT" &&
                    (element.type === "checkbox" || element.type === "radio")
                ) {
                    value = element.checked;
                }

                formElements.push({
                    domId: this.getOrCreateElementId(element),
                    id: element.id,
                    name: element.name,
                    type: element.type || element.tagName.toLowerCase(),
                    className: element.className,
                    xpath: this.getXPath(element),
                    value: value,
                    position: this.getElementPosition(element),
                });
            } catch (error) {
                console.error("Error processing form element:", error);
            }
        }

        // Process other interactive elements
        processInteractiveElement(element, containers) {
            try {
                containers.push({
                    domId: this.getOrCreateElementId(element),
                    id: element.id,
                    tagName: element.tagName,
                    className: element.className,
                    xpath: this.getXPath(element),
                    html: element.outerHTML.slice(0, 2000), // Limit size but capture more
                    position: this.getElementPosition(element),
                    attributes: this.getElementAttributes(element),
                });
            } catch (error) {
                console.error("Error processing interactive element:", error);
            }
        }

        // Get element position and dimensions
        getElementPosition(element) {
            const rect = element.getBoundingClientRect();
            return {
                left: rect.left + window.scrollX,
                top: rect.top + window.scrollY,
                width: rect.width,
                height: rect.height,
                zIndex: getComputedStyle(element).zIndex || "auto",
            };
        }

        // Get all significant attributes of an element
        getElementAttributes(element) {
            const attributes = {};
            for (let i = 0; i < element.attributes.length; i++) {
                const attr = element.attributes[i];
                // Skip data-hotclone-id we added
                if (attr.name !== "data-hotclone-id") {
                    attributes[attr.name] = attr.value;
                }
            }
            return attributes;
        }

        setupCanvasTracking(canvas) {
            try {
                // Get canvas ID but we'll track it in a different way now
                this.getOrCreateElementId(canvas); // Just ensure it has an ID for other tracking

                const ctx = canvas.getContext("2d");
                if (!ctx) return;

                // Methods that modify canvas state
                const methodsToTrack = [
                    "fillRect",
                    "clearRect",
                    "strokeRect",
                    "fillText",
                    "strokeText",
                    "drawImage",
                    "putImageData",
                    "bezierCurveTo",
                    "quadraticCurveTo",
                    "arc",
                    "arcTo",
                    "ellipse",
                    "lineTo",
                    "moveTo",
                    "rect",
                    "stroke",
                    "fill",
                    "beginPath",
                    "closePath",
                    "clip",
                    "translate",
                    "scale",
                    "rotate",
                    "transform",
                    "setTransform",
                ];

                const originalMethods = {};

                // Replace each method with our tracking version
                methodsToTrack.forEach((method) => {
                    if (typeof ctx[method] === "function") {
                        originalMethods[method] = ctx[method];

                        ctx[method] = (...args) => {
                            // Call the original method
                            const result = originalMethods[method].apply(
                                ctx,
                                args
                            );

                            // Now capture the canvas state
                            this.lastCanvasOperation = Date.now();

                            // Use throttling to avoid too many snapshots
                            if (!this.canvasSnapshotTimeout) {
                                this.canvasSnapshotTimeout = setTimeout(() => {
                                    this.captureFullDomSnapshot();
                                    this.canvasSnapshotTimeout = null;
                                }, 100); // Take a snapshot 100ms after last canvas operation
                            }

                            return result;
                        };
                    }
                });

                // Also capture direct mousedown/mousemove on canvas which might modify it
                canvas.addEventListener("mousedown", () => {
                    // Record the state before potential change
                    this.captureFullDomSnapshot();
                });

                canvas.addEventListener("mouseup", () => {
                    // Record the state after potential change
                    setTimeout(() => this.captureFullDomSnapshot(), 50);
                });
            } catch (e) {
                console.error("Error setting up canvas tracking:", e);
            }
        }

        handleMouseDown(event) {
            // Record start of potential drag
            this.recordEvent("mousedown", {
                x: event.clientX,
                y: event.clientY,
                target: {
                    tagName: event.target.tagName,
                    id: event.target.id,
                    className: event.target.className,
                    xpath: this.getXPath(event.target),
                },
                timestamp: new Date().toISOString(),
            });
        }

        handleMouseUp(event) {
            // Record end of potential drag
            this.recordEvent("mouseup", {
                x: event.clientX,
                y: event.clientY,
                target: {
                    tagName: event.target.tagName,
                    id: event.target.id,
                    className: event.target.className,
                    xpath: this.getXPath(event.target),
                },
                timestamp: new Date().toISOString(),
            });

            // If we were dragging, force a DOM snapshot
            if (this.isDragging) {
                this.isDragging = false;
                this.dragTarget = null;
                // Take a DOM snapshot after drag completes
                setTimeout(() => this.captureFullDomSnapshot(), 100);
            }
        }

        handleDragStart(event) {
            this.isDragging = true;
            this.dragTarget = event.target;

            this.recordEvent("dragstart", {
                x: event.clientX,
                y: event.clientY,
                target: {
                    tagName: event.target.tagName,
                    id: event.target.id,
                    className: event.target.className,
                    xpath: this.getXPath(event.target),
                },
                timestamp: new Date().toISOString(),
            });
        }

        handleDrag(event) {
            // Only record drag events occasionally to avoid too much data
            const now = Date.now();
            if (now - this.lastMouseMoveTime < 150) return; // Less frequent than mousemove
            this.lastMouseMoveTime = now;

            this.recordEvent("drag", {
                x: event.clientX,
                y: event.clientY,
                target: {
                    tagName: event.target.tagName,
                    id: event.target.id,
                    className: event.target.className,
                    xpath: this.getXPath(event.target),
                },
                timestamp: new Date().toISOString(),
            });
        }

        handleDragEnd(event) {
            if (!this.isRecording || !this.isDragging) return;

            try {
                // Extract the relevant information
                const target = this.dragTarget;

                // Record the drag end event
                this.recordEvent("dragend", {
                    x: event.clientX,
                    y: event.clientY,
                    target: {
                        tagName: target.tagName,
                        id: target.id,
                        className: target.className,
                        xpath: this.getXPath(target),
                        domId: this.getOrCreateElementId(target),
                    },
                    timestamp: new Date().toISOString(),
                });

                this.isDragging = false;
                this.dragTarget = null;

                // Take a DOM snapshot after drag completes
                setTimeout(() => this.captureFullDomSnapshot(), 100);
            } catch (error) {
                console.error("Error recording drag end:", error);
            }
        }

        // Add a new method to schedule periodic DOM snapshots
        scheduleDomSnapshots() {
            // Take a full snapshot every 10 seconds or after significant events
            const snapshotInterval = 10000; // 10 seconds

            this.snapshotInterval = setInterval(() => {
                this.captureFullDomSnapshot();
            }, snapshotInterval);

            // Also capture snapshots after user interactions that likely cause DOM changes
            const captureAfterEvents = ["click", "submit", "keyup"];

            let lastCaptureTime = Date.now();
            const minTimeBetweenCaptures = 3000; // At least 3 seconds between interaction captures

            captureAfterEvents.forEach((eventType) => {
                document.addEventListener(eventType, () => {
                    // Throttle to prevent too many snapshots
                    if (Date.now() - lastCaptureTime > minTimeBetweenCaptures) {
                        // Delay slightly to capture the DOM after it's updated
                        setTimeout(() => this.captureFullDomSnapshot(), 500);
                        lastCaptureTime = Date.now();
                    }
                });
            });
        }

        // Add a new method to capture a full DOM snapshot
        captureFullDomSnapshot() {
            try {
                // Only capture if we're recording
                if (!this.isRecording) return;

                // Capture the full HTML DOM
                const doctype = document.doctype
                    ? new XMLSerializer().serializeToString(document.doctype)
                    : "";
                const htmlSnapshot = document.documentElement.outerHTML;

                // Gather canvas snapshots as these aren't in the HTML
                const canvasElements = [];
                document.querySelectorAll("canvas").forEach((canvas) => {
                    this.processCanvasElement(canvas, canvasElements);
                });

                // Record a full DOM snapshot for replay
                this.recordEvent("dom_snapshot", {
                    html: htmlSnapshot,
                    doctype: doctype,
                    canvasElements,
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
                });

                this.lastDomSnapshotTime = Date.now();
            } catch (error) {
                console.error("Error capturing full DOM snapshot:", error);
            }
        }

        // Add a method to check if changes are significant enough for a full snapshot
        checkForSignificantChanges(mutations) {
            // Don't trigger too many snapshots
            if (Date.now() - this.lastDomSnapshotTime < 5000) return;

            // Calculate a "significance score" for these mutations
            let significanceScore = 0;

            mutations.forEach((mutation) => {
                // Adding/removing elements is significant
                if (mutation.type === "childList") {
                    significanceScore += mutation.addedNodes.length * 2;
                    significanceScore += mutation.removedNodes.length * 2;
                }

                // Changes to specific attributes are significant
                if (mutation.type === "attributes") {
                    const significantAttrs = [
                        "class",
                        "style",
                        "src",
                        "href",
                        "display",
                    ];
                    if (significantAttrs.includes(mutation.attributeName)) {
                        significanceScore += 1;
                    }
                }

                if (mutation.type === "characterData") {
                    significanceScore += 0.5;
                }
            });

            if (significanceScore >= 5) {
                this.captureFullDomSnapshot();
            }
        }
    }

    // Initialize the recording when the script is loaded
    window.initializeRecording = function (apiKey) {
        // Prevent multiple initializations
        if (window._hotcloneRecorderInstance) {
            return window._hotcloneRecorderInstance;
        }

        if (!apiKey) {
            console.error("API key is required");
            return;
        }

        try {
            const recorder = new RecordingScript(apiKey);
            window._hotcloneRecorderInstance = recorder;
            recorder.start();

            // Save session when user leaves the page or refreshes
            window.addEventListener("beforeunload", () => {
                recorder.stop();

                // Clear any existing session data to ensure a new session on reload
                sessionStorage.removeItem("hotclone_session");
            });

            // Save session periodically (every 5 seconds for testing)
            setInterval(() => {
                if (recorder.isRecording) {
                    recorder.saveChunk();
                }
            }, 5000);

            return recorder;
        } catch (error) {
            console.error("Failed to initialize recording:", error);
        }
    };
})();
