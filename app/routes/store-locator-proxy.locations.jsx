import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }) {
    try {
        const { session } = await authenticate.public.appProxy(request);

        console.log("STORE LOCATOR PROXY SESSION:", session);

        const shop = session?.shop;

        if (!shop) {
            console.error("Store locator proxy could not determine shop");

            return Response.json(
                { error: "Shop could not be determined." },
                { status: 400 }
            );
        }

        const locations = await db.location.findMany({
            where: {
                shop,
                enabled: true,
            },
            orderBy: {
                name: "asc",
            },
            select: {
                id: true,
                name: true,
                address1: true,
                address2: true,
                city: true,
                state: true,
                postalCode: true,
                country: true,
                latitude: true,
                longitude: true,
                phone: true,
                email: true,
                website: true,
                hours: true,
            },
        });

        console.log(
            "STORE LOCATOR LOCATIONS FOUND:",
            locations.length
        );

        return Response.json({
            locations,
        });
    } catch (error) {
        console.error(
            "STORE LOCATOR LOCATIONS PROXY ERROR:",
            error
        );

        return Response.json(
            {
                error: "Unable to load store locations.",
            },
            {
                status: 500,
            }
        );
    }
}