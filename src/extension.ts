import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { promisify } from "util";

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const IGNORE_FILES: { [display: string]: string } = {
    '.gitignore (shared)': '.gitignore',
    '.git/info/exclude (private)': path.join(".git", "info", "exclude")
};

function getRoot(pathname: string) {
    return vscode.workspace.workspaceFolders?.find((f) => pathname.startsWith(f.uri.path))?.uri.fsPath;
}

function isDirectory(pathname: string) {
    try {
        return fs.lstatSync(pathname).isDirectory();
    } catch { }

    return false;
}

function getDirectoryName(pathname: string) {
    if (pathname.length === 0 || pathname === "/") {
        return pathname;
    }

    pathname = path.dirname(pathname);

    if (pathname.length === 1 && (pathname === "/" || pathname === ".")) {
        return "";
    }

    return pathname;
}

function getPatterns(root: string, pathname: string, isDirectory: boolean) {
    pathname = pathname.substring(root.length + 1);

    if (!pathname.startsWith("/")) {
        pathname = "/" + pathname;
    }

    let basename = path.basename(pathname);

    if (isDirectory) {
        if (!pathname.endsWith("/")) {
            pathname += "/";
            basename += "/";
        }

        return [basename, pathname, pathname + "*"];
    }

    const ext = path.extname(pathname);

    if (!ext) {
        return [basename, pathname];
    }

    return [basename, `*${ext}`, pathname, `${getDirectoryName(pathname)}/*${ext}`];
}

async function showIgnoreFile(ignorePath: string, line = -1) {
    const editor = await vscode.window.showTextDocument(vscode.Uri.file(ignorePath));
    if (editor && line >= -1) {
        const range = editor.document.lineAt(line > -1 ? line : editor.document.lineCount - 1).range;
        editor.revealRange(range);

        if (line >= 0) {
            editor.selection = new vscode.Selection(range.start, range.end);
        }
    }
}

function findStringsMismatch(array1: string, array2: string) {
    const minLength = Math.min(array1.length, array2.length);

    for (let i = 0; i < minLength; ++i) {
        if (array1[i] !== array2[i]) {
            return i;
        }
    }

    return minLength;
}

function getFolderFromUris(uris: vscode.Uri[]) {
    let prefix = uris[0].path;

    for (let i = 1; i < uris.length; ++i) {
        const prefix_end = findStringsMismatch(uris[i].path, prefix);

        prefix = prefix.substring(0, prefix_end);
    }

    return vscode.Uri.file(prefix);
}

/**
 * Removes last path element until we hit a directory.
 * This is useful if `getFolderFromUris` caught part of a filename in common part of urls.
 * Example: `/a/b/c.txt` and `/a/b/c.md` files have `/a/b/c` in common but it's not a directory.
*/
function fixFolderPath(pathname: string) {
    while (true) {
        if (pathname.length === 0) {
            break;
        }

        if (isDirectory(pathname)) {
            break;
        }

        pathname = getDirectoryName(pathname);
    }

    return pathname;
}

async function addPathToIgnore(root: string, pattern: string, file = ".gitignore") {
    const ignorePath = path.join(root, file);

    try {
        const ignoreContent = (await readFile(ignorePath)).toString().split(/(?:\r\n|\r|\n)/g);

        const line = ignoreContent.indexOf(pattern);
        if (line !== -1) {
            await showIgnoreFile(ignorePath, line);
            return;
        }

        if (ignoreContent[ignoreContent.length - 1] !== "") {
            pattern = "\n" + pattern;
        }
    } catch { }

    await writeFile(ignorePath, pattern + "\n", { flag: "a" });
    await showIgnoreFile(ignorePath);
}

export async function addItemToGitIgnore(uri: vscode.Uri, isDirectory: boolean) {
    const root = getRoot(uri.path);
    if (!root) {
        return;
    }

    const patterns = getPatterns(root, uri.path, isDirectory);
    const pattern = await vscode.window.showQuickPick(patterns, {
        placeHolder: "Select pattern to add...",
    });
    if (!pattern) {
        return;
    }

    const selected_file = await vscode.window.showQuickPick(Object.keys(IGNORE_FILES), {
        placeHolder: `Select file to add '${pattern}' to...`,
    });
    if (!selected_file) {
        return;
    }

    await addPathToIgnore(root, pattern, IGNORE_FILES[selected_file]);
}

export async function addFileToGitIgnore(uri: vscode.Uri) {
    return addItemToGitIgnore(uri, false);
}

export async function addFolderToGitIgnore(uri: vscode.Uri) {
    return addItemToGitIgnore(uri, true);
}

// VSCode sends an array of files in that folder
// We have to extract the name of directory from them
// Note: if it's a combined folder (like folders `a/b/c/` with files at the deepest level), it will use folder `c` not `a`
export async function addFolderToGitIgnoreFromSCM(...scm_uris: { resourceUri: vscode.Uri }[]) {
    scm_uris = scm_uris.filter(uri => !!uri);

    if (!scm_uris.length || !(scm_uris[0].resourceUri instanceof vscode.Uri)) {
        return;
    }

    let uris = scm_uris.map(uri => uri.resourceUri);

    // Folder has one file in it, just get directory name
    if (uris.length === 1) {
        let path = uris[0].path;
        path = getDirectoryName(path);
        return addFolderToGitIgnore(vscode.Uri.file(path));
    }

    // Folder has multiple files
    // We need to get a common path among them and make sure it's a directory
    let common_path = getFolderFromUris(uris).path;
    common_path = fixFolderPath(common_path);
    return addFolderToGitIgnore(vscode.Uri.file(common_path));
}

export async function addFileToGitIgnoreFromSCM(scm_uri: { resourceUri: vscode.Uri }) {
    if (!scm_uri || !(scm_uri.resourceUri instanceof vscode.Uri)) {
        return;
    }

    return addFileToGitIgnore(scm_uri.resourceUri);
}

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand("addToGitignore.addFolderToGitIgnore", addFolderToGitIgnore));
    context.subscriptions.push(vscode.commands.registerCommand("addToGitignore.addFileToGitIgnore", addFileToGitIgnore));
    context.subscriptions.push(vscode.commands.registerCommand("addToGitignore.addFolderToGitIgnoreFromSCM", addFolderToGitIgnoreFromSCM));
    context.subscriptions.push(vscode.commands.registerCommand("addToGitignore.addFileToGitIgnoreFromSCM", addFileToGitIgnoreFromSCM));
}

export function deactivate() { }
