/**
 * Input Processor Module
 * Handles terminal input processing including ANSI escape sequences
 */

export class InputProcessor {
    private visibleCommandLine = '';
    private inputBuffer = '';

    /**
     * Get the current visible command line (after processing ANSI sequences)
     */
    getVisibleCommandLine(): string {
        return this.visibleCommandLine;
    }

    /**
     * Get the raw input buffer
     */
    getRawInputBuffer(): string {
        return this.inputBuffer;
    }

    /**
     * Clear the command line and input buffer
     */
    clear(): void {
        this.visibleCommandLine = '';
        this.inputBuffer = '';
    }

    /**
     * Process input data, handling ANSI escape sequences
     * Updates the visible command line to reflect what the user actually sees
     */
    processInput(data: string): void {
        for (let i = 0; i < data.length; i++) {
            const char = data[i];
            const code = data.charCodeAt(i);

            // Handle ANSI escape sequences
            if (char === '\x1b') {
                i = this.skipEscapeSequence(data, i);
                continue;
            }

            // Carriage return - move to start of line
            if (char === '\r') {
                this.visibleCommandLine = '';
                this.inputBuffer += char;
                continue;
            }

            // Newline - clear line
            if (char === '\n') {
                this.visibleCommandLine = '';
                this.inputBuffer += char;
                continue;
            }

            // Backspace (Ctrl+H or DEL) - remove last character
            if (code === 8 || code === 127) {
                this.visibleCommandLine = this.visibleCommandLine.slice(0, -1);
                this.inputBuffer += char;
                continue;
            }

            // Ctrl+U - clear line
            if (code === 21) {
                this.visibleCommandLine = '';
                this.inputBuffer += char;
                continue;
            }

            // Ctrl+W - delete last word
            if (code === 23) {
                const match = this.visibleCommandLine.match(/^(.*?)\s*\S*$/);
                if (match) {
                    this.visibleCommandLine = match[1];
                }
                this.inputBuffer += char;
                continue;
            }

            // Regular printable character
            this.visibleCommandLine += char;
            this.inputBuffer += char;
        }
    }

    /**
     * Skip ANSI escape sequence and return the new index
     */
    private skipEscapeSequence(data: string, startIndex: number): number {
        let i = startIndex + 1; // Skip the ESC character

        if (i >= data.length) {
            return i;
        }

        // Check for CSI (Control Sequence Introducer) - ESC [
        if (data[i] === '[') {
            i++;
            // Skip until we find the final character (a letter)
            while (i < data.length) {
                const code = data.charCodeAt(i);
                // Final character is typically @ through ~
                if (code >= 64 && code <= 126) {
                    return i;
                }
                i++;
            }
        }
        // Check for OSC (Operating System Command) - ESC ]
        else if (data[i] === ']') {
            i++;
            // Skip until we find BEL or ST (ESC \)
            while (i < data.length) {
                if (data[i] === '\x07') { // BEL
                    return i;
                }
                if (data[i] === '\x1b' && i + 1 < data.length && data[i + 1] === '\\') {
                    return i + 1;
                }
                i++;
            }
        }
        // Other escape sequences (e.g., ESC ( or ESC ))
        else {
            return i; // Skip one more character
        }

        return i;
    }
}
