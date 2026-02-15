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
const Position = Object.freeze({
    AFTER_PROMPT: 0,
    IN_DEPTH: 1
});

/**
 * @readonly
 * @enum {string}
 */
const AllowedNumericKeys = Object.freeze({
    UP: 'ArrowUp',
    DOWN: 'ArrowDown'
});

/**
 * @readonly
 * @enum {string}
 */
const InputTypes = Object.freeze({
    TEXT: 'text',
    NUMBER: 'number',
    BOOLEAN: 'boolean',
    RANGE: 'range'
});

/**
 * @readonly
 * @enum {string}
 */
const AllowedNumericInputs = Object.freeze({
    NUMBER: InputTypes.NUMBER,
    RANGE: InputTypes.RANGE
});

// * MARK:DOM Listeners

/**
 * @param {HTMLInputElement|HTMLTextAreaElement} inputTrigger
 */
function updateEntryFromInput(inputTrigger) {
    const $container = $(inputTrigger).closest('span.fake-inputs-container[data-field]').first();

    if (!$container.length) return;

    const { avatar, uid, value_uid, field } = $container.data();

    if (!avatar || isNaN(uid)) return;

    /** @type {Status} */
    const status = SillyTavern[metadataName].getStatus(avatar);
    const $inputs = $container.find('.input-value-source');

    if (!status) return;

    /** @type {StatusEntry} */
    const entry = status.entries[uid];

    if (!entry || !entry.values[value_uid]) return;

    const entryValue = field === 'value' ? entry.values[value_uid].value : entry[field];
    let parsedValue = CUSTOM_MACROS.getIndexes(entryValue);

    $inputs.each(function(i, input) {
        const $input = $(input);

        const { type } = $input.data();

        const inputIndex = `{{${String(type).toUpperCase()}}}`;
        let newMacro = '';

        if (type === InputTypes.TEXT || type === InputTypes.NUMBER) {
            const value = $input.val() ?? '';
            const separator = !value ? '' : '::';

            newMacro = `{{${type}${separator + value}}}`;
        }

        if (type === InputTypes.BOOLEAN) {
            const value = $input.prop('checked') ?? true;
            const inputId = $input.attr('id');
            const $span = $(`.fake-input-span[data-input-id="${inputId}"]`);

            const { trueValue, falseValue } = $span.data();

            newMacro = `{{${type}::${value}::${trueValue}::${falseValue}}}`;
        }

        if (type === InputTypes.RANGE) {
            const value = $input.val() ?? 100;
            const min = $input.attr('min') ?? 0;
            const max = $input.attr('max') ?? 100;
            const step = $input.attr('step') ?? 1;

            newMacro = `{{${type}::${min}::${max}::${step}::${value}}}`;
        }

        parsedValue = parsedValue.replace(inputIndex, newMacro);
    });

    entry.set(field, parsedValue, value_uid);
    saveMetadataSafe();
}

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
        updateEntryFromInput($input);
    });

    $input.on('keydown', function(e) {
        e.stopPropagation();
        updateCaretDisplaySafe(input, spanInput);

        lastKeyPressed = e.key;

        const validNumericKey = Object.values(AllowedNumericKeys).includes(lastKeyPressed);

        if (validNumericKey) $input.trigger('input');
    });

    $input.on('input', function(e) {
        e.stopPropagation();

        const { pattern = '', lastValue, type } = $input.data();

        const validNumericKey = Object.values(AllowedNumericKeys).includes(lastKeyPressed);
        const validNumericInput = Object.values(AllowedNumericInputs).includes(type);

        if (!validNumericInput) return updateCaretDisplaySafe(input, spanInput);

        const inputID = $input.attr('id');
        const regex = new RegExp(pattern);
        const currentValue = $input.val();
        let newValue = regex.test(currentValue) ? Number(currentValue) : Number(lastValue);

        if (validNumericKey) {
            const step = $input.attr('step') ?? 1;
            const direction = lastKeyPressed === AllowedNumericKeys.UP ? 1 : -1;
            const nextStep = Number(step) * direction;

            newValue += nextStep;
        }

        if (type === AllowedNumericInputs.RANGE) {
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

/**
 * @param {Event} e
 */
function onRangeSliderMoved(e) {
    e.stopPropagation();

    /** @type {HTMLInputElement} */
    const range = e.currentTarget;
    const $input = $(`#${range.dataset.inputId}`);
    const $span = $(`.fake-input-span[data-input-id="${range.dataset.inputId}"]`);

    $input.val(range.value);
    $span.empty().html(String(range.value));
    updateEntryFromInput($input);
}

/**
 * @param {Event} e
 */
function onClickInputArrow(e) {
    e.stopPropagation();

    const $arrowContainer = $(e.currentTarget);
    const $arrow = $(e.target);

    const { inputId } = $arrowContainer.data();
    const { direction } = $arrow.data();

    if (!direction) return;

    const $input = $(`#${inputId}`);

    const { type } = $input.data();

    const validNumericInput = Object.values(AllowedNumericInputs).includes(type);

    if (!validNumericInput) return;

    const currentValue = Number($input.val());
    let newValue;

    if (type === AllowedNumericInputs.NUMBER) {
        const step = $input.attr('step') ?? 1;
        const nextStep = Number(step) * direction;

        newValue = currentValue + nextStep;
    }

    if (type === AllowedNumericInputs.RANGE) {
        const min = Number($input.attr('min'));
        const max = Number($input.attr('max'));
        const step = Number($input.attr('step'));

        newValue = currentValue + (Number(step) * direction);

        const normalizedFloor = Math.max(newValue, min);
        const normalizedRoof = Math.min(normalizedFloor, max);;

        newValue = normalizedRoof;
        window.requestAnimationFrame(() => {
            $(`input[data-input-id="${inputId}"].chat-input-editor`).val(normalizedRoof);
        });
    }

    $input.val(newValue);
    updateEntryFromInput($input);

    $(`.fake-input-span[data-input-id="${inputId}"]`).text(newValue);
}

/**
 * @param {Event} e
 */
function onCheckboxToggle(e) {
    e.stopPropagation();

    const $input = $(e.currentTarget);
    const inputId = $input.attr('id');
    const inputValue = $input.prop('checked');
    const $span = $(`.fake-input-span[data-input-id="${inputId}"]`);

    const { trueValue, falseValue } = $span.data();

    $span.text(inputValue ? trueValue : falseValue);
    updateEntryFromInput($input);
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
            Position.IN_DEPTH,
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
    $('#chat').on('click', '.stat-us-maximus-chat-drawer .fake-input-arrows', onClickInputArrow);
    $('#chat').on('input', '.stat-us-maximus-chat-drawer .chat-input-editor[type="checkbox"]', onCheckboxToggle);
    $('#chat').on('pointerdown', '.stat-us-maximus-chat-drawer .fake-input-span', onSelectChatInput);
    $('#chat').on('input', '.stat-us-maximus-entry .chat-input-editor[type="range"]', onRangeSliderMoved);

    eventSource.on(eventTypes.CHAT_CHANGED, onChatChanged);

    eventSource.on(eventTypes.MORE_MESSAGES_LOADED, onMessageRendered);
    eventSource.on(eventTypes.USER_MESSAGE_RENDERED, onMessageRendered);
    eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, onMessageRendered);
    eventSource.on(eventTypes.MESSAGE_UPDATED, onMessageRendered);
    eventSource.on(eventTypes.MESSAGE_DELETED, onMessageRendered);

    eventSource.on(eventTypes.GENERATION_AFTER_COMMANDS, onGenerationAfterCommands);
}