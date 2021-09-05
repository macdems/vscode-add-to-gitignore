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

function getPatterns(root: string, pathname: string) {
    pathname = pathname.substr(root.length + 1, pathname.length);
    const basename = path.basename(pathname);
    const ext = path.extname(pathname);
    let isdir = false;
    try {
        isdir = fs.lstatSync(pathname).isDirectory();
    } catch {}
    if (!pathname.startsWith("/")) {
        pathname = "/" + pathname;
    }
    if (ext && !isdir) {
        let dirname = path.dirname(pathname);
        if (dirname === "." || dirname === "/") {
            dirname = "";
        }
        return [basename, `*${ext}`, pathname, `${dirname}/*${ext}`];
    } else {
        return [basename, pathname];
    }
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
    } catch {}
    await writeFile(ignorePath, pattern + "\n", { flag: "a" });
    await showIgnoreFile(ignorePath);
}

export async function addFileToGitIgnore(uri: vscode.Uri) {
    const root = getRoot(uri.path);
    if (!root) {
        return;
    }
    const patterns = getPatterns(root, uri.path);
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

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand("addToGitignore.addFileToGitIgnore", addFileToGitIgnore));
}

export function deactivate() {}
