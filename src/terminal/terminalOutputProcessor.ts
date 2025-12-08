/**
 * Terminal Output Processor
 * Handles terminal control sequences (carriage returns, backspaces, ANSI escapes)
 * to produce clean output for LLM consumption
 */

export class TerminalOutputProcessor {
    /**
     * Process terminal control sequences to show actual visible output
     * Handles: carriage returns, backspaces, line clearing, cursor movement
     */
    static processControlSequences(output: string): string {
        const lines: string[] = [];
        let currentLine = '';
        let cursorColumn = 0;

        for (let i = 0; i < output.length; i++) {
            const char = output[i];

            switch (char) {
                case '\r':
                    // Carriage return - reset cursor to start of line
                    cursorColumn = 0;
                    break;

                case '\n':
                    // Newline - save current line and start new one
                    lines.push(currentLine);
                    currentLine = '';
                    cursorColumn = 0;
                    break;

                case '\b':
                case '\x7f':
                    // Backspace or DEL - move cursor back and delete character
                    if (cursorColumn > 0) {
                        currentLine = currentLine.slice(0, cursorColumn - 1) +
                                     currentLine.slice(cursorColumn);
                        cursorColumn--;
                    }
                    break;

                case '\x1b':
                    // ANSI escape sequence
                    i = this.skipAnsiEscape(output, i);
                    break;

                default:
                    // Regular character - insert at cursor position
                    if (this.isPrintable(char)) {
                        if (cursorColumn >= currentLine.length) {
                            currentLine += char;
                        } else {
                            currentLine = currentLine.slice(0, cursorColumn) +
                                        char +
                                        currentLine.slice(cursorColumn + 1);
                        }
                        cursorColumn++;
                    }
                    break;
            }
        }

        // Add final line if not empty
        if (currentLine.length > 0) {
            lines.push(currentLine);
        }

        return lines.join('\n');
    }

    /**
     * Skip over ANSI escape sequence and return new position
     */
    private static skipAnsiEscape(text: string, startPos: number): number {
        let i = startPos + 1;

        if (i >= text.length) {
            return startPos;
        }

        // CSI sequences: ESC [ ... (letter)
        if (text[i] === '[') {
            i++;
            while (i < text.length && !this.isAnsiTerminator(text[i])) {
                i++;
            }
            return i;
        }

        // OSC sequences: ESC ] ... ST or BEL
        if (text[i] === ']') {
            i++;
            while (i < text.length) {
                if (text[i] === '\x07') { // BEL
                    return i;
                }
                if (text[i] === '\x1b' && text[i + 1] === '\\') { // ST
                    return i + 1;
                }
                i++;
            }
            return i - 1;
        }

        // Other escape sequences (ESC followed by single char)
        return i;
    }

    /**
     * Check if character terminates ANSI sequence
     */
    private static isAnsiTerminator(char: string): boolean {
        const code = char.charCodeAt(0);
        return (code >= 64 && code <= 126); // @ through ~
    }

    /**
     * Check if character is printable
     */
    private static isPrintable(char: string): boolean {
        const code = char.charCodeAt(0);
        return code >= 32 && code < 127;
    }

    /**
     * Strip ANSI escape sequences from text
     */
    static stripAnsiCodes(text: string): string {
        return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                   .replace(/\x1b\][^\x07]*\x07/g, '')
                   .replace(/\x1b\][^\x1b]*\x1b\\/g, '');
    }
}
