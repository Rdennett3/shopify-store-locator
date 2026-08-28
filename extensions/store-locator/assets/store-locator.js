console.log("STORE LOCATOR JS LOADED");

(() => {
    const MAPBOX_VERSION = "3.24.0";

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function loadMapbox() {
        return new Promise((resolve, reject) => {
            if (window.mapboxgl) {
                console.log("MAPBOX ALREADY AVAILABLE");
                resolve(window.mapboxgl);
                return;
            }

            const existingScript = document.querySelector(
                'script[data-store-locator-mapbox]'
            );

            if (existingScript) {
                console.log("WAITING FOR EXISTING MAPBOX SCRIPT");

                existingScript.addEventListener("load", () => {
                    console.log("EXISTING MAPBOX SCRIPT LOADED");
                    resolve(window.mapboxgl);
                });

                existingScript.addEventListener("error", (error) => {
                    console.error("EXISTING MAPBOX SCRIPT FAILED", error);
                    reject(error);
                });

                return;
            }

            if (
                !document.querySelector(
                    'link[data-store-locator-mapbox-css]'
                )
            ) {
                const stylesheet = document.createElement("link");

                stylesheet.rel = "stylesheet";
                stylesheet.href =
                    `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.css`;

                stylesheet.dataset.storeLocatorMapboxCss = "true";

                document.head.appendChild(stylesheet);

                console.log("MAPBOX CSS ADDED");
            }

            const script = document.createElement("script");

            script.src =
                `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.js`;

            script.async = true;
            script.dataset.storeLocatorMapbox = "true";

            script.onload = () => {
                console.log("MAPBOX SCRIPT LOADED");
                resolve(window.mapboxgl);
            };

            script.onerror = (error) => {
                console.error("MAPBOX SCRIPT FAILED", error);

                reject(
                    new Error("Unable to load Mapbox GL JS.")
                );
            };

            document.head.appendChild(script);

            console.log("MAPBOX SCRIPT ADDED");
        });
    }

    function renderLocations(container, locations) {
        const results = container.querySelector(
            "[data-store-locator-results]"
        );

        if (!results) {
            console.warn("RESULTS CONTAINER NOT FOUND");
            return;
        }

        if (!locations.length) {
            results.innerHTML = `
        <div class="store-locator__empty">
          No store locations are currently available.
        </div>
      `;

            return;
        }

        results.innerHTML = locations
            .map((location) => {
                const address2 = location.address2
                    ? `<br>${escapeHtml(location.address2)}`
                    : "";

                const phone = location.phone
                    ? `
            <p>
              <a href="tel:${escapeHtml(location.phone)}">
                ${escapeHtml(location.phone)}
              </a>
            </p>
          `
                    : "";

                const website = location.website
                    ? `
            <p>
              <a
                href="${escapeHtml(location.website)}"
                target="_blank"
                rel="noopener"
              >
                Visit website
              </a>
            </p>
          `
                    : "";

                const hours = location.hours
                    ? `
            <p>
              ${escapeHtml(location.hours)}
            </p>
          `
                    : "";

                return `
          <article
            class="store-locator__location"
            data-store-location-id="${escapeHtml(location.id)}"
            tabindex="0"
            role="button"
          >
            <h3 class="store-locator__location-title">
              ${escapeHtml(location.name)}
            </h3>

            <p class="store-locator__address">
              ${escapeHtml(location.address1)}
              ${address2}
              <br>
              ${escapeHtml(location.city)},
              ${escapeHtml(location.state)}
              ${escapeHtml(location.postalCode)}
            </p>

            <div class="store-locator__details">
              ${phone}
              ${website}
              ${hours}
            </div>
          </article>
        `;
            })
            .join("");

        console.log("LOCATION LIST RENDERED");
    }

    function setActiveLocation(container, locationId) {
        const cards = container.querySelectorAll(
            "[data-store-location-id]"
        );

        cards.forEach((card) => {
            card.classList.toggle(
                "is-active",
                card.dataset.storeLocationId === locationId
            );
        });

        const escapedId =
            window.CSS && CSS.escape
                ? CSS.escape(locationId)
                : locationId;

        const activeCard = container.querySelector(
            `[data-store-location-id="${escapedId}"]`
        );

        if (activeCard) {
            activeCard.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        }
    }

    async function initializeStoreLocator(container) {
        console.log(
            "INITIALIZING STORE LOCATOR",
            container
        );

        const appBlock = container.closest(".shopify-app-block");

        if (appBlock) {
            appBlock.classList.add("store-locator-app-block");

            console.log(
                "STORE LOCATOR APP BLOCK:",
                appBlock
            );
        }

        if (container.dataset.initialized === "true") {
            console.log("STORE LOCATOR ALREADY INITIALIZED");
            return;
        }

        container.dataset.initialized = "true";

        const results = container.querySelector(
            "[data-store-locator-results]"
        );

        const mapElement = container.querySelector(
            "[data-store-locator-map]"
        );

        console.log("RESULTS ELEMENT:", results);
        console.log("MAP ELEMENT:", mapElement);

        if (!mapElement) {
            console.error("MAP ELEMENT NOT FOUND");

            if (results) {
                results.innerHTML = `
          <div class="store-locator__error">
            Unable to initialize the store locator map.
          </div>
        `;
            }

            return;
        }

        try {
            console.log("FETCHING STORE LOCATOR DATA");

            const [
                locationsResponse,
                configResponse,
                mapboxgl,
            ] = await Promise.all([
                fetch("/apps/store-locator/locations"),
                fetch("/apps/store-locator/config"),
                loadMapbox(),
            ]);

            console.log("STORE LOCATOR REQUESTS COMPLETE");

            console.log(
                "LOCATIONS RESPONSE STATUS:",
                locationsResponse.status
            );

            console.log(
                "CONFIG RESPONSE STATUS:",
                configResponse.status
            );

            console.log(
                "MAPBOX GL OBJECT:",
                mapboxgl
            );

            if (!locationsResponse.ok) {
                throw new Error(
                    `Location request failed: ${locationsResponse.status}`
                );
            }

            if (!configResponse.ok) {
                throw new Error(
                    `Config request failed: ${configResponse.status}`
                );
            }

            const locationData =
                await locationsResponse.json();

            const config =
                await configResponse.json();

            const locations =
                locationData.locations || [];

            console.log(
                "LOCATION DATA:",
                locationData
            );

            console.log(
                "LOCATION COUNT:",
                locations.length
            );

            console.log(
                "CONFIG DATA:",
                config
            );

            console.log(
                "MAP ELEMENT:",
                mapElement
            );

            if (!config.mapboxToken) {
                throw new Error(
                    "A Mapbox access token has not been configured."
                );
            }

            renderLocations(container, locations);

            if (!locations.length) {
                console.warn(
                    "NO LOCATIONS RETURNED — MAP WILL NOT INITIALIZE"
                );

                return;
            }

            mapboxgl.accessToken =
                config.mapboxToken;

            const firstLocation = locations[0];

            console.log(
                "FIRST LOCATION:",
                firstLocation
            );

            console.log(
                "MAP DIMENSIONS:",
                {
                    width: mapElement.offsetWidth,
                    height: mapElement.offsetHeight,
                    clientWidth: mapElement.clientWidth,
                    clientHeight: mapElement.clientHeight,
                }
            );

            let element = mapElement;

            for (let i = 0; i < 6 && element; i++) {
                console.log(`MAP PARENT ${i}:`, {
                    element,
                    className: element.className,
                    width: element.offsetWidth,
                    clientWidth: element.clientWidth,
                    display: getComputedStyle(element).display,
                    gridTemplateColumns: getComputedStyle(element).gridTemplateColumns,
                });

                element = element.parentElement;
            }

            console.log("CREATING MAP");

            const map = new mapboxgl.Map({
                container: mapElement,
                style: "mapbox://styles/mapbox/streets-v12",
                center: [
                    Number(firstLocation.longitude),
                    Number(firstLocation.latitude),
                ],
                zoom: Number(config.defaultZoom) || 8,
            });

            console.log(
                "MAP CREATED:",
                map
            );

            requestAnimationFrame(() => {
                map.resize();
            });

            map.on("error", (event) => {
                console.error(
                    "MAPBOX MAP ERROR:",
                    event?.error || event
                );
            });

            map.on("load", () => {
                console.log("MAPBOX MAP LOAD EVENT");
                map.resize();
            });

            map.addControl(
                new mapboxgl.NavigationControl(),
                "top-right"
            );

            const bounds =
                new mapboxgl.LngLatBounds();

            const markers = new Map();

            locations.forEach((location) => {
                const longitude =
                    Number(location.longitude);

                const latitude =
                    Number(location.latitude);

                if (
                    Number.isNaN(longitude) ||
                    Number.isNaN(latitude)
                ) {
                    console.warn(
                        "SKIPPING LOCATION WITH INVALID COORDINATES:",
                        location
                    );

                    return;
                }

                const coordinates = [
                    longitude,
                    latitude,
                ];

                bounds.extend(coordinates);

                const marker =
                    new mapboxgl.Marker()
                        .setLngLat(coordinates)
                        .addTo(map);

                markers.set(location.id, marker);

                marker
                    .getElement()
                    .addEventListener("click", () => {
                        console.log(
                            "MARKER CLICKED:",
                            location.id
                        );

                        setActiveLocation(
                            container,
                            location.id
                        );

                        map.flyTo({
                            center: coordinates,
                            zoom: 14,
                            essential: true,
                        });
                    });
            });

            console.log(
                "MARKERS CREATED:",
                markers.size
            );

            map.once("load", () => {
                console.log(
                    "FITTING MAP TO LOCATIONS"
                );

                if (locations.length === 1) {
                    map.flyTo({
                        center: [
                            Number(firstLocation.longitude),
                            Number(firstLocation.latitude),
                        ],
                        zoom: 14,
                    });

                    return;
                }

                if (!bounds.isEmpty()) {
                    map.fitBounds(bounds, {
                        padding: 60,
                        maxZoom: 13,
                    });
                }
            });

            container.addEventListener(
                "click",
                (event) => {
                    const card = event.target.closest(
                        "[data-store-location-id]"
                    );

                    if (!card) {
                        return;
                    }

                    const location =
                        locations.find(
                            (item) =>
                                item.id ===
                                card.dataset.storeLocationId
                        );

                    if (!location) {
                        return;
                    }

                    console.log(
                        "LOCATION CARD CLICKED:",
                        location.id
                    );

                    setActiveLocation(
                        container,
                        location.id
                    );

                    map.flyTo({
                        center: [
                            Number(location.longitude),
                            Number(location.latitude),
                        ],
                        zoom: 14,
                        essential: true,
                    });
                }
            );

            container.addEventListener(
                "keydown",
                (event) => {
                    if (
                        event.key !== "Enter" &&
                        event.key !== " "
                    ) {
                        return;
                    }

                    const card = event.target.closest(
                        "[data-store-location-id]"
                    );

                    if (!card) {
                        return;
                    }

                    event.preventDefault();
                    card.click();
                }
            );

            console.log(
                "STORE LOCATOR INITIALIZATION COMPLETE"
            );
        } catch (error) {
            console.error(
                "STORE LOCATOR INITIALIZATION FAILED:",
                error
            );

            if (results) {
                results.innerHTML = `
          <div class="store-locator__error">
            Unable to load store locations.
          </div>
        `;
            }
        }
    }

    function initializeAllStoreLocators() {
        const containers =
            document.querySelectorAll(
                "[data-store-locator]"
            );

        console.log(
            "STORE LOCATOR CONTAINERS FOUND:",
            containers.length
        );

        containers.forEach((container) => {
            initializeStoreLocator(container);
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initializeAllStoreLocators
        );
    } else {
        initializeAllStoreLocators();
    }

    document.addEventListener(
        "shopify:section:load",
        () => {
            console.log(
                "SHOPIFY SECTION LOAD EVENT"
            );

            initializeAllStoreLocators();
        }
    );
})();