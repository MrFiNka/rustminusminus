import type { SlashCommandBuilder, ChatInputCommandInteraction, CacheType } from "discord.js"

export type CommandType = {
    name?: string;
    slashCommand: SlashCommandBuilder;
    command: (interaction: ChatInputCommandInteraction<CacheType>) => void | Promise<void>;
}