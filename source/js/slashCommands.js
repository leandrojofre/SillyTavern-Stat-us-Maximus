import { chat_metadata } from "../../../../../../script.js";
import { saveMetadataDebounced } from "../../../../../extensions.js";
import { t } from "../../../../../i18n.js";
import { SlashCommand } from "../../../../../slash-commands/SlashCommand.js";
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from "../../../../../slash-commands/SlashCommandArgument.js";
import { SlashCommandClosure } from "../../../../../slash-commands/SlashCommandClosure.js";
import { commonEnumProviders, enumIcons } from "../../../../../slash-commands/SlashCommandCommonEnumsProvider.js";
import { enumTypes, SlashCommandEnumValue } from "../../../../../slash-commands/SlashCommandEnumValue.js";
import { SlashCommandParser } from "../../../../../slash-commands/SlashCommandParser.js";
import { getParticipant } from "../../index.js";
import { addCharEntry, fillMissingMetadata, getCharEntry } from "./statusControls.js";

const customEnumProviders = {
    /** All possible char entities within the chat status metadata.
        @returns {() => SlashCommandEnumValue[]}
    */
    participants: () => {
        const metadata = chat_metadata.stat_us_maximus ?? [];
        const chars = metadata.map(status => getParticipant(status.avatar, status.is_user));
        const chars_filtered = chars.filter(char => !!char);

        return chars_filtered.map(char => new SlashCommandEnumValue(char.avatar, char.name, enumTypes.name, enumIcons.character));
    }
}

/**

    @param {object} args
    @param {string | SlashCommandClosure | (string | SlashCommandClosure)[]} value
 */
function commandCreateEntry(args, value) {
    try {
        const metadata = chat_metadata.stat_us_maximus ?? [];
        const avatar = args.char;
        const status = metadata.find(status => status.avatar === avatar) ?? {};
        const character = getParticipant(status?.avatar, status?.is_user);

        if (!character) throw new Error(`The character -${args?.char}- could not be found in the metadata`);

        const entry = addCharEntry(character);

        if (!entry) return false;

        return entry.uid;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);

        return false;
    }
}

function commandDeleteChatStatus() {
    try {
        delete SillyTavern.getContext().chatMetadata.stat_us_maximus;
        saveMetadataDebounced();
    } catch (error) {
        return false;
    }

    return true;
}

export function registerSlashCommands() {
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-create-entry",
            callback: async (args, value) => {
                return String(commandCreateEntry(args, value));
            },
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Avatar of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    // @ts-ignore
                    enumProvider: customEnumProviders.participants,
                })
            ],
            helpString: `
            <div>
                Creates an entry in the status of a character and returns its UID. If the character is not found in the metadata, it returns false.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-create-entry char="Tom.png"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-delete-chat-status",
            callback: async (args, value) => {
                return String(commandDeleteChatStatus());
            },
            helpString: `
            <div>
                Wipes all character status in the chat, has no confirm screen and can not be undone.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-delete-chat-status</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-fill-missing-metadata",
            callback: async (args, value) => {
                return String(fillMissingMetadata());
            },
            helpString: `
            <div>
                Fills the metadata in case an update adds more values or properties - WARN This is a dev command used for bug fixing, only use it if instructed to do so by a developer.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-fill-missing-metadata</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );
}
