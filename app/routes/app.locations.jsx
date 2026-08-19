import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export async function loader({ request }) {
    const { session } = await authenticate.admin(request);

    const locations = await db.location.findMany({
        where: {
            shop: session.shop,
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    return { locations };
}

export default function LocationsPage() {
    const { locations } = useLoaderData();

    return (
        <s-page heading="Locations">
            <s-section>
                <s-stack direction="block" gap="base">
                    <s-button
                        variant="primary" href="/app/locations/new">Add location
                    </s-button>

                    {locations.length === 0 ? (
                        <s-banner>
                            <s-paragraph>
                                No store locations have been added yet.
                            </s-paragraph>
                        </s-banner>
                    ) : (
                        <s-stack direction="block" gap="base">
                            {locations.map((location) => (
                                <s-box
                                    key={location.id}
                                    padding="base"
                                    borderWidth="base"
                                    borderRadius="base"
                                >
                                    <s-stack direction="block" gap="small">
                                        <s-heading>{location.name}</s-heading>

                                        <s-paragraph>
                                            {location.address1}
                                            {location.address2
                                                ? `, ${location.address2}`
                                                : ""}
                                        </s-paragraph>

                                        <s-paragraph>
                                            {location.city}, {location.state}{" "}
                                            {location.postalCode}
                                        </s-paragraph>

                                        <s-paragraph>
                                            {location.enabled ? "Active" : "Disabled"}
                                        </s-paragraph>
                                    </s-stack>
                                </s-box>
                            ))}
                        </s-stack>
                    )}
                </s-stack>
            </s-section>
        </s-page>
    );
}