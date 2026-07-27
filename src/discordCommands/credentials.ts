import { SlashCommandBuilder } from "discord.js";
import type { CommandType } from "../types/DiscordCommandType";
import { UserModel } from "../models/User";
import { FmcListener } from "../classes/FmcListener";
import { getSteamName } from "../classes/SteamApi";

/** A SteamID64 is a 17-digit number. Cheap shape check before spending a Steam API call. */
const STEAM_ID_64 = /^\d{17}$/;

export default {
    command: async (interaction) => {
        const subcommand = interaction.options.getSubcommand();
        switch (subcommand) {
            case "add": {
                let user = await UserModel.findOne({ userId: interaction.user.id });
                if (user) return await interaction.reply({ content: "You are already linked!", flags: ["Ephemeral"] });
                let gcm_android_id = interaction.options.getString("gcm_android_id", true);
                let gcm_security_token = interaction.options.getString("gcm_security_token", true);
                let steam_id = interaction.options.getString("steam_id", true);
                let issued_date = interaction.options.getString("issued_date", true);
                let expire_date = interaction.options.getString("expire_date", true);

                await interaction.deferReply({ flags: ["Ephemeral"] });

                // steam_id is self-asserted here, and hasInGamePermission resolves in-game command
                // authority by looking users up on this exact field - so an unchecked value lets
                // someone claim another player's identity. Validate the shape, confirm Steam knows
                // the id, and refuse ids already claimed by a different Discord account.
                if (!STEAM_ID_64.test(steam_id)) {
                    return await interaction.editReply({ content: "That doesn't look like a SteamID64 (17 digits)." });
                }
                const claimed = await UserModel.findOne({ "credentials.steam_id": steam_id });
                if (claimed) {
                    return await interaction.editReply({ content: "That Steam account is already linked to another Discord user." });
                }
                if (!(await getSteamName(steam_id))) {
                    return await interaction.editReply({ content: "Steam doesn't recognize that ID (or the profile is private). Double-check it and try again." });
                }

                await UserModel.create({
                    userId: interaction.user.id,
                    credentials: {
                        gcm_android_id,
                        gcm_security_token,
                        steam_id,
                        issued_date,
                        expire_date
                    }
                });
                await FmcListener.userListen(interaction.user.id);
                await interaction.editReply({ content: "Your account is now linked!" });
                break;
            }

            case "delete":
                await UserModel.deleteOne({ userId: interaction.user.id });
                await FmcListener.userStopListen(interaction.user.id);
                await interaction.reply({ content: "Your account is now unlinked!", flags: ["Ephemeral"] });
                break;
        }
    },
    slashCommand: new SlashCommandBuilder()
        .addSubcommand(subcommand =>
            subcommand
                .setName("delete")
                .setDescription("no")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("add")
                .setDescription("no")
                .addStringOption(stringoption =>
                    stringoption
                        .setName("gcm_android_id")
                        .setDescription("gcm android id")
                        .setRequired(true)
                )
                .addStringOption(stringoption =>
                    stringoption
                        .setName("gcm_security_token")
                        .setDescription("gcm security token")
                        .setRequired(true)
                )
                .addStringOption(stringoption =>
                    stringoption
                        .setName("steam_id")
                        .setDescription("steam id")
                        .setRequired(true)
                )
                .addStringOption(stringoption =>
                    stringoption
                        .setName("issued_date")
                        .setDescription("issued date")
                        .setRequired(true)
                )
                .addStringOption(stringoption =>
                    stringoption
                        .setName("expire_date")
                        .setDescription("expire date")
                        .setRequired(true)
                )
        )
} as CommandType