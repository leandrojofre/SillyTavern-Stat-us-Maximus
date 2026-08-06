import {
    extension_prompt_roles,
    getFreeDataUid,
    messageBelongsToChar,
    generateUUID,
    metadataName,
    getThumbnailUrl,
    context,
    unEscapeNewlines,
    saveMetadataSafe,
    extensionSettings,
    parseValue,
    getParticipant,
} from '../../index.js';

import { StatusEntry, entryTemplate } from './StatusEntry.js';

export {
    Status
};

/** @typedef {StatUsMaximus.StatusData} StatusData */
/** @typedef {StatUsMaximus.EntryData} EntryData */
/** @typedef {StatUsMaximus.UserCharacter} UserCharacter */

/** @type {StatusData} */
const statusTemplate = Object.freeze({
    dataVersion: 0,
    avatar: '',
    thumbnail: '',
    name: '',
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
    is_detached: false,
    is_collapsed: false,
    entries: {}
});

/**
 * @param {string} [starterAvatar]
 * @returns {string}
 */
function createAvatarUIDForDetached(starterAvatar = '') {
    starterAvatar = String(starterAvatar || '');

    /** @type {any[]} */
    const statuses = context().chatMetadata[metadataName];
    let newAvatar = starterAvatar || generateUUID();
    let isAvatarRepeated = statuses.some(status => status.avatar === newAvatar);

    if (!isAvatarRepeated) return newAvatar;

    for (let i = 0; isAvatarRepeated && i < 50; i++) {
        newAvatar = generateUUID();
        isAvatarRepeated = statuses.some(status => status.avatar === newAvatar);
    }

    return newAvatar;
}

/**
 * @param {StatusData} statusData
 * @returns {StatusData}
 */
function migrateV0Data(statusData) {
    const dataVersion = statusData?.dataVersion ?? 0;

    if (dataVersion > 0) return statusData;

    statusData = structuredClone(statusData);

    // If it has entries as array, turn into object - Compatibility with older data versions - Remove in months
    if ('entries' in statusData && Array.isArray(statusData.entries)) {
        statusData.entries = statusData.entries.reduce((acc, entry) => {
            const safeEntry = Object.assign({}, structuredClone(entryTemplate), entry);
            const uid = String(safeEntry.uid ?? getFreeDataUid(acc));

            acc[uid] = safeEntry;

            return acc;
        }, {});
    }

    if ('forceDepth' in statusData)
        statusData.force_depth = statusData.forceDepth === '' ? -1 : Number(statusData.forceDepth ?? -1);

    statusData.dataVersion = 1;

    return statusData;
}

class Status {
    /** @type {StatusData} */ static template;
    /** @type {() => string} */ static createAvatarUID;

    /** @type {number} */ dataVersion;
    /** @type {string} */ avatar;
    /** @type {string} */ thumbnail;
    /** @type {string} */ name;
    /** @type {number} */ role;
    /** @type {string} */ separator;
    /** @type {string} */ def_entry_separator;
    /** @type {string} */ prefix;
    /** @type {string} */ suffix;
    /** @type {number} */ depth;
    /** @type {number} */ force_depth;
    /** @type {number} */ last_mes_id;
    /** @type {boolean} */ enabled;
    /** @type {boolean} */ is_user;
    /** @type {boolean} */ is_detached;
    /** @type {boolean} */ is_collapsed;
    /** @type {Record<string, StatusEntry>} */ entries;

    /**
     * @param {StatusData?} [status={}] - The status data to initialize the Status object with. If not provided, default values will be used.
     */
    constructor(status = {avatar: ''}) {
        status = migrateV0Data(status);

        /** @type {StatusData} */
        const statusClean = {
            avatar: '',
            role: Number(extensionSettings.defaultPromptRole),
        };

        for (const key in Status.template) {
            const hasProperty = key in status;

            if (!hasProperty) continue;
            else statusClean[key] = status[key];
        }

        Object.assign(this, structuredClone(Status.template), structuredClone(statusClean));

        for (const [uid, entry] of Object.entries(this.entries ?? {})) {
            this.entries[uid] = new StatusEntry(entry);
        }

        if (!this.thumbnail) {
            this.thumbnail = this.getThumbnail();
        }

        if (!this.name) {
            this.name = this.getCharacter()?.name || '';
        }

        if (this.is_detached) {
            this.avatar = this.avatar || createAvatarUIDForDetached();
            this.is_user = false;
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

        rawEntry.separator = data.separator ?? this.def_entry_separator;
        rawEntry.display_position = this.getMaxDisplayPosition();

        this.entries[newUid] = rawEntry;

        saveMetadataSafe(extensionSettings.autoSaveMetadata);

        return newUid;
    }

    /**
     * @param {number|string} uid
     * @returns {StatusEntry|undefined}
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
        if (this.is_detached) return {
            avatar: this.avatar || StatUsMaximus.comment_avatar,
            name: this.name || 'Detached',
            description: '',
            is_user: false,
        };

        const { avatar, is_user } = this;
        const entity = getParticipant(avatar, {is_user});
        const name = this.name || entity?.name;

        return {...entity, is_user, name};
    }

    /**
     * @returns {string}
     */
    getThumbnail() {
        if (this.thumbnail) return this.thumbnail;

        this.set('thumbnail', this.is_detached ?
            StatUsMaximus.comment_avatar :
            getThumbnailUrl(this.is_user ? 'persona' : 'avatar', this.avatar)
        );

        return this.thumbnail;
    }

    /**
     * @returns {Status}
     */
    refreshPosition() {
        if (this.is_detached) return this.set('last_mes_id', this.enabled ? 0 : -1);

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
        if (this.is_detached) return this.set('depth', this.enabled ? 0 : -1);
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

Status.template = statusTemplate;
Status.createAvatarUID = createAvatarUIDForDetached;