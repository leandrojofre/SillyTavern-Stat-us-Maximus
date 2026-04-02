import {
    extension_prompt_roles,
    getFreeDataUid,
    messageBelongsToChar,
    getUser,
    getThumbnailUrl,
    context,
    unEscapeNewlines,
    saveMetadataSafe,
    extensionSettings,
    parseValue
} from '../../index.js';

import { StatusEntry, entryTemplate } from './StatusEntry.js';

export {
    Status
};

/** @type {StatusData} */
const statusTemplate = Object.freeze({
    avatar: '',
    role: extension_prompt_roles.SYSTEM,
    separator: '\n',
    def_entry_separator: '',
    prefix: '',
    suffix: '',
    depth: -1,
    force_depth: -1,
    last_mes_id: -1,
    enabled: true,
    is_user: false,
    is_collapsed: false,
    entries: {}
});

class Status {
    static template = statusTemplate;

    /** @property @type {string} */ avatar;
    /** @property @type {number} */ role;
    /** @property @type {string} */ separator;
    /** @property @type {string} */ def_entry_separator;
    /** @property @type {string} */ prefix;
    /** @property @type {string} */ suffix;
    /** @property @type {number} */ depth;
    /** @property @type {number} */ force_depth;
    /** @property @type {number} */ last_mes_id;
    /** @property @type {boolean} */ enabled;
    /** @property @type {boolean} */ is_user;
    /** @property @type {boolean} */ is_collapsed;
    /** @property @type {Object.<string, StatusEntry>} */ entries;

    /**
     * @param {StatusData?} [status={}] - The status data to initialize the Status object with. If not provided, default values will be used.
     */
    constructor(status = {avatar: ''}) {
        status = structuredClone(status);

        // If it has entries as array, turn into object - Compatibility with older data versions - Remove in months
        if (status.entries && Array.isArray(status.entries)) {
            status.entries = status.entries.reduce((acc, entry) => {
                const safeEntry = Object.assign({}, structuredClone(entryTemplate), entry);
                const uid = String(safeEntry.uid ?? getFreeDataUid(acc));

                acc[uid] = safeEntry;

                return acc;
            }, {});
        }

        if (status?.forceDepth !== undefined)
            status.force_depth = status.forceDepth === '' ? -1 : Number(status.forceDepth);

        /** @type {StatusData} */
        const statusClean = {avatar: ''};

        for (const key in statusTemplate) {
            if (status[key] === null || status[key] === undefined) continue;

            statusClean[key] = status[key];
        }

        Object.assign(this, structuredClone(statusTemplate), structuredClone(statusClean));

        for (const [uid, entry] of Object.entries(this.entries ?? {})) {
            this.entries[uid] = new StatusEntry(entry);
        }
    }

    /**
     * @param {string} key
     * @param {string|number|boolean} value
     * @returns {Status}
     */
    set(key, value) {
        if (key === 'entries') return this;
        if (!Object.keys(statusTemplate).includes(key)) return this;

        const targetType = typeof statusTemplate[key];
        let newType = typeof value;

        if (targetType !== newType) {
            value = parseValue(value, targetType);
            newType = typeof value;
        }

        if (newType === 'string') value = unEscapeNewlines(value);

        if (this[key] === value) return this;

        this[key] = value;

        saveMetadataSafe(extensionSettings.autoSaveMetadata);

        return this;
    }

    /**
     * @param {EntryData?} [data]
     * @returns {number}
     */
    addEntry(data = {}) {
        const rawEntry = new StatusEntry(data);
        const newUid = getFreeDataUid(this.entries);

        rawEntry.separator = this.def_entry_separator;
        rawEntry.display_position = this.getMaxDisplayPosition();

        this.entries[newUid] = rawEntry;

        saveMetadataSafe(extensionSettings.autoSaveMetadata);

        return newUid;
    }

    /**
     * @param {number|string} uid
     * @returns {StatusEntry}
     */
    getEntry(uid) {
        return this.entries[uid];
    }

    /**
     * @param {number} uid
     * @returns {boolean}
     */
    delEntry(uid) {
        if (isNaN(Number(uid))) return false;

        const entry = this.entries[uid];

        if (!entry) return true;

        delete this.entries[uid];

        saveMetadataSafe(extensionSettings.autoSaveMetadata);

        return true;
    }

    /**
     * @returns {number}
     */
    getMaxDisplayPosition() {
        /** @type {StatusEntry[]} */
        const entries = Object.values(this.entries);

        if (!entries.length) return 0;

        let maxPosition = 0;

        for (const entry of entries) {
            if (entry.display_position > maxPosition) maxPosition = entry.display_position;
        }

        return maxPosition + 1;
    }

    /**
     * @returns {Character|UserCharacter}
     */
    getCharacter() {
        const { avatar, is_user } = this;
        const { characters } = context();

        return is_user ?
            getUser(avatar) :
            characters.find(c => c.avatar === avatar);
    }

    /**
     * @returns {string}
     */
    getThumbnail() {
        return getThumbnailUrl(this.is_user ? "persona" : "avatar", this.avatar);
    }

    /**
     * @returns {Status}
     */
    refreshPosition() {
        const { chat } = context();
        const { is_user } = this;

        const character = this.getCharacter();
        const lastID = chat.findLastIndex(m => messageBelongsToChar(m, character, is_user));

        if (lastID < 0) return this.set('last_mes_id', -1);

        const chatLength = chat.length - 1;
        const chatEmpty = chatLength < 0;

        return this.set('last_mes_id', chatEmpty ? 0 : lastID);
    }

    /**
     * @typedef {Object} RefreshDepthOptions
     * @property {boolean?} [isGenerating]
     *
     * @param {RefreshDepthOptions?} [options]
     * @returns {Status}
     */
    refreshDepth({ isGenerating = false } = {}) {
        if (isGenerating) return this.set('depth', 0);

        const { chat } = context();
        const { is_user } = this;

        const character = this.getCharacter();
        const chatShown = chat.filter(m => !m.is_system);
        const lastID = chatShown.findLastIndex(m => messageBelongsToChar(m, character, is_user));

        if (lastID < 0) return this.set('depth', -1);

        const chatLength = chatShown.length;
        const chatEmpty = chatLength < 1;

        return this.set('depth', chatEmpty ? 0 : (chatLength - lastID));
    }
}