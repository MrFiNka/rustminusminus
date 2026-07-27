import { SlashCommandBuilder } from "discord.js";
import { GuildModel } from "../../models/Guild";
import type { ModuleDiscordCommand } from "../types";
import { hasDiscordPermission } from "../../permissions/discord";
import { displayName, findPairedItem, setPairedItemName } from "../../rustplus/pairedItems";
import { invalidateServerSnapshot } from "../../rustplus/serverSnapshot";
import { getModuleSettingById } from "../moduleSettings";

export const switchCommand = {
    name: "switch",
    slashCommand: new SlashCommandBuilder()
        .setName("switch")
        .setDescription("Control paired smart switches")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("list")
                .setDescription("List a team's paired smart switches")
                .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true)),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("on")
                .setDescription("Turn a smart switch on")
                .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true))
                .addStringOption((option) => option.setName("switch").setDescription("Switch name or id").setRequired(true)),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("off")
                .setDescription("Turn a smart switch off")
                .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true))
                .addStringOption((option) => option.setName("switch").setDescription("Switch name or id").setRequired(true)),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("rename")
                .setDescription("Rename a paired smart switch")
                .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true))
                .addStringOption((option) => option.setName("switch").setDescription("Switch name or id").setRequired(true))
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
        if (!(await hasDiscordPermission(interaction, "switches.toggle", team._id))) {
            return await interaction.reply({ content: "Not authorized", flags: ["Ephemeral"] });
        }
        await interaction.deferReply({ flags: ["Ephemeral"] });
        const server = team.servers.find((s) => s.serverId === team.activeServerId);
        if (!server) return await interaction.editReply({ content: "This team has no active server" });

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "list") {
            if (server.pairedItems.smartSwitch.length === 0) return await interaction.editReply({ content: "No paired smart switches." });
            const lines = server.pairedItems.smartSwitch.map((s) => `- ${displayName(s, "smartSwitch")} (${s.id})`);
            return await interaction.editReply({ content: lines.join("\n") });
        }

        if (subcommand === "rename") {
            const idOrName = interaction.options.getString("switch", true);
            const newName = interaction.options.getString("name", true);
            const item = findPairedItem(server, "smartSwitch", idOrName);
            if (!item) return await interaction.editReply({ content: "Can't find that switch" });
            await setPairedItemName(team, server.serverId, "smartSwitch", item.id, newName);
            return await interaction.editReply({ content: `Renamed to "${newName}"` });
        }

        // "on" / "off"
        const idOrName = interaction.options.getString("switch", true);
        const item = findPairedItem(server, "smartSwitch", idOrName);
        if (!item) return await interaction.editReply({ content: "Can't find that switch" });
        const conn = team.getActiveRustPlus();
        if (!conn?.isConnected()) return await interaction.editReply({ content: "This team isn't currently connected" });
        await conn.setEntityValue(Number(item.id), subcommand === "on");
        invalidateServerSnapshot(team._id, server.serverId);
        // Optionally mirror the change into the in-game team chat so players see Discord-side toggles.
        if (getModuleSettingById<boolean>(team, "smart-switches", "notifyInGameWhenChangedFromDiscord")) {
            await conn.sendTeamMessage(`${displayName(item, "smartSwitch")} turned ${subcommand} from Discord`);
        }
        return await interaction.editReply({ content: `Turned ${displayName(item, "smartSwitch")} ${subcommand}` });
    },
} as ModuleDiscordCommand;
