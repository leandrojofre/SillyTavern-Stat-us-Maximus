# Stat-us Maximus
Have you ever wanted to keep track of your characters' status? Like...whatever you need. Here's the solution!
This extension adds a menu per character to have your notes, it is basically a shortcut for lorebooks (it even has a similar menu), but it gets saved per chat file and has a little more features than lorebooks.

**This is still in development! Please submit any bug you find and feature you want! Either as a GitHub issue or through the ST Discord.**

<img width="100%" src="https://github.com/user-attachments/assets/66bb967f-76b7-4b32-a0ce-bebbe818abe9">
<img width="100%" src="https://github.com/user-attachments/assets/bca7f694-d641-4278-87e1-d095590404e3">
<img width="100%" src="https://github.com/user-attachments/assets/7c41659b-3c4c-4844-86fb-cb25284c59d7">
<img width="100%" src="https://github.com/user-attachments/assets/9957bd95-1d02-4cbe-92c3-0ee991958767">

## Features
- When you open a chat, a status will be added for every character present (either now or in the past).
- From the magic wand button (left to the input bar), you can open a menu to manage every character status.
- In single chats, you can open the status menu for a single character from the Character Managment menu (right menu).
- In group chats, click the member avatar in the Current Members dropdown to open it's status menu.
- In all chats, click the pen icon inside the status table placed in the last character message.
- A table with all of the character stats will be added in the last message of the character.
- The table can be collapsed to save space (the collapsed state saves).
- Every character status is sent to the chat in a dynamic depth that will adjust to be on top of the last character message.
- The status can be send as system, user or assistant - default system.

### Slash Commands
- `/stum-create-entry` Creates an entry in the status of a character and returns its UID. If the character is not found in the metadata, it returns false.
- `/stum-get-entry-uid` Get an entry uid by pairing a Character status field against a value, returning the uid of the first match. If no match is found, an empty string is returned.
- `/stum-set-entry-field` Updates the value of the Status Entry field of a Character.
- `/stum-get-entry-field` Get the value of the Status Entry field of a Character. If no match is found, an empty string is returned.
- `/stum-delete-entry` Deletes an Status Entry from a Character.
- `/stum-switch-entry-value` Switches the entry value by one of the entry alt values.
- `/stum-create-alt-entry-value` Adds a new alt value to the selected entry. Returns the alt value uid.
- `/stum-get-alt-entry-uid` Get the UID of an alt entry value by pairing a field against a value, returning the uid of the first match. If no match is found, an empty string is returned.
- `/stum-set-alt-entry-field` Updates the field value of one of the Status Entry alt descriptions.
- `/stum-get-alt-entry-field` Get the field value of one of the alt entry values. If no match is found, an empty string is returned.
- `/stum-delete-alt-entry` Deletes an alt value within a status entry.
- `/stum-delete-chat-status` It will wipe all status stored in the chat metadata - only applies to open chat.
- `/stum-fill-missing-metadata` It will fill missing values in the metadata structure - WARN This is a dev command used for bug fixing, only use it if instructed to do so by a developer.

### Coming Soon
- [X] Slash commands for adding/updating/deleting status entries.
- [X] Slash command for switching between entries alt values.
- [ ] Update ugly chat UI.
- [ ] Shade closed entry drawers in popup menus.
- [ ] Setting to disable confirm deletion popups.
- [ ] Setting for default status role.
- [ ] Per-user open status-menu buttons.
- [ ] Button to delete status metadata per character.
- [ ] Expand/collapse all entries per character in popup menus.
- [ ] Status transfer button in popup menus.
- [ ] Status block prefix/suffix in popup menus.
- [ ] Custom depth buttons - dynamic depth if undefined.
- [ ] Labels for input buttons in popup menus.

## Installation
Install the extension using this link: ```https://github.com/leandrojofre/SillyTavern-Stat-us-Maximus.git```

### Compatibility
- This extension might not work with **kaldigo**'s Tracker.
- The same as above with **cierru**'s Stepped Thinking.
Is not that it **won't** because it probably does work, but the UI might get cluttered (I don't use those extensions and this was not tested with their UIs). Please, let me know if this work with those extensions to remove this warning.

## Support and Contributions
- My to-do list is overflowing, feel free to submit a PR with the feature you want! Make sure to read the **rules**.

## Contribution Rules
- Always PR to the `staging` branch.
- Use the `staging` branch as the source of you working branch.
- Nothing else really, enjoy.
