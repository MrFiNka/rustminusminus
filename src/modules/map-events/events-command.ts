import { SlashCommandBuilder } from "discord.js";
import { GuildModel } from "../../models/Guild";
import type { ModuleDiscordCommand } from "../types";
import { toGridReference } from "../../rustplus/gridReference";
import { EVENT_LABELS_BY_MARKER_TYPE as LABELS } from "../../rustplus/markerLabels";

export const eventsCommand = {
    name: "events",
    slashCommand: new SlashCommandBuilder()
        .setName("events")
        .setDescription("List currently active map events (cargo ship, patrol heli, chinook, crates)")
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

        const [markers, info] = await Promise.all([conn.getMapMarkers(), conn.getInfo()]);
        const active = markers.filter((m) => LABELS[m.type]);
        if (active.length === 0) return await interaction.editReply({ content: "No active map events." });
        const lines = active.map((m) => `${LABELS[m.type]} — ${toGridReference(m.x, m.y, info.mapSize)}`);
        return await interaction.editReply({ content: lines.join("\n") });
    },
} as ModuleDiscordCommand;
