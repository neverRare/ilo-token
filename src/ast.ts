/** Represents a word unit. */
export type WordUnit =
  | {
    type: "default";
    word: string;
    // emphasis: Array<string>;
  }
  | {
    type: "x ala x";
    word: string;
    // firstEmphasis: Array<string>;
    // secondEmphasis: Array<string>;
  }
  | {
    type: "reduplication";
    word: string;
    count: number;
    // emphasis: Array<string>;
  }
  | {
    type: "numbers";
    numbers: Array<string>;
    // emphasis: Array<string>;
  };
/** Represents a single modifier. */
export type Modifier =
  | { type: "default"; word: WordUnit }
  | { type: "proper words"; words: string }
  | { type: "pi"; phrase: Phrase }
  | { type: "nanpa"; nanpa: WordUnit; phrase: Phrase }
  | { type: "quotation"; quotation: Quotation };
/**
 * Represents a phrase including preverbial phrases, quotations, and
 * prepositional phrases intended for predicate.
 */
export type Phrase =
  | {
    type: "default";
    headWord: WordUnit;
    modifiers: Array<Modifier>;
  }
  | {
    type: "preverb";
    preverb: WordUnit;
    modifiers: Array<Modifier>;
    phrase: Phrase;
  }
  | {
    type: "preposition";
    preposition: Preposition;
  }
  | {
    type: "quotation";
    quotation: Quotation;
  };
/** Represents multiple phrases separated by repeated particle or _anu_. */
export type MultiplePhrases =
  | { type: "single"; phrase: Phrase }
  | {
    type: "and conjunction";
    phrases: Array<MultiplePhrases>;
  }
  | { type: "anu"; phrases: Array<MultiplePhrases> };
/** Represents a single prepositional phrase. */
export type Preposition = {
  preposition: WordUnit;
  modifiers: Array<Modifier>;
  /** This cannot be an "and conjunction": only "anu" or "single". */
  phrases: MultiplePhrases;
};
/** Represents multiple predicates. */
export type MultiplePredicates =
  | { type: "single"; predicate: Phrase }
  | {
    type: "associated";
    predicates: MultiplePhrases;
    objects: null | MultiplePhrases;
    prepositions: Array<Preposition>;
  }
  | { type: "and conjunction"; predicates: Array<MultiplePredicates> }
  | { type: "anu"; predicates: Array<MultiplePredicates> };
/** Represents a simple clause. */
export type Clause =
  | { type: "phrases"; phrases: MultiplePhrases }
  | {
    type: "o vocative";
    phrases: MultiplePhrases;
  }
  | {
    type: "li clause";
    subjects: MultiplePhrases;
    predicates: MultiplePredicates;
  }
  | {
    type: "o clause";
    subjects: null | MultiplePhrases;
    predicates: MultiplePredicates;
  }
  | {
    type: "prepositions";
    prepositions: Array<Preposition>;
  }
  | {
    type: "quotation";
    quotation: Quotation;
  };
/** Represents a clause including preclause and postclause. */
export type FullClause = {
  taso: null | WordUnit;
  anuSeme: null | WordUnit;
  clause: Clause;
};
/** Represents a single full sentence. */
export type Sentence = { laClauses: Array<FullClause>; punctuation: string };
/** Represents quotation. */
export type Quotation = {
  sentences: Array<Sentence>;
  leftMark: string;
  rightMark: string;
};
