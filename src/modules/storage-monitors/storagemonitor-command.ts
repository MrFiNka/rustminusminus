import { SlashCommandBuilder } from "discord.js";
import { GuildModel } from "../../models/Guild";
import type { ModuleDiscordCommand } from "../types";
import { hasDiscordPermission } from "../../permissions/discord";
import { displayName, findPairedItem, setPairedItemName } from "../../rustplus/pairedItems";
import { readStorageEntity } from "../../rustplus/storageMonitors";

export const storageMonitorCommand = {
    name: "storagemonitor",
    slashCommand: new SlashCommandBuilder()
        .setName("storagemonitor")
        .setDescription("View and manage paired storage monitors")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("List a team's paired storage monitors")
                .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true)),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("view")
                .setDescription("Show a storage monitor's live contents")
                .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true))
                .addStringOption((option) => option.setName("monitor").setDescription("Monitor name or id").setRequired(true)),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("rename")
                .setDescription("Rename a paired storage monitor")
                .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true))
                .addStringOption((option) => option.setName("monitor").setDescription("Monitor name or id").setRequired(true))
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
        if (!(await hasDiscordPermission(interaction, "storagemonitors.manage", team._id))) {
            return await interaction.reply({ content: "Not authorized", flags: ["Ephemeral"] });
        }
        await interaction.deferReply({ flags: ["Ephemeral"] });
        const server = team.servers.find((s) => s.serverId === team.activeServerId);
        if (!server) return await interaction.editReply({ content: "This team has no active server" });

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "list") {
            if (server.pairedItems.storageMonitor.length === 0) return await interaction.editReply({ content: "No paired storage monitors." });
            const lines = server.pairedItems.storageMonitor.map((s) => `- ${displayName(s, "storageMonitor")} (${s.id})`);
            return await interaction.editReply({ content: lines.join("\n") });
        }

        if (subcommand === "rename") {
            const idOrName = interaction.options.getString("monitor", true);
            const newName = interaction.options.getString("name", true);
            const item = findPairedItem(server, "storageMonitor", idOrName);
            if (!item) return await interaction.editReply({ content: "Can't find that storage monitor" });
            await setPairedItemName(team, server.serverId, "storageMonitor", item.id, newName);
            return await interaction.editReply({ content: `Renamed to "${newName}"` });
        }

        // "view"
        const idOrName = interaction.options.getString("monitor", true);
        const item = findPairedItem(server, "storageMonitor", idOrName);
        if (!item) return await interaction.editReply({ content: "Can't find that storage monitor" });
        const conn = team.getActiveRustPlus();
        if (!conn?.isConnected()) return await interaction.editReply({ content: "This team isn't currently connected" });
        const entity = await readStorageEntity(conn, item);
        if (entity.kind === "cupboard") {
            return await interaction.editReply({
                content: entity.hasProtection
                    ? `${entity.name}: protected${entity.protectionExpiry ? `, expires <t:${entity.protectionExpiry}:R>` : ""}`
                    : `${entity.name}: not protected`,
            });
        }
        const lines = entity.items.map((i) => `${i.quantity}x ${i.name}${i.isBlueprint ? " (blueprint)" : ""}`);
        return await interaction.editReply({ content: `**${entity.name}** (${entity.capacity} slots):\n${lines.join("\n") || "empty"}` });
    },
} as ModuleDiscordCommand;
