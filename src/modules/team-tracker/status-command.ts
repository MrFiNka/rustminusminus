import { SlashCommandBuilder } from "discord.js";
import { GuildModel } from "../../models/Guild";
import type { ModuleDiscordCommand } from "../types";

export const statusCommand = {
    name: "team-status",
    slashCommand: new SlashCommandBuilder()
        .setName("team-status")
        .setDescription("Show which team members are currently online, offline, or dead")
        .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true)) as SlashCommandBuilder,
    command: async (interaction) => {
        if (!interaction.guild) return;
        const guild = await GuildModel.findOne({ guildId: interaction.guild.id });
        if (!guild) return await interaction.reply({ content: "Can't find your guild in database!", flags: ["Ephemeral"] });

        const teamName = interaction.options.getString("team", true);
        await interaction.deferReply({ flags: ["Ephemeral"] });
        const team = await guild.findTeamByName(teamName);
        if (!team) return await interaction.editReply({ content: "Can't find that team" });

        const conn = team.getActiveRustPlus();
        if (!conn?.isConnected()) return await interaction.editReply({ content: "This team isn't currently connected" });

        const info = await conn.getTeamInfo();
        const online = info.members.filter((m) => m.isOnline && m.isAlive);
        const dead = info.members.filter((m) => !m.isAlive);
        const offline = info.members.filter((m) => !m.isOnline && m.isAlive);

        const lines = [
            `**Online (${online.length}):** ${online.map((m) => m.name).join(", ") || "none"}`,
            `**Offline (${offline.length}):** ${offline.map((m) => m.name).join(", ") || "none"}`,
            `**Dead (${dead.length}):** ${dead.map((m) => m.name).join(", ") || "none"}`,
        ];
        return await interaction.editReply({ content: lines.join("\n") });
    },
} as ModuleDiscordCommand;
