import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }) {
    try {
        const { session } = await authenticate.public.appProxy(request);

        console.log("STORE LOCATOR CONFIG PROXY SESSION:", session);

        const shop = session?.shop;

        if (!shop) {
            console.error(
                "Store locator config proxy could not determine shop"
            );

            return Response.json(
                { error: "Shop could not be determined." },
                { status: 400 }
            );
        }

        const settings =
            await db.storeSettings.findUnique({
                where: {
                    shop,
                },
            });

        console.log(
            "STORE LOCATOR CONFIG FOUND:",
            settings
        );

        return Response.json({
            mapboxToken:
                settings?.mapboxToken ?? "",

            defaultLatitude:
                settings?.defaultLatitude ?? null,

            defaultLongitude:
                settings?.defaultLongitude ?? null,

            defaultZoom:
                settings?.defaultZoom ?? 8,

            searchRadius:
                settings?.searchRadius ?? 50,
        });
    } catch (error) {
        console.error(
            "STORE LOCATOR CONFIG PROXY ERROR:",
            error
        );

        return Response.json(
            {
                error: "Unable to load store locator configuration.",
            },
            {
                status: 500,
            }
        );
    }
}