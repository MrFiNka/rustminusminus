import type { ChatInputCommandInteraction } from "discord.js";
import type { Types } from "mongoose";
import { PermissionFlagsBits } from "discord.js";
import { resolveUserPermissions } from "./check";
import type { PermissionId } from "./definitions";

/**
 * True if the interacting member has Discord's MANAGE_GUILD permission, or holds `permission` via a
 * permission group. Pass `teamId` for a team-scoped command (resolve the team first): a guild-wide
 * grant OR a grant scoped to that team then satisfies it. Omit it for guild-level commands.
 */
export async function hasDiscordPermission(
    interaction: ChatInputCommandInteraction,
    permission: PermissionId,
    teamId?: Types.ObjectId | string,
): Promise<boolean> {
    if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
    if (!interaction.guildId) return false;
    const granted = await resolveUserPermissions(interaction.guildId, interaction.user.id, teamId);
    return granted.has(permission);
}
