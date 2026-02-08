import { getFreeDataUid } from '../../index.js';

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
    values: {}
});

/** @type {AltValueData} */
const altEntryTemplate = Object.freeze({
    title: '',
    value: ''
});

class StatusEntry {
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
     * @property {Object.<string, AltValueData>} [values]
     */

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

        Object.assign(this, structuredClone(entryTemplate), entryClean);
    }
}