import {
    substituteParams,
    extensionName,
    extensionSettings,
    createElement,
    generateUUID,
    t
} from "../../index.js";
import { MacroValueType } from "/scripts/macros/macro-system.js";

export {
    CUSTOM_MACROS
};

const detectNestedMacro = /\{\{(text|number|boolean|range)(::[\s\S]*)?\}\}/g;

/**
 * @readonly
 * @enum {string}
 */
const DefMacroValue = Object.freeze({
    STRING: '',
    TRUE: 'true',
    FALSE: 'false',
    NUMBER: '0',
    RANGE_MIN: '0',
    RANGE_MAX: '100',
    RANGE_STEP: '1'
});

const CUSTOM_MACROS = {
    /**
     * @param {string} text
     * @param {string} charName
     * @returns {string}
     */
    getValues: (text, charName) => substituteParams(text, {
        dynamicMacros: {
            'name': {
                handler: function() {
                    return charName;
                }
            },
            'text': {
                handler: function({args: [text], resolve}) {
                    if (!text) return DefMacroValue.STRING;

                    const hasNestedMacro = text.match(detectNestedMacro)?.length > 0;

                    if (hasNestedMacro) {
                        toastr.error(`${t`You can't nest input macros - macro:`} {{text}}`, extensionName);
                        return text;
                    }

                    return resolve(text);
                },
                unnamedArgs: [{
                    name: 'value',
                    defaultValue: DefMacroValue.STRING,
                    optional: true
                }],
                delayArgResolution: true
            },
            'number': {
                handler: function({args: [number], resolve}) {
                    const hasNestedMacro = number.match(detectNestedMacro)?.length > 0;

                    if (hasNestedMacro) {
                        toastr.error(`${t`You can't nest input macros - macro:`} {{number}}`, extensionName);
                        return DefMacroValue.NUMBER;
                    }

                    const numberClean = Number(resolve(number));

                    if (isNaN(numberClean)) return DefMacroValue.NUMBER;

                    return number;
                },
                unnamedArgs: [{
                    name: 'value',
                    defaultValue: DefMacroValue.NUMBER,
                    optional: true
                }],
                delayArgResolution: true
            },
            'boolean': {
                handler: function({args: [value, trueText, falseText], resolve}) {
                    const result = resolve(value) === 'true' ? trueText : falseText;
                    const hasNestedMacro = result.match(detectNestedMacro)?.length > 0;

                    if (hasNestedMacro) {
                        toastr.error(`${t`You can't nest input macros - macro:`} {{boolean}}`, extensionName);
                        return DefMacroValue.FALSE;
                    }

                    return resolve(result);
                },
                unnamedArgs: [{
                    name: 'value',
                    defaultValue: DefMacroValue.TRUE,
                    optional: true
                }, {
                    name: 'truetext',
                    defaultValue: DefMacroValue.TRUE,
                    optional: true
                }, {
                    name: 'falsetext',
                    defaultValue: DefMacroValue.FALSE,
                    optional: true
                }],
                delayArgResolution: true
            },
            'range': {
                handler: function({args: [min, max, step, value], resolve}) {
                    let hasNestedMacro = false;

                    for (const arg of [min, max, step, value]) {
                        hasNestedMacro = arg.match(detectNestedMacro)?.length > 0;

                        if (hasNestedMacro) break;
                    }

                    if (hasNestedMacro) {
                        toastr.error(`${t`You can't nest input macros - macro:`} {{range}}`, extensionName);
                        return DefMacroValue.RANGE_MAX;
                    }

                    const minClean = Number(resolve(min));
                    const maxClean = Number(resolve(max));
                    const stepClean = Number(resolve(step));
                    const valueClean = Number(resolve(value));

                    if (isNaN(minClean) || isNaN(maxClean) || isNaN(stepClean) || isNaN(valueClean))
                        return DefMacroValue.RANGE_MAX;

                    const filteredMax = Math.min(valueClean, maxClean);
                    const valueFiltered = Math.max(filteredMax, minClean);

                    return String(valueFiltered);
                },
                unnamedArgs: [{
                    name: 'min',
                    defaultValue: DefMacroValue.RANGE_MIN,
                    optional: true
                }, {
                    name: 'max',
                    defaultValue: DefMacroValue.RANGE_MAX,
                    optional: true
                }, {
                    name: 'step',
                    defaultValue: DefMacroValue.RANGE_STEP,
                    optional: true
                }, {
                    name: 'value',
                    defaultValue: DefMacroValue.RANGE_MAX,
                    optional: true
                }],
                delayArgResolution: true
            }
        }
    }),

    /**
     * @param {string} text
     * @param {string} charName
     * @returns {string}
     */
    getInputs: (text, charName) => substituteParams(text, {
        dynamicMacros: {
            'name': {
                handler: function() {
                    return charName;
                }
            },
            'text': {
                handler: function({args: [text], rawOriginal}) {
                    if (!text) text = DefMacroValue.STRING;

                    const hasNestedMacro = text.match(detectNestedMacro)?.length > 0;

                    if (hasNestedMacro) {
                        toastr.error(`${t`You can't nest input macros - macro:`} {{text}}`, extensionName);
                        text = DefMacroValue.STRING;
                    }

                    const spanAttr = {};
                    const inputId = generateUUID();

                    if (!text) spanAttr['data-empty'] = '';

                    const textarea = createElement('textarea', {
                        class: 'fake-input chat-input-editor mw-unset input-value-source',
                        attr: { autocomplete: 'off', tabindex: '-1', id: inputId },
                        data: { type: 'text', original: rawOriginal },
                        innerText: text.replaceAll('{{noop}}', '')
                    });

                    const span = createElement('span', {
                        class: `value fake-input-span text-line text-quote ${extensionSettings.showWhiteSpaces ? 'show-spaces' : ''}`,
                        attr: { ...spanAttr },
                        data: { inputId },
                        innerText: text.replaceAll('{{noop}}', '')
                    });

                    return `${textarea.outerHTML}${span.outerHTML}`;
                },
                unnamedArgs: [{
                    name: 'value',
                    defaultValue: DefMacroValue.STRING,
                    optional: true
                }],
                delayArgResolution: true
            },
            'number': {
                handler: function({args: [number], rawOriginal, resolve}) {
                    const hasNestedMacro = number.match(detectNestedMacro)?.length > 0;

                    if (hasNestedMacro) {
                        toastr.error(`${t`You can't nest input macros - macro:`} {{number}}`, extensionName);
                        number = DefMacroValue.NUMBER;
                    }

                    let numberClean = Number(resolve(number));
                    const inputId = generateUUID();

                    if (isNaN(numberClean)) numberClean = Number(DefMacroValue.NUMBER);

                    const numberInput = createElement('input', {
                        class: 'fake-input chat-input-editor input-value-source',
                        attr: { type: 'text', value: numberClean, inputmode: 'decimal', autocomplete: 'off', id: inputId },
                        data: { type: 'number', pattern: '^-?\\d+\\.?\\d*$', original: rawOriginal }
                    });

                    const arrowDec = createElement('span', {
                        class: 'fa-solid fa-caret-left m-0 chat-input-icon select-none opacity-60',
                        data: { direction: -1 }
                    });

                    const arrowInc = createElement('span', {
                        class: 'fa-solid fa-caret-right m-0 chat-input-icon select-none',
                        data: { direction: 1 }
                    });

                    const buttonsHolder = createElement('span', {
                        class: 'text-line d-inline-flex gap-0 text-body cursor-pointer fake-input-arrows fs-normal no-select',
                        data: { inputId },
                        innerHTML: `${arrowDec.outerHTML}${arrowInc.outerHTML}`
                    });

                    const span = createElement('span', {
                        class: 'text-line text-quote value fake-input-span font-monospace cursor-pointer',
                        data: { inputId },
                        innerText: String(numberClean)
                    });

                    return `${numberInput.outerHTML}${span.outerHTML} ${buttonsHolder.outerHTML}`;
                },
                unnamedArgs: [{
                    name: 'value',
                    defaultValue: DefMacroValue.NUMBER,
                    optional: true
                }],
                delayArgResolution: true
            },
            'boolean': {
                handler: function({args: [value, trueText, falseText], rawOriginal, resolve}) {
                    let hasNestedMacro = false;

                    for (const arg of [value, trueText, falseText]) {
                        hasNestedMacro = arg.match(detectNestedMacro)?.length > 0;

                        if (hasNestedMacro) break;
                    }

                    if (hasNestedMacro) {
                        toastr.error(`${t`You can't nest input macros - macro:`} {{boolean}}`, extensionName);
                        value = DefMacroValue.FALSE;
                        trueText = DefMacroValue.TRUE;
                        falseText = DefMacroValue.FALSE;
                    }

                    const checked = resolve(value) === 'true';
                    const trueValue = resolve(trueText);
                    const falseValue = resolve(falseText);
                    const result = checked ? trueValue : falseValue;
                    const checkboxAttr = {};
                    const inputId = generateUUID();

                    if (checked) checkboxAttr.checked = '';

                    const checkbox = createElement('input', {
                        class: 'd-inline-flex flex-center chat-input-editor m-0 input-value-source',
                        attr: { type: 'checkbox', id: inputId, ...checkboxAttr },
                        data: { type: 'boolean', original: rawOriginal }
                    });

                    const span = createElement('span', {
                        class: 'text-line text-quote value fake-input-span font-monospace',
                        data: { trueValue, falseValue, inputId },
                        innerText: result
                    });

                    return `${checkbox.outerHTML} ${span.outerHTML}`;
                },
                unnamedArgs: [{
                    name: 'value',
                    defaultValue: DefMacroValue.TRUE,
                    optional: true
                }, {
                    name: 'truetext',
                    defaultValue: DefMacroValue.TRUE,
                    optional: true
                }, {
                    name: 'falsetext',
                    defaultValue: DefMacroValue.FALSE,
                    optional: true
                }],
                delayArgResolution: true
            },
            'range': {
                handler: function({args: [min, max, step, value], rawOriginal, resolve}) {
                    let hasNestedMacro = false;

                    for (const arg of [min, max, step, value]) {
                        hasNestedMacro = arg.match(detectNestedMacro)?.length > 0;

                        if (hasNestedMacro) break;
                    }

                    if (hasNestedMacro) {
                        toastr.error(`${t`You can't nest input macros - macro:`} {{range}}`, extensionName);
                        min = DefMacroValue.RANGE_MIN;
                        max = DefMacroValue.RANGE_MAX;
                        step = DefMacroValue.RANGE_STEP;
                        value = DefMacroValue.RANGE_MAX;
                    }

                    let minClean = Number(resolve(min));
                    let maxClean = Number(resolve(max));
                    let stepClean = Number(resolve(step));
                    let valueClean = Number(resolve(value));

                    if (isNaN(minClean)) minClean = Number(DefMacroValue.RANGE_MIN);
                    if (isNaN(maxClean)) maxClean = Number(DefMacroValue.RANGE_MAX);
                    if (isNaN(stepClean)) stepClean = Number(DefMacroValue.RANGE_STEP);
                    if (isNaN(valueClean)) valueClean = Number(DefMacroValue.RANGE_MAX);

                    const filteredMax = Math.min(valueClean, maxClean);
                    const valueFiltered = Math.max(filteredMax, minClean);
                    const inputId = generateUUID();

                    const range = createElement('input', {
                        class: 'chat-input-editor',
                        attr: { type: 'range', min: minClean, max: maxClean, step: stepClean, value: valueFiltered },
                        data: { type: 'range', inputId }
                    });

                    const numberInput = createElement('input', {
                        class: 'fake-input chat-input-editor input-value-source',
                        attr: { type: 'text', min: minClean, max: maxClean, step: stepClean, value: valueFiltered, inputmode: 'decimal', autocomplete: 'off', id: inputId },
                        data: { type: 'range', pattern: '^-?\\d+\\.?\\d*$', original: rawOriginal }
                    });

                    const arrowDec = createElement('span', {
                        class: 'fa-solid fa-caret-left m-0 chat-input-icon select-none opacity-60',
                        data: { direction: -1 }
                    });

                    const arrowInc = createElement('span', {
                        class: 'fa-solid fa-caret-right m-0 chat-input-icon select-none',
                        data: { direction: 1 }
                    });

                    const buttonsHolder = createElement('span', {
                        class: 'text-line d-inline-flex gap-0 text-body cursor-pointer fake-input-arrows fs-normal no-select',
                        data: { inputId },
                        innerHTML: `${arrowDec.outerHTML}${arrowInc.outerHTML}`
                    });

                    const span = createElement('span', {
                        class: 'text-line text-quote value fake-input-span font-monospace cursor-pointer',
                        data: { inputId },
                        innerText: String(valueFiltered)
                    });

                    return `${numberInput.outerHTML}${range.outerHTML} ${buttonsHolder.outerHTML} ${span.outerHTML}`;
                },
                unnamedArgs: [{
                    name: 'min',
                    defaultValue: DefMacroValue.RANGE_MIN,
                    optional: true
                }, {
                    name: 'max',
                    defaultValue: DefMacroValue.RANGE_MAX,
                    optional: true
                }, {
                    name: 'step',
                    defaultValue: DefMacroValue.RANGE_STEP,
                    optional: true
                }, {
                    name: 'value',
                    defaultValue: DefMacroValue.RANGE_MAX,
                    optional: true
                }],
                delayArgResolution: true
            }
        }
    }),

    /**
     * @param {string} text
     * @returns {string}
     */
    getIndexes: (text) => substituteParams(text, {
        dynamicMacros: {
            'text': {
                handler: function() {
                    return '{{TEXT}}';
                },
                unnamedArgs: [{
                    name: 'value',
                    defaultValue: DefMacroValue.STRING,
                    optional: true
                }],
                delayArgResolution: true
            },
            'number': {
                handler: function() {
                    return '{{NUMBER}}';
                },
                unnamedArgs: [{
                    name: 'value',
                    defaultValue: DefMacroValue.NUMBER,
                    optional: true
                }],
                delayArgResolution: true
            },
            'boolean': {
                handler: function() {
                    return '{{BOOLEAN}}';
                },
                unnamedArgs: [{
                    name: 'value',
                    defaultValue: DefMacroValue.TRUE,
                    optional: true
                }, {
                    name: 'truetext',
                    defaultValue: DefMacroValue.TRUE,
                    optional: true
                }, {
                    name: 'falsetext',
                    defaultValue: DefMacroValue.FALSE,
                    optional: true
                }],
                delayArgResolution: true
            },
            'range': {
                handler: function() {
                    return '{{RANGE}}';
                },
                unnamedArgs: [{
                    name: 'min',
                    defaultValue: DefMacroValue.RANGE_MIN,
                    optional: true
                }, {
                    name: 'max',
                    defaultValue: DefMacroValue.RANGE_MAX,
                    optional: true
                }, {
                    name: 'step',
                    defaultValue: DefMacroValue.RANGE_STEP,
                    optional: true
                }, {
                    name: 'value',
                    defaultValue: DefMacroValue.RANGE_MAX,
                    optional: true
                }],
                delayArgResolution: true
            }
        }
    })
}