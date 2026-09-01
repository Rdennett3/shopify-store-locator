(() => {
    /*
     * ------------------------------------------------------------
     * Store Locator
     * ------------------------------------------------------------
     *
     * Responsibilities:
     *
     * - Load locations/settings through Shopify App Proxy
     * - Load Mapbox GL JS
     * - Render the location list
     * - Render store markers
     * - Handle card/marker selection
     * - Search by ZIP/address
     * - Calculate distance from search point
     * - Filter by configured search radius
     * - Reset search
     * - Provide Google Maps directions links
     *
     * ------------------------------------------------------------
     */


    /*
     * ------------------------------------------------------------
     * Utility: Escape HTML
     * ------------------------------------------------------------
     */

    function escapeHtml(value) {
        if (value === null || value === undefined) {
            return "";
        }

        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    /*
     * ------------------------------------------------------------
     * Distance helpers
     * ------------------------------------------------------------
     */

    function degreesToRadians(degrees) {
        return degrees * (Math.PI / 180);
    }


    function calculateDistanceMiles(
        latitude1,
        longitude1,
        latitude2,
        longitude2
    ) {
        const earthRadiusMiles = 3958.8;

        const lat1 = degreesToRadians(latitude1);
        const lat2 = degreesToRadians(latitude2);

        const deltaLatitude =
            degreesToRadians(latitude2 - latitude1);

        const deltaLongitude =
            degreesToRadians(longitude2 - longitude1);

        const a =
            Math.sin(deltaLatitude / 2) *
            Math.sin(deltaLatitude / 2) +
            Math.cos(lat1) *
            Math.cos(lat2) *
            Math.sin(deltaLongitude / 2) *
            Math.sin(deltaLongitude / 2);

        const c =
            2 *
            Math.atan2(
                Math.sqrt(a),
                Math.sqrt(1 - a)
            );

        return earthRadiusMiles * c;
    }


    /*
     * ------------------------------------------------------------
     * Mapbox Geocoding
     * ------------------------------------------------------------
     */

    async function geocodeSearchQuery(
        query,
        mapboxToken
    ) {
        const params = new URLSearchParams({
            q: query,
            access_token: mapboxToken,
            country: "US",
            limit: "1",
            autocomplete: "false",
        });

        const response = await fetch(
            `https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`
        );

        if (!response.ok) {
            throw new Error(
                `Geocoding request failed: ${response.status}`
            );
        }

        const data = await response.json();

        const feature = data.features?.[0];

        if (!feature) {
            return null;
        }

        const coordinates =
            feature.geometry?.coordinates;

        if (
            !Array.isArray(coordinates) ||
            coordinates.length < 2
        ) {
            return null;
        }

        return {
            longitude: Number(coordinates[0]),
            latitude: Number(coordinates[1]),
            name:
                feature.properties?.full_address ||
                feature.properties?.name ||
                query,
        };
    }


    /*
     * ------------------------------------------------------------
     * Load Mapbox GL JS
     * ------------------------------------------------------------
     */

    function loadMapbox() {
        return new Promise((resolve, reject) => {
            /*
             * Already loaded.
             */

            if (window.mapboxgl) {
                resolve(window.mapboxgl);
                return;
            }


            /*
             * Load Mapbox stylesheet once.
             */

            if (
                !document.querySelector(
                    'link[data-store-locator-mapbox-css]'
                )
            ) {
                const css = document.createElement("link");

                css.rel = "stylesheet";
                css.href =
                    "https://api.mapbox.com/mapbox-gl-js/v3.24.0/mapbox-gl.css";

                css.dataset.storeLocatorMapboxCss =
                    "true";

                document.head.appendChild(css);

                console.log("MAPBOX CSS ADDED");
            }


            /*
             * Check whether another locator has already
             * started loading the Mapbox script.
             */

            const existingScript =
                document.querySelector(
                    "script[data-store-locator-mapbox-js]"
                );

            if (existingScript) {
                existingScript.addEventListener(
                    "load",
                    () => {
                        if (window.mapboxgl) {
                            resolve(window.mapboxgl);
                        } else {
                            reject(
                                new Error(
                                    "Mapbox loaded but window.mapboxgl is unavailable."
                                )
                            );
                        }
                    }
                );

                existingScript.addEventListener(
                    "error",
                    () => {
                        reject(
                            new Error(
                                "Unable to load Mapbox GL JS."
                            )
                        );
                    }
                );

                return;
            }


            /*
             * Load Mapbox JavaScript.
             */

            const script =
                document.createElement("script");

            script.src =
                "https://api.mapbox.com/mapbox-gl-js/v3.24.0/mapbox-gl.js";

            script.defer = true;

            script.dataset.storeLocatorMapboxJs =
                "true";

            script.addEventListener(
                "load",
                () => {
                    console.log(
                        "MAPBOX SCRIPT LOADED"
                    );

                    if (window.mapboxgl) {
                        resolve(window.mapboxgl);
                    } else {
                        reject(
                            new Error(
                                "Mapbox script loaded but mapboxgl is unavailable."
                            )
                        );
                    }
                }
            );

            script.addEventListener(
                "error",
                () => {
                    reject(
                        new Error(
                            "Unable to load Mapbox GL JS."
                        )
                    );
                }
            );

            document.head.appendChild(script);

            console.log("MAPBOX SCRIPT ADDED");
        });
    }


    /*
     * ------------------------------------------------------------
     * Address formatting
     * ------------------------------------------------------------
     */

    function buildAddressHtml(location) {
        const lines = [];

        if (location.address1) {
            lines.push(
                escapeHtml(location.address1)
            );
        }

        if (location.address2) {
            lines.push(
                escapeHtml(location.address2)
            );
        }

        const cityStatePostal = [];

        if (location.city) {
            cityStatePostal.push(
                escapeHtml(location.city)
            );
        }

        let statePostal = "";

        if (location.state) {
            statePostal +=
                escapeHtml(location.state);
        }

        if (location.postalCode) {
            if (statePostal) {
                statePostal += " ";
            }

            statePostal +=
                escapeHtml(location.postalCode);
        }

        if (statePostal) {
            cityStatePostal.push(statePostal);
        }

        if (cityStatePostal.length) {
            lines.push(
                cityStatePostal.join(", ")
            );
        }

        if (location.country) {
            lines.push(
                escapeHtml(location.country)
            );
        }

        return lines.join("<br>");
    }


    /*
     * ------------------------------------------------------------
     * Render location cards
     * ------------------------------------------------------------
     */

    function renderLocations(
        container,
        locations,
        options = {}
    ) {
        const results =
            container.querySelector(
                "[data-store-locator-results]"
            );

        if (!results) {
            return;
        }

        if (!locations.length) {
            results.innerHTML = `
                <div class="store-locator__empty">
                    ${options.emptyMessage ||
                "No store locations are currently available."
                }
                </div>
            `;

            return;
        }

        results.innerHTML = locations
            .map((location) => {
                const latitude =
                    Number(location.latitude);

                const longitude =
                    Number(location.longitude);


                /*
                 * Distance
                 */

                const distance =
                    typeof location.distance ===
                        "number"
                        ? `
                            <p class="store-locator__distance">
                                ${location.distance.toFixed(
                            1
                        )} miles away
                            </p>
                        `
                        : "";


                /*
                 * Phone
                 */

                const phone = location.phone
                    ? `
                        <p>
                            <a
                                href="tel:${escapeHtml(
                        location.phone
                    )}"
                            >
                                ${escapeHtml(
                        location.phone
                    )}
                            </a>
                        </p>
                    `
                    : "";


                /*
                 * Email
                 */

                const email = location.email
                    ? `
                        <p>
                            <a
                                href="mailto:${escapeHtml(
                        location.email
                    )}"
                            >
                                ${escapeHtml(
                        location.email
                    )}
                            </a>
                        </p>
                    `
                    : "";


                /*
                 * Website
                 */

                const website = location.website
                    ? `
                        <p>
                            <a
                                href="${escapeHtml(
                        location.website
                    )}"
                                target="_blank"
                                rel="noopener"
                            >
                                Visit website
                            </a>
                        </p>
                    `
                    : "";


                /*
                 * Hours
                 */

                const hours = location.hours
                    ? `
                        <p class="store-locator__hours">
                            ${escapeHtml(
                        location.hours
                    )}
                        </p>
                    `
                    : "";


                /*
                 * Directions
                 */

                const directions =
                    !Number.isNaN(latitude) &&
                        !Number.isNaN(longitude)
                        ? `
                            <p class="store-locator__directions">
                                <a
                                    class="store-locator__directions-link"
                                    href="https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}"
                                    target="_blank"
                                    rel="noopener"
                                >
                                    Get directions
                                </a>
                            </p>
                        `
                        : "";


                /*
                 * Address
                 */

                const address =
                    buildAddressHtml(location);


                return `
                    <article
                        class="store-locator__location"
                        data-store-location-id="${escapeHtml(
                    location.id
                )}"
                        tabindex="0"
                        role="button"
                        aria-label="View ${escapeHtml(
                    location.name
                )} on map"
                    >
                        <h3 class="store-locator__location-title">
                            ${escapeHtml(
                    location.name
                )}
                        </h3>

                        ${address
                        ? `
                                    <p class="store-locator__address">
                                        ${address}
                                    </p>
                                `
                        : ""
                    }

                        ${distance}

                        <div class="store-locator__details">
                            ${phone}
                            ${email}
                            ${website}
                            ${hours}
                            ${directions}
                        </div>
                    </article>
                `;
            })
            .join("");
    }


    /*
     * ------------------------------------------------------------
     * Active location card
     * ------------------------------------------------------------
     */

    function setActiveLocation(
        container,
        locationId
    ) {
        const cards =
            container.querySelectorAll(
                "[data-store-location-id]"
            );

        cards.forEach((card) => {
            card.classList.toggle(
                "is-active",
                card.dataset.storeLocationId ===
                String(locationId)
            );
        });

        const escapedId =
            window.CSS && CSS.escape
                ? CSS.escape(
                    String(locationId)
                )
                : String(locationId);

        const activeCard =
            container.querySelector(
                `[data-store-location-id="${escapedId}"]`
            );

        if (activeCard) {
            activeCard.scrollIntoView({
                behavior: "smooth",
                block: "nearest",
            });
        }
    }


    /*
     * ------------------------------------------------------------
     * Active store marker
     * ------------------------------------------------------------
     */

    function setActiveMarker(
        markers,
        locationId
    ) {
        markers.forEach(
            (marker, markerLocationId) => {
                const markerElement =
                    marker.getElement();

                markerElement.classList.toggle(
                    "is-active",
                    String(
                        markerLocationId
                    ) === String(locationId)
                );
            }
        );
    }


    function clearActiveMarkers(markers) {
        markers.forEach((marker) => {
            marker
                .getElement()
                .classList.remove(
                    "is-active"
                );
        });
    }


    /*
     * ------------------------------------------------------------
     * Fit map to locations
     * ------------------------------------------------------------
     */

    function fitMapToLocations(
        map,
        mapboxgl,
        locations,
        options = {}
    ) {
        const validLocations =
            locations.filter((location) => {
                const latitude =
                    Number(location.latitude);

                const longitude =
                    Number(location.longitude);

                return (
                    !Number.isNaN(latitude) &&
                    !Number.isNaN(longitude)
                );
            });

        if (!validLocations.length) {
            return;
        }

        if (validLocations.length === 1) {
            map.flyTo({
                center: [
                    Number(
                        validLocations[0]
                            .longitude
                    ),
                    Number(
                        validLocations[0]
                            .latitude
                    ),
                ],
                zoom:
                    options.singleZoom || 14,
                essential: true,
            });

            return;
        }

        const bounds =
            new mapboxgl.LngLatBounds();

        validLocations.forEach(
            (location) => {
                bounds.extend([
                    Number(
                        location.longitude
                    ),
                    Number(
                        location.latitude
                    ),
                ]);
            }
        );

        map.fitBounds(bounds, {
            padding:
                options.padding || 60,
            maxZoom:
                options.maxZoom || 13,
        });
    }


    /*
     * ------------------------------------------------------------
     * Initialize one Store Locator block
     * ------------------------------------------------------------
     */

    async function initializeStoreLocator(
        container
    ) {
        console.log(
            "INITIALIZING STORE LOCATOR",
            container
        );


        /*
         * Give Shopify's generated app block
         * a stable class we control.
         */

        const appBlock =
            container.closest(
                ".shopify-app-block"
            );

        if (appBlock) {
            appBlock.classList.add(
                "store-locator-app-block"
            );
        }


        /*
         * Prevent duplicate initialization.
         */

        if (
            container.dataset.initialized ===
            "true"
        ) {
            return;
        }

        container.dataset.initialized =
            "true";


        /*
         * Elements
         */

        const results =
            container.querySelector(
                "[data-store-locator-results]"
            );

        const mapElement =
            container.querySelector(
                "[data-store-locator-map]"
            );

        const searchForm =
            container.querySelector(
                "[data-store-locator-search-form]"
            );

        const searchInput =
            container.querySelector(
                "[data-store-locator-search]"
            );

        const searchButton =
            container.querySelector(
                "[data-store-locator-search-button]"
            );

        const resetButton =
            container.querySelector(
                "[data-store-locator-reset]"
            );

        const useLocationButton =
            container.querySelector(
                "[data-store-locator-use-location]"
            );

        const searchStatus =
            container.querySelector(
                "[data-store-locator-search-status]"
            );


        console.log(
            "RESULTS ELEMENT:",
            results
        );

        console.log(
            "MAP ELEMENT:",
            mapElement
        );


        if (!results || !mapElement) {
            console.error(
                "Store Locator markup is incomplete."
            );

            return;
        }


        try {
            /*
             * ----------------------------------------------------
             * Fetch locations + configuration
             * ----------------------------------------------------
             */

            console.log(
                "FETCHING STORE LOCATOR DATA"
            );

            const [
                locationsResponse,
                configResponse,
                mapboxgl,
            ] = await Promise.all([
                fetch(
                    "/apps/store-locator/locations",
                    {
                        headers: {
                            Accept: "application/json",
                        },
                    }
                ),

                fetch(
                    "/apps/store-locator/config",
                    {
                        headers: {
                            Accept: "application/json",
                        },
                    }
                ),

                loadMapbox(),
            ]);


            console.log(
                "STORE LOCATOR REQUESTS COMPLETE"
            );

            console.log(
                "LOCATIONS RESPONSE STATUS:",
                locationsResponse.status
            );

            console.log(
                "CONFIG RESPONSE STATUS:",
                configResponse.status
            );


            if (!locationsResponse.ok) {
                throw new Error(
                    `Locations request failed with status ${locationsResponse.status}`
                );
            }

            if (!configResponse.ok) {
                throw new Error(
                    `Config request failed with status ${configResponse.status}`
                );
            }


            const locationData =
                await locationsResponse.json();

            const config =
                await configResponse.json();


            console.log(
                "LOCATION DATA:",
                locationData
            );

            console.log(
                "CONFIG DATA:",
                config
            );


            const locations =
                Array.isArray(
                    locationData.locations
                )
                    ? locationData.locations
                    : [];


            console.log(
                "LOCATION COUNT:",
                locations.length
            );


            if (!config.mapboxToken) {
                throw new Error(
                    "Mapbox access token is missing."
                );
            }


            /*
             * ----------------------------------------------------
             * Render initial store list
             * ----------------------------------------------------
             */

            renderLocations(
                container,
                locations
            );

            console.log(
                "LOCATION LIST RENDERED"
            );


            /*
             * ----------------------------------------------------
             * Configure Mapbox
             * ----------------------------------------------------
             */

            mapboxgl.accessToken =
                config.mapboxToken;


            const defaultLatitude =
                Number(
                    config.defaultLatitude
                ) || 39.8283;

            const defaultLongitude =
                Number(
                    config.defaultLongitude
                ) || -98.5795;

            const defaultZoom =
                Number(
                    config.defaultZoom
                ) || 4;


            const map = new mapboxgl.Map({
                container: mapElement,

                style:
                    "mapbox://styles/mapbox/streets-v12",

                center: [
                    defaultLongitude,
                    defaultLatitude,
                ],

                zoom: defaultZoom,
            });


            console.log("MAP CREATED");


            /*
             * Map controls
             */

            map.addControl(
                new mapboxgl.NavigationControl(),
                "top-right"
            );


            /*
             * ----------------------------------------------------
             * Store markers
             * ----------------------------------------------------
             */

            const markers = new Map();

            const bounds =
                new mapboxgl.LngLatBounds();

            let validLocationCount = 0;


            locations.forEach(
                (location) => {
                    const latitude =
                        Number(
                            location.latitude
                        );

                    const longitude =
                        Number(
                            location.longitude
                        );

                    if (
                        Number.isNaN(
                            latitude
                        ) ||
                        Number.isNaN(
                            longitude
                        )
                    ) {
                        console.warn(
                            "Skipping location with invalid coordinates:",
                            location
                        );

                        return;
                    }


                    const coordinates = [
                        longitude,
                        latitude,
                    ];


                    /*
 * Mapbox store marker
 *
 * Let Mapbox create its standard pin marker.
 */

                    const marker =
                        new mapboxgl.Marker({
                            color: "#222222",
                        })
                            .setLngLat(
                                coordinates
                            )
                            .addTo(map);


                    /*
                     * Add our own class to the outer Mapbox
                     * marker element for highlighting.
                     */

                    const markerElement =
                        marker.getElement();

                    markerElement.classList.add(
                        "store-locator__marker"
                    );

                    markerElement.setAttribute(
                        "role",
                        "button"
                    );

                    markerElement.setAttribute(
                        "tabindex",
                        "0"
                    );

                    markerElement.setAttribute(
                        "aria-label",
                        `View ${location.name}`
                    );


                    markers.set(
                        String(location.id),
                        marker
                    );

                    bounds.extend(
                        coordinates
                    );

                    validLocationCount++;


                    /*
                     * Marker click
                     */

                    markerElement.addEventListener(
                        "click",
                        () => {
                            console.log(
                                "MARKER CLICKED:",
                                location.id
                            );

                            setActiveLocation(
                                container,
                                location.id
                            );

                            setActiveMarker(
                                markers,
                                location.id
                            );

                            map.flyTo({
                                center:
                                    coordinates,
                                zoom: 14,
                                essential: true,
                            });
                        }
                    );
                }
            );


            console.log(
                "MARKERS CREATED:",
                markers.size
            );


            /*
             * ----------------------------------------------------
             * Initial map fit
             * ----------------------------------------------------
             */

            map.on("load", () => {
                console.log(
                    "MAPBOX MAP LOAD EVENT"
                );

                map.resize();

                if (
                    validLocationCount === 1
                ) {
                    const location =
                        locations.find(
                            (item) =>
                                !Number.isNaN(
                                    Number(
                                        item.latitude
                                    )
                                ) &&
                                !Number.isNaN(
                                    Number(
                                        item.longitude
                                    )
                                )
                        );

                    if (location) {
                        map.flyTo({
                            center: [
                                Number(
                                    location.longitude
                                ),
                                Number(
                                    location.latitude
                                ),
                            ],
                            zoom: 14,
                        });
                    }
                } else if (
                    validLocationCount > 1 &&
                    !bounds.isEmpty()
                ) {
                    console.log(
                        "FITTING MAP TO LOCATIONS"
                    );

                    map.fitBounds(
                        bounds,
                        {
                            padding: 60,
                            maxZoom: 13,
                        }
                    );
                }
            });


            requestAnimationFrame(
                () => {
                    map.resize();
                }
            );


            /*
             * ----------------------------------------------------
             * Enable search controls
             * ----------------------------------------------------
             */

            if (searchInput) {
                searchInput.disabled =
                    false;
            }

            if (searchButton) {
                searchButton.disabled =
                    false;
            }

            if (useLocationButton) {
                useLocationButton.disabled =
                    false;
            }


            /*
             * ----------------------------------------------------
             * Location card interaction
             * ----------------------------------------------------
             *
             * Event delegation means this continues working
             * after the location list is re-rendered by search.
             */

            container.addEventListener(
                "click",
                (event) => {
                    const card =
                        event.target.closest(
                            "[data-store-location-id]"
                        );

                    if (!card) {
                        return;
                    }


                    /*
                     * Links inside the card should function
                     * normally without triggering map movement.
                     */

                    if (
                        event.target.closest(
                            "a, button"
                        )
                    ) {
                        return;
                    }


                    const locationId =
                        card.dataset
                            .storeLocationId;

                    const location =
                        locations.find(
                            (item) =>
                                String(
                                    item.id
                                ) ===
                                String(
                                    locationId
                                )
                        );

                    if (!location) {
                        return;
                    }


                    const latitude =
                        Number(
                            location.latitude
                        );

                    const longitude =
                        Number(
                            location.longitude
                        );

                    if (
                        Number.isNaN(
                            latitude
                        ) ||
                        Number.isNaN(
                            longitude
                        )
                    ) {
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

                    setActiveMarker(
                        markers,
                        location.id
                    );


                    map.flyTo({
                        center: [
                            longitude,
                            latitude,
                        ],

                        zoom: 14,

                        essential: true,
                    });
                }
            );


            /*
             * Keyboard support for location cards.
             */

            container.addEventListener(
                "keydown",
                (event) => {
                    if (
                        event.key !==
                        "Enter" &&
                        event.key !== " "
                    ) {
                        return;
                    }

                    const card =
                        event.target.closest(
                            "[data-store-location-id]"
                        );

                    if (!card) {
                        return;
                    }


                    /*
                     * Don't hijack keyboard events
                     * from links/buttons.
                     */

                    if (
                        event.target.closest(
                            "a, button"
                        )
                    ) {
                        return;
                    }

                    event.preventDefault();

                    card.click();
                }
            );


            /*
             * ----------------------------------------------------
             * Search
             * ----------------------------------------------------
             */

            let searchMarker = null;

            function showNearbyLocations(
                searchLocation,
                label = "your location"
            ) {
                const searchRadius =
                    Number(config.searchRadius) || 50;


                /*
                 * Calculate distance to every location.
                 */

                const locationsWithDistance =
                    locations
                        .map((location) => {
                            const latitude =
                                Number(location.latitude);

                            const longitude =
                                Number(location.longitude);

                            if (
                                Number.isNaN(latitude) ||
                                Number.isNaN(longitude)
                            ) {
                                return null;
                            }

                            return {
                                ...location,

                                distance:
                                    calculateDistanceMiles(
                                        searchLocation.latitude,
                                        searchLocation.longitude,
                                        latitude,
                                        longitude
                                    ),
                            };
                        })
                        .filter(Boolean)
                        .sort(
                            (a, b) =>
                                a.distance - b.distance
                        );


                /*
                 * Filter by configured radius.
                 */

                const matchingLocations =
                    locationsWithDistance.filter(
                        (location) =>
                            location.distance <=
                            searchRadius
                    );


                console.log(
                    "MATCHING LOCATIONS:",
                    matchingLocations
                );


                /*
                 * Remove previous search marker.
                 */

                if (searchMarker) {
                    searchMarker.remove();
                }


                /*
                 * Add marker for searched/current location.
                 */

                searchMarker =
                    new mapboxgl.Marker({
                        color: "#777777",
                        scale: 0.8,
                    })
                        .setLngLat([
                            searchLocation.longitude,
                            searchLocation.latitude,
                        ])
                        .addTo(map);


                /*
                 * Only show matching store markers.
                 */

                markers.forEach(
                    (marker, locationId) => {
                        const isVisible =
                            matchingLocations.some(
                                (location) =>
                                    String(location.id) ===
                                    String(locationId)
                            );

                        marker.getElement().style.display =
                            isVisible ? "" : "none";
                    }
                );


                clearActiveMarkers(markers);


                /*
                 * Show Reset button.
                 */

                if (resetButton) {
                    resetButton.hidden = false;
                }


                /*
                 * No results.
                 */

                if (!matchingLocations.length) {
                    renderLocations(
                        container,
                        [],
                        {
                            emptyMessage:
                                `No stores were found within ${searchRadius} miles.`,
                        }
                    );

                    if (searchStatus) {
                        searchStatus.textContent =
                            `No stores were found within ${searchRadius} miles of ${label}.`;
                    }

                    map.flyTo({
                        center: [
                            searchLocation.longitude,
                            searchLocation.latitude,
                        ],

                        zoom: 9,

                        essential: true,
                    });

                    return;
                }


                /*
                 * Render nearest stores first.
                 */

                renderLocations(
                    container,
                    matchingLocations
                );


                if (searchStatus) {
                    searchStatus.textContent =
                        `${matchingLocations.length} ${matchingLocations.length === 1
                            ? "store"
                            : "stores"
                        } found within ${searchRadius} miles of ${label}.`;
                }


                /*
                 * Fit map around searched location
                 * and matching stores.
                 */

                const searchBounds =
                    new mapboxgl.LngLatBounds();


                searchBounds.extend([
                    searchLocation.longitude,
                    searchLocation.latitude,
                ]);


                matchingLocations.forEach(
                    (location) => {
                        searchBounds.extend([
                            Number(
                                location.longitude
                            ),

                            Number(
                                location.latitude
                            ),
                        ]);
                    }
                );


                map.fitBounds(
                    searchBounds,
                    {
                        padding: 70,
                        maxZoom: 12,
                    }
                );
            }


            if (
                searchForm &&
                searchInput
            ) {
                searchForm.addEventListener(
                    "submit",
                    async (event) => {
                        event.preventDefault();


                        const query =
                            searchInput.value.trim();


                        if (!query) {
                            if (
                                searchStatus
                            ) {
                                searchStatus.textContent =
                                    "Enter a ZIP code or address.";
                            }

                            return;
                        }


                        /*
                         * Disable controls while geocoding.
                         */

                        searchInput.disabled =
                            true;

                        if (
                            searchButton
                        ) {
                            searchButton.disabled =
                                true;

                            searchButton.textContent =
                                "Searching...";
                        }

                        if (
                            searchStatus
                        ) {
                            searchStatus.textContent =
                                "Searching for nearby stores...";
                        }


                        try {
                            /*
                             * Convert search query to coordinates.
                             */

                            const searchLocation =
                                await geocodeSearchQuery(
                                    query,
                                    config.mapboxToken
                                );


                            if (
                                !searchLocation
                            ) {
                                if (
                                    searchStatus
                                ) {
                                    searchStatus.textContent =
                                        "We couldn't find that location.";
                                }

                                return;
                            }


                            console.log(
                                "SEARCH LOCATION:",
                                searchLocation
                            );


                            /*
                             * Show Reset button.
                             */

                            if (
                                resetButton
                            ) {
                                resetButton.hidden =
                                    false;
                            }


                            /*
                             * Configured search radius.
                             */

                            const searchRadius =
                                Number(
                                    config.searchRadius
                                ) || 50;


                            /*
                             * Calculate distance from searched
                             * coordinates to every store.
                             */

                            const locationsWithDistance =
                                locations
                                    .map(
                                        (
                                            location
                                        ) => {
                                            const latitude =
                                                Number(
                                                    location.latitude
                                                );

                                            const longitude =
                                                Number(
                                                    location.longitude
                                                );


                                            if (
                                                Number.isNaN(
                                                    latitude
                                                ) ||
                                                Number.isNaN(
                                                    longitude
                                                )
                                            ) {
                                                return null;
                                            }


                                            return {
                                                ...location,

                                                distance:
                                                    calculateDistanceMiles(
                                                        searchLocation.latitude,
                                                        searchLocation.longitude,
                                                        latitude,
                                                        longitude
                                                    ),
                                            };
                                        }
                                    )
                                    .filter(
                                        Boolean
                                    )
                                    .sort(
                                        (
                                            a,
                                            b
                                        ) =>
                                            a.distance -
                                            b.distance
                                    );


                            /*
                             * Filter by search radius.
                             */

                            const matchingLocations =
                                locationsWithDistance.filter(
                                    (
                                        location
                                    ) =>
                                        location.distance <=
                                        searchRadius
                                );


                            console.log(
                                "MATCHING LOCATIONS:",
                                matchingLocations
                            );


                            /*
                             * Remove previous search marker.
                             */

                            if (
                                searchMarker
                            ) {
                                searchMarker.remove();
                            }


                            /*
                             * Search-origin marker.
                             */

                            const searchMarkerElement =
                                document.createElement(
                                    "div"
                                );

                            searchMarkerElement.className =
                                "store-locator__search-marker";

                            searchMarkerElement.setAttribute(
                                "aria-label",
                                "Your searched location"
                            );


                            searchMarker =
                                new mapboxgl.Marker(
                                    {
                                        element:
                                            searchMarkerElement,

                                        anchor:
                                            "center",
                                    }
                                )
                                    .setLngLat(
                                        [
                                            searchLocation.longitude,
                                            searchLocation.latitude,
                                        ]
                                    )
                                    .addTo(
                                        map
                                    );


                            /*
                             * Hide markers outside search radius.
                             */

                            markers.forEach(
                                (
                                    marker,
                                    locationId
                                ) => {
                                    const isVisible =
                                        matchingLocations.some(
                                            (
                                                location
                                            ) =>
                                                String(
                                                    location.id
                                                ) ===
                                                String(
                                                    locationId
                                                )
                                        );

                                    marker.getElement().style.display =
                                        isVisible
                                            ? ""
                                            : "none";
                                }
                            );


                            /*
                             * Clear prior selected marker.
                             */

                            clearActiveMarkers(
                                markers
                            );


                            /*
                             * No results.
                             */

                            if (
                                !matchingLocations.length
                            ) {
                                renderLocations(
                                    container,
                                    [],
                                    {
                                        emptyMessage:
                                            `No stores were found within ${searchRadius} miles.`,
                                    }
                                );

                                if (
                                    searchStatus
                                ) {
                                    searchStatus.textContent =
                                        `No stores were found within ${searchRadius} miles.`;
                                }

                                map.flyTo({
                                    center: [
                                        searchLocation.longitude,
                                        searchLocation.latitude,
                                    ],

                                    zoom: 9,

                                    essential:
                                        true,
                                });

                                return;
                            }


                            /*
                             * Render nearest stores first.
                             */

                            renderLocations(
                                container,
                                matchingLocations
                            );


                            if (
                                searchStatus
                            ) {
                                searchStatus.textContent =
                                    `${matchingLocations.length} ${matchingLocations.length ===
                                        1
                                        ? "store"
                                        : "stores"
                                    } found within ${searchRadius} miles.`;
                            }


                            /*
                             * Fit map around search point
                             * and all matching stores.
                             */

                            const searchBounds =
                                new mapboxgl.LngLatBounds();


                            searchBounds.extend([
                                searchLocation.longitude,
                                searchLocation.latitude,
                            ]);


                            matchingLocations.forEach(
                                (
                                    location
                                ) => {
                                    searchBounds.extend(
                                        [
                                            Number(
                                                location.longitude
                                            ),

                                            Number(
                                                location.latitude
                                            ),
                                        ]
                                    );
                                }
                            );


                            map.fitBounds(
                                searchBounds,
                                {
                                    padding: 70,
                                    maxZoom: 12,
                                }
                            );
                        } catch (
                        error
                        ) {
                            console.error(
                                "STORE LOCATOR SEARCH FAILED:",
                                error
                            );

                            if (
                                searchStatus
                            ) {
                                searchStatus.textContent =
                                    "Unable to complete the search. Please try again.";
                            }
                        } finally {
                            searchInput.disabled =
                                false;

                            if (
                                searchButton
                            ) {
                                searchButton.disabled =
                                    false;

                                searchButton.textContent =
                                    "Search";
                            }
                        }
                    }
                );
            }

            if (useLocationButton) {
                useLocationButton.addEventListener(
                    "click",
                    () => {
                        /*
                         * Browser does not support geolocation.
                         */

                        if (!navigator.geolocation) {
                            if (searchStatus) {
                                searchStatus.textContent =
                                    "Your browser does not support location services.";
                            }

                            return;
                        }


                        /*
                         * Disable while requesting permission/location.
                         */

                        useLocationButton.disabled =
                            true;

                        useLocationButton.textContent =
                            "Locating...";


                        if (searchStatus) {
                            searchStatus.textContent =
                                "Getting your location...";
                        }


                        navigator.geolocation.getCurrentPosition(
                            /*
                             * Success
                             */
                            (position) => {
                                const searchLocation = {
                                    latitude:
                                        position.coords.latitude,

                                    longitude:
                                        position.coords.longitude,
                                };


                                console.log(
                                    "USER LOCATION:",
                                    searchLocation
                                );


                                /*
                                 * Clear typed search so it doesn't
                                 * look like it is still active.
                                 */

                                if (searchInput) {
                                    searchInput.value =
                                        "";
                                }


                                showNearbyLocations(
                                    searchLocation,
                                    "your current location"
                                );


                                useLocationButton.disabled =
                                    false;

                                useLocationButton.textContent =
                                    "Use My Location";
                            },


                            /*
                             * Error
                             */
                            (error) => {
                                console.error(
                                    "GEOLOCATION FAILED:",
                                    error
                                );


                                let message =
                                    "Unable to determine your location.";


                                if (
                                    error.code ===
                                    error.PERMISSION_DENIED
                                ) {
                                    message =
                                        "Location access was denied. You can still search by ZIP code or address.";
                                }

                                if (
                                    error.code ===
                                    error.POSITION_UNAVAILABLE
                                ) {
                                    message =
                                        "Your current location could not be determined.";
                                }

                                if (
                                    error.code ===
                                    error.TIMEOUT
                                ) {
                                    message =
                                        "Location lookup timed out. Please try again.";
                                }


                                if (searchStatus) {
                                    searchStatus.textContent =
                                        message;
                                }


                                useLocationButton.disabled =
                                    false;

                                useLocationButton.textContent =
                                    "Use My Location";
                            },


                            /*
                             * Geolocation options
                             */
                            {
                                enableHighAccuracy: false,

                                timeout: 10000,

                                maximumAge: 300000,
                            }
                        );
                    }
                );
            }


            /*
             * ----------------------------------------------------
             * Reset search
             * ----------------------------------------------------
             *
             * IMPORTANT:
             * This listener is OUTSIDE the search submit listener.
             */

            if (resetButton) {
                resetButton.addEventListener(
                    "click",
                    () => {
                        console.log(
                            "RESETTING STORE LOCATOR"
                        );


                        /*
                         * Clear search field.
                         */

                        if (
                            searchInput
                        ) {
                            searchInput.value =
                                "";
                        }


                        /*
                         * Clear status message.
                         */

                        if (
                            searchStatus
                        ) {
                            searchStatus.textContent =
                                "";
                        }


                        /*
                         * Hide Reset.
                         */

                        resetButton.hidden =
                            true;


                        /*
                         * Remove search marker.
                         */

                        if (
                            searchMarker
                        ) {
                            searchMarker.remove();
                            searchMarker =
                                null;
                        }


                        /*
                         * Restore all store markers.
                         */

                        markers.forEach(
                            (marker) => {
                                marker.getElement().style.display =
                                    "";
                            }
                        );


                        /*
                         * Remove marker highlighting.
                         */

                        clearActiveMarkers(
                            markers
                        );


                        /*
                         * Restore original store list.
                         *
                         * This removes distance values because
                         * we're using the original locations array.
                         */

                        renderLocations(
                            container,
                            locations
                        );


                        /*
                         * Remove active card styling.
                         */

                        const cards =
                            container.querySelectorAll(
                                "[data-store-location-id]"
                            );

                        cards.forEach(
                            (card) => {
                                card.classList.remove(
                                    "is-active"
                                );
                            }
                        );


                        /*
                         * Restore original map bounds.
                         */

                        fitMapToLocations(
                            map,
                            mapboxgl,
                            locations,
                            {
                                padding: 60,
                                maxZoom: 13,
                                singleZoom: 14,
                            }
                        );
                    }
                );
            }


            console.log(
                "STORE LOCATOR INITIALIZATION COMPLETE"
            );
        } catch (error) {
            console.error(
                "STORE LOCATOR INITIALIZATION FAILED:",
                error
            );

            results.innerHTML = `
                <div class="store-locator__error">
                    Unable to load store locations. Please try again later.
                </div>
            `;

            if (searchInput) {
                searchInput.disabled =
                    true;
            }

            if (searchButton) {
                searchButton.disabled =
                    true;
            }
        }
    }


    /*
     * ------------------------------------------------------------
     * Initialize all locator blocks on page
     * ------------------------------------------------------------
     */

    function initializeAllStoreLocators(
        root = document
    ) {
        const containers =
            root.querySelectorAll(
                "[data-store-locator]"
            );

        console.log(
            "STORE LOCATOR CONTAINERS FOUND:",
            containers.length
        );

        containers.forEach(
            (container) => {
                initializeStoreLocator(
                    container
                );
            }
        );
    }


    /*
     * ------------------------------------------------------------
     * Initial page load
     * ------------------------------------------------------------
     */

    function startStoreLocator() {
        console.log(
            "STORE LOCATOR JS LOADED"
        );

        initializeAllStoreLocators();
    }


    if (
        document.readyState ===
        "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            startStoreLocator
        );
    } else {
        startStoreLocator();
    }


    /*
     * ------------------------------------------------------------
     * Shopify Theme Editor support
     * ------------------------------------------------------------
     *
     * Shopify can dynamically reload sections without
     * doing a full page reload.
     */

    document.addEventListener(
        "shopify:section:load",
        (event) => {
            initializeAllStoreLocators(
                event.target
            );
        }
    );
})();