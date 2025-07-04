import { Fuse } from "../../../../../../lib.js";
import { chat_metadata } from "../../../../../../script.js";
import { saveMetadataDebounced } from "../../../../../extensions.js";
import { t } from "../../../../../i18n.js";
import { SlashCommand } from "../../../../../slash-commands/SlashCommand.js";
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from "../../../../../slash-commands/SlashCommandArgument.js";
import { SlashCommandClosure } from "../../../../../slash-commands/SlashCommandClosure.js";
import { commonEnumProviders, enumIcons } from "../../../../../slash-commands/SlashCommandCommonEnumsProvider.js";
import { enumTypes, SlashCommandEnumValue } from "../../../../../slash-commands/SlashCommandEnumValue.js";
import { SlashCommandExecutor } from "../../../../../slash-commands/SlashCommandExecutor.js";
import { SlashCommandParser } from "../../../../../slash-commands/SlashCommandParser.js";
import { fetchStatus, getParticipant, log } from "../../index.js";
import { addCharAltValue, addCharEntry, entryTemplate, fillMissingMetadata, getCharAltValue, getCharEntry, getCharStatus, updateCharAltValue, updateCharEntry } from "./statusControls.js";

/** Takes an object with a key and value and generates a comment
    @param {object} entry
*/
function buildUIDsComment(entry) {
    let comment = "";

    if (entry?.key !== undefined) comment += entry.key;
    if (comment.length > 0 && entry?.value) comment += " - ";
    if (entry?.value) comment += entry.value.slice(0, 20).trim();
    if (entry?.value?.length > 20) comment += "...";

    return comment;
}

/** Gets an active chat participant by its name
    @param {String} name - Character name
*/
function getParticipantFromName(name = "") {
    const metadata = chat_metadata.stat_us_maximus ?? [];
    const chars = metadata.map(status => getParticipant(status.avatar, status.is_user));
    const character = chars.find(char => char.name === name) ?? false;

    return character;
}

/** Accepted key values and their descriptions */
const acceptedEntryFields = {
    enabled: "Determines if the entry gets added to the prompt",
    key: "Title of the entry",
    value: "Value of the entry",
    separator: "Separator between the key and value",
    value_uid: "Unique identifier of the selected alt value (select menu of the entry - starts at 0)",
    display_position: "Order at which the entry gets inserted (starts at 0)"
}

/** Enum providers for slash commands autocomplete */
const customEnumProviders = {
    /** All possible char entities within the chat status metadata.
        @returns {SlashCommandEnumValue[]}
    */
    participantsName: () => {
        const metadata = chat_metadata.stat_us_maximus ?? [];
        const chars = metadata.map(status => getParticipant(status.avatar, status.is_user));
        const chars_filtered = chars.filter(char => !!char);

        return chars_filtered.map(char => new SlashCommandEnumValue(char.name, char.avatar, enumTypes.name, enumIcons.character));
    },

    /** All possible char entities within the chat status metadata.
        @returns {SlashCommandEnumValue[]}
    */
    entryFields: () => Object
        .keys(entryTemplate)
        .filter(key => Object.keys(acceptedEntryFields).includes(key))
        .map(key => new SlashCommandEnumValue(key, acceptedEntryFields[key] ?? null, enumTypes.enum, enumIcons.enum)),

    /** All entry UIDs within a character's status.
        @returns {SlashCommandEnumValue[]}
    */
    entryUIDs:  (/** @type {SlashCommandExecutor} */ executor) => {
        const name = executor.namedArgumentList.find(it => it.name == 'char')?.value ?? "";

        if (name instanceof SlashCommandClosure) return [];
        if (!name) return [];

        const character = getParticipantFromName(name);
        const status = getCharStatus(character);

        if (!status) return [];

        const entries = status.entries;

        if (entries.length < 1) return [];

        return entries.map(entry => new SlashCommandEnumValue(String(entry.uid), buildUIDsComment(entry), enumTypes.number, enumIcons.key));
    },

    /** All entry UIDs within a character's status.
        @returns {SlashCommandEnumValue[]}
    */
    altEntryUIDs:  (/** @type {SlashCommandExecutor} */ executor) => {
        const name = executor.namedArgumentList.find(it => it.name == 'char')?.value ?? "";
        const entry_uid = executor.namedArgumentList.find(it => it.name == 'uid')?.value ?? "";

        if (name instanceof SlashCommandClosure) return [];
        if (entry_uid instanceof SlashCommandClosure) return [];
        if (!name || !entry_uid) return [];

        const character = getParticipantFromName(String(name));

        if (!character) return [];

        const entry = getCharEntry(character, Number(entry_uid));

        if (!entry || !entry?.alt_values?.length) return [];

        return entry.alt_values.map(alt => new SlashCommandEnumValue(String(alt.uid), buildUIDsComment(alt), enumTypes.number, enumIcons.key));
    },
}

/** Creates a new entry for a character
    @param {object} args
    @param {String} args.char - Character name
    @returns {Promise<String>} UID of the new entry or empty string
*/
async function commandCreateEntry(args, value) {
    try {
        const name = args.char;
        const character = getParticipantFromName(name);

        if (!character) throw new Error(`The character "${args?.char}" could not be found in the metadata`);

        const entry = addCharEntry(character);

        if (!entry) return "";

        return String(entry.uid);
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);

        return "";
    }
}

/** Gets an entry uid by searching for a value trough its fields
    @param {object} args
    @param {String} args.char - Character name
    @param {String} args.field - Field to search
    @param {String} args.fuzzy - Wether to do a fuzzy match or exact math
    @param {String | SlashCommandClosure | (String | SlashCommandClosure)[]} value - Value to match against field
    @returns {Promise<String>} UID of the entry or empty string
*/
async function commandGetEntryUID(args, value = "") {
    try {
        const {char = "", field = "key", fuzzy = "false"} = args;

        const character = getParticipantFromName(char);
        const status = getCharStatus(character);

        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);

        let uid = "";

        if (fuzzy === "true") {
            const fuse = new Fuse(status.entries, {
                keys: [{ name: field, weight: 1 }],
                includeScore: true,
                threshold: 0.3,
            });
            const results = fuse.search(String(value));

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

/** Updates the value of an entry field
    @param {object} args
    @param {String} args.char - Character name
    @param {String} args.uid - Entry UID
    @param {String} args.field - Field to search
    @param {String | SlashCommandClosure | (String | SlashCommandClosure)[]} value - New value of the selected field
    @returns {String} Empty string
*/
function commandSetEntryField(args, value = "") {
    try {
        const {char = "", uid = "-1", field = "key"} = args;

        const parsed_uid = Number(uid);
        const character = getParticipantFromName(char);
        const acceptedFields = Object.keys(entryTemplate).filter(key => key !== "alt_values");

        if (!acceptedFields.some(key => key === field)) throw new Error(`Invalid field "${field}"`);
        if (!character) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(parsed_uid) || parsed_uid < 0) throw new Error(`Invalid UID "${uid}"`);

        const formData = new FormData();
        formData.set(field, String(value));

        updateCharEntry(character, parsed_uid, formData);
        fetchStatus({forceUIUpdate: true});
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
    } finally {
        return "";
    }
}

/** Gets the value of an entry field
    @param {object} args
    @param {String} args.char - Character name
    @param {String} args.uid - Entry UID
    @param {String} args.field - Field to search
    @returns {String} Value of the field or empty string
*/
function commandGetEntryField(args, value) {
    try {
        const {char = "", uid = "-1", field = "key"} = args;

        const parsed_uid = Number(uid);
        const character = getParticipantFromName(char);
        const acceptedFields = Object.keys(acceptedEntryFields);

        if (!acceptedFields.includes(field)) throw new Error(`Invalid field "${field}"`);
        if (!character) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(parsed_uid) || parsed_uid < 0) throw new Error(`Invalid UID "${uid}"`);

        const entry = getCharEntry(character, parsed_uid);

        if (!entry) return "";

        return String(entry[field] ?? "");
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);

        return "";
    }
}

/** Switches the value of an entry by one of its alt values
    @param {object} args
    @param {String} args.char - Character name
    @param {String} args.uid - Entry UID
    @param {String} args.altuid - UID of the entry alt value
    @returns {String} Empty string
*/
function commandSwitchEntryValue(args, value) {
    try {
        const {char = "", uid = "-1", altuid = "-1"} = args;

        const parsed_uid = Number(uid);
        const parsed_altuid = Number(altuid);
        const character = getParticipantFromName(char);

        if (!character) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(parsed_uid) || parsed_uid < 0) throw new Error(`Invalid UID "${uid}"`);
        if (isNaN(parsed_altuid) || parsed_altuid < 0) throw new Error(`Invalid alt UID "${altuid}"`);

        const alt = getCharAltValue(character, parsed_uid, parsed_altuid);

        if (!alt) return "";

        const formData = new FormData();
        formData.set("value", alt.value);
        formData.set("value_uid", alt.uid);

        updateCharEntry(character, parsed_uid, formData);
        fetchStatus({forceUIUpdate: true});

        return "";
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);

        return "";
    }
}

/** Creates a new entry for a character
    @param {object} args
    @param {String} args.char - Character name
    @param {String} args.uid - Entry UID
    @param {String} args.key - Title of the alt value
    @param {String | SlashCommandClosure | (String | SlashCommandClosure)[]} value - New value of the selected field
    @returns {String} UID of the new alt value or empty string
*/
function commandCreateEntryAltValue(args, value = "") {
    try {
        const {char = "", uid = "-1", key = ""} = args;

        const parsed_uid = Number(uid);
        const character = getParticipantFromName(char);

        if (!character) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(parsed_uid) || parsed_uid < 0) throw new Error(`Invalid UID "${uid}"`);

        const alt = addCharAltValue(character, parsed_uid, String(value));

        if (!alt) return "";
        if (Boolean(key)) {
            const formData = new FormData();
            formData.set("key", key);

            updateCharAltValue(character, parsed_uid, alt.uid, formData);
        }

        fetchStatus({forceUIUpdate: true});

        return String(alt.uid ?? "");
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);

        return "";
    }
}

/** Wipes all status metadata in the active chat file
    @returns {Promise<String>} True or False
*/
async function commandDeleteChatStatus() {
    try {
        delete SillyTavern.getContext().chatMetadata.stat_us_maximus;
        saveMetadataDebounced();
    } catch (error) {
        return "false";
    }

    return "true";
}

/** Register all slash commands into SillyTavern */
export function registerSlashCommands() {
    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-create-entry",
            callback: commandCreateEntry,
            returns: 'Status entry uid',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: customEnumProviders.participantsName
                })
            ],
            helpString: `
            <div>
                Creates an entry in the status of a character and returns its UID. If the character is not found in the metadata, it returns an empty string.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-create-entry char="Tom"</code></pre>
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
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: customEnumProviders.participantsName
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to match - default key',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: customEnumProviders.entryFields
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'fuzzy',
                    description: 'Do an exact match or a fuzzy match - exact (fuzzy:false) by default',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    enumProvider: commonEnumProviders.boolean()
                })
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'Value to match against field - case sensitive',
                    isRequired: true,
                    typeList: [ARGUMENT_TYPE.STRING]
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
                        <pre><code>/stum-get-entry-uid char="Tom" field="key" value="Clothes"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-set-entry-field",
            callback: commandSetEntryField,
            returns: 'Empty string',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: customEnumProviders.participantsName
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: customEnumProviders.entryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to update - default value',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: customEnumProviders.entryFields
                })
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'New value of the field - default to empty text',
                    isRequired: true,
                    typeList: [ARGUMENT_TYPE.STRING]
                })
            ],
            helpString: `
            <div>
                Set the value of the Status Entry field of a Character.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-set-entry-field char="Tom" field="value" uid=7 "- A red hoodie"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-get-entry-field",
            callback: commandGetEntryField,
            returns: 'Entry field value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: customEnumProviders.participantsName
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: customEnumProviders.entryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to update - default value',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: customEnumProviders.entryFields
                })
            ],
            helpString: `
            <div>
                Get the value of the Status Entry field of a Character. If no match is found, an empty string is returned.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-get-entry-field char="Tom" field="separator" uid=7</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-switch-entry-value",
            callback: commandSwitchEntryValue,
            returns: 'Empty String',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: customEnumProviders.participantsName
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: customEnumProviders.entryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'altuid',
                    description: 'UID of the status entry alternative value',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: customEnumProviders.altEntryUIDs
                })
            ],
            helpString: `
            <div>
                Switches the Status Entry value by one of the entry alt values.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-switch-entry-value char="Tom" uid=7 altuid=2</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-create-alt-entry-value",
            callback: commandCreateEntryAltValue,
            returns: 'UID of the alternative entry value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: customEnumProviders.participantsName
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: customEnumProviders.entryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'Title of the alt value',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false
                })
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'Content of the new alt value',
                    isRequired: false,
                    typeList: [ARGUMENT_TYPE.STRING]
                })
            ],
            helpString: `
            <div>
                Creates a new Status Entry alternative value and returns its UID. If it fails an empty string is returned.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-create-alt-entry-value char="Tom" uid=7 "Content of the entry"</code></pre>
                    </li>
                    <li>
                        <pre><code>/stum-create-alt-entry-value char="Tom" uid=7 key="Title of the entry" "Content of the entry"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-delete-chat-status",
            callback: async (args, value) => await commandDeleteChatStatus(),
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
            callback: async (args, value) => String(await fillMissingMetadata()),
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
