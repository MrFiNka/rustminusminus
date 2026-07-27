import Elysia from "elysia";
import axios from "axios";
import { DiscordBot } from "../DiscordBot";
import { OauthModel } from "../../models/OAuth";
import { sessionPlugin } from "./session";

let REDIRECT_URI = Bun.env.PROTOCOL + "://" + Bun.env.HOST + ":" + Bun.env.PORT + "/callback"

export const authRoutes = new Elysia({ name: "authRoutes" })
    .use(sessionPlugin)
    .get("/login", async ({ redirect, loggedIn }) => {
        if (loggedIn) return redirect("/");
        const url = `https://discord.com/oauth2/authorize?client_id=${DiscordBot.Instance.user?.id}&redirect_uri=${encodeURIComponent(
            REDIRECT_URI
        )}&response_type=code&scope=identify%20guilds`;
        return redirect(url);
    })
    .get("/callback", async ({ query, cookieToken, loggedIn, redirect }) => {
        if (loggedIn) return redirect("/");
        const code = query.code;

        const data = new URLSearchParams({
            client_id: String(DiscordBot.Instance.user?.id),
            client_secret: String(Bun.env.OAUTH_SECRET),
            grant_type: "authorization_code",
            code: code ?? "",
            redirect_uri: REDIRECT_URI,
        });

        const tokenRes = await axios.post(
            "https://discord.com/api/oauth2/token",
            data.toString(),
            {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                validateStatus: () => true
            }
        );
        if (tokenRes.status != 200) return redirect("/login");
        if (!tokenRes.data.scope.includes("identify") || !tokenRes.data.scope.includes("guilds")) return redirect("/login");
        const access_token = tokenRes.data.access_token;
        if (!cookieToken) return redirect("/login");
        // The session plugin no longer pre-creates a row for every visitor (see session.ts), so this
        // is where an Oauth document first comes into existence - for a session that has actually
        // completed the Discord handshake. Upsert rather than create: a returning user re-running the
        // flow with the same cookie already has one.
        let auth = await OauthModel.findOne({ cookieId: cookieToken })
            ?? new OauthModel({ cookieId: cookieToken });
        auth.accessToken = access_token;
        auth.expiration = new Date(Date.now() + (tokenRes.data.expires_in * 1000));
        let user = await auth.getUser();
        auth.userId = user?.id;
        await auth.save();
        return redirect("/");
    });
