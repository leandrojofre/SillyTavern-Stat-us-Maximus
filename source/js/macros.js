import { substituteParams, t } from "../../index.js";

export {
    CUSTOM_MACROS
};

const detectNestedMacro = /\{\{(text|number|boolean|range)(::[\s\S]*)?\}\}/g;

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

                    const hasNestedMacro = text.match(detectNestedMacro)?.length > 0;

                    if (hasNestedMacro) {
                        toastr.error(`${t`You can't nest input macros - macro:`} {{text}}`, 'Stat-Us Maximus');
                        return text;
                    }

                    return resolve(text);
                },
                unnamedArgs: [{
                    name: 'value',
                    defaultValue: ''
                }],
                delayArgResolution: true
            },
            'number': {
                handler: function({args: [number], rawOriginal, resolve}) {
                    if (!replaceInputs) return rawOriginal;

                    const hasNestedMacro = number.match(detectNestedMacro)?.length > 0;

                    if (hasNestedMacro) {
                        toastr.error(`${t`You can't nest input macros - macro:`} {{number}}`, 'Stat-Us Maximus');
                        return number;
                    }

                    const numberClean = Number(resolve(number));

                    if (isNaN(numberClean)) return '0';

                    return number;
                },
                unnamedArgs: [{
                    name: 'value',
                    defaultValue: '0'
                }],
                delayArgResolution: true
            },
            'boolean': {
                handler: function({args: [value, trueText, falseText], rawOriginal, resolve}) {
                    if (!replaceInputs) return rawOriginal;

                    const result = value === 'true' ? trueText : falseText;
                    const hasNestedMacro = result.match(detectNestedMacro)?.length > 0;

                    if (hasNestedMacro) {
                        toastr.error(`${t`You can't nest input macros - macro:`} {{boolean}}`, 'Stat-Us Maximus');
                        return String(value === 'true');
                    }

                    return resolve(result);
                },
                unnamedArgs: [{
                    name: 'value',
                    defaultValue: 'true'
                }, {
                    name: 'truetext',
                    defaultValue: 'true'
                }, {
                    name: 'falsetext',
                    defaultValue: 'false'
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
                        toastr.error(`${t`You can't nest input macros - macro:`} {{range}}`, 'Stat-Us Maximus');
                        return value;
                    }

                    const minClean = Number(resolve(min));
                    const maxClean = Number(resolve(max));
                    const stepClean = Number(resolve(step));
                    const valueClean = Number(resolve(value));

                    if (isNaN(minClean) || isNaN(maxClean) || isNaN(stepClean) || isNaN(valueClean))
                        return value;

                    const filteredMax = Math.min(valueClean, maxClean);
                    const valueFiltered = Math.max(filteredMax, minClean);

                    return String(valueFiltered);
                },
                unnamedArgs: [{
                    name: 'min',
                    defaultValue: '0'
                }, {
                    name: 'max',
                    defaultValue: '100'
                }, {
                    name: 'step',
                    defaultValue: '1'
                }, {
                    name: 'value',
                    defaultValue: '100'
                }],
                delayArgResolution: true
            }
        }
    })
}