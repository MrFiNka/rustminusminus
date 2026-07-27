import { GuildModel } from "../../models/Guild";
import { OauthModel } from "../../models/OAuth";
import { UserModel } from "../../models/User";
import { getOrCreateUserRustplus } from "../../rustplus/connections";
import { CHAT_PAIRING_HELP } from "../../utils";
import { fail, ok, findGuildTeam } from "./shared";

/** The linked User doc for the logged-in dashboard user (via their OAuth->Discord id), if any. */
async function resolveDashboardUser(cookieToken: string | undefined) {
    if (!cookieToken) return null;
    const auth = await OauthModel.findOne({ cookieId: cookieToken });
    if (!auth?.userId) return null;
    return UserModel.findOne({ userId: auth.userId });
}

// Rust's in-game chat won't render anything close to this, and the value is forwarded straight to
// the game server - so bound it here rather than handing an unbounded string to Rust+.
const MAX_CHAT_MESSAGE_LENGTH = 512;

/**
 * Sends a team chat message on behalf of the logged-in dashboard user. The message is sent under the
 * user's OWN linked Rust account, so in-game and in the Discord relay it looks identical to a normal
 * message from them. Only linked members who have paired the team's active server may send - the same
 * bar as the Discord teamchat bridge.
 */
export async function sendTeamChatMessage(cookieToken: string | undefined, guildId: string, teamId: string, message: string) {
    if (message.length > MAX_CHAT_MESSAGE_LENGTH) {
        return fail(400, `Message must be at most ${MAX_CHAT_MESSAGE_LENGTH} characters`);
    }
    const guild = await GuildModel.findOne({ guildId });
    if (!guild) return fail(404, "Guild not found");
    const team = await findGuildTeam(guild, teamId);
    if (!team) return fail(404, "Team not found");

    const userDb = await resolveDashboardUser(cookieToken);
    if (!userDb || !team.users.some(id => id.equals(userDb._id))) {
        return fail(403, `You must be a linked member of this team to send messages. ${CHAT_PAIRING_HELP}`);
    }

    // Sending under the user's own account. We deliberately do NOT mark this as a relay echo: unlike
    // the Discord->game path, the message doesn't already exist in the Discord channel, so we want the
    // inbound relay to post it there.
    const userConn = await getOrCreateUserRustplus(team, userDb);
    if (!userConn) {
        return fail(400, CHAT_PAIRING_HELP);
    }
    await userConn.sendTeamMessage(message);
    return ok(null);
}
