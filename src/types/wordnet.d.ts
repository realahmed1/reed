declare module "wordnet" {
  interface WordNetDefinition {
    glossary: string;
  }

  interface WordNet {
    init(databaseDirectory?: string): Promise<void>;
    lookup(word: string, skipPointers?: boolean): Promise<WordNetDefinition[]>;
  }

  const wordnet: WordNet;
  export = wordnet;
}
