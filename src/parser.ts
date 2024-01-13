import {
  Clause,
  FullClause,
  FullPhrase,
  Modifier,
  Phrase,
  Predicate,
  Preposition,
  Sentence,
} from "./ast.ts";
import { UnreachableError, UnrecognizedError } from "./error.ts";
import { Output } from "./output.ts";
import {
  CONTENT_WORD,
  PREPOSITION,
  PREVERB,
  SPECIAL_SUBJECT,
} from "./vocabulary.ts";

type ValueRest<T> = { value: T; rest: string };
type ParserOutput<T> = Output<ValueRest<T>>;
class Parser<T> {
  constructor(public readonly parser: (src: string) => ParserOutput<T>) {}
  map<U>(mapper: (x: T) => U): Parser<U> {
    return new Parser((src) =>
      this.parser(src).flatMap(({ value, rest }) => {
        try {
          return new Output([{ value: mapper(value), rest }]);
        } catch (error) {
          if (error instanceof Error) {
            return new Output(error);
          } else {
            throw error;
          }
        }
      })
    );
  }
  with<U>(parser: Parser<U>): Parser<U> {
    return sequence(this, parser).map(([_, output]) => output);
  }
  skip<U>(parser: Parser<U>): Parser<T> {
    return sequence(this, parser).map(([output, _]) => output);
  }
}
function match(regex: RegExp): Parser<RegExpMatchArray> {
  const newRegex = new RegExp("^" + regex.source, regex.flags);
  return new Parser((src) => {
    const match = src.match(newRegex);
    if (match) {
      return new Output([{ value: match, rest: src.slice(match[0].length) }]);
    } else if (src === "") {
      return new Output(new UnreachableError());
    } else {
      const token = src.match(/(.*)(?:\s|$)/)?.[1];
      if (token) {
        return new Output(new UnrecognizedError(`"${token}"`));
      } else {
        return new Output(new UnreachableError());
      }
    }
  });
}
function nothing(): Parser<null> {
  return new Parser((src) => new Output([{ value: null, rest: src }]));
}
function eol(): Parser<null> {
  return new Parser((src) => {
    if (src === "") {
      return new Output([{ value: null, rest: "" }]);
    } else {
      return new Output(new UnrecognizedError(`"${src}"`));
    }
  });
}
function lazy<T>(parser: () => Parser<T>): Parser<T> {
  return new Parser((src) => parser().parser(src));
}
function choice<T>(...choices: Array<Parser<T>>): Parser<T> {
  return new Parser((src) =>
    new Output(choices).flatMap((parser) => parser.parser(src))
  );
}
function optional<T>(parser: Parser<T>): Parser<null | T> {
  return choice(parser, nothing());
}
function sequence<T extends Array<unknown>>(
  ...sequence: { [I in keyof T]: Parser<T[I]> } & { length: T["length"] }
): Parser<T> {
  // We resorted to using `any` types here, make sure it works properly
  return new Parser((src) =>
    sequence.reduce(
      (output, parser) =>
        output.flatMap(({ value, rest }) =>
          parser.parser(rest).map(({ value: newValue, rest }) => ({
            value: [...value, newValue],
            rest,
          }))
        ),
      new Output<ValueRest<any>>([{ value: [], rest: src }]),
    )
  );
}
function many<T>(parser: Parser<T>): Parser<Array<T>> {
  return choice(
    nothing().map(() => []),
    sequence(parser, lazy(() => many(parser))).map((
      [first, rest],
    ) => [first, ...rest]),
  );
}
function manyAtLeastOnce<T>(parser: Parser<T>): Parser<Array<T>> {
  return sequence(parser, many(parser)).map(([first, rest]) => [
    first,
    ...rest,
  ]);
}
function allSpace(): Parser<string> {
  return match(/\s*/).map(([space]) => space);
}
function word(): Parser<string> {
  return match(/([a-z]+)\s*/).map(([_, word]) => word);
}
function properWords(): Parser<string> {
  return manyAtLeastOnce(match(/([A-Z][a-z]*)\s*/).map(([_, word]) => word))
    .map(
      (array) => array.join(" "),
    );
}
function wordFrom(set: Set<string>, description: string): Parser<string> {
  return word().map((word) => {
    if (set.has(word)) {
      return word;
    } else {
      throw new UnrecognizedError(`"${word}" as ${description}`);
    }
  });
}
function specificWord(thatWord: string): Parser<string> {
  return word().map((thisWord) => {
    if (thatWord === thisWord) {
      return thisWord;
    } else {
      throw new UnrecognizedError(`"${thisWord}" instead of "${word}"`);
    }
  });
}
function headWord(): Parser<string> {
  return wordFrom(CONTENT_WORD, "headword");
}
function modifier(): Parser<Modifier> {
  return choice(
    specificWord("nanpa")
      .with(fullPhrase())
      .map((phrase) => ({
        type: "nanpa ordinal",
        phrase,
      })),
    wordFrom(CONTENT_WORD, "modifier").map(
      (word) => ({
        type: "word",
        word,
      } as Modifier),
    ),
    properWords().map((words) => ({
      type: "proper words",
      words,
    })),
    specificWord("pi")
      .with(fullPhrase())
      .map((phrase) => ({
        type: "pi",
        phrase,
      })),
    // TODO: cardinal modifier
  );
}
function phrase(): Parser<Phrase> {
  return sequence(headWord(), many(modifier())).map(
    ([headWord, modifiers]) => ({
      headWord,
      modifiers,
    }),
  );
}
function fullPhrase(): Parser<FullPhrase> {
  return sequence(
    optional(wordFrom(PREVERB, "preverb")),
    lazy(phrase),
  ).map(([preverb, phrase]) => {
    if (preverb) {
      return {
        type: "preverb",
        preverb,
        phrase,
      };
    } else {
      return {
        type: "default",
        phrase,
      };
    }
  });
}
function preposition(): Parser<Preposition> {
  return sequence(wordFrom(PREPOSITION, "preposition"), fullPhrase()).map(
    ([preposition, phrase]) => ({
      preposition,
      phrase,
    }),
  );
}
function enPhrases(): Parser<Array<FullPhrase>> {
  return sequence(
    fullPhrase(),
    many(specificWord("en").with(fullPhrase())),
  ).map(([first, rest]) => [first, ...rest]);
}
function predicate(): Parser<Predicate> {
  return choice(
    preposition().map((preposition) => ({ type: "preposition", preposition })),
    fullPhrase().map(
      (predicate) => ({ type: "default", predicate } as Predicate),
    ),
  );
}
function clause(): Parser<Clause> {
  return choice(
    sequence(
      wordFrom(SPECIAL_SUBJECT, "mi/sina subject"),
      predicate(),
      many(specificWord("li").with(predicate())),
      many(preposition()),
    ).map(([subject, predicate, morePredicates, prepositions]) => ({
      type: "li clause",
      subjects: [
        { type: "default", phrase: { headWord: subject, modifiers: [] } },
      ],
      predicates: [predicate, ...morePredicates],
      prepositions,
    })),
    manyAtLeastOnce(preposition()).map((prepositions) => ({
      type: "prepositions",
      prepositions,
    })),
    enPhrases().map(
      (phrases) => ({
        type: "en phrases",
        phrases,
      } as Clause),
    ),
    enPhrases()
      .skip(specificWord("o"))
      .map((phrases) => ({
        type: "o vocative",
        phrases,
      })),
    sequence(
      enPhrases(),
      manyAtLeastOnce(specificWord("li").with(predicate())),
      many(preposition()),
    ).map(([subjects, predicates, prepositions]) => ({
      type: "li clause",
      subjects,
      predicates,
      prepositions,
    })),
    sequence(
      optional(enPhrases()),
      manyAtLeastOnce(specificWord("o").with(predicate())),
      many(preposition()),
    ).map(([subjects, predicates, prepositions]) => ({
      type: "o clause",
      subjects: subjects ?? [],
      predicates,
      prepositions,
    })),
  );
}
function fullClause(): Parser<FullClause> {
  return sequence(optional(specificWord("taso")), clause()).map(
    ([taso, clause]) => ({
      taso: !!taso,
      clause,
    }),
  );
}
function sentence(): Parser<Sentence> {
  return choice(
    fullClause().map(
      (clause) => ({ type: "single clause", clause } as Sentence),
    ),
    sequence(fullClause().skip(specificWord("la")), lazy(sentence)).map(
      ([left, right]) => ({ type: "la clauses", left, right }),
    ),
  );
}
function fullSentence(): Parser<Sentence> {
  return allSpace()
    .with(sentence())
    .skip(optional(match(/\./)))
    .skip(allSpace())
    .skip(eol());
}
export function parser(src: string): Output<Sentence> {
  return fullSentence()
    .parser(src)
    .map(({ value }) => value);
}
