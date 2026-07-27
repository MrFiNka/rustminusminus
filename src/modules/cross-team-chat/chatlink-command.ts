import { SlashCommandBuilder } from "discord.js";
import { GuildModel } from "../../models/Guild";
import { ChatLinkModel } from "../../models/ChatLink";
import type { ModuleDiscordCommand } from "../types";
import { hasDiscordPermission } from "../../permissions/discord";

export const chatLinkCommand = {
    name: "chatlink",
    slashCommand: new SlashCommandBuilder()
        .setName("chatlink")
        .setDescription("Manage cross-team chat links")
        .addSubcommand((subcommand) =>
            subcommand
                .setName("create")
                .setDescription("Create a new chat link group")
                .addStringOption((option) => option.setName("name").setDescription("Link group name").setRequired(true)),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("add")
                .setDescription("Add a team to a chat link group")
                .addStringOption((option) => option.setName("name").setDescription("Link group name").setRequired(true))
                .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true)),
        )
        .addSubcommand((subcommand) =>
            subcommand
                .setName("remove")
                .setDescription("Remove a team from its chat link group")
                .addStringOption((option) => option.setName("team").setDescription("Team name").setRequired(true)),
        )
        .addSubcommand((subcommand) => subcommand.setName("list").setDescription("List chat link groups")) as SlashCommandBuilder,
    command: async (interaction) => {
        if (!interaction.guild) return;
        if (!(await hasDiscordPermission(interaction, "chatlinks.manage"))) {
            return await interaction.reply({ content: "Not authorized", flags: ["Ephemeral"] });
        }
        const guild = await GuildModel.findOne({ guildId: interaction.guild.id });
        if (!guild) return await interaction.reply({ content: "Can't find your guild in database!", flags: ["Ephemeral"] });

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "create") {
            const name = interaction.options.getString("name", true);
            await interaction.deferReply({ flags: ["Ephemeral"] });
            const existing = await ChatLinkModel.findOne({ guildId: guild.guildId, name });
            if (existing) return await interaction.editReply({ content: "A chat link with that name already exists" });
            await ChatLinkModel.create({ guildId: guild.guildId, name, teamIds: [] });
            return await interaction.editReply({ content: `Chat link "${name}" created !` });
        }

        if (subcommand === "add") {
            const name = interaction.options.getString("name", true);
            const teamName = interaction.options.getString("team", true);
            await interaction.deferReply({ flags: ["Ephemeral"] });
            const link = await ChatLinkModel.findOne({ guildId: guild.guildId, name });
            if (!link) return await interaction.editReply({ content: "Can't find that chat link" });
            const team = await guild.findTeamByName(teamName);
            if (!team) return await interaction.editReply({ content: "Can't find that team" });
            const alreadyLinked = await ChatLinkModel.findOne({ guildId: guild.guildId, teamIds: team._id });
            if (alreadyLinked) return await interaction.editReply({ content: "That team is already in a chat link" });
            link.teamIds.push(team._id);
            await link.save();
            return await interaction.editReply({ content: `Added "${teamName}" to chat link "${name}" !` });
        }

        if (subcommand === "remove") {
            const teamName = interaction.options.getString("team", true);
            await interaction.deferReply({ flags: ["Ephemeral"] });
            const team = await guild.findTeamByName(teamName);
            if (!team) return await interaction.editReply({ content: "Can't find that team" });
            const link = await ChatLinkModel.findOne({ guildId: guild.guildId, teamIds: team._id });
            if (!link) return await interaction.editReply({ content: "That team is not in a chat link" });
            link.teamIds = link.teamIds.filter((id) => !id.equals(team._id));
            await link.save();
            return await interaction.editReply({ content: `Removed "${teamName}" from chat link "${link.name}" !` });
        }

        if (subcommand === "list") {
            await interaction.deferReply({ flags: ["Ephemeral"] });
            const links = await ChatLinkModel.find({ guildId: guild.guildId });
            if (links.length === 0) return await interaction.editReply({ content: "No chat links yet." });
            const teams = await guild.getTeams();
            const lines = links.map((link) => {
                const names = link.teamIds.map((id) => teams.find((t) => t._id.equals(id))?.name ?? "?").join(", ");
                return `**${link.name}**: ${names || "(empty)"}`;
            });
            return await interaction.editReply({ content: lines.join("\n") });
        }
    },
} as ModuleDiscordCommand;
