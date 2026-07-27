import { Schema, model, type Document } from "mongoose";

interface ModuleEntry {
    moduleId: string;
    enabled: boolean;
}

export interface BotSettingsDocument extends Document {
    modules: ModuleEntry[];
    isModuleEnabled(moduleId: string): boolean | undefined;
}

const BotSettingsSchema = new Schema<BotSettingsDocument>(
    {
        modules: [{ moduleId: String, enabled: Boolean }],
    },
    { collection: "botsettings" },
);

BotSettingsSchema.methods.isModuleEnabled = function (moduleId: string): boolean | undefined {
    const entry = (this.modules as ModuleEntry[]).find((m) => m.moduleId === moduleId);
    return entry?.enabled;
};

export const BotSettingsModel = model<BotSettingsDocument>("BotSettings", BotSettingsSchema);

export async function getBotSettings(): Promise<BotSettingsDocument> {
    let settings = await BotSettingsModel.findOne();
    if (!settings) settings = await BotSettingsModel.create({ modules: [] });
    return settings;
}
