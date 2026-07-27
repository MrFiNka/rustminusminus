import { renderToString } from "react-dom/server";
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from "react-router-dom";
import { createServerRoutes } from "./router";
import { renderHtmlDocument } from "./htmlTemplate";
import { ensureClientBuilt, getAssetVersion } from "../websiteBuilding";

/**
 * Server-renders the matched route (with its loader data already resolved) to a full HTML
 * document, ready to hydrate on the client via createBrowserRouter's automatic pickup of
 * window.__staticRouterHydrationData (injected by StaticRouterProvider itself).
 */
export async function renderPage(request: Request, cookieToken: string | undefined): Promise<Response> {
    if (Bun.env.NODE_ENV == "development") {
        // block on an up-to-date build before rendering, so a page load can never observe a
        // stale bundle/stylesheet - see websiteBuilding.ts
        await ensureClientBuilt();
    }

    const routes = createServerRoutes(cookieToken);
    const handler = createStaticHandler(routes);
    const context = await handler.query(request);

    // a loader (or the router itself) short-circuited with a redirect/response of its own
    if (context instanceof Response) {
        return context;
    }

    const router = createStaticRouter(handler.dataRoutes, context);
    const appHtml = renderToString(<StaticRouterProvider router={router} context={context} />);

    return new Response(
        renderHtmlDocument({ appHtml, assetVersion: getAssetVersion() }),
        { headers: { "Content-Type": "text/html" } },
    );
}
