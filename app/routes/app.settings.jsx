import {
    Form,
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
        settings: {
            mapboxToken: settings?.mapboxToken ?? "",
            defaultLatitude: settings?.defaultLatitude ?? 34.2257,
            defaultLongitude: settings?.defaultLongitude ?? -77.9447,
            defaultZoom: settings?.defaultZoom ?? 8,
            searchRadius: settings?.searchRadius ?? 50,
        },
    };
}

export async function action({ request }) {
    const { session } = await authenticate.admin(request);

    const formData = await request.formData();

    const mapboxToken = String(formData.get("mapboxToken") || "").trim();

    const defaultLatitude = Number(formData.get("defaultLatitude"));
    const defaultLongitude = Number(formData.get("defaultLongitude"));
    const defaultZoom = Number(formData.get("defaultZoom"));
    const searchRadius = Number(formData.get("searchRadius"));

    if (!mapboxToken) {
        return {
            success: false,
            error: "A Mapbox public access token is required.",
        };
    }

    await db.storeSettings.upsert({
        where: {
            shop: session.shop,
        },

        update: {
            mapboxToken,
            defaultLatitude,
            defaultLongitude,
            defaultZoom,
            searchRadius,
        },

        create: {
            shop: session.shop,
            mapboxToken,
            defaultLatitude,
            defaultLongitude,
            defaultZoom,
            searchRadius,
        },
    });

    return {
        success: true,
        error: null,
    };
}

export default function SettingsPage() {
    const { settings } = useLoaderData();
    const actionData = useActionData();
    const navigation = useNavigation();

    const isSaving = navigation.state === "submitting";

    return (
        <s-page heading="Store Finder Settings">
            <s-section heading="Mapbox">
                <s-paragraph>
                    Enter the public Mapbox access token that will be used by the store
                    finder.
                </s-paragraph>

                <Form method="post">
                    <s-stack direction="block" gap="base">
                        <s-text-field
                            label="Mapbox public access token"
                            name="mapboxToken"
                            defaultValue={settings.mapboxToken}
                            placeholder="pk.eyJ1..."
                            autocomplete="off"
                        />

                        <s-text-field
                            label="Default latitude"
                            name="defaultLatitude"
                            type="number"
                            defaultValue={String(settings.defaultLatitude)}
                        />

                        <s-text-field
                            label="Default longitude"
                            name="defaultLongitude"
                            type="number"
                            defaultValue={String(settings.defaultLongitude)}
                        />

                        <s-text-field
                            label="Default map zoom"
                            name="defaultZoom"
                            type="number"
                            defaultValue={String(settings.defaultZoom)}
                        />

                        <s-text-field
                            label="Default search radius (miles)"
                            name="searchRadius"
                            type="number"
                            defaultValue={String(settings.searchRadius)}
                        />

                        {actionData?.error && (
                            <s-banner tone="critical">
                                <s-paragraph>{actionData.error}</s-paragraph>
                            </s-banner>
                        )}

                        {actionData?.success && (
                            <s-banner tone="success">
                                <s-paragraph>Settings saved successfully.</s-paragraph>
                            </s-banner>
                        )}

                        <s-button variant="primary" type="submit" loading={isSaving}>
                            Save settings
                        </s-button>
                    </s-stack>
                </Form>
            </s-section>
        </s-page>
    );
}