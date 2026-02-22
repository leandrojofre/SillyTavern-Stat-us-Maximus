import {
    getFreeDataUid,
    unEscapeNewlines
} from '../../index.js';

export {
    entryTemplate,
    StatusEntry
};

/** @type {EntryData} */
const entryTemplate = Object.freeze({
    enabled: true,
    key: '',
    separator: '',
    display_position: 0,
    value_uid: 0,
    values: {
        '0': {
            title: '',
            value: ''
        }
    }
});

/** @type {AltValueData} */
const altEntryTemplate = Object.freeze({
    title: '',
    value: ''
});

/**
 * @typedef {Object} AltValueData
 * @property {string} [title]
 * @property {string} [value]
 */

/**
 * @typedef {Object} EntryData
 * @property {boolean} [enabled]
 * @property {string} [key]
 * @property {string} [separator]
 * @property {number} [value_uid]
 * @property {number} [display_position]
 * @property {Object<string, AltValueData>} [values]
 */
class StatusEntry {
    static template = entryTemplate;
    static valueTemplate = altEntryTemplate;

    /** @property {boolean} */ enabled
    /** @property {string} */ key
    /** @property {string} */ separator
    /** @property {number} */ value_uid
    /** @property {number} */ display_position
    /** @property {Object<string, AltValueData>} */ values

    /**
     * @param {EntryData?} [entry={}] - The status data to initialize the Status object with. If not provided, default values will be used.
     */
    constructor(entry = {}) {
        entry = structuredClone(entry);

        // If it has alts as array, turn into object - Compatibility with older data versions - Remove in months
        // @ts-ignore
        if (entry.alt_values && Array.isArray(entry.alt_values)) {
            // @ts-ignore
            entry.values = entry.alt_values.reduce((acc, alt) => {
                const safeAlt = Object.assign({}, structuredClone(altEntryTemplate), structuredClone(alt));
                const uid = String(safeAlt.uid ?? getFreeDataUid(acc));

                const {
                    key: title,
                    value
                } = safeAlt;

                acc[uid] = {title, value};

                return acc;
            }, {});
        }

        /** @type {EntryData} */
        const entryClean = {};

        for (const key in entryTemplate) {
            if (entry[key] === null || entry[key] === undefined) continue;

            key === 'values' ?
                entryClean[key] = structuredClone(entry[key]) :
                entryClean[key] = entry[key];
        }

        Object.assign(this, structuredClone(entryTemplate), structuredClone(entryClean));
    }

    /**
     * Updates an entry field - it also updates the currently selected value if its field are sent
     * @param {string} key
     * @param {string|number|boolean} value
     * @param {number?} [uid]
     * @returns {StatusEntry}
     */
    set(key, value, uid) {
        if (typeof value === 'string') value = unEscapeNewlines(value);

        if ((key === 'value' || key === 'title') && typeof value === 'string')
            return this.setValue(key, value, uid);

        if (key === 'values') return this;
        if (!Object.keys(entryTemplate).includes(key)) return this;

        this[key] = value;

        return this;
    }

    /**
     * @param {string} key
     * @param {number?} [uid]
     * @returns {string|number|boolean|undefined}
     */
    get(key, uid) {
        const cleanUID = uid ?? this.value_uid;

        if ((key === 'value' || key === 'title') && !isNaN(Number(cleanUID)))
            return this.values[cleanUID][key];

        if (key === 'values') return undefined;
        if (!Object.keys(entryTemplate).includes(key)) return undefined;

        return this[key];
    }

    /**
     * @param {string} title
     * @param {string} value
     * @returns {number} Value UID
     */
    addValue(title, value) {
        const newUID = getFreeDataUid(this.values);

        this.values[newUID] = {title, value};

        return newUID;
    }

    /**
     * Updates one of the values of an entry
     * @param {string} key
     * @param {string} value
     * @param {number?} [uid]
     * @returns {StatusEntry}
     */
    setValue(key, value, uid) {
        const cleanUID = uid ?? this.value_uid;

        if (!Object.keys(altEntryTemplate).includes(key)) return this;
        if (!this.values[cleanUID]) return this;

        this.values[cleanUID][key] = value;

        return this;
    }

    /**
     * @param {number?} [uid]
     * @returns {AltValueData}
     */
    getValue(uid) {
        const cleanUID = uid ?? this.value_uid;
        return this.values[cleanUID];
    }

    /**
     * @param {number?} [uid]
     * @returns {boolean}
     */
    delValue(uid) {
        const cleanUID = uid ?? this.value_uid;
        const invalidUID = isNaN(Number(cleanUID));

        if (invalidUID) return false;

        const value = this.values[cleanUID];

        if (!value) return true;

        delete this.values[cleanUID];

        const newValueUID = Object.keys(this.values).at(0);

        this.value_uid = Number(newValueUID);

        return true;
    }

    /**
     * @param {number} uid
     * @returns {StatusEntry}
     */
    swapValue(uid) {
        const altValue = this.values[uid];

        if (!altValue) return this;

        this.value_uid = Number(uid);

        return this;
    }
}