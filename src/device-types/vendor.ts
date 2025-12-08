export interface SecretPattern {
    pattern: RegExp;
    context: string;
    captureGroup: number;
}

export interface Vendor {
    name: string;
    passwordPromptPatterns: string[];
    paginationPromptPatterns: string[];
    promptPatterns?: RegExp[];
    secretPatterns: SecretPattern[];
    subSessionCommandPatterns?: RegExp[];
    subSessionSuccessPatterns?: RegExp[];
    subSessionFailurePatterns?: RegExp[];
}
