import { extension_prompt_roles, getFreeDataUid, messageBelongsToChar, getUser, getThumbnailUrl, log, context } from '../../index.js';
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
    force_depth: '',
    last_mes_id: -1,
    is_user: false,
    is_collapsed: false,
    entries: {}
});

/**
 * @typedef {Object} StatusData
 * @property {string} [avatar]
 * @property {number} [role]
 * @property {string} [separator]
 * @property {string} [def_entry_separator]
 * @property {string} [prefix]
 * @property {string} [suffix]
 * @property {number} [depth]
 * @property {string|number} [force_depth]
 * @property {number} [last_mes_id]
 * @property {boolean} [is_user]
 * @property {boolean} [is_collapsed]
 * @property {Object.<string, StatusEntry>} [entries]
 *
 * @typedef {import('./StatusEntry.js').EntryData} EntryData
 * @typedef {import('../../index.js').UserCharacter} UserCharacter
 */
class Status {
    /** @property {string} */ avatar
    /** @property {number} */ role
    /** @property {string} */ separator
    /** @property {string} */ def_entry_separator
    /** @property {string} */ prefix
    /** @property {string} */ suffix
    /** @property {number} */ depth
    /** @property {string|number} */ force_depth
    /** @property {number} */ last_mes_id
    /** @property {boolean} */ is_user
    /** @property {boolean} */ is_collapsed
    /** @property {Object.<string, StatusEntry>} */ entries

    /**
     * @param {StatusData?} [status={}] - The status data to initialize the Status object with. If not provided, default values will be used.
     */
    constructor(status = {}) {
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

        // @ts-ignore
        if (status?.forceDepth) status.force_depth = status.forceDepth;

        for (const [uid, entry] of Object.entries(status.entries ?? {})) {
            status.entries[uid] = new StatusEntry(entry);
        }

        /** @type {StatusData} */
        const statusClean = {};

        for (const key in statusTemplate) {
            if (status[key] === null || status[key] === undefined) continue;

            statusClean[key] = status[key];
        }

        Object.assign(this, statusTemplate, statusClean);
    }

    /**
     * @param {string} key
     * @param {string|number|boolean} value
     * @returns {Status}
     */
    set(key, value) {
        if (key === 'entries') return;
        if (!Object.keys(statusTemplate).includes(key)) return this;

        this[key] = value;

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

        return newUid;
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
        const { chat } = context();
        const { is_user } = this;

        if (isGenerating) return this.set('depth', 0);

        const character = this.getCharacter();
        const chatShown = chat.filter(m => !m.is_system);
        const lastID = chatShown.findLastIndex(m => messageBelongsToChar(m, character, is_user));

        if (lastID < 0) this.set('depth', -1);

        const chatLength = chatShown.length;
        const chatEmpty = chatLength < 1;

        return this.set('depth', chatEmpty ? 0 : (chatLength - lastID));
    }
}