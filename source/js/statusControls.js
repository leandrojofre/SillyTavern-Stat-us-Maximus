import { deleteCharTracker } from "../../index.js";
import { chat, chat_metadata, extension_prompt_roles } from "../../../../../../script.js";
import { saveMetadataDebounced } from "../../../../../extensions.js";
import { t } from "../../../../../i18n.js";
import { un_escapeNewlines } from "./popups.js";

let saveDataTimeout;
const SAVE_DATA_TIMEOUT_MS = 300;

export function saveMetadataSTUM() {
    clearTimeout(saveDataTimeout)
    saveDataTimeout = setTimeout(saveMetadataDebounced, SAVE_DATA_TIMEOUT_MS);
}

export function getFreeDataUid(data) {
    if (!data?.length) return 0;

    const used = new Set(data.map(s => s.uid));
    const LIMIT = 1_000_000;

    for (let uid = 0; uid < LIMIT; uid++)
        if (!used.has(uid)) return uid;
}

/**
    @param {Array} data
*/
export function getLastDisplayPosition(data) {
    if (!data?.length) return 0;

    data = data
        .sort((e_a, e_b) => e_a.display_position - e_b.display_position)
        .map((e, i) => e.display_position = i);

    return data.length;
}

export function addCharAltValue(character, entry_uid, alt_value = "") {
    try {
        const entry = getCharEntry(character, entry_uid);

        if (!entry) throw new Error(`Entry with uid=${entry_uid} could not be found`);

        const newAlt = {
            uid: getFreeDataUid(entry.alt_values),
            key: "",
            value: alt_value
        };

        entry.alt_values.push(newAlt);

        saveMetadataSTUM();

        return newAlt;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(error.message);

        return false;
    }
}

export function getCharAltValue(character, entry_uid, alt_uid) {
    try {
        const entry = getCharEntry(character, entry_uid);

        if (!entry) throw new Error(`Entry with uid=${entry_uid} could not be found`);

        const alt = entry
            .alt_values
            .find(v => v.uid === Number(alt_uid));

        if (!alt) throw new Error(`Alt entry with uid=${alt_uid} could not be found`);

        return alt;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(error.message);

        return false;
    }
}

export function updateCharAltValue(character, entry_uid, alt_uid, formData) {
    try {
        const entry = getCharEntry(character, entry_uid);

        if (!entry) throw new Error(`Entry with uid=${entry_uid} could not be found`);

        const alt = entry
            .alt_values
            .find(v => v.uid === Number(alt_uid));

        if (!alt) throw new Error(`Alt entry with uid=${alt_uid} not found`);

        for (const [key, value] of formData.entries())
            alt[key] = key === "value" ? un_escapeNewlines(String(value)) : String(value);

        if (entry.value_uid === alt.uid) entry.value = alt.value;

        saveMetadataSTUM();

        return alt;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(error.message);

        return false;
    }
}

export function removeCharAltValue(character, entry_uid, alt_uid) {
    try {
        const entry = getCharEntry(character, entry_uid);

        if (!entry) throw new Error(`Entry with uid=${entry_uid} could not be found`);
        if (entry.alt_values.length <= 1) throw new Error("You can't delete all alt descriptions");

        entry.alt_values = entry
            .alt_values
            .filter(s => s.uid !== Number(alt_uid));

        if (entry.value_uid === Number(alt_uid)) {
            entry.value = entry.alt_values[0].value;
            entry.value_uid = entry.alt_values[0].uid;
        }

        saveMetadataSTUM();

        return true;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to delete Status Metadata: ${error.message}`);
        console.error(error.message);

        return false;
    }
}

export function addCharEntry(character, entry_key = "", entry_value = "") {
    try {
        const char_status = getCharStatus(character);

        if (!char_status) throw new Error(`Char status not found for "${character?.name}"`);

        const newEntry = {
            uid: getFreeDataUid(char_status.entries),
            enabled: true,
            key: entry_key,
            value: entry_value,
            separator: char_status.def_entry_separator,
            value_uid: 0,
            display_position: getLastDisplayPosition(char_status.entries),
            alt_values: []
        };

        newEntry.alt_values.push({
            uid: getFreeDataUid(newEntry.alt_values),
            key: "",
            value: entry_value
        });

        char_status.entries.push(newEntry);

        saveMetadataSTUM();

        return newEntry;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(error.message);

        return false;
    }
}

/**
    @param {object} character
    @param {NodeListOf<HTMLFormElement>} display_order
*/
export function refreshCharEntryDisplay(character, display_order) {
    try {
        const char_status = getCharStatus(character);

        if (!char_status) throw new Error(`Char status not found for "${character?.name}"`);

        const ordered_data = [];

        for (const [i, form] of display_order.entries()) {
            const entry = getCharEntry(character, form.dataset.uid);
            entry.display_position = i;
            ordered_data.push(entry);
        }

        char_status.entries = ordered_data;

        saveMetadataSTUM();
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(error.message);
    }
}

export function getCharEntry(character, entry_uid) {
    try {
        const char_status = getCharStatus(character);

        if (!char_status) throw new Error(`Char status not found for "${character?.name}"`);

        const entry = char_status
            .entries
            .find(s => s.uid === Number(entry_uid));

        if (!entry) throw new Error(`Status entry with uid=${entry_uid} not found`);

        return entry;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(error.message);

        return false;
    }
}

export function parseValue(val) {
    if (val === "true")  return true;
    if (val === "false") return false;

    const num = Number(val);
    if (!isNaN(num) && val.trim() !== "") return num;

    return val;
}

/**
    @param {object} character
    @param {Number|String} entry_uid
    @param {FormData} formData
    @returns {object|Boolean}
*/
export function updateCharEntry(character, entry_uid, formData) {
    try {
        const entry = getCharEntry(character, entry_uid);

        if (!entry) throw new Error(`Entry with uid=${entry_uid} could not be found`);
        if (!formData) throw new Error("Data sent is not valid");

        for (const [key, value] of formData.entries()) {
            let parsedValue = parseValue(value);

            if (key === "alt_key") continue;
            if (key === "value") parsedValue = un_escapeNewlines(parsedValue);
            if (key.includes("separator")) parsedValue = un_escapeNewlines(parsedValue);

            entry[key] = parsedValue;
        }

        const altValue = entry
            .alt_values
            .find(v => v.uid === entry.value_uid)

        altValue.value = entry.value;
        altValue.key = formData.get("alt_key") ?? altValue.key;

        saveMetadataSTUM();

        return entry;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(error.message);

        return false;
    }
}

export function removeCharEntry(character, entry_uid = -1) {
    try {
        const char_status = getCharStatus(character);

        if (!char_status)
            throw new Error(`Char status not found for "${character?.name}"`);
        if (typeof entry_uid !== "number" || entry_uid < 0)
            throw new Error(`Char status entry with uid=${entry_uid} not found`);

        char_status.entries = char_status
            .entries
            .filter(s => s.uid !== Number(entry_uid));

        getLastDisplayPosition(char_status.entries);
        saveMetadataSTUM();

        return true;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to delete Status Metadata: ${error.message}`);
        console.error(error.message);

        return false;
    }
}

export function createCharStatus(character, depth = -1) {
    try {
        const status = {
            avatar: character.avatar,
            role: extension_prompt_roles.SYSTEM,
            separator: "\n",
            def_entry_separator: "",
            prefix: "",
            suffix: "",
            depth: depth,
            forceDepth: "",
            last_mes_id: (depth >= 0) ? (chat.length - depth - 1) : (-1),
            is_user: character.is_user ?? false,
            is_collapsed: false,
            entries: []
        };

        chat_metadata.stat_us_maximus.push(status);

        saveMetadataSTUM();

        return status;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to create Status Metadata - Check the browser console for more details`);
        console.error(error);

        return false;
    }
}

/**
    @param {object} character
    @returns {boolean|object}
*/
export function getCharStatus(character) {
    if (!chat_metadata?.stat_us_maximus) return false;

    if (character)
        return chat_metadata.stat_us_maximus.find((status) => status.avatar === character.avatar) ?? false;
    else
        return false;
}

/**
    @param {object} character
    @param {FormData} formData
    @returns {object|Boolean}
*/
export function updateCharStatus(character, formData) {
    try {
        const status = getCharStatus(character);

        if (!status) throw new Error(`Status data for the character ${character.name} could not be found`);
        if (!formData) throw new Error("Data sent is not valid");

        for (const [key, value] of formData.entries()) {
            let parsedValue = un_escapeNewlines(parseValue(value));

            status[key] = parsedValue;
        }

        saveMetadataSTUM();

        return status;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(error.message);

        return false;
    }
}

/**
    @param {object} character
    @param {object} target
    @param {object} [options]
    @param {boolean} [options.deleteOriginal=false]
    @param {boolean} [options.onlySendEntries=false]
    @returns {boolean}
*/
export function transferCharStatus(character, target, {deleteOriginal = false, onlySendEntries = false} = {}) {
    try {
        const originalStatus = getCharStatus(character);

        if (!originalStatus) return false;

        let targetStatus = getCharStatus(target);

        if (!targetStatus) targetStatus = createCharStatus(target);
        if (!targetStatus) return false;

        const sendEntries = (entries) => {
            for (const entry of entries) {
                const newUID = getFreeDataUid(targetStatus.entries);

                entry.uid = newUID;
                targetStatus.entries.push(entry);
            }
        };

        const originalStatusCloned = structuredClone(originalStatus);
        const data = onlySendEntries ? {entries: originalStatusCloned.entries} : originalStatusCloned;

        for (const [key, value] of Object.entries(data)) {
            if (key === "avatar" || key === "depth" || key === "last_mes_id" || key === "is_user") continue;
            if (key === "entries") sendEntries(value);
            else targetStatus[key] = value;
        }

        if (deleteOriginal) deleteCharStatus(character);

        saveMetadataSTUM();

        return true;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to transfer Status Metadata - Check the browser console for more details`);
        console.error(error);

        return false;
    }
}

export function deleteCharStatus(character) {
    try {
        if (!chat_metadata?.stat_us_maximus) return false;

        chat_metadata.stat_us_maximus = chat_metadata.stat_us_maximus
            .filter(stat => stat.avatar !== character.avatar);

        saveMetadataSTUM();
        deleteCharTracker(character);

        return true;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to delete Status Metadata - Check the browser console for more details`);
        console.error(error);

        return false;
    }
}

const statusTemplate = {
    avatar: "",
    role: extension_prompt_roles.SYSTEM,
    separator: "\n",
    def_entry_separator: "",
    prefix: "",
    suffix: "",
    depth: -1,
    forceDepth: "",
    last_mes_id: -1,
    is_user: false,
    is_collapsed: false,
    entries: []
};

const entryTemplate = {
    uid: 0,
    enabled: true,
    key: "",
    value: "",
    separator: "",
    value_uid: 0,
    display_position: 0,
    alt_values: []
};

const altEntryTemplate = {
    uid: 0,
    key: "",
    value: ""
};

/** I hate this code */
export async function fillMissingMetadata() {
    try {
        // For each status...
        for (const status of chat_metadata.stat_us_maximus) {
            // Backfill missing properties
            for (const key in statusTemplate)
                if (status[key] === undefined) status[key] = statusTemplate[key];

            // Fill each status entry...
            for (const entry of status.entries) {
                // Missing properties
                for (const entry_key in entryTemplate)
                    if (entry[entry_key] === undefined) entry[entry_key] = entryTemplate[entry_key];

                // Missing properties in the alt values
                for (const alt_entry of entry.alt_values) {
                    for (const alt_entry_key in altEntryTemplate)
                        if (alt_entry[alt_entry_key] === undefined) entry[alt_entry_key] = altEntryTemplate[alt_entry_key];
                }
            }
        }

        saveMetadataSTUM();

        return true;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to fill Status Metadata: ${error.message}`);
        console.error(error.message);

        return false;
    }
}
