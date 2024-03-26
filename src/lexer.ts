import { Output } from "./output.ts";
import {
  UnexpectedError,
  UnreachableError,
  UnrecognizedError,
} from "./error.ts";
import {
  all,
  allAtLeastOnce,
  choiceOnlyOne,
  error,
  lazy,
  Parser,
  sequence as rawSequence,
} from "./parser-lib.ts";
import { TokenTree } from "./token-tree.ts";
import { CoveredError } from "./error.ts";
import { settings } from "./settings.ts";
import {
  COMBINING_CARTOUCHE_EXTENSION,
  END_OF_CARTOUCHE,
  START_OF_CARTOUCHE,
  UCSUR_TO_LATIN,
} from "./ucsur.ts";

export type Lexer<T> = Parser<string, T>;

const VOWEL = /[aeiou]/;
const MORAE = /[aeiou]|[jklmnpstw][aeiou]|n/g;

/** Takes all parsers and applies them one after another. */
// Had to redeclare this function, Typescript really struggles with inferring
// types when using `sequence`.
function sequence<T extends Array<unknown>>(
  ...sequence: { [I in keyof T]: Lexer<T[I]> } & { length: T["length"] }
): Lexer<T> {
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
): Lexer<RegExpMatchArray> {
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
function spaces(): Lexer<string> {
  return match(/\s*/, "space").map(([space]) => space);
}
function slice(length: number, description: string): Lexer<string> {
  return new Parser((src) => {
    if (src.length < length) {
      return new Output(new UnexpectedError(src, description));
    } else {
      return new Output([{
        rest: src.slice(length),
        value: src.slice(0, length),
      }]);
    }
  });
}
/** Parses the end of line (or the end of sentence in context of Toki Pona) */
function eol(): Lexer<null> {
  return new Parser((src) => {
    if (src === "") return new Output([{ value: null, rest: "" }]);
    else return new Output(new UnexpectedError(`"${src}"`, "end of sentence"));
  });
}
/** Parses lowercase latin word. */
function latinWord(): Lexer<string> {
  return match(/([a-z][a-zA-Z]*)\s*/, "word").map(([_, word]) => {
    if (/[A-Z]/.test(word)) {
      throw new UnrecognizedError(`"${word}"`);
    } else {
      return word;
    }
  });
}
function ucsur(): Lexer<string> {
  return slice(2, "UCSUR character").skip(spaces());
}
function specificUcsurCharacter(
  character: string,
  description: string,
): Lexer<string> {
  return ucsur().filter((word) => {
    if (word === character) {
      return true;
    } else {
      throw new UnexpectedError(`"${word}"`, description);
    }
  });
}
/** Parses UCSUR word. */
function ucsurWord(): Lexer<string> {
  return ucsur().map((word) => {
    const latin = UCSUR_TO_LATIN[word];
    if (latin == null) {
      throw new CoveredError();
    } else {
      return latin;
    }
  });
}
/** Parses a word. */
function word(): Lexer<string> {
  return choiceOnlyOne(ucsurWord(), latinWord());
}
/**
 * Parses all at least one uppercase words and combines them all into single
 * string. This function is exhaustive like `all`.
 */
function properWords(): Lexer<string> {
  return allAtLeastOnce(
    match(/([A-Z][a-zA-Z]*)\s*/, "proper word").map(([_, word]) => word),
  ).map(
    (array) => array.join(" "),
  );
}
/** Parses a specific word. */
function specificWord(thatWord: string): Lexer<string> {
  return choiceOnlyOne(ucsurWord(), word()).filter((thisWord) => {
    if (thatWord === thisWord) return true;
    else throw new UnexpectedError(`"${thisWord}"`, `"${thatWord}"`);
  });
}
/** Parses multiple a. */
function multipleA(): Lexer<number> {
  return sequence(specificWord("a"), allAtLeastOnce(specificWord("a"))).map((
    [a, as],
  ) => [a, ...as].length);
}
/** Parses X ala X constructions. */
function xAlaX(): Lexer<string> {
  return word().then((word) =>
    sequence(specificWord("ala"), specificWord(word)).map(() => word)
  );
}
/** Parses opening quotation mark */
function openQuotationMark(): Lexer<string> {
  return match(/(["“«「])\s*/, "open quotation mark").map(([_, mark]) => mark);
}
/** Parses closing quotation mark */
function closeQuotationMark(): Lexer<string> {
  return match(/(["”»」])\s*/, "close quotation mark").map(([_, mark]) => mark);
}
function cartoucheSpace(): Lexer<null> {
  return all(choiceOnlyOne(
    match(/\s+/, "space").map(() => null),
    specificUcsurCharacter(
      COMBINING_CARTOUCHE_EXTENSION,
      "combining cartouche extension",
    ).map(() => null),
  )).map(() => null);
}
function cartoucheElement(): Lexer<string> {
  return choiceOnlyOne(
    ucsurWord().skip(cartoucheSpace()).skip(
      specificUcsurCharacter("󱦝", "colon"),
    ).skip(cartoucheSpace()),
    sequence(
      ucsurWord().skip(cartoucheSpace()),
      allAtLeastOnce(
        specificUcsurCharacter("󱦜", "colon").skip(cartoucheSpace()),
      ).map(
        (dots) => dots.length,
      ),
    ).map(([word, dots]) => {
      let count = dots;
      if (VOWEL.test(word[0])) {
        count++;
      }
      const morae = word.match(MORAE)!;
      if (morae.length < count) {
        throw new UnrecognizedError("Excess dots");
      }
      return morae.slice(0, count).join("");
    }),
    ucsurWord().skip(cartoucheSpace()).map((word) => word[0]),
    match(/([a-zA-Z])\s*/, "Latin letter").skip(cartoucheSpace()).map((
      [_, letter],
    ) => letter),
  );
}
function cartouche(): Lexer<string> {
  return sequence(
    specificUcsurCharacter(START_OF_CARTOUCHE, "start of cartouche"),
    cartoucheSpace().with(allAtLeastOnce(cartoucheElement())),
    specificUcsurCharacter(END_OF_CARTOUCHE, "end of cartouche"),
  ).map(
    ([_, words, _1]) => {
      const word = words.join("");
      return word[0].toUpperCase() + word.slice(1);
    },
  );
}
function cartouches(): Lexer<string> {
  return allAtLeastOnce(cartouche()).map((words) => words.join(" "));
}
/** Parses quotation. */
function quotation(): Lexer<TokenTree & { type: "quotation" }> {
  return sequence(
    openQuotationMark(),
    lazy(() => tokenTrees(false)),
    closeQuotationMark(),
  ).map(([leftMark, tokenTree, rightMark]) => {
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
    return {
      type: "quotation",
      tokenTree,
      leftMark,
      rightMark,
    };
  });
}
/** Parses a comma. */
function comma(): Lexer<string> {
  return match(/,\s*/, "comma").map(() => ",");
}
/** Parses a punctuation. */
function punctuation(): Lexer<string> {
  // UCSUR characters are two characters wide
  return match(/([.,:;?!]|󱦜|󱦝)\s*/, "punctuation").map(([_, punctuation]) =>
    punctuation
  );
}
/** Parses a token tree. */
function tokenTree(includeQuotation: boolean): Lexer<TokenTree> {
  return choiceOnlyOne(
    punctuation().map((punctuation) =>
      ({ type: "punctuation", punctuation }) as TokenTree
    ),
    comma().map(() => ({ type: "comma" }) as TokenTree),
    lazy(() => {
      if (includeQuotation) {
        return quotation();
      } else {
        return error(new CoveredError());
      }
    }),
    choiceOnlyOne(cartouches(), properWords()).map((words) =>
      ({ type: "proper word", words }) as TokenTree
    ),
    multipleA().map((count) => ({ type: "multiple a", count }) as TokenTree),
    lazy(() => {
      if (!settings.xAlaXPartialParsing) {
        return xAlaX().map((word) => ({ type: "x ala x", word }) as TokenTree);
      } else {
        return error(new CoveredError());
      }
    }),
    word().map((word) => ({ type: "word", word })),
  );
}
function tokenTrees(includeQuotation: boolean): Lexer<Array<TokenTree>> {
  return all(tokenTree(includeQuotation));
}
export function lex(src: string): Output<Array<TokenTree>> {
  return spaces().with(tokenTrees(true)).skip(eol()).parser(src)
    .map((
      { value },
    ) => value);
}
