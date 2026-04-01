# Change Log

## 1.1.0

- Folder options now includes `/folder/*` pattern useful for keeping the folder but not the content
- Added support for Source Control view. Right click unstaged or untracked files to add them to ignore list.
  - Works in tree view as well. If folder has one file and it's the only one nested deeply (like `/a/b/c/file`) `c` directory will be used.
- Folder options are shown properly. Before: `folder`. After: `folder/`. This ensures to ignore only folder with this name.
- Slight code refactor

## 1.0.0

- Initial release
