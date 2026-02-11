import { substituteParams, extensionName, error, t } from "../../index.js";
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
     * @param {boolean?} [replaceInputs]
     * @returns {string}
     */
    getValues: (text, charName, replaceInputs = true) => substituteParams(text, {
        dynamicMacros: {
            'name': {
                handler: function() {
                    return charName;
                }
            },
            'text': {
                handler: function({args: [text], rawOriginal, resolve}) {
                    if (!replaceInputs) return rawOriginal;
                    if (!text) return '';

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
                handler: function({args: [number], rawOriginal, resolve}) {
                    if (!replaceInputs) return rawOriginal;

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
                handler: function({args: [value, trueText, falseText], rawOriginal, resolve}) {
                    if (!replaceInputs) return rawOriginal;

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
                handler: function({args: [min, max, step, value], rawOriginal, resolve}) {
                    if (!replaceInputs) return rawOriginal;

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
    })
}