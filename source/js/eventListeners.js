import {
    eventSource,
    eventTypes,
    metadataName,
    getActiveParticipants,
    extension_prompt_roles,
    setExtensionPrompt,
    context,
    extensionSettings,
    generateUUID,
    log,
    saveMetadataSafe,
    // HTML Related
    updateCaretDisplaySafe,
    getSelectedTextInElem,
    renderCaret
} from "../../index.js";

import { Status } from "../classes/Status.js";
import { StatusEntry } from "../classes/StatusEntry.js";
import { CUSTOM_MACROS } from "./macros.js";

export {
    registerEvents
};

/**
 * @readonly
 * @enum {number}
 */
const position = Object.freeze({
    AFTER_PROMPT: 0,
    IN_DEPTH: 1
});

/**
 * @readonly
 * @enum {string}
 */
const allowedNumericKeys = Object.freeze({
    UP: 'ArrowUp',
    DOWN: 'ArrowDown'
});

/**
 * @readonly
 * @enum {string}
 */
const allowedNumericInputs = Object.freeze({
    RANGE: 'range',
    NUMBER: 'number'
});

// * MARK:DOM Listeners

/**
 * @param {Event} e
 */
function onToggleEntry(e) {
    const entrySwitch = $(e.currentTarget);
    const { avatar, enabled, uid } = entrySwitch.data();
    const nextState = !enabled;

    /** @type {Status} */
    const status = SillyTavern[metadataName].getStatus(avatar);

    if (!status) return;

    /** @type {StatusEntry} */
    const entry = status.entries[uid];

    if (!entry) return;

    entry.set('enabled', nextState);
    entrySwitch
        .data({enabled: nextState})
        .toggleClass('fa-toggle-on', nextState)
        .toggleClass('fa-toggle-off', !nextState)
        .closest('.stat-us-maximus-entry')
        .toggleClass('disabled', !nextState);

    saveMetadataSafe();
}

/**
 * @param {Event} e
 */
function onCollapseStatus(e) {
    const drawerHeader = $(e.currentTarget);
    const { avatar } = drawerHeader.data();

    /** @type {Status} */
    const status = SillyTavern[metadataName].getStatus(avatar);

    if (!status) return;

    const doClose = drawerHeader
        .find('.inline-drawer-icon')
        .hasClass('up');

    status.set('is_collapsed', doClose);
    saveMetadataSafe();
}

/**
 * @param {Event} e
 */
function onSelectChatInputFinish(e) {
    /** @type {HTMLSpanElement} */
    const spanInput = e.data.spanInput;

    if (!spanInput) return;

    /** @type {HTMLInputElement|HTMLTextAreaElement} */
    const input = document.getElementById(spanInput.dataset.inputId);
    const $input = $(input);
    const selection = getSelectedTextInElem(spanInput);
    let lastKeyPressed = '';

    $input.data('lastValue', $input.val());
    $input.one('focus', () => updateCaretDisplaySafe(input, spanInput));
    $input.one('blur', function() {
        $input.off('input');
        $input.off('keydown');
        renderCaret(spanInput, spanInput.textContent, -1);
    });

    $input.on('keydown', function(e) {
        e.stopPropagation();
        updateCaretDisplaySafe(input, spanInput);

        lastKeyPressed = e.key;

        const validNumericKey = Object.values(allowedNumericKeys).includes(lastKeyPressed);

        if (validNumericKey) $input.trigger('input');
    });

    $input.on('input', function(e) {
        e.stopPropagation();

        const { pattern = '', lastValue, type } = $input.data();

        const validNumericKey = Object.values(allowedNumericKeys).includes(lastKeyPressed);
        const validNumericInput = Object.values(allowedNumericInputs).includes(type);

        if (!validNumericInput) return updateCaretDisplaySafe(input, spanInput);

        const inputID = $input.attr('id');
        const regex = new RegExp(pattern);
        const currentValue = $input.val();
        let newValue = regex.test(currentValue) ? Number(currentValue) : Number(lastValue);

        log(newValue, currentValue, lastValue, regex.test(currentValue));

        if (validNumericKey) {
            const step = $input.attr('step') ?? 1;
            const direction = lastKeyPressed === allowedNumericKeys.UP ? 1 : -1;
            const nextStep = Number(step) * direction;

            newValue += nextStep;
        }

        if (type === allowedNumericInputs.RANGE) {
            const min = Number($input.attr('min'));
            const max = Number($input.attr('max'));
            const step = Number($input.attr('step'));
            const normalizedFloor = Math.max(newValue, min);
            const normalizedRoof = Math.min(normalizedFloor, max);
            const normalizedValue = normalizedRoof - (normalizedRoof % step);

            newValue = normalizedValue;

            window.requestAnimationFrame(() => {
                $input.val(normalizedValue);
                $(`input[data-input-id="${inputID}"].chat-input-editor`).val(normalizedValue);
            });
        }

        $input.val(newValue);
        $input.data('lastValue', newValue);
        updateCaretDisplaySafe(input, spanInput);
    });

    input.setSelectionRange(selection.start, selection.end);
    input.focus();
}

/**
 * @param {Event} e
 */
function onSelectChatInput(e) {
    const spanInput = e.currentTarget;

    if (!spanInput) return;

    $(document).one('pointerup', { spanInput }, onSelectChatInputFinish);
}

// * MARK:ST Listeners

function onMessageRendered() {
    log('onMessageRendered');

    /** @type {Function} */
    const renderer = SillyTavern[metadataName].renderStatusesSafe;

    renderer();
}

function onChatChanged() {
    log(eventTypes.CHAT_CHANGED);

    /** @type {Function} */
    const renderer = SillyTavern[metadataName].renderStatusesSafe;

    renderer();
}

function onGenerationAfterCommands() {
    log(eventTypes.GENERATION_AFTER_COMMANDS);

    const { extensionPrompts: extension_prompts } = context();

    for (const key of Object.keys(extension_prompts)) {
        if (key.includes(metadataName)) delete extension_prompts[key];
    }

    const characters = getActiveParticipants().chars;
    const macro = CUSTOM_MACROS.getValues;

    for (const char of characters) {
        /** @type {Status} */
        const status = SillyTavern[metadataName].getStatus(char.avatar);

        if (!status) continue;

        const entries = Object.values(status.entries)
        .sort((a, b) => a.display_position - b.display_position)
        .map(function(entry) {
            /** @type {StatusEntry} */
            const { enabled, key, separator, values, value_uid } = entry;
            let text = '';

            if (!enabled) return text;
            if (key) text += macro(key, char.name);
            if (separator) text += separator;

            const value = values[value_uid]?.value;

            if (value) text += macro(value, char.name);

            return text;
        });

        const uuid = generateUUID();
        const prompt = status.prefix + entries.join(status.separator) + status.suffix;

        setExtensionPrompt(
            uuid,
            macro(prompt, char.name),
            position.IN_DEPTH,
            extensionSettings.minPromptDepth,
            true,
            status.role
        );
    }
}

// * MARK:Init Listeners

function registerEvents() {
    $('#chat').on('click', '.stat-us-maximus-toolbar', function(e){
        e.stopPropagation();
    });

    $('#chat').on('pointerdown', '.stat-us-maximus-chat-drawer .fake-selection', function(e){
        e.stopPropagation();
    });

    $('#chat').on('click', '.stat-us-maximus-entry .kill-switch', onToggleEntry);
    $('#chat').on('click', '.stat-us-maximus-chat-drawer .inline-drawer-header', onCollapseStatus);
    $('#chat').on('pointerdown', '.stat-us-maximus-chat-drawer .fake-input-span', onSelectChatInput);

    eventSource.on(eventTypes.CHAT_CHANGED, onChatChanged);

    eventSource.on(eventTypes.MORE_MESSAGES_LOADED, onMessageRendered);
    eventSource.on(eventTypes.USER_MESSAGE_RENDERED, onMessageRendered);
    eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, onMessageRendered);
    eventSource.on(eventTypes.MESSAGE_UPDATED, onMessageRendered);
    eventSource.on(eventTypes.MESSAGE_DELETED, onMessageRendered);

    eventSource.on(eventTypes.GENERATION_AFTER_COMMANDS, onGenerationAfterCommands);
}