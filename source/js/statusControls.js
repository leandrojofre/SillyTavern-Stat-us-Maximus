import { log } from "../../index.js";
import { chat, chat_metadata, extension_prompt_roles } from "../../../../../../script.js";
import { saveMetadataDebounced } from "../../../../../extensions.js";
import { t } from "../../../../../i18n.js";
import { un_escapeNewlines } from "./popups.js";

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

        return newAlt;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(`${error.name}: ${error.message}`);
    }
}

export function getCharAltValue(character, entry_uid, alt_uid) {
    try {
        const entry = getCharEntry(character, entry_uid);

        if (!entry) throw new Error(`Entry with uid=${entry_uid} could not be found`);

        const alt = entry
            .alt_values
            .find(v => v.uid === Number(alt_uid));

        return alt;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(`${error.name}: ${error.message}`);
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

        saveMetadataDebounced();

        return entry.alt_values
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to delete Status Metadata: ${error.message}`);
        console.error(`${error.name}: ${error.message}`);
    }
}

export function addCharEntry(character, entry_key = "", entry_value = "") {
    try {
        const char_status = getCharStatus(character);

        if (!char_status) throw new Error(`Char status not found for -${character?.name}-`);

        const newEntry = {
            uid: getFreeDataUid(char_status.entries),
            enabled: true,
            key: entry_key,
            value: entry_value,
            separator: "",
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

        saveMetadataDebounced();

        return newEntry;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(`${error.name}: ${error.message}`);

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

        if (!char_status) throw new Error(`Char status not found for -${character?.name}-`);

        const ordered_data = [];

        for (const [i, form] of display_order.entries()) {
            const entry = getCharEntry(character, form.dataset.uid);
            entry.display_position = i;
            ordered_data.push(entry);
        }

        char_status.entries = ordered_data;

        saveMetadataDebounced();
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(`${error.name}: ${error.message}`);
    }
}

export function getCharEntry(character, entry_uid) {
    try {
        const char_status = getCharStatus(character);

        if (!char_status) throw new Error(`Char status not found for -${character?.name}-`);

        const entry = char_status
            .entries
            .find(s => s.uid === Number(entry_uid));

        return entry ?? false;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(`${error.name}: ${error.message}`);
    }
}

function parseValue(val) {
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
            if (key.includes("separator")) parsedValue = un_escapeNewlines(parsedValue);

            entry[key] = parsedValue;
        }

        const altValue = entry
            .alt_values
            .find(v => v.uid === entry.value_uid)

        altValue.value = entry.value;
        altValue.key = formData.get("alt_key") ?? altValue.key;

        saveMetadataDebounced();

        return entry;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to save Status Metadata: ${error.message}`);
        console.error(`${error.name}: ${error.message}`);

        return false;
    }
}

export function removeCharEntry(character, entry_uid = -1) {
    try {
        const char_status = getCharStatus(character);

        if (!char_status)
            throw new Error(`Char status not found for -${character?.name}-`);
        if (typeof entry_uid !== "number" || entry_uid < 0)
            throw new Error(`Char status entry with uid=${entry_uid} not found`);

        char_status.entries = char_status
            .entries
            .filter(s => s.uid !== Number(entry_uid));

        getLastDisplayPosition(char_status.entries);
        saveMetadataDebounced();
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to delete Status Metadata: ${error.message}`);
        console.error(`${error.name}: ${error.message}`);
    }
}

export function createCharStatus(character, depth) {
    const status = {
        avatar: character.avatar,
        role: extension_prompt_roles.SYSTEM,
        separator: "\n",
        depth: depth,
        last_mes_id: chat.length - depth - 1,
        is_user: character.is_user ?? false,
        is_collapsed: false,
        entries: []
    };

    chat_metadata.stat_us_maximus.push(status);

    return status;
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

const statusTemplate = {
    avatar: "",
    role: extension_prompt_roles.SYSTEM,
    separator: "\n",
    depth: -1,
    last_mes_id: -1,
    is_user: false,
    is_collapsed: false,
    entries: []
};

export const entryTemplate = {
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

export async function fillMissingMetadata() {
    try {
        for (const status of chat_metadata.stat_us_maximus) {
            for (const key in statusTemplate)
                if (status[key] === undefined) status[key] = statusTemplate[key];

            for (const entry of status.entries) {
                for (const entry_key in entryTemplate)
                    if (entry[entry_key] === undefined) entry[entry_key] = entryTemplate[entry_key];

                for (const alt_entry of entry.alt_values) {
                    for (const alt_entry_key in altEntryTemplate)
                        if (alt_entry[alt_entry_key] === undefined) entry[alt_entry_key] = altEntryTemplate[alt_entry_key];
                }
            }
        }

        saveMetadataDebounced();

        return true;
    } catch (error) {
        // @ts-ignore
        toastr.error(t`Failed to fill Status Metadata: ${error.message}`);
        console.error(`${error.name}: ${error.message}`);

        return false;
    }
}
