import { extension_prompt_roles, getFreeDataUid } from '../../index.js';
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
     */
    set(key, value) {
        if (key === 'entries') return;
        if (!Object.keys(statusTemplate).includes(key)) return;

        this[key] = value;
    }
}