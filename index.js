import { extension_prompt_roles } from '../../../../script.js';
import { copyText } from "../../../utils.js";
import { getGroupMembers } from "../../../group-chats.js";

import { Status } from './source/classes/Status.js';
import { StatusEntry } from './source/classes/StatusEntry.js';
import { registerEvents } from './source/js/eventListeners.js';
import { initPopupTriggers, openSingleStatusPopup } from './source/js/popups.js';
import { CUSTOM_MACROS } from './source/js/macros.js';

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
    POPUP_TYPE,
    powerUserSettings,
    eventSource,
    eventTypes,
    lodash,
    // Native exports
    getFreeDataUid,
    log,
    debug,
    error,
    escapeNewlines,
    unEscapeNewlines,
    exportObjectToClipboard,
    getActiveParticipants,
    context,
    createElement,
    saveMetadataSafe,
    messageBelongsToChar,
    getUser,
    generateUUID,
    extensionSettings,
    metadataName,
    extensionName,
    // HTML Related
    updateCaretDisplaySafe,
    getSelectedTextInElem,
    renderCaret,
    HTML_TEMPLATES
};

// * MARK:Extension variables

/**
 * @typedef {{name:string; description: string; avatar:string; is_user: boolean}} UserCharacter
 *
 * @typedef {Object} ExtensionSettings
 * @property {boolean} enabled
 * @property {boolean} editNumbersFromChat - Legacy name for what now is replace macros with inputs from chat
 * @property {boolean} autoDetectParticipants
 * @property {boolean} hideInputLabels
 * @property {string} rangeInputWidth
 * @property {boolean} showWhiteSpaces
 * @property {number} minPromptDepth
 * @property {boolean} alwaysIncludeUnmutedMembers
 * @property {boolean} altMacroTemplateBehavior
 * @property {boolean} autoSaveMetadata
 * @property {boolean} debug
 */

const context = () => SillyTavern.getContext();

const {
    t,
    saveChat,
    substituteParams,
    setExtensionPrompt,
    scrollChatToBottom,
    callGenericPopup,
    getThumbnailUrl,
    POPUP_TYPE,
    extensionSettings: extension_settings,
    saveSettingsDebounced,
    characters,
    powerUserSettings,
    eventSource,
    eventTypes
} = context();

const {
    lodash
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
    hideInputLabels: false,
    rangeInputWidth: 'auto',
    showWhiteSpaces: false,
    minPromptDepth: 0,
    alwaysIncludeUnmutedMembers: false,
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
 * @param {Object} data
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
        .replace(/\\/g, '\\\\')
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
 * @param {object} obj - Object to be sent to the clipboard as text
 * @returns {Promise<void>}
 */
function exportObjectToClipboard(obj = {}) {
    let stringObj = JSON.stringify(obj);
    stringObj = escapeNewlines(stringObj);

    return copyText(stringObj);
}

/**
 * @param {string?} [value]
 * @param {string?} [search_key]
 * @returns {UserCharacter}
 */
function getUser(value, search_key = 'avatar') {
    const { powerUserSettings: power_user } = context();

    if (!value) value = power_user.default_persona;
    if (!value) return null;

    let avatar = '';
    const correctSearchKey = ['avatar', 'name'].includes(search_key);

    if (!correctSearchKey) return null;

    if (search_key === 'avatar') avatar = value;

    if (search_key === 'name')
        avatar = Object
            .entries(power_user.personas)
            .map(([avatar, name]) => {return {name, avatar}})
            .find(per => per.name === value)
            .avatar;

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
 * @returns {{chars: Character[]; user: UserCharacter}}
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

        toDiscard.push(...muted_members);

        for (const member of members) {
            if (member) chars.push(member);
        }
    }

    if (chid) {
        const character = characters[chid];
        const alreadyInList = chars.some(c => c.avatar === character.avatar);

        if (character && !alreadyInList) chars.push(character);
    }

    const members = {chars, user};
    const discardUnique = new Set(toDiscard).values().toArray();

    members.chars = members.chars.filter(c => !discardUnique.includes(c.avatar));

    return members;
}

/**
 * Creates or populates elements
 * @param {string|HTMLElement} elem
 * @param {{class?:string; attr?:Object; data?:Object; innerHTML?: string; innerText?: string}} [options]
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

    element.classList.add(...(classes.split(' ')));

    if (options.innerHTML) element.innerHTML = options.innerHTML ?? '';
    if (options.innerText) element.innerText = options.innerText ?? '';

    return element;
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
    @param {number} selectEnd
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

    !chunks.selected ?
        $span.html(`${chunks.start}<span class="fake-caret"></span>${chunks.end}`) :
        $span.html(`${chunks.start}<span class="fake-selection">${chunks.selected}</span>${chunks.end}`);
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

function saveMetadataSafe() {
    saveChatDebounced.cancel();
    saveChatDebounced();
}

function renderStatusesSafe() {
    renderStatusesDebounced.cancel();
    renderStatusesDebounced();
}

/**
 * Renders the status block of the selected character in the last message from the character rendered in the chat log.
 * @param {Status} status
 */
// MARK:Render Char Status
async function renderCharStatus(status) {
    $(`#chat .stat-us-maximus-custom-css[char-target="${status.avatar}"]`).remove();

    if (status.last_mes_id < 0) return;

    /** @type {string} */
    const character = status.is_user ?
        powerUserSettings.personas[status.avatar] :
        characters.find(char => char.avatar === status.avatar).name;

    if (!character) return;

    status.refreshPosition();

    const lastMess = $(`#chat .mes[mesid="${status.last_mes_id}"][is_user="${status.is_user}"]`).last();

    if (!lastMess?.length) return;

    const statusBlock = (await HTML_TEMPLATES.get('chatStatus')).clone();
    const entryBlockTemplate = (await HTML_TEMPLATES.get('chatStatusEntry')).clone();

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
        .find('.stat-us-maximus-toolbar .menu_button.fa-pen')
        .data({avatar: status.avatar});

    const entries = Object
        .entries(status.entries)
        .sort(([uidA, entryA], [uidB, entryB]) => entryA.display_position - entryB.display_position);

    for (const [uid, entry] of entries) {
        /** @type {StatusEntry} */
        const {key, separator, values, value_uid, enabled} = entry;
        const entryBlock = entryBlockTemplate.clone();

        const macro = CUSTOM_MACROS[extensionSettings.editNumbersFromChat ? 'getInputs' : 'getValues'];

        const titleClean = macro(key, character);
        const separatorClean = lodash.escape(substituteParams(separator));
        let valueClean = macro(values[value_uid].value, character);

        if (extensionSettings.editNumbersFromChat) valueClean = valueClean.replaceAll("<br>", "\n");

        $(entryBlock).find('.status-title').html(`<span class="d-inline">${titleClean}</span>`);
        $(entryBlock).find('.status-separator').html(separatorClean);
        $(entryBlock).find('.status-description').html(`<span class="d-inline">${valueClean}</span>`);

        $(entryBlock)
            .find('.kill-switch')
            .addClass(enabled ? 'fa-toggle-on' : 'fa-toggle-off')
            .data({avatar: status.avatar, uid, enabled});

        $(entryBlock)
            .toggleClass('disabled', !enabled);

        $(entryBlock)
            .find('.fake-inputs-container')
            .data({avatar: status.avatar, uid, value_uid});

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
    const statuses = SillyTavern[metadataName].getStatuses();

    for (const status of statuses)
        await renderCharStatus(status);
}

const saveChatDebounced = lodash.debounce(saveChat, debounceTimeout.MED);
const renderStatusesDebounced = lodash.debounce(renderStatuses, debounceTimeout.MED);
const updateCaretDisplayDebounced = lodash.debounce(updateCaretDisplay, debounceTimeout.MICRO);

/**
 * Init extension
 */
function initExtension() {
    SillyTavern[metadataName] = {
        getStatuses: function() {
            let statuses = context().chatMetadata[metadataName];

            if (!statuses) statuses = [];

            statuses = statuses.map(status => status instanceof Status ? status : new Status(status));

            context().chatMetadata[metadataName] = statuses;

            return statuses;
        },

        getStatus: function(avatar) {
            /** @type {Status[]} */
            let statuses = SillyTavern[metadataName].getStatuses();

            if (!statuses) return false;

            const status = statuses.find(s => s.avatar === avatar);

            return !status ? false : status;
        },

        openPopupSingle: openSingleStatusPopup,
        renderStatuses,
        renderStatusesSafe
    };
}

// * MARK:Extension Settings

const settingsCallbacks = {
    /**	Triggers on enabled setting change. */
    enabled: () => {
        // Nothing by the moment
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

$(async function() {

    if (!context().extensionSettings[extensionFullName]) {
        context().extensionSettings[extensionFullName] = structuredClone(defaultSettings);
    }

    for (const key of Object.keys(defaultSettings)) {
        if (context().extensionSettings[extensionFullName][key] === undefined) {
            context().extensionSettings[extensionFullName][key] = defaultSettings[key];
        }
    }

    await loadSettingsMenu();
    initExtension();
    registerEvents();
    initPopupTriggers();
});