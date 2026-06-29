import {
    extensionName,
    getFreeDataUid,
    saveMetadataSafe,
    extensionSettings,
    parseValue,
    t,
    unEscapeNewlines
} from '../../index.js';

export {
    entryTemplate,
    StatusEntry
};

/** @typedef {StatUsMaximus.AltValueData} AltValueData */
/** @typedef {StatUsMaximus.EntryData} EntryData */

/** @type {EntryData} */
const entryTemplate = Object.freeze({
    enabled: true,
    key: '',
    separator: '',
    display_position: 0,
    private: false,
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
 * @param {EntryData} entryData
 * @returns {EntryData}
 */
function migrateV0Data(entryData) {
    entryData = structuredClone(entryData);

    // If it has alts as array, turn into object - Compatibility with older data versions
    if ('alt_values' in entryData && Array.isArray(entryData.alt_values)) {
        entryData.values = entryData.alt_values.reduce((acc, alt) => {
            const safeAlt = Object.assign({}, structuredClone(altEntryTemplate), structuredClone(alt));
            const uid = String(safeAlt.uid ?? getFreeDataUid(acc));

            const {
                key: title,
                value
            } = safeAlt;

            const parsedValue = String(value)
                .replaceAll('{{text:: ', '{{text::{{noop}} ')
                .replaceAll(/(\{\{text::[^}]+ )(\}\})/gs, '$1{{noop}}$2');

            acc[uid] = {
                title,
                value: parsedValue
            };

            return acc;
        }, {});
    }

    return entryData;
}

class StatusEntry {
    static template = entryTemplate;
    static valueTemplate = altEntryTemplate;

    /** @property @type {boolean} */ enabled
    /** @property @type {string} */ key
    /** @property @type {string} */ separator
    /** @property @type {number} */ display_position
    /** @property @type {boolean} */ private
    /** @property @type {number} */ value_uid
    /** @property @type {Record<string, AltValueData>} */ values

    /**
     * @param {EntryData?} [entry={}] - The status data to initialize the Status object with. If not provided, default values will be used.
     */
    constructor(entry = {}) {
        entry = migrateV0Data(entry);

        /** @type {EntryData} */
        const entryClean = {};

        for (const key in entryTemplate) {
            const hasProperty = key in entry;

            if (!hasProperty) continue;
            else if (key === 'values') entryClean[key] = structuredClone(entry[key]);
            else entryClean[key] = entry[key];
        }

        Object.assign(this, structuredClone(entryTemplate), structuredClone(entryClean));

        if (!this.values[this.value_uid])
            this.value_uid = Number(Object.keys(this.values).at(0));
    }

    /**
     * Updates an entry field - it also updates the currently selected value if its field are sent
     * @param {keyof EntryData|keyof AltValueData} key
     * @param {string|number|boolean} value
     * @param {number?} [uid]
     * @returns {StatusEntry}
     */
    set(key, value, uid) {
        const targetType = typeof entryTemplate[key];
        const newType = typeof value;

        if (key === 'values') return this;

        if ((key === 'value' || key === 'title') && newType === 'string')
            return this.setValue(key, value, uid);

        if (!Object.keys(entryTemplate).includes(key)) return this;

        if (targetType !== newType) value = parseValue(value, targetType);

        if (this[key] === value) return this;

        this[key] = value;

        saveMetadataSafe(extensionSettings.autoSaveMetadata);

        return this;
    }

    /**
     * @param {keyof EntryData|keyof AltValueData} key
     * @param {number?} [uid]
     * @returns {string|number|boolean|undefined}
     */
    get(key, uid) {
        const cleanUID = Number(uid ?? this.value_uid);
        let returnValue = this[key];

        if (!Object.keys(entryTemplate).includes(key))
            returnValue = undefined;

        if (Object.keys(altEntryTemplate).includes(key) && !isNaN(cleanUID))
            returnValue = this.getValue(cleanUID)[key];

        return returnValue;
    }

    /**
     * @param {string} title
     * @param {string} value
     * @returns {number} Value UID
     */
    addValue(title, value) {
        const newUID = getFreeDataUid(this.values);
        title = String(title);
        value = String(value);
        this.values[newUID] = {title, value};

        saveMetadataSafe(extensionSettings.autoSaveMetadata);

        return newUID;
    }

    /**
     * Updates one of the values of an entry
     * @param {string} key
     * @param {any} value
     * @param {number?} [uid]
     * @returns {StatusEntry}
     */
    setValue(key, value, uid) {
        const cleanUID = uid ?? this.value_uid;

        if (!this.values[cleanUID]) return this;
        if (!Object.keys(altEntryTemplate).includes(key)) return this;

        const targetType = typeof altEntryTemplate[key];
        const newType = typeof value;

        if (targetType !== newType) value = parseValue(value, targetType);

        if (this.values[cleanUID][key] === value) return this;

        this.values[cleanUID][key] = value;

        saveMetadataSafe(extensionSettings.autoSaveMetadata);

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
        const valuesCount = Object.values(this.values).length;

        if (valuesCount <= 1) {
            toastr.warning(t`You can't delete all entry values`, extensionName);
            return false;
        }

        const cleanUID = uid ?? this.value_uid;
        const invalidUID = isNaN(Number(cleanUID));

        if (invalidUID) return false;

        const value = this.values[cleanUID];

        if (!value) return true;

        delete this.values[cleanUID];

        saveMetadataSafe(extensionSettings.autoSaveMetadata);

        const newValueUID = Object.keys(this.values).at(0);

        this.set('value_uid', Number(newValueUID));

        return true;
    }

    /**
     * @param {number} uid
     * @returns {StatusEntry}
     */
    swapValue(uid) {
        const altValue = this.values[uid];

        if (!altValue) return this;

        this.set('value_uid', Number(uid));

        return this;
    }
}