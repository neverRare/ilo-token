import {
  Clause,
  FullClause,
  Modifier,
  MultiplePhrases,
  MultiplePredicates,
  Phrase,
  Preposition,
  Quotation,
  Sentence,
  WordUnit,
} from "./ast.ts";
import {
  CoveredError,
  UnexpectedError,
  UnreachableError,
  UnrecognizedError,
} from "./error.ts";
import { Output } from "./output.ts";
import {
  CONTENT_WORD,
  PREPOSITION,
  PREVERB,
  SPECIAL_SUBJECT,
} from "./vocabulary.ts";
import {
  CLAUSE_RULE,
  filter,
  FULL_CLAUSE_RULE,
  MODIFIER_RULES,
  MODIFIERS_RULES,
  PHRASE_RULE,
  PREPOSITION_RULE,
  SENTENCES_RULE,
  WORD_UNIT_RULES,
} from "./filter.ts";
import {
  allAtLeastOnce,
  choice,
  lazy,
  lookAhead,
  many,
  manyAtLeastOnce,
  optional,
  Parser,
  sequence as rawSequence,
} from "./parser-lib.ts";

export type AstParser<T> = Parser<string, T>;

/** Takes all parsers and applies them one after another. */
// Had to redeclare this function, Typescript really struggles with inferring
// types when using `sequence`.
function sequence<T extends Array<unknown>>(
  ...sequence: { [I in keyof T]: AstParser<T[I]> } & { length: T["length"] }
): AstParser<T> {
  // deno-lint-ignore no-explicit-any
  return rawSequence<string, T>(...sequence as any);
}
/**
 * Uses Regular Expression to create parser. The parser outputs
 * RegExpMatchArray, which is what `string.match( ... )` returns.
 */
function match(
  regex: RegExp,
  description: string,
): AstParser<RegExpMatchArray> {
  const newRegex = new RegExp("^" + regex.source, regex.flags);
  return new Parser((src) => {
    const match = src.match(newRegex);
    if (match !== null) {
      return new Output([{ value: match, rest: src.slice(match[0].length) }]);
    } else if (src === "") {
      return new Output(new UnexpectedError("end of sentence", description));
    } else {
      const token = src.match(/[^\s]*/)?.[0];
      if (token !== undefined) {
        return new Output(new UnexpectedError(`"${token}"`, description));
      } else {
        throw new UnreachableError();
      }
    }
  });
}
/** Parses the end of line (or the end of sentence in context of Toki Pona) */
function eol(): AstParser<null> {
  return new Parser((src) => {
    if (src === "") return new Output([{ value: null, rest: "" }]);
    else return new Output(new UnexpectedError(`"${src}"`, "end of sentence"));
  });
}
/** Parses comma. */
function comma(): AstParser<string> {
  return match(/,\s*/, "comma").map(() => ",");
}
/** Parses an optional comma. */
function optionalComma(): AstParser<null | string> {
  return optional(comma());
}
/** Parses lowercase word. */
function word(): AstParser<string> {
  return match(/([a-z]+)\s*/, "word").map(([_, word]) => word);
}
/**
 * Parses all at least one uppercase words and combines them all into single
 * string. This function is exhaustive like `all`.
 */
function properWords(): AstParser<string> {
  return allAtLeastOnce(
    match(/([A-Z][a-z]*)\s*/, "proper word").map(([_, word]) => word),
  ).map(
    (array) => array.join(" "),
  );
}
/** Parses word only from `set`. */
function wordFrom(set: Set<string>, description: string): AstParser<string> {
  return word().filter((word) => {
    if (set.has(word)) {
      return true;
    } else {
      throw new UnrecognizedError(`"${word}" as ${description}`);
    }
  });
}
/** Parses a specific word. */
function specificWord(thatWord: string): AstParser<string> {
  return word().filter((thisWord) => {
    if (thatWord === thisWord) return true;
    else throw new UnexpectedError(`"${thisWord}"`, `"${thatWord}"`);
  });
}
/** Parses word unit without numbers. */
function wordUnit(word: AstParser<string>): AstParser<WordUnit> {
  return choice(
    word.then((word) =>
      manyAtLeastOnce(specificWord(word)).map((words) => ({
        type: "reduplication",
        word,
        count: words.length + 1,
      } as WordUnit))
    ),
    word.then((word) => specificWord("ala").with(specificWord(word))).map((
      word,
    ) => ({ type: "x ala x", word } as WordUnit)),
    word.map((word) => ({ type: "default", word } as WordUnit)),
  ).filter(filter(WORD_UNIT_RULES));
}
/** Parses number words in order. */
function number(): AstParser<Array<string>> {
  return sequence(
    many(choice(specificWord("ale"), specificWord("ali"))),
    many(specificWord("mute")),
    many(specificWord("luka")),
    many(specificWord("tu")),
    many(specificWord("wan")),
  ).map((array) => {
    const output = array.flat();
    if (output.length >= 2) {
      return output;
    } else {
      throw new CoveredError();
    }
  });
}
/** Parses multiple modifiers */
function modifiers(): AstParser<Array<Modifier>> {
  return sequence(
    many(
      choice(
        wordUnit(wordFrom(CONTENT_WORD, "modifier")).map((word) => ({
          type: "default",
          word,
        } as Modifier)).filter(filter(MODIFIER_RULES)),
        properWords().map((
          words,
        ) => ({ type: "proper words", words } as Modifier)).filter(
          filter(MODIFIER_RULES),
        ),
        number().map((
          numbers,
        ) => ({
          type: "default",
          word: { type: "numbers", numbers },
        } as Modifier)).filter(filter(MODIFIER_RULES)),
        quotation().map((
          quotation,
        ) => ({ type: "quotation", quotation } as Modifier)).filter(
          filter(MODIFIER_RULES),
        ),
      ),
    ),
    many(
      sequence(wordUnit(specificWord("nanpa")), phrase()).map((
        [nanpa, phrase],
      ) => ({
        type: "nanpa",
        nanpa,
        phrase,
      } as Modifier)).filter(filter(MODIFIER_RULES)),
    ),
    many(
      specificWord("pi").with(phrase()).map((phrase) => ({
        type: "pi",
        phrase,
      } as Modifier)).filter(filter(MODIFIER_RULES)),
    ),
  ).map((
    [modifiers, nanpaModifiers, piModifiers],
  ) => [...modifiers, ...nanpaModifiers, ...piModifiers]).filter(
    filter(MODIFIERS_RULES),
  );
}
/** Parses phrases including preverbial phrases. */
function phrase(): AstParser<Phrase> {
  return choice(
    sequence(number(), lazy(modifiers)).map((
      [numbers, modifiers],
    ) => ({
      type: "default",
      headWord: { type: "numbers", numbers },
      modifiers,
    } as Phrase)),
    sequence(
      wordUnit(wordFrom(PREVERB, "preverb")),
      lazy(modifiers),
      lazy(phrase),
    ).map((
      [preverb, modifiers, phrase],
    ) => ({
      type: "preverb",
      preverb,
      modifiers,
      phrase,
    } as Phrase)),
    lazy(preposition).map((preposition) => ({
      type: "preposition",
      preposition,
    } as Phrase)),
    sequence(
      wordUnit(wordFrom(CONTENT_WORD, "headword")),
      lazy(modifiers),
    ).map(([headWord, modifiers]) => ({
      type: "default",
      headWord,
      modifiers,
    } as Phrase)),
    quotation().map((
      quotation,
    ) => ({ type: "quotation", quotation } as Phrase)),
  ).filter(filter(PHRASE_RULE));
}
/**
 * Parses nested phrases with given nesting rule, only accepting the top level
 * operation.
 */
function nestedPhrasesOnly(
  nestingRule: Array<"en" | "li" | "o" | "e" | "anu">,
): AstParser<MultiplePhrases> {
  if (nestingRule.length === 0) {
    return phrase().map(
      (phrase) => ({ type: "single", phrase } as MultiplePhrases),
    );
  } else {
    const [first, ...rest] = nestingRule;
    let type: "and conjunction" | "anu";
    if (["en", "li", "o", "e"].indexOf(first) !== -1) {
      type = "and conjunction";
    } else {
      type = "anu";
    }
    return sequence(
      nestedPhrases(rest),
      manyAtLeastOnce(
        optionalComma().with(specificWord(first)).with(
          nestedPhrases(rest),
        ),
      ),
    ).map(([group, moreGroups]) => ({
      type,
      phrases: [group, ...moreGroups],
    }));
  }
}
/** Parses nested phrases with given nesting rule. */
function nestedPhrases(
  nestingRule: Array<"en" | "li" | "o" | "e" | "anu">,
): AstParser<MultiplePhrases> {
  if (nestingRule.length === 0) {
    return phrase().map(
      (phrase) => ({ type: "single", phrase } as MultiplePhrases),
    );
  } else {
    return choice(
      nestedPhrasesOnly(nestingRule),
      nestedPhrases(nestingRule.slice(1)),
    );
  }
}
/** Parses phrases separated by _en_ or _anu_. */
function subjectPhrases(): AstParser<MultiplePhrases> {
  return choice(
    nestedPhrasesOnly(["en", "anu"]),
    nestedPhrasesOnly(["anu", "en"]),
    phrase().map((phrase) => ({ type: "single", phrase })),
  );
}
/** Parses prepositional phrase. */
function preposition(): AstParser<Preposition> {
  return sequence(
    wordUnit(wordFrom(PREPOSITION, "preposition")),
    modifiers(),
    nestedPhrases(["anu"]),
  ).map(([preposition, modifiers, phrases]) => ({
    preposition,
    modifiers,
    phrases,
  })).filter(filter(PREPOSITION_RULE));
}
/**
 * Parses associated predicates whose predicates only uses top level operator.
 */
function associatedPredicates(
  nestingRule: Array<"li" | "o" | "anu">,
): AstParser<MultiplePredicates> {
  return sequence(
    nestedPhrasesOnly(nestingRule),
    optional(
      optionalComma().with(specificWord("e")).with(
        nestedPhrases(["e", "anu"]),
      ),
    ),
    many(optionalComma().with(preposition())),
  ).map(([predicates, objects, prepositions]) => {
    if (!objects && prepositions.length === 0) {
      throw new CoveredError();
    } else {
      return {
        type: "associated",
        predicates,
        objects,
        prepositions,
      };
    }
  });
}
/** Parses multiple predicates without _li_ nor _o_ at the beginning. */
function multiplePredicates(
  nestingRule: Array<"li" | "o" | "anu">,
): AstParser<MultiplePredicates> {
  if (nestingRule.length === 0) {
    return choice(
      associatedPredicates([]),
      phrase().map((
        predicate,
      ) => ({ type: "single", predicate } as MultiplePredicates)),
    );
  } else {
    const [first, ...rest] = nestingRule;
    let type: "and conjunction" | "anu";
    if (first === "li" || first === "o") {
      type = "and conjunction";
    } else {
      type = "anu";
    }
    return choice(
      associatedPredicates(nestingRule),
      sequence(
        choice(
          associatedPredicates(nestingRule),
          multiplePredicates(rest),
        ),
        manyAtLeastOnce(
          optionalComma().with(specificWord(first)).with(
            choice(
              associatedPredicates(nestingRule),
              multiplePredicates(rest),
            ),
          ),
        ),
      ).map(([group, moreGroups]) => ({
        type,
        predicates: [group, ...moreGroups],
      } as MultiplePredicates)),
      multiplePredicates(rest),
    );
  }
}
/** Parses a single clause. */
function clause(): AstParser<Clause> {
  return choice(
    sequence(
      wordFrom(SPECIAL_SUBJECT, "mi/sina subject"),
      multiplePredicates(["li", "anu"]),
    ).map(([subject, predicates]) => ({
      type: "li clause",
      subjects: {
        type: "single",
        phrase: {
          type: "default",
          headWord: { type: "default", word: subject },
          alaQuestion: false,
          modifiers: [],
        },
      },
      predicates,
    } as Clause)),
    sequence(
      preposition(),
      many(optionalComma().with(preposition())),
    ).map(([preposition, morePreposition]) => ({
      type: "prepositions",
      prepositions: [preposition, ...morePreposition],
    } as Clause)),
    subjectPhrases().map((phrases) => {
      if (phrases.type === "single" && phrases.phrase.type === "quotation") {
        throw new CoveredError();
      } else {
        return { type: "phrases", phrases } as Clause;
      }
    }),
    subjectPhrases().skip(specificWord("o")).map((phrases) => ({
      type: "o vocative",
      phrases,
    } as Clause)),
    sequence(
      subjectPhrases(),
      optionalComma().with(specificWord("li")).with(
        multiplePredicates(["li", "anu"]),
      ),
    ).map(([subjects, predicates]) => ({
      type: "li clause",
      subjects,
      predicates,
    } as Clause)),
    specificWord("o").with(multiplePredicates(["o", "anu"]))
      .map((predicates) => ({
        type: "o clause",
        subjects: null,
        predicates,
      } as Clause)),
    sequence(
      subjectPhrases(),
      optionalComma().with(specificWord("o")).with(
        multiplePredicates(["o", "anu"]),
      ),
    ).map(([subjects, predicates]) => ({
      type: "o clause",
      subjects: subjects,
      predicates,
    } as Clause)),
    quotation().map((quotation) => ({
      type: "quotation",
      quotation,
    } as Clause)),
  ).filter(filter(CLAUSE_RULE));
}
/** Parses a single clause including precaluse and postclause. */
function fullClause(): AstParser<FullClause> {
  return sequence(
    optional(wordUnit(specificWord("taso")).skip(optionalComma())),
    clause(),
    optional(
      optionalComma().with(specificWord("anu")).with(
        wordUnit(specificWord("seme")),
      ),
    ),
  ).map(([taso, clause, anuSeme]) => ({
    taso,
    anuSeme,
    clause,
  })).filter(filter(FULL_CLAUSE_RULE));
}
/** parses _la_ with optional comma around. */
function la(): AstParser<string> {
  return choice(
    comma().with(specificWord("la")),
    specificWord("la").skip(comma()),
    specificWord("la"),
  );
}
/** Parses a single full sentence with optional punctuations. */
function sentence(): AstParser<Sentence> {
  return sequence(
    fullClause(),
    many(la().with(fullClause())),
    choice(
      eol().map(() => ""),
      lookAhead(closeQuotationMark()).map(() => "").silent(),
      match(/([.,:;?!])\s*/, "punctuation").map(([_, punctuation]) =>
        punctuation
      ),
    ),
  ).map(([clause, moreClauses, punctuation]) => ({
    laClauses: [clause, ...moreClauses],
    punctuation,
  }));
}
/** Parses opening quotation mark */
function openQuotationMark(): AstParser<string> {
  return match(/(["“«「])\s*/, "open quotation mark").map(([_, mark]) => mark);
}
/** Parses closing quotation mark */
function closeQuotationMark(): AstParser<string> {
  return match(/(["”»」])\s*/, "close quotation mark").map(([_, mark]) => mark);
}
/** Parses multiple sentences inside quotation mark */
function quotation(): AstParser<Quotation> {
  return sequence(
    openQuotationMark(),
    many(lazy(sentence)).filter(filter(SENTENCES_RULE)),
    closeQuotationMark(),
  ).map(([leftMark, sentences, rightMark]) => {
    if (leftMark === '"' || leftMark === "“") {
      if (rightMark !== '"' && rightMark !== "”") {
        throw new UnrecognizedError("Mismatched quotation marks");
      }
    } else if (leftMark === "«") {
      if (rightMark !== "»") {
        throw new UnrecognizedError("Mismatched quotation marks");
      }
    } else if (leftMark === "「") {
      if (rightMark !== "」") {
        throw new UnrecognizedError("Mismatched quotation marks");
      }
    } else throw new UnreachableError();
    return { sentences, leftMark, rightMark };
  });
}
/** A multiple Toki Pona sentence parser. */
export function parser(src: string): Output<Array<Sentence>> {
  return match(/\s*/, "space").with(allAtLeastOnce(sentence())).skip(eol())
    .filter(
      filter(SENTENCES_RULE),
    ).parser(src)
    .map(({ value }) => value);
}