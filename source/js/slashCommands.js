import { saveMetadataDebounced } from "../../../../../extensions.js";
import { SlashCommand } from "../../../../../slash-commands/SlashCommand.js";
import { ARGUMENT_TYPE, SlashCommandArgument } from "../../../../../slash-commands/SlashCommandArgument.js";
import { commonEnumProviders } from "../../../../../slash-commands/SlashCommandCommonEnumsProvider.js";
import { SlashCommandParser } from "../../../../../slash-commands/SlashCommandParser.js";
import { fillMissingMetadata } from "./statusControls.js";

function commandDeleteChatStatus() {
    try {
        delete SillyTavern.getContext().chatMetadata.stat_us_maximus;
        saveMetadataDebounced();
    } catch (error) {
        return "false";
    }

    return "true";
}

export function registerSlashCommands() {
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stumDeleteChatStatus",
            callback: async (args, value) => {
                return commandDeleteChatStatus();
            },
            helpString: `
            <div>
                Wipes all character status in the chat, has no confirm screen and can not be undone.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/stumDeleteChatStatus</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stumFillMissingMetadata",
            callback: async (args, value) => {
                return fillMissingMetadata();
            },
            helpString: `
            <div>
                Fills the metadata in case an update adds more values or properties - should not be used normally.
            </div>
            <div>
                <strong>Example:</strong>
                <ul>
                    <li>
                        <pre><code>/stumFillMissingMetadata</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );
}
