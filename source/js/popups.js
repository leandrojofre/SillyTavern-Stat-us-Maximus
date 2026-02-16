import {
    // ST imports
    extension_prompt_roles,
    callGenericPopup,
    POPUP_TYPE,
    t,
    // Normal imports
    metadataName,
    escapeNewlines,
    generateUUID,
    // HTML related
    HTML_TEMPLATES
} from '../../index.js';

import {Status} from '../classes/Status.js';
import {StatusEntry} from '../classes/StatusEntry.js';

export {
    initPopupTriggers
};

/**
 * @template T
 * @typedef {import('./eventListeners.js').EventData<T>} EventData
 */

/**
 * @param {StatusEntry} entry
 * @returns {Promise<JQuery<HTMLElement>>}
 */
async function getStatusEntryPopupBlock(entry) {
    const $statusBlock = $(await HTML_TEMPLATES.get('popupStatusEntry')).clone();

    return $statusBlock;
}

/**
 * @param {string} avatar
 * @returns {Promise<JQuery<HTMLElement>>}
 */
async function getStatusPopupBlock(avatar) {
    /** @type {Status} */
    const status = SillyTavern[metadataName].getStatus(avatar);

    if (!status) return;

    const $statusBlock = $(await HTML_TEMPLATES.get('popupStatus')).clone();
    const $selectRoles = $statusBlock.find('select[name="role"]');
    const $entriesContainer = $statusBlock.find('.status-entries');

    /** @type {[string, StatusEntry][]} */
    const entries = Object
        .entries(status.entries)
        .sort(([uidA, entryA], [uidB, entryB]) => entryA.display_position - entryB.display_position);

    $statusBlock
        .find('.stat-us-maximus-name')
        .text(status.getCharacter().name);

    $statusBlock
        .find('.stat-us-maximus-avatar')
        .attr('src', status.getThumbnail())
        .attr('title', status.avatar);

    for (const [text, value] of Object.entries(extension_prompt_roles)) {
        $('<option>', { text, value }).appendTo($selectRoles);
    }

    $selectRoles.trigger('change');

    $statusBlock
        .find('.status-fields :input.text_pole')
        .each(function(i, input) {
            const $input = $(input);
            const field = $input.attr('name');
            const value = status[field];
            const isString = typeof value === 'string';

            $input
                .data({avatar})
                .val(isString ? escapeNewlines(value) : value)
                .trigger('change');
        });

    for (const [uid, entry] of entries) {
        const $entryBlock = await getStatusEntryPopupBlock(entry);
        const $valuesSelect = $entryBlock.find('select[name="value_uid"]');
        const blockId = `${generateUUID()}_${uid}_entry`;
        const altValues = Object.entries(entry.values);

        for (const [valUid, altValue] of altValues) {
            $('<option>', { text: altValue.title || `UID: ${valUid}`, value: valUid }).appendTo($valuesSelect);
        }

        $valuesSelect.trigger('change');
        $entryBlock.attr('id', blockId);
        $entryBlock
            .find(':input.text_pole')
            .each(function(i, input) {
                const $input = $(input);
                const field = $input.attr('name');
                const isValueField = field === 'title' || field === 'value';
                const value = isValueField ? entry.values[entry.value_uid][field] : entry[field];
                const doEscapeNewlines = typeof value === 'string' && !$input.is('textarea');

                $input
                    .data({uid})
                    .val(doEscapeNewlines ? escapeNewlines(value) : value)
                    .trigger('change');
            });

        $entriesContainer.append($entryBlock);
    }

    return $statusBlock;
}

/**
 * @param {EventData<HTMLImageElement>} e
 */
async function openSingleStatusPopup(e) {
    const img = e.currentTarget;
    const avatar = img.title;

    if (!avatar) return;

    const statusBlock = await getStatusPopupBlock(avatar);

    if (!statusBlock) return;

    await callGenericPopup(statusBlock, POPUP_TYPE.TEXT, "", {
        okButton: t`Close Status`,
        allowVerticalScrolling: true,
        wide: true,
        onClose: async () => {
            statusBlock.remove();
        }
    });
}

function initPopupTriggers() {
    // @ts-ignore
    $('#rm_group_members').on('click', '.avatar img', openSingleStatusPopup);
}