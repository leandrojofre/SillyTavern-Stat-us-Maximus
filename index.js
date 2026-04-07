import { extension_prompt_roles, user_avatar } from '../../../../script.js';
import { copyText } from '../../../utils.js';
import { getGroupMembers } from '../../../group-chats.js';

import { Status } from './source/classes/Status.js';
import { StatusEntry } from './source/classes/StatusEntry.js';
import { registerEvents } from './source/js/eventListeners.js';
import { initPopupTriggers, openSingleStatusPopup } from './source/js/popups.js';
import { CUSTOM_MACROS } from './source/js/macros.js';
import { registerSlashCommands } from './source/js/slashCommands.js';

export {
    // ST re-exports
    extension_prompt_roles,
    copyText,
    substituteParams,
    setExtensionPrompt,
    t,
    scrollChatToBottom,
    callGenericPopup,
    getThumbnailUrl,
    Popup,
    POPUP_TYPE,
    powerUserSettings,
    characters,
    eventSource,
    eventTypes,
    lodash,
    // Native exports
    getFreeDataUid,
    escapeNewlines,
    unEscapeNewlines,
    unEscapeAll,
    exportObjectToClipboard,
    getActiveParticipants,
    context,
    createElement,
    saveMetadataSafe,
    messageBelongsToChar,
    getUser,
    generateUUID,
    showPopper,
    hidePopper,
    getParticipant,
    isChatOpen,
    parseValue,
    extensionSettings,
    metadataName,
    extensionName,
    htmlSuffix,
    // HTML Related
    updateCaretDisplaySafe,
    getSelectedTextInElem,
    renderCaret,
    HTML_TEMPLATES
};

// * MARK:Extension variables

const context = () => SillyTavern.getContext();

const {
    t,
    saveChat,
    substituteParams,
    setExtensionPrompt,
    scrollChatToBottom,
    callGenericPopup,
    getThumbnailUrl,
    Popup,
    POPUP_TYPE,
    extensionSettings: extension_settings,
    saveSettingsDebounced,
    characters,
    powerUserSettings,
    eventSource,
    eventTypes
} = context();

const {
    lodash,
    Popper
} = SillyTavern.libs;

/**
 * @readonly
 * @enum {number}
 */
const debounceTimeout = Object.freeze({
    MICRO: 50,
    SHORT: 300,
    MED: 500,
    LONG: 700
});

const extensionFullName = 'SillyTavern-Stat-us-Maximus';
const extensionName = 'Stat-us-Maximus';
const metadataName = extensionName.toLowerCase().replaceAll('-', '_');
const htmlSuffix = extensionName.toLowerCase();
const extensionFolderPath = `scripts/extensions/third-party/${extensionFullName}`;

/** @type {ExtensionSettings} */
const extensionSettings = extension_settings[extensionFullName];

/** @type {ExtensionSettings} */
const defaultSettings = {
    enabled: true,
    editNumbersFromChat: false,
    autoDetectParticipants: true,
    hideInputLabels: true,
    rangeInputWidth: 'auto',
    showWhiteSpaces: false,
    minPromptDepth: 0,
    alwaysIncludeUnmutedMembers: false,
    forceMutedMembersInclusion: false,
    altMacroTemplateBehavior: false,
    autoSaveMetadata: true,
    debug: false
};

const HTML_TEMPLATES = {
	/** @returns {Promise<JQuery<HTMLElement>>} */
    get: async function(fileName = 'settings') {
		const file = HTML_TEMPLATES[fileName] ?? await $.get(`${extensionFolderPath}/source/templates/${fileName}.html`);

		if (!HTML_TEMPLATES[fileName]) HTML_TEMPLATES[fileName] = file;

		return $(file);
    }
};

// * MARK:Debugs methods

function log(...mess) {
    if (!extensionSettings.enabled || !extensionSettings.debug) return;

    console.log(`[${extensionName}]`, ...mess);
};

function debug(...mess) {
    if (!extensionSettings.enabled || !extensionSettings.debug) return;

    console.debug(`[${extensionName}]`, ...mess);
};

function error(...mess) {
    if (!extensionSettings.enabled || !extensionSettings.debug) return;

    console.error(`[${extensionName}]`, ...mess);
};

// * MARK:Extension methods

/** The function checks for keys from 0 up to a defined safe limit (1,000,000) and returns the first available integer that is not used as a key in the data object.
 * @param {Record<string, any>} data
 * @returns {number} The lowest non-negative integer that is not a key in the provided data object. If the data object is empty, it returns 0.
 */
function getFreeDataUid(data = {}) {
    const keys = Object.keys(data);

    if (!keys?.length) return 0;

    const used = new Set(keys);
    const LIMIT = 1_000_000;

    for (let uid = 0; uid < LIMIT; uid++)
        if (!used.has(String(uid))) return uid;
}

function escapeNewlines(str) {
    return str
        .replace(/\r\n/g, '\\r\\n')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

function unEscapeNewlines(str) {
    return str
        .replace(/\\r\\n/g, '\r\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replaceAll('<br>', '\n');
}

/**
 * Set user clipboard to a stringified version of an object
 * @param {Object} obj - Object to be sent to the clipboard as text
 * @returns {Promise<void>}
 */
async function exportObjectToClipboard(obj = {}) {
    let stringObj = JSON.stringify(obj);
    stringObj = escapeNewlines(stringObj);

    return await copyText(stringObj);
}

/**
 * @param {string?} [value]
 * @param {Object} [options]
 * @param {string?} [options.searchKey] - Default is `avatar`
 * @param {string[]?} [options.ignoreAvatars] - Only used in search by `name`
 * @returns {UserCharacter|null}
 */
function getUser(value = user_avatar, {searchKey = 'avatar', ignoreAvatars = []} = {}) {
    const { powerUserSettings: power_user } = context();

    if (!value) value = power_user.default_persona;
    if (!value) return null;

    let avatar = value;
    const correctSearchKey = ['avatar', 'name'].includes(searchKey);

    if (!correctSearchKey) return null;

    if (searchKey === 'name')
        avatar = Object
            .entries(power_user.personas)
            .map(([avatar, name]) => {return {name, avatar}})
            .find(per => per.name === String(value) && !ignoreAvatars.includes(per.avatar))
            ?.avatar;

    if (!avatar || !power_user.personas[avatar]) return null;

    return {
        name: String(power_user.personas[avatar]),
        avatar: String(avatar),
        description: String(power_user.persona_descriptions[avatar].description),
        is_user: true
    };
}

/**
 *
 * @param {string[]?} [discard]
 * @returns {{chars: Character[]; user: UserCharacter;}}
 */
function getActiveParticipants(discard = []) {
    const { groupId: group_id, groups, characterId: chid } = context();

    /** @type {Character[]} */
    const chars = [];
    const toDiscard = discard;
    const user = getUser();

    if (group_id) {
        const members = getGroupMembers();
        const group = groups.find(g => g.id == group_id);
        const muted_members = group.disabled_members ?? [];

        if (!extensionSettings.forceMutedMembersInclusion)
            toDiscard.push(...muted_members);

        for (const member of members)
            if (member) chars.push(member);
    }

    if (chid) {
        const character = characters[chid];
        const alreadyInList = chars.some(c => c.avatar === character.avatar);

        if (character && !alreadyInList) chars.push(character);
    }

    const members = {chars, user};
    const charGenerating = typeof chid === 'string' && characters[chid]?.avatar ? characters[chid].avatar : null;
    const discardUnique = new Set(toDiscard).values().toArray()
        .filter(avatar => avatar !== charGenerating);

    StatUsMaximus.log({members: structuredClone(members), discardUnique, toDiscard});

    members.chars = members.chars.filter(c => !discardUnique.includes(c.avatar));

    StatUsMaximus.log({members});

    return members;
}

/**
 * @param {string} value
 * @param {{search_key?: string; is_user?: boolean}?} [options]
 * @returns {Character|UserCharacter}
 */
function getParticipant(value, {search_key = 'avatar', is_user = false} = {}) {
    if (is_user)
        return getUser(value, {searchKey: search_key});

    const { groupId } = context();

    /** @type {Character} */
    let char;

    if (groupId)
        char = getGroupMembers().find(m => m[search_key] === value);

    if (!char)
        char = characters.find(c => c[search_key] === value);

    return char;
}

/**
 * Creates or populates elements
 * @param {string|HTMLElement} elem
 * @param {{class?:string; attr?:Object; data?:Object; innerHTML?: string; innerText?: string; append?: HTMLElement[]}} [options]
 */
// * Anything complex generated by this function should eventually be turned into an HTML template
function createElement(elem, options = {}) {
    const element = typeof elem === 'string' ? document.createElement(elem) : elem;

    for (const [attr, value] of Object.entries(options.attr ?? {})) {
        element.setAttribute(attr, value);
    }

    for (const [key, value] of Object.entries(options.data ?? {})) {
        element.dataset[key] = value;
    }

    const classes = options.class ?? '';

    if (classes.length > 0)
        element.classList.add(...(classes.split(' ')));

    if (options.innerHTML) element.innerHTML = options.innerHTML ?? '';
    if (options.innerText) element.innerText = options.innerText ?? '';
    if (options.append) element.append(...(options.append ?? []));

    return element;
}

/**
 * @param {Instance} popperInstance
 * @param {HTMLDivElement|HTMLElement} tooltip
 */
async function showPopper(popperInstance, tooltip) {
    tooltip.setAttribute('data-show', '');

    await popperInstance.setOptions((options) => ({
        ...options,
        modifiers: [
            ...options.modifiers,
            { name: 'eventListeners', enabled: true }
        ]
    }));

    await popperInstance.update();
}

/**
 * @param {Instance} popperInstance
 * @param {HTMLDivElement|HTMLElement} tooltip
 */
async function hidePopper(popperInstance, tooltip) {
    tooltip.removeAttribute('data-show');

    await popperInstance.setOptions((options) => ({
        ...options,
        modifiers: [
            ...options.modifiers,
            { name: 'eventListeners', enabled: false }
        ]
    }));
}

/**
 * @param {ChatMessage} mes
 * @param {Character|Object?} [char]
 * @param {boolean?} [is_user]
 * @returns {boolean}
 */
function messageBelongsToChar(mes, char = {}, is_user = false) {
    const { force_avatar, original_avatar, name, is_user: mess_is_user } = mes;
    const { avatar, name: charName } = char;

    if (is_user !== mess_is_user) return false;

    const url = new URL(force_avatar, window.location.origin);
    const urlFile = url?.searchParams.get('file') ?? '';

    if (avatar === urlFile) return true;
    if (avatar === original_avatar) return true;

    if (!char) return false;

    if (charName === name) return true;

    return false;
}

/**
    @param {HTMLElement} elem
    @returns {{start:number; end:number; unselected?: boolean}}
*/
function getSelectedTextInElem(elem) {
    const selection = window.getSelection();

    if (!selection?.rangeCount) return {start: -1, end: -1, unselected: true};

    const range = selection.getRangeAt(0);

    if (elem.contains(range.startContainer) && elem.contains(range.endContainer))
        return {start: range.startOffset, end: range.endOffset};

    else if (elem.contains(range.startContainer))
        return {start: range.startOffset, end: elem.textContent.length};

    else if (elem.contains(range.endContainer))
        return {start: 0, end: range.endOffset};

    else return {start: -1, end: -1, unselected: true};
}

/**
    @param {HTMLSpanElement} span
    @param {string} text
    @param {number} caretPos
    @param {number} [selectEnd]
 */
function renderCaret(span, text, caretPos, selectEnd = caretPos) {
    const esc = s => lodash.escape(s);
    const $span = $(span);

    $span.empty();

    if (!text) $span.attr('data-empty', '');
    else $span.removeAttr('data-empty');

    if (caretPos < 0) return $span.text(text);

    const chunks = {
        start: text.slice(0, caretPos),
        selected: caretPos !== selectEnd ? text.slice(caretPos, selectEnd) : false,
        end: text.slice(selectEnd)
    };

    for (const [k, v] of Object.entries(chunks))
        chunks[k] = typeof v === 'boolean' ? v : esc(v);

    chunks.selected ?
        $span.html(`${chunks.start}<span class="fake-selection">${chunks.selected}</span>${chunks.end}`) :
        $span.html(`${chunks.start}<span class="fake-caret"></span>${chunks.end}`);
}

/**
 * @param {HTMLInputElement|HTMLTextAreaElement} input
 * @param {HTMLSpanElement} span
 */
function updateCaretDisplay(input, span) {
    const start = input.selectionStart;
    const end = input.selectionEnd;

    renderCaret(span, input.value, start, end);
}

/**
 * @param {HTMLInputElement|HTMLTextAreaElement} input
 * @param {HTMLSpanElement} span
 */
function updateCaretDisplaySafe(input, span) {
    updateCaretDisplayDebounced.cancel();
    updateCaretDisplayDebounced(input, span);
}

/**
 * @param {string?} [extraSuffix]
 * @returns {string} UUID
 */
function generateUUID(extraSuffix) {
    const randUUID = self?.crypto?.randomUUID();
    const uuid = !randUUID ? new Date().valueOf().toString() : randUUID.replaceAll('-', '_');

    return `${extraSuffix ?? metadataName}_${uuid}`;
}

/**
 * @returns {boolean}
 */
function isChatOpen() {
    const { chatId } = context();

    return !chatId ? false : true;
}

/**
 * @param {string|boolean|number} value
 * @param {'string'|'boolean'|'number'|string?} [force]
 * @returns {string|boolean|number}
 */
function parseValue(value, force) {
    const allowed = ['string', 'boolean', 'number'];

    if (!allowed.includes(typeof value)) return value;

    if (force === 'string') return String(value);
    if (force === 'number') return Number(value);
    if (force === 'boolean') return value === 'true';

    if (value === 'true' || value === 'false')
        return value === 'true';

    const number = Number(value);

    if (!isNaN(number)) return number;

    return String(value);
}

/**
 * @param {boolean?} [doSave] Wether to save the metadata or not - if false, it'll turn save buttons to red
 */
function saveMetadataSafe(doSave = true) {
    if (typeof doSave !== 'boolean') doSave = true;

    const nextState = doSave ? 'var(--stum-custom-save-color)' : 'red';

    document.documentElement.style.setProperty('--stum-save-state-color', nextState);

    if (!doSave) return;

    saveChatDebounced.cancel();
    saveChatDebounced();
}

/**
 * @param {Status} status
 */
async function renderStatusSafe(status) {
    renderStatusDebounced.cancel();
    await renderStatusDebounced(status);
}

function renderStatusesSafe() {
    renderStatusesDebounced.cancel();
    renderStatusesDebounced();
}

/**
 * @typedef {Object} UnEscapeOptions
 * @prop {boolean} [newlines] - Wether to unescape newlines or not
 * @prop {boolean} [macros] - Wether to replace macros with their values or not
 * @prop {boolean} [comments] - Wether to remove comments from the text content
 * @prop {string} [macroParser] - The macro parser to use from CUSTOM_MACROS, default is `substituteParams`
 * @prop {string} [character] - Character name for the `{{name}}` macro
 * @prop {boolean} [html] - Wether to escape HTML with lodash or not
 *
 * @param {string|number|boolean} text
 * @param {UnEscapeOptions} [options]
 * @returns {string}
 */
function unEscapeAll(text, { newlines = false, macros = false, comments = false, macroParser = 'substituteParams', character = '', html = false } = {}) {
    let escaped = String(lodash.cloneDeep(text || ''));

    if (macros) escaped = CUSTOM_MACROS[macroParser](escaped, character);
    if (newlines) escaped = unEscapeNewlines(escaped);
    if (html) escaped = lodash.escape(escaped);
    if (comments) escaped = escaped
        .replace(/\/\*.*?\*\//gs, '')
        .replace(/\/\/.*$/gm, '');

    return escaped;
}

/**
 * MARK:renderCharStatus()
 * Renders the status block of the selected character in the last message from the character rendered in the chat log.
 * @param {Status} status
 */
async function renderCharStatus(status) {
    $(`#chat .${htmlSuffix}-custom-css[char-target="${status.avatar}"]`).remove();

    if (!Object.keys(status.entries).length) return;

    status.refreshPosition();

    if (status.last_mes_id < 0) return;

    /** @type {string} */
    const character = status.getCharacter()?.name;

    if (!character) return;

    const lastMess = $(`#chat .mes[mesid="${status.last_mes_id}"][is_user="${status.is_user}"]`).last();

    if (!lastMess?.length) return;

    const statusBlock = (await HTML_TEMPLATES.get('chatStatus')).clone();
    const entryBlockTemplate = (await HTML_TEMPLATES.get('chatStatusEntry')).clone();
    const statusBlockId = `${generateUUID()}_chat_stat_block`;

    statusBlock
        .attr('char-target', status.avatar);

    statusBlock
        .find(`.${htmlSuffix}-chat-title`)
        .text(character);

    statusBlock
        .find('.inline-drawer-icon')
        .toggleClass(`${status.is_collapsed ? 'down' : 'up'}`, true)
        .toggleClass(`${status.is_collapsed ? 'fa-circle-chevron-down' : 'fa-circle-chevron-up'}`, true);

    statusBlock
        .find(`.inline-drawer`)
        .toggleClass(`bg-${status.is_user ? 'user' : 'bot'}`, true);

    statusBlock
        .find('.inline-drawer-header')
        .data({avatar: status.avatar});

    statusBlock
        .find(`.${htmlSuffix}-toolbar .kill-switch`)
        .toggleClass('toggleEnabled', status.enabled);

    statusBlock
        .find(`.${htmlSuffix}-toolbar .menu_button`)
        .data({avatar: status.avatar});

    /** @type {[string, StatusEntry][]} */
    const entries = Object
        .entries(status.entries)
        .sort(([uidA, entryA], [uidB, entryB]) => entryA.display_position - entryB.display_position);

    const macroParser = extensionSettings.editNumbersFromChat ? 'getInputs' : 'getValues';
    const replaceMacrosOptions = {newlines: true, macros: true, macroParser, character};
    const replaceDefOptions = {html: true, ...replaceMacrosOptions};

    for (const [uid, entry] of entries) {
        const key = entry.get('key');
        const separator = entry.get('separator');
        const values = entry.get('values') || {};
        const value_uid = entry.get('value_uid');
        const enabled = entry.get('enabled');

        const entryBlock = entryBlockTemplate.clone();
        const $entryBlock = $(entryBlock);

        const titleClean = unEscapeAll(key, replaceMacrosOptions);
        const separatorClean = unEscapeAll(separator, replaceDefOptions);
        const valueClean = unEscapeAll(entry.get('value'), replaceMacrosOptions);

        $entryBlock.attr({'status-block-id': statusBlockId, uid});
        $entryBlock.find('.status-title').html(`<span class="d-inline">${titleClean}</span>`);
        $entryBlock.find('.status-separator').html(separatorClean);
        $entryBlock.find('.status-description').html(`<span class="d-inline">${valueClean}</span>`);

        $entryBlock.find('textarea.input-value-source').each((_, textarea) => {
            const $textarea = $(textarea);
            const val = $textarea.data('defaultValue');
            $textarea.val(val);
        });

        $entryBlock
            .find('.kill-switch')
            .addClass(enabled ? 'fa-toggle-on' : 'fa-toggle-off')
            .data({avatar: status.avatar, uid, enabled});

        $entryBlock
            .toggleClass('disabled', !enabled);

        $entryBlock
            .find('.fake-inputs-container')
            .data({avatar: status.avatar, uid, value_uid});

        const entryValues = Object.entries(values);

        if (entryValues?.length > 1) {
            // Gods I hate Popper, even this simplification of the previous code is a spaghetti mess

            const switchValueButton = $entryBlock.find('.status-value-uid').first()[0];
            const switchValueOptionsListId = `${generateUUID()}_chat_stat_block_popper`;
            const switchValueOptionsList = createElement('div', {
                attr: { role: 'tooltip', 'avatar-target': status.avatar, id: switchValueOptionsListId },
                class: 'status-value-uid-options list-group'
            });

            statusBlock.append(switchValueOptionsList);

            const switchValuePopper = Popper.createPopper(switchValueButton, switchValueOptionsList, {
                modifiers: [{
                    name: 'eventListeners',
                    enabled: false
                }],
                strategy: 'absolute',
                placement: 'left'
            });

            for (const [altUid, value] of entryValues) {
                const option = createElement('div', {
                    data: { altUid, uid, avatar: status.avatar, character, listId: switchValueOptionsListId, statusBlockId },
                    class: 'list-group-item status-value-uid-options-item',
                    innerText: value.title || `UID: ${altUid}`
                });

                switchValueOptionsList.append(option);
            }

            $(switchValueButton)
                .attr('toggle-for', switchValueOptionsListId)
                .data({switchValuePopper, listId: switchValueOptionsListId});
        } else {
            $entryBlock.find('.status-value-uid').toggleClass('d-none', true);
        }

        statusBlock
            .find(`.${htmlSuffix}-entries-list`)
            .append(entryBlock);
    }

    lastMess
        .find('.mes_text')
        .before(statusBlock);

    if (!status.is_collapsed) statusBlock.find('.inline-drawer-content').show();
}

async function renderStatuses() {
    const activeParticipants = getActiveParticipants();

    /** @type {(Character|UserCharacter)[]} */
    const characters = [];

    if (activeParticipants.user) characters.push(activeParticipants.user);

    characters.push(...activeParticipants.chars);

    const formattedChars = characters.map(c => ({
        avatar: c.avatar,
        is_user: c['is_user'] ?? false
    }));

    const statuses = StatUsMaximus
        .getStatuses()
        .filter(s => formattedChars.some(c => s.avatar === c.avatar && s.is_user === c.is_user));

    $(`#chat .${htmlSuffix}-custom-css.${htmlSuffix}-chat-drawer`).remove();

    for (const status of statuses)
        await renderCharStatus(status);
}

const saveChatDebounced = lodash.debounce(saveChat, debounceTimeout.MED);
const renderStatusDebounced = lodash.debounce(renderCharStatus, debounceTimeout.MED);
const renderStatusesDebounced = lodash.debounce(renderStatuses, debounceTimeout.MED);
const updateCaretDisplayDebounced = lodash.debounce(updateCaretDisplay, debounceTimeout.MICRO);

/**
 * MARK:Interface
 * @type {StatUsMaxInterface}
 */
globalThis.StatUsMaximus = {
    getStatuses: function() {
        let statuses = context().chatMetadata[metadataName];

        if (!statuses) statuses = [];

        statuses = statuses.map(status => status instanceof Status ? status : new Status(status));

        context().chatMetadata[metadataName] = statuses;

        return statuses;
    },

    getStatus: function(avatar) {
        let statuses = StatUsMaximus.getStatuses();

        if (!statuses) return false;

        const status = statuses.find(s => s.avatar === avatar);

        return !status ? false : status;
    },

    addStatus: function(avatar, is_user) {
        let statuses = StatUsMaximus.getStatuses();

        if (!statuses) return false;

        let status = statuses.find(s => s.avatar === avatar);

        if (!status) {
            status = new Status({avatar, is_user});
            statuses.push(status);

            context().chatMetadata[metadataName] = statuses;
            saveMetadataSafe(extensionSettings.autoSaveMetadata);
        }

        return status;
    },

    delStatus: function(status) {
        let statuses = StatUsMaximus.getStatuses();

        if (!statuses) return false;

        statuses = statuses.filter(s => s.avatar !== status.avatar);

        context().chatMetadata[metadataName] = statuses;
        saveMetadataSafe(extensionSettings.autoSaveMetadata);

        return true;
    },

    transferStatus: function(avatar, newAvatar, {onlyEntries = false, isUser = false}) {
        const {
            getStatus,
            addStatus
        } = StatUsMaximus;

        const status = getStatus(avatar);

        if (!status) return false;

        let newStatus = getStatus(newAvatar) || addStatus(newAvatar, isUser);

        if (!newStatus) return false;

        if (!onlyEntries) {
            for (const key in status) {
                if (key !== 'avatar') newStatus.set(key, status[key]);
            }
        }

        for (const uid in status.entries) {
            const entry = status.getEntry(Number(uid));
            if (entry) newStatus.addEntry(entry);
        }

        return newStatus.set('is_user', isUser);
    },

    Status,
    StatusEntry,
    openPopupSingle: openSingleStatusPopup,
    renderStatuses,
    renderStatusSafe,
    renderStatusesSafe,
    log,
    debug,
    error
};

// * MARK:Extension Settings

const settingsCallbacks = {
    /**	Triggers on enabled setting change. */
    enabled: () => {
        // Nothing by the moment
    },

    hideInputLabels: function() {
        const newDisplay = extensionSettings.hideInputLabels ? 'none' : 'block';

        document.documentElement.style.setProperty('--stum-input-label-display', newDisplay);
    },

    autoSaveMetadata: function() {
        const doSave = extensionSettings.autoSaveMetadata;

        if (doSave) saveMetadataSafe(true);
    }
}

/** Changes a setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsBooleanButton(event) {
    const target = event.target;
    const value = Boolean($(target).prop('checked'));
    const setting = target.getAttribute(`${htmlSuffix}-setting`);
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

/** Changes a string setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsTextButton(event) {
    const target = event.target;
    const value = String($(target).val());

    const setting = target.getAttribute(`${htmlSuffix}-setting`);
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

/** Changes a number setting value and triggers a callback if there's any on settingsCallbacks. */
function settingsNumberButton(event) {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const raw_value = isNaN(target.valueAsNumber) ? 0 : target.valueAsNumber;
    const insideMinBoundary = (target.min !== '') ? (Number(target.min) <= raw_value) : true;
    const insideMaxBoundary = (target.max !== '') ? (Number(target.max) >= raw_value) : true;

    let value = raw_value;

    if (!insideMinBoundary) value = Number(target.min);
    if (!insideMaxBoundary) value = Number(target.max);

    const setting = target.getAttribute(`${htmlSuffix}-setting`);
    const callback = settingsCallbacks[setting];

    extensionSettings[setting] = value;

    if (callback) callback();

    log('toggleSetting ' + setting, value);
    saveSettingsDebounced();
}

/**	Logs setting's values. */
function displaySettings() {
    debug(`Auto detect participants is ${extensionSettings.autoDetectParticipants ? 'active' : 'not active'}`);
    debug(`Always include unmuted group members is ${extensionSettings.alwaysIncludeUnmutedMembers ? 'active' : 'not active'}`);
    debug(`Force muted group members inclusion is ${extensionSettings.forceMutedMembersInclusion ? 'active' : 'not active'}`);
    debug(`Auto save metadata is ${extensionSettings.autoSaveMetadata ? 'active' : 'not active'}`);
    debug(`Alternative behavior for macro template buttons is ${extensionSettings.altMacroTemplateBehavior ? 'active' : 'not active'}`);
    debug(`Show input macros in chat is ${extensionSettings.editNumbersFromChat ? 'active' : 'not active'}`);
    debug(`Hide input labels is ${extensionSettings.hideInputLabels ? 'active' : 'not active'}`);
    debug(`Show whitespaces is ${extensionSettings.showWhiteSpaces ? 'active' : 'not active'}`);
    debug(`Range input width is set to ${String(extensionSettings.rangeInputWidth)}`);
    debug(`Min prompt depth is set to ${String(extensionSettings.minPromptDepth)}`);

    debug(`Debug mode is ${extensionSettings.debug ? 'active' : 'not active'}`);
    debug(structuredClone(extensionSettings));
}

/** Append settings menu on ST and set listeners. */
async function loadSettingsMenu() {
    const settingsHtml = await HTML_TEMPLATES.get('settings');

    $('#extensions_settings2').append(settingsHtml);

    $(`#${htmlSuffix}-auto-detect-participants`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-always-include-unmuted-members`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-force-muted-members-inclusion`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-auto-save-metadata`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-alt-macro-template-behavior`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-show-input-macros`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-hide-input-labels`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-show-white-spaces`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-range-input-width`).on('input', settingsTextButton);
    $(`#${htmlSuffix}-min-prompt-depth`).on('input', settingsNumberButton);

    $(`#${htmlSuffix}-debug`).on('input', settingsBooleanButton);
    $(`#${htmlSuffix}-check-configuration`).on('click', displaySettings);

    log('Settings menu created');

    $(`#${htmlSuffix}-auto-detect-participants`).prop('checked', extensionSettings.autoDetectParticipants);
    $(`#${htmlSuffix}-always-include-unmuted-members`).prop('checked', extensionSettings.alwaysIncludeUnmutedMembers);
    $(`#${htmlSuffix}-always-force-muted-members-inclusion`).prop('checked', extensionSettings.alwaysIncludeUnmutedMembers);
    $(`#${htmlSuffix}-auto-save-metadata`).prop('checked', extensionSettings.autoSaveMetadata);
    $(`#${htmlSuffix}-alt-macro-template-behavior`).prop('checked', extensionSettings.altMacroTemplateBehavior);
    $(`#${htmlSuffix}-show-input-macros`).prop('checked', extensionSettings.editNumbersFromChat);
    $(`#${htmlSuffix}-show-white-spaces`).prop('checked', extensionSettings.showWhiteSpaces);
    $(`#${htmlSuffix}-hide-input-labels`).prop('checked', extensionSettings.hideInputLabels).trigger('input');
    $(`#${htmlSuffix}-range-input-width`).val(extensionSettings.rangeInputWidth).trigger('input');
    $(`#${htmlSuffix}-min-prompt-depth`).val(extensionSettings.minPromptDepth);

    $(`#${htmlSuffix}-debug`).prop('checked', extensionSettings.debug).trigger('input');

    log('Settings values initialized', extensionSettings);
}

// * Initialize Extension

eventSource.once(eventTypes.APP_INITIALIZED, async function() {
    if (!context().extensionSettings[extensionFullName]) {
        context().extensionSettings[extensionFullName] = structuredClone(defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (context().extensionSettings[extensionFullName][key] === undefined) {
            context().extensionSettings[extensionFullName][key] = defaultSettings[key];
        }
    }

    await loadSettingsMenu();
    registerEvents();
    initPopupTriggers();
    registerSlashCommands();
});
