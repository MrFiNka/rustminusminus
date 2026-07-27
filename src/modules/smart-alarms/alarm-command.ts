import { SlashCommandBuilder } from "discord.js";
import { GuildModel } from "../../models/Guild";
import type { ModuleDiscordCommand } from "../types";
import { hasDiscordPermission } from "../../permissions/discord";
import { displayName, findPairedItem, setPairedItemName } from "../../rustplus/pairedItems";

export const alarmCommand = {
    name: "alarm",
    slashCommand: new SlashCommandBuilder()
        .setName("alarm")
        .setDescription("Manage paired smart alarms")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("List a team's paired smart alarms")
                .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true)),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("rename")
                .setDescription("Rename a paired smart alarm")
                .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true))
                .addStringOption((option) => option.setName("alarm").setDescription("Alarm name or id").setRequired(true))
                .addStringOption((option) => option.setName("name").setDescription("New name").setRequired(true)),
        ) as SlashCommandBuilder,
    command: async (interaction) => {
        if (!interaction.guild) return;
        const guild = await GuildModel.findOne({ guildId: interaction.guild.id });
        if (!guild) return await interaction.reply({ content: "Can't find your guild in database!", flags: ["Ephemeral"] });

        const teamName = interaction.options.getString("team", true);
        const team = await guild.findTeamByName(teamName);
        if (!team) return await interaction.reply({ content: "Can't find that team", flags: ["Ephemeral"] });
        // Team-scoped: authorize against this specific team (a guild-wide grant also satisfies it).
        if (!(await hasDiscordPermission(interaction, "alarms.manage", team._id))) {
            return await interaction.reply({ content: "Not authorized", flags: ["Ephemeral"] });
        }
        await interaction.deferReply({ flags: ["Ephemeral"] });
        const server = team.servers.find((s) => s.serverId === team.activeServerId);
        if (!server) return await interaction.editReply({ content: "This team has no active server" });

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "list") {
            if (server.pairedItems.smartAlarm.length === 0) return await interaction.editReply({ content: "No paired smart alarms." });
            const lines = server.pairedItems.smartAlarm.map(
                (a) => `- ${displayName(a, "smartAlarm")} (${a.id})${a.lastTriggered ? ` — last triggered ${a.lastTriggered.toISOString()}` : ""}`,
            );
            return await interaction.editReply({ content: lines.join("\n") });
        }

        // "rename"
        const idOrName = interaction.options.getString("alarm", true);
        const newName = interaction.options.getString("name", true);
        const item = findPairedItem(server, "smartAlarm", idOrName);
        if (!item) return await interaction.editReply({ content: "Can't find that alarm" });
        await setPairedItemName(team, server.serverId, "smartAlarm", item.id, newName);
        return await interaction.editReply({ content: `Renamed to "${newName}"` });
    },
} as ModuleDiscordCommand;
