import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    DiscordAPIError,
    EmbedBuilder,
    RESTJSONErrorCodes,
    type ButtonInteraction,
} from "discord.js";
import type { GuildClass } from "../models/Guild";
import { TeamModel, type TeamClass } from "../models/Team";
import { UserModel } from "../models/User";
import { INVITE_TTL_MS, TeamInviteModel } from "../models/TeamInvite";

/** customId namespace owned by this module - see discord/buttons.ts. */
export const TEAM_INVITE_PREFIX = "teaminvite";

type Result = { ok: true } | { ok: false; error: string };

/** The bot can't DM this user (DMs closed for the server, or they've blocked it). */
function isDmBlocked(err: unknown): boolean {
    return err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.CannotSendMessagesToThisUser;
}

function inviteEmbed(teamName: string, guildName: string, inviterId: string, expiresAt: Date): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("Team invitation")
        .setDescription(
            `<@${inviterId}> invited you to join the team **${teamName}** in **${guildName}**.\n\n`
            + "Accepting adds you to the team and gives you its Discord role.",
        )
        .addFields({
            name: "Expires",
            // Discord's relative timestamp, so the invitee sees it in their own locale/clock.
            value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`,
        })
        .setColor(0x5865f2);
}

function inviteButtons(inviteId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`${TEAM_INVITE_PREFIX}:accept:${inviteId}`)
            .setLabel("Accept")
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`${TEAM_INVITE_PREFIX}:refuse:${inviteId}`)
            .setLabel("Refuse")
            .setStyle(ButtonStyle.Secondary),
    );
}

/**
 * DMs `inviteeId` an invitation to `team` with Accept/Refuse buttons, recording it so the eventual
 * button press can be validated (see models/TeamInvite.ts).
 *
 * Returns the same `{ ok }` shape as `TeamClass.addMember`, so the command and the web route handle
 * a failure identically to the direct-add path they sit next to.
 */
export async function sendTeamInvite(
    guild: GuildClass,
    team: TeamClass,
    inviterId: string,
    inviteeId: string,
): Promise<Result> {
    const discordGuild = guild.getDiscordGuild();
    if (!discordGuild) return { ok: false, error: "Can't find the Discord server" };

    const member = await discordGuild.members.fetch(inviteeId).catch(() => null);
    if (!member) return { ok: false, error: "That user isn't a member of this server" };
    if (member.user.bot) return { ok: false, error: "Bots can't be added to a team" };

    // Checked up front rather than left to fail on accept: `addMember` needs a linked User doc, and
    // an invite that can only ever be rejected is worse than a clear error to the inviter now.
    const userDb = await UserModel.findOne({ userId: inviteeId });
    if (!userDb) return { ok: false, error: "This user hasn't linked their account — they need to run /credentials add first" };
    if (team.users.some(id => id.equals(userDb._id))) return { ok: false, error: "This user is already in this team" };

    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    // Upsert: re-inviting refreshes the deadline and re-sends the DM rather than tripping the
    // unique (teamId, inviteeId) index or leaving a second row that could add them twice.
    const invite = await TeamInviteModel.findOneAndUpdate(
        { teamId: team._id, inviteeId },
        { guildId: guild.guildId, teamId: team._id, inviteeId, inviterId, expiresAt },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    try {
        await member.user.send({
            embeds: [inviteEmbed(team.name, discordGuild.name, inviterId, expiresAt)],
            components: [inviteButtons(invite._id.toString())],
        });
    } catch (err) {
        // Nothing was delivered, so don't leave a row the invitee has no way to act on.
        await TeamInviteModel.deleteOne({ _id: invite._id });
        if (isDmBlocked(err)) {
            return { ok: false, error: "This user has their DMs closed, so the invite couldn't be delivered" };
        }
        throw err;
    }
    return { ok: true };
}

/** Replaces the invite DM with a plain outcome embed and drops the buttons. */
async function resolveMessage(interaction: ButtonInteraction, description: string, color: number) {
    await interaction.update({
        embeds: [new EmbedBuilder().setTitle("Team invitation").setDescription(description).setColor(color)],
        components: [],
    });
}

/**
 * Handles an Accept/Refuse press on an invite DM.
 *
 * Everything is re-derived from the stored invite. The customId carries only an id, and holding one
 * proves nothing: the press is rejected unless the presser IS the invitee, so a copied or forwarded
 * customId can't add anyone. `interaction.guildId` is null here (it's a DM) and is never used.
 */
export async function handleInviteButton(interaction: ButtonInteraction): Promise<void> {
    const [, action, inviteId] = interaction.customId.split(":");
    const invite = inviteId ? await TeamInviteModel.findById(inviteId).catch(() => null) : null;

    if (!invite || invite.isExpired()) {
        // Also covers an invite already accepted/refused elsewhere - the row is deleted on resolve.
        await resolveMessage(interaction, "This invitation is no longer valid.", 0x747f8d);
        return;
    }
    if (interaction.user.id !== invite.inviteeId) {
        await interaction.reply({ content: "This invitation isn't yours.", flags: ["Ephemeral"] });
        return;
    }

    if (action === "refuse") {
        await TeamInviteModel.deleteOne({ _id: invite._id });
        await resolveMessage(interaction, "You declined this invitation.", 0x747f8d);
        return;
    }
    if (action !== "accept") {
        await interaction.reply({ content: "Unknown action.", flags: ["Ephemeral"] });
        return;
    }

    const team = await TeamModel.findById(invite.teamId);
    if (!team) {
        await TeamInviteModel.deleteOne({ _id: invite._id });
        await resolveMessage(interaction, "That team no longer exists.", 0xed4245);
        return;
    }

    // addMember re-validates that the account is still linked and grants the Discord role.
    const result = await team.addMember(invite.inviteeId);
    if (!result.ok) {
        // Keep the invite pending: this is usually transient (the bot lost Administrator, so the
        // role grant failed), and deleting the row would strand the invitee with a dead message.
        await interaction.reply({ content: `Couldn't add you to the team: ${result.error}`, flags: ["Ephemeral"] });
        return;
    }
    await TeamInviteModel.deleteOne({ _id: invite._id });
    await resolveMessage(interaction, `You joined **${team.name}**.`, 0x57f287);
}
