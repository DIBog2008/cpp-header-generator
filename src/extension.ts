import * as vscode from 'vscode';

interface FunctionInfo {
    name: string;
    returnType: string;
    args: string;
    line: number;
}

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('cpp-header-generator.generate', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Откройте файл C++');
            return;
        }

        const document = editor.document;
        const text = document.getText();
        const functions = parseFunctions(text);

        if (functions.length === 0) {
            vscode.window.showInformationMessage('Функции вне namespace не найдены.');
            return;
        }

        let headerText = '#pragma once\n\n';
        functions.forEach(f => {
            headerText += `${f.returnType} ${f.name}(${f.args});\n\n`;
        });

        const currentFilePath = document.uri.fsPath;
        const newFilePath = currentFilePath.replace(/\.(cpp|cc|cxx)$/, '_functions.h');
        const newFileUri = vscode.Uri.file(newFilePath);

        try {
            await vscode.workspace.fs.writeFile(newFileUri, Buffer.from(headerText, 'utf8'));
            
            vscode.window.showInformationMessage(`Файл создан: ${newFilePath}`);
            
            const doc = await vscode.workspace.openTextDocument(newFileUri);
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            vscode.window.showErrorMessage(`Ошибка при создании файла: ${error}`);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}

function parseFunctions(text: string): FunctionInfo[] {
    const result: FunctionInfo[] = [];
    const seenSignatures = new Set<string>(); 
    const lines = text.split('\n');
    
    let namespaceDepth = 0;
    let isInComment = false;

    const funcRegex = /^\s*([a-zA-Z_][a-zA-Z0-9_:<>*&]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(\{|;)/;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];

        if (line.includes('//')) {
            line = line.substring(0, line.indexOf('//'));
        }
        
        if (line.includes('/*')) {
            isInComment = true;
        }
        if (line.includes('*/')) {
            isInComment = false;
            continue;
        }
        if (isInComment) continue;

        let openBraces = (line.match(/\{/g) || []).length;
        let closeBraces = (line.match(/\}/g) || []).length;

        if (line.includes('namespace')) {
            namespaceDepth += openBraces;
            namespaceDepth -= closeBraces;
            continue; 
        }

        if (namespaceDepth > 0) {
            namespaceDepth += openBraces;
            namespaceDepth -= closeBraces;
            continue;
        }

        const match = line.match(funcRegex);
        if (match) {
            const returnType = match[1].trim();
            const name = match[2].trim();
            const args = match[3].trim();
            
            const keywords = ['if', 'while', 'for', 'switch', 'return', 'sizeof', 'main'];
            if (keywords.includes(name)) {
                namespaceDepth += openBraces;
                namespaceDepth -= closeBraces;
                continue;
            }

            const signature = `${returnType} ${name}(${args})`;
            
            if (!seenSignatures.has(signature)) {
                seenSignatures.add(signature);
                result.push({
                    returnType: returnType,
                    name: name,
                    args: args,
                    line: i + 1
                });
            }
        }

        namespaceDepth += openBraces;
        namespaceDepth -= closeBraces;
    }

    return result;
}