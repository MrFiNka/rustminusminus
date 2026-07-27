import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import type { Types } from "mongoose";
import type { CommandType } from "../types/DiscordCommandType";
import type { GuildClass } from "../models/Guild";
import { GuildModel } from "../models/Guild";
import { PermissionGroupModel, createPermissionGroup } from "../models/PermissionGroup";
import { PERMISSIONS, type PermissionId } from "../permissions/definitions";

const ENFORCED_PERMISSIONS = PERMISSIONS.filter(p => p.status === "enforced");

/** Resolves the scope's teamId from an optional `team` option. null = guild-wide. */
async function resolveScope(guild: GuildClass, teamName: string | null):
    Promise<{ teamId: Types.ObjectId | null } | { error: string }> {
    if (!teamName) return { teamId: null };
    const team = await guild.findTeamByName(teamName);
    if (!team) return { error: "Can't find that team" };
    return { teamId: team._id };
}

export default {
    command: async (interaction) => {
        if (!interaction.guild) return;
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            return await interaction.reply({ content: "You need Manage Server permission to manage permission groups.", flags: ["Ephemeral"] });
        }
        const guild = await GuildModel.findOne({ guildId: interaction.guild.id });
        if (!guild) return await interaction.reply({ content: "Can't find your guild in database!", flags: ["Ephemeral"] });

        const group = interaction.options.getSubcommandGroup(false);
        const subcommand = interaction.options.getSubcommand();

        if (group === "group") {
            const teamName = interaction.options.getString("team", false);

            if (subcommand === "create") {
                const name = interaction.options.getString("name", true);
                await interaction.deferReply({ flags: ["Ephemeral"] });
                const scope = await resolveScope(guild, teamName);
                if ("error" in scope) return await interaction.editReply({ content: scope.error });
                const existing = await PermissionGroupModel.findOne({ guildId: guild.guildId, name, teamId: scope.teamId });
                if (existing) return await interaction.editReply({ content: "A permission group with that name already exists in this scope" });
                const created = await createPermissionGroup(guild.guildId, name, scope.teamId);
                if (!created) return await interaction.editReply({ content: "Failed to create the permission group" });
                const where = scope.teamId ? `team "${teamName}"` : "guild-wide";
                return await interaction.editReply({ content: `Permission group "${name}" (${where}) created! Assign members with /permissions assign.` });
            }

            if (subcommand === "delete") {
                const name = interaction.options.getString("name", true);
                await interaction.deferReply({ flags: ["Ephemeral"] });
                const scope = await resolveScope(guild, teamName);
                if ("error" in scope) return await interaction.editReply({ content: scope.error });
                const permGroup = await PermissionGroupModel.findOne({ guildId: guild.guildId, name, teamId: scope.teamId });
                if (!permGroup) return await interaction.editReply({ content: "Can't find that permission group" });
                await permGroup.deleteOne();
                return await interaction.editReply({ content: `Permission group "${name}" deleted!` });
            }

            if (subcommand === "list") {
                await interaction.deferReply({ flags: ["Ephemeral"] });
                const groups = await PermissionGroupModel.find({ guildId: guild.guildId });
                if (groups.length === 0) return await interaction.editReply({ content: "No permission groups yet." });
                const teams = await guild.getTeams();
                const teamNameById = new Map(teams.map(t => [t._id.toString(), t.name]));
                const lines = groups.map(g => {
                    const scope = g.teamId ? `team: ${teamNameById.get(g.teamId.toString()) ?? g.teamId}` : "guild-wide";
                    return `**${g.name}** (${scope}): ${g.permissions.join(", ") || "(no permissions)"} — ${g.members.length} member(s)`;
                });
                return await interaction.editReply({ content: lines.join("\n") });
            }

            if (subcommand === "add-permission" || subcommand === "remove-permission") {
                const name = interaction.options.getString("name", true);
                const permission = interaction.options.getString("permission", true) as PermissionId;
                await interaction.deferReply({ flags: ["Ephemeral"] });
                const scope = await resolveScope(guild, teamName);
                if ("error" in scope) return await interaction.editReply({ content: scope.error });
                const permGroup = await PermissionGroupModel.findOne({ guildId: guild.guildId, name, teamId: scope.teamId });
                if (!permGroup) return await interaction.editReply({ content: "Can't find that permission group" });
                if (subcommand === "add-permission") {
                    if (!permGroup.permissions.includes(permission)) permGroup.permissions.push(permission);
                } else {
                    permGroup.permissions = permGroup.permissions.filter(p => p !== permission);
                }
                await permGroup.save();
                return await interaction.editReply({ content: "Done." });
            }
        }

        if (subcommand === "assign" || subcommand === "unassign") {
            const name = interaction.options.getString("group", true);
            const user = interaction.options.getUser("user", true);
            const teamName = interaction.options.getString("team", false);
            await interaction.deferReply({ flags: ["Ephemeral"] });
            const scope = await resolveScope(guild, teamName);
            if ("error" in scope) return await interaction.editReply({ content: scope.error });
            const permGroup = await PermissionGroupModel.findOne({ guildId: guild.guildId, name, teamId: scope.teamId });
            if (!permGroup) return await interaction.editReply({ content: "Can't find that permission group" });
            const result = subcommand === "assign" ? await permGroup.addMember(user.id) : await permGroup.removeMember(user.id);
            if (!result.ok) return await interaction.editReply({ content: result.error });
            return await interaction.editReply({ content: "Done." });
        }
    },
    slashCommand: new SlashCommandBuilder()
        .addSubcommandGroup(subcommandGroup =>
            subcommandGroup
                .setName("group")
                .setDescription("Manage permission groups")
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("create")
                        .setDescription("Create a new permission group")
                        .addStringOption(stringoption =>
                            stringoption.setName("name").setDescription("Name of the permission group").setRequired(true)
                        )
                        .addStringOption(stringoption =>
                            stringoption.setName("team").setDescription("Team to scope it to (omit for guild-wide)").setRequired(false)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("delete")
                        .setDescription("Delete a permission group")
                        .addStringOption(stringoption =>
                            stringoption.setName("name").setDescription("Name of the permission group").setRequired(true)
                        )
                        .addStringOption(stringoption =>
                            stringoption.setName("team").setDescription("Team scope (omit for guild-wide)").setRequired(false)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("list")
                        .setDescription("List permission groups")
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("add-permission")
                        .setDescription("Add a permission to a group")
                        .addStringOption(stringoption =>
                            stringoption.setName("name").setDescription("Name of the permission group").setRequired(true)
                        )
                        .addStringOption(stringoption =>
                            stringoption
                                .setName("permission")
                                .setDescription("Permission to add")
                                .setRequired(true)
                                .addChoices(...ENFORCED_PERMISSIONS.map(p => ({ name: p.label, value: p.id })))
                        )
                        .addStringOption(stringoption =>
                            stringoption.setName("team").setDescription("Team scope (omit for guild-wide)").setRequired(false)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName("remove-permission")
                        .setDescription("Remove a permission from a group")
                        .addStringOption(stringoption =>
                            stringoption.setName("name").setDescription("Name of the permission group").setRequired(true)
                        )
                        .addStringOption(stringoption =>
                            stringoption
                                .setName("permission")
                                .setDescription("Permission to remove")
                                .setRequired(true)
                                .addChoices(...ENFORCED_PERMISSIONS.map(p => ({ name: p.label, value: p.id })))
                        )
                        .addStringOption(stringoption =>
                            stringoption.setName("team").setDescription("Team scope (omit for guild-wide)").setRequired(false)
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("assign")
                .setDescription("Assign a Discord user to a permission group")
                .addStringOption(stringoption =>
                    stringoption.setName("group").setDescription("Name of the permission group").setRequired(true)
                )
                .addUserOption(useroption =>
                    useroption.setName("user").setDescription("Discord user to assign").setRequired(true)
                )
                .addStringOption(stringoption =>
                    stringoption.setName("team").setDescription("Team scope (omit for guild-wide)").setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("unassign")
                .setDescription("Unassign a Discord user from a permission group")
                .addStringOption(stringoption =>
                    stringoption.setName("group").setDescription("Name of the permission group").setRequired(true)
                )
                .addUserOption(useroption =>
                    useroption.setName("user").setDescription("Discord user to unassign").setRequired(true)
                )
                .addStringOption(stringoption =>
                    stringoption.setName("team").setDescription("Team scope (omit for guild-wide)").setRequired(false)
                )
        )
} as CommandType
