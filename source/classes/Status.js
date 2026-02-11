import { extension_prompt_roles, getFreeDataUid, messageBelongsToChar, context } from '../../index.js';
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
    forceDepth: '',
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
 * @property {string|number} [forceDepth]
 * @property {number} [last_mes_id]
 * @property {boolean} [is_user]
 * @property {boolean} [is_collapsed]
 * @property {Object.<string, StatusEntry>} [entries]
 */
class Status {
    /** @property {string} */ avatar
    /** @property {number} */ role
    /** @property {string} */ separator
    /** @property {string} */ def_entry_separator
    /** @property {string} */ prefix
    /** @property {string} */ suffix
    /** @property {number} */ depth
    /** @property {string|number} */ forceDepth
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
        if (!Object.keys(statusTemplate).includes(key)) return;

        this[key] = value;

        return this;
    }

    /**
     * @returns {Status}
     */
    refreshPosition() {
        const { chat, characters } = context();
        const { avatar, is_user } = this;

        const character = characters.find(c => c.avatar === avatar);
        const lastID = chat.findLastIndex(m => messageBelongsToChar(m, character, is_user));

        if (lastID < 0) return this.set('last_mes_id', -1);

        const chatLength = chat.length - 1;
        const chatEmpty = chatLength < 0;

        return this.set('last_mes_id', chatEmpty ? 0 : lastID);
    }

    /**
     * @returns {Status}
     */
    refreshDepth() {
        const { chat, characters } = context();
        const { avatar, is_user } = this;

        const character = characters.find(c => c.avatar === avatar);
        const lastID = chat
            .filter(m => !m.is_system)
            .findLastIndex(m => messageBelongsToChar(m, character, is_user));

        if (lastID < 0) this.set('depth', -1);

        const chatLength = chat.length - 1;
        const chatEmpty = chatLength < 0;

        return this.set('depth', chatEmpty ? 0 : (chatLength - lastID));
    }
}