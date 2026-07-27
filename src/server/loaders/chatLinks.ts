import type { LoaderFunctionArgs } from "react-router-dom";
import { getChatLinksList } from "../dataAccess/chatLinks";

export function createChatLinksLoader(cookieToken: string | undefined) {
    return async ({ params }: LoaderFunctionArgs) => {
        const result = await getChatLinksList(cookieToken, params.guildId!);
        if (!result.ok) throw new Response(result.error, { status: result.status });
        return result.data;
    };
}
