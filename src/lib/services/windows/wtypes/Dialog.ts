// if application then spawn window
// yes/no
// open/save file
// ok/cancel

import {
    ask,
    confirm,
    message,
    open,
    save,
    type ConfirmDialogOptions,
    type MessageDialogOptions,
    type MessageDialogResult,
    type OpenDialogOptions,
    type OpenDialogReturn,
    type SaveDialogOptions
} from '@tauri-apps/plugin-dialog';
import { logger } from '$lib/utils';

class DialogWindow {
    public async AskDialog(str: string, options: ConfirmDialogOptions):
        Promise<boolean> {
        const confirmation = await ask(str, options);
        logger.debug("AskDialog: ", str, options, confirmation);
        return confirmation;
    }
    public async ConfirmDialog(str: string, options: ConfirmDialogOptions):
        Promise<boolean> {
        const confirmation = await confirm(str, options);
        logger.debug("ConfirmDialog: ", str, options);
        return confirmation;
    }
    public async MessageDialog(str: string, options: MessageDialogOptions):
        Promise<MessageDialogResult> {
        const confirmation = await message(str, options);
        logger.debug("MessageDialog: ", str, options);
        return confirmation;
    }
    public async OpenDialog<T extends OpenDialogOptions>(options: T):
        Promise<OpenDialogReturn<T>> {
        const file = await open(options);
        logger.debug("OpenDialog: ", options, file);
        return file;
    }
    public async SaveDialog(options: SaveDialogOptions): Promise<string | null> {
        const filePath = await save(options);
        logger.debug("SaveDialog", options, filePath);
        return filePath;
    }
}

const Dialog = {
    ask: (str: string, options: ConfirmDialogOptions) =>
        new DialogWindow().AskDialog(str, options),
    confirm: (str: string, options: ConfirmDialogOptions) =>
        new DialogWindow().ConfirmDialog(str, options),
    message: (str: string, options: MessageDialogOptions) =>
        new DialogWindow().MessageDialog(str, options),
    open: (options: OpenDialogOptions): Promise<OpenDialogReturn<OpenDialogOptions>> =>
        new DialogWindow().OpenDialog(options),
    save: (options: SaveDialogOptions): Promise<string | null> =>
        new DialogWindow().SaveDialog(options)
}

export default Dialog;
