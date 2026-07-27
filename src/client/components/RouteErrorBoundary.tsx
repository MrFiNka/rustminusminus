import { isRouteErrorResponse, useRouteError } from "react-router-dom";

export function RouteErrorBoundary() {
    const error = useRouteError();
    const message = isRouteErrorResponse(error)
        ? (typeof error.data === "string" && error.data) || error.statusText || "Something went wrong"
        : error instanceof Error
            ? error.message
            : "Something went wrong";

    return (
        <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-4 text-sm text-red-400">
            {message}
        </div>
    );
}
