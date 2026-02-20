import {
    // ST imports
    t,
    // Normal imports
    characters,
    context,
    getUser,
    powerUserSettings,
    saveMetadataSafe,
    metadataName
} from '../../index.js';

import {Status} from '../classes/Status';
import {StatusEntry} from '../classes/StatusEntry';

const {
    SlashCommandEnumValue
} = context();

const {
    Fuse
} = SillyTavern.libs;

/**
 * @typedef {import('../classes/Status.js').UserCharacter} UserCharacter
 * @typedef {'true'|'false'|'all'} EntityFilter
 */

// * MARK:Utility Methods

/**
 * Takes an object with a key and value and generates a comment
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
 * Takes an object with a key and value and generates a comment
 * @param {{title: string; value: string;}} alt
 * @returns {string}
 */
function buildAltUIDsComment(alt) {
    const title = alt.title;
    const value = alt.value;
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
 * @param {EntityFilter} isUser
 * @returns {Character|UserCharacter}
 */
function getParticipant(charName, isUser) {
    if (isUser === 'all') {
        const user = getUser(charName, 'name');

        if (!user)
            return characters.find(char => char.name === charName);

        return user;
    }

    return isUser === 'true' ?
        getUser(charName, 'name') :
        characters.find(char => char.name === charName);
}

/**
 * @param {string} charName
 * @param {EntityFilter} isUser
 * @returns {Status|undefined}
 */
function getStatusFromName(charName, isUser) {
    const statuses = StatUsMaximus.getStatuses();

    if (isUser === 'all')
        return statuses.find(stat => stat.getCharacter().name === charName);

    const isUserFilter = isUser === 'true';

    return statuses
        .filter(stat => stat.is_user === isUserFilter)
        .find(stat => stat.getCharacter().name === charName);
}

const ENUMS_PROVIDER = {
    characters: function() {
        return characters.map(char => new SlashCommandEnumValue(char.name));
    },

    personas: function() {
        return Object.values(powerUserSettings.personas).map(name => new SlashCommandEnumValue(name));
    },

    entities: () => [
        ...ENUMS_PROVIDER.personas(),
        ...ENUMS_PROVIDER.characters()
    ],

    boolean: () => [
        new SlashCommandEnumValue('true'),
        new SlashCommandEnumValue('false')
    ],

    entityFilters: () => [
        new SlashCommandEnumValue('all'),
        new SlashCommandEnumValue('true'),
        new SlashCommandEnumValue('false')
    ],

    acceptedStatusFields: () => [
        new SlashCommandEnumValue('separator'),
        new SlashCommandEnumValue('def_entry_separator'),
        new SlashCommandEnumValue('prefix'),
        new SlashCommandEnumValue('suffix')
    ],

    acceptedEntryFields: () => [
        new SlashCommandEnumValue('enabled'),
        new SlashCommandEnumValue('key'),
        new SlashCommandEnumValue('separator'),
        new SlashCommandEnumValue('value', 'Value of the currently selected entry swipe'),
        new SlashCommandEnumValue('title', 'Title of the currently selected entry swipe on the selector')
    ],

    acceptedAltEntryFields: () => [
        new SlashCommandEnumValue('value'),
        new SlashCommandEnumValue('title')
    ],

    entryUIDs: (executor, scope) => {
        const charName = executor.namedArgumentList.find(it => it.name === 'char').value;
        const isUser = executor.namedArgumentList.find(it => it.name === 'isuser').value;

        if (!charName || typeof charName !== 'string') return [];
        if (!isUser || typeof isUser !== 'string') return [];

        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.find(en => en === isUser) ?? 'all';
        const status = getStatusFromName(charName.toString(), cleanIsUser);

        if (!status) return [];

        const entries = Object.entries(status.entries);

        if (entries.length < 1) return [];

        return entries
            .map(([uid, entry]) => new SlashCommandEnumValue(uid, buildUIDsComment(entry)));
    },

    altEntryUIDs: (executor, scope) => {
        const charName = executor.namedArgumentList.find(it => it.name === 'char').value;
        const entryUID = executor.namedArgumentList.find(it => it.name === 'uid').value;
        const isUser = executor.namedArgumentList.find(it => it.name === 'isuser').value;

        if (!charName || typeof charName !== 'string') return [];
        if (!entryUID || typeof entryUID !== 'string') return [];
        if (!isUser || typeof isUser !== 'string') return [];

        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.find(en => en === isUser) ?? 'all';
        const status = getStatusFromName(charName.toString(), cleanIsUser);

        if (!status) return [];

        /** @type {StatusEntry} */
        const entry = status.entries[entryUID];

        if (!entry) return [];

        const altValues = Object.entries(entry.values);

        return altValues
            .map(([uid, altValue]) => new SlashCommandEnumValue(uid, buildAltUIDsComment(altValue)));
    }
};

const ENUMS_STRINGS = {
    /** @type {EntityFilter[]} */
    entityFilters: [
        'all',
        'true',
        'false'
    ],

    acceptedStatusFields: ENUMS_PROVIDER
        .acceptedStatusFields()
        .map(key => key.toString()),

    acceptedEntryFields: ENUMS_PROVIDER
        .acceptedEntryFields()
        .map(key => key.toString()),

    acceptedAltEntryFields: ENUMS_PROVIDER
        .acceptedAltEntryFields()
        .map(key => key.toString())
}

// * MARK: Command Methods

/**
 * Creates status data for a character
 * @param {Object} args
 * @param {string} args.char - Character name
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @param {string} args.force - If multiple characters have the same name, it forces creation of data on ALL, despite if they were used or not in the chat
 * @returns {Promise<'true'|'false'>} True if succeeds, False otherwise
 */
async function commandCreateStatus(args) {
    try {
        const {char = '', isuser = 'all', force = 'false'} = args;

        const cleanForce = force === 'true';

        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';

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

/**
 * Updates the value of an entry field
 * @param {Object} args
 * @param {string} args.char - Character name
 * @param {string} args.field - Field to modify
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @param {string} value - New value of the selected field
 * @returns {Promise<string>} Empty string
 */
async function commandSetStatusField(args, value = '') {
    try {
        const {char = '', field = 'separator', isuser = 'all'} = args;

        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';

        const status = getStatusFromName(char, cleanIsUser);
        const acceptedFields = ENUMS_STRINGS.acceptedStatusFields;

        if (!acceptedFields.some(key => key === field)) throw new Error(`Invalid Status field "${field}"`);
        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);

        status.set(field, String(value));
    } catch (error) {
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
    } finally {
        return '';
    }
}

/**
 * Deletes the status data a character
 * @param {Object} args
 * @param {string} args.char - Character name
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @returns {Promise<'true'|'false'>} True if succeeds, False otherwise
 */
async function commandDeleteStatus(args, value) {
    try {
        const {char = '', isuser = 'all'} = args;

        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';

        const status = getStatusFromName(char, cleanIsUser);

        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);

        const success = StatUsMaximus.delStatus(status);

        if (!success) return 'false';

        StatUsMaximus.renderStatusesSafe();

        return 'true';
    } catch (error) {
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        return 'false';
    }
}

/**
 * Creates a new entry for a character
 * @param {Object} args
 * @param {string} args.char - Character name
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @returns {Promise<string>} UID of the new entry or empty string
 */
async function commandCreateEntry(args, value) {
    try {
        const {char = '', isuser = 'all'} = args;

        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';
        const status = getStatusFromName(char, cleanIsUser);

        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);

        const entryUid = status.addEntry();

        if (!entryUid && isNaN(entryUid)) return '';

        return String(entryUid);
    } catch (error) {
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        return '';
    }
}

/**
 * Gets an entry uid by searching for a value trough its fields
 * @param {Object} args
 * @param {string} args.char - Character name
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @param {string} args.field - Field to search
 * @param {string} args.fuzzy - Wether to do a fuzzy match or exact math
 * @param {string} value - Value to match against field
 * @returns {Promise<string>} UID of the entry or empty string
 */
async function commandGetEntryUID(args, value = '') {
    try {
        const {char = '', isuser = 'all', field = 'key', fuzzy = 'false'} = args;

        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';

        const status = getStatusFromName(char, cleanIsUser);
        const acceptedFields = ENUMS_STRINGS.acceptedEntryFields;

        if (!acceptedFields.includes(field)) throw new Error(`Invalid Status Entry field "${field}"`);
        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);

        let uid = '';

        /** @type {[string, StatusEntry][]} */
        const entries = Object.entries(status.entries);
        const search = entries
            .map(function([uid, entry]) {
                const value = entry.values[entry.value_uid].value;
                const title = entry.values[entry.value_uid].title;

                return structuredClone({...entry, uid, value, title});
            });

        if (fuzzy === 'true') {
            const fuse = new Fuse(search, {
                keys: [{ name: field, weight: 1 }],
                includeScore: true,
                threshold: 0.3,
            });

            const results = fuse.search(String(value));

            if (!results || results.length === 0) return '';

            uid = results[0]?.item?.uid;
        } else {
            const entry = search.find(entry => String(entry[field]) === value);
            uid = entry.uid;
        }

        return String(uid ?? '');
    } catch (error) {
        toastr.error(t`Failed to fetch Status Metadata: ${error.message}`);
        return '';
    }
}

/**
 * Updates the value of an entry field
 * @param {Object} args
 * @param {string} args.char - Character name
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @param {string} args.uid - Entry UID
 * @param {string} args.field - Field to modify
 * @param {string} value - New value of the selected field
 * @returns {Promise<string>} Empty string
 */
async function commandSetEntryField(args, value = '') {
    try {
        const {char = '', isuser = 'all', uid = '-1', field = 'key'} = args;

        const cleanUID = Number(uid);
        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';

        const status = getStatusFromName(char, cleanIsUser);
        const acceptedFields = ENUMS_STRINGS.acceptedEntryFields;

        if (!acceptedFields.some(key => key === field)) throw new Error(`Invalid field "${field}"`);
        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(cleanUID) || cleanUID < 0) throw new Error(`Invalid UID "${uid}"`);

        /** @type {StatusEntry} */
        const entry = status.entries[cleanUID];

        if (!entry) return '';

        entry.set(field, String(value), cleanUID);
        StatUsMaximus.renderStatusesSafe();
    } catch (error) {
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
    } finally {
        return '';
    }
}

/**
 * Gets the value of an entry field
 * @param {Object} args
 * @param {string} args.char - Character name
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @param {string} args.uid - Entry UID
 * @param {string} args.field - Field to search
 * @returns {Promise<string>} Value of the field or empty string
 */
async function commandGetEntryField(args, value) {
    try {
        const {char = '', isuser = 'all', uid = '-1', field = 'key'} = args;

        const cleanUID = Number(uid);
        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';

        const status = getStatusFromName(char, cleanIsUser);
        const acceptedFields = ENUMS_STRINGS.acceptedEntryFields;

        if (!acceptedFields.includes(field)) throw new Error(`Invalid field "${field}"`);
        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(cleanUID) || cleanUID < 0) throw new Error(`Invalid UID "${uid}"`);

        /** @type {StatusEntry} */
        const entry = status.entries[cleanUID];

        if (!entry) return '';

        return String(entry.get(field, cleanUID) ?? '');
    } catch (error) {
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        return '';
    }
}

/**
 * Deletes an status entry from a character
 * @param {Object} args
 * @param {string} args.char - Character name
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @param {string} args.uid - Entry UID
 * @returns {Promise<'true'|'false'>} True if succeeds, False otherwise
 */
async function commandDeleteEntry(args, value) {
    try {
        const {char = '', isuser = 'all', uid = '-1'} = args;

        const cleanUID = Number(uid);
        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';

        const status = getStatusFromName(char, cleanIsUser);

        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(cleanUID) || cleanUID < 0) throw new Error(`Invalid UID "${uid}"`);

        const deletionSucceed = status.delEntry(cleanUID) ?? false;

        if (deletionSucceed) StatUsMaximus.renderStatusesSafe();

        return deletionSucceed ? 'true' : 'false';
    } catch (error) {
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        return 'false';
    }
}

/**
 * Switches the value of an entry by one of its alt values
 * @param {Object} args
 * @param {string} args.char - Character name
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @param {string} args.uid - Entry UID
 * @param {string} args.altuid - UID of the entry alt value
 * @returns {Promise<string>} Empty string
 */
async function commandSwitchEntryValue(args, value) {
    try {
        const {char = '', isuser = 'all', uid = '-1', altuid = '-1'} = args;

        const cleanUID = Number(uid);
        const cleanAltUID = Number(altuid);
        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';

        const status = getStatusFromName(char, cleanIsUser);

        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(cleanUID) || cleanUID < 0) throw new Error(`Invalid UID "${uid}"`);
        if (isNaN(cleanAltUID) || cleanAltUID < 0) throw new Error(`Invalid alt UID "${altuid}"`);

        /** @type {StatusEntry} */
        const entry = status.entries[cleanUID];

        if (!entry) return '';

        const doSwitch = entry.value_uid !== cleanAltUID;

        if (doSwitch) {
            entry.swapValue(cleanAltUID);
            StatUsMaximus.renderStatusesSafe();
        }

        return '';
    } catch (error) {
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        return '';
    }
}

/**
 * Creates a new entry for a character
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @param {string} args.uid - Entry UID
 * @param {string} args.key - Title of the alt value - deprecated argument
 * @param {string} args.title - Title of the alt value
 * @param {string} value - New value of the selected field
 * @returns {Promise<string>} UID of the new alt value or empty string
 */
async function commandCreateEntryAltValue(args, value = '') {
    try {
        const {char = '', isuser = 'all', uid = "-1", title = '', key = ''} = args;

        const cleanUID = Number(uid);
        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';

        const status = getStatusFromName(char, cleanIsUser);

        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(cleanUID) || cleanUID < 0) throw new Error(`Invalid UID "${uid}"`);

        /** @type {StatusEntry} */
        const entry = status.entries[cleanUID];

        if (!entry) return '';

        const altUID = entry.addValue(String(title || key), value);

        return String(altUID ?? '');
    } catch (error) {
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        return '';
    }
}

/**
 * Gets the UID of an entry alt value by searching for a match trough its fields
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @param {string} args.uid - Entry UID
 * @param {string} args.field - Field to search
 * @param {string} args.fuzzy - Wether to do a fuzzy match or exact math
 * @param {string} value - Value to match against field
 * @returns {Promise<string>} UID of the entry or empty string
 */
async function commandGetAltEntryUID(args, value = '') {
    try {
        const {char = '', isuser = 'all', uid = '-1', field = 'title', fuzzy = 'false'} = args;

        const cleanUID = Number(uid);
        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';

        const status = getStatusFromName(char, cleanIsUser);
        const acceptedFields = ENUMS_STRINGS.acceptedAltEntryFields;

        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(cleanUID) || cleanUID < 0) throw new Error(`Invalid UID "${uid}"`);
        if (!acceptedFields.some(key => key === field)) throw new Error(`Invalid alt field "${field}"`);

        /** @type {StatusEntry} */
        const entry = status.entries[cleanUID];

        if (!entry) return '';

        const search = entry.values
            .map(function([uid, alt]) {
                return structuredClone({...alt, uid});
            });

        let altUID = '';

        if (fuzzy === 'true') {
            const fuse = new Fuse(search, {
                keys: [{ name: field, weight: 1 }],
                includeScore: true,
                threshold: 0.3,
            });

            const results = fuse.search(String(value));

            if (!results || results.length === 0) return '';

            altUID = results[0]?.item?.uid;
        } else {
            const alt = search.find(v => String(v[field]) === value);
            altUID = alt.uid;
        }

        return String(altUID ?? '');
    } catch (error) {
        toastr.error(t`Failed to fetch Status Metadata: ${error.message}`);
        return '';
    }
}

/**
 * Updates the selected field of the entry alt value
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @param {string} args.uid - Entry UID
 * @param {string} args.altuid - UID of the entry alt value
 * @param {string} args.field - Field to modify
 * @param {string} value - New value of the selected field
 * @returns {Promise<string>} Empty string
 */
async function commandSetAltEntryField(args, value = '') {
    try {
        const {char = '', isuser = 'all', uid = "-1", altuid = "-1", field = 'title'} = args;

        const cleanUID = Number(uid);
        const cleanAltUID = Number(altuid);
        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';

        const status = getStatusFromName(char, cleanIsUser);
        const acceptedFields = ENUMS_STRINGS.acceptedAltEntryFields;

        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(cleanUID) || cleanUID < 0) throw new Error(`Invalid UID "${uid}"`);
        if (isNaN(cleanAltUID) || cleanAltUID < 0) throw new Error(`Invalid alt UID "${altuid}"`);
        if (!acceptedFields.some(key => key === field)) throw new Error(`Invalid alt field "${field}"`);

        /** @type {StatusEntry} */
        const entry = status.entries[cleanUID];

        if (!entry) return '';

        const doSwitch = entry.value_uid !== cleanAltUID;

        entry.setValue(field, value, cleanAltUID);

        if (doSwitch) StatUsMaximus.renderStatusesSafe();
    } catch (error) {
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
    } finally {
        return '';
    }
}

/**
 * Gets the value of an alt entry field
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @param {string} args.uid - Entry UID
 * @param {string} args.altuid - UID of the entry alt value
 * @param {string} args.field - Field to search
 * @returns {Promise<string>} Field value of the alt entry or empty string
 */
async function commandGetAltEntryField(args, value) {
    try {
        const {char = '', isuser = 'all', uid = '-1', altuid = '-1', field = 'title'} = args;

        const cleanUID = Number(uid);
        const cleanAltUID = Number(altuid);
        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';

        const status = getStatusFromName(char, cleanIsUser);
        const acceptedFields = ENUMS_STRINGS.acceptedAltEntryFields;

        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(cleanUID) || cleanUID < 0) throw new Error(`Invalid UID "${uid}"`);
        if (isNaN(cleanAltUID) || cleanAltUID < 0) throw new Error(`Invalid alt UID "${altuid}"`);
        if (!acceptedFields.includes(field)) throw new Error(`Invalid field "${field}"`);

        /** @type {StatusEntry} */
        const entry = status.entries[cleanUID];

        if (!entry) return '';

        const alt = entry.values[cleanAltUID];

        if (!alt) return '';

        return String(alt[field] ?? '');
    } catch (error) {
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        return '';
    }
}

/**
 * Deletes an alt value within a status entry
 * @param {object} args
 * @param {string} args.char - Character name
 * @param {EntityFilter} args.isuser - Wether to search for personas or characters
 * @param {string} args.uid - Entry UID
 * @param {string} args.altuid - UID of the entry alt value
 * @returns {Promise<'true'|'false'>} True if succeeds, False otherwise
 */
async function commandDeleteAltEntry(args, value) {
    try {
        const {char = '', isuser = 'all', uid = '-1', altuid = '-1'} = args;

        const cleanUID = Number(uid);
        const cleanAltUID = Number(altuid);
        const entityFilters = ENUMS_STRINGS.entityFilters;
        const cleanIsUser = entityFilters.includes(isuser) ? isuser : 'all';

        const status = getStatusFromName(char, cleanIsUser);

        if (!status) throw new Error(`The character "${char}" could not be found in the metadata`);
        if (isNaN(cleanUID) || cleanUID < 0) throw new Error(`Invalid UID "${uid}"`);
        if (isNaN(cleanAltUID) || cleanAltUID < 0) throw new Error(`Invalid alt UID "${altuid}"`);

        /** @type {StatusEntry} */
        const entry = status.entries[cleanUID];

        if (!entry) return 'false';

        const doRefresh = entry.value_uid === cleanAltUID;
        const deletionSucceed = entry.delValue(cleanAltUID) ?? false;

        if (deletionSucceed && doRefresh) StatUsMaximus.renderStatusesSafe();

        return deletionSucceed ? 'true' : 'false';
    } catch (error) {
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        return 'false';
    }
}

/**
 * Wipes all status metadata in the active chat file
 * @returns {Promise<'true'|'false'>} True or False
 */
async function commandDeleteChatStatus() {
    try {
        delete context().chatMetadata[metadataName];
        saveMetadataSafe();
    } catch (error) {
        return 'false';
    }

    return 'true';
}

// * MARK:Register Commands

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
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'force',
                    description: 'If multiple characters or personas have the same name, it will create metadata for all - false by default',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.boolean
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
                        <pre><code>/stum-create-status char="Tom" isuser="all"</code></pre>
                    </li>
                    <li>
                        <pre><code>/stum-create-status char="Tom" isuser="false" force=true</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'stum-set-status-field',
            callback: commandSetStatusField,
            returns: 'Empty string',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to update - defaults to separator',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.acceptedStatusFields
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
                })
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'New value of the field - defaults to empty text',
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
                        <pre><code>/stum-set-status-field char="Tom" isuser="all" "{\\{newline}}"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'stum-delete-status',
            callback: commandDeleteStatus,
            returns: 'True or False',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
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
            name: 'stum-create-entry',
            callback: commandCreateEntry,
            returns: 'Status entry uid',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
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
            name: 'stum-get-entry-uid',
            callback: commandGetEntryUID,
            returns: 'UID of the entry',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to match - defaults to key',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.acceptedEntryFields
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'fuzzy',
                    description: 'Do an exact match or a fuzzy match - defaults to false (exact match)',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.boolean
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
                Get an entry UID by pairing a Character's Status Entry field against a value, returning the UID of the first match. If no match is found, an empty string is returned.
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
            name: 'stum-set-entry-field',
            callback: commandSetEntryField,
            returns: 'Empty string',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to update - defaults to value',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.acceptedEntryFields
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
                })
            ],
            unnamedArgumentList: [
                SlashCommandArgument.fromProps({
                    description: 'New value of the field - defaults to empty text',
                    isRequired: true,
                    typeList: [ARGUMENT_TYPE.STRING]
                })
            ],
            helpString: `
            <div>
                Set the value for one of the fields of a Character's Status Entry.
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
            name: 'stum-get-entry-field',
            callback: commandGetEntryField,
            returns: 'Entry field value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to match - defaults to value',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.acceptedEntryFields
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
                })
            ],
            helpString: `
            <div>
                Get the value of the selected field from the Status Entry of a Character. If no match is found, an empty string is returned.
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
            name: 'stum-delete-entry',
            callback: commandDeleteEntry,
            returns: 'True or False',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
                })
            ],
            helpString: `
            <div>
                Deletes an entry from the status of a character. Returns <code>true</code> if the deletion was a success, and <code>false</code> otherwise.
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
            name: 'stum-switch-entry-value',
            callback: commandSwitchEntryValue,
            returns: 'Empty String',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'altuid',
                    description: 'UID of the status entry alternative value',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.altEntryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
                })
            ],
            helpString: `
            <div>
                Switches the Status Entry value by one of the Entry's alt values.
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
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'title',
                    description: 'Title of the alt value',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'key',
                    description: 'Title of the alt value - this argument will be deprecated, use title instead',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
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
                Creates a new alternative value for the selected Status Entry and returns its UID. If it fails an empty string is returned.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-create-alt-entry-value char="Tom" uid=7 "Content of the entry"</code></pre>
                    </li>
                    <li>
                        <pre><code>/stum-create-alt-entry-value char="Tom" uid=7 title="Title of the entry" "Content of the entry"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'stum-get-alt-entry-uid',
            callback: commandGetAltEntryUID,
            returns: 'UID of the alt entry',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to match - defaults to title',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.acceptedAltEntryFields
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'fuzzy',
                    description: 'Do an exact match or a fuzzy match - defaults to false (exact match)',
                    typeList: [ARGUMENT_TYPE.BOOLEAN],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.boolean
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
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
                        <pre><code>/stum-get-alt-entry-uid char="Tom" field="title" "Summer Clothes"</code></pre>
                    </li>
                    <li>
                        <pre><code>/stum-get-alt-entry-uid char="Tom" field="title" fuzzy=true "Summer Clothes"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'stum-set-alt-entry-field',
            callback: commandSetAltEntryField,
            returns: 'Empty string',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'altuid',
                    description: 'UID of the status entry alternative value',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.altEntryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to match - defaults to title',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.acceptedAltEntryFields
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
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
                Updates the field of the selected Status Entry value.
            </div>
            <div>
                <strong>Example</strong>
                <ul>
                    <li>
                        <pre><code>/stum-set-alt-entry-field char="Tom" field="title" uid=7 altuid=2 "- A red hoodie"</code></pre>
                    </li>
                </ul>
            </div>`,
        })
    );

    SlashCommandParser.addCommandObject(
        SlashCommand.fromProps({
            name: 'stum-get-alt-entry-field',
            callback: commandGetAltEntryField,
            returns: 'Alt entry field value',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'altuid',
                    description: 'UID of the status entry alternative value',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.altEntryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'field',
                    description: 'Field to match - defaults to title',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.acceptedAltEntryFields
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
                })
            ],
            helpString: `
            <div>
                Gets the field of the selected alt value of the entry. If no match is found, an empty string is returned.
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
            name: 'stum-delete-alt-entry',
            callback: commandDeleteAltEntry,
            returns: 'True or False',
            namedArgumentList: [
                SlashCommandNamedArgument.fromProps({
                    name: 'char',
                    description: 'Name of the character',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entities
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'uid',
                    description: 'UID of the status entry',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.entryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'altuid',
                    description: 'UID of the status entry alternative value',
                    typeList: [ARGUMENT_TYPE.NUMBER],
                    isRequired: true,
                    enumProvider: ENUMS_PROVIDER.altEntryUIDs
                }),
                SlashCommandNamedArgument.fromProps({
                    name: 'isuser',
                    description: 'Whether to look for personas or characters - look for all by default',
                    typeList: [ARGUMENT_TYPE.STRING],
                    isRequired: false,
                    enumProvider: ENUMS_PROVIDER.entityFilters
                })
            ],
            helpString: `
            <div>
                Deletes a value swipe within a status entry. Returns <code>true</code> if the deletion was a success, and <code>false</code> otherwise.
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
            name: 'stum-delete-chat-status',
            callback: commandDeleteChatStatus,
            helpString: `
            <div>
                Wipes all the Status metadata for all characters in the currently open chat. It has no confirm screen and cannot be undone, unless a backup of the chat is restored.
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
}
