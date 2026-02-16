import {
    // ST imports
    callGenericPopup,
    POPUP_TYPE,
    t,
    // Normal imports
    metadataName,
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