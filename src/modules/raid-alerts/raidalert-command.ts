import { SlashCommandBuilder } from "discord.js";
import { GuildModel } from "../../models/Guild";
import type { ModuleDiscordCommand } from "../types";
import { hasDiscordPermission } from "../../permissions/discord";
import { getRadiusMeters, setRadiusMeters } from "./settings";

export const raidAlertCommand = {
    name: "raidalert",
    slashCommand: new SlashCommandBuilder()
        .setName("raidalert")
        .setDescription("Configure raid alert proximity")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("radius")
                .setDescription("Set how close an explosion must be to an online member to alert (meters)")
                .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true))
                .addIntegerOption((option) => option.setName("meters").setDescription("Radius in meters").setRequired(true)),
        ) as SlashCommandBuilder,
    command: async (interaction) => {
        if (!interaction.guild) return;
        const guild = await GuildModel.findOne({ guildId: interaction.guild.id });
        if (!guild) return await interaction.reply({ content: "Can't find your guild in database!", flags: ["Ephemeral"] });

        const teamName = interaction.options.getString("team", true);
        const team = await guild.findTeamByName(teamName);
        if (!team) return await interaction.reply({ content: "Can't find that team", flags: ["Ephemeral"] });
        // Team-scoped: authorize against this specific team (a guild-wide grant also satisfies it).
        if (!(await hasDiscordPermission(interaction, "raidalerts.manage", team._id))) {
            return await interaction.reply({ content: "Not authorized", flags: ["Ephemeral"] });
        }
        await interaction.deferReply({ flags: ["Ephemeral"] });

        const meters = interaction.options.getInteger("meters", true);
        if (meters <= 0) return await interaction.editReply({ content: "Radius must be positive" });
        const previous = getRadiusMeters(team);
        await setRadiusMeters(team, meters);
        return await interaction.editReply({ content: `Raid alert radius set to ${meters}m (was ${previous}m)` });
    },
} as ModuleDiscordCommand;
