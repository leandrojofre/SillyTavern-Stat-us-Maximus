import { Fuse } from "../../../../../../lib.js";
import { chat_metadata } from "../../../../../../script.js";
import { saveMetadataDebounced } from "../../../../../extensions.js";
import { t } from "../../../../../i18n.js";
import { SlashCommand } from "../../../../../slash-commands/SlashCommand.js";
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from "../../../../../slash-commands/SlashCommandArgument.js";
import { SlashCommandClosure } from "../../../../../slash-commands/SlashCommandClosure.js";
import { commonEnumProviders, enumIcons } from "../../../../../slash-commands/SlashCommandCommonEnumsProvider.js";
import { enumTypes, SlashCommandEnumValue } from "../../../../../slash-commands/SlashCommandEnumValue.js";
import { SlashCommandParser } from "../../../../../slash-commands/SlashCommandParser.js";
import { getParticipant, log } from "../../index.js";
import { addCharEntry, entryTemplate, fillMissingMetadata, getCharEntry } from "./statusControls.js";

const customEnumProviders = {
    /** All possible char entities within the chat status metadata.
        @returns {SlashCommandEnumValue[]}
    */
    participants: () => {
        const metadata = chat_metadata.stat_us_maximus ?? [];
        const chars = metadata.map(status => getParticipant(status.avatar, status.is_user));
        const chars_filtered = chars.filter(char => !!char);

        return chars_filtered.map(char => new SlashCommandEnumValue(char.avatar, char.name, enumTypes.name, enumIcons.character));
    },

    /** All possible char entities within the chat status metadata.
        @returns {SlashCommandEnumValue[]}
    */
    entryFields: () => Object
        .keys(entryTemplate)
        .filter(key => key !== "alt_values")
        .map(key => new SlashCommandEnumValue(key, null, enumTypes.enum, enumIcons.enum))
}

function getParticipantFromAvatar(avatar = "") {
    const metadata = chat_metadata.stat_us_maximus ?? [];
    const status = metadata.find(status => status.avatar === avatar) ?? {};
    const character = getParticipant(status?.avatar, status?.is_user);

    return character;
}

/**

    @param {object} args
    @param {string | SlashCommandClosure | (string | SlashCommandClosure)[]} value
 */
async function commandCreateEntry(args, value) {
    try {
        const avatar = args.char;
        const character = getParticipantFromAvatar(avatar);

        if (!character) throw new Error(`The character -${args?.char}- could not be found in the metadata`);

        const entry = addCharEntry(character);

        if (!entry) return "false";

        return String(entry.uid);
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);

        return "false";
    }
}

async function commandGetEntryUID(args, value) {
    try {
        const {char = "", field = "key", value = "", fuzzy = false} = args;

        const metadata = chat_metadata.stat_us_maximus ?? [];
        const status = metadata.find(status => status.avatar === char);

        log(char, field, value, fuzzy);
        log(metadata, status);

        if (!status) return "";

        let uid = "";

        if (String(fuzzy) === "true") {
            const fuse = new Fuse(status.entries, {
                keys: [{ name: field, weight: 1 }],
                includeScore: true,
                threshold: 0.3,
            });
            const results = fuse.search(value);

            if (!results || results.length === 0) return "";

            uid = results[0]?.item?.uid;
        } else {
            const entry = status?.entries?.find(entry => String(entry[field]) === value);
            uid = entry?.uid;
        }

        return String(uid ?? "");
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to fetch Status Metadata: ${error.message}`);

        return "";
    }
}

async function commandDeleteChatStatus() {
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
            name: "stum-create-entry",
            callback: commandCreateEntry,
            returns: 'Status entry uid',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Avatar of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
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
            name: "stum-get-entry-uid",
            callback: commandGetEntryUID,
            returns: 'Status entry uid',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Avatar of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: customEnumProviders.participants,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to match - default key',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: customEnumProviders.entryFields,
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'fuzzy',
                    description: 'Do an exact match or a fuzzy match - exact by default',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    enumProvider: commonEnumProviders.boolean(),
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'value',
                    description: 'Value to match against field - case sensitive',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                })
            ],
            helpString: `
            <div>
                Get an entry uid by pairing a Character status field against a value, returning the uid of the first match. If no match is found, an empty string is returned.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-get-entry-uid char="Tom.png" field="key" value="Clothes"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-delete-chat-status",
            callback: commandDeleteChatStatus,
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
                return String(await fillMissingMetadata());
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
