import { SlashCommandBuilder } from "discord.js";
import { GuildModel } from "../../models/Guild";
import type { ModuleDiscordCommand } from "../types";
import { searchInStock } from "./search";
import { formatOrder } from "./format";

export const marketCommand = {
    name: "market",
    slashCommand: new SlashCommandBuilder()
        .setName("market")
        .setDescription("Search vending machines for an item")
        .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true))
        .addStringOption((option) => option.setName("item").setDescription("Item name to search for").setRequired(true)) as SlashCommandBuilder,
    command: async (interaction) => {
        if (!interaction.guild) return;
        const guild = await GuildModel.findOne({ guildId: interaction.guild.id });
        if (!guild) return await interaction.reply({ content: "Can't find your guild in database!", flags: ["Ephemeral"] });

        const teamName = interaction.options.getString("team", true);
        const item = interaction.options.getString("item", true);
        await interaction.deferReply({ flags: ["Ephemeral"] });
        const team = await guild.findTeamByName(teamName);
        if (!team) return await interaction.editReply({ content: "Can't find that team" });

        const conn = team.getActiveRustPlus();
        if (!conn?.isConnected()) return await interaction.editReply({ content: "This team isn't currently connected" });

        const results = await searchInStock(conn, item);
        if (results.length === 0) return await interaction.editReply({ content: `No vending machines selling "${item}"` });
        return await interaction.editReply({ content: results.slice(0, 15).map(formatOrder).join("\n") });
    },
} as ModuleDiscordCommand;
