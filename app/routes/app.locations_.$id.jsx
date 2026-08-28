import { useEffect, useRef, useState } from "react";

import {
    Form,
    redirect,
    useActionData,
    useLoaderData,
    useNavigation,
} from "react-router";

import { authenticate } from "../shopify.server";
import db from "../db.server";


export async function loader({ request, params }) {
    const { session } = await authenticate.admin(request);

    const location = await db.location.findFirst({
        where: {
            id: params.id,
            shop: session.shop,
        },
    });

    if (!location) {
        throw new Response("Location not found", {
            status: 404,
        });
    }

    const settings = await db.storeSettings.findUnique({
        where: {
            shop: session.shop,
        },
    });

    return {
        location,
        mapboxToken: settings?.mapboxToken ?? "",
    };
}


export async function action({ request, params }) {
    const { session } = await authenticate.admin(request);

    const existingLocation = await db.location.findFirst({
        where: {
            id: params.id,
            shop: session.shop,
        },
    });

    if (!existingLocation) {
        throw new Response("Location not found", {
            status: 404,
        });
    }

    const formData = await request.formData();

    const intent = String(formData.get("intent") || "save");

    if (intent === "delete") {
        await db.location.delete({
            where: {
                id: existingLocation.id,
            },
        });

        return redirect("/app/locations");
    }

    const name = String(formData.get("name") || "").trim();
    const address1 = String(formData.get("address1") || "").trim();
    const address2 = String(formData.get("address2") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const state = String(formData.get("state") || "").trim();
    const postalCode = String(formData.get("postalCode") || "").trim();
    const country = String(formData.get("country") || "US").trim();
    const enabled = formData.get("enabled") === "on";

    const latitudeRaw = String(
        formData.get("latitude") || ""
    ).trim();

    const longitudeRaw = String(
        formData.get("longitude") || ""
    ).trim();

    const latitude = latitudeRaw
        ? Number(latitudeRaw)
        : NaN;

    const longitude = longitudeRaw
        ? Number(longitudeRaw)
        : NaN;

    const phone = String(formData.get("phone") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const website = String(formData.get("website") || "").trim();
    const hours = String(formData.get("hours") || "").trim();

    if (
        !name ||
        !address1 ||
        !city ||
        !state ||
        !postalCode ||
        Number.isNaN(latitude) ||
        Number.isNaN(longitude)
    ) {
        return {
            error:
                "Please select a valid address and complete all required fields.",
        };
    }

    await db.location.update({
        where: {
            id: existingLocation.id,
        },
        data: {
            name,
            address1,
            address2: address2 || null,
            city,
            state,
            postalCode,
            country,
            latitude,
            longitude,
            phone: phone || null,
            email: email || null,
            website: website || null,
            hours: hours || null,
            enabled,
        },
    });

    return redirect("/app/locations");
}


export default function EditLocationPage() {
    const { location, mapboxToken } = useLoaderData();

    const actionData = useActionData();
    const navigation = useNavigation();

    const addressInputRef = useRef(null);
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);

    const [mapboxModule, setMapboxModule] =
        useState(null);

    const [mapboxGl, setMapboxGl] =
        useState(null);

    const [selectedAddress, setSelectedAddress] =
        useState(location.address1);

    const [city, setCity] =
        useState(location.city);

    const [state, setState] =
        useState(location.state);

    const [postalCode, setPostalCode] =
        useState(location.postalCode);

    const [country, setCountry] =
        useState(location.country);

    const [latitude, setLatitude] =
        useState(String(location.latitude));

    const [longitude, setLongitude] =
        useState(String(location.longitude));

    const isSaving =
        navigation.state === "submitting";

    const AddressAutofill =
        mapboxModule?.AddressAutofill;


    /*
     * Load Mapbox Search JS only in browser.
     */
    useEffect(() => {
        async function loadMapboxSearch() {
            try {
                const mapbox =
                    await import("@mapbox/search-js-react");

                setMapboxModule(mapbox);
            } catch (error) {
                console.error(
                    "Mapbox Search import failed:",
                    error
                );
            }
        }

        loadMapboxSearch();
    }, []);


    /*
     * Load Mapbox GL only in browser.
     */
    useEffect(() => {
        async function loadMapboxGl() {
            try {
                await import(
                    "mapbox-gl/dist/mapbox-gl.css"
                );

                const module =
                    await import("mapbox-gl");

                setMapboxGl(
                    module.default || module
                );
            } catch (error) {
                console.error(
                    "Mapbox GL import failed:",
                    error
                );
            }
        }

        loadMapboxGl();
    }, []);


    /*
     * Create/update preview map.
     */
    useEffect(() => {
        if (
            !mapboxGl ||
            !mapboxToken ||
            !latitude ||
            !longitude ||
            !mapContainerRef.current
        ) {
            return;
        }

        const lat = Number(latitude);
        const lng = Number(longitude);

        if (
            Number.isNaN(lat) ||
            Number.isNaN(lng)
        ) {
            return;
        }

        if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
        }

        const map = new mapboxGl.Map({
            accessToken: mapboxToken,
            container: mapContainerRef.current,
            center: [lng, lat],
            zoom: 15,
        });

        mapRef.current = map;

        new mapboxGl.Marker()
            .setLngLat([lng, lat])
            .addTo(map);

        return () => {
            if (mapRef.current) {
                mapRef.current.remove();
                mapRef.current = null;
            }
        };
    }, [
        mapboxGl,
        mapboxToken,
        latitude,
        longitude,
    ]);


    function handleRetrieve(result) {
        const feature =
            result?.features?.[0];

        if (!feature) {
            return;
        }

        const properties =
            feature.properties || {};

        const coordinates =
            feature.geometry?.coordinates || [];

        const retrievedCity =
            properties.address_level2 || "";

        const retrievedState =
            properties.address_level1 || "";

        const retrievedPostalCode =
            properties.postcode || "";

        const retrievedCountry =
            properties.country_code
                ? properties.country_code.toUpperCase()
                : "US";

        /*
         * Allow Mapbox to finish updating
         * the actual input first.
         */
        requestAnimationFrame(() => {
            const inputValue =
                addressInputRef.current?.value?.trim() ||
                "";

            setSelectedAddress(inputValue);
        });

        setCity(retrievedCity);
        setState(retrievedState);
        setPostalCode(retrievedPostalCode);
        setCountry(retrievedCountry);

        if (
            Array.isArray(coordinates) &&
            coordinates.length >= 2
        ) {
            setLongitude(
                String(coordinates[0])
            );

            setLatitude(
                String(coordinates[1])
            );
        }
    }


    return (
        <s-page heading={`Edit ${location.name}`}>
            <s-section>

                <Form method="post">
                    <s-stack
                        direction="block"
                        gap="base"
                    >

                        <s-text-field
                            label="Store name"
                            name="name"
                            defaultValue={location.name}
                            required
                        />


                        <div>
                            <label
                                htmlFor="address-search"
                                style={{
                                    display: "block",
                                    fontWeight: "600",
                                    marginBottom: "6px",
                                }}
                            >
                                Search for an address
                            </label>

                            {AddressAutofill ? (
                                <AddressAutofill
                                    accessToken={mapboxToken}
                                    options={{
                                        country: "US",
                                        language: "en",
                                        proximity: "ip",
                                    }}
                                    onRetrieve={handleRetrieve}
                                >
                                    <input
                                        ref={addressInputRef}
                                        id="address-search"
                                        type="text"
                                        autoComplete="address-line1"
                                        defaultValue={
                                            location.address1
                                        }
                                        placeholder="Start typing an address..."
                                        required
                                        style={{
                                            width: "100%",
                                            boxSizing: "border-box",
                                            padding: "10px 12px",
                                            border:
                                                "1px solid #8c9196",
                                            borderRadius: "8px",
                                            fontSize: "14px",
                                        }}
                                    />
                                </AddressAutofill>
                            ) : (
                                <input
                                    type="text"
                                    value={location.address1}
                                    disabled
                                    style={{
                                        width: "100%",
                                        boxSizing: "border-box",
                                        padding: "10px 12px",
                                        border:
                                            "1px solid #8c9196",
                                        borderRadius: "8px",
                                        fontSize: "14px",
                                    }}
                                />
                            )}

                            <input
                                type="hidden"
                                name="address1"
                                value={selectedAddress}
                            />
                        </div>


                        <s-text-field
                            label="Address line 2"
                            name="address2"
                            defaultValue={
                                location.address2 || ""
                            }
                            autocomplete="address-line2"
                        />


                        <s-text-field
                            label="City"
                            value={city}
                            readonly
                        />

                        <s-text-field
                            label="State"
                            value={state}
                            readonly
                        />

                        <s-text-field
                            label="ZIP / Postal code"
                            value={postalCode}
                            readonly
                        />


                        {latitude && longitude && (
                            <div>
                                <label
                                    style={{
                                        display: "block",
                                        fontWeight: "600",
                                        marginBottom: "6px",
                                    }}
                                >
                                    Location preview
                                </label>

                                <div
                                    ref={mapContainerRef}
                                    style={{
                                        width: "100%",
                                        height: "350px",
                                        borderRadius: "8px",
                                        overflow: "hidden",
                                        border:
                                            "1px solid #d1d5db",
                                    }}
                                />

                                <p
                                    style={{
                                        marginTop: "8px",
                                        fontSize: "13px",
                                        color: "#616161",
                                    }}
                                >
                                    Confirm that the marker is
                                    positioned at the correct
                                    store location.
                                </p>
                            </div>
                        )}


                        <input
                            type="hidden"
                            name="city"
                            value={city}
                        />

                        <input
                            type="hidden"
                            name="state"
                            value={state}
                        />

                        <input
                            type="hidden"
                            name="postalCode"
                            value={postalCode}
                        />

                        <input
                            type="hidden"
                            name="country"
                            value={country}
                        />

                        <input
                            type="hidden"
                            name="latitude"
                            value={latitude}
                        />

                        <input
                            type="hidden"
                            name="longitude"
                            value={longitude}
                        />


                        <s-text-field
                            label="Phone"
                            name="phone"
                            defaultValue={
                                location.phone || ""
                            }
                            autocomplete="tel"
                        />

                        <s-text-field
                            label="Email"
                            name="email"
                            type="email"
                            defaultValue={
                                location.email || ""
                            }
                            autocomplete="email"
                        />

                        <s-text-field
                            label="Website"
                            name="website"
                            defaultValue={
                                location.website || ""
                            }
                        />

                        <s-text-area
                            label="Hours"
                            name="hours"
                            defaultValue={
                                location.hours || ""
                            }
                        />


                        <s-checkbox
                            label="Location is active"
                            name="enabled"
                            defaultChecked={location.enabled}
                        />

                        {actionData?.error && (
                            <s-banner tone="critical">
                                <s-paragraph>
                                    {actionData.error}
                                </s-paragraph>
                            </s-banner>
                        )}


                        <s-stack
                            direction="inline"
                            gap="base"
                        >
                            <s-button
                                variant="primary"
                                type="submit"
                                loading={isSaving}
                            >
                                Save changes
                            </s-button>

                            <s-button
                                href="/app/locations"
                            >
                                Cancel
                            </s-button>
                        </s-stack>

                    </s-stack>
                </Form>

                <Form method="post">
                    <input
                        type="hidden"
                        name="intent"
                        value="delete"
                    />

                    <s-section heading="Danger zone">
                        <s-stack direction="block" gap="base">
                            <s-paragraph>
                                Permanently remove this location from the store finder.
                            </s-paragraph>

                            <s-button
                                tone="critical"
                                commandFor="delete-location-modal"
                                command="--show"
                            >
                                Delete location
                            </s-button>
                        </s-stack>
                    </s-section>

                    <s-modal
                        id="delete-location-modal"
                        heading="Delete location?"
                        accessibilityLabel={`Delete ${location.name}`}
                    >
                        <s-stack direction="block" gap="base">
                            <s-text>
                                Are you sure you want to delete "{location.name}"?
                            </s-text>

                            <s-text tone="caution">
                                This action cannot be undone.
                            </s-text>

                            <s-text>
                                {location.address1}, {location.city}, {location.state}{" "}
                                {location.postalCode}
                            </s-text>
                        </s-stack>

                        <s-button
                            slot="secondary-actions"
                            variant="secondary"
                            commandFor="delete-location-modal"
                            command="--hide"
                        >
                            Cancel
                        </s-button>

                        <s-button
                            slot="primary-action"
                            variant="primary"
                            tone="critical"
                            type="submit"
                        >
                            Delete location
                        </s-button>
                    </s-modal>
                </Form>

                {/* <Form
                    method="post"
                    onSubmit={(event) => {
                        const confirmed = window.confirm(
                            `Delete "${location.name}"? This cannot be undone.`
                        );

                        if (!confirmed) {
                            event.preventDefault();
                        }
                    }}
                >
                    <input
                        type="hidden"
                        name="intent"
                        value="delete"
                    />

                    <s-section heading="Danger zone">
                        <s-stack direction="block" gap="base">
                            <s-paragraph>
                                Permanently remove this location from the store finder.
                            </s-paragraph>

                            <s-button
                                tone="critical"
                                type="submit"
                            >
                                Delete location
                            </s-button>
                        </s-stack>
                    </s-section>
                </Form> */}

            </s-section>
        </s-page>
    );
}