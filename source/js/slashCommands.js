import {
    // ST imports
    t,
    // Normal imports
    characters,
    context,
    getUser,
    powerUserSettings
} from '../../index.js';

import {Status} from '../classes/Status';
import {StatusEntry} from '../classes/StatusEntry';

const {
    SlashCommandEnumValue
} = context();

/**
 * @typedef {import('../classes/Status.js').UserCharacter} UserCharacter
 */

// * MARK:Utility Methods

/** Takes an object with a key and value and generates a comment
 * @param {StatusEntry} entry
 * @returns {string}
 */
function buildUIDsComment(entry) {
    const value = entry.values[entry.value_uid].value;
    const title = entry.key;
    const placeSeparator = title.length > 0 && value.length > 0;
    const separator = placeSeparator ? ' - ' : '';
    const longValue = value.length > 20;
    const suffix = longValue ? '...' : '';

    return `${title}${separator}${value.slice(0, 20).trim()}${suffix}`;
}

/**
 * @param {string} charName
 * @returns {boolean}
 */
function characterHasMetadata(charName) {
    return StatUsMaximus.getStatuses().some(stat => {
        return stat.getCharacter().name === charName;
    });
}

/**
 * @param {string} charName
 * @param {boolean} isUser
 * @returns {Character|UserCharacter}
 */
function getParticipant(charName, isUser) {
    return isUser ?
        getUser(charName, 'name') :
        characters.find(char => char.name === charName);
}

/**
 * @param {string} charName
 * @param {boolean} isUser
 * @returns {Status|undefined}
 */
function getStatusFromName(charName, isUser) {
    return StatUsMaximus
        .getStatuses()
        .find(stat => stat.getCharacter().name === charName);
}

const ENUMS = {
    characters: function() {
        return characters.map(char => new SlashCommandEnumValue(char.name));
    },

    personas: function() {
        return Object.values(powerUserSettings.personas).map(name => new SlashCommandEnumValue(name));
    },

    entities: () => [
        ...ENUMS.personas(),
        ...ENUMS.characters()
    ],

    boolean: () => [
        new SlashCommandEnumValue('true'),
        new SlashCommandEnumValue('false')
    ],

    acceptedStatusFields: () => [
        new SlashCommandEnumValue('separator'),
        new SlashCommandEnumValue('def_entry_separator'),
        new SlashCommandEnumValue('prefix'),
        new SlashCommandEnumValue('suffix')
    ]
}

// * MARK: Command Methods

/** Creates status data for a character
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {string} args.isuser - Wether to search for personas or characters
 * @param {string} args.force - If multiple characters have the same name, it forces creation of data on ALL, despite if they were used or not in the chat
 * @returns {Promise<string>} True if succeeds, False otherwise
 */
async function commandCreateStatus(args) {
    try {
        const {char = '', isuser = 'false', force = 'false'} = args;

        const cleanForce = force === 'true';
        const cleanIsUser = isuser === 'trie';

        if (!cleanForce && characterHasMetadata(char)) return 'true';

        const character = getParticipant(char, cleanIsUser);

        if (!character) throw new Error(`The character '${args?.char}' could not be found`);

        const status = StatUsMaximus.addStatus(character.avatar);

        if (!status) return 'false';

        return 'true';
    } catch (error) {
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);

        return 'false';
    }
}

/** Updates the value of an entry field
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {string} args.field - Field to modify
 * @param {string} args.isuser - Wether to search for personas or characters
 * @param {string} value - New value of the selected field
 * @returns {string} Empty string
 */
function commandSetStatusField(args, value = '') {
    try {
        const {char = '', field = 'separator', isuser = 'false'} = args;

        const cleanIsUser = isuser === 'trie';
        const status = getStatusFromName(char, cleanIsUser);
        const acceptedFields = ENUMS
            .acceptedStatusFields()
            .map(key => key.toString());

        if (!acceptedFields.some(key => key === field)) throw new Error(`Invalid field "${field}"`);
        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);

        status.set(field, String(value));
    } catch (error) {
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
    } finally {
        return '';
    }
}

/** Deletes the status data a character
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {string} args.isuser - Wether to search for personas or characters
 * @returns {Promise<String>} True if succeeds, False otherwise
 */
async function commandDeleteStatus(args, value) {
    try {
        const {char = '', isuser = 'false'} = args;

        const cleanIsUser = isuser === 'true';
        const status = getStatusFromName(char, cleanIsUser);

        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);

        const success = StatUsMaximus.delStatus(status);

        if (!success) return 'false';

        StatUsMaximus.renderStatusesSafe();

        return 'true';
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);

        return 'false';
    }
}

/** Creates a new entry for a character
 * @param {object} args
 * @param {string} args.char - Character name
 * @returns {Promise<String>} UID of the new entry or empty string
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
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {string} args.field - Field to search
 * @param {string} args.fuzzy - Wether to do a fuzzy match or exact math
 * @param {String|SlashCommandClosure|String[]|SlashCommandClosure[]} value - Value to match against field
 * @returns {Promise<String>} UID of the entry or empty string
 */
async function commandGetEntryUID(args, value = "") {
    try {
        const {char = "", field = "key", fuzzy = "false"} = args;

        const character = getParticipantFromName(char);
        const status = getCharStatus(character);
        const acceptedFields = Object.keys(acceptedEntryFields);

        if (!acceptedFields.includes(field)) throw new Error(`Invalid field "${field}"`);
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
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {string} args.uid - Entry UID
 * @param {string} args.field - Field to modify
 * @param {String|SlashCommandClosure|String[]|SlashCommandClosure[]} value - New value of the selected field
 * @returns {String} Empty string
 */
function commandSetEntryField(args, value = "") {
    try {
        const {char = "", uid = "-1", field = "key"} = args;

        const parsed_uid = Number(uid);
        const character = getParticipantFromName(char);
        const acceptedFields = Object.keys(acceptedEntryFields);

        if (!acceptedFields.some(key => key === field)) throw new Error(`Invalid field "${field}"`);
        if (!character) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(parsed_uid) || parsed_uid < 0) throw new Error(`Invalid UID "${uid}"`);

        const formData = new FormData();
        formData.set(field, String(value));

        updateCharEntry(character, parsed_uid, formData);
        fetchStatusDebounced({forceUIUpdate: true});
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
    } finally {
        return "";
    }
}

/** Gets the value of an entry field
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {string} args.uid - Entry UID
 * @param {string} args.field - Field to search
 * @returns {String} Value of the field or empty string
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

/** Deletes an status entry from a character
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {string} args.uid - Entry UID
 * @returns {String} True if succeeds, False otherwise
 */
function commandDeleteEntry(args, value) {
    try {
        const {char = "", uid = "-1"} = args;

        const parsed_uid = Number(uid);
        const character = getParticipantFromName(char);

        if (!character) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(parsed_uid) || parsed_uid < 0) throw new Error(`Invalid UID "${uid}"`);

        const deletionSucceed = removeCharEntry(character, parsed_uid);

        if (deletionSucceed) fetchStatusDebounced({forceUIUpdate: true});

        return String(deletionSucceed ?? false);
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);

        return "false";
    }
}

/** Switches the value of an entry by one of its alt values
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {string} args.uid - Entry UID
 * @param {string} args.altuid - UID of the entry alt value
 * @returns {String} Empty string
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

        updateCharEntry(character, parsed_uid, formData, false);
        fetchStatusDebounced({forceUIUpdate: true});

        return "";
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);

        return "";
    }
}

/** Creates a new entry for a character
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {string} args.uid - Entry UID
 * @param {string} args.key - Title of the alt value
 * @param {String|SlashCommandClosure|String[]|SlashCommandClosure[]} value - New value of the selected field
 * @returns {String} UID of the new alt value or empty string
 */
function commandCreateEntryAltValue(args, value = "") {
    try {
        const {char = "", uid = "-1", key = ""} = args;

        const parsed_uid = Number(uid);
        const character = getParticipantFromName(char);

        if (!character) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(parsed_uid) || parsed_uid < 0) throw new Error(`Invalid UID "${uid}"`);

        const alt = addCharAltValue(character, parsed_uid, {value: String(value), key: String(key)});

        if (!alt) return "";

        fetchStatusDebounced({forceUIUpdate: true});

        return String(alt.uid ?? "");
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);

        return "";
    }
}

/** Gets the UID of an entry alt value by searching for a match trough its fields
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {string} args.uid - Entry UID
 * @param {string} args.field - Field to search
 * @param {string} args.fuzzy - Wether to do a fuzzy match or exact math
 * @param {String|SlashCommandClosure|String[]|SlashCommandClosure[]} value - Value to match against field
 * @returns {String} UID of the entry or empty string
 */
function commandGetAltEntryUID(args, value = "") {
    try {
        const {char = "", uid = "-1", field = "key", fuzzy = "false"} = args;

        const character = getParticipantFromName(char);
        const parsed_uid = Number(uid);
        const acceptedFields = Object.keys(acceptedAltEntryFields);

        if (!character) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(parsed_uid) || parsed_uid < 0) throw new Error(`Invalid UID "${uid}"`);
        if (!acceptedFields.some(key => key === field)) throw new Error(`Invalid alt field "${field}"`);

        let alt_uid = "";
        const entry = getCharEntry(character, parsed_uid);

        if (!entry) return "";

        if (fuzzy === "true") {
            const fuse = new Fuse(entry.alt_values, {
                keys: [{ name: field, weight: 1 }],
                includeScore: true,
                threshold: 0.3,
            });
            const results = fuse.search(String(value));

            if (!results || results.length === 0) return "";

            alt_uid = results[0]?.item?.uid;
        } else {
            const altEntry = entry?.alt_values?.find(entry => String(entry[field]) === value);
            alt_uid = altEntry?.uid;
        }

        return String(alt_uid ?? "");
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to fetch Status Metadata: ${error.message}`);

        return "";
    }
}

/** Updates the selected field of the entry alt value
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {string} args.uid - Entry UID
 * @param {string} args.altuid - UID of the entry alt value
 * @param {string} args.field - Field to modify
 * @param {String|SlashCommandClosure|String[]|SlashCommandClosure[]} value - New value of the selected field
 * @returns {String} Empty string
 */
function commandSetAltEntryField(args, value = "") {
    try {
        const {char = "", uid = "-1", altuid = "-1", field = "key"} = args;

        const parsed_uid = Number(uid);
        const parsed_altuid = Number(altuid);
        const character = getParticipantFromName(char);
        const acceptedFields = Object.keys(acceptedAltEntryFields);

        if (!character) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(parsed_uid) || parsed_uid < 0) throw new Error(`Invalid UID "${uid}"`);
        if (isNaN(parsed_altuid) || parsed_altuid < 0) throw new Error(`Invalid alt UID "${altuid}"`);
        if (!acceptedFields.some(key => key === field)) throw new Error(`Invalid alt field "${field}"`);


        const formData = new FormData();
        formData.set(field, String(value));

        updateCharAltValue(character, parsed_uid, parsed_altuid, formData);
        fetchStatusDebounced({forceUIUpdate: true});
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
    } finally {
        return "";
    }
}

/** Gets the value of an alt entry field
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {string} args.uid - Entry UID
 * @param {string} args.altuid - UID of the entry alt value
 * @param {string} args.field - Field to search
 * @returns {String} Field value of the alt entry or empty string
 */
function commandGetAltEntryField(args, value) {
    try {
        const {char = "", uid = "-1", altuid = "-1", field = "key"} = args;

        const parsed_uid = Number(uid);
        const parsed_altuid = Number(altuid);
        const character = getParticipantFromName(char);
        const acceptedFields = Object.keys(acceptedEntryFields);

        if (!character) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(parsed_uid) || parsed_uid < 0) throw new Error(`Invalid UID "${uid}"`);
        if (isNaN(parsed_altuid) || parsed_altuid < 0) throw new Error(`Invalid alt UID "${altuid}"`);
        if (!acceptedFields.includes(field)) throw new Error(`Invalid field "${field}"`);

        const alt = getCharAltValue(character, parsed_uid, parsed_altuid);

        if (!alt) return "";

        return String(alt[field] ?? "");
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);

        return "";
    }
}

/** Deletes an alt value within a status entry
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {string} args.uid - Entry UID
 * @param {string} args.altuid - UID of the entry alt value
 * @returns {String} True if succeeds, False otherwise
 */
function commandDeleteAltEntry(args, value) {
    try {
        const {char = "", uid = "-1", altuid = "-1"} = args;

        const parsed_uid = Number(uid);
        const parsed_altuid = Number(altuid);
        const character = getParticipantFromName(char);

        if (!character) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(parsed_uid) || parsed_uid < 0) throw new Error(`Invalid UID "${uid}"`);
        if (isNaN(parsed_altuid) || parsed_altuid < 0) throw new Error(`Invalid alt UID "${altuid}"`);

        const deletionSucceed = removeCharAltValue(character, parsed_uid, parsed_altuid);

        if (deletionSucceed) fetchStatusDebounced({forceUIUpdate: true});

        return String(deletionSucceed ?? false);
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);

        return "false";
    }
}

/** Wipes all status metadata in the active chat file
 * @returns {Promise<String>} True or False
 */
async function commandDeleteChatStatus() {
    try {
        delete SillyTavern.getContext().chatMetadata.stat_us_maximus;
        setSaveStateFlag(true);
        SillyTavern.getContext().saveChat();
    } catch (error) {
        return "false";
    }

    return "true";
}

/**
 * MARK:Register Commands
 */
export function registerSlashCommands() {
    const {
        SlashCommandParser,
        SlashCommand,
        SlashCommandArgument,
        SlashCommandNamedArgument,
        ARGUMENT_TYPE
    } = context();

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'stum-create-status',
            callback: commandCreateStatus,
            returns: 'True or False',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - false by default',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    enumProvider: ENUMS.boolean
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'force',
                    description: 'If multiple characters or personas have the same name, it will create metadata for all - false by default',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    enumProvider: ENUMS.boolean
                })
            ],
            helpString: `
            <div>
                Creates status data for the selected character in the active chat and returns <code>true</code>. If the character already has data, this does nothing and returns <code>false</code>. <code>force</code> is not recommended to be used, as the metadata can grow too large depending on the amount of repeated names. Plus, if multiple characters have the same name, operations that include editing them though commands can become imprecise, as they only use character names as an argument; giving characters unique names is recommended.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-create-status char="Tom"</code></pre>
                    </li>
                    <li>
                        <pre><code>/stum-create-status char="Tom" isuser=true</code></pre>
                    </li>
                    <li>
                        <pre><code>/stum-create-status char="Tom" force=true</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-set-status-field",
            callback: commandSetStatusField,
            returns: 'Empty string',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to update - defaults to separator',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS.acceptedStatusFields
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - false by default',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    enumProvider: ENUMS.boolean
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
                Set the value of one of the core fields of you Character's status. If you use ST's macros as the field value, and you don't want the macro to be parsed, you'll need to escape them like this: <code>{\\{char}}</code>.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-set-status-field char="Tom" field="prefix" "{{name}}: "</code></pre>
                    </li>
                    <li>
                        <pre><code>/stum-set-status-field char="Tom" isuser=false "{\\{newline}}"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-delete-status",
            callback: commandDeleteStatus,
            returns: 'True or False',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - false by default',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    enumProvider: ENUMS.boolean
                })
            ],
            helpString: `
            <div>
                Deletes status data of the selected character in the active chat and returns <code>true</code>. If the deletion fails, this does nothing and returns <code>false</code>.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-delete-status char="Tom"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

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
                    enumProvider: customEnumProviders.participantNames
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
            returns: 'UID of the entry',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: customEnumProviders.participantNames
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
                    description: 'Do an exact match or a fuzzy match - exact by default (fuzzy:false)',
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
                        <pre><code>/stum-get-entry-uid char="Tom" field="key" "Clothes"</code></pre>
                    </li>
                    <li>
                        <pre><code>/stum-get-entry-uid char="Tom" field="key" fuzzy=true "Clothes"</code></pre>
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
                    enumProvider: customEnumProviders.participantNames
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
                    enumProvider: customEnumProviders.participantNames
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
                    description: 'Field to match - default key',
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
            name: "stum-delete-entry",
            callback: commandDeleteEntry,
            returns: 'True or False',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: customEnumProviders.participantNames
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: customEnumProviders.entryUIDs
                })
            ],
            helpString: `
            <div>
                Deletes an entry from the status of a character. Returns true if the deletion was a success, and false otherwise.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-delete-entry char="Tom" uid=5</code></pre>
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
                    enumProvider: customEnumProviders.participantNames
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
                    enumProvider: customEnumProviders.participantNames
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
            name: "stum-get-alt-entry-uid",
            callback: commandGetAltEntryUID,
            returns: 'UID of the alt entry',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: customEnumProviders.participantNames
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
                    description: 'Field to match - default key',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: customEnumProviders.altEntryFields
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'fuzzy',
                    description: 'Do an exact match or a fuzzy match - exact by default (fuzzy:false)',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    enumProvider: commonEnumProviders.boolean()
                })
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'Value to match against field - case sensitive if',
                    isRequired: true,
                    typeList: [ARGUMENT_TYPE.STRING]
                })
            ],
            helpString: `
            <div>
                Get the UID of an alt entry value by pairing a field against a value, returning the uid of the first match. If no match is found, an empty string is returned.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-get-alt-entry-uid char="Tom" field="key" "Summer Clothes"</code></pre>
                    </li>
                    <li>
                        <pre><code>/stum-get-alt-entry-uid char="Tom" field="key" fuzzy=true "Summer Clothes"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-set-alt-entry-field",
            callback: commandSetAltEntryField,
            returns: 'Empty string',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: customEnumProviders.participantNames
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
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to update - default value',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: customEnumProviders.altEntryFields
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
                Updates the field value of one of the Status Entry alt descriptions.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-set-alt-entry-field char="Tom" field="key" uid=7 altuid=2 "- A red hoodie"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-get-alt-entry-field",
            callback: commandGetAltEntryField,
            returns: 'Alt entry field value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: customEnumProviders.participantNames
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
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to match - default key',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: customEnumProviders.altEntryFields
                })
            ],
            helpString: `
            <div>
                Get the field value of one of the alt entry values. If no match is found, an empty string is returned.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-get-alt-entry-field char="Tom" field="value" uid=7 altuid=2</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: "stum-delete-alt-entry",
            callback: commandDeleteAltEntry,
            returns: 'True or False',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: customEnumProviders.participantNames
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
                Deletes an alt value within a status entry. Returns true if the deletion was a success, and false otherwise.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-delete-alt-entry char="Tom" uid=5 altuid=2</code></pre>
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
