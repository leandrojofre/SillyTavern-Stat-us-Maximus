import {
    // ST imports
    extension_prompt_roles,
    callGenericPopup,
    POPUP_TYPE,
    t,
    // Normal imports
    metadataName,
    escapeNewlines,
    // HTML related
    HTML_TEMPLATES
} from '../../index.js';

import {Status} from '../classes/Status.js';

export {
    initPopupTriggers
};

/**
 * @template T
 * @typedef {import('./eventListeners.js').EventData<T>} EventData
 */

/**
 * @param {string} avatar
 * @returns {Promise<JQuery<HTMLElement>>}
 */
async function getStatusPopupBlock(avatar) {
    /** @type {Status} */
    const status = SillyTavern[metadataName].getStatus(avatar);

    if (!status) return;

    const $statusBlock = $(await HTML_TEMPLATES.get('popupStatus')).clone();

    $statusBlock
        .find('.stat-us-maximus-name')
        .text(status.getCharacter().name);

    $statusBlock
        .find('.stat-us-maximus-avatar')
        .attr('src', status.getThumbnail())
        .attr('title', status.avatar);

    const $selectRoles = $statusBlock.find('select[name="role"]');

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
                .val(isString ? escapeNewlines(value) : value)
                .trigger('change');
        });

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