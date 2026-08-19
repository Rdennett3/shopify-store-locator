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

export async function loader({ request }) {
    const { session } = await authenticate.admin(request);

    const settings = await db.storeSettings.findUnique({
        where: {
            shop: session.shop,
        },
    });

    return {
        mapboxToken: settings?.mapboxToken ?? "",
    };
}

export async function action({ request }) {
    const { session } = await authenticate.admin(request);

    const formData = await request.formData();

    const name = String(formData.get("name") || "").trim();
    const address1 = String(formData.get("address1") || "").trim();
    const address2 = String(formData.get("address2") || "").trim();
    const city = String(formData.get("city") || "").trim();
    const state = String(formData.get("state") || "").trim();
    const postalCode = String(formData.get("postalCode") || "").trim();
    const country = String(formData.get("country") || "US").trim();

    const latitudeRaw = String(formData.get("latitude") || "").trim();
    const longitudeRaw = String(formData.get("longitude") || "").trim();

    const latitude = latitudeRaw ? Number(latitudeRaw) : NaN;
    const longitude = longitudeRaw ? Number(longitudeRaw) : NaN;

    const phone = String(formData.get("phone") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const website = String(formData.get("website") || "").trim();
    const hours = String(formData.get("hours") || "").trim();

    console.log({
        name,
        address1,
        city,
        state,
        postalCode,
        country,
        latitude,
        longitude,
    });

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
            error: "Please select a valid address and complete all required fields.",
        };
    }

    await db.location.create({
        data: {
            shop: session.shop,
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
        },
    });

    return redirect("/app/locations");
}

export default function NewLocationPage() {
    const { mapboxToken } = useLoaderData();
    const actionData = useActionData();
    const navigation = useNavigation();

    const addressInputRef = useRef(null);

    const [selectedAddress, setSelectedAddress] = useState("");

    const [mapboxModule, setMapboxModule] = useState(null);

    const [city, setCity] = useState("");
    const [state, setState] = useState("");
    const [postalCode, setPostalCode] = useState("");
    const [country, setCountry] = useState("US");
    const [latitude, setLatitude] = useState("");
    const [longitude, setLongitude] = useState("");

    const isSaving = navigation.state === "submitting";

    const AddressAutofill = mapboxModule?.AddressAutofill;

    console.log("MAPBOX MODULE STATE:", mapboxModule);
    console.log("ADDRESS AUTOFILL READY:", Boolean(AddressAutofill));

    useEffect(() => {
        async function loadMapbox() {
            try {
                console.log("STARTING MAPBOX IMPORT");

                const mapbox = await import("@mapbox/search-js-react");

                console.log("MAPBOX IMPORT RESULT:", mapbox);

                setMapboxModule(mapbox);

            } catch (error) {
                console.error("MAPBOX IMPORT FAILED:", error);
            }
        }

        loadMapbox();
    }, []);

    function handleRetrieve(result) {
        const feature = result?.features?.[0];

        if (!feature) {
            return;
        }

        const properties = feature.properties || {};
        const coordinates = feature.geometry?.coordinates || [];

        console.log("Mapbox retrieved feature:", feature);

        const retrievedCity =
            properties.address_level2 ||
            properties.context?.place?.name ||
            "";

        const retrievedState =
            properties.address_level1 ||
            properties.context?.region?.region_code ||
            properties.context?.region?.name ||
            "";

        const retrievedPostalCode =
            properties.postcode ||
            properties.context?.postcode?.name ||
            "";

        const retrievedCountry =
            properties.country_code
                ? properties.country_code.toUpperCase()
                : "US";

        /*
         * Mapbox updates the actual HTML input itself.
         * Read that value after Mapbox has completed the selection.
         */
        requestAnimationFrame(() => {
            const inputValue = addressInputRef.current?.value?.trim() || "";

            setSelectedAddress(inputValue);
        });

        setCity(retrievedCity);
        setState(retrievedState);
        setPostalCode(retrievedPostalCode);
        setCountry(retrievedCountry);

        if (Array.isArray(coordinates) && coordinates.length >= 2) {
            setLongitude(String(coordinates[0]));
            setLatitude(String(coordinates[1]));
        }
    }

    if (!mapboxToken) {
        return (
            <s-page heading="Add Location">
                <s-section>
                    <s-banner tone="critical">
                        <s-paragraph>
                            A Mapbox access token has not been configured. Add one in
                            Settings before creating locations.
                        </s-paragraph>
                    </s-banner>
                </s-section>
            </s-page>
        );
    }

    return (
        <s-page heading="Add Location">
            <s-section>
                <Form method="post">
                    <s-stack direction="block" gap="base">

                        <s-text-field
                            label="Store name"
                            name="name"
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
                                        placeholder="Start typing an address..."
                                        required
                                        style={{
                                            width: "100%",
                                            boxSizing: "border-box",
                                            padding: "10px 12px",
                                            border: "1px solid #8c9196",
                                            borderRadius: "8px",
                                            fontSize: "14px",
                                        }}
                                    />
                                </AddressAutofill>
                            ) : (
                                <input
                                    id="address-search-loading"
                                    type="text"
                                    placeholder="Loading address search..."
                                    disabled
                                    style={{
                                        width: "100%",
                                        boxSizing: "border-box",
                                        padding: "10px 12px",
                                        border: "1px solid #8c9196",
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
                            autocomplete="tel"
                        />

                        <s-text-field
                            label="Email"
                            name="email"
                            type="email"
                            autocomplete="email"
                        />

                        <s-text-field
                            label="Website"
                            name="website"
                        />

                        <s-text-area
                            label="Hours"
                            name="hours"
                        />

                        {actionData?.error && (
                            <s-banner tone="critical">
                                <s-paragraph>{actionData.error}</s-paragraph>
                            </s-banner>
                        )}

                        <s-button
                            variant="primary"
                            type="submit"
                            loading={isSaving}
                        >
                            Save location
                        </s-button>

                    </s-stack>
                </Form>
            </s-section>
        </s-page>
    );
}